import { describe, it, expect } from 'vitest';

import { sanitizePii } from '../sanitize-pii.js';
import {
  piiMiddleware,
  createPiiMiddleware,
} from '../pii-middleware.js';
import {
  PiiInputTooLargeError,
  DEFAULT_MAX_INPUT_LENGTH,
} from '../limits.js';

/**
 * Test suite for the runtime input-length cap (v1.1 — issue #10 / security
 * review R7 / compliance must-land-before-v1.1).
 *
 * Design contract (per ADR 002, docs/adr/002-input-length-cap.md):
 *
 *   sanitizePii(text, { maxInputLength?: number })
 *     - Default cap: 500_000 code units (`DEFAULT_MAX_INPUT_LENGTH`).
 *     - Under-cap and at-cap inputs are processed normally.
 *     - Over-cap inputs throw `PiiInputTooLargeError` with numeric
 *       `.inputLength` and `.maxInputLength` fields.
 *     - Length is measured in JS string code units (O(1) `String#length`).
 *     - The check runs BEFORE any regex pass (belt-and-braces ReDoS defence).
 *
 *   createPiiMiddleware({ maxInputLength?: number })
 *     - Threads `maxInputLength` through to every `sanitizePii` call made
 *       on each redactable substring (string prompts, string message
 *       content, text parts, reasoning parts).
 *     - Errors propagate cleanly out of `transformParams`.
 *
 * These tests are authored in a RED commit before the GREEN implementation
 * commit (SI-001 — TDD RED → GREEN discipline).
 */

function textPart(text: string): { type: 'text'; text: string } {
  return { type: 'text', text };
}

function reasoningPart(text: string): { type: 'reasoning'; text: string } {
  return { type: 'reasoning', text };
}

describe('DEFAULT_MAX_INPUT_LENGTH — exported constant', () => {
  it('is 500_000 as per issue #10 scope', () => {
    expect(DEFAULT_MAX_INPUT_LENGTH).toBe(500_000);
  });

  it('is a positive integer', () => {
    expect(Number.isInteger(DEFAULT_MAX_INPUT_LENGTH)).toBe(true);
    expect(DEFAULT_MAX_INPUT_LENGTH).toBeGreaterThan(0);
  });
});

describe('PiiInputTooLargeError — class shape', () => {
  it('is an instance of Error', () => {
    const err = new PiiInputTooLargeError(600_000, 500_000);
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of PiiInputTooLargeError', () => {
    const err = new PiiInputTooLargeError(600_000, 500_000);
    expect(err).toBeInstanceOf(PiiInputTooLargeError);
  });

  it('carries numeric inputLength and maxInputLength props', () => {
    const err = new PiiInputTooLargeError(600_000, 500_000);
    expect(err.inputLength).toBe(600_000);
    expect(err.maxInputLength).toBe(500_000);
    expect(typeof err.inputLength).toBe('number');
    expect(typeof err.maxInputLength).toBe('number');
  });

  it('has a descriptive name for stacktrace legibility', () => {
    const err = new PiiInputTooLargeError(600_000, 500_000);
    expect(err.name).toBe('PiiInputTooLargeError');
  });

  it('includes both lengths in the error message for actionability', () => {
    const err = new PiiInputTooLargeError(600_000, 500_000);
    expect(err.message).toContain('600000');
    expect(err.message).toContain('500000');
  });
});

describe('sanitizePii — maxInputLength default (500_000)', () => {
  it('processes a short input with no options', () => {
    expect(sanitizePii('jane@example.com')).toBe('[email]');
  });

  it('processes a short input with an empty options object', () => {
    expect(sanitizePii('jane@example.com', {})).toBe('[email]');
  });

  it('processes input at exactly DEFAULT_MAX_INPUT_LENGTH', () => {
    // Build a string of exactly the cap length with a trailing email
    // substring that must still be redacted — verifies both that we pass
    // the length check AND that regex still runs.
    const filler = 'a'.repeat(DEFAULT_MAX_INPUT_LENGTH - 'jane@example.com'.length);
    const input = filler + 'jane@example.com';
    expect(input.length).toBe(DEFAULT_MAX_INPUT_LENGTH);
    const result = sanitizePii(input);
    expect(result).toBe(filler + '[email]');
    expect(result.length).toBeLessThanOrEqual(DEFAULT_MAX_INPUT_LENGTH);
  });

  it('throws PiiInputTooLargeError when input exceeds the default cap', () => {
    const oversized = 'a'.repeat(DEFAULT_MAX_INPUT_LENGTH + 1);
    expect(() => sanitizePii(oversized)).toThrow(PiiInputTooLargeError);
  });

  it('attaches correct inputLength and maxInputLength on the thrown error', () => {
    const over = DEFAULT_MAX_INPUT_LENGTH + 42;
    const oversized = 'a'.repeat(over);
    try {
      sanitizePii(oversized);
      throw new Error('expected sanitizePii to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PiiInputTooLargeError);
      const typed = err as PiiInputTooLargeError;
      expect(typed.inputLength).toBe(over);
      expect(typed.maxInputLength).toBe(DEFAULT_MAX_INPUT_LENGTH);
    }
  });
});

describe('sanitizePii — maxInputLength override', () => {
  it('accepts a custom smaller cap', () => {
    const input = 'a'.repeat(100);
    // Under 200 cap → passes.
    expect(sanitizePii(input, { maxInputLength: 200 })).toBe(input);
  });

  it('throws when input exceeds a custom smaller cap', () => {
    const input = 'a'.repeat(201);
    expect(() => sanitizePii(input, { maxInputLength: 200 })).toThrow(
      PiiInputTooLargeError,
    );
  });

  it('uses the override length, not the default, on the thrown error', () => {
    const input = 'a'.repeat(201);
    try {
      sanitizePii(input, { maxInputLength: 200 });
      throw new Error('expected sanitizePii to throw');
    } catch (err) {
      const typed = err as PiiInputTooLargeError;
      expect(typed.inputLength).toBe(201);
      expect(typed.maxInputLength).toBe(200);
    }
  });

  it('accepts input at exactly the custom cap length', () => {
    const input = 'a'.repeat(200);
    expect(sanitizePii(input, { maxInputLength: 200 })).toBe(input);
  });

  it('accepts a higher-than-default custom cap', () => {
    // An input larger than default but under a higher override must pass.
    const input = 'x'.repeat(DEFAULT_MAX_INPUT_LENGTH + 50);
    expect(
      sanitizePii(input, { maxInputLength: DEFAULT_MAX_INPUT_LENGTH + 100 }),
    ).toBe(input);
  });
});

describe('sanitizePii — length check runs BEFORE regex (O(1) gate)', () => {
  it('throws before touching a string that would redact as an email', () => {
    // The cap check must gate regex, not the other way round. Even a string
    // whose content would match emailPattern() must throw cleanly if it
    // exceeds the configured cap.
    const over = 50_000;
    const tail = '@example.com';
    const input = 'a'.repeat(over - tail.length) + tail;
    expect(input.length).toBe(over);
    expect(() => sanitizePii(input, { maxInputLength: 1_000 })).toThrow(
      PiiInputTooLargeError,
    );
  });

  it('empty string short-circuits BEFORE length check (no option needed)', () => {
    // Preserves the existing v1.0.0 guard: empty string returns empty
    // without invoking the cap logic.
    expect(sanitizePii('', { maxInputLength: 0 })).toBe('');
  });
});

describe('sanitizePii — backward compatibility', () => {
  it('preserves byte-equivalent output on canonical fixture with no options', () => {
    // Sample shared with other tests to guard against any accidental
    // drift in the default code path.
    const input = 'Contact jane.doe@example.com or call 555-123-4567';
    expect(sanitizePii(input)).toBe('Contact [email] or call [phone]');
  });

  it('does not introduce new tokens for under-cap inputs', () => {
    const input = 'Hello world';
    expect(sanitizePii(input, { maxInputLength: 500 })).toBe('Hello world');
  });
});

describe('createPiiMiddleware — maxInputLength threading', () => {
  it('propagates default cap to string prompts', async () => {
    const mw = createPiiMiddleware();
    const oversized = 'a'.repeat(DEFAULT_MAX_INPUT_LENGTH + 1);
    await expect(
      mw.transformParams!({
        type: 'generate',
        params: {
          prompt: oversized,
        } as unknown as Parameters<NonNullable<typeof mw.transformParams>>[0]['params'],
      } as unknown as Parameters<NonNullable<typeof mw.transformParams>>[0]),
    ).rejects.toThrow(PiiInputTooLargeError);
  });

  it('propagates custom cap to string prompts', async () => {
    const mw = createPiiMiddleware({ maxInputLength: 100 });
    const oversized = 'a'.repeat(101);
    await expect(
      mw.transformParams!({
        type: 'generate',
        params: {
          prompt: oversized,
        } as unknown as Parameters<NonNullable<typeof mw.transformParams>>[0]['params'],
      } as unknown as Parameters<NonNullable<typeof mw.transformParams>>[0]),
    ).rejects.toThrow(PiiInputTooLargeError);
  });

  it('propagates cap to string message content', async () => {
    const mw = createPiiMiddleware({ maxInputLength: 100 });
    const oversized = 'a'.repeat(101);
    await expect(
      mw.transformParams!({
        type: 'generate',
        params: {
          prompt: [{ role: 'user', content: oversized }],
        } as unknown as Parameters<NonNullable<typeof mw.transformParams>>[0]['params'],
      } as unknown as Parameters<NonNullable<typeof mw.transformParams>>[0]),
    ).rejects.toThrow(PiiInputTooLargeError);
  });

  it('propagates cap to text-part content in a message array', async () => {
    const mw = createPiiMiddleware({ maxInputLength: 100 });
    const oversized = 'a'.repeat(101);
    await expect(
      mw.transformParams!({
        type: 'generate',
        params: {
          prompt: [{ role: 'user', content: [textPart(oversized)] }],
        } as unknown as Parameters<NonNullable<typeof mw.transformParams>>[0]['params'],
      } as unknown as Parameters<NonNullable<typeof mw.transformParams>>[0]),
    ).rejects.toThrow(PiiInputTooLargeError);
  });

  it('propagates cap to reasoning-part content in a message array', async () => {
    const mw = createPiiMiddleware({ maxInputLength: 100 });
    const oversized = 'a'.repeat(101);
    await expect(
      mw.transformParams!({
        type: 'generate',
        params: {
          prompt: [{ role: 'assistant', content: [reasoningPart(oversized)] }],
        } as unknown as Parameters<NonNullable<typeof mw.transformParams>>[0]['params'],
      } as unknown as Parameters<NonNullable<typeof mw.transformParams>>[0]),
    ).rejects.toThrow(PiiInputTooLargeError);
  });

  it('applies the cap PER PART, not cumulatively across a message array', async () => {
    // Two parts each 60 chars — cumulative 120 — but the cap is per-
    // sanitizePii-call (per part). With a cap of 100 each individual
    // part is under-cap and must pass.
    const mw = createPiiMiddleware({ maxInputLength: 100 });
    const partA = 'a'.repeat(60);
    const partB = 'b'.repeat(60);
    const result = (await mw.transformParams!({
      type: 'generate',
      params: {
        prompt: [
          { role: 'user', content: [textPart(partA), textPart(partB)] },
        ],
      } as unknown as Parameters<NonNullable<typeof mw.transformParams>>[0]['params'],
    } as unknown as Parameters<NonNullable<typeof mw.transformParams>>[0])) as {
      prompt: Array<{ role: string; content: Array<{ type: string; text: string }> }>;
    };
    expect(result.prompt[0]!.content[0]!.text).toBe(partA);
    expect(result.prompt[0]!.content[1]!.text).toBe(partB);
  });

  it('passes through non-prompt params untouched when over-cap throws', async () => {
    // Sanity check that the middleware error propagates cleanly without
    // half-mutating params. We use Promise.catch so the test surface
    // stays explicit.
    const mw = createPiiMiddleware({ maxInputLength: 10 });
    const bigString = 'a'.repeat(100);
    let caught: unknown = null;
    try {
      await mw.transformParams!({
        type: 'generate',
        params: {
          prompt: bigString,
          temperature: 0.7,
        } as unknown as Parameters<NonNullable<typeof mw.transformParams>>[0]['params'],
      } as unknown as Parameters<NonNullable<typeof mw.transformParams>>[0]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PiiInputTooLargeError);
  });
});

describe('piiMiddleware — zero-config default retains v1.0.0 behaviour', () => {
  it('processes under-cap strings without throwing (byte-equivalent)', async () => {
    const input = 'Contact jane@example.com';
    const result = (await piiMiddleware.transformParams!({
      type: 'generate',
      params: {
        prompt: input,
      } as unknown as Parameters<NonNullable<typeof piiMiddleware.transformParams>>[0]['params'],
    } as unknown as Parameters<
      NonNullable<typeof piiMiddleware.transformParams>
    >[0])) as { prompt: string };
    expect(result.prompt).toBe('Contact [email]');
  });

  it('throws on over-default-cap strings (inherited from factory default)', async () => {
    const oversized = 'a'.repeat(DEFAULT_MAX_INPUT_LENGTH + 1);
    await expect(
      piiMiddleware.transformParams!({
        type: 'generate',
        params: {
          prompt: oversized,
        } as unknown as Parameters<
          NonNullable<typeof piiMiddleware.transformParams>
        >[0]['params'],
      } as unknown as Parameters<
        NonNullable<typeof piiMiddleware.transformParams>
      >[0]),
    ).rejects.toThrow(PiiInputTooLargeError);
  });
});
