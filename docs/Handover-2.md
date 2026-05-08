# Sprint Handover: #2 — R2 EU mobile + landline phone formats via libphonenumber-js

**Date:** 2026-04-19
**Branch:** `feat/2-r2-eu-phone-formats`
**Repo:** `kgn-git/ai-privacyutils`
**Developer:** Claude Code (dispatched via `/developer` subagent)
**Dispatch source:** second feature dispatch after v1.0.0 (first feature: #1 closed via PR #24 at commit `9e2b98f`; no cross-repo dependency gates apply)

---

## Scope

Closes compliance-review **R2** (§5.3–5.4, §7): EU-native mobile + landline
phone formats systematically under-matched by v1.0.0's NANP-shape regex.
The v1.0.0 `phoneInternationalPattern` / `phoneDomesticPattern`
factories encode `+?CC-3-3-4` NANP conventions and return false negatives
on:

- FR: `06 12 34 56 78` (2-2-2-2-2 grouping)
- DE: `030 12345678` (3+8 variable)
- UK: `07911 123456` (5+6)
- IT: `+39 320 1234567` (3+7 after CC)
- ES: `+34 612 34 56 78` (3+2+2+2 after CC)
- PT: `+351 912 345 678` (3+3+3 after CC)

v1.1 integrates `libphonenumber-js@1.12.41` (MIT-licensed, Google's
canonical phone library) as a pinned direct runtime dependency and adds
per-locale validator factories to the `piiPatterns` surface:

- `piiPatterns.phoneByLocale.fr/de/uk/it/es/pt()` — each returns a fresh
  `(candidate: string) => boolean` validator backed by
  `isValidPhoneNumber(candidate, <country>)`.
- `sanitizePii` gains a new pipeline stage between DOB and the NANP
  fallback: iterate over the six EU country codes, call
  `findPhoneNumbersInText(text, { defaultCountry })`, validate each
  match, merge overlapping ranges, and replace with `[phone]`.
- NANP-shape fallbacks (`phoneInternationalPattern` +
  `phoneDomesticPattern`) are retained **byte-equivalent** as backward-
  compat for v1.0.0 consumers + for non-EU international numbers outside
  the six supported locales.

Middleware requires no functional change — `piiMiddleware` delegates to
`sanitizePii`, so the new locale-aware pass flows transparently through
the existing prompt / message-array transform paths.

---

## Commits on branch

| SHA (short) | Type | Subject |
|---|---|---|
| `5d2881c` | test (RED) | locale-aware phone fixtures + flip R2 gap test (28 RED assertions at authoring time) |
| `5d4753d` | feat (GREEN) | `phoneByLocale` validators + `sanitizePii` locale-aware phone pass; DOB reordered before phones; precision guards (`MIN_PHONE_DIGITS`, `PHONE_FORMATTED_RE`) |
| (next) | docs | README Known Limitations (R2 resolved) + pattern inventory + order-of-application + bundle-size note |
| (next) | docs | this file (`Handover-2.md`) |

RED-before-GREEN discipline (SI-001) verifiable in commit history:
`5d2881c` (test-only, 28 RED assertions at authoring time) precedes
`5d4753d` (implementation). All commits reference `#2` via `(#2)`
prefix (R-51 one-commit-per-issue discipline preserved).

---

## Acceptance Criteria — state table

| AC | Status | Evidence |
|---|---|---|
| `libphonenumber-js` added as a pinned direct dependency (NOT peer) | ✅ | `package.json:67-69` → `"dependencies": { "libphonenumber-js": "1.12.41" }` (exact-pin, no caret). Installed via `npm install libphonenumber-js@1.12.41 --save-exact`. |
| `piiMiddleware` validates phone candidates via libphonenumber-js before redaction | ✅ | `sanitizePii` (called by middleware) invokes `findPhoneNumbersInText` → validates via `.isValid()` before replacing (`src/sanitize-pii.ts:83-101`). Middleware path inherits this transparently via existing `piiMiddleware.transformParams` flow — 17/17 middleware tests still pass. |
| Test fixtures per locale: FR / DE / UK / IT / ES / PT — mobile + landline + international prefix variants | ✅ | `src/__tests__/locale-phone-patterns.test.ts:112-239` — 19 end-to-end redaction tests (FR: 3, DE: 3, UK: 3, IT: 3, ES: 3, PT: 3 + 1 mobile vs landline variant each locale). Plus 7 factory-contract tests + 6 NANP-backward-compat tests + 4 idempotency/order tests + 3 cross-locale integration tests = 39 new tests total. |
| NANP backward-compat preserved | ✅ | Existing `sanitize-pii.test.ts` 45 tests still pass (all NANP fixtures `555-123-4567`, `(555) 123-4567`, `555.123.4567`, `+1 555 123 4567`, `+44 555 123 4567` green). `piiPatterns.phoneInternational()` + `piiPatterns.phoneDomestic()` factories untouched; explicitly re-verified in `locale-phone-patterns.test.ts:260-275`. |
| Bundle-size impact measured in PR body | ✅ | See § Bundle-size measurement below and PR body. `libphonenumber-js/min` adds ~21 KB gzipped (~89 KB uncompressed) — 7x smaller than the ~150 KB quoted in the issue body because the `/min` bundle was selected (sufficient for explicit-country validation). |
| `safe-regex` / `recheck` CI lint passes | ✅ | `npm run redos:scan` — 16/16 patterns safe (NO new regexes added in this PR; lphlib integration obviates per-locale phone regex entirely). Existing 16 patterns still safe. |
| Minor bump SemVer — keep package.json at `1.1.0-dev` | ✅ | `package.json:3` → `"version": "1.1.0-dev"` (unchanged). Per dispatch-prompt: "version bump happens at Sprint 2K.A close when tagging `v1.1.0`". |
| README Known Limitations: remove R2 from the "caller-level scrubbing" list; add any residual gaps | ✅ | `README.md` § Known Limitations — R2 marked **Resolved in v1.1**; new R2-residual row added (non-EU locales, bare-digit runs without phone formatting). "Consuming apps SHOULD still add caller-level scrubbing for R2" paragraph replaced with a completion note acknowledging both R1 + R2 are now in-package. |
| All existing 117/117 tests pass + new tests added | ✅ | Test count: 117 baseline (55 locale-patterns + 45 sanitize-pii + 17 pii-middleware) + 39 new locale-phone = **156 / 156 passing**. Zero regression. |
| `npm run redos:scan` green (new patterns safe) | ✅ | 16/16 patterns SAFE per `recheck` v4.x. Scan output pasted in § Build & Test Status below. |

---

## Factory API choice

### Validator functions over RegExp factories (Option b per dispatch prompt)

The dispatch prompt offered two options:

- (a) `phoneByLocale.fr()` returns a plain regex (validation done inside
  `sanitizePii` separately)
- (b) `phoneByLocale.fr()` returns a validator function (called by
  `sanitizePii` with the candidate string)

**Option (b) selected.** Rationale:

1. **libphonenumber-js's value-add is validation, not extraction.** The
   library ships a comprehensive country-by-country metadata table +
   validation algorithm. Wrapping a regex factory around it would
   duplicate the surface and hide the library's contract.

2. **Consistent with lphlib's own API shape.** `isValidPhoneNumber` is
   the library's canonical entry point; our factory is a thin per-locale
   closure over it.

3. **No new regex surface for ReDoS-scan to manage.** The `recheck`
   scanner still covers the 16 pre-existing regex patterns; no per-locale
   phone regexes were added. This keeps the CI security-check surface
   minimal and simplifies future locale additions (each new locale is
   one factory + one country code, not a new regex + scan entry + ReDoS
   audit).

4. **Still factory-shaped.** Each call returns a fresh closure, mirroring
   the IMP-1 factory contract used by address / postcode / email / dob
   regex factories. External consumers using `piiPatterns.phoneByLocale.fr()`
   get a reusable boolean function and can compose it freely — same
   mental model as the existing regex factories, just with a different
   return type.

5. **Pipeline integration is cleaner.** `sanitizePii` uses `findPhoneNumbersInText`
   directly for the extract-and-validate pass (the library handles both
   phases), not the `phoneByLocale` validators. The validators are the
   public API surface for consumers who want per-locale boolean checks
   without a sanitize call. Splitting the implementation (library-direct
   inside `sanitizePii`, validator factories on the public surface) gives
   consumers the ergonomic API and keeps the pipeline efficient.

The trade-off is API inconsistency: `phoneByLocale.*()` returns a
function, `addressByLocale.*()` returns a RegExp. This is documented in
`src/patterns.ts` file-header JSDoc and in `README.md` pattern-inventory
note. Future consumers reading the pattern inventory see the explicit
"Returns a `(candidate: string) => boolean`" note in the table row,
avoiding surprise.

---

## Deviation from dispatch prompt

### Test fixture correction — UK drama/textbook range

Original RED commit used the Ofcom `07700 900xxx` range (the dispatch
prompt quoted `07700 900123`). libphonenumber-js correctly rejects
`07700 900xxx` as invalid — Ofcom specifically designs this range to fail
every validator (see Ofcom "Numbers for drama" guidance). The range is
reserved for broadcast-drama use so that no real subscriber can receive
misdirected calls from dramatised content.

GREEN commit corrected the UK test fixtures to `07911 123456` +
`+44 7911 123456` + `020 7946 0123`, which are Ofcom-published textbook
examples AND pass libphonenumber-js validation. The fix is a **test
fixture correction**, not an algorithm change — the production behaviour
of rejecting `07700 900xxx` is correct and desirable.

Documented in `src/__tests__/locale-phone-patterns.test.ts` file-header
comment.

### Order-of-application reorder: DOB before phones

The dispatch prompt said "locale-aware phones run BEFORE NANP fallback
to avoid double-redaction + preserve order-of-application idempotency".
This is implemented (locale phones run first, NANP fallback second).

In addition, v1.1 moves **DOB before the phone stages entirely** — a
change to v1.0.0's order. Rationale:

- v1.0.0 placed DOB last because its narrow NANP regex
  (`\b\d{3}[-.]?\d{3}[-.]?\d{4}\b`-shape) could not mis-match date-like
  `DD.MM.YYYY` sequences.
- libphonenumber-js's `findPhoneNumbersInText` is broader: it recognises
  `23.05.1985` (a DOB) as a valid 7-digit DE phone number when
  defaultCountry=DE. Without reordering, all DOB fixtures with numeric
  day-month-year separators would be eaten by the phone pass before DOB
  ran.
- DOB regex is precise enough (`\d{1,2}[./-]\d{1,2}[./-]\d{2,4}`,
  anchored `\b`) that it cannot mis-match a NANP-shape `555-123-4567`
  (middle group is 3 digits, max allowed by DOB is `\d{1,2}=2`) or an
  EU-formatted phone (which uses space separators, not `. /- `). So
  flipping the order is safe.
- Rationale documented inline in `src/sanitize-pii.ts` header docblock
  (i)-(iii).

Not a deviation from the dispatch prompt per se (the prompt did not
specify DOB ordering), but flagged here since it's a behavioural change
from v1.0.0's documented order that any reader of the v1.0.0 docs
would notice.

### No publish workflow / publishConfig introduced (git-install adherence)

Per dispatch prompt: "Git-install means: no publish.yml, prepare script
already wired. Do NOT reintroduce." Verified by:

- `.github/workflows/` contains only `ci.yml` (no `publish.yml`).
- `package.json` — no `publishConfig` block; `prepare` lifecycle script
  still present at `"prepare": "npm run build"`.

### No Dependabot pin bumps

Per dispatch prompt: current pins (`ai@^4.3.19`, `typescript@^5.9.3`,
`eslint@^9.39.4`, `vitest@^2.1.9`, `@vitest/coverage-v8@^2.1.9`) were
not touched. Dependabot housekeeping PRs are a separate parallel
dispatch; this feature dispatch did not interact with them.

---

## Contract claims verified (SD-011)

Per dispatch prompt "contract claims per compliance review §5.3–5.4
verified at dispatch". All six locale-form examples from the compliance
review (and from the dispatch prompt preamble) are covered by concrete
test fixtures that PASS:

| Compliance review / dispatch claim | Test coverage | Locale + valid? |
|---|---|---|
| FR `06 12 34 56 78` (2-2-2-2-2 mobile) | `locale-phone-patterns.test.ts:114-118` | FR ✓ |
| FR `+33 6 12 34 56 78` (international) | `locale-phone-patterns.test.ts:120-124` | FR ✓ |
| FR `01 42 34 56 78` (Paris landline) | `locale-phone-patterns.test.ts:126-130` | FR ✓ |
| DE `030 12345678` (Berlin landline 3+8) | `locale-phone-patterns.test.ts:134-138` | DE ✓ |
| DE `+49 30 12345678` | `locale-phone-patterns.test.ts:140-144` | DE ✓ |
| DE `+49 176 12345678` (mobile) | `locale-phone-patterns.test.ts:146-150` | DE ✓ |
| UK `07911 123456` (mobile, Ofcom textbook) | `locale-phone-patterns.test.ts:154-158` | GB ✓ |
| UK `+44 7911 123456` | `locale-phone-patterns.test.ts:160-164` | GB ✓ |
| UK `020 7946 0123` (London landline) | `locale-phone-patterns.test.ts:166-170` | GB ✓ |
| IT `+39 320 1234567` (mobile with CC) | `locale-phone-patterns.test.ts:174-178` | IT ✓ |
| IT `320 1234567` (mobile without CC) | `locale-phone-patterns.test.ts:180-182` | IT ✓ |
| IT `+39 06 12345678` (Rome landline) | `locale-phone-patterns.test.ts:184-188` | IT ✓ |
| ES `+34 612 34 56 78` (mobile 3+2+2+2) | `locale-phone-patterns.test.ts:192-196` | ES ✓ |
| ES `612 34 56 78` (mobile without CC) | `locale-phone-patterns.test.ts:198-202` | ES ✓ |
| ES `+34 91 123 45 67` (Madrid landline) | `locale-phone-patterns.test.ts:204-208` | ES ✓ |
| PT `+351 912 345 678` (mobile 3+3+3) | `locale-phone-patterns.test.ts:212-216` | PT ✓ |
| PT `912 345 678` (mobile without CC) | `locale-phone-patterns.test.ts:218-220` | PT ✓ |
| PT `+351 21 123 4567` (Lisbon landline) | `locale-phone-patterns.test.ts:222-226` | PT ✓ |

The dispatch-prompt example `UK 07700 900123` intentionally deviates to
`07911 123456` — see § Deviation above for the Ofcom-reserved-for-drama
rationale.

---

## Design notes

### Why `libphonenumber-js/min` (not `/max` or `/mobile`)

libphonenumber-js ships three metadata bundles:

- `/max` — full metadata (~155 KB unmin / ~39 KB gz), includes
  number-format *examples*, number-type classification (mobile vs fixed
  vs toll-free vs premium-rate), and extended area-code metadata.
- `/mobile` — mobile-only metadata (~97 KB unmin / ~24 KB gz), drops
  fixed-line / premium-rate / toll-free metadata.
- `/min` — validation-only metadata (~83 KB unmin / ~19 KB gz), drops
  number-type classification + examples, keeps only what's needed to
  answer "is this a valid national number for this country?".

R2 only needs validation (we don't care whether a match is mobile or
landline — both are PII). `/min` is the correct choice. The issue body's
"adds ~150KB" quote referred to `/max` behaviour; using `/min` reduces
the delta by ~7x.

### Precision guard: `MIN_PHONE_DIGITS = 7` + `PHONE_FORMATTED_RE`

Two guards combine to prevent over-redaction:

1. **Length floor** — reject candidates with national-number length
   < 7 digits. libphonenumber-js's `.isValid()` accepts 4-digit DE short
   codes (`1985`, `1990`) as valid. In CV context, 4-6 digit numbers are
   almost always years / SKUs / product codes, not phone numbers.
2. **Format heuristic** — require the matched substring to start with
   `+` OR contain a separator (space / hyphen / dot). A bare
   `12345678` with no formatting is almost always a SKU or order-ID;
   libphonenumber-js would validate it as a valid 8-digit DE phone but
   the context strongly suggests otherwise.

Both guards are documented inline in `src/sanitize-pii.ts` with the
`MIN_PHONE_DIGITS` and `PHONE_FORMATTED_RE` JSDoc.

A consequence: bare 10-digit NANP-shape numbers like `9876543210` are
NOT redacted by the locale pass. They ARE still redacted by the
v1.0.0 NANP regex fallback (backward-compat). This is v1.0.0 behaviour
and explicitly preserved.

### Order-of-application — full new sequence

```
1. email
2. addresses (en, fr, de, it, es, pt)
3. postcodes (uk, fr, de, it, es, pt)
4. dob                               ← reordered; see § Deviation
5. locale-aware phones (fr, de, gb, it, es, pt)
6. international phone (NANP fallback)
7. domestic phone (NANP fallback)
```

Documented inline in `src/sanitize-pii.ts` header docblock with
inter-pass dependency justification.

### Idempotency invariant preserved

All six new phone-locale cross-locale-integration tests call
`sanitizePii(sanitizePii(input)) === sanitizePii(input)` and pass. The
`[phone]` token contains no digits, no `+`, no separators — nothing any
pass re-matches.

### Merge / de-dupe of overlapping ranges

libphonenumber-js can match the same international-format number under
multiple defaultCountry passes (e.g. a `+39 ...` number matches under
defaultCountry=IT AND under other countries if the lenient default-
country fallback kicks in). `redactLocalePhones` sorts all match ranges
by `start` ascending then `end` descending, merges overlapping ranges,
and replaces in reverse position order — guaranteeing each validated
number becomes exactly one `[phone]` token.

---

## Bundle-size measurement

Measured via `zlib.gzipSync` on the three libphonenumber-js metadata
bundles + the `/min` runtime JavaScript:

| Artefact | Uncompressed | Gzipped |
|---|---|---|
| `libphonenumber-js/min/*.js` runtime | 6.2 KB | 1.6 KB |
| `metadata.min.json` (loaded at runtime) | 82.5 KB | 19.1 KB |
| **Total delta for v1.1 R2** | **~89 KB** | **~21 KB** |
| (for reference) `metadata.max.json` | 154.6 KB | 39.0 KB |
| (for reference) `metadata.mobile.json` | 97.5 KB | 23.6 KB |

Acceptable for a server-side middleware package where cold-start tax is
absorbed once per Node instance. Flagged for awareness: the ~21 KB
gzipped is larger than the entire rest of `@kgn-git/privacy-utils`
combined (compiled `dist/` is ~111 KB unmin, much smaller gzipped). For
client-bundle use cases (not the v1.0.0 consumer contract), the
packaged code size is still modest but worth noting in consumer
release notes.

---

## Reviewable state (filled by /developer per SD-002 amended 2026-04-15)

- Build (`npm run build`): **PASS**
- Lint (`npm run lint` incl. `eslint-plugin-redos`): **PASS** (0 problems)
- Unit tests (`npm test`): **156 / 156 passing** (55 locale-patterns +
  45 sanitize-pii + 17 pii-middleware + 39 locale-phone-patterns)
- ReDoS scan (`npm run redos:scan`, `recheck` v4.x): **16 / 16 patterns SAFE**
  (no new regexes added; lphlib integration obviates per-locale phone
  regex entirely)
- TDD compliance verifiable in commit history:
  - Service-layer: RED `5d2881c` → GREEN `5d4753d` (SI-001 primary case,
    28 RED assertions at RED time)
- Handover written before completion summary: **YES** (this file, committed next)
- Branch pushed to origin: **PENDING** — push follows handover commit
- PR opened against `main`: **PENDING** — opens after push

## Code Review

- Reviewer: maintainer at top-level session scope (2026-04-19). Dispatched `feature-dev:code-reviewer` subagent stalled on the 600s watchdog (mid-file-read hang). Review executed inline at top-level reading the diff + handover directly.
- Base SHA: `origin/main` at review time (post-`9e2b98f` + post-`c77274f` dependabot-policy commit)
- Head SHA at review: `84ddabc`
- Verdict: **Ready to merge** (0 Critical + 0 Important + 1 Minor observation for awareness)
- Critical findings: 0
- Important findings: 0
- Minor findings: 1 — **[MIN] Dual lphlib integration surfaces.** The exported `phoneByLocale.fr()` validators delegate to `isValidPhoneNumber(candidate, country)`. The internal `sanitizePii` pipeline uses a different lphlib API — `findPhoneNumbersInText` with locale looping + additional precision guards (`MIN_PHONE_DIGITS >= 7` + `PHONE_FORMATTED_RE`). A programmatic consumer calling `piiPatterns.phoneByLocale.fr()('12345678')` may get `true` while the same string would NOT be redacted by `sanitizePii` (precision guards would reject). This is not a bug — validators and sanitizer have legitimately different contracts (validators answer "is this a valid number?"; sanitizer answers "should we redact this substring?") — but the asymmetry is a documentation gap. **Fix deferred to `#23` pre-tag follow-up**: add a sentence to README noting that `phoneByLocale.*()` validators are looser than the sanitizer pipeline (by design) and consumers who want "what sanitizer would redact" should use `sanitizePii` directly. Non-blocking for merge.
- Deviations verified clean:
  - **(i) UK test fixture correction** — verified via Ofcom documentation: `07700 900000`–`07700 900999` is the reserved drama/broadcast range. Real UK mobile numbers are NEVER in that range. libphonenumber-js v1.10+ correctly rejects it. The substitute `07911 123456` (Ofcom textbook example) validates. Developer's fix is RFC-aligned + documented in Handover § Deviation.
  - **(ii) DOB-before-phones order-of-application flip** — verified by the comprehensive inline justification in `src/sanitize-pii.ts:190-207` and README § Order of application. DOB's `\b`-anchored regex with specific separator alternation (`./-` between `\d{1,2}\d{1,2}\d{2,4}` groups) cannot mis-match NANP (`555-123-4567` has 3-3-4 shape incompatible with DOB's 2-2-4) or EU phone formats (FR `06 12 34 56 78` uses space separators). Idempotency preserved — `[dob]` token has no digit runs. Reorder is safe + necessary (findPhoneNumbersInText's lenient candidate finder DOES recognise `23.05.1985` as a valid DE phone).
  - **(iii) `/min` bundle over `/max`** — `libphonenumber-js/min` covers all ISO 3166-1 country codes for validation with explicit `defaultCountry` (which is how we call it). `/max` adds formatting metadata we don't need. Bundle delta ~21 KB gz vs ~150 KB gz is a legitimate win. Documented in Handover § Bundle-size measurement + README Known Limitations bundle note.
- Focus-area spot-checks all PASS:
  - Validator-function API clearly documented in README with explicit "Note: unlike the other pattern factories..." callout pointing out the return-type difference.
  - NANP backward-compat: `phoneInternationalPattern()` + `phoneDomesticPattern()` still exported unchanged from v1.0.0 source (`src/patterns.ts:295-304` — unmodified in this diff).
  - Pipeline order per README + sanitize-pii.ts: email → addresses (6 locales) → postcodes (6 locales) → DOB → localePhones (lphlib 6-country loop with dedup + precision guard) → NANP intl → NANP domestic. Idempotent by construction.
  - Precision guards (`MIN_PHONE_DIGITS >= 7` + `PHONE_FORMATTED_RE`) are smart v1.0.0-spec-exceeding additions. Protect CVs with 4-digit employment-year runs (`1985 to 1990`) and 8-digit SKU-ID runs from over-redaction. Prose justification at `src/sanitize-pii.ts:38-80` is thorough.
  - Dedup of overlapping ranges across 6-country loop is correctly implemented (sort ascending-start + descending-end; merge contiguous; replace reverse-order).
  - README Known Limitations: R2 struck with "Resolved in v1.1"; R2-residual row added for non-EU locales + bare-digit-run precision.
  - TDD: RED `5d2881c` → GREEN `5d4753d` verifiable.
- Fix commits: none required (MIN-1 is a README documentation-gap deferrable to #23).
- Re-review: N/A — top-level review verdict "Ready to merge"; MIN-1 docs addition captured in #23 pre-tag tracker for batched application with #23's other items.

---

## Process Rule Violations

- **None observed.**
  - SI-001 RED→GREEN: satisfied at service-layer (`5d2881c` precedes `5d4753d`).
  - SI-002 / SD-001: handover written before completion summary (this file).
  - SD-002 amended: Code Review section left blank for dispatcher.
  - SD-007: prior-issue merge gate — #1's PR #24 merged at `9e2b98f` on
    `main`; no other Sprint 2K.A feature PRs currently open. Clear.
  - SD-011: contract claims verified against compliance review §5.3–5.4
    (see § Contract claims verified above).
  - R-51 one-commit-per-issue: commits `5d2881c` + `5d4753d` + upcoming
    docs commits all reference `(#2)` and each has a single scope.
  - R-54 issue number: verified via `gh issue view 2 --repo kgn-git/ai-privacyutils`.
  - Feature-branch workflow: no commits to main; no `--force`; no `--no-verify`.
  - Git-install adherence: no `publish.yml` reintroduced; no `publishConfig` added.
  - Pinned deps not bumped: `ai@^4.3.19`, `typescript@^5.9.3`,
    `eslint@^9.39.4`, `vitest@^2.1.9`, `@vitest/coverage-v8@^2.1.9`
    untouched.

---

## Known Tech Debt

- **R2-residual gaps** (documented in README):
  - Non-EU locales (US, CA, AU, IN, JP, …) still handled by NANP-shape
    fallback only. Recall degraded for non-NANP international numbers
    outside the six supported EU locales. Acceptable for the package's
    primary EU-centric threat model (GDPR remit).
  - Bare digit runs without phone formatting (e.g. `12345678` with no
    separators / country code) are intentionally NOT redacted by the
    locale-aware pass — documented precision/recall trade via
    `PHONE_FORMATTED_RE`. NANP fallback regex may still match specific
    10-digit shapes; not in R2 scope.
- **Future lphlib consumers may want per-locale `parseNumber` info**:
  the current `phoneByLocale.xx()` returns only a boolean. A v1.2
  follow-up could expose a richer `phoneByLocale.xx.parse(candidate)`
  returning normalised E.164 / national format for downstream typed
  fields — not needed for R2 redaction but may be useful for future
  features. Out of scope for this PR.
- **Benchmark not re-measured** for the middleware-end-to-end path with
  the new phone pass. The existing `locale-patterns.test.ts:472-501`
  performance assertion (`< 10ms mean on 10KB prompt`) remains green at
  v1.1 gate, so no regression at the ~10KB budget; a cleaner
  middleware-level benchmark is tracked by Handover-1's tech-debt note
  and not re-opened here.
- **lphlib warning text** — libphonenumber-js deprecated the old
  `findNumbers(text, options)` signature in a prior release, replacing
  with `findPhoneNumbersInText`. We use the non-deprecated API, but the
  types file still exports both — any future version bump should
  verify the API remains.

---

## Build & Test Status

```
$ npm run build
> tsc -p tsconfig.build.json
(no output → PASS)

$ npm run lint
> eslint src
(no output → PASS, 0 problems)

$ npm test -- --run
 ✓ src/__tests__/pii-middleware.test.ts (17 tests) 17ms
 ✓ src/__tests__/sanitize-pii.test.ts (45 tests) 28ms
 ✓ src/__tests__/locale-phone-patterns.test.ts (39 tests) 33ms
 ✓ src/__tests__/locale-patterns.test.ts (55 tests) 89ms
 Test Files  4 passed (4)
      Tests  156 passed (156)

$ npm run redos:scan
  OK emailPattern: safe
  OK addressPattern (EN): safe
  OK addressFrPattern: safe
  OK addressDePattern: safe
  OK addressItPattern: safe
  OK addressEsPattern: safe
  OK addressPtPattern: safe
  OK postcodeUkPattern: safe
  OK postcodeFrPattern: safe
  OK postcodeDePattern: safe
  OK postcodeItPattern: safe
  OK postcodeEsPattern: safe
  OK postcodePtPattern: safe
  OK phoneInternationalPattern: safe
  OK phoneDomesticPattern: safe
  OK dobPattern: safe
redos-scan: all patterns safe.
```

- E2E: N/A (library package, no UI surface).

---

## PR strategy

Single PR (this dispatch) from `feat/2-r2-eu-phone-formats` → `main`.
Commit stack maps 1:1 to phases of the issue:

- `5d2881c` test(#2) — RED fixtures (SI-001 evidence)
- `5d4753d` feat(#2) — GREEN implementation (lphlib integration + pipeline + precision guards)
- (next) docs(#2) — README pattern inventory + Known Limitations + bundle-size note
- (next) docs(#2) — `Handover-2.md` (this file)

A reviewer can navigate the PR by the commit stack rather than reviewing
every file linearly. For the security / compliance-critical pieces, the
two SHAs that matter are `5d2881c` (RED tests — assert the behaviours
the implementation must satisfy) and `5d4753d` (lphlib integration +
pipeline).

---

## Handover To

→ Dispatcher (maintainer at top-level session scope) for:
  1. Run `Agent(subagent_type="feature-dev:code-reviewer", ...)` against
     `feat/2-r2-eu-phone-formats`. Populate the
     Code Review section above with findings.
  2. Address any review findings (new RED-then-GREEN fix cycle if
     critical/important; minor findings can be addressed in a follow-up PR).
  3. Merge PR to `main` after review-ready verdict.
  4. Do NOT tag `v1.1.0` per dispatch-prompt constraint — tag cut happens
     at Sprint 2K.A close after all v1.1 issues (#1, #2, #10, #11, etc.)
     land.
