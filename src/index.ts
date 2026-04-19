/**
 * @kgn-git/privacy-utils — canonical PII-redaction library for the
 * Jobflow programme.
 *
 * Public API (v1.1):
 *   - `sanitizePii(text)` — pure string-in/string-out redaction.
 *   - `piiPatterns` — named factory dictionary for programmatic composition,
 *     now including `addressByLocale` + `postcodeByLocale` + `phoneByLocale`
 *     sub-objects. `phoneByLocale.*()` factories return validator
 *     functions backed by `libphonenumber-js` (not RegExp); the NANP-shape
 *     `phoneInternational` / `phoneDomestic` RegExp factories are retained
 *     for backward-compat.
 *   - `piiMiddleware` — Vercel AI SDK middleware (`LanguageModelV1Middleware`).
 *
 * See README.md for GDPR rationale, SemVer policy, Known Limitations
 * (updated in v1.1 — R1 + R2 resolved for FR/DE/UK/IT/ES/PT locales),
 * and Security posture (S11 per security review).
 */

export { sanitizePii } from './sanitize-pii.js';
export {
  piiPatterns,
  addressByLocale,
  postcodeByLocale,
  phoneByLocale,
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
  dobPattern,
} from './patterns.js';
export type {
  PiiPatternName,
  AddressLocale,
  PostcodeLocale,
  PhoneLocale,
} from './patterns.js';
export { piiMiddleware } from './pii-middleware.js';
