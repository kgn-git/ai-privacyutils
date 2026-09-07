# Redaction record

The compliance narrative for `@kgn-git/privacy-utils`: what the library protects, why each pattern has the shape it has, which review finding each safeguard answers, and what the library deliberately does not catch. The measure itself is the code and the fixture suites — this record is the evidence index for them. Source files keep a `COMPLIANCE:` header that states the contract and names the section here; the rest of the narrative lives in this file.

Posture: GDPR only (Art. 5(1)(c) data minimisation, Art. 25 data protection by design and by default, Art. 32 security of processing). Annex III of the AI Act does not apply; Art. 22 is not triggered — the library redacts text, it decides nothing about a person.

## 1. Contract

**Destructive, one-way redaction.** Every match is used solely to compute a byte range that is spliced out of the output string and replaced by a token. Nothing else leaves the library:

| Surface | What may leave | What must never leave |
|---|---|---|
| `sanitizePii`, `sanitizePiiAsync`, `piiMiddleware` | the redacted string | matched substrings, candidate strings, range bounds |
| `NerEngine.detectPersonSpans` (`NerSpan`) | `{ start, end, score, label }` | the matched name (`text`), tokens (`terms`), gender inference (`person.presumed_gender`) |
| `computeEsDniCheckLetter`, `computePtNifCheckDigit`, `computeFrNirCheckKey`, `computeItCodiceFiscaleCheckLetter` | the check value, or an empty/`-1` sentinel | the body bytes; intermediate sums are stack-local |
| `phoneByLocale.*()`, `nationalIdByLocale.*()` validators | a boolean | the candidate |

Match counts may be logged; matched content may not — not to logs, telemetry, error messages or any other side-channel. Inside the NER merge, the matched name is bound to a loop-local variable and is never returned, logged or assigned to a wider scope.

**Byte-identical output across releases.** Redaction output on the shared fixtures is the compatibility contract: a change to any pattern or to the pipeline ships its fixture in a RED commit first, and a recall regression is a breaking change under SemVer. With the default option set (`tokenFormat: 'readable'`, `profile: 'default'`, `enableNer: false`, `maxInputLength: 500_000`) each release reproduces the previous release's output on the shared fixtures; a release's additions only redact more.

**Executable controls that pin the contract**

- Fixture suites under `src/__tests__/` pin every pattern's positive and negative cases, the pipeline order and idempotency (section 2).
- `npm run redos:scan` (`recheck`) and `eslint-plugin-redos` pin ReDoS safety of all 22 pattern factories; the runtime input-length cap bounds worst-case CPU regardless (section 3.10).
- `NerSpan has only {start, end, score, label} — no matched text leaked (constraint 3)` (`compromise-ner-engine.test.ts`) and `NerSpan has only {start, end, score, label} — no matched text` (`ner-engine.test.ts`) pin the NER return shape.
- A source-text control asserts no `src/**` file imports `compromise` statically, so the regex-only path never carries the NER bundle (section 3.8).

**Residual without an executable control.** The no-logging clause is carried by the `COMPLIANCE:` headers and this record; `no-console` is warn-level in `eslint.config.js`, so nothing fails a build on a `console.log(candidate)`. Recorded as the epic-level residual (programme #126); the recommended shape is `no-console: error` plus a test over `src/**` call sites.

## 2. Pipeline order

`sanitizePii` applies the passes in this order. "Load-bearing" names the adjacency the tests actually depend on; an order that is not load-bearing is kept for stability, not correctness.

| Step | Pass | Load-bearing adjacency | Test that pins it |
|---|---|---|---|
| 1 | email | before phone: `test123@example.co` must not lose its digit run to a phone pattern | `redacts email before phone so @domain digit runs are not mis-matched` (`sanitize-pii.test.ts`) |
| 2 | addresses — EN, FR, DE, IT, ES, PT | before postcodes: `12 rue de la Paix, 75001 Paris` consumes the street first, the residual `75001 Paris` is then a postcode; before phone: a house number must not feed a phone candidate. The six address passes are keyed on different shapes (EN number-first with an English terminator, FR number-first with a street keyword, DE compound suffix, IT/ES/PT prefix keyword); no fixture depends on the order among them — with the EN pass moved last the suite stays green | `redacts a full FR CV header (address + postcode + city + email)` (`locale-patterns.test.ts`); `redacts address before phone so leading house number is not mis-matched` (`sanitize-pii.test.ts`) |
| 3 | postcodes — UK, FR, DE, IT, ES, PT | after addresses (above); the 5-digit and UK/PT alphanumeric shapes do not overlap the phone patterns | `sanitizePii — UK postcodes (R1)`, `sanitizePii — French postcodes (R1)`, `sanitizePii — German postcodes (R1)`, `sanitizePii — Italian postcodes (R1)`, `sanitizePii — Spanish postcodes (R1)`, `sanitizePii — Portuguese postcodes (R1)` (`locale-patterns.test.ts`) |
| 4 | national IDs — IT, UK, FR, ES, PT (extract, then validate) | before the phone passes: the NANP domestic shape matches ten digits inside a compact 15-digit NIR, so with this pass moved after the phones the NIR fixtures come out as `[phone]`. Its position relative to postcodes and dates is not load-bearing (moved before the postcodes or after the dates, the suite stays green), and neither is the order of its five locales — the `\b` anchors keep the shapes disjoint | `redacts FR NIR with valid mod-97 check key (compact form)`, `redacts FR address + postcode + phone + NIR in mixed input` (`national-id-patterns.test.ts`) |
| 5 | date of birth — every date shape (`'default'`), or only a cue-labelled date (`'cv'`) | before phones: `libphonenumber-js` accepts `23.05.1985` / `1985-05-23` as DE phone candidates, so the date pass must claim them first; the date shapes cannot match a NANP or EU phone (the separator alternation and `\d{1,2}` middle group exclude `555-123-4567`; FR groups use spaces) | `redacts DD.MM.YYYY (DE-style)`, `redacts YYYY-MM-DD (ISO-style)` (`sanitize-pii.test.ts`); `redacts text parts inside array content` (`pii-middleware.test.ts`, `Born 23.05.1985` → `[dob]`) |
| 6 | locale phones — FR, DE, GB, IT, ES, PT via `libphonenumber-js` | before the NANP fallback: `06 12 34 56 78` contains a 3-3-4 tail the NANP regex would otherwise take, leaving `06 ` dangling | `does not double-redact: FR number is not re-consumed by NANP fallback` (`locale-phone-patterns.test.ts`) |
| 7 | NANP-shape phone with country code | before the domestic shape so `+44` is not left dangling | `redacts international format with + country code (+44 UK, +1 US)` (`sanitize-pii.test.ts`) |
| 8 | NANP-shape domestic phone | fallback for the original fixtures | `sanitizePii — v1.0.0 NANP backward compatibility (R2 must not regress)` (`locale-phone-patterns.test.ts`) |

The async path runs the same pipeline on the original text, runs NER on the original text too, then replaces each NER span's text in the regex-redacted output (section 3.8). Idempotency in both token formats is pinned by `sanitizePii — idempotency (both formats)` (`token-format.test.ts`), the per-class `is idempotent …` cases, and `sanitizePiiAsync idempotency — full pipeline` (`person-token-idempotency.test.ts`).

## 3. Design rationale

### 3.1 Pattern factories

Every pattern is exported as a factory returning a fresh `/g` `RegExp`, never a module-level singleton. A shared `/g` regex carries `lastIndex`, so two `.test()` calls on the same instance alternate between match and no-match. `String.prototype.replace` resets `lastIndex`, so the library's own pipeline is safe either way; the factory shape protects consumers who call `.test()` / `.exec()` on an imported pattern. Validator factories (`phoneByLocale`, `nationalIdByLocale`) return a fresh closure for the same reason of contract consistency. Pinned by `piiPatterns — factory-function API (IMP-1: fresh instances, no shared lastIndex)` (`sanitize-pii.test.ts`), `emailPattern — factory freshness invariant (IMP-1, IDN)` (`idn-email.test.ts`) and the `each locale … factory returns a fresh …` cases in the locale suites.

### 3.2 Email (`emailPattern`)

`(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]{1,64}@(?:[\p{L}\p{N}-]{1,63}\.){1,5}[\p{L}]{2,24}(?![\p{L}\p{N}-])` with `gu`.

- Unicode classes with the `u` flag accept IDN local parts (RFC 6531 / SMTPUTF8), IDN domains (RFC 5892 / IDNA 2008), Unicode TLDs and punycode (`xn--…`, pure ASCII). `\p{L}` ⊇ `a-zA-Z` and `\p{N}` ⊇ `0-9`, so the ASCII fixtures are byte-identical.
- Bounds: local part ≤ 64 (RFC 5321 §4.5.3.1.1), label ≤ 63 with up to 5 labels (§4.5.3.1.2), TLD 2–24 letters; digits are excluded from the TLD so `foo.1` does not match. Every quantifier is bounded, which keeps the pattern in `recheck`'s safe class.
- Boundaries: `\b` is ASCII-only and would fire inside a Unicode TLD, so the trailing boundary is a negative lookahead `(?![\p{L}\p{N}-])` and the leading one a widened lookbehind.
- The TLD quantifier is greedy: `user@example.中国后文字` is matched whole. Over-redacting an email-shaped token is the accepted direction.
- `[email]` contains no `@`, so a second pass is a no-op.

Pinned by `idn-email.test.ts` (`emailPattern — IDN support (#3 / R5)`, `sanitizePii — IDN email redaction (#3 / R5)`) and `sanitizePii — email redaction (ported from cv-chunker.ts:76)` (`sanitize-pii.test.ts`).

### 3.3 Street addresses

| Factory | Shape | Why |
|---|---|---|
| `addressPattern` (EN, alias `addressByLocale.en`, `piiPatterns.address`) | number, 1–5 capitalised words (`[A-Z][a-zA-Z]{0,15}`, so `McLane` and `LA` match), closed street-type set, optional compass suffix | the original pattern, kept byte-identical; single bounded quantifier is linear on adversarial input |
| `addressFrPattern` | number, optional `bis/ter/quater`, street keyword in lower/Title/UPPER case, 1–6 tokens each either a capitalised word (plain or hyphenated) or a short lowercase connector (`de des du la le les l' d' aux et en à`) | restricting the follow-on tokens to those two shapes stops the `{1,6}` quantifier absorbing free-text words after the street name (`depuis`, `ouvert`, `demain`) |
| `addressDePattern` | capitalised prefix `{1,30}`, closed compound suffix (`straße/strasse/str./platz/weg/allee/gasse/ring/damm`), number, optional letter | number-after form is the dominant German shape; a closed suffix set keeps it linear |
| `addressItPattern`, `addressEsPattern`, `addressPtPattern` | closed prefix keyword (`Via Piazza Corso …` / `Calle Avenida Av. C/ Plaza …` / `Rua R. Avenida Praça Largo …`), 1–5 name tokens, number | prefix-keyword form; the trailing house number is what keeps `Via Lattea visible …` (no number) out and `Via Lattea 5` (structurally an address) in — privacy over precision |

Pinned by `sanitize-pii.test.ts` (`sanitizePii — street address redaction (ported from cv-chunker.ts:80-83)`, the two `CRIT-2 regression guard` cases) and `locale-patterns.test.ts` (per-locale address blocks, `sanitizePii — Italian Via false-positive fixtures (#23 MIN-1)`).

### 3.4 Postcodes

| Factory | Shape | Why |
|---|---|---|
| `postcodeUkPattern` | `[A-Z]{1,2}\d[A-Z\d]?\s+\d[A-Z]{2}` | genuinely locale-specific — no other supported shape collides, so it is safe to use alone; uppercase only (Royal Mail convention) |
| `postcodeFrPattern`, `postcodeItPattern`, `postcodeEsPattern` | `\d{5}\s+` + capitalised city token `[A-ZÀ-Ü][a-zà-ÿ'-]{2,30}` | the city token is required so bare 5-digit runs (order numbers, SKUs) are not redacted; postcode-plus-city is the re-identification surface |
| `postcodeDePattern` | same, city letter class narrowed to `[A-ZÄÖÜ]`, tail `[a-zäöüß'-]` | same rationale |
| `postcodePtPattern` | `\d{4}-\d{3}` with optional city | the NNNN-NNN shape is distinctive enough that no city context is required; locale-specific like the UK shape |

**Continental overlap by design (MIN-2).** The FR/DE/IT/ES factories share one core, `\b\d{5}\s+<capitalised city>\b`, and differ only in the accented-letter class. `postcodeFrPattern()` matches `00100 Roma`; `postcodeDePattern()` matches `75001 Paris` and `28013 Madrid`. The locale key organises the API; it is not a precision gate. Tightening each locale against a city whitelist was rejected as a large maintenance surface for marginal precision in a library whose contract is conservative one-way redaction. Consumers needing locale-scoped redaction must route by locale before calling.

Pinned by the per-locale postcode blocks and `does not over-redact bare 5-digit numbers without city context` (`locale-patterns.test.ts`).

### 3.5 Phones

- **NANP-shape fallbacks** (`phoneInternationalPattern`, `phoneDomesticPattern`) are the original patterns, kept for compatibility. They redact any 10-digit run in 3-3-4 shape; `9876543210` in free text is redacted by them.
- **Locale pass** (`redactLocalePhones` in `sanitize-pii.ts`): `findPhoneNumbersInText(text, { defaultCountry })` for FR, DE, GB, IT, ES, PT. A candidate is accepted only when all three hold: `isValid()`; `nationalNumber.length >= 7` (`MIN_PHONE_DIGITS`); and the raw text is written like a phone number — starts with `+` or contains a space, dot or hyphen (`PHONE_FORMATTED_RE = /^\+|[\s.-]/`). The length floor exists because DE metadata accepts 4–6 digit short-code shapes such as `12 34 56` and `116 117` as valid; the formatting guard exists because `libphonenumber-js` accepts a bare 8-digit run as a DE number, which would redact SKUs and order IDs. Accepted ranges are merged and spliced by `redactRanges`. A throw from the finder for one locale is swallowed so the other locales and passes still run.
- **Validator factories** (`phoneByLocale.*()`) answer only `isValidPhoneNumber(candidate, country)`; they are looser than the sanitiser, which adds the two guards above. Consumers who want "what would `sanitizePii` redact" must call `sanitizePii`. The UK key is `uk` at the API surface and `GB` towards `libphonenumber-js`.
- **Why a validator rather than a regex**: the library's value is validation, not extraction; no hand-rolled per-locale regex means nothing new for the ReDoS scan. The `/min` metadata bundle is enough for validation with an explicit default country.

Pinned by `locale-phone-patterns.test.ts` (per-locale blocks, `does not over-redact non-phone digit runs (false-positive guard)`, `a formatted short-code shape that libphonenumber accepts is not redacted`, `a throwing phone finder for one locale is swallowed …` in `sanitize-pii.test.ts`) and `does not redact bare years (e.g. employment dates without day)` (`sanitize-pii.test.ts`).

### 3.6 Date of birth and the `'cv'` profile

`DOB_DATE_SUBPATTERNS` holds the date shapes once; `dobPattern()` joins them with `|` and `dobContextCuePattern()` embeds the same list, so the two cannot drift. Shapes: `DD.MM.YYYY`, `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD`, day-first named months in EN/FR/DE/IT/ES/PT (`12 March 1985`, `12 mars 1985`, `12. März 1985`, `12 marzo 1985`, `12 de marzo de 1985`, `12 de março de 1985`) and the US `March 12, 1985`. Bare years and month-year (`March 1985`) do not match — they are employment dates, not birth dates. Every alternative is linear.

`dobContextCuePattern()` (the `'cv'` profile) matches `(cue)(separator)(date)` with `gi`: a closed list of birth cues in the six locales (`date of birth`, `DOB`, `born on`, `born`, `date de naissance`, `né(e) le`, `Geburtsdatum`, `geboren (am)`, `data di nascita`, `nato/nata il`, `fecha de nacimiento`, `nacido/nacida el`, `data de nascimento`, `nascido/nascida em|a`), a separator bounded to `[\s:]{0,4}` so the cue and the date must be adjacent, and the date shapes above. The leading `\b` stops `reborn` acting as a cue. Only the date group is replaced; the cue text is not PII and is kept.

Under `'cv'`, dates are redacted only when cue-labelled; email, phone, address, postcode, national ID and the person-NER pass are identical to `'default'`. The `'default'` profile redacts every date shape and is byte-identical to the behaviour before profiles existed.

Pinned by `sanitizePii — DOB redaction (C1: new in v1.0.0, per compliance review §R4)` (`sanitize-pii.test.ts`) and `cv-profile.test.ts` (all blocks, plus `a birth cue does not fire inside a longer word and does not reach a later date`).

### 3.7 National identifiers (`patterns-national-id.ts`)

Each locale is a pair: a loose **extraction regex** over free text (exported so the ReDoS scan enumerates it) and a **validator** that applies the check digit or structural rules. Extraction stays loose on shape; the validator carries the precision. Four of the five formats have a verifiable check value, which brings the false-positive rate from the bare-shape rate down by a factor of 23 (DNI), 11 (NIF), 97 (NIR) or 26 (Codice Fiscale) at no bundle cost. The validator shape mirrors `phoneByLocale`.

| Locale | Extraction | Validator |
|---|---|---|
| UK NINO | `\b[A-Z]{2}(?:\s?\d{2}\s?\d{2}\s?\d{2}\|\d{6})\s?[A-Z]\b` | strips every space before the shape test, so `AB 12 34 56 C` and `AB123456C` validate alike; tabs and newlines are rejected; `^[A-Z]{2}\d{6}[A-Z]$`; HMRC prefix rules — first letter not `D F I Q U V`, second not `D F I O Q U V`, suffix `A–D`. No check digit exists. Reserved prefixes (`BG GB NK KN TN NT ZZ`) are structurally valid and are redacted — the threat model is leakage, not issuance compliance |
| FR NIR | `\b[12](?:\s?\d{2}\s?\d{2}\s?\d{5}\s?\d{3}\s?\d{2}\|\d{14})\b` | 15 digits after space stripping; first digit `1` or `2`; check key = two digits of `97 − (13-digit body mod 97)`, computed with `BigInt` because the body exceeds `Number` precision. Month and département are not gated; the check key catches malformed bodies |
| IT Codice Fiscale | `\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z0-9]{4}[A-Z]\b` | upper-cased, same shape (month letter in `ABCDEHLMPRST`, municipality `[A-Z0-9]{4}`), check letter = `A–Z[sum mod 26]` over the odd/even position tables (D.M. 23/12/1976, Allegato 2) |
| ES DNI | `\b\d{8}[A-Z]\b` | 8 digits + letter; letter = `TRWAGMYFPDXBNJZSQVHLCKE[body mod 23]` (Agencia Tributaria) |
| PT NIF | `\b\d{9}\b` | 9 digits; check = weighted sum of digits 1–8 with `[9,8,7,6,5,4,3,2]` mod 11, `0` when the remainder is `0` or `1`, else `11 − remainder` (Decreto-Lei n.º 463/79). The `\b` anchors are the guard against adjacent digit runs |

Every helper guards its input and returns a sentinel rather than a plausible value on a short or non-digit body: `''` for the letter/key helpers, `-1` for the NIF digit. Every validator returns `false` on a non-string or wrong-shape candidate and never throws. Candidates are not logged.

Pinned by `national-id-patterns.test.ts` (per-locale validation blocks, `computeEsDniCheckLetter rejects non-8-digit body with empty string (security-expert finding S1)`, `every check helper returns its sentinel on a body of the wrong shape`, `sanitizePii — redacts national IDs across locales`, `a 9-digit run inside a longer word is not a NIF candidate`).

### 3.8 Person names (NER) and the async merge

- **Why NER.** A CV is a list of proper nouns (employers, universities, projects, referees); any regex over capitalised-word pairs over-fires, so names are detected by an engine behind the `NerEngine` interface, which lets the engine change without a consumer API change. `compromise` v14 is the engine: pure JS, no native bindings, well under the serverless bundle ceiling that ruled out the two ML candidates (ADR 003, ADR 004).
- **Why a separate async export.** Engine loading is asynchronous; making `sanitizePii` async would break every existing caller's types. `sanitizePiiAsync` is additive; with `enableNer: false` (the default) it returns the regex output verbatim and constructs no engine.
- **Merge algorithm** (`applyNerRedactions`). NER runs on the original text because `compromise`'s offsets are invalid against regex-redacted output. Spans are merged (`mergeRanges`), then, iterating from the last span to the first, the span's text is sliced from the original and its first remaining occurrence in the mutating output is replaced with the person token. A span whose text is no longer present was consumed by a larger regex span (a FR-address span swallows a nested `rue` false positive) and is dropped. Section 5 records the case this search gets wrong.
- **`CompromiseNerEngine` constraints.** (1) `compromise` is loaded only by `await import('compromise')` — never a static import — so the regex-only path and the `NullNerEngine` default carry none of it; the load starts when a `CompromiseNerEngine` is constructed and `ready` resolves when it completes. (2) The `.out('offsets')` items carry `text`, `terms` and `person.presumed_gender` (Art. 4(1) and Art. 9 data); only `offset` is read, the element type is declared with `offset` alone so reading another field is a type error, and the matched substring is sliced from the caller's input into a loop-local variable. (3) Trailing punctuation: `compromise` includes sentence-final punctuation in a span, so the end is recomputed after stripping up to 16 trailing characters outside `[\w\s'.-]` and then one trailing period; the bound keeps the regex in the ReDoS lint's safe class, and a longer run stays inside the span, which over-redacts rather than leaks. (4) `score` is `1.0`; `confidenceThreshold` is a no-op for this engine and exists for ML engines. (5) The deny-list and the per-call allow-list are applied by `Set.has` equality only; building a `RegExp` from an entry would be an injection and ReDoS surface. A multi-word span is not denied by its first token. (6) Fail closed: a failed import or an unexpected module shape throws `PiiNerLoadError`; the engine never degrades to "no spans". The load promise is reset on rejection so a later caller can retry.
- **Default deny-list** (`DEFAULT_NER_DENY_LIST`): common-noun given names (`Grace`, `Mark`, `Chase`, …), Romance street-type words that `compromise` tags as names before the address regex sees them (`Rue`, `Via`, `Calle`, …), and surname-shaped tech terms (`Jenkins`, `Hudson`, `Travis`, …). A custom `denyList` replaces the default.
- **Default `enableNer: false`** (C6): the controller — the platform — opts in; the library default keeps existing consumers' output unchanged.

Pinned by `sanitize-pii-async.test.ts`, `merge-ranges.test.ts`, `compromise-ner-engine.test.ts` (including `a deny-list entry is compared by equality, never compiled as a regex`), `compromise-ner-engine-load.test.ts` (fail-closed on an unexpected module shape), `ner-engine.test.ts` (including `no src file imports compromise statically`), `person-token-idempotency.test.ts` and `ner-cohort-benchmark.test.ts`.

### 3.9 Replacement tokens (`token-format.ts`)

Readable tokens (`[email] [address] [postcode] [phone] [dob] [nationalId] [person]`) are the default and are byte-identical across releases; changing one is a major-version change. The opt-in sentinel form (`<<REDACTED_EMAIL>>` …) exists because readable tokens collide with user-authored text (`enquiries via the [email] form`) — a low-severity residual (R8).

**Idempotency invariant.** No pattern matches any token, in either format, so a second pass in either format is a no-op: every pattern except email requires a digit — a house number, a postcode, a phone or date digit, an identifier body — and email requires an `@`; no token in either format contains a digit or an `@`. `[person]` and `<<REDACTED_PERSON>>` are additionally not tagged as names by `compromise` (bracket and `<<` are token boundaries; `REDACTED_PERSON` has no proper-noun shape).

Rejected alternatives: a per-call UUID sentinel (breaks determinism and prompt caching for no gain — real text does not contain `<<REDACTED_X>>`); consumer-supplied token strings (they could themselves match a pattern and would need runtime validation); swapping the default to sentinel (a breaking change).

Pinned by `token-format.test.ts`, `national-id-patterns.test.ts` (`TOKEN_FORMATS — nationalId kind added to both formats`) and `person-token-idempotency.test.ts`.

### 3.10 Input-length cap (`limits.ts`, ADR 002)

The static ReDoS gate (`recheck` + `eslint-plugin-redos`, S5) is the primary defence; the runtime cap is the second: `text.length > maxInputLength` throws `PiiInputTooLargeError` before any regex runs, bounding worst-case CPU whatever the pattern shape. Decisions (full text in `docs/adr/002-input-length-cap.md`): the cap sits on `sanitizePii` and is threaded by the middleware; overflow throws a typed error rather than truncating silently; the default is `500_000` UTF-16 code units, an order of magnitude above a realistic CV+JD prompt; length is code units because that is what the regex engine iterates; the cap is per call (per text part), not summed over a prompt. The empty-string short-circuit runs before the cap so `''` is returned even at `maxInputLength: 0`. `Object.setPrototypeOf` in the error constructor keeps `instanceof` correct if the build target ever drops below ES2015 (it is ES2022 today). Pinned by `input-length-cap.test.ts`.

### 3.11 Middleware (`pii-middleware.ts`)

`transformParams` is the single latest application-layer point before the AI SDK serialises the provider call, which is where Art. 25 privacy-by-default is enforced. The params object is cloned by JSON round-trip and the clone is redacted, so the caller's object is never mutated and non-prompt fields pass through. A string `prompt`, string message `content`, and `text` and `reasoning` parts are redacted; every other part type (`image`, `file`, `tool-call`, `tool-result`) passes through untouched. `tokenFormat` and `maxInputLength` are threaded into every `sanitizePii` call; an over-cap part throws out of `transformParams`, which the SDK contract permits — a caller-side error, not a silent gap. The middleware is request-side only; response scrubbing is a consumer concern (section 5). Pinned by `pii-middleware.test.ts` (including `redacts a reasoning part`) and `input-length-cap.test.ts`.

## 4. Review-finding index

IDs come from the compliance review (R), the security review (S), the tech review (T), the SD-002 reviews of individual PRs (IMP, MIN, CRIT, C, I) and the compliance-officer conditions on the NER release (C1–C7). "Test" names the test title, or the suite when the finding is a whole feature.

| ID | Finding | Where implemented | Test that pins it |
|---|---|---|---|
| R1 | Non-English postal addresses passed through | `addressFrPattern`, `addressDePattern`, `addressItPattern`, `addressEsPattern`, `addressPtPattern`, `postcodeByLocale` | `locale-patterns.test.ts`; `piiMiddleware.transformParams — locale-aware end-to-end (R1 / #1)` |
| R1-residual | see section 5 | — | — |
| R2 | EU-native phone formats under-matched by the NANP regex | `redactLocalePhones`, `phoneByLocale`, `MIN_PHONE_DIGITS`, `PHONE_FORMATTED_RE` | `locale-phone-patterns.test.ts`; `redacts native EU phone formats — R2 resolved in v1.1` |
| R2-residual | see section 5 | — | — |
| R3 | Applicant's full name flowed unredacted | `sanitizePiiAsync`, `CompromiseNerEngine`, `NerEngine` (partial: heuristic engine, cohort gate re-scoped) | `compromise-ner-engine.test.ts`, `ner-cohort-benchmark.test.ts` |
| R3-residual | see section 5 | — | — |
| R4 | Date of birth not covered | `dobPattern` | `sanitizePii — DOB redaction (C1: new in v1.0.0, per compliance review §R4)` |
| R5 | IDN email addresses passed through | `emailPattern` Unicode classes and lookaround boundaries | `emailPattern — IDN support (#3 / R5)`, `sanitizePii — IDN email redaction (#3 / R5)` |
| R7 | ReDoS on adversarial input | runtime cap `DEFAULT_MAX_INPUT_LENGTH` / `PiiInputTooLargeError` (secondary); every extraction regex exported for the scan (R7 invariant: every regex over user input is scanned) | `input-length-cap.test.ts`; `npm run redos:scan` |
| R8 | Readable tokens collide with authored text | `tokenFormat: 'sentinel'`, `TOKEN_FORMATS` | `token-format.test.ts` |
| R10 | National identifiers not covered | `patterns-national-id.ts`, `redactNationalIds`, `nationalIdByLocale` | `national-id-patterns.test.ts` |
| R10-residual | see section 5 | — | `known false-positive exposure: any random 9-digit run with a valid check digit will pass` |
| R11 | Every date shape redacted on CV text destroys employment dates | `profile: 'cv'`, `dobContextCuePattern`, `redactContextualDob` | `cv-profile.test.ts` |
| R11-residual | see section 5 | — | `accepted residual: a person-tagged employer is STILL redacted under cv` |
| S1 | Check helpers must not return a plausible value on a short or non-digit body | `computeEsDniCheckLetter` returns `''`; validators early-return `false` on non-string / wrong shape | `computeEsDniCheckLetter rejects non-8-digit body with empty string (security-expert finding S1)`; `every check helper returns its sentinel on a body of the wrong shape` |
| S2 | PT NIF validator must never throw on malformed input | `nationalIdPtValidator` shape guard | `PT NIF — mod-11 weighted check digit validation` › `rejects wrong shape (not 9 digits)` |
| S3 | PT NIF precision floor: the check digit and the `\b` word boundary on `\d{9}` | `computePtNifCheckDigit`, `nationalIdPtExtractionPattern` | `does NOT redact bare 9-digit sequence with INVALID NIF check`; `a 9-digit run inside a longer word is not a NIF candidate` |
| S5 | ReDoS scanner in CI (`recheck`, `eslint-plugin-redos`); bounded quantifiers everywhere, including `TRAILING_PUNCT_RE {1,16}` | `scripts/redos-scan.mjs`, `eslint.config.js` | `npm run redos:scan` ends `all patterns safe.` (22 factories); `npm run lint` |
| S11 | Supply-chain posture | `README.md` § Security Posture, `SECURITY.md`, `docs/INTEGRITY.md` | — (process controls) |
| S12 | Runtime input-length cap as belt-and-braces | as R7 | `input-length-cap.test.ts` |
| T4 | Pre-implementation review gate: sentinel national-ID tokens survive a second pass | `TOKEN_FORMATS.sentinel.nationalId` | `sentinel: national-ID tokens survive double-pass (all 5 shapes — UK/FR/IT/ES/PT)` |
| T5 | File organisation: national-ID implementation split from `patterns.ts`, re-exported from the barrel | `patterns-national-id.ts`, re-export block in `patterns.ts` | `re-exports validators from the flat patterns.ts surface` |
| IMP-1 | Pattern exports as factories (fresh `RegExp` per call); middleware-level benchmark alongside the regex-only one | section 3.1; `piiMiddleware.transformParams end-to-end — performance budget` | `piiPatterns — factory-function API (IMP-1 …)`; `processes a realistic ~10KB LanguageModelV1CallOptions in under 20ms (mean of 10 runs)` |
| MIN-1 | Italian `Via` false-positive boundary | `addressItPattern` requires a trailing house number | `sanitizePii — Italian Via false-positive fixtures (#23 MIN-1)` |
| MIN-2 | Continental postcode overlap and UK/PT locale specificity | section 3.4 | per-locale postcode blocks (`locale-patterns.test.ts`) |
| CRIT-2 | EN address inner name class must accept mixed case (`McLane`) and all-caps (`LA`) | `addressPattern` `[A-Z][a-zA-Z]{0,15}` | `redacts mixed-case street name (McLane) — CRIT-2 regression guard`; `redacts all-caps street token (LA Cienega) — CRIT-2 regression guard` |
| C1 (DOB) | Date of birth is a mandatory class | `dobPattern` | as R4 |
| C1 (NER) | Cohort 1 (Western European) TP ≥ 70 % is the CI-blocking gate | `ner-cohort-benchmark.test.ts` | `TP ≥70% — CI BLOCKING gate (compliance C1)` |
| C1 (national-ID fixtures) | Fixtures must not be real demographic profiles | synthetic bodies (`2000000000001`, `RSSMRA85T10A562`, `12345678`) with check values computed by the production helpers | section 6 |
| C2 | At least ten Western European fixtures | `COHORT_1_WESTERN_EU` | `fixture count is at least 10 (compliance C2: ≥10 Western European fixtures)` |
| C3 | `NerSpan` exposes byte ranges only, never the matched substring | `NerSpan` interface; `detectPersonSpans` destructures `offset` only | `NerSpan has only {start, end, score, label} — no matched text` (both files) |
| C4 | Fail closed on a failed or wrong-shaped `compromise` load | `PiiNerLoadError`, `loadCompromise` API-shape guards | `compromise-ner-engine-load.test.ts`; `CompromiseNerEngine — error surface (constraint 7)` |
| C6 | NER is opt-in; the controller enables it | `enableNer` default `false` in `SanitizePiiAsyncOptions` and `NerConfig` | `sanitizePiiAsync — enableNer: false (default)`; `returns NullNerEngine when config omits enableNer (default)` |
| C7 | The original ≥ 95 % per-cohort / ≤ 5 pp variance AC is carried to the ML-upgrade backlog | ADR 004 § ML upgrade roadmap | cohorts 2–4 report without a gate |
| I1a | Sentinel idempotency test covers all six sentinel kinds | `token-format.test.ts` | `sentinel tokens do not match any redaction pattern when standalone` |
| I1b | Explicit T4 gate test for national-ID sentinels | `token-format.test.ts` | `sentinel: national-ID tokens survive double-pass (all 5 shapes — UK/FR/IT/ES/PT)` |
| I2 | Readable-default test covers `[nationalId]` and asserts no sentinel leaks | `token-format.test.ts` | `produces readable tokens across all token types by default` |

## 5. Known limitations

What the library deliberately or currently does not catch. Each is a precision or recall trade recorded so that an auditor reads it here rather than discovering it.

| Area | Limitation | Direction | Status |
|---|---|---|---|
| R1-residual | Address names with apostrophes (`O'Brien Road`), German multi-word prefix forms (`Unter den Linden 5`, `Am Markt 3`), non-EU locales, all-caps EN headers (`BAKER STREET`), lowercase UK postcodes in free text, structured addresses with unusual word order | recall | not mitigated; narrow extensions per re-review |
| MIN-2 | Continental 5-digit postcode factories are not locale-precise (section 3.4) | precision | by design |
| R2-residual | Non-EU phone locales are covered by the NANP fallback only; bare unformatted digit runs (`12345678`) are deliberately not redacted; a 10-digit run in 3-3-4 shape is redacted by the NANP fallback whatever it is | recall / precision | by design |
| Phone (observed) | A hyphenated year range such as `1985-1990` is accepted by `libphonenumber-js` as a formatted 8-digit number and is redacted as `[phone]` | precision | recorded; no fixture asserts either way |
| R3-residual | `compromise` is English-lexicon-biased: names absent from its lexicon are missed or truncated (`Kim Min-jun` → `Kim Min-`), French surname/organisation collisions (`Dupont`, `Petit`, `Laurent` with a non-English first name), ALLCAPS headers (`JEAN-PIERRE DUBOIS`) not detected; `confidenceThreshold` is a no-op. Measured cohort rates are in `ner-cohort-benchmark.test.ts` and ADR 004 | recall | ML engine upgrade behind `NerEngine` (C7) |
| NER merge (observed) | `applyNerRedactions` replaces a span by searching for its text from the start of the output. When a shorter name is also a prefix of an earlier longer name, the search lands on the earlier occurrence: `Ann Lee met Ann today` with spans `Ann Lee` and `Ann` becomes `[person] Lee met Ann today`. Loop direction (last span first) does not prevent this | recall | recorded; behaviour frozen pending a ruling |
| NER punctuation | A span ending in a dotted abbreviation (`John Smith Jr.`) loses its final period to the trailing-period trim; the period stays outside the token | precision (harmless) | by design |
| UK NINO (observed) | The extraction regex allows one whitespace character per group gap, so a NINO written with a double space (`AB  12 34 56 C`) is never a candidate in free text although the validator accepts it | recall | recorded; no fixture asserts either way |
| R10-residual | (a) PT NIF: about 1 in 11 random 9-digit runs passes mod-11 (`000000000` does) — accepted, recall over precision; context gating (`NIF` keyword) is left to the caller. (b) FR NIR issued in Corsica (`2A`/`2B` département, converted to `19`/`18` before mod-97) fails the check key and passes through. (c) IT Codice Fiscale omocodia substitutions are not handled. (d) DE Steuer-ID / Rentenversicherungsnummer are not covered. (e) FR NIR first digits `3–9` and `0` are rejected (historical overseas / non-naturalised codes) | recall (b–e), precision (a) | documented gaps |
| R11-residual | Under `'cv'`, a surname-shaped employer that `compromise` person-tags (`Morgan Stanley`, `Ericsson`; about 2 in 30 real employers) is still redacted to `[person]`. Suppressing PERSON spans that are also ORG/PLACE-tagged was rejected because it leaks people whose given name is a place or organisation token (`Paris`, `Austin`, `Georgia`, `Morgan`). The robust fix is a field-aware API over structured CV sections (never run NER over the employer field, always over the name field) — tracked on the platform side (`jobflow-platform#1424`) | precision | field-aware API is the follow-up |
| Email | Greedy Unicode TLD consumption over-redacts email-shaped tokens (`user@example.中国后文字`) | precision (safe) | by design |
| Middleware | Request-side only: `wrapGenerate` / `wrapStream` are not implemented, so model responses are not scrubbed by this library | scope | consumer-side post-LLM scrubbing |
| Cap | The input-length cap is per text part, not summed over a prompt; two 400 KB parts pass a 500 K cap | scope | by design (ADR 002) |
| Logging | The no-logging clause has no executable control (section 1) | control gap | epic residual |

## 6. Fixture policy

- No real PII in any fixture. National-ID fixtures are synthesised from placeholder bodies (`2000000000001` for NIR — sex 2, year 00, département 00, commune 000, sequence 001; `RSSMRA85T10A562`; `12345678`) with the check value computed by the production helper, so a wrong algorithm breaks fixture and implementation together while the hand-written "wrong check" cases still assert rejection.
- UK phone fixtures use the Ofcom drama/textbook ranges (`07911 xxxxxx`, `020 7946 xxxx`) that `libphonenumber-js` accepts; `07700 900xxx` is rejected by the library and is not used. EU phone fixtures are format-plausible, not real lines.
- Addresses and postcodes are public landmarks or non-residential.
- Test titles carry the review ID they answer as plain text, so the index above can be grepped in both directions.

## Appendix — ID census

The set of review-finding IDs in `src/**` comments before the comment sweep, obtained with

```
grep -rn -o -E "\b(CRIT|MIN|IMP|C|R|S|T|I)-?[0-9]{1,2}[a-b]?\b(-residual)?" src/ | sed -E 's/^[^:]+:[0-9]+://' | sort -u
```

is `C1 C2 C3 C4 C6 C7 CRIT-2 I1a I1b I2 IMP-1 MIN-1 MIN-2 R1 R2 R3 R4 R5 R7 R8 R10 R10-residual S1 S2 S3 S5 S11 T4 T5`. Every one of them appears in section 4 or 5 of this record. `R11`, `R11-residual`, `S12`, `R1-residual`, `R2-residual` and `R3-residual` are indexed here from `README.md` § Known Limitations and § Security Posture and did not occur as tokens in source comments.
