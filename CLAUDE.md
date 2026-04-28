# CLAUDE.md

Project guidance for Claude Code on `@kgn-git/privacy-utils`.

---

## Purpose

`@kgn-git/privacy-utils` is the canonical PII-redaction library for the Jobflow programme. It exposes:

- `sanitizePii(text)` — pure one-way redaction for email / address / phone / DOB in arbitrary text.
- `piiPatterns` — object of factory functions (each call returns a fresh `RegExp` with `/g`); factories prevent stateful-`lastIndex` bugs on programmatic `.test()` / `.exec()` reuse. Invoke as `piiPatterns.email()`.
- `piiMiddleware` — Vercel AI SDK middleware (`LanguageModelV1Middleware`) that hooks `transformParams` to scrub prompts before SDK emission.

Consumers: `jobflow-scoring` (scoring#82) and `jobflow-platform` (platform#476). The package closes a pre-existing GDPR Art. 5(1)(c) / 25 / 32 compliance gap on platform's LLM path.

## Project class

**Utility package** under the programme governance taxonomy (see `../jobflow-programme/CLAUDE.md` § Managed Projects). Utility-class projects use the leaner expert roster defined below — full application rosters (`/product-owner`, `/ui-expert`, `/hr-advisor`, `/data-engineer`) do not apply here.

## Expert Roster

Pre-implementation expert advisors for issues in this repo. The programme-manager and project-manager MUST engage the relevant subset before dispatching `/developer`. Skills are invoked via the `Skill` tool.

| Expert | When to engage | Mandatory for |
|---|---|---|
| `/compliance-officer` | Any change touching redaction patterns, design-intent docs, or data-class scope (GDPR Art. 4(5)/5/9/13/25/28/30/32, EU AI Act, DPIA pre-screen) | All `compliance`-labelled issues; all R-prefixed issues |
| `/security-expert` | Supply-chain posture, ReDoS surface, dependency additions, threat-model framing, error-class info-leak | All `ci-hardening`-labelled issues; any new runtime dependency; any pattern addition |
| `/tech-expert` | API-surface decisions, factory-vs-singleton patterns, SOLID/OCP review on locale-scoped extensions, ADRs | Any new exported API; any new locale-keyed sub-object; any ADR |
| `/tech-ops-expert` | Bundle-size delta, cold-start latency, consumer-side budgets, CI workflow changes | Any new runtime dependency; any benchmark-bearing AC; supply-chain workflow changes |

**Skipped for this project class:** `/product-owner`, `/ui-expert`, `/hr-advisor`, `/data-engineer` — utility-package work has no UI surface, no end-user product decisions, no recruitment-domain logic, no database schema. Engage only if a future scope expansion warrants it (document the deviation).

**Pre-implementation review evidence required.** Every Handover-N.md MUST contain a `## Pre-Implementation Expert Reviews` section listing each expert consulted, the verdict (PASS / WARN / FAIL with note), and a link to where the consultation lives (issue comment, ADR, programme-level review). Programme-level reviews satisfy this requirement when they explicitly cover the issue's surface (e.g. v1.0.0 reviews cover R1/R2/R5 baseline; pivot-driven scope changes require fresh consultations).

## Conventions

- **SemVer policy:** major = pattern removal or semantic break; minor = new pattern / new locale coverage; patch = pattern tuning (same semantics).
- **Compliance-critical:** every change to `src/patterns.ts` or `src/sanitize-pii.ts` must preserve the byte-equivalent behaviour of prior releases on shared test fixtures. Regressions in recall on canonical inputs are breaking changes.
- **TDD (SI-001):** every test file ships in a RED commit before the GREEN implementation commit.
- **Supply-chain posture (reduced-tier, 2026-04-19 decision).** Single-maintainer internal package consumed via git-install. Active controls: ReDoS CI lint (`recheck` v4.x + `eslint-plugin-redos`), Dependabot with `semver-major` blocked, `dependency-review-action@v4`, S6/S7/S11 maintained. **Deferred under reduced-tier:** S1 branch protection, S2 tag ruleset, S3 GPG-signed tags, S8 npm-org policies. **N/A under git-install:** S4 npm publish provenance, S10 npm typosquat. See `README.md` § Security Posture and `docs/INTEGRITY.md` for current state and forward-looking activation paths.

## Distribution

**Git-installable private package** under the `kgn-git` GitHub organisation. Consumers add to `package.json`:

```json
{
  "dependencies": {
    "@kgn-git/privacy-utils": "github:kgn-git/jobflow-privacyutils#v1.0.0"
  }
}
```

`npm install` clones the pinned tag and runs the package's `prepare` lifecycle script to build `dist/`. Consumers need `Repository permissions: Contents: Read` on `kgn-git/jobflow-privacyutils` (automatic for org members; CI runners need a token). **No npm-registry publish step** — see `docs/Handover-35.md` § Architecture pivot 2026-04-19 for full rationale and `docs/INTEGRITY.md` for consumer-side integrity guidance (tag-vs-SHA pinning, clone-URL verification, deferred S3 verification path).

## Programme coordination

This repo is one of five in the Jobflow ecosystem. Cross-project coordination lives in `../jobflow-programme/`. Skills are shared from `jobflow-programme/.claude/skills/` via directory junction.

## Links

- Programme issue: [`kgn-git/jobflow-programme#35`](https://github.com/kgn-git/jobflow-programme/issues/35)
- Compliance review: `../jobflow-programme/docs/compliance-reviews/ComplianceReview-2026-04-19-privacy-utils-v1.0.0.md`
- Security review: `../jobflow-programme/docs/security-reviews/SecurityReview-2026-04-19-privacy-utils-v1.0.0-hardening.md`
- Programme plan: `../jobflow-programme/docs/ProgrammePlan-2026-04-19-sprint-2k-unified-llm-caches.md`
- Canonical source of ported regex: `../jobflow-scoring/src/lib/services/cv-chunker.ts:72-91`
