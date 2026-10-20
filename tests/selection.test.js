import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrushStroke, selectionCells } from '../src/editing/brush.js';
import { containsCell, selectionFromPoints, validSelection } from '../src/editing/selection.js';

const world = { width: 4200, height: 1200 };

test('rectangular selection includes both endpoints, supports reverse drag and clips world edges', () => {
  const rectangle = { x: 10, y: 20, width: 4, height: 3 };
  assert.deepEqual(selectionFromPoints({ x: 10, y: 20 }, { x: 13, y: 22 }, world), rectangle);
  assert.deepEqual(selectionFromPoints({ x: 13, y: 22 }, { x: 10, y: 20 }, world), rectangle);
  assert.deepEqual(selectionFromPoints({ x: 0, y: 0 }, { x: -20, y: -30 }, world), { x: 0, y: 0, width: 1, height: 1 });
  assert.deepEqual(selectionFromPoints({ x: 4198, y: 1198 }, { x: 5000, y: 2000 }, world), { x: 4198, y: 1198, width: 2, height: 2 });
  assert.equal(containsCell(rectangle, 13, 22), true);
  assert.equal(containsCell(rectangle, 14, 22), false);
  assert.equal(containsCell(rectangle, 13, 23), false);
  assert.equal(containsCell(null, 0, 0), true);
});

test('area indices are column-major, validated before allocation and bounded at 10000 cells', () => {
  assert.deepEqual(selectionCells({ x: 2, y: 3, width: 2, height: 3 }, world), [2403, 2404, 2405, 3603, 3604, 3605]);
  assert.deepEqual(selectionCells({ x: 4199, y: 1199, width: 1, height: 1 }, world), [4200 * 1200 - 1]);
  const limit = selectionCells({ x: 0, y: 0, width: 100, height: 100 }, world);
  assert.equal(limit.length, 10000);
  assert.equal(limit.at(-1), 99 * 1200 + 99);
  for (const selection of [null, {}, { x: -1, y: 0, width: 2, height: 2 },
    { x: 4199, y: 1199, width: 2, height: 1 }, { x: 0, y: 0, width: 1, height: 1201 },
    { x: 0, y: 0, width: 0, height: 1 }, { x: 0.5, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: NaN, height: 1 }]) {
    assert.equal(validSelection(selection, world), false);
    assert.throws(() => selectionCells(selection, world), /选区范围无效/);
  }
  assert.throws(() => selectionCells({ x: 0, y: 0, width: 101, height: 100 }, world), /10000/);
});

test('brush interpolation and area brushes affect only selected cells, including strokes crossing the boundary', () => {
  const stroke = new BrushStroke(world, 3, { x: 10, y: 10, width: 3, height: 2 });
  stroke.add({ x: 0, y: 10 });
  assert.equal(stroke.cells.size, 0);
  stroke.add({ x: 20, y: 10 });
  assert.deepEqual([...stroke.cells].sort((a, b) => a - b), [12010, 12011, 13210, 13211, 14410, 14411]);
  const edge = new BrushStroke(world, 9, { x: 4199, y: 1199, width: 1, height: 1 });
  edge.add({ x: 4199, y: 1199 });
  assert.deepEqual([...edge.cells], [4200 * 1200 - 1]);
});
