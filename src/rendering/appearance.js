// SPDX-License-Identifier: MS-PL
// TEdit contributors; adapted from PixelMap.ApplyPaint/ApplyBrightness and
// WorldRenderXna BrickStyle. Sources and complete license: vendor/tedit-appearance/.
import { PAINTS } from '../editing/appearance.js';

export function appearanceColor(color, paintId = 0, invisible = false, fullBright = false) {
  const brightness = fullBright || paintId === 31 ? 255 : invisible ? 169 : 211;
  const paint = PAINTS[paintId];
  if (paintId === 29) {
    const light = color[2] * .3 * brightness / 255;
    return color.map(channel => Math.trunc(channel * light) & 255);
  }
  if (paintId === 30) return color.map(channel => Math.trunc((255 - channel) * .5 * brightness / 255));
  if (paint && paintId) {
    const rgb = [1, 3, 5].map(offset => parseInt(paint.color.slice(offset, offset + 2), 16));
    return color.map((channel, index) => Math.trunc(channel * (255 - brightness) / 255 + rgb[index] * brightness / 255));
  }
  return color.map(channel => Math.trunc(channel * brightness / 255));
}

// Occupied polygons follow desktop's slices: TR/TL are solid below the diagonal.
export const SHAPE_POINTS = Object.freeze([
  [[0, 0], [1, 0], [1, 1], [0, 1]], [[0, .5], [1, .5], [1, 1], [0, 1]],
  [[0, 0], [1, 1], [0, 1]], [[1, 0], [1, 1], [0, 1]],
  [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [1, 1]],
]);

export function drawShapes(context, commands, x, y, zoom) {
  context.save();
  for (let i = 0; i < commands.length; i += 6) {
    const [column, row, slope, r, g, b] = commands.subarray(i, i + 6);
    const points = SHAPE_POINTS[slope];
    if (!points) continue;
    context.fillStyle = `rgb(${r},${g},${b})`;
    context.beginPath();
    points.forEach(([px, py], index) => context[index ? 'lineTo' : 'moveTo'](x + (column + px) * zoom, y + (row + py) * zoom));
    context.closePath(); context.fill();
  }
  context.restore();
}
