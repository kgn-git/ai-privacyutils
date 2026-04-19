import {
  emailPattern,
  addressPattern,
  phoneInternationalPattern,
  phoneDomesticPattern,
  dobPattern,
} from './patterns.js';

/**
 * Sanitise PII from arbitrary text.
 *
 * Port of `jobflow-scoring/src/lib/services/cv-chunker.ts:72-91`
 * extended with a DOB pattern per compliance-review condition C1.
 *
 * Order of application matters for idempotency and correctness (see the
 * inline justification in `src/__tests__/sanitize-pii.test.ts`):
 *
 *   1. email — must run before phone so `@domain123.co` digit runs are
 *              not mis-matched by phone patterns.
 *   2. address — must run before phone so the leading house number of a
 *                street address is not eaten by the phone pattern.
 *   3. international phone — must run before domestic phone so `+44` is
 *                            not dangled after the domestic pattern eats
 *                            the last ten digits.
 *   4. domestic phone — NANP-shaped fallback.
 *   5. DOB — runs LAST because:
 *            (a) placing it before phone would cause numeric DD.MM.YYYY
 *                sequences to mis-match as phone digit runs;
 *            (b) placing it before address is unsafe because named-month
 *                regexes can overlap with words in free-text addresses;
 *            (c) idempotency is preserved — the `[dob]` token contains
 *                no digits or months that any prior pattern could match.
 *
 * The returned string carries the token placeholders `[email]`,
 * `[address]`, `[phone]`, `[dob]`. See compliance review §R8 — token
 * collision with user-written text containing the literal string
 * `[email]` is possible but low-risk (one-way redaction; downstream LLM
 * treats the token as opaque).
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

  // 2. Address — captures the leading house-number digit run.
  out = out.replace(addressPattern(), '[address]');

  // 3-4. Phone — international first (consumes +CC prefix), then domestic.
  out = out.replace(phoneInternationalPattern(), '[phone]');
  out = out.replace(phoneDomesticPattern(), '[phone]');

  // 5. DOB last — see header comment.
  out = out.replace(dobPattern(), '[dob]');

  return out;
}
