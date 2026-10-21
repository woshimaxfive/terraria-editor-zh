import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { createBrushShape, brushOutline, BRUSH_SHAPES } from '../src/editing/brushShape.js';
import { BrushStroke } from '../src/editing/brush.js';
import { roundEven } from '../src/editing/complexBrushShape.js';
import { transformBrushPoint } from '../src/editing/brushTransform.js';
import { fixtures, fixtureRoot } from './worldFixtures.js';

const settings = shape => ({ shape, width: 6, height: 8, rotation: 30, flipHorizontal: true, flipVertical: true, thickness: 3 });

test('transform settings reject invalid values without coercing or normalizing 360 degrees', () => {
  for (const rotation of [-1, 361, NaN, Infinity, '30', null]) assert.throws(() => createBrushShape({ ...settings('ellipse'), rotation }), /变换/);
  for (const flipHorizontal of [0, 1, 'true', null]) assert.throws(() => createBrushShape({ ...settings('ellipse'), flipHorizontal }), /变换/);
  for (const flipVertical of [0, 1, 'false', null]) assert.throws(() => createBrushShape({ ...settings('ellipse'), flipVertical }), /变换/);
  assert.notDeepEqual(createBrushShape({ shape: 'rectangle', width: 4, height: 4, rotation: 360 }).rows,
    createBrushShape({ shape: 'rectangle', width: 4, height: 4, rotation: 0 }).rows);
});

test('desktop midpoint rounding and flip-before-rotation order are preserved', () => {
  assert.deepEqual([.5, 1.5, 2.5, -.5, -1.5, -2.5].map(roundEven), [0, 2, 2, 0, -2, -2]);
  assert.deepEqual(transformBrushPoint([2, 3], { rotation: 90, flipHorizontal: true }), [-3, -2]);
  assert.deepEqual(transformBrushPoint([2, 3], { rotation: .01, flipHorizontal: true }), [-2, 3]);
});

test('transformed polygon scanlines retain source integer vertices and asymmetric scan edges', () => {
  const star = createBrushShape(settings('star')), triangle = createBrushShape(settings('triangle'));
  assert.equal(star.top, -3);
  assert.deepEqual(star.rows, [[0, 0], [0, 0], [0, 2], [-1, 1], [-1, 1], [-1, -1, 2, 2], [-2, -2]]);
  assert.equal(triangle.top, -1);
  assert.deepEqual(triangle.rows, [[-1, 0], [-1, 1], [-1, 3], [-1, -1]]);
});

test('transforms disable single-axis rectangle fallback and report source-invalid or empty tips', () => {
  for (const shape of ['rectangle', 'triangle', 'crescent', 'donut']) {
    const plain = createBrushShape({ shape, width: 1, height: 2, rotation: .01 });
    assert.equal(plain.top, -1); assert.deepEqual(plain.rows, [[0, 0], [0, 0]]);
  }
  const tiny = createBrushShape({ shape: 'triangle', width: 1, height: 2, rotation: .010001 });
  assert.match(tiny.issue, /不产生图格/); assert.deepEqual(tiny.rows, []);
  const crescent = createBrushShape({ shape: 'crescent', width: 1, height: 2, flipVertical: true });
  assert.match(crescent.issue, /月牙 1×2/); assert.deepEqual(crescent.rows, []);
  const rectangle = createBrushShape({ shape: 'rectangle', width: 1, height: 2, rotation: 360 });
  assert.equal(rectangle.top, 0); assert.deepEqual(rectangle.rows, [[0, 0], [0, 0]]);
});

test('transformed cursor boundaries enclose exactly the actual stamped cells including holes', () => {
  for (const [shape] of BRUSH_SHAPES) {
    const stroke = new BrushStroke({ width: 100, height: 100 }, settings(shape)); stroke.add({ x: 50, y: 50 });
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

test('all trajectories clip transformed tips and reject oversized candidates before editing', () => {
  for (const mode of ['freehand', 'line', 'polyline', 'constrain']) for (const [shape] of BRUSH_SHAPES) {
    const tip = { shape, width: 400, height: 400, rotation: 45, flipHorizontal: true, thickness: 200 };
    const huge = new BrushStroke({ width: 2000, height: 2000 }, tip, null, mode);
    assert.throws(() => huge.add({ x: 1000, y: 1000 }), /10000/);
    const clipped = new BrushStroke({ width: 2000, height: 2000 }, tip, { x: 0, y: 0, width: 2, height: 3 }, mode);
    clipped.add({ x: 0, y: 0 }); assert.ok(clipped.cells.size <= 6);
    for (const index of clipped.cells) assert.ok(Math.floor(index / 2000) < 2 && index % 2000 < 3);
  }
});

test('brush caching includes rotation and both flips even if callers mutate a settings object', () => {
  const tip = settings('crescent'), original = createBrushShape(tip);
  assert.equal(createBrushShape(tip), original);
  for (const [key, value] of [['rotation', 90], ['flipHorizontal', false], ['flipVertical', false]]) {
    const previous = createBrushShape(tip); tip[key] = value;
    assert.notEqual(createBrushShape(tip), previous); assert.equal(createBrushShape(tip), createBrushShape(tip));
  }
});

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { FileReader } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { TILE_FIELDS } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const { preservesOtherSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();
for (const fixture of fixtures) test(`${fixture.name}: all nine transformed tips preserve fields, sections and independent history`, async () => {
  const data = await readFile(new URL(`${fixture.name}.wld`, fixtureRoot)), bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const document = await openWorld(bytes), original = (await parse(bytes)).worldTiles.tiles, expected = new Set();
  for (const [i, count] of [58, 36, 87, 93, 131, 14, 11, 31, 56].entries()) {
    const stroke = new BrushStroke(document.summary, settings(BRUSH_SHAPES[i][0])); stroke.add({ x: 100 + i * 24, y: 20 });
    assert.equal(stroke.cells.size, count);
    assert.equal(document.paint({ cells: [...stroke.cells], blockId: 1, masks: [{ field: 'blockId', mode: 'empty' }] }).changed, count);
    for (const index of stroke.cells) expected.add(index);
  }
  assert.equal(document.editState.undoCount, 9);
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
  for (let i = 0; i < 9; i++) document.undo();
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
});
