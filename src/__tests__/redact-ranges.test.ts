import { describe, it, expect } from 'vitest';

import { redactRanges } from '../redact-ranges.js';

const TEXT = 'call 06 12 34 56 78 or +33 6 12 34 56 78 today';

describe('redactRanges — no candidates', () => {
  it('returns the input untouched when there are no ranges', () => {
    expect(redactRanges(TEXT, [], '[phone]')).toBe(TEXT);
  });
});

describe('redactRanges — disjoint candidates', () => {
  it('replaces a single range with the token', () => {
    expect(redactRanges(TEXT, [{ start: 5, end: 19 }], '[phone]')).toBe(
      'call [phone] or +33 6 12 34 56 78 today',
    );
  });

  it('replaces every range and keeps the text between them', () => {
    expect(
      redactRanges(
        TEXT,
        [
          { start: 5, end: 19 },
          { start: 23, end: 40 },
        ],
        '[phone]',
      ),
    ).toBe('call [phone] or [phone] today');
  });

  it('accepts ranges in any order', () => {
    expect(
      redactRanges(
        TEXT,
        [
          { start: 23, end: 40 },
          { start: 5, end: 19 },
        ],
        '[phone]',
      ),
    ).toBe('call [phone] or [phone] today');
  });
});

describe('redactRanges — overlapping candidates', () => {
  it('merges two overlapping ranges into one token', () => {
    expect(
      redactRanges(
        'id AB123456C here',
        [
          { start: 3, end: 9 },
          { start: 5, end: 12 },
        ],
        '[nationalId]',
      ),
    ).toBe('id [nationalId] here');
  });

  it('merges a range nested inside another into one token', () => {
    expect(
      redactRanges(
        'id AB123456C here',
        [
          { start: 3, end: 12 },
          { start: 5, end: 8 },
        ],
        '[nationalId]',
      ),
    ).toBe('id [nationalId] here');
  });

  it('merges ranges that touch end-to-start into one token', () => {
    expect(
      redactRanges(
        'id AB123456C here',
        [
          { start: 3, end: 8 },
          { start: 8, end: 12 },
        ],
        '[nationalId]',
      ),
    ).toBe('id [nationalId] here');
  });

  it('merges identical duplicate ranges into one token', () => {
    expect(
      redactRanges(
        'id AB123456C here',
        [
          { start: 3, end: 12 },
          { start: 3, end: 12 },
        ],
        '[nationalId]',
      ),
    ).toBe('id [nationalId] here');
  });
});

describe('redactRanges — caller input', () => {
  it('does not reorder or mutate the ranges it is given', () => {
    const ranges = [
      { start: 23, end: 40 },
      { start: 5, end: 19 },
    ];
    redactRanges(TEXT, ranges, '[phone]');
    expect(ranges).toEqual([
      { start: 23, end: 40 },
      { start: 5, end: 19 },
    ]);
  });
});
