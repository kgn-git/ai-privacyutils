/**
 * NerEngine — pluggable PERSON-entity NER abstraction (v1.2 — issue #42).
 *
 * ## Purpose
 *
 * The NER layer detects applicant full names (PERSON entities) in CV-shaped
 * text so they can be redacted alongside the existing 21 regex patterns in
 * `sanitizePii`. Names are structurally wrong for regex (a CV is a list of
 * proper nouns: company names, university names, project names, referees).
 * NER does the right thing — it is built for proper-noun recognition.
 *
 * ## Engine evolution path
 *
 * `NerEngine` is an interface, not a concrete class, so the engine can be
 * upgraded without any consumer API change:
 *
 *   - v1.2 — `CompromiseNerEngine` (heuristic, English-lexicon-biased,
 *            ~70% TP cohort 1; pure JS, ~3.8 MB installed).
 *   - v1.3+ — drop-in ML engine (`HttpNerEngine` calling a sidecar /
 *            `WinkNerEngine` if local accuracy improves / `CloudNerEngine`
 *            calling Azure Cognitive Services / AWS Comprehend) — same
 *            `detectPersonSpans` signature, same `NerSpan` return shape.
 *
 * The dedicated ML upgrade backlog issue carries forward the original
 * compliance AC (≥95% per-cohort TP, ≤5pp variance) — see ADR 004.
 *
 * ## GDPR / security contract
 *
 * 1. `NerSpan` exposes only `{start, end, score, label}` — never the
 *    matched substring. Consumers receive byte ranges, not PII text. This
 *    is the security-expert C3 invariant: an ML engine that included the
 *    matched name in its return value would leak PII through the consumer
 *    code path's return-value-logging surface (telemetry, debug dumps).
 *    The interface forecloses that mistake by construction.
 *
 * 2. `score` is a [0, 1] numeric confidence band. Heuristic engines (like
 *    `CompromiseNerEngine`) hardcode `1.0`; ML engines populate it from
 *    their softmax output. `NerDetectOptions.confidenceThreshold` lets
 *    consumers filter out low-confidence ML detections; it is a no-op for
 *    heuristic engines (see JSDoc on the field).
 *
 * 3. `label` is the entity label. v1.2 only emits `'PERSON'` — but future
 *    engines may emit `'ORG'`, `'LOC'`, etc. The interface allows growth
 *    without re-cutting types.
 */

/**
 * A single NER detection — a byte range in the input string plus engine
 * metadata. The matched substring is intentionally NOT returned (security
 * contract, see file header).
 */
export interface NerSpan {
  /** Inclusive 0-indexed start offset (JS string code units). */
  readonly start: number;
  /** Exclusive end offset (JS string code units). `text.slice(start, end)`
   * yields the matched substring. */
  readonly end: number;
  /**
   * Engine confidence in [0, 1]. Heuristic engines (CompromiseNerEngine)
   * hardcode 1.0; ML engines populate this from their model output.
   */
  readonly score: number;
  /** Entity label. v1.2 emits only `'PERSON'`. */
  readonly label: string;
}

/**
 * Per-call options for `NerEngine.detectPersonSpans`.
 */
export interface NerDetectOptions {
  /**
   * Confidence threshold in [0, 1].
   *
   * **No-op for `CompromiseNerEngine`** (and any other heuristic engine
   * that returns no gradient score — `CompromiseNerEngine` always emits
   * `score: 1.0`). Meaningful only for ML-backed engines that produce a
   * softmax-derived confidence.
   *
   * The field is on the interface (not engine-specific) so consumers can
   * write engine-portable code: passing `confidenceThreshold: 0.85` is
   * harmless under `CompromiseNerEngine` (filter is satisfied by every
   * detection's `1.0`) and meaningful under a future ML engine.
   */
  confidenceThreshold?: number;
  /**
   * Per-call allow-list of strings that are NOT to be redacted even if the
   * engine flags them. Compared by exact equality (case-sensitive). Useful
   * for caller-known false positives (e.g. a public-figure name in a
   * letter-of-recommendation that should pass through).
   *
   * Note: this is distinct from the engine-level deny-list (which removes
   * common-noun first names like `Grace`, `Mark` and street-type words like
   * `Rue`, `Via` — see `CompromiseNerEngine` for the default deny-list and
   * its rationale).
   */
  allowList?: ReadonlyArray<string>;
}

/**
 * Pluggable PERSON-entity NER engine.
 *
 * Implementations:
 *   - `NullNerEngine` (`./null-ner-engine.ts`) — no-op, used when
 *     `enableNer: false` (the v1.2 default). Returns []. Never loads
 *     `compromise` or any other heavy dependency.
 *   - `CompromiseNerEngine` (`./compromise-ner-engine.ts`) — heuristic,
 *     `compromise` v14 backed. Dynamically imports compromise on first
 *     `detectPersonSpans` call.
 */
export interface NerEngine {
  /**
   * Detect PERSON spans in `text`.
   *
   * Engines MUST return spans whose `[start, end)` ranges describe valid
   * substrings of `text` (i.e. `text.slice(start, end)` is well-defined).
   * Engines MAY return overlapping spans; consumers (e.g. `sanitizePiiAsync`)
   * are responsible for merge-and-replace.
   */
  detectPersonSpans(
    text: string,
    opts?: NerDetectOptions,
  ): Promise<ReadonlyArray<NerSpan>>;

  /**
   * OPTIONAL (v1.3 — issue #64). Detect "preserve" spans — entities that the
   * `'cv'` redaction profile should NOT redact even if `detectPersonSpans`
   * also flags them: organisations (`label: 'ORG'`) and places
   * (`label: 'PLACE'`). Surname-shaped employer names ("Morgan Stanley") and
   * city names are high-signal, NON-personal CV features that a downstream
   * embedding / job-match consumer depends on.
   *
   * `sanitizePiiAsync({ profile: 'cv', enableNer: true })` calls this (when the
   * engine implements it) and suppresses any PERSON span that overlaps a
   * preserve span. Engines that do not implement it are treated as returning
   * `[]` (no suppression) — the person pass is unchanged.
   *
   * Same GDPR contract as `detectPersonSpans`: returns byte ranges only, never
   * the matched substring.
   */
  detectPreserveSpans?(
    text: string,
    opts?: NerDetectOptions,
  ): Promise<ReadonlyArray<NerSpan>>;

  /**
   * Resolves once the engine is ready to handle `detectPersonSpans` calls.
   *
   * `CompromiseNerEngine` resolves after the first dynamic `import('compromise')`
   * completes (one-time cost, ~316ms typical on Linux Vercel). `NullNerEngine`
   * resolves immediately. Consumers can `await engine.ready` to pre-warm,
   * or simply `await detectPersonSpans` (which awaits readiness internally).
   */
  readonly ready: Promise<void>;

  /**
   * Stable string identifier for the concrete engine. Used by tests and
   * telemetry. v1.2: `'null'` | `'compromise'`. Future: `'http'`, `'wink'`,
   * `'cloud'`, etc.
   */
  readonly engineId: string;
}
