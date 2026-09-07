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

// Fixtures are synthesised from the exported check helpers, so a wrong algorithm breaks fixture and
// implementation together, while the hand-written wrong-check cases still assert rejection. No real ID appears.

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

describe('ES DNI — mod-23 check letter validation', () => {
  const isValidEs = nationalIdEsValidator();

  it('computes check letter per mod-23 lookup table', () => {
    // 12345678 % 23 = 14 → index 14 of TRWAGMYFPDXBNJZSQVHLCKE = Z; 0 → T; 1 → R.
    expect(computeEsDniCheckLetter('12345678')).toBe('Z');
    expect(computeEsDniCheckLetter('00000000')).toBe('T');
    expect(computeEsDniCheckLetter('00000001')).toBe('R');
  });

  it('computeEsDniCheckLetter rejects non-8-digit body with empty string (security-expert finding S1)', () => {
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

describe('PT NIF — mod-11 weighted check digit validation', () => {
  const isValidPt = nationalIdPtValidator();

  it('computes check digit per weighted mod-11', () => {
    // '12345678': 1*9+2*8+3*7+4*6+5*5+6*4+7*3+8*2 = 156; 156 % 11 = 2; check = 11 - 2 = 9.
    expect(computePtNifCheckDigit('12345678')).toBe(9);
    // '00000000': sum 0, remainder 0 → check 0.
    expect(computePtNifCheckDigit('00000000')).toBe(0);
  });

  it('accepts synthetic NIF with CORRECT check digit', () => {
    const body = '12345678';
    const check = computePtNifCheckDigit(body);
    expect(isValidPt(`${body}${check}`)).toBe(true);
  });

  it('rejects NIF with WRONG check digit', () => {
    expect(isValidPt('123456780')).toBe(false);
    // `123456789` would pass — body 12345678 wants check 9; that is the accepted 1-in-11 exposure.
  });

  it('rejects wrong shape (not 9 digits)', () => {
    expect(isValidPt('12345678')).toBe(false); // 8 digits
    expect(isValidPt('1234567890')).toBe(false); // 10 digits
    expect(isValidPt('ABC123456')).toBe(false); // letters
  });

  it('known false-positive exposure: any random 9-digit run with a valid check digit will pass', () => {
    const body = '00000000';
    const check = computePtNifCheckDigit(body);
    expect(isValidPt(`${body}${check}`)).toBe(true);
  });
});

describe('FR NIR — mod-97 check key validation', () => {
  const isValidFr = nationalIdFrValidator();

  it('computes 2-digit check key per mod-97', () => {
    // Synthetic body: sex 2, year 00, month 00, département 00 (unassigned), commune 000, sequence 001 — not a
    // real profile; the validator does not gate on month, the check key alone catches malformed bodies.
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
    const body = '2000000000001';
    const key = computeFrNirCheckKey(body);
    const formatted = `2 00 00 00000 001 ${key}`;
    expect(isValidFr(formatted)).toBe(true);
  });

  it('rejects NIR with WRONG check key', () => {
    const body = '2000000000001';
    const key = computeFrNirCheckKey(body);
    const wrongKey = key === '00' ? '01' : '00';
    expect(isValidFr(`${body}${wrongKey}`)).toBe(false);
  });

  it('rejects invalid sex digit (not 1 or 2)', () => {
    expect(isValidFr('300000000000114')).toBe(false);
    expect(isValidFr('000000000000114')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidFr('20000000000011')).toBe(false); // 14 digits
    expect(isValidFr('2000000000001145')).toBe(false); // 16 digits
  });
});

describe('IT Codice Fiscale — position-weighted check letter validation', () => {
  const isValidIt = nationalIdItValidator();

  it('computes check letter per position-weighted table', () => {
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
    const wrong = check === 'A' ? 'B' : 'A';
    expect(isValidIt(`${body}${wrong}`)).toBe(false);
  });

  it('rejects wrong structural shape', () => {
    expect(isValidIt('123MRA85T10A562X')).toBe(false); // digits in surname
    expect(isValidIt('RSSMRA99T10A562X')).toBe(false); // will fail check
    expect(isValidIt('RSSMRA85T10A56')).toBe(false); // 14 chars
    expect(isValidIt('RSSMRA85T10A5622X')).toBe(false); // 17 chars
  });
});

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
    const out = sanitizePii('Date: 20260420');
    expect(out).not.toContain('[nationalId]');
    expect(out).toContain('20260420');
  });
});

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

describe('TOKEN_FORMATS — nationalId kind added to both formats', () => {
  it('includes nationalId in both readable and sentinel formats', () => {
    expect(TOKEN_FORMATS.readable.nationalId).toBe('[nationalId]');
    expect(TOKEN_FORMATS.sentinel.nationalId).toBe('<<REDACTED_NATIONALID>>');
  });

  it('[nationalId] is pattern-disjoint — no existing pattern matches it', () => {
    const input = 'Value: [nationalId] present';
    expect(sanitizePii(input)).toBe(input);
  });

  it('<<REDACTED_NATIONALID>> is pattern-disjoint — no existing pattern matches it', () => {
    const input = 'Value: <<REDACTED_NATIONALID>> present';
    expect(sanitizePii(input)).toBe(input);
    expect(sanitizePii(input, { tokenFormat: 'sentinel' })).toBe(input);
  });

  it('[nationalId] token itself does not match any national-ID validator', () => {
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
