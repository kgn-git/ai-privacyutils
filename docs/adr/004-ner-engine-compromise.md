# ADR 004 — NER engine choice for PERSON-name redaction (compromise v14)

**Status:** Accepted (v1.2, Sprint 2K.B target, issue #42)
**Date:** 2026-04-30
**Supersedes:** ADR 003 § engine choice for the v1.2 implementation. ADR 003 is preserved as the historical record of the rejected Hybrid C (transformers.js / distilbert q8) decision.
**Context ref:** Pre-implementation expert review for issue #42 (2026-04-30); issue #7 closure record (2026-04-28); `docs/Handover-7.md`

## Context

ADR 003 selected `Xenova/distilbert-base-multilingual-cased-ner-hrl` q8 via `@huggingface/transformers` ("Hybrid C") as the NER engine for v1.2. Implementation (`feature/7-ner-name-redaction`) was attempted between 2026-04-28 and 2026-04-29 and **closed** because the actual measured bundle size exceeded the ADR 003 estimate by ~5x:

| Engine | ADR 003 estimate | Measured bundle | Result |
|---|---|---|---|
| Hybrid C — `Xenova/distilbert-base-multilingual-cased-ner-hrl` q8 via `@huggingface/transformers` | ~40 MB | ~221 MB | BLOCKED — exceeds Vercel 250 MB function-bundle ceiling AC |

After Hybrid C was rejected, a second ML engine candidate was evaluated:

| Engine | Estimate | Measured | Result |
|---|---|---|---|
| Hybrid F — `onnx-community/gliner_multi_pii-v1` (GLiNER-PII) via `transformers.js` | ~50–80 MB | English q8: 175 MB; multilingual q8: 333 MB | BLOCKED — exceeds Vercel ceiling; transformers.js incompatible (huggingface/transformers.js issue #826 unresolved since June 2024) |

A third candidate (Mastra `PIIDetector`) was rejected on architecture grounds:

| Engine | Reason |
|---|---|
| Mastra PIIDetector | No PERSON / NAME entity type exposed in its detection vocabulary; LLM-backed (introduces a new sub-processor relationship); requires Mastra framework adoption (~adds 50 MB of unrelated framework code) |

With three engine candidates rejected and the v1.2 release on hold, a 2026-04-30 expert review evaluated `compromise` v14 as a pragmatic agile pivot. `compromise` is a pure-JS heuristic NLP library — ~3.8 MB installed, ~344 KB ESM, zero native bindings, 13-year provenance, 0 known CVEs. The accuracy floor is materially below ML — but the empirically-measured cohort rates against the v1.2 fixture set (see `src/__tests__/ner-cohort-benchmark.test.ts`) substantially outperform the ADR 003 expectation that `compromise` could not meet the ≥95% per-cohort threshold.

The deciding compliance argument is that **the status-quo at v1.0/v1.1 is zero name redaction**. Any positive TP rate is a concrete Art. 5(1)(f) risk reduction. Art. 25 "appropriate technical measures" does not require perfection; it requires proportionate effort given the state of the art, cost, and risk profile. A technically-feasible partial implementation that ships is more defensible than a theoretically-perfect implementation that remains blocked.

## Decisions

### 1. Engine — `compromise` v14 (heuristic, pure JS)

**Chosen.** Pure JS heuristic NER. ~3.8 MB installed, ~344 KB ESM, zero native bindings. Synchronous PERSON-entity detection via `nlp(text).people().out('offsets')`. 13-year track record on npm (since 2013), 173 published versions, 3 maintainers (same nlp-compromise org). Same supply-chain class as `libphonenumber-js` (the existing baseline).

ADR 003 formally rejected `compromise` ("accuracy floor on multilingual CVs is below the 95% per-cohort TP threshold"). That assertion was made without measurement. The v1.2 fixture set (12 Western European, 6 Maghrebi, 6 East Asian transliterated, 6 Slavic transliterated) measured TP rates of 100% / 100% / 83.3% / 100% — substantially above the ADR 003 expectation.

The accuracy delta vs. an ML engine remains: `compromise` will systematically miss names absent from its English-centric lexicon (French surname/Org-tag collisions; Korean hyphenated compound truncation), and structural CV variants (ALLCAPS headers, surname-first forms) are out of its training set. These limitations are documented under § Known Limitations below and, as R3-residual, in `docs/compliance/redaction-record.md` § 5 — the authority for the library's residual gaps.

**Considered alternatives:**

- **Hybrid C — transformers.js + distilbert** (ADR 003's accepted choice): rejected — actual bundle 221 MB exceeds Vercel 250 MB ceiling.
- **Hybrid F — transformers.js + GLiNER-PII**: rejected — bundle 333 MB; transformers.js / GLiNER pipeline-API incompatibility unresolved.
- **Mastra PIIDetector**: rejected — no PERSON entity type; LLM-backed sub-processor.
- **`wink-nlp`** (alternative pure-JS NER): re-evaluable in v1.3+ if compromise accuracy proves insufficient. Filed as a placeholder in the ML-upgrade backlog.
- **Cloud NER for PERSON only** (Azure Cognitive Services / AWS Comprehend `DetectPiiEntities`): rejected as primary v1.2 path because it introduces a new Art. 28 processor relationship and ties the package to a specific cloud vendor. Re-considered as a candidate for the v1.3+ ML-upgrade engine.

### 2. Architecture — `NerEngine` abstraction (drop-in upgrade path)

**Chosen.** Engine choice is hidden behind a `NerEngine` interface (`src/ner/ner-engine.ts`). v1.2 ships:

- `NullNerEngine` — no-op fast path used when `enableNer:false` (default).
- `CompromiseNerEngine` — `compromise` v14 backed implementation.

Future engines (`HttpNerEngine`, `WinkNerEngine`, `CloudNerEngine`) implement the same interface and slot in via the `createNerEngine(config)` factory or a custom `nerEngine` override on `sanitizePiiAsync`. The consumer API (`sanitizePiiAsync({ enableNer: true })`) does not change as the engine evolves. Middleware NER integration is deferred to v1.3.

This is the architectural seed for the formal ML upgrade roadmap (§ ML upgrade roadmap below). The interface forecloses the "ship one engine, then refactor everything to ship a second" trap.

### 3. Dynamic import — `compromise` is loaded only on first detection call

**Chosen.** `compromise` is imported via `await import('compromise')` inside `CompromiseNerEngine.detectPersonSpans()`, never as a top-level static import. Rationale:

- A top-level `import 'compromise'` would propagate into every consumer's bundle graph (because `src/index.ts` re-exports `CompromiseNerEngine`).
- 344 KB of ESM exceeds Vercel Edge runtime's 1 MB practical bundle ceiling when chained with other privacyutils modules.
- The sync `sanitizePii` function (regex-only) MUST remain Edge-safe — it is the legacy v1.0/v1.1 export and consumers using it on Edge functions must not regress.
- Dynamic import keeps `compromise` out of the import graph until `sanitizePiiAsync(text, { enableNer: true })` is called for the first time. Cold-start cost (~316 ms) is paid once per warm Vercel function instance via a module-scoped singleton.

This is a binding implementation constraint, not a stylistic choice — verified via the `src/__tests__/ner-engine.test.ts` "NullNerEngine never loads compromise" test (50 ms upper bound proves NullNerEngine instantiation does not transitively load compromise).

### 4. Span-merge algorithm — NER on ORIGINAL text + name-find on regex-redacted output

**Chosen.** NER spans are computed on the ORIGINAL text — `compromise`'s character offsets are invalid against post-regex-redacted output. After the regex pipeline produces `regexRedacted`, the helper `applyNerRedactions(original, nerSpans, regexRedacted, token)` (in `src/sanitize-pii-async.ts`):

1. Sorts and merges overlapping NER spans (same pattern as `redactLocalePhones` at `sanitize-pii.ts:130–177`).
2. For each merged NER span (in reverse start order): extracts the name from the ORIGINAL via `original.slice(span.start, span.end)`, searches for that exact substring in `regexRedacted`, and replaces it once.
3. If the name is NOT found in `regexRedacted` → suppress (the regex pass already consumed an enclosing range — "larger span wins on overlap").

The "name-find" step is robust under realistic CV input shape: 5–30 char proper nouns are unlikely to coincidentally appear at unrelated positions. When the same name occurs twice in the original (a referee name repeated in a recommendation paragraph), the NER engine emits a span for each occurrence; the function replaces each in order.

The matched name string is bound to a local-only variable (`nameLocal`) inside the merge loop and is never returned, logged, or assigned to a wider scope — see GDPR-safe extraction (§ next).

### 5. GDPR-safe extraction — destructure ONLY `{offset}` from compromise output

**Chosen.** `compromise`'s `nlp(text).people().out('offsets')` returns objects of shape:

```ts
{
  text: string,        // matched name — PII (Art. 4(1))
  terms: Array<...>,   // tokenised name — PII
  person: {
    presumed_gender: 'male' | 'female' | '',  // gender inference — Art. 9 special-category data
    firstName: string,
    lastName: string,
    honorific: string,
  },
  offset: { start, length, index },
}
```

The implementation MUST destructure only `offset` and discard the rest. Referencing any of `text`, `terms`, or `person` in the production code path leaks PII / Art. 9 data through whatever surface that code path's return value reaches (telemetry, debug dumps, error reports).

This is enforced by:

- A `// COMPLIANCE: destructure only {offset}` comment at the extraction site (mirroring the existing pattern at `sanitize-pii.ts:1`).
- TypeScript type narrowing — the `raw` variable is typed as `ReadonlyArray<{ offset: { start, length } }>`, so any future code edit that tries to read `text` / `terms` / `person` is a TypeScript error.
- The `NerSpan` return shape — exposes only `{start, end, score, label}`. The matched substring is intentionally NOT in the public surface (security-expert C3).

### 6. Trailing-punctuation strip

**Chosen.** Compromise's `offset.length` includes trailing sentence punctuation (e.g. `"Call Alice."` returns offset.length=12 for "Alice Brown."). Without stripping, the redacted output becomes `"Call [person]"` — eating the period.

The implementation strips a bounded run of non-(word/whitespace/`'`/`.`/`-`) characters from the END of the matched substring before computing `NerSpan.end`:

```ts
const stripped = matchedLocal
  .replace(/[^\w\s'.-]{1,16}$/, '')  // strip non-word non-whitespace non-'-. tail
  .replace(/\.$/, '');               // also trim a trailing literal sentence-final period
```

The bounded `{1,16}` quantifier (vs. the binding-constraint form `+`) is a recheck S5 ReDoS-gate compliance fix; semantic outcome on every legitimate input is byte-identical to the unbounded form.

The keep-set `\w\s'.-` preserves trailing `.` / `'` / `-` because these are legitimate parts of names (`O'Brien`, `Jean-Pierre`, `Mr.`, `Jr.`, `St.`). The second `.replace(/\.$/, '')` then trims a trailing literal sentence-final period — handling the "name ends a sentence" case without eating legitimate dotted name pieces.

### 7. Score field — hardcoded to 1.0; `confidenceThreshold` no-op for heuristic engines

**Chosen.** `compromise` is a heuristic engine. It does not produce a softmax-derived gradient confidence; every span it emits is a binary detection. The `NerSpan.score` field exists for interface compatibility with future ML engines.

`NerDetectOptions.confidenceThreshold` is documented in JSDoc as a no-op for heuristic engines:

> "Confidence threshold [0,1]. No-op for `CompromiseNerEngine` (heuristic engine returns no gradient score). Meaningful only for ML-backed engines."

Consumer code that passes `confidenceThreshold: 0.85` is harmless under `compromise` (every span passes any threshold ≤ 1.0) and meaningful under a future ML engine — engine-portable code.

### 8. Deny-list — `Set.has()` equality only; `new RegExp(entry)` prohibited

**Chosen.** `DEFAULT_NER_DENY_LIST` is applied as an exact-equality filter via `Set.has()`. The 31-entry default list covers three categories:

1. **Common-noun given names** that compromise's lexicon flags as people: `Grace`, `Mark`, `Chase`, `Dawn`, `Robin`, `Faith`, `Hope`, `Hunter`, `Summer`, `Jade`, `Ruby`, `Ada`, `Gene`, `Rex`, `Duke`, `Major`.
2. **French/Romance street-type words** (NER runs on original text, before address-regex consumes them): `Rue`, `Boulevard`, `Avenue`, `Allée`, `Via`, `Calle`, `Rua`, `Chemin`, `Route`.
3. **Surname-shaped tech terms / brand names**: `Jenkins`, `Hudson`, `Travis`, `Helm`, `Darwin`, `Newton`.

Constructing a regex from a deny-list entry (`new RegExp(entry)`) is **prohibited** — it would open a regex-injection surface (an attacker-controlled deny-list entry could match a wider set of inputs than intended, or could be super-linear and re-introduce ReDoS). Equality comparison is safe by construction. Enforced by `// SECURITY: deny-list is term-equality only — never construct regex from entries (injection surface).` comment at the filter site.

### 9. Fail-closed posture — `PiiNerLoadError` (mirrors `PiiInputTooLargeError`)

**Chosen.** If the dynamic `import('compromise')` fails (`ERR_MODULE_NOT_FOUND`, sub-dep parse error) or if the imported module has the wrong API shape (e.g. a future breaking change in compromise removes `.people()`), `PiiNerLoadError` is thrown.

The engine does not silently degrade to "always return []" — silent degradation is the security-fairness anti-pattern that compliance review §R3 explicitly flagged.

API-shape guard:

```ts
if (typeof nlp !== 'function') throw new PiiNerLoadError(...);
const probe = nlp('probe');
if (typeof probe?.people !== 'function') throw new PiiNerLoadError(...);
```

Consumer can `catch (err)` and decide whether to retry, fall back, or surface the error. The library does not silently degrade.

### 10. Default — `enableNer: false`

**Chosen.** The v1.2 minor-bump is non-breaking for all existing consumers. Names are NOT redacted by default. To enable redaction:

```ts
import { sanitizePiiAsync } from '@kgn-git/privacy-utils';

// Direct function:
const cleaned = await sanitizePiiAsync(rawCv, { enableNer: true });
```

Middleware NER integration (calling `sanitizePiiAsync` from `createPiiMiddleware`'s `transformParams` when `enableNer: true` is supplied via `PiiMiddlewareOptions`) is deferred to v1.3. For v1.2, use `sanitizePiiAsync` directly when NER is required.

Consumer JSDoc (and README) carry an explicit GDPR Art. 25 warning:

> "Setting `enableNer: false` (default) means names are NOT redacted. Enable for GDPR Art. 25 compliance when sending text to third-party LLM processors."

This is acceptable under Art. 25 because the obligation sits with the data controller (the platform), not the utility library. Platform integration is tracked as a near-term backlog deliverable (compliance-officer condition C6).

### 11. Performance contract

| Dimension | Target | Rationale |
|---|---|---|
| `sanitizePii` (sync, regex-only, `enableNer: false`) p95 | <10 ms / 10 KB | Existing v1.1 gate, unchanged |
| `sanitizePiiAsync` (`enableNer: true`) p95 | <150 ms / 10 KB | Renegotiated from ADR 003's <80ms — `compromise` is a full NLP tokenizer+tagger pipeline, not a regex; tech-ops verdict 2026-04-30 confirms 55–120 ms typical on Linux Vercel |
| Cold-start (first call after Vercel cold-start) | <500 ms | Compromise module parse ~316 ms typical; far below ADR 003's <1.2 s ML target |
| Bundle delta | <5 MB | Confirmed: ~3.8 MB installed / 344 KB ESM |

The total LLM round-trip for a CV-sized prompt is 800–3000 ms. 55–150 ms of NER overhead is 2–18% of LLM round-trip — noticeable in p50 only.

**Amendment 2026-09-07 (#73 PR-4) — the sync row is no longer a gate.** The `sanitizePii` wall-clock figure is now measured and printed by `src/__tests__/locale-patterns.test.ts`, not asserted; the corresponding middleware measurement in `src/__tests__/pii-middleware.test.ts` is likewise reported only. On a shared runner a wall-clock threshold reports host load rather than the code, so the assertions were removed. The other rows in this table were never test-enforced in this repo. See `docs/compliance/redaction-record.md` § 4.1, which carries the removed thresholds and where the printed figures are read.

## Cohort fairness — re-scoped AC for v1.2

Per the 2026-04-30 compliance-officer verdict, the original ADR 003 AC (TP ≥95% per cohort, ≤5pp variance) is **superseded for v1.2** and **carried forward as a formal commitment** to the ML-upgrade backlog issue (§ ML upgrade roadmap).

| Cohort | v1.2 gate | Measured (Windows x64 Node 24, 2026-04-30) | v1.3+ ML target (carry-forward) |
|---|---|---|---|
| 1. Western European | TP ≥70% — CI BLOCKING | TP 100.0% (12/12) | TP ≥95% — CI BLOCKING |
| 2. Maghrebi | Benchmark + document; no gate | TP 100.0% (6/6) | TP ≥95% — CI BLOCKING |
| 3. East Asian transliterated | Benchmark + document; no gate | TP 83.3% (5/6); miss: `Min Park` | TP ≥95% — CI BLOCKING |
| 4. Slavic transliterated | Benchmark + document; no gate | TP 100.0% (6/6) | TP ≥95% — CI BLOCKING |
| FP rate | Benchmark + document; no gate | 4.5% (1/22); detail: `IBM Watson` → `Watson` | ≤5% — CI BLOCKING |
| Cohort variance | No gate at v1.2 | 16.7 pp (cohorts 1–4) | ≤5 pp — CI BLOCKING |

Variance acceptance at v1.2 reflects compliance-officer reasoning: "any positive TP rate reduces actual exposure to OpenAI vs. status-quo zero redaction. A documented partial implementation that ships is more defensible under Art. 25 than a theoretically-perfect implementation that remains blocked."

## Known limitations

These limitations apply to `compromise` heuristic NER and are formally acknowledged. The ML-upgrade backlog issue (§ ML upgrade roadmap) carries the commitment to address them.

- **Heuristic-based.** Misses names absent from compromise's English-centric lexicon. Cohort 3 miss `Min Park` is the canonical example: `Min` is also an English common-noun adjective (`min/max`) so compromise's tagger demotes it.
- **French surname/Org-tag collision.** `Dupont`, `Petit`, `Laurent`, `Simon` (as surnames) not detected when paired with a first name absent from the English lexicon. Workaround: deny-list entries handle the symmetric case (street-type words detected as person).
- **Korean hyphenated compound truncation.** `-jun`, `-ho`, `-won` suffixes systematically dropped by compromise's tokeniser. `Kim Min-jun` may be detected as `Kim Min-` (or not at all).
- **ALLCAPS headers.** `JEAN-PIERRE DUBOIS` format not detected — compromise's tagger requires conventional capitalisation.
- **`confidenceThreshold` no-op.** All compromise detections return `score: 1.0`; threshold ignored. Documented in JSDoc.
- **Edge runtime not supported for the NER path.** 344 KB ESM exceeds the practical 1 MB Edge limit when chained with other privacyutils modules. The sync `sanitizePii` (regex-only) path remains Edge-safe.

## ML upgrade roadmap (formal commitment, not aspirational language)

This section is a commitment that the ML-upgrade backlog issue carries forward. Compliance condition C7 (sprint-close gate) requires the backlog issue to be created before issue #42 closes.

The `NerEngine` abstraction means swapping engines is mechanical: a new `XxxNerEngine` class implementing the same interface, plumbed via `createNerEngine`, replaces `CompromiseNerEngine` without any consumer API change.

**ML-upgrade AC (carried forward from ADR 003 + compliance condition C7):**

- TP ≥95% per cohort (Western European, Maghrebi, East Asian transliterated, Slavic transliterated)
- ≤5 pp TP variance across cohorts
- ≤5% FP rate
- Bundle delta <60 MB (within Vercel 250 MB function ceiling)
- Cohort fairness gate enforced as CI BLOCKING (not benchmark-only)

**Likely engine candidates (re-evaluate at backlog issue scoping time):**

- `HttpNerEngine` calling a Microsoft Presidio sidecar (Cloud Run / Fly.io) — re-evaluate the architecture-fit objections of ADR 003 if Vercel function-bundle limits remain a constraint.
- Cloud NER for PERSON-only (Azure Cognitive Services / AWS Comprehend) — accept the new Art. 28 processor relationship in exchange for ≥95% accuracy.
- A lighter ONNX-quantised model that fits Vercel ceiling (e.g. `gliner_small_q4` if quantisation reduces it below 50 MB).
- `wink-nlp` — alternative pure-JS NER for re-evaluation if compromise accuracy proves insufficient even after deny-list tuning.

The backlog issue captures the AC and engine candidates; this ADR commits to the upgrade as work, not just an aspiration.

## Consequences

### Positive

- **#42 ships on schedule.** Vercel bundle ceiling no longer blocks v1.2 release. Hybrid C / Hybrid F closure unblocks Sprint 2K.B.
- **PERSON entity now (mostly) redacted.** Closes the largest residual GDPR Art. 5(1)(c) gap in the LLM prompt path for the cohorts where compromise performs well.
- **NerEngine abstraction is the architectural seed for the ML upgrade.** Future engine swaps are mechanical, not refactoring.
- **Bundle delta negligible.** ~3.8 MB vs. 250 MB Vercel ceiling. No headroom problem for future framework additions.
- **Edge-safe sync path preserved.** `sanitizePii` (regex-only) remains Edge-runtime compatible. Existing consumers unaffected.
- **Backward-compat preserved.** v1.0/v1.1 consumers see no behavioural change at the v1.2 minor bump (`enableNer: false` default).

### Negative / cost

- **Cohort fairness gap is real and documented.** v1.2 ships with ≤5pp variance NOT enforced. The ML-upgrade backlog issue carries the commitment to close this.
- **Heuristic engine misses CV variants.** ALLCAPS headers, French surname collisions, Korean compound truncation are systematic limitations.
- **`confidenceThreshold` is engine-dependent.** Consumer code passing `confidenceThreshold: 0.85` is a no-op under compromise — observable inconsistency vs. future ML engines.
- **No SHA-256 model pin.** The previous ML approach required SHA-256 pinning of ONNX model files (out-of-band CDN delivery). `compromise` distributes entirely within the npm tarball — `package-lock.json` sha512 is the in-band equivalent. Documented in `docs/INTEGRITY.md`.

### Risks

- **Compromise accuracy below threshold on production CV traffic.** The 12-Western-European fixture set is small. Production traffic may surface FP/FN classes not represented. Mitigation: ML-upgrade backlog issue carries the AC for production-traffic-validated metrics; cohort fixtures grow with each operational learning.
- **Compromise major version bump breaks API.** The dynamic-import + API-shape-guard pattern (§ 9) catches this and surfaces `PiiNerLoadError` rather than silent zero-detection regression. Tilde-pin (`~14.15.0`) blocks accidental major upgrades.

## References

- privacyutils#42 — issue body
- privacyutils#7 — closed (ADR 003 / Hybrid C bundle blocker)
- Pre-implementation expert review for issue #42 (2026-04-30) — full per-expert verdicts (compliance / security / tech / tech-ops)
- Pre-implementation expert review for issue #7 (2026-04-28) — original Hybrid C review
- Compliance review §R3 (v1.0.0, 2026-04-19) — original compliance flag
- `docs/adr/003-ner-engine-choice.md` — superseded engine choice (preserved as historical record)
- `docs/adr/001-token-format.md` — sentinel idempotency invariant precedent (issue #9)
- `docs/adr/002-input-length-cap.md` — fail-closed `PiiInputTooLargeError` pattern (issue #10) — `PiiNerLoadError` mirrors this
- `docs/INTEGRITY.md` — reduced-tier security posture (S5/S6/S7/S11 active; S1/S2/S3/S8 deferred); `compromise` package-lock.json sha512 noted
- `docs/Handover-7.md` — Hybrid C closure record
- `src/__tests__/ner-cohort-benchmark.test.ts` — fixture set + measured cohort rates
