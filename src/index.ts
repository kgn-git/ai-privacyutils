/**
 * @kgn-git/privacy-utils — canonical PII-redaction library for the
 * Jobflow programme.
 *
 * Public API (v1.2):
 *   - `sanitizePii(text, options?)` — pure string-in/string-out redaction.
 *     `options.tokenFormat` (v1.1 — issue #9): `'readable'` (default, v1.0.0
 *     byte-identical) or `'sentinel'` (`<<REDACTED_X>>` low-collision).
 *     `options.maxInputLength` (v1.1 — issue #10): runtime input-length cap
 *     (default 500_000). Over-cap inputs throw `PiiInputTooLargeError`.
 *   - `piiPatterns` — named factory dictionary for programmatic composition,
 *     now including `addressByLocale` + `postcodeByLocale` + `phoneByLocale`
 *     + `nationalIdByLocale` (v1.2 — issue #8) sub-objects.
 *     `phoneByLocale.*()` factories return validator functions backed by
 *     `libphonenumber-js` (not RegExp); `nationalIdByLocale.*()` factories
 *     return `(candidate: string) => boolean` validators with embedded
 *     check-digit / check-letter / HMRC-prefix rules; the NANP-shape
 *     `phoneInternational` / `phoneDomestic` RegExp factories are retained
 *     for backward-compat.
 *   - `piiMiddleware` — Vercel AI SDK middleware (`LanguageModelV1Middleware`).
 *     Zero-config default (readable tokens, default cap). Preserved
 *     byte-identical from v1.0.0 on under-cap inputs.
 *   - `createPiiMiddleware(options?)` — middleware factory (v1.1 — issues
 *     #9 + #10) accepting `{ tokenFormat, maxInputLength }`.
 *   - `TokenFormat` — exported type (`'readable' | 'sentinel'`).
 *   - `PiiInputTooLargeError` + `DEFAULT_MAX_INPUT_LENGTH` (v1.1 — issue #10)
 *     — typed error + exported default so consumers can catch and reference
 *     the same cap.
 *   - `computeEsDniCheckLetter` / `computePtNifCheckDigit` /
 *     `computeFrNirCheckKey` / `computeItCodiceFiscaleCheckLetter` (v1.2 —
 *     issue #8) — exported helpers used by the validator factories;
 *     callable directly for programmatic composition. Each guards on
 *     length + non-digit input and returns an empty / sentinel value
 *     when the input is structurally invalid.
 *
 * See README.md for GDPR rationale, SemVer policy, Known Limitations
 * (updated in v1.1 — R1 + R2 + R5 + R8 resolved, R7 hardened; v1.2 — R10
 * resolved for UK/FR/IT/ES/PT, DE deferred), and Security posture (S11
 * per security review).
 */

export { sanitizePii } from './sanitize-pii.js';
export type { SanitizePiiOptions } from './sanitize-pii.js';
export {
  piiPatterns,
  addressByLocale,
  postcodeByLocale,
  phoneByLocale,
  nationalIdByLocale,
  emailPattern,
  addressPattern,
  addressFrPattern,
  addressDePattern,
  addressItPattern,
  addressEsPattern,
  addressPtPattern,
  postcodeUkPattern,
  postcodeFrPattern,
  postcodeDePattern,
  postcodeItPattern,
  postcodeEsPattern,
  postcodePtPattern,
  phoneInternationalPattern,
  phoneDomesticPattern,
  phoneFrValidator,
  phoneDeValidator,
  phoneUkValidator,
  phoneItValidator,
  phoneEsValidator,
  phonePtValidator,
  nationalIdUkValidator,
  nationalIdFrValidator,
  nationalIdItValidator,
  nationalIdEsValidator,
  nationalIdPtValidator,
  nationalIdUkExtractionPattern,
  nationalIdFrExtractionPattern,
  nationalIdItExtractionPattern,
  nationalIdEsExtractionPattern,
  nationalIdPtExtractionPattern,
  computeEsDniCheckLetter,
  computePtNifCheckDigit,
  computeFrNirCheckKey,
  computeItCodiceFiscaleCheckLetter,
  dobPattern,
} from './patterns.js';
export type {
  PiiPatternName,
  AddressLocale,
  PostcodeLocale,
  PhoneLocale,
  NationalIdLocale,
} from './patterns.js';
export { piiMiddleware, createPiiMiddleware } from './pii-middleware.js';
export type { PiiMiddlewareOptions } from './pii-middleware.js';
export { TOKEN_FORMATS, tokensFor } from './token-format.js';
export type { TokenFormat, TokenKind } from './token-format.js';
export {
  DEFAULT_MAX_INPUT_LENGTH,
  PiiInputTooLargeError,
} from './limits.js';
