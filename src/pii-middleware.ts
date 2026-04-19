import type { LanguageModelV1Middleware } from 'ai';

import { sanitizePii } from './sanitize-pii.js';
import type { TokenFormat } from './token-format.js';

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
 * (possibly-replaced) part. `tokenFormat` is threaded through to every
 * `sanitizePii` call per issue #9 / compliance §R8.
 */
function redactPart(
  part: UnknownPart,
  tokenFormat: TokenFormat | undefined,
): UnknownPart {
  if (part['type'] === 'text' && typeof part['text'] === 'string') {
    return { ...part, text: sanitizePii(part['text'], { tokenFormat }) };
  }
  if (part['type'] === 'reasoning' && typeof part['text'] === 'string') {
    return { ...part, text: sanitizePii(part['text'], { tokenFormat }) };
  }
  return part;
}

/**
 * Redact the `content` of a single provider-layer message.
 */
function redactMessage(
  message: Record<string, unknown>,
  tokenFormat: TokenFormat | undefined,
): Record<string, unknown> {
  const content = message['content'];
  if (typeof content === 'string') {
    return { ...message, content: sanitizePii(content, { tokenFormat }) };
  }
  if (Array.isArray(content)) {
    return {
      ...message,
      content: content.map((part) =>
        typeof part === 'object' && part !== null
          ? redactPart(part as UnknownPart, tokenFormat)
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
function redactPrompt(
  prompt: unknown,
  tokenFormat: TokenFormat | undefined,
): unknown {
  if (typeof prompt === 'string') {
    return sanitizePii(prompt, { tokenFormat });
  }
  if (Array.isArray(prompt)) {
    return prompt.map((msg) =>
      typeof msg === 'object' && msg !== null
        ? redactMessage(msg as Record<string, unknown>, tokenFormat)
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
  return {
    transformParams: async ({ params }) => {
      const next = deepClone(params) as Record<string, unknown>;
      if ('prompt' in next) {
        next['prompt'] = redactPrompt(next['prompt'], tokenFormat);
      }
      return next as typeof params;
    },
  };
}

/**
 * `piiMiddleware` — canonical PII scrubber for Jobflow LLM calls.
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
