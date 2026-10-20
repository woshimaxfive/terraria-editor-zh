import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { MATERIALS, WALL_MATERIALS, materialsFor, searchMaterials } from '../src/editing/materials.js';
import { fixtures, fixtureRoot } from './worldFixtures.js';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { FileReader, FileSaver, TileFlag } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { TILE_FIELDS, createBlockEditing } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const { preservesOtherSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();
async function input(name = 'v1.4.5.5') {
  const bytes = await readFile(new URL(`${name}.wld`, fixtureRoot));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

test('curated material catalogue supports Chinese, English, ID and category search without changing IDs', () => {
  assert.equal(MATERIALS.length, 139);
  assert.equal(WALL_MATERIALS.length, 50);
  for (const list of [MATERIALS, WALL_MATERIALS]) {
    assert.equal(new Set(list.map(item => item.id)).size, list.length);
    for (const item of list) assert.ok(/[\p{Script=Han}]/u.test(item.name));
  }
  assert.deepEqual(searchMaterials(MATERIALS, '泥土').map(item => item.id), [0]);
  assert.deepEqual(searchMaterials(MATERIALS, '  stone slab ').map(item => item.id), [273, 274]);
  assert.deepEqual(searchMaterials(MATERIALS, '石块').map(item => item.id), [1, 25, 117, 203, 250, 315, 357, 367]);
  assert.deepEqual(searchMaterials(MATERIALS, '木', '木材').map(item => item.id), [30, 157, 158, 159, 208, 253, 311, 321, 322]);
  assert.deepEqual(searchMaterials(WALL_MATERIALS, '21').map(item => item.id), [21]);
  assert.deepEqual(searchMaterials(WALL_MATERIALS, 'no-such-material'), []);
  assert.equal(materialsFor('block', 193).length, 0);
  assert.equal(materialsFor('wall', 194).length, 50);
  assert.equal(MATERIALS.some(item => [2, 19, 21, 314, 635].includes(item.id)), false);
  assert.equal(WALL_MATERIALS.some(item => [0, 2, 3, 7, 86].includes(item.id)), false);
});

for (const fixture of fixtures) {
  test(`${fixture.name}: all catalogue walls, layer picking, selection fill and erase survive actual export`, async () => {
    const bytes = await input(fixture.name), world = await parse(bytes), document = await openWorld(bytes);
    const tiles = world.worldTiles.tiles;
    for (const item of MATERIALS) {
      assert.ok(item.id < world.fileFormatHeader.importants.length, `${item.id} in format header`);
      assert.equal(world.fileFormatHeader.importants[item.id], false, `${item.id} must be ordinary`);
    }
    for (const material of WALL_MATERIALS) {
      const y = 20 + material.id, index = 20 * 1200 + y;
      assert.equal(document.paint({ layer: 'wall', cells: [index], wallId: material.id }).changed, 1);
      const sample = document.pick({ x: 20, y, layer: 'wall' });
      assert.equal(sample.materialId, material.id);
      assert.equal(sample.name, material.name);
      assert.equal(sample.paintable, true);
      tiles.wallId[index] = material.id;
    }
    const selection = { x: 10, y: 10, width: 3, height: 2 };
    assert.equal(document.fillSelection({ layer: 'wall', selection, wallId: 21 }).changed, 6);
    const filled = document.serialize();
    assert.equal(document.eraseSelection({ layer: 'wall', selection }).changed, 6);
    document.undo();
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(filled));
    document.redo();
    const output = document.serialize(), reloaded = await parse(output);
    for (const field of TILE_FIELDS) assert.deepEqual(reloaded.worldTiles.tiles[field], tiles[field], field);
    assert.equal(preservesOtherSections(bytes, output), true);
    const reopened = await openWorld(output);
    assert.deepEqual(new Uint8Array(reopened.serialize()), new Uint8Array(output));
    for (const layers of [{ block: false }, { wall: false }, { block: false, wall: false, liquid: false }]) {
      reopened.render({ x: 10, y: 10, width: 12, height: 100, step: 1, layers });
    }
    assert.equal(reopened.editState.undoCount, 0);
    assert.deepEqual(new Uint8Array(reopened.serialize()), new Uint8Array(output));
  });
}

test('wall edits preserve blocks, frames, slopes, liquids and wires; erasing clears only wall data', async () => {
  const world = await parse(await input()), tiles = world.worldTiles.tiles;
  const rich = { blockId: 1, blockColor: 5, slope: 3, actuator: true, actuated: true,
    invisibleBlock: true, fullBrightBlock: true, wallId: 4, wallColor: 7,
    invisibleWall: true, fullBrightWall: true, liquidAmount: 127, liquidType: 4,
    wireRed: true, wireBlue: true, wireGreen: true, wireYellow: true };
  tiles.setTile(10, 10, rich);
  tiles.setTile(20, 10, { blockId: 21, frameX: 18, frameY: 36, wallId: 4 });
  tiles.setTile(21, 11, { blockId: 1, wallId: 4 });
  const bytes = new FileSaver().save(world), document = await openWorld(bytes), index = 12010;
  const picked = document.pick({ x: 10, y: 10, layer: 'wall' });
  assert.deepEqual(picked.properties, { blockColor: 5, wallColor: 7, slope: 3, actuator: true, actuated: true,
    invisibleBlock: true, fullBrightBlock: true, invisibleWall: true, fullBrightWall: true,
    liquidAmount: 127, liquidType: 4, wires: ['Red', 'Blue', 'Green', 'Yellow'] });
  assert.equal(picked.blockId, 1);
  assert.equal(picked.materialId, 4);
  assert.equal(document.paint({ layer: 'wall', cells: [index, 24010], wallId: 21 }).skipped, 1);
  tiles.wallId[index] = 21;
  let reloaded = await parse(document.serialize());
  for (const field of TILE_FIELDS) assert.deepEqual(reloaded.worldTiles.tiles[field], tiles[field], field);
  const painted = document.serialize();
  assert.equal(document.erase({ layer: 'wall', cells: [index, 24010, 25211] }).skipped, 2);
  tiles.wallId[index] = tiles.wallColor[index] = 0;
  tiles.flags[index] &= ~(TileFlag.INVISIBLE_WALL | TileFlag.FULL_BRIGHT_WALL);
  const output = document.serialize();
  reloaded = await parse(output);
  for (const field of TILE_FIELDS) assert.deepEqual(reloaded.worldTiles.tiles[field], tiles[field], field);
  assert.equal(preservesOtherSections(bytes, output), true);
  document.undo();
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(painted));
  document.undo();
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
});

test('bad layers and unsupported IDs are rejected atomically, including format-header drift', async () => {
  const bytes = await input(), document = await openWorld(bytes);
  for (const stroke of [
    { layer: 'liquid', blockId: 1 }, { layer: null, blockId: 1 },
    { layer: 'wall', wallId: 0 }, { layer: 'wall', wallId: 9999 },
    { layer: 'wall', blockId: 1 }, { layer: 'wall', wallId: '4' },
    { layer: 'block', blockId: 635 },
  ]) {
    assert.throws(() => document.paint({ cells: [12010], ...stroke }), /画笔参数/);
  }
  assert.throws(() => document.erase({ cells: [12010], layer: 'walls' }), /画笔参数/);
  assert.throws(() => document.pick({ x: 10, y: 10, layer: null }), /图层无效/);
  assert.equal(document.editState.revision, 0);
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
  const world = await parse(bytes);
  world.fileFormatHeader.importants[1] = true;
  const editing = createBlockEditing(world, () => assert.fail('must not write'));
  assert.throws(() => editing.paint({ cells: [12010], blockId: 1 }), /普通方块/);
  world.fileFormatHeader.importants.length = 1;
  assert.throws(() => editing.paint({ cells: [12010], blockId: 1 }), /普通方块/);
  assert.equal(editing.state.revision, 0);
});
