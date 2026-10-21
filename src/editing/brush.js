import { containsCell, validSelection } from './selection.js';
import { detectDirection, snapDirection } from './constraints.js';
import { containsBrushCell, createBrushShape } from './brushShape.js';

export { MATERIALS } from './materials.js';
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
  constructor(world, size, selection = null, mode = 'freehand', anchor = null) {
    this.world = world;
    this.shape = createBrushShape(typeof size === 'number' ? { width: size, height: size } : size);
    this.selection = selection;
    this.cells = new Set();
    this.previous = null;
    this.mode = mode;
    this.anchor = anchor;
    this.direction = 0;
    this.directionLocked = false;
    this.inputStart = null;
    this.inputEnd = null;
  }

  add(point) {
    this.inputStart ??= point;
    this.inputEnd = point;
    if (this.mode === 'constrain') {
      this.anchor ??= point;
      const dx = Math.abs(point.x - this.anchor.x), dy = Math.abs(point.y - this.anchor.y);
      if (!this.directionLocked && (dx > 1 || dy > 1)) {
        this.direction = detectDirection(dx, dy);
        this.directionLocked = true;
      }
      point = snapDirection(point, this.anchor, this.direction);
    }
    if (this.mode === 'line' || this.mode === 'polyline') {
      this.anchor ??= point;
      this.cells.clear();
      this.previous = this.anchor;
    }
    let { x, y } = this.previous || point;
    const dx = Math.abs(point.x - x), dy = -Math.abs(point.y - y);
    const sx = x < point.x ? 1 : -1, sy = y < point.y ? 1 : -1;
    let error = dx + dy;
    const { left, top, width, height } = this.shape;
    while (true) {
      const minX = Math.max(0, x + left, this.selection?.x ?? 0);
      const maxX = Math.min(this.world.width - 1, x + left + width - 1, this.selection ? this.selection.x + this.selection.width - 1 : this.world.width - 1);
      const minY = Math.max(0, y + top, this.selection?.y ?? 0);
      const maxY = Math.min(this.world.height - 1, y + top + height - 1, this.selection ? this.selection.y + this.selection.height - 1 : this.world.height - 1);
      for (let bx = minX; bx <= maxX; bx++) {
        for (let by = minY; by <= maxY; by++) {
          if (!containsBrushCell(this.shape, bx - x, by - y)) continue;
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
