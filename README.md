# `@kgn-git/privacy-utils`

Canonical PII-redaction library for the Jobflow programme. Provides pure `sanitizePii`, composable `piiPatterns`, a Vercel AI SDK middleware (`piiMiddleware`), and a middleware factory (`createPiiMiddleware`) that scrubs PII from LLM prompts at the single latest application-layer chokepoint before the SDK serialises the provider HTTP call. v1.1 adds opt-in low-collision sentinel tokens (`tokenFormat: 'sentinel'` → `<<REDACTED_X>>`) per compliance review §R8.

v1.0.0 ships the first-ever PII redaction on the Jobflow platform's LLM path, closing a pre-existing GDPR Art. 5(1)(c) / 25 / 32 compliance gap. It is consumed by [`jobflow-scoring`](https://github.com/kgn-git/jobflow-scoring) (scoring#82) and [`jobflow-platform`](https://github.com/kgn-git/jobflow-platform) (platform#476).

## Installation

`@kgn-git/privacy-utils` ships as a private git-installable package for consumption inside the Jobflow programme. There is **no npm registry publish step** — consumers install directly from the git tag.

### Consumer setup

In the consumer repo's `package.json`, add a dependency pinned to an exact git tag:

```json
{
  "dependencies": {
    "@kgn-git/privacy-utils": "github:kgn-git/jobflow-privacyutils#v1.0.0"
  }
}
```

When `npm install` runs, npm clones the tag at the named ref, runs the package's `prepare` script to build `dist/`, and the resulting artefacts are available at `@kgn-git/privacy-utils` in `node_modules/`. Consumers need **read access to `kgn-git/jobflow-privacyutils`** (automatic for org members; CI runners need a token).

For CI runners, provide a Personal Access Token or a GitHub App token with `Repository permissions: Contents: Read` on `kgn-git/jobflow-privacyutils`, exported as `GITHUB_TOKEN` (or whatever variable your package manager uses for private git access).

### Version pinning

- Pin to an **exact** tag (`v1.0.0`, `v1.1.0`, etc.) — never use a branch name or `main`.
- Upgrading is an explicit PR that bumps the `#vX.Y.Z` ref.
- Semver implications:
  - **Major bump** (`v2.0.0`) — breaking API change; migration required.
  - **Minor bump** (`v1.1.0`) — additive new patterns / locale coverage.
  - **Patch bump** (`v1.0.1`) — pattern tuning; no semantic change.

### Why git-install rather than npm registry?

Single-org internal consumption; two consumer repos (`jobflow-scoring`, `jobflow-platform`). npm registry publish would require tokens + `.npmrc` config per consumer + registry attack surface. The git-install path avoids all of this with equivalent version-pinning ergonomics. See `docs/Handover-35.md` § Architecture pivot 2026-04-19 for full rationale.

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

**Idempotency invariant.** The sentinel strings (`<<REDACTED_*>>`) are structurally pattern-disjoint from every v1.x redaction pattern — no `@`, no digits, no `\b\d` prefix, no lowercase street-type keyword, no closed-set prefix keyword. Running `sanitizePii` twice in either format is a strict no-op; sentinel output sanitised again in readable mode is also a no-op. The ADR + invariant proof lives in `src/token-format.ts`.

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

`@kgn-git/privacy-utils` is the Jobflow programme's formalised Art. 5(1)(c) data-minimisation control for LLM prompt emission.

- **Art. 5(1)(c) — data minimisation.** LLM operations across the programme (skill extraction, cover-letter generation, gap analysis, CV tailoring, embeddings, translation) are content-shape transformations. None require the applicant's email, phone, postal address, or DOB as input signal. Redacting those classes before emission is the textbook minimisation measure.
- **Art. 25 — privacy by design and by default.** The middleware placement at `transformParams` is the single latest application-layer intercept — every SDK-based LLM call passes through automatically once the middleware is registered on the model. Running later (provider-SDK patch) cedes control; running earlier (per-caller) fragments enforcement. Privacy-by-default (Art. 25(2)) holds because redaction is on as soon as the middleware is registered; opting out requires an explicit code change.
- **Art. 32 — security of processing.** Regex redaction is an appropriate technical measure at the v1.0.0 maturity level given the risk profile (B2C advisory feedback, OpenAI as contracted processor). Full pattern audit in `jobflow-programme/docs/compliance-reviews/ComplianceReview-2026-04-19-privacy-utils-v1.0.0.md` §5.

This package does not create a new Art. 13 disclosure obligation. Platform-side privacy notices should nonetheless note that PII redaction is applied before third-party LLM processing (it is both accurate and claims the minimisation credit).

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

Note: unlike the other pattern factories (which return `RegExp`), the `phoneByLocale.*()` factories return a **validator function** `(candidate: string) => boolean` backed by `libphonenumber-js` directly. API-choice rationale is documented inline in `src/patterns.ts` (file-header JSDoc → "Factory API choice: validator over RegExp") and in `docs/Handover-2.md` § Factory API choice.

Order of application in `sanitizePii`: **email → addresses (en, fr, de, it, es, pt) → postcodes (uk, fr, de, it, es, pt) → dob → localePhones (fr, de, gb, it, es, pt) → intlPhone → domesticPhone**. This order is mandatory:

- Addresses run **before** postcodes so a full structured address like `12 rue de la Paix, 75001 Paris` consumes the street run first; the residual `75001 Paris` is then redacted by the postcode pass.
- Addresses also run **before** phone so the leading house number is not eaten by the phone pattern.
- Postcodes run **before** phone — 5-digit continental postcodes and UK/PT alphanumerics are disjoint from every phone candidate, but ordering is pinned for future-proofing.
- **DOB runs before phones (reordered in v1.1 for R2)** — v1.0.0 placed DOB last because the NANP regex could not mis-match `DD.MM.YYYY` sequences, but `libphonenumber-js`'s broader candidate-finder does recognise date-like digit sequences (`23.05.1985`, `1985-05-23`) as valid phone numbers in DE + other locales. DOB's regex is precise enough (anchored `\b`, specific separator alternation) that it cannot mis-match NANP or EU phone shapes, so flipping the order is safe. See `src/sanitize-pii.ts` header docblock (i)-(iii) rationale.
- **Locale-aware phones run before NANP fallback** — a FR number `06 12 34 56 78` must be consumed whole by the locale pass; the NANP regex could otherwise match a 3-3-4 substring and leave `06 ` dangling.

Tests pin the ordering with adversarial fixtures (`src/__tests__/sanitize-pii.test.ts`, `src/__tests__/locale-patterns.test.ts`).

## Known Limitations (C2 per compliance review)

v1.1 resolves **R1** (locale-aware postal addresses + bare postcodes for FR/DE/IT/ES/PT + UK), **R2** (EU-native mobile + landline phone formats via `libphonenumber-js`), **R5** (IDN email addresses), **R7** (ReDoS risk on adversarial input — runtime input-length cap, see S12 in Security posture), and **R8** (replacement-token collision — opt-in `tokenFormat: 'sentinel'`). Residual gaps after v1.1 are documented below with narrowed scope.

| Ref | Gap | Severity | v1.1 status | Planned |
|---|---|---|---|---|
| R1 | ~~Non-English postal addresses pass through unredacted.~~ **Resolved in v1.1** for structured FR/DE/IT/ES/PT addresses (covering the common prefix-keyword and compound-suffix forms) and bare UK/FR/DE/IT/ES/PT postcodes. | High | **Resolved** | v1.1 (this release) |
| R1-residual | Address name tokens with apostrophes (e.g. `O'Brien Road`), German multi-word prefix forms (`Unter den Linden 5`, `Am Markt 3`), non-EU locales (NL, BE, SE, …), all-caps headers (`BAKER STREET`), and lowercase UK postcodes in free text are NOT covered. | Medium | Not mitigated | Future — narrow pattern extensions per compliance re-review |
| R2 | ~~EU-native mobile phone formats (FR `06 12 34 56 78`, DE `030 12345678`, UK `07911 123456`, IT / ES / PT CC-prefixed groupings) systematically under-match the NANP-shape regex.~~ **Resolved in v1.1** via `libphonenumber-js@1.12.41/min` — per-locale `phoneByLocale.{fr,de,uk,it,es,pt}()` validator factories + locale-aware pass in `sanitizePii`. NANP-shape `phoneInternational` / `phoneDomestic` fallbacks retained for backward-compat with v1.0.0 consumers. | High | **Resolved** | v1.1 (this release) |
| R2-residual | Non-EU locales (US, CA, AU, IN, JP, …) still handled by the NANP-shape fallback only — recall degraded for non-NANP international numbers outside the six EU locales. Very short digit runs without phone formatting (bare `12345678` with no separators, no country code) are intentionally NOT redacted — libphonenumber-js metadata would accept them as valid DE short-codes but this over-redacts SKUs / order-IDs in CV free text. Guard rationale: `PHONE_FORMATTED_RE` heuristic in `sanitize-pii.ts`. | Low | Not mitigated | v1.2 — extend `phoneByLocale` to additional countries based on consumer demand |
| R3 | Applicant's full name in CV header flows unredacted. Regex is an inappropriate tool (CVs are lists of proper nouns — company names, universities, referees). NER is the right tool. | Medium | Not mitigated | v1.2 — NER-based name redaction (Microsoft Presidio or equivalent) |
| R5 | ~~IDN email addresses with non-ASCII local or domain part (`françois@école.fr`, `user@münchen.de`) pass through unredacted.~~ **Resolved in v1.1** via Unicode property escapes (`\p{L}\p{N}`) + `u` flag + negative-lookahead Unicode boundary in `emailPattern()`. IDN local parts (RFC 6531 / SMTPUTF8), IDN domains (RFC 5892 / IDNA 2008), Unicode TLDs (`.中国`), and punycode-encoded (`xn--…`) addresses all redact correctly. Greedy `{2,24}` TLD consumption over-redacts email-shaped Unicode tokens — correct privacy trade-off (see `src/__tests__/idn-email.test.ts`). | Low | **Resolved** | v1.1 (this release) |
| R7 | ~~ReDoS risk on adversarial input. Static CI lint (`recheck` + `eslint-plugin-redos`) catches known super-linear shapes but can miss novel combinations, especially around Unicode property escapes.~~ **Resolved in v1.1** via runtime input-length cap (`sanitizePii`/`createPiiMiddleware` `{ maxInputLength }`, default `DEFAULT_MAX_INPUT_LENGTH` = 500_000 code units). O(1) gate runs BEFORE any regex; over-cap inputs throw `PiiInputTooLargeError`. See ADR 002 (`docs/adr/002-input-length-cap.md`) and S12 in Security posture. | Medium | **Resolved** | v1.1 (this release) |
| R10 | National-level identifiers (French NIR, UK NINO, Italian Codice Fiscale, Spanish DNI, Portuguese NIF) not covered. Rare in modern CVs but can occur in regulated sectors. | Low | Not mitigated | v1.2 — national-ID pattern set |
| R8 | ~~Replacement tokens `[email]` / `[phone]` / `[address]` / `[postcode]` / `[dob]` collide with user-authored literal strings. Not cryptographically distinguishable from authored text.~~ **Resolved in v1.1** via opt-in `tokenFormat: 'sentinel'` option — produces `<<REDACTED_X>>` low-collision tokens. Default remains `'readable'` (v1.0.0 byte-identical); default swap to sentinel deferred to v2.0 for SemVer. | Low | **Resolved (opt-in)** | v1.1 (this release) |

Both **R1** (v1.1 #1) and **R2** (v1.1 #2) are now in-package. Consuming apps no longer need caller-level scrubbing for FR/DE/IT/ES/PT structured addresses, UK/FR/DE/IT/ES/PT postcodes, or any of the six supported phone locales. For scoring, the existing `sanitizePii` on the chunker boundary (`cv-chunker.ts:186`, `cv-chunker.ts:203`) and post-LLM evidence-quote scrubbing (`llm-coverage.service.ts:178`) remain in place as defence-in-depth.

**Performance budget:** `sanitizePii` completes under 10ms on a ~10KB prompt containing mixed EU-style PII (verified by `src/__tests__/locale-patterns.test.ts` performance test — 10-run mean). The locale-aware phone pass adds six `findPhoneNumbersInText` calls per `sanitizePii` invocation; each is O(n) over the input and backed by `libphonenumber-js/min` metadata (~19KB gz). The performance assertion remains green at the v1.1 gate.

**Bundle size impact (v1.1 R2):** `libphonenumber-js@1.12.41/min` adds ~89 KB uncompressed / ~21 KB gzipped to the runtime footprint (6.2 KB runtime JS + 82.5 KB metadata.min.json, gzipped to 1.6 KB + 19.1 KB). The `/min` bundle is selected over `/max` and `/mobile` because explicit default-country validation (as used here) does not require the full metadata table. Acceptable for a server-side middleware package; flagged for awareness on client-bundle use cases.

## Security Posture (S11)

This package is a canonical compliance control on the LLM prompt edge. A silent compromise would leak CV PII to OpenAI on every call with zero visible symptom to applicants or operators. Supply-chain posture accordingly:

- **S1 — `main` branch protection.** **Deferred under reduced-tier security posture (2026-04-19 decision, single-maintainer internal package — see `docs/Handover-35.md`).** Intent: required reviews ≥ 1, dismiss stale approvals, required status checks (lint, typecheck, test, redos-scan, audit, dependency-review), signed commits, linear history, block force push, plus CODEOWNERS gating `.github/`, `package.json`, `package-lock.json`, `src/patterns.ts`, `src/pii-middleware.ts`. Current state: `main` has no protection rules; solo-maintainer discipline relies on feature-branch workflow + per-PR CI gates. S1 will move to "in place" alongside S2 + S3 in a later sprint if the threat model shifts (external distribution, multi-maintainer).
- **S2 — tag ruleset.** **Deferred under reduced-tier security posture (2026-04-19 decision, single-maintainer internal package — see `docs/Handover-35.md`).** Intent: a `v*.*.*` tag ruleset with restrict-deletions + restrict-updates (immutable) + maintainers-only authorship. Current state: tags are mutable / deletable by the sole maintainer without a ruleset. Consumers pin by exact tag per `docs/INTEGRITY.md`; tag immutability becomes meaningful only once external consumers share the threat surface. S2 will activate alongside S1 + S3 when posture escalates.
- **S3 — GPG-signed tags.** **Deferred under reduced-tier security posture (2026-04-19 decision, single-maintainer internal package — see `docs/Handover-35.md`).** Intent is to cut every release tag with an annotated `git tag -s` signed by a dedicated Ed25519 hardware-token key (YubiKey 5 series) published in `docs/SIGNING-TAGS.md`. Current state: `git log v1.0.0 --show-signature` returns no signature line. Consumer-side `git log --show-signature` workflow documented in [`docs/INTEGRITY.md`](docs/INTEGRITY.md) for when S3 activates; until then it is a no-op. S3 will move to "in place" alongside S1 + S2 in a later sprint if the threat model shifts (external distribution, multi-maintainer).
- **S4 — npm publish with provenance.** **Not applicable under the git-install architecture** (v1.0.0 onwards — see `docs/Handover-35.md` § Architecture pivot 2026-04-19). There is no npm registry publish step; consumers install directly from the git tag and build `dist/` via the `prepare` lifecycle script. Build integrity is the consumer's own CI concern (building from a pinned git tag is deterministic). If the package is later promoted to a registry for external distribution, the `publish.yml` workflow can be revived from git history at commit `877b478`.
- **S5 — ReDoS scanner in CI.** `recheck` v4.x (NOT the unmaintained `safe-regex`) runs programmatically over `src/patterns.ts` via `scripts/redos-scan.mjs` as a required CI check. `eslint-plugin-redos@^4` also runs via `npm run lint`.
- **S6 — dependency-review-action@v4.** Required CI check on every PR; fails on high/critical CVE or GPL-family licence.
- **S7 — Dependabot.** Weekly npm + github-actions updates; no auto-merge (every bump goes through branch-protected PR).
- **S8 — Socket.dev GitHub App.** Behavioural analysis of every new dep (install scripts, network access, filesystem writes, typosquat).
- **S9 — Org 2FA enforcement.** `kgn-git` organisation enforces 2FA on all members.
- **S10 — Consumer-side typosquat defence.** **Not applicable under the git-install architecture** (v1.0.0 onwards — see `docs/Handover-35.md` § Architecture pivot 2026-04-19). There is no npm registry lookup, so typosquat on `npm.pkg.github.com` is not a threat surface. Replaced by consumer **exact-tag git-ref pinning** in `package.json` (e.g. `"@kgn-git/privacy-utils": "github:kgn-git/jobflow-privacyutils#v1.0.0"`) — npm resolves the named tag from the pinned GitHub repo directly; no registry intermediary; upgrades are explicit PR-gated ref bumps.
- **S12 — Runtime input-length cap (v1.1, issue #10).** Belt-and-braces ReDoS defence. Every call to `sanitizePii(text, options?)` enforces `text.length <= options.maxInputLength` (default `DEFAULT_MAX_INPUT_LENGTH` = 500_000 JS string code units, ~500 KB ASCII) with an O(1) gate that runs BEFORE any regex. Over-cap inputs throw `PiiInputTooLargeError` with numeric `.inputLength` and `.maxInputLength` props. `createPiiMiddleware({ maxInputLength })` threads the cap into every internal `sanitizePii` call applied to prompt / message-content / text-part / reasoning-part strings; the cap is enforced **per part** (one regex pass = one bounded cost), not summed across a prompt. Complements S5 (static `recheck` lint): S5 catches known super-linear shapes at CI time; S12 bounds worst-case CPU at runtime regardless of static-analysis gaps. Full design in `docs/adr/002-input-length-cap.md`.

Full security review: `jobflow-programme/docs/security-reviews/SecurityReview-2026-04-19-privacy-utils-v1.0.0-hardening.md`.

**Threat model:** a single maintainer-account takeover or a single un-reviewed commit to `main` can subvert the entire Jobflow LLM path. The hardening budget is therefore weighted toward prevention at the authoring boundary (S1–S3) and end-to-end integrity attestation (S4) with scanners (S5–S8) as second line.

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
| New pattern (e.g. national-ID in v1.2) | **Minor** |
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
- `piiPatterns.phoneInternational`, `piiPatterns.phoneDomestic` — NANP-shape phone factories.
- `piiPatterns.dob` — DOB factory.

Calling any factory returns a fresh `/g`-flagged `RegExp` on every call (see the "Why factories?" note above for the stateful-`lastIndex` rationale).

Individual factories are also exported by name: `emailPattern`, `addressPattern` (EN), `addressFrPattern`, `addressDePattern`, `addressItPattern`, `addressEsPattern`, `addressPtPattern`, `postcodeUkPattern`, `postcodeFrPattern`, `postcodeDePattern`, `postcodeItPattern`, `postcodeEsPattern`, `postcodePtPattern`, `phoneInternationalPattern`, `phoneDomesticPattern`, `dobPattern`.

Type exports: `PiiPatternName` (top-level `piiPatterns` keys), `AddressLocale` (EN/FR/DE/IT/ES/PT), `PostcodeLocale` (UK/FR/DE/IT/ES/PT).

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

Proprietary. See `LICENSE`.
