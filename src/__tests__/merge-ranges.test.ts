import { describe, it, expect } from 'vitest';

import { mergeRanges } from '../redact-ranges.js';
import { applyNerRedactions } from '../sanitize-pii-async.js';
import type { NerSpan } from '../ner/ner-engine.js';

describe('mergeRanges', () => {
  it('returns no ranges for no input', () => {
    expect(mergeRanges([])).toEqual([]);
  });

  it('keeps disjoint ranges, sorted by start', () => {
    expect(
      mergeRanges([
        { start: 23, end: 40 },
        { start: 5, end: 19 },
      ]),
    ).toEqual([
      { start: 5, end: 19 },
      { start: 23, end: 40 },
    ]);
  });

  it('merges overlapping ranges into one', () => {
    expect(
      mergeRanges([
        { start: 3, end: 9 },
        { start: 5, end: 12 },
      ]),
    ).toEqual([{ start: 3, end: 12 }]);
  });

  it('merges a range nested inside another', () => {
    expect(
      mergeRanges([
        { start: 3, end: 12 },
        { start: 5, end: 8 },
      ]),
    ).toEqual([{ start: 3, end: 12 }]);
  });

  it('merges ranges that touch end-to-start', () => {
    expect(
      mergeRanges([
        { start: 3, end: 8 },
        { start: 8, end: 12 },
      ]),
    ).toEqual([{ start: 3, end: 12 }]);
  });

  it('collapses identical duplicates', () => {
    expect(
      mergeRanges([
        { start: 3, end: 12 },
        { start: 3, end: 12 },
      ]),
    ).toEqual([{ start: 3, end: 12 }]);
  });

  it('returns plain start/end pairs whatever else the input carries', () => {
    const spans: NerSpan[] = [{ start: 3, end: 8, score: 1, label: 'PERSON' }];
    expect(mergeRanges(spans)).toStrictEqual([{ start: 3, end: 8 }]);
  });

  it('does not reorder or mutate the ranges it is given', () => {
    const ranges = [
      { start: 23, end: 40 },
      { start: 5, end: 19 },
    ];
    mergeRanges(ranges);
    expect(ranges).toEqual([
      { start: 23, end: 40 },
      { start: 5, end: 19 },
    ]);
  });
});

describe('applyNerRedactions — spans merge before the name is replaced', () => {
  const span = (start: number, end: number): NerSpan => ({ start, end, score: 1, label: 'PERSON' });

  it('two touching person spans become one token', () => {
    const original = 'Hi AnnaMaria here';
    expect(applyNerRedactions(original, [span(3, 7), span(7, 12)], original, '[person]')).toBe('Hi [person] here');
  });

  it('two overlapping person spans become one token', () => {
    const original = 'Hi AnnaMaria here';
    expect(applyNerRedactions(original, [span(3, 9), span(6, 12)], original, '[person]')).toBe('Hi [person] here');
  });

  it('two disjoint person spans become two tokens', () => {
    const original = 'Anna met Maria';
    expect(applyNerRedactions(original, [span(9, 14), span(0, 4)], original, '[person]')).toBe('[person] met [person]');
  });
});
