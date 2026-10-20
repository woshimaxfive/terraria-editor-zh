import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { validateClipboard, pasteFits, transformClipboard } from '../src/editing/clipboard.js';
import { decodeTemplate, encodeTemplate } from '../src/editing/template.js';
import { fixtures, fixtureRoot } from './worldFixtures.js';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { FileReader, FileSaver, TileFlag } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { TILE_FIELDS } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const { preservesOtherSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();
async function input(name = 'v1.4.5.5') {
  const bytes = await readFile(new URL(`${name}.wld`, fixtureRoot));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
const equalBytes = (a, b) => assert.deepEqual(new Uint8Array(a), new Uint8Array(b));

for (const fixture of fixtures) {
  test(`${fixture.name}: transformed template preparation is read-only and paste round-trips every field`, async () => {
    const world = await parse(await input(fixture.name)), tiles = world.worldTiles.tiles;
    const slopes = [0, 2, 3, 4, 5, 0];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 2; y++) tiles.setTile(10 + x, 10 + y, {
      blockId: 1, wallId: 4, blockColor: x + 1, wallColor: y + 1, slope: slopes[x * 2 + y],
      liquidAmount: 100 + x, liquidType: 1, wireRed: true, wireGreen: true, actuator: true,
    });
    const bytes = new FileSaver().save(world), document = await openWorld(bytes);
    const { clipboard } = document.copy({ selection: { x: 10, y: 10, width: 3, height: 2 } });
    const prepared = document.prepareClipboard(decodeTemplate(encodeTemplate(transformClipboard(clipboard, 'clockwise'))));
    assert.equal(prepared.image.imageWidth, 2); assert.equal(prepared.image.imageHeight, 3);
    equalBytes(document.serialize(), bytes); assert.equal(document.editState.undoCount, 0);
    document.paste({ clipboard: prepared.clipboard, position: { x: 30, y: 10 } });
    // Independent clockwise coordinate and expected file slope values.
    const expectedSlopes = [0, 4, 2, 5, 3, 0];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 2; y++) {
      const from = (10 + x) * 1200 + 10 + y, to = (31 - y) * 1200 + 10 + x;
      for (const field of TILE_FIELDS) tiles[field][to] = field === 'flags' ?
        (tiles.flags[from] & ~TileFlag.SLOPE_MASK) | expectedSlopes[x * 2 + y] << TileFlag.SLOPE_SHIFT : tiles[field][from];
    }
    const output = document.serialize(), reloaded = await parse(output);
    for (const field of TILE_FIELDS) assert.deepEqual(reloaded.worldTiles.tiles[field], tiles[field], field);
    assert.equal(preservesOtherSections(bytes, output), true);
    document.undo(); equalBytes(document.serialize(), bytes);
    document.redo(); equalBytes(document.serialize(), output);
    const hostile = structuredClone(clipboard); hostile.tiles[5][0] = 21;
    assert.throws(() => document.prepareClipboard(hostile), /特殊/);
    equalBytes(document.serialize(), output);
    const wrongVersion = { ...clipboard, formatVersion: fixture.name === 'v1.3.5.3' ? 326 : 194 };
    assert.throws(() => document.prepareClipboard(wrongVersion), /跨版本/);
  });
}

for (const fixture of fixtures) {
  test(`${fixture.name}: immutable copy, overlapping paste, air replacement and undo preserve all nine fields`, async () => {
    const world = await parse(await input(fixture.name)), tiles = world.worldTiles.tiles;
    tiles.setTile(10, 10, { blockId: 0, blockColor: 5, slope: 3, actuator: true, actuated: true,
      wallId: 4, wallColor: 7, liquidAmount: 127, liquidType: 1,
      wireRed: true, wireBlue: true, wireGreen: true, wireYellow: true });
    tiles.setTile(10, 11, {});
    tiles.setTile(11, 10, { blockId: 30, wallId: 5 });
    tiles.setTile(11, 11, { liquidAmount: 255, liquidType: 2, wireYellow: true });
    const bytes = new FileSaver().save(world), document = await openWorld(bytes);
    const { clipboard, image } = document.copy({ selection: { x: 10, y: 10, width: 2, height: 2 } });
    const retained = structuredClone(clipboard);
    assert.equal(image.buffer.byteLength, 16);
    assert.equal(clipboard.tiles[0][0], 0, 'active dirt ID zero remains a block');
    equalBytes(document.serialize(), bytes);
    assert.equal(document.editState.undoCount, 0);
    document.paint({ cells: [12010], blockId: 54 });
    const sourceEdited = document.serialize();
    tiles.blockId[12010] = 54;
    assert.deepEqual(clipboard, retained, 'changing source after copy cannot change the snapshot');
    assert.equal(document.paste({ clipboard, position: { x: 11, y: 10 } }).changed, 4);
    assert.equal(document.editState.undoCount, 2);
    for (let offset = 0; offset < 4; offset++) {
      const index = (11 + Math.floor(offset / 2)) * 1200 + 10 + offset % 2;
      TILE_FIELDS.forEach((field, i) => { tiles[field][index] = retained.tiles[offset][i]; });
    }
    const output = document.serialize(), reloaded = await parse(output);
    for (const field of TILE_FIELDS) assert.deepEqual(reloaded.worldTiles.tiles[field], tiles[field], field);
    assert.equal(preservesOtherSections(bytes, output), true);
    document.undo(); equalBytes(document.serialize(), sourceEdited);
    document.undo(); equalBytes(document.serialize(), bytes);
    clipboard.tiles[0][0] = 1;
    document.redo(); document.redo(); equalBytes(document.serialize(), output);
    assert.equal(document.paste({ clipboard: retained, position: { x: 11, y: 10 } }).changed, 0);
    assert.equal(document.editState.dirty, false);
    const reopened = await openWorld(output);
    equalBytes(reopened.serialize(), output);
  });
}

test('same-format cross-world copy retains every coating, while different formats reject without mutation', async () => {
  const world = await parse(await input());
  world.fileFormatHeader.version = 326;
  world.worldTiles.tiles.setTile(10, 10, { blockId: 1, blockColor: 4, wallId: 300, wallColor: 8,
    invisibleBlock: true, fullBrightBlock: true, invisibleWall: true, fullBrightWall: true,
    liquidAmount: 127, liquidType: 4, slope: 5, actuator: true, wireBlue: true });
  const sourceBytes = new FileSaver().save(world), source = await openWorld(sourceBytes);
  const { clipboard } = source.copy({ selection: { x: 10, y: 10, width: 1, height: 1 } });
  world.header.mapName = world.footer.signoff2 = '另一个中文世界';
  world.header.worldId = world.footer.signoff3 = 12345;
  const bytes = new FileSaver().save(world), target = await openWorld(bytes);
  assert.equal(target.paste({ clipboard, position: { x: 30, y: 10 } }).changed, 1);
  const output = target.serialize(), reloaded = await parse(output);
  for (const field of TILE_FIELDS) {
    world.worldTiles.tiles[field][36010] = world.worldTiles.tiles[field][12010];
    assert.deepEqual(reloaded.worldTiles.tiles[field], world.worldTiles.tiles[field], field);
  }
  assert.equal(reloaded.header.mapName, '另一个中文世界');
  assert.equal(preservesOtherSections(bytes, output), true);
  const oldBytes = await input('v1.3.5.3'), old = await openWorld(oldBytes);
  assert.throws(() => old.paste({ clipboard, position: { x: 10, y: 10 } }), /跨版本/);
  equalBytes(old.serialize(), oldBytes);
  assert.equal(old.editState.undoCount, 0);
});

test('copy and paste atomically reject furniture, nearby supports and entity anchors, even after earlier safe cells', async () => {
  const world = await parse(await input()), tiles = world.worldTiles.tiles;
  const { x, y } = world.chests.chests[0].position;
  const original = await openWorld(await input());
  assert.throws(() => original.copy({ selection: { x, y, width: 1, height: 1 } }), /家具/);
  tiles.setTile(12, 12, { blockId: 21, frameX: 18, frameY: 36 });
  tiles.setTile(20, 10, { blockId: 1 });
  world.signs.signs.push({ text: '孤立锚点保护', position: { x: 40, y: 40 } });
  world.weightedPressurePlates.weightedPressurePlates.push({ position: { x: 50, y: 50 } });
  world.tileEntities.entities.push({ type: 7, id: 999, position: { x: 60, y: 60 } });
  const bytes = new FileSaver().save(world), document = await openWorld(bytes);
  const { clipboard } = document.copy({ selection: { x: 20, y: 10, width: 2, height: 2 } });
  for (const position of [{ x: 10, y: 10 }, { x: 40, y: 40 }, { x: 50, y: 50 }, { x: 60, y: 60 }]) {
    assert.throws(() => document.paste({ clipboard, position }), /家具|实体/);
  }
  for (const position of [{ x: 40, y: 40 }, { x: 50, y: 50 }, { x: 60, y: 60 }]) {
    assert.throws(() => document.copy({ selection: { ...position, width: 1, height: 1 } }), /实体/);
  }
  equalBytes(document.serialize(), bytes);
  assert.equal(document.editState.undoCount, 0);
  clipboard.tiles[3][0] = 21;
  clipboard.tiles[3][8] = TileFlag.IS_BLOCK_ACTIVE;
  assert.throws(() => document.paste({ clipboard, position: { x: 70, y: 10 } }), /特殊/);
  equalBytes(document.serialize(), bytes);
});

test('malformed, sparse, oversized and out-of-bounds clipboards reject before changing history or bytes', async () => {
  const bytes = await input(), document = await openWorld(bytes);
  const { clipboard } = document.copy({ selection: { x: 10, y: 10, width: 2, height: 2 } });
  const invalid = [null, {}, { ...clipboard, schema: 2 }, { ...clipboard, width: 0 },
    { ...clipboard, width: 10001 }, { ...clipboard, tiles: Array(4) },
    { ...clipboard, tiles: [[], ...clipboard.tiles.slice(1)] }];
  for (const [field, value] of [[0, 65536], [1, -32769], [3, 256], [7, 5], [8, 65535], [8, 6 << 11], [0, NaN]]) {
    const modified = structuredClone(clipboard); modified.tiles[3][field] = value; invalid.push(modified);
  }
  for (const data of invalid) assert.throws(() => document.paste({ clipboard: data, position: { x: 30, y: 10 } }), /复制内容/);
  for (const position of [null, {}, { x: -1, y: 10 }, { x: 4199, y: 1199 }, { x: 1.5, y: 10 }, { x: NaN, y: 10 }]) {
    assert.equal(pasteFits(clipboard, position, { width: 4200, height: 1200 }), false);
    assert.throws(() => document.paste({ clipboard, position }), /地图内/);
  }
  for (const payload of [null, {}, { selection: { x: 10, y: 10, width: 101, height: 100 } }]) {
    assert.throws(() => document.copy(payload), /选区范围|10000/);
  }
  const maximum = document.copy({ selection: { x: 10, y: 10, width: 100, height: 100 } }).clipboard;
  assert.equal(maximum.tiles.length, 10000);
  validateClipboard(maximum, document.summary.formatVersion);
  equalBytes(document.serialize(), bytes);
  assert.equal(document.editState.undoCount, 0);
});

test('untrusted template fields that cannot be serialized reject atomically in both preparation and paste', async () => {
  for (const name of ['v1.3.5.3', 'v1.4.5.5']) {
    const bytes = await input(name), document = await openWorld(bytes);
    const valid = { schema: 1, formatVersion: document.summary.formatVersion, width: 2, height: 1,
      tiles: [[1, 0, 0, 0, 4, 0, 0, 0, 1], [1, 0, 0, 0, 4, 0, 0, 0, 1]] };
    const cases = [[1, 18], [2, -18], [4, 512], [6, 100], [7, 1]];
    if (name === 'v1.3.5.3') cases.push([4, 300], [8, 1 | TileFlag.INVISIBLE_WALL]);
    for (const [field, value] of cases) {
      const data = structuredClone(valid); data.tiles[1][field] = value;
      assert.throws(() => document.prepareClipboard(data), /完整保存/);
      assert.throws(() => document.paste({ clipboard: data, position: { x: 10, y: 10 } }), /完整保存/);
    }
    for (const row of [[1, 0, 0, 0, 4, 0, 0, 0, 0], [0, 0, 0, 3, 4, 0, 0, 0, 0], [1, 0, 0, 0, 0, 5, 0, 0, 1]]) {
      const data = structuredClone(valid); data.tiles[1] = row;
      assert.throws(() => document.prepareClipboard(data), /完整保存/);
    }
    if (name === 'v1.3.5.3') {
      const shimmer = structuredClone(valid); shimmer.tiles[1][6] = 127; shimmer.tiles[1][7] = 4;
      assert.throws(() => document.prepareClipboard(shimmer), /完整保存/);
    }
    equalBytes(document.serialize(), bytes); assert.equal(document.editState.undoCount, 0);
  }
});
