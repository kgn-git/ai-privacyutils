// COMPLIANCE: this engine consumes free-form CV text that contains PII
// (proper names, addresses, employer names). Matched substrings MUST NOT be
// logged or returned through any side-channel. Only byte ranges
// (NerSpan.start / .end) are returned to callers.
// (GDPR Art. 5(1)(c) data-minimisation, Art. 25 transparency contract.)
/**
 * CompromiseNerEngine — `compromise` v14 backed PERSON-entity NER (v1.2 — issue #42).
 *
 * ## Engine choice rationale
 *
 * Two ML engines (Hybrid C distilbert q8 ~221 MB; Hybrid F GLiNER-PII q8
 * 333 MB) were evaluated and rejected — both exceed the Vercel 250 MB
 * function-bundle ceiling. `compromise` v14 is a pure-JS heuristic NLP
 * library, ~3.8 MB installed (~344 KB ESM bundle), zero native bindings.
 * The accuracy floor is materially below ML — see ADR 004 and README
 * § Known Limitations for cohort-specific TP/FP rates — but any positive
 * TP rate reduces actual exposure to OpenAI vs. the status-quo zero
 * redaction (compliance-officer 2026-04-30 §GDPR posture).
 *
 * ## Critical implementation constraints (binding ACs from expert review)
 *
 * 1. **Dynamic import only.** `compromise` is loaded via `await
 *    import('compromise')`, never as a top-level static import. A static
 *    top-level import would propagate into every consumer's bundle graph,
 *    breaking Vercel Edge consumers (344 KB ESM exceeds the 1 MB Edge
 *    limit). The deferred import keeps the `sanitizePii` (sync, regex-only)
 *    code path Edge-safe and free of compromise.
 *
 * 2. **Trailing-punctuation strip.** `compromise`'s `.out('offsets')`
 *    returns spans whose `length` includes trailing punctuation (period,
 *    comma) on sentence-final names. Without stripping, `"Call Alice."`
 *    would redact to `"Call [person]"` — eating the period. The end is
 *    therefore computed as `offset.start + p.text.replace(/[^\w\s'.-]+$/,
 *    '').length`, where the regex strips a trailing run of non-word /
 *    non-whitespace / non-(' . -) characters.
 *
 * 3. **Destructure ONLY {offset}.** `compromise`'s `.out('offsets')` items
 *    have shape `{ text, terms, person: { presumed_gender, ... }, offset }`.
 *    `text` is the matched name (PII, GDPR Art. 4(1)). `terms` is the
 *    tokenised name (PII). `person.presumed_gender` is gender inference
 *    from the name — a GDPR Art. 9 special-category data (sensitive personal
 *    data). Referencing any of these in the production code path leaks
 *    PII / Art. 9 data through whatever surface that code path's return
 *    value reaches (telemetry, debug dumps, error reports). This engine
 *    therefore destructures ONLY `offset` and computes span end from a
 *    stripped copy of `p.text` — but the stripped copy is bound to a local
 *    variable that lives only in the for-of loop body and is never returned
 *    nor logged.
 *
 * 4. **`score` hardcoded to 1.0.** `compromise` is a heuristic engine
 *    without a softmax-derived confidence. The score field exists for
 *    interface compatibility with future ML engines; consumers' code
 *    written against `confidenceThreshold` is harmless under compromise
 *    (every span passes any threshold ≤ 1.0).
 *
 * 5. **Deny-list via Set.has() only.** `DEFAULT_NER_DENY_LIST` is applied
 *    as an exact-equality filter via `Set.has()`. Constructing a regex
 *    from a deny-list entry (`new RegExp(entry)`) is prohibited — it would
 *    open a regex-injection surface (an attacker-controlled deny-list
 *    entry could match a wider set of inputs than intended, or could be
 *    super-linear and re-introduce ReDoS). Equality comparison is safe by
 *    construction.
 *
 * 6. **Fail-closed via `PiiNerLoadError`.** If the dynamic
 *    `import('compromise')` fails (`ERR_MODULE_NOT_FOUND`, sub-dep parse
 *    error) or if the imported module has the wrong API shape (future
 *    breaking change in compromise), `PiiNerLoadError` is thrown. The
 *    engine does not silently degrade to "always return []" — silent
 *    degradation is the security-fairness anti-pattern that compliance
 *    review §R3 explicitly flagged.
 */

import type { NerEngine, NerSpan, NerDetectOptions } from './ner-engine.js';

/**
 * Default deny-list — terms that compromise's `.people()` lexicon flags as
 * names but which are common-noun first names, French/Romance street-type
 * words, or surname-shaped tech terms in CV-shaped text.
 *
 * Three groups (full enumeration in ADR 004):
 *   1. Common-noun given names: `Grace`, `Mark`, `Chase`, `Dawn`, `Robin`,
 *      `Faith`, `Hope`, `Hunter`, `Summer`, `Jade`, `Ruby`, `Ada`, `Gene`,
 *      `Rex`, `Duke`, `Major`.
 *   2. French/Romance street-type words (NER runs on original text, before
 *      address-regex consumes them): `Rue`, `Boulevard`, `Avenue`, `Allée`,
 *      `Via`, `Calle`, `Rua`, `Chemin`, `Route`.
 *   3. Surname-shaped tech terms / brand names: `Jenkins`, `Hudson`,
 *      `Travis`, `Helm`, `Darwin`, `Newton`.
 */
export const DEFAULT_NER_DENY_LIST: ReadonlyArray<string> = Object.freeze([
  // Group 1 — common-noun given names
  'Grace',
  'Mark',
  'Chase',
  'Dawn',
  'Robin',
  'Faith',
  'Hope',
  'Hunter',
  'Summer',
  'Jade',
  'Ruby',
  'Ada',
  'Gene',
  'Rex',
  'Duke',
  'Major',
  // Group 2 — French/Romance street-type words
  'Rue',
  'Boulevard',
  'Avenue',
  'Allée',
  'Via',
  'Calle',
  'Rua',
  'Chemin',
  'Route',
  // Group 3 — surname-shaped tech terms / brand names
  'Jenkins',
  'Hudson',
  'Travis',
  'Helm',
  'Darwin',
  'Newton',
]);

/**
 * Trailing-punctuation strip regex (constraint 2).
 *
 * Strips a trailing run of characters that are NOT word chars, whitespace,
 * apostrophe, period, or hyphen. This intentionally preserves trailing
 * `.` / `'` / `-` because those are legitimate parts of a name (e.g.
 * `O'Brien`, `Jean-Pierre`, `Mr.`). The compromise bug is specifically
 * trailing sentence punctuation (`,`, `;`, `:`, `?`, `!`) — which this
 * regex catches.
 *
 * NOTE: the constraint regex includes `.` in the keep-set; this means a
 * sentence-final period after a name like `Alice Brown.` is kept inside
 * the span. We then trim a single trailing literal `.` separately at the
 * end-computation site to handle the "name ends a sentence" case without
 * eating legitimate dotted name pieces (`Mr.`, `Jr.`, `St.`).
 *
 * **Bounded quantifier rationale.** Trailing-punct strip — bounded
 * `{1,16}` instead of unbounded `+` to satisfy the recheck S5 ReDoS gate
 * (unbounded form flagged 2nd-degree polynomial). Behaviour is
 * byte-identical to `[^\w\s'.-]+$` for inputs with ≤16 trailing
 * non-word characters. CV text in production never produces compromise
 * spans with 17+ trailing punctuation chars in practice — the deviation
 * is in a tightening direction (fewer chars stripped means more chars
 * retained in the span end, never the reverse), so the worst-case
 * failure mode on pathological input is a trailing punctuation
 * character bleeding into the redacted token (e.g. `[person]!` instead
 * of `[person]`), which is privacy-safe.
 */
const TRAILING_PUNCT_RE = /[^\w\s'.-]{1,16}$/;

/**
 * Thrown when `compromise` cannot be loaded or has an unexpected API shape
 * (security-expert C4). Mirrors `PiiInputTooLargeError` from `./limits.ts`
 * — a typed, observable error rather than silent degradation.
 */
export class PiiNerLoadError extends Error {
  public readonly cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    Object.setPrototypeOf(this, PiiNerLoadError.prototype);
    this.name = 'PiiNerLoadError';
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/**
 * Module-scoped singleton: the loaded `compromise` `nlp` function. Cached
 * across `detectPersonSpans` calls so the dynamic import + module parse is
 * paid once per warm Vercel function instance.
 */
type OffsetView = {
  out: (mode: 'offsets') => unknown;
};

type NlpFn = (text: string) => {
  people: () => OffsetView;
  // v1.3 — issue #64: the default (`three`) compromise build exposes
  // organisation + place taggers. Used by `detectPreserveSpans` to build the
  // `'cv'`-profile preserve set (employer / city false-positives).
  organizations: () => OffsetView;
  places: () => OffsetView;
};

let nlpSingleton: NlpFn | null = null;
let loadPromise: Promise<NlpFn> | null = null;

/**
 * Lazy-load `compromise` and return its default-export `nlp` function.
 *
 * - First caller starts the dynamic import; subsequent concurrent callers
 *   await the same Promise (no double-load).
 * - Wraps the import in try/catch and validates the API shape; throws
 *   `PiiNerLoadError` on either failure mode (security-expert C4).
 */
async function loadCompromise(): Promise<NlpFn> {
  if (nlpSingleton !== null) return nlpSingleton;
  if (loadPromise !== null) return loadPromise;

  loadPromise = (async () => {
    let mod: { default?: unknown };
    try {
      mod = await import('compromise');
    } catch (err) {
      throw new PiiNerLoadError(
        `Failed to dynamically import 'compromise' — ` +
          `consumer install may be incomplete or the module path is broken. ` +
          `See ADR 004 § fail-closed posture.`,
        { cause: err },
      );
    }
    const nlp = mod.default;
    // API-shape guard (security-expert C4): a future breaking change in
    // compromise (e.g. removing .people() in v15) must surface as a typed
    // error, not as a silent zero-detection regression.
    if (typeof nlp !== 'function') {
      throw new PiiNerLoadError(
        `'compromise' default export is not a function — API shape changed.`,
      );
    }
    let probe: ReturnType<NlpFn>;
    try {
      probe = (nlp as NlpFn)('probe');
    } catch (err) {
      throw new PiiNerLoadError(
        `'compromise' nlp('probe') threw — API contract broken.`,
        { cause: err },
      );
    }
    if (typeof probe?.people !== 'function') {
      throw new PiiNerLoadError(
        `'compromise' nlp(...).people is not a function — API shape changed.`,
      );
    }
    nlpSingleton = nlp as NlpFn;
    return nlpSingleton;
  })();

  try {
    return await loadPromise;
  } finally {
    // Reset on rejection so a transient failure (e.g. installer race) can
    // be retried by a later caller; on success the singleton is set and the
    // promise variable is harmless to leave assigned.
    if (nlpSingleton === null) loadPromise = null;
  }
}

/**
 * `compromise`-backed PERSON-entity NER engine.
 *
 * Construction is synchronous and cheap. The first `detectPersonSpans`
 * call (or the first `await engine.ready`) triggers the dynamic
 * `import('compromise')`.
 */
export class CompromiseNerEngine implements NerEngine {
  public readonly engineId = 'compromise';

  /**
   * Resolves once `compromise` has been loaded and validated. Awaiting
   * this is optional — `detectPersonSpans` awaits it internally.
   */
  public readonly ready: Promise<void>;

  private readonly denyList: ReadonlySet<string>;

  constructor(opts?: { denyList?: ReadonlyArray<string> }) {
    // SECURITY: deny-list is term-equality only — never construct regex
    // from entries (injection surface).
    this.denyList = new Set(opts?.denyList ?? DEFAULT_NER_DENY_LIST);
    // Trigger lazy load eagerly so `await engine.ready` is meaningful.
    // Errors are surfaced via the `ready` promise; consumers can `await
    // engine.ready` upstream to pre-warm.
    this.ready = loadCompromise().then(() => undefined);
    // Swallow rejection here so the assignment to `ready` does not produce
    // an unhandled-rejection log; the same rejection is visible at any
    // `await engine.ready` site or at the next `detectPersonSpans` call.
    this.ready.catch(() => undefined);
  }

  async detectPersonSpans(
    text: string,
    opts?: NerDetectOptions,
  ): Promise<ReadonlyArray<NerSpan>> {
    if (text === '' || text == null) return [];

    const nlp = await loadCompromise();

    const allowSet = opts?.allowList ? new Set(opts.allowList) : null;

    // COMPLIANCE: destructure only {offset} — result.text/.terms/.person
    // contain PII/Art.9 data (Art. 9 = gender inference from name via
    // result.person.presumed_gender; Art. 4(1) = matched name in
    // result.text / result.terms). See file header constraint 3.
    const raw = nlp(text).people().out('offsets') as ReadonlyArray<{
      offset: { start: number; length: number };
      // Other fields exist on the runtime object (text, terms, person) —
      // we explicitly destructure ONLY `offset` below, and we are typing
      // the array element only with `offset` so any future code edit that
      // tries to read `text` / `terms` / `person` is a TypeScript error.
    }>;

    const out: NerSpan[] = [];
    for (const item of raw) {
      const { offset } = item;
      // Strip trailing punctuation from the matched substring before
      // computing the end offset (constraint 2). We bind the matched
      // substring to a LOCAL variable that is never returned, never
      // logged, never assigned to a wider scope.
      const matchedLocalOnly = text.slice(
        offset.start,
        offset.start + offset.length,
      );
      const stripped = matchedLocalOnly
        .replace(TRAILING_PUNCT_RE, '')
        // Also trim a trailing literal `.` (sentence-final period) — this
        // is the documented compromise bug. See file header constraint 2.
        .replace(/\.$/, '');
      const end = offset.start + stripped.length;
      if (end <= offset.start) continue; // empty span guard

      // Apply allow-list (per-call) and deny-list (engine default) by
      // comparing the matched substring under EQUALITY only — never via
      // RegExp construction. The matched substring is local-only.
      if (allowSet?.has(stripped)) continue;
      if (this.denyList.has(stripped)) continue;
      // Also try the first whitespace-separated token (the given name
      // alone) for deny-list purposes — compromise reports `Grace Adams`
      // as a person, but if the literal first token is `Grace` (a denied
      // common-noun given name) the user may want suppression. We default
      // to NOT denying multi-word spans by their first token alone;
      // multi-word PERSON spans are higher confidence than single-word
      // ones, and the deny-list is most useful for single-word FPs (`Rue`,
      // `Via`, `Helm`).

      out.push({ start: offset.start, end, score: 1.0, label: 'PERSON' });
    }
    return out;
  }

  /**
   * Detect ORG + PLACE "preserve" spans (v1.3 — issue #64) for the `'cv'`
   * redaction profile.
   *
   * The default (`three`) compromise build tags organisations via
   * `.organizations()` and places via `.places()`. Employer names ("Siemens",
   * "Ford") and city names ("Munich", "Manchester") land here. The caller
   * (`sanitizePiiAsync` under `profile: 'cv'`) suppresses any PERSON span that
   * overlaps one of these ranges, so an org / location false-positive is
   * preserved rather than redacted to `[person]`.
   *
   * COMPLIANCE: same as `detectPersonSpans` — destructure only `{offset}`;
   * the matched substring is a local-only variable, never returned or logged.
   *
   * Defensive: if a future compromise build drops `.organizations()` /
   * `.places()`, the missing tagger contributes no spans (the person pass is
   * simply not suppressed) rather than throwing — org/place preservation is a
   * best-effort precision improvement, not a redaction-recall guarantee.
   */
  async detectPreserveSpans(
    text: string,
  ): Promise<ReadonlyArray<NerSpan>> {
    if (text === '' || text == null) return [];

    const nlp = await loadCompromise();
    const doc = nlp(text);

    const out: NerSpan[] = [];
    // Call each tagger DIRECTLY (not via an extracted `doc[method]` reference —
    // compromise view methods rely on `this`, which a detached call loses).
    // Each is wrapped in try/catch so a future compromise build that changes
    // or drops a tagger degrades to "no preserve spans for that label" rather
    // than throwing — org/place preservation is best-effort precision, not a
    // redaction-recall guarantee.
    this.collectOffsetSpans(() => doc.organizations(), text, 'ORG', out);
    this.collectOffsetSpans(() => doc.places(), text, 'PLACE', out);
    return out;
  }

  /**
   * Append trailing-punct-stripped spans from a compromise offset view to
   * `out`. COMPLIANCE: the matched substring is a local-only variable, never
   * returned or logged — only byte ranges leave this method.
   */
  private collectOffsetSpans(
    getView: () => { out: (mode: 'offsets') => unknown },
    text: string,
    label: string,
    out: NerSpan[],
  ): void {
    let raw: ReadonlyArray<{ offset: { start: number; length: number } }>;
    try {
      raw = getView().out('offsets') as ReadonlyArray<{
        offset: { start: number; length: number };
      }>;
    } catch {
      return; // tagger missing / changed — best-effort, contribute nothing
    }
    for (const item of raw) {
      const { offset } = item;
      const matchedLocalOnly = text.slice(
        offset.start,
        offset.start + offset.length,
      );
      const stripped = matchedLocalOnly
        .replace(TRAILING_PUNCT_RE, '')
        .replace(/\.$/, '');
      const end = offset.start + stripped.length;
      if (end <= offset.start) continue; // empty span guard
      out.push({ start: offset.start, end, score: 1.0, label });
    }
  }
}
