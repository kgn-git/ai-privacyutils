/**
 * Canonical PII regex patterns for Jobflow LLM middleware.
 *
 * v1.0.0 patterns are ported byte-equivalent from
 * `jobflow-scoring/src/lib/services/cv-chunker.ts:72-91` where the
 * email / address / international-phone / domestic-phone patterns were
 * originally authored. The DOB pattern is new in v1.0.0 per the C1
 * condition of
 * `jobflow-programme/docs/compliance-reviews/ComplianceReview-2026-04-19-privacy-utils-v1.0.0.md`
 * — covers `DD.MM.YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `DD-MM-YYYY`, and
 * named-month variants across EN/FR/DE/IT/ES/PT.
 *
 * v1.1 adds locale-aware address + postcode + phone coverage per #1 (R1)
 * and #2 (R2) of the compliance review §7. New exports:
 *
 *   - `addressByLocale.en()/.fr()/.de()/.it()/.es()/.pt()` — per-locale
 *     structured-address factories. EN is the v1.0.0 pattern preserved
 *     byte-equivalent; `piiPatterns.address` is kept as an alias for
 *     `addressByLocale.en` for backward-compat.
 *   - `postcodeByLocale.uk()/.fr()/.de()/.it()/.es()/.pt()` — bare
 *     postcode factories. UK alphanumeric, FR/DE/IT/ES 5-digit with
 *     following city token, PT NNNN-NNN with optional city.
 *   - `phoneByLocale.fr()/.de()/.uk()/.it()/.es()/.pt()` — per-locale
 *     validator factories backed by `libphonenumber-js`. Each call returns
 *     a fresh `(candidate: string) => boolean` validator. NOT a RegExp
 *     factory — see `makePhoneValidator` / `phoneByLocale` JSDoc below
 *     for the "validator over RegExp" API choice rationale. The v1.0.0
 *     NANP-shape `phoneInternationalPattern` + `phoneDomesticPattern`
 *     regexes are retained as backward-compat fallbacks.
 *   - Replacement token for postcodes: `[postcode]` (added in #1).
 *
 * Order of application (see `sanitizePii`): email → addresses (all
 * locales) → postcodes (all locales) → international phone → domestic
 * phone → DOB. Documented in `src/__tests__/sanitize-pii.test.ts` and
 * `src/__tests__/locale-patterns.test.ts` with inline justification.
 *
 * ## Why factories (IMP-1, 2026-04-19)
 *
 * Each pattern is exported as a **factory function** that returns a fresh
 * `RegExp` on every call, rather than as a module-level singleton. The
 * hazard being avoided is the `/g`-flagged stateful-`lastIndex` footgun:
 *
 *   const re = SHARED_EMAIL_REGEX;             // /g-flagged
 *   re.test('jane@example.com');                // true, advances lastIndex
 *   re.test('jane@example.com');                // false — lastIndex past end
 *   re.test('jane@example.com');                // true again — lastIndex reset
 *
 * `String.prototype.replace` (used internally by `sanitizePii`) resets
 * `lastIndex` automatically, so the singleton shape was safe for the
 * package's own consumers. But any external consumer calling `.test()` or
 * `.exec()` against an imported pattern would trip the alternation. Factories
 * guarantee every call-site gets a pristine instance.
 *
 * Known limitations (v1.1 — shrunk from v1.0.0 R1/R2/R3/R5/R10):
 *   - R1 RESOLVED for FR/DE/IT/ES/PT structured addresses + UK/FR/DE/IT/ES/PT
 *     bare postcodes. Residual gaps: names with apostrophes (`O'Brien Road`),
 *     non-EU locales, and structured-address forms with unusual word order.
 *   - R2 RESOLVED for FR/DE/UK/IT/ES/PT native mobile + landline formats via
 *     `libphonenumber-js` per `phoneByLocale` + `sanitizePii` locale-aware
 *     pass. NANP-shape `phoneInternational` / `phoneDomestic` fallbacks
 *     retained for backward-compat with v1.0.0 consumers.
 *   - R3 Applicant names — v1.2 NER work.
 *   - R5 RESOLVED — `emailPattern` is now RFC 6531 / IDNA 2008 aware via
 *     `\p{L}\p{N}` Unicode classes + `u` flag. Matches IDN local parts
 *     (françois@), IDN domains (école.fr, münchen.de), punycode ACE
 *     (xn--mnchen-3ya.de), and Unicode TLDs (example.中国). ASCII fixtures
 *     remain byte-equivalent.
 *   - R10 National identifiers — v1.2.
 */

/**
 * Email addresses: local@domain.tld with IDN + RFC 6531 support (v1.1 — R5).
 *
 * v1.0.0 was ASCII-only (`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`)
 * and rejected:
 *   - IDN domains per RFC 5892 / IDNA 2008 — e.g. `école.fr`, `münchen.de`,
 *     `università.it`.
 *   - SMTPUTF8 Unicode local parts per RFC 6531 — e.g. `françois@...`,
 *     `müller@...`, `joão@...`, `maría@...`.
 *   - Unicode TLDs — e.g. `example.中国`, `example.рф`.
 *
 * v1.1 widens the character classes to Unicode using `\p{L}` (any letter)
 * and `\p{N}` (any number) with the `u` flag. ASCII shapes remain
 * byte-equivalent because `\p{L}` is a strict superset of `a-zA-Z` and
 * `\p{N}` is a strict superset of `0-9`. Punycode (`xn--mnchen-3ya.de`)
 * matches transparently since the punycode ACE form is pure ASCII
 * letters + digits + hyphens — no decoding needed.
 *
 * Structural pieces (all bounded to remain ReDoS-safe per S5):
 *   - Local part: `[\p{L}\p{N}._%+-]{1,64}` — per RFC 5321 §4.5.3.1.1.
 *   - Domain labels: `(?:[\p{L}\p{N}-]{1,63}\.){1,5}` — per RFC 5321
 *     §4.5.3.1.2 with up to 5 subdomain labels (generous for CV text).
 *   - TLD: `[\p{L}]{2,24}` — allows both ASCII TLDs (`com`, `co.uk`) and
 *     Unicode TLDs (`中国`). Digits are deliberately excluded from the TLD
 *     to reject `foo.1` style false-positives.
 *
 * ## Boundary handling
 *
 * The legacy pattern used `\b` for the trailing boundary. `\b` is
 * ASCII-aware only — for Unicode TLDs it would match at every
 * letter-to-non-letter boundary including inside the Unicode TLD
 * character sequence, producing mis-matches. v1.1 replaces the trailing
 * `\b` with a negative lookahead `(?![\p{L}\p{N}-])` that rejects only
 * when another email-domain character follows (preserving the "end of
 * token" semantics across both ASCII and Unicode).
 *
 * The leading `(?<![a-zA-Z0-9._%+-])` lookbehind is similarly widened to
 * `(?<![\p{L}\p{N}._%+-])` so an IDN character immediately before the
 * local part does not bleed into a false match start.
 *
 * ## ReDoS safety (S5)
 *
 * All quantifiers remain bounded. No nested unbounded + or * on
 * overlapping character classes. Unicode property escapes (`\p{L}`,
 * `\p{N}`) are pure character classes from `recheck`'s perspective — they
 * do not change the polynomial class of the pattern. Verified by
 * `npm run redos:scan` (scripts/redos-scan.mjs).
 *
 * ## Idempotency
 *
 * The `[email]` replacement token contains no `@` so it cannot match
 * itself. Lookbehind/lookahead boundaries remain stable on `[` / `]`
 * characters (neither is in the email character classes). Second-pass
 * `sanitizePii` is a provable no-op.
 *
 * ## Backward compat
 *
 * All v1.0.0 ASCII fixtures (jane.doe@example.com, foo.bar+cv2026@mail.example.co.uk,
 * alice@uni.edu, bob.smith@acme.io, twitter-style @handle non-match) redact
 * byte-equivalent under the new pattern. Regression guard test cases live
 * in `src/__tests__/idn-email.test.ts`.
 */
export function emailPattern(): RegExp {
  return /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]{1,64}@(?:[\p{L}\p{N}-]{1,63}\.){1,5}[\p{L}]{2,24}(?![\p{L}\p{N}-])/gu;
}

/**
 * US / UK-style street address: number-first, optional multi-word name,
 * closed set of street-type terminators, optional direction suffix.
 *
 * This is the English-locale pattern preserved byte-equivalent from v1.0.0.
 * v1.1 aliases it as `addressByLocale.en`. It remains the canonical EN
 * match — all v1.0.0 fixtures (Baker Street, Pennsylvania Avenue, 10
 * Apollo Court NW, 10 Downing Street, 42 McLane Drive, 10 LA Cienega
 * Boulevard) stay green.
 *
 * ReDoS hardening: single bounded quantifier over
 * `[A-Z][a-zA-Z]{0,15}` units separated by single space — linear-time on
 * adversarial input.
 *
 * Fixtures covered: `42 Baker Street`, `1600 Pennsylvania Avenue`,
 * `10 Apollo Court NW`, `221 Baker St`, `10 Downing Street`,
 * `42 McLane Drive`, `10 LA Cienega Boulevard`. Apostrophes (O'Brien) and
 * non-English postal formats remain future work.
 */
export function addressPattern(): RegExp {
  return /\b\d{1,6}(?: [A-Z][a-zA-Z]{0,15}){1,5} (?:Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Terrace|Ter|Highway|Hwy|Parkway|Pkwy)(?: (?:NW|NE|SW|SE|N|S|E|W))?\b/g;
}

/**
 * French street address — number-first, lowercase or capitalised street-type
 * keyword, optional `bis`/`ter`/`quater` modifier, 1-6 follow-on name tokens.
 *
 * Forms covered:
 *   - `12 rue de la Paix`
 *   - `5 Boulevard Saint-Germain`
 *   - `3 avenue des Champs-Élysées`
 *   - `7 bis rue Lafayette`
 *   - `14 place de la République`
 *
 * ReDoS-safe: single bounded `{1,6}` quantifier over disjoint-boundary
 * name tokens, each `[A-Za-zÀ-ÿ'][\w'-]{0,20}`. No nested quantifiers.
 * Street-type list is a closed alternation of common FR terms.
 */
export function addressFrPattern(): RegExp {
  // After the street-type keyword, each name token is either a
  // capitalised word (plain or hyphenated like `Champs-Élysées`,
  // `Saint-Germain`) OR a short lowercase connector (`de`, `des`, `du`,
  // `la`, `le`, `les`, `aux`, `et`, `en`, `à`). Restricting to these two
  // shapes prevents the `{1,6}` quantifier from greedily absorbing
  // adjacent free-text words (`depuis`, `ouvert`, `demain`, ...).
  // ReDoS-safe: bounded quantifier, disjoint-boundary tokens.
  return /\b\d{1,4}(?:\s+(?:bis|ter|quater))?\s+(?:rue|Rue|RUE|boulevard|Boulevard|BOULEVARD|bd\.|Bd\.|avenue|Avenue|AVENUE|av\.|Av\.|place|Place|PLACE|all[ée]e|All[ée]e|chemin|Chemin|impasse|Impasse|quai|Quai|route|Route|cours|Cours|square|Square)(?:\s+(?:[A-Z\u00C0-\u00DD][A-Za-z\u00C0-\u00FF'-]{0,20}|de|des|du|la|le|les|l'|d'|aux|et|en|[aà])){1,6}\b/g;
}

/**
 * German street address — number-after form with closed-set compound suffix.
 *
 * Forms covered:
 *   - `Hauptstraße 23`        (-straße suffix)
 *   - `Goethestrasse 45`      (-strasse, Swiss spelling)
 *   - `Müllerstr. 12`         (-str. abbreviation)
 *   - `Alexanderplatz 5`      (-platz)
 *   - `Lindenallee 8`         (-allee)
 *
 * ReDoS-safe: single bounded quantifier on the name prefix
 * `[A-ZÄÖÜ][a-zäöüß]{1,30}`, followed by a closed alternation of
 * compound suffixes. No nested quantifiers.
 *
 * Note: multi-word prefix forms (e.g. "Unter den Linden 5") are not
 * covered in v1.1; they are a documented residual gap (low frequency in
 * CV text). Compound-suffix form is the dominant modern-German pattern.
 */
export function addressDePattern(): RegExp {
  return /\b[A-Z\u00C4\u00D6\u00DC][a-z\u00E4\u00F6\u00FC\u00DF]{1,30}(?:stra(?:\u00DFe|sse)|str\.|platz|weg|allee|gasse|ring|damm)\s+\d{1,4}[a-z]?\b/g;
}

/**
 * Italian street address — prefix-keyword form with 1-5 name tokens, then
 * house number.
 *
 * Forms covered:
 *   - `Via Roma 15`
 *   - `Piazza del Duomo 7`
 *   - `Corso Vittorio Emanuele 12`
 *   - `Viale della Libertà 23`
 *
 * ReDoS-safe: single bounded `{1,5}` quantifier over name tokens
 * `[A-Za-zÀ-ÿ'][\w'-]{0,20}`, closed-set prefix alternation.
 */
export function addressItPattern(): RegExp {
  return /\b(?:Via|Viale|Corso|Piazza|Piazzale|Largo|Vicolo|Strada|Borgo|Contrada|Localit[aà])(?:\s+[A-Za-z\u00C0-\u00FF'][\w\u00C0-\u00FF'-]{0,20}){1,5}\s+\d{1,4}\b/g;
}

/**
 * Spanish street address — prefix-keyword form with 1-5 name tokens, then
 * house number.
 *
 * Forms covered:
 *   - `Calle Mayor 10`
 *   - `Avenida de la Constitución 5`
 *   - `Plaza España 3`
 *   - `Paseo de la Castellana 45`
 *   - `Av. Diagonal 220`        (Av. abbreviation)
 *
 * ReDoS-safe: bounded `{1,5}` quantifier over name tokens, closed-set
 * prefix alternation including common abbreviations (Av., Avda., C/, Pza.).
 */
export function addressEsPattern(): RegExp {
  return /\b(?:Calle|CALLE|C\/|Avenida|AVENIDA|Av\.|Avda\.|Plaza|PLAZA|Pza\.|Paseo|P\u00BA\.|Ronda|Travesia|Traves[ií]a|Camino|Carrer|Glorieta)(?:\s+[A-Za-z\u00C0-\u00FF'][\w\u00C0-\u00FF'-]{0,20}){1,5}\s+\d{1,4}\b/g;
}

/**
 * Portuguese street address — prefix-keyword form with 1-5 name tokens,
 * then house number.
 *
 * Forms covered:
 *   - `Rua das Flores 45`
 *   - `Avenida da Liberdade 110`
 *   - `Praça do Comércio 5`
 *   - `Largo do Carmo 12`
 *
 * ReDoS-safe: bounded `{1,5}` quantifier over name tokens, closed-set
 * prefix alternation (Rua, R., Avenida, Av., Praça, Largo, Travessa,
 * Alameda, Beco, Estrada, Calçada).
 */
export function addressPtPattern(): RegExp {
  return /\b(?:Rua|R\.|Avenida|AVENIDA|Av\.|Pra\u00E7a|Largo|Travessa|Alameda|Beco|Estrada|Cal\u00E7ada)(?:\s+[A-Za-z\u00C0-\u00FF'][\w\u00C0-\u00FF'-]{0,20}){1,5}\s+\d{1,4}\b/g;
}

/**
 * UK postcode — alphanumeric outward + inward code separated by space.
 *
 * Forms covered:
 *   - `SW1A 2AA`, `EC1A 1BB`, `M1 1AE`, `W1A 0AX`, `B33 8TH`, `L1 8JQ`
 *
 * Pattern: 1-2 letters + 1 digit + optional digit-or-letter (outward),
 * then mandatory space, then digit + 2 letters (inward). Case-sensitive
 * uppercase per Royal Mail convention; lowercase postcodes in free text
 * are out-of-scope for v1.1 (documented residual gap).
 *
 * ## Locale specificity (#23 MIN-2)
 *
 * `postcodeUkPattern` is the only genuinely locale-specific bare-postcode
 * factory in `postcodeByLocale`. The UK alphanumeric outward/inward shape
 * (`[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}`) has no structural collision with any
 * other supported locale — calling `postcodeUkPattern()` on a French
 * `75001 Paris` string returns zero matches. The UK factory is therefore
 * safe to use in isolation if a consumer wants UK-only postcode coverage.
 * Contrast with the FR/DE/IT/ES factories below, which share a
 * byte-identical core regex and differ only in accented-character
 * character-class widening — see their JSDoc for the overlap-by-design
 * trade-off.
 *
 * ReDoS-safe: no quantifier ambiguity, all bounded and disjoint.
 */
export function postcodeUkPattern(): RegExp {
  return /\b[A-Z]{1,2}\d[A-Z\d]?\s+\d[A-Z]{2}\b/g;
}

/**
 * French postcode — 5 digits followed by a capitalised city token.
 *
 * Forms covered:
 *   - `75001 Paris`, `69002 Lyon`, `13001 Marseille`
 *
 * Requires a capitalised city-like word to follow (`[A-ZÀ-ÿ][a-zà-ÿ'-]{2,}`)
 * so bare numeric 5-digit sequences (order numbers, SKUs, years expressed
 * as 5 digits) do not false-positive. This is a deliberate precision/recall
 * trade: bare `\d{5}` alone is too broad; postcode + city is the actual
 * re-identification surface flagged by compliance review §5.2.
 *
 * ## Continental overlap by design (#23 MIN-2)
 *
 * `postcodeFrPattern`, `postcodeDePattern`, `postcodeItPattern`, and
 * `postcodeEsPattern` are byte-identical structurally — all four are
 * `\b\d{5}\s+<capitalised-city-token>\b`. They differ only in the
 * Unicode character class used for the leading city letter (FR/IT/ES
 * use `[A-Z\u00C0-\u00DC]`; DE narrows to `[A-Z\u00C4\u00D6\u00DC]` for
 * Ä/Ö/Ü only).
 *
 * Consequence: a French-only consumer calling `postcodeFrPattern()` on
 * Italian text `"CAP 00100 Roma"` will match it. The locale key is
 * primarily an organisational / API-surface distinction, not a precision
 * gate. Consumers who need strict locale-scoped redaction must rely on
 * surrounding context (e.g. locale-tagged input routing) — this pattern
 * alone cannot disambiguate 5-digit continental postcodes.
 *
 * This is an intentional v1.1 trade-off: tightening each continental
 * locale against known city-name whitelists would introduce a large
 * maintenance surface (every French / German / Italian / Spanish city)
 * for marginal precision gain over a redaction library whose contract is
 * already "conservative one-way redaction".
 *
 * ReDoS-safe: bounded segments, no nested quantifiers.
 */
export function postcodeFrPattern(): RegExp {
  return /\b\d{5}\s+[A-Z\u00C0-\u00DC][a-z\u00E0-\u00FF'-]{2,30}\b/g;
}

/**
 * German postcode — 5 digits followed by a capitalised city token.
 *
 * Same rationale + shape as French. Covers Berlin (10xxx), München (8xxxx),
 * Hamburg (2xxxx) etc. Leading-letter character class narrowed to the
 * German-specific umlaut set (`Ä/Ö/Ü`) — structurally still a 5-digit
 * continental postcode.
 *
 * ## Continental overlap by design (#23 MIN-2)
 *
 * See `postcodeFrPattern` JSDoc above for the full overlap rationale.
 * Summary: FR/DE/IT/ES postcode factories share the `\b\d{5}\s+<city>\b`
 * core and differ only in the leading city-letter character class. A
 * German-only consumer calling `postcodeDePattern()` will still match
 * `75001 Paris` (FR) and `28013 Madrid` (ES) — the city-letter narrowing
 * does not gate out other continental locales' ASCII capital letters.
 * Locale key is organisational, not a precision filter.
 */
export function postcodeDePattern(): RegExp {
  return /\b\d{5}\s+[A-Z\u00C4\u00D6\u00DC][a-z\u00E4\u00F6\u00FC\u00DF'-]{2,30}\b/g;
}

/**
 * Italian postcode — 5 digits (CAP) followed by a capitalised city token.
 *
 * Same shape as FR/DE postcodes. Covers 00100-98168 mainland + Sicily +
 * Sardinia.
 *
 * ## Continental overlap by design (#23 MIN-2)
 *
 * See `postcodeFrPattern` JSDoc above for the full rationale. Italian
 * CAP shares the `\b\d{5}\s+<city>\b` core with FR/DE/ES — precision is
 * locale-agnostic at the regex level.
 */
export function postcodeItPattern(): RegExp {
  return /\b\d{5}\s+[A-Z\u00C0-\u00DC][a-z\u00E0-\u00FF'-]{2,30}\b/g;
}

/**
 * Spanish postcode — 5 digits followed by a capitalised city token.
 *
 * Same shape as FR/DE/IT. Covers 01xxx-52xxx mainland + Canarias.
 *
 * ## Continental overlap by design (#23 MIN-2)
 *
 * See `postcodeFrPattern` JSDoc above for the full rationale. Spanish
 * CP shares the `\b\d{5}\s+<city>\b` core with FR/DE/IT — precision is
 * locale-agnostic at the regex level.
 */
export function postcodeEsPattern(): RegExp {
  return /\b\d{5}\s+[A-Z\u00C0-\u00DC][a-z\u00E0-\u00FF'-]{2,30}\b/g;
}

/**
 * Portuguese postcode — distinctive 4-digit + dash + 3-digit format, with
 * optional following city token.
 *
 * Forms covered:
 *   - `1200-195 Lisboa`, `4050-123 Porto`, `1200-195` (bare)
 *
 * The 4-3 shape is distinctive enough that city context is NOT required —
 * there are few natural language contexts where `NNNN-NNN` digit patterns
 * occur incidentally.
 *
 * ## Locale specificity (#23 MIN-2)
 *
 * Along with `postcodeUkPattern`, `postcodePtPattern` is genuinely
 * locale-specific — the NNNN-NNN hyphenated shape is unique to Portugal
 * among supported locales. Unlike FR/DE/IT/ES (which share a 5-digit
 * continental core), calling `postcodePtPattern()` on French or German
 * text will NOT match their 5-digit postcodes. Safe to use in isolation
 * for PT-only redaction.
 *
 * ReDoS-safe: bounded segments, optional suffix is also bounded.
 */
export function postcodePtPattern(): RegExp {
  return /\b\d{4}-\d{3}(?:\s+[A-Z\u00C0-\u00DC][a-z\u00E0-\u00FF'-]{2,30})?\b/g;
}

/**
 * International phone: `+?CC-area-3-3-4` NANP-shape.
 *
 * NANP-shaped. v1.0.0's sole international-phone primitive; retained in
 * v1.1 as the backward-compatible fallback after locale-aware EU phone
 * validation. See `phoneByLocale` below + `sanitizePii` order-of-application
 * for the v1.1 pipeline.
 */
export function phoneInternationalPattern(): RegExp {
  return /\+?\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
}

/**
 * Domestic phone (NANP-shape fallback).
 */
export function phoneDomesticPattern(): RegExp {
  return /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
}

// Re-exported from libphonenumber-js/min: the `min` metadata bundle is
// sufficient for our use case (validation with an explicit `defaultCountry`
// per locale, not country-autodetection). The `min` bundle is ~80KB
// gzipped vs ~145KB for the full metadata — reduces bundle-size impact for
// a server-side middleware package.
//
// We import `isValidPhoneNumber` for the per-locale validator factories +
// `findNumbers` for the locale-aware extraction-and-validation pass in
// sanitizePii.
import { isValidPhoneNumber } from 'libphonenumber-js/min';
import type { CountryCode } from 'libphonenumber-js/min';

/**
 * Factory for a per-locale phone-number validator (v1.1 — R2 resolution).
 *
 * Each locale factory, when called, returns a fresh validator function
 * `(candidate: string) => boolean`. The returned function delegates to
 * `libphonenumber-js`'s `isValidPhoneNumber(candidate, <country>)`.
 *
 * ## Factory API choice: validator over RegExp
 *
 * v1.0.0 `phoneInternationalPattern()` / `phoneDomesticPattern()` return
 * RegExp factories — consistent with email/address/postcode/dob patterns.
 * For R2 we could have wrapped libphonenumber-js behind a RegExp-returning
 * factory (e.g. a permissive candidate extractor + inline validation), but
 * the library's value-add is validation, not extraction. Returning a
 * validator function:
 *
 *   - makes the locale validation the primary API surface;
 *   - is easier to compose in `sanitizePii`'s extract-then-validate pass;
 *   - is structurally distinct from the NANP-shape RegExp fallbacks, which
 *     we preserve under their v1.0.0 names for backward-compat;
 *   - sidesteps the ReDoS concern entirely — no hand-rolled regex per
 *     locale means `scripts/redos-scan.mjs` has nothing new to scan for
 *     EU phones. Only the NANP-shape fallbacks remain in the regex
 *     surface and those are unchanged from v1.0.0.
 *
 * ## Freshness invariant
 *
 * Each factory call returns a fresh closure — not a singleton reference.
 * Externally-visible behaviour is stateless validation, but the fresh
 * closure keeps the factory contract byte-identical to address/postcode
 * factories (IMP-1 consistent).
 *
 * ## Country codes
 *
 * libphonenumber-js's `CountryCode` is an ISO 3166-1 alpha-2 code. Note
 * that the UK key uses `'uk'` at the `phoneByLocale` surface (mirroring
 * `postcodeByLocale.uk`) but passes `'GB'` to libphonenumber-js, which is
 * the canonical country code per ISO 3166-1 alpha-2.
 */
function makePhoneValidator(
  country: CountryCode,
): (candidate: string) => boolean {
  return (candidate: string): boolean => {
    if (typeof candidate !== 'string' || candidate.length === 0) return false;
    try {
      return isValidPhoneNumber(candidate, country);
    } catch {
      return false;
    }
  };
}

/** French phone validator factory. */
export function phoneFrValidator(): (candidate: string) => boolean {
  return makePhoneValidator('FR');
}

/** German phone validator factory. */
export function phoneDeValidator(): (candidate: string) => boolean {
  return makePhoneValidator('DE');
}

/** UK phone validator factory (ISO country code GB). */
export function phoneUkValidator(): (candidate: string) => boolean {
  return makePhoneValidator('GB');
}

/** Italian phone validator factory. */
export function phoneItValidator(): (candidate: string) => boolean {
  return makePhoneValidator('IT');
}

/** Spanish phone validator factory. */
export function phoneEsValidator(): (candidate: string) => boolean {
  return makePhoneValidator('ES');
}

/** Portuguese phone validator factory. */
export function phonePtValidator(): (candidate: string) => boolean {
  return makePhoneValidator('PT');
}

/**
 * Per-locale phone-validator factory dictionary (v1.1 — R2 resolution).
 *
 * Mirrors the shape of `addressByLocale` + `postcodeByLocale`. Each key is
 * a factory function returning a fresh validator function. Used by
 * `sanitizePii` when deciding whether a phone-shaped candidate is a valid
 * native-format phone number in that locale.
 *
 * Note on UK key: the outer dictionary key is `uk` (consistent with
 * `postcodeByLocale.uk`) but the libphonenumber-js country code passed
 * through is `GB` (ISO 3166-1 alpha-2 canonical form for the United
 * Kingdom).
 *
 * ## Dual API surface: validators are looser than sanitizer redaction (#23 MIN)
 *
 * `phoneByLocale.X()` returns a validator that answers a single question:
 * "would libphonenumber-js accept this string as a valid phone number in
 * locale X?". That is `isValidPhoneNumber(candidate, country)` — the same
 * contract libphonenumber-js itself exposes, with libphonenumber-js's own
 * tolerance for partially-formatted inputs.
 *
 * `sanitizePii`'s redaction pipeline is **strictly tighter**. On top of
 * the locale validator it additionally requires:
 *
 *   - `PHONE_FORMATTED_RE.test(raw)` — the raw candidate must already
 *     look phone-shaped (digits, `+`, separators) in the surrounding
 *     text so the sanitizer does not greedily redact every valid
 *     subsequence that libphonenumber-js could parse inside free-text
 *     numeric strings.
 *   - `nationalNumber.length >= MIN_PHONE_DIGITS` (7) — rejects short
 *     numeric shapes that libphonenumber-js might accept as valid
 *     short-codes / emergency numbers in some locales but which create
 *     excessive false-positive redactions in CV text.
 *
 * Consequence: `phoneByLocale.de()('123')` may return `true` for some
 * short-code inputs that `sanitizePii('...123...', {...})` would NOT
 * redact (because `PHONE_FORMATTED_RE` would reject the surrounding
 * shape, or the national-digit-count guard would reject the length).
 * This is intentional — the validators answer "is this a phone number?"
 * for programmatic composition; the sanitizer additionally applies
 * precision guards so free-text CV prompts are not over-redacted.
 *
 * Consumers who want "what would `sanitizePii` redact?" MUST call
 * `sanitizePii` directly — do NOT compose `phoneByLocale` validators to
 * approximate it; you will see looser behaviour than the actual redaction
 * pipeline. See `src/sanitize-pii.ts` for the precision-guard
 * implementation.
 */
export const phoneByLocale = {
  fr: phoneFrValidator,
  de: phoneDeValidator,
  uk: phoneUkValidator,
  it: phoneItValidator,
  es: phoneEsValidator,
  pt: phonePtValidator,
} as const;

// -----------------------------------------------------------------------
// National-level identifiers (v1.1 — R10 resolution)
// -----------------------------------------------------------------------
//
// COMPLIANCE: matched substrings MUST NOT be logged. Match counts permitted.
// Implementation lives in `src/patterns-national-id.ts` (split out per
// tech-expert finding T5 — file-organisation guidance). Re-exported here
// to preserve the v1.0.0/v1.1 `patterns.ts` barrel as the single import
// surface for consumers.

export {
  // Check-digit / check-letter / check-key pure helpers
  computeEsDniCheckLetter,
  computePtNifCheckDigit,
  computeFrNirCheckKey,
  computeItCodiceFiscaleCheckLetter,
  // Validator factories (one per locale)
  nationalIdUkValidator,
  nationalIdFrValidator,
  nationalIdItValidator,
  nationalIdEsValidator,
  nationalIdPtValidator,
  // Per-locale dictionary
  nationalIdByLocale,
  // Extraction regex factories used by `sanitizePii` pipeline + redos:scan
  nationalIdUkExtractionPattern,
  nationalIdFrExtractionPattern,
  nationalIdItExtractionPattern,
  nationalIdEsExtractionPattern,
  nationalIdPtExtractionPattern,
} from './patterns-national-id.js';
export type { NationalIdLocale } from './patterns-national-id.js';

import { nationalIdByLocale } from './patterns-national-id.js';

/**
 * Date of birth (C1 mandatory, new in v1.0.0).
 *
 * Covers three numeric shapes (day-first EU, ISO, hyphen EU) plus the
 * named-month shapes for the six supported locales (EN/FR/DE/IT/ES/PT).
 * Each alternation is ReDoS-safe (linear — no nested quantifiers on
 * overlapping character classes).
 *
 * Numeric shapes:
 *   - DD.MM.YYYY   (DE)
 *   - DD/MM/YYYY   (FR / UK)
 *   - DD-MM-YYYY   (alt EU)
 *   - YYYY-MM-DD   (ISO)
 *
 * Named-month shapes:
 *   - 12 March 1985           (EN)
 *   - March 12, 1985          (EN US-style)
 *   - 12 mars 1985            (FR)
 *   - 12. März 1985           (DE — period after day; Umlaut in month)
 *   - 12 marzo 1985           (IT)
 *   - 12 de marzo de 1985     (ES)
 *   - 12 de março de 1985     (PT — tilde in month)
 *
 * Does NOT match bare years (`1985`) or month-year only (`March 1985`) —
 * those are non-DOB contexts (employment dates, etc.).
 */
export function dobPattern(): RegExp {
  return new RegExp(
    [
      // Numeric: DD.MM.YYYY | DD/MM/YYYY | DD-MM-YYYY
      '\\b\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}\\b',
      // Numeric: YYYY-MM-DD (ISO)
      '\\b\\d{4}-\\d{1,2}-\\d{1,2}\\b',
      // Named month, day-first: "12 March 1985" (+ EU locales)
      // Day, optional period, whitespace, month name (EN/FR/DE/IT/ES/PT),
      // whitespace, optional "de " for ES/PT, year.
      '\\b\\d{1,2}\\.?\\s+(?:' +
        // EN
        'January|February|March|April|May|June|July|August|September|October|November|December|' +
        // FR
        'janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre|' +
        // DE
        'Januar|Februar|M[aä]rz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|' +
        // IT
        'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|' +
        // ES / PT share many month names — grouped
        'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|' +
        'janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro' +
        ')(?:\\s+de)?\\s+\\d{4}\\b',
      // Named month, US-style month-first: "March 12, 1985"
      '\\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},\\s+\\d{4}\\b',
      // Day + German named month preceded by "de" prefix (ES/PT pattern with ES day prefix)
      '\\b\\d{1,2}\\s+de\\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|janeiro|fevereiro|mar[çc]o|maio|junho|julho|setembro|outubro|novembro|dezembro)\\s+de\\s+\\d{4}\\b',
    ].join('|'),
    'g',
  );
}

/**
 * Per-locale address factory dictionary (v1.1 — R1 resolution).
 *
 * Each key is a factory function returning a fresh `/g` RegExp on every
 * call (IMP-1 pattern).
 */
export const addressByLocale = {
  en: addressPattern,
  fr: addressFrPattern,
  de: addressDePattern,
  it: addressItPattern,
  es: addressEsPattern,
  pt: addressPtPattern,
} as const;

/**
 * Per-locale bare-postcode factory dictionary (v1.1 — R1 resolution).
 *
 * Each key is a factory function returning a fresh `/g` RegExp on every
 * call. Postcodes redact to the new `[postcode]` token (additive — no
 * collision with v1.0.0 tokens).
 */
export const postcodeByLocale = {
  uk: postcodeUkPattern,
  fr: postcodeFrPattern,
  de: postcodeDePattern,
  it: postcodeItPattern,
  es: postcodeEsPattern,
  pt: postcodePtPattern,
} as const;

/**
 * Named export of all patterns for programmatic composition.
 *
 * Each value is a factory function — call with `()` to get a fresh `/g`
 * RegExp instance. See the file-level "Why factories" note for the
 * stateful-lastIndex rationale.
 *
 * v1.1 additions:
 *   - `addressByLocale` — per-locale address factory dictionary.
 *   - `postcodeByLocale` — per-locale bare-postcode factory dictionary.
 *   - `address` alias retained: `piiPatterns.address === piiPatterns.addressByLocale.en`
 *     (backward-compat with v1.0.0 consumers).
 */
export const piiPatterns = {
  email: emailPattern,
  address: addressPattern, // backward-compat alias for addressByLocale.en
  addressByLocale,
  postcodeByLocale,
  phoneByLocale,
  nationalIdByLocale,
  phoneInternational: phoneInternationalPattern,
  phoneDomestic: phoneDomesticPattern,
  dob: dobPattern,
} as const;

export type PiiPatternName = keyof typeof piiPatterns;
export type AddressLocale = keyof typeof addressByLocale;
export type PostcodeLocale = keyof typeof postcodeByLocale;
export type PhoneLocale = keyof typeof phoneByLocale;
// `NationalIdLocale` is re-exported from `./patterns-national-id.js` above —
// local declaration here would conflict with that re-export per TS2484.
