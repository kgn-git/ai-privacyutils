# Handover — #73 PR-5 (ruling 6: the record is the authority, the README a pointer)

**2026-09-08** · `docs/73-pr5-record-is-authority` · base `main` @ `6cdc1e3` · last unit of #73.

> Counts, controls and CI live in [`Handover-73-pr5-evidence.md`](Handover-73-pr5-evidence.md) — the `Handover-1815-pr1` split.

## What changed

README § Known Limitations is now one pointer paragraph under the original heading, so inbound anchors survive; the record's §§ 4–5 carry everything the deleted table held. Six consumers repointed. Move-then-delete is provable in history — every record commit is a pure insertion against the base.

**No `Finding` column entry in § 4 was edited in any round** — structural, not promised: against the base the record's deletion count is still **1**, the `--- a/` header. Art. 87 and v2.0 went into § 3 rationale subsections rather than their § 4 rows *because* that column is frozen; the pending ruling may revisit that.

## Round 1 fix

The question asked of `Severity` was never asked of the sibling `Planned` column. Fixed additively, by a § 5 paragraph recording the three lost forward commitments as **deferred, not accepted residuals**. **Lesson: the deleted table had five columns, so ask all five** — enumeration in the evidence file.

## Round 2 fix — defects inside the evidence

All three findings were defects in the material round 1 added — evidence written to repair an information loss, each piece carrying a count measured against the wrong thing. All re-derived from scratch, not patched from the review's numbers.

1. **The record's own § 5 said "three of its entries were forward commitments"** — false of the table it names, in the document this PR makes the authority. Of the thirteen `Planned` cells, **seven** are forward commitments; three were carried nowhere else, four already were (R1-residual, R3, R3-residual, R11-residual). The loss count of three was right, the sentence about the table was not. Corrected, and its "`v1.2` for all three" reconciled with the "on consumer demand" clause above it: `v1.2` was named for the `phoneByLocale` extension and DE coverage only, Corsica NIR and IT omocodia carried as `future`.
2. **The residue was drawn from the wrong corpus** — round 1 measured the record and concluded about every surface. Six of the eight resolved rows keep their release attribution on the README with the finding ID, R7 through the record's `S12 … as R7` alias. **The genuine residue is one row: R5.** As written, the routing sent someone to mint a `CHANGELOG.md` for what the README already holds while the real gap went unnamed. Narrowed, with a control on the corpus meant.
3. **A count measured against the wrong thing.** The `Planned` row's "→ 0 across the record" is **1** — `:193`, the C7 row ending "ADR 004 § ML upgrade roadmap" — and its firing control "→ 2" was measured on the README, not the record, where it is **1**. Both corrected, each number naming its corpus.

**Minors.** *Folded at round 1:* #4, the `README.md:265` Direction vocabulary and ID-prefix set. *To the close batch:* #2 and #3 (blocked on the `Finding`-column ruling), #5, #6 (reviewer explicitly recommends **not** rebasing), #8.

## Gates

`npx vitest run` → `Tests 408 passed (408)`, `Test Files 2 failed | 17 passed (19)` — **identical to the PR-4 baseline**; the 2 failures are the pre-existing #79 `scripts/__tests__` load errors, zero tests, same on `main`. `npm run lint` clean · `lint:ratio` `0 of 36 over the line at HEAD, 0 of 36 at base 6cdc1e3 — pass` · `npm run build` clean. CI in the evidence file.

## Judgements, not derivations

- **Brief vs body on `README.md:285`** — the body deletes it, the brief keeps it, and the body then keeps the bundle note beside it. Resolution: own sub-heading, operational half only, **citing § 4.1 for the thresholds**.
- **Not done:** PR-4's Minor (the walk skips `redactMessage`'s string content and `redactPart`'s `reasoning`; 10,824 vs 10,923) → **close batch**. The surviving assertion is `toBeGreaterThan(9000)`, so the fix **cannot go red alone**; observing it needs a new fixture — test design inside a doc-only PR.

## Downstream Impact

- Touched: `README.md`, `redaction-record.md`, `adr/004…`, `ner-cohort-benchmark.test.ts`, this handover and its evidence file. No runtime file, export, symbol or contract. Nothing another open issue lists as to-do was completed.
- **⚠️ Any sibling citing README § Known Limitations by *line number* is now wrong** — the section went 25 lines → 12, so everything below `:263` shifted up 13. Section anchors survive, line anchors do not.
- **⚠️ If the `Finding`-column ruling lands as "maintained prose"**, reconsider Art. 87 / v2.0 for their § 4 rows and correct `:250`'s pointer at the deleted table.

## Reviewable state

Gates green · TDD N/A, doc-only — the sole `src/` change is one comment line in a test header · tests removed **None** · pushed, PR against `main` · `## What Users See` omitted as doc-only · SD-037 / SD-039 N/A.

## Sceptic self-critique

**"A grep finding nothing is not evidence."** Every negative carries a positive control — and that was not enough: two controls fired on a **different corpus** than the negative they vouched for. A control must exercise the same subject, not merely be green.

**"You nearly deleted a column nobody listed."** Conceded, the sharpest objection. The ID-set criterion checks *tokens*, the four-fact list *sentences*; a column is neither, so every control would have gone green while twelve ratings vanished — and I then stopped at one column.

**Word cap.** Round 1 defended the overage as evidence. A defence of length is no defence of the defects that hid in it, so round 2 splits — under the cap here, every count preserved next door.

## Code Review

- **Round 1: FIX FIRST.** Critical 0 · Important 1 (`Planned` forward commitments lost) · Minor 7.
- **Round 2: FIX FIRST.** Critical 0 · Important 3, all inside the round-1 evidence: the § 5 "three of its entries" sentence, the residue corpus, and the `Planned` row's two counts. Fixed above.
