import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';
import { worldLayerLimits, editWorldPropertyDraft, constrainWorldLayers, fixWorldLayerGap } from '../src/editing/worldPropertyRules.js';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { FileReader, FileSaver } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { TILE_FIELDS } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const input = async name => { const b = await readFile(new URL(name + '.wld', fixtureRoot)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();
const bytesEqual = (a, b) => assert.deepEqual(new Uint8Array(a), new Uint8Array(b));
const payload = (doc, changes, options) => ({ revision: doc.editState.revision, changes, ...(options ? { options } : {}) });
function unchanged(before, after) {
  for (const field of TILE_FIELDS) assert.deepEqual(after.worldTiles.tiles[field], before.worldTiles.tiles[field], field);
  for (const key of ['chests', 'signs', 'NPCs', 'tileEntities', 'weightedPressurePlates', 'townManager', 'bestiary', 'creativePowers', 'footer']) assert.deepEqual(after[key], before[key], key);
}

test('draft boundary setters clamp to adjacent regions, orb counts derive their flag and source layer commands preserve their priority', () => {
  const values = { treeSplit0: 100, treeSplit1: 200, treeSplit2: 300, caveSplit0: 100, caveSplit1: 200, caveSplit2: 300, surfaceLevel: 100, rockLevel: 300, orbCount: 0, orbSmashed: false };
  const limits = worldLayerLimits({ height: 1200 }); assert.deepEqual(limits, { surface: 716, rock: 722 });
  assert.equal(editWorldPropertyDraft(values, 'treeSplit0', 250, limits).treeSplit0, 200);
  assert.equal(editWorldPropertyDraft(values, 'treeSplit1', 400, limits).treeSplit1, 300);
  assert.equal(editWorldPropertyDraft(values, 'caveSplit2', 50, limits).caveSplit2, 200);
  const ground = editWorldPropertyDraft(values, 'surfaceLevel', 350, limits);
  assert.equal(ground.surfaceLevel, 350); assert.equal(ground.rockLevel, 356);
  const rock = editWorldPropertyDraft(values, 'rockLevel', 80, limits);
  assert.equal(rock.surfaceLevel, 74); assert.equal(rock.rockLevel, 80);
  assert.equal(editWorldPropertyDraft(values, 'surfaceLevel', -1, limits).surfaceLevel, 100);
  assert.equal(editWorldPropertyDraft(values, 'orbCount', 2, limits).orbSmashed, true);
  assert.equal(editWorldPropertyDraft({ ...values, orbSmashed: true }, 'orbCount', 0, limits).orbSmashed, false);
  const safe = constrainWorldLayers({ ...values, surfaceLevel: 1100, rockLevel: 1150 }, limits);
  assert.equal(safe.surfaceLevel, 716); assert.equal(safe.rockLevel, 722);
  const fixed = fixWorldLayerGap({ ...values, surfaceLevel: 100.5, rockLevel: 300.75 }, limits);
  assert.equal(fixed.rockLevel, 304.5); assert.equal((fixed.rockLevel - fixed.surfaceLevel) % 6, 0);
  assert.equal(fixWorldLayerGap({ ...values, surfaceLevel: 100.5, rockLevel: 722 }, limits).rockLevel, 718.5);
  assert.deepEqual(values, { treeSplit0: 100, treeSplit1: 200, treeSplit2: 300, caveSplit0: 100, caveSplit1: 200, caveSplit2: 300, surfaceLevel: 100, rockLevel: 300, orbCount: 0, orbSmashed: false });
});

test('pinned background catalogue retains noncontiguous IDs, all 39 Chinese quest names, source names and no game images', async () => {
  const data = JSON.parse(await readFile(new URL('../vendor/tedit-world-properties/catalogue.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(data.backgrounds).length, 15); assert.equal(Object.values(data.backgrounds).reduce((n, rows) => n + rows.length, 0), 108);
  assert.ok(data.backgrounds.forestBackgrounds.some(([id]) => id === 73)); assert.ok(data.backgrounds.snowBackgrounds.some(([id]) => id === 42));
  assert.equal(data.backgrounds.jungleUndergroundBackgrounds.length, 2); assert.equal(data.quests.length, 39);
  assert.deepEqual(data.quests[25], [25, 'Amanitia Fungifin', '毒菌鱼']);
  assert.ok(data.quests.every(([id, name, zh]) => name && zh && name !== zh));
  assert.ok(Object.values(data.backgrounds).every(rows => rows.every(row => row.length === 3)));
});

for (const fixture of fixtures) {
  test(fixture.name + ': extended properties roundtrip exact approved fields and arrays without changing any objects or tiles', async () => {
    const bytes = await input(fixture.name), original = await parse(bytes), doc = await openWorld(bytes);
    const changes = { moonType: 8, crimson: !original.header.crimson, meteor: true, orbCount: 2, altars: 3,
      cobaltOre: 221, mythrilOre: 222, adamantiteOre: 223, invasion: 4, invasionSize: 1000, invasionX: 123.5, cultistDelay: 86400, anglerQuest: 25,
      treeSplit0: 100, treeSplit1: 200, treeSplit2: 300, caveSplit0: 100, caveSplit1: 200, caveSplit2: 300,
      treeStyle0: 5, treeStyle1: 4, treeStyle2: 3, treeStyle3: 2, caveStyle0: 7, caveStyle1: 6, caveStyle2: 5, caveStyle3: 4,
      iceCave: 3, jungleCave: 1, hellCave: 2, forestBackground: 73, corruptBackground: 52, jungleBackground: 6, snowBackground: 42,
      hallowBackground: 5, crimsonBackground: 6, desertBackground: 53, oceanBackground: 7, surfaceLevel: 100.5, rockLevel: 300.75,
      ...(fixture.version >= 225 ? { copperOre: 166, ironOre: 167, silverOre: 168, goldOre: 169, mushroomBackground: 4, underworldBackground: 2, forestBackground2: 51, forestBackground3: 71, forestBackground4: 72, lanternCooldown: 7 } : {}),
      ...(fixture.version >= 257 ? { partyOfDoom: true } : {}) };
    const expected = { ...original.header, moonType: 8, crimson: changes.crimson, spawnMeteor: true, shadowOrbCount: 2, shadowOrbSmashed: true, altarCount: 3,
      oreTier1: 221, oreTier2: 222, oreTier3: 223, invasionType: 4, invasionSize: 1000, invasionX: 123.5, tempCultistDelay: 86400, anglerQuest: 25,
      treeX: [100, 200, 300], caveBackX: [100, 200, 300], treeStyle: [5, 4, 3, 2], caveBackStyle: [7, 6, 5, 4], iceBackStyle: 3, jungleBackStyle: 1, hellBackStyle: 2,
      setBG0: 73, setBG1: 52, setBG2: 6, setBG3: 42, setBG4: 5, setBG5: 6, setBG6: 53, setBG7: 7, worldSurface: 100.5, rockLayer: 300.75,
      ...(fixture.version >= 225 ? { savedOreTierCopper: 166, savedOreTierIron: 167, savedOreTierSilver: 168, savedOreTierGold: 169, setBG8: 4, setBG9: 2, setBG10: 51, setBG11: 71, setBG12: 72, lanternNightCooldown: 7,
        treeTopsVariations: [5, 4, 3, 2, 52, 1, 42, 5, 6, 53, 7, 4, 2, ...original.header.treeTopsVariations.slice(13)] } : {}),
      ...(fixture.version >= 257 ? { afterPartyOfDoom: true } : {}) };
    assert.equal(doc.editWorldProperties(payload(doc, changes)).changed, 1);
    changes.treeStyle0 = 0; const output = doc.serialize(), edited = await parse(output);
    assert.deepEqual({ ...edited.header }, expected); unchanged(original, edited);
    const state = doc.readWorldProperties(); assert.equal(state.values.treeStyle0, 5); assert.equal(state.values.orbSmashed, true);
    assert.equal(state.values.caveStyle2, 5); assert.equal(state.values.anglerQuest, 25);
    assert.equal(doc.editWorldProperties(payload(doc, { treeStyle0: 5 })).changed, 0); assert.equal(doc.editState.dirty, false);
    doc.undo(); bytesEqual(doc.serialize(), bytes); doc.redo(); bytesEqual(doc.serialize(), output);
  });
}

test('invalid choices, crossing regions, invalid final layers and unsupported fields reject before any partial write', async () => {
  const original = await parse(await input('v1.3.5.3')); original.header.treeX = [100, 200, 300]; original.header.caveBackX = [100, 200, 300];
  const bytes = new FileSaver().save(original), doc = await openWorld(bytes), limits = worldLayerLimits(doc.readWorldProperties().constraints);
  for (const changes of [{ forestBackground: 255 }, { treeStyle0: 6 }, { caveStyle0: 8 }, { jungleCave: 5 }, { moonType: 9 }, { anglerQuest: 39 },
    { cobaltOre: 999 }, { copperOre: 7 }, { orbCount: 4 }, { invasion: 5 }, { invasionSize: 1001 }, { invasionX: doc.summary.width + 1 }, { cultistDelay: 86401 },
    { treeSplit0: 201 }, { caveSplit1: 301 }, { treeSplit1: 1.5 }, { surfaceLevel: 500, rockLevel: 400 }, { surfaceLevel: limits.surface + 1 }, { rockLevel: doc.summary.height + 1 },
    { drunkSeed: true }, { moreLightningSeed: true }, { treeX: [1, 2, 3] }]) {
    assert.throws(() => doc.editWorldProperties(payload(doc, { name: '本项也不应写入', ...changes })), /参数无效/);
  }
  for (const options of [{ safeLayers: 'false' }, { safeLayers: false, unknown: true }, {}]) assert.throws(() => doc.editWorldProperties(payload(doc, { name: '无效选项' }, options)), /参数无效/);
  assert.equal(doc.editState.undoCount, 0); assert.equal(doc.editState.dirty, false); bytesEqual(doc.serialize(), bytes);
});

test('unsafe layer limits are explicit and reversible, while untouched unknown choices remain byte-for-byte intact', async () => {
  const world = await parse(await input('v1.4.5.5')); world.header.setBG0 = 255; world.header.treeStyle[2] = 99; world.header.treeTopsVariations[2] = 99; world.header.caveBackStyle[3] = 999;
  world.header.oreTier1 = 2147483647; world.header.anglerQuest = 99999;
  const bytes = new FileSaver().save(world), doc = await openWorld(bytes);
  doc.editWorldProperties(payload(doc, { name: '保留未知样式' })); const renamed = doc.serialize(), edited = await parse(renamed);
  assert.deepEqual({ ...edited.header }, { ...world.header, mapName: '保留未知样式' });
  const unsafe = { surfaceLevel: doc.summary.height - 20, rockLevel: doc.summary.height - 10 };
  assert.throws(() => doc.editWorldProperties(payload(doc, unsafe)), /参数无效/);
  doc.editWorldProperties(payload(doc, unsafe, { safeLayers: false })); const output = doc.serialize(), actual = await parse(output);
  assert.equal(actual.header.worldSurface, unsafe.surfaceLevel); assert.equal(actual.header.rockLayer, unsafe.rockLevel);
  assert.equal(actual.header.setBG0, 255); assert.equal(actual.header.caveBackStyle[3], 999);
  doc.undo(); bytesEqual(doc.serialize(), renamed); doc.undo(); bytesEqual(doc.serialize(), bytes);
});

test('modern style drafts read authoritative tree-top entries and synchronize only explicitly edited slots, preserving unknown and extra entries', async () => {
  const world = await parse(await input('v1.4.5.5'));
  world.header.treeStyle = [0, 0, 99, 0]; world.header.setBG1 = 0; world.header.setBG3 = 0;
  world.header.treeTopsVariations = [5, 4, 999, 2, 52, 1, 42, 5, 6, 53, 7, 4, 2, 123456];
  const bytes = new FileSaver().save(world), doc = await openWorld(bytes), state = doc.readWorldProperties();
  assert.equal(state.values.treeStyle0, 5); assert.equal(state.values.treeStyle2, 999);
  assert.equal(state.values.corruptBackground, 52); assert.equal(state.values.snowBackground, 42);
  doc.editWorldProperties(payload(doc, { name: '不归一化未编辑样式' })); const renamed = doc.serialize();
  assert.deepEqual({ ...(await parse(renamed)).header }, { ...world.header, mapName: '不归一化未编辑样式' });
  doc.editWorldProperties(payload(doc, { treeStyle0: 3, snowBackground: 41 })); const output = doc.serialize(), actual = await parse(output);
  assert.deepEqual({ ...actual.header }, { ...world.header, mapName: '不归一化未编辑样式', treeStyle: [3, 0, 99, 0], setBG3: 41,
    treeTopsVariations: [3, 4, 999, 2, 52, 1, 41, 5, 6, 53, 7, 4, 2, 123456] });
  unchanged(await parse(renamed), actual);
  doc.undo(); bytesEqual(doc.serialize(), renamed); doc.undo(); bytesEqual(doc.serialize(), bytes);
  doc.redo(); doc.redo(); bytesEqual(doc.serialize(), output);
});

test('short modern tree-top arrays use desktop zero defaults and expand on style edits without normalizing unrelated fields', async () => {
  const world = await parse(await input('v1.4.0.5')); world.header.treeTopsVariations = [3, 4];
  const bytes = new FileSaver().save(world), doc = await openWorld(bytes);
  assert.equal(doc.readWorldProperties().values.snowBackground, 0); assert.equal(doc.readWorldProperties().values.treeStyle1, 4);
  doc.editWorldProperties(payload(doc, { snowBackground: 42 })); const actual = await parse(doc.serialize());
  assert.deepEqual({ ...actual.header }, { ...world.header, setBG3: 42, treeTopsVariations: [3, 4, 0, 0, 0, 0, 42, 0, 0, 0, 0, 0, 0] });
  unchanged(world, actual); doc.undo(); bytesEqual(doc.serialize(), bytes);
});

test('special seed fields use save-format gates, and orb count changes permit an explicit later flag override', async () => {
  const bytes = await input('v1.4.5.5'), doc = await openWorld(bytes), ids = doc.readWorldProperties().fields.map(x => x.id);
  assert.ok(ids.includes('skyblockSeed')); assert.ok(ids.includes('dualDungeonsSeed')); assert.ok(!ids.includes('moreLightningSeed'));
  doc.editWorldProperties(payload(doc, { orbCount: 2, orbSmashed: false, drunkSeed: true, worthySeed: true, zenithSeed: true, skyblockSeed: true, dualDungeonsSeed: true }));
  const actual = await parse(doc.serialize()); assert.equal(actual.header.shadowOrbSmashed, false); assert.equal(actual.header.shadowOrbCount, 2);
  assert.equal(actual.header.drunkWorld, true); assert.equal(actual.header.getGoodWorld, true); assert.equal(actual.header.zenithWorld, true); assert.equal(actual.header.skyblockWorld, true);
  assert.equal(actual.header.dualDungeonsSeed, true); doc.undo(); bytesEqual(doc.serialize(), bytes);
});
