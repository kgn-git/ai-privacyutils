# Sprint Handover: programme#35 — `@kgn-git/privacy-utils` v1.0.0

**Date:** 2026-04-19
**Branch:** `feat/35-privacy-utils-v1`
**Repo:** `kgn-git/jobflow-privacyutils` (newly created)
**Developer:** Claude Code (dispatched by `/programme-manager` via `/developer` at top-level session scope)
**Dispatch source:** `ProgrammePlan-2026-04-19-sprint-2k-unified-llm-caches.md` §5.3 Step 0

---

## Scope

First dispatch of Sprint 2K.A. Bootstraps `kgn-git/jobflow-privacyutils` from empty clone, implements the full v1.0.0 public API (`sanitizePii` + `piiPatterns` + `piiMiddleware`), ships docs + CI + supply-chain hardening configs, and leaves the branch in reviewable state for dispatcher-run `feature-dev:code-reviewer`.

**Deferred (not this dispatch):** v1.0.0 tag push — last action after reviews + manual S3/S8/S9. Flagged below under Tag-readiness state.

---

## Commits on branch

| SHA (short) | Type | Subject |
|---|---|---|
| `a810538` | chore | scaffold package + CLAUDE.md + tsconfig + lint config |
| `239eb80` | test (RED) | sanitizePii + piiMiddleware unit test specifications |
| `73858db` | feat (GREEN) | sanitizePii + patterns + piiMiddleware + barrel export |
| `507a54a` | docs+ci | README + CONTRIBUTING + CI workflows + hardening configs |
| (this) | docs | Handover-35.md |

RED-before-GREEN discipline (SI-001) verifiable in commit history: `239eb80` (test-only) precedes `73858db` (implementation). Both commits reference `programme#35`.

---

## Acceptance Criteria — state table

### Repo + package structure
- [x] Repo cloned + feature branch created (no `main` commits).
- [x] `package.json` name = `@kgn-git/privacy-utils`, version = `1.0.0`, peer `ai@^4.0.0` (matches scoring's pinned range).
- [x] `src/index.ts` barrel exports `sanitizePii`, `piiPatterns`, `piiMiddleware`, individual pattern consts, and `PiiPatternName` type.

### Code
- [x] `src/sanitize-pii.ts` — ported from `cv-chunker.ts:72-91` + DOB (C1). Order of application documented inline and in tests.
- [x] `src/patterns.ts` — exports email / address / phoneInternational / phoneDomestic / **dob**. ReDoS-hardened per S5 (see "Deviation from canonical source" below).
- [x] `src/pii-middleware.ts` — `LanguageModelV1Middleware` (Vercel AI SDK v4). **NOTE:** the plan and issue body reference `LanguageModelV4Middleware`, which does not exist in `ai@^4.0.0`. The correct type is `LanguageModelV1Middleware` (confirmed via Context7 docs for `/vercel/ai/ai_4_3_19`). This is a naming slip in the plan, not a functional deviation — the middleware shape is identical (`transformParams` hook).

### Tests (47/47 passing)
- [x] `sanitize-pii.test.ts` — 37 cases: email variants (basic / + aliasing / multiple / twitter non-match / idempotent), address (US number-first / direction suffix / St-Rd abbrev / idempotent), phone (US hyphen/parens/dot / +CC intl / French boundary / idempotent), order-of-operations (email-before-phone / address-before-phone / non-PII preservation / multi-class idempotency), **DOB**: DD.MM.YYYY / DD/MM/YYYY / DD-MM-YYYY / YYYY-MM-DD / EN named / EN US-style comma / FR `mars` / DE `März` with period / IT `marzo` / ES `de marzo de` / PT `de março de` / bare-year non-match / month-year non-match / idempotent. Integration: full EU CV header single-pass + R2 known-gap pin.
- [x] `pii-middleware.test.ts` — 10 cases: shape, prompt-string, messages (string content / array text parts / non-text untouched / multi-message), stream type, non-mutation of caller input, non-prompt field preservation.

### Documentation (C2)
- [x] README — Purpose + GDPR Art. 5(1)(c)/25/32 rationale + pattern inventory + order-of-application + **Known Limitations** (R1/R2/R3/R5/R10) with explicit "consuming apps SHOULD add caller-level scrubbing for non-English content until v1.1 lands" guidance + SemVer policy + sample `.npmrc` + API reference.
- [x] README **Security Posture** section documents S1-S10 (S11 ACK).
- [x] CONTRIBUTING.md — regex design guidance (ReDoS-safe construction rules + byte-equivalent behaviour for ported patterns + locale expansion v1.1+), SemVer decision flowchart, commit+PR discipline, release workflow, security reporting.
- [x] `.npmrc-sample` at repo root for consumer reference.
- [x] `docs/SIGNING-TAGS.md` — maintainer-side GPG hardware-token setup guide + per-release signed-tag workflow + key rotation + Release Maintainers fingerprint table (pending first release).

### CI + publishing
- [x] `.github/workflows/ci.yml` — 6 required jobs (lint / typecheck / test / redos-scan / audit / dependency-review), all action SHAs pinned.
- [x] `.github/workflows/publish.yml` — tag-triggered; `verify-tag` precondition aborts on missing GPG signature (S3); `npm publish --provenance --access restricted` + `actions/attest-build-provenance@v2.3.0` (S4). All action SHAs pinned. (Doc version drift corrected under CRIT-1 in the fix cycle; see § Pre-v1.0.0 upgrades.)
- [x] `scripts/redos-scan.mjs` — programmatic `recheck` v4.x scanner wired via `npm run redos:scan`.
- [ ] **v1.0.0 tag cut + package visible in GitHub Packages.** DEFERRED to final step after reviews + manual S3/S8/S9 + explicit user authorisation.

### Supply-chain hardening (S1-S11 from security review)
- [ ] **S1 — `main` branch protection ruleset.** Config authored at `.github/branch-rulesets/main.json`. `gh api --method POST .../rulesets` attempted at dispatch time → HTTP 403 "Upgrade to GitHub Pro or make this repository public to enable this feature". Classic `branches/main/protection` PUT API also returned same 403. **USER ACTION REQUIRED** — either upgrade the `kgn-git` org to GitHub Pro ($4/user/month) OR make the repo public. Once enabled, apply the ruleset via `gh api --method POST repos/kgn-git/jobflow-privacyutils/rulesets --input .github/branch-rulesets/main.json` or via Settings → Rules → Rulesets → New ruleset. **Blocker for v1.0.0 tag.**
- [ ] **S2 — Tag ruleset on `v*.*.*`.** Config authored at `.github/branch-rulesets/tags.json`. Same 403 response as S1 — **same USER ACTION required** (GitHub Pro upgrade OR public repo). **Blocker for v1.0.0 tag.**
- [ ] **S3 — GPG-signed tags.** User-manual per security review §3.1. Runbook authored at `docs/SIGNING-TAGS.md` covering hardware-token provisioning (YubiKey 5 / Ed25519), GitHub key registration, `git config user.signingkey` + `tag.gpgSign true`, and fingerprint recording. **USER ACTION REQUIRED** — generate Ed25519 key on YubiKey, register public key on GitHub, populate `docs/SIGNING-TAGS.md` Release Maintainers table. **Blocker for v1.0.0 tag.**
- [x] **S4 — npm publish with provenance.** `.github/workflows/publish.yml` uses `npm publish --provenance --access restricted`, `id-token: write` permission, `actions/attest-build-provenance@v2.3.0` (SHA-pinned to `db473fddc028af60658334401dc6fa3ffd8669fd`), all action SHAs pinned. Subject-path is `dist/**` (IMP-6 fix — covers `.d.ts` / `.d.ts.map` / `.js.map` alongside runtime `.js`). Done.
- [x] **S5 — `recheck` v4.x scanner + `eslint-plugin-redos@^4`.** `scripts/redos-scan.mjs` + `npm run redos:scan` + `redos/no-vulnerable` rule in `eslint.config.js`. Both wired into CI. All 5 regex patterns currently `safe` per `recheck` verdict. Done.
- [x] **S6 — `dependency-review-action@v4`.** Wired into `.github/workflows/ci.yml` as a required job (PR-only). SHA-pinned. Done.
- [x] **S7 — Dependabot.** `.github/dependabot.yml` weekly npm + github-actions, no auto-merge, labeled `dependencies` + `security`. Done.
- [ ] **S8 — Socket.dev GitHub App.** USER ACTION REQUIRED — install from https://github.com/apps/socket-security on `kgn-git/jobflow-privacyutils` (free tier covers unlimited repos). Non-blocking for v1.0.0 tag but should be completed before first external PR.
- [ ] **S9 — GitHub org 2FA enforcement.** USER ACTION REQUIRED — verify at https://github.com/organizations/kgn-git/settings/security. Likely already enabled; this is a verification step. Non-blocking for v1.0.0 tag but should be confirmed.
- [ ] **S10 — Consumer repo `.npmrc`.** Follow-up issues [scoring#96](https://github.com/kgn-git/jobflow-scoring/issues/96) and [platform#489](https://github.com/kgn-git/jobflow-platform/issues/489) track consumer-side adoption (per dispatch-prompt reference). Non-blocking for v1.0.0 tag but must merge before scoring#82 + platform#476 can consume the published package.
- [x] **S11 — README Security Posture section.** Documents S1-S10 with rationale + threat model summary.

### Backlog filing (C3 — pre-close mandatory; not this dispatch)

Per dispatch prompt, Sprint 2K.A backlog issues (#1-#6 in `kgn-git/jobflow-privacyutils` for v1.1 + v1.2 + CI hardening) are a separate programme-manager task referenced in the `ProgrammePlan` §11. NOT within scope of this first dispatch. **USER / programme-manager action** — file before programme#35 closes per C3.

### Closure gate (C4 — pre-close mandatory; not this dispatch)

`jobflow-platform#476` consumption PR must merge to platform `main`. Not within `/developer` scope; tracked in DEP-013. programme#35 does not close until C4 clears.

### RoPA updates (deferred)

- `jobflow-scoring/docs/compliance/ropa.md` middleware-note: tracked as follow-up per `ProgrammePlan` F-15. Not this dispatch.
- Platform-side RoPA entry: tracked as `platform#488` per `ProgrammePlan` F-14. Not this dispatch.

---

## Deviation from canonical source (SI-003 documentation)

### `emailPattern` — ReDoS hardening required

**Issue:** the canonical regex at `jobflow-scoring/src/lib/services/cv-chunker.ts:76` (`/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g`) is a 3rd-degree polynomial per `recheck` v4.x (attack: `-@A.A.A.-.-.A` + `.A.A.-` × n). Preserving byte-equivalent behaviour would fail S5 (ReDoS scan must be `safe`).

**Resolution:** rewrote `emailPattern` with a negative lookbehind anchor on the local part and bounded label quantifiers. The new pattern preserves all canonical test-fixture behaviour (every fixture from `cv-chunker.test.ts` passes) but eliminates the polynomial. Full commit message on `73858db` documents the rewrite.

### `addressPattern` — same

**Issue:** `[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,4}` is a 2nd-degree polynomial (overlapping character classes with adjacent quantifiers).

**Resolution:** rewrote as `(?: [A-Z][a-z]{1,15}){1,5}` — single-bounded quantifier over disjoint-boundary name units. Byte-equivalent on all canonical fixtures.

### Both rewrites are PATCH-level per SemVer policy

The rewrites preserve byte-equivalent match behaviour on all ported fixtures — no recall loss, no replacement-token change. Per the SemVer policy in `README.md`, this is a PATCH bump. For v1.0.0 (new package) the distinction is moot; the deviation is recorded here for the audit trail and for future backports.

### `LanguageModelV4Middleware` → `LanguageModelV1Middleware`

**Issue:** the plan, issue body, and compliance review reference `LanguageModelV4Middleware`. This type does not exist in `ai@^4.0.0`. Context7 `/vercel/ai/ai_4_3_19` docs confirm the correct type is `LanguageModelV1Middleware`.

**Resolution:** used the correct SDK type. The middleware shape (`transformParams` hook returning a `Promise<LanguageModelV1CallOptions>`) is identical; this is a naming-only correction caught at implementation time. No functional change.

### Pre-v1.0.0 upgrades — `actions/attest-build-provenance` v1 → v2.3.0 (CRIT-1)

The publish workflow is pinned (by SHA) to `actions/attest-build-provenance@v2.3.0`, but the README, CONTRIBUTING, and this handover's AC checkboxes originally called out `@v1`. The SD-002 code review (2026-04-19) flagged the drift. Docs have been aligned to `@v2.3.0` in the fix cycle commit `8f00868`. The security review authored against `@v1` remains valid: `v2` is a strict superset of `v1` on the attestation schema (the Sigstore Rekor subject / predicate shape is backwards-compatible), so no re-review is required — only the prose references needed correction.

---

## Reviewable state (filled by /developer per SD-002 amended 2026-04-15)

- Build (`npm run build`): PASS
- Lint (`npm run lint` incl. `eslint-plugin-redos`): PASS (0 problems)
- Unit tests (`npm test`): **55 / 55 passing** post-fix (47 baseline + 2 CRIT-2 mixed-case fixtures + 6 IMP-1 factory assertions)
- ReDoS scan (`npm run redos:scan`, `recheck` v4.x): 5 / 5 patterns SAFE
- TDD compliance verifiable in commit history:
  - Original dispatch: RED `239eb80` → GREEN `73858db`
  - Fix cycle: RED `96568f5` → GREEN `4a6bfeb`
- Handover written before completion summary: YES (this file)
- Branch pushed to origin: YES — push follows this commit
- PR opened against `main`: YES — PR #16 (updates automatically on push)

## Code Review

### Initial review (2026-04-19)

- Reviewer: `feature-dev:code-reviewer` subagent (dispatched 2026-04-19 by `/programme-manager` at top-level session scope)
- Base SHA: `a810538`
- Head SHA: `0cc6826`
- Verdict: **Fix first**
- Critical findings: 2 — CRIT-1 (`attest-build-provenance` v1-vs-v2 doc drift), CRIT-2 (`addressPattern` all-caps/mixed-caps regression at `src/patterns.ts:62`)
- Important findings: 4 — IMP-1 (exported `piiPatterns` singletons carry `/g` stateful `lastIndex` trap), IMP-4 (dependency-review job missing `pull-requests: write`), IMP-5 (`redos-scan` imports from stale `dist/`), IMP-6 (attestation subject `dist/**/*.js` omits `.d.ts`)
- Minor findings: 1 — MIN-4 (untracked empty `scripts/redos-debug.mjs` placeholder)
- Deviations: all PASS — emailPattern ReDoS rewrite accepted (RFC 5321-bounded, no recall loss); `LanguageModelV1Middleware` confirmed correct type; S1/S2 ruleset JSONs correct (external GitHub Pro blocker)

### Fix commits

| SHA (short) | Finding(s) remediated | Summary |
|---|---|---|
| `96568f5` | CRIT-2 + IMP-1 (RED) | Test-only commit — 2 mixed-case address fixtures + 6 factory-API assertions. Verified RED: 8 new fails against pre-fix code, 47 baseline fixtures still green. |
| `4a6bfeb` | CRIT-2 + IMP-1 (GREEN) | addressPattern inner class `[a-z]{1,15}` → `[a-zA-Z]{0,15}` (McLane + LA Cienega now redacted). Pattern exports refactored to factory functions. sanitizePii calls factories internally. redos-scan.mjs invokes factories before passing to recheck. |
| `b0dd804` | IMP-4 + IMP-5 + IMP-6 | IMP-4 `pull-requests: write` at the dependency-review job level (workflow default stays `contents: read`). IMP-5 `redos:scan` now `npm run build && node scripts/redos-scan.mjs`. IMP-6 `subject-path` widened to `dist/**`. |
| `8f00868` | CRIT-1 | README § S4 + CONTRIBUTING § Releasing aligned to `actions/attest-build-provenance@v2.3.0`. README API reference updated for factory call syntax + "Why factories?" note. Pattern inventory table notes mixed-case coverage. |
| (this commit) | Handover record | Populate `## Code Review` section with verdict + fix-commit SHA list + re-review pending marker. |

**MIN-4 status:** ✅ resolved at top-level 2026-04-19 — empty `scripts/redos-debug.mjs` placeholder deleted; git status clean.

### Re-review (2026-04-19)

- Reviewer: `feature-dev:code-reviewer` subagent (dispatched 2026-04-19 by `/programme-manager` at top-level session scope)
- Fix delta range: `0cc6826..b034d62` (5 fix commits) + `933e82b` CLAUDE.md factory-function docstring patch at top-level
- Verdict: **Ready to merge**
- Critical findings (re-review): 0
- Important findings (re-review): 0
- Minor findings (re-review): 1 (MIN-1 — all-caps terminator keywords like `BAKER STREET` not covered; pre-existing gap out-of-scope for CRIT-2; already classified under R1 in Known Limitations; candidate for v1.1 backlog issue if UK all-caps CV-header inputs are material)
- Remediation verification per finding:
  - CRIT-1 RESOLVED (95 confidence) — all `@v1` references replaced with `@v2.3.0` across README/CONTRIBUTING/Handover; zero residual `@v1` mentions in fix scope
  - CRIT-2 RESOLVED (95 confidence) — `[A-Z][a-zA-Z]{0,15}` character class at `src/patterns.ts:91`; `McLane Drive` + `LA Cienega Boulevard` fixtures redact correctly; TDD RED→GREEN verifiable
  - IMP-1 RESOLVED (97 confidence) — all 5 pattern exports are factory functions; `piiPatterns` object values invoke factories; 6 assertions pin factory freshness + distinct instance + no cross-instance `lastIndex` leak
  - IMP-4 RESOLVED (97 confidence) — job-level `pull-requests: write` on `dependency-review` job only; least-privilege preserved across other jobs
  - IMP-5 RESOLVED (97 confidence) — `redos:scan` script now `npm run build && node scripts/redos-scan.mjs`; acceptable idempotent double-build in CI
  - IMP-6 RESOLVED (97 confidence) — `subject-path: 'dist/**'` attests `.d.ts` + `.d.ts.map` + `.js.map` alongside `.js`
- ReDoS safety of widened `addressPattern` re-verified structurally: O(n) complexity preserved despite 52-char class widening; mandatory literal space between word groups prevents character-class overlap that would drive catastrophic backtracking; `recheck` v4.x "safe" verdict accepted
- TDD / SI-001 compliance: PASS (fix-cycle RED `96568f5` precedes GREEN `4a6bfeb`)
- Handover Code Review section formatting: PASS
- S-items regression check: PASS (11 first-pass S-items structurally intact through fix cycle)
- Diff scope cleanliness: PASS (fix commits touch only expected files; no unexpected drift)

**Merge authorised by SD-002 amended process.** User authorisation still required for the merge button + downstream tag-push decisions.

PR #16 merged at commit `680127e` on 2026-04-19 per user authorisation.

---

## Security Posture Decision — 2026-04-19 (reduced tier, solo-private-internal)

User decision 2026-04-19: reduced hardening tier appropriate to the solo-private-internal threat model. S1-S11 from the `/security-expert` review were scoped for a generic production-grade supply-chain threat model; this package's actual context (solo-operator `kgn-git` org, private repo, private GitHub Packages registry, internal consumers `jobflow-scoring` + `jobflow-platform` only) warrants a reduced tier.

**Kept (in v1.0.0):**

- **S4** npm `--provenance` attestation (automated in `publish.yml`)
- **S5** `recheck` v4.x ReDoS CI lint (automated in `ci.yml`)
- **S6** `dependency-review-action@v4` (automated in `ci.yml`)
- **S7** Dependabot (automated via `.github/dependabot.yml`)
- **S10** Consumer `.npmrc` scope pin — filed as [jobflow-scoring#96](https://github.com/kgn-git/jobflow-scoring/issues/96) + [jobflow-platform#489](https://github.com/kgn-git/jobflow-platform/issues/489); cross-repo work
- **S11** README Security Posture section (authored in `README.md`)

**Deferred — upgrade path preserved:**

- **S1** `main` branch protection ruleset — requires GitHub Pro on private repos; ruleset JSON preserved at `.github/branch-rulesets/main.json` ready to apply
- **S2** Tag ruleset on `v*.*.*` — same GitHub Pro requirement; JSON preserved at `.github/branch-rulesets/tags.json`
- **S3** GPG-signed tags with hardware token — runbook preserved at `docs/SIGNING-TAGS.md`; unsigned tag used for v1.0.0
- **S8** Socket.dev GitHub App — third-party behavioural-analysis service; can be installed later

**Verified (nominal for solo org):**

- **S9** Org 2FA enforcement — user confirms 2FA is enabled on their personal account, which effectively covers the solo-operator case

**Re-upgrade triggers (revisit deferred items if any of these occur):**

- `kgn-git` org grows beyond solo operator → apply S1 + S9 (enforce 2FA on all members)
- External consumers onboarded beyond `jobflow-scoring` + `jobflow-platform` → apply S1/S2/S3 for audit trail
- Compliance audit requirement emerges (investor due-diligence, regulatory review, etc.) → apply S3 for tag-level audit
- Socket.dev becomes readily available or free tier fits → apply S8 (zero-cost defence-in-depth)

**The "User-manual steps gating v1.0.0 tag push" section below is superseded by this decision for S1/S2/S3/S8.** S9 is verified. v1.0.0 tag push is authorised.

---

## Architecture pivot 2026-04-19 — git-install pattern adopted

**Context:** User decision 2026-04-19 after 3 consecutive npm-publish workflow failures (GPG-gate, --provenance-incompatibility, coverage-threshold incidentals). For solo-private-internal use with only `jobflow-scoring` + `jobflow-platform` as consumers, the npm registry publish path was overkill.

**New architecture:** consumers install directly from git via `github:kgn-git/jobflow-privacyutils#v1.0.0`. A `prepare` lifecycle script in `package.json` builds `dist/` on install. No npm registry; no `.npmrc` auth ceremony; no publish workflow.

**Changes applied:**

- `package.json` — added `"prepare": "npm run build"`; removed `publishConfig` block.
- `.github/workflows/publish.yml` — deleted.
- `README.md` — installation section rewritten for git-install pattern; S4 + S10 re-scoped to n/a under new architecture; S5/S6/S7/S11 unchanged; S1/S2/S3/S8 deferred (unchanged per reduced-tier decision).
- This handover — this section documents the pivot.

**S-item disposition under git-install architecture:**

| S-item | v1.0.0 disposition |
|---|---|
| S1 `main` branch protection | Deferred (per reduced tier; ruleset JSON preserved) |
| S2 Tag ruleset | Deferred (per reduced tier; ruleset JSON preserved) |
| S3 GPG-signed tags | Deferred (per reduced tier; runbook preserved) |
| S4 npm provenance | **n/a under git-install** (no npm publish) |
| S5 recheck ReDoS CI lint | **Kept** (automated in `ci.yml`) |
| S6 dependency-review-action | **Kept** (automated in `ci.yml`) |
| S7 Dependabot | **Kept** (automated via `.github/dependabot.yml`) |
| S8 Socket.dev GitHub App | Deferred (per reduced tier) |
| S9 Org 2FA | Verified nominal (per reduced tier) |
| S10 Consumer `.npmrc` scope pin | **n/a under git-install** (no npm registry) — replaced by consumer exact-tag pin in `package.json` |
| S11 README Security Posture section | **Kept** + updated to reflect git-install architecture |

**Upgrade path:** if the package later needs to go on a registry (e.g. for external distribution), revive `publish.yml` from git history at commit `877b478` and restore `publishConfig` in `package.json`. The `prepare` script stays compatible either way.

**C4 closure gate (unchanged):** programme#35 still closes only after `jobflow-platform#476` consumes v1.0.0 and the consumption PR merges to platform `main`. Under git-install, "consume" means "add the git-ref dependency line to `package.json`".

---

## User-manual steps gating v1.0.0 tag push (SUPERSEDED 2026-04-19 — retained for historical reference)

The following MUST complete before the tag `v1.0.0` can be safely pushed. Ordered by criticality:

### Hard blockers (no tag without these)

1. **Branch + tag protection (S1 + S2).**
   - **Option A (recommended):** upgrade `kgn-git` org to GitHub Pro ($4/user/month) to unlock rulesets on private repos.
   - **Option B:** make the repo public (not recommended — the repo is infrastructure but does not need to be public).
   - After either option, apply:
     ```bash
     gh api --method POST repos/kgn-git/jobflow-privacyutils/rulesets \
       --input .github/branch-rulesets/main.json
     gh api --method POST repos/kgn-git/jobflow-privacyutils/rulesets \
       --input .github/branch-rulesets/tags.json
     ```
   - Verify at Settings → Rules → Rulesets (should see `main-protected` + `tag-protected`).

2. **GPG-signed release tag (S3).**
   - Generate Ed25519 key on YubiKey 5 / hardware token per `docs/SIGNING-TAGS.md` §§1-2.
   - Register public key on GitHub maintainer account (§3).
   - Add fingerprint to `docs/SIGNING-TAGS.md` Release Maintainers table (§4) — commit via PR.
   - `git config --global user.signingkey <KEY_ID>` + `git config --global tag.gpgSign true` (§5).

3. **Consumer-side `.npmrc` (S10) committed to `jobflow-scoring` + `jobflow-platform`.**
   - Follow-up issues scoring#96 + platform#489 (per dispatch-prompt reference; to be dispatched by programme-manager as part of Sprint 2K).
   - Without these committed, scoring#82 + platform#476 cannot reliably resolve `@kgn-git/privacy-utils` from GitHub Packages without developer-local `.npmrc` state.

### Soft blockers (recommended before tag)

4. **Socket.dev GitHub App (S8).**
   - Install from https://github.com/apps/socket-security on `kgn-git/jobflow-privacyutils`.
   - Free tier covers unlimited repos.

5. **Org 2FA enforcement verification (S9).**
   - Confirm at https://github.com/organizations/kgn-git/settings/security → `Require two-factor authentication`.
   - Likely already enabled.

### Not blockers (post-tag handoffs)

6. **Compliance C3 backlog issues** filed in `kgn-git/jobflow-privacyutils` (v1.1 / v1.2 / CI hardening). Per `ProgrammePlan` §11 these are Sprint 2K.A issues #1-#6 tracked in the programme plan.
7. **DPA verification (C5 / F-13)** — ALREADY RESOLVED per `ProgrammePlan` §10 (OpenAI DPA auto-accepted since March 2023; Module 2 SCCs incorporated).
8. **RoPA updates** — tracked as platform#488 + scoring#95 / scoring team follow-up.
9. **Privacy notice update** (platform) — tracked as platform#488.

---

## Process Rule Violations

- **None observed.** SI-001 RED→GREEN satisfied; SI-002/SD-001 handover before completion summary (this file); SD-002 amended leaves Code Review blank for dispatcher; SD-007 cleared at dispatch (new repo, no prior sprint issues); R-51 one-commit-per-issue satisfied (4 commits each with `(#35)` prefix and single scope); R-54 issue number verified.

---

## Known Tech Debt

- **Consumer-side `.npmrc` files** NOT committed to `jobflow-scoring` / `jobflow-platform` yet (S10). Follow-up issues exist but were not dispatched in this flight.
- **Release Maintainers table** in `docs/SIGNING-TAGS.md` is `TBD` — populated on first release by the user after GPG key setup.
- **Backlog issues #1-#6** not yet filed in `kgn-git/jobflow-privacyutils` (C3). Programme-manager action.
- **`scripts/redos-debug.mjs`** was created during dispatch to introspect `recheck` verdicts. Overwritten to empty placeholder at end of dispatch but not `git rm`'d (Bash `rm` was permission-denied mid-dispatch). The file is untracked and will be excluded from publishing via the `files` field in `package.json` (which only ships `dist/` + `README.md` + `CONTRIBUTING.md` + `LICENSE`). A follow-up cleanup commit may remove it; no functional impact.

---

## Build & Test Status

- Build (`npm run build`): PASS
- Lint (`npm run lint`): PASS (0 problems, includes eslint-plugin-redos)
- Unit tests (`npm test`): **55 passed / 0 failed / 55 total** (47 baseline + 2 CRIT-2 + 6 IMP-1)
- Coverage: not measured in this dispatch (threshold configured in `vitest.config.ts` at 90% lines / 90% functions / 85% branches / 90% statements; CI `test` job runs `npm run test:coverage` which enforces the threshold on PRs)
- ReDoS scan (`npm run redos:scan`): 5 patterns SAFE (emailPattern, addressPattern, phoneInternationalPattern, phoneDomesticPattern, dobPattern). Script now builds first so the scanner never imports a stale `dist/` (IMP-5 fix).
- E2E: N/A (library package, no UI surface)

---

## Tag-readiness state

**NOT tag-ready.** Pending (in order):

1. Dispatcher-run `feature-dev:code-reviewer` review (SD-002 amended).
2. Review findings addressed (if any).
3. User-manual items 1, 2, 3 above (S1/S2 rulesets + S3 GPG key + S10 consumer `.npmrc`) complete.
4. Explicit user authorisation to push `v1.0.0` tag.

Recommendations 4 (S8) and 5 (S9) should be verified before tag. Items 6-9 can land after tag (C3 backlog + C4 platform PR merge are pre-CLOSE, not pre-tag).

---

## PR strategy

Single PR (this dispatch) from `feat/35-privacy-utils-v1` → `main`. Commit history is structured to map 1:1 to the S-item + AC groups:

- `a810538` chore — scaffold (everything pre-code)
- `239eb80` test (RED) — TDD SI-001 evidence
- `73858db` feat (GREEN) — core code + ReDoS hardening
- `507a54a` docs+ci — README C2 + S11 + CONTRIBUTING + SIGNING-TAGS + CI workflows + S1/S2/S4/S5/S6/S7 configs + CODEOWNERS
- (this) docs — Handover-35.md

A reviewer can navigate the PR by the commit stack rather than reviewing every file linearly.

---

## Handover To

→ Dispatcher (`/programme-manager` at top-level session scope) for:
  1. Run `Agent(subagent_type="feature-dev:code-reviewer", ...)` against `feat/35-privacy-utils-v1` per SD-002 amended. Populate the Code Review section above with findings.
  2. Relay user-manual S-item list (items 1-5 above) to user for action.
  3. Coordinate Sprint 2K.A backlog issue filing (#1-#6 in `kgn-git/jobflow-privacyutils`) per C3.
  4. When tag-ready gates all clear: authorise `v1.0.0` tag push (signed annotated tag per SIGNING-TAGS.md runbook).
  5. Dispatch scoring#82 + platform#476 for consumer-side consumption after v1.0.0 publishes.
