import { EditError, MAX_STROKE_TILES } from './brush.js';
import { findMaterial } from './materials.js';
import { validLiquid } from './liquids.js';
import { validCircuit } from './circuits.js';
import { validAppearance } from './appearance.js';
import { passesMasks, validMasks } from './masks.js';

const MAX_HISTORY_STEPS = 100;
const MAX_HISTORY_TILES = 50_000;

// Snapshots are opaque values supplied by the file adapter, never vendor types.
export class EditHistory {
  constructor(source) {
    this.source = source;
    this.undoStack = [];
    this.redoStack = [];
    this.revision = 0;
    this.nextRevision = 0;
    this.exportedRevision = 0;
    this.retainedTiles = 0;
  }

  get state() {
    return {
      revision: this.revision, dirty: this.revision !== this.exportedRevision,
      undoCount: this.undoStack.length, redoCount: this.redoStack.length,
    };
  }

  validateStroke(stroke) {
    const { cells, layer = 'block', masks } = stroke || {};
    const version = this.source.version ?? 194;
    const materialId = layer === 'slope' ? stroke?.slope : layer === 'paint' ? stroke?.appearance :
      layer === 'wire' ? { mask: stroke?.wireMask, erase: stroke?.wireErase ?? false } :
      layer === 'actuator' ? { actuator: stroke?.actuator, actuated: stroke?.actuated } :
      layer === 'liquid' ? { type: stroke?.liquidType, amount: stroke?.liquidAmount } : layer === 'wall' ? stroke?.wallId : stroke?.blockId;
    const validMaterial = ['slope', 'paint'].includes(layer) ? validAppearance(layer, materialId, version) :
      ['wire', 'actuator'].includes(layer) ? validCircuit(layer, materialId) : layer === 'liquid' ? validLiquid(materialId.type, materialId.amount, version) :
      materialId === null || Boolean(findMaterial(layer, materialId, version));
    if (!['block', 'wall', 'liquid', 'wire', 'actuator', 'slope', 'paint'].includes(layer) || !validMaterial || !Array.isArray(cells) ||
        cells.length < 1 || cells.length > MAX_STROKE_TILES ||
        ![...cells].every(index => Number.isSafeInteger(index) && index >= 0 && index < this.source.count)) {
      throw new EditError('画笔参数无效，未修改世界。');
    }
    if (!validMasks(masks)) throw new EditError('匹配条件无效，未修改世界。');
    const filters = (masks ?? []).filter(rule => rule.mode !== 'off');
    if (filters.length && !this.source.maskValues) throw new EditError('匹配条件无效，未修改世界。');
    this.source.validateMaterial?.(layer, materialId);
    return { cells, layer, materialId, filters };
  }

  paint(stroke) {
    const { cells, layer, materialId, filters } = this.validateStroke(stroke);
    const changes = [];
    let skipped = 0, filtered = 0;
    for (const index of new Set(cells)) {
      const before = this.source.read(index);
      if (filters.length && !passesMasks(this.source.maskValues(before), filters)) { filtered++; continue; }
      const after = this.source.paint(index, before, materialId, layer);
      if (!after) { skipped++; continue; }
      if (!before.every((value, i) => value === after[i])) changes.push({ index, before, after });
    }
    return { ...this.commit(changes, skipped), filtered };
  }

  writeChange(change, direction) {
    if (change.kind) this.source.writeObject(change.kind, change.index, change[direction]);
    else this.source.write(change.index, change[direction]);
  }

  // Only the adapter supplies fully validated changes; public payloads never enter here.
  commit(changes, skipped = 0) {
    if (!changes.length) return { ...this.state, changed: 0, skipped };
    const cost = changes.reduce((sum, change) => sum + (change.cost ?? 1), 0);
    if (cost > MAX_HISTORY_TILES) throw new EditError('本次编辑超出撤销记录预算，未修改世界。');
    this.source.ensureWritable();
    for (const change of changes) this.writeChange(change, 'after');
    const entry = { changes, cost, beforeRevision: this.revision, afterRevision: ++this.nextRevision };
    this.retainedTiles -= this.redoStack.reduce((count, item) => count + item.cost, 0);
    this.redoStack = [];
    this.undoStack.push(entry);
    this.revision = entry.afterRevision;
    this.retainedTiles += entry.cost;
    while (this.undoStack.length > MAX_HISTORY_STEPS || this.retainedTiles > MAX_HISTORY_TILES) {
      this.retainedTiles -= this.undoStack.shift().cost;
    }
    return { ...this.state, changed: changes.length, skipped };
  }

  undo() { return this.move(this.undoStack, this.redoStack, 'before'); }
  redo() { return this.move(this.redoStack, this.undoStack, 'after'); }

  move(from, to, direction) {
    const entry = from.pop();
    if (!entry) return { ...this.state, changed: 0 };
    for (const change of entry.changes) this.writeChange(change, direction);
    this.revision = entry[`${direction}Revision`];
    to.push(entry);
    return { ...this.state, changed: entry.changes.length };
  }

  markExported() { this.exportedRevision = this.revision; }
}
