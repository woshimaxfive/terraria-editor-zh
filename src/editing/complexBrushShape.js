// SPDX-License-Identifier: MS-PL
// TEdit contributors. Adapted from Fill/BrushSettings; see vendor/tedit-editing-rules/.
// Midpoint fill: Copyright (c) 2009-2010 Rene Schulte and WriteableBitmapEx Contributors.
import { addBrushSpan, brushFromSpans, subtractBrushRow } from './brushSpans.js';

const roundEven = value => {
  const floor = Math.floor(value);
  return (value - floor === .5 ? floor + Math.abs(floor % 2) : Math.round(value)) || 0;
};

function polygon(vertices) {
  const spans = new Map(), f = Math.fround;
  const minY = Math.min(...vertices.map(point => point[1])), maxY = Math.max(...vertices.map(point => point[1]));
  for (let y = minY; y <= maxY; y++) {
    const intersections = [];
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const [xi, yi] = vertices[i], [xj, yj] = vertices[j];
      if ((yi < y && yj >= y) || (yj < y && yi >= y)) {
        intersections.push(Math.trunc(f(xi + f(f((y - yi) / (yj - yi)) * (xj - xi)))) || 0);
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i < intersections.length - 1; i += 2) addBrushSpan(spans, y, intersections[i], intersections[i + 1]);
  }
  return spans;
}

// Preserve the desktop midpoint circle rather than substituting the ellipse formula.
function circle(radius, offsetX = 0) {
  const spans = new Map();
  if (radius <= 0) { addBrushSpan(spans, 0, offsetX, offsetX); return spans; }
  const squared = radius * radius, twice = squared * 2;
  let x = radius, y = 0, xChange = squared * (1 - radius * 2), yChange = squared;
  let error = 0, xStop = twice * radius, yStop = 0;
  const stamp = () => {
    addBrushSpan(spans, y, offsetX - x, offsetX + x);
    addBrushSpan(spans, -y, offsetX - x, offsetX + x);
  };
  while (xStop >= yStop) {
    stamp(); y++; yStop += twice; error += yChange; yChange += twice;
    if (xChange + error * 2 > 0) { x--; xStop -= twice; error += xChange; xChange += twice; }
  }
  x = 0; y = radius; xChange = squared; yChange = squared * (1 - radius * 2);
  error = 0; xStop = 0; yStop = twice * radius;
  while (xStop <= yStop) {
    stamp(); x++; xStop += twice; error += xChange; xChange += twice;
    if (yChange + error * 2 > 0) { y--; yStop -= twice; error += yChange; yChange += twice; }
  }
  return spans;
}

function subtract(outer, inner) {
  const result = new Map();
  for (const [y, row] of outer) {
    const remaining = subtractBrushRow(row, inner.get(y));
    if (remaining.length) result.set(y, remaining);
  }
  return result;
}

export function complexBrushShape(width, height, shape) {
  const hw = Math.floor(width / 2), hh = Math.floor(height / 2);
  let spans;
  if (shape === 'triangle') {
    spans = polygon([[0, -Math.trunc(hh * 2 / 3)], [-hw, Math.trunc(hh / 3)], [hw, Math.trunc(hh / 3)]]);
  } else if (shape === 'star') {
    const ratio = Math.cos(2 * Math.PI / 5) / Math.cos(Math.PI / 5);
    const innerX = Math.trunc(hw * ratio), innerY = Math.trunc(hh * ratio);
    spans = polygon(Array.from({ length: 10 }, (_, i) => {
      const angle = -Math.PI / 2 + i * (Math.PI / 5);
      return [roundEven(Math.cos(angle) * (i % 2 ? innerX : hw)), roundEven(Math.sin(angle) * (i % 2 ? innerY : hh))];
    }));
  } else if (shape === 'donut') {
    spans = subtract(circle(hh), circle(Math.max(0, hh - Math.max(1, hw))));
  } else {
    const ratio = Math.max(.5, Math.min(2, width / height));
    if (ratio < 1 && hh <= 1) return { ...brushFromSpans(shape, new Map()), issue: '月牙 2×3 在原版中无效，请调整宽高后绘制；当前世界未修改。' };
    if (ratio >= 2) spans = circle(hh);
    else {
      let innerRadius, offset;
      if (ratio >= 1) {
        const t = ratio - 1;
        innerRadius = Math.max(1, Math.trunc(hh * .75 * (1 - t)));
        offset = Math.max(1, Math.trunc(hh * .5 * (1 - t)));
      } else {
        const t = (1 - ratio) / .5;
        innerRadius = Math.max(1, Math.min(hh - 1, Math.trunc(hh * (.75 + t * .25))));
        offset = Math.max(1, Math.trunc(hh * .5 * (1 - t)) + (t > .99 ? 0 : 1));
      }
      spans = subtract(circle(hh), circle(innerRadius, offset));
    }
  }
  return brushFromSpans(shape, spans);
}
