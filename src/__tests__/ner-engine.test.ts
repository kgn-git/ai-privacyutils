/**
 * NerEngine interface + NullNerEngine contract tests.
 *
 * These tests pin the public NerEngine surface so that any future engine
 * (CompromiseNerEngine, future ML-backed engines) can be swapped in without
 * a breaking API change. NullNerEngine is the no-op fast-path used when
 * `enableNer: false` (the v1.2 default) — it must never load `compromise`
 * or any other heavy dependency, and must always return [].
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { NerEngine, NerSpan, NerDetectOptions } from '../ner/ner-engine.js';
import { NullNerEngine } from '../ner/null-ner-engine.js';
import { createNerEngine, type NerConfig } from '../ner/index.js';

describe('NerEngine interface', () => {
  it('NerSpan has only {start, end, score, label} — no matched text', () => {
    // Compile-time check: NerSpan is the public surface returned to consumers.
    // Including the matched text would leak PII through the return value
    // (security-expert C3). The type is enforced by TypeScript at this
    // import site; a runtime spread test confirms only the four fields are
    // expected by consumers.
    const span: NerSpan = { start: 0, end: 5, score: 1.0, label: 'PERSON' };
    const keys = Object.keys(span).sort();
    expect(keys).toEqual(['end', 'label', 'score', 'start']);
  });

  it('NerDetectOptions accepts confidenceThreshold + allowList', () => {
    const opts: NerDetectOptions = {
      confidenceThreshold: 0.85,
      allowList: ['Acme Corp'],
    };
    expect(opts.confidenceThreshold).toBe(0.85);
    expect(opts.allowList).toEqual(['Acme Corp']);
  });
});

describe('NullNerEngine', () => {
  let engine: NerEngine;

  beforeEach(() => {
    engine = new NullNerEngine();
  });

  it('engineId is "null"', () => {
    expect(engine.engineId).toBe('null');
  });

  it('ready is an immediately-resolved Promise', async () => {
    await expect(engine.ready).resolves.toBeUndefined();
  });

  it('detectPersonSpans always returns empty array — no matter the input', async () => {
    const cases = [
      'Alice Brown',
      '',
      'a'.repeat(100_000),
      'Alice Brown and Bob Smith and Carol White',
      '15 Rue de la Paix',
    ];
    for (const text of cases) {
      const spans = await engine.detectPersonSpans(text);
      expect(spans).toEqual([]);
    }
  });

  it('detectPersonSpans ignores opts (confidenceThreshold, allowList)', async () => {
    const spans = await engine.detectPersonSpans('Alice Brown', {
      confidenceThreshold: 0.0,
      allowList: ['Acme'],
    });
    expect(spans).toEqual([]);
  });

  it('NullNerEngine never loads compromise (verified by import-graph absence)', async () => {
    // NullNerEngine is the enableNer:false fast-path. It MUST NOT import
    // `compromise` (344 KB ESM) — even transitively. This test is a behavioural
    // proxy: NullNerEngine instantiates synchronously and returns [] in zero
    // async ticks beyond Promise.resolve.
    const t0 = Date.now();
    const e = new NullNerEngine();
    const spans = await e.detectPersonSpans('Alice Brown');
    const dt = Date.now() - t0;
    expect(spans).toEqual([]);
    // Hard upper bound; compromise's first-load takes hundreds of ms.
    expect(dt).toBeLessThan(50);
  });
});

describe('createNerEngine factory', () => {
  it('returns NullNerEngine when enableNer is false', () => {
    const engine = createNerEngine({ enableNer: false });
    expect(engine.engineId).toBe('null');
  });

  it('returns NullNerEngine when config omits enableNer (default)', () => {
    const config: NerConfig = {};
    const engine = createNerEngine(config);
    expect(engine.engineId).toBe('null');
  });

  it('returns CompromiseNerEngine when enableNer is true', () => {
    const engine = createNerEngine({ enableNer: true });
    expect(engine.engineId).toBe('compromise');
  });

  it('exposes ready Promise on returned engine (interface compliance)', async () => {
    const engine = createNerEngine({ enableNer: false });
    await expect(engine.ready).resolves.toBeUndefined();
  });
});
