import type { LanguageModelV1Middleware } from 'ai';

import { sanitizePii } from './sanitize-pii.js';
import type { TokenFormat } from './token-format.js';

/**
 * Options forwarded into each `sanitizePii` call during middleware
 * transform. Kept as an internal shape (distinct from the public
 * `PiiMiddlewareOptions`) so the internal helpers thread a tidy bundle
 * instead of drifting positional-arg signatures each time a new option
 * lands.
 */
interface PartOptions {
  tokenFormat: TokenFormat | undefined;
  maxInputLength: number | undefined;
}

/**
 * Type-loose representation of a single provider-layer message part.
 *
 * Vercel AI SDK v4 provider-layer content parts are one of:
 *   - `{ type: 'text', text: string }`
 *   - `{ type: 'image', image: ... }`
 *   - `{ type: 'file', data: ..., mimeType: string }`
 *   - `{ type: 'tool-call', toolCallId, toolName, args }`
 *   - `{ type: 'tool-result', toolCallId, toolName, result }`
 *   - `{ type: 'reasoning', text: string }`
 *
 * We only scrub `type: 'text'` and the `reasoning` text. Other shapes
 * pass through untouched.
 */
type UnknownPart = Record<string, unknown>;

/**
 * Deep-clone a provider-layer params object without relying on
 * `structuredClone` (keeps the browser-free Node target working).
 */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Redact a single content part in place on a cloned object. Returns the
 * (possibly-replaced) part. Options are threaded through to every
 * `sanitizePii` call per issues #9 (tokenFormat) and #10 (maxInputLength).
 *
 * `sanitizePii` may throw `PiiInputTooLargeError` if the part's text
 * exceeds the configured cap; the error propagates out of `redactPart`
 * through `redactMessage` → `redactPrompt` → `transformParams`. This is
 * the intended behaviour — the AI SDK's `transformParams` signature allows
 * throws and the caller should treat over-cap prompts as a caller-side
 * error, not a silent redaction gap.
 */
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

/**
 * Redact the `content` of a single provider-layer message.
 */
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

/**
 * Redact the entire `prompt` field, which may be either a string (Vercel
 * Core-level shape) or an array of messages (provider-level shape).
 */
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

/**
 * Options accepted by the `createPiiMiddleware` factory (v1.1 — issue #9).
 */
export interface PiiMiddlewareOptions {
  /**
   * Replacement-token format (v1.1 — issue #9 / compliance §R8).
   *
   *   - `'readable'` (default): `[email]`, `[phone]`, `[address]`,
   *     `[postcode]`, `[dob]`. v1.0.0 byte-identical.
   *   - `'sentinel'`: `<<REDACTED_EMAIL>>`, `<<REDACTED_PHONE>>`,
   *     `<<REDACTED_ADDRESS>>`, `<<REDACTED_POSTCODE>>`,
   *     `<<REDACTED_DOB>>`. Pattern-disjoint, low-collision variant.
   */
  tokenFormat?: TokenFormat;
  /**
   * Runtime input-length cap in JS string code units (v1.1 — issue #10 /
   * security review R7). Threaded into every `sanitizePii` call made by
   * `transformParams` — applied per individual text string (each string
   * prompt, each string message content, each text / reasoning part).
   *
   * An over-cap part causes `sanitizePii` to throw `PiiInputTooLargeError`,
   * which propagates out of `transformParams` unwrapped (the AI SDK
   * contract permits throws — treat as caller-side error).
   *
   * Default: `DEFAULT_MAX_INPUT_LENGTH` (500_000 code units). See
   * `./limits.ts` and ADR 002 (`docs/adr/002-input-length-cap.md`).
   */
  maxInputLength?: number;
}

/**
 * `createPiiMiddleware` — middleware factory with opt-in `tokenFormat` (v1.1).
 *
 * Returns a `LanguageModelV1Middleware` whose `transformParams` scrubs the
 * prompt path using the chosen token format. The factory pattern lets
 * consumers wire a single-instance middleware with the format they want
 * (readable for debug / legacy, sentinel for low-collision production)
 * while preserving the zero-config default via the `piiMiddleware` export.
 *
 * Usage:
 *
 *   // Default (readable) — equivalent to `piiMiddleware`:
 *   const mw = createPiiMiddleware();
 *
 *   // Opt-in sentinel:
 *   const mw = createPiiMiddleware({ tokenFormat: 'sentinel' });
 *
 * See `./token-format.ts` for the tokenFormat ADR + idempotency invariant.
 */
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
 * `piiMiddleware` — canonical PII scrubber for Vercel AI SDK LLM calls.
 *
 * Conforms to `LanguageModelV1Middleware` from the Vercel AI SDK v4.
 * Wires into the prompt path via `transformParams` so every outbound
 * request is scrubbed immediately before the SDK serialises it for the
 * provider HTTP call — the single latest application-layer chokepoint
 * per compliance review §3 (Art. 25 privacy-by-default).
 *
 * Response handling (`wrapGenerate` / `wrapStream`) is NOT implemented in
 * v1.0.0 — the middleware is request-side only. Post-LLM response
 * scrubbing remains a consumer-side concern (see scoring's
 * `llm-coverage.service.ts:178` for the canonical pattern).
 *
 * The middleware never mutates the caller's params object — it clones
 * first, then redacts on the clone. Non-prompt fields (temperature,
 * maxTokens, etc.) are preserved.
 *
 * This is the zero-config export preserved byte-identically from v1.0.0 —
 * equivalent to `createPiiMiddleware()` with no options (default
 * `tokenFormat: 'readable'`). Consumers wanting the v1.1 sentinel variant
 * should call `createPiiMiddleware({ tokenFormat: 'sentinel' })`.
 */
export const piiMiddleware: LanguageModelV1Middleware = createPiiMiddleware();
