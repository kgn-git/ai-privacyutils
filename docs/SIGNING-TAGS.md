# Signing tags — maintainer setup guide (S3)

Per `jobflow-programme/docs/security-reviews/SecurityReview-2026-04-19-privacy-utils-v1.0.0-hardening.md` §3, every release tag (pattern `v*.*.*`) on this repository MUST be a GPG-signed annotated tag. The signing key MUST live on a hardware token (YubiKey 5 series recommended) — never on disk in plaintext.

This runbook is a **manual setup** for the release maintainer. It is not automatable — hardware-token provisioning requires physical interaction.

## Why signed tags matter

GPG-signed tags bind the maintainer's identity to the source commit that the tag points at. Combined with `npm publish --provenance` (which binds the tarball to the CI runner), signed tags close the gap that either alone leaves open:

- **GPG-only** doesn't prove the build wasn't tampered with between tag and publish.
- **Sigstore-only** (via npm provenance) doesn't prove the tag was cut by an authorised maintainer.

We need both.

## One-time setup (per maintainer)

### 1. Install GPG and hardware-token middleware

**macOS:**
```bash
brew install gnupg yubikey-personalization
```

**Linux (Ubuntu / Debian):**
```bash
sudo apt install gnupg2 scdaemon pcscd
sudo systemctl enable pcscd
sudo systemctl start pcscd
```

**Windows:** install [Gpg4win](https://www.gpg4win.org/) and plug in the YubiKey; the bundled `gpg-agent` handles smartcard protocol.

### 2. Generate an Ed25519 signing key directly on the YubiKey

Do NOT generate the key on disk and then import — key-on-disk defeats the hardware-token protection. Use `ykman` or `gpg --card-edit` to generate on-card:

```bash
gpg --card-edit
gpg/card> admin
gpg/card> generate
# Answer 'no' to backup (key should never leave the card)
# Key type: ED25519 (option 2 in most prompts; if unavailable, RSA 4096)
# Key expiration: 2 years (then rotate per §4)
# Real name: <Maintainer Name>
# Email: <maintainer-email-on-github>
# Comment: jobflow-privacyutils release key
```

Verify the key landed on-card, not in the keyring:

```bash
gpg --list-secret-keys --with-keygrip
# Expected: "card-no: <serial>" line — NOT a plaintext keygrip
```

### 3. Register the public key on GitHub

```bash
gpg --armor --export <KEY_ID> | pbcopy   # macOS; use `| xclip` on Linux
```

Then paste into **Settings → SSH and GPG keys → New GPG key** in the maintainer's GitHub account. After registration, `https://github.com/<username>.gpg` will resolve to the public key.

### 4. Add the key fingerprint to `docs/SIGNING-TAGS.md`

Append the `FPR:` line to the **Release Maintainers** table below. Do NOT commit the key itself — only the fingerprint.

### 5. Configure git to use the key

```bash
git config --global user.signingkey <KEY_ID>
git config --global tag.gpgSign true
git config --global commit.gpgSign true
```

Per-repo override if the maintainer uses a different identity on other projects:

```bash
git -C <repo> config user.signingkey <KEY_ID>
git -C <repo> config tag.gpgSign true
git -C <repo> config commit.gpgSign true
```

## Per-release workflow

When cutting a release tag:

```bash
git checkout main
git pull --ff-only

# Bump version via PR (signed commit) — see CONTRIBUTING.md § Releasing

# After PR merges to main:
git checkout main
git pull --ff-only
git tag -s v1.0.0 -m "Release v1.0.0 — canonical PII middleware"
# gpg-agent will prompt for YubiKey touch + PIN
git push origin v1.0.0
```

The `-s` flag forces a signed annotated tag. `-m` is required — a lightweight tag without a message cannot be signed.

The `publish` workflow (`.github/workflows/publish.yml`) includes a `verify-tag` job that runs `git verify-tag` and aborts if the tag lacks a valid signature. A failing verify-tag cancels the publish — the package does not go out.

## Key rotation

Rotate the signing key every 24 months, or immediately on suspected compromise. Rotation:

1. Generate a new key on the YubiKey (repeat §2).
2. Register the new public key on GitHub (§3).
3. Add the new fingerprint to the table below.
4. Publish a revocation certificate for the old key (`gpg --gen-revoke <OLD_KEY_ID>`).
5. Upload revocation to the keyserver pool: `gpg --keyserver keys.openpgp.org --send-keys <OLD_KEY_ID>`.
6. Remove the old public key from GitHub.
7. Announce on the repo's README via a `Security — Key Rotation` note for 30 days.

**Do NOT delete the old fingerprint from this file** — historical tags were signed by it, so verifying them later requires the record.

## Release Maintainers

| Maintainer | GitHub | GPG Fingerprint | Valid From | Valid To |
|---|---|---|---|---|
| _TBD_ | _TBD_ | _Pending — populated on first release tag._ | _TBD_ | _TBD_ |

## Related documents

- `jobflow-programme/docs/security-reviews/SecurityReview-2026-04-19-privacy-utils-v1.0.0-hardening.md` — full threat model + S3 rationale.
- `CONTRIBUTING.md` § Releasing — caller-side release workflow.
- `.github/workflows/publish.yml` — CI verification of tag signatures.
