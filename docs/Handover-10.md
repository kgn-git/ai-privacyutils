# Handover — Issue #10 (R7: runtime input-length cap — belt-and-braces ReDoS defence)

**Date:** 2026-04-19
**Branch:** `feature/10-input-length-cap`
**Developer:** Claude Code (`/developer` skill, dispatched by `/programme-manager`)
**Milestone:** Sprint 2K.A — v1.1 locale-aware PII + CI hardening
**Target release:** v1.1 (minor bump — `package.json` already at `1.1.0-dev`)
**Severity:** medium (compliance review §R7 + security review must-land-before-v1.1 item 4)

---

## Implementation summary

The runtime input-length cap is the secondary defence against ReDoS. Issue #4 (`recheck` + `eslint-plugin-redos` CI lint) is the primary defence — it catches known super-linear regex shapes at CI time. This issue adds an O(1) runtime gate: `sanitizePii` rejects any input whose `text.length` exceeds the configured `maxInputLength` BEFORE any regex runs. Together the two defences bound worst-case CPU under adversarial input regardless of static-analysis gaps.

The cap is wired on both the pure function (`sanitizePii(text, { maxInputLength? })`) and the middleware factory (`createPiiMiddleware({ maxInputLength? })`). Direct `sanitizePii` callers (scoring's `llm-coverage.service.ts`, platform's sanitisation hooks) get the same protection as middleware users — the check lives at the site where regex runs, not above it. Overflow is signalled by throwing a typed `PiiInputTooLargeError extends Error` with numeric `.inputLength` and `.maxInputLength` props, both exported from the public API (`src/limits.ts` → re-exported from `src/index.ts`).

---

## ADR decisions (full record: `docs/adr/002-input-length-cap.md`)

- **API surface: (b) both middleware + `sanitizePii` free function.** `sanitizePii` is the pure function where regex runs, so the length check belongs there. The middleware inherits the cap by threading the option through every internal `sanitizePii` call (string prompt, string message content, text part, reasoning part). Middleware-only would leave direct-callers unprotected. Matches the existing `tokenFormat` threading pattern from ADR 001 (issue #9).
- **Overflow behaviour: throw `PiiInputTooLargeError`.** Loud failure surfaces misconfiguration. Silent truncation with `console.warn` can mask regressions (prompt size creeping up goes unnoticed). A typed error keeps the API narrow — consumers who want truncation can catch and implement their own policy. The error is exported so consumers can `instanceof`-check it cleanly. `onOverflow` configurability rejected as premature API-surface expansion (re-evaluable in v1.2).
- **Default value: 500_000 JS string code units** (~500 KB ASCII). ~10x safety margin over realistic CV/JD workload (~50 KB combined worst-case). Kept as the constant `DEFAULT_MAX_INPUT_LENGTH` and exported so consumers have a single source of truth.
- **Length measurement: JS string code units** (`text.length`). O(1) — stored on the string primitive. Matches what the regex engine iterates over. Byte-length rejected (requires O(n) UTF-8 encoding pass); grapheme-length rejected (Intl.Segmenter is O(n) and irrelevant to regex work).
- **Cap scope: per `sanitizePii` call** (per individual text string). Middleware enforces the cap on each string prompt, each string message content, each text/reasoning part independently. NOT summed across a prompt's message array. Rationale: regex CPU is per-call, not per-prompt. Predictable for consumers composing fragments.

---

## Acceptance criteria

| AC | Implemented? | Location | Notes |
|---|---|---|---|
| `maxInputLength?: number` on `SanitizePiiOptions` and `PiiMiddlewareOptions` | Yes | `src/sanitize-pii.ts:196`, `src/pii-middleware.ts:157` | Both options bags flat, JSDoc on each |
| Default 500_000 chars (constant exported) | Yes | `src/limits.ts:62` (`DEFAULT_MAX_INPUT_LENGTH`) | Re-exported from `src/index.ts:73` |
| Overflow behaviour: throw typed `PiiInputTooLargeError extends Error` with `.inputLength` + `.maxInputLength` props | Yes | `src/limits.ts:90-108` | `instanceof Error`, `instanceof PiiInputTooLargeError`, `.name = 'PiiInputTooLargeError'`, message includes both numbers |
| `PiiInputTooLargeError` exported from public API | Yes | `src/index.ts:70-74` | Re-exported from `./limits.js` |
| Length check runs BEFORE any regex | Yes | `src/sanitize-pii.ts:284-287` | Placed immediately after empty-string short-circuit; before `tokensFor()` and every `.replace()` call |
| Middleware propagates `maxInputLength` into every `sanitizePii` call | Yes | `src/pii-middleware.ts:37-78, 86-108, 111-121, 181-195` | Threaded via internal `PartOptions { tokenFormat, maxInputLength }` — uniformly plumbed across string-prompt, string-content, text-part, reasoning-part paths |
| Unit tests: under-cap passes; at-cap passes; over-cap throws with correct `.inputLength`/`.maxInputLength`; default works; override works; `instanceof` Error + PiiInputTooLargeError | Yes | `src/__tests__/input-length-cap.test.ts` (30 tests) | Includes O(1) check-order test (cap gates regex, not the other way round) |
| ADR at `docs/adr/002-input-length-cap.md` | Yes | `docs/adr/002-input-length-cap.md` | All five design decisions documented |
| README "Security posture" mentions the cap + rationale | Yes | `README.md:199` (S12) | Cross-refs ADR 002 |
| README Known Limitations R7 row resolved | Yes | `README.md:176` | Intro sentence updated to list R1/R2/R5/R7/R8 resolved in v1.1 |
| README API reference documents `maxInputLength` + `PiiInputTooLargeError` + `DEFAULT_MAX_INPUT_LENGTH` | Yes | `README.md:225-236, 260-279` | Both `sanitizePii` and `createPiiMiddleware` entries updated |
| Minor bump SemVer (additive only) | Yes | `package.json` at `1.1.0-dev` | Additive new option + new exports; no breaking change |
| All 209 baseline tests remain green | Yes | `npm test -- --run` | 239/239 = 209 baseline + 30 new |

---

## Reviewable state (SD-002 amended 2026-04-15)

- **Build:** green (`npm run build` → no TS errors)
- **Lint:** green (`npm run lint` → no ESLint findings)
- **Unit tests:** 239 / 239 passing (209 baseline + 30 new in `input-length-cap.test.ts`)
- **ReDoS scan:** 16 / 16 SAFE (`npm run redos:scan` — no regex changes in this issue)
- **TDD compliance verifiable in commit history:**
  - `bd9088b test(#10): RED — runtime input-length cap + PiiInputTooLargeError` (RED — fails to load because `src/limits.ts` does not yet exist)
  - `8c3583f feat(#10): GREEN — runtime input-length cap (belt-and-braces ReDoS defence)` (GREEN — 239/239 pass; includes a test-fixture correction for the "at cap length" test whose filler collided with the email regex; documented inline in the commit message)
  - `0c1ecd1 docs(#10): ADR 002 + README Security posture S12 + Known Limitations R7` (REFACTOR — docs only, no runtime change)
- **Handover written before completion summary:** this file, committed on the feature branch before the PR URL is returned.
- **Branch pushed to origin:** (pending — pushed as part of PR creation below)
- **PR opened against main:** (pending — see Next steps)

---

## Code Review

- **Reviewer:** `feature-dev:code-reviewer` subagent (dispatched 2026-04-19 by `/programme-manager` at top-level session)
- **Base SHA:** `d99ee67592ae1b545a9cef89b7118e9ab9e31850`
- **Head SHA:** `ca4694e` (at dispatch time)
- **Verdict:** Ready to merge
- **Critical findings:** 0
- **Important findings:** 0
- **Minor findings:** 1 (confidence 30 — not worth blocking; not fixed)
- **Minor-1:** Internal `PartOptions` type in `src/pii-middleware.ts:15` uses `tokenFormat: TokenFormat | undefined` + `maxInputLength: number | undefined` rather than the conventional `?: T` optional syntax. Intentional per developer — struct is always constructed with all fields present (line 184). No functional consequence; stylistic-only observation.
- **All 10 focus areas: PASS.** Highlights:
  - O(1) check at `src/sanitize-pii.ts:284-287` — runs after empty-string short-circuit, before `tokensFor()`, before any `.replace()`, before `findPhoneNumbersInText`. No regex runs before the cap check.
  - `PiiInputTooLargeError` correctly extends Error with `Object.setPrototypeOf` prototype-restoration + `this.name` assignment + typed `public readonly` props. Both `instanceof Error` and `instanceof PiiInputTooLargeError` tested.
  - `DEFAULT_MAX_INPUT_LENGTH = 500_000` is the single source of truth — no magic-number duplication anywhere.
  - Middleware propagation clean: `PartOptions { tokenFormat, maxInputLength }` threaded through `transformParams → redactPrompt → redactMessage → redactPart → sanitizePii` on every content shape (string prompt, string content, array content, text parts, reasoning parts).
  - Throw propagation clean: `transformParams` is `async`, returns rejected promise on throw; no `try/catch` wrapper in middleware to swallow or re-wrap. The `try/catch` at `sanitize-pii.ts:120-137` is inside `redactLocalePhones` which runs AFTER the cap check, so it cannot intercept `PiiInputTooLargeError`.
  - No baseline test file modified (verified by grep — `maxInputLength` / `DEFAULT_MAX_INPUT_LENGTH` / `500_000` appear nowhere in the 6 baseline test files).
  - No silent truncation path — no `text.slice(0, cap)` or defensive try/catch-to-truncate fallback anywhere.
  - ADR 002 production-quality: context + 5 decisions with rationale + consequences + explicit rejected alternatives (silent truncation, configurable onOverflow, middleware-only scope, byte-length, grapheme-length).

---

## Notes for reviewer (SD-002 focus areas)

### 1. O(1) check position — `src/sanitize-pii.ts:269-277`

The length check sits AFTER the empty-string short-circuit and BEFORE any regex `.replace()` call. Placement rationale:

- Empty-string short-circuit preserves v1.0.0 guard (`sanitizePii('')` returns `''` regardless of options).
- Length check runs next — before `tokensFor()` resolution and before any regex evaluation.
- First regex pass (`emailPattern()`) is on the next line.

Verify via test `sanitizePii — length check runs BEFORE regex (O(1) gate) › throws before touching a string that would redact as an email` — a 50 KB `@example.com`-tailed string with a 1_000 cap throws cleanly, proving regex never runs.

### 2. Error exportability — `src/index.ts:68-71`

`PiiInputTooLargeError` is exported as a named class from `src/limits.ts` and re-exported from the barrel `src/index.ts`. Consumers can:

```ts
import { sanitizePii, PiiInputTooLargeError } from '@kgn-git/privacy-utils';
try {
  const clean = sanitizePii(untrusted);
} catch (err) {
  if (err instanceof PiiInputTooLargeError) {
    // err.inputLength, err.maxInputLength available
  } else {
    throw err;
  }
}
```

`instanceof` discrimination verified across both `Error` and `PiiInputTooLargeError` (tests: `PiiInputTooLargeError — class shape`).

Prototype chain is restored in the constructor (`Object.setPrototypeOf(this, PiiInputTooLargeError.prototype)`) so `instanceof` stays correct if the TypeScript build target regresses from `ES2022` to an older ES version.

### 3. Middleware propagation — `src/pii-middleware.ts`

Every internal `sanitizePii` call in the middleware now receives `{ tokenFormat, maxInputLength }`. The plumbing uses an internal `PartOptions` type (`src/pii-middleware.ts:6-15`) threaded through `redactPart → redactMessage → redactPrompt → transformParams`. Uniformly applied to:

- String prompt (`redactPrompt`, `src/pii-middleware.ts:104-107`)
- String message content (`redactMessage`, `src/pii-middleware.ts:88-95`)
- Text part in message-array content (`redactPart`, `src/pii-middleware.ts:46-54`)
- Reasoning part in message-array content (`redactPart`, `src/pii-middleware.ts:55-63`)

`PiiInputTooLargeError` thrown by any of these `sanitizePii` calls propagates unwrapped out of `transformParams` — the AI SDK's `transformParams` signature permits throws (async function). Verified by test `createPiiMiddleware — maxInputLength threading › passes through non-prompt params untouched when over-cap throws`.

### 4. Per-part scope (not cumulative)

Intentional design decision per ADR 002 §5. Test `createPiiMiddleware — maxInputLength threading › applies the cap PER PART, not cumulatively across a message array` verifies that two 60-char parts each under a 100-char cap both pass, even though cumulative size is 120. Rationale in ADR: regex CPU is per-call; per-part scope is predictable for fragment composition; cumulative scope would retroactively break prompts as parts are added.

### 5. Backward-compat byte-equivalence

No baseline test file touched. All 209 existing tests (`idn-email`, `locale-patterns`, `locale-phone-patterns`, `pii-middleware`, `sanitize-pii`, `token-format`) pass unchanged. The one fixture correction (the "at exactly DEFAULT_MAX_INPUT_LENGTH" test) is inside the new `input-length-cap.test.ts` file — it was discovered during GREEN implementation when the filler character collided with the email regex; corrected to space-filler in the same GREEN commit, documented inline in the commit message. The RED → GREEN transition is still verifiable (the test file failed to load in RED because `src/limits.ts` did not exist; once the module landed in GREEN, all 30 tests pass).

---

## SD-007 prior-issue merge gate verification

Checked before branch creation (`feature/10-input-length-cap` created at 2026-04-19 ~21:58):

- Issue #9 (R8 tokenFormat) → PR #28 merged 2026-04-19 19:26 UTC (base: `main`, `mergedAt` set). Gate PASSED.
- Issue #3 (R5 IDN email) → PR #27 merged 2026-04-19 18:08 UTC. Gate PASSED.
- Issue #2 (R2 EU phones) → PR #26 merged prior. Gate PASSED.
- Issue #1 (R1 addresses) → PR #22 merged prior. Gate PASSED.

Open PRs at branch-creation time: PR #25 (Dependabot `actions/checkout` bump) — exempt from SD-007 (not a sprint issue). No open non-exempt sprint PRs. Gate cleared.

---

## Known AC deviations

None. All acceptance criteria implemented; no scope creep.

---

## Process Rule Violations

None observed.

- SI-001 (TDD RED before GREEN) satisfied — separate `test(#10): RED` commit (`bd9088b`) precedes the `feat(#10): GREEN` commit (`8c3583f`).
- SI-002 / SD-001 (handover file before completion) satisfied — this file is written and committed before the `/developer` completion summary is returned.
- SD-002 amended (code review is the dispatcher's responsibility) satisfied — `/developer` does not invoke review; leaves the branch in the reviewable state documented above.
- SD-007 (prior-issue merge gate) satisfied — verification recorded above.
- R-51 (one commit per issue) satisfied — three commits all prefixed `<type>(#10):`, all referencing the same issue.
- R-54 (GitHub issue number required) satisfied — issue #10 referenced throughout.

---

## Known Tech Debt

None introduced. The `onOverflow: 'throw' | 'truncate'` configurability option is noted in ADR 002 as deferred to v1.2 if consumer demand emerges.

---

## Handover To

Dispatcher (`/programme-manager`) for:

1. Code review — run `Agent(subagent_type="feature-dev:code-reviewer", ...)` against `feature/10-input-length-cap` at top-level session scope, then populate the `## Code Review` section above with the verdict + findings.
2. Merge to `main` after review verdict is Ready-to-merge.
3. Update `feedback_sprint_2k_planned_rev2.md` auto-memory — mark #10 as completed.
