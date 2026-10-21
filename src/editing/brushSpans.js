// SPDX-License-Identifier: MS-PL
// Row-interval adaptation for TEdit shapes; see vendor/tedit-editing-rules/.
export function addBrushSpan(spans, y, from, to) {
  if (from > to) return;
  const row = spans.get(y) ?? [];
  let i = 0;
  while (i < row.length && row[i + 1] < from - 1) i += 2;
  const begin = i;
  while (i < row.length && row[i] <= to + 1) {
    from = Math.min(from, row[i]); to = Math.max(to, row[i + 1]); i += 2;
  }
  row.splice(begin, i - begin, from || 0, to || 0); spans.set(y, row);
}

export function subtractBrushRow(row, cut) {
  const remaining = [];
  for (let i = 0; i < row.length; i += 2) {
    let cursor = row[i]; const to = row[i + 1];
    for (let j = 0; cut && j < cut.length && cursor <= to; j += 2) {
      if (cut[j + 1] < cursor) continue;
      if (cut[j] > to) break;
      if (cut[j] > cursor) remaining.push(cursor, cut[j] - 1);
      cursor = Math.max(cursor, cut[j + 1] + 1);
    }
    if (cursor <= to) remaining.push(cursor, to);
  }
  return remaining;
}

export function brushFromSpans(shape, spans) {
  if (!spans.size) return { shape, left: 0, top: 0, width: 0, height: 0, rows: [] };
  const top = Math.min(...spans.keys()), bottom = Math.max(...spans.keys());
  let left = Infinity, right = -Infinity;
  const rows = Array.from({ length: bottom - top + 1 }, (_, i) => {
    const row = spans.get(top + i) ?? null;
    if (row) { left = Math.min(left, row[0]); right = Math.max(right, row.at(-1)); }
    return row;
  });
  return { shape, left, top, width: right - left + 1, height: rows.length, rows };
}

export function containsBrushCell({ rows, top }, x, y) {
  const row = rows[y - top];
  for (let i = 0; row && i < row.length; i += 2) if (x >= row[i] && x <= row[i + 1]) return true;
  return false;
}
