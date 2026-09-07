/**
 * The one comment classifier, derived from a `typescript` parse: a line is code iff a leaf token of
 * the parsed file touches it, a comment line is a non-blank line no token touches, and the text
 * between two tokens holds only whitespace and comments — so the stripped text is the source with
 * every comment blanked and every token and line break kept. Never a strip order, never the bare
 * scanner: a `/*` inside a line comment, a `//` inside a string or regex literal and JSX text are
 * all told apart by the parser alone. JSDoc subtrees and the EOF token are skipped.
 */
import { createRequire } from 'node:module';
import path from 'node:path';

let ts;
const typescript = () => (ts ??= createRequire(import.meta.url)('typescript'));

function scriptKind(filePath) {
  const { ScriptKind } = typescript();
  const ext = path.extname(filePath);
  if (ext === '.tsx') return ScriptKind.TSX;
  if (ext === '.ts') return ScriptKind.TS;
  return ext === '.jsx' ? ScriptKind.JSX : ScriptKind.JS;
}

/** Leaf tokens as `[start, end)` in source order; zero-width leaves (empty lists, missing nodes) are no token; a syntax error does not throw. */
function leafTokens(text, filePath) {
  const { SyntaxKind, ScriptTarget, createSourceFile } = typescript();
  const sf = createSourceFile(filePath, text, ScriptTarget.Latest, true, scriptKind(filePath));
  const tokens = [];
  const walk = (node) => {
    if (node.kind === SyntaxKind.EndOfFileToken) return;
    if (node.kind >= SyntaxKind.FirstJSDocNode && node.kind <= SyntaxKind.LastJSDocNode) return;
    const children = node.getChildren(sf);
    if (children.length > 0) {
      for (const child of children) walk(child);
      return;
    }
    const start = node.getStart(sf);
    const end = node.getEnd();
    if (end > start) tokens.push([start, end]);
  };
  walk(sf);
  return { sf, tokens };
}

/**
 * @param {Buffer | string} buf @param {string} filePath
 * @returns {{ code: number, comment: number, blank: number }}
 */
export function classifyLines(buf, filePath) {
  const text = typeof buf === 'string' ? buf : buf.toString('utf8');
  const { sf, tokens } = leafTokens(text, filePath);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line;
  const code = new Set();
  for (const [start, end] of tokens) {
    const last = lineOf(Math.max(start, end - 1));
    for (let line = lineOf(start); line <= last; line += 1) code.add(line);
  }
  const starts = sf.getLineStarts();
  const lines = starts[starts.length - 1] === text.length ? starts.length - 1 : starts.length;
  let comment = 0;
  let blank = 0;
  for (let i = 0; i < lines; i += 1) {
    if (code.has(i)) continue;
    if (text.slice(starts[i], starts[i + 1] ?? text.length).trim() === '') blank += 1;
    else comment += 1;
  }
  return { code: code.size, comment, blank };
}

/** @param {Buffer | string} buf @param {string} filePath @returns {number} */
export function countCodeLines(buf, filePath) {
  return classifyLines(buf, filePath).code;
}

function lineEnd(text, from, to) {
  const nl = text.indexOf('\n', from);
  return nl === -1 || nl > to ? to : nl;
}

/** Comment ranges inside a gap between tokens: a line comment to its line end, a block comment to its terminator, a shebang at 0. */
function commentRanges(text, from, to) {
  const ranges = [];
  let i = from;
  if (i === 0 && text.startsWith('#!')) {
    const eol = lineEnd(text, 0, to);
    ranges.push([0, eol]);
    i = eol;
  }
  while (i < to) {
    if (text.charCodeAt(i) === 47 && i + 1 < to) {
      const next = text.charCodeAt(i + 1);
      if (next === 47) {
        const eol = lineEnd(text, i, to);
        ranges.push([i, eol]);
        i = eol;
        continue;
      }
      if (next === 42) {
        const close = text.indexOf('*/', i + 2);
        const end = close === -1 || close + 2 > to ? to : close + 2;
        ranges.push([i, end]);
        i = end;
        continue;
      }
    }
    i += 1;
  }
  return ranges;
}

/** @param {string} source @param {string} filePath @returns {string} the source with every comment blanked, line breaks kept */
export function stripComments(source, filePath) {
  const { tokens } = leafTokens(source, filePath);
  const gaps = [];
  let gapStart = 0;
  for (const [start, end] of tokens) {
    if (start > gapStart) gaps.push([gapStart, start]);
    gapStart = Math.max(gapStart, end);
  }
  if (source.length > gapStart) gaps.push([gapStart, source.length]);
  let out = '';
  let pos = 0;
  for (const [from, to] of gaps) {
    for (const [s, e] of commentRanges(source, from, to)) {
      out += source.slice(pos, s) + source.slice(s, e).replace(/[^\r\n]/g, '');
      pos = e;
    }
  }
  return out + source.slice(pos);
}
