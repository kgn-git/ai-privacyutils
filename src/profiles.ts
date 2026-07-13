/**
 * Redaction profiles (v1.3 — issue #64).
 *
 * ## Purpose
 *
 * v1.0–v1.2 shipped a single, one-size-fits-all redaction policy. That
 * policy is correct for a generic "scrub everything that could be PII"
 * prompt path, but it over-redacts on CV / résumé text where employment
 * dates, employer/organisation names and city/region are the highest-signal,
 * NON-personal features a downstream embedding / job-match consumer depends
 * on (see issue #64 and cross-repo `jobflow-platform#1424`).
 *
 * A `RedactionProfile` lets a caller select policy WITHOUT changing the
 * default. The `'default'` profile is byte-identical to v1.2 on every
 * input — existing consumers see no behavioural change (this is a SemVer
 * MINOR bump, additive only).
 *
 * ## Profiles
 *
 *   - `'default'` — v1.2 behaviour, byte-identical. Every date-shaped string
 *     is redacted to `[dob]`; the person-NER pass (when enabled) redacts
 *     every PERSON span compromise emits, including surname-shaped employer
 *     names.
 *
 *   - `'cv'` — CV / embedding profile. Its ONE behavioural change vs
 *     `'default'` is the date pass: dates are NOT redacted by shape — only a
 *     date carrying an explicit date-of-birth context cue (`Date of birth:`,
 *     `DOB:`, `born on`, and the EU-locale birth cues) is redacted, so plain
 *     employment start/end dates pass through. Everything else is IDENTICAL to
 *     `'default'`: email / phone / street address / postcode / national ID and
 *     a labelled DOB are still redacted, and the person-NER pass
 *     (`sanitizePiiAsync({ enableNer: true })`) is UNCHANGED. Employer /
 *     organisation names and city/region are preserved only insofar as
 *     `compromise` does not person-tag them (the common case).
 *
 * ## Why person-NER is NOT modified under `'cv'`
 *
 * An earlier draft suppressed PERSON spans that `compromise` also tagged as an
 * organisation or place, to rescue surname-shaped employers. That was removed
 * (SD-002 review, PR #66) for two reasons:
 *   1. Near-zero benefit — `compromise` tags an employer as EITHER a person OR
 *      an organisation, almost never both, so overlap-suppression rescued
 *      almost nothing.
 *   2. It INTRODUCED a name-recall leak — a real person whose given name is
 *      also a place/org token (Paris, Austin, Georgia, Sydney, Florence,
 *      Brooklyn, Dakota, Morgan, …) would have their `[person]` span
 *      suppressed and their name PRESERVED into the very embedding this path
 *      exists to protect. For a privacy library that trade is net-negative.
 *
 * ## Known limitation (field-aware API is the required follow-up)
 *
 * Because person-NER is unchanged, a surname-shaped employer that `compromise`
 * person-tags is STILL redacted to `[person]` under `'cv'`. Empirically
 * (issue #64 investigation, 30-employer basket) that is ~2/30 real employers
 * ("Morgan Stanley", "Ericsson") — an accepted PRECISION residual. The robust
 * fix is a FIELD-AWARE API: the platform passes structured CV sections
 * (title / employer / dates / description), so a per-field policy — never run
 * person-NER over the employer field, always run it over the name field —
 * fixes BOTH precision (preserve those employers) AND recall (never leak a
 * name that happens to look like a place/org). That is tracked as the required
 * follow-up for `jobflow-platform#1424`; the `'cv'` profile is the in-library
 * best-effort that lands first and fully resolves the date over-redaction.
 */
export type RedactionProfile = 'default' | 'cv';
