// COMPLIANCE: the public surface. Nothing exported returns matched text — outputs are redacted strings, booleans,
// check values, byte ranges and pattern factories. Contract: docs/compliance/redaction-record.md § 1.

export { sanitizePii } from './sanitize-pii.js';
export type { SanitizePiiOptions } from './sanitize-pii.js';
export type { RedactionProfile } from './profiles.js';
export { sanitizePiiAsync, applyNerRedactions } from './sanitize-pii-async.js';
export type { SanitizePiiAsyncOptions } from './sanitize-pii-async.js';
export {
  createNerEngine,
  NullNerEngine,
  CompromiseNerEngine,
} from './ner/index.js';
export type {
  NerConfig,
  NerEngine,
  NerSpan,
  NerDetectOptions,
} from './ner/index.js';
export {
  PiiNerLoadError,
  DEFAULT_NER_DENY_LIST,
} from './ner/compromise-ner-engine.js';
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
  dobContextCuePattern,
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
