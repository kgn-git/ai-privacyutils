// COMPLIANCE: destructive one-way redaction — a match is used only to compute the byte range that is replaced in
// the output; matched substrings and candidates are never logged, returned or stored (match counts may be).
// Record: docs/compliance/redaction-record.md § 1, § 2.
import { findPhoneNumbersInText } from 'libphonenumber-js/min';
import type { CountryCode } from 'libphonenumber-js/min';

import {
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
  nationalIdUkExtractionPattern,
  nationalIdFrExtractionPattern,
  nationalIdItExtractionPattern,
  nationalIdEsExtractionPattern,
  nationalIdPtExtractionPattern,
  nationalIdUkValidator,
  nationalIdFrValidator,
  nationalIdItValidator,
  nationalIdEsValidator,
  nationalIdPtValidator,
  phoneInternationalPattern,
  phoneDomesticPattern,
  dobPattern,
  dobContextCuePattern,
} from './patterns.js';
import { tokensFor, type TokenFormat } from './token-format.js';
import { redactRanges, type ByteRange } from './redact-ranges.js';
import type { RedactionProfile } from './profiles.js';
import {
  DEFAULT_MAX_INPUT_LENGTH,
  PiiInputTooLargeError,
} from './limits.js';

// Order is not load-bearing: matches found under more than one country are merged by `redactRanges`.
const PHONE_LOCALE_COUNTRIES: readonly CountryCode[] = [
  'FR',
  'DE',
  'GB',
  'IT',
  'ES',
  'PT',
];

// DE metadata accepts 4–6 digit short-code shapes (`12 34 56`, `116 117`) as valid; 7 keeps every real subscriber
// number (the shortest across the six locales is 9 digits) and drops those.
const MIN_PHONE_DIGITS = 7;

// `libphonenumber-js` accepts a bare 8-digit run as a DE number; requiring a `+` prefix or a separator keeps SKUs
// and order IDs out. A bare 10-digit 3-3-4 run is still redacted by the NANP fallback.
const PHONE_FORMATTED_RE = /^\+|[\s.-]/;

// `findPhoneNumbersInText` returns every candidate valid for the default country; a `+CC` number is found under
// any country.
function redactLocalePhones(text: string, phoneToken: string): string {
  const ranges: ByteRange[] = [];

  for (const country of PHONE_LOCALE_COUNTRIES) {
    try {
      const found = findPhoneNumbersInText(text, { defaultCountry: country });
      for (const match of found) {
        const national = match.number.nationalNumber;
        const raw = text.slice(match.startsAt, match.endsAt);
        if (
          typeof national === 'string' &&
          national.length >= MIN_PHONE_DIGITS &&
          match.number.isValid() &&
          PHONE_FORMATTED_RE.test(raw)
        ) {
          ranges.push({ start: match.startsAt, end: match.endsAt });
        }
      }
    } catch {
      // A throwing finder for one locale is swallowed so the other locales and passes still run.
    }
  }

  return redactRanges(text, ranges, phoneToken);
}

// Extraction is loose on shape; the validator carries the precision. The `\b` anchors keep the five shapes
// disjoint, so the locale order is not load-bearing.
const NATIONAL_ID_LOCALES: ReadonlyArray<{
  extract: () => RegExp;
  validate: (candidate: string) => boolean;
}> = [
  { extract: nationalIdItExtractionPattern, validate: nationalIdItValidator() },
  { extract: nationalIdUkExtractionPattern, validate: nationalIdUkValidator() },
  { extract: nationalIdFrExtractionPattern, validate: nationalIdFrValidator() },
  { extract: nationalIdEsExtractionPattern, validate: nationalIdEsValidator() },
  { extract: nationalIdPtExtractionPattern, validate: nationalIdPtValidator() },
];

function redactNationalIds(text: string, token: string): string {
  const ranges: ByteRange[] = [];

  for (const { extract, validate } of NATIONAL_ID_LOCALES) {
    const re = extract();
    for (
      let m: RegExpExecArray | null = re.exec(text);
      m !== null;
      m = re.exec(text)
    ) {
      const candidate = m[0];
      if (validate(candidate)) {
        ranges.push({ start: m.index, end: m.index + candidate.length });
      }
      // Zero-width guard; every extraction regex has bounded segments, so it never fires.
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }

  return redactRanges(text, ranges, token);
}

// Replaces only the date group; the cue is kept.
function redactContextualDob(text: string, token: string): string {
  return text.replace(
    dobContextCuePattern(),
    (_match, cue: string, sep: string) => `${cue}${sep}${token}`,
  );
}

/** With no options the output equals the previous release's on the shared fixtures. */
export interface SanitizePiiOptions {
  /** `'readable'` (default) or `'sentinel'` — the sentinel form exists for collisions with authored text. */
  tokenFormat?: TokenFormat;
  /** Cap in UTF-16 code units, default `DEFAULT_MAX_INPUT_LENGTH`; over it `sanitizePii` throws `PiiInputTooLargeError` before any regex runs. */
  maxInputLength?: number;
  /** `'cv'` redacts a date only behind a birth cue; everything else equals `'default'`. */
  profile?: RedactionProfile;
}

/**
 * Pass order is load-bearing: email before phones, addresses before postcodes and phones, national IDs before
 * phones, dates before the locale phone pass, locale phones before the NANP fallback, `+CC` before domestic. The
 * adjacency each fixture pins is tabulated in docs/compliance/redaction-record.md § 2.
 */
export function sanitizePii(
  text: string,
  options?: SanitizePiiOptions,
): string {
  if (text === '' || text == null) return text ?? '';

  // After the empty-string short-circuit, so `''` is returned even at `maxInputLength: 0`, and before any regex.
  const maxInputLength = options?.maxInputLength ?? DEFAULT_MAX_INPUT_LENGTH;
  if (text.length > maxInputLength) {
    throw new PiiInputTooLargeError(text.length, maxInputLength);
  }

  const tokens = tokensFor(options?.tokenFormat);
  let out = text;

  // 1. email
  out = out.replace(emailPattern(), tokens.email);

  // 2. addresses
  out = out.replace(addressPattern(), tokens.address);
  out = out.replace(addressFrPattern(), tokens.address);
  out = out.replace(addressDePattern(), tokens.address);
  out = out.replace(addressItPattern(), tokens.address);
  out = out.replace(addressEsPattern(), tokens.address);
  out = out.replace(addressPtPattern(), tokens.address);

  // 3. postcodes
  out = out.replace(postcodeUkPattern(), tokens.postcode);
  out = out.replace(postcodeFrPattern(), tokens.postcode);
  out = out.replace(postcodeDePattern(), tokens.postcode);
  out = out.replace(postcodeItPattern(), tokens.postcode);
  out = out.replace(postcodeEsPattern(), tokens.postcode);
  out = out.replace(postcodePtPattern(), tokens.postcode);

  // 4. national IDs
  out = redactNationalIds(out, tokens.nationalId);

  // 5. date of birth — every shape, or only a cue-labelled date under `'cv'`
  if (options?.profile === 'cv') {
    out = redactContextualDob(out, tokens.dob);
  } else {
    out = out.replace(dobPattern(), tokens.dob);
  }

  // 6. locale phones
  out = redactLocalePhones(out, tokens.phone);

  // 7–8. NANP-shape fallbacks, `+CC` first
  out = out.replace(phoneInternationalPattern(), tokens.phone);
  out = out.replace(phoneDomesticPattern(), tokens.phone);

  return out;
}
