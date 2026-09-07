// COMPLIANCE: NER runs on the original text and the matched name is bound to a loop-local variable in the merge —
// never returned, logged or assigned wider; matched substrings must not be logged, match counts may be.
// Record: docs/compliance/redaction-record.md § 1, § 3.8.

// A separate async export: engine loading is asynchronous and making `sanitizePii` async would break every
// caller's types. With `enableNer: false` (the default) the regex output is returned verbatim and no engine is
// constructed.

import { sanitizePii, type SanitizePiiOptions } from './sanitize-pii.js';
import { mergeRanges } from './redact-ranges.js';
import { tokensFor } from './token-format.js';
import {
  DEFAULT_MAX_INPUT_LENGTH,
  PiiInputTooLargeError,
} from './limits.js';
import {
  createNerEngine,
  type NerEngine,
  type NerSpan,
} from './ner/index.js';

/** `SanitizePiiOptions` plus the NER fields; with none of them set the output equals `sanitizePii(text, options)`. */
export interface SanitizePiiAsyncOptions extends SanitizePiiOptions {
  /** Names are redacted only when `true`; the default keeps existing consumers' output unchanged (C6). */
  enableNer?: boolean;
  /** Engine override; otherwise `createNerEngine({ enableNer })` — `CompromiseNerEngine` when enabled. */
  nerEngine?: NerEngine;
  /** Passed through to the engine; a no-op for `CompromiseNerEngine`. */
  nerConfidenceThreshold?: number;
  /** Per-call names never redacted even when the engine flags them. */
  nerAllowList?: ReadonlyArray<string>;
}

// NER spans come from the original text because `compromise` offsets are invalid against regex-redacted output.
// Each merged span's text is sliced from the original and its first remaining occurrence in the mutating output is
// replaced; a span whose text is gone was consumed by a larger regex span. Loop direction guarantees nothing (record § 5).
export function applyNerRedactions(
  original: string,
  nerSpans: ReadonlyArray<NerSpan>,
  regexRedacted: string,
  token: string,
): string {
  if (nerSpans.length === 0) return regexRedacted;
  const merged = mergeRanges(nerSpans);
  let out = regexRedacted;
  for (let i = merged.length - 1; i >= 0; i -= 1) {
    const range = merged[i]!;
    if (range.start < 0 || range.end > original.length) continue;
    if (range.start >= range.end) continue;
    const nameLocal = original.slice(range.start, range.end);
    if (nameLocal.length === 0) continue;
    const idx = out.indexOf(nameLocal);
    if (idx >= 0) {
      out = out.slice(0, idx) + token + out.slice(idx + nameLocal.length);
    }
  }
  return out;
}

/** Same cap and regex pipeline as `sanitizePii`; the `'cv'` profile leaves the NER pass unchanged (R11-residual, record § 5). */
export async function sanitizePiiAsync(
  text: string,
  options?: SanitizePiiAsyncOptions,
): Promise<string> {
  if (text === '' || text == null) return text ?? '';

  const maxInputLength = options?.maxInputLength ?? DEFAULT_MAX_INPUT_LENGTH;
  if (text.length > maxInputLength) {
    throw new PiiInputTooLargeError(text.length, maxInputLength);
  }

  const regexRedacted = sanitizePii(text, {
    tokenFormat: options?.tokenFormat,
    maxInputLength: options?.maxInputLength,
    profile: options?.profile,
  });

  if (options?.enableNer !== true) {
    return regexRedacted;
  }

  const engine = options.nerEngine ?? createNerEngine({ enableNer: true });

  const nerSpans = await engine.detectPersonSpans(text, {
    confidenceThreshold: options.nerConfidenceThreshold,
    allowList: options.nerAllowList,
  });

  const tokens = tokensFor(options.tokenFormat);
  return applyNerRedactions(text, nerSpans, regexRedacted, tokens.person);
}
