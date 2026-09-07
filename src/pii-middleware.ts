// COMPLIANCE: the prompt is redacted on a clone at the last application-layer point before the SDK serialises
// the provider call (Art. 25); only the redacted params leave and the caller's object is never mutated.
// Record: docs/compliance/redaction-record.md § 3.11.
import type { LanguageModelV1Middleware } from 'ai';

import { sanitizePii } from './sanitize-pii.js';
import type { TokenFormat } from './token-format.js';

// The option bundle every internal helper threads into `sanitizePii`.
interface PartOptions {
  tokenFormat: TokenFormat | undefined;
  maxInputLength: number | undefined;
}

// Provider-layer parts are `text`, `image`, `file`, `tool-call`, `tool-result` or `reasoning`; only `text` and
// `reasoning` carry redactable text, the rest pass through untouched.
type UnknownPart = Record<string, unknown>;

// JSON round-trip rather than `structuredClone` so the Node target needs no browser API.
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// An over-cap part throws `PiiInputTooLargeError` out of `transformParams`, which the SDK contract permits — a
// caller-side error, never a silent redaction gap.
function redactPart(
  part: UnknownPart,
  opts: PartOptions,
): UnknownPart {
  if (part['type'] === 'text' && typeof part['text'] === 'string') {
    return {
      ...part,
      text: sanitizePii(part['text'], {
        tokenFormat: opts.tokenFormat,
        maxInputLength: opts.maxInputLength,
      }),
    };
  }
  if (part['type'] === 'reasoning' && typeof part['text'] === 'string') {
    return {
      ...part,
      text: sanitizePii(part['text'], {
        tokenFormat: opts.tokenFormat,
        maxInputLength: opts.maxInputLength,
      }),
    };
  }
  return part;
}

function redactMessage(
  message: Record<string, unknown>,
  opts: PartOptions,
): Record<string, unknown> {
  const content = message['content'];
  if (typeof content === 'string') {
    return {
      ...message,
      content: sanitizePii(content, {
        tokenFormat: opts.tokenFormat,
        maxInputLength: opts.maxInputLength,
      }),
    };
  }
  if (Array.isArray(content)) {
    return {
      ...message,
      content: content.map((part) =>
        typeof part === 'object' && part !== null
          ? redactPart(part as UnknownPart, opts)
          : part,
      ),
    };
  }
  return message;
}

// `prompt` is a string at the core level and an array of messages at the provider level.
function redactPrompt(prompt: unknown, opts: PartOptions): unknown {
  if (typeof prompt === 'string') {
    return sanitizePii(prompt, {
      tokenFormat: opts.tokenFormat,
      maxInputLength: opts.maxInputLength,
    });
  }
  if (Array.isArray(prompt)) {
    return prompt.map((msg) =>
      typeof msg === 'object' && msg !== null
        ? redactMessage(msg as Record<string, unknown>, opts)
        : msg,
    );
  }
  return prompt;
}

/** Options for `createPiiMiddleware`; both are threaded into every `sanitizePii` call. */
export interface PiiMiddlewareOptions {
  /** `'readable'` (default) or `'sentinel'`. */
  tokenFormat?: TokenFormat;
  /** Applied per text string — each prompt, message content, text or reasoning part — never summed across a prompt. */
  maxInputLength?: number;
}

/** Builds a `LanguageModelV1Middleware` whose `transformParams` redacts the prompt path with the chosen options. */
export function createPiiMiddleware(
  options?: PiiMiddlewareOptions,
): LanguageModelV1Middleware {
  const tokenFormat = options?.tokenFormat;
  const maxInputLength = options?.maxInputLength;
  const opts: PartOptions = { tokenFormat, maxInputLength };
  return {
    transformParams: async ({ params }) => {
      const next = deepClone(params) as Record<string, unknown>;
      if ('prompt' in next) {
        next['prompt'] = redactPrompt(next['prompt'], opts);
      }
      return next as typeof params;
    },
  };
}

/**
 * Zero-config default, equal to `createPiiMiddleware()`. Request-side only: `wrapGenerate` / `wrapStream` are
 * not implemented, so model responses are a consumer concern.
 */
export const piiMiddleware: LanguageModelV1Middleware = createPiiMiddleware();
