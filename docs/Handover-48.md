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

Comment URL: https://github.com/kgn-git/jobflow-privacyutils/issues/48#issuecomment-4405749527

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
- Head SHA (pre-handover-finalise): `9294c71db94ad66095b3c1c78fe4fcb8a2ee92f4` (final HEAD will advance one commit when this handover-finalise commit is pushed)
- Build: `npm run build` — green
- Lint: `npm run lint` — green
- Tests: `npm test -- --run` — **360 / 361** passing. The single failing test (`src/__tests__/locale-patterns.test.ts > sanitizePii regex-only — performance budget`) is **a pre-existing flake on `main`**, not a regression. The same test fails on the unmodified `main` baseline at `17e0928d` (measured `~41.9ms` mean) and on this branch (measured `~14.5ms` mean) — both above the `<10ms` budget under concurrent-worker-pool Vitest load on this Windows dev machine. When run in isolation (`vitest run src/__tests__/locale-patterns.test.ts`), the perf assertion passes well under budget. This PR contains zero `src/` changes, so a runtime regression is not possible. Test count is preserved (361 → 361, same passing 360 / failing 1 mapping). Flagged in PR body for project-manager review at SD-002.
- TDD compliance: N/A — docs/license content has no test surface
- Branch pushed to origin
- PR opened against `main`
- PR URL: https://github.com/kgn-git/jobflow-privacyutils/pull/50

## Code Review

(SD-002 dispatcher-side review section — to be filled by /project-manager after review.)
