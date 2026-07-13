// COMPLIANCE: matched substrings MUST NOT be logged. Match counts permitted.
// The async path runs NER on the ORIGINAL text (compromise offsets are
// invalid on regex-redacted output), then merges NER spans with the
// regex-redacted output via byte-range matching. Matched name strings are
// bound to local variables in the merge body and are never returned,
// logged, or assigned to a wider scope.
// (GDPR Art. 5(1)(c) data-minimisation, Art. 25 transparency contract.)
/**
 * sanitizePiiAsync — async PII redaction (regex + NER name redaction).
 *
 * v1.2 — issue #42. Adds PERSON-entity name redaction to the v1.1 regex
 * pipeline via a pluggable `NerEngine`. The sync `sanitizePii` is unchanged
 * — existing consumers see no behavioural change.
 *
 * ## Why a separate async export
 *
 * NER inference is fundamentally async (engine.ready resolves a Promise;
 * `compromise` itself loads via `await import(...)`). Making `sanitizePii`
 * async would be a type-level breaking change for every existing caller —
 * including those who never enable NER. The async surface is additive: new
 * consumers opt into NER via `sanitizePiiAsync`; existing consumers keep
 * the sync regex-only `sanitizePii`. ADR 003 / 004 — backward-compat
 * preserved.
 *
 * ## Span-merge algorithm (constraint #9 from 2026-04-30 expert review)
 *
 * NER spans MUST be computed on the ORIGINAL text — `compromise`'s
 * character offsets are invalid against post-regex-redacted output (regex
 * passes can shrink or grow the text in ways that desynchronise offsets).
 *
 * After both passes:
 *   1. Run sync `sanitizePii` on ORIGINAL → `regexRedacted`.
 *   2. Run `nerEngine.detectPersonSpans(ORIGINAL)` → `nerSpans`.
 *   3. For each NER span (in reverse-start order, after de-duplication
 *      and overlap-merge — same pattern as `redactLocalePhones` at
 *      `sanitize-pii.ts:130–177`):
 *        - Extract `name = ORIGINAL.slice(span.start, span.end)`.
 *        - Search for `name` in `regexRedacted`.
 *        - If found → replace ONE occurrence with `[person]` /
 *          `<<REDACTED_PERSON>>` token.
 *        - If NOT found → the regex pass already consumed a span that
 *          covered or contained this NER span (the "larger span wins on
 *          overlap" contract — e.g. FR-address regex consumed
 *          `12 rue de la Paix` so the nested NER FP on `rue` cannot be
 *          found in `[address]`).
 *
 * The `name`-find approach is robust under the realistic CV input shape
 * because:
 *   - NER spans are 5–30 char proper nouns; the probability that the
 *     regex-redacted output contains the exact same string at a different
 *     position than the original is vanishingly low (it would require an
 *     unrelated coincidental occurrence of the same name string elsewhere
 *     in the document).
 *   - When the same name occurs twice in the original (a referee name
 *     repeated in a recommendation paragraph), the NER engine emits a
 *     span for each occurrence — we replace each in order.
 *
 * ## Idempotency
 *
 * `[person]` (readable) and `<<REDACTED_PERSON>>` (sentinel) are
 * pattern-disjoint from every v1.x redaction pattern AND from every NER
 * heuristic — see `token-format.ts` § Idempotency invariant. Running
 * `sanitizePiiAsync` a second time is a strict no-op on already-redacted
 * tokens.
 */

import { sanitizePii, type SanitizePiiOptions } from './sanitize-pii.js';
import { tokensFor } from './token-format.js';
import {
  DEFAULT_MAX_INPUT_LENGTH,
  PiiInputTooLargeError,
} from './limits.js';
import {
  createNerEngine,
  type NerEngine,
  type NerSpan,
} from './ner/index.js';

/**
 * Optional configuration for `sanitizePiiAsync`. Extends `SanitizePiiOptions`
 * with the NER-related fields. All fields are optional; the no-options
 * default behaves byte-identically to `sanitizePii(text)` (regex-only,
 * names not redacted).
 */
export interface SanitizePiiAsyncOptions extends SanitizePiiOptions {
  /**
   * Master switch for NER name redaction.
   *
   * **Setting `enableNer: false` (default) means names are NOT redacted.
   * Enable for GDPR Art. 25 compliance when sending text to third-party
   * LLM processors.**
   *
   * Default: `false`. v1.2 ships with NER opt-in to give consumers a
   * staged-rollout path; platform integration is tracked as a near-term
   * deliverable (compliance-officer condition C6).
   */
  enableNer?: boolean;
  /**
   * Concrete NER engine override. If omitted, `createNerEngine({ enableNer })`
   * is used — which returns `NullNerEngine` when `enableNer:false` and
   * `CompromiseNerEngine` when `enableNer:true`.
   *
   * Override is used in tests (deterministic mock engines without loading
   * compromise) and by advanced consumers who want to wire a custom engine
   * (HTTP / wink / cloud).
   */
  nerEngine?: NerEngine;
  /**
   * Confidence threshold passed through to the NER engine (no-op for
   * `CompromiseNerEngine` — see `NerDetectOptions.confidenceThreshold`
   * JSDoc).
   */
  nerConfidenceThreshold?: number;
  /**
   * Per-call allow-list of names that are NOT to be redacted even if the
   * NER engine flags them.
   */
  nerAllowList?: ReadonlyArray<string>;
}

/**
 * Sort + merge overlapping NER spans into disjoint ranges. Same pattern
 * as `redactLocalePhones` at `sanitize-pii.ts:130–177` (sort by start asc /
 * end desc so nested ranges are picked up by the first iteration; merge
 * adjacent overlapping ranges into a single span).
 */
function mergeSpans(
  spans: ReadonlyArray<NerSpan>,
): Array<{ start: number; end: number }> {
  if (spans.length === 0) return [];
  const ranges = spans
    .map((s) => ({ start: s.start, end: s.end }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      if (r.end > last.end) last.end = r.end;
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

/**
 * Apply NER redactions onto an already-regex-redacted string.
 *
 * Algorithm: for each merged NER span (in reverse-start order — same
 * direction as `redactLocalePhones`), extract the corresponding substring
 * from the ORIGINAL text and search for it in `regexRedacted`. If found,
 * replace the first occurrence with `token`. If not found, the regex pass
 * consumed a span that overlapped this NER span ("larger span wins").
 *
 * The matched name string is bound to a local-only variable (`nameLocal`)
 * inside the loop body and is never returned, logged, or assigned to a
 * wider scope (COMPLIANCE: file header).
 */
export function applyNerRedactions(
  original: string,
  nerSpans: ReadonlyArray<NerSpan>,
  regexRedacted: string,
  token: string,
): string {
  if (nerSpans.length === 0) return regexRedacted;
  const merged = mergeSpans(nerSpans);
  let out = regexRedacted;
  // Process in reverse start order for symmetry with redactLocalePhones at
  // sanitize-pii.ts:130-160. Note: this implementation uses indexOf on the
  // mutating `out` string rather than index-based slicing, so loop direction
  // does NOT provide an "earlier matches unaffected" guarantee — each
  // iteration independently locates the first remaining occurrence of the
  // span text in the already-mutated output. Correctness comes from indexOf
  // always finding a remaining match if any spans of that text remain
  // unredacted, NOT from the loop ordering.
  for (let i = merged.length - 1; i >= 0; i -= 1) {
    const range = merged[i]!;
    if (range.start < 0 || range.end > original.length) continue;
    if (range.start >= range.end) continue;
    const nameLocal = original.slice(range.start, range.end);
    if (nameLocal.length === 0) continue;
    const idx = out.indexOf(nameLocal);
    if (idx >= 0) {
      out = out.slice(0, idx) + token + out.slice(idx + nameLocal.length);
    }
    // If not found, the regex pass already consumed an enclosing range —
    // suppress the NER span (no-op).
  }
  return out;
}

/**
 * Suppress PERSON spans that overlap a "preserve" (ORG / PLACE) span
 * (v1.3 — issue #64, `'cv'` profile).
 *
 * Two half-open ranges `[a.start, a.end)` and `[b.start, b.end)` overlap iff
 * `a.start < b.end && b.start < a.end`. A person span is dropped if it overlaps
 * ANY preserve span — so a surname-shaped employer that compromise dual-tags,
 * or a place, is preserved rather than redacted to `[person]`.
 */
function suppressOverlapping(
  personSpans: ReadonlyArray<NerSpan>,
  preserveSpans: ReadonlyArray<NerSpan>,
): ReadonlyArray<NerSpan> {
  if (preserveSpans.length === 0) return personSpans;
  return personSpans.filter(
    (p) =>
      !preserveSpans.some(
        (keep) => p.start < keep.end && keep.start < p.end,
      ),
  );
}

/**
 * Sanitise PII from arbitrary text — async path with optional NER name
 * redaction (v1.2 — issue #42).
 *
 * - When `enableNer: false` (default): byte-equivalent to `sanitizePii(text,
 *   options)`. Names are NOT redacted.
 * - When `enableNer: true`: regex pipeline + NER engine run on the ORIGINAL
 *   text. NER spans are merged with the regex-redacted output via
 *   `applyNerRedactions` (larger span wins on overlap with regex spans).
 *
 * Throws `PiiInputTooLargeError` if `text.length > maxInputLength` (same
 * O(1) cap as `sanitizePii`).
 */
export async function sanitizePiiAsync(
  text: string,
  options?: SanitizePiiAsyncOptions,
): Promise<string> {
  if (text === '' || text == null) return text ?? '';

  // O(1) cap (same gate as sync sanitizePii).
  const maxInputLength = options?.maxInputLength ?? DEFAULT_MAX_INPUT_LENGTH;
  if (text.length > maxInputLength) {
    throw new PiiInputTooLargeError(text.length, maxInputLength);
  }

  // Run regex pipeline on the ORIGINAL text — this preserves the
  // byte-equivalent v1.0/v1.1 contract for `sanitizePii(text, options)`.
  const regexRedacted = sanitizePii(text, {
    tokenFormat: options?.tokenFormat,
    maxInputLength: options?.maxInputLength,
    profile: options?.profile,
  });

  // Fast path: enableNer:false (default) — return regex output verbatim.
  // No NER engine is constructed; no compromise import is triggered;
  // sync-equivalent behaviour with one extra await tick.
  if (options?.enableNer !== true) {
    return regexRedacted;
  }

  // NER path. Pick the explicit engine override if supplied; otherwise
  // construct via the factory (CompromiseNerEngine).
  const engine = options.nerEngine ?? createNerEngine({ enableNer: true });

  // Run NER on the ORIGINAL text — compromise offsets are invalid on
  // regex-redacted output (constraint 9).
  let nerSpans = await engine.detectPersonSpans(text, {
    confidenceThreshold: options.nerConfidenceThreshold,
    allowList: options.nerAllowList,
  });

  // `'cv'` profile (v1.3 — issue #64): preserve employer / organisation and
  // city / region false-positives by suppressing PERSON spans that the engine
  // ALSO tags as an organisation or place. Engines without `detectPreserveSpans`
  // (e.g. a minimal custom engine) skip this — the person pass is unchanged.
  if (
    options.profile === 'cv' &&
    typeof engine.detectPreserveSpans === 'function'
  ) {
    const preserveSpans = await engine.detectPreserveSpans(text, {
      confidenceThreshold: options.nerConfidenceThreshold,
    });
    nerSpans = suppressOverlapping(nerSpans, preserveSpans);
  }

  const tokens = tokensFor(options.tokenFormat);
  return applyNerRedactions(text, nerSpans, regexRedacted, tokens.person);
}
