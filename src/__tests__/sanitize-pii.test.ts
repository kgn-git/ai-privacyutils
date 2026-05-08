import { describe, it, expect } from 'vitest';

import { sanitizePii } from '../sanitize-pii.js';
import {
  piiPatterns,
  emailPattern,
  addressPattern,
  phoneInternationalPattern,
  phoneDomesticPattern,
  dobPattern,
} from '../patterns.js';

/**
 * Test suite for sanitizePii — preserves byte-equivalent behaviour
 * established at v1.0.0 (email / address / international-phone /
 * domestic-phone) and extends it with a DOB pattern covering six EU
 * locales (EN/FR/DE/IT/ES/PT).
 *
 * Order of pattern application (MUST be preserved):
 *   email → address → international phone → domestic phone → dob
 *
 * Email and phone/address order matters for idempotency (see §5.5 of the
 * compliance review). DOB is applied LAST because: (a) placing it before
 * phone would cause `\d{2}[./-]\d{2}[./-]\d{4}` DOB-like numeric sequences
 * to eat phone digit runs; (b) placing it before address is unsafe because
 * named-month DOB regexes can overlap with words in address free-text.
 * Placing DOB last preserves idempotency — no prior pattern touches the
 * `[dob]` replacement token and no [dob] token emits residual digits.
 */

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
    // Canonical regex requires `.tld{2,}` so @handle without TLD is not matched.
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
    // Pattern fix under CRIT-2: inner name class must accept BOTH upper and
    // lower alpha so that mixed-case tokens like "McLane" match. The v1.0.0
    // initial pattern used `[a-z]{1,15}` which rejected the capital "L".
    expect(sanitizePii('Lives at 42 McLane Drive nowadays.')).toBe(
      'Lives at [address] nowadays.',
    );
  });

  it('redacts all-caps street token (LA Cienega) — CRIT-2 regression guard', () => {
    // Bounded `{0,15}` on `[a-zA-Z]` also accepts the zero-length continuation
    // that allows a 2-char all-caps token like "LA" to match against the
    // leading `[A-Z]` + optional tail.
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
    // Canonical regex is NANP-shaped; this tests the boundary case where
    // a French number happens to fit the shape. Per §5.3 of the compliance
    // review, native EU formats are a known v1.1 gap (R2).
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
    // Defence against the failure mode where a phone-like digit sequence
    // embedded in an address like `local@domain123.co` gets eaten by phone.
    const out = sanitizePii('mail test123@example.co and call 555-123-4567');
    expect(out).toBe('mail [email] and call [phone]');
  });

  it('redacts address before phone so leading house number is not mis-matched', () => {
    // Defence against phone eating a house-number digit run in an address.
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
    // 1985 alone is a year, not a DOB. Do not over-match.
    expect(sanitizePii('Worked at Acme from 1985 to 1990.')).toBe(
      'Worked at Acme from 1985 to 1990.',
    );
  });

  it('does not redact month-year only (e.g. "March 1985")', () => {
    // No day component → not a DOB per the regex design.
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
    // Uses a phone number that fits the NANP-shape regex. A native French
    // format like "+33 6 12 34 56 78" is a known v1.0.0 gap (R2 in the
    // compliance review) and is intentionally NOT covered here — locale-
    // aware patterns land in v1.1 via libphonenumber-js.
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
    // v1.0.0 flagged this input as a known gap (R2). v1.1 integrates
    // libphonenumber-js per `piiPatterns.phoneByLocale` + sanitizePii's
    // locale-aware pass, so `+33 6 12 34 56 78` is now redacted
    // byte-equivalent to NANP-shape numbers. The v1.0.0 pinned behaviour
    // (assertion of passthrough) has flipped accordingly.
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
  /**
   * v1.0.0 exports patterns as factory functions, not singleton RegExps.
   * Rationale: module-level `/g`-flagged RegExps carry a stateful `lastIndex`
   * which makes consecutive `.test()` / `.exec()` calls on the same instance
   * alternate between match and no-match — a classic footgun. Factories
   * return a fresh instance on every call so programmatic consumers cannot
   * trip the stateful-lastIndex hazard.
   *
   * `sanitizePii` itself is safe either way (String.prototype.replace resets
   * `lastIndex` internally) but external callers using `.test()` / `.exec()`
   * need the fresh instance guarantee.
   */

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
    // With a single shared /g-flagged regex, .test() alternates true/false
    // because lastIndex advances on match and resets on miss. Fresh instances
    // must not show that behaviour.
    const input = 'Mail jane@example.com now.';
    const first = piiPatterns.email().test(input);
    const second = piiPatterns.email().test(input);
    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  it('factory-returned RegExp does not leak a module-level shared source identity', () => {
    // If the factory were just `() => SHARED_REGEX`, JSON-equivalence would
    // still hold across calls, but the instance identity would match. We
    // assert distinct instances (previous test) — this test ensures the
    // factory pattern is genuinely building fresh regexes, not returning a
    // singleton wrapped in a closure.
    const a = piiPatterns.email();
    const b = piiPatterns.email();
    // Advance lastIndex on `a` by testing it.
    a.test('foo@bar.com');
    // `b` must remain at lastIndex 0 — would not be the case if a/b shared
    // the underlying RegExp object.
    expect(b.lastIndex).toBe(0);
  });
});
