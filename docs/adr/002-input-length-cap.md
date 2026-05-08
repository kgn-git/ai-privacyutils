# ADR 002 — Runtime input-length cap (belt-and-braces ReDoS defence)

**Status:** Accepted (v1.1, Sprint 2K.A, issue #10)
**Date:** 2026-04-19
**Context ref:** `docs/Handover-10.md`; security review §R7 (v1.0.0 hardening, 2026-04-19)

## Context

Security review R7 identified ReDoS risk on adversarial input as one of the six must-land-before-v1.1 items for `@kgn-git/privacy-utils`. Issue #4 (R7a) addresses this statically via `recheck` + `eslint-plugin-redos` CI lints that flag known super-linear regex shapes at build time. That is the primary defence.

This ADR documents the secondary defence: a runtime O(1) input-length cap that bounds worst-case CPU regardless of what regex the `sanitizePii` function actually runs. Motivation:

- Static analysis has gaps. `recheck` catches well-known super-linear shapes but can miss novel combinations, especially around Unicode property escapes (`\p{L}`) which have subtle interactions with catastrophic backtracking.
- The regex set evolves. Every locale added in v1.1 (addresses, postcodes, phones) introduces new patterns. A regression that adds a super-linear shape may land without the CI lint flagging it (e.g. edge-cases in the plugin's detection).
- The worst-case blast radius is consequential. `sanitizePii` runs on every LLM prompt emission. A pathological 1-MB adversarial input pinning CPU for seconds per pass would be a DoS vector on any endpoint that redacts untrusted user input before LLM calls.

A length check `text.length > cap` runs in a single CPU op (string length is a stored property on JS string primitives). Bounding the input length bounds the regex execution time multiplicatively regardless of pattern shape. This is the classic "belt-and-braces" pattern: static lint as the primary defence, runtime cap as the catch-all.

## Decisions

### 1. API surface — BOTH middleware and free-function (option b)

`maxInputLength` is accepted on both `SanitizePiiOptions` (the options bag for the `sanitizePii` pure function) and `PiiMiddlewareOptions` (the options bag for the `createPiiMiddleware` factory).

Considered alternatives:

- **(a) Middleware-only.** Rejected. `sanitizePii` is the pure function that actually invokes regex. Consumers that call `sanitizePii` directly (e.g. service-layer LLM-coverage helpers, ad-hoc sanitisation hooks) would remain unprotected. The cap must sit on the function that runs the work.
- **(b) Both middleware and `sanitizePii`** (chosen). Length check lives inside `sanitizePii`; the middleware inherits it trivially by threading the option through every internal `sanitizePii` call. Matches the existing `tokenFormat` plumbing (ADR 001) for consistency.
- **(c) `sanitizePii` only, middleware delegates.** Considered but not sufficient. The middleware still needs `PiiMiddlewareOptions.maxInputLength` on its public signature so consumers can configure the cap per-middleware-instance (cf. per-call for `sanitizePii`).

### 2. Overflow behaviour — throw a typed error

`PiiInputTooLargeError extends Error` is thrown by `sanitizePii` when the input exceeds the cap. The error carries numeric `.inputLength` and `.maxInputLength` props so consumers can introspect without string-parsing the message.

Considered alternatives:

- **Throw a typed error** (chosen). Loud failure surfaces misconfiguration: if the consumer is silently pushing ever-larger prompts into the redactor, they see the error and notice. A typed error keeps the API narrow — consumers who prefer truncation can catch and implement it themselves with a single `try / catch` block, retaining full control over the truncation policy (where to cut, whether to log, whether to surface to the user).
- **Truncate with `console.warn`.** Rejected. Silent cap with a console message is the worst of both worlds: the prompt is mutated without the consumer's knowledge, regressions (prompt-size growth, edge-case loops that keep accumulating) go unnoticed until a downstream break makes them visible. Warnings in server-side logs are rarely surfaced in the consumer's pipeline.
- **Configurable `onOverflow: 'throw' | 'truncate'`.** Rejected for v1.1. Extra API surface for a hypothetical use case; premature expansion. Re-evaluable in v1.2 if consumer demand materialises. Consumers who want truncation today can implement it in their `catch` block.

The error class `PiiInputTooLargeError` is exported from the public API (`src/index.ts`) so consumers can `catch (err) { if (err instanceof PiiInputTooLargeError) ... }`.

### 3. Default value — 500_000 code units

Approximately 500 KB ASCII (or 1-2 MB for UTF-8 with high code-point density, since the cap is on code units not bytes — but worst-case UTF-16 is 2 bytes per code unit, so a 500K code-unit cap is <= 1 MB on-wire). Comfortably above any realistic CV/JD pair:

- Largest CV observed in test fixtures: ~15 KB (plain text).
- Largest JD observed: ~8 KB.
- Worst-case combined prompt (CV + JD + system + instructions): ~50 KB.

The default gives a ~10x safety margin above normal usage while still rejecting pathological adversarial payloads. Consumers with genuinely larger prompts can override via the option.

### 4. Length measurement — JS string code units

`text.length` is used — the stored UTF-16 code-unit count on the string primitive. This is O(1).

Considered alternatives:

- **UTF-16 code units** (chosen). Matches what the JS regex engine iterates over. The ReDoS concern is about engine work per code unit, so code-unit length is the correct proxy for worst-case CPU.
- **Byte length** (UTF-8 encoded). Rejected. Requires an O(n) encoding pass to measure, defeating the "O(1) gate" property.
- **Grapheme length** (via `Intl.Segmenter`). Rejected. Expensive (grapheme segmentation itself is O(n)), and irrelevant to regex-engine worst case (grapheme cluster count has no relationship with regex work-per-code-unit).

### 5. Cap scope — per `sanitizePii` call

The cap is enforced on each individual `sanitizePii` invocation. In middleware context, this means:

- A string prompt is one call → capped at `maxInputLength`.
- Each string message content is one call → each capped independently.
- Each text / reasoning part in an array message is one call → each capped independently.

The cap is NOT summed across all parts of a prompt. Two 400K parts each pass under a 500K cap, even though their cumulative size is 800K. Rationale:

- Regex work is per-part. The ReDoS concern is per regex call, not per prompt.
- Per-call scope is predictable. Consumers composing fragments (message arrays) can reason about the cap locally. A cumulative cap would mean that adding a new message part could retroactively break a prompt that was previously under-cap.
- The aggregate size of a prompt is the LLM provider's concern (context window), not the PII redactor's concern. Providers enforce their own limits.

## Consequences

**Positive:**

- Bounded worst-case CPU for `sanitizePii`, independent of regex shape. If a future pattern edit inadvertently introduces a super-linear shape, the cap bounds the blast radius.
- Fail-fast error surface. Misconfiguration (consumer pushing unbounded user input into the redactor) is visible immediately, not a quiet CPU spike.
- Consumer-visible default cap. `DEFAULT_MAX_INPUT_LENGTH` is exported, so consumers have a single source of truth for "what size does the library consider normal".

**Negative / tradeoffs:**

- Consumers who legitimately redact >500 KB inputs must opt into a higher cap explicitly. This is intentional (it forces an informed decision) but adds friction for any such caller. Mitigation: the default is 10× normal workload; realistic CV/JD flows will never trip it.
- Throwing shifts responsibility for error handling to the consumer. If a consumer's code path does not anticipate the error, an over-cap input causes an unhandled rejection. Mitigation: the README's Security posture section documents the cap, the error class is exported, and the error message includes both numeric lengths for legible logs.
- Minor API-surface expansion. `SanitizePiiOptions` grows from 1 field (`tokenFormat`) to 2. Acceptable — both are minor-bump additions and the option bag is still flat.

## Verification

- `src/__tests__/input-length-cap.test.ts` — 30 tests covering: constant exportability, error class shape (`instanceof Error`, `instanceof PiiInputTooLargeError`, `.name`, numeric props, message content), default cap (under/at/over), custom cap (override, at-cap, higher-than-default), O(1) check ordering (cap gates regex, empty-string short-circuit preserved), middleware propagation (string prompt, string content, text part, reasoning part, per-part not cumulative, zero-config inheritance).
- Baseline: 209 existing tests remain green — no behaviour change for under-cap inputs.
- `npm run redos:scan` — 16/16 SAFE (no regex changes in this issue, scanner unaffected).

## Related decisions

- ADR 001 (`tokenFormat` option) — same option-threading pattern used here for consistency.
- Issue #4 (R7a — static ReDoS lint) — the primary defence this cap complements.

## Open questions deferred to v1.2

- `onOverflow: 'throw' | 'truncate'` configurability — re-evaluate if consumer demand emerges.
- Per-call telemetry hook (callback fired on over-cap) — could be useful for consumer observability without forcing a catch block. Not in scope for v1.1.
