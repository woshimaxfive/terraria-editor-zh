import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';
import { createBrushShape, brushOutline } from '../src/editing/brushShape.js';
import { BrushStroke } from '../src/editing/brush.js';

test('star and triangle retain the source integer vertices, scanline edges and centroid', () => {
  const triangle = createBrushShape({ width: 6, height: 6, shape: 'triangle' });
  assert.equal(triangle.top, -1);
  assert.deepEqual(triangle.rows, [[-1, 1], [-2, 2], [-3, 3]]);
  const star = new BrushStroke({ width: 100, height: 100 }, { width: 9, height: 9, shape: 'star' });
  star.add({ x: 20, y: 20 });
  assert.equal(star.cells.has(2020), true); assert.equal(star.cells.has(1616), false);
});

test('full crescents contain the center while zero-inner-radius donuts retain its one-tile hole', () => {
  const full = new BrushStroke({ width: 100, height: 100 }, { width: 16, height: 8, shape: 'crescent' });
  const ring = new BrushStroke({ width: 100, height: 100 }, { width: 16, height: 8, shape: 'donut' });
  full.add({ x: 20, y: 20 }); ring.add({ x: 20, y: 20 });
  assert.equal(full.cells.has(2020), true); assert.equal(ring.cells.has(2020), false);
  assert.deepEqual(full.cells, new Set([...ring.cells, 2020]));
  assert.equal(full.shape.height, 9); assert.equal(full.shape.width, 9);
});

test('source-invalid and empty shapes provide an issue without throwing or inventing candidate cells', () => {
  const invalid = createBrushShape({ width: 2, height: 3, shape: 'crescent' });
  assert.match(invalid.issue, /月牙 2×3/); assert.deepEqual(invalid.rows, []);
  for (const width of [2, 3, 40]) for (const height of [2, 3]) {
    const shape = createBrushShape({ width, height, shape: 'triangle' });
    assert.match(shape.issue, /不产生图格/); assert.deepEqual(shape.rows, []);
    const stroke = new BrushStroke({ width: 100, height: 100 }, { width, height, shape: 'triangle' });
    stroke.add({ x: 20, y: 20 }); stroke.add({ x: 40, y: 40 }); assert.equal(stroke.cells.size, 0);
  }
});

test('all new shape outlines match exposed edges, including holes and concave boundaries', () => {
  for (const shape of ['star', 'triangle', 'crescent', 'donut']) {
    const stroke = new BrushStroke({ width: 100, height: 100 }, { width: 9, height: 12, shape });
    stroke.add({ x: 50, y: 50 });
    const expected = new Set(), actual = new Set();
    for (const index of stroke.cells) {
      const x = Math.floor(index / 100) - 50, y = index % 100 - 50;
      if (!stroke.cells.has(index - 100)) expected.add(`${x},${y},${x},${y + 1}`);
      if (!stroke.cells.has(index + 100)) expected.add(`${x + 1},${y},${x + 1},${y + 1}`);
      if (!stroke.cells.has(index - 1)) expected.add(`${x},${y},${x + 1},${y}`);
      if (!stroke.cells.has(index + 1)) expected.add(`${x},${y + 1},${x + 1},${y + 1}`);
    }
    for (const [x1, y1, x2, y2] of brushOutline(stroke.shape)) {
      if (y1 === y2) for (let x = x1; x < x2; x++) actual.add(`${x},${y1},${x + 1},${y1}`);
      else for (let y = y1; y < y2; y++) actual.add(`${x1},${y},${x1},${y + 1}`);
    }
    assert.deepEqual(actual, expected, shape);
  }
});

test('all four trajectories retain clipped holes and reject oversized complex stamps', () => {
  for (const [shape, clippedCount] of [['star', 6], ['triangle', 6], ['crescent', 0], ['donut', 5]]) for (const mode of ['freehand', 'line', 'polyline', 'constrain']) {
    const settings = { width: 400, height: 400, shape };
    const full = new BrushStroke({ width: 1000, height: 1000 }, settings, null, mode);
    assert.throws(() => full.add({ x: 500, y: 500 }), /10000/);
    const clipped = new BrushStroke({ width: 1000, height: 1000 }, settings, { x: 0, y: 0, width: 2, height: 3 }, mode);
    clipped.add({ x: 0, y: 0 }); assert.equal(clipped.cells.size, clippedCount, `${shape} ${mode}`);
  }
});

test('a one-tile axis retains the original rectangular drawing fallback for every complex shape', () => {
  for (const shape of ['star', 'triangle', 'crescent', 'donut']) {
    assert.deepEqual(createBrushShape({ width: 1, height: 4, shape }).rows, [[0, 0], [0, 0], [0, 0], [0, 0]]);
    assert.deepEqual(createBrushShape({ width: 4, height: 1, shape }).rows, [[-2, 1]]);
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
  test(`${fixture.name}: all complex brush tips preserve nine fields, file sections and independent history`, async () => {
    const data = await readFile(new URL(`${fixture.name}.wld`, fixtureRoot)), bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const document = await openWorld(bytes), original = (await parse(bytes)).worldTiles.tiles, expected = new Set();
    for (const [x, shape, width, height, count] of [[100, 'star', 9, 9, 15], [120, 'triangle', 8, 8, 17], [140, 'crescent', 8, 12, 32], [160, 'donut', 4, 12, 68]]) {
      const stroke = new BrushStroke(document.summary, { shape, width, height }); stroke.add({ x, y: 20 });
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
