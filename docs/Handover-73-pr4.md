# Handover: #73 PR-4 — perf budgets measured and reported, not gating

**Date:** 2026-09-08 · **Branch:** `fix/73-pr4-perf-budgets-measured` off `main` @ `2154652` · **PR:** #82 · **Developer:** Claude Code (`/developer`) · founder ruling 4 (programme#126)

## What changed

| Commit | Subject |
|---|---|
| `d0bf665` | test(#73): perf budgets measured and reported, not gating |
| `01b45e5` | docs(#73): stop calling the wall-clock measurement a gate |

**The class:** *a wall-clock mean of a fixed workload asserted against a millisecond threshold.* Two members, both converted:

- `locale-patterns.test.ts` — `expect(mean).toBeLessThan(10)` removed. The assertion that kept the CI `test` job red on every branch since 2026-04-28.
- `pii-middleware.test.ts` — `expect(mean).toBeLessThan(20)` removed. Same shape, currently green, same defect.

Workload, warm-ups, 10-run mean and both workload-size preconditions survive (`prompt.length`, `totalRedactableBytes`, each 9 000–12 000), so neither test is assertion-free and the printed figure always describes the same ~10 KB input. Each writes a `[measured]` line, attributed to its file by vitest:

```
[measured] sanitizePii regex-only: mean 5.039 ms over 10 runs on a 10164-char prompt
[measured] piiMiddleware.transformParams end-to-end: mean 0.772 ms over 10 runs on 10824 redactable chars
```

Titles/comments now read `— measured throughput (reported, not gating)`; neither claims a budget is enforced.

**Not touched:** `ner-engine.test.ts:76` `expect(dt).toBeLessThan(50)` — a wall-clock proxy for module absence; different class, issue #81.

## Census and classification

`grep -rn -i "10 ?ms\|10ms\|perf\|budget" README.md docs CLAUDE.md src` → 40 hits. That pattern under-covers: a second pass over `benchmark\|wall-clock\|flake` found one more live claim it misses entirely (`CLAUDE.md:16`).

| Hit | Class | Action |
|---|---|---|
| `README.md:285` "the performance assertion remains green at the v1.1 gate" | **false since 2026-04-28** | Rewritten: what is measured, by which tests, where it prints, that it is not enforced, and why a wall-clock threshold on a shared runner reports host load, not a regression |
| `CLAUDE.md:16` "a wall-clock benchmark that reads host load as a failure" | **would become false** | Rewritten — no threshold remains that can fail |
| `redaction-record.md:182` (IMP-1) | **names the old describe/it titles verbatim** | Retitled; states the assertion was removed and why |
| `docs/adr/004:184` sync row "Existing v1.1 gate, unchanged" | **calls it a gate** | Amendment below the table. Claim checked by enumerating every `toBeLessThan` in the suite: the other rows are not test-enforced |
| `README.md:208,308`; `adr/003:104,105,112,122`; three fixture strings | **unrelated** — hardening budget, cold-start budget for a *rejected* engine, fixture prose | None |
| `Handover-*.md` (17 hits, 9 files) | **history** — true when written | None; a handover is a log |

## Proof

| Gate | Before (`main` @ `2154652`) | After (`01b45e5`) |
|---|---|---|
| `npx vitest run` (host) | `Test Files 3 failed \| 16 passed (19)` · `Tests 1 failed \| 407 passed (408)` | `Test Files 2 failed \| 17 passed (19)` · `Tests 408 passed (408)` |
| CI `test` job | run [34130558490](https://github.com/kgn-git/ai-privacyutils/actions/runs/34130558490) `failure`: `Tests 1 failed \| 449 passed (450)`, 25.547 ms vs `<10` | run [34187484246](https://github.com/kgn-git/ai-privacyutils/actions/runs/34187484246) **`success`**, all six jobs green: `Test Files 19 passed (19)` · `Tests 450 passed (450)`. Measured 15.866 ms — **the old assertion would have gone red on this run too**, on runner speed, with `src/` unchanged |
| `npm run lint` / `npm run build` | — | both clean, no output |

**No test deleted:** 408 → 408 on the host, 450 → 450 on CI. Both remaining host failures are *file-load* failures contributing zero tests — the two `scripts/__tests__` suites, pre-existing #79, Windows-only. They load on CI, which is why CI collects 450 and the host 408.

## Reviewable state

- Gates green on the branch: lint ✅ · build ✅ · full suite ✅ 408/408
- TDD: N/A — only assertions removed and prose rewritten. The RED control is the inverse and is on record: the removed assertion is the one failing on `main` and on run `34130558490`
- Tests removed: **None.** Two assertions removed inside two surviving tests
- Branch pushed, PR [#82](https://github.com/kgn-git/ai-privacyutils/pull/82) opened against `main`, CI polled to completion (via `gh run list`, not `gh pr checks --watch`) and quoted in the PR body
- SD-037 / SD-039 / `## What Users See`: N/A — `src/*.ts` byte-identical; only `src/__tests__/**` and docs changed

## Downstream Impact

- **PR-5** turns README § Known Limitations into a pointer at the compliance record. The paragraph rewritten at `README.md:285` sits *inside* that section, and the facts it now carries are **not** in the record: which two tests measure, that the figures are printed rather than gated, and why. Deleting it without moving those three into the record first is a deleted fact, not a moved one.
- **Symbols created/exported/deleted:** none — no `src/*.ts` file changed. No ordering constraint beyond the body's PR-4-before-PR-5. `redaction-record.md` § 4 IMP-1 was the only doc naming these tests by title; updated here.

## Sceptic self-critique

1. *"You removed the repo's only performance regression detector."* Partly true, and the real cost — but it was not detecting regressions. It fired on runner speed (25.5 ms and 15.9 ms on two quiet CI runners, 14.5 ms host in parallel, ~5 ms alone) and was red on every run for four months: a signal nobody reads. A working detector needs a baseline and a variance model, not a literal — outside this unit's scope.
2. *"A test with no assertion on its subject is vacuous."* Not vacuous — the workload-size assertions still fail on fixture drift. But its *purpose* is now reporting, and the titles say so rather than implying a check.
3. *"`process.stdout.write` instead of `console.log` is lint evasion."* It is: `no-console` is `warn` allowing only `warn`/`error`, and `eslint src` covers `src/__tests__`. `console.warn` would put a measurement on stderr; `console.log` would add warnings to a job whose point here is a clean signal. Verified it prints under vitest before committing — the lines above are measured, not predicted.
4. *"Will the `test` job actually go green, or do other failures follow?"* Predicted from the producer's record — run `34130558490` collected 450 tests with the scripts suites passing and the **only** failure was the 10 ms assertion — then confirmed by running it: `34187484246`, 450/450.
5. *"Touching an ADR is scope creep."* ADR 004 § 11 is a live contract table, not narrative, and its sync row calls the number a gate — the class the ruling targets. Amended below the table rather than editing the row, so the 2026-04-30 decision stays readable as decided.

## Handover To

→ dispatcher for SD-002 review (`## Code Review` left blank per amended SD-002), then PR-5.
