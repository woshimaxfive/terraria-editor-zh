import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';
import { circuitFlags } from '../src/rendering/circuitOverlay.js';
import { rasterizeRegion } from '../src/rendering/worldRaster.js';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { FileReader, FileSaver, TileFlag } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { TILE_FIELDS, createBlockEditing } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const { preservesOtherSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();
async function input(name = 'v1.4.5.5') {
  const data = await readFile(new URL(`${name}.wld`, fixtureRoot));
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

for (const fixture of fixtures) {
  test(`${fixture.name}: all wire masks and actuator edits export only intended flags including real chest wiring`, async () => {
    const bytes = await input(fixture.name), world = await parse(bytes), document = await openWorld(bytes), tiles = world.worldTiles.tiles;
    for (let mask = 0; mask < 16; mask++) {
      const index = tiles.index(10 + mask, 10);
      document.paint({ layer: 'wire', cells: [index], wireMask: mask }); tiles.flags[index] |= mask << 1;
      assert.equal(document.pick({ x: 10 + mask, y: 10, layer: 'wire' }).materialId, mask);
      document.erase({ layer: 'wire', cells: [index], wireMask: 5 }); tiles.flags[index] &= ~(5 << 1);
    }
    const chest = world.chests.chests[0].position, chestIndex = tiles.index(chest.x, chest.y);
    document.paint({ layer: 'wire', cells: [chestIndex], wireMask: 15 }); tiles.flags[chestIndex] |= 30;
    assert.equal(document.pick({ ...chest, layer: 'wire' }).materialId, 15);
    document.paint({ cells: [tiles.index(100, 10)], blockId: 1 }); tiles.blockId[tiles.index(100, 10)] = 1; tiles.flags[tiles.index(100, 10)] |= TileFlag.IS_BLOCK_ACTIVE;
    document.paint({ layer: 'actuator', cells: [tiles.index(100, 10), tiles.index(101, 10)], actuator: true, actuated: true });
    tiles.flags[tiles.index(100, 10)] |= TileFlag.ACTUATOR | TileFlag.ACTUATED;
    assert.equal(document.pick({ x: 100, y: 10, layer: 'actuator' }).properties.actuated, true);
    const filled = document.serialize();
    document.erase({ layer: 'actuator', cells: [tiles.index(100, 10)] }); document.undo();
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(filled));
    document.redo(); tiles.flags[tiles.index(100, 10)] &= ~(TileFlag.ACTUATOR | TileFlag.ACTUATED);
    const selection = { x: 200, y: 10, width: 2, height: 3 };
    assert.equal(document.fillSelection({ layer: 'wire', selection, wireMask: 15 }).changed, 6);
    const wired = document.serialize();
    document.eraseSelection({ layer: 'wire', selection, wireMask: 5 }); document.undo();
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(wired)); document.redo();
    for (let x = 200; x < 202; x++) for (let y = 10; y < 13; y++) tiles.flags[tiles.index(x, y)] |= 10 << 1;
    const output = document.serialize(), actual = (await parse(output)).worldTiles.tiles;
    for (const field of TILE_FIELDS) assert.deepEqual(actual[field], tiles[field], field);
    assert.equal(preservesOtherSections(bytes, output), true);
    assert.deepEqual(new Uint8Array((await openWorld(output)).serialize()), new Uint8Array(output));
  });
}

test('wire add/remove exhaustively preserve unselected wires, furniture frames and rich properties', async () => {
  const world = await parse(await input()), tiles = world.worldTiles.tiles, index = tiles.index(10, 10);
  tiles.setTile(10, 10, { blockId: 21, frameX: 18, frameY: 36, blockColor: 3, wallId: 4, wallColor: 5,
    liquidAmount: 128, liquidType: 4, slope: 3, actuator: true, actuated: true, invisibleBlock: true, fullBrightWall: true });
  const editing = createBlockEditing(world, () => {}), original = TILE_FIELDS.map(field => tiles[field][index]);
  for (let current = 0; current < 16; current++) for (let mask = 0; mask < 16; mask++) for (const erase of [false, true]) {
    tiles.flags[index] = (original[8] & ~30) | (current << 1);
    const before = TILE_FIELDS.map(field => tiles[field][index]);
    editing.paint({ layer: 'wire', cells: [index], wireMask: mask, wireErase: erase });
    const expected = [...before]; expected[8] = (before[8] & ~30) | ((erase ? current & ~mask : current | mask) << 1);
    assert.deepEqual(TILE_FIELDS.map(field => tiles[field][index]), expected);
  }
});

test('actuator combinations affect existing blocks including furniture, preserve data, and ignore air', async () => {
  const world = await parse(await input()), tiles = world.worldTiles.tiles;
  tiles.setTile(10, 10, { blockId: 21, frameX: 18, frameY: 36, wireYellow: true, liquidAmount: 51, liquidType: 2 });
  const bytes = new FileSaver().save(world), document = await openWorld(bytes);
  for (const actuator of [false, true]) for (const actuated of [false, true]) {
    document.fillSelection({ layer: 'actuator', actuator, actuated, selection: { x: 10, y: 10, width: 2, height: 1 } });
    const picked = document.pick({ x: 10, y: 10, layer: 'actuator' });
    assert.equal(picked.properties.actuator, actuator); assert.equal(picked.properties.actuated, actuated);
    tiles.flags[tiles.index(10, 10)] = (tiles.flags[tiles.index(10, 10)] & ~(TileFlag.ACTUATOR | TileFlag.ACTUATED)) |
      (actuator ? TileFlag.ACTUATOR : 0) | (actuated ? TileFlag.ACTUATED : 0);
    const output = document.serialize(), actual = (await parse(output)).worldTiles.tiles;
    for (const field of TILE_FIELDS) assert.deepEqual(actual[field], tiles[field], field);
    assert.equal(preservesOtherSections(bytes, output), true);
  }
});

test('invalid circuit parameters and over-budget edits fail atomically without touching history', async () => {
  const document = await openWorld(await input());
  for (const bad of [
    { layer: 'wire' }, ...[-1, 16, 1.1, null, '1'].map(wireMask => ({ layer: 'wire', wireMask })),
    { layer: 'wire', wireMask: 1, wireErase: 1 }, { layer: 'actuator', actuator: true },
    { layer: 'actuator', actuator: 1, actuated: true }, { layer: 'actuator', actuator: true, actuated: null },
  ]) assert.throws(() => document.paint({ cells: [12010], ...bad }), /画笔参数/);
  assert.throws(() => document.fillSelection({ layer: 'wire', wireMask: 1, selection: { x: 0, y: 0, width: 101, height: 100 } }), /10000/);
  assert.equal(document.editState.revision, 0);
});

test('wire overlays connect by color across region edges, honor switches and never alter base pixels', () => {
  const tile = { wireRed: true, wireBlue: true, actuator: true, actuated: true };
  assert.equal(circuitFlags(tile, [{ wireRed: true }, { wireBlue: true }, {}, {}], { wire: true, actuator: false }), 3 | (1 << 4) | (1 << 9));
  const source = { width: 5, height: 600, surface: 100, rock: 300, readTile: (x, y) => y === 10 && x < 4 ? { wireRed: true, actuator: x === 2 } : {} };
  const region = { x: 1, y: 10, width: 2, height: 1, step: 1 };
  const plain = rasterizeRegion(source, region), wired = rasterizeRegion(source, { ...region, layers: { wire: true, actuator: true } });
  assert.deepEqual(new Uint8Array(plain.buffer), new Uint8Array(wired.buffer));
  const commands = new Int32Array(wired.circuits);
  assert.deepEqual([...commands], [0, 0, 1 | (3 << 4), 1, 0, 1 | (3 << 4) | (1 << 20)]);
  assert.equal(rasterizeRegion(source, { ...region, layers: { wire: false, actuator: false } }).circuits, undefined);
  assert.equal(rasterizeRegion(source, { ...region, step: 2, layers: { wire: true } }).circuits.byteLength, 0);
  assert.throws(() => rasterizeRegion(source, { ...region, layers: { wire: 1 } }));
});
