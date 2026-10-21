import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';
import { createBrushShape, brushOutline } from '../src/editing/brushShape.js';
import { BrushStroke } from '../src/editing/brush.js';

test('brush dimensions reject invalid input and retain the desktop 400 tile maximum', () => {
  for (const width of [0, -1, 401, 1.5, NaN, Infinity, '4']) {
    assert.throws(() => createBrushShape({ width, height: 4 }), /1–400/);
    assert.throws(() => createBrushShape({ width: 4, height: width }), /1–400/);
  }
  assert.throws(() => createBrushShape({ width: 4, height: 4, shape: 'triangle' }), /形状/);
  assert.equal(createBrushShape({ width: 400, height: 400 }).rows.length, 400);
});

test('even rectangles and ellipses use the source negative-side integer center', () => {
  const rect = new BrushStroke({ width: 100, height: 100 }, { width: 2, height: 4 });
  rect.add({ x: 20, y: 20 });
  assert.deepEqual([...rect.cells], [1918, 1919, 1920, 1921, 2018, 2019, 2020, 2021]);
  const ellipse = createBrushShape({ width: 4, height: 4, shape: 'ellipse' });
  assert.equal(ellipse.left, -2); assert.equal(ellipse.top, -2);
  assert.deepEqual(ellipse.rows, [[-1, 0], [-2, 1], [-2, 1], [-1, 0]]);
  assert.deepEqual(createBrushShape({ width: 5, height: 3, shape: 'ellipse' }).rows, [[-1, 1], [-2, 2], [-1, 1]]);
});

test('cursor edges are exactly the exposed tile boundaries of the stamped shape', () => {
  for (const [width, height] of [[1, 1], [4, 4], [3, 7], [2, 400], [400, 2]]) for (const shape of ['rectangle', 'ellipse']) {
    const footprint = createBrushShape({ width, height, shape }), cells = new Set();
    footprint.rows.forEach((row, i) => { if (row) for (let x = row[0]; x <= row[1]; x++) cells.add(`${x},${i + footprint.top}`); });
    const expected = new Set(), actual = new Set();
    for (const point of cells) {
      const [x, y] = point.split(',').map(Number);
      if (!cells.has(`${x - 1},${y}`)) expected.add(`${x},${y},${x},${y + 1}`);
      if (!cells.has(`${x + 1},${y}`)) expected.add(`${x + 1},${y},${x + 1},${y + 1}`);
      if (!cells.has(`${x},${y - 1}`)) expected.add(`${x},${y},${x + 1},${y}`);
      if (!cells.has(`${x},${y + 1}`)) expected.add(`${x},${y + 1},${x + 1},${y + 1}`);
    }
    for (const [x1, y1, x2, y2] of brushOutline(footprint)) {
      if (y1 === y2) for (let x = x1; x < x2; x++) actual.add(`${x},${y1},${x + 1},${y1}`);
      else for (let y = y1; y < y2; y++) actual.add(`${x1},${y},${x1},${y + 1}`);
    }
    assert.deepEqual(actual, expected, `${shape} ${width}x${height}`);
  }
});

test('all trajectories clip shaped stamps to world and selection and reject oversized first stamps', () => {
  for (const mode of ['freehand', 'line', 'polyline', 'constrain']) {
    const stroke = new BrushStroke({ width: 1000, height: 1000 }, { width: 400, height: 400, shape: 'ellipse' }, { x: 0, y: 0, width: 2, height: 3 }, mode);
    stroke.add({ x: 0, y: 0 }); assert.deepEqual([...stroke.cells], [0, 1, 2, 1000, 1001, 1002]);
    const huge = new BrushStroke({ width: 1000, height: 1000 }, { width: 400, height: 400, shape: 'ellipse' }, null, mode);
    assert.throws(() => huge.add({ x: 500, y: 500 }), /10000/);
  }
  const exact = new BrushStroke({ width: 1000, height: 1000 }, { width: 100, height: 100 });
  exact.add({ x: 500, y: 500 }); assert.equal(exact.cells.size, 10000);
  assert.throws(() => exact.add({ x: 501, y: 500 }), /10000/);
});

test('straight-shaped preview removes the old endpoint while freehand keeps swept stamps', () => {
  for (const mode of ['line', 'polyline', 'freehand', 'constrain']) {
    const stroke = new BrushStroke({ width: 100, height: 100 }, { width: 4, height: 4, shape: 'ellipse' }, null, mode);
    stroke.add({ x: 20, y: 20 }); stroke.add({ x: 25, y: 20 }); stroke.add({ x: 22, y: 20 });
    assert.equal(stroke.cells.has(2520), !['line', 'polyline'].includes(mode));
    assert.ok(stroke.cells.has(2220));
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
  test(`${fixture.name}: even ellipse and rectangle preserve nine fields, masks, history and file sections`, async () => {
    const data = await readFile(new URL(`${fixture.name}.wld`, fixtureRoot)), bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const document = await openWorld(bytes), original = (await parse(bytes)).worldTiles.tiles, expected = new Set();
    const ellipse = new BrushStroke(document.summary, { width: 4, height: 4, shape: 'ellipse' });
    ellipse.add({ x: 100, y: 20 });
    assert.equal(document.paint({ cells: [...ellipse.cells], blockId: 1, masks: [{ field: 'blockId', mode: 'empty' }] }).changed, 12);
    for (const index of ellipse.cells) expected.add(index);
    const rectangle = new BrushStroke(document.summary, { width: 2, height: 4 }, { x: 110, y: 20, width: 1, height: 2 }, 'line');
    rectangle.add({ x: 110, y: 20 }); rectangle.add({ x: 112, y: 20 });
    assert.equal(document.paint({ cells: [...rectangle.cells], blockId: 1 }).changed, 2);
    for (const index of rectangle.cells) expected.add(index);
    assert.equal(document.editState.undoCount, 2);
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
    document.undo(); document.undo();
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
  });
}
