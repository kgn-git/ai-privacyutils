/**
 * @kgn-git/privacy-utils — canonical PII-redaction library for the
 * Jobflow programme.
 *
 * Public API (v1.0.0):
 *   - `sanitizePii(text)` — pure string-in/string-out redaction.
 *   - `piiPatterns` — named RegExp values for programmatic composition.
 *   - `piiMiddleware` — Vercel AI SDK middleware (`LanguageModelV1Middleware`).
 *
 * See README.md for GDPR rationale, SemVer policy, Known Limitations
 * (C2 per compliance review), and Security posture (S11 per security
 * review).
 */

export { sanitizePii } from './sanitize-pii.js';
export {
  piiPatterns,
  emailPattern,
  addressPattern,
  phoneInternationalPattern,
  phoneDomesticPattern,
  dobPattern,
} from './patterns.js';
export type { PiiPatternName } from './patterns.js';
export { piiMiddleware } from './pii-middleware.js';
