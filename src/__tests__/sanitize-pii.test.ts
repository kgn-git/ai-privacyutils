import { describe, it, expect, vi } from 'vitest';

const phoneFinder = vi.hoisted(() => ({ throwFor: null as string | null }));

vi.mock('libphonenumber-js/min', async (importOriginal) => {
  const actual = await importOriginal<typeof import('libphonenumber-js/min')>();
  return {
    ...actual,
    findPhoneNumbersInText: (text: string, opts: { defaultCountry: string }) => {
      if (opts.defaultCountry === phoneFinder.throwFor) throw new Error('finder failure');
      return actual.findPhoneNumbersInText(text, opts as never);
    },
  };
});

import { sanitizePii } from '../sanitize-pii.js';
import {
  piiPatterns,
  emailPattern,
  addressPattern,
  phoneInternationalPattern,
  phoneDomesticPattern,
  dobPattern,
} from '../patterns.js';

describe('sanitizePii — email redaction (ported from cv-chunker.ts:76)', () => {
  it('redacts basic local@domain.tld addresses', () => {
    expect(sanitizePii('Contact me at jane.doe@example.com please.')).toBe(
      'Contact me at [email] please.',
    );
  });

  it('redacts addresses with + aliasing and dots in local part', () => {
    expect(sanitizePii('mail: foo.bar+cv2026@mail.example.co.uk today')).toBe(
      'mail: [email] today',
    );
  });

  it('redacts referee emails (multiple on same line)', () => {
    const out = sanitizePii(
      'Referees: alice@uni.edu and bob.smith@acme.io available.',
    );
    expect(out).toBe('Referees: [email] and [email] available.');
  });

  it('does not mangle non-email @ mentions (twitter style — no TLD)', () => {
    expect(sanitizePii('Follow @acme on socials')).toBe('Follow @acme on socials');
  });

  it('is idempotent on email — second pass is a no-op', () => {
    const once = sanitizePii('send to jane@example.com now');
    const twice = sanitizePii(once);
    expect(twice).toBe(once);
  });
});

describe('sanitizePii — street address redaction (ported from cv-chunker.ts:80-83)', () => {
  it('redacts US-style number-first addresses with Avenue suffix', () => {
    expect(sanitizePii('1600 Pennsylvania Avenue is famous.')).toBe(
      '[address] is famous.',
    );
  });

  it('redacts addresses with direction suffix (NW/NE/SW/SE)', () => {
    expect(sanitizePii('Office at 10 Apollo Court NW closes at 5.')).toBe(
      'Office at [address] closes at 5.',
    );
  });

  it('redacts the common Street/St/Road/Rd abbreviations', () => {
    expect(sanitizePii('Lived at 42 Baker Street for years.')).toBe(
      'Lived at [address] for years.',
    );
    expect(sanitizePii('Sent from 221 Baker St yesterday.')).toBe(
      'Sent from [address] yesterday.',
    );
  });

  it('is idempotent on address — second pass is a no-op', () => {
    const once = sanitizePii('met at 10 Downing Street for tea');
    const twice = sanitizePii(once);
    expect(twice).toBe(once);
  });

  it('redacts mixed-case street name (McLane) — CRIT-2 regression guard', () => {
    // The inner name class must accept an upper-case letter after the first (`[a-zA-Z]`, not `[a-z]`).
    expect(sanitizePii('Lives at 42 McLane Drive nowadays.')).toBe(
      'Lives at [address] nowadays.',
    );
  });

  it('redacts all-caps street token (LA Cienega) — CRIT-2 regression guard', () => {
    // The `{0,15}` tail accepts a zero-length continuation, so a two-letter all-caps token matches.
    expect(sanitizePii('Dinner at 10 LA Cienega Boulevard tonight.')).toBe(
      'Dinner at [address] tonight.',
    );
  });
});

describe('sanitizePii — phone redaction (ported from cv-chunker.ts:87-88)', () => {
  it('redacts US-style 10-digit phones with hyphens', () => {
    expect(sanitizePii('Call 555-123-4567 tomorrow.')).toBe('Call [phone] tomorrow.');
  });

  it('redacts parenthesised area code format', () => {
    expect(sanitizePii('Call (555) 123-4567 tomorrow.')).toBe(
      'Call [phone] tomorrow.',
    );
  });

  it('redacts dot-separated phone numbers', () => {
    expect(sanitizePii('Call 555.123.4567 tomorrow.')).toBe('Call [phone] tomorrow.');
  });

  it('redacts international format with + country code (+44 UK, +1 US)', () => {
    expect(sanitizePii('Call +1 555 123 4567 or +44 555 123 4567 today.')).toBe(
      'Call [phone] or [phone] today.',
    );
  });

  it('redacts French-spaced 3-3-4 grouped phone (best-effort, NANP-shaped)', () => {
    expect(sanitizePii('Tel 033 123 4567 please.')).toBe('Tel [phone] please.');
  });

  it('is idempotent on phone — second pass is a no-op', () => {
    const once = sanitizePii('ring me on 555-123-4567 now');
    const twice = sanitizePii(once);
    expect(twice).toBe(once);
  });
});

describe('sanitizePii — order of operations (ported §5.5 audit)', () => {
  it('redacts email before phone so @domain digit runs are not mis-matched', () => {
    const out = sanitizePii('mail test123@example.co and call 555-123-4567');
    expect(out).toBe('mail [email] and call [phone]');
  });

  it('redacts address before phone so leading house number is not mis-matched', () => {
    expect(
      sanitizePii('At 42 Baker Street, reach out on 555-123-4567 anytime.'),
    ).toBe('At [address], reach out on [phone] anytime.');
  });

  it('preserves non-PII text untouched', () => {
    const cv =
      'Senior Software Engineer with 10 years of experience in TypeScript, ' +
      'React, and distributed systems. Delivered a 40% performance uplift.';
    expect(sanitizePii(cv)).toBe(cv);
  });

  it('handles multiple PII classes in a single string idempotently', () => {
    const input =
      'Jane Doe, jane@example.com, (555) 123-4567, 42 Baker Street, CV attached.';
    const once = sanitizePii(input);
    const twice = sanitizePii(once);
    expect(once).toContain('[email]');
    expect(once).toContain('[phone]');
    expect(once).toContain('[address]');
    expect(twice).toBe(once);
  });
});

describe('sanitizePii — locale phone guards', () => {
  it('a formatted short-code shape that libphonenumber accepts is not redacted', () => {
    expect(sanitizePii('Tel: 12 34 56 please')).toBe('Tel: 12 34 56 please');
  });

  it('a throwing phone finder for one locale is swallowed and the other passes still run', () => {
    phoneFinder.throwFor = 'FR';
    try {
      expect(sanitizePii('mail jane@example.com, tel 030 12345678')).toBe(
        'mail [email], tel [phone]',
      );
    } finally {
      phoneFinder.throwFor = null;
    }
  });
});

describe('sanitizePii — DOB redaction (C1: new in v1.0.0, per compliance review §R4)', () => {
  it('redacts DD.MM.YYYY (DE-style)', () => {
    expect(sanitizePii('geboren am 23.05.1985 in Berlin')).toBe(
      'geboren am [dob] in Berlin',
    );
  });

  it('redacts DD/MM/YYYY (FR/UK-style)', () => {
    expect(sanitizePii('Née le 23/05/1985 à Paris')).toBe(
      'Née le [dob] à Paris',
    );
  });

  it('redacts YYYY-MM-DD (ISO-style)', () => {
    expect(sanitizePii('DOB: 1985-05-23 on record')).toBe('DOB: [dob] on record');
  });

  it('redacts DD-MM-YYYY (alt EU-style)', () => {
    expect(sanitizePii('Born 23-05-1985.')).toBe('Born [dob].');
  });

  it('redacts English named month: 12 March 1985', () => {
    expect(sanitizePii('Born on 12 March 1985 in London.')).toBe(
      'Born on [dob] in London.',
    );
  });

  it('redacts English named month with comma: March 12, 1985', () => {
    expect(sanitizePii('Born on March 12, 1985 in NYC.')).toBe(
      'Born on [dob] in NYC.',
    );
  });

  it('redacts French named month: 12 mars 1985', () => {
    expect(sanitizePii('Né le 12 mars 1985 à Lyon.')).toBe('Né le [dob] à Lyon.');
  });

  it('redacts German named month with period: 12. März 1985', () => {
    expect(sanitizePii('geboren 12. März 1985 in München')).toBe(
      'geboren [dob] in München',
    );
  });

  it('redacts Italian named month: 12 marzo 1985', () => {
    expect(sanitizePii('Nato il 12 marzo 1985 a Roma.')).toBe(
      'Nato il [dob] a Roma.',
    );
  });

  it('redacts Spanish named month with prepositions: 12 de marzo de 1985', () => {
    expect(sanitizePii('Nacido el 12 de marzo de 1985 en Madrid.')).toBe(
      'Nacido el [dob] en Madrid.',
    );
  });

  it('redacts Portuguese named month with prepositions: 12 de março de 1985', () => {
    expect(sanitizePii('Nascido a 12 de março de 1985 em Lisboa.')).toBe(
      'Nascido a [dob] em Lisboa.',
    );
  });

  it('does not redact bare years (e.g. employment dates without day)', () => {
    expect(sanitizePii('Worked at Acme from 1985 to 1990.')).toBe(
      'Worked at Acme from 1985 to 1990.',
    );
  });

  it('does not redact month-year only (e.g. "March 1985")', () => {
    expect(sanitizePii('Joined in March 1985 as a junior engineer.')).toBe(
      'Joined in March 1985 as a junior engineer.',
    );
  });

  it('is idempotent on DOB — second pass is a no-op', () => {
    const once = sanitizePii('DOB 23.05.1985 on file');
    const twice = sanitizePii(once);
    expect(twice).toBe(once);
  });
});

describe('sanitizePii — cross-pattern integration', () => {
  it('redacts a full EU CV header in one pass (NANP-shape phone)', () => {
    const input = [
      'Jean Dupont',
      'Né le 12 mars 1985',
      'Email: jean.dupont@example.fr',
      'Phone: +1 555 123 4567',
      '42 Baker Street, London',
    ].join('\n');
    const once = sanitizePii(input);
    expect(once).toContain('[dob]');
    expect(once).toContain('[email]');
    expect(once).toContain('[phone]');
    expect(once).toContain('[address]');
    const twice = sanitizePii(once);
    expect(twice).toBe(once);
  });

  it('redacts native EU phone formats — R2 resolved in v1.1', () => {
    const input = 'French mobile: +33 6 12 34 56 78 today.';
    const out = sanitizePii(input);
    expect(out).toContain('[phone]');
    expect(out).not.toContain('+33');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizePii('')).toBe('');
  });

  it('returns input unchanged when no PII present', () => {
    const clean = 'A professional summary with no contact details.';
    expect(sanitizePii(clean)).toBe(clean);
  });
});

describe('piiPatterns — factory-function API (IMP-1: fresh instances, no shared lastIndex)', () => {
  it('each export is a function (not a module-level RegExp)', () => {
    expect(typeof emailPattern).toBe('function');
    expect(typeof addressPattern).toBe('function');
    expect(typeof phoneInternationalPattern).toBe('function');
    expect(typeof phoneDomesticPattern).toBe('function');
    expect(typeof dobPattern).toBe('function');
  });

  it('piiPatterns record exposes factory functions under canonical names', () => {
    expect(typeof piiPatterns.email).toBe('function');
    expect(typeof piiPatterns.address).toBe('function');
    expect(typeof piiPatterns.phoneInternational).toBe('function');
    expect(typeof piiPatterns.phoneDomestic).toBe('function');
    expect(typeof piiPatterns.dob).toBe('function');
  });

  it('calling a factory returns a fresh RegExp with the /g flag', () => {
    const re = piiPatterns.email();
    expect(re).toBeInstanceOf(RegExp);
    expect(re.flags).toContain('g');
  });

  it('two successive factory calls return DISTINCT RegExp instances (no shared state)', () => {
    const a = piiPatterns.email();
    const b = piiPatterns.email();
    expect(a).not.toBe(b);
  });

  it('two successive .test() calls on separately-built regexes do NOT alternate', () => {
    // A single shared `/g` regex alternates true/false as `lastIndex` advances and resets.
    const input = 'Mail jane@example.com now.';
    const first = piiPatterns.email().test(input);
    const second = piiPatterns.email().test(input);
    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  it('factory-returned RegExp does not leak a module-level shared source identity', () => {
    // If the factory returned one shared instance, `b.lastIndex` would have advanced with `a`.
    const a = piiPatterns.email();
    const b = piiPatterns.email();
    a.test('foo@bar.com');
    expect(b.lastIndex).toBe(0);
  });
});
