// COMPLIANCE: the input-length cap is the second ReDoS defence after the static scan — it bounds worst-case CPU
// whatever the pattern shape. Decisions: docs/adr/002-input-length-cap.md; record § 3.10.

/** Per `sanitizePii` call, in UTF-16 code units; exported so a consumer can pre-truncate against the same value. */
export const DEFAULT_MAX_INPUT_LENGTH = 500_000;

/** Thrown before any regex runs; carries both lengths. */
export class PiiInputTooLargeError extends Error {
  public readonly inputLength: number;
  public readonly maxInputLength: number;

  constructor(inputLength: number, maxInputLength: number) {
    super(
      `PII input exceeds maxInputLength: ${inputLength} > ${maxInputLength}`,
    );
    // Keeps `instanceof` correct if the build target ever drops below ES2015 (it is ES2022 today).
    Object.setPrototypeOf(this, PiiInputTooLargeError.prototype);
    this.name = 'PiiInputTooLargeError';
    this.inputLength = inputLength;
    this.maxInputLength = maxInputLength;
  }
}
