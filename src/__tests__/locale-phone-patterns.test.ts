import { describe, it, expect } from 'vitest';

import { sanitizePii } from '../sanitize-pii.js';
import { piiPatterns } from '../patterns.js';

/**
 * Test suite for R2 (EU mobile phone formats via libphonenumber-js) — v1.1
 * additive.
 *
 * Closes the last major recall gap flagged in the v1.0.0 review: v1.0.0's
 * two phone regex patterns encode NANP (North American) shapes and
 * under-match native EU mobile formats:
 *
 *   - FR: `06 12 34 56 78` (2-2-2-2-2 grouping)
 *   - DE: `030 12345678` (3+8 variable)
 *   - UK: `07911 123456` (5+6)
 *   - IT: `+39 320 1234567` (3+7 after CC)
 *   - ES: `+34 612 34 56 78` (3+2+2+2 after CC)
 *   - PT: `+351 912 345 678` (3+3+3 after CC)
 *
 * v1.1 adds:
 *
 *   - `piiPatterns.phoneByLocale.fr()/.de()/.uk()/.it()/.es()/.pt()` —
 *     factory functions per locale. Each call returns a validator function
 *     `(candidate: string) => boolean` backed by libphonenumber-js
 *     (`isValidPhoneNumber(candidate, <country>)`). Design choice
 *     documented in `docs/Handover-2.md` § Factory API choice.
 *   - `sanitizePii` runs locale-aware phone validation BEFORE the existing
 *     NANP-shape fallback to avoid double-redaction + preserve
 *     order-of-application idempotency.
 *
 * Backward-compatibility (v1.0.0 consumer contract):
 *
 *   - `piiPatterns.phoneInternational()` and `piiPatterns.phoneDomestic()`
 *     remain byte-equivalent NANP-shape regex factories. No semantic change.
 *   - All existing phone fixtures (`555-123-4567`, `(555) 123-4567`,
 *     `+1 555 123 4567`, `+44 555 123 4567`) stay green.
 *
 * Test fixtures are synthetic (no real PII). UK numbers use the Ofcom
 * `07911 xxxxxx` / `020 7946 xxxx` example ranges which pass
 * libphonenumber-js validation + correspond to Ofcom's published "numbers
 * for drama and textbooks"; EU numbers use format-plausible examples that
 * pass national-format validation (they are NOT real subscriber lines).
 * The `07700 900xxx` range (strictly reserved for drama) is NOT used
 * because libphonenumber-js correctly rejects it as invalid.
 */

// -----------------------------------------------------------------------
// Factory API — dictionary shape + validator contract
// -----------------------------------------------------------------------

describe('piiPatterns.phoneByLocale — dictionary shape + validator contract', () => {
  it('exposes fr/de/uk/it/es/pt factory functions', () => {
    expect(typeof piiPatterns.phoneByLocale.fr).toBe('function');
    expect(typeof piiPatterns.phoneByLocale.de).toBe('function');
    expect(typeof piiPatterns.phoneByLocale.uk).toBe('function');
    expect(typeof piiPatterns.phoneByLocale.it).toBe('function');
    expect(typeof piiPatterns.phoneByLocale.es).toBe('function');
    expect(typeof piiPatterns.phoneByLocale.pt).toBe('function');
  });

  it('each locale factory returns a fresh validator function on every call', () => {
    for (const locale of ['fr', 'de', 'uk', 'it', 'es', 'pt'] as const) {
      const a = piiPatterns.phoneByLocale[locale]();
      const b = piiPatterns.phoneByLocale[locale]();
      expect(typeof a).toBe('function');
      expect(typeof b).toBe('function');
      // Validator is a (candidate: string) => boolean contract.
      expect(a('not-a-number')).toBe(false);
      expect(b('not-a-number')).toBe(false);
    }
  });

  it('FR validator accepts a valid FR mobile form and rejects noise', () => {
    const isValidFr = piiPatterns.phoneByLocale.fr();
    expect(isValidFr('06 12 34 56 78')).toBe(true);
    expect(isValidFr('+33 6 12 34 56 78')).toBe(true);
    expect(isValidFr('bonjour')).toBe(false);
    expect(isValidFr('12345')).toBe(false);
  });

  it('DE validator accepts a valid DE landline/mobile form', () => {
    const isValidDe = piiPatterns.phoneByLocale.de();
    expect(isValidDe('030 12345678')).toBe(true);
    expect(isValidDe('+49 30 12345678')).toBe(true);
    expect(isValidDe('not-a-number')).toBe(false);
  });

  it('UK validator accepts a valid UK mobile (Ofcom drama/textbook range)', () => {
    const isValidUk = piiPatterns.phoneByLocale.uk();
    expect(isValidUk('07911 123456')).toBe(true);
    expect(isValidUk('+44 7911 123456')).toBe(true);
    expect(isValidUk('not-a-number')).toBe(false);
  });

  it('IT validator accepts a valid IT mobile form', () => {
    const isValidIt = piiPatterns.phoneByLocale.it();
    expect(isValidIt('+39 320 1234567')).toBe(true);
    expect(isValidIt('320 1234567')).toBe(true);
    expect(isValidIt('not-a-number')).toBe(false);
  });

  it('ES validator accepts a valid ES mobile form', () => {
    const isValidEs = piiPatterns.phoneByLocale.es();
    expect(isValidEs('+34 612 34 56 78')).toBe(true);
    expect(isValidEs('612 34 56 78')).toBe(true);
    expect(isValidEs('not-a-number')).toBe(false);
  });

  it('PT validator accepts a valid PT mobile form', () => {
    const isValidPt = piiPatterns.phoneByLocale.pt();
    expect(isValidPt('+351 912 345 678')).toBe(true);
    expect(isValidPt('912 345 678')).toBe(true);
    expect(isValidPt('not-a-number')).toBe(false);
  });
});

// -----------------------------------------------------------------------
// sanitizePii — per-locale phone redaction (end-to-end)
// -----------------------------------------------------------------------

describe('sanitizePii — French phones (R2)', () => {
  it('redacts "06 12 34 56 78" (2-2-2-2-2 grouping)', () => {
    expect(sanitizePii('Tel: 06 12 34 56 78 disponible')).toBe(
      'Tel: [phone] disponible',
    );
  });

  it('redacts "+33 6 12 34 56 78" (international prefix)', () => {
    expect(sanitizePii('Mobile +33 6 12 34 56 78 aujourdhui')).toBe(
      'Mobile [phone] aujourdhui',
    );
  });

  it('redacts "01 42 34 56 78" (Paris landline)', () => {
    expect(sanitizePii('Bureau 01 42 34 56 78 ouvert')).toBe(
      'Bureau [phone] ouvert',
    );
  });
});

describe('sanitizePii — German phones (R2)', () => {
  it('redacts "030 12345678" (Berlin 3+8 variable)', () => {
    expect(sanitizePii('Telefon 030 12345678 erreichbar')).toBe(
      'Telefon [phone] erreichbar',
    );
  });

  it('redacts "+49 30 12345678" (international prefix)', () => {
    expect(sanitizePii('Mobil +49 30 12345678 heute')).toBe(
      'Mobil [phone] heute',
    );
  });

  it('redacts "+49 176 12345678" (DE mobile)', () => {
    expect(sanitizePii('Handy +49 176 12345678 nachmittags')).toBe(
      'Handy [phone] nachmittags',
    );
  });
});

describe('sanitizePii — UK phones (R2)', () => {
  it('redacts "07911 123456" (UK mobile, Ofcom drama/textbook range)', () => {
    expect(sanitizePii('Mobile 07911 123456 weekdays')).toBe(
      'Mobile [phone] weekdays',
    );
  });

  it('redacts "+44 7911 123456" (international prefix)', () => {
    expect(sanitizePii('Call +44 7911 123456 later')).toBe(
      'Call [phone] later',
    );
  });

  it('redacts "020 7946 0000" (London reserved landline)', () => {
    expect(sanitizePii('Office 020 7946 0000 open')).toBe(
      'Office [phone] open',
    );
  });
});

describe('sanitizePii — Italian phones (R2)', () => {
  it('redacts "+39 320 1234567" (IT mobile with CC)', () => {
    expect(sanitizePii('Cellulare +39 320 1234567 sempre')).toBe(
      'Cellulare [phone] sempre',
    );
  });

  it('redacts "320 1234567" (IT mobile without CC)', () => {
    expect(sanitizePii('Tel 320 1234567 ora')).toBe('Tel [phone] ora');
  });

  it('redacts "+39 06 12345678" (Rome landline with CC)', () => {
    expect(sanitizePii('Ufficio +39 06 12345678 aperto')).toBe(
      'Ufficio [phone] aperto',
    );
  });
});

describe('sanitizePii — Spanish phones (R2)', () => {
  it('redacts "+34 612 34 56 78" (ES mobile 3+2+2+2 after CC)', () => {
    expect(sanitizePii('Móvil +34 612 34 56 78 siempre')).toBe(
      'Móvil [phone] siempre',
    );
  });

  it('redacts "612 34 56 78" (ES mobile without CC)', () => {
    expect(sanitizePii('Tel 612 34 56 78 disponible')).toBe(
      'Tel [phone] disponible',
    );
  });

  it('redacts "+34 91 123 45 67" (Madrid landline)', () => {
    expect(sanitizePii('Oficina +34 91 123 45 67 abierta')).toBe(
      'Oficina [phone] abierta',
    );
  });
});

describe('sanitizePii — Portuguese phones (R2)', () => {
  it('redacts "+351 912 345 678" (PT mobile 3+3+3 after CC)', () => {
    expect(sanitizePii('Telemóvel +351 912 345 678 sempre')).toBe(
      'Telemóvel [phone] sempre',
    );
  });

  it('redacts "912 345 678" (PT mobile without CC)', () => {
    expect(sanitizePii('Tel 912 345 678 disponível')).toBe(
      'Tel [phone] disponível',
    );
  });

  it('redacts "+351 21 123 4567" (Lisbon landline)', () => {
    expect(sanitizePii('Escritório +351 21 123 4567 aberto')).toBe(
      'Escritório [phone] aberto',
    );
  });
});

// -----------------------------------------------------------------------
// NANP backward-compat — v1.0.0 fixtures must remain green
// -----------------------------------------------------------------------

describe('sanitizePii — v1.0.0 NANP backward compatibility (R2 must not regress)', () => {
  it('redacts US-style 10-digit phones with hyphens', () => {
    expect(sanitizePii('Call 555-123-4567 tomorrow.')).toBe(
      'Call [phone] tomorrow.',
    );
  });

  it('redacts parenthesised area code format', () => {
    expect(sanitizePii('Call (555) 123-4567 tomorrow.')).toBe(
      'Call [phone] tomorrow.',
    );
  });

  it('redacts dot-separated phone numbers', () => {
    expect(sanitizePii('Call 555.123.4567 tomorrow.')).toBe(
      'Call [phone] tomorrow.',
    );
  });

  it('redacts +1 US format', () => {
    expect(sanitizePii('Call +1 555 123 4567 today.')).toBe(
      'Call [phone] today.',
    );
  });

  it('phoneInternational factory is still exposed', () => {
    expect(typeof piiPatterns.phoneInternational).toBe('function');
    expect(piiPatterns.phoneInternational()).toBeInstanceOf(RegExp);
  });

  it('phoneDomestic factory is still exposed', () => {
    expect(typeof piiPatterns.phoneDomestic).toBe('function');
    expect(piiPatterns.phoneDomestic()).toBeInstanceOf(RegExp);
  });
});

// -----------------------------------------------------------------------
// Idempotency + order-of-application
// -----------------------------------------------------------------------

describe('sanitizePii — EU phone idempotency + order-of-application', () => {
  it('is idempotent on FR phone (second pass is a no-op)', () => {
    const once = sanitizePii('Tel 06 12 34 56 78 maintenant');
    expect(sanitizePii(once)).toBe(once);
  });

  it('is idempotent on UK phone (second pass is a no-op)', () => {
    const once = sanitizePii('Call 07911 123456 please');
    expect(sanitizePii(once)).toBe(once);
  });

  it('does not double-redact: FR number is not re-consumed by NANP fallback', () => {
    // A FR number like "06 12 34 56 78" is 10 digits grouped 2-2-2-2-2.
    // The NANP fallback `(\d{3}) \d{3} \d{4}` could potentially eat any
    // `12 34 56 78` tail if the locale-aware pass did not redact it first.
    // The locale pass MUST run first and consume the full number. Verified
    // by pure single `[phone]` output — no residual digits.
    const out = sanitizePii('Mobile 06 12 34 56 78 aujourdhui');
    expect(out).toBe('Mobile [phone] aujourdhui');
    // No leftover digit runs.
    expect(out).not.toMatch(/\d/);
  });

  it('does not over-redact non-phone digit runs (false-positive guard)', () => {
    // Adversarial fixture: long digit sequences that are NOT valid phones
    // in any locale. libphonenumber-js validation must reject them.
    const input = 'Product SKU 12345678 and order ID 9876543210 logged.';
    const out = sanitizePii(input);
    // NANP fallback may still match the 10-digit `9876543210` — that's
    // v1.0.0 behaviour and not in R2 scope. The 8-digit SKU must NOT be
    // mis-redacted as a phone by any locale-aware pass.
    expect(out).toContain('12345678');
  });
});

// -----------------------------------------------------------------------
// Cross-locale integration — full EU CV header with phone
// -----------------------------------------------------------------------

describe('sanitizePii — cross-locale integration with EU phones', () => {
  it('redacts full FR CV header (email + address + postcode + phone)', () => {
    const input =
      'Jean Dupont, 12 rue de la Paix, 75001 Paris, jean@example.fr, Tel: 06 12 34 56 78.';
    const once = sanitizePii(input);
    expect(once).toContain('[email]');
    expect(once).toContain('[address]');
    expect(once).toContain('[postcode]');
    expect(once).toContain('[phone]');
    // Idempotent.
    expect(sanitizePii(once)).toBe(once);
  });

  it('redacts full DE CV header with phone', () => {
    const input =
      'Hans Müller, Hauptstraße 23, 80331 München, hans@example.de, Tel: 030 12345678.';
    const once = sanitizePii(input);
    expect(once).toContain('[email]');
    expect(once).toContain('[address]');
    expect(once).toContain('[postcode]');
    expect(once).toContain('[phone]');
    expect(sanitizePii(once)).toBe(once);
  });

  it('redacts full UK CV header with phone', () => {
    const input =
      'John Smith, 10 Downing Street, SW1A 2AA, john@example.co.uk, Tel: 07911 123456.';
    const once = sanitizePii(input);
    expect(once).toContain('[email]');
    expect(once).toContain('[address]');
    expect(once).toContain('[postcode]');
    expect(once).toContain('[phone]');
    expect(sanitizePii(once)).toBe(once);
  });
});
