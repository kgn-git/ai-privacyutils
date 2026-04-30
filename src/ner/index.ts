/**
 * NER engine factory + barrel exports.
 *
 * `createNerEngine(config)` returns the concrete engine matching `config`.
 * Default (`{}` or `{ enableNer: false }`) → NullNerEngine. `{ enableNer:
 * true }` → CompromiseNerEngine (the v1.2 default ML-free engine).
 *
 * Note: `CompromiseNerEngine` defers the actual `import('compromise')` until
 * the first `detectPersonSpans` call (or until `.ready` is awaited). The
 * factory itself never loads compromise — instantiating the class is
 * synchronous and cheap even when `enableNer: true`.
 */

import type { NerEngine } from './ner-engine.js';
import { NullNerEngine } from './null-ner-engine.js';
import { CompromiseNerEngine } from './compromise-ner-engine.js';

/**
 * Configuration for `createNerEngine`.
 */
export interface NerConfig {
  /**
   * Master switch.
   *
   * **Setting `enableNer: false` (default) means names are NOT redacted.
   * Enable for GDPR Art. 25 compliance when sending text to third-party
   * LLM processors.**
   *
   * The default is `false` so existing v1.0/v1.1 consumers see no
   * behavioural change at v1.2 minor-bump time. Platform integration must
   * explicitly opt in (tracked as a near-term backlog deliverable —
   * compliance-officer condition C6).
   */
  enableNer?: boolean;
  /**
   * Optional per-engine configuration. Reserved for future engines (e.g.
   * `{ engineId: 'http', endpoint: '...', apiKey: '...' }`). v1.2 ignores
   * this field — `compromise` has no per-engine knobs.
   */
  engineOptions?: Record<string, unknown>;
}

/**
 * Construct a concrete NER engine for the supplied config.
 *
 * The returned engine implements `NerEngine` and is suitable for direct
 * use in `sanitizePiiAsync` or any custom redaction pipeline.
 */
export function createNerEngine(config: NerConfig): NerEngine {
  if (config.enableNer === true) {
    return new CompromiseNerEngine();
  }
  return new NullNerEngine();
}

export { NullNerEngine } from './null-ner-engine.js';
export { CompromiseNerEngine } from './compromise-ner-engine.js';
export type { NerEngine, NerSpan, NerDetectOptions } from './ner-engine.js';
