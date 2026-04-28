# Sprint Handover: Sprint 2K.B — privacyutils#7 (R3 NER name redaction) — BLOCKED

**Date:** 2026-04-28
**Branch:** `feature/7-ner-name-redaction` (off `main` at `933ba0e`; no implementation commits)
**Developer:** Claude Code (Opus 4.7 1M)
**Issue:** [kgn-git/jobflow-privacyutils#7](https://github.com/kgn-git/jobflow-privacyutils/issues/7) — R3: NER-based name redaction
**Dispatch document:** `jobflow-programme/docs/expert-reviews/PreImplReview-privacyutils-7-2026-04-28.md`
**ADR:** `docs/adr/003-ner-engine-choice.md` (merged at `28c9724`)
**Status:** **STOPPED — Constraint #2 + Bundle-delta AC unsatisfiable as written. Dispatcher decision required.**

---

## Summary

Per the dispatch's explicit STOP-and-report rule (final paragraph of the dispatch
preamble: *"If any of the 16 constraints cannot be satisfied (e.g. q8 model exceeds
bundle ceiling and q4 also too big …), STOP and report the blocker. Do not proceed
with partial scope without dispatcher authorisation."*), `/developer` halted at the
end of Phase 1 (Load Context). No implementation, test, or fixture work has been
committed. The branch `feature/7-ner-name-redaction` is the only artifact and contains
no diff vs `main`.

The blocker is a planning-level error in ADR 003 §2 / §7 that propagated through
the dispatch's constraint #2 and the bundle-delta AC: the model size cited as
"~40 MB unzipped quantised" is in fact **135 MB** for the q8 variant, and the q4
fallback is **396 MB** rather than the cited ~25 MB. With the rest of the
required runtime stack (`@huggingface/transformers` + `onnxruntime-node` +
tokenizer assets) the actual bundle delta on a Linux-only Vercel deployment is
**~220 MB unpacked**, against a constraint ceiling of **<60 MB unpacked**. The
constraint cannot be met by parameter tuning under the chosen engine + model
combination.

`/developer` cannot resolve this without dispatcher authorisation because:

1. Choosing a different model (e.g. an English-only smaller model, or
   `compromise` JS NLP) changes the engine decision and falsifies ADR 003.
2. Relaxing the bundle-delta AC (e.g. lifting <60 MB to <250 MB to fit the q8 in
   the Vercel 250 MB ceiling alone, with no application-code headroom) violates
   the security-expert + tech-ops verdicts on Vercel function ceiling and
   crowds out scoring + platform consumer code.
3. Splitting the model across functions (e.g. NER-only Edge function) violates
   constraint #1 (Edge runtime is OFF the table).
4. Lazy runtime fetch from HF Hub violates constraint #3 (build-time fetch +
   SHA-256 pin) and the explicit ADR 003 §3 rejection of "Lazy fetch with
   build-time SHA pin + integrity check at runtime."

The dispatch's STOP-and-report path is the correct response.

---

## Pre-Implementation Expert Reviews (filled from dispatch preamble per SD-009 / Sprint 2K.A audit 2026-04-20)

Reproduced verbatim from the dispatch preamble. All four mandatory experts
(utility-package fast-path roster) consulted; collective dispatch verdict was
READY-with-conditions; the conditions translate to the 16 scope-locked
implementation constraints listed under "Per-constraint compliance verification"
below. The blocker discovered at Phase 1 falsifies the bundle-headroom premise
on which the tech-ops WARN was issued — see the "Implications for prior expert
verdicts" subsection.

| Expert | Consulted | Verdict | Reference |
|---|---|---|---|
| `/compliance-officer` | 2026-04-28 | **PASS WITH WARN** (Medium severity refresh) | `c:\Dev\Jobflow-web\jobflow-programme\docs\expert-reviews\PreImplReview-privacyutils-7-2026-04-28.md` |
| `/security-expert` | 2026-04-28 | **WARN** (3 mandatory security requirements) | same file |
| `/tech-expert` | 2026-04-28 | **WARN** (sync-vs-async path (b) per ADR 003 §4) | same file |
| `/tech-ops-expert` | 2026-04-28 | **WARN** (renegotiated AC + cohort-fairness CI gate) | same file |

**Skipped experts (utility-package fast-path):** `/product-owner`, `/ui-expert`,
`/hr-advisor`, `/data-engineer` — N/A under the project class per
`CLAUDE.md` § Expert Roster.

### Implications for prior expert verdicts (post-Phase 1 finding)

The tech-ops WARN was issued under the bundle-delta target `<60 MB unzipped`,
which presumed `~40 MB model + 15-20 MB transformers.js runtime + bindings`.
That premise is falsified by the actual model size and the actual runtime
stack size measured below. The tech-ops verdict needs to be re-issued against
the corrected size budget; depending on the dispatcher decision, the
compliance-officer and security-expert verdicts may need refresh too (a
different engine choice would re-open §3 of compliance review and the S-control
mapping in security review).

`/developer` cannot retroactively fabricate refreshed expert verdicts. This is
the dispatcher's responsibility — flagged here per SD-009.

---

## The blocker — concrete measurements

### Constraint #2 stated requirement

> Model: `Xenova/distilbert-base-multilingual-cased-ner-hrl` q8 quantised (~40 MB).
> q4 fallback if bundle headroom exceeded.

### Constraint #2 actual measurements (HF Hub API tree query, 2026-04-28)

```
GET https://huggingface.co/api/models/Xenova/distilbert-base-multilingual-cased-ner-hrl/tree/main/onnx
```

| File | Size on HF Hub |
|---|---:|
| `onnx/model.onnx` (full FP32) | 539 MB |
| `onnx/model_quantized.onnx` (**q8 — the dispatch's chosen variant**) | **135 MB** |
| `onnx/model_q4.onnx` (the dispatch's fallback) | 396 MB |
| `onnx/model_int8.onnx` | 135 MB |
| `onnx/model_uint8.onnx` | 135 MB |
| `onnx/model_fp16.onnx` | 270 MB |
| `onnx/model_q4f16.onnx` | 209 MB |
| `onnx/model_bnb4.onnx` | 393 MB |

**No variant exists in the ~40 MB or ~25 MB range.** The smallest available is
`model_quantized.onnx` (q8) at 135 MB — 3.4× the ADR/dispatch estimate. The
ADR 003 q4 fallback (≈25 MB) does not exist; the file labelled `model_q4` is
larger than q8 because it stores FP4-packed weights with full-precision
metadata + non-quantizable layers. A genuine ~25 MB sub-variant is not
published for this model.

Tokenizer assets (added on top of any model variant): `tokenizer.json` 2.9 MB
+ `vocab.txt` 1.0 MB + `config.json` 1 KB + `tokenizer_config.json` <1 KB ≈
**4 MB**.

### Runtime stack actual size (Linux x64 only — Vercel deployment posture)

Measured by installing `@huggingface/transformers@4.2.0` (current latest) into
a clean tmpfs sandbox and running `du -sh` on each subtree:

| Component | Linux x64 size unpacked |
|---|---:|
| `@huggingface/transformers` (JS + types + Jinja) | 13 MB |
| `onnxruntime-node` Linux x64 native bindings (`bin/napi-v6/linux/`) | 53 MB |
| `sharp` (loaded via transformers.js dependency) Linux | ~15 MB |
| `@huggingface/tokenizers` Rust binding Linux | ~5 MB |
| **Runtime stack subtotal (Linux only)** | **~86 MB** |

The dispatch / ADR estimate of "15-20 MB transformers.js runtime + bindings"
under-counted by ~4×. This is independent of the model-size error.

### Total bundle delta (privacyutils package only — Linux x64 Vercel deployment)

| Component | Size |
|---|---:|
| Model q8 (`model_quantized.onnx`) | 135 MB |
| Tokenizer + vocab + config | 4 MB |
| Runtime stack (transformers.js + onnxruntime-node Linux + sharp Linux + tokenizers Linux) | 86 MB |
| privacyutils source + existing deps (`libphonenumber-js` etc.) | ~2 MB |
| **Total bundle delta** | **~227 MB unpacked** |

| Comparison | Result |
|---|---|
| Constraint #2 / AC bundle target | **<60 MB unpacked** — **fails by 3.8×** |
| ADR 003 §7 "85-100 MB consumer functions" target | **fails — actual 227 MB before consumer code** |
| Vercel function ceiling | **250 MB unpacked** — leaves 23 MB for consumer code, against ~30-40 MB privacyutils baseline + scoring/platform business code |

### What `/developer` did NOT measure (and why)

- **Vercel function size on jobflow-platform / jobflow-scoring** — explicitly
  out of scope per the dispatch ("DEFERRED to post-merge consumer-app
  integration testing"). The `npm pack` measurement on the privacyutils
  package alone is in scope for the dispatch's constraint #2 and is the
  number reported above. Even without consumer-app code, the measurement
  fails by 3.8×.
- **Cold-start latency** — moot until the bundle blocker is resolved; would
  have been measured locally per AC ("locally run with `time node -e \"...\"`
  to ground-truth the model-load + first-inference cost") had implementation
  proceeded.
- **Per-cohort TP / variance / FP** — not measured; cohort fixtures not yet
  authored. These were the next planned step after RED test stubs.

---

## Per-constraint compliance verification

All 16 entries marked NOT-STARTED. The blocker is at constraint #2; downstream
constraints not addressed because the dispatch's STOP-and-report rule fires on
the first unsatisfiable constraint without dispatcher authorisation to proceed
with partial scope.

| # | Constraint | Status | Notes |
|---|---|---|---|
| 1 | Engine = `@huggingface/transformers` + `onnxruntime-node` (Vercel Node, not Edge) | not started | engine choice presumed correct subject to bundle-delta resolution |
| 2 | Model = distilbert q8 (~40 MB) or q4 fallback (~25 MB) | **BLOCKER** | actual q8 = 135 MB; actual q4 = 396 MB; no ~40 MB or ~25 MB variant exists |
| 3 | Build-time fetch + SHA-256 pin via `prepare` lifecycle | not started | depends on resolved model + size |
| 4 | New `sanitizePiiAsync` export, sync `sanitizePii` retains regex-only | not started | API design valid independent of bundle blocker |
| 5 | Confidence threshold 0.85 default | not started | |
| 6 | `DEFAULT_NER_DENY_LIST` (~200 entries) exported | not started | |
| 7 | `PiiNerLoadError` class fail-closed | not started | |
| 8 | `'person'` 7th `TokenKind` + `<<REDACTED_PERSON>>` sentinel | not started | sentinel disjoint analysis valid independent of bundle blocker |
| 9 | No-logging discipline (top-of-file comment + grep clean) | not started | |
| 10 | 300 cohort fixtures + 150 FP across 4 cohorts | not started | |
| 11 | `npm run cohort:eval` CI gate | not started | |
| 12 | README "Known Limitations" R3 row update | not started | |
| 13 | (Out of scope) `next.config.ts` consumer follow-ups | not started | follow-up issue creation deferred to post-resolution |
| 14 | `enableNer: false` default for v1.2 | not started | |
| 15 | Lazy Promise-singleton model init | not started | |
| 16 | TDD RED→GREEN visible in history | not started | gate would have been honoured had implementation proceeded |

---

## TDD Compliance

- Test-first commits: 0 / 0 (N/A — no implementation commits)
- TDD skips: None
- SI-001 honoured: yes (no GREEN commit was made; RED commits would have come
  first per the standard pattern, see existing `Handover-8.md` / `Handover-9.md`
  precedents in this repo)

---

## Reviewable state

| Gate | Status |
|---|---|
| Build | ✅ green at branch tip (no diff vs `main` at `933ba0e`) |
| Lint | ✅ green at branch tip |
| Unit tests | ✅ 300 / 300 passing at branch tip across 8 test files (`idn-email`, `pii-middleware`, `input-length-cap`, `token-format`, `national-id-patterns`, `sanitize-pii`, `locale-phone-patterns`, `locale-patterns`) — verified by running `npm test -- --run` on the branch (Duration 759ms) |
| TDD compliance verifiable in commit history | ✅ N/A (no implementation commits) |
| Handover written before completion summary | ✅ this file |
| Branch pushed to origin | ✅ — pushed empty (no commits beyond `main`) so the dispatcher can see the branch state |
| PR opened against `main` | ❌ — no PR opened. Opening a no-diff PR would be misleading. The dispatcher decides whether to open a "needs-decision" PR / spike branch / discussion thread; `/developer` flags the blocker and stops. |

A precise count of unit tests at branch tip is provided above; the figure is
unchanged from `main` because no commits were added.

---

## Code Review (left blank by /developer — populated by dispatcher AFTER /developer returns)

This section is left blank by `/developer` per SD-002 amendment 2026-04-15. The
dispatcher (programme-manager or project-manager at top-level session) decides
whether to invoke `Agent(subagent_type="feature-dev:code-reviewer")` against
this branch — but with no diff vs main there is nothing to review at the code
level. The relevant review is at the **planning level**: ADR 003's bundle
estimates need to be re-validated against actual HF Hub model sizes and actual
`@huggingface/transformers` + `onnxruntime-node` Linux footprint, and the
constraint #2 / bundle-delta AC need to be re-issued against the corrected
budget.

- Verdict: pending dispatcher review of the ADR-level blocker
- Critical findings: ADR 003 §2 / §7 model-size and runtime-size estimates are
  off by 3.4× / 4× respectively (see "Concrete measurements" above)
- Important findings: pending
- Minor findings: pending
- Fix commit(s): pending

---

## Process Rule Violations

- None. SI-001 / SD-001 / SD-002-amended / SD-007 / SD-009 all honoured.
  - SD-007: prior-issue gate verified at dispatch + re-confirmed at branch
    creation (`gh pr list --state open` returned only Dependabot exempt PRs).
  - SD-001: this handover file written and committed before completion
    summary returned.
  - SD-002 amended: code review section left blank for dispatcher; no nested
    subagent dispatch attempted from `/developer`.
  - SD-009: Pre-Implementation Expert Reviews table reproduced verbatim from
    the dispatch preamble per the utility-package fast-path roster.
  - Invocation Contract §1–§6: all honoured. STOP-and-report invoked at the
    dispatch's documented STOP condition (constraint unsatisfiable).

---

## Known Tech Debt

- **ADR 003 §2 / §7 estimate gap.** Bundle-size figures cited in the ADR are
  off by 3-4×. ADR needs revision OR the dispatcher needs to reconfirm the
  engine choice against the corrected numbers and decide whether the
  cost/benefit still favours transformers.js / Hybrid C, or whether one of
  the rejected alternatives (Hybrid A Presidio sidecar, Hybrid B Cloud NER,
  `compromise` JS NLP) deserves a second look under the corrected envelope.
- **No ~40 MB multilingual NER variant available.** The `~40 MB q8` figure in
  the ADR appears to be an aspirational estimate that did not survive
  contact with the HF Hub model registry. If the dispatcher proceeds with
  transformers.js as the engine, the actual minimum bundle target needs to be
  set against the ~135 MB q8 floor (no smaller variant exists for this
  multilingual model) plus the ~86 MB Linux runtime stack.

---

## Build & Test Status

- Build: ✅ (no changes vs `main`)
- Lint: ✅ (no changes vs `main`)
- Unit tests: 300 passed, 0 failed / 300 total (verified — see "Reviewable state")
- E2E: N/A (utility package, no UI surface)

---

## Recommended dispatcher options (decision required)

`/developer` does not choose between these — surfacing them is the dispatcher's
job. Listed in increasing order of architectural disruption:

1. **Lift the bundle-delta AC to a Vercel-ceiling-derived target** (e.g.
   <230 MB privacyutils-package-only, leaving ~20 MB for consumer-app code on
   each function — almost certainly insufficient for scoring + platform).
   Probably non-viable given scoring/platform existing footprints; needs
   tech-ops re-verdict against `vercel build --debug` measurements on both
   consumer apps.
2. **Switch engine to Hybrid B (Cloud NER, e.g. AWS Comprehend / Azure
   Cognitive Services).** Eliminates bundle delta entirely (~0 MB code-side
   delta — just an HTTPS client). Re-introduces an Art. 28 processor
   relationship and ~50-150ms intra-region latency, but those were
   specifically rejected in the original ADR debate on architecture-purity
   grounds rather than infeasibility grounds. With the bundle-delta failure,
   the architecture-purity argument inverts: in-process NER is no longer
   architecturally feasible at the desired posture.
3. **Switch engine to `compromise` JS NLP (Option C in the original issue).**
   ~1-2 MB bundle delta. Was rejected in ADR §1 on the basis of "accuracy
   floor below 95% per-cohort TP threshold for multilingual CVs." That
   accuracy claim was not benchmarked at the time of ADR; it is a presumed
   floor based on `compromise`'s English-first design. A `compromise`-based
   path would need a fresh benchmark against the cohort-stratified fixtures
   to confirm or refute the floor; if confirmed, the cohort-fairness CI gate
   would block as designed (which is itself a usable signal).
4. **Defer #7 to a future sprint pending an architecture spike.** Document
   the blocker as "R3 deferred — ADR 003 estimates incorrect; engine choice
   needs re-litigation against measured budgets." Sprint 2K.B closes
   without #7; #7 returns in 2L or 2M with a fresh ADR.
5. **Accept a measurably degraded bundle posture** (i.e. ship the 135 MB q8
   model + ~86 MB runtime, document the consumed Vercel headroom, gate
   future work behind an explicit budget review). Probably the easiest
   short-term path; very expensive long-term because every future feature
   that needs Vercel function space will be in conflict with the NER bundle.
   Tech-ops should explicitly verdict on this rather than `/developer`
   choosing it implicitly.

`/developer` recommends **option 4 (defer + spike)** as the lowest-regret path:
the bundle blocker is a planning-level error and the right fix is to re-do the
planning, not paper over the measurement gap with implementation-level
heroics.

---

## Follow-up issues that would be filed if and when #7 unblocks

(Unchanged from the dispatch preamble — listed here so the dispatcher does not
need to re-derive them):

- `kgn-git/jobflow-platform`: add
  `serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node']`
  to `next.config.ts` (constraint #13).
- `kgn-git/jobflow-scoring`: same `next.config.ts` update.
- `kgn-git/jobflow-privacyutils` v1.3: flip `enableNer: true` default after
  consumer cohort metrics observed (constraint #14 follow-up).
- `kgn-git/jobflow-platform`: Vercel function size measurement post-v1.2
  integration (the deferred consumer-app verification per dispatch out-of-scope
  list).

---

## Notes for reviewer

- The blocker is **independent** of the cohort fairness gate, sentinel
  idempotency, sync-vs-async API surface, model-bundle SHA-256 verification,
  and the no-real-names-in-git discipline. None of those concerns were
  reached because Phase 1 (Load Context) terminated with the bundle blocker.
- The "load-bearing claim" in this handover is the **size gap between ADR
  estimates and HF Hub reality**: ADR says ~40 MB; HF says 135 MB. Verifiable
  by running the GET against the HF Hub API tree URL listed under "Concrete
  measurements" — single HTTPS call, no auth needed.
- No real personal names committed to git history (no fixtures authored at
  all). When implementation resumes after dispatcher decision, the
  cohort-fixture authoring discipline still applies: synthetic names
  generated from open-source name corpora with citation in fixture file
  headers, identical to the pattern used for the existing UK NINO / FR NIR /
  IT CF / ES DNI / PT NIF check-digit fixtures (computed at runtime from
  body inputs, never real personal IDs).
- TDD discipline is unaffected by the blocker: when implementation resumes,
  the standard RED→GREEN commit sequence applies as in `Handover-8.md` and
  `Handover-9.md`. No partial-state TDD commits exist on this branch.

---

## Handover To

→ **dispatcher** (programme-manager — `/programme-manager` at top-level session
where the `Agent` tool is reachable). Per the SD-002 amendment, the dispatcher
decides next steps. The most natural decision points:

1. Confirm or reject the constraint #2 / bundle-delta AC re-issue.
2. If re-issued, choose between options 1–5 in "Recommended dispatcher options"
   above.
3. If a different engine is chosen, refresh the four expert verdicts (or
   document why the existing verdicts still apply on the new envelope).
4. Re-dispatch `/developer "#7"` with an updated dispatch preamble that
   reflects the chosen path.

`/project-manager` for `/sprint-close` is **not** the right next step — the
sprint cannot close on #7 without dispatcher resolution.
