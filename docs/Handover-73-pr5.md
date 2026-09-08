# Handover — #73 PR-5 (ruling 6: the record is the authority, the README a pointer)

**2026-09-08** · branch `docs/73-pr5-record-is-authority` · base `main` @ `6cdc1e3` · last unit of #73.

`b2c1b52` § 4.1 + § 3.7 + § 3.9 · `5bbdda3` § 5 caller-side row · `6d96d61` README becomes a pointer, six consumers repointed · `2ce37cb` handover · `5b5f069` § 5 severity ratings. Move-then-delete is provable in history: every record commit is a pure insertion and precedes the README commit or follows it without deleting anything.

## Four-fact re-derivation

`grep -nE` over the record; **positive control** = the same alternation plus a token known present, which must hit.

| Fact | Before | Control | Verdict |
|---|---|---|---|
| (a) `<10 ms`, `<20 ms` | `10 ?ms\|20 ?ms\|toBeLessThan\|millisecond` → 0 | + `10KB` → 1 (`:182`) | absent — moved |
| (b) `locale-patterns.test.ts` carries the regex-only measurement | named at `:38 :39 :75 :88 :160 :184`, all addresses/postcodes; `:182` says "alongside the regex-only one" without naming it | 6 → 7 after | absent — moved |
| (c) where the figures are read | `npm test\|CI .?test\|test job\|run output\|job log` → 0 | + `redos:scan` → 3 | absent — moved |
| (held) middleware figure prints; why not gated | `:182` carries both | — | present — not moved |

Which threshold belongs to which test came from source: at `2154652`, `locale-patterns.test.ts:455 toBeLessThan(10)`, `pii-middleware.test.ts:373 toBeLessThan(20)`.

**Four further absences moved** under the body's "a moved fact is never a deleted fact" rule; of its three examples two were real, one was not. **R10 Art. 87** (`Art\. 87|Member-State` → 0) → § 3.7; **R8 v2.0** (`v2\.0` → 0) → § 3.9; **R11 overlap-suppression** is called absent but is **present** verbatim at § 5:213 — not moved. Plus two of my own, on no list: **caller-side scrubbing** (`caller-level|defence.in.depth` → 0) → § 5, and the table's whole **Severity column** — only R8's "low-severity" survived anywhere in the record (1 hit; control + `precision` → 14), so the other twelve ratings were about to be lost. Reproduced in § 5, extracted from the table at `6cdc1e3` rather than recalled: my first draft grouped R10 as medium when it is **medium-low**. Verified already carried: one-way redaction, NANP fallback, ML bundle ceiling, the residual gap texts.

## Census, classified

`grep -rni "known limitation"` over `README.md docs CLAUDE.md SECURITY.md src` — case-insensitive, which surfaced two live hits the brief's list omitted.

- **Repointed:** `README.md:3`, `:129`, `:175`; `adr/004…:40` (ADR 004 does have its own `## Known limitations` at `:209`, so "below" is true); **`adr/004…:192`** and **`ner-cohort-benchmark.test.ts:3`** — both live, neither on the brief's list.
- **Kept:** `README.md:263`, the heading, so anchors survive; `SECURITY.md:46` already links the record. **Died with the table:** `README.md:274`, prose in the R3-residual row; content is in § 5.
- **Left:** `redaction-record.md:250` (Appendix provenance of the PR-3 sweep — correcting it means editing existing record text) and 23 `Handover-*.md` hits (past work).

## Identifier-set criterion

Tokens from the README table **at the parent** `6cdc1e3`, word-boundary matched against record §§ 4–5. Script `tmp/73-pr5/idset.sh`, which **derives** the section bounds from the headings rather than hard-coding them, so the range cannot go stale (it printed `lines 158..236` on the final tree).

```
PRESENT R1 R1-residual R2 R2-residual R3 R3-residual R5 R7 R8 R10 R10-residual R11 R11-residual
ABSENT  R99
--- tokens required: 13; missing (excluding control): 0
```

13 of 13 present; the control `R99` is reported **absent** by the same method, so the null result is evidence. The 13 match the body's list exactly.

## The non-negotiable constraint

**No `Finding` column entry was edited** — proven structurally, not promised: the record commits are `15 insertions, 0 deletions` and `1 insertion, 0 deletions`. Art. 87 and v2.0 went into § 3 rationale subsections rather than their § 4 rows *because* that column is frozen; the pending ruling may want that revisited.

## Gates

`npx vitest run` → `Tests 408 passed (408)`, `Test Files 2 failed | 17 passed (19)` — count **identical to the PR-4 baseline**; the two failures are the pre-existing #79 `scripts/__tests__` load errors, zero tests, same on `main`. `npm run lint` clean · `lint:ratio` `0 of 36 over the line at HEAD, 0 of 36 at base 6cdc1e3 — pass` · `npm run build` clean.

CI, anchored to commits rather than to a moment — polled with `gh run list --commit`, never `gh pr checks --watch`:

- `2ce37cb` — `CI` **success** ([34192490748](https://github.com/kgn-git/ai-privacyutils/actions/runs/34192490748)) · `PR #83` **success** ([34192489606](https://github.com/kgn-git/ai-privacyutils/actions/runs/34192489606))
- final head `5b5f069` — `CI` **success** ([34192699033](https://github.com/kgn-git/ai-privacyutils/actions/runs/34192699033)) · `PR #83` **success** ([34192696529](https://github.com/kgn-git/ai-privacyutils/actions/runs/34192696529))

⚠️ `gh run list --commit` returns an **empty list for a short SHA** and only matches the full 40-character one — a silent zero that reads exactly like "no runs yet". Poll with the full SHA and require a non-empty result before believing a completion.

## Where brief and body read differently

The body deletes `README.md:285` (the performance paragraph); the brief says **keep** it under its own sub-heading — and the body later keeps the bundle note "beside the perf paragraph", so it is self-inconsistent. Resolution satisfying both without duplicating authority: the paragraph leaves the limitations material for a sub-heading of its own, keeps only the operational half, and **cites § 4.1 for the thresholds instead of restating them**. A judgement, not a derivation.

## Deliberately not done

PR-4's Minor (the walk skips `redactMessage`'s string-content and `redactPart`'s `reasoning` branches; 10,824 vs 10,923) → **close batch**. The surviving assertion is `toBeGreaterThan(9000)`, so the fix **cannot go red alone**; observing it needs a new fixture — test design, inside a doc-only PR.

## Downstream Impact

- Touched: `README.md`, `redaction-record.md`, `adr/004…`, `ner-cohort-benchmark.test.ts`, this handover. No runtime file, export, symbol or contract.
- **⚠️ Any sibling citing README § Known Limitations by *line number* is now wrong** — the section went 25 lines → 12, so everything below `:263` shifted up 13. Section anchors survive, line anchors do not.
- **⚠️ For the `Finding`-column ruling:** if it lands as "maintained prose", reconsider Art. 87 / v2.0 for their § 4 rows and correct `:250`'s pointer at the deleted table.
- Nothing another open issue lists as to-do was completed; no new dependency on code another issue plans to delete.

## Reviewable state

Gates green on branch · TDD N/A, documentation-only — the sole `src/` change is one comment line in a test header (Phase 3.b skip) · tests removed **None** · branch pushed, PR opened against `main`, `## What Users See` omitted as doc-only · SD-037 / SD-039 N/A · sceptic self-critique below.

## Sceptic self-critique

**"A grep finding nothing is not evidence."** Every negative carries a positive control on the same alternation, run *before* the sentence was written. All fired.

**"(b) isn't really absent — `:182` says 'alongside the regex-only one'."** Partly conceded, the weakest of the three: `:182` establishes the measurement exists but never names its file, so a reader of the record alone cannot find it. Stated as nuance, not a clean absence.

**"You exceeded the brief's scope."** Conceded and defended — two census hits and the caller-side-scrubbing fact were missing from lists presented as verified. Leaving a live pointer aimed at a table I had just deleted was the larger error.

**"Is 'every green CI run postdates the removal' measured?"** Yes — `gh run list --workflow CI --limit 100` returns exactly four `success` runs, all 2026-09-08, all after the removal. I did not repeat the retracted "red since 2026-04-28" claim nor assert why pre-04-28 runs failed (logs expired). Correction: the earliest green is `34187484246` @ `8811cd3`, not `34189568534` @ `7e53416` as the body states — both on the PR-4 branch, so the substance holds.

**Word cap.** This file is over the 1,000-word brief cap (figure in the report). Every remaining section is a control the brief names as binding; I cut prose, not evidence, and flag the overage rather than dropping a control to meet it.

**"You verified the three facts you were handed and nearly deleted a column nobody listed."** Conceded, and the sharpest objection here. The ID-set AC checks *tokens*, the four-fact list checks *sentences*; the table's Severity column is neither, so every stated control would have passed green while twelve ratings vanished. Caught only by asking what each deleted **column** carried, not each deleted row — the same question that found the caller-side-scrubbing fact.

## Code Review

- Verdict / Critical / Important / Minor / Fix commits: *pending dispatcher review*
