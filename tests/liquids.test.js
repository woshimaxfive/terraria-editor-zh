import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { LIQUID_AMOUNTS, LIQUIDS, sampledLiquidAmount } from '../src/editing/liquids.js';
import { fixtures, fixtureRoot } from './worldFixtures.js';

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

test('liquid amount presets and sampling match desktop byte thresholds', () => {
  assert.deepEqual(LIQUID_AMOUNTS, [0, 26, 51, 77, 102, 128, 153, 179, 204, 230, 255]);
  for (let amount = 0; amount <= 255; amount++) {
    const sampled = sampledLiquidAmount(amount);
    assert.ok(sampled >= amount);
    assert.equal(LIQUID_AMOUNTS.some(value => value >= amount && value < sampled), false);
  }
});

for (const fixture of fixtures) {
  test(`${fixture.name}: available liquids and every preset preserve all nine arrays and non-tile sections on export`, async () => {
    const bytes = await input(fixture.name), world = await parse(bytes), document = await openWorld(bytes);
    const tiles = world.worldTiles.tiles;
    let x = 10;
    for (const liquid of LIQUIDS.filter(item => fixture.version >= item.minVersion)) {
      for (const amount of LIQUID_AMOUNTS) {
        const index = x * tiles.height + 10;
        const change = document.paint({ layer: 'liquid', cells: [index, index], liquidType: liquid.id, liquidAmount: amount });
        assert.equal(change.changed, amount ? 1 : 0);
        tiles.liquidAmount[index] = amount; tiles.liquidType[index] = amount ? liquid.id : 0;
        const picked = document.pick({ x, y: 10, layer: 'liquid' });
        assert.equal(picked.materialId, amount ? liquid.id : null);
        assert.equal(picked.properties.liquidAmount, amount);
        assert.equal(picked.paintable, Boolean(amount));
        x++;
      }
    }
    const selection = { x: 100, y: 10, width: 3, height: 2 };
    const previousSteps = document.editState.undoCount;
    assert.equal(document.fillSelection({ layer: 'liquid', selection, liquidType: 3, liquidAmount: 128 }).changed, 6);
    assert.equal(document.editState.undoCount, previousSteps + 1);
    const filled = document.serialize();
    assert.equal(document.eraseSelection({ layer: 'liquid', selection }).changed, 6);
    document.undo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(filled));
    document.redo();
    const output = document.serialize(), reloaded = await parse(output);
    for (const field of TILE_FIELDS) assert.deepEqual(reloaded.worldTiles.tiles[field], tiles[field], field);
    assert.equal(preservesOtherSections(bytes, output), true);
    const reopened = await openWorld(output);
    assert.deepEqual(new Uint8Array(reopened.serialize()), new Uint8Array(output));
    if (fixture.version < 269) {
      assert.throws(() => reopened.paint({ layer: 'liquid', cells: [12010], liquidType: 4, liquidAmount: 255 }), /画笔参数/);
      assert.equal(reopened.editState.revision, 0);
    }
  });
}

test('liquids change only amount/type on a rich solid tile; dry edits normalize type and undo restores exact snapshots', async () => {
  const world = await parse(await input()), tiles = world.worldTiles.tiles;
  tiles.setTile(10, 10, { blockId: 1, blockColor: 5, slope: 3, actuator: true, actuated: true,
    wallId: 4, wallColor: 7, invisibleBlock: true, invisibleWall: true, fullBrightBlock: true, fullBrightWall: true,
    wireRed: true, wireBlue: true, wireGreen: true, wireYellow: true, liquidAmount: 37, liquidType: 4 });
  const bytes = new FileSaver().save(world), document = await openWorld(bytes), index = tiles.index(10, 10);
  assert.equal(document.paint({ layer: 'liquid', cells: [index], liquidType: 2, liquidAmount: 51 }).changed, 1);
  tiles.liquidAmount[index] = 51; tiles.liquidType[index] = 2;
  let output = document.serialize(), actual = await parse(output);
  for (const field of TILE_FIELDS) assert.deepEqual(actual.worldTiles.tiles[field], tiles[field], field);
  assert.equal(preservesOtherSections(bytes, output), true);
  document.undo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
  document.redo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(output));
  assert.equal(document.paint({ layer: 'liquid', cells: [index], liquidType: 3, liquidAmount: 0 }).changed, 1);
  assert.equal(document.pick({ x: 10, y: 10, layer: 'liquid' }).properties.liquidType, 0);
  assert.equal(document.erase({ layer: 'liquid', cells: [index] }).changed, 0);
  document.undo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(output));
  document.erase({ layer: 'liquid', cells: [index] });
  actual = await parse(document.serialize()); tiles.liquidAmount[index] = tiles.liquidType[index] = 0;
  for (const field of TILE_FIELDS) assert.deepEqual(actual.worldTiles.tiles[field], tiles[field], field);
});

test('liquid edits reject bad types, amounts, indices and excessive areas without writing or losing redo', async () => {
  const document = await openWorld(await input());
  document.paint({ layer: 'liquid', cells: [12010], liquidType: 1, liquidAmount: 255 }); document.undo();
  const state = document.editState;
  for (const options of [
    {}, { liquidType: 0, liquidAmount: 10 }, { liquidType: 5, liquidAmount: 255 },
    { liquidType: '1', liquidAmount: 255 }, { liquidType: 1, liquidAmount: '255' },
    ...[-1, 256, NaN, 1.5, null].map(liquidAmount => ({ liquidType: 1, liquidAmount })),
    { liquidType: 1, liquidAmount: 255, cells: [-1] },
    { liquidType: 1, liquidAmount: 255, cells: Array(10001).fill(12010) },
  ]) assert.throws(() => document.paint({ layer: 'liquid', cells: [12010], ...options }), /画笔参数/);
  assert.throws(() => document.fillSelection({ layer: 'liquid', liquidType: 1, liquidAmount: 255, selection: { x: 10, y: 10, width: 101, height: 100 } }), /10000/);
  assert.deepEqual(document.editState, state);
});

test('liquid edits protect furniture and entities and reject unwritable worlds before mutation', async () => {
  const world = await parse(await input()), tiles = world.worldTiles.tiles;
  tiles.setTile(10, 10, { blockId: 21, frameX: 18, frameY: 36, liquidAmount: 128, liquidType: 1 });
  const chest = world.chests.chests[0].position;
  const editing = createBlockEditing(world, () => {});
  const cells = [tiles.index(10, 10), tiles.index(chest.x, chest.y), tiles.index(chest.x + 1, chest.y + 1)];
  const snapshots = cells.map(index => TILE_FIELDS.map(field => tiles[field][index]));
  const change = editing.paint({ layer: 'liquid', cells, liquidType: 2, liquidAmount: 255 });
  assert.equal(change.changed, 0); assert.equal(change.skipped, 3);
  assert.deepEqual(cells.map(index => TILE_FIELDS.map(field => tiles[field][index])), snapshots);
  const readonly = createBlockEditing(world, () => { throw new Error('read-only'); });
  assert.throws(() => readonly.paint({ layer: 'liquid', cells: [tiles.index(20, 10)], liquidType: 1, liquidAmount: 255 }), /read-only/);
  assert.equal(tiles.liquidAmount[tiles.index(20, 10)], 0); assert.equal(readonly.state.revision, 0);
});
