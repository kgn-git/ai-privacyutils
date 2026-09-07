# Security policy

`@kgn-git/privacy-utils` is a compliance-critical PII-redaction library. This document covers vulnerability disclosure and the security scope this project commits to.

## Reporting a vulnerability

Use **GitHub Private Vulnerability Reporting** to report security issues:

1. Go to the repo's **Security** tab on GitHub.
2. Click **"Report a vulnerability"**.
3. File a private advisory with reproduction details + suspected impact.

This is the canonical channel. Do NOT open a public issue for an undisclosed vulnerability — coordinated disclosure is preferred.

## SLA

**This package is provided as-is, with no SLA.** The maintainer will respond and remediate on a best-effort basis. No specific acknowledgement or fix windows are committed. Critical issues will be prioritised over non-critical ones, but no time guarantee is offered.

The "AS IS" warranty disclaimer + liability limitation in [`LICENSE`](LICENSE) (paragraphs 2–3 of standard MIT) reflect this stance.

## In scope

Reports are welcome on:

- **PII redaction recall regressions** — adversarial inputs that bypass `sanitizePii` / `sanitizePiiAsync` / `piiMiddleware` against canonical fixture coverage (email, address, phone, postcode, DOB, national-ID, person name).
- **ReDoS surface** — pathological regex inputs that cause super-linear time on patterns in `src/patterns.ts` or `src/patterns-national-id.ts`. The runtime input-length cap (S12, `DEFAULT_MAX_INPUT_LENGTH = 500_000` code units) is the existing belt-and-braces defence; reports of bypasses are in scope.
- **Supply-chain integrity** — concerns about `package-lock.json` hashes, dependency CVEs not caught by Dependabot / `dependency-review-action`, or CI workflow steps that could be subverted.

## Out of scope

- **Kerckhoffs-style "pattern visibility" reports.** This package is designed to be robust under public source disclosure. Redaction recall does not depend on attacker ignorance of pattern shapes — see [`README.md`](README.md) § Security Posture for the fuller framing. The pattern set is the contract; security-by-obscurity is not part of the threat model.
- **General code-quality opinions** — file structure, naming, comment density, etc.
- **Performance-tuning suggestions** that don't tie back to a security-bounded budget.

## Install-time execution surface

This package is git-installable. When consumers run `npm install` against a `package.json` pinning `@kgn-git/privacy-utils` via `github:` shorthand, npm clones the pinned tag and runs the package's `prepare` lifecycle script. The `prepare` script invokes `tsc -p tsconfig.build.json` and nothing else — no shell calls, no network access, no filesystem writes outside `dist/`. Consumers reasoning about install-time execution surface should treat this as a single TypeScript compilation step.

## Disclosure timeline

Vulnerabilities are disclosed via GitHub Security Advisory once a fix is shipped. CVE numbering will be requested for issues that meet the GitHub criteria.

## Further reading

- [`README.md`](README.md) § Security Posture (S11) — full supply-chain posture, deferred-tier rationale, and forward-looking activation paths for S1/S2/S3.
- [`docs/compliance/redaction-record.md`](docs/compliance/redaction-record.md) — the redaction contract, per-pattern rationale, review-finding index and known limitations.
- [`docs/INTEGRITY.md`](docs/INTEGRITY.md) — consumer-side integrity guidance under git-install architecture.
- [`docs/Handover-35.md`](docs/Handover-35.md) § Security Posture Decision — original deferred-tier decision rationale.
- Issue [#49](https://github.com/kgn-git/ai-privacyutils/issues/49) — S1/S2/S3 re-evaluation 30 days post-public-flip.
