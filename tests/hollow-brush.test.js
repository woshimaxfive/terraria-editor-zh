import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';
import { createHollowBrushShape } from '../src/editing/hollowBrush.js';
import { BrushStroke } from '../src/editing/brush.js';
import { BRUSH_SHAPES } from '../src/editing/brushShape.js';

test('hollow star erosion retains the exact desktop two-cell interior and empty rectangle interiors', () => {
  const star = createHollowBrushShape({ shape: 'star', width: 8, height: 8, rotation: 45, flipHorizontal: true, thickness: 1 });
  assert.equal(star.interior.top, -1); assert.deepEqual(star.interior.rows, [[0, 0], [0, 0]]);
  assert.deepEqual(createHollowBrushShape({ width: 2, height: 2, thickness: 1 }).interior.rows, []);
  assert.equal(createHollowBrushShape({ shape: 'ellipse', width: 1, height: 8, thickness: 1 }).simpleRectangle, true);
});

test('source rectangle sweeps keep first-visit classification and the asymmetric vector exclusion', () => {
  for (const [hollowBlock, total, edge, middle, solid] of [[true, 59, 16, 9, 34], [false, 52, 0, 9, 43]]) {
    const stroke = new BrushStroke({ width: 256, height: 256 }, { shape: 'rectangle', width: 5, height: 5, thickness: 1, hollow: true, hollowBlock });
    for (const [x, y] of [[100, 100], [103, 100], [103, 103], [101, 102]]) stroke.add({ x, y });
    assert.equal(stroke.cells.size, total); assert.equal(stroke.interior.size, middle); assert.equal(stroke.solid.size, solid);
    assert.equal(total - middle - solid, edge); assert.equal(stroke.interior.has(100 * 256 + 100), true);
  }
});

test('final endpoint replacement rebuilds hollow classes rather than retaining the discarded end', () => {
  const stroke = new BrushStroke({ width: 256, height: 256 }, { shape: 'ellipse', width: 5, height: 5, hollow: true }, null, 'line');
  stroke.add({ x: 100, y: 100 }); stroke.add({ x: 110, y: 100 }); stroke.add({ x: 102, y: 100 });
  assert.equal(stroke.cells.has(110 * 256 + 100), false); assert.ok(stroke.interior.size);
  for (const index of stroke.interior) assert.ok(stroke.cells.has(index));
});

test('all hollow trajectories retain candidate limits, selection clipping and source-invalid shape issues', () => {
  for (const mode of ['freehand', 'line', 'polyline', 'constrain']) {
    const settings = { shape: 'ellipse', width: 400, height: 400, hollow: true, rotation: 45 };
    const huge = new BrushStroke({ width: 1000, height: 1000 }, settings, null, mode);
    assert.throws(() => huge.add({ x: 500, y: 500 }), /10000/);
    const clipped = new BrushStroke({ width: 1000, height: 1000 }, settings, { x: 0, y: 0, width: 2, height: 3 }, mode);
    clipped.add({ x: 0, y: 0 }); assert.equal(clipped.cells.size, 6); assert.equal(clipped.interior.size, 6);
  }
  assert.match(createHollowBrushShape({ shape: 'crescent', width: 2, height: 3 }).outer.issue, /无效/);
});

test('hollow geometry reuses its cache and rebuilds when shared thickness changes', () => {
  const settings = { shape: 'ellipse', width: 9, height: 9, thickness: 1 };
  const first = createHollowBrushShape(settings); assert.equal(first, createHollowBrushShape(settings));
  settings.thickness = 2; assert.notEqual(first, createHollowBrushShape(settings));
});

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { FileReader, TileFlag } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { TILE_FIELDS, createBlockEditing } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const { preservesOtherSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();
const fixtureBytes = async fixture => {
  const data = await readFile(new URL(`${fixture.name}.wld`, fixtureRoot));
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
};
function payload(document, shape = 'rectangle', extra = {}) {
  const stroke = new BrushStroke(document.summary, { shape, width: 5, height: 5, hollow: true, ...extra });
  stroke.add({ x: 100, y: 20 });
  return { cells: [...stroke.cells], layer: 'block', blockId: 1, wallId: 4,
    hollow: { interior: [...stroke.interior], solid: [...stroke.solid], fillWall: true } };
}
async function prepared() {
  const document = await openWorld(await fixtureBytes(fixtures[0])), operation = payload(document);
  document.paint({ cells: operation.cells, blockId: 30 }); document.paint({ cells: operation.cells, layer: 'wall', wallId: 1 });
  return { document, operation, baseline: document.serialize() };
}

test('hollow preparation and the first-write gate fail before changing either layer or history', async () => {
  for (const failure of ['prepare', 'gate']) {
    const world = await parse(await fixtureBytes(fixtures[0])), tiles = world.worldTiles.tiles;
    const before = Object.fromEntries(TILE_FIELDS.map(field => [field, tiles[field].slice()]));
    let gates = 0, calls = 0;
    const editing = createBlockEditing(world, () => { gates++; if (failure === 'gate') throw new Error('write gate failed'); });
    const paint = editing.source.paint;
    editing.source.paint = (...args) => { if (failure === 'prepare' && ++calls === 4) throw new Error('preparation failed'); return paint(...args); };
    const operation = payload({ summary: { width: tiles.width, height: tiles.height } });
    assert.throws(() => editing.paintHollow(operation), failure === 'gate' ? /write gate failed/ : /preparation failed/);
    assert.equal(gates, failure === 'gate' ? 1 : 0);
    assert.deepEqual(editing.state, { revision: 0, dirty: false, undoCount: 0, redoCount: 0 });
    for (const field of TILE_FIELDS) assert.deepEqual(tiles[field], before[field], field);
  }
});

test('hollow cross-layer changes are one history step and undo restores the entire original tile', async () => {
  const { document, operation, baseline } = await prepared(), history = document.editState.undoCount;
  assert.equal(document.paint(operation).changed, 25); assert.equal(document.editState.undoCount, history + 1);
  assert.equal(document.pick({ x: 100, y: 20 }).wallId, 4);
  assert.equal(document.pick({ x: 100, y: 20 }).materialId, null);
  document.undo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(baseline));
  document.redo(); assert.equal(document.pick({ x: 100, y: 20 }).wallId, 4);
});

test('interior wall filling rechecks masks after clearing the source block', async () => {
  const { document, operation } = await prepared();
  const result = document.paint({ ...operation, masks: [{ field: 'blockId', mode: 'match', value: 30 }] });
  assert.equal(result.filtered, 9); assert.equal(result.changed, 25);
  const inside = document.pick({ x: 100, y: 20 }); assert.equal(inside.materialId, null); assert.equal(inside.wallId, null);
  assert.equal(document.pick({ x: 98, y: 18 }).materialId, 1); assert.equal(document.pick({ x: 98, y: 18 }).wallId, 1);
});

test('wall-only hollow strokes leave border and block fields intact; hollow erase clears only enabled layers', async () => {
  const { document, operation, baseline } = await prepared();
  const wall = new BrushStroke(document.summary, { shape: 'rectangle', width: 5, height: 5, hollow: true, hollowBlock: false }); wall.add({ x: 100, y: 20 });
  assert.equal(document.paint({ ...operation, cells: [...wall.cells], layer: 'wall', hollow: { interior: [...wall.interior], solid: [], fillWall: false } }).changed, 9);
  assert.equal(document.pick({ x: 100, y: 20 }).materialId, 30); assert.equal(document.pick({ x: 98, y: 18 }).wallId, 1);
  document.undo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(baseline));
  document.erase(operation); assert.equal(document.pick({ x: 100, y: 20 }).wallId, null);
  assert.equal(document.pick({ x: 98, y: 18 }).wallId, 1); assert.equal(document.pick({ x: 98, y: 18 }).materialId, null);
});

test('invalid hollow parameters, overlap and wall material failures cannot partially modify the world', async () => {
  const { document, operation, baseline } = await prepared();
  for (const bad of [{ ...operation, wallId: 99999 }, { ...operation, hollow: { ...operation.hollow, solid: [operation.hollow.interior[0]] } },
    { ...operation, hollow: { ...operation.hollow, interior: [-1] } }, { ...operation, hollow: { ...operation.hollow, fillWall: 'yes' } },
    { ...operation, layer: 'wire', wireMask: 1 }]) {
    assert.throws(() => document.paint(bad));
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(baseline));
  }
});

for (const fixture of fixtures) test(`${fixture.name}: nine hollow tips atomically preserve other fields, sections and history`, async () => {
  const bytes = await fixtureBytes(fixture), document = await openWorld(bytes), seed = [];
  for (let i = 0; i < 9; i++) for (let x = 90 + i * 24; x < 110 + i * 24; x++) for (let y = 10; y < 31; y++) seed.push(x * document.summary.height + y);
  document.paint({ cells: seed, blockId: 30 }); document.paint({ cells: seed, layer: 'wall', wallId: 1 });
  document.paint({ cells: seed, layer: 'wire', wireMask: 3 }); document.paint({ cells: seed, layer: 'liquid', liquidAmount: 77, liquidType: 1 });
  document.paint({ cells: seed, layer: 'paint', appearance: { target: 'block', mode: 'color', color: 8 } });
  document.paint({ cells: seed, layer: 'paint', appearance: { target: 'wall', mode: 'color', color: 9 } });
  const baseline = document.serialize(), original = (await parse(baseline)).worldTiles.tiles;
  const expected = Object.fromEntries(TILE_FIELDS.map(field => [field, original[field].slice()])), history = document.editState.undoCount;
  const counts = [[84, 40], [50, 30], [11, 0], [11, 0], [21, 0], [25, 2], [16, 1], [30, 0], [60, 16]];
  for (const [i, [shape]] of BRUSH_SHAPES.entries()) {
    const stroke = new BrushStroke(document.summary, { shape, width: 8, height: 8, rotation: 45, flipHorizontal: true, thickness: 1, hollow: true });
    stroke.add({ x: 100 + i * 24, y: 20 }); assert.equal(stroke.cells.size, counts[i][0]); assert.equal(stroke.interior.size, counts[i][1]);
    assert.equal(document.paint({ cells: [...stroke.cells], blockId: 1, wallId: 4, hollow: { interior: [...stroke.interior], solid: [], fillWall: true } }).changed, stroke.cells.size);
    for (const index of stroke.cells) {
      expected.blockId[index] = stroke.interior.has(index) ? 0 : 1; expected.frameX[index] = expected.frameY[index] = 0;
      if (stroke.interior.has(index)) {
        expected.blockColor[index] = 0; expected.wallId[index] = 4; expected.wallColor[index] = 0;
        expected.flags[index] &= ~(TileFlag.IS_BLOCK_ACTIVE | TileFlag.SLOPE_MASK | TileFlag.ACTUATOR | TileFlag.ACTUATED | TileFlag.INVISIBLE_BLOCK | TileFlag.FULL_BRIGHT_BLOCK | TileFlag.INVISIBLE_WALL | TileFlag.FULL_BRIGHT_WALL);
      }
    }
  }
  assert.equal(document.editState.undoCount, history + 9);
  const output = document.serialize(), actual = (await parse(output)).worldTiles.tiles;
  for (const field of TILE_FIELDS) assert.deepEqual(actual[field], expected[field], field);
  assert.equal(preservesOtherSections(bytes, output), true);
  document.undo(); document.redo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(output));
  for (let i = 0; i < 9; i++) document.undo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(baseline));
  const source = await parse(baseline); let protectedIndex = -1;
  for (let i = 0; i < source.worldTiles.tiles.count; i++) if (source.worldTiles.tiles.hasBlock(i) && source.fileFormatHeader.importants[source.worldTiles.tiles.blockId[i]]) { protectedIndex = i; break; }
  assert.ok(protectedIndex >= 0);
  assert.equal(document.paint({ cells: [protectedIndex], blockId: 1, wallId: 4, hollow: { interior: [protectedIndex], solid: [], fillWall: true } }).skipped, 1);
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(baseline));
});
