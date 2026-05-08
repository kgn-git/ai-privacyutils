# Handover — Issue #11: Integrity verification docs + future SLSA path (git-install re-scope)

**Date:** 2026-04-20
**Branch:** `feature/11-integrity-verification-docs`
**Base:** `main` (fast-forward to `c1a1a2d` at start of work — #6 just merged)
**Developer:** Claude Code (/developer subagent dispatched by /project-manager)
**Sprint:** 2K.A — v1.1 locale-aware PII + CI hardening
**Target release:** v1.1 (docs-only; no SemVer bump; `package.json` stays at `1.1.0-dev`)

---

## Implementation summary

Docs-only change for the re-scoped #11 (original SLSA Level + npm `audit signatures` scope was superseded by the 2026-04-19 git-install pivot; see `docs/Handover-35.md` § Architecture pivot). Added a new standalone file `docs/INTEGRITY.md` (70 lines) containing the consumer-side integrity-verification elaboration under git-install, and inserted a 5-line summary + link into `README.md` between `## Security Posture (S11)` and `## SemVer policy`.

**Why standalone rather than inline in README:** draft content came in at 70 lines (6 subsections: pinning rule, tag vs SHA trade-off, clone-URL verification, future `git log --show-signature`, explicit "not provided" list, future SLSA upgrade path). Dispatch brief's threshold was ">60 lines → spin off to `docs/INTEGRITY.md` and leave a 1-paragraph summary + link." 70 > 60; split honoured. The standalone file also supports future cross-referencing from consumer READMEs without duplicating content.

**Placement of README summary:** between `## Security Posture (S11)` and `## SemVer policy`. Integrity verification is fundamentally a supply-chain / threat-model companion to Security Posture, not a how-to for using the library — clustering with S11 keeps governance content together (Installation → Usage → Design → Pattern inventory → Known Limitations → Security Posture → **Integrity verification** → SemVer → API reference). The alternative placement between Installation and Usage would have fragmented the threat-model narrative.

**Single-source-of-truth discipline:** README § Installation retains its basic pinning rule ("pin to an exact tag... never use a branch name or `main`") as the install-time contract. `docs/INTEGRITY.md` positions itself in its opening sentence as "a deeper elaboration of the consumer-side integrity posture" and links back to both § Installation (basic command) and § Security Posture (S1–S12 maintainer controls). The README summary links forward to INTEGRITY.md and reinforces the positioning. No duplicated JSON snippet, no conflicting pinning advice.

No code, tests, types, configuration, package.json, or build infrastructure was changed.

---

## SD-007 Prior-Issue Merge Gate Verification

**Gate status: PASS**

| Sprint 2K.A prior issue | State | PR | Merged to main |
|---|---|---|---|
| #1 (R1 addresses) | CLOSED | #22 | Yes (`9e2b98f`) |
| #2 (R2 phones) | CLOSED | #26 | Yes (`b5ce730`) |
| #3 (R5 IDN) | CLOSED | #27 | Yes (`18c88ae`) |
| #4 (R7 ReDoS CI lint) | CLOSED | merged | Yes |
| #5 (R12 supply-chain) | CLOSED | merged | Yes |
| #9 (R8 tokenFormat) | CLOSED | #28 | Yes (`d99ee67`) |
| #10 (R7 input-length cap) | CLOSED | #29 | Yes (`6688a06`) |
| #6 (design intent docs) | CLOSED | #30 | Yes (`c1a1a2d`) — merged 12:07Z today |

No open sprint-issue PRs against `main`. The single open PR at dispatch time (#25) is a Dependabot `actions/checkout` bump — not a sprint issue, exempt from SD-007 per the standard Dependabot exemption.

Branch was created off `origin/main` at `c1a1a2d` after fast-forward pull. No branch-hopping or partially-done prior work. No rebasing needed; #6 was already fully merged.

---

## Sections touched

| File | Change | Lines |
|---|---|---|
| `README.md` | Inserted `## Integrity verification` summary section (5 lines of content + headers) between `## Security Posture (S11)` and `## SemVer policy`. Cross-refs to `docs/INTEGRITY.md`, § Installation, § Security Posture | +6 |
| `docs/INTEGRITY.md` | **New file.** Full consumer-side integrity-verification elaboration: pinning rule → tag-vs-SHA trade-off → clone-URL verification → `git log --show-signature` post-S3 workflow → "NOT currently provided" explicit list → future SLSA upgrade path | +70 |

No other files changed. `package.json` version remains `1.1.0-dev`.

---

## Acceptance criteria

- [x] Integrity verification documentation added — `docs/INTEGRITY.md` (70 lines) + `README.md` summary + link (5 lines)
- [x] Exact-tag pinning required (no `^`, `~`, `main`) documented WITH example — INTEGRITY.md § Pin exact tags, with three `package.json` snippets (tag / SHA / NEVER) including an explicit comment on range syntax
- [x] Commit-SHA pinning as stricter option, with trade-off — INTEGRITY.md § Tag vs SHA trade-off (comparison table + recommendation paragraph + tag mutability / branch-protection-is-policy-not-protocol note)
- [x] Clone URL verification paragraph — INTEGRITY.md § Clone URL verification; explicit canonical `github:kgn-git/ai-privacyutils`; homoglyph + hyphen-insertion typosquat examples; three install-time defences including CI token scoping and Renovate config validation
- [x] Optional `git log --show-signature` workflow for future signed-tag verification — INTEGRITY.md § Future `git log --show-signature` workflow; framed as "currently deferred (S3)", shows the exact command, documents the "no-op until S3 activates" state, cross-refs `docs/SIGNING-TAGS.md`
- [x] Future SLSA upgrade path documented (single paragraph) — INTEGRITY.md § Future SLSA upgrade path; tarball via GitHub Releases + `actions/attest-build-provenance@v2.3.0`; deleted workflow revival point at `877b478`; explicit "available path, not planned work"; no issue filing / no roadmap commitment
- [x] `package.json` version unchanged at `1.1.0-dev` (docs-only) — verified
- [x] Build + lint + 239 tests unchanged — all green

---

## Threat-model framing (anti-overclaim audit)

The focus-area brief required accurate framing of what git-install actually provides. How each claim landed:

- **Tag pinning.** Framed as protecting against main-branch drift + transitive npm-install re-resolution, and explicitly **not** protecting against a maintainer-account compromise moving the tag ref ("tag immutability is a policy, not a protocol"). No overclaim.
- **SHA pinning.** Framed as content-addressed (tamper-evident via git object identity) and therefore protecting against tag movement. Called out as *not* protecting against a malicious commit whose SHA the consumer knowingly pinned (out of threat-model scope).
- **Sigstore / Rekor attestation.** Explicit "NOT currently provided" paragraph. GitHub Actions workflow-run auditability is distinguished from cryptographic integrity attestation on the consumer-installed artefact. Consumers are not left with the impression that git-install gives them SLSA-like properties.
- **`npm audit signatures`.** Explicitly noted as a no-op under git-install (registry verification command without a registry entry). Prevents consumers from running it and assuming a green result implies integrity guarantees.
- **S3 deferred state.** `git log --show-signature` section opens with "S3 is **currently deferred**" and documents the current state that `git log --show-signature` against `v1.0.0` returns no signature line. Framed as a forward-looking consumer workflow that gains effect only when S3 activates.
- **SLSA upgrade path.** Single paragraph at the end, framed as "available option, not planned work"; explicit "no issue is filed, no roadmap commitment is made." Satisfies focus area 5 (option, not commitment).

---

## Reviewable state (per SD-002 amended 2026-04-15)

- **Build:** PASS (`npm run build` — `tsc -p tsconfig.build.json`, no output = clean)
- **Lint:** PASS (`npm run lint` — `eslint src`, no output = clean)
- **Unit tests:** PASS (`npm test -- --run` — 7 files, **239/239** passing; baseline preserved from post-#10 merge)
- **ReDoS scanner:** PASS (`npm run redos:scan` — 16/16 patterns SAFE; no regex changes in this PR)
- **TDD compliance verifiable in commit history:** N/A (docs-only; CLAUDE.md § Conventions and the dispatch brief explicitly exempt docs-only work)
- **Handover written before completion summary:** YES — this file is committed on the branch as part of the `docs(#11):` commit before PR creation, per SI-002 / SD-001
- **Branch pushed to origin:** YES (see Reviewable state below)
- **PR opened against main:** YES (see Reviewable state below)

---

## Code Review

- **Reviewer:** maintainer inline at top-level session scope (2026-04-20)
- **Review mode:** dispatcher-scope inline. Full `feature-dev:code-reviewer` subagent dispatch skipped as an authorised exception for this pure-docs change: zero code/test/config touched. Diff = README.md +12 / -1, docs/INTEGRITY.md new +70, docs/Handover-11.md new +156. Dispatcher read the full INTEGRITY.md + README diff inline against the dispatch acceptance criteria and threat-model accuracy checks.
- **Base SHA:** `c1a1a2d2ad88a44684aaad21b8f57c4b46287877` (#6 merge)
- **Head SHA (pre-fix):** `e27cd8d3a750c60f5988ce27f59ec62b99ba4dfe`
- **Verdict:** Ready to merge (after S3 overclaim fix — see IMP-1 below)
- **Critical findings:** 0
- **Important findings:** 1 (IMP-1 — fixed inline before merge)
- **Minor findings:** 0
- **IMP-1 (FIXED inline):** Developer correctly flagged in handover §Known Tech Debt that README § Security Posture S3 bullet asserts GPG-signed tags are in place, while the new `docs/INTEGRITY.md` correctly says S3 is deferred. That contradiction would have shipped in this PR. Since INTEGRITY.md is the new source of truth for the git-install integrity story and its premise depends on S3 being deferred, the S3 bullet must match — not as a follow-up. Fixed inline: S3 bullet rewritten to "Deferred under reduced-tier security posture" with explicit current-state check (`git log v1.0.0 --show-signature` returns no signature line) + forward-looking reference to INTEGRITY.md. S1 + S2 have the same overclaim pattern but do not create an in-PR contradiction with INTEGRITY.md and are rolled into #23 (pre-tag prep).
- **All dispatch focus areas: PASS.**
  - Threat-model accuracy verified: tag mutability via `git push --force origin v1.0.0` is real; GitHub default tag ruleset is operator-policy not cryptographic; `npm audit signatures` against git-install IS a no-op (empty set, not pass); `package-lock.json` records git SHA but does NOT bind to build attestation — all claims hold.
  - No overclaim: "SLSA Level" is never claimed for the current posture; future path is framed as "available option, not planned work" in the final INTEGRITY.md paragraph.
  - Cross-references correct: README → INTEGRITY.md (line 220); INTEGRITY.md → §Installation, §Security Posture, docs/SIGNING-TAGS.md all present and accurate.
  - Single source of truth preserved: § Installation keeps its basic pinning rule; INTEGRITY.md positions itself as "deeper elaboration"; no duplicated JSON snippet across the two sections.
  - No collateral changes: `git diff c1a1a2d..HEAD --stat` = README.md +18 (12 new + 6 for S3 fix), docs/INTEGRITY.md +70, docs/Handover-11.md +156. Zero code/test/CI touched.
  - No-regression: 239/239 tests unchanged, build + lint clean, 16/16 recheck SAFE.
- **S1 + S2 overclaim rollover:** noted for #23 scope — README §Security Posture S1 ("branch protection required reviews ≥ 1 + required status checks + CODEOWNERS gates") and S2 ("tag ruleset: restrict deletions + restrict updates") are similarly aspirational under reduced-tier posture but don't create an in-PR contradiction with #11. Fix scope: single-paragraph edits matching S3's treatment. Carry to #23.

---

## Process Rule Violations

None observed.

---

## Known Tech Debt

**Discrepancy between README § Security Posture S3 claim and actual state** (flagged for reviewer, NOT fixed in this PR — scope is #11 integrity docs, fixing the S3 prose would be scope creep into S11 reconciliation):

- `README.md` § Security Posture currently declares: *"S3 — GPG-signed tags. v1.0.0 and every release tag is an annotated `git tag -s` signed with a dedicated Ed25519 hardware-token key..."*
- Actual state verified during implementation: `git log v1.0.0 --show-signature` returns the commit without a `gpg:` signature line, and `git tag -l --format='%(contents:signature)' v1.0.0` returns empty. The v1.0.0 tag is **not** signed.
- Dispatch brief explicitly told me S3 is deferred. My new `docs/INTEGRITY.md` frames S3 as *"currently deferred... at the v1.0.0 maturity level, release tags are not cut with `git tag -s`"*, which is consistent with the dispatch brief and with observable repo state.
- This creates a minor internal inconsistency: `README.md` § Security Posture asserts S3 active; `docs/INTEGRITY.md` asserts S3 deferred. A follow-up issue should reconcile § Security Posture to match the reduced-tier security disposition (per MEMORY.md: "S1/S2/S3/S8 deferred"). Suggested scope: single-line README edit, separate PR, severity low.

No other tech debt recorded.

---

## Build & Test Status

- **Build:** ✅ PASS
- **Lint:** ✅ PASS
- **Unit tests:** ✅ 239 passed, 0 failed / 239 total
- **ReDoS scanner:** ✅ 16/16 SAFE
- **E2E:** N/A (no UI surface; server-side library)

---

## Notes for reviewer

Key things to verify:

1. **Threat-model accuracy** — the new `docs/INTEGRITY.md` makes claims about what git-install does / does not provide. Please verify:
   - Tag-vs-SHA trade-off is accurate (git tag mutability under force-push, content-addressing of SHAs).
   - The "NOT currently provided" list (no Sigstore Rekor, `npm audit signatures` no-op, no build-attestation-bound lockfile hash) matches the actual architecture.
   - S3 deferred framing matches reduced-tier security disposition.
2. **No overclaim.** I've consistently framed git-install as providing *pinning*, not *attestation*. No language suggesting git-install gives SLSA-equivalent properties.
3. **Cross-references land correctly.** Check the internal links work: README → `docs/INTEGRITY.md`, INTEGRITY.md → § Installation, INTEGRITY.md → § Security Posture, INTEGRITY.md → `docs/SIGNING-TAGS.md`.
4. **S3 inconsistency flagged under Known Tech Debt** is acknowledged but deliberately not fixed in this PR. Please agree / disagree with the scope call.
5. **Future SLSA upgrade path** (final paragraph of INTEGRITY.md) is strictly framed as "option, not commitment" per focus area 5. Please verify no language implies planned work or filed issues.
6. **No npm-registry language.** Grep INTEGRITY.md for `npm audit signatures`, `npm provenance`, `.npmrc` — the only references are in the "NOT currently provided" section explicitly calling them out as *not applicable* under git-install. This is intentional and matches focus area 3.

---

## Handover To

→ `/project-manager` for code review (SD-002 amended dispatcher-side review) + sprint-close gate. Next Sprint 2K.A issue in queue: #8 (R10 national IDs) per MEMORY.md ordering. No blockers surfaced from this implementation.
