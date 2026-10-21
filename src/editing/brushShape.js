// SPDX-License-Identifier: MS-PL
// TEdit contributors. Adapted from Fill/Shape/BrushSettings; see vendor/tedit-editing-rules/.
export const MAX_BRUSH_DIMENSION = 400;
export const BRUSH_SHAPES = [['rectangle', '矩形'], ['ellipse', '椭圆'],
  ['diagonalRight', '右斜线 ／'], ['diagonalLeft', '左斜线 ＼'], ['cross', 'X 形']];
export const isLineBrush = shape => ['diagonalRight', 'diagonalLeft', 'cross'].includes(shape);
export const maxLineThickness = ({ width, height }) => Math.max(1, Math.floor(Math.min(width, height) / 2));
const cache = new WeakMap();

export function createBrushShape(settings) {
  const { width, height, shape = 'rectangle', thickness = 1 } = settings;
  if (![width, height].every(value => Number.isInteger(value) && value >= 1 && value <= MAX_BRUSH_DIMENSION)
    || !BRUSH_SHAPES.some(([id]) => id === shape)
    || !Number.isInteger(thickness) || thickness < 1 || thickness > maxLineThickness(settings)) {
    throw new RangeError('画笔形状无效，宽高须为 1–400 格，线形粗细不可超过短边的一半。');
  }
  const saved = cache.get(settings);
  if (saved && saved.width === width && saved.height === height && saved.shape === shape && saved.thickness === thickness) return saved.value;
  const value = isLineBrush(shape) && width > 1 && height > 1
    ? lineBrush(width, height, shape, thickness) : filledBrush(width, height, shape);
  cache.set(settings, { width, height, shape, thickness, value });
  return value;
}

function filledBrush(width, height, shape) {
  const left = 0 - Math.floor(width / 2), top = 0 - Math.floor(height / 2);
  const rows = [];
  const f = Math.fround, rx = width / 2, ry = height / 2, cx = left + rx, cy = top + ry;
  for (let y = top; y < top + height; y++) {
    let from = left, to = left + width - 1;
    if (shape === 'ellipse') {
      const dy = f((y + .5 - cy) / ry), dySq = f(dy * dy);
      const span = f(rx * f(Math.sqrt(f(1 - dySq))));
      from = Math.max(Math.ceil(f(f(cx - span) - .5)), left);
      to = Math.min(Math.floor(f(f(cx + span) - .5)), left + width - 1);
    }
    rows.push(from <= to ? [from || 0, to || 0] : null);
  }
  return { shape, width, height, left, top, rows };
}

// Shape.DrawLine is float DDA with truncation, unlike the integer stroke trajectory.
function* linePoints(start, end) {
  const length = Math.max(Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1]));
  if (!length) return;
  const dx = Math.fround((end[0] - start[0]) / length), dy = Math.fround((end[1] - start[1]) / length);
  let [x, y] = start;
  for (let i = 0; i <= length; i++) {
    yield [Math.trunc(x) || 0, Math.trunc(y) || 0];
    x = Math.fround(x + dx); y = Math.fround(y + dy);
  }
}

function lineBrush(width, height, shape, thickness) {
  const left = -Math.floor(width / 2), top = -Math.floor(height / 2);
  const right = left + width - 1, bottom = top + height - 1;
  const segments = shape === 'diagonalRight' ? [[[left, bottom], [right, top]]]
    : shape === 'diagonalLeft' ? [[[left, top], [right, bottom]]]
      : [[[left, top], [right, bottom]], [[left, bottom], [right, top]]];
  const kernel = [];
  if (thickness === 1) kernel.push([0, 0]);
  else for (let y = -thickness; y <= thickness; y++) kernel.push([y, Math.floor(Math.sqrt(thickness * thickness - y * y))]);
  const spans = new Map();
  for (const [start, end] of segments) for (const [x, y] of linePoints(start, end)) for (const [dy, radius] of kernel) {
    const row = spans.get(y + dy) ?? [];
    let from = x - radius, to = x + radius, i = 0;
    while (i < row.length && row[i + 1] < from - 1) i += 2;
    const begin = i;
    while (i < row.length && row[i] <= to + 1) {
      from = Math.min(from, row[i]); to = Math.max(to, row[i + 1]); i += 2;
    }
    row.splice(begin, i - begin, from, to); spans.set(y + dy, row);
  }
  const minY = Math.min(...spans.keys()), maxY = Math.max(...spans.keys());
  let minX = Infinity, maxX = -Infinity;
  const rows = Array.from({ length: maxY - minY + 1 }, (_, i) => {
    const row = spans.get(minY + i) ?? null;
    if (row) { minX = Math.min(minX, row[0]); maxX = Math.max(maxX, row.at(-1)); }
    return row;
  });
  return { shape, left: minX, top: minY, width: maxX - minX + 1, height: rows.length, rows };
}

export function containsBrushCell({ rows, top }, x, y) {
  const row = rows[y - top];
  for (let i = 0; row && i < row.length; i += 2) if (x >= row[i] && x <= row[i + 1]) return true;
  return false;
}

// Exposed grid edges of all row intervals; holes between disjoint arms stay open.
export function brushOutline({ rows, top }) {
  const edges = [];
  const horizontal = (row, neighbor, y) => {
    for (let i = 0; i < row.length; i += 2) {
      let cursor = row[i]; const to = row[i + 1];
      for (let j = 0; neighbor && j < neighbor.length && cursor <= to; j += 2) {
        if (neighbor[j + 1] < cursor) continue;
        if (neighbor[j] > to) break;
        if (neighbor[j] > cursor) edges.push([cursor, y, neighbor[j], y]);
        cursor = Math.max(cursor, neighbor[j + 1] + 1);
      }
      if (cursor <= to) edges.push([cursor, y, to + 1, y]);
    }
  };
  rows.forEach((row, i) => {
    if (!row) return;
    const y = top + i;
    for (let j = 0; j < row.length; j += 2) edges.push([row[j], y, row[j], y + 1], [row[j + 1] + 1, y, row[j + 1] + 1, y + 1]);
    horizontal(row, rows[i - 1], y); horizontal(row, rows[i + 1], y + 1);
  });
  return edges;
}
