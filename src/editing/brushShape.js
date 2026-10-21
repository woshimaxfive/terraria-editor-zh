// SPDX-License-Identifier: MS-PL
// TEdit contributors. Adapted from Fill/Shape/BrushSettings; see vendor/tedit-editing-rules/.
import { addBrushSpan, brushFromSpans, subtractBrushRow } from './brushSpans.js';
import { complexBrushShape } from './complexBrushShape.js';
import { hasBrushTransform, transformedPolygonBrush, transformPixelBrush, transformBrushPoint } from './brushTransform.js';
export { containsBrushCell } from './brushSpans.js';
export const MAX_BRUSH_DIMENSION = 400;
export const BRUSH_SHAPES = [['rectangle', '矩形'], ['ellipse', '椭圆'],
  ['diagonalRight', '右斜线 ／'], ['diagonalLeft', '左斜线 ＼'], ['cross', 'X 形'],
  ['star', '星形'], ['triangle', '三角'], ['crescent', '月牙'], ['donut', '圆环']];
export const isLineBrush = shape => ['diagonalRight', 'diagonalLeft', 'cross'].includes(shape);
export const maxLineThickness = ({ width, height }) => Math.max(1, Math.floor(Math.min(width, height) / 2));
const cache = new WeakMap();

export function createBrushShape(settings) {
  const { width, height, shape = 'rectangle', thickness = 1, rotation = 0, flipHorizontal = false, flipVertical = false } = settings;
  if (![width, height].every(value => Number.isInteger(value) && value >= 1 && value <= MAX_BRUSH_DIMENSION)
    || !BRUSH_SHAPES.some(([id]) => id === shape)
    || !Number.isInteger(thickness) || thickness < 1 || thickness > maxLineThickness(settings)) {
    throw new RangeError('画笔形状无效，宽高须为 1–400 格，线形粗细不可超过短边的一半。');
  }
  if (!Number.isFinite(rotation) || rotation < 0 || rotation > 360 || typeof flipHorizontal !== 'boolean' || typeof flipVertical !== 'boolean') {
    throw new RangeError('画笔变换无效，角度须为 0–360°，翻转须为开关。');
  }
  const saved = cache.get(settings);
  if (saved && saved.width === width && saved.height === height && saved.shape === shape && saved.thickness === thickness
    && saved.rotation === rotation && saved.flipHorizontal === flipHorizontal && saved.flipVertical === flipVertical) return saved.value;
  const transformed = hasBrushTransform(settings);
  let value;
  if (!transformed && (width <= 1 || height <= 1)) value = filledBrush(width, height, 'rectangle');
  else if (isLineBrush(shape)) value = lineBrush(width, height, shape, thickness, settings);
  else if (transformed && ['rectangle', 'star', 'triangle'].includes(shape)) value = transformedPolygonBrush(width, height, shape, settings);
  else {
    value = ['rectangle', 'ellipse'].includes(shape) ? filledBrush(width, height, shape) : complexBrushShape(width, height, shape);
    if (transformed) value = transformPixelBrush(value, settings);
  }
  value.shape = shape;
  if (!value.rows.length && !value.issue) value.issue = '此尺寸下原版笔形不产生图格，请增大宽高；当前世界未修改。';
  cache.set(settings, { width, height, shape, thickness, rotation, flipHorizontal, flipVertical, value });
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

function lineBrush(width, height, shape, thickness, settings) {
  const left = -Math.floor(width / 2), top = -Math.floor(height / 2);
  const right = left + width - 1, bottom = top + height - 1;
  const segments = shape === 'diagonalRight' ? [[[left, bottom], [right, top]]]
    : shape === 'diagonalLeft' ? [[[left, top], [right, bottom]]]
      : [[[left, top], [right, bottom]], [[left, bottom], [right, top]]];
  const kernel = [];
  if (thickness === 1) kernel.push([0, 0]);
  else for (let y = -thickness; y <= thickness; y++) kernel.push([y, Math.floor(Math.sqrt(thickness * thickness - y * y))]);
  const spans = new Map();
  for (const [start, end] of segments) for (const [x, y] of linePoints(transformBrushPoint(start, settings), transformBrushPoint(end, settings))) for (const [dy, radius] of kernel) {
    addBrushSpan(spans, y + dy, x - radius, x + radius);
  }
  return brushFromSpans(shape, spans);
}

// Exposed grid edges of all row intervals; holes between disjoint arms stay open.
export function brushOutline({ rows, top }) {
  const edges = [];
  const horizontal = (row, neighbor, y) => {
    const exposed = subtractBrushRow(row, neighbor);
    for (let i = 0; i < exposed.length; i += 2) edges.push([exposed[i], y, exposed[i + 1] + 1, y]);
  };
  rows.forEach((row, i) => {
    if (!row) return;
    const y = top + i;
    for (let j = 0; j < row.length; j += 2) edges.push([row[j], y, row[j], y + 1], [row[j + 1] + 1, y, row[j + 1] + 1, y + 1]);
    horizontal(row, rows[i - 1], y); horizontal(row, rows[i + 1], y + 1);
  });
  return edges;
}
