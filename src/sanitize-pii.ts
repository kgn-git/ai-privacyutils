// COMPLIANCE: matched substrings MUST NOT be logged. Match counts permitted.
// Redaction is destructive / one-way: matched bytes are replaced in the output
// string and never written to logs, telemetry, or any other side-channel.
// (GDPR Art. 5(1)(c) data-minimisation, Art. 25 transparency contract.)
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
} from './patterns.js';
import { tokensFor, type TokenFormat } from './token-format.js';
import {
  DEFAULT_MAX_INPUT_LENGTH,
  PiiInputTooLargeError,
} from './limits.js';

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
 * valid during splice. `phoneToken` is the concrete replacement string
 * for the active token format (v1.1 — issue #9).
 */
function redactLocalePhones(text: string, phoneToken: string): string {
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
    out = out.slice(0, start) + phoneToken + out.slice(end);
  }
  return out;
}

/**
 * Extract-then-validate redaction for national-level identifiers (R10).
 *
 * Each locale contributes:
 *   - an extraction regex that matches candidate substrings loosely
 *     (structural shape only — correct digit counts, letter positions);
 *   - a validator that runs the per-locale check-digit / prefix rules.
 *
 * Candidates that pass BOTH regex match AND validator acceptance are
 * recorded as byte ranges, de-duplicated, and replaced in reverse order
 * so earlier positions stay stable during splice (identical pattern to
 * `redactLocalePhones`).
 *
 * Order of locale iteration matters only insofar as overlapping extraction
 * shapes are possible:
 *
 *   - UK NINO (2L+6D+1L with optional spaces) — disjoint from everything;
 *     8+L chars.
 *   - FR NIR (15 digits compact or canonically spaced `1 85 07 75056 001 14`)
 *     — distinctive 15-digit run; the canonical spaced form's 1+2+2+5+3+2
 *     grouping has no overlap with UK NINO's 2+2+2+2+1 letter-digit mix.
 *   - IT Codice Fiscale — 16 alphanumeric with letter-digit-letter positional
 *     structure; first two chars are letters (disjoint from FR's leading `1`
 *     or `2` digit, and from ES/PT/NIF bare digit runs).
 *   - ES DNI (8 digits + letter) — could be a proper prefix of the
 *     alphanumeric IT Codice Fiscale. We iterate ES AFTER IT so a full
 *     16-char CF is claimed before its last 9 chars are claimed as a DNI.
 *     In practice the `\b` word boundaries on both extraction regexes
 *     prevent the overlap (DNI's `\b\d{8}[A-Z]\b` requires non-word char
 *     after, which fails when the letter is followed by more letters/digits
 *     of a CF), but the iteration order provides belt-and-braces.
 *   - PT NIF (9 digits) — bare digit run; can be a subsequence of FR NIR
 *     (15 digits). Iterate PT AFTER FR so the 15-digit NIR is claimed
 *     whole before the first 9 digits can be stolen as a NIF. Again,
 *     `\b` boundaries already guarantee this on canonical input, but
 *     ordering is belt-and-braces.
 */
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
  const ranges: Array<{ start: number; end: number }> = [];

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
      // Guard against zero-width matches (shouldn't happen here — all
      // extraction regexes have bounded digit/letter segments).
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }

  if (ranges.length === 0) return text;

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

  let out = text;
  for (let i = merged.length - 1; i >= 0; i -= 1) {
    const { start, end } = merged[i]!;
    out = out.slice(0, start) + token + out.slice(end);
  }
  return out;
}

/**
 * Optional configuration for `sanitizePii`.
 *
 * Backward-compat contract: calling `sanitizePii(text)` with no options
 * argument (or with an empty options object / `tokenFormat: 'readable'`)
 * produces v1.0.0 byte-identical output. Only `tokenFormat: 'sentinel'`
 * diverges from v1.0.0 behaviour — see `./token-format.ts` for the full
 * ADR + idempotency invariant.
 */
export interface SanitizePiiOptions {
  /**
   * Replacement-token format (v1.1 — issue #9 / compliance §R8).
   *
   *   - `'readable'` (default): `[email]`, `[phone]`, `[address]`,
   *     `[postcode]`, `[dob]`. v1.0.0 byte-identical.
   *   - `'sentinel'`: `<<REDACTED_EMAIL>>`, `<<REDACTED_PHONE>>`,
   *     `<<REDACTED_ADDRESS>>`, `<<REDACTED_POSTCODE>>`,
   *     `<<REDACTED_DOB>>`. Pattern-disjoint, low-collision variant.
   */
  tokenFormat?: TokenFormat;
  /**
   * Runtime input-length cap in JS string code units (v1.1 — issue #10 /
   * security review R7). If `text.length` exceeds this value, `sanitizePii`
   * throws `PiiInputTooLargeError` BEFORE running any regex — an O(1)
   * belt-and-braces ReDoS defence that complements the static `recheck` /
   * `eslint-plugin-redos` CI gate.
   *
   * Default: `DEFAULT_MAX_INPUT_LENGTH` (500_000 code units). See ADR 002
   * (`docs/adr/002-input-length-cap.md`) for design rationale including
   * the throw-vs-truncate decision and the per-call scope semantics.
   */
  maxInputLength?: number;
}

/**
 * Sanitise PII from arbitrary text.
 *
 * Port of `jobflow-scoring/src/lib/services/cv-chunker.ts:72-91`
 * extended with a DOB pattern per compliance-review condition C1 (v1.0.0),
 * locale-aware address + postcode sets per #1 (v1.1), locale-aware
 * phone validation per #2 (v1.1 — R2 resolution via libphonenumber-js),
 * and an opt-in `tokenFormat` option per #9 (v1.1 — R8 resolution).
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
 *   4. national-level IDs (R10 — v1.1) — UK NINO, FR NIR, IT Codice
 *              Fiscale, ES DNI, PT NIF. Extract-then-validate per locale
 *              (structural regex + check digit / invalid-prefix rules).
 *              Runs AFTER postcodes (PT NIF's bare 9-digit shape could
 *              otherwise claim the 5-digit portion of a postcode sequence)
 *              and BEFORE DOB (IDs with date-shape digit sequences embedded
 *              — FR NIR's `1850775056001` includes `850775` — are claimed
 *              whole before DOB tries its `DD[./-]MM[./-]YYYY` regex).
 *              See `nationalIdByLocale` / `NATIONAL_ID_LOCALES` in
 *              `src/patterns.ts` for the per-locale extraction + validation
 *              contract, and §4.1 of `docs/Handover-8.md` for the
 *              false-positive analysis (PT NIF accepts ~1/11 random
 *              9-digit runs — documented residual risk R10-residual).
 *   5. DOB — runs BEFORE phones in v1.1. v1.0.0 placed DOB last because
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
 *              (iii) idempotency is preserved — the `[dob]` / `<<REDACTED_DOB>>`
 *                    token has no digit runs.
 *   6. locale-aware phones (FR/DE/GB/IT/ES/PT via libphonenumber-js) —
 *              new in v1.1 (R2). Runs BEFORE the NANP-shape fallback to
 *              avoid double-redaction: a FR number like `06 12 34 56 78`
 *              contains a 3-3-4 substring that the NANP regex could
 *              otherwise match and leave `06 ` dangling. The locale pass
 *              consumes the full validated number as a single `[phone]`
 *              (or `<<REDACTED_PHONE>>`) token; the NANP pass is then a
 *              no-op on the residual.
 *   7. international phone (NANP-shape fallback) — runs before domestic
 *              phone so `+44` is not dangled after the domestic pattern
 *              eats the last ten digits.
 *   8. domestic phone — NANP-shape fallback for v1.0.0 backward-compat.
 *
 * The returned string carries token placeholders per the active
 * `tokenFormat` (default `'readable'` — `[email]`, `[address]`,
 * `[postcode]`, `[phone]`, `[dob]`). When `tokenFormat: 'sentinel'` is
 * passed the tokens become `<<REDACTED_EMAIL>>`, `<<REDACTED_ADDRESS>>`,
 * `<<REDACTED_POSTCODE>>`, `<<REDACTED_PHONE>>`, `<<REDACTED_DOB>>` —
 * pattern-disjoint with every v1.x redaction pattern so idempotency
 * holds in both formats (and cross-format: sentinel output sanitised
 * again in readable mode is also a no-op).
 *
 * See `./token-format.ts` for the full ADR + idempotency invariant.
 */
export function sanitizePii(
  text: string,
  options?: SanitizePiiOptions,
): string {
  if (text === '' || text == null) return text ?? '';

  // O(1) input-length cap (v1.1 — issue #10). Runs AFTER the empty-string
  // short-circuit (preserves v1.0.0 guard: empty in → empty out, even at
  // `maxInputLength: 0`) but BEFORE any regex. This is the secondary ReDoS
  // defence alongside the static `recheck` lint (#4 / S5). See
  // `./limits.ts` for the ADR.
  const maxInputLength = options?.maxInputLength ?? DEFAULT_MAX_INPUT_LENGTH;
  if (text.length > maxInputLength) {
    throw new PiiInputTooLargeError(text.length, maxInputLength);
  }

  const tokens = tokensFor(options?.tokenFormat);
  let out = text;

  // Each regex pattern is a factory (IMP-1): call with `()` to get a fresh
  // /g RegExp so concurrent consumers never share lastIndex state. Inside
  // `String.prototype.replace` the freshness matters less (replace resets
  // lastIndex internally) but calling factories keeps the internal idiom
  // aligned with the exported API.

  // 1. Email first — '@' runs are unambiguous.
  out = out.replace(emailPattern(), tokens.email);

  // 2. Addresses — EN first (byte-equivalent v1.0.0 behaviour), then
  //    locale-specific forms. Disjoint prefixes/suffixes/keywords in
  //    practice, so ordering among locales does not cascade.
  out = out.replace(addressPattern(), tokens.address);
  out = out.replace(addressFrPattern(), tokens.address);
  out = out.replace(addressDePattern(), tokens.address);
  out = out.replace(addressItPattern(), tokens.address);
  out = out.replace(addressEsPattern(), tokens.address);
  out = out.replace(addressPtPattern(), tokens.address);

  // 3. Postcodes — consume residual bare "NNNNN City" / UK / PT forms.
  out = out.replace(postcodeUkPattern(), tokens.postcode);
  out = out.replace(postcodeFrPattern(), tokens.postcode);
  out = out.replace(postcodeDePattern(), tokens.postcode);
  out = out.replace(postcodeItPattern(), tokens.postcode);
  out = out.replace(postcodeEsPattern(), tokens.postcode);
  out = out.replace(postcodePtPattern(), tokens.postcode);

  // 4. National-level IDs (R10 — v1.1) — UK NINO / FR NIR / IT CF / ES DNI
  //    / PT NIF. Extract-then-validate: each locale's extraction regex is
  //    loose on structure only, and the validator applies check-digit /
  //    invalid-prefix rules. Runs AFTER postcodes (so a 5-digit postcode
  //    portion is already consumed before PT NIF's bare 9-digit shape
  //    could claim it as a partial match) and BEFORE DOB (so IDs that
  //    happen to contain date-shaped digit sequences are taken whole).
  out = redactNationalIds(out, tokens.nationalId);

  // 5. DOB BEFORE phones (v1.1 reorder): libphonenumber-js's
  //    findPhoneNumbersInText is lenient enough to match date-like digit
  //    sequences (`23.05.1985`, `1985-05-23`) as phone candidates in DE
  //    and other locales. DOB's regex is precise enough that it cannot
  //    mis-match NANP or EU-formatted phone numbers (see header comment
  //    justification (i)-(iii)).
  out = out.replace(dobPattern(), tokens.dob);

  // 6. Locale-aware phones (FR/DE/GB/IT/ES/PT) BEFORE NANP fallback.
  out = redactLocalePhones(out, tokens.phone);

  // 7-8. NANP-shape phones — v1.0.0 fallback. international first
  //      (consumes +CC prefix), then domestic.
  out = out.replace(phoneInternationalPattern(), tokens.phone);
  out = out.replace(phoneDomesticPattern(), tokens.phone);

  return out;
}
