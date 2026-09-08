# `@kgn-git/privacy-utils`

A standalone TypeScript PII-redaction library for LLM prompts. Provides pure `sanitizePii`, composable `piiPatterns`, a Vercel AI SDK middleware (`piiMiddleware`), and a middleware factory (`createPiiMiddleware`) that scrubs PII from LLM prompts at the single latest application-layer chokepoint before the SDK serialises the provider HTTP call. v1.1 adds opt-in low-collision sentinel tokens (`tokenFormat: 'sentinel'` → `<<REDACTED_X>>`). **v1.2 adds opt-in PERSON-name redaction** (`sanitizePiiAsync({ enableNer: true })`) via a heuristic NER engine (`compromise` v14) behind a pluggable `NerEngine` abstraction — closing the largest residual GDPR Art. 5(1)(c) gap on the LLM prompt path (R3, partial — see [`docs/compliance/redaction-record.md`](docs/compliance/redaction-record.md) § 5, R3-residual). **v1.3 adds the additive `profile: 'cv'` option** (`sanitizePii(text, { profile: 'cv' })`) that preserves employment dates for CV/embedding callers — redacting a date only on an explicit DOB cue — while still masking true PII; the default profile stays byte-identical (R11 — see § CV redaction profile).

v1.0.0 was the first release; it provides PII redaction on the LLM prompt path as a GDPR Art. 5(1)(c) / 25 / 32 data-minimisation control.

## Installation

`@kgn-git/privacy-utils` ships as a git-installable package under the `kgn-git` GitHub organisation. There is **no npm registry publish step** — consumers install directly from the git tag.

### Consumer setup

In the consumer repo's `package.json`, add a dependency pinned to an exact git tag:

```json
{
  "dependencies": {
    "@kgn-git/privacy-utils": "github:kgn-git/ai-privacyutils#v1.0.0"
  }
}
```

When `npm install` runs, npm clones the tag at the named ref, runs the package's `prepare` script to build `dist/`, and the resulting artefacts are available at `@kgn-git/privacy-utils` in `node_modules/`. Consumers need **read access to `kgn-git/ai-privacyutils`** (public repo — anonymous read is fine; CI runners can use a token where the platform requires one for private-pin parity).

For CI runners that authenticate git fetches, provide a Personal Access Token or a GitHub App token with `Repository permissions: Contents: Read` on `kgn-git/ai-privacyutils`, exported as `GITHUB_TOKEN` (or whatever variable your package manager uses for git access).

### Version pinning

- Pin to an **exact** tag (`v1.0.0`, `v1.1.0`, etc.) — never use a branch name or `main`.
- Upgrading is an explicit PR that bumps the `#vX.Y.Z` ref.
- Semver implications:
  - **Major bump** (`v2.0.0`) — breaking API change; migration required.
  - **Minor bump** (`v1.1.0`) — additive new patterns / locale coverage.
  - **Patch bump** (`v1.0.1`) — pattern tuning; no semantic change.

### Why git-install rather than npm registry?

Single-org consumption with a small set of consumer repos. npm registry publish would require tokens + `.npmrc` config per consumer + registry attack surface. The git-install path avoids all of this with equivalent version-pinning ergonomics. See `docs/Handover-35.md` § Architecture pivot 2026-04-19 for full rationale.

## Usage

### Middleware (primary API — Vercel AI SDK)

```ts
import { wrapLanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { piiMiddleware } from '@kgn-git/privacy-utils';

const model = wrapLanguageModel({
  model: openai('gpt-4o'),
  middleware: piiMiddleware,
});

// Every generateText / streamText / generateObject call through `model`
// has its prompt scrubbed before the provider HTTP request.
```

### Direct function (non-LLM contexts)

```ts
import { sanitizePii } from '@kgn-git/privacy-utils';

const cleaned = sanitizePii(rawCvText);
// "Jane Doe, jane@example.com, (555) 123-4567, 42 Baker Street" →
// "Jane Doe, [email], [phone], [address]"
```

### Opt-in sentinel tokens (v1.1 — issue #9 / compliance §R8)

By default the redaction tokens are the readable `[email]`, `[phone]`, `[address]`, `[postcode]`, `[dob]` (v1.0.0 byte-identical). These are convenient for debug but collide with user-authored literals — a user writing `"enquiries via the [email] form"` has indistinguishable output from a genuine `[email]` redaction. Opt into the low-collision sentinel form with the `tokenFormat` option:

```ts
import { sanitizePii, createPiiMiddleware } from '@kgn-git/privacy-utils';

// Direct function — per-call:
sanitizePii('Contact jane@example.com.', { tokenFormat: 'sentinel' });
// → "Contact <<REDACTED_EMAIL>>."

// Middleware factory — per-instance:
const mw = createPiiMiddleware({ tokenFormat: 'sentinel' });
// wrapLanguageModel({ model, middleware: mw });
```

Sentinel mapping (all 5 token kinds covered):

| Kind | Readable (default) | Sentinel |
|---|---|---|
| Email | `[email]` | `<<REDACTED_EMAIL>>` |
| Address | `[address]` | `<<REDACTED_ADDRESS>>` |
| Postcode | `[postcode]` | `<<REDACTED_POSTCODE>>` |
| Phone | `[phone]` | `<<REDACTED_PHONE>>` |
| DOB | `[dob]` | `<<REDACTED_DOB>>` |

**Backward-compat contract.** `sanitizePii(text)` with no options — and `piiMiddleware` — produce v1.0.0 byte-identical output. `createPiiMiddleware()` with no options is equivalent to the default `piiMiddleware`. The default swap to sentinel is deferred to v2.0 (major bump).

**Idempotency invariant.** The sentinel strings (`<<REDACTED_*>>`) are structurally pattern-disjoint from every v1.x redaction pattern — no `@`, no digits, no `\b\d` prefix, no lowercase street-type keyword, no closed-set prefix keyword. Running `sanitizePii` twice in either format is a strict no-op; sentinel output sanitised again in readable mode is also a no-op. The ADR + invariant proof lives in `src/token-format.ts`. v1.2 (issue #42) extends the invariant to `[person]` / `<<REDACTED_PERSON>>` — see § Async API + NER name redaction below.

### Async API + NER name redaction (v1.2 — issue #42 / R3)

v1.2 adds an async export `sanitizePiiAsync` that applies the v1.1 regex pipeline + (optional) PERSON-name redaction via a heuristic NER engine (`compromise` v14). The sync `sanitizePii` is unchanged — existing v1.0/v1.1 consumers see no behavioural change at the v1.2 minor bump.

**Setting `enableNer: false` (default) means names are NOT redacted. Enable for GDPR Art. 25 compliance when sending text to third-party LLM processors.**

```ts
import { sanitizePiiAsync } from '@kgn-git/privacy-utils';

// Direct function — opt in to NER:
const cleaned = await sanitizePiiAsync(rawCv, { enableNer: true });
// "Hi, Alice Brown applied. Email jane@example.com." →
// "Hi, [person] applied. Email [email]."

// Sentinel form:
await sanitizePiiAsync(rawCv, { enableNer: true, tokenFormat: 'sentinel' });
// → "Hi, <<REDACTED_PERSON>> applied. Email <<REDACTED_EMAIL>>."
```

> **Note — middleware NER integration is a v1.3 follow-on.** Calling
> `sanitizePiiAsync` from `createPiiMiddleware`'s `transformParams` (so
> `createPiiMiddleware({ enableNer: true })` would route prompts through
> the NER engine before the SDK emits them) is **not** wired in v1.2 —
> `PiiMiddlewareOptions` does not accept `enableNer` and the middleware
> never invokes NER. For v1.2, use `sanitizePiiAsync` directly when NER
> is required.

**Why opt-in (`enableNer: false` default)?** v1.2 is a non-breaking minor bump; existing consumers must continue to see byte-identical behaviour. Platform integration (enabling NER for the consumer-side `sanitizePii` call path) is tracked as a near-term backlog deliverable.

**Engine: `compromise` v14 (heuristic, not ML).** v1.2 uses pure-JS heuristic NER. Two ML engines (transformers.js + distilbert q8 ~221 MB; transformers.js + GLiNER-PII q8 ~333 MB) were evaluated and rejected as exceeding the Vercel 250 MB function-bundle ceiling. `compromise` is ~3.8 MB installed / ~344 KB ESM, zero native bindings, 13-year provenance, 0 known CVEs. The full evaluation history lives in `docs/adr/004-ner-engine-compromise.md`.

**Pluggable engine architecture.** v1.2 ships behind a `NerEngine` abstraction so future engine upgrades (HTTP sidecar, cloud NER, alternative pure-JS engines) are drop-in replacements requiring zero consumer API changes. The ML upgrade is tracked as a formal roadmap commitment — see [`docs/compliance/redaction-record.md`](docs/compliance/redaction-record.md) § 5 (R3-residual) and § 4 (C7), and ADR 004.

**Vercel runtime compatibility.**
- `sanitizePii` (sync, regex-only, the v1.0/v1.1 surface) → Edge-runtime SAFE (no `compromise` in the bundle graph).
- `sanitizePiiAsync` with `enableNer: false` → Edge-runtime SAFE (`compromise` is reached only through the dynamic `import('compromise')` that `CompromiseNerEngine` starts in its constructor, and with `enableNer: false` no engine is constructed).
- `sanitizePiiAsync` with `enableNer: true` → Vercel **Serverless** (Node 20+) only. The 344 KB ESM exceeds the 1 MB Edge practical limit when chained with other modules.

**Cohort benchmark — measured TP/FP rates (v1.2, Windows x64 Node 24, 2026-04-30):**

| Cohort | Fixtures | TP rate | Notes |
|---|---|---|---|
| 1. Western European (EN/FR/DE/IT/ES/PT names) | 12 | **100.0%** (12/12) | CI BLOCKING gate: ≥70% |
| 2. Maghrebi (Mohamed, Fatima, Karim, …) | 6 | **100.0%** (6/6) | benchmark only — no CI gate |
| 3. East Asian transliterated (Wei Zhang, Yuki Tanaka, …) | 6 | **83.3%** (5/6) — miss: `Min Park` | benchmark only |
| 4. Slavic transliterated (Dmitri Volkov, Jana Novák, …) | 6 | **100.0%** (6/6) | benchmark only |
| FP rate (companies, universities, tech terms, job titles) | 22 | **4.5%** (1/22) — `IBM Watson` → `Watson` | benchmark only |

The cohort-1 (Western European) gate is enforced as CI BLOCKING; cohorts 2–4 + FP are benchmark + report only at v1.2. The original ≥95% per-cohort / ≤5pp variance AC is carried forward to the ML-upgrade backlog issue (compliance condition C7).

### CV redaction profile (v1.3 — issue #64)

v1.0–v1.2 shipped a single, one-size-fits-all policy that **over-redacts on CV / résumé text**: (a) every date-shaped string is redacted to `[dob]` — destroying employment start/end dates — and (b) surname-shaped employer names (`Morgan Stanley`, `Ericsson`) are mis-tagged as persons and redacted to `[person]`. Employment dates, employer/organisation names and city/region are the highest-signal **non-personal** features a downstream embedding / job-match consumer depends on (see `jobflow-platform#1424`).

v1.3 adds an additive `profile` option. The `'default'` profile is **byte-identical to v1.2** on every input (this is a SemVer MINOR bump — existing consumers are unaffected). Opt into `'cv'` for CV/embedding text:

```ts
import { sanitizePii, sanitizePiiAsync } from '@kgn-git/privacy-utils';

// Sync (regex-only): employment dates preserved, DOB-labelled dates still masked.
sanitizePii('Engineer at Siemens, Munich, 01/06/2018 to 31/08/2021.', { profile: 'cv' });
// → "Engineer at Siemens, Munich, 01/06/2018 to 31/08/2021."  (dates + employer + city intact)
sanitizePii('Date of birth: 23/05/1985', { profile: 'cv' });
// → "Date of birth: [dob]"  (explicit DOB cue → still masked)

// Async (+ NER): applicant name masked; employer / city false-positives preserved.
await sanitizePiiAsync(cvText, { profile: 'cv', enableNer: true });
```

Under `'cv'`, the **one** behavioural change vs `'default'` is the date pass:

1. **Dates** are NOT redacted by shape. Only a date carrying an explicit date-of-birth cue (`Date of birth:`, `DOB:`, `born on`, plus the EU-locale birth cues — `né(e) le`, `geboren am`, `nato/nata il`, `nacido/nacida el`, `nascido/nascida em/a`) is redacted (`dobContextCuePattern`). Plain employment dates pass through.

Everything else is **identical to `'default'`**: person name, email, phone, street address, postcode, national ID and a labelled DOB are still masked, and the person-NER pass (`sanitizePiiAsync({ enableNer: true })`) is unchanged. Employer/organisation names and city/region are preserved only insofar as `compromise` does not person-tag them (the common case).

**Why person-NER is not modified under `'cv'`.** An earlier draft suppressed PERSON spans that `compromise` also tagged ORG/PLACE (to rescue surname-shaped employers). It was removed (SD-002 review, PR #66): (a) near-zero benefit — `compromise` tags an employer as *either* person *or* org, almost never both; (b) it **introduced a name-recall leak** — a real person whose given name is also a place/org token (`Paris`, `Austin`, `Georgia`, `Sydney`, `Florence`, `Morgan`, …) would have their `[person]` span suppressed and their name **preserved** into the very embedding this path exists to protect. For a privacy library that trade is net-negative.

**Known limitation — field-aware API is the required follow-up.** Because person-NER is unchanged, a surname-shaped employer that `compromise` person-tags is still redacted to `[person]` under `'cv'`. Empirically (30-employer basket, issue #64) that is ~2/30 real employers (`Morgan Stanley`, `Ericsson`) — an accepted **precision** residual. The robust fix is a **field-aware API**: the platform passes structured CV sections (title / employer / dates / description), so a per-field policy — never run person-NER over the employer field, always run it over the name field — fixes **both** precision (preserve those employers) **and** recall (never leak a name that looks like a place/org). Recorded as R11-residual in [`docs/compliance/redaction-record.md`](docs/compliance/redaction-record.md) § 5, which is the authority for it. Tracked as the required follow-up for `jobflow-platform#1424`; the `'cv'` profile is the in-library best-effort that lands first and fully resolves the date over-redaction (which was 100% of full-date employment dates).

### Programmatic pattern access

Pattern exports are **factory functions** — call with `()` to get a fresh `/g` RegExp on every call:

```ts
import { piiPatterns, emailPattern } from '@kgn-git/privacy-utils';

const re = piiPatterns.email();       // fresh RegExp, lastIndex === 0
re.test('jane@example.com');          // true

// Or call the individual factory export directly:
const re2 = emailPattern();
re2.exec('mail jane@example.com');
```

**Why factories?** `/g`-flagged RegExps carry a stateful `lastIndex`. If an exported pattern were a module-level singleton, consecutive `.test()` calls on the same instance would alternate true/false — a classic footgun when the same regex is imported and used by more than one call-site concurrently. Factories guarantee a fresh instance per call, so callers never inherit a stale `lastIndex` from another consumer. (`sanitizePii` itself is unaffected — `String.prototype.replace` resets `lastIndex` internally — but this shape protects external callers using `.test()` / `.exec()`.)

## GDPR Rationale

This library provides a formalised Art. 5(1)(c) data-minimisation control for LLM prompt emission.

- **Art. 5(1)(c) — data minimisation.** LLM operations on free-text user input (skill extraction, cover-letter generation, gap analysis, CV tailoring, embeddings, translation) are content-shape transformations. None require the user's email, phone, postal address, or DOB as input signal. Redacting those classes before emission is the textbook minimisation measure.
- **Art. 25 — privacy by design and by default.** The middleware placement at `transformParams` is the single latest application-layer intercept — every SDK-based LLM call passes through automatically once the middleware is registered on the model. Running later (provider-SDK patch) cedes control; running earlier (per-caller) fragments enforcement. Privacy-by-default (Art. 25(2)) holds because redaction is on as soon as the middleware is registered; opting out requires an explicit code change.
- **Art. 32 — security of processing.** Regex redaction is an appropriate technical measure at the v1.0.0 maturity level given a typical risk profile (B2C advisory feedback, contracted LLM processor). Pattern audit history is maintained in this repo's commit + handover docs.

This package does not create a new Art. 13 disclosure obligation. Consumer-side privacy notices should nonetheless note that PII redaction is applied before third-party LLM processing (it is both accurate and claims the minimisation credit).

## Design decisions and non-goals

This section captures *design-intent* commitments — the deliberate shape of the library, not its compliance basis (covered above in GDPR Rationale). These decisions bound future contribution: a change that violates any of them is a v2.0 scope break, not a patch-level fix.

- **One-way redaction is intentional, not a limitation.** `sanitizePii` and `piiMiddleware` perform a destructive substitution: the original PII span is replaced by a fixed token and discarded. This places the library on the *anonymisation* side of the Art. 4(5) pseudonymisation / anonymisation line at the prompt-emission boundary (prompt-side) — the strong posture — rather than the weaker "pseudonymisation with retained mapping" posture. It is aligned with Art. 25 privacy-by-default: the zero-config middleware produces the strongest available protection without operator action.

- **No reversal map is stored anywhere in the library.** There is no in-memory, on-disk, keychain, database, or side-channel mapping from redaction token back to original PII — not per-call, not per-session, not per-model. Every call is stateless over its input. This is an invariant enforced by architecture (the library has no storage dependency; no `fs`, no `crypto.createHash` keyed on PII, no event emitters carrying PII spans) and should not be weakened without a corresponding v2.0 major bump and explicit compliance re-review.

- **Future re-identification capability would be a new API surface, not a bug fix.** If a consumer use case eventually requires reversible masking (e.g. showing the user a tailored cover letter with their real email re-inserted before delivery), the correct path is a *new* API — e.g. a `reversibleSanitizePii` or a paired `tokenize`/`detokenize` pair — carrying its own threat model, storage contract, and compliance review. It is not a "fix" to `sanitizePii` / `piiMiddleware`, which by design cannot be retrofitted into a reversible primitive without violating the invariant above. Future contributors: if a downstream issue asks to "make redaction reversible", do not patch this library — propose a parallel API.

- **Consumer apps needing reversible masking maintain their own mapping outside the middleware.** The consumer owns the mapping table, its storage, its access control, its retention policy, and its risk register; the mapping must live *outside* the LLM prompt path (never "reversed sanitizePii" semantics, which would contradict the invariant). Typical shape: consumer captures `(sessionId, tokenKind, originalSpan)` triples at *their* application layer before calling the LLM, then applies inverse substitution to the LLM output at their rendering layer. The middleware never sees the mapping.

See GDPR Rationale above for the *compliance basis* behind these choices (Art. 4(5) / 25 / 32).

## Pattern inventory

| Export (call with `()`) | Matches | Replacement token |
|---|---|---|
| `piiPatterns.email()` | `local@domain.tld` (RFC 5321-bounded, ASCII only) | `[email]` |
| `piiPatterns.address()` (alias for `addressByLocale.en()`) | US/UK number-first street address with English terminator (Street / Avenue / …) and optional direction suffix; accepts mixed-case street names (e.g. `McLane Drive`, `LA Cienega Boulevard`) | `[address]` |
| `piiPatterns.addressByLocale.fr()` | French number-first with lowercase or capitalised street keyword (`rue`, `Boulevard`, `avenue`, `place`, `allée`, `chemin`, `impasse`, `quai`, `route`, `cours`, `square`, `bd.`, `av.`), optional `bis`/`ter`/`quater` modifier. Example: `12 rue de la Paix`, `5 Boulevard Saint-Germain`. | `[address]` |
| `piiPatterns.addressByLocale.de()` | German compound-suffix form (name ending in `-straße` / `-strasse` / `-str.` / `-platz` / `-weg` / `-allee` / `-gasse` / `-ring` / `-damm`) followed by house number. Example: `Hauptstraße 23`, `Müllerstr. 12`, `Alexanderplatz 5`. | `[address]` |
| `piiPatterns.addressByLocale.it()` | Italian prefix-keyword form (`Via`, `Viale`, `Corso`, `Piazza`, `Piazzale`, `Largo`, `Vicolo`, `Strada`, `Borgo`, `Contrada`, `Località`) followed by 1-5 name tokens and house number. Example: `Via Roma 15`, `Piazza del Duomo 7`. | `[address]` |
| `piiPatterns.addressByLocale.es()` | Spanish prefix form (`Calle`, `C/`, `Avenida`, `Av.`, `Avda.`, `Plaza`, `Pza.`, `Paseo`, `Ronda`, `Travesía`, `Camino`, `Carrer`, `Glorieta`) + name tokens + number. Example: `Calle Mayor 10`, `Avenida de la Constitución 5`, `Av. Diagonal 220`. | `[address]` |
| `piiPatterns.addressByLocale.pt()` | Portuguese prefix form (`Rua`, `R.`, `Avenida`, `Av.`, `Praça`, `Largo`, `Travessa`, `Alameda`, `Beco`, `Estrada`, `Calçada`) + name tokens + number. Example: `Rua das Flores 45`, `Avenida da Liberdade 110`. | `[address]` |
| `piiPatterns.postcodeByLocale.uk()` | UK alphanumeric postcode (`A[A]N[A/N] NAA` — outward+inward). Example: `SW1A 2AA`, `EC1A 1BB`, `M1 1AE`, `W1A 0AX`. | `[postcode]` |
| `piiPatterns.postcodeByLocale.fr()` | French 5-digit postcode followed by a capitalised city token (the city is consumed as part of the match to redact the re-identification surface in full). Example: `75001 Paris`, `69002 Lyon`. | `[postcode]` |
| `piiPatterns.postcodeByLocale.de()` | German 5-digit + city. Example: `80331 München`, `10115 Berlin`. | `[postcode]` |
| `piiPatterns.postcodeByLocale.it()` | Italian CAP 5-digit + city. Example: `00100 Roma`, `20121 Milano`. | `[postcode]` |
| `piiPatterns.postcodeByLocale.es()` | Spanish 5-digit + city. Example: `28013 Madrid`, `08001 Barcelona`. | `[postcode]` |
| `piiPatterns.postcodeByLocale.pt()` | Portuguese NNNN-NNN with optional city (shape is distinctive enough to match bare). Example: `1200-195 Lisboa`, `4050-123 Porto`, `1200-195`. | `[postcode]` |
| `piiPatterns.phoneByLocale.fr()` | French phone validator (backed by `libphonenumber-js`). Returns a `(candidate: string) => boolean`. Matches native `06 12 34 56 78` 2-2-2-2-2 grouping, Paris landline `01 42 34 56 78`, international `+33 6 12 34 56 78`, etc. | `[phone]` |
| `piiPatterns.phoneByLocale.de()` | German phone validator. Matches Berlin landline `030 12345678` 3+8 variable, mobile `+49 176 12345678`, international prefixes. | `[phone]` |
| `piiPatterns.phoneByLocale.uk()` | UK phone validator (ISO `GB`). Matches mobile `07911 123456` 5+6, London landline `020 7946 0123`, international `+44 7911 123456`. | `[phone]` |
| `piiPatterns.phoneByLocale.it()` | Italian phone validator. Matches mobile `320 1234567` 3+7, Rome landline `+39 06 12345678`, international prefixes. | `[phone]` |
| `piiPatterns.phoneByLocale.es()` | Spanish phone validator. Matches mobile `612 34 56 78` 3+2+2+2, Madrid landline `+34 91 123 45 67`, international prefixes. | `[phone]` |
| `piiPatterns.phoneByLocale.pt()` | Portuguese phone validator. Matches mobile `912 345 678` 3+3+3, Lisbon landline `+351 21 123 4567`, international prefixes. | `[phone]` |
| `piiPatterns.phoneInternational()` | `+?CC-3-3-4` NANP-shape (retained v1.0.0 fallback for numbers outside the six EU locales above) | `[phone]` |
| `piiPatterns.phoneDomestic()` | `3-3-4` NANP-shape fallback | `[phone]` |
| `piiPatterns.dob()` | Numeric `DD.MM.YYYY` / `DD/MM/YYYY` / `DD-MM-YYYY` / `YYYY-MM-DD` + named-month EN/FR/DE/IT/ES/PT | `[dob]` |
| `piiPatterns.nationalIdByLocale.uk()` | UK NINO validator (regex-only — HMRC invalid-prefix rules + suffix `[A-D]`). Accepts compact `AB123456C` and space-separated `AB 12 34 56 C` forms. | `[nationalId]` |
| `piiPatterns.nationalIdByLocale.fr()` | French NIR validator (15 digits, sex prefix `1` or `2`, mod-97 check key). Accepts compact and canonical-spaced (`X XX XX XXXXX XXX XX`) forms. Examples shown in tests use a synthetic placeholder body (`2000000000001` — sex=2 / year=00 / dept=00 / commune=000 / seq=001 — not a real demographic profile). | `[nationalId]` |
| `piiPatterns.nationalIdByLocale.it()` | Italian Codice Fiscale validator (16 alphanumeric, position-weighted check letter, `RSSMRA85T10A562X` shape). | `[nationalId]` |
| `piiPatterns.nationalIdByLocale.es()` | Spanish DNI validator (8 digits + check letter from mod-23 lookup `TRWAGMYFPDXBNJZSQVHLCKE`). | `[nationalId]` |
| `piiPatterns.nationalIdByLocale.pt()` | Portuguese NIF validator (9 digits, weighted mod-11 check digit). Word-boundary anchored extraction + check-digit gate keeps false-positive rate down on bare 9-digit numerics in CV text. | `[nationalId]` |

Note: unlike the other pattern factories (which return `RegExp`), the `phoneByLocale.*()` factories return a **validator function** `(candidate: string) => boolean` backed by `libphonenumber-js` directly. API-choice rationale is documented inline in `src/patterns.ts` (file-header JSDoc → "Factory API choice: validator over RegExp") and in `docs/Handover-2.md` § Factory API choice.

Order of application in `sanitizePii`: **email → addresses (en, fr, de, it, es, pt) → postcodes (uk, fr, de, it, es, pt) → nationalIds (it, uk, fr, es, pt) → dob → localePhones (fr, de, gb, it, es, pt) → intlPhone → domesticPhone**. (Under `profile: 'cv'` — v1.3, issue #64 — the `dob` step redacts only cue-labelled dates via `dobContextCuePattern`; every other step is unchanged.) This order is mandatory:

- Addresses run **before** postcodes so a full structured address like `12 rue de la Paix, 75001 Paris` consumes the street run first; the residual `75001 Paris` is then redacted by the postcode pass.
- Addresses also run **before** phone so the leading house number is not eaten by the phone pattern.
- Postcodes run **before** phone — 5-digit continental postcodes and UK/PT alphanumerics are disjoint from every phone candidate, but ordering is pinned for future-proofing.
- **National-IDs (R10 — v1.1) run after postcodes and before DOB.** PT NIF's bare 9-digit shape could otherwise eat the 5-digit portion of a postcode sequence; running PT NIF after postcodes guarantees postcodes are consumed first. National-IDs run before DOB so 15-digit NIRs and 16-char Codice Fiscales (which contain date-shaped digit substrings) are claimed whole before DOB tries its `DD[./-]MM[./-]YYYY` regex. The validator-factory pattern (extract candidate via bounded regex, then apply per-locale check-digit / HMRC invalid-prefix rules) keeps the false-positive rate acceptable on free CV text — see Patterns table for per-locale algorithm notes.
- **DOB runs before phones (reordered in v1.1 for R2)** — v1.0.0 placed DOB last because the NANP regex could not mis-match `DD.MM.YYYY` sequences, but `libphonenumber-js`'s broader candidate-finder does recognise date-like digit sequences (`23.05.1985`, `1985-05-23`) as valid phone numbers in DE + other locales. DOB's regex is precise enough (anchored `\b`, specific separator alternation) that it cannot mis-match NANP or EU phone shapes, so flipping the order is safe. See `src/sanitize-pii.ts` header docblock (i)-(iii) rationale.
- **Locale-aware phones run before NANP fallback** — a FR number `06 12 34 56 78` must be consumed whole by the locale pass; the NANP regex could otherwise match a 3-3-4 substring and leave `06 ` dangling.

Tests pin the ordering with adversarial fixtures (`src/__tests__/sanitize-pii.test.ts`, `src/__tests__/locale-patterns.test.ts`).

## Known Limitations (C2 per compliance review)

What this library deliberately or currently does not catch is recorded in [`docs/compliance/redaction-record.md`](docs/compliance/redaction-record.md), which is the single authority for it. Read **§ 5 Known limitations** for the residual gaps themselves, each with its direction (recall, precision, scope or control gap) and status; **§ 4 Review-finding index** for the review identifier behind each one (R / S / T / IMP / MIN / CRIT / C / I), where it is implemented and the test that pins it; and **§ 3 Design rationale** for why each pattern has the shape it has. This section is a pointer to that record, not a second copy of it.

### Performance — measured and reported, not enforced

Two tests time a fixed ~10 KB workload of mixed EU-style PII over 10 runs and print the mean as a `[measured] …` line — `src/__tests__/locale-patterns.test.ts` for the `sanitizePii` regex pipeline alone, and `src/__tests__/pii-middleware.test.ts` for `piiMiddleware.transformParams` end to end (which additionally pays the JSON deep clone and message traversal). Read the figures in `npm test` output or in the CI `test` job log. **Neither is a gate.** The thresholds they asserted until 2026-09-07 and why they were removed are in the record at § 4.1. The locale-aware phone pass adds six `findPhoneNumbersInText` calls per `sanitizePii` invocation; each is O(n) over the input and backed by `libphonenumber-js/min` metadata (~19KB gz).

### Bundle size impact (v1.1 R2)

`libphonenumber-js@1.12.41/min` adds ~89 KB uncompressed / ~21 KB gzipped to the runtime footprint (6.2 KB runtime JS + 82.5 KB metadata.min.json, gzipped to 1.6 KB + 19.1 KB). The `/min` bundle is selected over `/max` and `/mobile` because explicit default-country validation (as used here) does not require the full metadata table. Acceptable for a server-side middleware package; flagged for awareness on client-bundle use cases.

## Security Posture (S11)

This package is a compliance control on the LLM prompt edge. A silent compromise would leak user PII to the third-party LLM processor on every call with zero visible symptom to end users or operators. Supply-chain posture accordingly:

- **S1 — `main` branch protection.** **Deferred under reduced-tier security posture (2026-04-19 decision, single-maintainer internal package — see `docs/Handover-35.md`).** Intent: required reviews ≥ 1, dismiss stale approvals, required status checks (lint, typecheck, test, redos-scan, audit, dependency-review), signed commits, linear history, block force push, plus CODEOWNERS gating `.github/`, `package.json`, `package-lock.json`, `src/patterns.ts`, `src/pii-middleware.ts`. Current state: `main` has no protection rules; solo-maintainer discipline relies on feature-branch workflow + per-PR CI gates. S1 will move to "in place" alongside S2 + S3 in a later sprint if the threat model shifts (external distribution, multi-maintainer).
- **S2 — tag ruleset.** **Deferred under reduced-tier security posture (2026-04-19 decision, single-maintainer internal package — see `docs/Handover-35.md`).** Intent: a `v*.*.*` tag ruleset with restrict-deletions + restrict-updates (immutable) + maintainers-only authorship. Current state: tags are mutable / deletable by the sole maintainer without a ruleset. Consumers pin by exact tag per `docs/INTEGRITY.md`; tag immutability becomes meaningful only once external consumers share the threat surface. S2 will activate alongside S1 + S3 when posture escalates.
- **S3 — GPG-signed tags.** **Deferred under reduced-tier security posture (2026-04-19 decision, single-maintainer internal package — see `docs/Handover-35.md`).** Intent is to cut every release tag with an annotated `git tag -s` signed by a dedicated Ed25519 hardware-token key (YubiKey 5 series) published in `docs/SIGNING-TAGS.md`. Current state: `git log v1.0.0 --show-signature` returns no signature line. Consumer-side `git log --show-signature` workflow documented in [`docs/INTEGRITY.md`](docs/INTEGRITY.md) for when S3 activates; until then it is a no-op. S3 will move to "in place" alongside S1 + S2 in a later sprint if the threat model shifts (external distribution, multi-maintainer).
- **S4 — npm publish with provenance.** **Not applicable under the git-install architecture** (v1.0.0 onwards — see `docs/Handover-35.md` § Architecture pivot 2026-04-19). There is no npm registry publish step; consumers install directly from the git tag and build `dist/` via the `prepare` lifecycle script. Build integrity is the consumer's own CI concern (building from a pinned git tag is deterministic). If the package is later promoted to a registry for external distribution, the `publish.yml` workflow can be revived from git history at commit `877b478`.
- **S5 — ReDoS scanner in CI.** `recheck` v4.x (NOT the unmaintained `safe-regex`) runs programmatically over `src/patterns.ts` via `scripts/redos-scan.mjs` as a required CI check. `eslint-plugin-redos@^4` also runs via `npm run lint`.
- **S6 — dependency-review-action@v4.** Required CI check on every PR; fails on high/critical CVE or GPL-family licence.
- **S7 — Dependabot.** Weekly npm + github-actions updates; no auto-merge (every bump goes through branch-protected PR).
- **S8 — Socket.dev GitHub App.** Behavioural analysis of every new dep (install scripts, network access, filesystem writes, typosquat).
- **S9 — Org 2FA enforcement.** `kgn-git` organisation enforces 2FA on all members.
- **S10 — Consumer-side typosquat defence.** **Not applicable under the git-install architecture** (v1.0.0 onwards — see `docs/Handover-35.md` § Architecture pivot 2026-04-19). There is no npm registry lookup, so typosquat on `npm.pkg.github.com` is not a threat surface. Replaced by consumer **exact-tag git-ref pinning** in `package.json` (e.g. `"@kgn-git/privacy-utils": "github:kgn-git/ai-privacyutils#v1.0.0"`) — npm resolves the named tag from the pinned GitHub repo directly; no registry intermediary; upgrades are explicit PR-gated ref bumps.
- **S12 — Runtime input-length cap (v1.1, issue #10).** Belt-and-braces ReDoS defence. Every call to `sanitizePii(text, options?)` enforces `text.length <= options.maxInputLength` (default `DEFAULT_MAX_INPUT_LENGTH` = 500_000 JS string code units, ~500 KB ASCII) with an O(1) gate that runs BEFORE any regex. Over-cap inputs throw `PiiInputTooLargeError` with numeric `.inputLength` and `.maxInputLength` props. `createPiiMiddleware({ maxInputLength })` threads the cap into every internal `sanitizePii` call applied to prompt / message-content / text-part / reasoning-part strings; the cap is enforced **per part** (one regex pass = one bounded cost), not summed across a prompt. Complements S5 (static `recheck` lint): S5 catches known super-linear shapes at CI time; S12 bounds worst-case CPU at runtime regardless of static-analysis gaps. Full design in `docs/adr/002-input-length-cap.md`.
- **Kerckhoffs-aligned posture (v1.2+).** This package is designed to remain robust under public source disclosure. Redaction recall does not depend on attacker ignorance of pattern shapes — adversarial fixtures are part of the test suite (`src/__tests__/locale-patterns.test.ts`, cohort-benchmark tests), and code reviews exercise narrowing on attacker-aware bypass attempts. The visible pattern set is the contract; security-by-obscurity is not part of the threat model. This is the explicit Art. 32 framing for the public-source posture: "appropriate technical measures" remain in place when the source is open.

Security review history is recorded in this repo's commit log and `docs/Handover-N.md` series.

**Threat model:** a single maintainer-account takeover or a single un-reviewed commit to `main` can subvert the entire LLM path of any consumer that wires this middleware in. The hardening budget is therefore weighted toward prevention at the authoring boundary (S1–S3) and end-to-end integrity attestation (S4) with scanners (S5–S8) as second line.

## Integrity verification

Consumer-side integrity posture under the git-install architecture is elaborated in **[`docs/INTEGRITY.md`](docs/INTEGRITY.md)**. It covers exact-tag vs commit-SHA pinning and the threat-model trade-off between them, clone-URL verification against typosquat at the git-URL level, a forward-looking `git log --show-signature` consumer workflow for when S3 (GPG-signed tags) activates, and an explicit enumeration of integrity properties the git-install path does NOT currently provide (no Sigstore Rekor attestation on the artefact; `npm audit signatures` is a no-op). It also records a future SLSA upgrade path — the deleted `publish.yml` workflow at commit `877b478` extended with `actions/attest-build-provenance@v2.3.0` — as an *available option, not planned work*, should the package later be promoted to external distribution.

The basic pinning rule ("pin to an exact tag... never use a branch name or `main`") in § Installation is the install-time contract; `docs/INTEGRITY.md` is the threat-model elaboration for consumers who need to reason about what that pin actually protects against.

## SemVer policy

The package is compliance-critical — regressions in recall on canonical inputs are breaking changes even when the code change is subtractive.

| Change | Bump |
|---|---|
| Pattern removal | **Major** |
| Default replacement-token rename (e.g. flipping default from `[email]` to `<<REDACTED_EMAIL>>` — scheduled for v2.0 per issue #9) | **Major** |
| Order-of-application reshuffling that changes output on fixtures | **Major** |
| New pattern (e.g. national-ID in v1.1 for UK/FR/IT/ES/PT, DE in v1.2) | **Minor** |
| New locale coverage (e.g. FR/DE/IT/ES/PT addresses in v1.1) | **Minor** |
| New opt-in option that preserves the v1.0.0 default output byte-identically (e.g. `tokenFormat: 'sentinel'` in v1.1) | **Minor** |
| Pattern tuning — fewer false positives with same recall on all prior fixtures | **Patch** |
| ReDoS-only rewrites that preserve byte-equivalent match behaviour on all fixtures | **Patch** |

Every tag cuts from `main` via a signed annotated tag (see S3). The CHANGELOG records the fixture-level diff for every release.

## API reference

### `sanitizePii(text: string, options?: SanitizePiiOptions): string`

Pure, one-way redaction. Idempotent. Empty input returns empty string. Non-PII input returns input unchanged.

Options:

- `options.tokenFormat?: 'readable' | 'sentinel'` (v1.1 — issue #9) — defaults to `'readable'` (v1.0.0 byte-identical). Pass `'sentinel'` for `<<REDACTED_X>>` low-collision tokens. See the Opt-in sentinel tokens section above.
- `options.maxInputLength?: number` (v1.1 — issue #10) — defaults to `DEFAULT_MAX_INPUT_LENGTH` (500_000 JS string code units). Over-cap input throws `PiiInputTooLargeError` BEFORE any regex runs — belt-and-braces ReDoS defence, see S12 in Security posture and `docs/adr/002-input-length-cap.md`.

Throws: `PiiInputTooLargeError` when `text.length > maxInputLength`. The error carries numeric `.inputLength` and `.maxInputLength` props and is an `instanceof Error`.

`SanitizePiiOptions`, `TokenFormat`, `PiiInputTooLargeError`, and `DEFAULT_MAX_INPUT_LENGTH` are exported.

### `piiPatterns`

Dictionary of named **factory functions** (v1.1 shape):

- `piiPatterns.email` — email factory.
- `piiPatterns.address` — English address factory (alias for `piiPatterns.addressByLocale.en`; retained for v1.0.0 consumer backward-compat).
- `piiPatterns.addressByLocale.{en,fr,de,it,es,pt}` — per-locale address factories (new in v1.1).
- `piiPatterns.postcodeByLocale.{uk,fr,de,it,es,pt}` — per-locale bare-postcode factories (new in v1.1).
- `piiPatterns.phoneByLocale.{fr,de,uk,it,es,pt}` — per-locale phone validator factories (new in v1.1, validator function shape).
- `piiPatterns.nationalIdByLocale.{uk,fr,it,es,pt}` — per-locale national-ID validator factories (new in v1.1, R10 — validator function shape; check-digit gating where applicable, regex-only for UK NINO).
- `piiPatterns.phoneInternational`, `piiPatterns.phoneDomestic` — NANP-shape phone factories.
- `piiPatterns.dob` — DOB factory.

Calling any factory returns a fresh `/g`-flagged `RegExp` on every call (see the "Why factories?" note above for the stateful-`lastIndex` rationale). The `phoneByLocale.*()` and `nationalIdByLocale.*()` factories return a `(candidate: string) => boolean` validator function instead.

Individual factories are also exported by name: `emailPattern`, `addressPattern` (EN), `addressFrPattern`, `addressDePattern`, `addressItPattern`, `addressEsPattern`, `addressPtPattern`, `postcodeUkPattern`, `postcodeFrPattern`, `postcodeDePattern`, `postcodeItPattern`, `postcodeEsPattern`, `postcodePtPattern`, `phoneInternationalPattern`, `phoneDomesticPattern`, `dobPattern`, `nationalIdUkValidator`, `nationalIdFrValidator`, `nationalIdItValidator`, `nationalIdEsValidator`, `nationalIdPtValidator`, `nationalIdUkExtractionPattern`, `nationalIdFrExtractionPattern`, `nationalIdItExtractionPattern`, `nationalIdEsExtractionPattern`, `nationalIdPtExtractionPattern`, `computeEsDniCheckLetter`, `computePtNifCheckDigit`, `computeFrNirCheckKey`, `computeItCodiceFiscaleCheckLetter`.

Type exports: `PiiPatternName` (top-level `piiPatterns` keys), `AddressLocale` (EN/FR/DE/IT/ES/PT), `PostcodeLocale` (UK/FR/DE/IT/ES/PT), `PhoneLocale` (FR/DE/UK/IT/ES/PT), `NationalIdLocale` (UK/FR/IT/ES/PT).

### `piiMiddleware: LanguageModelV1Middleware`

Vercel AI SDK v4 middleware. Implements `transformParams` for both `type: 'generate'` and `type: 'stream'` calls. Walks `params.prompt` (string or provider-message array), scrubs string content and `type: 'text'` / `type: 'reasoning'` parts. Non-text parts (image / file / tool-call / tool-result) pass through untouched. Non-prompt params (temperature, maxTokens, etc.) preserved. Does not mutate caller input — clones first.

`piiMiddleware` is the zero-config default (readable tokens, v1.0.0 byte-identical). It is structurally equivalent to `createPiiMiddleware()`.

### `createPiiMiddleware(options?: PiiMiddlewareOptions): LanguageModelV1Middleware`

Middleware factory. Accepts `{ tokenFormat?, maxInputLength? }` and threads both options through every `sanitizePii` call inside `transformParams`. Register a bespoke middleware:

```ts
// Low-collision sentinel tokens + tighter 100 KB cap for an endpoint that
// only handles summaries:
const mw = createPiiMiddleware({
  tokenFormat: 'sentinel',
  maxInputLength: 100_000,
});
```

The `maxInputLength` cap (v1.1 — issue #10) applies per individual text string (each string prompt, each string message content, each text / reasoning part) — NOT summed across all parts of a prompt. Over-cap content causes `sanitizePii` to throw `PiiInputTooLargeError`, which propagates unwrapped out of `transformParams`.

See also: `TOKEN_FORMATS` (constant), `tokensFor(format)` (resolver helper), and the `TokenFormat` / `TokenKind` / `PiiMiddlewareOptions` / `SanitizePiiOptions` type exports. `PiiInputTooLargeError` (class) and `DEFAULT_MAX_INPUT_LENGTH` (const) are exported from the top-level package.

## Contributing

See `CONTRIBUTING.md` for regex design guidance and SemVer decision rules.

## License

MIT. Copyright (c) 2026 kgn-git. See `LICENSE`.
