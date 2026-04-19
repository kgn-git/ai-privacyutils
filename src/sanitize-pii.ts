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
  phoneInternationalPattern,
  phoneDomesticPattern,
  dobPattern,
} from './patterns.js';

/**
 * Locale ordering for the locale-aware phone pass. Order is arbitrary
 * because `findNumbers` returns disjoint match ranges per country — but
 * we de-duplicate overlapping matches below to guard against edge cases
 * where the same number is detectable under multiple countries.
 */
const PHONE_LOCALE_COUNTRIES: readonly CountryCode[] = [
  'FR',
  'DE',
  'GB',
  'IT',
  'ES',
  'PT',
];

/**
 * Minimum national-number length considered "plausibly a phone number" for
 * precision guarding.
 *
 * libphonenumber-js's `isValid()` treats short 4-digit national-number
 * patterns (e.g. `1985`, `1990`) as valid under country-specific metadata
 * because some countries (including DE) have short-code ranges that
 * overlap 4-digit sequences. In a PII-redaction context this is a
 * precision disaster: a CV with employment dates "Worked at Acme from
 * 1985 to 1990" would have both years redacted as phone numbers.
 *
 * Empirically, the shortest genuine subscriber-line phone number across
 * FR/DE/GB/IT/ES/PT is 9 digits (FR/PT mobiles). We require `>= 7` digits
 * as a conservative floor that (a) preserves recall for any real CV phone
 * number and (b) filters 4-digit year-like and 5-6 digit SKU-like
 * sequences. ITU E.164 §6.1 permits 4-15 digit national numbers globally
 * but the 4-6 range is almost exclusively short codes / premium-rate /
 * emergency numbers, which are not in the R2 threat model.
 */
const MIN_PHONE_DIGITS = 7;

/**
 * Regex detecting "phone-like formatting" in a candidate substring.
 *
 * A bare digit run like `12345678` is most likely a SKU / order-ID /
 * identifier, not a phone number — yet libphonenumber-js happily treats
 * 8 digits as a valid DE national number. To maintain precision we
 * require the candidate substring EITHER (a) start with `+` (explicit
 * country-code prefix, unambiguous) OR (b) contain at least one
 * phone-format separator (space, hyphen, or dot) between digit groups.
 *
 * This is a "written as a phone number" heuristic. It matches:
 *   - `+33 6 12 34 56 78` (prefix)
 *   - `06 12 34 56 78`    (spaces)
 *   - `555-123-4567`      (hyphens — though NANP fallback also covers)
 *   - `030 12345678`      (space + digit run)
 * And rejects:
 *   - `12345678`          (bare digit run, SKU-shaped)
 *   - `9876543210`        (bare digit run; NANP fallback regex still
 *                          matches this separately — that's v1.0.0
 *                          behaviour + not in R2 scope)
 */
const PHONE_FORMATTED_RE = /^\+|[\s.-]/;

/**
 * Redact all libphonenumber-js-valid phone candidates across the six EU
 * locales (FR/DE/GB/IT/ES/PT).
 *
 * `findPhoneNumbersInText(text, { defaultCountry })` returns every phone
 * candidate in the text that parses as a valid number in the supplied
 * country, exposing each match as a `PhoneNumber` object (the v2 shape,
 * which is the non-deprecated form; the legacy `findNumbers` signature
 * returns a different shape and is deprecated upstream). Iterating
 * across all six locales catches:
 *
 *   - Native national-format numbers without country code (e.g. FR
 *     `06 12 34 56 78`, UK `07700 900123`, DE `030 12345678`).
 *   - International-format numbers with country code (e.g. `+33 ...`,
 *     `+44 ...`, `+49 ...`, `+39 ...`, `+34 ...`, `+351 ...`). Any single
 *     defaultCountry pass picks these up because the `+CC` prefix is
 *     unambiguous.
 *
 * Precision guard: each candidate is accepted only if `.isValid()` AND
 * `nationalNumber.length >= MIN_PHONE_DIGITS`. The length floor filters
 * 4-digit year-like noise (`1985`, `1990`) that DE/UK metadata treats as
 * valid short codes but which are obviously not PII phone numbers in CV
 * context.
 *
 * Matches are merged into a single sorted list of disjoint `[start, end)`
 * ranges, then replaced in reverse position order so earlier indices stay
 * valid during splice.
 */
function redactLocalePhones(text: string): string {
  const ranges: Array<{ start: number; end: number }> = [];

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
      // libphonenumber-js is defensive but wrap in try/catch so
      // sanitizePii never throws on pathological input.
    }
  }

  if (ranges.length === 0) return text;

  // De-duplicate + merge overlapping ranges. Sort by `start` ascending
  // then `end` descending so nested ranges are picked up by the first
  // iteration.
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      if (r.end > last.end) last.end = r.end;
    } else {
      merged.push({ ...r });
    }
  }

  // Replace in reverse order so earlier positions remain valid.
  let out = text;
  for (let i = merged.length - 1; i >= 0; i -= 1) {
    const { start, end } = merged[i]!;
    out = out.slice(0, start) + '[phone]' + out.slice(end);
  }
  return out;
}

/**
 * Sanitise PII from arbitrary text.
 *
 * Port of `jobflow-scoring/src/lib/services/cv-chunker.ts:72-91`
 * extended with a DOB pattern per compliance-review condition C1 (v1.0.0)
 * and locale-aware address + postcode sets per #1 (v1.1) + locale-aware
 * phone validation per #2 (v1.1 — R2 resolution via libphonenumber-js).
 *
 * Order of application matters for idempotency and correctness (see the
 * inline justification in `src/__tests__/sanitize-pii.test.ts`,
 * `src/__tests__/locale-patterns.test.ts`, and
 * `src/__tests__/locale-phone-patterns.test.ts`):
 *
 *   1. email — must run before phone so `@domain123.co` digit runs are
 *              not mis-matched by phone patterns.
 *   2. addresses (all locales) — must run before postcodes so full
 *              structured addresses (e.g. "12 rue de la Paix, 75001 Paris")
 *              consume the street portion first; residual "75001 Paris"
 *              is then consumed by the postcode pass. Must also run before
 *              phone so the leading house number is not eaten by the phone
 *              pattern. Locale order within the union is arbitrary — the
 *              locale patterns are disjoint in practice (FR requires
 *              number-first + lowercase street keyword; DE/IT/ES/PT
 *              require specific prefix/suffix keywords; EN requires an
 *              English terminator). EN runs first to preserve v1.0.0
 *              byte-equivalent behaviour on shared fixtures.
 *   3. postcodes (all locales) — consume bare "NNNNN City" or UK/PT
 *              alphanumeric codes that were not part of a fully structured
 *              street address. Must run AFTER addresses and BEFORE phone
 *              (5-digit postcodes do not match NANP phone shape; UK/PT
 *              alphanumerics are also disjoint from phone).
 *   4. DOB — runs BEFORE phones in v1.1. v1.0.0 placed DOB last because
 *            the NANP-shape regex could not mis-match date-like `DD.MM.YYYY`
 *            sequences (NANP separators are `.-` between digit runs of
 *            specific shapes that disjoint from DOB's `\d{1,2}[./-]\d{1,2}[./-]\d{2,4}`
 *            regex). libphonenumber-js's broader candidate-finder
 *            DOES recognise `23.05.1985` / `1985-05-23` / `23-05-1985` /
 *            `23/05/1985` as valid phone candidates in DE / other locales,
 *            so the v1.1 order redacts DOB first to prevent phone from
 *            eating DOB sequences. This is safe because:
 *              (i) DOB regex is anchored on `\b` and has specific
 *                  separator alternation that doesn't match phone-formatted
 *                  numbers (e.g. `555-123-4567` has an impossible middle
 *                  group of 3 digits vs DOB's `\d{1,2}`; FR `06 12 34 56 78`
 *                  uses spaces, not DOB separators);
 *              (ii) named-month DOBs (`12 mars 1985`) are already
 *                   non-overlapping with any phone shape;
 *              (iii) idempotency is preserved — the `[dob]` token has no
 *                    digit runs.
 *   5. locale-aware phones (FR/DE/GB/IT/ES/PT via libphonenumber-js) —
 *              new in v1.1 (R2). Runs BEFORE the NANP-shape fallback to
 *              avoid double-redaction: a FR number like `06 12 34 56 78`
 *              contains a 3-3-4 substring that the NANP regex could
 *              otherwise match and leave `06 ` dangling. The locale pass
 *              consumes the full validated number as a single `[phone]`
 *              token; the NANP pass is then a no-op on the residual.
 *   6. international phone (NANP-shape fallback) — runs before domestic
 *              phone so `+44` is not dangled after the domestic pattern
 *              eats the last ten digits.
 *   7. domestic phone — NANP-shape fallback for v1.0.0 backward-compat.
 *
 * The returned string carries the token placeholders `[email]`,
 * `[address]`, `[postcode]` (v1.1), `[phone]`, `[dob]`. Locale-aware
 * phones and NANP-shape phones share the same `[phone]` token for
 * downstream homogeneity. See compliance review §R8 — token collision
 * with user-written text containing the literal tokens is possible but
 * low-risk (one-way redaction; downstream LLM treats the token as opaque).
 */
export function sanitizePii(text: string): string {
  if (text === '' || text == null) return text ?? '';

  let out = text;

  // Each regex pattern is a factory (IMP-1): call with `()` to get a fresh
  // /g RegExp so concurrent consumers never share lastIndex state. Inside
  // `String.prototype.replace` the freshness matters less (replace resets
  // lastIndex internally) but calling factories keeps the internal idiom
  // aligned with the exported API.

  // 1. Email first — '@' runs are unambiguous.
  out = out.replace(emailPattern(), '[email]');

  // 2. Addresses — EN first (byte-equivalent v1.0.0 behaviour), then
  //    locale-specific forms. Disjoint prefixes/suffixes/keywords in
  //    practice, so ordering among locales does not cascade.
  out = out.replace(addressPattern(), '[address]');
  out = out.replace(addressFrPattern(), '[address]');
  out = out.replace(addressDePattern(), '[address]');
  out = out.replace(addressItPattern(), '[address]');
  out = out.replace(addressEsPattern(), '[address]');
  out = out.replace(addressPtPattern(), '[address]');

  // 3. Postcodes — consume residual bare "NNNNN City" / UK / PT forms.
  out = out.replace(postcodeUkPattern(), '[postcode]');
  out = out.replace(postcodeFrPattern(), '[postcode]');
  out = out.replace(postcodeDePattern(), '[postcode]');
  out = out.replace(postcodeItPattern(), '[postcode]');
  out = out.replace(postcodeEsPattern(), '[postcode]');
  out = out.replace(postcodePtPattern(), '[postcode]');

  // 4. DOB BEFORE phones (v1.1 reorder): libphonenumber-js's
  //    findPhoneNumbersInText is lenient enough to match date-like digit
  //    sequences (`23.05.1985`, `1985-05-23`) as phone candidates in DE
  //    and other locales. DOB's regex is precise enough that it cannot
  //    mis-match NANP or EU-formatted phone numbers (see header comment
  //    justification (i)-(iii)).
  out = out.replace(dobPattern(), '[dob]');

  // 5. Locale-aware phones (FR/DE/GB/IT/ES/PT) BEFORE NANP fallback.
  out = redactLocalePhones(out);

  // 6-7. NANP-shape phones — v1.0.0 fallback. international first
  //      (consumes +CC prefix), then domestic.
  out = out.replace(phoneInternationalPattern(), '[phone]');
  out = out.replace(phoneDomesticPattern(), '[phone]');

  return out;
}
