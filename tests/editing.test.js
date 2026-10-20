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
const blockSample = ({ x, y, blockId, name, paintable, special }) => ({ x, y, blockId, name, paintable, special });

for (const fixture of fixtures) {
  test(`${fixture.name}: paint, pick, erase, undo, redo and reopen preserve all other fields and sections`, async () => {
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
    for (const [offset, material] of MATERIALS.entries()) {
      const x = 20 + offset, y = 10, cell = x * 1200 + y;
      assert.equal(original.worldTiles.tiles.hasBlock(cell), false);
      assert.equal(document.paint({ cells: [cell], blockId: material.id }).changed, 1, `material ${material.id}`);
      assert.deepEqual(blockSample(document.pick({ x, y })), {
        x, y, blockId: material.id, name: material.name, paintable: true, special: false,
      });
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
    const chest = original.chests.chests[0].position;
    const chestCells = [];
    for (let cx = chest.x; cx <= chest.x + 1; cx++) {
      for (let cy = chest.y; cy <= chest.y + 2; cy++) chestCells.push(cx * 1200 + cy);
    }
    assert.equal(document.erase({ cells: chestCells }).changed, 0, 'real chest and its support must remain untouched');
    assert.equal(document.editState.dirty, false);
    assert.equal(document.erase({ cells: [index, index + 1] }).changed, 2);
    const erased = await parse(document.serialize());
    for (const i of [index, index + 1]) expected.flags[i] &= ~TileFlag.IS_BLOCK_ACTIVE;
    for (const field of TILE_FIELDS) assert.deepEqual(erased.worldTiles.tiles[field], expected[field], field);
    document.undo();
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(output));
    assert.equal(document.redo().changed, 2);
  });

  test(`${fixture.name}: area fill and erase are single undo steps and export only selected cells`, async () => {
    const bytes = await input(fixture.name), world = await parse(bytes), document = await openWorld(bytes);
    const selection = { x: 10, y: 10, width: 4, height: 3 };
    assert.equal(document.fillSelection({ selection, blockId: 54 }).changed, 12);
    assert.equal(document.editState.undoCount, 1);
    const filled = document.serialize();
    assert.equal(document.eraseSelection({ selection: { x: 11, y: 11, width: 2, height: 1 } }).changed, 2);
    assert.equal(document.editState.undoCount, 2);
    const output = document.serialize(), reloaded = await parse(output), expected = world.worldTiles.tiles;
    for (let x = 10; x < 14; x++) for (let y = 10; y < 13; y++) {
      if (y === 11 && (x === 11 || x === 12)) continue;
      const index = x * 1200 + y;
      expected.blockId[index] = 54;
      expected.flags[index] |= TileFlag.IS_BLOCK_ACTIVE;
    }
    for (const field of TILE_FIELDS) assert.deepEqual(reloaded.worldTiles.tiles[field], expected[field], field);
    assert.equal(preservesOtherSections(bytes, output), true);
    document.undo();
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(filled));
    document.undo();
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
    assert.equal(document.redo().changed, 12);
    assert.equal(document.redo().changed, 2);
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(output));
    const { x, y } = world.chests.chests[0].position;
    assert.equal(document.eraseSelection({ selection: { x, y, width: 2, height: 3 } }).changed, 0);
    assert.equal(document.fillSelection({ selection: { x, y, width: 2, height: 2 }, blockId: 1 }).changed, 0);
    assert.equal(document.editState.dirty, false);
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

test('erase clears block-only data, preserves every other field and protects special tile supports', async () => {
  const world = await parse(await input());
  const tiles = world.worldTiles.tiles;
  tiles.setTile(10, 10, { blockId: 1, blockColor: 5, slope: 3, actuator: true, actuated: true,
    invisibleBlock: true, fullBrightBlock: true, wallId: 300, wallColor: 7,
    invisibleWall: true, fullBrightWall: true, liquidAmount: 127, liquidType: 4,
    wireRed: true, wireBlue: true, wireGreen: true, wireYellow: true });
  tiles.setTile(20, 10, { blockId: 21, frameX: 18, frameY: 36 });
  for (const x of [20, 21, 22]) tiles.setTile(x, 11, { blockId: 1 });
  const empty = 12 * 1200 + 10;
  tiles.flags[empty] = TileFlag.ACTUATOR | TileFlag.WIRE_RED;
  const bytes = new FileSaver().save(world);
  const document = await openWorld(bytes);
  const state = document.erase({ cells: [12010, 24010, 24011, 25211, 26411, empty] });
  assert.equal(state.changed, 2);
  assert.equal(state.skipped, 3);
  const output = document.serialize();
  assert.equal(preservesOtherSections(bytes, output), true);
  const reloaded = await parse(output);
  tiles.setTile(10, 10, { wallId: 300, wallColor: 7, invisibleWall: true, fullBrightWall: true,
    liquidAmount: 127, liquidType: 4, wireRed: true, wireBlue: true, wireGreen: true, wireYellow: true });
  tiles.setTile(22, 11, {});
  for (const field of TILE_FIELDS) assert.deepEqual(reloaded.worldTiles.tiles[field], tiles[field], field);
  document.undo();
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
  document.redo();
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(output));
});

test('picking empty, unsupported and special blocks never changes history or normalizes the file', async () => {
  const world = await parse(await input());
  world.worldTiles.tiles.setTile(10, 10, { blockId: 2 });
  world.worldTiles.tiles.setTile(11, 10, { blockId: 21, frameX: 18 });
  const bytes = new FileSaver().save(world);
  new DataView(bytes).setBigUint64(16, 2n, true);
  const document = await openWorld(bytes);
  assert.deepEqual(blockSample(document.pick({ x: 10, y: 10 })), { x: 10, y: 10, blockId: 2, name: '方块 ID 2', paintable: false, special: false });
  assert.equal(document.pick({ x: 11, y: 10 }).special, true);
  assert.equal(document.pick({ x: 12, y: 10 }).blockId, null);
  for (const point of [null, {}, { x: -1, y: 10 }, { x: 4200, y: 10 }, { x: 10, y: 1200 }, { x: 1.5, y: 10 }, { x: NaN, y: 10 }]) {
    assert.throws(() => document.pick(point), /地图范围/);
  }
  assert.deepEqual(document.editState, { revision: 0, dirty: false, undoCount: 0, redoCount: 0 });
  assert.throws(() => document.serialize(), error => error.code === 'EXPORT_CHANGED');
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

test('invalid and oversized areas leave tiles, history and exported revision unchanged', async () => {
  const bytes = await input(), document = await openWorld(bytes);
  for (const payload of [null, undefined]) {
    assert.throws(() => document.fillSelection(payload), /选区范围/);
    assert.throws(() => document.eraseSelection(payload), /选区范围/);
  }
  for (const selection of [undefined, { x: -1, y: 10, width: 2, height: 2 },
    { x: 4199, y: 1199, width: 2, height: 1 }, { x: 10, y: 10, width: 101, height: 100 }]) {
    assert.throws(() => document.fillSelection({ selection, blockId: 1 }), /选区范围|10000/);
    assert.throws(() => document.eraseSelection({ selection }), /选区范围|10000/);
  }
  assert.throws(() => document.fillSelection({ selection: { x: 10, y: 10, width: 2, height: 2 }, blockId: 21 }), /画笔参数/);
  assert.deepEqual(document.editState, { revision: 0, dirty: false, undoCount: 0, redoCount: 0 });
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
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
