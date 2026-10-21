import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';
import { createBrushShape, brushOutline } from '../src/editing/brushShape.js';
import { BrushStroke } from '../src/editing/brush.js';

test('line-shaped tips retain desktop float truncation separately from the integer stroke path', () => {
  assert.deepEqual(createBrushShape({ width: 5, height: 3, shape: 'diagonalLeft' }).rows,
    [[-2, -2], [-1, 1], [2, 2]]);
  assert.deepEqual(createBrushShape({ width: 5, height: 3, shape: 'diagonalRight' }).rows,
    [[2, 2], [-1, 1], [-2, -2]]);
  const cross = new BrushStroke({ width: 100, height: 100 }, { width: 5, height: 5, shape: 'cross' });
  cross.add({ x: 20, y: 20 });
  assert.equal(cross.cells.size, 9); assert.equal(cross.cells.has(1920), false);
  assert.equal(cross.cells.has(1919), true); assert.equal(cross.cells.has(2121), true);
});

test('a line thickness above one expands by the source circular radius, including outer bounds', () => {
  const tip = new BrushStroke({ width: 100, height: 100 }, { width: 5, height: 5, shape: 'diagonalLeft', thickness: 2 });
  tip.add({ x: 20, y: 20 });
  const expected = new Set();
  for (let i = -2; i <= 2; i++) for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
    if (dx * dx + dy * dy <= 4) expected.add((20 + i + dx) * 100 + 20 + i + dy);
  }
  assert.deepEqual(tip.cells, expected);
  assert.equal(tip.shape.left, -4); assert.equal(tip.shape.top, -4);
  assert.equal(tip.shape.width, 9); assert.equal(tip.shape.height, 9);
  assert.equal(tip.cells.has(1616), false);
});

test('disjoint line-arm cursor outlines are exactly the exposed edges of the actual stamped cells', () => {
  for (const shape of ['diagonalLeft', 'diagonalRight', 'cross']) for (const [width, height, thickness] of [[5, 5, 1], [6, 4, 2], [1, 9, 1], [2, 400, 1]]) {
    const stroke = new BrushStroke({ width: 1000, height: 1000 }, { width, height, shape, thickness });
    stroke.add({ x: 500, y: 500 });
    const expected = new Set(), actual = new Set();
    for (const index of stroke.cells) {
      const x = Math.floor(index / 1000) - 500, y = index % 1000 - 500;
      if (!stroke.cells.has(index - 1000)) expected.add(`${x},${y},${x},${y + 1}`);
      if (!stroke.cells.has(index + 1000)) expected.add(`${x + 1},${y},${x + 1},${y + 1}`);
      if (!stroke.cells.has(index - 1)) expected.add(`${x},${y},${x + 1},${y}`);
      if (!stroke.cells.has(index + 1)) expected.add(`${x},${y + 1},${x + 1},${y + 1}`);
    }
    for (const [x1, y1, x2, y2] of brushOutline(stroke.shape)) {
      if (y1 === y2) for (let x = x1; x < x2; x++) actual.add(`${x},${y1},${x + 1},${y1}`);
      else for (let y = y1; y < y2; y++) actual.add(`${x1},${y},${x1},${y + 1}`);
    }
    assert.deepEqual(actual, expected, `${shape} ${width}x${height} thickness ${thickness}`);
  }
});

test('one-tile axes use the actual desktop rectangle fallback and invalid thickness is rejected', () => {
  for (const shape of ['diagonalLeft', 'diagonalRight', 'cross']) {
    assert.deepEqual(createBrushShape({ width: 1, height: 1, shape }).rows, [[0, 0]]);
    assert.deepEqual(createBrushShape({ width: 4, height: 1, shape }).rows, [[-2, 1]]);
    assert.deepEqual(createBrushShape({ width: 1, height: 4, shape }).rows, [[0, 0], [0, 0], [0, 0], [0, 0]]);
    for (const thickness of [0, -1, 3, 1.5, NaN]) assert.throws(() => createBrushShape({ width: 5, height: 5, shape, thickness }), /粗细/);
  }
});

test('shape cache reuses unchanged settings but a mutated dimension cannot return stale geometry', () => {
  const settings = { width: 6, height: 4, shape: 'cross', thickness: 2 };
  const first = createBrushShape(settings); assert.equal(createBrushShape(settings), first);
  settings.width = 8;
  const second = createBrushShape(settings); assert.notEqual(second, first);
  assert.notDeepEqual(second.rows, first.rows);
});

test('all four trajectories clip expanded geometry and reject an over-budget first stamp', () => {
  for (const mode of ['freehand', 'line', 'polyline', 'constrain']) {
    const settings = { width: 400, height: 400, shape: 'cross', thickness: 200 };
    const huge = new BrushStroke({ width: 1000, height: 1000 }, settings, null, mode);
    assert.throws(() => huge.add({ x: 500, y: 500 }), /10000/);
    const clipped = new BrushStroke({ width: 1000, height: 1000 }, settings, { x: 0, y: 0, width: 2, height: 3 }, mode);
    clipped.add({ x: 0, y: 0 }); assert.deepEqual([...clipped.cells], [0, 1, 2, 1000, 1001, 1002]);
  }
});

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { FileReader } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { TILE_FIELDS } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const { preservesOtherSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();
for (const fixture of fixtures) {
  test(`${fixture.name}: all line-shaped tips preserve every field, section and independent history step`, async () => {
    const data = await readFile(new URL(`${fixture.name}.wld`, fixtureRoot)), bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const document = await openWorld(bytes), original = (await parse(bytes)).worldTiles.tiles, expected = new Set();
    for (const [x, shape, width, height, thickness, count] of [[100, 'diagonalRight', 5, 3, 1, 5], [110, 'diagonalLeft', 5, 3, 1, 5], [120, 'cross', 5, 5, 1, 9], [140, 'cross', 6, 4, 2, 54]]) {
      const stroke = new BrushStroke(document.summary, { shape, width, height, thickness }); stroke.add({ x, y: 20 });
      assert.equal(stroke.cells.size, count);
      assert.equal(document.paint({ cells: [...stroke.cells], blockId: 1, masks: [{ field: 'blockId', mode: 'empty' }] }).changed, stroke.cells.size);
      for (const index of stroke.cells) expected.add(index);
    }
    assert.equal(document.editState.undoCount, 4);
    const output = document.serialize(); document.undo(); document.redo();
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(output));
    const actual = (await parse(output)).worldTiles.tiles;
    for (const field of TILE_FIELDS) {
      const values = original[field].slice();
      for (const index of expected) {
        if (field === 'blockId') values[index] = 1;
        if (field === 'frameX' || field === 'frameY') values[index] = 0;
        if (field === 'flags') values[index] |= 1;
      }
      assert.deepEqual(actual[field], values, field);
    }
    assert.equal(preservesOtherSections(bytes, output), true);
    for (let i = 0; i < 4; i++) document.undo();
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
  });
}
