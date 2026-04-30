/**
 * NullNerEngine — no-op fast-path for `enableNer: false` (v1.2 default).
 *
 * Returns `[]` from every `detectPersonSpans` call regardless of input.
 * Critically: this implementation MUST NOT import `compromise` (or any
 * other heavy NER dependency) — even transitively — so that the default
 * `enableNer: false` path remains:
 *
 *   - Edge-runtime safe (compromise is 344 KB ESM, exceeds Vercel Edge
 *     1 MB limit when chained with other deps);
 *   - Cold-start cheap (no heavy module parse on first import);
 *   - Bundle-cheap for consumers who import privacyutils but never enable NER.
 *
 * The engine is a tiny class — synchronous construction, immediately-resolved
 * ready Promise, returns the same frozen empty array on every call.
 */

import type { NerEngine, NerSpan, NerDetectOptions } from './ner-engine.js';

/**
 * Single shared empty array — frozen so the ReadonlyArray contract is not
 * just a TypeScript-level claim. Returning the same instance is safe because
 * the array has no mutation surface (length 0).
 */
const EMPTY_SPANS: ReadonlyArray<NerSpan> = Object.freeze([]);

/**
 * No-op NER engine. Returned by `createNerEngine({ enableNer: false })` and
 * by the default `createNerEngine({})` factory.
 */
export class NullNerEngine implements NerEngine {
  public readonly engineId = 'null';
  public readonly ready: Promise<void> = Promise.resolve();

  async detectPersonSpans(
    _text: string,
    _opts?: NerDetectOptions,
  ): Promise<ReadonlyArray<NerSpan>> {
    return EMPTY_SPANS;
  }
}
