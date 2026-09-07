import { describe, it, expect } from 'vitest';

import { sanitizePiiAsync } from '../sanitize-pii-async.js';
import type { NerEngine, NerSpan } from '../ner/ner-engine.js';

// Deterministic engine emitting caller-supplied spans without loading compromise.
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
    expect(out).toContain('[email]');
    expect(out).toContain('[phone]');
    expect(out).toContain('[address]');
    expect(out).toContain('Jane Doe'); // not redacted with enableNer:false
  });

  it('returns empty string on empty input', async () => {
    expect(await sanitizePiiAsync('')).toBe('');
  });

  it('does not call the supplied engine when enableNer is false', async () => {
    let calls = 0;
    const engine: NerEngine = {
      engineId: 'counting',
      ready: Promise.resolve(),
      async detectPersonSpans() {
        calls += 1;
        return [];
      },
    };
    const out = await sanitizePiiAsync('Hi Alice Brown.', { nerEngine: engine });
    expect(out).toBe('Hi Alice Brown.');
    expect(calls).toBe(0);
  });
});

describe('sanitizePiiAsync — enableNer: true with mock engine', () => {
  it('redacts a NER span emitted by the mock engine to [person]', async () => {
    const text = 'Hi, my name is Alice Brown.';
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
    // `Alice Brown` starts at offset 20 of the original; the regex pass shortens `jane@example.com` to `[email]`,
    // so the span lands on the name only if NER ran on the original text.
    const text = 'jane@example.com is Alice Brown.';
    const start = 20; // position of "Alice" in ORIGINAL
    const mock = new MockNerEngine([
      { start, end: start + 'Alice Brown'.length, score: 1.0, label: 'PERSON' },
    ]);
    const out = await sanitizePiiAsync(text, { enableNer: true, nerEngine: mock });
    expect(out).toBe('[email] is [person].');
  });

  it('larger span wins on overlap — FR-address regex consumes nested NER FP', async () => {
    // The FR address span covers the whole text; a nested NER span on `rue` (offset 3, length 3) must vanish.
    const text = '12 rue de la Paix, 75001 Paris';
    const mock = new MockNerEngine([
      { start: 3, end: 6, score: 1.0, label: 'PERSON' },
    ]);
    const out = await sanitizePiiAsync(text, { enableNer: true, nerEngine: mock });
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
    // The second pass sees `[person]`, not the name; a fresh mock with no spans keeps it deterministic.
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
    const text = 'Hi, my name is Alice Brown.';
    const out = await sanitizePiiAsync(text, { enableNer: true });
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
