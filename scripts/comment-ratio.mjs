#!/usr/bin/env node
/**
 * Comment-ratio ratchet for CI. Every in-scope file at HEAD is measured against the same file at the
 * merge base of HEAD and `COMMENT_RATIO_BASE` (default `origin/main`). When no merge base is reachable
 * (a shallow clone cut above it) the check stops with exit 2 rather than measuring another commit. A file
 * is over the line when its comment lines exceed `RATIO` of its code lines, from `RATIO_FLOOR` comment
 * lines up. Fails when a file added since the base is over the line, when a file over the line gained
 * comment lines, or when the count of files over the line rose. Lines are classified by
 * `lib/strip-comments.mjs`. Exit 0 pass · 1 offenders, one line each · 2 the checker failed (fail closed):
 * a git error, no merge base, or no in-scope file at HEAD.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyLines } from './lib/strip-comments.mjs';

export const RATIO = 0.25;
export const RATIO_FLOOR = 30;
export const DEFAULT_BASE = 'origin/main';
const SOURCE_RE = /^(src|scripts)\/.*\.(ts|tsx|js|mjs|cjs)$/;

export function inScope(filePath) {
  return SOURCE_RE.test(filePath);
}

export const overLine = (code, comment) => comment >= RATIO_FLOOR && comment > RATIO * code;

/** `git diff --name-status -M -z base head` → new path → old path for renames and copies only. */
export function parseRenames(output) {
  const tokens = output.split('\0');
  const renames = new Map();
  for (let i = 0; i + 1 < tokens.length && tokens[i] !== ''; ) {
    const status = tokens[i];
    const moved = status[0] === 'R' || status[0] === 'C';
    if (status[0] === 'R') renames.set(tokens[i + 2], tokens[i + 1]);
    i += moved ? 3 : 2;
  }
  return renames;
}

const text = (buf) => buf.toString('utf8').trim();

/** The merge base of `baseRef` and HEAD; when git finds none, the error names the shallow-clone fix if the clone is shallow. */
export function resolveBase(git, baseRef) {
  const shallow = text(git(['rev-parse', '--is-shallow-repository'])) === 'true';
  try {
    return text(git(['merge-base', baseRef, 'HEAD']));
  } catch (e) {
    const hint = shallow ? ' (shallow clone — fetch the full history: actions/checkout fetch-depth: 0)' : '';
    throw new Error(`no merge base between ${baseRef} and HEAD${hint}: ${e?.message ?? e}`);
  }
}

/** Blob bytes per `<rev>:<path>` spec from one `git cat-file --batch`; a spec git cannot resolve throws. */
function readBlobs(git, specs) {
  const blobs = new Map();
  if (specs.length === 0) return blobs;
  const out = git(['cat-file', '--batch'], `${specs.join('\n')}\n`);
  let pos = 0;
  for (const spec of specs) {
    const eol = out.indexOf(10, pos);
    const header = out.toString('utf8', pos, eol);
    if (!/ blob \d+$/.test(header)) throw new Error(`git cat-file: ${header}`);
    const size = Number(header.slice(header.lastIndexOf(' ') + 1));
    blobs.set(spec, out.subarray(eol + 1, eol + 1 + size));
    pos = eol + 1 + size + 1;
  }
  return blobs;
}

/** Code and comment lines of every in-scope file in the tree at `rev`. */
export function measure(git, rev, classify) {
  const files = git(['ls-tree', '-r', '-z', '--name-only', rev]).toString('utf8').split('\0').filter(inScope);
  const blobs = readBlobs(git, files.map((p) => `${rev}:${p}`));
  return new Map(files.map((p) => [p, classify(blobs.get(`${rev}:${p}`), p)]));
}

const countOver = (measures) => [...measures.values()].filter((x) => overLine(x.code, x.comment)).length;

export function evaluate(base, head, renames) {
  const offenders = [];
  for (const [p, { code, comment }] of head) {
    if (!overLine(code, comment)) continue;
    const prev = base.get(renames.get(p) ?? p);
    if (prev === undefined) offenders.push({ kind: 'new', path: p, code, comment, oldComment: 0 });
    else if (comment > prev.comment) offenders.push({ kind: 'worsened', path: p, code, comment, oldComment: prev.comment });
  }
  return { offenders, baseCount: countOver(base), headCount: countOver(head) };
}

export function formatOffender({ kind, path: filePath, code, comment, oldComment }) {
  const change = kind === 'new' ? `new file with ${comment}` : `${oldComment} → ${comment}`;
  return `${filePath}: ${change} comment lines on ${code} code lines — comment ≤ ${RATIO * 100}% of code, from ${RATIO_FLOOR} comment lines`;
}

/**
 * @param {{ git: (args: string[], input?: string) => Buffer, env?: Record<string, string | undefined>,
 *   log?: (line: string) => void, error?: (line: string) => void,
 *   classify?: (buf: Buffer, filePath: string) => { code: number, comment: number } }} deps
 * @returns {0 | 1 | 2} the process exit code
 */
export function run({ git, env = process.env, log = console.log, error = console.error, classify = classifyLines }) {
  try {
    const baseRef = env.COMMENT_RATIO_BASE || DEFAULT_BASE;
    const rev = resolveBase(git, baseRef);
    const headSha = text(git(['rev-parse', '--verify', 'HEAD^{commit}']));
    const renames = parseRenames(git(['diff', '--name-status', '-M', '-z', rev, 'HEAD']).toString('utf8'));
    const base = measure(git, rev, classify);
    const head = measure(git, 'HEAD', classify);
    if (head.size === 0) throw new Error('no in-scope file at HEAD — nothing was measured');
    const { offenders, baseCount, headCount } = evaluate(base, head, renames);
    for (const o of offenders) error(formatOffender(o));
    const rose = headCount > baseCount;
    if (rose) error(`comment-ratio: files over the line rose from ${baseCount} to ${headCount} — the count never rises.`);
    const verdict = offenders.length === 0 && !rose ? 'pass' : 'FAIL';
    log(`comment-ratio: ${headCount} of ${head.size} in-scope files over the line at HEAD ${headSha.slice(0, 7)}, ${baseCount} of ${base.size} at base ${rev.slice(0, 7)} (merge base with ${baseRef}) — ${verdict}`);
    return verdict === 'pass' ? 0 : 1;
  } catch (e) {
    error(`comment-ratio: internal error — ${e?.message ?? e}`);
    return 2;
  }
}

export function runGit(args, input) {
  const stdin = input === undefined ? 'ignore' : 'pipe';
  return execFileSync('git', args, { input, stdio: [stdin, 'pipe', 'pipe'], maxBuffer: 64 << 20 });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = run({ git: runGit });
