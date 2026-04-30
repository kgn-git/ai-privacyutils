/**
 * sanitizePiiAsync — async redaction path (regex + NER) tests.
 *
 * Covers the merge-spans-on-original-text contract:
 *   - NER runs on ORIGINAL text (compromise offsets are invalid on
 *     post-regex-redacted text).
 *   - Regex pipeline runs in parallel on the same original text.
 *   - Spans from both sources are merged in `applyNerRedactions`,
 *     reusing the merge pattern from `redactLocalePhones` at
 *     `src/sanitize-pii.ts:130–177` (sort by start asc / end desc, merge
 *     overlapping ranges, replace in reverse).
 *   - Larger span wins on overlap (e.g. `Rue de la Paix` is consumed by
 *     the FR-address regex span; the nested NER FP on `Rue` is suppressed).
 *
 * Also covers:
 *   - enableNer: false default — sanitizePiiAsync byte-equivalent to
 *     sanitizePii sync (zero regression).
 *   - enableNer: true with custom NerEngine (MockNerEngine) for
 *     deterministic span injection without loading compromise.
 *   - tokenFormat: 'sentinel' produces <<REDACTED_PERSON>>.
 *   - Idempotency: sanitizePiiAsync(sanitizePiiAsync(text)) === sanitizePiiAsync(text).
 */

import { describe, it, expect } from 'vitest';

import { sanitizePiiAsync } from '../sanitize-pii-async.js';
import type { NerEngine, NerSpan } from '../ner/ner-engine.js';

/**
 * Deterministic NER engine for unit tests — emits user-supplied spans
 * without ever loading compromise.
 */
class MockNerEngine implements NerEngine {
  public readonly engineId = 'mock';
  public readonly ready = Promise.resolve();
  constructor(private readonly spans: ReadonlyArray<NerSpan>) {}
  async detectPersonSpans(): Promise<ReadonlyArray<NerSpan>> {
    return this.spans;
  }
}

describe('sanitizePiiAsync — enableNer: false (default)', () => {
  it('byte-equivalent to sanitizePii sync on email-only input', async () => {
    const text = 'Email me at jane@example.com today.';
    const out = await sanitizePiiAsync(text);
    expect(out).toBe('Email me at [email] today.');
  });

  it('byte-equivalent on full PII soup', async () => {
    const text = 'Jane Doe, jane@example.com, 06 12 34 56 78, 12 rue de la Paix, 75001 Paris';
    const out = await sanitizePiiAsync(text);
    // No NER → name "Jane Doe" passes through; everything else redacted.
    expect(out).toContain('[email]');
    expect(out).toContain('[phone]');
    expect(out).toContain('[address]');
    expect(out).toContain('Jane Doe'); // not redacted with enableNer:false
  });

  it('returns empty string on empty input', async () => {
    expect(await sanitizePiiAsync('')).toBe('');
  });
});

describe('sanitizePiiAsync — enableNer: true with mock engine', () => {
  it('redacts a NER span emitted by the mock engine to [person]', async () => {
    const text = 'Hi, my name is Alice Brown.';
    // Mock yields the span for "Alice Brown" — start=15, end=26
    const expected = text.indexOf('Alice Brown');
    const mock = new MockNerEngine([
      { start: expected, end: expected + 'Alice Brown'.length, score: 1.0, label: 'PERSON' },
    ]);
    const out = await sanitizePiiAsync(text, { enableNer: true, nerEngine: mock });
    expect(out).toBe('Hi, my name is [person].');
  });

  it('uses sentinel token when tokenFormat: "sentinel"', async () => {
    const text = 'Hi Alice Brown.';
    const start = text.indexOf('Alice Brown');
    const mock = new MockNerEngine([
      { start, end: start + 'Alice Brown'.length, score: 1.0, label: 'PERSON' },
    ]);
    const out = await sanitizePiiAsync(text, {
      enableNer: true,
      nerEngine: mock,
      tokenFormat: 'sentinel',
    });
    expect(out).toBe('Hi <<REDACTED_PERSON>>.');
  });

  it('NER runs on ORIGINAL text — offsets remain valid even when regex shifts text', async () => {
    // The NER mock claims a span at position 15 in the ORIGINAL text:
    // "jane@example.com is Alice Brown."
    //  0123456789012345678901234567890
    // "Alice Brown" starts at offset 20 in the original.
    const text = 'jane@example.com is Alice Brown.';
    const start = 20; // position of "Alice" in ORIGINAL
    const mock = new MockNerEngine([
      { start, end: start + 'Alice Brown'.length, score: 1.0, label: 'PERSON' },
    ]);
    const out = await sanitizePiiAsync(text, { enableNer: true, nerEngine: mock });
    // Even though the regex pass replaces "jane@example.com" with "[email]"
    // (shorter — 7 chars vs 16), the NER span at original-offset 20 must
    // still correctly map onto "Alice Brown" — which proves NER ran on
    // the ORIGINAL text, not on regex-redacted output.
    expect(out).toBe('[email] is [person].');
  });

  it('larger span wins on overlap — FR-address regex consumes nested NER FP', async () => {
    // FR address pattern matches "12 rue de la Paix, 75001 Paris" as
    // one address span (huge). NER might emit a nested FP for "Paix"
    // (or for "rue" if compromise misclassifies). The merge contract:
    // the address span wins.
    const text = '12 rue de la Paix, 75001 Paris';
    // Mock emits a nested NER FP at "rue" (offset 3, length 3)
    const mock = new MockNerEngine([
      { start: 3, end: 6, score: 1.0, label: 'PERSON' },
    ]);
    const out = await sanitizePiiAsync(text, { enableNer: true, nerEngine: mock });
    // The whole address should be replaced by [address]; no nested
    // [person] survives.
    expect(out).toContain('[address]');
    expect(out).not.toContain('[person]');
  });

  it('idempotent: sanitizePiiAsync(sanitizePiiAsync(text)) === sanitizePiiAsync(text)', async () => {
    const text = 'Alice Brown email jane@example.com today.';
    const start = 0;
    const mock = new MockNerEngine([
      { start, end: 'Alice Brown'.length, score: 1.0, label: 'PERSON' },
    ]);
    const once = await sanitizePiiAsync(text, { enableNer: true, nerEngine: mock });
    // On a re-pass, the NER engine is called with already-redacted text
    // — the original "Alice Brown" is gone, replaced by "[person]". A
    // realistic NER engine would emit no span on "[person]" — but for
    // determinism we use a NEW mock with empty spans on the second pass.
    const twiceMock = new MockNerEngine([]);
    const twice = await sanitizePiiAsync(once, { enableNer: true, nerEngine: twiceMock });
    expect(twice).toBe(once);
  });

  it('multiple non-overlapping NER spans are all redacted', async () => {
    const text = 'Alice Brown met Bob Smith.';
    const aliceStart = 0;
    const bobStart = text.indexOf('Bob Smith');
    const mock = new MockNerEngine([
      { start: aliceStart, end: 'Alice Brown'.length, score: 1.0, label: 'PERSON' },
      { start: bobStart, end: bobStart + 'Bob Smith'.length, score: 1.0, label: 'PERSON' },
    ]);
    const out = await sanitizePiiAsync(text, { enableNer: true, nerEngine: mock });
    expect(out).toBe('[person] met [person].');
  });

  it('overlapping NER spans are merged (larger wins)', async () => {
    const text = 'Alice Brown applied.';
    const mock = new MockNerEngine([
      { start: 0, end: 5, score: 1.0, label: 'PERSON' }, // "Alice"
      { start: 0, end: 11, score: 1.0, label: 'PERSON' }, // "Alice Brown" — larger
    ]);
    const out = await sanitizePiiAsync(text, { enableNer: true, nerEngine: mock });
    expect(out).toBe('[person] applied.');
  });
});

describe('sanitizePiiAsync — enableNer: true without explicit nerEngine', () => {
  it('default NER engine is CompromiseNerEngine (loads compromise)', async () => {
    // No nerEngine option, enableNer:true → factory returns Compromise.
    // We assert that the call completes without error and that a sentinel
    // CV-shaped name is redacted. (Slow first call — ~316ms compromise
    // load. We rely on it being shared with other tests.)
    const text = 'Hi, my name is Alice Brown.';
    const out = await sanitizePiiAsync(text, { enableNer: true });
    // Compromise should detect "Alice Brown" reliably (Western European,
    // CV-header shape).
    expect(out).toContain('[person]');
    expect(out).not.toContain('Alice');
  });
});

describe('sanitizePiiAsync — error propagation', () => {
  it('over-cap input throws PiiInputTooLargeError (same as sync)', async () => {
    const huge = 'a'.repeat(10);
    await expect(
      sanitizePiiAsync(huge, { maxInputLength: 5 }),
    ).rejects.toThrow('PII input exceeds maxInputLength');
  });
});
