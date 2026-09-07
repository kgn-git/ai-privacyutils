// COMPLIANCE: a `NerSpan` carries byte ranges only, never the matched substring, so no engine can leak a name
// through a consumer's return-value logging (C3). Record: docs/compliance/redaction-record.md § 1, § 3.8.

/** A detection as `[start, end)` code-unit offsets into the input; `score` is 1.0 for heuristic engines and `label` is `'PERSON'` today. */
export interface NerSpan {
  readonly start: number;
  readonly end: number;
  readonly score: number;
  readonly label: string;
}

/** `confidenceThreshold` is a no-op for `CompromiseNerEngine` (every span scores 1.0); `allowList` entries are compared by exact equality. */
export interface NerDetectOptions {
  confidenceThreshold?: number;
  allowList?: ReadonlyArray<string>;
}

/** Spans must be valid ranges of `text` and may overlap — the caller merges; `ready` resolves after any one-time load; `engineId` names the concrete engine (`'null'`, `'compromise'`). */
export interface NerEngine {
  detectPersonSpans(
    text: string,
    opts?: NerDetectOptions,
  ): Promise<ReadonlyArray<NerSpan>>;

  readonly ready: Promise<void>;

  readonly engineId: string;
}
