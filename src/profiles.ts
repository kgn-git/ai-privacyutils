// COMPLIANCE: `'default'` redacts every date shape; `'cv'` redacts a date only behind a birth cue and changes
// nothing else — email, phone, address, postcode, national ID and the NER pass are identical, so a person-tagged
// employer is still redacted under `'cv'` (R11-residual). Record: docs/compliance/redaction-record.md § 3.6, § 5.
export type RedactionProfile = 'default' | 'cv';
