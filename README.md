# `@kgn-git/privacy-utils`

Canonical PII-redaction library for the Jobflow programme. Provides pure `sanitizePii`, composable `piiPatterns`, and a Vercel AI SDK middleware (`piiMiddleware`) that scrubs PII from LLM prompts at the single latest application-layer chokepoint before the SDK serialises the provider HTTP call.

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

## Pattern inventory

| Export (call with `()`) | Matches | Replacement token |
|---|---|---|
| `piiPatterns.email()` | `local@domain.tld` (RFC 5321-bounded, ASCII only) | `[email]` |
| `piiPatterns.address()` | US/UK number-first street address with English terminator (Street / Avenue / …) and optional direction suffix; accepts mixed-case street names (e.g. `McLane Drive`, `LA Cienega Boulevard`) | `[address]` |
| `piiPatterns.phoneInternational()` | `+?CC-3-3-4` NANP-shape | `[phone]` |
| `piiPatterns.phoneDomestic()` | `3-3-4` NANP-shape fallback | `[phone]` |
| `piiPatterns.dob()` | Numeric `DD.MM.YYYY` / `DD/MM/YYYY` / `DD-MM-YYYY` / `YYYY-MM-DD` + named-month EN/FR/DE/IT/ES/PT | `[dob]` |

Order of application in `sanitizePii`: **email → address → intlPhone → domesticPhone → dob**. This order is mandatory — swapping phone before address causes the phone pattern to eat the house number in a street address; swapping dob before phone causes numeric `DD.MM.YYYY` sequences to be mis-matched as phone digit runs. Tests pin the ordering with adversarial fixtures.

## Known Limitations (C2 per compliance review)

**The v1.0.0 pattern scope materially under-covers non-English PII for Jobflow's six-locale product (EN / FR / DE / IT / ES / PT).** The following are documented gaps that consuming apps SHOULD mitigate with caller-level scrubbing for non-English content until v1.1 ships locale-aware patterns via [`libphonenumber-js`](https://github.com/catamphetamine/libphonenumber-js) and per-locale regex sets.

| Ref | Gap | Severity | v1.0.0 status | Planned |
|---|---|---|---|---|
| R1 | Non-English postal addresses (FR `rue de la Paix`, DE `Hauptstraße 23`, IT `Via Roma 15`, ES `Calle Mayor 10`, PT `Rua das Flores 45`) pass through unredacted. Postal codes alone (UK `SW1A 2AA`, FR `75001`, DE `80331`) not covered. | High | Not mitigated | v1.1 — locale-aware address regex sets |
| R2 | EU-native mobile phone formats (FR `06 12 34 56 78` 2-2-2-2-2 grouping, DE `030 12345678` 3+8 variable, UK `07700 900123` 5+6, IT / ES / PT CC-prefixed groupings) systematically under-match the NANP-shape regex. | High | Not mitigated | v1.1 — `libphonenumber-js` integration |
| R3 | Applicant's full name in CV header flows unredacted. Regex is an inappropriate tool (CVs are lists of proper nouns — company names, universities, referees). NER is the right tool. | Medium | Not mitigated | v1.2 — NER-based name redaction (Microsoft Presidio or equivalent) |
| R5 | IDN email addresses with non-ASCII local or domain part (`françois@école.fr`, `user@münchen.de`) pass through unredacted. Punycode-encoded (`xn--…`) addresses DO match. | Low | Not mitigated | v1.1 — widen character classes / validated-email parser |
| R10 | National-level identifiers (French NIR, UK NINO, Italian Codice Fiscale, Spanish DNI, Portuguese NIF) not covered. Rare in modern CVs but can occur in regulated sectors. | Low | Not mitigated | v1.2 — national-ID pattern set |

**Consuming apps SHOULD add caller-level scrubbing for non-English content until v1.1 lands.** For scoring, the existing `sanitizePii` on the chunker boundary (`cv-chunker.ts:186`, `cv-chunker.ts:203`) and post-LLM evidence-quote scrubbing (`llm-coverage.service.ts:178`) remain in place as defence-in-depth. Platform callers producing CV content from non-English sources should run `sanitizePii` once at the caller layer in addition to the middleware.

## Security Posture (S11)

This package is a canonical compliance control on the LLM prompt edge. A silent compromise would leak CV PII to OpenAI on every call with zero visible symptom to applicants or operators. Supply-chain posture accordingly:

- **S1 — `main` branch protection.** Required reviews ≥ 1; dismiss stale approvals on new commits; required status checks (lint, typecheck, test, redos-scan, audit, dependency-review); signed commits required; linear history; block force push. CODEOWNERS gates `.github/`, `package.json`, `package-lock.json`, `src/patterns.ts`, `src/pii-middleware.ts`.
- **S2 — tag ruleset.** `v*.*.*` tag pattern: restrict deletions, restrict updates (immutable), maintainers only.
- **S3 — GPG-signed tags.** v1.0.0 and every release tag is an annotated `git tag -s` signed with a dedicated Ed25519 hardware-token key (YubiKey 5 series) registered under the release-maintainer GitHub account. Key fingerprint published in `docs/SIGNING-TAGS.md`.
- **S4 — npm publish with provenance.** **Not applicable under the git-install architecture** (v1.0.0 onwards — see `docs/Handover-35.md` § Architecture pivot 2026-04-19). There is no npm registry publish step; consumers install directly from the git tag and build `dist/` via the `prepare` lifecycle script. Build integrity is the consumer's own CI concern (building from a pinned git tag is deterministic). If the package is later promoted to a registry for external distribution, the `publish.yml` workflow can be revived from git history at commit `877b478`.
- **S5 — ReDoS scanner in CI.** `recheck` v4.x (NOT the unmaintained `safe-regex`) runs programmatically over `src/patterns.ts` via `scripts/redos-scan.mjs` as a required CI check. `eslint-plugin-redos@^4` also runs via `npm run lint`.
- **S6 — dependency-review-action@v4.** Required CI check on every PR; fails on high/critical CVE or GPL-family licence.
- **S7 — Dependabot.** Weekly npm + github-actions updates; no auto-merge (every bump goes through branch-protected PR).
- **S8 — Socket.dev GitHub App.** Behavioural analysis of every new dep (install scripts, network access, filesystem writes, typosquat).
- **S9 — Org 2FA enforcement.** `kgn-git` organisation enforces 2FA on all members.
- **S10 — Consumer-side typosquat defence.** **Not applicable under the git-install architecture** (v1.0.0 onwards — see `docs/Handover-35.md` § Architecture pivot 2026-04-19). There is no npm registry lookup, so typosquat on `npm.pkg.github.com` is not a threat surface. Replaced by consumer **exact-tag git-ref pinning** in `package.json` (e.g. `"@kgn-git/privacy-utils": "github:kgn-git/jobflow-privacyutils#v1.0.0"`) — npm resolves the named tag from the pinned GitHub repo directly; no registry intermediary; upgrades are explicit PR-gated ref bumps.

Full security review: `jobflow-programme/docs/security-reviews/SecurityReview-2026-04-19-privacy-utils-v1.0.0-hardening.md`.

**Threat model:** a single maintainer-account takeover or a single un-reviewed commit to `main` can subvert the entire Jobflow LLM path. The hardening budget is therefore weighted toward prevention at the authoring boundary (S1–S3) and end-to-end integrity attestation (S4) with scanners (S5–S8) as second line.

## SemVer policy

The package is compliance-critical — regressions in recall on canonical inputs are breaking changes even when the code change is subtractive.

| Change | Bump |
|---|---|
| Pattern removal or replacement-token rename (e.g. `[email]` → `<<REDACTED_EMAIL>>`) | **Major** |
| Order-of-application reshuffling that changes output on fixtures | **Major** |
| New pattern (e.g. national-ID in v1.2) | **Minor** |
| New locale coverage (e.g. FR/DE/IT/ES/PT addresses in v1.1) | **Minor** |
| Pattern tuning — fewer false positives with same recall on all prior fixtures | **Patch** |
| ReDoS-only rewrites that preserve byte-equivalent match behaviour on all fixtures | **Patch** |

Every tag cuts from `main` via a signed annotated tag (see S3). The CHANGELOG records the fixture-level diff for every release.

## API reference

### `sanitizePii(text: string): string`

Pure, one-way redaction. Idempotent. Empty input returns empty string. Non-PII input returns input unchanged.

### `piiPatterns`

Record of named **factory functions**: `email`, `address`, `phoneInternational`, `phoneDomestic`, `dob`. Calling a factory (`piiPatterns.email()`) returns a fresh `/g`-flagged `RegExp`. Individual factories also exported as `emailPattern`, `addressPattern`, `phoneInternationalPattern`, `phoneDomesticPattern`, `dobPattern`. See the "Why factories?" note above for the stateful-`lastIndex` rationale.

### `piiMiddleware: LanguageModelV1Middleware`

Vercel AI SDK v4 middleware. Implements `transformParams` for both `type: 'generate'` and `type: 'stream'` calls. Walks `params.prompt` (string or provider-message array), scrubs string content and `type: 'text'` / `type: 'reasoning'` parts. Non-text parts (image / file / tool-call / tool-result) pass through untouched. Non-prompt params (temperature, maxTokens, etc.) preserved. Does not mutate caller input — clones first.

## Contributing

See `CONTRIBUTING.md` for regex design guidance and SemVer decision rules.

## License

Proprietary. See `LICENSE`.
