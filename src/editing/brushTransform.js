// SPDX-License-Identifier: MS-PL
// TEdit contributors. Adapted from BrushSettings/Fill; see vendor/tedit-editing-rules/.
import { addBrushSpan, brushFromSpans, containsBrushCell } from './brushSpans.js';
import { brushVertices, polygonBrushSpans, roundEven } from './complexBrushShape.js';

export const hasBrushTransform = ({ rotation = 0, flipHorizontal, flipVertical }) =>
  Math.abs(rotation) > .01 || !!flipHorizontal || !!flipVertical;

export function transformBrushPoint([x, y], { rotation = 0, flipHorizontal, flipVertical }) {
  if (flipHorizontal) x = -x;
  if (flipVertical) y = -y;
  if (Math.abs(rotation) > .01) {
    const radians = rotation * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
    return [roundEven(x * cos - y * sin), roundEven(x * sin + y * cos)];
  }
  return [x || 0, y || 0];
}

export function transformedPolygonBrush(width, height, shape, settings) {
  return brushFromSpans(shape, polygonBrushSpans(brushVertices(width, height, shape)
    .map(point => transformBrushPoint(point, settings))));
}

// Match Fill.ApplyTransform: inverse sampling preserves filled regions and holes.
export function transformPixelBrush(geometry, settings) {
  if (!geometry.rows.length || geometry.issue) return geometry;
  const source = brushFromSpans(geometry.shape, new Map(geometry.rows.flatMap((row, i) => row ? [[geometry.top + i, row]] : [])));
  const spans = new Map(), { left, top, width, height, shape } = source;
  if (Math.abs(settings.rotation ?? 0) <= .01) {
    source.rows.forEach((row, i) => {
      for (let j = 0; row && j < row.length; j += 2) {
        const a = transformBrushPoint([row[j], top + i], settings), b = transformBrushPoint([row[j + 1], top + i], settings);
        addBrushSpan(spans, a[1], Math.min(a[0], b[0]), Math.max(a[0], b[0]));
      }
    });
  } else {
    const corners = [[left, top], [left + width - 1, top], [left, top + height - 1], [left + width - 1, top + height - 1]]
      .map(point => transformBrushPoint(point, settings));
    const minX = Math.min(...corners.map(p => p[0])), maxX = Math.max(...corners.map(p => p[0]));
    const minY = Math.min(...corners.map(p => p[1])), maxY = Math.max(...corners.map(p => p[1]));
    const radians = -(settings.rotation * Math.PI / 180), cos = Math.cos(radians), sin = Math.sin(radians);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      let sx = x * cos - y * sin, sy = x * sin + y * cos;
      if (settings.flipHorizontal) sx = -sx;
      if (settings.flipVertical) sy = -sy;
      if (containsBrushCell(source, roundEven(sx), roundEven(sy))) addBrushSpan(spans, y, x, x);
    }
  }
  return brushFromSpans(shape, spans);
}
