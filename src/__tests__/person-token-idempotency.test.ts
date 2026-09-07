// `[person]` and `<<REDACTED_PERSON>>` contain no digit and no `@`, so no regex pattern matches them, and
// `compromise` does not tag them as names — so a second pass in either format is a no-op.

import { describe, it, expect } from 'vitest';

import { sanitizePii } from '../sanitize-pii.js';
import { sanitizePiiAsync } from '../sanitize-pii-async.js';
import { CompromiseNerEngine } from '../ner/compromise-ner-engine.js';
import {
  emailPattern,
  addressPattern,
  addressFrPattern,
  addressDePattern,
  addressItPattern,
  addressEsPattern,
  addressPtPattern,
  postcodeUkPattern,
  postcodeFrPattern,
  postcodeDePattern,
  postcodeItPattern,
  postcodeEsPattern,
  postcodePtPattern,
  phoneInternationalPattern,
  phoneDomesticPattern,
  dobPattern,
} from '../patterns.js';

const READABLE_PERSON = '[person]';
const SENTINEL_PERSON = '<<REDACTED_PERSON>>';

const ALL_REGEX_FACTORIES = [
  emailPattern,
  addressPattern,
  addressFrPattern,
  addressDePattern,
  addressItPattern,
  addressEsPattern,
  addressPtPattern,
  postcodeUkPattern,
  postcodeFrPattern,
  postcodeDePattern,
  postcodeItPattern,
  postcodeEsPattern,
  postcodePtPattern,
  phoneInternationalPattern,
  phoneDomesticPattern,
  dobPattern,
];

describe('[person] / <<REDACTED_PERSON>> — pattern-disjoint from all 21 existing patterns', () => {
  it('no v1.x regex matches [person] in isolation', () => {
    for (const factory of ALL_REGEX_FACTORIES) {
      const re = factory();
      expect(re.test(READABLE_PERSON)).toBe(false);
    }
  });

  it('no v1.x regex matches <<REDACTED_PERSON>> in isolation', () => {
    for (const factory of ALL_REGEX_FACTORIES) {
      const re = factory();
      expect(re.test(SENTINEL_PERSON)).toBe(false);
    }
  });

  it('sanitizePii([person]) returns [person] unchanged', () => {
    expect(sanitizePii(READABLE_PERSON)).toBe(READABLE_PERSON);
  });

  it('sanitizePii(<<REDACTED_PERSON>>) returns <<REDACTED_PERSON>> unchanged', () => {
    expect(sanitizePii(SENTINEL_PERSON)).toBe(SENTINEL_PERSON);
  });

  it('sanitizePii([person] sentence) leaves the token intact', () => {
    const text = `Welcome ${READABLE_PERSON}. Please review.`;
    expect(sanitizePii(text)).toBe(text);
  });

  it('sanitizePii in sentinel mode also leaves [person] intact (cross-format idempotency)', () => {
    const text = `Welcome ${READABLE_PERSON}.`;
    expect(sanitizePii(text, { tokenFormat: 'sentinel' })).toBe(text);
  });
});

describe('compromise NER does not detect [person] / <<REDACTED_PERSON>> as a person', () => {
  it('CompromiseNerEngine emits no span on a [person] token in isolation', async () => {
    const engine = new CompromiseNerEngine();
    await engine.ready;
    const spans = await engine.detectPersonSpans(`Welcome ${READABLE_PERSON} today.`);
    const matched = spans.map((s) =>
      `Welcome ${READABLE_PERSON} today.`.slice(s.start, s.end),
    );
    expect(matched).not.toContain(READABLE_PERSON);
    expect(matched.some((m) => m.includes('[') || m.includes(']'))).toBe(false);
  });

  it('CompromiseNerEngine emits no span on a <<REDACTED_PERSON>> token in isolation', async () => {
    const engine = new CompromiseNerEngine();
    await engine.ready;
    const text = `Welcome ${SENTINEL_PERSON} today.`;
    const spans = await engine.detectPersonSpans(text);
    const matched = spans.map((s) => text.slice(s.start, s.end));
    expect(matched).not.toContain(SENTINEL_PERSON);
    expect(matched.some((m) => m.includes('REDACTED'))).toBe(false);
  });
});

describe('sanitizePiiAsync idempotency — full pipeline', () => {
  it('sanitizePiiAsync(sanitizePiiAsync(text)) === sanitizePiiAsync(text) (regex-only path)', async () => {
    const text = 'Contact jane@example.com about 12 rue de la Paix, 75001 Paris.';
    const once = await sanitizePiiAsync(text);
    const twice = await sanitizePiiAsync(once);
    expect(twice).toBe(once);
  });

  it('sanitizePiiAsync idempotent with NER (compromise) — Western European fixture', async () => {
    const text = 'Hi, my name is Alice Brown and I work at Acme.';
    const once = await sanitizePiiAsync(text, { enableNer: true });
    const twice = await sanitizePiiAsync(once, { enableNer: true });
    expect(twice).toBe(once);
  });

  it('sanitizePiiAsync idempotent with NER + sentinel format', async () => {
    const text = 'Bob Smith joined the team on 12.03.1985.';
    const once = await sanitizePiiAsync(text, {
      enableNer: true,
      tokenFormat: 'sentinel',
    });
    const twice = await sanitizePiiAsync(once, {
      enableNer: true,
      tokenFormat: 'sentinel',
    });
    expect(twice).toBe(once);
  });
});
