// SPDX-License-Identifier: MS-PL
// TEdit contributors. WireRouter adaptation; see vendor/tedit-editing-rules/.
import { EditError, MAX_STROKE_TILES } from './brush.js';
import { MAX_BRUSH_DIMENSION } from './brushShape.js';
import { containsCell } from './selection.js';

export const detectVerticalFirst = (start, end) => Math.abs(end.y - start.y) > Math.abs(end.x - start.x);

export function* wirePath(start, end, mode, verticalFirst) {
  let { x, y } = start;
  const dx = end.x - x, dy = end.y - y;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  if (mode === 'elbow90') {
    if (verticalFirst) {
      for (; y !== end.y; y += sy) yield { x, y };
      for (; x !== end.x; x += sx) yield { x, y };
    } else {
      for (; x !== end.x; x += sx) yield { x, y };
      for (; y !== end.y; y += sy) yield { x, y };
    }
  } else {
    const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
    if (verticalFirst) {
      for (let i = 0; i < Math.abs(dy) - diagonal; i++) { yield { x, y }; y += sy; }
      for (let i = 0; i < diagonal; i++) { yield { x, y }; y += sy; yield { x, y }; x += sx; }
      for (let i = 0; i < Math.abs(dx) - diagonal; i++) { yield { x, y }; x += sx; }
    } else {
      for (let i = 0; i < Math.abs(dx) - diagonal; i++) { yield { x, y }; x += sx; }
      for (let i = 0; i < diagonal; i++) { yield { x, y }; x += sx; yield { x, y }; y += sy; }
      for (let i = 0; i < Math.abs(dy) - diagonal; i++) { yield { x, y }; y += sy; }
    }
  }
  yield { x, y };
}

export function* wireBus(anchor, cursor, width, height, mode, verticalFirst) {
  const wires = Math.min(Math.max(1, Math.trunc((width + 1) / 2)), Math.max(1, Math.trunc((height + 1) / 2)));
  const firstOffset = -(wires - 1);
  const sx = Math.sign(cursor.x - anchor.x), sy = Math.sign(cursor.y - anchor.y);
  for (let i = 0; i < wires; i++) {
    const offset = firstOffset + i * 2;
    const start = verticalFirst ? { x: anchor.x + offset, y: anchor.y - sy * Math.floor(height / 2) }
      : { x: anchor.x - sx * Math.floor(width / 2), y: anchor.y + offset };
    const end = verticalFirst ? { x: cursor.x, y: cursor.y - sy * sx * offset }
      : { x: cursor.x - sx * sy * offset, y: cursor.y };
    yield* wirePath(start, end, mode, verticalFirst);
  }
}

export function cadWireCells(world, anchor, cursor, settings, selection = null) {
  const { width, height, routingMode = 'elbow90', routingDirection = 'auto' } = settings;
  if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= MAX_BRUSH_DIMENSION)
      || !['elbow90', 'miter45'].includes(routingMode) || !['auto', 'horizontal', 'vertical'].includes(routingDirection)) {
    throw new EditError('CAD路由参数无效，宽高须为 1–400 格。');
  }
  if (![anchor, cursor].every(p => p && Number.isInteger(p.x) && Number.isInteger(p.y)
      && p.x >= 0 && p.y >= 0 && p.x < world.width && p.y < world.height)) {
    throw new EditError('CAD路由端点须位于世界内。');
  }
  const vertical = routingDirection === 'auto' ? detectVerticalFirst(anchor, cursor) : routingDirection === 'vertical';
  const cells = new Set(); let work = 0;
  for (const { x, y } of wireBus(anchor, cursor, width, height, routingMode, vertical)) {
    if (++work > 1_000_000) throw new EditError('CAD路由计算量过大，请缩短路径或减小宽高；当前段未修改世界。');
    if (x < 0 || y < 0 || x >= world.width || y >= world.height || !containsCell(selection, x, y)) continue;
    cells.add(x * world.height + y);
    if (cells.size > MAX_STROKE_TILES) throw new EditError('单段最多修改 10000 格，请缩短路径或减小宽高。');
  }
  return cells;
}
