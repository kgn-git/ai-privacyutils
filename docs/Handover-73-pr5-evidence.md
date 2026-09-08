# Handover evidence — #73 PR-5 (counts, controls, CI)

Companion to [`Handover-73-pr5.md`](Handover-73-pr5.md). Split out at round 2 so the narrative fits the 1,000-word cap **without dropping a single count**. Every negative here carries a **positive control** — the same alternation plus a token known present, which must hit — and every number names the corpus it was measured on.

Branch `docs/73-pr5-record-is-authority` · base `main` @ `6cdc1e3` · record = `docs/compliance/redaction-record.md`.

## Commit provenance

`b2c1b52` § 4.1 + § 3.7 + § 3.9 · `5bbdda3` § 5 caller-side row · `6d96d61` README becomes a pointer, six consumers repointed · `2ce37cb` handover · `5b5f069` § 5 severity ratings · `cec0ad3` § 5 planned extensions · `55563d3` five-column enumeration. Every record commit is a pure insertion against the base, and the README commit does not precede them.

## Four-fact re-derivation

`grep -nE` over the record at the parent.

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

## The deleted table had five columns, so ask all five

Section bounds derived from the headings (§§ 4–5 = lines 158..236 before the fix), not hard-coded.

| Column | Carried? | Evidence |
|---|---|---|
| `Ref` | yes, 13 / 13 | word-boundary count over §§ 4–5 with the hyphen excluded from the boundary class, so `R1` cannot match inside `R1-residual`: all 13 present (2–4 hits each); control `R99` → **0** by the same method |
| `Gap` | yes, 13 / 13 | the 8 resolved rows' gap statements *are* the § 4 `Finding` cells (R1 "Non-English postal addresses passed through" … R11 "Every date shape redacted on CV text destroys employment dates"); the 5 residual rows forward explicitly — **5 of 5** § 4 residual rows read `see section 5` — and § 5 carries each gap in full |
| `Severity` | yes, 13 / 13 | the § 5 severity paragraph, extracted mechanically from the table at `6cdc1e3`, `medium-low` for R10 included |
| `v1.1 status` | 12 / 13 | 4 land exactly in the § 5 `Status` cells (R1-residual `not mitigated`, R10-residual `documented gaps`, R11-residual `field-aware API is the follow-up`, R3-residual carrying the stronger `ML engine upgrade behind NerEngine (C7)`); the 8 resolved rows carry more than a status word — § 4 names the implementation and the pinning test for each. **The 13th is R2-residual**: `Not mitigated` at the parent, `by design` now — the round-1 Important, fixed |
| `Planned` | 7 forward commitments, 4 already carried, **3 lost → fixed** | corpus = `6cdc1e34:docs/compliance/redaction-record.md`. Negative `consumer demand \| additional countries \| planned \| roadmap` → **1**, not 0 — `:193`, the C7 row ending "ADR 004 § ML upgrade roadmap"; identical case-sensitively and case-insensitively. That hit is evidence **for** the fix, since `:193` is exactly where R3's forward commitment was already carried, but a printed `0` that is a `1` is an asserted absence and it is corrected here. Positive control `Corsica \| omocodia \| Steuer` on **the same record** → **1** (`:212`), so the grep fires on the corpus the negative was run against. The earlier "control → 2" was measured on `6cdc1e34:README.md` — a different corpus, which proves nothing about the record |

### The thirteen `Planned` cells, enumerated

Re-derived by hand from `6cdc1e34:README.md` § Known Limitations, not taken from the review.

**Six are release attributions of work already done** — R1, R2, R5, R7, R8 (`v1.1 (this release)`) and R11 (`v1.3 (this release)`).

**Seven are forward commitments.** Four were already carried at `6cdc1e34`, three were not:

| Row | `Planned` cell | Already carried at `6cdc1e34`? |
|---|---|---|
| R1-residual | `Future — narrow pattern extensions per compliance re-review` | **yes** — record `:204` `not mitigated; narrow extensions per re-review` |
| R2-residual | `v1.2 — extend phoneByLocale to additional countries based on consumer demand` | **no** → fixed here |
| R3 | `ML upgrade — TP ≥95% per-cohort, ≤5pp variance, ≤5% FP, <60 MB bundle, all CI BLOCKING` | **yes** — record `:193` (C7) → `docs/adr/004-ner-engine-compromise.md:228-232`, all five criteria verbatim |
| R3-residual | `ML upgrade — drop-in replacement via NerEngine abstraction; no consumer API change` | **yes** — record `:208` `ML engine upgrade behind NerEngine (C7)` + ADR 004 `:224` ("without any consumer API change") |
| R10 | `v1.1 (this release); DE in v1.2` | **no** → fixed here |
| R10-residual | `v1.2 — DE coverage; future — Corsica NIR + IT omocodia per consumer demand` | **no** → fixed here |
| R11-residual | `Follow-up — field-aware redaction API (jobflow-platform#1424)` | **yes** — record `:213` `field-aware API is the follow-up`, and `jobflow-platform#1424` named in the limitation text |

So the loss count of **three** is right, and the § 5 paragraph now says so of the table it names.

## One residue — it is one row, not the column

Round 1 measured the release attribution **on the record** and concluded about **every surface**. Re-derived here on the corpus the claim is actually about — `README.md`, `docs/compliance/redaction-record.md`, `docs/adr/`, `SECURITY.md`, all at head:

- **Six of the eight resolved rows keep their release attribution with the finding ID:** R2 (`README.md:258`, `:271`), R3 (`:3`, `:98`), R8 (`:68`), R10 (`:257`, `:343`), R11 (`:3`), and R7 through `README.md:289` (S12 — v1.1, issue #10) with the record's own alias at `:183`, `| S12 | … | as R7 |`.
- **R1's v1.1 is derivable but not R-labelled** — `README.md:312`, `:340`, `:341` attribute FR/DE/IT/ES/PT addresses and UK/FR/DE/IT/ES/PT postcodes to v1.1 as features.
- **The genuine residue is one row: R5.** Its `v1.1` is on no live surface. **Negative:** `R5` co-occurring with `v1\.[123]` over those four surfaces at head → **0**. **Positive control:** the same two-stage grep on `6cdc1e34:README.md` → **2**, so it fires. (`IDN|SMTPUTF8|punycode` on `README.md` is **0** at head against **2** at the parent, by the same shape.) The record's R5 row at `:171` states the resolution but carries no version, and there is **no `CHANGELOG.md`** in the repo.

Not fixed here — the record states current state, and writing version numbers into the compliance authority is the hazard the § 5 paragraph was told to avoid. **→ close batch, narrowed:** *R5's v1.1 attribution is on no surface — decide whether the record owns finding-to-release attribution at all.* A `CHANGELOG.md` is **not** owed by this PR.

## Minor 4, folded at round 1

`README.md:265` said "direction (recall or precision)" where **4 of the 15** § 5 rows carry `scope` or `control gap`, and listed "R / S / T / IMP / C" where `MIN`, `CRIT` and `I` also appear. The § 5 `Direction` column derived with awk → {recall, precision, scope, control gap}; the § 4 prefix set → {C, CRIT, I, IMP, MIN, R, S, T}. Both corrected, in README text this PR authored.

## Zero-deletion proof

`git diff 6cdc1e34 -- docs/compliance/redaction-record.md | grep -c "^-"` → **1**, the `--- a/` header alone, still true after the round-2 correction: the sentence corrected at round 2 is one this PR itself added at `cec0ad3`, so against the base it is part of an insertion, not a deletion. Against `cec0ad3` the same count is **2** — the header plus that one rewritten line. **No `Finding` column entry in § 4 has been edited in any round.**

## CI

Anchored to commits rather than to a moment — polled with `gh run list --commit`, never `gh pr checks --watch`.

- `2ce37cb` — `CI` **success** ([34192490748](https://github.com/kgn-git/ai-privacyutils/actions/runs/34192490748)) · `PR #83` **success** ([34192489606](https://github.com/kgn-git/ai-privacyutils/actions/runs/34192489606))
- `5b5f069` — `CI` **success** ([34192699033](https://github.com/kgn-git/ai-privacyutils/actions/runs/34192699033)) · `PR #83` **success** ([34192696529](https://github.com/kgn-git/ai-privacyutils/actions/runs/34192696529))

⚠️ `gh run list --commit` returns an **empty list for a short SHA** and only matches the full 40-character one — a silent zero that reads exactly like "no runs yet". Poll with the full SHA and require a non-empty result before believing a completion.

**Every green CI run postdates the threshold removal** — `gh run list --workflow CI --limit 100` returns only `success` runs dated 2026-09-08, all after it. Correction to the PR body: the earliest green is `34187484246` @ `8811cd3`, not `34189568534` @ `7e53416` — both on the PR-4 branch, so the substance holds.
