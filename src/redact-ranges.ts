// COMPLIANCE: destructive one-way redaction — the ranges passed in are used solely to splice the token into the
// output; range bounds and the text they cover are never logged, returned or stored.
// Record: docs/compliance/redaction-record.md § 1.

export interface ByteRange {
  start: number;
  end: number;
}

// Sorts a copy by start (longest first on a tie) and folds overlapping or
// touching `[start, end)` ranges into disjoint plain pairs.
export function mergeRanges(ranges: ReadonlyArray<ByteRange>): ByteRange[] {
  const sorted = [...ranges].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const merged: ByteRange[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      if (r.end > last.end) last.end = r.end;
    } else {
      merged.push({ start: r.start, end: r.end });
    }
  }
  return merged;
}

// Replaces each merged range with `token` from the end backwards so earlier
// offsets stay valid.
export function redactRanges(
  text: string,
  ranges: ReadonlyArray<ByteRange>,
  token: string,
): string {
  if (ranges.length === 0) return text;

  const merged = mergeRanges(ranges);
  let out = text;
  for (let i = merged.length - 1; i >= 0; i -= 1) {
    const { start, end } = merged[i]!;
    out = out.slice(0, start) + token + out.slice(end);
  }
  return out;
}
