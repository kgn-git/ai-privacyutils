# Handover: #73 PR-4 — perf budgets measured and reported, not gating

**Date:** 2026-09-08 · **Branch:** `fix/73-pr4-perf-budgets-measured` off `main` @ `2154652` · **PR:** #82 · **Developer:** `/developer` · founder ruling 4 (programme#126)

## What changed

**The class:** *a wall-clock mean of a fixed workload asserted against a millisecond threshold.* Two members, both converted:

- `locale-patterns.test.ts` — `expect(mean).toBeLessThan(10)` removed. The assertion behind the red CI `test` job: **no CI run in this repo's retained history ever succeeded before this branch** (113 runs back to 2026-04-19; two successes, both here). It was already failing on 2026-04-20 and 2026-04-27, before the 2026-04-28 date inherited from #73's body; those logs have expired, so the earlier cause is unverifiable.
- `pii-middleware.test.ts` — `expect(mean).toBeLessThan(20)` removed. Same shape, currently green, same defect.

Workload, warm-ups, 10-run mean and both workload-size preconditions survive (`prompt.length`, `totalRedactableBytes`, each 9 000–12 000), so neither test is assertion-free. Each writes a `[measured]` line:

```
[measured] sanitizePii regex-only: mean 5.039 ms over 10 runs on a 10164-char prompt
[measured] piiMiddleware.transformParams end-to-end: mean 0.611 ms over 10 runs on 10824 redactable chars
```

**Not touched:** `ner-engine.test.ts:76` `expect(dt).toBeLessThan(50)` — a wall-clock proxy for module absence; different class, #81.

## Census and classification

`grep -rn -i "10 ?ms\|10ms\|perf\|budget" README.md docs CLAUDE.md src` → 40 hits; a second pass over `benchmark\|wall-clock\|flake` caught one it misses (`CLAUDE.md:16`).

| Hit | Class | Action |
|---|---|---|
| `README.md:285` "assertion remains green at the v1.1 gate" | **false for the whole retained history** | Rewritten: what is measured, by which tests, where it prints, and why it is not enforced |
| `CLAUDE.md:16` "a benchmark that reads host load as a failure" | **would become false** | Rewritten: the two figures are reported; the surviving threshold (`ner-engine.test.ts:76`, #81) is named and the run-it-alone instruction kept |
| `redaction-record.md:182` (IMP-1) | **names the old titles verbatim** | Retitled; states the assertion was removed and why |
| `docs/adr/004:185` sync row "Existing v1.1 gate, unchanged" | **calls it a gate** | Amendment below the table; every `toBeLessThan` enumerated — no other row is test-enforced. The row also read `<20 ms` where the sync assertion was `<10 ms`: **pre-existing**, corrected while open |
| `README.md:208,308`; `adr/003:104,105,112,122`; three fixture strings | **unrelated** | None |
| `Handover-*.md` (17 hits, 9 files) | **history** | None; a handover is a log |

## Fix round 1 (SD-002 FIX FIRST)

The reviewer proved `totalRedactableBytes = partText.length * 3` was a hand-held duplicate of what `buildParams()` builds: dropping one of three text parts left the test **green**, still printing 10824. It is now derived by walking the built params and summing the text parts `redactPart` redacts. Re-perturbed: **RED**, `expected 7216 to be greater than 9000`; reverted, figure still 10824. Also fixed: the blank line breaking ADR § 11's table, `CLAUDE.md:16`, the PR-5 flag below, the stale "benchmark's".

## Proof

| Gate | Before (`main` @ `2154652`) | After |
|---|---|---|
| `npx vitest run` (host) | `Tests 1 failed \| 407 passed (408)` | `Tests 408 passed (408)` |
| CI `test` job | run [34130558490](https://github.com/kgn-git/ai-privacyutils/actions/runs/34130558490) `failure`, 25.547 ms vs `<10` | run [34187484246](https://github.com/kgn-git/ai-privacyutils/actions/runs/34187484246) **`success`**, six jobs green, `Tests 450 passed (450)` at 15.866 ms — **the old assertion would have gone red here too**, on runner speed, `src/` unchanged |

**No test deleted:** 408 → 408 on the host, 450 → 450 on CI. The two remaining host failures are *file-load* failures contributing zero tests (`scripts/__tests__`, pre-existing #79, Windows-only); they load on CI, hence 450 there and 408 here.

## Reviewable state

- Gates green: `npm run lint` ✅ · `npm run build` ✅ · full suite ✅ 408/408
- TDD: the fix round has a RED-then-GREEN transcript (above). The conversion's RED control is its inverse — the removed assertion is the one failing on `main` and on run `34130558490`
- Tests removed: **None.** Two assertions removed inside two surviving tests
- CI polled via `gh run list`, never `gh pr checks --watch`; quoted in the PR body
- SD-037 / SD-039 / `## What Users See`: N/A — `src/*.ts` byte-identical

## Downstream Impact

- **PR-5** makes README § Known Limitations a pointer at the compliance record, deleting `README.md:285`. Three of its facts are **absent from the record today** and must move into § 4 / § 5 first, or PR-5 deletes a fact while proving it moved one. Each checked against the record, not assumed:
  1. the removed threshold **values** — `<10 ms` on `sanitizePii`, `<20 ms` on the middleware. Nowhere in the record;
  2. that **`locale-patterns.test.ts` carries the regex-only measurement at all**. The rows naming that file (R1, MIN-2) are about patterns, not timing; IMP-1 is the only timing row and it names the middleware test;
  3. **where a reader finds the figures** — `npm test` output and the CI `test` job log.

  Already in the record, no move needed: that the middleware figure prints, and why it is not gated — both at `redaction-record.md:182`. That is the whole move-then-delete list.
- **Symbols created/exported/deleted:** none. No ordering constraint beyond PR-4-before-PR-5.

## Sceptic self-critique

1. *"You removed the repo's only performance regression detector."* It was not detecting regressions: it fired on runner speed (25.5 and 15.9 ms on two quiet CI runners, ~5 ms host alone) and was red on every recorded run. A real detector needs a baseline and a variance model, not a literal.
2. *"A test with no assertion on its subject is vacuous."* Not for `locale-patterns.test.ts` — `prompt.length` is the measured object. For the middleware test that is **only true after fix round 1**: as first written the size guard restated arithmetic and could not fail.
3. *"`process.stdout.write` over `console.log` is lint evasion."* It is: `no-console` is `warn` allowing only `warn`/`error` over `src/**`, and `console.warn` puts a measurement on stderr.
4. *"Will the `test` job go green?"* Predicted from run `34130558490`'s own record — 450 collected, the 10 ms assertion the only failure — then confirmed by running it.
5. *"Touching an ADR is scope creep."* § 11 is a live contract table whose sync row calls the number a gate — the class the ruling targets. Amended below the table, leaving the decision as decided.

## Handover To

→ dispatcher for the scoped SD-002 re-review of the fix diff, then PR-5.
