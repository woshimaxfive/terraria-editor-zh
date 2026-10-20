import { containsCell, validSelection } from './selection.js';

export const MATERIALS = [
  { id: 0, name: '泥土' }, { id: 1, name: '石块' },
  { id: 30, name: '木材' }, { id: 38, name: '灰砖' }, { id: 54, name: '玻璃' },
];
export const BRUSH_SIZES = [1, 3, 5, 9];
export const MAX_STROKE_TILES = 10_000;

export class EditError extends Error {
  constructor(message) { super(message); this.name = 'EditError'; }
}

export function selectionCells(selection, world) {
  if (!validSelection(selection, world)) throw new EditError('选区范围无效，未修改世界。');
  const { x, y, width, height } = selection;
  if (width * height > MAX_STROKE_TILES) throw new EditError('区域操作最多修改 10000 格，请缩小选区。');
  return Array.from({ length: width * height }, (_, i) =>
    (x + Math.floor(i / height)) * world.height + y + i % height);
}

// The preview and Worker use the same bounded, column-major cell indices.
export class BrushStroke {
  constructor(world, size, selection = null) {
    this.world = world;
    this.size = size;
    this.selection = selection;
    this.cells = new Set();
    this.previous = null;
  }

  add(point) {
    let { x, y } = this.previous || point;
    const dx = Math.abs(point.x - x), dy = -Math.abs(point.y - y);
    const sx = x < point.x ? 1 : -1, sy = y < point.y ? 1 : -1;
    let error = dx + dy;
    const radius = (this.size - 1) / 2;
    while (true) {
      for (let bx = Math.max(0, x - radius); bx <= Math.min(this.world.width - 1, x + radius); bx++) {
        for (let by = Math.max(0, y - radius); by <= Math.min(this.world.height - 1, y + radius); by++) {
          if (!containsCell(this.selection, bx, by)) continue;
          this.cells.add(bx * this.world.height + by);
          if (this.cells.size > MAX_STROKE_TILES) throw new EditError('单笔最多修改 10000 格，请分段绘制。');
        }
      }
      if (x === point.x && y === point.y) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x += sx; }
      if (twice <= dx) { error += dx; y += sy; }
    }
    this.previous = point;
  }
}
