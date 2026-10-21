// SPDX-License-Identifier: MS-PL
// TEdit contributors. Ordered StampOffsets adaptation; see vendor/tedit-editing-rules/.
import { createBrushShape, filledBrush, isLineBrush, linePoints } from './brushShape.js';
import { brushVertices, polygonBrushSpans, circle, complexBrushShape } from './complexBrushShape.js';
import { hasBrushTransform, transformBrushPoint, transformPixelBrush } from './brushTransform.js';
import { addBrushSpan, brushFromSpans, containsBrushCell, subtractBrushRow } from './brushSpans.js';

const cache = new WeakMap();
const append = (points, x, y) => points.push(x || 0, y || 0);

function fromRows(geometry) {
  const points = [];
  geometry.rows.forEach((row, i) => {
    for (let j = 0; row && j < row.length; j += 2) for (let x = row[j]; x <= row[j + 1]; x++) append(points, x, geometry.top + i);
  });
  return points;
}

function geometryOf(points, shape) {
  const spans = new Map();
  for (let i = 0; i < points.length; i += 2) addBrushSpan(spans, points[i + 1], points[i], points[i]);
  return brushFromSpans(shape, spans);
}

function polygon(vertices) {
  const points = [];
  polygonBrushSpans(vertices, (y, from, to) => {
    for (let x = from; x <= to; x++) append(points, x, y);
  });
  return points;
}

function circlePoints(radius) {
  if (radius <= 0) return [0, 0];
  const points = [];
  circle(radius, 0, (from, to, y) => {
    for (let x = from; x <= to; x++) { append(points, x, y); append(points, x, -y); }
  });
  return points;
}

function lineStamp(settings) {
  const { width, height, shape, thickness = 1 } = settings;
  const left = -Math.floor(width / 2), top = -Math.floor(height / 2);
  const right = left + width - 1, bottom = top + height - 1;
  const segments = shape === 'diagonalRight' ? [[[left, bottom], [right, top]]]
    : shape === 'diagonalLeft' ? [[[left, top], [right, bottom]]]
      : [[[left, top], [right, bottom]], [[left, bottom], [right, top]]];
  const points = [], seen = new Map();
  for (const [a, b] of segments) for (const [x, y] of linePoints(transformBrushPoint(a, settings), transformBrushPoint(b, settings))) {
    if (thickness <= 1) { append(points, x, y); continue; }
    // The source inserts each disk into a HashSet in dy/dx order. Only enumerate
    // previously unseen runs, preserving that order without visiting every overlap.
    for (let dy = -thickness; dy <= thickness; dy++) {
      const radius = Math.floor(Math.sqrt(thickness * thickness - dy * dy)), rowY = y + dy;
      const remaining = subtractBrushRow([x - radius, x + radius], seen.get(rowY));
      for (let j = 0; j < remaining.length; j += 2) for (let px = remaining[j]; px <= remaining[j + 1]; px++) append(points, px, rowY);
      addBrushSpan(seen, rowY, x - radius, x + radius);
    }
  }
  return points;
}

// Unlike ordinary BrushTool stamping, the cache used by spray has no single-axis
// rectangle fallback. It also retains source duplicates until circular thickening.
export function createOrderedBrushStamp(settings) {
  const validation = createBrushShape(settings), saved = cache.get(settings);
  if (saved?.validation === validation) return saved.value;
  const { width, height, shape = 'rectangle' } = settings, transformed = hasBrushTransform(settings);
  const hw = Math.floor(width / 2), hh = Math.floor(height / 2);
  let points, issue;
  if (isLineBrush(shape)) points = lineStamp(settings);
  else if (transformed && ['rectangle', 'star', 'triangle'].includes(shape)) {
    points = polygon(brushVertices(width, height, shape).map(p => transformBrushPoint(p, settings)));
  } else if (['rectangle', 'ellipse'].includes(shape)) points = fromRows(filledBrush(width, height, shape));
  else if (shape === 'star' || shape === 'triangle') {
    points = (shape === 'star' ? hw <= 0 && hh <= 0 : hw <= 0 || hh <= 0) ? [0, 0] : polygon(brushVertices(width, height, shape));
  } else {
    const geometry = complexBrushShape(width, height, shape);
    issue = geometry.issue;
    points = circlePoints(hh);
    if (hh > 0 && !(shape === 'crescent' && width / height >= 2)) {
      const unique = new Set(), remaining = [];
      for (let i = 0; i < points.length; i += 2) {
        const x = points[i], y = points[i + 1], key = x + ',' + y;
        if (!unique.has(key) && containsBrushCell(geometry, x, y)) { unique.add(key); append(remaining, x, y); }
      }
      points = remaining;
    }
  }
  if (transformed && ['ellipse', 'crescent', 'donut'].includes(shape)) {
    if (Math.abs(settings.rotation ?? 0) > .01) points = fromRows(transformPixelBrush(geometryOf(points, shape), settings));
    else for (let i = 0; i < points.length; i += 2) {
      const p = transformBrushPoint([points[i], points[i + 1]], settings); points[i] = p[0]; points[i + 1] = p[1];
    }
  }
  const geometry = geometryOf(points, shape);
  if (!points.length && !issue) issue = '此尺寸下原版喷枪笔形不产生图格，请调整宽高；当前世界未修改。';
  const value = { points: new Int16Array(points), geometry, issue };
  cache.set(settings, { validation, value });
  return value;
}
