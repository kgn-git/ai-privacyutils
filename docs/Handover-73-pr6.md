# Handover — #73 PR-6: the two founder rulings of 2026-09-08

**Date:** 2026-09-08 · **Branch:** `docs/73-pr6-record-rulings` off `main` @ `a2fe29ac` · **Developer:** Claude Code

Last unit of #73. Doc-only: `docs/compliance/redaction-record.md`, `README.md`. No `src/**` change, no test added or edited, no `CHANGELOG.md`. Full census and column tables in the PR body.

## Ruling A — the `Finding` column is maintained prose

Recorded in one paragraph in the § 4 preamble. PR-4's `"benchmark" → "measurement"` edit stands ratified; `docs/Handover-1.md:224` untouched.

1. **The pointer at the deleted README table.** The brief gave `:250`; at `a2fe29ac` it is **`:254`** — drifted, as warned. It claimed six IDs were indexed from `README.md` § Known Limitations, a table PR-5 deleted. Now split: five (`R11`, `R11-residual`, `R1-residual`, `R2-residual`, `R3-residual`) live in §§ 4–5; `S12` was and still is in README § Security Posture (`:289`, verified present).
2. **The major-version rule.** Censused, not assumed: `grep -inE "major[- ]version|major bump|breaking change|v2\.0"` → **4** hits (`:20 :140 :144 :146`), of which `:20` is a *different* rule (a recall regression is breaking). So **3** copies, all § 3.9 — "third copy" confirmed. `:140` keeps the statement, `:144` derives from it, `:146`'s copy is removed — after enumerating that list's fields (item = *alternative + reason*) and confirming both survive at `:140` and `:144`. It also fixed a contradiction: `:144` called the swap **deferred**, `:146` filed it **rejected**.
3. **Art. 87 and the v2.0 note — decision: neither gains a § 4 row.** The `Finding` column states a finding *as raised*; Art. 87 is legal framing of the **response** to R10 (§ 3.7) and the v2.0 note the **disposition** of R8 (§ 3.9). A Finding-cell copy would hold one fact in two representations, and the v2.0 note carries a version number Ruling B keeps out of the record.

**A claim I weakened.** My draft preamble said "no cell attributes a finding to a release". § 4 `:168` and `:172` do — inside **quoted test titles**, verified verbatim at `src/__tests__/sanitize-pii.test.ts:278` and `:180`. Identifiers of code, not prose; the sentence now says so.

## Ruling B — release attribution leaves the README

**Census re-derived** on `README.md` @ `a2fe29ac`. A narrow version sweep gave 74 hits / 53 lines; a **widened** sweep (`v[0-9]+(\.[0-9x]+)*|version|release|CHANGELOG|bump`) gave 92 and found lines the narrow one could not — including `:317`, which carries **no version number at all**. Positive control `CHANGELOG|v1\.3` → 6; negative `v1\.4|v2\.1|v0\.9` → 0 (exit 1). Every line then classified by hand; per-line reasons in the PR body.

**35 places, not nine.** Restricted to places carrying an R/S/C identifier — the reviewer's stated basis — the class is **11**, consistent with nine as a hand count of that subset. Read as the rule is worded it is 35; removing only nine leaves 26 places inconsistent with the rule that is the reason they come out.

**Kept, because the tags do not answer them:** install/pin examples, SemVer policy on hypotheticals, byte-identity contracts, the v2.0 deferral, tags as command arguments, dependency versions — and the cohort caption `(v1.2, Windows x64 Node 24, 2026-04-30)`, which is **measurement provenance** no tag carries. R5's lost v1.1 attribution not restored; no release column; no `CHANGELOG.md`.

**Three false or stale claims went out with the clauses,** each verified against code: (a) "DE in v1.2" as a shipped national-ID pattern — `nationalIdByLocale` (`src/patterns-national-id.ts:148-154`) has five keys `uk fr it es pt`; (b) "The CHANGELOG records the fixture-level diff for every release" — none exists or is owed; (c) middleware NER integration called "a v1.3 follow-on" — v1.3.0 is tagged and `PiiMiddlewareOptions` (`src/pii-middleware.ts:97-102`) still accepts only `tokenFormat` and `maxInputLength`. That last limitation is **live** and kept; only its framing goes.

## Structure enumeration before any deletion (the PR-5 rule)

**No table, column or row is deleted.** Every structure was enumerated by column before any edit — README § Pattern inventory, § SemVer policy, § Sentinel mapping, § Cohort benchmark; record § 4, § 5, and § 3.9's "Rejected alternatives" list (item = *alternative + reason*; one item removed only after both fields were verified elsewhere). Column-by-column table in the PR body. README diff **40 insertions / 40 deletions** — symmetric, so no line vanished. Four headings lose a version parenthetical and keep their names; `grep -rn "](#"` repo-wide returns nothing, so no anchor breaks, and all three prose cross-references name the section without the parenthetical.

## Build & test status

- `npx vitest run` (native; local Docker not used, per dispatch): **`Test Files 2 failed | 17 passed (19)`, `Tests 408 passed (408)`**. The two are `scripts/__tests__/comment-ratio.test.ts` and `…e2e.test.ts` failing to **load** — pre-existing #79 (OPEN); no test file is touched by this branch.
- `npm run lint` clean. `npm run lint:ratio`: `0 of 36 in-scope files over the line at HEAD e2f19c3, 0 of 36 at base a2fe29a — pass`. CI run URL and result on the PR.

## Reviewable state

Gates green ✅ · TDD N/A, doc-only, logged skip; tests removed: **None** · branch pushed, PR opened against `main`, `## What Users See` omitted (doc-only) ✅ · SD-037 / SD-039 N/A · sceptic self-critique below ✅.

## Downstream Impact

**None** for symbols, contracts or files a sibling names — nothing outside `docs/` and `README.md` changed.

One constraint to carry: **`CONTRIBUTING.md` carries the same class at `:35 :42 :46 :48 :50` (5 places)**, e.g. "Locale expansion (v1.1+)". Ruling B names the README only, so I left it — but the rule is document-agnostic, and CONTRIBUTING.md is now the last prose surface doing what the rule says nobody does. `SECURITY.md`: none. A founder or PM call.

## Code Review

Verdict: *pending dispatcher review* · findings: *pending*

## Sceptic self-critique

1. **35 is a judgement, not a measurement.** The sweep is reproducible; the attribution/contract boundary is mine. The load-bearing cases are the ones I **kept** — L136's caption and the five byte-identity contracts. Read more strictly those six also go; more loosely, I over-removed at L282/L288 ("v1.0.0 onwards"), the weakest of my 35.
2. **I removed more than the ruling's number,** on the reasoning that the rule, not the count, is the instruction. A reviewer may hold only the nine were authorised; the PR body's census makes the extra 26 individually reversible.
3. **I deleted a false claim and left its neighbour.** The same sentence's first clause — "Every tag cuts from `main` via a signed annotated tag" — is **also false** by README S3's own admission that no tag is signed. Correcting it is new work; route it.
4. **`:168` may misname a test's file; not fixed.** The record lists R2's pinning test under `locale-phone-patterns.test.ts`; the title lives at `sanitize-pii.test.ts:278`. The cell is a semicolon-separated suite-plus-title, so ambiguous rather than false, and predates this PR. Not determined.
5. **A partial pass, named as one.** 408 of 408 executed tests passed, but two files never loaded, so the ratchet's own unit tests ran nowhere on this host (#79). The claim available to me is "17 of 19 suites green locally", never "the suite is green".
6. **Over the word cap: 1,232 against 1,000, declared not hidden.** Four trimming passes removed the framing; what remains is counts, `file:line` citations and the two decisions. PR-5's review ruled that if trimmed, cut framing and never a count — so I stopped rather than delete evidence to hit a number. The census and column tables are in the PR body, which is why they are not repeated here.
