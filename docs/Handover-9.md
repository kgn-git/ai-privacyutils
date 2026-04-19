# Handover — Issue #9 (R8: tokenFormat option — backward-compat v1.1)

**Date:** 2026-04-19
**Branch:** `feature/9-token-format`
**Developer:** Claude Code (`/developer` skill, dispatched by `/programme-manager`)
**Milestone:** Sprint 2K.A — v1.1 locale-aware PII + CI hardening
**Target release:** v1.1 (minor bump — `package.json` already at `1.1.0-dev`)
**Severity:** low (compliance review §R8)

---

## Implementation summary

### API-surface design decision

Issue #9 was rescoped from v2.0 (breaking) to v1.1 (backward-compat additive). The dispatch prompt required investigation of which API surface(s) should receive `tokenFormat`. I chose the **paired factory** approach:

- **`sanitizePii(text, options?)`** — added an optional second argument. `options = { tokenFormat?: 'readable' | 'sentinel' }`. Default is `'readable'`, which produces v1.0.0 byte-identical output. All prior fixtures remain green without modification.
- **`createPiiMiddleware(options?)`** — new middleware factory accepting the same `tokenFormat`. Threads through to every `sanitizePii` call inside `transformParams` (string prompt, array content, text parts, reasoning parts).
- **`piiMiddleware`** (existing const export) — preserved byte-identical as the zero-config default, now implemented as `createPiiMiddleware()`. Every existing consumer (including v1.0.0 fixtures) continues to observe readable tokens with zero code change.
- **`piiPatterns`** — NOT touched. Patterns are matchers, not redactors; tokenFormat is not a pattern-level concern.

Alternative rejected: converting `piiMiddleware` itself to a factory (breaking) — would have forced every existing consumer to rewire their middleware registration. The `piiMiddleware` const + new `createPiiMiddleware` factory pair keeps v1.0.0 usage intact while surfacing the new option cleanly.

### Token surface and mapping

Five token kinds exist in v1.0.0: email, address, postcode, phone, dob. Both formats cover all five exhaustively via a TypeScript `Record<TokenKind, string>`:

| Kind | Readable (default) | Sentinel |
|---|---|---|
| email | `[email]` | `<<REDACTED_EMAIL>>` |
| address | `[address]` | `<<REDACTED_ADDRESS>>` |
| postcode | `[postcode]` | `<<REDACTED_POSTCODE>>` |
| phone | `[phone]` | `<<REDACTED_PHONE>>` |
| dob | `[dob]` | `<<REDACTED_DOB>>` |

Defined in new `src/token-format.ts` as `TOKEN_FORMATS`; resolved via `tokensFor(format)`.

### Sentinel idempotency argument (key correctness claim)

The sentinel strings were chosen so that no v1.x redaction pattern can match a sentinel token. Verified structurally:

- **Email pattern** requires `@` — no sentinel contains `@`.
- **NANP phone + locale phone + DOB patterns** all require digit runs — no sentinel contains digits.
- **All address patterns** (EN, FR, DE, IT, ES, PT) require either (a) `\b\d` at match start (EN, DE compound-suffix, IT, ES, PT) or (b) a lowercase French street-type keyword (`rue`, `avenue`, `place` …) — sentinels start with `<<`, contain no lowercase FR keywords, and do not match the closed-set prefix alternations.
- **All postcode patterns** require leading digit runs (`\b\d`, `\b\d{4}-` for PT, `\b[A-Z]{1,2}\d` for UK) — no sentinel starts with these shapes.

Therefore `sanitizePii(sanitizePii(text, opts), opts) === sanitizePii(text, opts)` holds for both formats. Cross-format (sentinelise → readable-sanitize) is also a no-op for the same reason.

Proven empirically by 4 dedicated idempotency tests:
1. `readable: sanitizePii(sanitizePii(x)) === sanitizePii(x)`
2. `sentinel: sanitizePii(sanitizePii(x, sentinel), sentinel) === sanitizePii(x, sentinel)`
3. Mixed-mode: sentinel-then-readable is a strict no-op
4. Standalone sentinel string (`<<REDACTED_EMAIL>> <<REDACTED_PHONE>> …`) is unchanged under either pass

### Files touched

| File | Purpose |
|---|---|
| `src/token-format.ts` (new) | `TokenFormat` / `TokenKind` types, `TOKEN_FORMATS` constant, `tokensFor()` resolver, full ADR + idempotency invariant documented inline |
| `src/sanitize-pii.ts` | `sanitizePii(text, options?)` signature; `SanitizePiiOptions` interface export; token-map threaded through every `.replace()` call + `redactLocalePhones` accepts `phoneToken` argument |
| `src/pii-middleware.ts` | `createPiiMiddleware(options?)` factory (new export); `PiiMiddlewareOptions` interface; `piiMiddleware` re-implemented as `createPiiMiddleware()` (byte-identical behaviour); `redactPart` / `redactMessage` / `redactPrompt` thread `tokenFormat` through |
| `src/index.ts` | Re-exports `createPiiMiddleware`, `PiiMiddlewareOptions`, `SanitizePiiOptions`, `TOKEN_FORMATS`, `tokensFor`, `TokenFormat`, `TokenKind` |
| `src/__tests__/token-format.test.ts` (new) | 30 tests (RED commit) — type surface, default-readable byte-equivalence, sentinel correctness across all 5 kinds, idempotency across both formats + cross-format, null/empty parity, factory API, middleware backward-compat, middleware sentinel threading, array-content scrubbing, non-mutation |
| `README.md` | Usage section ("Opt-in sentinel tokens"), Known Limitations (R8 → Resolved), API reference (sanitizePii options, createPiiMiddleware), SemVer policy (opt-in = minor, default-swap = major/v2.0) |

No new regex patterns; no new third-party dependencies; `package.json` version unchanged (`1.1.0-dev` pre-existing from #1).

## API surfaces touched

- `sanitizePii(text, options?)` — signature change (backward-compat additive; second argument is optional).
- `createPiiMiddleware(options?)` — new export.
- `piiMiddleware` — preserved byte-identical as `createPiiMiddleware()`.
- Types: `TokenFormat`, `TokenKind`, `SanitizePiiOptions`, `PiiMiddlewareOptions` (all newly exported).
- Constants: `TOKEN_FORMATS`, `tokensFor` (newly exported).

## Acceptance criteria

- [x] `tokenFormat: 'readable' | 'sentinel'` option added to the appropriate API surface(s) — both `sanitizePii` and `createPiiMiddleware`, with `piiMiddleware` preserved as zero-config readable default
- [x] Default behaviour (`'readable'`) produces v1.0.0 byte-identical output — verified by:
  - The full baseline 179 tests remain green under the new signatures (no test modification required)
  - Regression-guard tests that pass no options, an empty options object, and explicit `tokenFormat: 'readable'` — all produce readable tokens
- [x] Sentinel format test fixtures covering every token type (email, phone, address, dob, postcode, NANP phone, locale phones FR/DE/IT/ES/PT, UK alphanumeric postcode, PT hyphenated postcode)
- [x] Idempotency preserved for BOTH formats — dedicated tests for readable, sentinel, cross-format (sentinel then readable), and standalone sentinel no-op
- [x] `piiMiddleware` / `createPiiMiddleware` tokenFormat option threads through to prompt scrubbing (tested for string prompt + array content + text parts)
- [x] ADR documented in `src/token-format.ts` file-header JSDoc + `README.md` ("Opt-in sentinel tokens" section)
- [x] `safe-regex` CI lint still passes — `npm run redos:scan` reports 13 OK + 3 pre-existing timeout WARNs (IT/ES/PT address patterns, unchanged from main) and exits with "all patterns safe"
- [x] README + CLAUDE.md documentation updated — README has new Usage example, Known Limitations R8 row, API reference, SemVer policy clarification
- [x] Minor bump SemVer — `package.json` at `1.1.0-dev`; #9 is shipping as part of v1.1 alongside #1/#2/#3 (all backward-compat additive)

## Reviewable state

- Build: clean (`npm run build` → tsc exits 0)
- Lint: clean (`npm run lint` → eslint exits 0)
- Tests: 209 / 209 passing (baseline 179 + 30 new in `token-format.test.ts`). `npm test -- --run` exit code 0.
- ReDoS scan: 13 OK + 3 WARN (timeout — pre-existing, IT/ES/PT address patterns NOT touched by this change) — script exits 0 with "all patterns safe".
- TDD compliance verifiable in commit history:
  - `97116e7 test(#9): RED — tokenFormat option (readable | sentinel) backward-compat` (18 failures)
  - `271fddb feat(#9): GREEN — tokenFormat option (readable | sentinel) v1.1` (209/209 green)
  - `c8e72f9 docs(#9): README — tokenFormat option + Known Limitations R8 resolved`
- Handover written before completion summary: ✓ (this file)
- Branch pushed to origin: pending (push happens after this file is committed)
- PR opened against `main`: pending (opens after push)

## Known AC deviations

None. All acceptance criteria from the rescoped v1.1 issue body are satisfied. One minor latitude:

- The `package.json` version bump was already done in issue #1's branch (`1.1.0-dev`). This issue does not re-bump; that's correct — #9 is one of several v1.1 features merging under the same version tag.

## Notes for SD-002 reviewer

Key correctness claims to verify:

1. **Backward-compat byte-equivalence (load-bearing).** The v1.0.0 fixtures in `src/__tests__/sanitize-pii.test.ts` (45 tests), `src/__tests__/locale-patterns.test.ts` (55), `src/__tests__/locale-phone-patterns.test.ts` (39), `src/__tests__/idn-email.test.ts` (23), and `src/__tests__/pii-middleware.test.ts` (17) all remain green with zero modification. This is the strongest empirical evidence that `sanitizePii(text)` with no options argument produces identical output to v1.0.0. Reviewer may want to spot-check one or two of the most behaviourally-sensitive tests (e.g. the FR address + postcode + DOB + phone adversarial chain in `locale-patterns.test.ts`) to confirm no subtle change.

2. **Sentinel idempotency argument.** The structural disjointness argument is in `src/token-format.ts` file-header JSDoc + this handover's "Sentinel idempotency argument" section. Reviewer should verify each claim:
   - `<<REDACTED_EMAIL>>` has no `@` → emailPattern can't match ✓ (lexical check)
   - `<<REDACTED_*>>` has no digits → phone/dob/postcode patterns can't match ✓ (lexical check)
   - `<<REDACTED_*>>` has no `\b\d` prefix → EN/DE/IT/ES/PT address + postcode patterns fail anchor ✓ (lexical check)
   - `<<REDACTED_*>>` contains no FR lowercase street keyword → FR address pattern fails prefix alternation ✓ (lexical check)
   - Closed-set prefix keywords (`Via`, `Calle`, `Rua`, `Hauptstraße` etc.) are not substrings of sentinel → IT/ES/PT/DE won't match ✓ (lexical check)
   
   Empirical verification: 4 idempotency tests exercise all combinations.

3. **Option threading through middleware.** Reviewer should trace: `createPiiMiddleware({ tokenFormat: 'sentinel' })` → closure captures `tokenFormat` → `transformParams` → `redactPrompt(prompt, tokenFormat)` → `redactMessage(msg, tokenFormat)` → `redactPart(part, tokenFormat)` → `sanitizePii(part.text, { tokenFormat })`. Every call site receives the argument. The middleware tests cover string prompt, string content, array content, and text parts with sentinel format — verify all four shapes route the option correctly.

4. **Non-mutation invariant preserved under factory.** The new factory still `deepClone`s the caller's params before any redaction. One test confirms the caller-provided `params` object is byte-identical (via `JSON.stringify` snapshot) after a sentinel-format middleware call.

5. **SemVer classification.** This ships as v1.1 minor:
   - All v1.0.0 consumers (including `piiMiddleware` imported by name) continue to observe readable tokens without any code change.
   - No default output byte diverges from v1.0.0 when no option is passed.
   - The `sanitizePii` signature change (adding a second optional argument) is non-breaking in TypeScript — existing call sites continue to type-check.
   - The `piiMiddleware` export is unchanged (both type and runtime value).
   
   Reviewer can sanity-check by running `git diff origin/main -- src/__tests__/` and confirming no existing test file was modified.

6. **Documentation ADR.** `src/token-format.ts` file-header JSDoc holds the full ADR with three rejected alternatives (UUID sentinel, per-type custom token, v1.1-default-swap). README "SemVer policy" row explicitly schedules the default-swap for v2.0, closing the loop on the rescope notice in the issue body.

## Code Review

<Left blank by /developer per SD-002 amendment 2026-04-15. The dispatcher (`/programme-manager` at top-level session) populates this section after running `Agent(subagent_type="feature-dev:code-reviewer")` against this branch.>

- Verdict: pending dispatcher review
- Critical findings: pending
- Important findings: pending
- Minor findings: pending
- Fix commit(s): pending

## Process rule compliance

- **SI-001 (TDD RED → GREEN, non-waivable):** `test: add stubs for #9` RED commit (`97116e7`) precedes the `feat(#9): GREEN` implementation commit (`271fddb`). Verified by `git log --oneline | grep "test:.*#9"` returning the RED commit SHA.
- **SI-002 / SD-001 (handover before completion):** this file exists at `docs/Handover-9.md` on the branch before the completion summary is emitted.
- **SD-002 amended (code review is dispatcher's responsibility):** `/developer` leaves the branch in reviewable state; `## Code Review` section is left blank with "pending dispatcher review" marker.
- **SD-007 (prior-issue merge gate):** verified at the top of this task — issues #1, #2, #3 (prior sprint issues with "R" identifiers) have merged PRs (#22, #26, #27). Only open PR on the repo is a Dependabot PR (not an issue PR). No blocking violation.
- **R-51 (one issue per commit):** all three commits on this branch have `(#9)` prefix; no cross-issue bundling.
- **R-54 (GitHub issue required):** issue #9 confirmed existing + rescoped to v1.1 in the issue body rescope notice.
- **No `main` commits, no `--force`, no `--no-verify`.** Feature-branch workflow respected throughout.

## Handover to

→ `/programme-manager` for SD-002 code review + PR merge coordination.

→ After merge, `/project-manager` for `/sprint-close` on issue #9 within Sprint 2K.A.
