// COMPLIANCE: `createNerEngine` returns `NullNerEngine` unless `enableNer` is `true`, so the default path never
// loads `compromise`. Constructing `CompromiseNerEngine` starts the load; the factory adds nothing to it.
// Record: docs/compliance/redaction-record.md § 3.8.

import type { NerEngine } from './ner-engine.js';
import { NullNerEngine } from './null-ner-engine.js';
import { CompromiseNerEngine } from './compromise-ner-engine.js';

/** `enableNer` defaults to `false` so existing consumers' output is unchanged (C6); `engineOptions` is reserved and ignored. */
export interface NerConfig {
  enableNer?: boolean;
  engineOptions?: Record<string, unknown>;
}

export function createNerEngine(config: NerConfig): NerEngine {
  if (config.enableNer === true) {
    return new CompromiseNerEngine();
  }
  return new NullNerEngine();
}

export { NullNerEngine } from './null-ner-engine.js';
export { CompromiseNerEngine } from './compromise-ner-engine.js';
export type { NerEngine, NerSpan, NerDetectOptions } from './ner-engine.js';
