import { describe, it, expect } from 'vitest';

import { sanitizePii } from '../sanitize-pii.js';
import { piiMiddleware, createPiiMiddleware } from '../pii-middleware.js';
import type { TokenFormat } from '../token-format.js';

/**
 * Test suite for the `tokenFormat` option (v1.1 — issue #9 / compliance §R8).
 *
 * Design contract:
 *
 *   sanitizePii(text, options?)  — options = { tokenFormat?: 'readable' | 'sentinel' }
 *     - default 'readable' produces v1.0.0 byte-identical output
 *     - 'sentinel' produces low-collision `<<REDACTED_X>>` tokens
 *
 *   createPiiMiddleware(options?) — factory returning LanguageModelV1Middleware
 *     - `piiMiddleware` (exported const) === `createPiiMiddleware()` (default 'readable')
 *     - `createPiiMiddleware({ tokenFormat: 'sentinel' })` threads through to sanitizePii
 *
 * These tests are authored in a RED commit before the GREEN implementation
 * commit (SI-001 — TDD RED → GREEN discipline).
 */

function textPart(text: string): { type: 'text'; text: string } {
  return { type: 'text', text };
}

describe('tokenFormat — type surface', () => {
  it('exports TokenFormat as a union of readable | sentinel', () => {
    // Compile-time only check. If the type export breaks this file stops
    // compiling, giving us an early signal.
    const a: TokenFormat = 'readable';
    const b: TokenFormat = 'sentinel';
    expect([a, b]).toEqual(['readable', 'sentinel']);
  });
});

describe('sanitizePii — default (readable) is v1.0.0 byte-identical', () => {
  it('produces [email] for a plain email with no options argument', () => {
    expect(sanitizePii('Contact me at jane.doe@example.com please.')).toBe(
      'Contact me at [email] please.',
    );
  });

  it('produces [email] when options are an empty object', () => {
    expect(sanitizePii('jane@example.com', {})).toBe('[email]');
  });

  it('produces [email] when tokenFormat is explicitly readable', () => {
    expect(sanitizePii('jane@example.com', { tokenFormat: 'readable' })).toBe(
      '[email]',
    );
  });

  it('produces readable tokens across all token types by default', () => {
    const input =
      'Contact jane@example.com at 42 Baker Street, SW1A 2AA, born 23.05.1985, phone 555-123-4567.';
    const out = sanitizePii(input);
    expect(out).toContain('[email]');
    expect(out).toContain('[address]');
    expect(out).toContain('[postcode]');
    expect(out).toContain('[dob]');
    expect(out).toContain('[phone]');
    expect(out).not.toContain('REDACTED');
  });
});

describe('sanitizePii — sentinel format', () => {
  it('produces <<REDACTED_EMAIL>> for a plain email', () => {
    expect(
      sanitizePii('Contact me at jane.doe@example.com please.', {
        tokenFormat: 'sentinel',
      }),
    ).toBe('Contact me at <<REDACTED_EMAIL>> please.');
  });

  it('produces <<REDACTED_ADDRESS>> for an EN street address', () => {
    expect(
      sanitizePii('Address: 42 Baker Street.', { tokenFormat: 'sentinel' }),
    ).toBe('Address: <<REDACTED_ADDRESS>>.');
  });

  it('produces <<REDACTED_POSTCODE>> for a UK postcode', () => {
    expect(
      sanitizePii('Postcode: SW1A 2AA here.', { tokenFormat: 'sentinel' }),
    ).toBe('Postcode: <<REDACTED_POSTCODE>> here.');
  });

  it('produces <<REDACTED_DOB>> for a DOB', () => {
    expect(
      sanitizePii('Born 23.05.1985 in London.', { tokenFormat: 'sentinel' }),
    ).toBe('Born <<REDACTED_DOB>> in London.');
  });

  it('produces <<REDACTED_PHONE>> for a NANP-shape phone', () => {
    expect(
      sanitizePii('Phone: 555-123-4567 anytime.', {
        tokenFormat: 'sentinel',
      }),
    ).toBe('Phone: <<REDACTED_PHONE>> anytime.');
  });

  it('produces <<REDACTED_PHONE>> for a locale-aware (FR) phone', () => {
    const out = sanitizePii('Téléphone: +33 6 12 34 56 78 disponible.', {
      tokenFormat: 'sentinel',
    });
    expect(out).toContain('<<REDACTED_PHONE>>');
    expect(out).not.toContain('[phone]');
  });

  it('produces <<REDACTED_ADDRESS>> for FR/DE/IT/ES/PT addresses', () => {
    expect(
      sanitizePii('Domicile: 12 rue de la Paix, Paris.', {
        tokenFormat: 'sentinel',
      }),
    ).toContain('<<REDACTED_ADDRESS>>');
    expect(
      sanitizePii('Adresse: Hauptstraße 23 in München.', {
        tokenFormat: 'sentinel',
      }),
    ).toContain('<<REDACTED_ADDRESS>>');
    expect(
      sanitizePii('Indirizzo: Via Roma 15.', { tokenFormat: 'sentinel' }),
    ).toContain('<<REDACTED_ADDRESS>>');
    expect(
      sanitizePii('Dirección: Calle Mayor 10.', { tokenFormat: 'sentinel' }),
    ).toContain('<<REDACTED_ADDRESS>>');
    expect(
      sanitizePii('Morada: Rua das Flores 45.', { tokenFormat: 'sentinel' }),
    ).toContain('<<REDACTED_ADDRESS>>');
  });

  it('produces <<REDACTED_POSTCODE>> for all EU postcode shapes', () => {
    // 5-digit FR/DE/IT/ES + UK alphanumeric + PT NNNN-NNN
    expect(
      sanitizePii('FR: 75001 Paris.', { tokenFormat: 'sentinel' }),
    ).toContain('<<REDACTED_POSTCODE>>');
    expect(
      sanitizePii('DE: 80331 München.', { tokenFormat: 'sentinel' }),
    ).toContain('<<REDACTED_POSTCODE>>');
    expect(
      sanitizePii('UK: SW1A 2AA here.', { tokenFormat: 'sentinel' }),
    ).toContain('<<REDACTED_POSTCODE>>');
    expect(
      sanitizePii('PT: 1200-195 Lisboa.', { tokenFormat: 'sentinel' }),
    ).toContain('<<REDACTED_POSTCODE>>');
  });

  it('produces only sentinel tokens — no [readable] tokens in output', () => {
    const input =
      'Contact jane@example.com at 42 Baker Street, SW1A 2AA, born 23.05.1985, phone 555-123-4567.';
    const out = sanitizePii(input, { tokenFormat: 'sentinel' });
    expect(out).toContain('<<REDACTED_EMAIL>>');
    expect(out).toContain('<<REDACTED_ADDRESS>>');
    expect(out).toContain('<<REDACTED_POSTCODE>>');
    expect(out).toContain('<<REDACTED_DOB>>');
    expect(out).toContain('<<REDACTED_PHONE>>');
    // None of the readable tokens leak through.
    expect(out).not.toContain('[email]');
    expect(out).not.toContain('[address]');
    expect(out).not.toContain('[postcode]');
    expect(out).not.toContain('[dob]');
    expect(out).not.toContain('[phone]');
  });
});

describe('sanitizePii — idempotency (both formats)', () => {
  it('readable: sanitizePii(sanitizePii(x)) === sanitizePii(x)', () => {
    const input =
      'Contact jane@example.com at 42 Baker Street, SW1A 2AA, born 23.05.1985, phone 555-123-4567.';
    const once = sanitizePii(input);
    const twice = sanitizePii(once);
    expect(twice).toBe(once);
  });

  it('sentinel: sanitizePii(sanitizePii(x, sentinel), sentinel) === sanitizePii(x, sentinel)', () => {
    const input =
      'Contact jane@example.com at 42 Baker Street, SW1A 2AA, born 23.05.1985, phone 555-123-4567.';
    const once = sanitizePii(input, { tokenFormat: 'sentinel' });
    const twice = sanitizePii(once, { tokenFormat: 'sentinel' });
    expect(twice).toBe(once);
  });

  it('sentinel tokens survive a readable-format second pass unchanged', () => {
    // Mixed-mode: if a consumer sanitizes once in sentinel and the
    // downstream path runs default readable sanitize over the same text,
    // the sentinels must not decay (they must not contain email/phone/
    // address/dob/postcode shapes that match the readable-format
    // patterns).
    const sentinelised = sanitizePii(
      'Contact jane@example.com at 42 Baker Street, SW1A 2AA, born 23.05.1985, phone 555-123-4567.',
      { tokenFormat: 'sentinel' },
    );
    const secondPassReadable = sanitizePii(sentinelised);
    expect(secondPassReadable).toBe(sentinelised);
  });

  it('sentinel tokens do not match any redaction pattern when standalone', () => {
    const sentinels =
      '<<REDACTED_EMAIL>> <<REDACTED_PHONE>> <<REDACTED_ADDRESS>> <<REDACTED_POSTCODE>> <<REDACTED_DOB>>';
    // A second pass in either format must be a strict no-op.
    expect(sanitizePii(sentinels)).toBe(sentinels);
    expect(sanitizePii(sentinels, { tokenFormat: 'sentinel' })).toBe(sentinels);
  });
});

describe('sanitizePii — empty / null safety (parity across formats)', () => {
  it('returns empty string for empty input in both formats', () => {
    expect(sanitizePii('')).toBe('');
    expect(sanitizePii('', { tokenFormat: 'sentinel' })).toBe('');
  });

  it('returns empty string for null / undefined input in both formats', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizePii(null as any)).toBe('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizePii(null as any, { tokenFormat: 'sentinel' })).toBe('');
  });
});

describe('createPiiMiddleware — factory API', () => {
  it('exports a createPiiMiddleware function', () => {
    expect(typeof createPiiMiddleware).toBe('function');
  });

  it('returns a middleware with transformParams when called with no args', () => {
    const mw = createPiiMiddleware();
    expect(typeof mw.transformParams).toBe('function');
  });

  it('returns a middleware with transformParams when called with tokenFormat sentinel', () => {
    const mw = createPiiMiddleware({ tokenFormat: 'sentinel' });
    expect(typeof mw.transformParams).toBe('function');
  });
});

describe('piiMiddleware (default export) — backward-compat readable behaviour', () => {
  it('redacts prompt string with readable tokens (no option passed)', async () => {
    const params = {
      prompt: 'Please review CV for jane@example.com, phone 555-123-4567.',
    };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect(out.prompt).toBe('Please review CV for [email], phone [phone].');
  });
});

describe('createPiiMiddleware({ tokenFormat: "sentinel" })', () => {
  it('redacts prompt string with sentinel tokens', async () => {
    const mw = createPiiMiddleware({ tokenFormat: 'sentinel' });
    const params = {
      prompt: 'Please review CV for jane@example.com, phone 555-123-4567.',
    };
    const out = await mw.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect(out.prompt).toBe(
      'Please review CV for <<REDACTED_EMAIL>>, phone <<REDACTED_PHONE>>.',
    );
  });

  it('redacts array-shape message content with sentinel tokens', async () => {
    const mw = createPiiMiddleware({ tokenFormat: 'sentinel' });
    const params = {
      prompt: [
        {
          role: 'user',
          content: [
            textPart('Born 23.05.1985, email jane@example.com.'),
            textPart('Address: 42 Baker Street.'),
          ],
        },
      ],
    };
    const out = await mw.transformParams!({
      type: 'generate',
      params: params as never,
    });
    const prompt = out.prompt as Array<{
      role: string;
      content: Array<{ type: string; text: string }>;
    }>;
    expect(prompt[0].content[0].text).toBe(
      'Born <<REDACTED_DOB>>, email <<REDACTED_EMAIL>>.',
    );
    expect(prompt[0].content[1].text).toBe(
      'Address: <<REDACTED_ADDRESS>>.',
    );
  });

  it('redacts string-shape message content with sentinel tokens', async () => {
    const mw = createPiiMiddleware({ tokenFormat: 'sentinel' });
    const params = {
      prompt: [
        {
          role: 'user',
          content: 'Contact applicant at alice@acme.io (555) 123-4567.',
        },
      ],
    };
    const out = await mw.transformParams!({
      type: 'generate',
      params: params as never,
    });
    const prompt = out.prompt as Array<{ role: string; content: string }>;
    expect(prompt[0].content).toBe(
      'Contact applicant at <<REDACTED_EMAIL>> <<REDACTED_PHONE>>.',
    );
  });

  it('preserves non-mutation of caller params even with sentinel option', async () => {
    const mw = createPiiMiddleware({ tokenFormat: 'sentinel' });
    const params = { prompt: 'Email jane@example.com.' };
    const snapshot = JSON.stringify(params);
    await mw.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect(JSON.stringify(params)).toBe(snapshot);
  });
});

describe('createPiiMiddleware — default (no options / readable)', () => {
  it('createPiiMiddleware() is equivalent to piiMiddleware (readable)', async () => {
    const mw = createPiiMiddleware();
    const params = { prompt: 'Email: jane@example.com phone 555-123-4567.' };
    const outExplicit = await mw.transformParams!({
      type: 'generate',
      params: params as never,
    });
    const outImplicit = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect(outExplicit.prompt).toEqual(outImplicit.prompt);
    expect(outExplicit.prompt).toBe(
      'Email: [email] phone [phone].',
    );
  });

  it('createPiiMiddleware({ tokenFormat: "readable" }) produces readable tokens', async () => {
    const mw = createPiiMiddleware({ tokenFormat: 'readable' });
    const params = { prompt: 'Hi jane@example.com.' };
    const out = await mw.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect(out.prompt).toBe('Hi [email].');
  });
});
