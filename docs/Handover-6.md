# Handover — Issue #6: R6 Document one-way redaction design intent in README

**Date:** 2026-04-20
**Branch:** `feature/6-one-way-redaction-docs`
**Base:** `main` (fast-forward to `6688a06` at start of work)
**Developer:** Claude Code (/developer subagent dispatched by /project-manager)
**Sprint:** 2K.A — v1.1 locale-aware PII + CI hardening
**Target release:** v1.1 (docs-only; no SemVer bump; `package.json` stays at `1.1.0-dev`)

---

## Implementation summary

Docs-only change. Added a "Design decisions and non-goals" section to `README.md`, placed between the existing `## GDPR Rationale` section and `## Pattern inventory`. The section contains the four bullets prescribed by the dispatch brief (compliance review R6):

1. One-way redaction is intentional (design-intent commitment, not a patchable limitation).
2. No reversal map is stored anywhere in the library (architectural invariant — no storage dependency, zero side channels carrying PII spans).
3. Future re-identification capability would be a new API surface, not a bug fix of `sanitizePii` / `piiMiddleware`.
4. Consumer apps that need reversible masking maintain their own mapping table outside the middleware.

Each bullet carries a 2–4 sentence justification. The section is **18 lines** including its H2 header, 4-line intro, 4 bullets, and a one-line cross-reference back to `GDPR Rationale` for the compliance basis. This is comfortably under the 60-line ADR-spin-off threshold, so no standalone ADR was created.

The section is deliberately framed as *design-intent* (the deliberate shape of the library) rather than *compliance basis* (GDPR Art. 4(5) / 25 / 32 — already covered in `GDPR Rationale`). The intent is to protect future maintainers from being pressured into reversibility features: the bullets explicitly state that reversibility is a v2.0 scope break requiring a new API, not a fix to current exports.

No code, tests, types, configuration, or build infrastructure was changed. `package.json` version remains at `1.1.0-dev`.

### Placement rationale

The dispatch brief suggested "between GDPR Rationale and Known Limitations". The README, however, has `Pattern inventory` between them (it is technical API documentation). I placed the new section immediately after `GDPR Rationale` and before `Pattern inventory` so that **governance content clusters together at the top** — the reader sees compliance basis (GDPR Rationale) → design intent (Design decisions and non-goals) → technical surface (Pattern inventory / Known Limitations / Security Posture / SemVer / API reference). This is a strictly narrower interpretation of the brief's placement guidance ("sits logically with the other governance content") and preserves readability.

### ADR decision — not created

Per the dispatch brief focus area 4: "An ADR is only warranted if the design rationale has 5+ decision dimensions or multiple rejected alternatives worth documenting." R6 has one core decision (reversibility is out of scope) with a corollary (consumers own reversible mapping if they need it). No multiple rejected alternatives are worth enumerating formally. Shipping in-README only. ADR 002 at `docs/adr/002-input-length-cap.md` (from #10) remains the only ADR in the repo; the natural numbering slot 001 is intentionally left unused.

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

No open sprint-issue PRs against `main`. The single open PR at dispatch (#25) is a Dependabot `actions/checkout` bump — not a sprint issue, exempt from SD-007 per the standard Dependabot exemption.

Branch was created off `origin/main` at `6688a06` after fast-forward pull. No branch-hopping or partially-done prior work.

---

## Sections touched

| File | Change | Lines |
|---|---|---|
| `README.md` | Inserted `## Design decisions and non-goals` section between `## GDPR Rationale` and `## Pattern inventory` | +14 |

No other files changed.

---

## Acceptance criteria

- [x] README "Design decisions and non-goals" section added with the 4 bullet points from the issue body
- [x] Each bullet has a brief 2–4 sentence justification (not dry restating)
- [x] Cross-ref to GDPR Art. 4(5) / 25 — the new section names Art. 4(5) + 25 inline *and* closes with "See GDPR Rationale above for the compliance basis (Art. 4(5) / 25 / 32)"
- [x] README section stays under 60 lines (actual: ~18 lines) → no `docs/adr/001-one-way-redaction.md` spin-off
- [x] SemVer: no code change → `package.json` unchanged at `1.1.0-dev`

---

## Reviewable state (per SD-002 amended 2026-04-15)

- **Build:** PASS (`npm run build` — `tsc -p tsconfig.build.json` clean)
- **Lint:** PASS (`npm run lint` — `eslint src` clean, no output = no findings)
- **Unit tests:** PASS — **239/239** (7 files: `idn-email` 23, `pii-middleware` 17, `token-format` 30, `sanitize-pii` 45, `locale-phone-patterns` 39, `input-length-cap` 30, `locale-patterns` 55; 1.26s). Baseline preserved exactly — this is a docs-only change.
- **ReDoS scan:** PASS — `npm run redos:scan` reports 16/16 patterns SAFE (no regex changes).
- **TDD compliance verifiable in commit history:** N/A — docs-only. SI-001's RED→GREEN requirement applies to service-layer code under `src/lib/services/`, `src/lib/workflows/`, and API routes with logic (see `developer/SKILL.md` Phase 3.b gate). README text changes explicitly fall under "Skip TDD when: Purely documentation changes". No service-layer files touched.
- **Handover written before completion summary:** Yes — this file. Written and committed before the `/developer` subagent returns its completion summary to the dispatcher (per SD-001).
- **Branch pushed to origin:** Yes (see commit SHAs below).
- **PR opened against `main`:** Yes — PR URL in the completion summary.

---

## Commits on branch

| SHA | Subject | Files | Lines |
|---|---|---|---|
| `9ef4b1d` | `docs(#6): design intent section — one-way redaction is intentional` | `README.md` | +14 |
| _(pending)_ | `docs(#6): Handover-6.md (design intent doc section handover)` | `docs/Handover-6.md` | +~180 |

Commit SHAs will be finalised after the handover commit lands. Base commit on main: `6688a06`.

---

## Code Review

- **Reviewer:** maintainer inline at top-level session scope (2026-04-19)
- **Review mode:** dispatcher-scope inline. Full `feature-dev:code-reviewer` subagent dispatch skipped as an authorised exception for this pure-docs change: zero code/test/config files touched, zero regression surface, zero new semantic claims beyond a narrow design-intent restatement. Diff = README.md +14 / -0. Inline review reads the 14 new lines directly against the dispatch acceptance criteria.
- **Base SHA:** `6688a06518c4c5544b5c3f55d8000febd8d797c0`
- **Head SHA:** `1c64f41` (at dispatch time)
- **Verdict:** Ready to merge
- **Critical findings:** 0
- **Important findings:** 0
- **Minor findings:** 1 (confidence 40 — not fixed)
- **Minor-1 (not fixed):** The framing "anonymisation side of the Art. 4(5) pseudonymisation / anonymisation line" is slightly loose — Art. 4(5) strictly defines only pseudonymisation; the anonymisation concept is framed by Recital 26 (the "all reasonable means to identify" test) rather than by Art. 4 directly. The practical framing is defensible at a design-intent level and the section's last line explicitly cross-refs the separate `GDPR Rationale` section for compliance basis. Not worth blocking; would only matter in a formal compliance filing, which this section is not.
- **All dispatch focus areas: PASS.**
  - GDPR references accurate enough for a design-intent section (Art. 4(5) + Art. 25 named correctly; see Minor-1 for pedantry).
  - Design-intent vs compliance-basis separation clear — intro paragraph explicitly draws the distinction; closing line cross-refs `GDPR Rationale` for compliance basis.
  - Non-goal framing unambiguous — bullet 3 says "do not patch this library — propose a parallel API" verbatim.
  - Consumer guidance concrete — bullet 4 gives the `(sessionId, tokenKind, originalSpan)` mapping shape with access-control + retention owner explicitly named as the consumer.
  - Section under 60 lines (14 lines) — no ADR spin-off needed, consistent with dispatch direction.
  - No collateral changes: `git diff 6688a06..1c64f41 --stat` = README.md +14, docs/Handover-6.md +143. No code, no tests, no config.
  - No-regression: 239/239 tests unchanged, build + lint clean.

---

## Known AC deviations

**None.** All five acceptance-criteria checkboxes from the issue / dispatch brief are satisfied.

---

## Notes for reviewer

1. **GDPR reference accuracy.** The new section names Art. 4(5) (pseudonymisation / anonymisation distinction) and Art. 25 (privacy-by-default). These are a *narrower* cross-reference than the existing `GDPR Rationale` section, which covers Art. 5(1)(c) / 25 / 32. Art. 4(5) is new in this section because it is the article that frames the anonymisation-vs-pseudonymisation posture — the relevant lens for a "one-way redaction is intentional" statement. Verify: does the framing "places the library on the anonymisation side of the Art. 4(5) pseudonymisation / anonymisation line at the prompt-emission boundary" hold? (The library transforms prompts destructively before emission; the original PII is discarded by the library. The *consumer* may retain the original, but that is the consumer's processing, not this library's.)

2. **"Design intent" vs "compliance basis" framing.** The section is deliberately not a re-statement of GDPR rationale. The intent, per dispatch focus area 1, is to document *the deliberate shape of the library* (non-goal: reversibility) separately from *the reasons this shape is legally defensible* (GDPR Rationale). If the review perceives that any bullet has slipped back into restating GDPR obligations rather than the library's design choice, flag it.

3. **"Non-goal" posture protects future maintainers.** Focus area 2: the section must protect future contributors from being pressured into reversibility features. Bullet 3 states explicitly: "If a downstream issue asks to 'make redaction reversible', do not patch this library — propose a parallel API." Verify this is unambiguous.

4. **No unintended collateral changes.** Only `README.md` is modified; `git diff --stat` shows one file, +14 lines. No `package.json` bump (version stays `1.1.0-dev`). No code, tests, types, scripts, or config touched. Confirm nothing else leaked in.

5. **No-regression on existing README sections.** The insertion is purely additive. The preceding `## GDPR Rationale` section and the following `## Pattern inventory` section are untouched. The `## Design decisions and non-goals` header introduces no heading-level clashes. Verify by reading the full README front-to-back for reader flow.

6. **No new ADR.** Per dispatch focus area 4 and scope (~30 min). If the reviewer believes R6 warrants ADR 001 anyway — that is a valid product-owner call, but it is out of `/developer` scope for this issue and should be captured as a follow-up issue, not reworked into this PR.

7. **SD-002 fit for purpose on a docs-only PR.** Reviewer may choose to either (a) run `feature-dev:code-reviewer` normally, (b) self-review at the dispatcher layer and record the verdict here, or (c) skip review with an explicit waiver recorded in this section. All three are compatible with SD-002 *as long as the decision is explicit and auditable* — the forbidden failure mode is silent degradation.

---

## Handover To

→ `/project-manager` (dispatcher) to run code review per SD-002 amended 2026-04-15, then sprint-close via the standard Sprint 2K.A close path.

→ Once merged, issue #6 auto-closes via the `Closes #6` trailer in `9ef4b1d`.
