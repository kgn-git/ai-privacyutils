# ADR 003 — NER engine choice for PERSON-name redaction (transformers.js / Hybrid C)

**Status:** Accepted (v1.2, Sprint 2K.B target, issue #7)
**Date:** 2026-04-28
**Context ref:** Pre-implementation expert review for issue #7 (2026-04-28); compliance review §R3 (v1.0.0, 2026-04-19); design review 2026-04-28 (Presidio vs in-process)

## Context

Compliance review §R3 flagged that the applicant's full name in the CV header flows unredacted to OpenAI on every LLM call. Regex is structurally wrong for proper-noun detection in CVs — a CV is a list of proper nouns (company names, university names, project names, referees) and any regex that matches `[A-Z][a-z]+\s[A-Z][a-z]+` over-fires catastrophically. Issue #7 scoped Named Entity Recognition (NER) as the right tool.

The issue body listed three engine candidates: **A** Microsoft Presidio (Python sidecar), **B** transformers.js (Node-runnable BERT-family NER), **C** `compromise` (lightweight JS NLP). Each has different deployment, performance, and accuracy profiles.

A 2026-04-28 design review compared all three under the deployment topology constraint (Vercel serverless Node.js, two internal consumer apps, GDPR-only B2C consumer path, no Python infra). Both opposing positions converged on a **hybrid** recommendation. Hybrid B (cloud NER for PERSON only — Azure / AWS Comprehend) and Hybrid C (transformers.js in-process) were the two viable paths; Hybrid A (Presidio sidecar) was rejected on architecture grounds plus the conclusion that Presidio's strongest forward-looking argument — image PII redaction — is moot for the consumer projects' current scope (verified by code inspection: profile pictures pass through OpenAI moderation only at upload time, never on the LLM-text path; CV downloads embed photos as static DOCX `ImageRun` from object storage).

The user's roadmap signal favoured architecture preservation: stay in-process Node, no new processor relationship, no HTTP boundary. Hybrid C is the architecture-preserving choice and was anticipated as Option B in the original issue body.

## Decisions

### 1. Engine — `@huggingface/transformers` (transformers.js) + ONNX runtime via `onnxruntime-node`

**Chosen.** Runs in Node serverless, no Python, no separate process, no HTTP hop. Bundle delta is real (~55-60 MB unzipped per consumer function) but fits within the Vercel 250 MB function ceiling with measurable headroom. Native bindings via N-API (`onnxruntime-node`) are supported by Vercel Node runtime; the Edge runtime is explicitly out of scope (1 MB ceiling, no native bindings).

Considered alternatives:

- **(A) Microsoft Presidio sidecar** — rejected. Python-only deployment requires a separate microservice (Cloud Run / Fly / similar), adds 40-100ms typical latency over HTTP, introduces a new ops surface + sub-processor disclosure, and reopens the v1.0.0 audit lines (compliance review under new architecture, security review under microservice posture, S1/S2/S3 returning to scope). Image PII redaction — the strongest forward-looking argument — is moot for the consumer projects' current scope per the 2026-04-28 code inspection.
- **(C) `compromise` JS NLP** — rejected. Accuracy floor on multilingual CVs is below the 95% per-cohort TP threshold the compliance review imposes. Could function as a coarse pre-filter but cannot be the primary detector.
- **Cloud NER** (Azure Cognitive Services / AWS Comprehend `DetectPiiEntities` for PERSON only) — considered as Hybrid B during the tech debate. Same latency profile as Presidio (~50-150ms intra-region) without the ops surface, but introduces a new Art. 28 processor relationship and ties the package to a specific cloud vendor. Rejected in favour of in-process for architecture purity.

### 2. Model — `Xenova/distilbert-base-multilingual-cased-ner-hrl` (quantised q8)

**Chosen.** ~40 MB unzipped quantised. Multilingual coverage (matches the 4 cohort fairness obligation: Western European, Maghrebi/Arabic, East Asian transliterated, Slavic/Cyrillic transliterated). Trained for HRL (high-resource languages) NER, well-suited for CV proper-noun detection across the existing privacyutils locale set.

Considered alternatives:

- `Xenova/bert-base-multilingual-cased-ner-hrl` (~60 MB unzipped) — rejected for v1.2 on bundle-headroom grounds; reconsider in v1.3 if accuracy data shows distilbert is below threshold.
- `Xenova/bert-base-NER` (English-only, ~110 MB) — rejected. Multilingual coverage is mandatory per the cohort fairness compliance constraint.
- `Xenova/distilbert-base-multilingual-cased-ner-hrl` `q4` quantisation (~25 MB) — held in reserve. If `vercel build --debug` post-implementation shows either consumer function approaching 200 MB unzipped, switch to `q4`.

### 3. Bundle posture — build-time fetch + bundle (NOT lazy fetch from HF Hub at runtime)

**Chosen.** Model weights fetched at the package's `prepare` lifecycle hook (which runs on consumer-side `npm install` under the git-install pattern), SHA-256 verified against a constant in code, written to `dist/models/`. Consumers receive the model bundled with the package — no runtime HF Hub fetch.

Rationale: under reduced-tier security posture (S5/S6/S7/S11 active; S1/S2/S3/S8 deferred per `docs/INTEGRITY.md`), runtime egress to HuggingFace Hub is an unmonitored trust-boundary expansion that S1/S2/S3 deferral did not anticipate. Build-time bundle eliminates the surface entirely. SHA-256 pin protects against silent model substitution. If consumer infra blocks HF Hub egress (corporate proxy), failure surfaces at install time, not at first runtime call.

Considered alternatives:

- **Lazy fetch with build-time SHA pin + integrity check at runtime** — rejected. Silent failure at first `sanitizePii` call after a Vercel cold-start is observability-hostile.
- **Consumer-configured location** — rejected as over-engineering for v1.2; revisit if a consumer requires pre-cached weights distributed via their own CDN.

### 4. API surface — additive, NEW `sanitizePiiAsync` export (sync `sanitizePii` retains regex-only behaviour)

**Chosen.** The current `sanitizePii(text, options?)` returns `string` synchronously. NER inference is fundamentally async (model.forward returns a Promise). Two paths were considered:

- **(a) Make `sanitizePii` async** — rejected. Type-level breaking change for every existing caller, even those who don't enable NER. Forces a v2.0 major bump and disrupts the v1.0 byte-identical contract that has been load-bearing through v1.0 → v1.1 → v1.2.
- **(b) Add new async export `sanitizePiiAsync`; keep `sanitizePii` regex-only** — chosen. Backward-compat preserving (matches the v1.0 byte-identical contract precedent from ADR 001 / issue #9 tokenFormat). Existing consumers stay sync; new consumers opt into async via `sanitizePiiAsync` when they want NER. The middleware factory `createPiiMiddleware` already uses async `transformParams`, so the middleware path is unaffected — only direct callers of `sanitizePii` need to opt into async.

`PiiMiddlewareOptions` and a new `SanitizePiiAsyncOptions` extend the existing options bags with:

- `enableNer?: boolean` — default `false` for v1.2 (opt-in staged rollout). Flip to `true` in v1.3 once consumer-reported cohort metrics confirm fairness compliance.
- `nerConfidenceThreshold?: number` — default `0.85` per security-expert verdict. Multilingual BERT outputs are noisy below this threshold.
- `nerDenyList?: string[]` — default `DEFAULT_NER_DENY_LIST` (a curated list of ~200 well-known company / product / technology terms). Overrideable for advanced consumers.

The new `'person'` `TokenKind` joins the existing 6, with sentinel `<<REDACTED_PERSON>>` (verified pattern-disjoint from all 21 existing redaction patterns + the 5 national-ID regexes; idempotency invariant preserved).

### 5. Initialisation — lazy via Promise singleton

**Chosen.** First `sanitizePiiAsync` call in a Vercel function instance pays the model-load cost (~600-900ms typical, ~1.5s p99). All subsequent calls await the same resolved Promise. Module-scoped Promise singleton survives across requests within one warm function instance; reloaded on cold start.

Considered alternatives: eager init at module-import time (loads the model on every cold start regardless of whether NER is ever called — wasteful for code paths that import privacyutils but set `enableNer: false`). Rejected.

### 6. Fail-closed posture — `PiiNerLoadError`

**Chosen.** Mirrors `PiiInputTooLargeError` from ADR 002. If model load fails (HF Hub unreachable at build time, ONNX runtime incompatible, OOM), a typed `PiiNerLoadError extends Error` is thrown. Consumer can `catch` and decide whether to retry, fall back, or surface the error. The library does not silently degrade to regex-only — silent degradation is the security-fairness anti-pattern that compliance review §R3 explicitly flagged.

Consumers who want regex-only behaviour on a per-call basis explicitly set `enableNer: false`. The error surface is observable; degradation is not silent.

### 7. Performance contract — renegotiated AC envelope

The original issue #7 AC was `<50ms overhead per LLM call on 10KB prompt`. Tech-ops verdict 2026-04-28 confirmed this was unmeetable for transformers.js cold-start (typical 600-900ms model parse + ONNX warmup). The renegotiated contract:

| Dimension | Target | Rationale |
|---|---|---|
| Warm-call NER overhead | <80ms p95, <120ms p99 | Distilbert-class NER on 10KB CV input ≈ 30-80ms typical; absorbs CI variance |
| Cold-start (first call after Vercel cold-start) | <1.2s p95, <2s p99 | Model parse + ONNX runtime warmup dominates; B2C "click optimise → wait 2-5s" envelope absorbs |
| Per-cohort TP rate | ≥95% | Compliance fairness obligation |
| TP variance across cohorts | ≤5pp | Compliance fairness obligation — non-uniform redaction quality is Art. 9-adjacent |
| FP rate | ≤5% | Original issue AC retained |
| Bundle delta | <60 MB unzipped per consumer function | Vercel 250 MB ceiling with current ~30-40 MB privacyutils baseline; tight but fits |
| privacyutils middleware p95 with NER enabled | <150ms | Encompasses regex pipeline + NER inference + deep-clone overhead |

The total LLM round-trip is 800-3000ms (gpt-4o on a CV-sized prompt). 80-120ms of NER overhead is 3-15% of LLM round-trip — noticeable in p50, invisible in p99.

## Consequences

### Positive

- **#7 closed without architectural rewrite.** Stays in-process Node middleware on Vercel serverless; no new ops surface; no new sub-processor.
- **PERSON entity now redacted.** Closes the largest residual GDPR Art. 5(1)(c) gap in the LLM prompt path.
- **Cohort fairness obligation embedded in CI.** `npm run cohort:eval` blocks merge if per-cohort TP drops below 95% or variance exceeds 5pp. Compliance accountability under Art. 5(2) is automated, not procedural.
- **Backward-compat preserved.** Existing consumers' `sanitizePii(text)` calls continue to work byte-identical; NER is strictly additive via `sanitizePiiAsync` + middleware option.

### Negative / cost

- **Bundle headroom consumed.** Consumer functions go from ~30-40 MB unzipped to ~85-100 MB. Headroom shrinks from ~220 MB to ~150 MB. Future framework additions need to budget against this.
- **Cold-start latency budget extended.** Vercel cold-starts may visibly impact the first user-facing CV-optimisation request after a cold instance. Mitigation: stage rollout with `enableNer: false` for 7 days, observe production cold-start frequency.
- **Build-time model fetch.** Consumer `npm install` becomes network-dependent on first install (HF Hub). Documented in README; if HF Hub is unreachable, install fails at SHA-256 verification step (better than silent failure at runtime).
- **New binary asset shipping pattern.** `dist/models/` is a new precedent for the package. Documented in README + INTEGRITY.md (model SHA-256 alongside the existing tag-vs-SHA pinning guidance).
- **Cohort-stratified test fixtures are a maintenance commitment.** Quarterly review of the 4 cohort × 75 fixture set. Filed as a v1.3 follow-up.

### Risks

- **Model accuracy below threshold on rare cohorts.** Distilbert quantised may underperform on the Maghrebi or East Asian cohorts. Mitigation: cohort:eval CI gate fails the merge; fix is to either (a) switch to `bert-base-multilingual-cased-ner-hrl` non-quantised (+20 MB bundle), or (b) augment the deny-list with cohort-specific tech terms that are over-firing.
- **Vercel function size limit hit.** Concrete check before tag-cut: `vercel build --debug` on each consumer project with the v1.2 pin; if either function approaches 200 MB unzipped, switch to `q4` quantisation OR split the function.
- **`onnxruntime-node` native binding breaks on Vercel.** Verified compatible at writing time; future Vercel runtime changes may break. Mitigation: install-smoke step in privacyutils CI that asserts `await loadModel()` succeeds in a Node test.

## Rejected alternatives (full enumeration)

1. **Microsoft Presidio sidecar** (Hybrid A — Python via Cloud Run / Fly.io). Rejected on architecture-fit grounds: deployment topology mismatch with Vercel serverless Node, +40-100ms HTTP overhead, new ops surface, new sub-processor, would re-open Sprint 2K.A audit lines.
2. **Cloud NER for PERSON only** (Hybrid B — Azure Cognitive Services / AWS Comprehend `DetectPiiEntities`). Rejected: introduces new Art. 28 processor relationship, ties package to specific cloud vendor, ~50-150ms latency similar to Presidio without ops surface but with same processor-disclosure cost.
3. **`compromise` JS NLP** (#7 Option C). Rejected: accuracy floor below 95% per-cohort TP threshold for multilingual CVs.
4. **Make `sanitizePii` async (path (a) in §4)**. Rejected: type-level breaking change for every existing caller; would force v2.0 major bump and disrupt the v1.0 byte-identical contract.
5. **Eager model init at module import**. Rejected: wastes cold-start budget for code paths that don't enable NER.
6. **Lazy fetch model from HF Hub at runtime**. Rejected: silent failure at first call is observability-hostile; reduced-tier security posture didn't anticipate this trust boundary.
7. **Worker-thread isolation for NER inference**. Rejected for v1.2: bootstrap cost (~30-50ms) is comparable to inference itself; isolation benefit is minimal because the NER module has no shared state with the request handler beyond the read-only model object. Re-evaluate in v1.3 if per-call latency dominates.

## References

- privacyutils#7 — issue body (lists Options A/B/C as engine candidates)
- Pre-implementation expert review for issue #7 (2026-04-28) — full per-expert verdicts (compliance / security / tech / tech-ops)
- Compliance review §R3 (v1.0.0, 2026-04-19) — original compliance flag
- `docs/adr/001-token-format.md` — sentinel idempotency invariant precedent (issue #9)
- `docs/adr/002-input-length-cap.md` — fail-closed `PiiInputTooLargeError` pattern (issue #10) — `PiiNerLoadError` mirrors this
- `docs/INTEGRITY.md` — reduced-tier security posture (S5/S6/S7/S11 active; S1/S2/S3/S8 deferred); model SHA-256 will be added here at v1.2 tag-cut
- Design review transcript (synthesis form) 2026-04-28 — Presidio vs in-process convergence on hybrid
- Consumer-side avatar service code — image PII out-of-scope verification (OpenAI moderation only at upload, never on LLM-text path)
