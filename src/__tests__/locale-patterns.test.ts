import { describe, it, expect } from 'vitest';

import { sanitizePii } from '../sanitize-pii.js';
import { piiPatterns } from '../patterns.js';

/**
 * Test suite for R1 (locale-aware postal addresses) — v1.1 additive.
 *
 * Closes the largest single recall gap flagged in the v1.0.0 review:
 * v1.0.0 was English-only, number-first; v1.1 adds:
 *
 *   - `piiPatterns.addressByLocale.en()/.fr()/.de()/.it()/.es()/.pt()` —
 *     factory functions per locale (IMP-1 consistent — fresh `/g` RegExp on
 *     every call so programmatic consumers never share `lastIndex` state).
 *   - `piiPatterns.postcodeByLocale.uk()/.fr()/.de()/.it()/.es()/.pt()` —
 *     bare postcode factories. Non-ASCII postcodes (UK alphanumeric, PT
 *     NNNN-NNN) and 5-digit continental codes with a following city-style
 *     capitalized word.
 *
 * Backward-compatibility (documented in `docs/Handover-1.md` § Deviation):
 *
 *   - `piiPatterns.address` is preserved and now aliases
 *     `piiPatterns.addressByLocale.en` — the exported English-only v1.0.0
 *     `addressPattern` function object is the same identity as
 *     `addressByLocale.en`. Every v1.0.0 fixture must remain green.
 *
 * Replacement tokens:
 *   - All locale addresses: `[address]` (same token as v1.0.0; consistent
 *     downstream).
 *   - Bare postcodes: `[postcode]` (NEW token in v1.1; additive — no
 *     collision with existing tokens).
 *
 * Order-of-application (updated in `sanitizePii`):
 *   1. email
 *   2. addresses — all locales (en → fr → de → it → es → pt). Running the
 *      locale union BEFORE postcodes is mandatory: a full French address
 *      like "12 rue de la Paix, 75001 Paris" must have the street run
 *      consumed first, then the residual "75001 Paris" redacted as postcode.
 *   3. postcodes — uk, fr, de, it, es, pt.
 *   4. international phone, 5. domestic phone — unchanged.
 *   6. dob — last, unchanged.
 *
 * Test fixtures are synthetic (no real PII). Street names, postcodes, and
 * city combinations are drawn from public landmarks / non-residential
 * addresses to avoid accidentally reproducing anyone's real home address.
 */

// -----------------------------------------------------------------------
// Factory API — dictionary shape + IMP-1 freshness invariants
// -----------------------------------------------------------------------

describe('piiPatterns.addressByLocale — dictionary shape + IMP-1 factories', () => {
  it('exposes en/fr/de/it/es/pt factory functions', () => {
    expect(typeof piiPatterns.addressByLocale.en).toBe('function');
    expect(typeof piiPatterns.addressByLocale.fr).toBe('function');
    expect(typeof piiPatterns.addressByLocale.de).toBe('function');
    expect(typeof piiPatterns.addressByLocale.it).toBe('function');
    expect(typeof piiPatterns.addressByLocale.es).toBe('function');
    expect(typeof piiPatterns.addressByLocale.pt).toBe('function');
  });

  it('each locale factory returns a fresh /g RegExp on every call', () => {
    for (const locale of ['en', 'fr', 'de', 'it', 'es', 'pt'] as const) {
      const a = piiPatterns.addressByLocale[locale]();
      const b = piiPatterns.addressByLocale[locale]();
      expect(a).toBeInstanceOf(RegExp);
      expect(a.flags).toContain('g');
      expect(a).not.toBe(b);
      // Advance lastIndex on `a` and confirm `b` is still fresh.
      a.test('probe');
      expect(b.lastIndex).toBe(0);
    }
  });

  it('piiPatterns.address remains callable as the EN factory (backward compat)', () => {
    // v1.0.0 exported `piiPatterns.address` as the English address factory.
    // v1.1 aliases it to `piiPatterns.addressByLocale.en`. External callers
    // of `piiPatterns.address()` must continue to work byte-equivalent.
    expect(typeof piiPatterns.address).toBe('function');
    expect(piiPatterns.address).toBe(piiPatterns.addressByLocale.en);
  });
});

describe('piiPatterns.postcodeByLocale — dictionary shape + IMP-1 factories', () => {
  it('exposes uk/fr/de/it/es/pt factory functions', () => {
    expect(typeof piiPatterns.postcodeByLocale.uk).toBe('function');
    expect(typeof piiPatterns.postcodeByLocale.fr).toBe('function');
    expect(typeof piiPatterns.postcodeByLocale.de).toBe('function');
    expect(typeof piiPatterns.postcodeByLocale.it).toBe('function');
    expect(typeof piiPatterns.postcodeByLocale.es).toBe('function');
    expect(typeof piiPatterns.postcodeByLocale.pt).toBe('function');
  });

  it('each locale postcode factory returns a fresh /g RegExp on every call', () => {
    for (const locale of ['uk', 'fr', 'de', 'it', 'es', 'pt'] as const) {
      const a = piiPatterns.postcodeByLocale[locale]();
      const b = piiPatterns.postcodeByLocale[locale]();
      expect(a).toBeInstanceOf(RegExp);
      expect(a.flags).toContain('g');
      expect(a).not.toBe(b);
      a.test('probe 10000');
      expect(b.lastIndex).toBe(0);
    }
  });
});

// -----------------------------------------------------------------------
// Address redaction — per locale (via sanitizePii end-to-end)
// -----------------------------------------------------------------------

describe('sanitizePii — French addresses (R1)', () => {
  it('redacts "12 rue de la Paix"', () => {
    expect(sanitizePii('Adresse: 12 rue de la Paix, Paris.')).toBe(
      'Adresse: [address], Paris.',
    );
  });

  it('redacts "5 Boulevard Saint-Germain"', () => {
    expect(sanitizePii('vis au 5 Boulevard Saint-Germain aujourdhui')).toBe(
      'vis au [address] aujourdhui',
    );
  });

  it('redacts "3 avenue des Champs-Élysées" (hyphen + accent)', () => {
    expect(sanitizePii('bureau 3 avenue des Champs-Élysées ouvert')).toBe(
      'bureau [address] ouvert',
    );
  });

  it('redacts "7 bis rue Lafayette" (bis modifier)', () => {
    expect(sanitizePii('nous habitons 7 bis rue Lafayette depuis 2020')).toBe(
      'nous habitons [address] depuis 2020',
    );
  });

  it('redacts "14 place de la République"', () => {
    expect(sanitizePii('rendez-vous 14 place de la République demain')).toBe(
      'rendez-vous [address] demain',
    );
  });
});

describe('sanitizePii — German addresses (R1)', () => {
  it('redacts "Hauptstraße 23" (-straße suffix)', () => {
    expect(sanitizePii('Büro: Hauptstraße 23 in Berlin.')).toBe(
      'Büro: [address] in Berlin.',
    );
  });

  it('redacts "Goethestrasse 45" (-strasse suffix, Swiss spelling)', () => {
    expect(sanitizePii('Gesendet von Goethestrasse 45 gestern.')).toBe(
      'Gesendet von [address] gestern.',
    );
  });

  it('redacts "Müllerstr. 12" (-str. abbreviation)', () => {
    expect(sanitizePii('Wohnt in Müllerstr. 12 heute.')).toBe(
      'Wohnt in [address] heute.',
    );
  });

  it('redacts "Alexanderplatz 5" (-platz suffix)', () => {
    expect(sanitizePii('Treffen am Alexanderplatz 5 um 10 Uhr.')).toBe(
      'Treffen am [address] um 10 Uhr.',
    );
  });

  it('redacts "Lindenallee 8" (-allee suffix)', () => {
    expect(sanitizePii('Besuch: Lindenallee 8 nächste Woche.')).toBe(
      'Besuch: [address] nächste Woche.',
    );
  });
});

describe('sanitizePii — Italian addresses (R1)', () => {
  it('redacts "Via Roma 15"', () => {
    expect(sanitizePii('Ufficio in Via Roma 15 a Milano.')).toBe(
      'Ufficio in [address] a Milano.',
    );
  });

  it('redacts "Piazza del Duomo 7"', () => {
    expect(sanitizePii('Ci vediamo in Piazza del Duomo 7 alle 18.')).toBe(
      'Ci vediamo in [address] alle 18.',
    );
  });

  it('redacts "Corso Vittorio Emanuele 12"', () => {
    expect(sanitizePii('Sede in Corso Vittorio Emanuele 12 a Torino.')).toBe(
      'Sede in [address] a Torino.',
    );
  });

  it('redacts "Viale della Libertà 23"', () => {
    expect(sanitizePii('Abito in Viale della Libertà 23 da tanti anni.')).toBe(
      'Abito in [address] da tanti anni.',
    );
  });
});

describe('sanitizePii — Italian Via false-positive fixtures (#23 MIN-1)', () => {
  /**
   * Adversarial cases pinning the precision boundary of `addressItPattern`.
   *
   * Source: privacyutils#23 — SD-002 review of PR #22 (R1 locale addresses)
   * flagged the Italian `Via` prefix as the locale with the highest
   * false-positive risk. The pattern requires a trailing `\d{1,4}` house
   * number *after* 1-5 name tokens, which strongly constrains false matches
   * but does not eliminate them for astronomical / semantic "Via" usages.
   *
   * The three pinned cases below document the pattern's current behaviour
   * so future tuning cannot silently regress either precision or recall.
   */

  it('does NOT redact "Via Lattea visible from the observatory" (no trailing house number — pattern precision preserved)', () => {
    // "Via Lattea" = Italian for "Milky Way" — a common semantic use of
    // `Via` with a capitalised celestial-body name but no trailing digit.
    // addressItPattern requires `\s+\d{1,4}\b` at the end; absence of the
    // digit means no match. Verified empirically before RED→GREEN pin.
    expect(
      sanitizePii('Via Lattea visible from the observatory.'),
    ).toBe('Via Lattea visible from the observatory.');
  });

  it('does NOT redact lowercase "accessed via port 443" (word-boundary + case discipline)', () => {
    // Lowercase `via` (preposition) is outside the closed alternation set
    // of address-prefix keywords which all start with a capital letter
    // (Via|Viale|Corso|Piazza|...). The leading `\b` and the case-sensitive
    // alternation together guarantee the English preposition is never
    // treated as an Italian address keyword. Pinning the negative case
    // protects against future refactors that might add a case-insensitive
    // flag or widen the alternation to lowercase forms.
    expect(sanitizePii('accessed via port 443')).toBe(
      'accessed via port 443',
    );
  });

  it('DOES redact "Via Lattea 5 telescope array" (privacy-over-precision — structurally ambiguous with a real address)', () => {
    // Adversarial case. "Via Lattea 5" is structurally indistinguishable
    // from a legitimate Italian street address: `Via` + capitalised name
    // + 1-4 digit number. The pattern's precision boundary is "structural
    // shape", not "semantic meaning" — a regex cannot disambiguate between
    // a fictional astronomical reference and a real postal address.
    //
    // Design decision (pinned here per issue #23): privacy-over-precision.
    // A one-way redaction library is deliberately conservative — a
    // false-positive redaction on rare astronomical / semantic "Via X N"
    // phrases is preferable to a recall gap on a real Italian address.
    // The downstream cost of a redacted "Via Lattea 5" in a CV-scoring
    // prompt is zero; the downstream cost of a leaked "Via Roma 15" is
    // a GDPR Art. 5(1)(c) / Art. 32 incident.
    //
    // If this trade ever flips (e.g. a consumer hits material precision
    // loss on astronomical fixtures), the narrow fix is to require an
    // Italian city / locality context window after the number — out of
    // scope for v1.1 patch work. Not changing the pattern here; pinning
    // the behaviour.
    expect(sanitizePii('Via Lattea 5 telescope array')).toBe(
      '[address] telescope array',
    );
  });
});

describe('sanitizePii — Spanish addresses (R1)', () => {
  it('redacts "Calle Mayor 10"', () => {
    expect(sanitizePii('Vivo en Calle Mayor 10 ahora.')).toBe(
      'Vivo en [address] ahora.',
    );
  });

  it('redacts "Avenida de la Constitución 5"', () => {
    expect(sanitizePii('Oficina en Avenida de la Constitución 5 abierta.')).toBe(
      'Oficina en [address] abierta.',
    );
  });

  it('redacts "Plaza España 3"', () => {
    expect(sanitizePii('Quedamos en Plaza España 3 mañana.')).toBe(
      'Quedamos en [address] mañana.',
    );
  });

  it('redacts "Paseo de la Castellana 45"', () => {
    expect(sanitizePii('Sede en Paseo de la Castellana 45 en Madrid.')).toBe(
      'Sede en [address] en Madrid.',
    );
  });

  it('redacts "Av. Diagonal 220" (Av. abbreviation)', () => {
    expect(sanitizePii('Dirección: Av. Diagonal 220 Barcelona.')).toBe(
      'Dirección: [address] Barcelona.',
    );
  });
});

describe('sanitizePii — Portuguese addresses (R1)', () => {
  it('redacts "Rua das Flores 45"', () => {
    expect(sanitizePii('Moro na Rua das Flores 45 agora.')).toBe(
      'Moro na [address] agora.',
    );
  });

  it('redacts "Avenida da Liberdade 110"', () => {
    expect(sanitizePii('Escritório na Avenida da Liberdade 110 aberto.')).toBe(
      'Escritório na [address] aberto.',
    );
  });

  it('redacts "Praça do Comércio 5"', () => {
    expect(sanitizePii('Encontramo-nos na Praça do Comércio 5 amanhã.')).toBe(
      'Encontramo-nos na [address] amanhã.',
    );
  });

  it('redacts "Largo do Carmo 12"', () => {
    expect(sanitizePii('Visita ao Largo do Carmo 12 marcada.')).toBe(
      'Visita ao [address] marcada.',
    );
  });
});

// -----------------------------------------------------------------------
// Postcode redaction — per locale
// -----------------------------------------------------------------------

describe('sanitizePii — UK postcodes (R1)', () => {
  it('redacts "SW1A 2AA" (Westminster-style)', () => {
    expect(sanitizePii('Office at SW1A 2AA for mail.')).toBe(
      'Office at [postcode] for mail.',
    );
  });

  it('redacts "EC1A 1BB" (outward-inward code)', () => {
    expect(sanitizePii('Post to EC1A 1BB if unclear.')).toBe(
      'Post to [postcode] if unclear.',
    );
  });

  it('redacts "M1 1AE" (single-letter outward)', () => {
    expect(sanitizePii('Mail: M1 1AE Manchester branch.')).toBe(
      'Mail: [postcode] Manchester branch.',
    );
  });

  it('redacts "W1A 0AX"', () => {
    expect(sanitizePii('Broadcast House, W1A 0AX.')).toBe(
      'Broadcast House, [postcode].',
    );
  });
});

describe('sanitizePii — French postcodes (R1)', () => {
  it('redacts "75001 Paris" (5-digit + city)', () => {
    expect(sanitizePii('Courrier: 75001 Paris.')).toBe('Courrier: [postcode].');
  });

  it('redacts "69002 Lyon"', () => {
    expect(sanitizePii('Adresse postale 69002 Lyon confirmée.')).toBe(
      'Adresse postale [postcode] confirmée.',
    );
  });

  it('does not over-redact bare 5-digit numbers without city context', () => {
    // 12345 as a product code / order number should not be mis-redacted.
    expect(sanitizePii('Order number 12345 placed successfully.')).toBe(
      'Order number 12345 placed successfully.',
    );
  });
});

describe('sanitizePii — German postcodes (R1)', () => {
  it('redacts "80331 München"', () => {
    expect(sanitizePii('Anschrift: 80331 München für Pakete.')).toBe(
      'Anschrift: [postcode] für Pakete.',
    );
  });

  it('redacts "10115 Berlin"', () => {
    expect(sanitizePii('Post an 10115 Berlin senden.')).toBe(
      'Post an [postcode] senden.',
    );
  });
});

describe('sanitizePii — Italian postcodes (R1)', () => {
  it('redacts "00100 Roma"', () => {
    expect(sanitizePii('Indirizzo: 00100 Roma confermato.')).toBe(
      'Indirizzo: [postcode] confermato.',
    );
  });

  it('redacts "20121 Milano"', () => {
    expect(sanitizePii('Spedito a 20121 Milano ieri.')).toBe(
      'Spedito a [postcode] ieri.',
    );
  });
});

describe('sanitizePii — Spanish postcodes (R1)', () => {
  it('redacts "28013 Madrid"', () => {
    expect(sanitizePii('Dirección 28013 Madrid registrada.')).toBe(
      'Dirección [postcode] registrada.',
    );
  });

  it('redacts "08001 Barcelona"', () => {
    expect(sanitizePii('Envío a 08001 Barcelona.')).toBe(
      'Envío a [postcode].',
    );
  });
});

describe('sanitizePii — Portuguese postcodes (R1)', () => {
  it('redacts "1200-195 Lisboa" (NNNN-NNN)', () => {
    expect(sanitizePii('Morada: 1200-195 Lisboa.')).toBe(
      'Morada: [postcode].',
    );
  });

  it('redacts "4050-123 Porto"', () => {
    expect(sanitizePii('Envio para 4050-123 Porto amanhã.')).toBe(
      'Envio para [postcode] amanhã.',
    );
  });

  it('redacts bare PT postcode even without city (4-3 format is distinctive)', () => {
    // PT postcodes are distinctive enough (NNNN-NNN) that context is not
    // required to distinguish from generic numbers.
    expect(sanitizePii('Código postal: 1200-195.')).toBe(
      'Código postal: [postcode].',
    );
  });
});

// -----------------------------------------------------------------------
// Cross-locale integration — full EU-style CV header
// -----------------------------------------------------------------------

describe('sanitizePii — multi-locale integration', () => {
  it('redacts a full FR CV header (address + postcode + city + email)', () => {
    const input =
      'Jean Dupont, 12 rue de la Paix, 75001 Paris, jean@example.fr.';
    const once = sanitizePii(input);
    expect(once).toContain('[address]');
    expect(once).toContain('[postcode]');
    expect(once).toContain('[email]');
    // Idempotent.
    expect(sanitizePii(once)).toBe(once);
  });

  it('redacts a full DE CV header', () => {
    const input = 'Hans Müller, Hauptstraße 23, 80331 München, hans@example.de.';
    const once = sanitizePii(input);
    expect(once).toContain('[address]');
    expect(once).toContain('[postcode]');
    expect(once).toContain('[email]');
    expect(sanitizePii(once)).toBe(once);
  });

  it('redacts a full IT CV header', () => {
    const input = 'Giulia Rossi, Via Roma 15, 00100 Roma, giulia@example.it.';
    const once = sanitizePii(input);
    expect(once).toContain('[address]');
    expect(once).toContain('[postcode]');
    expect(once).toContain('[email]');
    expect(sanitizePii(once)).toBe(once);
  });

  it('redacts a full ES CV header', () => {
    const input = 'Carlos García, Calle Mayor 10, 28013 Madrid, carlos@example.es.';
    const once = sanitizePii(input);
    expect(once).toContain('[address]');
    expect(once).toContain('[postcode]');
    expect(once).toContain('[email]');
    expect(sanitizePii(once)).toBe(once);
  });

  it('redacts a full PT CV header', () => {
    const input =
      'Ana Silva, Rua das Flores 45, 1200-195 Lisboa, ana@example.pt.';
    const once = sanitizePii(input);
    expect(once).toContain('[address]');
    expect(once).toContain('[postcode]');
    expect(once).toContain('[email]');
    expect(sanitizePii(once)).toBe(once);
  });

  it('redacts a full UK CV header', () => {
    const input =
      'John Smith, 10 Downing Street, SW1A 2AA, john@example.co.uk.';
    const once = sanitizePii(input);
    expect(once).toContain('[address]');
    expect(once).toContain('[postcode]');
    expect(once).toContain('[email]');
    expect(sanitizePii(once)).toBe(once);
  });
});

// -----------------------------------------------------------------------
// Backward compatibility — v1.0.0 fixtures must remain green
// -----------------------------------------------------------------------

describe('sanitizePii — v1.0.0 backward compatibility (no regression on EN fixtures)', () => {
  it('redacts "42 Baker Street" (EN canonical)', () => {
    expect(sanitizePii('Lived at 42 Baker Street for years.')).toBe(
      'Lived at [address] for years.',
    );
  });

  it('redacts "1600 Pennsylvania Avenue"', () => {
    expect(sanitizePii('1600 Pennsylvania Avenue is famous.')).toBe(
      '[address] is famous.',
    );
  });

  it('redacts "42 McLane Drive" (CRIT-2 mixed-case)', () => {
    expect(sanitizePii('Lives at 42 McLane Drive nowadays.')).toBe(
      'Lives at [address] nowadays.',
    );
  });

  it('preserves non-PII text (no false positives from new locale patterns)', () => {
    const clean =
      'Senior Software Engineer with 10 years of experience in TypeScript, ' +
      'React, and distributed systems. Delivered a 40% performance uplift.';
    expect(sanitizePii(clean)).toBe(clean);
  });
});

// -----------------------------------------------------------------------
// Benchmark — `sanitizePii` regex-only overhead (AC: <10ms on 10KB prompt)
//
// This benchmark measures the regex pipeline cost on a plain 10KB string.
// It does NOT include the deep-clone / multi-message traversal overhead
// introduced by `piiMiddleware.transformParams` — that is covered by the
// middleware-level benchmark in `src/__tests__/pii-middleware.test.ts`
// (per privacyutils#23 IMP-1 Option b — SD-002 review of PR #22).
// -----------------------------------------------------------------------

describe('sanitizePii regex-only — performance budget', () => {
  it('processes a 10KB prompt in under 10ms (mean of 10 runs)', () => {
    // Build a ~10KB prompt by repeating a representative EU CV block.
    const block =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
      'Jean Dupont, 12 rue de la Paix, 75001 Paris, jean@example.fr. ' +
      'Hans Müller, Hauptstraße 23, 80331 München, hans@example.de. ' +
      'Experience: Senior Engineer, 10 years TypeScript. ' +
      'Nato il 12 marzo 1985 a Roma. ' +
      'Mail: alice@example.co.uk. ' +
      'Phone: 555-123-4567. ';
    // ~310 chars per block → 33 repeats ≈ 10KB.
    const prompt = block.repeat(33);
    expect(prompt.length).toBeGreaterThan(9_000);
    expect(prompt.length).toBeLessThan(12_000);

    // Warm-up pass (JIT) + 10 measured runs.
    sanitizePii(prompt);
    const runs: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const t0 = performance.now();
      sanitizePii(prompt);
      runs.push(performance.now() - t0);
    }
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;

    // AC: mean overhead <10ms on 10KB.
    expect(mean).toBeLessThan(10);
  });
});
