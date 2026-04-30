// COMPLIANCE: this engine consumes free-form CV text that contains PII
// (proper names, addresses, employer names). Matched substrings MUST NOT be
// logged or returned through any side-channel. Only byte ranges
// (NerSpan.start / .end) are returned to callers.
// (GDPR Art. 5(1)(c) data-minimisation, Art. 25 transparency contract.)
/**
 * CompromiseNerEngine — `compromise` v14 backed PERSON-entity NER (v1.2 — issue #42).
 *
 * STUB COMMIT — this is the interface-compliant skeleton committed alongside
 * NerEngine + NullNerEngine + factory. The detection logic (span-boundary
 * trim, deny-list, GDPR-safe extraction) is added in the next GREEN commit
 * after RED tests in `src/__tests__/compromise-ner-engine.test.ts` have
 * been committed (SI-001 RED→GREEN sequence).
 */

import type { NerEngine, NerSpan, NerDetectOptions } from './ner-engine.js';

/**
 * Default deny-list — populated in the GREEN commit. Empty in the stub.
 */
export const DEFAULT_NER_DENY_LIST: ReadonlyArray<string> = Object.freeze([]);

/**
 * Thrown when `compromise` cannot be loaded or has an unexpected API shape
 * (security-expert C4). Stub form here; implementation parity with the
 * GREEN commit's full guard-rails is preserved.
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

export class CompromiseNerEngine implements NerEngine {
  public readonly engineId = 'compromise';
  public readonly ready: Promise<void> = Promise.resolve();

  // STUB: returns [] until the GREEN commit lands the actual detection
  // logic. The factory returns this engine when enableNer:true so the
  // wiring is testable; full span detection is the next commit.
  constructor(_opts?: { denyList?: ReadonlyArray<string> }) {
    // intentionally no-op
  }

  async detectPersonSpans(
    _text: string,
    _opts?: NerDetectOptions,
  ): Promise<ReadonlyArray<NerSpan>> {
    return [];
  }
}
