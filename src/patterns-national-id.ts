// COMPLIANCE: matched substrings MUST NOT be logged. Match counts permitted.
// Redaction is destructive / one-way: validator + extraction-regex outputs
// are used solely to compute redaction byte ranges. Candidate strings, match
// contents, and any byproduct of the check-digit computation must never be
// written to logs, telemetry, error messages, or any other side-channel.
// (GDPR Art. 5(1)(c) data-minimisation, Art. 25 transparency contract.)

/**
 * National-level identifier patterns (v1.1 — compliance review R10).
 *
 * Split out of `src/patterns.ts` per tech-expert finding T5 (post-R10
 * `patterns.ts` exceeded ~1000 lines). Re-exported from `patterns.ts`
 * barrel — public API surface unchanged. See `src/patterns.ts` header
 * for the file-organisation rationale.
 *
 * **Destructive redaction contract:** each validator below is invoked solely
 * to decide whether a candidate substring should be replaced by the
 * `[nationalId]` / `<<REDACTED_NATIONALID>>` token. Matched bytes are not
 * retained, logged, or returned. The check-digit computation uses only the
 * candidate string passed in by the caller; intermediate sums / table
 * lookups are stack-local and discarded on return. Consumers receive only
 * the redacted output string — there is no parallel emission of "what was
 * redacted" anywhere in the public API.
 *
 * Each of UK NINO / FR NIR / IT Codice Fiscale / ES DNI / PT NIF is
 * exposed as a validator factory `() => (candidate: string) => boolean`,
 * mirroring the `phoneByLocale` surface rather than `addressByLocale`'s
 * raw-RegExp shape. Rationale:
 *
 *   1. Four of the five formats have a verifiable check digit or check
 *      letter — a validator that runs structural regex first then
 *      verifies the check digit brings the false-positive rate down
 *      dramatically (1/23 for DNI, 1/11 for NIF, 1/97 for NIR, 1/26 for
 *      Codice Fiscale) at zero bundle cost.
 *   2. The UK NINO has no check digit, but the validator surface lets us
 *      apply HMRC's invalid-prefix rules (D/F/I/Q/U/V disallowed in
 *      position 1; D/F/I/O/Q/U/V in position 2; suffix must be A/B/C/D)
 *      as a structural guard that a bare regex alone cannot express as
 *      cleanly.
 *   3. Consistency with `phoneByLocale`: both are "structured identifiers
 *      with per-locale format + validation" — the validator shape is the
 *      established idiom at this API surface.
 *
 * The underlying regexes used by each validator are constructed inline
 * inside the validator. The regexes used by `sanitizePii` to EXTRACT
 * candidate substrings from free text are exported separately
 * (`nationalId<Locale>ExtractionPattern`) so `scripts/redos-scan.mjs` can
 * include them in its scan (R7 ReDoS CI invariant: every regex over
 * user-controlled input is scanned).
 *
 * ## False-positive analysis (compliance §5.2)
 *
 * - UK NINO: structurally distinctive (2 letters + 6 digits + [A-D]);
 *   no known free-text collision in CV context.
 * - FR NIR: 15 digits with first digit ∈ {1, 2} and mandatory mod-97
 *   check key — functionally zero false positives on free text.
 * - IT Codice Fiscale: 16 chars with mandatory letter-digit positional
 *   structure plus a position-weighted check letter — unique shape, zero
 *   observed false positives.
 * - ES DNI: 8 digits + letter with mod-23 check — ~4% bare-shape rate on
 *   random 8-digit-plus-letter sequences drops to ~0.2% with check
 *   validation.
 * - PT NIF: 9 digits with mod-11 check — the bare 9-digit shape is
 *   high-frequency (order numbers, SKUs); mod-11 brings this from 1/1 to
 *   1/11. Bare 9-digit sequences that happen to pass mod-11 (like
 *   `000000000`) will redact — this is an accepted precision trade-off
 *   documented in README Known Limitations R10-residual.
 *
 * ## Pipeline order
 *
 * `sanitizePii` runs the national-ID pass AFTER postcodes and BEFORE DOB,
 * so:
 *   - postcodes consume `NNNNN City` + UK alphanumeric first (avoids
 *     national-ID patterns eating the 5-digit portion of a postcode);
 *   - DOB runs next so `23.05.1985`-shape sequences are consumed before
 *     the locale-phone pass can claim them.
 * See `src/sanitize-pii.ts` header docblock §4 for the full rationale.
 */

// --- ES DNI mod-23 check letter ---------------------------------------

/**
 * Mod-23 lookup table used by ES DNI / NIE / CIF validation.
 *
 * Published by the Spanish Agencia Tributaria. The letter at index
 * `(digits % 23)` is the canonical check letter for the 8-digit body.
 */
const ES_DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

/**
 * Compute the ES DNI check letter for an 8-digit body.
 *
 * Returns a single upper-case letter `'T'..'E'` from the mod-23 table, or
 * the empty string `''` if `body` is not exactly 8 ASCII digits. The
 * length+regex guard mirrors `computePtNifCheckDigit`'s `-1` sentinel
 * (security-expert finding S1, SD-002 review on PR #36) — a short or
 * mixed-character input must not silently produce a letter that a caller
 * could mistake for "valid". Compliance: input is not logged.
 */
export function computeEsDniCheckLetter(body: string): string {
  if (body.length !== 8 || !/^\d{8}$/.test(body)) return '';
  const n = Number.parseInt(body, 10);
  if (!Number.isFinite(n)) return '';
  return ES_DNI_LETTERS[n % 23] ?? '';
}

/**
 * ES DNI validator factory.
 *
 * Structural regex: exactly 8 ASCII digits followed by one uppercase
 * letter. Check letter verified against the mod-23 table.
 *
 * Defensive preconditions (security-expert finding S1): early-return
 * `false` on length mismatch, non-string input, or non-digit characters
 * in the digit segment. Never throws. Compliance: candidate strings,
 * match results, and check-letter outputs are not logged.
 */
export function nationalIdEsValidator(): (candidate: string) => boolean {
  const re = /^\d{8}[A-Z]$/;
  return (candidate: string): boolean => {
    if (typeof candidate !== 'string' || !re.test(candidate)) return false;
    const body = candidate.slice(0, 8);
    const letter = candidate.slice(8);
    return computeEsDniCheckLetter(body) === letter;
  };
}

// --- PT NIF mod-11 weighted check digit --------------------------------

/**
 * PT NIF mod-11 weights. Applied to digits 1..8 (left-to-right) of the
 * 9-digit NIF; weight vector `[9, 8, 7, 6, 5, 4, 3, 2]`.
 */
const PT_NIF_WEIGHTS = [9, 8, 7, 6, 5, 4, 3, 2] as const;

/**
 * Compute the PT NIF check digit for an 8-digit body.
 *
 * Weighted sum mod 11. If the remainder is 0 or 1, the canonical check
 * digit is 0; otherwise the check is `11 - remainder`. Returns `0..9`,
 * or `-1` if the body is not exactly 8 digits.
 *
 * Reference: Ministério das Finanças — Decreto-Lei n.º 463/79 (amended).
 * Compliance: input bytes are not logged.
 */
export function computePtNifCheckDigit(body: string): number {
  if (body.length !== 8 || !/^\d{8}$/.test(body)) return -1;
  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    sum += Number.parseInt(body[i]!, 10) * PT_NIF_WEIGHTS[i]!;
  }
  const rem = sum % 11;
  return rem < 2 ? 0 : 11 - rem;
}

/**
 * PT NIF validator factory.
 *
 * Structural regex: exactly 9 digits. Check digit verified against the
 * weighted mod-11 table. **CRITICAL (security-expert finding S3): the
 * check-digit gate is the precision floor for PT NIF — without it, the
 * false-positive rate on bare 9-digit numerics in CV text would be
 * unacceptable. Word-boundary `\b\d{9}\b` is enforced by the
 * extraction pattern below.**
 *
 * Defensive preconditions (security-expert finding S2): early-return
 * `false` on length mismatch, non-string input, or non-digit characters.
 * Never throws.
 *
 * Known false-positive exposure: bare 9-digit sequences whose last digit
 * happens to match the computed check digit will pass validation — the
 * mod-11 check brings the rate from 1/1 to ~1/11. Documented in README
 * Known Limitations R10-residual. Consumers who need higher precision
 * can gate on surrounding context (e.g. the literal "NIF" keyword) at
 * their call site; the library does not enforce context to preserve
 * recall on free-text CV inputs. Compliance: candidates not logged.
 */
export function nationalIdPtValidator(): (candidate: string) => boolean {
  const re = /^\d{9}$/;
  return (candidate: string): boolean => {
    if (typeof candidate !== 'string' || !re.test(candidate)) return false;
    const body = candidate.slice(0, 8);
    const check = Number.parseInt(candidate.slice(8), 10);
    return computePtNifCheckDigit(body) === check;
  };
}

// --- UK NINO regex-only structural validator --------------------------

/**
 * UK NINO invalid-prefix constraints (HMRC).
 *
 *   - Position 1: cannot be D, F, I, Q, U, V.
 *   - Position 2: cannot be D, F, I, O, Q, U, V.
 *   - Suffix: must be A, B, C, or D (Royal Assent letters; E-Z unused).
 *
 * Character classes below encode the permitted sets directly.
 * Prefixes `BG`, `GB`, `NK`, `KN`, `TN`, `NT`, `ZZ` are reserved and
 * structurally valid under this regex — accepted as redactable (the
 * threat model is leakage, not perfect issuance-compliance).
 */
const UK_NINO_PREFIX_1 = /[ABCEGHJKLMNOPRSTWXYZ]/; // excludes D/F/I/Q/U/V
const UK_NINO_PREFIX_2 = /[ABCEGHJKLMNPRSTWXYZ]/; // excludes D/F/I/O/Q/U/V
const UK_NINO_SUFFIX = /[A-D]/;

/**
 * UK NINO validator factory — regex-only, no check digit (NINOs don't
 * have one). Accepts both compact (`AB123456C`) and space-separated
 * (`AB 12 34 56 C`) canonical forms.
 *
 * Structural rules:
 *   - 2 letters (prefix), both respecting HMRC invalid-prefix rules.
 *   - 6 digits (can be broken into 2/2/2 groups with single spaces).
 *   - 1 suffix letter ∈ {A, B, C, D}.
 *
 * The validator strips optional single-space group separators before
 * running the structural regex, so both compact and space-separated
 * forms accept identically. Other whitespace (tabs, multiple spaces,
 * newlines) is rejected — we only accept canonical HMRC formatting.
 * Compliance: candidate strings are not logged.
 */
export function nationalIdUkValidator(): (candidate: string) => boolean {
  return (candidate: string): boolean => {
    if (typeof candidate !== 'string' || candidate.length === 0) return false;
    // Normalise: accept "AB 12 34 56 C" by stripping single space separators.
    // Using replace on /\s/g would also allow tabs / newlines; we stick to
    // space-only to match the canonical HMRC "AB 12 34 56 C" layout.
    const compact = candidate.replace(/ /g, '');
    if (!/^[A-Z]{2}\d{6}[A-Z]$/.test(compact)) return false;
    if (!UK_NINO_PREFIX_1.test(compact[0]!)) return false;
    if (!UK_NINO_PREFIX_2.test(compact[1]!)) return false;
    if (!UK_NINO_SUFFIX.test(compact[8]!)) return false;
    return true;
  };
}

// --- FR NIR mod-97 check key -----------------------------------------

/**
 * Compute the FR NIR 2-digit check key for a 13-digit body.
 *
 * Check key = `97 - (N mod 97)` where N is the 13-digit body interpreted
 * as an unsigned integer. Returns a zero-padded 2-digit string
 * (`'00'..'97'`).
 *
 * Note on Corsica: NIRs issued in Corsica historically used `2A` or `2B`
 * at positions 6-7 (département code), which were converted to `19` or
 * `18` respectively before the mod-97 computation. This synthesiser does
 * NOT apply the Corsica conversion — synthetic fixtures stay in
 * mainland-shape (13 digits only), and the conversion is not needed for
 * v1.1. If a consumer supplies a Corsican NIR to the validator, it will
 * fail the check-key test, and the ID will not be redacted. Documented as
 * residual gap R10-residual.
 *
 * Uses JS `BigInt` to avoid the 15-digit precision loss of `Number`.
 * Compliance: input bytes are not logged.
 */
export function computeFrNirCheckKey(body: string): string {
  if (!/^\d{13}$/.test(body)) return '';
  const n = BigInt(body);
  const rem = Number(n % 97n);
  const key = 97 - rem;
  return String(key).padStart(2, '0');
}

/**
 * FR NIR validator factory.
 *
 * Accepts both compact (15 digits) and space-separated
 * (`X XX XX XXXXX XXX XX`) canonical forms. Test fixtures use a
 * synthetic placeholder body — sex=2 / year=00 / dept=00 / commune=000 /
 * seq=001 — not a real demographic profile (SD-002 review C1 on PR #36).
 * Rules:
 *
 *   - 13-digit body + 2-digit check key = 15 digits total.
 *   - First digit (sex) must be `1` or `2`. `3..9` and `0` are rejected.
 *     Historical values (3=male born overseas, 4=female born overseas,
 *     7=male non-naturalised, 8=female non-naturalised, 9=non-yet-assigned)
 *     exist but are rare and out-of-scope for v1.1 — documented gap.
 *   - Digits 2-3 (year): always accepted (2-digit year).
 *   - Digits 4-5 (month): accepted `01..12` and `20..42, 50` per NIR spec
 *     extensions (ambiguous birth month). Here simplified to `01..12` +
 *     `20..42` — the validator does NOT gate on month range; the check
 *     key mod-97 catches most malformed NIRs.
 *   - Check key verified via `computeFrNirCheckKey`.
 *
 * Space normalisation matches UK NINO's approach (single spaces only).
 * Compliance: candidate strings are not logged.
 */
export function nationalIdFrValidator(): (candidate: string) => boolean {
  return (candidate: string): boolean => {
    if (typeof candidate !== 'string' || candidate.length === 0) return false;
    const compact = candidate.replace(/ /g, '');
    if (!/^\d{15}$/.test(compact)) return false;
    const sex = compact[0]!;
    if (sex !== '1' && sex !== '2') return false;
    const body = compact.slice(0, 13);
    const key = compact.slice(13);
    return computeFrNirCheckKey(body) === key;
  };
}

// --- IT Codice Fiscale position-weighted check letter -----------------

/**
 * Odd-position (1-indexed) lookup table for IT Codice Fiscale check
 * letter computation. Position in the 16-char Codice Fiscale:
 *
 *   1 (index 0), 3 (index 2), 5 (index 4), 7 (index 6), 9 (index 8),
 *   11 (index 10), 13 (index 12), 15 (index 14) — these use the odd
 *   table below. Letters and digits map to specific numeric values.
 *
 * Reference: Agenzia delle Entrate — D.M. 23/12/1976, Allegato 2.
 */
const IT_CF_ODD: Record<string, number> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9,
  '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21,
  K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14,
  U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

/**
 * Even-position (1-indexed) lookup table. Letters map to 0-25, digits
 * map to 0-9. This is the natural alphabetic/numeric ordering.
 */
const IT_CF_EVEN: Record<string, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
  '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9,
  K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18,
  T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};

/**
 * Compute the IT Codice Fiscale check letter for a 15-char body.
 *
 * Algorithm:
 *   - For each position 1..15 (1-indexed), look up the character in the
 *     odd or even table depending on position parity.
 *   - Sum all looked-up values.
 *   - `check = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[sum % 26]`.
 *
 * Does NOT handle omocodia (letter substitutions when birth-data hashes
 * collide) — synthetic fixtures do not trigger omocodia, and a Codice
 * Fiscale with omocodia substitutions is a rare edge case. Documented as
 * residual gap R10-residual. Compliance: body bytes are not logged.
 */
export function computeItCodiceFiscaleCheckLetter(body: string): string {
  if (body.length !== 15) return '';
  const up = body.toUpperCase();
  let sum = 0;
  for (let i = 0; i < 15; i += 1) {
    const ch = up[i]!;
    // 1-indexed position: (i + 1). Odd 1-indexed → index 0,2,4,...,14.
    const oddOneIndexed = (i + 1) % 2 === 1;
    const table = oddOneIndexed ? IT_CF_ODD : IT_CF_EVEN;
    const v = table[ch];
    if (v === undefined) return '';
    sum += v;
  }
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[sum % 26] ?? '';
}

/**
 * IT Codice Fiscale validator factory.
 *
 * Structural regex (positions are 1-indexed):
 *   - 1-6: letters (surname + name consonant/vowel triples)
 *   - 7-8: digits (birth year last 2)
 *   - 9: letter (month code A-E-H-L-M-P-R-S-T or equivalents)
 *   - 10-11: digits (day of birth + sex offset)
 *   - 12-15: alphanumeric (municipality code — starts with letter +
 *            three digits, but we allow `[A-Z0-9]{4}` for robustness)
 *   - 16: letter (check)
 *
 * Month-letter set is the valid `ABCDEHLMPRST` alphabet (January=A,
 * February=B, etc). We narrow the month position to that set.
 * Check letter verified via the position-weighted algorithm.
 * Compliance: candidate strings are not logged.
 */
export function nationalIdItValidator(): (candidate: string) => boolean {
  const re = /^[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z0-9]{4}[A-Z]$/;
  return (candidate: string): boolean => {
    if (typeof candidate !== 'string') return false;
    const up = candidate.toUpperCase();
    if (!re.test(up)) return false;
    const body = up.slice(0, 15);
    const check = up.slice(15);
    return computeItCodiceFiscaleCheckLetter(body) === check;
  };
}

/**
 * Per-locale national-ID validator-factory dictionary (v1.1 — R10).
 *
 * Mirrors the shape of `phoneByLocale`. Each key is a factory function
 * returning a fresh `(candidate: string) => boolean` validator. Used by
 * `sanitizePii` when deciding whether a candidate substring is a valid
 * national-level identifier in that locale.
 *
 * DE (Steuer-ID / Rentenversicherungsnummer) intentionally deferred per
 * issue #8 scope.
 */
export const nationalIdByLocale = {
  uk: nationalIdUkValidator,
  fr: nationalIdFrValidator,
  it: nationalIdItValidator,
  es: nationalIdEsValidator,
  pt: nationalIdPtValidator,
} as const;

export type NationalIdLocale = keyof typeof nationalIdByLocale;

/**
 * Extraction regexes for the national-ID pipeline pass.
 *
 * The validators above are programmatic-composition entry points —
 * consumer code passes a candidate string in and gets a boolean out.
 * For the in-package `sanitizePii` pipeline we also need to EXTRACT
 * candidate substrings from free-text input; these extraction patterns
 * are bounded regexes listed here so `scripts/redos-scan.mjs` can
 * enumerate them alongside the other 16 factory regexes (R7 ReDoS CI
 * invariant: every regex over user-controlled input is scanned).
 *
 * Each pattern is intentionally loose at the shape level (e.g. NINO
 * allows any 2 letters at the prefix; DNI allows any 8-digits + any
 * letter). The validator's semantic checks (invalid prefixes, mod-23
 * check) tighten precision. This matches the phoneByLocale pattern:
 * `findPhoneNumbersInText` extracts broadly, `isValidPhoneNumber`
 * decides.
 */
export function nationalIdUkExtractionPattern(): RegExp {
  // AB123456C or AB 12 34 56 C. Bounded: exactly 9 chars (compact) or 13
  // chars (spaced). All alternations bounded; no nested quantifiers.
  return /\b[A-Z]{2}(?:\s?\d{2}\s?\d{2}\s?\d{2}|\d{6})\s?[A-Z]\b/g;
}

export function nationalIdFrExtractionPattern(): RegExp {
  // 15 digits compact, OR canonical formatted: 1 85 07 75056 001 14.
  // Bounded segments; no nested quantifiers.
  return /\b[12](?:\s?\d{2}\s?\d{2}\s?\d{5}\s?\d{3}\s?\d{2}|\d{14})\b/g;
}

export function nationalIdItExtractionPattern(): RegExp {
  // 16 alphanumeric chars with fixed positional structure.
  return /\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z0-9]{4}[A-Z]\b/g;
}

export function nationalIdEsExtractionPattern(): RegExp {
  // 8 digits + 1 uppercase letter. Word-boundary anchored.
  return /\b\d{8}[A-Z]\b/g;
}

export function nationalIdPtExtractionPattern(): RegExp {
  // 9 bare digits. Word-boundary anchored per security-expert finding S3 —
  // mandatory mitigation against false-positives on adjacent digit runs.
  return /\b\d{9}\b/g;
}
