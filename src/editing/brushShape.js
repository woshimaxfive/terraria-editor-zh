// SPDX-License-Identifier: MS-PL
// TEdit contributors. Adapted from Fill; see vendor/tedit-editing-rules/.
export const MAX_BRUSH_DIMENSION = 400;
export const BRUSH_SHAPES = [['rectangle', '矩形'], ['ellipse', '椭圆']];

export function createBrushShape({ width, height, shape = 'rectangle' }) {
  if (![width, height].every(value => Number.isInteger(value) && value >= 1 && value <= MAX_BRUSH_DIMENSION)
    || !BRUSH_SHAPES.some(([id]) => id === shape)) throw new RangeError('画笔形状无效，宽高须为 1–400 格。');
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

// Grid edges of the same row spans used when stamping, including narrow ellipses.
export function brushOutline({ rows, top }) {
  const edges = [];
  const horizontal = (row, neighbor, y) => {
    const [from, to] = row;
    if (!neighbor) edges.push([from, y, to + 1, y]);
    else {
      if (from < neighbor[0]) edges.push([from, y, Math.min(to + 1, neighbor[0]), y]);
      if (to > neighbor[1]) edges.push([Math.max(from, neighbor[1] + 1), y, to + 1, y]);
    }
  };
  rows.forEach((row, i) => {
    if (!row) return;
    const y = top + i;
    edges.push([row[0], y, row[0], y + 1], [row[1] + 1, y, row[1] + 1, y + 1]);
    horizontal(row, rows[i - 1], y); horizontal(row, rows[i + 1], y + 1);
  });
  return edges;
}
