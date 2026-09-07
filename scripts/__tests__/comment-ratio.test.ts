import { describe, it, expect, vi } from 'vitest';

import {
  RATIO,
  RATIO_FLOOR,
  DEFAULT_BASE,
  inScope,
  overLine,
  parseRenames,
  evaluate,
  formatOffender,
  run,
} from '../comment-ratio.mjs';

type Measure = { code: number; comment: number };
type Measures = Map<string, Measure>;
type Classify = (buf: Buffer, filePath: string) => Measure;
type GitMap = Record<string, string | Error>;

const HEAVY = 'src/heavy.ts';
const NEW = 'src/new.ts';
const m = (entries: Array<[string, number, number]>): Measures =>
  new Map(entries.map(([p, code, comment]) => [p, { code, comment }]));

describe('comment-ratio — constants every fixture derives from', () => {
  it('holds the ruled ratio, floor and base ref', () => {
    expect(RATIO).toBe(0.25);
    expect(RATIO_FLOOR).toBe(30);
    expect(DEFAULT_BASE).toBe('origin/main');
  });
});

describe('comment-ratio — inScope: src/** and scripts/** sources, tests included', () => {
  it('includes ts/tsx/js/mjs/cjs under src and scripts', () => {
    for (const p of ['src/a.ts', 'src/__tests__/a.test.ts', 'src/ner/b.ts', 'scripts/x.mjs', 'scripts/__tests__/x.test.ts', 'scripts/lib/y.js'])
      expect(inScope(p), p).toBe(true);
  });
  it('excludes everything else', () => {
    for (const p of ['docs/a.md', 'README.md', 'package.json', 'dist/index.js', 'src/fixture.json', '.github/workflows/ci.yml'])
      expect(inScope(p), p).toBe(false);
  });
});

describe('comment-ratio — overLine: comments over RATIO of code, from RATIO_FLOOR comment lines', () => {
  const CODE = 200;
  const AT_LINE = RATIO * CODE;
  it('at the line passes, one comment line over fails', () => {
    expect(overLine(CODE, AT_LINE)).toBe(false);
    expect(overLine(CODE, AT_LINE + 1)).toBe(true);
  });
  it('under the floor never fires, whatever the code count', () => {
    expect(overLine(0, RATIO_FLOOR - 1)).toBe(false);
    expect(overLine(0, RATIO_FLOOR)).toBe(true);
  });
});

describe('comment-ratio — parseRenames: `git diff --name-status -M -z base head`', () => {
  it('maps a renamed new path to its old path and ignores other statuses', () => {
    const out = 'M\0src/a.ts\0A\0src/b.ts\0R100\0src/old.ts\0src/new.ts\0D\0src/gone.ts\0C075\0src/c.ts\0src/d.ts\0';
    expect([...parseRenames(out)]).toEqual([['src/new.ts', 'src/old.ts']]);
  });
  it('empty output → no renames', () => {
    expect(parseRenames('').size).toBe(0);
  });
});

describe('comment-ratio — evaluate: the three ratchet rules', () => {
  const CODE = 100;
  const AT_LINE = RATIO * CODE;

  it('a file added at the line passes; one comment line over is a new-file offender', () => {
    expect(evaluate(m([]), m([[NEW, CODE, AT_LINE]]), new Map()).offenders).toEqual([]);
    const r = evaluate(m([]), m([[NEW, CODE, AT_LINE + 1]]), new Map());
    expect(r.offenders).toEqual([{ kind: 'new', path: NEW, code: CODE, comment: AT_LINE + 1, oldComment: 0 }]);
    expect(formatOffender(r.offenders[0])).toBe(
      `${NEW}: new file with ${AT_LINE + 1} comment lines on ${CODE} code lines — comment ≤ ${RATIO * 100}% of code, from ${RATIO_FLOOR} comment lines`,
    );
  });

  it('a file added under the floor never fires, whatever its ratio', () => {
    expect(evaluate(m([]), m([[NEW, 10, RATIO_FLOOR - 1]]), new Map()).offenders).toEqual([]);
  });

  it('an existing file over the line: one more comment line is an offender, the same or fewer passes', () => {
    const base = m([[HEAVY, CODE, 40]]);
    const r = evaluate(base, m([[HEAVY, CODE, 41]]), new Map());
    expect(r.offenders).toEqual([{ kind: 'worsened', path: HEAVY, code: CODE, comment: 41, oldComment: 40 }]);
    expect(formatOffender(r.offenders[0])).toBe(
      `${HEAVY}: 40 → 41 comment lines on ${CODE} code lines — comment ≤ ${RATIO * 100}% of code, from ${RATIO_FLOOR} comment lines`,
    );
    expect(evaluate(base, m([[HEAVY, CODE, 40]]), new Map()).offenders).toEqual([]);
    expect(evaluate(base, m([[HEAVY, CODE, 39]]), new Map()).offenders).toEqual([]);
  });

  it('a file under the line may gain comment lines', () => {
    expect(evaluate(m([[HEAVY, CODE, 10]]), m([[HEAVY, CODE, AT_LINE]]), new Map()).offenders).toEqual([]);
  });

  it('counts files over the line on both sides; a file crossing the line by losing code raises the count', () => {
    const r = evaluate(m([[HEAVY, 200, 40]]), m([[HEAVY, 100, 40]]), new Map());
    expect(r.offenders).toEqual([]);
    expect(r.baseCount).toBe(0);
    expect(r.headCount).toBe(1);
  });

  it('a deleted file over the line lowers the count and is never an offender', () => {
    const r = evaluate(m([[HEAVY, 100, 40], [NEW, 100, 40]]), m([[HEAVY, 100, 40]]), new Map());
    expect(r.offenders).toEqual([]);
    expect(r.baseCount).toBe(2);
    expect(r.headCount).toBe(1);
  });

  it('a renamed file over the line compares against its old path: unchanged passes, grown is worsened', () => {
    const renames = new Map([['src/b.ts', 'src/a.ts']]);
    expect(evaluate(m([['src/a.ts', 100, 40]]), m([['src/b.ts', 100, 40]]), renames).offenders).toEqual([]);
    expect(evaluate(m([['src/a.ts', 100, 40]]), m([['src/b.ts', 100, 41]]), renames).offenders).toEqual([
      { kind: 'worsened', path: 'src/b.ts', code: 100, comment: 41, oldComment: 40 },
    ]);
  });
});

const code = (n: number) => 'export const v = 1;\n'.repeat(n);
const comments = (n: number) => '// c\n'.repeat(n);
const BASE_SHA = 'b'.repeat(40);
const HEAD_SHA = 'h'.repeat(40);

function batchOutput(map: GitMap, input: string | undefined): Buffer {
  const specs = (input ?? '').split('\n').filter(Boolean);
  const chunks = specs.map((spec) => {
    const value = map[spec];
    if (value === undefined) return `${spec} missing\n`;
    if (value instanceof Error) throw value;
    return `0123abcd blob ${Buffer.byteLength(value)}\n${value}\n`;
  });
  return Buffer.from(chunks.join(''));
}

function fakeGit(map: GitMap) {
  return vi.fn((args: string[], input?: string): Buffer => {
    const key = args.join(' ');
    if (key === 'cat-file --batch') return batchOutput(map, input);
    const value = map[key];
    if (value === undefined) throw new Error(`unexpected git call: ${key}`);
    if (value instanceof Error) throw value;
    return Buffer.from(value);
  });
}

type Tree = Record<string, string>;

/** A fake repository: `base` and `head` trees, non-shallow unless told, with `origin/main` reachable. */
function repo(base: Tree, head: Tree, { shallow = false, renames = '' } = {}): GitMap {
  const map: GitMap = {
    'rev-parse --is-shallow-repository': `${shallow}\n`,
    [`merge-base ${DEFAULT_BASE} HEAD`]: `${BASE_SHA}\n`,
    [`rev-parse --verify ${DEFAULT_BASE}^{commit}`]: `${BASE_SHA}\n`,
    [`rev-parse --verify ${BASE_SHA}^{commit}`]: `${BASE_SHA}\n`,
    'rev-parse --verify HEAD^{commit}': `${HEAD_SHA}\n`,
    [`diff --name-status -M -z ${BASE_SHA} HEAD`]: renames,
    [`ls-tree -r -z --name-only ${BASE_SHA}`]: Object.keys(base).map((p) => `${p}\0`).join(''),
    'ls-tree -r -z --name-only HEAD': Object.keys(head).map((p) => `${p}\0`).join(''),
  };
  for (const [p, text] of Object.entries(base)) map[`${BASE_SHA}:${p}`] = text;
  for (const [p, text] of Object.entries(head)) map[`HEAD:${p}`] = text;
  return map;
}

function harness(map: GitMap, env: Record<string, string> = {}, classify?: Classify) {
  const out: string[] = [];
  const err: string[] = [];
  const git = fakeGit(map);
  const exit = run({ git, env, classify, log: (l: string) => out.push(l), error: (l: string) => err.push(l) });
  return { exit, out, err, git };
}

const heavy = { [HEAVY]: `${comments(40)}${code(100)}` };

describe('comment-ratio — run: exit 1 on an offender or a risen count, exit 0 otherwise, one assert line with both counts', () => {
  it('a new 100-code/40-comment file → exit 1, the offender on stderr, the assert line names 0 → 1', () => {
    const h = harness(repo({}, { [NEW]: `${comments(40)}${code(100)}` }));
    expect(h.exit).toBe(1);
    expect(h.err.join('\n')).toContain(`${NEW}: new file with 40 comment lines on 100 code lines`);
    expect(h.out.join('\n')).toMatch(/1 of 1 .*over the line at HEAD .*0 of 0 .*at base/);
  });

  it('the same file with 25 comment lines → exit 0 and the assert line', () => {
    const h = harness(repo({}, { [NEW]: `${comments(25)}${code(100)}` }));
    expect(h.exit).toBe(0);
    expect(h.err).toEqual([]);
    expect(h.out.join('\n')).toMatch(/0 of 1 .*over the line at HEAD .*0 of 0 .*at base/);
  });

  it('an existing heavy file gaining one comment line → exit 1 with the worsened line', () => {
    const h = harness(repo(heavy, { [HEAVY]: `${comments(41)}${code(100)}` }));
    expect(h.exit).toBe(1);
    expect(h.err.join('\n')).toContain(`${HEAVY}: 40 → 41 comment lines on 100 code lines`);
  });

  it('the count rising with no per-file offender → exit 1 naming both counts', () => {
    const h = harness(repo({ [HEAVY]: `${comments(40)}${code(200)}` }, { [HEAVY]: `${comments(40)}${code(100)}` }));
    expect(h.exit).toBe(1);
    expect(h.err.join('\n')).toMatch(/rose from 0 to 1/);
  });

  it('identical trees → exit 0, counts equal', () => {
    const h = harness(repo(heavy, heavy));
    expect(h.exit).toBe(0);
    expect(h.out.join('\n')).toMatch(/1 of 1 .*over the line at HEAD .*1 of 1 .*at base/);
  });

  it('out-of-scope files are never read', () => {
    const h = harness(repo({ 'README.md': comments(50) }, { 'README.md': comments(60), 'docs/x.md': comments(60) }));
    expect(h.exit).toBe(0);
    expect(h.git.mock.calls.filter((c) => c[0][0] === 'cat-file')).toEqual([]);
  });

  it('reads every blob of a side in ONE cat-file --batch call per side', () => {
    const base = { 'src/a.ts': code(5), 'src/b.ts': code(5) };
    const h = harness(repo(base, { ...base, 'src/c.ts': code(5) }));
    expect(h.exit).toBe(0);
    expect(h.git.mock.calls.filter((c) => c[0][0] === 'cat-file')).toHaveLength(2);
  });

  it('uses the injected classifier for every in-scope file on both sides', () => {
    const classify = vi.fn<Classify>(() => ({ code: 10, comment: 0 }));
    const base = { 'src/a.ts': code(5), 'src/b.ts': code(5) };
    harness(repo(base, base), {}, classify);
    expect(classify).toHaveBeenCalledTimes(4);
  });
});

describe('comment-ratio — run: the base is the merge base, or the base tip in a shallow clone', () => {
  it('non-shallow: measures the merge base with origin/main and says so', () => {
    const h = harness(repo(heavy, heavy));
    expect(h.git).toHaveBeenCalledWith(['merge-base', DEFAULT_BASE, 'HEAD']);
    expect(h.out.join('\n')).toMatch(/merge base with origin\/main/);
  });

  it('shallow: never calls merge-base, measures the base tip and says the clone is shallow', () => {
    const h = harness(repo(heavy, heavy, { shallow: true }));
    expect(h.exit).toBe(0);
    expect(h.git).not.toHaveBeenCalledWith(['merge-base', DEFAULT_BASE, 'HEAD']);
    expect(h.out.join('\n')).toMatch(/origin\/main tip, shallow clone/);
  });

  it('COMMENT_RATIO_BASE overrides the base ref', () => {
    const map = repo(heavy, heavy);
    map['merge-base release HEAD'] = `${BASE_SHA}\n`;
    const h = harness(map, { COMMENT_RATIO_BASE: 'release' });
    expect(h.exit).toBe(0);
    expect(h.git).toHaveBeenCalledWith(['merge-base', 'release', 'HEAD']);
  });

  it('a rename is compared against its old path', () => {
    const renames = 'R100\0src/a.ts\0src/b.ts\0';
    const h = harness(repo({ 'src/a.ts': `${comments(40)}${code(100)}` }, { 'src/b.ts': `${comments(40)}${code(100)}` }, { renames }));
    expect(h.exit).toBe(0);
    expect(h.git).toHaveBeenCalledWith(['diff', '--name-status', '-M', '-z', BASE_SHA, 'HEAD']);
  });
});

describe('comment-ratio — run: any git failure blocks with exit 2, never a silent pass', () => {
  it('a base ref that does not resolve → exit 2 with the error named', () => {
    const map = repo(heavy, heavy);
    map[`merge-base ${DEFAULT_BASE} HEAD`] = new Error('fatal: Not a valid object name origin/main');
    const h = harness(map);
    expect(h.exit).toBe(2);
    expect(h.err.join('\n')).toMatch(/internal error/);
    expect(h.err.join('\n')).toMatch(/Not a valid object name/);
  });

  it('a blob git reports as missing → exit 2', () => {
    const map = repo(heavy, heavy);
    delete map[`HEAD:${HEAVY}`];
    const h = harness(map);
    expect(h.exit).toBe(2);
    expect(h.err.join('\n')).toContain(`HEAD:${HEAVY} missing`);
  });

  it('not a git repository → exit 2', () => {
    const h = harness({ 'rev-parse --is-shallow-repository': new Error('fatal: not a git repository') });
    expect(h.exit).toBe(2);
  });
});
