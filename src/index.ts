/**
 * @kgn-git/privacy-utils — canonical PII-redaction library for the
 * Jobflow programme.
 *
 * Public API (v1.1):
 *   - `sanitizePii(text)` — pure string-in/string-out redaction.
 *   - `piiPatterns` — named factory dictionary for programmatic composition,
 *     now including `addressByLocale` + `postcodeByLocale` sub-objects.
 *   - `piiMiddleware` — Vercel AI SDK middleware (`LanguageModelV1Middleware`).
 *
 * See README.md for GDPR rationale, SemVer policy, Known Limitations
 * (updated in v1.1 — R1 resolved for FR/DE/IT/ES/PT structured addresses +
 * UK/FR/DE/IT/ES/PT postcodes), and Security posture (S11 per security
 * review).
 */

export { sanitizePii } from './sanitize-pii.js';
export {
  piiPatterns,
  addressByLocale,
  postcodeByLocale,
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
  dobPattern,
} from './patterns.js';
export type {
  PiiPatternName,
  AddressLocale,
  PostcodeLocale,
} from './patterns.js';
export { piiMiddleware } from './pii-middleware.js';
