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
 * Order of application (see `sanitizePii`): email → address →
 * international phone → domestic phone → DOB. Documented in
 * `src/__tests__/sanitize-pii.test.ts` with inline justification.
 *
 * Known limitations (R1-R5, R10 in compliance review §7):
 *   - Non-English postal addresses pass through unredacted (FR/DE/IT/ES/PT).
 *   - EU-native mobile phone formats systematically under-match.
 *   - Applicant names flow unredacted (regex-inappropriate; v1.2 NER target).
 *   - IDN email addresses (non-ASCII local/domain) pass through.
 *   - National identifiers (NIR/NINO/Codice Fiscale/DNI/NIF) not covered.
 * Consuming apps SHOULD add caller-level scrubbing for non-English content
 * until v1.1 ships locale-aware patterns. See README § Known Limitations.
 */

/**
 * Email addresses: local@domain.tld.
 *
 * Character class `[a-zA-Z0-9.-]` in the domain rejects IDN punycode-decoded
 * hosts; RFC 6531 / SMTPUTF8 local parts also fail. Known gap R5.
 *
 * ReDoS hardening note (S5): the canonical scoring source `cv-chunker.ts:76`
 * uses unbounded `+` quantifiers with overlapping `.` on either side of `@`,
 * which `recheck` v4 flags as a 2nd-degree polynomial. v1.0.0 caps both
 * quantifiers (local part ≤ 64 per RFC 5321 §4.5.3.1.1, domain part ≤ 253
 * per RFC 5321 §4.5.3.1.2) to eliminate the unbounded backtracking. The
 * bounds are generous enough that every realistic email in the canonical
 * fixtures still matches byte-equivalent to the unbounded version.
 */
export const emailPattern =
  /(?<![a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.){1,5}[a-zA-Z]{2,24}\b/g;

/**
 * US / UK-style street address: number-first, optional multi-word name,
 * closed set of street-type terminators, optional direction suffix.
 *
 * Monolingual (English). Known gap R1.
 *
 * ReDoS hardening note (S5 per security review): the canonical scoring
 * source `cv-chunker.ts:80-83` uses `[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,4}`
 * which `recheck` v4 flags as a 2nd-degree polynomial ReDoS (adjacent
 * quantifiers on overlapping character classes). v1.0.0 rewrites the
 * street-name portion using a single bounded quantifier over
 * `[A-Z][a-zA-Z]*` units separated by single `\s` — behaviourally
 * equivalent on all canonical fixtures (`42 Baker Street`,
 * `1600 Pennsylvania Avenue`, `10 Apollo Court NW`,
 * `221 Baker St`, `10 Downing Street`) but linear-time on adversarial
 * input. Tested under `npm run redos:scan` in CI.
 */
export const addressPattern =
  /\b\d{1,6}(?: [A-Z][a-z]{1,15}){1,5} (?:Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Terrace|Ter|Highway|Hwy|Parkway|Pkwy)(?: (?:NW|NE|SW|SE|N|S|E|W))?\b/g;

/**
 * International phone: `+?CC-area-3-3-4` NANP-shape.
 *
 * NANP-shaped; native EU mobile formats under-match. Known gap R2.
 */
export const phoneInternationalPattern =
  /\+?\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

/**
 * Domestic phone (NANP-shape fallback).
 */
export const phoneDomesticPattern = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

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
export const dobPattern = new RegExp(
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

/**
 * Named export of all v1.0.0 patterns for programmatic composition.
 */
export const piiPatterns = {
  email: emailPattern,
  address: addressPattern,
  phoneInternational: phoneInternationalPattern,
  phoneDomestic: phoneDomesticPattern,
  dob: dobPattern,
} as const;

export type PiiPatternName = keyof typeof piiPatterns;
