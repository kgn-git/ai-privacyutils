# Handover — #73 PR-6: the two founder rulings of 2026-09-08

**Date:** 2026-09-08 · **Branch:** `docs/73-pr6-record-rulings` off `a2fe29ac` · **PR:** #84

Last unit of #73. Doc-only: the record and `README.md`. No `src/**` change, no test added or edited, no `CHANGELOG.md`. **PR #84's body is the evidence artefact** — the per-line census, the column enumeration, and the code citation behind every claim below.

## Decisions

**Ruling A** — rule recorded in the § 4 preamble; PR-4's `"benchmark" → "measurement"` edit ratified; `Handover-1.md:224` untouched.

1. **Pointer at the deleted README table** repointed. The brief gave `:250`; at head it is **`:254`** — drifted, as warned. The five IDs from that table are split from `S12`, still in README § Security Posture.
2. **Major-version rule consolidated.** Censused, not assumed: 4 grep hits, of which `:20` is a *different* rule (recall regression) — so **3** copies, confirming "third copy". `:140` keeps the statement, `:144` derives from it, `:146`'s copy removed after enumerating that list's fields (*alternative + reason*) and confirming both survive. It also resolved a `deferred`/`rejected` clash.

3. **Art. 87 and the v2.0 note gain no § 4 row.** The `Finding` column states a finding *as raised*; Art. 87 frames the **response** to R10, the v2.0 note is the **disposition** of R8, and both have § 3 homes. A Finding-cell copy would hold one fact in two representations.

**Ruling B** — census **re-derived, not inherited**. A narrow sweep gave 74 hits / 53 lines; a **widened** sweep (adding `version|release|CHANGELOG|bump`) gave 92 and caught `:317`, carrying **no version number at all**. Positive control → 6, negative → 0 (exit 1); every line classified by hand.

**35 places, not nine.** Restricted to places carrying an R/S/C identifier — the PR-5 reviewer's basis — the class is **11**, matching nine as a hand count of that subset; read as the rule is worded it is 35. **Kept**, because the tags do not answer them: install/pin examples, SemVer policy, byte-identity contracts, the v2.0 deferral, dependency versions, and the cohort caption (measurement provenance). R5's v1.1 attribution stays lost; no release column; no `CHANGELOG.md`. **Three claims removed as false**, verified against code: "DE in v1.2", the CHANGELOG sentence, and "a v1.3 follow-on" for middleware NER, whose limitation is kept.

**Structure.** No table, column or row deleted; every structure enumerated by column first. README diff 40/40 — symmetric, so no line vanished. Four headings lose a version parenthetical; no anchor links exist repo-wide, so nothing breaks.

## Fix round 1

**The Major — § 4 preamble.** My sentence *"Quoted test titles are the one exception"* then named two: false three ways, inside the document whose purpose is claims that survive measurement. **Fixed by scoping; nothing deleted.** I re-derived rather than copying the suggested list (`:44 :168 :172`), which was itself short: **`:107` is a fourth test-title occurrence** (the DOB/R4 title, § 3.6). Derived set: **`:44 :107 :168 :172`** (test titles, all confirmed in `src/__tests__/`), **`:144`** (SemVer deferral to v2.0), **`:239`** (§ 5, the deferral trigger the replaced table named); `:129`'s `compromise` v14 is a dependency. The paragraph names those roles **by section and test name, not line number** — line numbers drift, the defect correction 1 repaired. Also dropped a weak leg of the Art. 87 argument: § 3.9 legitimately keeps `v2.0`.

**Folded in.** § SemVer policy: *"a signed annotated tag"* is false — `git for-each-ref` shows all four tags `type=tag` with **empty** `contents:signature`, annotated but unsigned; it now says so, pointing at S3. § CV redaction profile: *"A single, one-size-fits-all policy over-redacts"* was a defect **my own attribution removal introduced** — dropping "v1.0–v1.2 shipped" made a scoped historical claim a present one about the library. Now scoped to `'default'`.

## Build & test status

`npx vitest run` (native, no local Docker, per dispatch): **`Test Files 2 failed | 17 passed (19)`, `Tests 408 passed (408)`**. The two fail to **load** — pre-existing #79 (OPEN); no test file is touched here, and CI's `test` job is green, consistent with #79. `npm run lint` clean; `npm run lint:ratio` pass (0 of 36 over the line). CI URLs on the PR.

## Reviewable state

Gates green ✅ · TDD N/A, doc-only; tests removed: **None** · branch pushed, PR #84 open against `main`, `## What Users See` omitted ✅ · SD-037 / SD-039 N/A.

## Downstream Impact

**None** — nothing outside `docs/` and `README.md` changed. **`CONTRIBUTING.md` carries the same class in 4 places** (`:35 :42 :46 :48`; `:50` and `:63` are KEPT class). Ruling B names the README only, so it is untouched — extending it is a founder call. `SECURITY.md` carries none.

## Code Review

Round 1: FIX FIRST on one Major, addressed above · further findings pending.

## Sceptic self-critique

1. **35 is a judgement, and larger than the ruling's number.** The attribution/contract boundary is mine, and I held that the rule rather than the count is the instruction. A reviewer may hold only nine were authorised; the census makes the extra 26 reversible. `:282`/`:288` are the weakest of my 35.
2. **My fix round introduced two things.** It replaced a one-sentence claim with a five-clause one — correct now, but resting on four anchors where there was one, with nothing executable pinning it, so a renamed test makes it stale. And scoping the CV sentence to `'default'` removed its historical reading rather than merely unversioning it.

3. **`:168` may misname a test's file; not fixed.** It lists R2's pinning test under `locale-phone-patterns.test.ts`; the title is at `sanitize-pii.test.ts:278`. Ambiguous rather than false, pre-existing.
4. **`README.md:200` lost a hedge I did not restore.** Removing "at the v1.0.0 maturity level" leaves the Art. 32 adequacy claim on the risk-profile hedge alone. A version-free hedge would be better, but authoring compliance text is a compliance-officer call — recommended, not done.


5. **A partial pass, named as one.** 408 of 408 executed tests passed, but two files never loaded, so the ratchet's own unit tests ran nowhere on this host. The claim available is "17 of 19 suites green locally", not "the suite is green".

