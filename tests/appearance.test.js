import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';
import { PAINTS, SHAPES, supportsSlope, validAppearance } from '../src/editing/appearance.js';
import { appearanceColor, drawShapes, SHAPE_POINTS } from '../src/rendering/appearance.js';
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
const appearance = (target, color) => ({ target, mode: 'color', color });

for (const fixture of fixtures) {
  test(`${fixture.name}: all six shapes and 32 paints export only intended fields and preserve every other section`, async () => {
    const bytes = await input(fixture.name), world = await parse(bytes), document = await openWorld(bytes), tiles = world.worldTiles.tiles;
    for (let x = 100; x < 132; x++) {
      const index = tiles.index(x, 10);
      document.paint({ cells: [index], blockId: 1 }); tiles.blockId[index] = 1; tiles.flags[index] |= TileFlag.IS_BLOCK_ACTIVE;
      document.paint({ layer: 'wall', cells: [index], wallId: 4 }); tiles.wallId[index] = 4;
      const color = x - 100;
      for (const target of ['block', 'wall']) {
        document.paint({ layer: 'paint', cells: [index], appearance: appearance(target, color) });
        const modernBright = color === 31 && document.summary.formatVersion >= 269;
        tiles[target === 'wall' ? 'wallColor' : 'blockColor'][index] = modernBright ? 0 : color;
        if (modernBright) tiles.flags[index] |= target === 'wall' ? TileFlag.FULL_BRIGHT_WALL : TileFlag.FULL_BRIGHT_BLOCK;
        assert.equal(document.pick({ x, y: 10, layer: 'paint', target, mode: 'color' }).materialId, modernBright ? 0 : color);
      }
      const slope = color % 6;
      document.paint({ layer: 'slope', cells: [index], slope });
      tiles.flags[index] = (tiles.flags[index] & ~TileFlag.SLOPE_MASK) | (slope << TileFlag.SLOPE_SHIFT);
      assert.equal(document.pick({ x, y: 10, layer: 'slope' }).materialId, slope);
    }
    const beforeErase = document.serialize(), selection = { x: 100, y: 10, width: 32, height: 1 };
    document.eraseSelection({ layer: 'slope', selection }); document.undo();
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(beforeErase)); document.redo();
    for (let x = 100; x < 132; x++) tiles.flags[tiles.index(x, 10)] &= ~TileFlag.SLOPE_MASK;
    document.eraseSelection({ layer: 'paint', selection, appearance: appearance('wall', 1) });
    for (let x = 100; x < 132; x++) tiles.wallColor[tiles.index(x, 10)] = 0;
    const output = document.serialize(), actual = (await parse(output)).worldTiles.tiles;
    for (const field of TILE_FIELDS) assert.deepEqual(actual[field], tiles[field], field);
    assert.equal(preservesOtherSections(bytes, output), true);
    assert.deepEqual(new Uint8Array((await openWorld(output)).serialize()), new Uint8Array(output));
  });
}

test('appearance on real chests preserves furniture frames, inventory and all non-target properties', async () => {
  const bytes = await input(), world = await parse(bytes), document = await openWorld(bytes), tiles = world.worldTiles.tiles;
  const { x, y } = world.chests.chests[0].position, index = tiles.index(x, y);
  for (const target of ['block', 'wall']) {
    const before = document.serialize();
    document.paint({ layer: 'paint', cells: [index], appearance: appearance(target, 3) });
    tiles[target === 'wall' ? 'wallColor' : 'blockColor'][index] = target === 'wall' && !tiles.wallId[index] ? 0 : 3;
    const output = document.serialize(), actual = (await parse(output)).worldTiles.tiles;
    for (const field of TILE_FIELDS) assert.deepEqual(actual[field], tiles[field], field);
    assert.equal(preservesOtherSections(bytes, output), true);
    document.undo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(before)); document.redo();
  }
  assert.equal(document.paint({ layer: 'slope', cells: [index], slope: 1 }).skipped, 1);
});

test('slope eligibility includes framed platforms and excludes non-solid furniture without changing any other fields', async () => {
  const world = await parse(await input()), tiles = world.worldTiles.tiles;
  for (const [x, blockId] of [[10, 19], [11, 21], [12, 1]]) tiles.setTile(x, 10, { blockId, frameX: 18, frameY: 36,
    blockColor: 3, wallId: 4, wallColor: 5, liquidAmount: 128, liquidType: 4,
    actuator: true, actuated: true, wireRed: true, invisibleBlock: true, fullBrightWall: true });
  const editing = createBlockEditing(world, () => {});
  assert.equal(supportsSlope(19), true); assert.equal(supportsSlope(21), false);
  for (let x = 10; x <= 13; x++) {
    const index = tiles.index(x, 10), before = TILE_FIELDS.map(field => tiles[field][index]);
    const supported = x === 10 || x === 12;
    for (let slope = 0; slope < 6; slope++) {
      editing.paint({ layer: 'slope', cells: [index], slope });
      const expected = [...before];
      if (supported) expected[8] = (before[8] & ~TileFlag.SLOPE_MASK) | (slope << TileFlag.SLOPE_SHIFT);
      assert.deepEqual(TILE_FIELDS.map(field => tiles[field][index]), expected);
    }
  }
});

test('all coating combinations preserve colors and other flags; erase clears only the selected target coatings', async () => {
  const world = await parse(await input()), tiles = world.worldTiles.tiles;
  tiles.setTile(10, 10, { blockId: 21, frameX: 18, frameY: 36, wallId: 4, blockColor: 2, wallColor: 6, slope: 3,
    wireBlue: true, actuator: true, actuated: true, liquidAmount: 102, liquidType: 2 });
  const bytes = new FileSaver().save(world), document = await openWorld(bytes), index = tiles.index(10, 10);
  for (const target of ['block', 'wall']) for (const invisible of [false, true]) for (const fullBright of [false, true]) {
    const value = { target, mode: 'coating', invisible, fullBright };
    document.paint({ layer: 'paint', cells: [index, tiles.index(11, 10)], appearance: value });
    const masks = target === 'block' ? [TileFlag.INVISIBLE_BLOCK, TileFlag.FULL_BRIGHT_BLOCK] : [TileFlag.INVISIBLE_WALL, TileFlag.FULL_BRIGHT_WALL];
    tiles.flags[index] = (tiles.flags[index] & ~(masks[0] | masks[1])) | (invisible ? masks[0] : 0) | (fullBright ? masks[1] : 0);
    const picked = document.pick({ x: 10, y: 10, layer: 'paint', target, mode: 'coating' }).appearance;
    assert.equal(picked.invisible, invisible); assert.equal(picked.fullBright, fullBright);
    const output = document.serialize(), actual = (await parse(output)).worldTiles.tiles;
    for (const field of TILE_FIELDS) assert.deepEqual(actual[field], tiles[field], field);
    const erased = document.erase({ layer: 'paint', cells: [index], appearance: value });
    if (erased.changed) document.undo();
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(output));
  }
});

test('invalid appearance parameters, old coatings and excessive regions fail atomically before reads or writes', async () => {
  const bytes = await input('v1.4.3.6'), document = await openWorld(bytes);
  for (const stroke of [
    ...[-1, 6, '1', null, 1.1].map(slope => ({ layer: 'slope', slope })),
    ...[-1, 32, null, '1'].map(color => ({ layer: 'paint', appearance: appearance('block', color) })),
    { layer: 'paint', appearance: appearance('wire', 1) },
    { layer: 'paint', appearance: { target: 'block', mode: 'coating', invisible: true, fullBright: false } },
    { layer: 'paint', appearance: { target: 'wall', mode: 'unknown', color: 1 } },
  ]) assert.throws(() => document.paint({ cells: [12010], ...stroke }), /画笔参数/);
  assert.throws(() => document.fillSelection({ layer: 'slope', slope: 1, selection: { x: 0, y: 0, width: 101, height: 100 } }), /10000/);
  assert.throws(() => document.pick({ x: 10, y: 10, layer: 'paint' }), /外观参数/);
  assert.equal(document.editState.revision, 0);
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
  for (const version of [268, 269]) assert.equal(validAppearance('paint', { target: 'block', mode: 'coating', invisible: false, fullBright: true }, version), version >= 269);
});

test('format 268/269 boundary retains legacy paint or modern coating after a real serialized export', async () => {
  for (const version of [268, 269]) {
    const world = await parse(await input()); world.fileFormatHeader.version = version;
    const tiles = world.worldTiles.tiles, index = tiles.index(10, 10);
    tiles.setTile(10, 10, { blockId: 1, wallId: 4 });
    const bytes = new FileSaver().save(world), document = await openWorld(bytes);
    for (const target of ['block', 'wall']) document.paint({ layer: 'paint', cells: [index], appearance: appearance(target, 31) });
    const output = document.serialize(), actual = (await parse(output)).worldTiles.tiles.getTile(10, 10);
    assert.equal(actual.blockColor ?? 0, version < 269 ? 31 : 0);
    assert.equal(actual.wallColor ?? 0, version < 269 ? 31 : 0);
    assert.equal(Boolean(actual.fullBrightBlock), version >= 269);
    assert.equal(Boolean(actual.fullBrightWall), version >= 269);
    assert.equal(preservesOtherSections(bytes, output), true);
    if (version < 269) assert.throws(() => document.paint({ layer: 'paint', cells: [index], appearance: { target: 'wall', mode: 'coating', invisible: true, fullBright: true } }), /画笔参数/);
  }
});

test('empty targets never gain paint/coatings and malformed modern coating values leave the original export intact', async () => {
  const bytes = await input(), document = await openWorld(bytes), cells = [12010];
  for (const target of ['block', 'wall']) {
    assert.equal(document.paint({ layer: 'paint', cells, appearance: appearance(target, 31) }).changed, 0);
    assert.equal(document.paint({ layer: 'paint', cells, appearance: { target, mode: 'coating', invisible: true, fullBright: true } }).changed, 0);
    for (const bad of [null, 1, 'true']) assert.throws(() => document.paint({ layer: 'paint', cells,
      appearance: { target, mode: 'coating', invisible: bad, fullBright: true } }), /画笔参数/);
  }
  assert.equal(document.editState.revision, 0);
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
});

test('unknown stored paint and slope values remain readable but cannot enter supported picker state', async () => {
  const world = await parse(await input());
  world.worldTiles.tiles.setTile(10, 10, { blockId: 1, wallId: 4, blockColor: 255, wallColor: 254, slope: 7 });
  const bytes = new FileSaver().save(world), document = await openWorld(bytes);
  assert.equal(document.pick({ x: 10, y: 10, layer: 'slope' }).paintable, false);
  for (const target of ['block', 'wall']) assert.equal(document.pick({ x: 10, y: 10, layer: 'paint', target, mode: 'color' }).paintable, false);
  assert.equal(document.editState.revision, 0);
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
});

test('paint/coating colors follow desktop overview and simplified slope commands preserve shape direction and backgrounds', () => {
  assert.equal(SHAPES.length, 6); assert.equal(PAINTS.length, 32);
  assert.deepEqual(appearanceColor([128, 128, 128]), [105, 105, 105]);
  assert.deepEqual(appearanceColor([128, 128, 128], 0, true), [84, 84, 84]);
  assert.deepEqual(appearanceColor([128, 128, 128], 0, true, true), [128, 128, 128]);
  assert.deepEqual(appearanceColor([128, 128, 128], 1), [233, 22, 22]);
  assert.deepEqual(appearanceColor([128, 128, 128], 30), [52, 52, 52]);
  const source = { width: 6, height: 1, background: [13, 21, 17], readTile: x => ({ blockId: 1, slope: x, blockColor: 1 }) };
  const region = { x: 0, y: 0, width: 6, height: 1, step: 1, detailShapes: true };
  const image = rasterizeRegion(source, region), commands = new Int32Array(image.shapes);
  assert.equal(commands.length, 30);
  for (let i = 1; i < 6; i++) {
    assert.deepEqual([...commands.slice((i - 1) * 6, i * 6)], [i, 0, i, 233, 22, 22]);
    assert.deepEqual([...new Uint8Array(image.buffer).slice(i * 4, i * 4 + 4)], [13, 21, 17, 255]);
  }
  const vertices = [], context = { save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {},
    moveTo(x, y) { vertices.push([x, y]); }, lineTo(x, y) { vertices.push([x, y]); } };
  drawShapes(context, new Int32Array([0, 0, 2, 233, 22, 22]), 0, 0, 16);
  assert.deepEqual(vertices, [[0, 0], [16, 16], [0, 16]]);
  assert.deepEqual(SHAPE_POINTS[3], [[1, 0], [1, 1], [0, 1]]);
  assert.deepEqual(SHAPE_POINTS[4], [[0, 0], [1, 0], [0, 1]]);
  assert.deepEqual(SHAPE_POINTS[5], [[0, 0], [1, 0], [1, 1]]);
  assert.equal(rasterizeRegion(source, { ...region, layers: { block: false } }).shapes, undefined);
  assert.equal(rasterizeRegion(source, { ...region, step: 2 }).shapes, undefined);
  assert.equal(rasterizeRegion(source, { ...region, detailShapes: false }).shapes, undefined);
});
