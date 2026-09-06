// COMPLIANCE: matched substrings MUST NOT be logged. Match counts permitted.
// Redaction is destructive / one-way: the byte ranges passed in are used
// solely to splice the replacement token into the output string. Range
// bounds and the text they cover are never written to logs, telemetry, or
// any other side-channel. (GDPR Art. 5(1)(c) data-minimisation, Art. 25
// transparency contract.)

export interface ByteRange {
  start: number;
  end: number;
}

// Merges overlapping or touching `[start, end)` ranges, then replaces each
// merged range with `token` from the end backwards so earlier offsets stay valid.
export function redactRanges(
  text: string,
  ranges: ReadonlyArray<ByteRange>,
  token: string,
): string {
  if (ranges.length === 0) return text;

  const sorted = [...ranges].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const merged: ByteRange[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      if (r.end > last.end) last.end = r.end;
    } else {
      merged.push({ ...r });
    }
  }

  let out = text;
  for (let i = merged.length - 1; i >= 0; i -= 1) {
    const { start, end } = merged[i]!;
    out = out.slice(0, start) + token + out.slice(end);
  }
  return out;
}
