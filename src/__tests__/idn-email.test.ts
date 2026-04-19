import { describe, it, expect } from 'vitest';

import { sanitizePii } from '../sanitize-pii.js';
import { emailPattern, piiPatterns } from '../patterns.js';

/**
 * Test suite for #3 (R5) — IDN email support per RFC 6531.
 *
 * v1.0.0 email regex was ASCII-only:
 *   [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}
 *
 * v1.1 widens the email pattern to accept:
 *   - IDN domains (École, München, 中国 — RFC 5892 / IDNA 2008)
 *   - RFC 6531 / SMTPUTF8 Unicode local parts (françois, müller, ...)
 *   - Punycode domains (xn--mnchen-3ya.de) — matched by both the legacy
 *     ASCII shape and the new Unicode shape since xn-- is ASCII-only
 *   - Mixed forms (IDN local + ASCII domain; ASCII local + IDN domain)
 *
 * Covered fixtures by locale + form:
 *   EN: john.doe@example.com (ASCII baseline — backward compat)
 *   FR: françois@école.fr (IDN local + IDN domain)
 *   DE: müller@münchen.de (IDN local + IDN domain)
 *   DE: user@münchen.de (ASCII local + IDN domain)
 *   IT: andrea@università.it (ASCII local + IDN domain with à)
 *   ES: maría@correo.es (IDN local + ASCII domain)
 *   PT: joão@empresa.pt (IDN local + ASCII domain)
 *   Punycode: user@xn--mnchen-3ya.de (ASCII punycode form)
 *   IDN TLD: user@example.中国 (ASCII local + Unicode TLD)
 */

describe('emailPattern — IDN support (#3 / R5)', () => {
  it('still matches plain ASCII email (backward compat)', () => {
    expect('jane.doe@example.com'.match(emailPattern())).toEqual([
      'jane.doe@example.com',
    ]);
  });

  it('matches IDN local + IDN domain (FR — françois@école.fr)', () => {
    expect('françois@école.fr'.match(emailPattern())).toEqual([
      'françois@école.fr',
    ]);
  });

  it('matches ASCII local + IDN domain (DE — user@münchen.de)', () => {
    expect('user@münchen.de'.match(emailPattern())).toEqual(['user@münchen.de']);
  });

  it('matches IDN local + ASCII domain (ES — maría@correo.es)', () => {
    expect('maría@correo.es'.match(emailPattern())).toEqual(['maría@correo.es']);
  });

  it('matches IDN local + ASCII domain (PT — joão@empresa.pt)', () => {
    expect('joão@empresa.pt'.match(emailPattern())).toEqual(['joão@empresa.pt']);
  });

  it('matches ASCII local + IDN domain (IT — andrea@università.it)', () => {
    expect('andrea@università.it'.match(emailPattern())).toEqual([
      'andrea@università.it',
    ]);
  });

  it('matches IDN local + IDN domain (DE — müller@münchen.de)', () => {
    expect('müller@münchen.de'.match(emailPattern())).toEqual([
      'müller@münchen.de',
    ]);
  });

  it('matches punycode domain form (user@xn--mnchen-3ya.de)', () => {
    expect('user@xn--mnchen-3ya.de'.match(emailPattern())).toEqual([
      'user@xn--mnchen-3ya.de',
    ]);
  });

  it('matches Unicode TLD form (user@example.中国)', () => {
    expect('user@example.中国'.match(emailPattern())).toEqual([
      'user@example.中国',
    ]);
  });

  it('greedily matches Unicode-word TLD with no separator (over-redaction acceptable for privacy)', () => {
    // The TLD quantifier {2,24} consumes trailing Unicode letters up to the ceiling.
    // user@example.中国后文字 (5-char Unicode TLD-lookalike) is matched as a single
    // email. Over-redaction of an email-shaped token is the correct privacy trade-off —
    // the lookahead (?![\p{L}\p{N}-]) prevents EXTENSION into following chars, not
    // truncation at semantic TLD boundaries.
    const result = 'user@example.中国后文字'.match(emailPattern());
    expect(result).toEqual(['user@example.中国后文字']);
  });
});

describe('sanitizePii — IDN email redaction (#3 / R5)', () => {
  it('redacts IDN email (françois@école.fr)', () => {
    expect(sanitizePii('Contact françois@école.fr for info.')).toBe(
      'Contact [email] for info.',
    );
  });

  it('redacts IDN email (user@münchen.de)', () => {
    expect(sanitizePii('Email user@münchen.de to reach me.')).toBe(
      'Email [email] to reach me.',
    );
  });

  it('redacts multiple IDN emails on same line', () => {
    const out = sanitizePii(
      'Referees: maría@correo.es and joão@empresa.pt available.',
    );
    expect(out).toBe('Referees: [email] and [email] available.');
  });

  it('redacts IDN + ASCII emails in same string', () => {
    const out = sanitizePii(
      'Primary: jane@example.com, secondary: françois@école.fr.',
    );
    expect(out).toBe('Primary: [email], secondary: [email].');
  });

  it('redacts punycode domain form (user@xn--mnchen-3ya.de)', () => {
    expect(sanitizePii('Reach user@xn--mnchen-3ya.de anytime.')).toBe(
      'Reach [email] anytime.',
    );
  });

  it('is idempotent on IDN email — second pass is a no-op', () => {
    const once = sanitizePii('send to françois@école.fr now');
    const twice = sanitizePii(once);
    expect(twice).toBe(once);
    expect(once).toBe('send to [email] now');
  });

  it('is idempotent across mixed IDN + ASCII emails', () => {
    const input =
      'Jane jane@acme.co and François françois@école.fr share notes.';
    const once = sanitizePii(input);
    const twice = sanitizePii(once);
    expect(twice).toBe(once);
    expect(once).toBe('Jane [email] and François [email] share notes.');
  });

  it('does not false-match non-email Unicode text', () => {
    // No '@' — must not match.
    expect(sanitizePii('École normale supérieure')).toBe(
      'École normale supérieure',
    );
    expect(sanitizePii('münchen is a city')).toBe('münchen is a city');
  });

  it('preserves v1.0.0 ASCII fixtures byte-equivalent (regression guard)', () => {
    // Every fixture from sanitize-pii.test.ts email suite must redact identically.
    expect(sanitizePii('Contact me at jane.doe@example.com please.')).toBe(
      'Contact me at [email] please.',
    );
    expect(sanitizePii('mail: foo.bar+cv2026@mail.example.co.uk today')).toBe(
      'mail: [email] today',
    );
    expect(
      sanitizePii('Referees: alice@uni.edu and bob.smith@acme.io available.'),
    ).toBe('Referees: [email] and [email] available.');
    // Twitter-style @handle with no TLD must still NOT match.
    expect(sanitizePii('Follow @acme on socials')).toBe('Follow @acme on socials');
  });
});

describe('emailPattern — factory freshness invariant (IMP-1, IDN)', () => {
  it('emailPattern is still a factory function (factory-function pattern preserved)', () => {
    expect(typeof emailPattern).toBe('function');
    expect(typeof piiPatterns.email).toBe('function');
  });

  it('returns a fresh RegExp on each call', () => {
    const a = emailPattern();
    const b = emailPattern();
    expect(a).not.toBe(b);
    expect(a.source).toBe(b.source);
    expect(a.flags).toBe(b.flags);
  });

  it('is /g-flagged and unicode-aware (u flag) so IDN \\p{L} works', () => {
    const re = emailPattern();
    expect(re.flags).toContain('g');
    expect(re.flags).toContain('u');
  });

  it('exec-state isolation — independent .test() calls stay true on IDN input', () => {
    const input = 'françois@école.fr';
    const first = emailPattern().test(input);
    const second = emailPattern().test(input);
    expect(first).toBe(true);
    expect(second).toBe(true);
  });
});
