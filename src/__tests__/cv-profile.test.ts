/**
 * CV redaction profile (v1.3 — issue #64).
 *
 * The `'cv'` profile preserves employment dates (its one behavioural change:
 * a cue-gated DOB pass) and, passively, employer/organisation names and
 * city/region (compromise mostly does not person-tag them), while STILL
 * masking true PII (person name, email, phone, street address, postcode,
 * national ID, and an explicitly-labelled date of birth).
 *
 * Test groups:
 *   1. CV-preserve (sync): full employment dates + regex-safe employers +
 *      cities pass through intact under `{ profile: 'cv' }`.
 *   2. CV-preserve (async + NER): applicant name masked; employer + city
 *      passed through (not person-tagged); employment dates preserved.
 *   3. PII-guard (async + NER): true PII STILL masked under `'cv'` — the fix
 *      must not weaken redaction recall.
 *   4. Labelled DOB still masked under `'cv'` (sync + async).
 *   5. Default-profile unchanged — pins v1.2 byte-identical behaviour.
 *   6. Person-NER pass unchanged — accepted residual (person-tagged employer
 *      still redacted) + recall safety (cv person-redaction === default).
 *
 * See `src/profiles.ts` for the profile contract.
 */

import { describe, it, expect } from 'vitest';

import { sanitizePii } from '../sanitize-pii.js';
import { sanitizePiiAsync } from '../sanitize-pii-async.js';
import type { NerEngine, NerSpan } from '../ner/ner-engine.js';

/**
 * Deterministic engine emitting caller-supplied PERSON spans without loading
 * compromise. The `'cv'` profile does NOT change the person-NER pass, so the
 * mock only needs to supply person spans.
 */
class MockNerEngine implements NerEngine {
  public readonly engineId = 'mock';
  public readonly ready = Promise.resolve();
  constructor(private readonly personSpans: ReadonlyArray<NerSpan>) {}
  async detectPersonSpans(): Promise<ReadonlyArray<NerSpan>> {
    return this.personSpans;
  }
}

// A CV whose employers are org-tagged / untagged (compromise does NOT
// person-tag Siemens / Deloitte) and whose cities are place-tagged. The
// employment dates are FULL DD/MM/YYYY dates — these DO match the default
// dobPattern and are destroyed to [dob] under the default profile.
const CV_TEXT = [
  'Jane Doe',
  'Senior Software Engineer at Siemens, Munich, from 01/06/2018 to 31/08/2021.',
  'Consultant at Deloitte, Manchester, from 15/09/2015 to 20/05/2018.',
  'Email: jane.doe@example.com',
].join('\n');

describe('cv profile — CV-preserve (sync, regex-only)', () => {
  it('preserves full employment start/end dates that the default profile destroys', () => {
    const out = sanitizePii(CV_TEXT, { profile: 'cv' });
    expect(out).toContain('01/06/2018');
    expect(out).toContain('31/08/2021');
    expect(out).toContain('15/09/2015');
    expect(out).toContain('20/05/2018');
    expect(out).not.toContain('[dob]');
  });

  it('preserves employer and city tokens (regex pass never touched them)', () => {
    const out = sanitizePii(CV_TEXT, { profile: 'cv' });
    expect(out).toContain('Siemens');
    expect(out).toContain('Deloitte');
    expect(out).toContain('Munich');
    expect(out).toContain('Manchester');
  });

  it('still redacts email under the cv profile', () => {
    const out = sanitizePii(CV_TEXT, { profile: 'cv' });
    expect(out).toContain('[email]');
    expect(out).not.toContain('jane.doe@example.com');
  });
});

describe('cv profile — CV-preserve (async + NER)', () => {
  it('masks the applicant name but preserves employers, cities and dates', async () => {
    const out = await sanitizePiiAsync(CV_TEXT, {
      profile: 'cv',
      enableNer: true,
    });
    // Applicant name masked
    expect(out).toContain('[person]');
    expect(out).not.toContain('Jane Doe');
    // Employers + cities preserved
    expect(out).toContain('Siemens');
    expect(out).toContain('Deloitte');
    expect(out).toContain('Munich');
    expect(out).toContain('Manchester');
    // Employment dates preserved
    expect(out).toContain('01/06/2018');
    expect(out).toContain('20/05/2018');
    // Email still masked
    expect(out).toContain('[email]');
  });
});

describe('cv profile — PII-guard (async + NER): true PII still masked', () => {
  const PII_TEXT = [
    'Jane Doe',
    'Email: jane.doe@example.com',
    'Phone: +44 555 123 4567',
    'Address: 42 Baker Street, London',
    'Postcode: SW1A 1AA',
    'National Insurance: AB123456C',
  ].join('\n');

  it('masks person, email, phone, street address, postcode and national ID under cv profile', async () => {
    const out = await sanitizePiiAsync(PII_TEXT, {
      profile: 'cv',
      enableNer: true,
    });
    expect(out).toContain('[person]');
    expect(out).not.toContain('Jane Doe');
    expect(out).toContain('[email]');
    expect(out).not.toContain('jane.doe@example.com');
    expect(out).toContain('[phone]');
    expect(out).not.toContain('555 123 4567');
    expect(out).toContain('[address]');
    expect(out).not.toContain('42 Baker Street');
    expect(out).toContain('[postcode]');
    expect(out).not.toContain('SW1A 1AA');
    expect(out).toContain('[nationalId]');
    expect(out).not.toContain('AB123456C');
  });

  it('does not regress PII recall vs the default profile (same true-PII tokens present)', async () => {
    const cvOut = await sanitizePiiAsync(PII_TEXT, {
      profile: 'cv',
      enableNer: true,
    });
    const defaultOut = await sanitizePiiAsync(PII_TEXT, { enableNer: true });
    for (const token of [
      '[person]',
      '[email]',
      '[phone]',
      '[address]',
      '[postcode]',
      '[nationalId]',
    ]) {
      expect(cvOut).toContain(token);
      expect(defaultOut).toContain(token);
    }
  });
});

describe('cv profile — explicitly-labelled DOB still masked', () => {
  it('redacts a "Date of birth:" labelled date (sync)', () => {
    expect(sanitizePii('Date of birth: 23/05/1985', { profile: 'cv' })).toBe(
      'Date of birth: [dob]',
    );
  });

  it('redacts a "DOB:" labelled ISO date (sync)', () => {
    expect(sanitizePii('DOB: 1985-05-23 on record', { profile: 'cv' })).toBe(
      'DOB: [dob] on record',
    );
  });

  it('redacts a "born on" labelled named-month date (sync)', () => {
    expect(
      sanitizePii('Born on 12 March 1985 in London.', { profile: 'cv' }),
    ).toBe('Born on [dob] in London.');
  });

  it('redacts EU-locale birth cues (sync)', () => {
    expect(sanitizePii('geboren am 23.05.1985 in Berlin', { profile: 'cv' })).toBe(
      'geboren am [dob] in Berlin',
    );
    expect(sanitizePii('Né le 12 mars 1985 à Lyon.', { profile: 'cv' })).toBe(
      'Né le [dob] à Lyon.',
    );
  });

  it('redacts a labelled DOB in the async NER path', async () => {
    const out = await sanitizePiiAsync('Date of birth: 23/05/1985', {
      profile: 'cv',
      enableNer: true,
    });
    expect(out).toContain('[dob]');
    expect(out).not.toContain('23/05/1985');
  });
});

describe('cv profile — cue boundary', () => {
  it('a birth cue does not fire inside a longer word and does not reach a later date', () => {
    expect(sanitizePii('reborn 12/03/1985 as a coder', { profile: 'cv' })).toBe(
      'reborn 12/03/1985 as a coder',
    );
    expect(
      sanitizePii('born in Lyon, employed from 01/06/2018', { profile: 'cv' }),
    ).toBe('born in Lyon, employed from 01/06/2018');
  });
});

describe('cv profile — default profile unchanged (byte-identical pin)', () => {
  it('default profile still redacts a bare full date to [dob]', () => {
    expect(sanitizePii('Interview on 23/05/1985 confirmed.')).toBe(
      'Interview on [dob] confirmed.',
    );
    expect(
      sanitizePii('Interview on 23/05/1985 confirmed.', { profile: 'default' }),
    ).toBe('Interview on [dob] confirmed.');
  });

  it('cv profile preserves the same bare full date', () => {
    expect(
      sanitizePii('Interview on 23/05/1985 confirmed.', { profile: 'cv' }),
    ).toBe('Interview on 23/05/1985 confirmed.');
  });

  it('omitting profile is byte-identical to profile: "default" across a PII soup', () => {
    const text =
      'Jane Doe, jane@example.com, 06 12 34 56 78, 12 rue de la Paix, 75001 Paris, born 23/05/1985';
    expect(sanitizePii(text)).toBe(sanitizePii(text, { profile: 'default' }));
  });
});

describe('cv profile — person-NER pass is unchanged (accepted residual + recall safety)', () => {
  // The `'cv'` profile deliberately does NOT alter person-NER. An earlier draft
  // suppressed PERSON spans that compromise also tagged ORG/PLACE; that was
  // removed (SD-002, PR #66) because it leaked the names of real people whose
  // given name is also a place/org token (Paris, Austin, Morgan, …) into the
  // embedding. These tests pin the resulting contract:
  //   (a) accepted residual — a person-tagged employer IS still redacted (the
  //       robust fix for that precision gap is the field-aware API follow-up,
  //       jobflow-platform#1424);
  //   (b) recall safety — a person span is redacted under 'cv' exactly as under
  //       'default', regardless of any org/place shape.

  it('accepted residual: a person-tagged employer is STILL redacted under cv', async () => {
    // "Morgan Stanley" is the ~2/30 employer class compromise person-tags. The
    // cv profile does not rescue it — redaction (recall) is preserved. Robust
    // preservation requires the field-aware API (jobflow-platform#1424).
    const text = 'Worked at Morgan Stanley in 2019.';
    const start = text.indexOf('Morgan Stanley');
    const end = start + 'Morgan Stanley'.length;
    const engine = new MockNerEngine([
      { start, end, score: 1.0, label: 'PERSON' },
    ]);
    const out = await sanitizePiiAsync(text, {
      profile: 'cv',
      enableNer: true,
      nerEngine: engine,
    });
    expect(out).toContain('[person]');
    expect(out).not.toContain('Morgan Stanley');
  });

  it('recall safety: person redaction under cv is identical to default', async () => {
    const text = 'Worked at Morgan Stanley in 2019.';
    const start = text.indexOf('Morgan Stanley');
    const end = start + 'Morgan Stanley'.length;
    const spans = [{ start, end, score: 1.0, label: 'PERSON' }];
    const cvOut = await sanitizePiiAsync(text, {
      profile: 'cv',
      enableNer: true,
      nerEngine: new MockNerEngine(spans),
    });
    const defaultOut = await sanitizePiiAsync(text, {
      enableNer: true,
      nerEngine: new MockNerEngine(spans),
    });
    expect(cvOut).toBe(defaultOut);
    expect(cvOut).toContain('[person]');
  });

  it('a person span is still redacted under cv (referee name)', async () => {
    const text = 'Referee: Alice Brown.';
    const start = text.indexOf('Alice Brown');
    const end = start + 'Alice Brown'.length;
    const engine = new MockNerEngine([
      { start, end, score: 1.0, label: 'PERSON' },
    ]);
    const out = await sanitizePiiAsync(text, {
      profile: 'cv',
      enableNer: true,
      nerEngine: engine,
    });
    expect(out).toContain('[person]');
    expect(out).not.toContain('Alice Brown');
  });
});
