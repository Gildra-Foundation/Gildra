export type DiffToken = { text: string; changed: boolean };
/** Word-level LCS. Keeps original whitespace and never interprets game text as HTML. */
export function diffWords(before: string, after: string): { before: DiffToken[]; after: DiffToken[] } {
  const a = before.match(/\s+|[^\s]+/g) ?? [];
  const b = after.match(/\s+|[^\s]+/g) ?? [];
  if (a.length * b.length > 250_000) return { before: [{ text: before, changed: before !== after }], after: [{ text: after, changed: before !== after }] };
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const left: DiffToken[] = [], right: DiffToken[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { left.push({ text: a[i++], changed: false }); right.push({ text: b[j++], changed: false }); }
    else if (i < a.length && (j === b.length || dp[i + 1][j] >= dp[i][j + 1])) left.push({ text: a[i++], changed: true });
    else right.push({ text: b[j++], changed: true });
  }
  return { before: left, after: right };
}
