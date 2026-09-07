import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RATIO, RATIO_FLOOR } from '../comment-ratio.mjs';

const SCRIPT = fileURLToPath(new URL('../comment-ratio.mjs', import.meta.url));
const HEAVY = 'src/heavy.ts';
const NEW = 'src/new.ts';
const SMALL = 'src/small.ts';
const tail = `— comment ≤ ${RATIO * 100}% of code, from ${RATIO_FLOOR} comment lines`;

// The fixture repos must not see the host's git config; git refuses os.devNull on Windows, so an empty file.
const noConfigDir = mkdtempSync(join(tmpdir(), 'comment-ratio-noconfig-'));
const EMPTY_CONFIG = join(noConfigDir, 'gitconfig');
writeFileSync(EMPTY_CONFIG, '');
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: EMPTY_CONFIG, GIT_CONFIG_SYSTEM: EMPTY_CONFIG, COMMENT_RATIO_BASE: '' };
afterAll(() => rmSync(noConfigDir, { recursive: true, force: true }));

let repo: string;

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: ENV });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} → ${r.status}: ${r.stderr}`);
  return r.stdout;
}

function writeMixed(cwd: string, rel: string, code: number, comment: number): void {
  const lines: string[] = [];
  for (let i = 0; i < Math.max(code, comment); i += 1) {
    if (i < comment) lines.push(i % 2 ? `// note ${i}` : `/** doc ${i} */`);
    if (i < code) lines.push(`export const v${i} = ${i};`);
  }
  mkdirSync(join(cwd, rel, '..'), { recursive: true });
  writeFileSync(join(cwd, rel), `${lines.join('\n')}\n`);
}

function commit(cwd: string, rel: string, message: string): void {
  git(cwd, 'add', '--', rel);
  git(cwd, 'commit', '-q', '-m', message);
}

function ratio(cwd: string, env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8', env: { ...ENV, ...env } });
}

describe('comment-ratio against a real git repository', { timeout: 60_000 }, () => {
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'comment-ratio-'));
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.email', 'ratio@test.local');
    git(repo, 'config', 'user.name', 'ratio');
    writeMixed(repo, HEAVY, 100, 40);
    commit(repo, HEAVY, 'init');
    git(repo, 'update-ref', 'refs/remotes/origin/main', 'main');
    git(repo, 'checkout', '-q', '-b', 'feat');
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('HEAD at the base → exit 0, counts equal, the base named as the merge base', () => {
    const r = ratio(repo);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/1 of 1 .*over the line at HEAD .*1 of 1 .*at base .*merge base with origin\/main/);
  });

  it('a new file with 100 code and 40 comment lines is rejected (exit 1)', () => {
    writeMixed(repo, NEW, 100, 40);
    commit(repo, NEW, 'add new');
    const r = ratio(repo);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${NEW}: new file with 40 comment lines on 100 code lines ${tail}`);
    expect(r.stdout).toMatch(/2 of 2 .*at HEAD .*1 of 1 .*at base/);
  });

  it('an existing file over the line gaining one comment line is rejected (exit 1)', () => {
    writeMixed(repo, HEAVY, 100, 41);
    commit(repo, HEAVY, 'grow');
    const r = ratio(repo);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${HEAVY}: 40 → 41 comment lines on 100 code lines ${tail}`);
  });

  it('the same file losing one comment line passes (exit 0)', () => {
    writeMixed(repo, HEAVY, 100, 39);
    commit(repo, HEAVY, 'shrink');
    const r = ratio(repo);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });

  it('a new file with 20 comment lines on 10 code lines never fires (exit 0)', () => {
    writeMixed(repo, SMALL, 10, 20);
    commit(repo, SMALL, 'small');
    expect(ratio(repo).status).toBe(0);
  });

  it('the base advancing after the branch point is measured at the merge base, not the tip', () => {
    git(repo, 'checkout', '-q', 'main');
    writeMixed(repo, NEW, 100, 40);
    commit(repo, NEW, 'main grows a heavy file');
    git(repo, 'update-ref', 'refs/remotes/origin/main', 'main');
    git(repo, 'checkout', '-q', 'feat');
    writeMixed(repo, SMALL, 10, 0);
    commit(repo, SMALL, 'feat adds a small file');
    const r = ratio(repo);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/1 of 2 .*at HEAD .*1 of 1 .*at base/);
  });

  /** main gains the heavy NEW after the branch point and feat adds the same file: new at the merge base, unchanged at main's tip. */
  function baseAdvancesWithTheSameFile(): void {
    git(repo, 'checkout', '-q', 'main');
    writeMixed(repo, NEW, 100, 40);
    commit(repo, NEW, 'main grows a heavy file');
    git(repo, 'checkout', '-q', 'feat');
    writeMixed(repo, NEW, 100, 40);
    commit(repo, NEW, 'feat adds the same heavy file');
  }

  function cloneFeat(dir: string, ...flags: string[]): string {
    git(dir, 'clone', '-q', ...flags, '--branch', 'feat', `file://${repo.replace(/\\/g, '/')}`, 'clone');
    return join(dir, 'clone');
  }

  it('a shallow clone whose base advanced after the branch point blocks with exit 2 naming fetch-depth: 0 — never a pass at the tip', () => {
    baseAdvancesWithTheSameFile();
    const cloneDir = mkdtempSync(join(tmpdir(), 'comment-ratio-shallow-'));
    try {
      const clone = cloneFeat(cloneDir, '--depth=1');
      git(clone, 'fetch', '-q', '--no-tags', '--depth=1', 'origin', '+refs/heads/main:refs/remotes/origin/main');
      expect(git(clone, 'rev-parse', '--is-shallow-repository').trim()).toBe('true');
      const r = ratio(clone);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/no merge base between origin\/main and HEAD.*shallow clone.*fetch-depth: 0/);
      expect(r.stdout).toBe('');
    } finally {
      rmSync(cloneDir, { recursive: true, force: true });
    }
  });

  it('the same history in a full clone, as CI checks out, is measured at the merge base: the file is new there (exit 1)', () => {
    baseAdvancesWithTheSameFile();
    const cloneDir = mkdtempSync(join(tmpdir(), 'comment-ratio-full-'));
    try {
      const clone = cloneFeat(cloneDir);
      git(clone, 'fetch', '-q', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main');
      expect(git(clone, 'rev-parse', '--is-shallow-repository').trim()).toBe('false');
      const r = ratio(clone);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`${NEW}: new file with 40 comment lines on 100 code lines ${tail}`);
      expect(r.stdout).toMatch(/2 of 2 .*at HEAD .*1 of 1 .*at base .*merge base with origin\/main/);
    } finally {
      rmSync(cloneDir, { recursive: true, force: true });
    }
  });

  it('a git failure — the base blob gone from the object store — blocks with exit 2', () => {
    writeMixed(repo, HEAVY, 100, 41);
    commit(repo, HEAVY, 'grow');
    const oid = git(repo, 'rev-parse', `main:${HEAVY}`).trim();
    rmSync(join(repo, '.git', 'objects', oid.slice(0, 2), oid.slice(2)));
    const r = ratio(repo);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/internal error/);
  });

  it('a base ref that does not exist blocks with exit 2', () => {
    const r = ratio(repo, { COMMENT_RATIO_BASE: 'origin/nowhere' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/internal error/);
  });
});
