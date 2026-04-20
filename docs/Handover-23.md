# Sprint Handover: #23 v1.1 tag-cut prep — middleware benchmark + SD-002 MIN follow-ups + S1/S2 deferred-state

**Date:** 2026-04-20
**Branch:** `feature/23-tag-cut-prep`
**Base:** `main` @ `4a89365` (post-#11 PR #31 merge)
**Developer:** Claude Code
**Milestone:** Sprint 2K.A: v1.1 locale-aware PII + CI hardening
**Issue:** [`kgn-git/jobflow-privacyutils#23`](https://github.com/kgn-git/jobflow-privacyutils/issues/23)
**PR:** [`#32`](https://github.com/kgn-git/jobflow-privacyutils/pull/32)

---

## Per-item outcomes

### 1. (P2) IMP-1 Option b — Middleware-level benchmark

- **Test file:** `src/__tests__/pii-middleware.test.ts` — new `describe('piiMiddleware.transformParams end-to-end — performance budget', ...)` block.
- **Shape:** Realistic provider-layer `LanguageModelV1CallOptions` — system message string + user message with array content (3 × ~3.5KB text parts + 1 image part) + assistant history message + sibling provider fields (`temperature`, `maxTokens`, `topP`). Total redactable body ~10.5KB across three text parts; sanity-asserted to be within 9-12KB at runtime to keep parity with the `sanitizePii` regex-only benchmark's 10KB budget.
- **Methodology:** 4-run warm-up (primes JIT + libphonenumber-js lazy metadata load, whose first-call cost is non-trivial for a budget-sized test) + 10 measured runs. Asserts `mean < 20ms`.
- **Measured mean (3 independent sessions on dev machine):** **0.878 ms, 0.760 ms, 0.658 ms** (range 0.449-1.727 ms across individual runs). ~25x headroom against the 20ms ceiling. Deep-clone + traversal + three `sanitizePii` calls (one per text part) + one per message-string (system / assistant) — total ~5 `sanitizePii` invocations per `transformParams` call.
- **Label disambiguation:** `describe('sanitizePii — performance budget', ...)` renamed to `describe('sanitizePii regex-only — performance budget', ...)` in `locale-patterns.test.ts` with a block-level comment cross-referencing the middleware-level benchmark. Future readers will not confuse the two.
- **Why 20ms and not 10ms:** the existing `sanitizePii` regex-only benchmark uses 10ms; the middleware benchmark loosens to 20ms to accommodate CI-runner variance (the deep-clone + libphonenumber metadata path has measurably more variance than pure regex) while still being tight enough that a real regression (e.g. structural-clone replacement of JSON.clone) would fail the gate. Measured reality (<1ms) is 20x under the ceiling so flakiness is not a concern.

### 2. (P3) MIN-1 — Italian `Via` false-positive fixtures

- **Test file:** `src/__tests__/locale-patterns.test.ts` — new `describe('sanitizePii — Italian Via false-positive fixtures (#23 MIN-1)', ...)` block inserted after the existing Italian-addresses block.
- **Case 1 — `Via Lattea visible from the observatory.`** Empirically verified NOT matched by `addressItPattern()` (`\d{1,4}\b` terminator absent). Pin protects recall boundary.
- **Case 2 — `accessed via port 443`** Empirically verified NOT matched. The lowercase `via` preposition is outside the closed alternation set; leading `\b` + case-sensitive alternation keeps the preposition safe. Pin protects against future refactors that might add `i` flag or widen the alternation to lowercase.
- **Case 3 — `Via Lattea 5 telescope array`** Empirically verified DOES match, redacts to `[address] telescope array`. **Decision pinned: privacy-over-precision.** Inline justification in the test comment:
  > `Via Lattea 5` is structurally indistinguishable from a legitimate Italian street address: `Via` + capitalised name + 1-4 digit number. The pattern's precision boundary is "structural shape", not "semantic meaning" — a regex cannot disambiguate between a fictional astronomical reference and a real postal address.
  >
  > A one-way redaction library is deliberately conservative — a false-positive redaction on rare astronomical / semantic `Via X N` phrases is preferable to a recall gap on a real Italian address. The downstream cost of a redacted `Via Lattea 5` in a CV-scoring prompt is zero; the downstream cost of a leaked `Via Roma 15` is a GDPR Art. 5(1)(c) / Art. 32 incident.
- **Empirical verification commit trail:** pre-commit bash probe via `node -e` against `dist/sanitize-pii.js` confirmed the three behaviours before RED→GREEN pin. Tests pass immediately (integration / pinning tests over already-green implementation, same pattern as `locale-phone-patterns.test.ts`'s "RED-already-satisfied" disclaimer).

### 3. (P3) MIN-2 — Postcode factory JSDoc

- **File:** `src/patterns.ts` — per-factory JSDoc blocks on all six `postcode*Pattern` functions.
- **FR/DE/IT/ES postcode factories** now carry a "Continental overlap by design (#23 MIN-2)" section noting:
  - Structurally byte-identical `\b\d{5}\s+<city>\b` core.
  - Differ only in leading-city character class (FR/IT/ES: `[A-Z\u00C0-\u00DC]`; DE narrows to `[A-Z\u00C4\u00D6\u00DC]` for Ä/Ö/Ü only).
  - Locale key is organisational — `postcodeFrPattern()` on `"28013 Madrid"` matches by design.
  - Precision tightening via per-locale city whitelists was considered and rejected (large maintenance surface, marginal precision gain against a conservative-redaction contract).
- **UK + PT postcode factories** now carry a "Locale specificity" section noting:
  - UK: `[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}` has no overlap with continental 5-digit shapes.
  - PT: `\b\d{4}-\d{3}\b` is globally distinctive.
  - Both safe to use in isolation for locale-scoped redaction.
- **Style:** mirrors the existing `addressByLocale` factory JSDoc pattern from #1 (per-factory description + ReDoS note + limitations). No cross-reference churn.

### 4. (P3) MIN carry-over from #2 review — Phone-locale JSDoc

- **File:** `src/patterns.ts` — new "Dual API surface: validators are looser than sanitizer redaction (#23 MIN)" section added to the `phoneByLocale` dictionary JSDoc.
- **Content:**
  - `phoneByLocale.X()` validators delegate to `isValidPhoneNumber(candidate, country)` from `libphonenumber-js/min` — answer "is this a valid phone number in locale X?".
  - `sanitizePii`'s redaction pipeline applies two additional precision guards on top of the validator: `PHONE_FORMATTED_RE.test(raw)` (requires phone-shaped surface form) + `nationalNumber.length >= MIN_PHONE_DIGITS` (7-digit national-number floor).
  - Consumers who want "what would `sanitizePii` redact?" must call `sanitizePii` directly — validator composition yields looser behaviour than the actual redaction pipeline.
- **Verified identifier names:** `PHONE_FORMATTED_RE`, `MIN_PHONE_DIGITS`, `nationalNumber` — all three grep-verified against `src/sanitize-pii.ts:62,85,106,123,127,129` to avoid documenting names that don't exist.

### 5. (P2 — rollover from #11 SD-002) — README S1 + S2 deferred-state

- **File:** `README.md` — lines 204-205 rewritten.
- **Before (S1):** "Required reviews ≥ 1; dismiss stale approvals on new commits; required status checks (lint, typecheck, test, redos-scan, audit, dependency-review); signed commits required; linear history; block force push. CODEOWNERS gates …"
- **Before (S2):** "`v*.*.*` tag pattern: restrict deletions, restrict updates (immutable), maintainers only."
- **After (S1):** "**Deferred under reduced-tier security posture (2026-04-19 decision, single-maintainer internal package — see `docs/Handover-35.md`).** Intent: … Current state: `main` has no protection rules; solo-maintainer discipline relies on feature-branch workflow + per-PR CI gates. S1 will move to "in place" alongside S2 + S3 in a later sprint if the threat model shifts (external distribution, multi-maintainer)."
- **After (S2):** "**Deferred under reduced-tier security posture (2026-04-19 decision, single-maintainer internal package — see `docs/Handover-35.md`).** Intent: a `v*.*.*` tag ruleset with restrict-deletions + restrict-updates (immutable) + maintainers-only authorship. Current state: tags are mutable / deletable by the sole maintainer without a ruleset. Consumers pin by exact tag per `docs/INTEGRITY.md`; tag immutability becomes meaningful only once external consumers share the threat surface. S2 will activate alongside S1 + S3 when posture escalates."
- **Style:** matches the S3 treatment at commit `4a89365` verbatim — same "**Deferred under reduced-tier security posture (2026-04-19 decision, single-maintainer internal package — see `docs/Handover-35.md`).** Intent … Current state … will move to 'in place' …" structure. Kept within ~5 lines per bullet to preserve § Security Posture readability.
- **Threat-model paragraph (line 218) NOT modified** — the "weighted toward prevention at the authoring boundary (S1-S3)" framing describes posture *design intent* which remains correct; only the per-bullet activation status changed.

---

## Acceptance criteria

- [x] Middleware-level benchmark test added — realistic 10KB `LanguageModelV1CallOptions`, multi-message, array content parts, mixed EU PII, 10-run mean < 20ms (measured ~0.6-0.9ms)
- [x] Existing `sanitizePii` benchmark label updated: "sanitizePii — performance budget" → "sanitizePii regex-only — performance budget" with cross-reference comment
- [x] Italian Via false-positive fixtures added to `locale-patterns.test.ts` — 3 test cases per issue body (including Via Lattea 5 privacy-over-precision decision with justification comment)
- [x] Postcode factory JSDoc updated in `src/patterns.ts` — per-factory note on continental overlap + UK/PT locale-specificity
- [x] Phone-locale factory JSDoc updated — dual-API-surface note on validator looseness vs sanitizer precision guards
- [x] README § Security Posture S1 + S2 bullets rewritten as deferred (S3-parity)
- [x] All 239 baseline tests still pass plus 3 new Italian Via + 1 new middleware benchmark = **243/243 green**
- [x] `npm run redos:scan` still passes — 16/16 patterns safe (no regex changes)
- [x] Patch bump preserved — still `1.1.0-dev` (ships with v1.1.0 tag)

---

## TDD compliance

- **Test-first commit:** `7663118 test(#23): Italian Via false-positive fixtures + middleware end-to-end benchmark` — precedes the docs/JSDoc commit `0b2dfa8`.
- **TDD disclosure:** These tests pin existing behaviour (Italian Via fixtures empirically verified with `sanitizePii` already matching as asserted; middleware benchmark measures existing `transformParams`). No new implementation code was added — so tests pass immediately on the test-only commit. This follows the same pattern as `src/__tests__/locale-phone-patterns.test.ts` integration tests (see its block comment at `src/__tests__/pii-middleware.test.ts:155-158` for the RED-already-satisfied disclaimer). Per SI-001 service-layer TDD gate: no files under `src/lib/services/`, `src/lib/workflows/`, or API-route logic were modified — gate inapplicable. The tests are strictly additive pinning tests + a new benchmark.
- **No regex changes:** `src/patterns.ts` edited for JSDoc only, empirically verified by `npm run redos:scan` showing all 16 patterns still safe with no differences in evaluation output.

---

## Reviewable state (filled by /developer per SD-002 amended 2026-04-15)

- Build: ✅ `npm run build` green
- Lint: ✅ `npm run lint` green
- Unit tests: ✅ 243/243 passing (+4 vs 239 baseline)
- ReDoS scan: ✅ 16/16 patterns SAFE
- TDD compliance verifiable in commit history: ✅ test-only commit `7663118` precedes docs commit `0b2dfa8`
- Handover written before completion summary: ✅ `docs/Handover-23.md` (this file)
- Branch pushed to origin: ✅ `feature/23-tag-cut-prep` @ `0b2dfa8`
- PR opened against `main`: ✅ [`#32`](https://github.com/kgn-git/jobflow-privacyutils/pull/32)

## Code Review (left blank by /developer — populated by dispatcher AFTER /developer returns)

<!-- This section is left blank by /developer per SD-002 amendment 2026-04-15.
     The dispatcher (programme-manager or project-manager at top-level session)
     populates it after running Agent(subagent_type="feature-dev:code-reviewer")
     against the branch. -->
- Verdict: **pending dispatcher review**
- Critical findings: pending
- Important findings: pending
- Minor findings: pending
- Fix commit(s): pending

---

## SD-007 Prior-Issue Merge Gate verification

- Sprint: Sprint 2K.A (milestone #1).
- All prior Sprint 2K.A issues verified CLOSED with top-level PR MERGED before #23 branch creation:
  - #1 R1 locale addresses — PR #22 merged 2026-04-19 15:22:33Z
  - #2 R2 EU phones — PR #26 merged 2026-04-19 16:30:20Z
  - #3 R5 IDN email — PR #27 merged 2026-04-19 18:08:27Z
  - #4 R7 ReDoS CI lint — closed (commit `c77274f`)
  - #5 R12 supply-chain — closed
  - #6 R6 one-way redaction docs — PR #30 merged 2026-04-20 12:07:37Z
  - #9 R8 tokenFormat — PR #28 merged 2026-04-19 19:26:27Z
  - #10 R7 input-length cap — PR #29 merged 2026-04-19 20:50:11Z
  - #11 SLSA attestation docs — PR #31 merged 2026-04-20 14:04:52Z
- Open sprint issues #7 (R3 NER names) and #8 (R10 national IDs) are AFTER #23 in the dispatch order per `project_sprint_2k_planned_rev2.md` — SD-007 applies to *prior* issues, not subsequent ones.
- Open PR #25 (`chore(deps): bump actions/checkout from 4.2.2 to 4.3.1`) is a Dependabot PR, not a sprint-issue PR — does not engage SD-007.
- **Result:** SD-007 gate PASSED. Branch created cleanly off `main` @ `4a89365`.

---

## Process rule violations

- None observed. Single-issue branch, RED→GREEN commit sequence maintained, no scope creep (empirically verified no pattern bodies changed in `src/patterns.ts`), no force-push, no `--no-verify`.

## Known tech debt

- **None introduced by this PR.** All five items are either test additions (items 1-2), JSDoc-only (items 3-4), or README-only (item 5). No behavioural change, no new surface area, no follow-up required.
- **Residual from scope:** Sprint 2K.A still has #7 (R3 NER names — intentionally last) and #8 (R10 national IDs) open. Not this PR's concern.

## Build & test status

- Build: ✅ `tsc -p tsconfig.build.json` clean
- Lint: ✅ `eslint src` clean
- Unit tests: ✅ 243 passed / 243 total (session duration 712-893ms)
- ReDoS scan: ✅ 16 / 16 patterns SAFE via `recheck` v4.x
- E2E: N/A (library package)

## Handover To

→ Dispatcher (/programme-manager at top-level session) for code review + PR merge.
→ Post-merge: `/project-manager` at top-level for sprint-close of #23.
