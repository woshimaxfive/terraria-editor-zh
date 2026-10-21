import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';
import { BRUSH_SHAPES } from '../src/editing/brushShape.js';
import { createOrderedBrushStamp } from '../src/editing/orderedBrushStamp.js';
import { SprayStroke } from '../src/editing/SprayStroke.js';

const world = { width: 256, height: 256 };
const settings = { width: 5, height: 5, sprayDensity: 15, sprayTickMs: 100 };
const identity = min => min;
const list = stamp => Array.from({ length: stamp.points.length / 2 }, (_, i) => [stamp.points[i * 2], stamp.points[i * 2 + 1]]);

test('ordered cached stamps preserve duplicate weights and the source single-axis path', () => {
  assert.deepEqual(list(createOrderedBrushStamp({ shape: 'cross', width: 1, height: 2 })), [[0, -1], [0, 0], [0, 0], [0, -1]]);
  assert.deepEqual(list(createOrderedBrushStamp({ shape: 'triangle', width: 1, height: 7 })), [[0, 0]]);
  assert.match(createOrderedBrushStamp({ shape: 'cross', width: 1, height: 1 }).issue, /不产生/);
  assert.match(createOrderedBrushStamp({ shape: 'crescent', width: 2, height: 3 }).issue, /无效/);
});

test('ordered stamp caching tracks geometry changes independently of spray density', () => {
  const value = { shape: 'ellipse', width: 6, height: 8, sprayDensity: 15 };
  const before = createOrderedBrushStamp(value); value.sprayDensity = 20;
  assert.equal(createOrderedBrushStamp(value), before);
  value.flipHorizontal = true; assert.notEqual(createOrderedBrushStamp(value), before);
});

test('timed spray immediately samples, defers sub-interval movement, and interpolates accumulated ticks', () => {
  let time = 0;
  const stroke = new SprayStroke(world, settings, null, { now: () => time, randomInt: identity });
  stroke.add({ x: 100, y: 100 });
  assert.deepEqual([...stroke.cells], [98 * 256 + 98, 99 * 256 + 98, 100 * 256 + 98]);
  time = 5; stroke.add({ x: 103, y: 100 }); assert.equal(stroke.cells.size, 3);
  time = 100; stroke.add({ x: 104, y: 100 });
  assert.deepEqual([...stroke.cells], [98, 99, 100, 101, 102].map(x => x * 256 + 98));
  time = 200; stroke.add({ x: 104, y: 100 });
  assert.deepEqual([...stroke.cells], [98, 99, 100, 101, 102, 103, 104].map(x => x * 256 + 98));
});

test('spray samples the entire stamp before clipping selection or world bounds', () => {
  const stroke = new SprayStroke(world, settings, { x: 100, y: 98, width: 1, height: 1 }, { now: () => 0, randomInt: identity });
  stroke.add({ x: 100, y: 100 }); assert.deepEqual([...stroke.cells], [100 * 256 + 98]);
  const clipped = new SprayStroke(world, { ...settings, sprayDensity: 100 }, null, { now: () => 0, randomInt: identity });
  clipped.add({ x: 0, y: 0 }); assert.equal(clipped.cells.size, 9);
  assert.ok([...clipped.cells].every(index => index >= 0 && index < 256 * 256));
});

test('all ticks share one candidate set, while source hollow settings do not clear interiors', () => {
  let time = 0;
  const stroke = new SprayStroke(world, { ...settings, hollow: true, fillWall: true, sprayDensity: 100 }, null, { now: () => time, randomInt: identity });
  stroke.add({ x: 100, y: 100 }); time = 1000; stroke.add({ x: 100, y: 100 });
  assert.equal(stroke.cells.size, 25); assert.equal(stroke.interior.size, 0); assert.equal(stroke.hollow, null);
});

test('spray rejects malformed parameters, invalid random draws and reversed clocks', () => {
  for (const extra of [{ sprayDensity: 0 }, { sprayDensity: 101 }, { sprayDensity: 1.5 }, { sprayTickMs: 9 }, { sprayTickMs: 101 }]) {
    assert.throws(() => new SprayStroke(world, { ...settings, ...extra }), /喷枪参数无效/);
  }
  const invalid = new SprayStroke(world, settings, null, { now: () => 0, randomInt: () => NaN });
  assert.throws(() => invalid.add({ x: 100, y: 100 }), /采样无效/);
  let time = 100;
  const clock = new SprayStroke(world, settings, null, { now: () => time, randomInt: identity });
  clock.add({ x: 100, y: 100 }); time = 90;
  assert.throws(() => clock.add({ x: 100, y: 100 }), /时间无效/);
});

test('oversized spray and excessive accumulated work reject the whole draft before commit', () => {
  const huge = new SprayStroke({ width: 1000, height: 1000 }, { width: 400, height: 400, sprayDensity: 100 }, null, { now: () => 0, randomInt: identity });
  assert.throws(() => huge.add({ x: 500, y: 500 }), /10000/);
  let time = 0;
  const delayed = new SprayStroke(world, settings, null, { now: () => time, randomInt: identity });
  delayed.add({ x: 100, y: 100 }); const before = [...delayed.cells]; time = 1e9;
  assert.throws(() => delayed.add({ x: 100, y: 100 }), /采样过多/);
  assert.deepEqual([...delayed.cells], before);
});

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { FileReader, TileFlag } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { TILE_FIELDS } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const { preservesOtherSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();
for (const fixture of fixtures) test(fixture.name + ': nine spray stamps preserve fields and sections with one history step each', async () => {
  const data = await readFile(new URL(fixture.name + '.wld', fixtureRoot));
  const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), document = await openWorld(bytes), seed = [];
  for (let i = 0; i < 9; i++) for (let x = 90 + i * 24; x < 110 + i * 24; x++) for (let y = 10; y < 31; y++) seed.push(x * document.summary.height + y);
  document.paint({ cells: seed, blockId: 30 }); document.paint({ cells: seed, layer: 'wall', wallId: 1 });
  document.paint({ cells: seed, layer: 'wire', wireMask: 3 }); document.paint({ cells: seed, layer: 'liquid', liquidAmount: 77, liquidType: 1 });
  document.paint({ cells: seed, layer: 'paint', appearance: { target: 'block', mode: 'color', color: 8 } });
  document.paint({ cells: seed, layer: 'paint', appearance: { target: 'wall', mode: 'color', color: 9 } });
  const baseline = document.serialize(), source = await parse(baseline), original = source.worldTiles.tiles;
  const expected = Object.fromEntries(TILE_FIELDS.map(field => [field, original[field].slice()])), history = document.editState.undoCount;
  const counts = [84, 50, 11, 11, 21, 25, 16, 30, 60];
  for (const [i, [shape]] of BRUSH_SHAPES.entries()) {
    const stroke = new SprayStroke(document.summary, { shape, width: 8, height: 8, rotation: 45, flipHorizontal: true, thickness: 1, sprayDensity: 100, hollow: true, fillWall: true }, null, { now: () => 0, randomInt: identity });
    stroke.add({ x: 100 + i * 24, y: 20 }); assert.equal(stroke.cells.size, counts[i]);
    assert.equal(document.paint({ cells: [...stroke.cells], blockId: 1, masks: [{ field: 'blockId', mode: 'match', value: 30 }] }).changed, counts[i]);
    for (const index of stroke.cells) { expected.blockId[index] = 1; expected.frameX[index] = expected.frameY[index] = 0; expected.flags[index] |= TileFlag.IS_BLOCK_ACTIVE; }
  }
  assert.equal(document.editState.undoCount, history + 9);
  const output = document.serialize(), actual = (await parse(output)).worldTiles.tiles;
  for (const field of TILE_FIELDS) assert.deepEqual(actual[field], expected[field], field);
  assert.equal(preservesOtherSections(bytes, output), true);
  document.undo(); document.redo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(output));
  for (let i = 0; i < 9; i++) document.undo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(baseline));
  let protectedIndex = -1;
  for (let i = 0; i < original.count; i++) if (original.hasBlock(i) && source.fileFormatHeader.importants[original.blockId[i]]) { protectedIndex = i; break; }
  assert.ok(protectedIndex >= 0);
  const protectedStroke = new SprayStroke(document.summary, { width: 1, height: 1 }, null, { now: () => 0, randomInt: identity });
  protectedStroke.add({ x: Math.floor(protectedIndex / original.height), y: protectedIndex % original.height });
  assert.equal(document.paint({ cells: [...protectedStroke.cells], blockId: 1 }).skipped, 1);
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(baseline));
});
