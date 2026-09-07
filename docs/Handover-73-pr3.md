# Handover: #73 PR-3 — compliance record and three-bucket comment pass

**Date:** 2026-09-07 · **Branch:** `refactor/73-pr3-compliance-record-comment-pass` off `main` @ `291d756` · **Developer:** Claude Code (`/developer`, resumed after a rate-limit interruption) · **Repo:** `kgn-git/ai-privacyutils`

## What changed

| Commit(s) | Subject |
|---|---|
| `688e157` | docs(#73): compliance record (previous run) — `docs/compliance/redaction-record.md` + `SECURITY.md` link |
| `fd0ed19` | test(#73): ten controls pinning the guards the comments carried, each shown red by a mutation on its subject |
| `79716de` | docs(#73): eight record claims corrected against the built library and pass-order experiments |
| `9f1df9e` | test(#73): the static-import control walks the TypeScript AST (its regex was flagged by `eslint-plugin-redos`) |
| `115839a` … `197ee2d` (14) | refactor(#73): comment pass over each src file, worst first, one commit per file |
| `39ceddd` | refactor(#73): `comment-ratio.mjs:43` docblock — the shallow hint is conditional (PR-2 minor) |
| `a9f7405` … `e08e626` (14) | refactor(#73): comment pass over each test file, one commit per file |

**Method.** Every comment block in `src/**` was judged history / guard / why. History (issue refs, dates, version narration, Handover pointers, SD-002 trails, the two dead `sanitize-pii.ts:130–177` anchors from M2) was deleted. Guards became named tests *first* (`fd0ed19`), then their comments went. Why-blocks were rewritten as one to three present-tense lines **from the code beside them**, after reading the code — the PR #222/#224 failure class (a compacted claim the code contradicts) was the thing looked for, and it was found in the *record*, not only in comments (below). Every src file carries a ≤ 3-line `COMPLIANCE:` header naming its record section; interface/type files keep one contract line per exported member; test titles are untouched.

**Interrupted work: kept vs redone.** All ten uncommitted controls were kept — each pins a guard a comment carried, went red once under a mutation of its subject, and touched no existing assertion (`it()` 398 → 408, `expect()` per file unchanged). One was redone: the static-import scan used a line-anchored regex that `eslint-plugin-redos` rejects as 2nd-degree polynomial; it now lists `ImportDeclaration`/`ExportDeclaration` nodes with specifier `'compromise'` and was re-proven red on the same mutation. The record (`688e157`) was kept and corrected in place.

## The record, judged against the code (`79716de`)

Read as a claim and executed: eight statements the code contradicts, each corrected.

1. § 1 *"produces the same output as the first release for every input"* — v1.1+ redact strictly more; now: reproduces the previous release on the shared fixtures.
2. § 3.7 UK NINO *"tabs and double spaces are rejected"* — `replace(/ /g, '')` strips every space (`AB  12 34 56 C` validates); only tabs/newlines fail. New § 5 row: the extraction regex allows one whitespace per gap, so a double-spaced NINO is never a candidate in free text (recall, recorded, no fixture).
3. § 2 step 4 *"position of this pass … not load-bearing"* — moved after the phone passes, the compact-NIR fixtures come out as `[phone]` (the NANP domestic shape eats ten digits of a 15-digit run); moved before the postcodes or after the dates the suite stays green. Corrected with the two pinning tests named.
4. § 2 step 2 *"EN runs first so the original fixtures stay byte-identical"* — EN moved last, suite green; no fixture depends on the address order.
5. § 3.8 *"`compromise` is loaded … on first use"* — the constructor starts the load (`this.ready = loadCompromise()`).
6. § 3.9 *"the leading `\b\d` of the EN/DE/IT/ES/PT address … pattern"* — DE/IT/ES/PT put the house number last; the true invariant is *every pattern except email requires a digit, email requires `@`, no token has either* (measured over all 22 factories).
7. § 1 two section cross-references (3.6 → 3.10, 3.7 → 3.8).
8. Dates-before-locale-phones confirmed load-bearing by experiment (11 reds when flipped) — the row stands.

Also measured, and true as written: DE metadata accepts `23.05.1985`/`1985-05-23` as phone candidates and `12 34 56`/`116 117` as valid short codes (so `MIN_PHONE_DIGITS` is load-bearing); a bare 8-digit run validates as DE; `1985-1990` is redacted as `[phone]`; `Ann Lee met Ann today` → `[person] Lee met Ann today`; `07700 900123` is rejected by the UK validator.

## Counts

Comment lines per file (census at `291d756` → `e08e626`, TS-AST classifier), code lines unchanged:

| src | before → after | tests | before → after |
|---|---|---|---|
| `patterns.ts` | 592 → 40 | `locale-patterns.test.ts` | 119 → 13 |
| `patterns-national-id.ts` | 302 → 27 | `national-id-patterns.test.ts` | 109 → 8 |
| `sanitize-pii.ts` | 301 → 32 | `ner-cohort-benchmark.test.ts` | 80 → 26 |
| `ner/compromise-ner-engine.ts` | 185 → 27 | `pii-middleware.test.ts` | 76 → 9 |
| `sanitize-pii-async.ts` | 155 → 15 | `locale-phone-patterns.test.ts` | 69 → 6 |
| `token-format.ts` | 127 → 6 | `sanitize-pii.test.ts` | 64 → 4 |
| `ner/ner-engine.ts` | 117 → 5 | `sanitize-pii-async.test.ts` | 53 → 5 |
| `pii-middleware.ts` | 111 → 18 | `cv-profile.test.ts` | 49 → 7 |
| `limits.ts` | 91 → 5 | `input-length-cap.test.ts` | 43 → 3 |
| `profiles.ts` | 63 → 3 | `token-format.test.ts` | 39 → 4 |
| `index.ts` | 40 → 2 | `idn-email.test.ts` | 32 → 3 |
| `ner/index.ts` | 38 → 4 | `compromise-ner-engine.test.ts` | 26 → 2 |
| `ner/null-ner-engine.ts` | 25 → 3 | `person-token-idempotency.test.ts` | 25 → 2 |
| `redact-ranges.ts` | 10 → 7 | `ner-engine.test.ts` | 19 → 4 |
| **src total** | **2,157 → 194** | **tests total** | **803 → 96** |

Files over the 25 % line: src 12 → 0, tests 5 → 0. Ratchet at HEAD: `comment-ratio: 0 of 36 in-scope files over the line at HEAD e08e626, 17 of 35 at base 291d756 (merge base with origin/main) — pass`; every one of the 29 sweep/control commits passed it individually (count fell monotonically 17 → 0, never rose).

## Proofs

| Control | Result |
|---|---|
| Token-stream identity, 14 src files vs `291d756` (`tokens.mjs`, TS AST leaves, JSDoc excluded) | 14/14 IDENTICAL (e.g. `patterns.ts` 784 = 784, sha `eb543722c113`); an earlier draft that had retyped the accented classes as literal characters DIVERGED@36 and was restored line-for-line from `291d756` before commit — the checker caught it |
| Token-stream identity, 14 test files vs `9f1df9e` (their controls commit) | 14/14 IDENTICAL — the test sweeps are comment-only |
| 22 pattern-factory `source`+`flags`, base build (`291d756` worktree) vs HEAD build, compared in memory | identical; positive control (one flag flipped) → 1 difference. The previous run's `patterns-before.txt` is not a faithful dump — it was captured through the Write tool, which decodes `\uXXXX`, so it shows literal `Ä` where the source has `Ä` |
| ID-set census (`census-ids.mjs`): review-finding IDs in `src/**` ⊆ record | before the sweep 29 IDs, `src − record = ∅`; after, 22 IDs (the rest now live only in the record), `src − record = ∅`; positive control (`S3` blanked from the record) → `{S3}` |
| Record test-title cross-references (`check-titles.mjs`) | every quoted title resolves to a `describe`/`it` in `src/__tests__` |
| Ten control mutations (M1–M11, `mutate.mjs`) | each named control red, all reverted; M4 re-proven after the AST rewrite |
| Pass-order experiments (`experiment.mjs`) | E1 IDs after phones → 2 reds (NIR); E2 IDs after dates, E4 IDs before postcodes, E3 EN address last → green; E5 dates after locale phones → 11 reds |
| `it()` / `expect()` per file | 398 → 408 at the controls commit (+10, all additions); unchanged through every sweep |

## Gates (2026-09-07 14:25–15:10 UTC+2; 23 unrelated Supabase containers live on the host)

- **node:20 Docker** (`docker run --rm -v <repo>:/app -v jobflow_privacyutils_node_modules:/app/node_modules -w /app node:20 npx vitest run`, from PowerShell): `Test Files 3 failed | 16 passed (19)` · `Tests 1 failed | 407 passed (408)`. The one test is `locale-patterns.test.ts:567` (19.9 ms mean vs 10; not edited). The two files are `scripts/__tests__/comment-ratio.test.ts` and `comment-ratio.e2e.test.ts`, which **fail to load** (`SyntaxError: Invalid or unexpected token` at the `.mjs` import) on this host — identically on the host runner and in Docker, and **identically at the base `291d756` in a scratch worktree** (control run 15:08). This branch changes one ASCII word in that file's docblock; `comment-ratio.mjs` imports cleanly under host Node directly. PR-2 recorded both suites green on the CI runner; the PR's CI run is the authority for them.
- Host `npm test -- src`: `1 failed | 407 passed (408)`, same benchmark. `npm run lint` clean · `npm run build` clean · `npm run redos:scan` 22 `OK … safe`, ends `all patterns safe.` · `tsc --noEmit -p tsconfig.json --incremental false`: 24 errors, file+code multiset identical to `origin/main`'s 24 (all in `src/__tests__`).
- "CI passed" is not an available claim here; the CI `lint` ratio line is quoted in the PR body once the run exists.

## Declared, not fixed

- **`#N` / `vN.N` strings survive in test titles** (`(#3 / R5)`, `(#23 MIN-1)`, `(R1 / #1)`, `v1.0.0 …`): the ruling keeps review IDs in titles, the record indexes those exact titles, and a title change is not a comment change. The AC's *no `(#N …)` remains in `src/**`* spot-check will hit them — a reviewer call, flagged here rather than silently renamed. No comment anywhere in `src/**` carries an issue ref, date, version tag, Handover pointer or fix-trail word (grep census, 0 hits outside titles and token strings).
- Seven files that had no `COMPLIANCE:` header got a ≤ 3-line one (`index.ts`, `limits.ts`, `profiles.ts`, `token-format.ts`, `pii-middleware.ts`, `ner/*`), reading the ruling's *"each src file keeps a … header"* literally; each file still lost comment lines net.
- `README.md § Known Limitations` and record § 5 now both hold the residual-limitation text (one fact in two representations, SD-073); the record is proposed as the authority — a founder call, not changed here.

## Reviewable state

- Per-cycle gates green on the branch bar the two pre-existing host items above: ✅
- TDD verifiable in commit history (SI-001): controls `fd0ed19` (and `9f1df9e`) precede every sweep commit: ✅ · Tests removed: None.
- Branch pushed + PR opened against `main`; `## What Users See` omitted — comment-only, output byte-identical: ✅
- Reachability (SD-037) / Journey (SD-039): N/A — library internal.
- Handover written before the completion summary; `## Code Review` left for the dispatcher (SD-002).
- **Sceptic self-critique: 7 objections — reconciled.** (1) *The pattern dump differed* — the before-file was the artefact, shown by rebuilding the base and comparing in memory. (2) *My rewritten comments are claims too* — each was written from the code and the load-bearing ones were executed (short codes, formatting guard, NINO spaces, load at construction, `indexOf` semantics, pass order). (3) *I corrected the record I was asked to judge* — every correction cites an executed probe or experiment, listed above, and is a separate commit for the reviewer. (4) *Titles still carry `#N`* — declared, not hidden. (5) *Two suites fail* — reproduced at base on this host; CI is the authority. (6) *"not load-bearing" is only true on the fixtures* — the record says "on the fixtures" / "the suite stays green". (7) *The static-import control rewrite is a code change to a control after it was proven* — re-proven red on the same mutation after the rewrite.

## Pre-implementation expert reviews (from the dispatch preamble)

| Expert | Consulted | Verdict | Reference |
|---|---|---|---|
| /compliance-officer | 2026-09-07 | PASS — 25 %, narrative moves to the record, ID-set census AC | issue #73 § Expert Assessments |
| /tech-expert | 2026-08-31 | PASS | issue #73 § Expert Assessments |
| /security-expert | N/A — fast-path | ReDoS surface unchanged (22 OK) | issue #73 § Expert Assessments |
| /tech-ops-expert | N/A — fast-path | no dependency, no CI change | issue #73 § Expert Assessments |

## Downstream impact

- No symbol created, moved, exported or deleted; no contract changed; every regex literal byte-identical.
- `docs/compliance/redaction-record.md` is now the home of the review-finding index and the known-limitation notes; a future pattern change should update its § 3–5 row and the `COMPLIANCE:` header pointer, not re-grow the source docblock.
- New observed recall gap recorded (record § 5): a double-spaced UK NINO is not extracted from free text — a `needs-triage` candidate for the founder, not fixed here.
- The `scripts/__tests__` load failure on this host (both `.mjs` suites) predates this branch; if it also fails on the CI runner it is a PR-2 follow-up, not a PR-3 one.

## Code Review (left blank — dispatcher populates after SD-002 review)

- Verdict: pending dispatcher review

→ `/project-manager` for SD-002 review; do not merge from here.
