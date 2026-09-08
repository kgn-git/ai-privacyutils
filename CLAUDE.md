# CLAUDE.md

`@kgn-git/privacy-utils` — the Jobflow programme's PII-redaction library (email, phone, address, postcode, date of birth and national IDs across six EU locales; opt-in NER for person names). Consumed by git tag; the public surface is `src/index.ts` only.

## Run and test

```bash
npm ci
npm test              # vitest — src/**/__tests__ and scripts/**/__tests__
npm run build         # tsc emit to dist/
npm run lint          # eslint src (max-lines + eslint-plugin-redos)
npm run lint:ratio    # comment-ratio ratchet against the merge base with origin/main
npm run redos:scan    # recheck over every pattern factory in dist/patterns.js
```

CI runs the same gates on every PR. `locale-patterns.test.ts` and `pii-middleware.test.ts` each time a fixed ~10 KB workload and print the mean as a `[measured] …` line; those two figures are reported, never asserted. One wall-clock threshold does remain — `ner-engine.test.ts:76` (`expect(dt).toBeLessThan(50)`, a proxy for module absence, tracked as #81) — and it reads host load as a failure: run that file alone before calling a red there a regression.

## Standards

File size and comments: Enforced in this repo by the CI `lint` job (eslint `max-lines` + `scripts/comment-ratio.mjs`) on every PR; the limits are stated in code-standards.md, not here.

Redaction output is the compliance contract: a change to any pattern or to `sanitize-pii*.ts` keeps every existing fixture green, and a regex change ships its fixture in a RED commit first. Conventions in `CONTRIBUTING.md`; disclosure in `SECURITY.md`.

## Workspace

One of the Jobflow workspace repos. Process rules, `code-standards.md` and the skills live in `../jobflow-programme/.claude/skills/` (see the workspace `CLAUDE.md`).
