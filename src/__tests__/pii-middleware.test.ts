import { describe, it, expect } from 'vitest';

import { piiMiddleware } from '../pii-middleware.js';

// Request-side only: the middleware transforms params before the SDK serialises them; response scrubbing is a
// consumer concern. A provider-level `prompt` is an array of messages whose parts are strings or `{ type, text }`.

function textPart(text: string): { type: 'text'; text: string } {
  return { type: 'text', text };
}

describe('piiMiddleware — shape', () => {
  it('exposes a transformParams function', () => {
    expect(typeof piiMiddleware.transformParams).toBe('function');
  });
});

describe('piiMiddleware.transformParams — prompt string', () => {
  it('redacts a top-level prompt string with email + phone', async () => {
    const params = {
      prompt: 'Please review CV for jane@example.com, phone 555-123-4567.',
    };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect(out.prompt).toBe('Please review CV for [email], phone [phone].');
  });

  it('leaves non-PII prompt string unchanged', async () => {
    const params = { prompt: 'Summarise this role for an applicant.' };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect(out.prompt).toBe('Summarise this role for an applicant.');
  });
});

describe('piiMiddleware.transformParams — messages[*].content', () => {
  it('redacts string content on a user message', async () => {
    const params = {
      prompt: [
        {
          role: 'user',
          content: 'Contact applicant at alice@acme.io (555) 123-4567.',
        },
      ],
    };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    const prompt = out.prompt as Array<{ role: string; content: string }>;
    expect(prompt[0].content).toBe('Contact applicant at [email] [phone].');
  });

  it('redacts text parts inside array content', async () => {
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
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    const prompt = out.prompt as Array<{
      role: string;
      content: Array<{ type: string; text: string }>;
    }>;
    expect(prompt[0].content[0].text).toBe('Born [dob], email [email].');
    expect(prompt[0].content[1].text).toBe('Address: [address].');
  });

  it('leaves non-text parts untouched', async () => {
    const params = {
      prompt: [
        {
          role: 'user',
          content: [
            textPart('Attached CV for jane@example.com.'),
            { type: 'image', image: 'https://example.com/img.png' },
          ],
        },
      ],
    };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    const prompt = out.prompt as Array<{
      role: string;
      content: Array<Record<string, unknown>>;
    }>;
    expect(prompt[0].content[0]).toEqual(textPart('Attached CV for [email].'));
    expect(prompt[0].content[1]).toEqual({
      type: 'image',
      image: 'https://example.com/img.png',
    });
  });

  it('redacts a reasoning part', async () => {
    const params = {
      prompt: [
        {
          role: 'assistant',
          content: [{ type: 'reasoning', text: 'User mail is jane@example.com.' }],
        },
      ],
    };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    const prompt = out.prompt as Array<{
      role: string;
      content: Array<{ type: string; text: string }>;
    }>;
    expect(prompt[0]!.content[0]!).toEqual({
      type: 'reasoning',
      text: 'User mail is [email].',
    });
  });

  it('handles multiple messages (system + user + assistant)', async () => {
    const params = {
      prompt: [
        { role: 'system', content: 'You are a CV critic.' },
        { role: 'user', content: 'Review jane@example.com CV.' },
        { role: 'assistant', content: 'Sure, I will review it.' },
      ],
    };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    const prompt = out.prompt as Array<{ role: string; content: string }>;
    expect(prompt[0].content).toBe('You are a CV critic.');
    expect(prompt[1].content).toBe('Review [email] CV.');
    expect(prompt[2].content).toBe('Sure, I will review it.');
  });
});

describe('piiMiddleware.transformParams — type: stream', () => {
  it('applies the same transform to stream-mode calls', async () => {
    const params = {
      prompt: 'Stream this: phone 555-123-4567.',
    };
    const out = await piiMiddleware.transformParams!({
      type: 'stream',
      params: params as never,
    });
    expect(out.prompt).toBe('Stream this: phone [phone].');
  });
});

describe('piiMiddleware.transformParams — locale-aware end-to-end (R1 / #1)', () => {
  it('redacts a full French CV header through the middleware', async () => {
    const params = {
      prompt:
        'Jean Dupont, 12 rue de la Paix, 75001 Paris, jean@example.fr.',
    };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect(out.prompt).toContain('[address]');
    expect(out.prompt).toContain('[postcode]');
    expect(out.prompt).toContain('[email]');
  });

  it('redacts a full German CV header through the middleware', async () => {
    const params = {
      prompt:
        'Hans Müller, Hauptstraße 23, 80331 München, hans@example.de.',
    };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect(out.prompt).toContain('[address]');
    expect(out.prompt).toContain('[postcode]');
    expect(out.prompt).toContain('[email]');
  });

  it('redacts a full Italian CV header through the middleware', async () => {
    const params = {
      prompt: 'Giulia Rossi, Via Roma 15, 00100 Roma, giulia@example.it.',
    };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect(out.prompt).toContain('[address]');
    expect(out.prompt).toContain('[postcode]');
    expect(out.prompt).toContain('[email]');
  });

  it('redacts a full Spanish CV header through the middleware', async () => {
    const params = {
      prompt:
        'Carlos García, Calle Mayor 10, 28013 Madrid, carlos@example.es.',
    };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect(out.prompt).toContain('[address]');
    expect(out.prompt).toContain('[postcode]');
    expect(out.prompt).toContain('[email]');
  });

  it('redacts a full Portuguese CV header through the middleware', async () => {
    const params = {
      prompt:
        'Ana Silva, Rua das Flores 45, 1200-195 Lisboa, ana@example.pt.',
    };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect(out.prompt).toContain('[address]');
    expect(out.prompt).toContain('[postcode]');
    expect(out.prompt).toContain('[email]');
  });

  it('redacts a full UK CV header (alphanumeric postcode) through the middleware', async () => {
    const params = {
      prompt:
        'John Smith, 10 Downing Street, SW1A 2AA, john@example.co.uk.',
    };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect(out.prompt).toContain('[address]');
    expect(out.prompt).toContain('[postcode]');
    expect(out.prompt).toContain('[email]');
  });

  it('redacts locale addresses inside array content parts (provider-layer shape)', async () => {
    const params = {
      prompt: [
        {
          role: 'user',
          content: [
            textPart('Indirizzo: Via Roma 15.'),
            textPart('CAP: 00100 Roma.'),
          ],
        },
      ],
    };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    const prompt = out.prompt as Array<{
      role: string;
      content: Array<{ type: string; text: string }>;
    }>;
    expect(prompt[0].content[0].text).toBe('Indirizzo: [address].');
    expect(prompt[0].content[1].text).toBe('CAP: [postcode].');
  });
});

describe('piiMiddleware.transformParams — non-mutation of input', () => {
  it('does not mutate the caller-provided params object', async () => {
    const params = {
      prompt: 'Email jane@example.com.',
    };
    const snapshot = JSON.stringify(params);
    await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect(JSON.stringify(params)).toBe(snapshot);
  });

  it('preserves other param fields untouched (temperature, maxTokens, etc.)', async () => {
    const params = {
      prompt: 'Hello jane@example.com.',
      temperature: 0.7,
      maxTokens: 500,
      topP: 0.9,
    };
    const out = await piiMiddleware.transformParams!({
      type: 'generate',
      params: params as never,
    });
    expect((out as typeof params).temperature).toBe(0.7);
    expect((out as typeof params).maxTokens).toBe(500);
    expect((out as typeof params).topP).toBe(0.9);
  });
});

// Middleware-level cost on a realistic provider-layer shape (system + user with three text parts and an image +
// assistant history, ~10 KB of mixed EU PII): the JSON deep clone and message traversal that the regex-only
// benchmark in locale-patterns.test.ts does not pay. 20 ms leaves headroom on a slow runner and still catches a
// byte-by-byte structural clone.
describe('piiMiddleware.transformParams end-to-end — performance budget', () => {
  it('processes a realistic ~10KB LanguageModelV1CallOptions in under 20ms (mean of 10 runs)', async () => {
    const euBlock =
      'Jean Dupont, 12 rue de la Paix, 75001 Paris, jean@example.fr. ' +
      'Hans Müller, Hauptstraße 23, 80331 München, hans@example.de. ' +
      'Giulia Rossi, Via Roma 15, 00100 Roma, giulia@example.it. ' +
      'John Smith, 10 Downing Street, SW1A 2AA, john@example.co.uk. ' +
      'Ana Silva, Rua das Flores 45, 1200-195 Lisboa, ana@example.pt. ' +
      'Nato il 12 marzo 1985. ';
    const partText = euBlock.repeat(11);

    const buildParams = (): Record<string, unknown> => ({
      prompt: [
        {
          role: 'system',
          content: 'You are a CV-review assistant. Summarise candidate fit.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: partText },
            { type: 'text', text: partText },
            // The image part exercises the pass-through branch of `redactPart`.
            { type: 'image', image: 'https://example.com/cv.png' },
            { type: 'text', text: partText },
          ],
        },
        {
          role: 'assistant',
          content: 'Acknowledged — reviewing the attached CV now.',
        },
      ],
      temperature: 0.7,
      maxTokens: 1000,
      topP: 0.9,
    });

    // The redactable text matches the regex-only benchmark's ~10 KB so the two numbers are comparable.
    const totalRedactableBytes = partText.length * 3;
    expect(totalRedactableBytes).toBeGreaterThan(9_000);
    expect(totalRedactableBytes).toBeLessThan(12_000);

    // Warm-ups prime the JIT and the lazy libphonenumber metadata load.
    await piiMiddleware.transformParams!({
      type: 'generate',
      params: buildParams() as never,
    });
    for (let i = 0; i < 3; i += 1) {
      await piiMiddleware.transformParams!({
        type: 'generate',
        params: buildParams() as never,
      });
    }

    const runs: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const params = buildParams();
      const t0 = performance.now();
      await piiMiddleware.transformParams!({
        type: 'generate',
        params: params as never,
      });
      runs.push(performance.now() - t0);
    }
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;

    expect(mean).toBeLessThan(20);
  });
});
