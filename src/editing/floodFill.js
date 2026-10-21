// SPDX-License-Identifier: MS-PL
// TEdit contributors. Adapted from FillTool.CheckTileMatch; see vendor/tedit-editing-rules/.
import { EditError, MAX_STROKE_TILES } from './brush.js';
import { containsCell, validSelection } from './selection.js';

export function fillMatches(origin, next, layer, appearance) {
  // Coating-only mode enables no connectivity predicate in desktop FillTool.
  if (layer === 'paint' && appearance.mode === 'coating') return true;
  if (layer === 'block' || (layer === 'paint' && appearance.target === 'block')) {
    return origin.type === next.type && origin.active === next.active;
  }
  if (layer === 'wall' || (layer === 'paint' && appearance.target === 'wall')) {
    return origin.wall === next.wall &&
      !(origin.active && (origin.type !== next.type || !next.active)) &&
      !(origin.type !== next.type && next.active && (next.stopsWalls || !next.framed));
  }
  // Desktop applies BrickStyle only with ExtrasActive, which also gates these flags.
  if (layer === 'slope') return origin.slope === next.slope && origin.actuator === next.actuator &&
    origin.actuated === next.actuated && origin.active === next.active;
  if (layer === 'actuator') return origin.actuator === next.actuator && origin.actuated === next.actuated && origin.active === next.active;
  if (layer === 'liquid') return (origin.amount > 0) === (next.amount > 0) && origin.liquid === next.liquid &&
    !(origin.active && origin.solid) && !(next.active && next.solid);
  return false;
}

// Read-only, bounded four-neighbour traversal. Masks affect writes, never connectivity.
export async function floodCells(world, options, { cancelled = () => false, progress = () => {},
  yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
  const { point, selection = null, layer, appearance } = options || {};
  if (!['block', 'wall', 'liquid', 'slope', 'paint', 'actuator'].includes(layer) ||
      (layer === 'paint' && !['block', 'wall'].includes(appearance?.target)) ||
      !Number.isSafeInteger(point?.x) || !Number.isSafeInteger(point?.y) || point.x < 0 || point.y < 0 ||
      point.x >= world.width || point.y >= world.height ||
      (selection !== null && !validSelection(selection, world)) || !containsCell(selection, point.x, point.y)) {
    throw new EditError('连通填充的起点、图层或选区无效，未修改世界。');
  }
  const check = () => { if (cancelled()) throw new DOMException('连通填充已取消，世界未修改。', 'AbortError'); };
  check(); await yieldControl(); check();
  const start = point.x * world.height + point.y, origin = world.read(start);
  const cells = [start], visited = new Set(cells);
  // Desktop always includes the origin, even when liquid matching rejects a solid tile.
  for (let cursor = 0; cursor < cells.length; cursor++) {
    const index = cells[cursor], x = Math.floor(index / world.height), y = index % world.height;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height || !containsCell(selection, nx, ny)) continue;
      const next = nx * world.height + ny;
      if (visited.has(next)) continue;
      visited.add(next);
      if (!fillMatches(origin, world.read(next), layer, appearance)) continue;
      if (cells.length === MAX_STROKE_TILES) throw new EditError('连通区域超过 10000 格，请先框选较小范围；世界未修改。');
      cells.push(next);
    }
    if ((cursor + 1) % 256 === 0) {
      progress(cells.length / MAX_STROKE_TILES * 100);
      await yieldControl(); check();
    }
  }
  check(); progress(cells.length / MAX_STROKE_TILES * 100);
  return cells;
}
