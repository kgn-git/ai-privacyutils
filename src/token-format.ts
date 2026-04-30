/**
 * Replacement-token format registry (v1.1 — issue #9 / compliance §R8).
 *
 * ## Purpose
 *
 * v1.0.0 redacted PII to human-readable tokens — `[email]`, `[phone]`,
 * `[address]`, `[postcode]`, `[dob]`. Readable tokens are convenient for
 * debugging and low-friction for downstream LLM prompts, but they collide
 * with user-authored literals: a CV containing the phrase `"enquiries via
 * the [email] form"` has indistinguishable output from a real email
 * redacted in that slot. Compliance review §R8 flagged this as a low-
 * severity residual risk.
 *
 * v1.1 adds an opt-in `tokenFormat: 'sentinel'` option that swaps the
 * readable tokens for `<<REDACTED_EMAIL>>` / `<<REDACTED_PHONE>>` /
 * `<<REDACTED_ADDRESS>>` / `<<REDACTED_POSTCODE>>` / `<<REDACTED_DOB>>`.
 * Consumers can opt in per-call (`sanitizePii(text, { tokenFormat:
 * 'sentinel' })`) or per-middleware-instance (`createPiiMiddleware({
 * tokenFormat: 'sentinel' })`). Default remains `'readable'` — v1.0.0
 * output is byte-identical when no option is passed (SemVer minor bump).
 *
 * The default change to `'sentinel'` is deferred to v2.0 (major bump) and
 * is out of scope here.
 *
 * ## Idempotency invariant
 *
 * The sentinel form was chosen so that no v1.x redaction pattern can match
 * a sentinel token:
 *
 *   - `<<REDACTED_EMAIL>>` contains no `@` — `emailPattern` does not match.
 *   - `<<REDACTED_PHONE>>` / `<<REDACTED_DOB>>` / `<<REDACTED_NATIONALID>>`
 *     contain no digits — `phoneInternationalPattern`,
 *     `phoneDomesticPattern`, the libphonenumber-js locale pass,
 *     `dobPattern`, and the national-ID extraction regexes (all of which
 *     require digit-dominant structure) fail to match.
 *   - `<<REDACTED_ADDRESS>>` / `<<REDACTED_POSTCODE>>` do not start with
 *     `\b\d` — the EN/DE/IT/ES/PT address patterns and all postcode
 *     patterns (which all require a leading digit run) cannot match.
 *   - `<<REDACTED_*>>` contains no lowercase French street-type keywords
 *     (`rue`, `avenue`, `place` …) so the FR address pattern does not
 *     match.
 *   - The strings `REDACTED_EMAIL` / `REDACTED_PHONE` etc. do not match any
 *     address locale's prefix-keyword alternation (`Via|Calle|Rua|Rue|
 *     Hauptstraße` …) — they are not in the closed set.
 *   - `<<REDACTED_NATIONALID>>` in particular contains no structural
 *     national-ID shape — no 8-digits+letter (DNI), no 9-digit run (NIF),
 *     no 15-digit run (NIR), no 16-alphanumeric-with-letter-digit-positional
 *     shape (Codice Fiscale), no 2-letter-6-digit-letter shape (NINO).
 *
 * Consequence: sanitizePii(sanitizePii(text, { tokenFormat: 'sentinel' }),
 * { tokenFormat: 'sentinel' }) === sanitizePii(text, { tokenFormat:
 * 'sentinel' }). The idempotency property extends cross-format — sentinel
 * output sanitised a second time with the default readable format is also
 * a strict no-op, because the sentinel form contains no PII shape that any
 * readable-format pattern could match.
 *
 * Verified by `src/__tests__/token-format.test.ts`.
 *
 * ## ADR (tokenFormat design rationale)
 *
 * Considered alternatives:
 *   1. **UUID sentinel per call** (`<<REDACTED_EMAIL_7a9b-f3c1>>`). Rejected
 *      — harms prompt cacheability, breaks determinism across runs, adds
 *      entropy for no correctness gain. The collision risk §R8 highlights
 *      is already ~zero with a fixed sentinel because real user text is
 *      extraordinarily unlikely to contain `<<REDACTED_X>>` verbatim.
 *   2. **Per-type custom token config** (consumer supplies their own
 *      token strings). Rejected for v1.1 — expands the surface area
 *      (custom tokens may themselves collide with PII patterns, requiring
 *      runtime validation), and is unneeded for the two concrete
 *      consumers (scoring, platform). Re-evaluable in v1.2 if demand
 *      emerges.
 *   3. **Replace readable as default in v1.1** (breaking change). Rejected
 *      — this is a SemVer-minor release; we must preserve v1.0.0
 *      byte-equivalent defaults. Default-swap is tracked for v2.0.
 *
 * Chosen: fixed two-value `'readable' | 'sentinel'` enum. Covers both the
 * debuggable-default case and the low-collision production case with a
 * flat, testable API surface.
 */

/**
 * Public enum for the `tokenFormat` option. Exported so consumers can
 * type their middleware factory config.
 */
export type TokenFormat = 'readable' | 'sentinel';

/**
 * Symbolic names for each redaction slot. Used internally by sanitizePii
 * (regex-only) and sanitizePiiAsync (regex + NER name redaction) to look
 * up the concrete replacement string for the active format.
 *
 * The `'person'` slot was added in v1.2 (issue #42 — NER-based PERSON
 * redaction via `compromise`). Idempotency is preserved — see invariant
 * proof above.
 */
export type TokenKind =
  | 'email'
  | 'address'
  | 'postcode'
  | 'phone'
  | 'dob'
  | 'nationalId'
  | 'person';

/**
 * Complete token map per format. Every `TokenKind` is guaranteed to have
 * a value in every format (TypeScript `Record<TokenKind, string>`
 * enforces exhaustiveness).
 *
 * `readable` MUST remain byte-identical to v1.0.0 token strings. Changing
 * any value here without a major version bump is a breaking change on
 * every downstream fixture. `sentinel` is new in v1.1 and was chosen to
 * be pattern-disjoint (see idempotency invariant above).
 */
export const TOKEN_FORMATS: Readonly<
  Record<TokenFormat, Readonly<Record<TokenKind, string>>>
> = {
  readable: {
    email: '[email]',
    address: '[address]',
    postcode: '[postcode]',
    phone: '[phone]',
    dob: '[dob]',
    nationalId: '[nationalId]',
    person: '[person]',
  },
  sentinel: {
    email: '<<REDACTED_EMAIL>>',
    address: '<<REDACTED_ADDRESS>>',
    postcode: '<<REDACTED_POSTCODE>>',
    phone: '<<REDACTED_PHONE>>',
    dob: '<<REDACTED_DOB>>',
    nationalId: '<<REDACTED_NATIONALID>>',
    person: '<<REDACTED_PERSON>>',
  },
} as const;

/**
 * Resolve the concrete token map for a given format.
 *
 * `format === undefined` → `'readable'` default (v1.0.0 byte-identical).
 */
export function tokensFor(
  format: TokenFormat | undefined,
): Readonly<Record<TokenKind, string>> {
  return TOKEN_FORMATS[format ?? 'readable'];
}
