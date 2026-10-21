// SPDX-License-Identifier: MS-PL
// TEdit contributors. Adapted from BrushSettings/BrushTool; see vendor/tedit-editing-rules/.
import { createBrushShape } from './brushShape.js';
import { hasBrushTransform } from './brushTransform.js';
import { brushFromSpans } from './brushSpans.js';

const cache = new WeakMap();
function intersect(a, b) {
  const row = []; let i = 0, j = 0;
  while (a && b && i < a.length && j < b.length) {
    const from = Math.max(a[i], b[j]), to = Math.min(a[i + 1], b[j + 1]);
    if (from <= to) row.push(from, to);
    if (a[i + 1] < b[j + 1]) i += 2; else j += 2;
  }
  return row;
}

// Separable Chebyshev erosion: horizontal runs, then vertical intersections.
function erode(shape, radius) {
  const horizontal = shape.rows.map(row => {
    const result = [];
    for (let i = 0; row && i < row.length; i += 2) if (row[i] + radius <= row[i + 1] - radius) result.push(row[i] + radius, row[i + 1] - radius);
    return result;
  });
  const spans = new Map();
  for (let y = radius; y < horizontal.length - radius; y++) {
    let row = horizontal[y];
    for (let dy = -radius; row.length && dy <= radius; dy++) row = intersect(row, horizontal[y + dy]);
    if (row.length) spans.set(shape.top + y, row);
  }
  return brushFromSpans(shape.shape, spans);
}

export function createHollowBrushShape(settings) {
  const shape = settings.shape ?? 'rectangle';
  const thickness = settings.thickness ?? 1, outer = createBrushShape(settings);
  const saved = cache.get(settings);
  if (saved?.outer === outer && saved.thickness === thickness) return saved.value;
  const simpleRectangle = !hasBrushTransform(settings) && (shape === 'rectangle' || settings.width <= 1 || settings.height <= 1);
  let interior;
  if (simpleRectangle) {
    const width = settings.width - thickness * 2, height = settings.height - thickness * 2;
    interior = width > 0 && height > 0 ? createBrushShape({ width, height }) : brushFromSpans(outer.shape, new Map());
  } else if (['rectangle', 'ellipse'].includes(shape)) {
    interior = createBrushShape({ ...settings, width: Math.max(1, settings.width - thickness * 2),
      height: Math.max(1, settings.height - thickness * 2), thickness: 1 });
  } else interior = erode(outer, thickness);
  // The cached source visits only the outer area, even when tiny parametric interiors extend beyond it.
  const clipped = new Map();
  outer.rows.forEach((row, i) => {
    const remaining = intersect(row, interior.rows[outer.top + i - interior.top]);
    if (remaining.length) clipped.set(outer.top + i, remaining);
  });
  const value = { outer, interior: brushFromSpans(outer.shape, clipped), simpleRectangle };
  cache.set(settings, { outer, thickness, value });
  return value;
}
