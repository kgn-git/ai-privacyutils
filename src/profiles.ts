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
 *   - `'cv'` — CV / embedding profile. PRESERVES employment dates,
 *     employer/organisation names and city/region; STILL REDACTS person
 *     name, email, phone, street address, postcode, national ID and an
 *     explicitly-labelled date of birth. Concretely, relative to
 *     `'default'`:
 *       1. Dates are NOT redacted by shape. Only a date carrying an explicit
 *          date-of-birth context cue (`Date of birth:`, `DOB:`, `born on`,
 *          and the EU-locale birth cues) is redacted. Plain employment
 *          start/end dates pass through.
 *       2. When person-NER is enabled (`sanitizePiiAsync({ enableNer: true })`),
 *          PERSON spans that compromise ALSO tags as an organisation or a
 *          place are suppressed (org / location false-positives are
 *          preserved). See `CompromiseNerEngine.detectPreserveSpans`.
 *
 * ## Known limitation (field-aware API is the required follow-up)
 *
 * `compromise` tags a surname-shaped employer as EITHER a person OR an
 * organisation — almost never both. Empirically (issue #64 investigation,
 * 30-employer basket) only ~2/30 real employers are person-tagged
 * ("Morgan Stanley", "Ericsson"); those are NOT org-tagged, so the org /
 * place overlap-suppression above cannot rescue them. The robust fix for
 * that residual class is a FIELD-AWARE API — the platform passes structured
 * CV sections (title / employer / dates / description), so a per-field
 * policy (never run person-NER over the employer field) preserves 100% of
 * employers. That is tracked as the required follow-up for
 * `jobflow-platform#1424`; the `'cv'` profile is the in-library
 * best-effort that lands first.
 */
export type RedactionProfile = 'default' | 'cv';
