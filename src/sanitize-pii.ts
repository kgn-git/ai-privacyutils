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
 * Sanitise PII from arbitrary text.
 *
 * Port of `jobflow-scoring/src/lib/services/cv-chunker.ts:72-91`
 * extended with a DOB pattern per compliance-review condition C1 (v1.0.0)
 * and locale-aware address + postcode sets per #1 (v1.1).
 *
 * Order of application matters for idempotency and correctness (see the
 * inline justification in `src/__tests__/sanitize-pii.test.ts` and
 * `src/__tests__/locale-patterns.test.ts`):
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
 *   4. international phone — must run before domestic phone so `+44` is
 *              not dangled after the domestic pattern eats the last ten
 *              digits.
 *   5. domestic phone — NANP-shaped fallback.
 *   6. DOB — runs LAST because:
 *            (a) placing it before phone would cause numeric DD.MM.YYYY
 *                sequences to mis-match as phone digit runs;
 *            (b) placing it before address is unsafe because named-month
 *                regexes can overlap with words in free-text addresses;
 *            (c) idempotency is preserved — the `[dob]` token contains
 *                no digits or months that any prior pattern could match.
 *
 * The returned string carries the token placeholders `[email]`,
 * `[address]`, `[postcode]` (new in v1.1), `[phone]`, `[dob]`. See
 * compliance review §R8 — token collision with user-written text
 * containing the literal tokens is possible but low-risk (one-way
 * redaction; downstream LLM treats the token as opaque).
 */
export function sanitizePii(text: string): string {
  if (text === '' || text == null) return text ?? '';

  let out = text;

  // Each pattern is a factory (IMP-1): call with `()` to get a fresh /g
  // RegExp so concurrent consumers never share lastIndex state. Inside
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

  // 4-5. Phone — international first (consumes +CC prefix), then domestic.
  out = out.replace(phoneInternationalPattern(), '[phone]');
  out = out.replace(phoneDomesticPattern(), '[phone]');

  // 6. DOB last — see header comment.
  out = out.replace(dobPattern(), '[dob]');

  return out;
}
