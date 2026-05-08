# Handover — Issue #48 (pre-flip documentation PR)

## Issue

privacyutils#48 — `ops: flip repository to public visibility` — pre-flip documentation PR (LICENSE replacement, package.json license field, README + CONTRIBUTING updates, SECURITY.md addition).

## Pre-Implementation Expert Reviews

Per `CLAUDE.md` § Expert Roster — `compliance` + `ci-hardening` + supply-chain scope; all four mandatory experts engaged at the project-manager layer ahead of dispatch.

| Expert | Verdict | Reference |
|---|---|---|
| `/compliance-officer` | PASS — 3 additions (Kerckhoffs framing, ComplianceReview annotation deferred to separate PR, no GDPR/AI Act impact) | Issue #48 expert-review comment §C.1 |
| `/security-expert` | PASS WITH CONDITIONS — 6 conditions, all addressed by this PR or by issue #49 | Issue #48 expert-review comment §C.2 |
| `/tech-expert` | PASS — `package.json` license field MUST track LICENSE SPDX id | Issue #48 expert-review comment §C.3 |
| `/tech-ops-expert` | PASS WITH CONDITIONS — body corrections (scoring N/A items) absorbed; lockfile-sequencing gotcha surfaced | Issue #48 expert-review comment §C.4 |

Comment URL: https://github.com/kgn-git/ai-privacyutils/issues/48#issuecomment-4405749527

## What was implemented

- Replaced proprietary `LICENSE` with canonical MIT (copyright 2026 kgn-git).
- Updated `package.json` `"license"` field from `"UNLICENSED"` → `"MIT"`.
- Updated `README.md` § License + appended Kerckhoffs paragraph to § Security Posture (S11) framing the package as designed to remain robust under public source disclosure (Art. 32 framing).
- Updated `CONTRIBUTING.md` — added external-contributions stance (issues enabled, no SLA, external PRs closed without review), rewrote obsolete § Releasing section (removed `npm publish --provenance` + Sigstore Rekor steps; replaced with current git-install tag flow), corrected branch-protection language to match CLAUDE.md S1 deferred state (with cross-reference to issue #49).
- Added `SECURITY.md` at repo root with GitHub PVR disclosure channel, no-SLA stance, scope/out-of-scope (Kerckhoffs-style "pattern visibility" reports explicitly out of scope), install-time execution surface disclosure (prepare → `tsc` only), Kerckhoffs note, and forward-reading links to README S11 + INTEGRITY.md + Handover-35.

## Technical decisions

- **MIT text:** SPDX-canonical text used verbatim (no custom clauses) — user confirmed standard MIT covers warranty disclaimer + liability waiver in paragraphs 2–3.
- **Copyright holder:** `kgn-git` (org) per locked decision.
- **No version bump:** docs/license-only change; no SemVer trigger per CLAUDE.md SemVer policy. Package stays at `1.2.0`.
- **CONTRIBUTING.md § Releasing rewrite:** removed obsolete `npm publish --provenance` + Sigstore Rekor + `actions/attest-build-provenance@v2.3.0` steps; `git tag -a` (annotated, not signed) reflects the S3-deferred posture; the existing `docs/SIGNING-TAGS.md` reference is retained as a forward-looking activation marker for when S3 activates.
- **Out-of-scope deviation surfaced:** the existing `## Security reports` paragraph at the foot of CONTRIBUTING.md still references "email the release maintainer listed in `docs/SIGNING-TAGS.md`". This is factually stale (no maintainer email lives in `docs/SIGNING-TAGS.md`) and SECURITY.md is now the canonical channel. Per the binding spec's named-changes-only constraint, the paragraph was NOT modified in this PR; flagged for follow-on housekeeping.

## AC deviations

- `CONTRIBUTING.md § Security reports` left untouched per spec scope (not in the named changes 4a/4b/4c). Now technically inconsistent with the new `SECURITY.md` — should be updated in a follow-on doc-housekeeping PR (or via #49 if that issue's scope expands).

## Reviewable state

- Branch: `feat/issue-48-pre-flip-docs`
- Base SHA: `17e0928dc13f985bc3e8891ab8a8237e98bec5eb`
- Head SHA (post SD-002 round 1 fixes): `d0a90ae33e8833324c8c89b36a796c07371f0a9d` (final HEAD will advance one commit when this handover-finalise commit is pushed)
- Build: `npm run build` — green
- Lint: `npm run lint` — green
- Tests: `npm test -- --run` — **360 / 361** passing. The single failing test (`src/__tests__/locale-patterns.test.ts > sanitizePii regex-only — performance budget`) is **a pre-existing flake on `main`**, not a regression. The same test fails on the unmodified `main` baseline at `17e0928d` (measured `~41.9ms` mean) and on this branch (measured `~14.5ms` mean) — both above the `<10ms` budget under concurrent-worker-pool Vitest load on this Windows dev machine. When run in isolation (`vitest run src/__tests__/locale-patterns.test.ts`), the perf assertion passes well under budget. This PR contains zero `src/` changes, so a runtime regression is not possible. Test count is preserved (361 → 361, same passing 360 / failing 1 mapping). Flagged in PR body for project-manager review at SD-002.
- TDD compliance: N/A — docs/license content has no test surface
- Branch pushed to origin
- PR opened against `main`
- PR URL: https://github.com/kgn-git/ai-privacyutils/pull/50

## SD-002 fix commits

Round 1 verdict: Fix first (2 Important findings, 0 Critical, 2 Minor pre-existing).

- I-1 fix: `a667f3628fcabd3f15acd7fdea4a6e5443ef6b9a` — README Kerckhoffs paragraph: "SD-002 reviews" → "code reviews"
- I-2 fix: `d0a90ae33e8833324c8c89b36a796c07371f0a9d` — CONTRIBUTING § Security reports: rewrote to point at SECURITY.md canonical channel, removed dead docs/SIGNING-TAGS.md email reference

## Code Review

- **Reviewer:** `feature-dev:code-reviewer` subagent (dispatched 2026-05-08 by `/project-manager` at top-level session, per SD-002 amendment / `_shared-context/process-rules.md` § Sprint 2F Evolution Constraint)
- **Base SHA:** `17e0928dc13f985bc3e8891ab8a8237e98bec5eb`
- **Round 1 head SHA:** `40f49297d2615125d19063af247f4ecd26dd8684`
- **Final head SHA:** `3b98f7aba026ddd18fc2b0ad3365bd742b43235b`
- **Round 1 verdict:** Fix first
- **Round 2 (re-review) verdict:** Ready to merge
- **Critical findings:** 0
- **Important findings:** 2 (both fixed in round 1)
  - **I-1** — `README.md` § Security Posture (S11) Kerckhoffs paragraph leaked internal jargon (`SD-002`) into a now-public file. Fixed in `a667f3628fcabd3f15acd7fdea4a6e5443ef6b9a`: replaced "SD-002 reviews" with "code reviews".
  - **I-2** — `CONTRIBUTING.md` § Security reports (line 87) referenced a dead email channel via `docs/SIGNING-TAGS.md` (TBD maintainer table) and conflicted with the canonical channel newly defined in `SECURITY.md`. Fixed in `d0a90ae33e8833324c8c89b36a796c07371f0a9d`: rewrote paragraph to point at `SECURITY.md` as the canonical channel.
- **Minor findings:** 2 (both pre-existing on `main`; NOT introduced by this PR; filed as follow-up housekeeping issues by `/project-manager`)
  - **M-1** — `README.md` § SemVer policy line 300: "Every tag cuts from `main` via a signed annotated tag (see S3)" reads as current practice when S3 is deferred.
  - **M-2** — `README.md` § SemVer policy line 300: "The CHANGELOG records the fixture-level diff for every release" but no `CHANGELOG.md` exists at repo root.
- **Fix commits:** `a667f362`, `d0a90ae3` (functional fixes); `3b98f7ab` (handover update with fix-commit refs)
- **Re-review (round 2):** `feature-dev:code-reviewer` re-dispatched 2026-05-08 against the diff `40f4929..3b98f7a`. Both fixes confirmed exact; no collateral edits; no new findings introduced. **Ready to merge.**

PR #50 is authorised for merge by the project-manager. Final merge action is the user's call (project rule: PRs require user authorisation).
