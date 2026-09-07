import { describe, it, expect } from 'vitest';

import { sanitizePii } from '../sanitize-pii.js';
import {
  piiPatterns,
  nationalIdByLocale,
  nationalIdUkValidator,
  nationalIdFrValidator,
  nationalIdItValidator,
  nationalIdEsValidator,
  nationalIdPtValidator,
  computeEsDniCheckLetter,
  computePtNifCheckDigit,
  computeFrNirCheckKey,
  computeItCodiceFiscaleCheckLetter,
} from '../patterns.js';
import { TOKEN_FORMATS } from '../token-format.js';

/**
 * Test suite for R10 (national-level identifier patterns) — v1.1 additive.
 *
 * Closes compliance review R10 (residual risk, low severity). v1.0.0 had
 * zero coverage of national identifiers; v1.1 adds locale-aware validator
 * factories for UK NINO, FR NIR, IT Codice Fiscale, ES DNI, and PT NIF.
 * Germany (Steuer-ID / Rentenversicherungsnummer) is deferred per issue
 * scope.
 *
 * ## Synthetic fixtures
 *
 * Real national IDs are PII themselves, so every fixture below is
 * synthesised from the check-digit algorithms exported alongside the
 * validators. The synthesis path:
 *
 *   1. Pick a bare 8-digit body (DNI) / 8-digit body (NIF) / 13-digit
 *      body (NIR) / 15-char body (Codice Fiscale).
 *   2. Compute the check digit / letter via the production algorithm.
 *   3. Concatenate into the fixture string.
 *
 * This keeps tests honest: if the algorithm is wrong, the fixture's check
 * digit is wrong, and BOTH production code and test collapse together —
 * which the adversarial "wrong check digit" negative tests catch by
 * asserting specific rejection of hand-crafted invalid inputs.
 */

// -----------------------------------------------------------------------
// Factory API — dictionary shape + validator contract
// -----------------------------------------------------------------------

describe('piiPatterns.nationalIdByLocale — dictionary shape + validator contract', () => {
  it('exposes uk/fr/it/es/pt factory functions', () => {
    expect(typeof piiPatterns.nationalIdByLocale.uk).toBe('function');
    expect(typeof piiPatterns.nationalIdByLocale.fr).toBe('function');
    expect(typeof piiPatterns.nationalIdByLocale.it).toBe('function');
    expect(typeof piiPatterns.nationalIdByLocale.es).toBe('function');
    expect(typeof piiPatterns.nationalIdByLocale.pt).toBe('function');
  });

  it('each locale factory returns a fresh validator function on every call', () => {
    for (const locale of ['uk', 'fr', 'it', 'es', 'pt'] as const) {
      const a = piiPatterns.nationalIdByLocale[locale]();
      const b = piiPatterns.nationalIdByLocale[locale]();
      expect(typeof a).toBe('function');
      expect(typeof b).toBe('function');
      expect(a).not.toBe(b);
      // Validator is a (candidate: string) => boolean contract.
      expect(a('obviously-not-a-national-id')).toBe(false);
      expect(b('obviously-not-a-national-id')).toBe(false);
    }
  });

  it('re-exports validators from the flat patterns.ts surface', () => {
    expect(typeof nationalIdByLocale.uk).toBe('function');
    expect(typeof nationalIdUkValidator).toBe('function');
    expect(typeof nationalIdFrValidator).toBe('function');
    expect(typeof nationalIdItValidator).toBe('function');
    expect(typeof nationalIdEsValidator).toBe('function');
    expect(typeof nationalIdPtValidator).toBe('function');
  });
});

// -----------------------------------------------------------------------
// UK NINO — regex-only (no check digit), structural suffix constraint
// -----------------------------------------------------------------------

describe('UK NINO — regex-only structural validation', () => {
  const isValidUk = nationalIdUkValidator();

  it('accepts canonical forms (letters + 6 digits + suffix letter)', () => {
    expect(isValidUk('AB123456C')).toBe(true);
    expect(isValidUk('JY123456A')).toBe(true);
    expect(isValidUk('PP987654D')).toBe(true);
  });

  it('accepts space-separated form (AB 12 34 56 C)', () => {
    expect(isValidUk('AB 12 34 56 C')).toBe(true);
    expect(isValidUk('JY 12 34 56 A')).toBe(true);
  });

  it('rejects invalid suffix letter (must be A/B/C/D)', () => {
    // E is outside the permitted suffix set per HMRC NINO rules.
    expect(isValidUk('AB123456E')).toBe(false);
    expect(isValidUk('AB123456Z')).toBe(false);
  });

  it('rejects wrong digit count', () => {
    expect(isValidUk('AB12345C')).toBe(false); // 5 digits
    expect(isValidUk('AB1234567C')).toBe(false); // 7 digits
  });

  it('rejects wrong prefix shape', () => {
    expect(isValidUk('1B123456C')).toBe(false); // leading digit
    expect(isValidUk('ABC123456C')).toBe(false); // 3-letter prefix
  });

  it('rejects forbidden NINO prefix letters (D/F/I/Q/U/V in either position, O in 2nd)', () => {
    // HMRC disallows certain prefix letters.
    expect(isValidUk('DA123456C')).toBe(false);
    expect(isValidUk('QQ123456C')).toBe(false);
    expect(isValidUk('AO123456C')).toBe(false);
  });

  it('rejects noise', () => {
    expect(isValidUk('hello world')).toBe(false);
    expect(isValidUk('')).toBe(false);
    expect(isValidUk('12345678')).toBe(false);
  });
});

// -----------------------------------------------------------------------
// ES DNI — mod-23 check letter
// -----------------------------------------------------------------------

describe('ES DNI — mod-23 check letter validation', () => {
  const isValidEs = nationalIdEsValidator();

  it('computes check letter per mod-23 lookup table', () => {
    // TRWAGMYFPDXBNJZSQVHLCKE indexed by (digits % 23).
    // 12345678 % 23 = 14 → index 14 → 'Z' (T R W A G M Y F P D X B N J Z)
    expect(computeEsDniCheckLetter('12345678')).toBe('Z');
    // 00000000 % 23 = 0 → 'T'
    expect(computeEsDniCheckLetter('00000000')).toBe('T');
    // 00000001 % 23 = 1 → 'R'
    expect(computeEsDniCheckLetter('00000001')).toBe('R');
  });

  it('computeEsDniCheckLetter rejects non-8-digit body with empty string (security-expert finding S1)', () => {
    // The exported helper is callable directly by consumers, not just via
    // the validator wrapper. Per S1 it must guard length + non-digit input
    // so a short or mixed input does not silently produce a letter (which
    // a caller might mistake for "valid"). Symmetric with
    // computePtNifCheckDigit's `-1` sentinel guard.
    expect(computeEsDniCheckLetter('123')).toBe(''); // too short
    expect(computeEsDniCheckLetter('1234567A')).toBe(''); // letter in body
    expect(computeEsDniCheckLetter('123456789')).toBe(''); // too long
    expect(computeEsDniCheckLetter('')).toBe(''); // empty
    expect(computeEsDniCheckLetter('1234 678')).toBe(''); // space embedded
  });

  it('accepts synthetic DNI with CORRECT check letter', () => {
    const body = '12345678';
    const check = computeEsDniCheckLetter(body);
    expect(isValidEs(`${body}${check}`)).toBe(true);
  });

  it('rejects DNI with WRONG check letter', () => {
    // 12345678 should be Z, not A.
    expect(isValidEs('12345678A')).toBe(false);
    expect(isValidEs('12345678B')).toBe(false);
  });

  it('rejects wrong shape (not 8 digits + letter)', () => {
    expect(isValidEs('1234567Z')).toBe(false); // 7 digits
    expect(isValidEs('123456789Z')).toBe(false); // 9 digits
    expect(isValidEs('12345678')).toBe(false); // no letter
    expect(isValidEs('ABCDEFGHZ')).toBe(false); // not digits
  });

  it('rejects noise', () => {
    expect(isValidEs('')).toBe(false);
    expect(isValidEs('hola')).toBe(false);
  });
});

describe('check helpers — sentinel on a wrong-shape body', () => {
  it('every check helper returns its sentinel on a body of the wrong shape', () => {
    expect(computePtNifCheckDigit('1234567')).toBe(-1);
    expect(computePtNifCheckDigit('1234567A')).toBe(-1);
    expect(computeFrNirCheckKey('200000000000')).toBe('');
    expect(computeFrNirCheckKey('2000000000001A')).toBe('');
    expect(computeItCodiceFiscaleCheckLetter('RSSMRA85T10A56')).toBe('');
    expect(computeItCodiceFiscaleCheckLetter('RSSMRA85T10A56-')).toBe('');
  });
});

// -----------------------------------------------------------------------
// PT NIF — mod-11 weighted check digit
// -----------------------------------------------------------------------

describe('PT NIF — mod-11 weighted check digit validation', () => {
  const isValidPt = nationalIdPtValidator();

  it('computes check digit per weighted mod-11', () => {
    // Weights [9,8,7,6,5,4,3,2] over first 8 digits.
    // For '12345678': 1*9+2*8+3*7+4*6+5*5+6*4+7*3+8*2 =
    //   9+16+21+24+25+24+21+16 = 156. 156 % 11 = 2. check = 11-2 = 9.
    expect(computePtNifCheckDigit('12345678')).toBe(9);
    // For '00000000': sum=0, 0%11=0 → check=0
    expect(computePtNifCheckDigit('00000000')).toBe(0);
  });

  it('accepts synthetic NIF with CORRECT check digit', () => {
    const body = '12345678';
    const check = computePtNifCheckDigit(body);
    expect(isValidPt(`${body}${check}`)).toBe(true);
  });

  it('rejects NIF with WRONG check digit', () => {
    // 12345678 should have check 9, not 0.
    expect(isValidPt('123456780')).toBe(false);
    // Order-number shape that happens to be 9 digits but invalid check.
    // '123456789' → body '12345678' wants check 9 → TRUE positive risk.
    // That is the highest false-positive we have to accept: 1/11 of random
    // 9-digit sequences will pass mod-11. The `tokenFormat` layer + the
    // pipeline-order guard limit the blast radius.
  });

  it('rejects wrong shape (not 9 digits)', () => {
    expect(isValidPt('12345678')).toBe(false); // 8 digits
    expect(isValidPt('1234567890')).toBe(false); // 10 digits
    expect(isValidPt('ABC123456')).toBe(false); // letters
  });

  it('known false-positive exposure: any random 9-digit run with a valid check digit will pass', () => {
    // Documented acceptance (AC note): 9-digit PT NIF has a 1/11 random
    // false-positive rate. The mod-11 check brings this down from 1/1
    // (bare 9 digits) but cannot eliminate it.
    const body = '00000000';
    const check = computePtNifCheckDigit(body);
    // '000000000' is structurally a valid NIF under our validator — that
    // is by design (we cannot disambiguate without context). sanitizePii
    // pipeline ordering + adversarial tests below confirm this does not
    // regress higher-precision patterns (email, phone, addresses).
    expect(isValidPt(`${body}${check}`)).toBe(true);
  });
});

// -----------------------------------------------------------------------
// FR NIR — mod-97 check key (13 + 2)
// -----------------------------------------------------------------------

describe('FR NIR — mod-97 check key validation', () => {
  const isValidFr = nationalIdFrValidator();

  it('computes 2-digit check key per mod-97', () => {
    // Check key = 97 - (13-digit-number mod 97).
    // Synthetic placeholder body — sex=2 / year=00 / month=00 / dept=00 /
    // commune=000 / seq=001. Not a real demographic profile (dept=00 is
    // unassigned in the official INSEE département list; month=00 is
    // outside the spec range, but the validator does not gate on month —
    // mod-97 alone catches malformed NIRs). SD-002 review C1 on PR #36.
    const key = computeFrNirCheckKey('2000000000001');
    expect(typeof key).toBe('string');
    expect(key).toMatch(/^\d{2}$/);
  });

  it('accepts synthetic NIR with CORRECT check key (compact form)', () => {
    const body = '2000000000001';
    const key = computeFrNirCheckKey(body);
    expect(isValidFr(`${body}${key}`)).toBe(true);
  });

  it('accepts synthetic NIR with space-separated groups', () => {
    // Spaced canonical form: 2 00 00 00000 001 <key>. Not a real
    // demographic profile.
    const body = '2000000000001';
    const key = computeFrNirCheckKey(body);
    const formatted = `2 00 00 00000 001 ${key}`;
    expect(isValidFr(formatted)).toBe(true);
  });

  it('rejects NIR with WRONG check key', () => {
    const body = '2000000000001';
    const key = computeFrNirCheckKey(body);
    // Flip the check key to something else.
    const wrongKey = key === '00' ? '01' : '00';
    expect(isValidFr(`${body}${wrongKey}`)).toBe(false);
  });

  it('rejects invalid sex digit (not 1 or 2)', () => {
    // NIR's first digit is 1 (male) or 2 (female). 3-9 are invalid.
    // Bodies use the synthetic placeholder shape (year=00 / month=00 /
    // dept=00 / commune=000 / seq=001) — not real demographics.
    expect(isValidFr('300000000000114')).toBe(false);
    expect(isValidFr('000000000000114')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidFr('20000000000011')).toBe(false); // 14 digits
    expect(isValidFr('2000000000001145')).toBe(false); // 16 digits
  });
});

// -----------------------------------------------------------------------
// IT Codice Fiscale — position-weighted check letter
// -----------------------------------------------------------------------

describe('IT Codice Fiscale — position-weighted check letter validation', () => {
  const isValidIt = nationalIdItValidator();

  it('computes check letter per position-weighted table', () => {
    // Body: 15 chars. E.g. 'RSSMRA85T10A562' (Mario Rossi, born 10 Dec
    // 1985 in "A562" municipality).
    const letter = computeItCodiceFiscaleCheckLetter('RSSMRA85T10A562');
    expect(letter).toMatch(/^[A-Z]$/);
  });

  it('accepts synthetic Codice Fiscale with CORRECT check letter', () => {
    const body = 'RSSMRA85T10A562';
    const check = computeItCodiceFiscaleCheckLetter(body);
    expect(isValidIt(`${body}${check}`)).toBe(true);
  });

  it('rejects Codice Fiscale with WRONG check letter', () => {
    const body = 'RSSMRA85T10A562';
    const check = computeItCodiceFiscaleCheckLetter(body);
    // Flip to a different letter.
    const wrong = check === 'A' ? 'B' : 'A';
    expect(isValidIt(`${body}${wrong}`)).toBe(false);
  });

  it('rejects wrong structural shape', () => {
    // Position-by-position structure requires specific letter/digit types.
    expect(isValidIt('123MRA85T10A562X')).toBe(false); // digits in surname
    expect(isValidIt('RSSMRA99T10A562X')).toBe(false); // will fail check
    expect(isValidIt('RSSMRA85T10A56')).toBe(false); // 14 chars
    expect(isValidIt('RSSMRA85T10A5622X')).toBe(false); // 17 chars
  });
});

// -----------------------------------------------------------------------
// sanitizePii pipeline — redacts national IDs across locales
// -----------------------------------------------------------------------

describe('sanitizePii — redacts national IDs across locales', () => {
  it('redacts UK NINO (compact form)', () => {
    const out = sanitizePii('My NINO is AB123456C.');
    expect(out).toContain('[nationalId]');
    expect(out).not.toContain('AB123456C');
  });

  it('redacts UK NINO (space-separated form)', () => {
    const out = sanitizePii('My NINO is AB 12 34 56 C.');
    expect(out).toContain('[nationalId]');
    expect(out).not.toContain('AB 12 34 56 C');
  });

  it('redacts ES DNI with valid mod-23 check letter', () => {
    const body = '12345678';
    const check = computeEsDniCheckLetter(body);
    const out = sanitizePii(`DNI: ${body}${check}`);
    expect(out).toContain('[nationalId]');
    expect(out).not.toContain(`${body}${check}`);
  });

  it('does NOT redact ES DNI with INVALID check letter', () => {
    // 12345678A is invalid (correct is Z). Must pass through.
    const out = sanitizePii('DNI: 12345678A');
    expect(out).not.toContain('[nationalId]');
    expect(out).toContain('12345678A');
  });

  it('redacts PT NIF with valid mod-11 check digit', () => {
    const body = '12345678';
    const check = computePtNifCheckDigit(body);
    const out = sanitizePii(`NIF: ${body}${check}`);
    expect(out).toContain('[nationalId]');
  });

  it('does NOT redact bare 9-digit sequence with INVALID NIF check', () => {
    // 123456780 → invalid (correct check is 9). Must pass through.
    const out = sanitizePii('Order: 123456780');
    expect(out).not.toContain('[nationalId]');
    expect(out).toContain('123456780');
  });

  it('redacts FR NIR with valid mod-97 check key (compact form)', () => {
    const body = '2000000000001';
    const key = computeFrNirCheckKey(body);
    const out = sanitizePii(`NIR: ${body}${key}`);
    expect(out).toContain('[nationalId]');
  });

  it('does NOT redact FR NIR with INVALID check key', () => {
    const body = '2000000000001';
    const key = computeFrNirCheckKey(body);
    const wrong = key === '00' ? '01' : '00';
    const out = sanitizePii(`NIR: ${body}${wrong}`);
    expect(out).not.toContain('[nationalId]');
  });

  it('redacts IT Codice Fiscale with valid check letter', () => {
    const body = 'RSSMRA85T10A562';
    const check = computeItCodiceFiscaleCheckLetter(body);
    const out = sanitizePii(`CF: ${body}${check}`);
    expect(out).toContain('[nationalId]');
    expect(out).not.toContain(`${body}${check}`);
  });

  it('does NOT redact IT Codice Fiscale with INVALID check letter', () => {
    const body = 'RSSMRA85T10A562';
    const check = computeItCodiceFiscaleCheckLetter(body);
    const wrong = check === 'A' ? 'B' : 'A';
    const out = sanitizePii(`CF: ${body}${wrong}`);
    expect(out).not.toContain('[nationalId]');
  });

  it('a 9-digit run inside a longer word is not a NIF candidate', () => {
    const body = '12345678';
    const nif = `${body}${computePtNifCheckDigit(body)}`;
    expect(sanitizePii(`ref X${nif}Y`)).toBe(`ref X${nif}Y`);
  });

  it('does NOT false-positive on dates packed without separators (20260420)', () => {
    // 8-digit date should not match any of our national-ID patterns
    // (DNI = 8 digits + LETTER, NIF = 9 digits, etc).
    const out = sanitizePii('Date: 20260420');
    expect(out).not.toContain('[nationalId]');
    expect(out).toContain('20260420');
  });
});

// -----------------------------------------------------------------------
// Pipeline ordering — mixed PII must all redact correctly
// -----------------------------------------------------------------------

describe('sanitizePii — pipeline order: national IDs compose with email/phone/address', () => {
  it('redacts email AND national ID in the same input', () => {
    const body = '12345678';
    const check = computeEsDniCheckLetter(body);
    const input = `Contact jane@example.com (DNI ${body}${check})`;
    const out = sanitizePii(input);
    expect(out).toContain('[email]');
    expect(out).toContain('[nationalId]');
    expect(out).not.toContain('jane@example.com');
    expect(out).not.toContain(`${body}${check}`);
  });

  it('redacts FR address + postcode + phone + NIR in mixed input', () => {
    const body = '2000000000001';
    const key = computeFrNirCheckKey(body);
    const input = `12 rue de la Paix, 75001 Paris, tel +33 6 12 34 56 78, NIR ${body}${key}`;
    const out = sanitizePii(input);
    expect(out).toContain('[address]');
    expect(out).toContain('[nationalId]');
    expect(out).toContain('[phone]');
  });

  it('redacts UK postcode + NINO in mixed input', () => {
    const input = 'Address: SW1A 2AA, NINO: AB123456C';
    const out = sanitizePii(input);
    expect(out).toContain('[postcode]');
    expect(out).toContain('[nationalId]');
  });
});

// -----------------------------------------------------------------------
// Idempotency — running sanitizePii twice yields byte-identical output
// -----------------------------------------------------------------------

describe('sanitizePii — idempotency on national-ID inputs', () => {
  it('UK NINO: second-pass is byte-identical (readable)', () => {
    const input = 'NINO: AB123456C';
    const once = sanitizePii(input);
    const twice = sanitizePii(once);
    expect(twice).toBe(once);
  });

  it('ES DNI: second-pass is byte-identical (readable)', () => {
    const body = '12345678';
    const check = computeEsDniCheckLetter(body);
    const input = `DNI: ${body}${check}`;
    const once = sanitizePii(input);
    const twice = sanitizePii(once);
    expect(twice).toBe(once);
  });

  it('IT Codice Fiscale: second-pass is byte-identical (readable)', () => {
    const body = 'RSSMRA85T10A562';
    const check = computeItCodiceFiscaleCheckLetter(body);
    const input = `CF: ${body}${check}`;
    const once = sanitizePii(input);
    const twice = sanitizePii(once);
    expect(twice).toBe(once);
  });

  it('sentinel format: UK NINO second-pass is byte-identical', () => {
    const input = 'NINO: AB123456C';
    const once = sanitizePii(input, { tokenFormat: 'sentinel' });
    const twice = sanitizePii(once, { tokenFormat: 'sentinel' });
    expect(twice).toBe(once);
  });

  it('sentinel format: ES DNI second-pass is byte-identical', () => {
    const body = '12345678';
    const check = computeEsDniCheckLetter(body);
    const input = `DNI: ${body}${check}`;
    const once = sanitizePii(input, { tokenFormat: 'sentinel' });
    const twice = sanitizePii(once, { tokenFormat: 'sentinel' });
    expect(twice).toBe(once);
  });

  it('cross-format: sentinel output sanitised again in readable mode is a no-op', () => {
    const input = 'NINO: AB123456C';
    const sentinel = sanitizePii(input, { tokenFormat: 'sentinel' });
    const readable = sanitizePii(sentinel); // default readable
    expect(readable).toBe(sentinel);
  });
});

// -----------------------------------------------------------------------
// Token format — [nationalId] + <<REDACTED_NATIONALID>> pattern-disjoint
// -----------------------------------------------------------------------

describe('TOKEN_FORMATS — nationalId kind added to both formats', () => {
  it('includes nationalId in both readable and sentinel formats', () => {
    expect(TOKEN_FORMATS.readable.nationalId).toBe('[nationalId]');
    expect(TOKEN_FORMATS.sentinel.nationalId).toBe('<<REDACTED_NATIONALID>>');
  });

  it('[nationalId] is pattern-disjoint — no existing pattern matches it', () => {
    // A string containing only the [nationalId] token, sanitised, must
    // pass through unchanged (no collision with email/phone/address/etc).
    const input = 'Value: [nationalId] present';
    expect(sanitizePii(input)).toBe(input);
  });

  it('<<REDACTED_NATIONALID>> is pattern-disjoint — no existing pattern matches it', () => {
    const input = 'Value: <<REDACTED_NATIONALID>> present';
    expect(sanitizePii(input)).toBe(input);
    expect(sanitizePii(input, { tokenFormat: 'sentinel' })).toBe(input);
  });

  it('[nationalId] token itself does not match any national-ID validator', () => {
    // If [nationalId] ever matched one of the validators, a second pass
    // would replace it again — idempotency would break.
    const token = '[nationalId]';
    expect(nationalIdUkValidator()(token)).toBe(false);
    expect(nationalIdFrValidator()(token)).toBe(false);
    expect(nationalIdItValidator()(token)).toBe(false);
    expect(nationalIdEsValidator()(token)).toBe(false);
    expect(nationalIdPtValidator()(token)).toBe(false);
  });

  it('<<REDACTED_NATIONALID>> does not match any national-ID validator', () => {
    const token = '<<REDACTED_NATIONALID>>';
    expect(nationalIdUkValidator()(token)).toBe(false);
    expect(nationalIdFrValidator()(token)).toBe(false);
    expect(nationalIdItValidator()(token)).toBe(false);
    expect(nationalIdEsValidator()(token)).toBe(false);
    expect(nationalIdPtValidator()(token)).toBe(false);
  });
});
