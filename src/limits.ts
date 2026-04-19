/**
 * Runtime input-length cap — belt-and-braces ReDoS defence (v1.1 — issue #10
 * / security review R7 / compliance must-land-before-v1.1).
 *
 * ## Purpose
 *
 * The static `recheck` + `eslint-plugin-redos` gate (issue #4 / S5) catches
 * *known* super-linear regex shapes at lint/CI time. That is the primary
 * defence. This module is the secondary defence: a pathological prompt of
 * arbitrary length would — in the event of an undiscovered super-linear
 * shape or a future regex edit that introduces one — pin CPU regardless of
 * static-analysis gaps. An O(1) length check BEFORE any regex bounds
 * worst-case execution time independently of regex shape.
 *
 * ## Design decisions (ADR 002)
 *
 *   1. **API surface: both middleware + free-function.** `maxInputLength`
 *      is accepted on both `SanitizePiiOptions` and `PiiMiddlewareOptions`.
 *      `sanitizePii` is the pure function where regex actually runs — the
 *      length check belongs there and the middleware inherits it trivially
 *      by passing the option through on every internal `sanitizePii` call.
 *      This matches the existing `tokenFormat` plumbing.
 *
 *   2. **Overflow behaviour: throw a typed error.** `PiiInputTooLargeError`
 *      surfaces misconfiguration loudly. Silent truncation with a console
 *      warning can mask prompt-size regressions (growth creeps unnoticed
 *      until it breaks something else). A typed error lets consumers catch
 *      and implement their own truncation policy if they prefer, while the
 *      default path stays fail-fast.
 *
 *   3. **Default value: 500_000 code units** (~500KB ASCII). Comfortably
 *      above any realistic CV/JD pair; rejects pathological inputs without
 *      false-positive rejection of normal workloads.
 *
 *   4. **Length measurement: JS string code units** (`String#length`).
 *      Fast O(1). Not byte length (would require UTF-8 encoding pass, O(n)).
 *      Not grapheme length (requires Intl.Segmenter, expensive). Code units
 *      are what regex engines actually iterate over, so code-unit length is
 *      the correct proxy for regex-engine worst-case CPU.
 *
 *   5. **Cap scope: per `sanitizePii` call** (i.e. per individual text
 *      string redacted). The middleware applies `sanitizePii` to each
 *      content part independently — a string prompt, a string message
 *      content, each text part, each reasoning part. The cap gates each
 *      individual call. It is NOT a sum across all parts of a prompt:
 *      two 400KB parts each pass under a 500K cap, even though their
 *      cumulative size is 800KB. This matches the regex-CPU concern (one
 *      regex pass per part) and keeps the semantics predictable when
 *      callers compose fragments.
 *
 * See `docs/adr/002-input-length-cap.md` for the full decision record.
 */

/**
 * Default maximum input length (JS string code units) permitted per
 * `sanitizePii` call. See ADR 002 for rationale.
 *
 * Exported so consumers can reference the same constant when building
 * their own bounded inputs (e.g. ahead-of-time truncation) rather than
 * hard-coding the literal in two places.
 */
export const DEFAULT_MAX_INPUT_LENGTH = 500_000;

/**
 * Thrown by `sanitizePii` when the supplied text exceeds the configured
 * `maxInputLength`. Consumers can catch this to implement their own
 * truncation / user-feedback policy:
 *
 *   try {
 *     const clean = sanitizePii(text);
 *   } catch (err) {
 *     if (err instanceof PiiInputTooLargeError) {
 *       // err.inputLength → actual length of `text`
 *       // err.maxInputLength → configured cap
 *       // e.g. truncate, reject at edge, log to telemetry
 *     } else {
 *       throw err;
 *     }
 *   }
 *
 * Instance invariants:
 *   - `instanceof Error` → true (for generic catch-clauses)
 *   - `instanceof PiiInputTooLargeError` → true (for typed catch-clauses)
 *   - `name === 'PiiInputTooLargeError'` (for stacktrace legibility)
 *   - `inputLength` and `maxInputLength` are both finite non-negative
 *     numbers (`Number.isInteger(inputLength) === true`)
 *   - `message` contains both numeric values for log-dump legibility
 */
export class PiiInputTooLargeError extends Error {
  /** Code-unit length of the rejected input string. */
  public readonly inputLength: number;
  /** Configured cap that was exceeded. */
  public readonly maxInputLength: number;

  constructor(inputLength: number, maxInputLength: number) {
    super(
      `PII input exceeds maxInputLength: ${inputLength} > ${maxInputLength}`,
    );
    // Restore prototype chain — required for `instanceof` to work correctly
    // across ES5-target compiled code. TypeScript's `--target ES2022` makes
    // this a no-op in practice, but the explicit setPrototypeOf keeps the
    // class robust if the build target ever regresses.
    Object.setPrototypeOf(this, PiiInputTooLargeError.prototype);
    this.name = 'PiiInputTooLargeError';
    this.inputLength = inputLength;
    this.maxInputLength = maxInputLength;
  }
}
