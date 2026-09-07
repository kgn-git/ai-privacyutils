# Handover: #73 PR-2 — max-lines 550, comment-ratio CI step, mergeRanges

**Date:** 2026-09-07 · **Branch:** `feat/73-pr2-max-lines-comment-ratio` off `main` @ `54113fb` · **Developer:** Claude Code (`/developer`) · **Repo:** `kgn-git/ai-privacyutils`

## What changed

| Commit | Subject |
|---|---|
| `9ffe808` | test(#73): red tests for the comment-ratio ratchet — RED (module absent, both suites fail to load) |
| `80d3d49` | test(#73): boundary fixture derived above the ratio floor — the one-over case at 100 code lines sat under the 30-line floor; found at GREEN, fixed before it |
| `3ad3a6e` | feat(#73): comment-ratio ratchet and the strip-comments classifier — GREEN 39/39 |
| `44d66e3` | test(#73): red test for mergeRanges and the ner span seam — RED (8 of 11; the 3 seam tests characterise the standing behaviour) |
| `5a7fb81` | refactor(#73): route the ner span merge through mergeRanges — GREEN |
| then | chore: `max-lines` at error · ci: ratio step + true header · docs: `CLAUDE.md` |

- **`eslint.config.js`** — `'max-lines': ['error', { max: 550, skipBlankLines: true, skipComments: true }]`, no override; lint exits 0 on the unmodified tree (largest file 381 code lines).
- **`scripts/comment-ratio.mjs`** (new) — measures every `src/**` and `scripts/**` source at HEAD against the merge base with `origin/main` (`COMMENT_RATIO_BASE` overrides); a clone with no reachable merge base (shallow) exits 2 naming `fetch-depth: 0`, and a HEAD tree with no in-scope file exits 2 — never a pass measured at another commit or at nothing. Fails on a new file over the line, a file over the line that gained comment lines, or a risen count; exit 2 on any git failure (no "not a repo → pass"). One assert line carries both counts. **`scripts/lib/strip-comments.mjs`** is the platform classifier byte for byte: sha256 `6539926b12e465fec099c663cc42476807a0c3adb011f32d5e6190a105bafce1` on the platform worktree, the `origin/main` blob, and this copy (blob id `b961a0f5…` on both sides).
- **`.github/workflows/ci.yml`** — `lint` job checks out with `fetch-depth: 0` and gains one step after eslint: `git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main` then `npm run lint:ratio`, so the ratchet runs at the merge base. Header lines 3–5 now say what is true: no branch protection or ruleset on `main` (`gh api …/branches/main/protection` → 404, `…/rulesets` → `[]`, checked 2026-09-07).
- **`src/redact-ranges.ts`** — `mergeRanges(ranges): ByteRange[]` exported (sort a copy, fold overlapping/touching, return plain `{start,end}` pairs); `redactRanges` calls it. **`src/sanitize-pii-async.ts`** — `mergeSpans` and its docblock deleted; `applyNerRedactions` calls `mergeRanges(nerSpans)`. Code lines 82 → 65, comment lines 161 → 155.
- **`vitest.config.ts`** — `include` also collects `scripts/**/__tests__/**/*.test.ts`. **`package.json`** — one `scripts` entry, `lint:ratio`; no dependency, no `exports` change (the body's OUT line names `package.json`; the dispatch asked for the script — flagged for the reviewer, consumer surface unchanged).
- **`CLAUDE.md`** (new, tracked) — run/test commands and the enforcement-moment sentence in the template wording.
- **Untouched:** `src/index.ts`, `scripts/redos-scan.mjs`, `src/patterns*.ts`, every existing test file (`git diff --name-status origin/main -- src/__tests__` lists only `A src/__tests__/merge-ranges.test.ts`).

## Proofs (host = Windows for git/eslint/tsc; node:20 Docker for vitest/build/redos, 2026-09-07 08:16–08:29 UTC)

| Control | Result |
|---|---|
| `max-lines`, boundary derived from `eslint.config.js` at run time (`probe-max-lines.mjs`) | 551 code lines → eslint exit 1, `File has too many lines (551). Maximum allowed is 550`; 550 → exit 0; probe removed |
| Ratio, new file over the line (`src/probe-ratio.ts`, 120 code / 31 comment, committed as `307d158`) | exit 1: `new file with 31 comment lines on 120 code lines`, `rose from 17 to 18`; commit dropped |
| Ratio, existing file worsened (`src/profiles.ts` +1 comment line, committed as `0d7d605`) | exit 1: `src/profiles.ts: 63 → 64 comment lines on 1 code lines`; count stayed 17; commit dropped |
| Probes removed, HEAD `5a7fb81` | `17 of 35 in-scope files over the line at HEAD, 17 of 30 at base 54113fb (merge base with origin/main) — pass`; lint exit 0 |
| 22 pattern-factory `source`+`flags` dumps before/after | `diff` = ∅; positive control (one flag flipped in a copy) → diff exit 1 |
| Mutation `<=` → `<` in `mergeRanges` | exactly 3 red: `redact-ranges` touching, `mergeRanges` touching, and the seam through `applyNerRedactions` (`Hi [person][person] here`); `sanitize-pii-async.test.ts` 12/12 stays green — the standing suite never pinned touching spans; reverted |

Gates: `npx vitest run` → `Test Files 1 failed / 17 passed (18)` · `Tests 1 failed / 436 passed (437)` = 386 + 39 ratio + 11 merge. The one failure is `locale-patterns.test.ts:567` (19.2 ms mean vs 10, 23 Supabase containers live); run alone in the same container it passes 58/58 (08:31 UTC) — pre-existing, not edited. `npm run lint` clean · `npm run build` clean · `npm run redos:scan` 22 `OK … safe`, ends `all patterns safe.` · `tsc --noEmit -p tsconfig.json` error set identical to `origin/main` (24 == 24, compared by `file(line,col): code`). "CI passed" is not an available claim here.

## Reviewable state

- Per-cycle gates green on the branch (lint, tsc set-equality, full suite bar the pre-existing benchmark): ✅
- TDD verifiable (SI-001): `9ffe808` → `3ad3a6e`, `44d66e3` → `5a7fb81`: ✅ · Tests removed: None.
- Branch pushed + PR against `main`; `## What Users See` omitted — library output byte-identical: ✅
- Reachability / Journey: N/A — no user-facing surface.
- Handover written before the completion summary; `## Code Review` left for the dispatcher.
- **Sceptic self-critique: 5 objections — fixed/reconciled.** (1) *Shallow fallback measures the tip, not the merge base* — dismissed in round 1 as "the same commit on a PR merge checkout"; the SD-002 review (M-1) showed that holds only until `main` advances, and the dismissal hid a false pass. Fix round: the fallback is gone, the `lint` job checks out full history, and the e2e case *a shallow clone whose base advanced after the branch point blocks with exit 2* reproduced the false pass (exit 0) before the fix. (2) *The count rule only fired together with the new-file rule on the real tree* — the count-only case (a file crossing by losing code) is pinned by a unit test. (3) *`mergeSpans` deleted, not routed* — M1's aim was one implementation; the wrapper was the third copy; the seam test and the untouched async suite pin the route. (4) *`merge-ranges.test.ts` is named for the export, not the module file* — it also covers the `applyNerRedactions` seam; renaming is a reviewer call. (5) *`package.json` touched against the body's OUT line* — a `scripts` entry only; declared above.

## Pre-implementation expert reviews (from the dispatch preamble)

| Expert | Consulted | Verdict | Reference |
|---|---|---|---|
| /compliance-officer | 2026-09-07 | PASS — 25 %, no repo-specific threshold | issue #73 § Expert Assessments |
| /tech-expert | 2026-08-31 | PASS — stale `ci.yml` claim fixed in PR-2 | issue #73 § Expert Assessments |
| /security-expert | N/A — fast-path | ReDoS surface unchanged (22 OK) | issue #73 § Expert Assessments |
| /tech-ops-expert | N/A — fast-path | one CI step, no dependency | issue #73 § Expert Assessments |

## Downstream impact

- Created `mergeRanges` (internal export of `src/redact-ranges.ts`); deleted `mergeSpans` from `src/sanitize-pii-async.ts` with its docblock — one of M2's three stale anchors is gone; the two at the `applyNerRedactions` docblock and the reverse-order comment remain for PR-3.
- **PR-3 ordering:** base on this PR. The ratchet now runs in CI, so PR-3's sweep is measured: a touched file over the line may not gain comment lines and the count (17 of 35 at HEAD: 12 `src`, 5 tests) may not rise; `docs/compliance/redaction-record.md` is outside its scope.
- The `test` CI job now runs the ratio e2e (needs `git`, present on the runner); coverage `include` is `src/**` only.
- The gitignored `.claude/CLAUDE.md` still carries the expert roster; the tracked `CLAUDE.md` does not — the roster is not in git.

## CI on PR #75 (run 34100992333 @ `ef79029`, 2026-09-07 08:31 UTC)

`lint` (eslint, then `comment-ratio: 17 of 35 in-scope files over the line at HEAD 0914a3d, 17 of 30 at base 54113fb (origin/main tip, shallow clone) — pass`), `typecheck`, `redos-scan`, `audit`, `dependency-review`: **pass**. `test`: **fail** on the same `locale-patterns.test.ts:567` benchmark (23.9 ms on the runner), `Test Files 1 failed | 17 passed (18)` — the ratio e2e ran green on the runner.

## Fix round — SD-002 round 1 (M-1, m-1, m-2, m-4), `d74dd4a` → `0977a63`

- **M-1** — the shallow fallback is removed: `resolveBase` returns only `git merge-base`, and a clone with no reachable merge base exits 2 naming `fetch-depth: 0`; the `lint` job checks out full history and fetches `main` without `--depth=1`. The e2e case *a shallow clone whose base advanced after the branch point blocks with exit 2 naming fetch-depth: 0 — never a pass at the tip* exited 0 on the unfixed script (the false pass, on a real clone) and exits 2 after; its twin *the same history in a full clone, as CI checks out, is measured at the merge base: the file is new there (exit 1)* pins the CI shape.
- **m-1** `file://${repo}` URL (the old shape also passed on this host, git 2.52.0.windows.1) · **m-2** `head.size === 0` → exit 2, unit-pinned · **m-4** 82 base code lines, by `strip-comments.mjs` on the base blob.
- CI run 34107994599 @ `0977a63`: `lint` — `comment-ratio: 17 of 35 in-scope files over the line at HEAD 0039d7f, 17 of 30 at base 54113fb (merge base with origin/main) — pass`; `typecheck`, `redos-scan`, `audit`, `dependency-review` pass; `test` fails on the same benchmark (21.2 ms), with `comment-ratio.test.ts` 32/32 and `comment-ratio.e2e.test.ts` 10/10 on the runner. Host: `npx vitest run` 439/440 (the benchmark, 17.9 ms) · lint clean · tsc 24 == 24, all in `src/__tests__`.

## Code Review (left blank — dispatcher populates after SD-002 review)

- Verdict: pending dispatcher review

→ `/project-manager` for SD-002 review; do not merge from here.
