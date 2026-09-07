// COMPLIANCE: this engine reads free-form CV text; only byte ranges (`NerSpan.start` / `.end`) leave it. The
// matched substring is bound to a loop-local variable and is never returned, logged or assigned wider; of each
// `compromise` result only `offset` is read. Record: docs/compliance/redaction-record.md § 1, § 3.8.

// `compromise` is loaded by dynamic import only, so the regex-only path carries none of it; a failed or
// wrong-shaped load throws `PiiNerLoadError` rather than degrading to no spans.

import type { NerEngine, NerSpan, NerDetectOptions } from './ner-engine.js';

// Terms `compromise` tags as names in CV text: common-noun given names, Romance street-type words (NER runs before
// the address regex sees them) and surname-shaped tech terms. A custom `denyList` replaces this list.
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

// `compromise` includes sentence-final punctuation in a span. Characters outside `[\w\s'.-]` are stripped, then
// one trailing period (below), so `Jr.` keeps its dot. The `{1,16}` bound keeps the regex in the ReDoS lint's safe
// class; a longer run stays inside the span, which over-redacts rather than leaks.
const TRAILING_PUNCT_RE = /[^\w\s'.-]{1,16}$/;

// Typed error for a failed or wrong-shaped `compromise` load (C4); the engine never degrades to "no spans".
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

type NlpFn = (text: string) => {
  people: () => {
    out: (mode: 'offsets') => unknown;
  };
};

// The loaded `nlp` function is cached per process, so the import is paid once.
let nlpSingleton: NlpFn | null = null;
let loadPromise: Promise<NlpFn> | null = null;

// Concurrent first callers share one promise. The shape probe turns a breaking change in `compromise` into a
// typed error rather than a silent zero-detection regression.
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
    // Reset on rejection so a later caller can retry.
    if (nlpSingleton === null) loadPromise = null;
  }
}

export class CompromiseNerEngine implements NerEngine {
  public readonly engineId = 'compromise';

  /** Resolves once `compromise` is loaded and validated; `detectPersonSpans` awaits it internally. */
  public readonly ready: Promise<void>;

  private readonly denyList: ReadonlySet<string>;

  constructor(opts?: { denyList?: ReadonlyArray<string> }) {
    // Entries are compared by `Set.has` equality only — a `RegExp` built from an entry would be an injection and
    // ReDoS surface.
    this.denyList = new Set(opts?.denyList ?? DEFAULT_NER_DENY_LIST);
    // The load starts here so `ready` means something; the `catch` avoids an unhandled-rejection log, and the same
    // rejection is visible at `ready` and at the next `detectPersonSpans`.
    this.ready = loadCompromise().then(() => undefined);
    this.ready.catch(() => undefined);
  }

  async detectPersonSpans(
    text: string,
    opts?: NerDetectOptions,
  ): Promise<ReadonlyArray<NerSpan>> {
    if (text === '' || text == null) return [];

    const nlp = await loadCompromise();

    const allowSet = opts?.allowList ? new Set(opts.allowList) : null;

    // COMPLIANCE: only `offset` is read. The items also carry `text`, `terms` and `person.presumed_gender`
    // (Art. 4(1) / Art. 9 data); typing the element with `offset` alone makes reading them a type error.
    const raw = nlp(text).people().out('offsets') as ReadonlyArray<{
      offset: { start: number; length: number };
    }>;

    const out: NerSpan[] = [];
    for (const item of raw) {
      const { offset } = item;
      // Loop-local: never returned, logged or assigned to a wider scope.
      const matchedLocalOnly = text.slice(
        offset.start,
        offset.start + offset.length,
      );
      const stripped = matchedLocalOnly
        .replace(TRAILING_PUNCT_RE, '')
        .replace(/\.$/, '');
      const end = offset.start + stripped.length;
      if (end <= offset.start) continue;

      if (allowSet?.has(stripped)) continue;
      if (this.denyList.has(stripped)) continue;
      // A multi-word span is not denied by its first token; the deny-list targets single-word false positives.

      out.push({ start: offset.start, end, score: 1.0, label: 'PERSON' });
    }
    return out;
  }
}
