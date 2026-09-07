// COMPLIANCE: the engine behind `enableNer: false` — returns no spans and must never import `compromise`, even
// transitively, so the default path carries none of it. Record: docs/compliance/redaction-record.md § 3.8.

import type { NerEngine, NerSpan, NerDetectOptions } from './ner-engine.js';

// Frozen so the ReadonlyArray contract holds at runtime; one shared instance is safe because it cannot be mutated.
const EMPTY_SPANS: ReadonlyArray<NerSpan> = Object.freeze([]);

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
