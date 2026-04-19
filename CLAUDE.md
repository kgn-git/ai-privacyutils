# CLAUDE.md

Project guidance for Claude Code on `@kgn-git/privacy-utils`.

---

## Purpose

`@kgn-git/privacy-utils` is the canonical PII-redaction library for the Jobflow programme. It exposes:

- `sanitizePii(text)` — pure one-way redaction for email / address / phone / DOB in arbitrary text.
- `piiPatterns` — object of factory functions (each call returns a fresh `RegExp` with `/g`); factories prevent stateful-`lastIndex` bugs on programmatic `.test()` / `.exec()` reuse. Invoke as `piiPatterns.email()`.
- `piiMiddleware` — Vercel AI SDK middleware (`LanguageModelV1Middleware`) that hooks `transformParams` to scrub prompts before SDK emission.

Consumers: `jobflow-scoring` (scoring#82) and `jobflow-platform` (platform#476). The package closes a pre-existing GDPR Art. 5(1)(c) / 25 / 32 compliance gap on platform's LLM path.

## Conventions

- **SemVer policy:** major = pattern removal or semantic break; minor = new pattern / new locale coverage; patch = pattern tuning (same semantics).
- **Compliance-critical:** every change to `src/patterns.ts` or `src/sanitize-pii.ts` must preserve the byte-equivalent behaviour of prior releases on shared test fixtures. Regressions in recall on canonical inputs are breaking changes.
- **TDD (SI-001):** every test file ships in a RED commit before the GREEN implementation commit.
- **Supply-chain posture:** branch-protected `main`, signed tags, npm provenance, ReDoS CI lint. See `README.md` § Security posture.

## Registry

Published to GitHub Packages (`npm.pkg.github.com`) as a private scoped package. Consumers need a `.npmrc` with `@kgn-git:registry=https://npm.pkg.github.com` and an auth token in `NODE_AUTH_TOKEN` / `GITHUB_TOKEN` env.

## Programme coordination

This repo is one of four in the Jobflow ecosystem. Cross-project coordination lives in `../jobflow-programme/`. Skills are shared from `jobflow-programme/.claude/skills/` via directory junction.

## Links

- Programme issue: [`kgn-git/jobflow-programme#35`](https://github.com/kgn-git/jobflow-programme/issues/35)
- Compliance review: `../jobflow-programme/docs/compliance-reviews/ComplianceReview-2026-04-19-privacy-utils-v1.0.0.md`
- Security review: `../jobflow-programme/docs/security-reviews/SecurityReview-2026-04-19-privacy-utils-v1.0.0-hardening.md`
- Programme plan: `../jobflow-programme/docs/ProgrammePlan-2026-04-19-sprint-2k-unified-llm-caches.md`
- Canonical source of ported regex: `../jobflow-scoring/src/lib/services/cv-chunker.ts:72-91`
