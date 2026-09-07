import { describe, it, expect, vi } from 'vitest';

vi.mock('compromise', () => ({ default: () => ({}) }));

import { CompromiseNerEngine, PiiNerLoadError } from '../ner/compromise-ner-engine.js';

describe('CompromiseNerEngine — fail closed on an unexpected module shape', () => {
  it('rejects with PiiNerLoadError instead of returning no spans', async () => {
    const engine = new CompromiseNerEngine();
    await expect(engine.ready).rejects.toBeInstanceOf(PiiNerLoadError);
    await expect(engine.detectPersonSpans('Alice Brown applied.')).rejects.toBeInstanceOf(
      PiiNerLoadError,
    );
  });
});
