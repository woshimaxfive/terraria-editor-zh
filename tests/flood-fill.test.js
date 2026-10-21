import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { floodCells, fillMatches } from '../src/editing/floodFill.js';
import { fixtures, fixtureRoot } from './worldFixtures.js';

const base = { type: 0, active: false, wall: 0, slope: 0, actuator: false, actuated: false, amount: 0, liquid: 0, solid: false, framed: false, stopsWalls: false };
const tile = values => ({ ...base, ...values });
const noYield = { yieldControl: async () => {} };
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { FileReader, FileSaver } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { TILE_FIELDS, createBlockEditing } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const { preservesOtherSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();
async function input(name = 'v1.4.5.5') {
  const bytes = await readFile(new URL(`${name}.wld`, fixtureRoot));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

test('desktop connectivity uses material/activity, wall barriers, slope, extras and liquid solidity independently of paint', () => {
  const origin = tile({ type: 1, active: true, wall: 4 });
  assert.equal(fillMatches(origin, tile({ ...origin, type: 2 }), 'block'), false);
  assert.equal(fillMatches(origin, tile({ ...origin, active: false }), 'block'), false);
  assert.equal(fillMatches(origin, tile({ ...origin, color: 10 }), 'paint', { target: 'block' }), true);
  assert.equal(fillMatches(origin, tile({ ...origin, framed: true, type: 10 }), 'wall'), false);
  const air = tile({ wall: 4 });
  assert.equal(fillMatches(air, tile({ wall: 4, active: true, type: 21, framed: true }), 'wall'), true);
  assert.equal(fillMatches(air, tile({ wall: 4, active: true, type: 10, framed: true, stopsWalls: true }), 'wall'), false);
  assert.equal(fillMatches(air, tile({ wall: 4, active: true, type: 1 }), 'paint', { target: 'wall' }), false);
  assert.equal(fillMatches(air, tile({ wall: 5 }), 'wall'), false);
  assert.equal(fillMatches(origin, tile({ ...origin, type: 3, slope: 0 }), 'slope'), true);
  assert.equal(fillMatches(origin, tile({ ...origin, slope: 1 }), 'slope'), false);
  assert.equal(fillMatches(origin, tile({ ...origin, active: false }), 'slope'), false);
  assert.equal(fillMatches(origin, tile({ ...origin, actuator: true }), 'slope'), false);
  assert.equal(fillMatches(origin, tile({ type: 30, wall: 10, active: false }), 'paint', { target: 'block', mode: 'coating' }), true);
  assert.equal(fillMatches(origin, tile({ ...origin, type: 3 }), 'actuator'), true);
  assert.equal(fillMatches(origin, tile({ ...origin, actuator: true }), 'actuator'), false);
  const water = tile({ amount: 26, liquid: 1 });
  assert.equal(fillMatches(water, tile({ amount: 255, liquid: 1 }), 'liquid'), true);
  assert.equal(fillMatches(water, tile({ amount: 0, liquid: 1 }), 'liquid'), false);
  assert.equal(fillMatches(water, tile({ amount: 26, liquid: 2 }), 'liquid'), false);
  assert.equal(fillMatches(water, tile({ ...water, active: true, solid: true }), 'liquid'), false);
  assert.equal(fillMatches(tile({ ...water, active: true, solid: true }), water, 'liquid'), false);
});

test('four-neighbour connectivity clips selection, never connects diagonally or wraps columns', async () => {
  const values = new Map([0, 1, 3, 4, 8].map(i => [i, tile({ type: 1, active: true })]));
  const world = { width: 3, height: 3, read: i => values.get(i) ?? tile({ type: 2, active: true }) };
  assert.deepEqual(new Set(await floodCells(world, { point: { x: 0, y: 0 }, layer: 'block' }, noYield)), new Set([0, 1, 3, 4]));
  assert.deepEqual(await floodCells(world, { point: { x: 0, y: 0 }, layer: 'block', selection: { x: 0, y: 0, width: 1, height: 3 } }, noYield), [0, 1]);
  const wrapped = { width: 2, height: 2, read: i => tile({ type: [1, 2].includes(i) ? 1 : 2, active: true }) };
  assert.deepEqual(await floodCells(wrapped, { point: { x: 0, y: 1 }, layer: 'block' }, noYield), [1]);
});

test('liquid solid origin is included as desktop does, but cannot spread to neighbours', async () => {
  const world = { width: 3, height: 3, read: i => tile({ amount: 255, liquid: 1, active: i === 4, solid: i === 4 }) };
  assert.deepEqual(await floodCells(world, { point: { x: 1, y: 1 }, layer: 'liquid' }, noYield), [4]);
});

test('exact 10000-cell boundary succeeds, larger regions reject with bounded reads and no world-sized allocation', async () => {
  let reads = 0;
  const world = { width: 100000, height: 100000, read() { reads++; return base; } };
  const options = { point: { x: 0, y: 0 }, layer: 'block', selection: { x: 0, y: 0, width: 100, height: 100 } };
  assert.equal((await floodCells(world, options, noYield)).length, 10000);
  reads = 0;
  await assert.rejects(floodCells(world, { ...options, selection: null }, noYield), /超过 10000/);
  assert.ok(reads < 40005);
});

test('invalid fill arguments and pre-cancellation do not read tiles; cooperative cancellation stops after a yield', async () => {
  let reads = 0, cancelled = false, yields = 0;
  const world = { width: 100, height: 100, read() { reads++; return base; } };
  const options = { point: { x: 1, y: 1 }, layer: 'block' };
  for (const bad of [{ point: { x: -1, y: 0 } }, { point: { x: 0.5, y: 0 } }, { layer: 'wire' }, { layer: 'paint' }, { selection: {} }, { selection: { x: 2, y: 2, width: 1, height: 1 } }]) {
    await assert.rejects(floodCells(world, { ...options, ...bad }, noYield), /无效/);
  }
  assert.equal(reads, 0);
  await assert.rejects(floodCells(world, options, { cancelled: () => true }), { name: 'AbortError' });
  assert.equal(reads, 0);
  await assert.rejects(floodCells(world, options, { cancelled: () => cancelled, yieldControl: async () => { if (++yields === 2) cancelled = true; } }), { name: 'AbortError' });
  assert.ok(reads > 256 && reads < 1100);
});

for (const fixture of fixtures) {
  test(`${fixture.name}: fill preview is read-only; masks do not block traversal; confirm/undo/redo preserve all fields and other sections`, async () => {
    const world = await parse(await input(fixture.name)), tiles = world.worldTiles.tiles;
    const selection = { x: 100, y: 10, width: 4, height: 2 }, point = { x: 100, y: 10 };
    for (let x = 100; x < 104; x++) for (let y = 10; y < 12; y++) tiles.setTile(x, y, {
      blockId: x === 103 ? 30 : 1, wallId: 4, wireBlue: true, wireRed: x !== 101, liquidAmount: 102, liquidType: 1, slope: 1 });
    const bytes = new FileSaver().save(world), document = await openWorld(bytes);
    const options = { selection, point, layer: 'block', blockId: 54, masks: [{ field: 'wireRed', mode: 'match' }] };
    const preview = await document.prepareFill(options, noYield);
    assert.equal(preview.cells.length, 6);
    assert.equal(document.editState.revision, 0);
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
    const result = document.commitFill({ token: preview.token });
    assert.equal(result.changed, 4); assert.equal(result.filtered, 2); assert.equal(result.undoCount, 1);
    for (const x of [100, 102]) for (let y = 10; y < 12; y++) tiles.blockId[tiles.index(x, y)] = 54;
    const output = document.serialize(), actual = (await parse(output)).worldTiles.tiles;
    for (const field of TILE_FIELDS) assert.deepEqual(actual[field], tiles[field], field);
    assert.equal(preservesOtherSections(bytes, output), true);
    document.undo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
    document.redo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(output));
    assert.throws(() => document.commitFill({ token: preview.token }), /失效/);
  });
}

test('cancel, budget failure, invalid masks and stale previews preserve export, redo and original options', async () => {
  const bytes = await input(), document = await openWorld(bytes), point = { x: 100, y: 10 }, selection = { ...point, width: 100, height: 100 };
  document.paint({ layer: 'block', blockId: 1, cells: [100 * document.summary.height + 10] }); document.undo();
  const state = document.editState;
  await assert.rejects(document.prepareFill({ point: { x: 0, y: 0 }, layer: 'block', blockId: 1 }, noYield), /超过 10000/);
  await assert.rejects(document.prepareFill({ point, selection, layer: 'block', blockId: 1, masks: [{ field: 'unknown', mode: 'match' }] }, noYield), /条件无效/);
  let yields = 0, cancelled = false;
  await assert.rejects(document.prepareFill({ point, selection, layer: 'block', blockId: 1 }, { cancelled: () => cancelled,
    yieldControl: async () => { if (++yields === 2) cancelled = true; } }), { name: 'AbortError' });
  assert.deepEqual(document.editState, state); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
  const options = { point, selection: { ...point, width: 2, height: 2 }, layer: 'block', blockId: 1 };
  const preview = await document.prepareFill(options, noYield); options.blockId = 30; preview.cells.length = 0;
  assert.equal(document.commitFill({ token: preview.token }).changed, 4);
  const stale = await document.prepareFill(options, noYield); document.undo();
  assert.throws(() => document.commitFill({ token: stale.token }), /失效/);
  const dropped = await document.prepareFill(options, noYield); document.cancelFill();
  assert.throws(() => document.commitFill({ token: dropped.token }), /失效/);
});

test('adapter uses pinned wall-door/framed and solid metadata; saveSlope alone does not imply a liquid barrier', async () => {
  const world = await parse(await input()), tiles = world.worldTiles.tiles;
  const point = { x: 100, y: 10 }, selection = { ...point, width: 5, height: 1 };
  for (let x = 100; x < 105; x++) { const index = tiles.index(x, 10); for (const field of TILE_FIELDS) tiles[field][index] = 0; tiles.wallId[index] = 4; }
  tiles.setTile(101, 10, { blockId: 21, wallId: 4 }); // Framed chest permits a wall traversal.
  tiles.setTile(102, 10, { blockId: 10, wallId: 4 }); // Closed door blocks it.
  const editing = createBlockEditing(world, () => {});
  assert.equal((await editing.prepareFill({ point, selection, layer: 'wall', wallId: 1 }, noYield)).cells.length, 2);
  tiles.setTile(101, 10, { blockId: 131, wallId: 4, liquidAmount: 26, liquidType: 1 });
  for (const x of [100, 102, 103, 104]) tiles.setTile(x, 10, { wallId: 4, liquidAmount: 128, liquidType: 1 });
  tiles.setTile(103, 10, { blockId: 1, wallId: 4, liquidAmount: 128, liquidType: 1 });
  assert.equal((await editing.prepareFill({ point, selection, layer: 'liquid', liquidType: 2, liquidAmount: 255 }, noYield)).cells.length, 3);
  tiles.setTile(101, 10, { blockId: 19, wallId: 4, liquidAmount: 26, liquidType: 1 });
  assert.equal((await editing.prepareFill({ point, selection, layer: 'liquid', liquidType: 2, liquidAmount: 255 }, noYield)).cells.length, 1);
});

test('each fill layer changes only its own stored fields; protected slope and actuator no-ops retain history', async () => {
  const world = await parse(await input()), tiles = world.worldTiles.tiles;
  const point = { x: 100, y: 10 }, selection = { ...point, width: 2, height: 2 };
  const cases = [
    [{ layer: 'block', blockId: 54 }, [0, 1, 2], v => { v[0] = 54; v[1] = v[2] = 0; }],
    [{ layer: 'wall', wallId: 1 }, [4], v => { v[4] = 1; }],
    [{ layer: 'slope', slope: 2 }, [8], v => { v[8] = (v[8] & ~(7 << 11)) | (2 << 11); }],
    [{ layer: 'actuator', actuator: false, actuated: true }, [8], v => { v[8] = (v[8] & ~(32 | 64)) | 64; }],
    [{ layer: 'paint', appearance: { target: 'wall', mode: 'color', color: 5 } }, [5], v => { v[5] = 5; }],
    [{ layer: 'paint', appearance: { target: 'block', mode: 'coating', invisible: true, fullBright: true } }, [8], v => { v[8] |= 128 | 512; }],
    [{ layer: 'liquid', liquidType: 2, liquidAmount: 128 }, [6, 7], v => { v[6] = 128; v[7] = 2; }],
  ];
  for (const [options, allowed, change] of cases) {
    const indices = [];
    for (let x = 100; x < 102; x++) for (let y = 10; y < 12; y++) {
      tiles.setTile(x, y, { blockId: options.layer === 'liquid' ? 131 : 1, wallId: 4, blockColor: 2,
        wallColor: 3, slope: 1, actuator: true, wireRed: true, wireBlue: true, liquidAmount: 102, liquidType: 1 });
      indices.push(tiles.index(x, y));
    }
    const bytes = new FileSaver().save(world), document = await openWorld(bytes);
    const preview = await document.prepareFill({ ...options, point, selection }, noYield);
    assert.equal(preview.cells.length, 4); assert.equal(document.commitFill({ token: preview.token }).changed, 4);
    const output = document.serialize(), actual = (await parse(output)).worldTiles.tiles;
    const expected = new Map(indices.map(i => { const v = TILE_FIELDS.map(field => tiles[field][i]); change(v); return [i, v]; }));
    for (const [fieldIndex, field] of TILE_FIELDS.entries()) {
      const values = tiles[field].slice();
      if (allowed.includes(fieldIndex)) for (const index of indices) values[index] = expected.get(index)[fieldIndex];
      assert.deepEqual(actual[field], values, `${options.layer}: ${field}`);
    }
    assert.equal(preservesOtherSections(bytes, output), true);
  }
  const document = await openWorld(await input());
  document.paint({ layer: 'block', blockId: 1, cells: [100 * document.summary.height + 10] }); document.undo();
  const before = document.editState;
  for (const options of [{ layer: 'slope', slope: 2 }, { layer: 'actuator', actuator: true, actuated: true },
    { layer: 'block', blockId: 1, masks: [{ field: 'blockId', mode: 'match', value: 65535 }] }]) {
    const preview = await document.prepareFill({ ...options, point, selection }, noYield);
    assert.equal(document.commitFill({ token: preview.token }).changed, 0); assert.deepEqual(document.editState, before);
  }
});

test('in-flight cancellation and revision changes invalidate preparation before any fill can be confirmed', async () => {
  const document = await openWorld(await input()), point = { x: 100, y: 10 };
  const options = { layer: 'block', blockId: 1, point, selection: { ...point, width: 2, height: 2 } };
  await assert.rejects(document.prepareFill(options, { yieldControl: async () => document.cancelFill() }), { name: 'AbortError' });
  assert.equal(document.editState.revision, 0);
  await assert.rejects(document.prepareFill(options, { yieldControl: async () => document.paint({ blockId: 30, cells: [100 * document.summary.height + 10] }) }), /世界已变化/);
  assert.equal(document.editState.undoCount, 1);
});
