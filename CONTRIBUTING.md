# Contributing to `@kgn-git/privacy-utils`

This package is a compliance-critical control on the LLM prompt edge of every Jobflow LLM call. Contributions are subject to higher scrutiny than typical application code. Please read this document in full before opening a PR.

## Local development

```bash
git clone https://github.com/kgn-git/jobflow-privacyutils.git
cd jobflow-privacyutils
npm ci
npm test                # vitest
npm run build           # tsc
npm run lint            # eslint + eslint-plugin-redos
npm run redos:scan      # recheck over src/patterns.ts
```

All four commands must pass before a PR is mergeable. CI enforces the same four gates.

## Regex design guidance (compliance-critical)

Regex patterns in `src/patterns.ts` are the compliance contract of this package. Any change to them has programme-wide impact.

### ReDoS-safe construction rules

1. **Never use unbounded `+` or `*` on an overlapping character class adjacent to another quantifier.** The 2nd-degree polynomial in the canonical scoring source (`[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,4}`) is the exact anti-pattern. Bound every repeating quantifier with a hard upper cap (`{1,64}`, `{1,253}`, `{2,24}` etc.).
2. **Anchor the left boundary with a negative lookbehind on the character class.** Example: `(?<![a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]{1,64}` prevents the regex from being dragged left across adjacent text that happens to match the local-part character class. This was the fix for the 4th-degree polynomial in `emailPattern` v1.0.0.
3. **Separate character classes on either side of a separator.** For email, local-part chars and domain-label chars are disjoint (local part has `_%+`, domain label has `-` but not `.`). For hostnames, separate each dotted label into its own character class.
4. **Run `npm run redos:scan` before every commit that touches `src/patterns.ts`.** Verdict MUST be `safe` for every exported pattern. `unknown (timeout)` is NOT acceptable on release commits — rewrite until the pattern proves `safe` inside the 30 s budget.
5. **Add a fixture test for every new alternation branch.** Adversarial fixtures should cover the common false-positive traps (e.g. `@acme` social handle non-match, `March 1985` month-year-only non-match).

### Byte-equivalent behaviour on ported patterns

v1.0.0's email / address / phone patterns are ports from `jobflow-scoring/src/lib/services/cv-chunker.ts:72-91`. Future patch-level rewrites (ReDoS hardening without semantic change) MUST preserve byte-equivalent output on every fixture in `src/__tests__/sanitize-pii.test.ts`. If a rewrite changes output on even one fixture, it is no longer a patch — bump the minor (additive recall) or major (removed recall) per the SemVer policy in `README.md`.

When in doubt, add the fixture to the test suite BEFORE the regex rewrite and watch it go from RED to GREEN. The test suite is the compliance contract.

### Locale expansion (v1.1+)

Locale-aware patterns (FR / DE / IT / ES / PT address + phone) are the top-priority v1.1 additions per compliance review §7 R1+R2. When implementing them:

- Add per-locale exports (`addressPatternFr`, `addressPatternDe`, …). Do NOT bake them into the existing `addressPattern` — preserve byte-equivalent behaviour on the v1.0.0 English-only pattern so consumers who don't need locale coverage see no behaviour change.
- Update `piiPatterns` to a nested record: `{ email, phone: { international, domestic, fr, de, ... }, address: { en, fr, de, ... }, dob }`. This is a minor bump per SemVer policy (additive).
- Phone should use [`libphonenumber-js`](https://github.com/catamphetamine/libphonenumber-js) rather than hand-rolled regexes — the library handles CC-specific grouping conventions correctly and is maintained by phone-number specialists.

## SemVer decision flowchart

When opening a PR, explicitly pick the bump in the PR description:

1. Does the change REMOVE a pattern or RENAME a replacement token? → **Major**.
2. Does the change ADD a pattern or add a new locale? → **Minor**.
3. Does the change preserve byte-equivalent output on all `sanitize-pii.test.ts` fixtures? → **Patch**.
4. If you cannot answer any of the above confidently, add fixtures that disambiguate and re-run.

Breaking changes are discouraged before v2.0 — prefer adding a parallel pattern under a new name and deprecating the old one over two minor releases.

## Commit + PR discipline

- Every commit references the issue: `feat(#<n>)`, `fix(#<n>)`, `test(#<n>)`, `docs(#<n>)`.
- Tests land in a RED commit before the GREEN implementation commit (SI-001 per programme process rules).
- PRs are approved by a reviewer other than the author. The `privacy-utils-maintainers` team is set up in the `kgn-git` org; see `CODEOWNERS`.
- Never push directly to `main`. The branch is protected.
- Never amend after push (tags are immutable; commits are reviewable history).

## Releasing

Tags are cut from `main` by a maintainer:

1. Bump `version` in `package.json` to match the tag about to be cut. Commit via PR (`release: v<x>.<y>.<z>`) — signed commit, single-line conventional commit message.
2. After merge: `git checkout main && git pull --ff-only`.
3. `git tag -s v<x>.<y>.<z> -m "Release v<x>.<y>.<z> — <short change summary>"`. The `-s` flag forces a GPG-signed annotated tag.
4. `git push origin v<x>.<y>.<z>`. The `publish` workflow triggers and:
   - verifies the tag signature (`git verify-tag` CI step);
   - runs the full test + lint + redos-scan suite;
   - `npm publish --provenance --access restricted` to `npm.pkg.github.com`;
   - `actions/attest-build-provenance@v1` attests the `dist/**` artefacts to Sigstore Rekor.

Maintainer GPG key management and the hardware-token setup guide live in `docs/SIGNING-TAGS.md`.

## Security reports

Vulnerability reports: open a GitHub Security Advisory on this repo, or email the release maintainer listed in `docs/SIGNING-TAGS.md`. Do NOT open a public issue for undisclosed vulnerabilities.
