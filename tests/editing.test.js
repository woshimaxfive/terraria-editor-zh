import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { BrushStroke, MATERIALS, MAX_STROKE_TILES } from '../src/editing/brush.js';
import { EditHistory } from '../src/editing/EditHistory.js';
import { fixtures, fixtureRoot } from './worldFixtures.js';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { FileReader, FileSaver, TileFlag } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { TILE_FIELDS } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const { preservesOtherSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
async function input(name = 'v1.4.5.5') {
  const bytes = await readFile(new URL(`${name}.wld`, fixtureRoot));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();

for (const fixture of fixtures) {
  test(`${fixture.name}: paint, undo, redo and reopen preserve every other tile field and section`, async () => {
    const bytes = await input(fixture.name);
    const original = await parse(bytes);
    const document = await openWorld(bytes);
    const index = 10 * 1200 + 10;
    assert.equal(original.worldTiles.tiles.hasBlock(index), false);
    assert.equal(document.paint({ cells: [index, index + 1, index], blockId: 0 }).changed, 2);
    assert.equal(document.editState.dirty, true);
    assert.equal(document.undo().dirty, false);
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
    assert.equal(document.redo().dirty, true);
    for (const material of MATERIALS) {
      const cell = 20 * 1200 + 20 + material.id;
      assert.equal(document.paint({ cells: [cell], blockId: material.id }).changed, 1);
      original.worldTiles.tiles.blockId[cell] = material.id;
      original.worldTiles.tiles.flags[cell] |= TileFlag.IS_BLOCK_ACTIVE;
    }
    const output = document.serialize();
    assert.equal(document.editState.dirty, false);
    assert.equal(preservesOtherSections(bytes, output), true);
    const reloaded = await parse(output);
    const expected = original.worldTiles.tiles;
    for (const i of [index, index + 1]) {
      expected.blockId[i] = 0;
      expected.flags[i] |= TileFlag.IS_BLOCK_ACTIVE;
    }
    for (const field of TILE_FIELDS) assert.deepEqual(reloaded.worldTiles.tiles[field], expected[field], field);
    assert.deepEqual(reloaded.chests, original.chests);
    assert.deepEqual(reloaded.NPCs, original.NPCs);
    assert.deepEqual(reloaded.footer, original.footer);
    const reopened = await openWorld(output);
    assert.deepEqual(new Uint8Array(reopened.serialize()), new Uint8Array(output));
  });
}

test('paint preserves liquid, wall, wires, coatings, slopes and dormant flags; special tiles are skipped', async () => {
  const world = await parse(await input());
  const tiles = world.worldTiles.tiles;
  tiles.setTile(10, 10, { blockId: 1, wallId: 300, wallColor: 7, liquidAmount: 127, liquidType: 4,
    wireRed: true, wireBlue: true, wireGreen: true, wireYellow: true, slope: 3,
    actuator: true, actuated: true, invisibleBlock: true, invisibleWall: true, fullBrightBlock: true, fullBrightWall: true, blockColor: 5 });
  tiles.setTile(11, 10, { blockId: 21, frameX: 18, frameY: 36 });
  tiles.flags[12 * 1200 + 10] = TileFlag.ACTUATOR | TileFlag.WIRE_RED;
  const bytes = new FileSaver().save(world);
  const document = await openWorld(bytes);
  const indices = [10 * 1200 + 10, 11 * 1200 + 10, 12 * 1200 + 10];
  assert.equal(document.paint({ cells: indices, blockId: 30 }).skipped, 1);
  const output = await parse(document.serialize());
  for (const index of [indices[0], indices[2]]) {
    tiles.blockId[index] = 30;
    tiles.flags[index] |= TileFlag.IS_BLOCK_ACTIVE;
  }
  for (const field of TILE_FIELDS) assert.deepEqual(output.worldTiles.tiles[field], tiles[field], field);
  document.undo();
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
});

test('invalid strokes are atomic; a new branch clears redo and preserves export revision identity', async () => {
  const document = await openWorld(await input());
  for (const stroke of [
    null, undefined,
    { cells: [12010, -1], blockId: 0 }, { cells: [12010], blockId: 21 },
    { cells: [NaN], blockId: 1 }, { cells: [], blockId: 1 },
    { cells: Array(MAX_STROKE_TILES + 1).fill(12010), blockId: 0 },
  ]) assert.throws(() => document.paint(stroke), /画笔参数无效/);
  assert.equal(document.editState.revision, 0);
  document.paint({ cells: [12010], blockId: 1 });
  document.serialize();
  assert.equal(document.undo().dirty, true);
  assert.equal(document.redo().dirty, false);
  document.undo();
  document.paint({ cells: [12010], blockId: 30 });
  assert.equal(document.editState.redoCount, 0);
  assert.equal(document.editState.dirty, true);
  assert.equal(document.paint({ cells: [12010], blockId: 30 }).changed, 0);
  assert.equal(document.editState.undoCount, 1);
});

test('baseline mismatch blocks edits, and export corruption cannot be marked exported', async () => {
  const original = await input();
  const normalized = original.slice(0);
  new DataView(normalized).setBigUint64(16, 2n, true);
  const blocked = await openWorld(normalized);
  assert.throws(() => blocked.paint({ cells: [12010], blockId: 0 }), /不能完整保留/);
  assert.equal(blocked.editState.revision, 0);
  const document = await openWorld(original);
  document.paint({ cells: [12010], blockId: 1 });
  const save = FileSaver.prototype.save;
  try {
    FileSaver.prototype.save = function (...args) {
      const output = save.apply(this, args);
      new Uint8Array(output)[output.byteLength - 1] ^= 1;
      return output;
    };
    assert.throws(() => document.serialize(), error => error.code === 'EXPORT_CHANGED');
    assert.equal(document.editState.dirty, true);
  } finally { FileSaver.prototype.save = save; }
  document.undo();
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(original));
});

test('brush interpolation fills sparse pointer samples, clips edges and bounds the draft', () => {
  const world = { width: 4200, height: 1200 };
  const stroke = new BrushStroke(world, 1);
  stroke.add({ x: 10, y: 10 });
  stroke.add({ x: 20, y: 10 });
  assert.deepEqual([...stroke.cells], Array.from({ length: 11 }, (_, i) => (10 + i) * 1200 + 10));
  const edge = new BrushStroke(world, 3);
  edge.add({ x: 0, y: 0 });
  assert.deepEqual([...edge.cells], [0, 1, 1200, 1201]);
  const large = new BrushStroke(world, 9);
  large.add({ x: 0, y: 10 });
  assert.throws(() => large.add({ x: 4199, y: 10 }), /最多修改/);
});

test('history is bounded by steps and changed tiles, including undo followed by a new branch', () => {
  const values = Array(10_000).fill(0);
  const history = new EditHistory({ count: values.length,
    read: index => [values[index]], write: (index, value) => { values[index] = value[0]; },
    paint: (_index, _before, id) => [id], ensureWritable() {},
  });
  for (let i = 0; i < 105; i++) history.paint({ cells: [i], blockId: 1 });
  assert.equal(history.state.undoCount, 100);
  for (let i = 0; i < 100; i++) history.undo();
  assert.equal(values.slice(0, 5).every(value => value === 1), true);
  assert.equal(values.slice(5).every(value => value === 0), true);
  const cells = Array.from({ length: 10_000 }, (_, i) => i);
  for (let i = 0; i < 6; i++) history.paint({ cells, blockId: i % 2 ? 30 : 1 });
  assert.equal(history.state.redoCount, 0);
  assert.equal(history.state.undoCount, 5);
});
