# Integrity verification — consumer-side posture

This document is a **deeper elaboration of the consumer-side integrity posture** under the git-install architecture. It sits alongside `README.md` § Installation (basic install command) and `README.md` § Security Posture (maintainer-side supply-chain controls S1–S12). It exists so that consumers can reason about what pinning actually protects against — and, equally importantly, what it does not.

## Pin exact tags or commit SHAs — never ranges or branches

Consumer `package.json` MUST pin an exact git ref. Never use `^`, `~`, `>=`, `latest`, or branch names such as `main`:

```json
// Tag pin (recommended for readability):
"@kgn-git/privacy-utils": "github:kgn-git/ai-privacyutils#v1.0.0"

// SHA pin (stricter — see trade-off below):
"@kgn-git/privacy-utils": "github:kgn-git/ai-privacyutils#c1a1a2d"

// NEVER — floats with the branch and re-resolves on every install:
// "@kgn-git/privacy-utils": "github:kgn-git/ai-privacyutils#main"
```

npm supports range-like syntax in the git-ref position (e.g. `semver:^1.0.0`), but this package does not publish a registry tarball, so **there is no semver range to resolve** — the `#ref` after the `github:` specifier is what determines the installed code. Range syntax silently resolves to whatever happens to be on `main` and should not be used.

## Tag pinning vs commit-SHA pinning — trade-off

Both a tag pin and a SHA pin lock to a specific point in history at install time. The difference is what happens after:

| Pin form | Protects against | Does NOT protect against | Readability |
|---|---|---|---|
| **Tag** (`#v1.0.0`) | Drift of `main` between install runs; transitive `npm install` re-resolution on consumer-side dependency churn | A compromised maintainer account **moving** the `v1.0.0` tag to a different commit after release (tags are mutable refs in git; tag immutability is a policy, not a protocol) | High — human-readable SemVer |
| **Commit SHA** (`#c1a1a2d`) | Both of the above, plus tag movement. SHA is content-addressed by git — moving a tag cannot change what a pinned SHA resolves to | Does not protect against a malicious commit whose SHA you knowingly pinned (out of scope of supply-chain threat model) | Lower — opaque hex, upgrade diffs are noisier |

**Recommendation:** tag pinning is the default for consumer readability and upgrade ergonomics. Escalate to SHA pinning when the consumer repo is security-sensitive enough that "the tag is immutable by policy" is not a sufficient assumption — e.g. regulated-sector deployments, or if the package's maintainer account reduces to a single individual. The two forms interoperate; SHA-pinned deployments can still be bumped by replacing the SHA with a newer tag's underlying commit.

**On tag mutability.** Git permits `git push --force origin v1.0.0` to overwrite a tag; GitHub branch protection does not by default prevent it. This repository's S2 (tag ruleset — see `README.md` § Security Posture) is declared to restrict tag updates, but branch-protection policy is an operator-side assumption, not a cryptographic guarantee. SHA pinning removes the assumption entirely.

## Clone URL verification — typosquat at the git-URL level

The git-install architecture eliminates npm-registry typosquat (see S10) but introduces the symmetric class at the git-URL level. Consumer `package.json` MUST reference the canonical repository URL:

```
github:kgn-git/ai-privacyutils
```

Lookalike owner or repo names (e.g. `kgn-gіt/ai-privacyutils` with a homoglyph Cyrillic `і`, or `kgn-git/ai-privacy-utils` with an inserted hyphen) would install arbitrary code bearing the same package name. Install-time defences:

- Treat the git URL as part of the dependency's trust boundary — review it at code-review time alongside the `#ref`, not only the ref.
- In consumer CI, pin `GITHUB_TOKEN` to a scope that can only read the canonical repo — a typosquatted URL will 401 rather than silently install attacker code.
- If the consumer uses a dependency-pinning tool (e.g. Renovate), ensure its configuration validates the full `github:owner/repo` spec, not only the `#ref`.

## Future `git log --show-signature` workflow (post-S3)

This section is forward-looking. S3 (GPG-signed tags) is **currently deferred** — at the v1.0.0 maturity level, release tags are not cut with `git tag -s` and `git log --show-signature` against `v1.0.0` returns no signature line. Once S3 is enabled, consumers will be able to verify tag provenance against a published maintainer fingerprint:

```bash
# Inside the consumer's node_modules after install — or against a clone:
git -C node_modules/@kgn-git/privacy-utils log --show-signature -1 v1.0.0
# Expected (post-S3): "gpg: Good signature from <maintainer> ..." with fingerprint
# matching docs/SIGNING-TAGS.md
```

The workflow is documented here so consumers can wire it into CI once S3 activates (signal: v1.1 or later release tag emits a signature line; `docs/SIGNING-TAGS.md` is promoted from maintainer-setup runbook to consumer-facing verification guide). Until then it is a no-op and provides no security property.

## v1.2 NER engine — `compromise` lockfile pin (no out-of-band artifact)

v1.2 adds `compromise` v14 + 3 transitive dependencies as runtime dependencies. All four packages are distributed entirely within their npm tarballs — there is no out-of-band asset (model weights, binary blob, CDN-hosted artefact). `package-lock.json`'s `sha512` integrity hash on each tarball is the in-band equivalent of the SHA-256 model-weight pin that the rejected ML approach (ADR 003 / Hybrid C — transformers.js + ONNX) would have required for `dist/models/`. No additional artifact pinning is needed for the v1.2 NER path. See ADR 004 § decision 1 for full engine choice rationale.

## What is NOT currently provided (explicit)

- **No Sigstore Rekor attestation on the git-install artefact.** Under the git-install architecture there is no published tarball, no `npm publish --provenance`, and therefore no `actions/attest-build-provenance` Sigstore record. GitHub Actions records workflow runs and their commit SHAs — this is auditable via the repository UI and `gh run view` — but is not a cryptographic integrity attestation on a consumer-installed artefact.
- **No consumer-run `npm audit signatures`.** This command verifies registry-side provenance; under git-install there is no registry entry for it to check. Running it produces an empty-set result, not a green-tick.
- **No per-consumer integrity hash in `package-lock.json` that binds to a build attestation.** npm records the git SHA of the installed ref in the lockfile, which is integrity-equivalent to SHA pinning at that point in time but does not extend to a signed claim about the build process.

## Future SLSA upgrade path (option, not commitment)

If this package is later promoted to external distribution — e.g. published as a tarball attached to a GitHub Release for consumers outside the `kgn-git` organisation — a Sigstore Rekor attestation can be re-introduced **without** re-introducing the npm registry: the deleted `publish.yml` workflow can be revived from git history at commit `877b478`, stripped of the `npm publish` step, and extended with `actions/attest-build-provenance@v2.3.0` to attach a Sigstore record covering the source commit and the `dist/` tarball attached to the GitHub Release. Consumers would then verify via `gh attestation verify` against the release asset. This is an **available path, not planned work** — no issue is filed, no roadmap commitment is made; documented here only so that a future decision to promote the package does not have to re-derive the design.
