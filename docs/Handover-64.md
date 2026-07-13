# Sprint Handover: issue #64 — CV redaction profile

**Date:** 2026-07-13
**Branch:** `feat/issue-64-cv-redaction-profile`
**Developer:** Claude Code (`/developer`)
**Repo:** `kgn-git/ai-privacyutils` (local dir `jobflow-privacyutils`)
**Base SHA (SD-011 verified by PM):** `4111c961f6c14262b7227f2806c01313ecb1061a`

---

## Issues Implemented

| # | Title | PR | Commit(s) |
|---|-------|----|-----------|
| 64 | Over-redaction: dates, company names & locations preserved via `profile: 'cv'` | (opened at finalize) | `7629f47` (RED tests), `099d2bc` (GREEN impl) |

## Issues Deferred or Blocked

| # | Title | Reason |
|---|-------|--------|
| — | Field-aware redaction API | Out of scope per PM scope decision — documented as the required follow-up for `jobflow-platform#1424` (R11-residual). See § Known Tech Debt. |

---

## What was built

An **additive** `profile` option (`'default' | 'cv'`) on `sanitizePii` and `sanitizePiiAsync`. `'default'` (or omitted) is byte-identical to v1.2 — existing consumers unaffected (SemVer **MINOR**, 1.2.0 → 1.3.0).

Under `profile: 'cv'`:
1. **Dates** — the blind `dobPattern()` pass is replaced by `redactContextualDob`, which redacts a date ONLY when immediately preceded by an explicit DOB cue (`dobContextCuePattern`: `Date of birth:`, `DOB:`, `born on`, + EU-locale birth cues `né(e) le` / `geboren am` / `nato·nata il` / `nacido·nacida el` / `nascido·nascida em·a`). Plain employment dates pass through. This fully resolves the date over-redaction (previously 100% of full-date employment dates → `[dob]`).
2. **Employers / locations (async + NER)** — person-NER hits that compromise ALSO tags as an organisation or place are suppressed via the new optional `CompromiseNerEngine.detectPreserveSpans` (`.organizations()` / `.places()` on the default `three` build) + `suppressOverlapping` in `sanitizePiiAsync`.
3. **Unchanged** — person name, email, phone, street address, postcode, national ID, and a labelled DOB are still masked.

### Org-suppression path taken + compromise capability verified

The dispatch asked me to FIRST verify whether the installed compromise build exposes organisation detection, then use it. **Verified:** compromise `~14.15.0`'s default export is the `three` build, whose view exposes `.organizations()` and `.places()` (`node_modules/compromise/types/view/three.d.ts:82–84`). I implemented org/place overlap-suppression on that capability.

**Honest limitation (empirically measured, not assumed):** compromise tags a surname-shaped employer as *either* PERSON *or* ORG — almost never both. Across a 30 real-employer basket, only **2/30** are person-tagged (`Morgan Stanley`, `Ericsson`); those are NOT org-tagged, so overlap-suppression cannot rescue them — they remain `[person]` under `'cv'`. 13/30 are org-tagged and 15/30 untagged — all already safe (compromise never person-tagged them). So overlap-suppression is a correct, defensive precision measure but catches near-zero of the real FP class; the **date fix is the high-value win**. The robust fix for the person-tagged-employer residual is a **field-aware API** (never run person-NER over the platform's structured employer field) — documented as the required follow-up for `jobflow-platform#1424` (README R11-residual + `src/profiles.ts` JSDoc).

## Files changed

- `src/profiles.ts` (new) — `RedactionProfile` type + full profile contract/limitation JSDoc.
- `src/patterns.ts` — extracted `DOB_DATE_SUBPATTERNS` (shared, `dobPattern()` output byte-identical); added `DOB_CONTEXT_CUES` + `dobContextCuePattern()`; `piiPatterns.dobContextCue`.
- `src/sanitize-pii.ts` — `profile?` on `SanitizePiiOptions`; `redactContextualDob`; profile branch at the DOB step.
- `src/ner/ner-engine.ts` — optional `detectPreserveSpans` on `NerEngine`.
- `src/ner/compromise-ner-engine.ts` — `NlpFn` extended with `organizations`/`places`; `detectPreserveSpans` + `collectOffsetSpans` (COMPLIANCE: offsets only).
- `src/sanitize-pii-async.ts` — `profile` passthrough to the sync pass; `suppressOverlapping`; cv-profile suppression wiring.
- `src/index.ts` — export `RedactionProfile` type + `dobContextCuePattern`.
- `scripts/redos-scan.mjs` — `dobContextCuePattern` added to the recheck scan (verdict: safe).
- `README.md` — § CV redaction profile; R11 / R11-residual rows; intro + order-of-application notes.
- `package.json` — 1.2.0 → 1.3.0.
- `src/__tests__/cv-profile.test.ts` (new) — see § Build & Test Status.

## TDD Compliance

- Test-first commits: 1/1 (100%). RED `7629f47` (6/17 failing on cv behaviour) precedes GREEN `099d2bc`.
- TDD skips: None.
- Tests removed (superseded/deprecated/refactored): None — the change is purely additive; no existing behaviour removed.

## Pre-Implementation Expert Reviews

**SD-009 flag:** the dispatch preamble (from `/project-manager`, 2026-07-12) carried SD-007 + SD-011 clearance and a scope decision but did **not** include a Pre-Dispatch Expert Review section. `/developer` cannot retroactively fabricate expert verdicts. Per this repo's CLAUDE.md § Expert Roster (utility class), the following are owed at the dispatcher's layer before merge:

| Expert | Consulted | Verdict | Reference |
|---|---|---|---|
| /compliance-officer | Not in dispatch preamble | OWED | Touches redaction policy (new `'cv'` profile changes what is redacted) — GDPR Art. 5(1)(c)/25 review recommended. Note: the profile only ever *preserves non-personal* features + a labelled-DOB-still-masked guard; true-PII recall is test-pinned as non-regressing. |
| /security-expert | Not in dispatch preamble | OWED (partially covered by SD-002) | New pattern `dobContextCuePattern` — recheck scan PASS (safe). New `.organizations()`/`.places()` surface reads offsets only (COMPLIANCE header preserved). SD-002 code review covers the diff. |
| /tech-expert | Not in dispatch preamble | OWED | New exported API (`profile` option, `RedactionProfile`, `dobContextCuePattern`, optional `detectPreserveSpans`) — additive/OCP-clean; default byte-identical. |
| /tech-ops-expert | Not in dispatch preamble | N/A — reason | No new runtime dependency; no bundle delta (`.organizations()`/`.places()` are in the already-bundled `three` build); perf budget test unaffected. |

## Reviewable state (SD-002 amended 2026-04-15)

- Lint (`eslint src`): PASS (clean).
- Typecheck / build (`tsc -p tsconfig.build.json`): PASS. (`tsc -p tsconfig.json --noEmit` surfaces PRE-EXISTING type errors in untouched test files `pii-middleware.test.ts` / `token-format.test.ts` — AI-SDK `LanguageModelV1` typing; none in files touched by this change; the build config excludes tests.)
- ReDoS scan (`npm run redos:scan`): PASS — all 22 patterns incl. `dobContextCuePattern` safe.
- Differential/full tests: 377/378 pass; the 1 failure is a PRE-EXISTING performance-microbenchmark flake (`locale-patterns.test.ts` 10KB-in-<10ms; ~14ms on this host) that also failed on the clean baseline before any change — unrelated to this diff.
- TDD verifiable in commit history: RED `7629f47` → GREEN `099d2bc`.
- Handover written before completion summary: this file.
- Branch pushed to origin: at finalize.
- PR opened against `main`: at finalize (`Closes #64`).
- Reachability (SD-037): N/A — library API, no UI route. Consumer wiring is `jobflow-platform#1424`.
- Journey citation (SD-039): N/A — utility package, no user journey.
- PR body `## What Users See`: N/A — library change; no end-user runtime surface in this repo (the observable behaviour lands when #1424 consumes it).

## What Users See

N/A in this repo (library). Downstream, once `jobflow-platform#1424` opts into `profile: 'cv'`: CV embeddings will retain employment dates, employer names and cities (higher match quality) while the applicant's name, email, phone, address, postcode, national ID and any labelled date of birth remain masked.

## Code Review (left blank by /developer — populated by dispatcher)

- Verdict: pending dispatcher review
- Critical findings: pending
- Important findings: pending
- Minor findings: pending
- Fix commit(s): pending

## Process Rule Violations

- SD-009: dispatch preamble omitted the Pre-Implementation Expert Review section (flagged above; owed at dispatcher layer). No fabrication.

## Known Tech Debt

- **Field-aware redaction API (required follow-up).** The person-tagged-employer residual (`Morgan Stanley`, `Ericsson` class) is only closable by a per-field policy over structured CV sections — tracked for `jobflow-platform#1424`. Documented as R11-residual.
- Middleware NER/profile integration (`createPiiMiddleware({ profile })`) not wired — consumers use `sanitizePiiAsync` directly, consistent with the v1.2 NER decision.
- Unlabelled DOBs under `'cv'`: a bare `23/05/1985` with no cue is treated as an employment date and preserved. This is the documented, intended trade-off ("only redact a date carrying an explicit DOB cue" — issue #64 direction).

## Build & Test Status

- Build: PASS | Lint: PASS | ReDoS scan: PASS
- Unit tests: 377 passed, 1 failed (pre-existing unrelated perf flake) / 378. New `cv-profile.test.ts`: **17/17 pass** —
  - CV-preserve (sync): employment dates + employers + cities intact; email still masked.
  - CV-preserve (async + NER): applicant name masked; employers/cities/dates preserved; email masked.
  - PII-guard (async + NER): person / email / phone / street address / postcode / national ID still masked; recall non-regression vs default profile asserted.
  - Labelled DOB still masked (sync + async, EN + EU cues).
  - Default profile byte-identical pin.
  - Org/place overlap-suppression (deterministic mock engine): overlap → suppressed; default profile ignores preserve spans; non-overlapping person span still redacted.
- E2E: N/A (library).

## SD-002 review delta (2026-07-13, PR #66)

SD-002 returned APPROVE-WITH-NITS and surfaced a real privacy-recall leak. Two required changes applied on this branch:

1. **Removed the org/place overlap-suppression entirely** — `CompromiseNerEngine.detectPreserveSpans` + `collectOffsetSpans`, the `NerEngine.detectPreserveSpans` optional method, the `NlpFn` `organizations`/`places` additions, and `suppressOverlapping` + its wiring in `sanitizePiiAsync`. Rationale: (a) near-zero benefit (employers are almost never both person- AND org-tagged); (b) it INTRODUCED a name-recall leak — a real person whose given name is also a place/org token (Paris, Austin, Georgia, Morgan, …) would have their `[person]` span suppressed and their name preserved into the embedding. Net-negative for a privacy library. The `'cv'` profile now has exactly ONE behavioural change vs default: the cue-gated date pass (`dobContextCuePattern`). Person-NER is unchanged.
2. **Fixed a tautological test assertion** — the PII-guard NINO guard read `not.toContain('QQ123456C')` while the input is `AB123456C` (never present → vacuously true). Corrected to `not.toContain('AB123456C')`.

Docs updated accordingly: `src/profiles.ts`, README § CV redaction profile + R11 / R11-residual (residual reframed as an accepted **precision** gap; field-aware API is the robust fix for **both** precision and recall; suppression documented as considered-and-rejected). The deterministic Morgan-Stanley test now ASSERTS the accepted residual (person-tagged employer still redacted) + a recall-safety pin (cv person-redaction === default).

**Post-delta gates:** full suite 377/378 (same pre-existing perf-microbenchmark flake), build PASS, lint PASS, ReDoS scan PASS. Test count unchanged at 17 (cv-profile.test.ts). No new runtime surface; compromise `.organizations()`/`.places()` no longer referenced.

## Handover To

→ dispatcher (`/project-manager`) for SD-002 re-review of the delta, then sprint-close.
