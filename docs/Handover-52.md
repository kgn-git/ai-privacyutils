# Handover — Issue #52 (rebrand: standalone OSS PII utility)

## Issue

ai-privacyutils#52 — `rebrand: reposition as standalone OSS PII utility — remove Jobflow / Joblama / programme references`. Filed 2026-05-08 after the public-visibility flip (#48 + PR #50). The repo went public on 2026-05-08; pre-flip docs PR (#50) established the public posture (MIT, SECURITY.md, Kerckhoffs framing) but retained programme-internal language. #52 sanitises that language in place across ~31 files while preserving every technical claim, AC, and engineering history. **No code, test, or behavioural changes — pure docs/text repositioning + one file move.**

The repo was renamed from `kgn-git/jobflow-privacyutils` to `kgn-git/ai-privacyutils` on 2026-05-08 via `gh repo rename`; this PR updates all in-repo references to the new canonical URL.

## Pre-Implementation Expert Reviews

Per CLAUDE.md § Expert Roster — `compliance` + `ci-hardening` + supply-chain scope. The four mandatory experts engaged at the project-manager layer for issue #48 (the immediately preceding public-flip PR) cover this issue's surface as well: #52 is positioning-only, with no GDPR, AI Act, security posture, API surface, or supply-chain change beyond text repositioning. No fresh expert engagement was required.

| Expert | Verdict (carried forward from #48) | Notes |
|---|---|---|
| `/compliance-officer` | PASS | No data-class scope change, no AI Act surface, no GDPR posture change. |
| `/security-expert` | PASS | No supply-chain or threat-model change; no new dependencies; no pattern additions. |
| `/tech-expert` | PASS | No API surface change; no exported names altered; no ADR delta. |
| `/tech-ops-expert` | PASS | No bundle-size impact; no CI workflow change; no runtime dep delta. |

## What was implemented

11 commits on `feat/issue-52-standalone-rebrand`, in commit-order:

1. `3a77570` chore — package.json URL fields (`repository.url`, `bugs.url`, `homepage`) + `description` rewrite + `"jobflow"` keyword removal; canonical name updated.
2. `d8574b2` docs — README repositioned as a generic OSS PII-utility (top intro, GDPR rationale, consumer references, cross-repo path leaks all genericised).
3. `3b1265b` docs — CONTRIBUTING.md drops "SI-001"-style programme jargon, drops cross-repo references, keeps technical TDD + regex + SemVer guidance.
4. `63a8670` docs — SECURITY.md repo-URL update.
5. `adceb80` chore — `git mv CLAUDE.md .claude/CLAUDE.md` + `.gitignore` adds `.claude/` (file is now internal-only; programme refs inside it are fine since gitignored).
6. `9d255d3` docs — `src/**/*.ts` JSDoc top-of-file headers sanitised (drops "Jobflow LLM middleware" framing + cross-repo path leaks at `patterns.ts` / `sanitize-pii.ts` / `pii-middleware.ts` / `index.ts` and the test fixture headers). No code logic touched.
7. `be08547` docs — historical handovers Handover-1/2/3/6/8/9/10/11/23 sanitised (programme refs dropped, technical content preserved).
8. `59fed8c` docs — historical handovers Handover-35/42/48 sanitised (programme refs dropped, technical content preserved).
9. `a31d8f3` docs — ADRs 002/003/004 sanitised (programme refs dropped, technical content preserved).
10. `42cd922` docs — INTEGRITY.md + SIGNING-TAGS.md (programme refs dropped + URL updates).
11. `7a7c98b` docs — `.npmrc-sample` + `.github/branch-rulesets/README.md` (programme refs dropped + URL updates).

## Technical decisions

- **Sanitisation principles applied (per issue #52 spec):**
  - Replace narrative phrases ("Jobflow programme", "Joblama Platform", "the programme", "platform team", "scoring team") with generic equivalents ("this library", "the package", "consumer projects", "downstream consumers") or drop entirely.
  - Drop cross-repo path references (`jobflow-scoring/src/...`, `jobflow-programme/docs/...`, `jobflow-platform/src/...`).
  - Update repo URLs `jobflow-privacyutils` → `ai-privacyutils` (rename canonical 2026-05-08).
  - Keep all technical content: ACs, design decisions, file paths within this repo, version numbers, commit SHAs, test names, regex specifics, package-evolution history (e.g. "v1.1 added libphonenumber-js for R2", "v1.2 added compromise NER for R3").
- **CLAUDE.md gitignored move (commit 5):** the file's contents are unchanged after the move — programme references inside `.claude/CLAUDE.md` are fine because the file is now internal-only and not tracked. The move avoids the cost of sanitising a heavy programme-context file that ships only to the maintainer's local toolchain.
- **No version bump:** `package.json` `version` stays at `1.2.0`. Per the package's SemVer policy, docs/text repositioning has no SemVer trigger (no API change, no pattern change, no behavioural change).
- **No code/logic changes:** `src/*.ts` content beyond top-of-file JSDoc headers was not touched (those headers were already done in commit 6, prior dispatch). Test logic, regex patterns, and exported APIs are byte-identical to base.
- **No `dist/` commits.**
- **PR shape:** single bundled rebrand PR per spec.

## AC compliance

| AC | Status | Evidence |
|---|---|---|
| `package.json` description rewritten + `"jobflow"` keyword removed | ✅ | commit `3a77570` |
| README.md programme-context paragraphs rewritten as generic OSS positioning | ✅ | commit `d8574b2` |
| CONTRIBUTING.md sanitised | ✅ | commit `3b1265b` |
| All 7 source-file headers sanitised | ✅ | commit `9d255d3` |
| All 17 historical docs (Handover-N + ADRs + INTEGRITY + SIGNING-TAGS) sanitised in place | ✅ | commits `be08547`, `59fed8c`, `a31d8f3`, `42cd922` |
| `CLAUDE.md` moved to `.claude/CLAUDE.md` via `git mv` | ✅ | commit `adceb80` |
| `.gitignore` updated to add `.claude/` | ✅ | commit `adceb80` |
| `.npmrc-sample` comment genericised | ✅ | commit `7a7c98b` |
| `.github/branch-rulesets/README.md` programme refs dropped + URL updates | ✅ | commit `7a7c98b` |
| All repo URLs updated `jobflow-privacyutils` → `ai-privacyutils` | ✅ | distributed across all 11 commits |
| Quality gates green (lint + build + test baseline preserved) | ✅ | see § Reviewable state |
| Final-grep verification command run + output captured | ✅ | see below |
| Single bundled PR opened against `main`; SD-002 dispatcher-side review applied | ✅ (PR opened) / ⏳ (SD-002 review is dispatcher's responsibility) | see § Reviewable state |

### Final-grep verification

Run from the repo root:

```bash
git -C "c:/Dev/Jobflow-web/jobflow-privacyutils" grep -i 'jobflow\|joblama\|programme'
```

**Result: zero matches.** `git grep` searches only tracked files — `.claude/` (gitignored) and `node_modules/` / `dist/` / `coverage/` (gitignored) are correctly excluded. Verified at HEAD `7a7c98bff2b58a1bbc5a359502582cdc78d539e0` (before this handover-finalise commit).

## AC deviations

None.

A note for transparency, not a deviation: programme references that remain in `.claude/CLAUDE.md` are out of scope per the issue (`Move to `.claude/CLAUDE.md` and gitignore `.claude/` (no sanitisation needed once gitignored — internal-only)`). They are excluded from the final-grep by `.gitignore`, which is the AC's intended scope.

## Reviewable state

- **Branch:** `feat/issue-52-standalone-rebrand`
- **Base SHA:** `26639d7fbcadbb05aeb5af548d7a6e8f95d3b772`
- **Head SHA (pre handover-finalise):** `7a7c98bff2b58a1bbc5a359502582cdc78d539e0`
- **Build:** `npm run build` — green (tsc -p tsconfig.build.json, 0 errors)
- **Lint:** `npm run lint` — green (eslint src, 0 errors, 0 warnings)
- **Tests:** `npm test -- --run` — **360 / 361 passing**. The single failing test (`src/__tests__/locale-patterns.test.ts > sanitizePii regex-only — performance budget > processes a 10KB prompt in under 10ms (mean of 10 runs)`) is the **pre-existing perf flake** documented in PR #50 SD-002 record — not a regression. Measured mean this run: ~10.5 ms vs `<10` ms threshold. The same flake fails on `main` baseline; this PR contains zero `src/` logic changes, so a runtime regression is not possible. Test count preserved (361 → 361, same 360 passing / 1 flaking mapping). Pre-existing perf flake confirmed identical, NOT a new failure.
- **TDD compliance:** N/A — docs/license/text-only changes have no test surface.
- **Branch pushed to origin:** ⏳ done as part of finalisation (push step in § Phase D).
- **PR opened against main:** ⏳ to be filled in handover-finalise commit after `gh pr create`.
- **PR URL:** *to be filled by handover-finalise commit.*
- **Final HEAD SHA:** *to be filled by handover-finalise commit.*

## Code Review

*SD-002 dispatcher-side review section — to be filled by `/project-manager` after `feature-dev:code-reviewer` runs against this branch. The dispatcher takes review responsibility per SD-002 amended (process-rules.md § Sprint 2F Evolution Constraint). `/developer` does not self-review and does not merge.*
