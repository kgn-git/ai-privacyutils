# Branch + tag rulesets

These JSON files document the intended branch-protection and tag-protection configuration for `kgn-git/jobflow-privacyutils` per security review §2 (S1) and §3.1 (S2).

The dispatcher attempts to apply these rulesets via `gh api --method POST /repos/kgn-git/jobflow-privacyutils/rulesets` during initial repo setup. If that call fails due to permissions (which is expected for an org-owned repo where only org admins can create rulesets), the user must apply them manually via the GitHub UI:

1. Go to **Settings → Rules → Rulesets → New ruleset**.
2. For `main.json`: create a branch ruleset named `main-protected` with the settings in the JSON file.
3. For `tags.json`: create a tag ruleset named `tag-protected` with the settings in the JSON file.

Alternatively, the JSON files can be applied with the `gh` CLI once an org admin is authenticated:

```bash
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  /repos/kgn-git/jobflow-privacyutils/rulesets \
  --input .github/branch-rulesets/main.json

gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  /repos/kgn-git/jobflow-privacyutils/rulesets \
  --input .github/branch-rulesets/tags.json
```

## Notes

- The `required_status_checks` list references check contexts that CI publishes once `.github/workflows/ci.yml` runs on a PR. The ruleset should be applied AFTER the first PR runs CI so the check contexts exist in GitHub's database.
- The `bypass_actors` array is intentionally empty — no bypass is permitted on `main` or on release tags.
- `required_signatures` on `main` covers commits; on tags it covers annotated-tag signatures.

See `docs/SIGNING-TAGS.md` for the maintainer-side GPG key setup that `required_signatures` enforces.
