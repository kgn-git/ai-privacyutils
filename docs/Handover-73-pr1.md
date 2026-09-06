# Handover: #73 PR-1 — shared range-merge helper

**Date:** 2026-09-06 · **Branch:** `refactor/73-pr1-redact-ranges-helper` off `main` @ `d4b2c35` · **Developer:** Claude Code (`/developer`) · **Repo:** `kgn-git/ai-privacyutils`

## What changed

| Commit | Subject |
|---|---|
| `3c32bfa` | test(#73): red unit test for the range-merge helper — RED (module absent, suite fails to load) |
| `a9b626d` | refactor(#73): extract range-merge helper from sanitize-pii — GREEN |

- **Duplication as found** (`src/sanitize-pii.ts` @ `d4b2c35`): lines 156–178 in `redactLocalePhones` and lines 249–267 in `redactNationalIds` — the same empty-guard, sort (`start` asc / `end` desc), overlap-merge (`r.start <= last.end`), and reverse splice. Identical except two inline comments and the token variable name.
- **Helper:** `src/redact-ranges.ts` (new, internal, not exported from `src/index.ts`) — `redactRanges(text: string, ranges: ReadonlyArray<ByteRange>, token: string): string` with `interface ByteRange { start: number; end: number }`. Carries the `COMPLIANCE:` destructive-redaction header in the `patterns-national-id.ts` shape plus one line saying what it does. One deliberate difference from the moved block: it sorts a copy, so the caller's array is not reordered (pinned by a test; neither caller reads `ranges` afterwards, so output is unaffected).
- **Call sites:** both functions now end in `return redactRanges(text, ranges, token)`; the two `ranges` locals are typed `ByteRange[]`. The two inline comments that annotated the removed lines went with them; no other comment in the file was touched (PR-3 owns the comment pass).
- **Untouched:** `src/index.ts`, `package.json`, `scripts/redos-scan.mjs`, every regex literal, every existing test file (`git diff --stat main -- src/__tests__ src/index.ts package.json scripts` lists only the new test file).
- `src/sanitize-pii.ts` code lines 175 → 144; `src/redact-ranges.ts` 29 (ESLint `max-lines` with `skipBlankLines`/`skipComments`, run in node:20 Docker).

## Gates (all in node:20 Docker, foreground, 2026-09-06 18:57–19:02 UTC)

| Check | Baseline (`main` @ `d4b2c35`) | Branch @ `a9b626d` |
|---|---|---|
| `npx vitest run` | `Test Files 1 failed / 13 passed (14)` · `Tests 1 failed / 377 passed (378)` | `Test Files 1 failed / 14 passed (15)` · `Tests 1 failed / 386 passed (387)` |
| Pattern-factory `source`+`flags` dump (22 entries each, derived by enumerating `dist/patterns.js` exports ending in `Pattern`) | `patterns-before.txt` | `patterns-after.txt` — `diff` = ∅ |
| `npm run redos:scan` | 22 `OK … safe` | 22 `OK … safe` |
| `npm run lint` | — | clean |
| `npm run build` | — | clean |

- **Test count 378 → 387 = +9, exactly the new file's tests.** Test-file diff vs `main` = ∅ apart from `src/__tests__/redact-ranges.test.ts`.
- **The single failing test is pre-existing and identical on the untouched baseline:** `locale-patterns.test.ts:567` wall-clock micro-benchmark (`mean < 10ms` on 10 KB) measured 17.7 ms on `main` and 21.8 / 22.5 ms on the branch under the full parallel run, with 23 unrelated Supabase containers live on the host (`docker ps` at 18:56). Run alone (19:02, in the same container as the mutation control below — the mutation does not touch the timed path) it passes 58/58. It asserts timing, not redaction output; not touched here (SD-065 — not masked, not retried into green; noted for the CI run on the PR, which runs on a quiet runner).
- **Mutation control (the test perturbs the subject):** flipping `<=` to `<` in the helper failed exactly one test (`merges ranges that touch end-to-start`, 1/9), then reverted; tree confirmed clean before the final run.

## Reviewable state

- Per-cycle gates green on the branch: `lint`, `build` (tsc emit), full `vitest run` (386/387 — the 1 is the pre-existing benchmark above), `redos:scan` 22/22: ✅
- TDD verifiable in commit history (SI-001): RED `3c32bfa` precedes GREEN `a9b626d`: ✅
- Tests removed (SD-053 prune check): None.
- Branch pushed + PR opened against `main`; `## What Users See` omitted — pure refactor, output byte-identical: ✅
- Reachability (SD-037) / Journey (SD-039): N/A — library internal, no user-facing surface.
- Handover written before the completion summary; `## Code Review` left for the dispatcher (SD-002).
- **Sceptic self-critique: 4 objections — fixed/reconciled.** (1) *Suite not fully green* — the failure is the same wall-clock benchmark on the untouched baseline, passes in isolation, and asserts timing, not behaviour; stated rather than hidden. (2) *Helper is not a verbatim move (sorts a copy)* — no caller reads `ranges` after the call; the difference is unobservable at the output and is pinned by a test. (3) *Two comments deleted although PR-3 owns comments* — they described lines that no longer exist in that file; leaving them would orphan them. Declared here for the reviewer. (4) *"+9 tests" says nothing about vacuity* — the file went red for absence first, and the mutation control shows an assertion that fails on a one-character behaviour change.

## Pre-implementation expert reviews (from the dispatch preamble)

| Expert | Consulted | Verdict | Reference |
|---|---|---|---|
| /compliance-officer | 2026-08-31 (rulings 2026-09-06) | PASS conditional on ACs 3–5, 7 — byte-identical output; `COMPLIANCE:` header on every new PII-range file | issue #73 § Expert Assessments |
| /tech-expert | 2026-08-31 | PASS — DRY fix on the verbatim duplicate; regex byte-drift pinned by fixture suites + source dump | issue #73 § Expert Assessments |
| /security-expert | N/A — fast-path | No new dependency, no pattern change; ReDoS gate asserted non-vacuous (22 OK) | issue #73 § Expert Assessments |
| /tech-ops-expert | N/A — fast-path | No CI/config change; `exports` map hides the new internal file | issue #73 § Expert Assessments |

## Downstream impact

- Created `redactRanges` + `ByteRange` in `src/redact-ranges.ts` (internal). `src/sanitize-pii.ts` now imports it.
- PR-2 (`max-lines` + comment-ratio script) will measure `src/redact-ranges.ts` as a new file: 29 code lines, 8 comment lines (6-line `COMPLIANCE:` header + 2) — under the 30-comment-line floor in `code-standards.md`, so it does not add to the over-ratio count.
- PR-3 (comment pass) inherits `sanitize-pii.ts` with its two "identical pattern to `redactLocalePhones`" / merge-narrative JSDoc paragraphs (the `redactLocalePhones` header lines 127–131 and the `redactNationalIds` header lines 189–192 @ `d4b2c35`) now describing code that lives in the helper — candidates for that pass, not touched here.
- Ordering: PR-2 and PR-3 should base on this PR once merged; nothing in PR-1 depends on either.

## Code Review (left blank — dispatcher populates after SD-002 review)

- Verdict: pending dispatcher review

## CI on PR #74 (run 34053602717, 2026-09-06 19:02 UTC)

`lint`, `typecheck`, `redos-scan`, `audit`, `dependency-review`, CodeQL: **pass**. `test`: **fail** — the same `locale-patterns.test.ts:567` benchmark, 23.5 ms under `vitest run --coverage` on the GitHub runner, everything else 386/386. **Pre-existing on `main`:** the CI run for `d4b2c35` itself (29237354596, 2026-07-13) fails the `test` job on the identical assertion (28.07 ms), and the last five `main` runs back to 2026-04-30 are all `failure`; PR #66's `test` job failed the same way. Not fixed here — it is a test-file edit, outside PR-1's behaviour-frozen scope and against the test-file-diff = ∅ invariant. **Decision owed to the dispatcher/founder:** the `test` CI job cannot go green on any PR until the benchmark's threshold or its CI-gating status is ruled (options: raise the ceiling for the coverage-instrumented CI run; run the benchmark outside the gating suite; keep it as a measured, non-gating benchmark like the NER cohort tests).

## Known tech debt / process notes

- `locale-patterns.test.ts:567` timing benchmark is host-contention-sensitive under the full parallel run (fails on baseline and branch alike on this host today); pre-existing, outside this PR's scope.
- `.claude/CLAUDE.md` exists locally but is gitignored — the tracked tree has no `CLAUDE.md` (PR-2 lands one per the issue scope).

→ `/project-manager` for SD-002 review; do not merge from here.
