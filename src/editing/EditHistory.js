import { EditError, MATERIALS, MAX_STROKE_TILES } from './brush.js';

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

  paint(stroke) {
    const { cells, blockId } = stroke || {};
    if (!MATERIALS.some(material => material.id === blockId) || !Array.isArray(cells) ||
        cells.length < 1 || cells.length > MAX_STROKE_TILES ||
        !cells.every(index => Number.isSafeInteger(index) && index >= 0 && index < this.source.count)) {
      throw new EditError('画笔参数无效，未修改世界。');
    }
    const changes = [];
    let skipped = 0;
    for (const index of new Set(cells)) {
      const before = this.source.read(index);
      const after = this.source.paint(index, before, blockId);
      if (!after) { skipped++; continue; }
      if (!before.every((value, i) => value === after[i])) changes.push({ index, before, after });
    }
    if (!changes.length) return { ...this.state, changed: 0, skipped };
    this.source.ensureWritable();
    for (const change of changes) this.source.write(change.index, change.after);
    const entry = { changes, beforeRevision: this.revision, afterRevision: ++this.nextRevision };
    this.retainedTiles -= this.redoStack.reduce((count, item) => count + item.changes.length, 0);
    this.redoStack = [];
    this.undoStack.push(entry);
    this.revision = entry.afterRevision;
    this.retainedTiles += changes.length;
    while (this.undoStack.length > MAX_HISTORY_STEPS || this.retainedTiles > MAX_HISTORY_TILES) {
      this.retainedTiles -= this.undoStack.shift().changes.length;
    }
    return { ...this.state, changed: changes.length, skipped };
  }

  undo() { return this.move(this.undoStack, this.redoStack, 'before'); }
  redo() { return this.move(this.redoStack, this.undoStack, 'after'); }

  move(from, to, direction) {
    const entry = from.pop();
    if (!entry) return { ...this.state, changed: 0 };
    for (const change of entry.changes) this.source.write(change.index, change[direction]);
    this.revision = entry[`${direction}Revision`];
    to.push(entry);
    return { ...this.state, changed: entry.changes.length };
  }

  markExported() { this.exportedRevision = this.revision; }
}
