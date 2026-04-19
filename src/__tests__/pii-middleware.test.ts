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
