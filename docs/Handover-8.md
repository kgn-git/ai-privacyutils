# Sprint Handover: Sprint 2K.A — privacyutils#8 (R10 national-ID patterns)

**Date:** 2026-04-28
**Branch:** `feature/8-national-ids`
**Developer:** Claude Code (Opus 4.7 1M)
**Issue:** [kgn-git/jobflow-privacyutils#8](https://github.com/kgn-git/issues/8) — R10: National-level identifier patterns

---

## Issues Implemented

| # | Title | PR | Commit(s) |
|---|-------|----|-----------|
| 8 | R10: National-level identifier patterns | (open against `main`) | `8dc4858` (RED), `c9ef077` (GREEN) |

## Issues Deferred or Blocked

| # | Title | Reason |
|---|-------|--------|
| — | DE Steuer-ID / Rentenversicherungsnummer | Per issue scope explicitly deferred to v1.2 |
| — | ROPA / DPIA-pre-screen updates in scoring + platform | Out-of-scope per dispatch preamble — to be filed as separate consumer-side issues at programme level after merge |

## TDD Compliance

- Test-first commits: 1 / 1 (100%)
- TDD skips: None
- RED commit `8dc4858` precedes GREEN commit `c9ef077` per SI-001
- RED commit was already on the branch from a previous interrupted dispatch (audited and kept — see "Existing-work audit decision" below). Verified RED tests fail with `TypeError: nationalIdUkValidator is not a function` before applying GREEN

## Pre-Implementation Expert Reviews (filled from dispatch preamble per SD-009 / Sprint 2K.A audit 2026-04-20)

Four mandatory experts consulted under the utility-package fast-path roster (`jobflow-privacyutils/CLAUDE.md` § Expert Roster). All four return PASS or WARN with no FAIL.

| Expert | Consulted | Verdict | Reference |
|---|---|---|---|
| `/compliance-officer` | 2026-04-28 | **WARN — Medium-Low severity refresh** | `jobflow-programme/docs/expert-reviews/PreImplReview-privacyutils-8-2026-04-28.md` (merged via `kgn-git/jobflow-programme` PR #40); GH issue comment [#8 thread](https://github.com/kgn-git/jobflow-privacyutils/issues/8#issuecomment-4333319303) |
| `/security-expert` | 2026-04-28 | **PASS** with PT NIF check-digit gate REQUIRED (S3) | same file |
| `/tech-expert` | 2026-04-28 | **PASS** — validator-factory pattern fit; no ADR | same file |
| `/tech-ops-expert` | 2026-04-28 | **PASS** — ~600B gz delta; +0.05-0.15ms per call | same file |

**Skipped experts (utility-package fast-path):** `/product-owner`, `/ui-expert`, `/hr-advisor`, `/data-engineer` — N/A under the project class. No UI surface, no product strategy decisions, no recruitment-domain logic, no database schema changes.

**Dispatch verdict:** READY for `/developer` dispatch — conditional on the 4 Mandatory Compliance Requirements + 16 consolidated implementation constraints in the durable review doc.

## Existing-work audit decision

**Decision: KEPT the existing RED commit `b0d31c1` as-is (rebased to `8dc4858` on top of latest main); APPLIED stashed GREEN work as foundation; THEN augmented with missing compliance requirements (C2/C3/C4/C5), file-organisation split (T5), and dropped the stash.**

Audit findings on the prior interrupted-dispatch state:

- **RED commit `b0d31c1`** — 525-line test file. All fixtures synthesised via the production check-digit algorithm (`computeEsDniCheckLetter('12345678')` etc.). UK NINO uses canonical synthetic patterns `AB123456C` / `JY123456A`. IT CF body `RSSMRA85T10A562` is a textbook synthetic example (Mario Rossi). **No real applicant IDs.** PASS Mandatory C1.
- **Stashed GREEN work** — included PT NIF check-digit gate (security-expert finding S3) AND word-boundary `\b\d{9}\b` extraction pattern. Pipeline placement after postcodes / before DOB matched dispatch spec. Defensive guards on mod-23/mod-11/mod-97 validators.
- **Gaps in stashed work:** README updates (C2/C4/C5), top-of-file no-logging compliance comments (C3), file-size T5 split.

Augmentations made on top of stashed GREEN:

1. Added compliance comment `// COMPLIANCE: matched substrings MUST NOT be logged. Match counts permitted.` at top of `src/sanitize-pii.ts` AND new `src/patterns-national-id.ts` (C3).
2. Updated README "Patterns" table with 5 new `nationalIdByLocale.{...}` rows (UK/FR/IT/ES/PT) (C2).
3. Updated README "Order of application" to include the new national-IDs pass with full rationale (C2).
4. Strikethrough + replace R10 row in "Known Limitations" — from "v1.2" to "Resolved in v1.1 for UK/FR/IT/ES/PT; DE deferred"; added Member-State framing per Art. 87 (C4, C5).
5. Added R10-residual row enumerating PT NIF 1/11 false-positive trade-off, FR Corsica conversion gap, IT omocodia gap, DE deferral, destructive-redaction explicit confirmation.
6. Updated v1.1 release note paragraph to mention R10 alongside R1/R2/R5/R7/R8.
7. Updated SemVer policy line: "national-ID in v1.1 for UK/FR/IT/ES/PT, DE in v1.2".
8. Updated `piiPatterns` API listing in README to include `nationalIdByLocale.{uk,fr,it,es,pt}` and individual exports.
9. Tech-expert finding T5 — split `national-ID` code into `src/patterns-national-id.ts` (454 lines); re-exported from `patterns.ts` barrel. `patterns.ts` reduced from 1131 → 734 lines; public API surface unchanged.

Rebase performed first to ensure base reflected merged governance PR #35 (`14a4519` CLAUDE.md § Expert Roster).

## Per-locale outcomes

- **UK NINO**
  - Regex shape: `\b[A-Z]{2}(?:\s?\d{2}\s?\d{2}\s?\d{2}|\d{6})\s?[A-Z]\b` (extraction); validator strips spaces and applies HMRC invalid-prefix character-class checks.
  - Validator: regex-only with HMRC rules (D/F/I/Q/U/V banned position 1; D/F/I/O/Q/U/V banned position 2; suffix `[A-D]`).
  - Fixtures (count: 11 in test): `AB123456C`, `JY123456A`, `PP987654D`, `AB 12 34 56 C`, `JY 12 34 56 A` (positives); `AB123456E`/`AB123456Z` (suffix), `AB12345C`/`AB1234567C` (digit count), `1B123456C`/`ABC123456C` (prefix shape), `DA123456C`/`QQ123456C`/`AO123456C` (forbidden prefixes).

- **FR NIR**
  - Regex shape: `\b[12](?:\s?\d{2}\s?\d{2}\s?\d{5}\s?\d{3}\s?\d{2}|\d{14})\b` (extraction); validator gates first digit `1|2`, mod-97 check key.
  - **mod-97 implementation note:** uses `BigInt` to avoid 15-digit `Number` precision loss. Check key = `97 - (N mod 97)`, zero-padded 2-digit string. Corsica `2A`/`2B` département conversion NOT implemented (documented gap R10-residual).
  - Fixtures (count: 5): `1850775056001` body + computed key (compact + spaced positives), wrong key, sex prefix `3`/`0` rejected, length 14/16 rejected.

- **IT Codice Fiscale**
  - Regex shape: `\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z0-9]{4}[A-Z]\b` (extraction).
  - Algorithm: position-weighted check letter via odd/even tables (Agenzia delle Entrate D.M. 23/12/1976 Allegato 2). Sum lookups, mod 26, indexed into `'A'..'Z'`. Omocodia (letter substitutions on hash collision) NOT handled (documented gap R10-residual).
  - Fixtures (count: 6): `RSSMRA85T10A562` body + computed letter (positive); wrong letter; structural rejections (`123MRA85T10A562X` digits-in-surname, length 14/17, year-portion bad).

- **ES DNI**
  - Regex shape: `\b\d{8}[A-Z]\b` (extraction); validator checks `^\d{8}[A-Z]$` then mod-23 lookup.
  - **mod-23 implementation:** lookup table `TRWAGMYFPDXBNJZSQVHLCKE` indexed by `(parseInt(body, 10) % 23)`. Defensive guards: non-finite parseInt early-returns `''`.
  - Fixtures (count: 9): `12345678Z` (computed positive — mod-23 verified), `00000000T`, `00000001R` (table verification); wrong letter `12345678A`/`12345678B`; shape rejections (7/9 digits, no letter, all-letters).

- **PT NIF (CRITICAL — security-expert finding S3)**
  - Regex shape: `\b\d{9}\b` (extraction — **word-boundary mandatory**); validator checks `^\d{9}$` then mod-11 weighted sum.
  - **mod-11 implementation note:** weights `[9, 8, 7, 6, 5, 4, 3, 2]` over body digits 1..8. Check digit = `0` if remainder < 2, else `11 - remainder`. **The check-digit gate is the precision floor — without it false-positive rate on bare 9-digit numerics in CV text is unacceptable.** Documented residual gap: random 9-digit sequences whose last digit happens to match the computed check digit pass (~1/11 rate).
  - Defensive guards: length mismatch + non-digit early-return `false`/`-1`.
  - Fixtures (count: 6): `12345678` body + computed check (positive — mod-11 verified `123456789` → check 9), wrong check `123456780` rejected, shape rejections (8/10 digits, letters), known false-positive case `000000000` documented as accepted trade-off.

## Mandatory Compliance Requirements verification

1. **Synthetic-only fixtures with valid check-digits:** ✓
   All 55 fixtures in `src/__tests__/national-id-patterns.test.ts` are computed via the production algorithm (`computeEsDniCheckLetter('12345678')`, `computePtNifCheckDigit('12345678')`, etc.) or are documented synthetic patterns (UK NINO `AB123456C`/`JY123456A`/`PP987654D`; IT CF `RSSMRA85T10A562` Mario Rossi textbook example). Fixture-synthesis approach documented inline in test file's header docblock. **No real applicant IDs anywhere in the repo or git history.**

2. **Destructive-redaction docs in README + JSDoc:** ✓
   - README "Design decisions and non-goals" §1 already covered destructive one-way redaction (PR #30 merged).
   - README R10 row + R10-residual row reinforce: "Redaction is destructive / one-way — matched bytes are not retained, logged, or returned."
   - `src/patterns-national-id.ts` module header + each validator factory JSDoc explicitly state matched bytes are not retained, logged, or returned.

3. **No-logging-of-match-contents (top-of-file comment + verified absent in code):** ✓
   - `src/sanitize-pii.ts` top-of-file (lines 1-4): `// COMPLIANCE: matched substrings MUST NOT be logged. Match counts permitted.`
   - `src/patterns-national-id.ts` top-of-file (lines 1-6): same comment + Art. 5(1)(c) / 25 framing.
   - `src/patterns.ts` national-ID re-export block also carries the comment.
   - **Verified by code search:** zero `console.log`/`error`/`warn`/`info`/`debug` calls anywhere in `src/`.

4. **README R10 row updated:** ✓
   - Old: "R10 | National-level identifiers… not covered. Rare in modern CVs but can occur in regulated sectors. | Low | Not mitigated | v1.2 — national-ID pattern set"
   - New: "R10 | ~~strikethrough~~ **Resolved in v1.1** for UK/FR/IT/ES/PT via `nationalIdByLocale.*()` validator factories with check-digit gating (DNI mod-23, NIF mod-11, FR NIR mod-97, IT CF position-weighted check letter); UK NINO regex-only with HMRC invalid-prefix rules. **Member-State framing (Art. 87)** … DE Steuer-ID / Rentenversicherungsnummer deferred to v1.2. | Medium-Low | **Resolved (UK/FR/IT/ES/PT)** | v1.1 (this release); DE in v1.2"
   - New row R10-residual added enumerating residual gaps.

## Acceptance criteria

- [x] Per-locale national-ID patterns (`piiPatterns.nationalIdByLocale.{uk,fr,it,es,pt}()` validator factories)
- [x] Test fixtures per format (synthetic — 55 tests, all check-digit-computed)
- [x] Check-digit validation where applicable (DNI mod-23, NIF mod-11, FR NIR mod-97, IT CF position-weighted check letter)
- [x] Minor bump SemVer (README SemVer table updated; tag-cut as `v1.2.0` per O2 in tech-ops review — actual tagging is a programme-manager step post-merge)

## Reviewable state

- **Build:** ✅ `tsc -p tsconfig.build.json` — no errors
- **Lint:** ✅ `eslint src` — no errors
- **Unit tests:** ✅ 298 / 298 passing (243 baseline + 55 new R10 tests)
- **redos:scan:** ✅ 21 / 21 patterns SAFE (16 baseline + 5 new national-ID extraction patterns; addressIt/addressEs WARN-timeouts pre-existed on baseline before this dispatch)
- **TDD compliance verifiable in commit history:** ✅ `8dc4858` test(#8) RED precedes `c9ef077` feat(#8) GREEN
- **Handover written before completion summary:** ✅ this file
- **Branch pushed to origin:** (pending push at end of dispatch)
- **PR opened against `main`:** (pending PR creation)

## Code Review (left blank by /developer — populated by dispatcher AFTER /developer returns)

This section is left blank by `/developer` per SD-002 amendment 2026-04-15. The dispatcher (`/programme-manager` or `/project-manager` at top-level session scope) populates it after running `Agent(subagent_type="feature-dev:code-reviewer")` against the branch. Self-review fallback was NOT explicitly authorised in the dispatch prompt.

- Verdict: pending dispatcher review
- Critical findings: pending
- Important findings: pending
- Minor findings: pending
- Fix commit(s): pending

## Process Rule Violations

- None observed.

## Known Tech Debt

- DE Steuer-ID / Rentenversicherungsnummer deferred to v1.2 per issue scope. Single deferral, fully documented.
- FR NIR Corsica `2A`/`2B` département conversion not implemented — Corsican NIRs fail validation (residual gap R10-residual).
- IT Codice Fiscale omocodia (letter substitutions on hash collision) not handled — rare edge case (residual gap R10-residual).
- PT NIF accepts ~1/11 of bare 9-digit sequences whose last digit happens to be a valid mod-11 check — documented precision trade-off (residual gap R10-residual). Recall over precision on free CV text is the deliberate v1.1 stance.

## Build & Test Status

- Build: ✅
- Lint: ✅
- Unit tests: 298 passed, 0 failed / 298 total
- redos:scan: 21/21 SAFE (5 new national-ID extraction patterns added)
- E2E: N/A (utility package — no UI / API surface)

## Out-of-scope (filed as separate issues post-merge)

Per dispatch preamble — separate consumer-side issues to be filed by programme-manager:
- `kgn-git/jobflow-scoring` — ROPA one-line update for v1.1 R10 redaction coverage; DPIA-pre-screen note confirming no DPIA triggered.
- `kgn-git/jobflow-platform` — same.

## Handover To

→ `/programme-manager` (top-level session scope) for SD-002 dispatcher-level code review via `Agent(subagent_type="feature-dev:code-reviewer")` against the branch.

After review verdict + any fix commits land, → `/project-manager` for `/sprint-close` and tag-cut to `v1.2.0` per SemVer minor (new locale coverage).
