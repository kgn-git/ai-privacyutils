// The public `NerEngine` surface, the `NullNerEngine` no-op, and the rule that `compromise` is never a static
// import anywhere in src.

import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

import type { NerEngine, NerSpan, NerDetectOptions } from '../ner/ner-engine.js';
import { NullNerEngine } from '../ner/null-ner-engine.js';
import { createNerEngine, type NerConfig } from '../ner/index.js';

describe('NerEngine interface', () => {
  it('NerSpan has only {start, end, score, label} — no matched text', () => {
    // Compile-time surface: the four fields only, never the matched text (C3).
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
    // Behavioural proxy: a `compromise` first load takes hundreds of ms; the null engine answers within one tick.
    const t0 = Date.now();
    const e = new NullNerEngine();
    const spans = await e.detectPersonSpans('Alice Brown');
    const dt = Date.now() - t0;
    expect(spans).toEqual([]);
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

describe('compromise is loaded only dynamically', () => {
  it('no src file imports compromise statically', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== '__tests__') walk(p);
        } else if (p.endsWith('.ts')) {
          files.push(p);
        }
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
      const staticImports: string[] = [];
      sf.forEachChild((node) => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier !== undefined &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          node.moduleSpecifier.text === 'compromise'
        ) {
          staticImports.push(node.getText(sf));
        }
      });
      expect(staticImports, f).toEqual([]);
    }
  });
});
