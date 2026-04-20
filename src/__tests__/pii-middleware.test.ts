import { describe, it, expect } from 'vitest';

import { piiMiddleware } from '../pii-middleware.js';

/**
 * Middleware is request-side only: it transforms the params BEFORE the SDK
 * serialises them to the provider HTTP call. The response path is
 * untouched — response scrubbing is a separate concern handled by
 * consumer-side post-LLM sanitisation (see scoring's
 * `llm-coverage.service.ts:178` for the canonical pattern).
 *
 * Per Vercel AI SDK v4, middleware conforms to `LanguageModelV1Middleware`
 * (see https://github.com/vercel/ai/blob/ai@4.3.19/content/docs/07-reference/01-ai-sdk-core/65-language-model-v1-middleware.mdx).
 * The provider-level `params.prompt` is a low-level array of messages whose
 * content parts are either strings or objects with a `type: 'text'` /
 * `text: string` shape (or image/file parts which we do not touch).
 */

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
  // Integration coverage: verifies that the locale-aware sanitisation
  // added in v1.1 (patterns.ts) flows through the middleware boundary.
  // RED-then-GREEN was already satisfied at the service-layer for the
  // locale patterns (commits a8528b3 → f552d02); these cases are
  // integration tests over already-green implementation and are
  // additive rather than gating per SI-001.

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

// -----------------------------------------------------------------------
// Benchmark — `piiMiddleware.transformParams` end-to-end overhead
//
// (privacyutils#23 IMP-1 Option b — SD-002 review of PR #22.)
//
// The `sanitizePii` regex-only benchmark at
// `src/__tests__/locale-patterns.test.ts` measures a plain 10KB string
// going through the redaction pipeline in isolation. The middleware path
// additionally pays:
//
//   - `JSON.parse(JSON.stringify(params))` deep-clone of the ENTIRE
//     provider-layer `LanguageModelV1CallOptions` (prompt array + nested
//     content parts + sibling fields like `temperature` / `maxTokens`)
//     — see `pii-middleware.ts:38-40` and the `deepClone(params)` call
//     at line 187.
//   - Array traversal over the multi-message `prompt` array (system +
//     user + assistant turns typical of a provider-layer call).
//   - Per-part traversal of `content` array for text / reasoning parts.
//   - Per-call option-object allocation (`PartOptions` bundle).
//
// A compliance-grade library cannot assert "middleware overhead < budget"
// on the strength of a regex-only benchmark — the middleware-level
// overhead is where the JSON-clone cost lives. This benchmark constructs
// a realistic provider-layer shape rather than a synthetic 10KB string.
//
// Shape: system message + user message with array content (3 text parts
// + 1 image part for realism) + assistant history message, total body
// approx 10KB of mixed FR/DE/IT/ES/PT/UK EU PII. We use 10-run warm-up
// (prime JIT) + 10 measured runs, assert the MEAN.
//
// Budget: 20ms. Measured empirically at implementation time well under
// this ceiling — see handover for the documented mean. Loose ceiling
// keeps the test non-flaky on slow CI runners but tight enough that a
// real regression (e.g. someone replaces JSON-clone with a recursive
// structural clone that traverses every byte) would fail the gate.
// -----------------------------------------------------------------------

describe('piiMiddleware.transformParams end-to-end — performance budget', () => {
  it('processes a realistic ~10KB LanguageModelV1CallOptions in under 20ms (mean of 10 runs)', async () => {
    // One message-body block of ~315 chars of mixed EU PII across locales.
    // Repeated at appropriate counts to bring each content part + string
    // content to roughly the 10KB budget across the whole params object.
    const euBlock =
      'Jean Dupont, 12 rue de la Paix, 75001 Paris, jean@example.fr. ' +
      'Hans Müller, Hauptstraße 23, 80331 München, hans@example.de. ' +
      'Giulia Rossi, Via Roma 15, 00100 Roma, giulia@example.it. ' +
      'John Smith, 10 Downing Street, SW1A 2AA, john@example.co.uk. ' +
      'Ana Silva, Rua das Flores 45, 1200-195 Lisboa, ana@example.pt. ' +
      'Nato il 12 marzo 1985. ';
    // Three parts each of ~3.5KB (11 repeats × ~315 chars) + system/user
    // string content = ~10.5KB total redactable text in the params object.
    const partText = euBlock.repeat(11);

    // Realistic provider-layer shape: multi-message prompt (system + user
    // with array content including an image part + assistant history),
    // plus sibling provider fields. Matches the shape the Vercel AI SDK
    // v4 passes to `transformParams` on a real generate / stream call.
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
            // Non-text part — exercises the `leaves non-text parts
            // untouched` code path inside `redactPart`.
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

    // Sanity-check the shape: total redactable text roughly matches the
    // sanitizePii-regex benchmark's ~10KB budget so the two are
    // comparable.
    const totalRedactableBytes = partText.length * 3;
    expect(totalRedactableBytes).toBeGreaterThan(9_000);
    expect(totalRedactableBytes).toBeLessThan(12_000);

    // Warm-up pass (prime JIT + libphonenumber-js metadata load).
    await piiMiddleware.transformParams!({
      type: 'generate',
      params: buildParams() as never,
    });
    // Additional warm-ups — transformParams has non-trivial first-call
    // cost from libphonenumber metadata lazy-load.
    for (let i = 0; i < 3; i += 1) {
      await piiMiddleware.transformParams!({
        type: 'generate',
        params: buildParams() as never,
      });
    }

    // 10 measured runs.
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

    // AC: mean overhead < 20ms on realistic 10KB params. Measured value
    // is documented in `docs/Handover-23.md` so future regressions are
    // visible even when the assertion stays green.
    expect(mean).toBeLessThan(20);
  });
});
