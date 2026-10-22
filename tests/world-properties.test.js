import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { createWorldProperties } = await server.ssrLoadModule('/src/adapters/worldProperties.js');
const { createObjectEditing } = await server.ssrLoadModule('/src/adapters/objectEditing.js');
const { FileReader, FileSaver } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { TILE_FIELDS } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const { preservesOtherSections, preservesEditedSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
const input = async name => { const bytes = await readFile(new URL(name + '.wld', fixtureRoot)); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); };
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();
const equalBytes = (a, b) => assert.deepEqual(new Uint8Array(a), new Uint8Array(b));
const payload = (doc, changes) => ({ revision: doc.editState.revision, changes });
function unchanged(a, b) {
  for (const field of TILE_FIELDS) assert.deepEqual(a.worldTiles.tiles[field], b.worldTiles.tiles[field], field);
  for (const section of ['chests', 'signs', 'NPCs', 'tileEntities', 'weightedPressurePlates', 'townManager', 'bestiary', 'creativePowers']) assert.deepEqual(a[section], b[section], section);
}

for (const fixture of fixtures) {
  test(fixture.name + ': approved world properties preserve every other header field, all tile arrays, objects and footer identity', async () => {
    const bytes = await input(fixture.name), original = await parse(bytes), doc = await openWorld(bytes);
    const fields = doc.readWorldProperties();
    assert.equal(fields.fields.some(field => field.id === 'moondialActive'), fixture.version >= 269);
    assert.equal(fields.fields.some(field => field.id === 'deerclops'), fixture.version >= 240);
    assert.equal(fields.fields.some(field => field.id === 'queenSlime'), fixture.version >= 225);
    assert.equal(fields.fields.some(field => field.id === 'halloweenAlways'), fixture.version >= 287);
    assert.equal(new Set(fields.fields.map(field => field.id)).size, fields.fields.length);
    for (const field of fields.fields) assert.equal(typeof fields.values[field.id], field.type === 'boolean' ? 'boolean' : ['text', 'guid'].includes(field.type) ? 'string' : 'number', field.id);
    fields.values.name = '外部修改'; fields.fields[0].label = '外部修改';
    assert.notEqual(doc.readWorldProperties().values.name, '外部修改'); assert.notEqual(doc.readWorldProperties().fields[0].label, '外部修改');
    const changes = { name: '新世界🧭中文', difficulty: fixture.version < 225 ? 1 : 3, hardmode: !original.header.hardMode,
      clock: 19 * 3600 + 30 * 60, moonPhase: 4, wind: -0.37, clouds: 17, raining: true, rainIntensity: 0.31,
      destroyer: true, twins: false, prime: false, eye: true, manualParty: true, goblinSaved: true,
      ...(fixture.version >= 240 ? { deerclops: true } : {}), ...(fixture.version >= 269 ? { slimeCopper: true, moondialCooldown: 7 } : {}) };
    const expected = { ...original.header, mapName: changes.name, ...(fixture.version < 225 ? { expertMode: true } : { gameMode: 3 }),
      hardMode: changes.hardmode, tempTime: 0, tempDayTime: false, tempMoonPhase: 4, windSpeed: Math.fround(-0.37), numClouds: 17,
      tempRaining: true, tempMaxRain: Math.fround(0.31), downedMechBoss1: true, downedMechBoss2: false, downedMechBoss3: false,
      downedMechBossAny: true, downedBoss1: true, tempPartyManual: true, savedGoblin: true,
      ...(fixture.version >= 240 ? { downedDeerclops: true } : {}), ...(fixture.version >= 269 ? { unlockedSlimeCopperSpawn: true, moondialCooldown: 7 } : {}) };
    assert.equal(doc.editWorldProperties(payload(doc, changes)).changed, 1);
    changes.name = '输入随后改变';
    assert.equal(doc.summary.name, expected.mapName); assert.equal(doc.summary.gameMode, fixture.version < 225 ? 1 : 3);
    assert.equal(doc.summary.hardmode, expected.hardMode);
    const output = doc.serialize(), edited = await parse(output);
    assert.deepEqual({ ...edited.header }, expected); unchanged(original, edited);
    assert.deepEqual({ ...edited.footer }, { ...original.footer, signoff2: expected.mapName });
    assert.equal(preservesOtherSections(bytes, output), false);
    assert.equal(doc.editWorldProperties(payload(doc, { name: expected.mapName })).changed, 0);
    assert.equal(doc.editState.dirty, false); assert.equal(doc.editState.undoCount, 1);
    doc.undo(); equalBytes(doc.serialize(), bytes); assert.equal(doc.summary.name, original.header.mapName);
    assert.equal(doc.summary.gameMode, fixture.version < 225 ? Number(original.header.expertMode) : original.header.gameMode);
    doc.redo(); equalBytes(doc.serialize(), output);
    const reopened = await openWorld(output); assert.equal(reopened.readWorldProperties().values.clock, 70200);
  });

  test(fixture.name + ': world, chest and tile edits undo/redo in a single chronological history', async () => {
    const bytes = await input(fixture.name), doc = await openWorld(bytes);
    doc.editWorldProperties(payload(doc, { name: '混合撤销世界' })); const one = doc.serialize();
    doc.editObject({ kind: 'chest', index: 0, revision: doc.editState.revision, changes: { name: '混合撤销箱子' } }); const two = doc.serialize();
    assert.equal(doc.paint({ cells: [10 * doc.summary.height + 10], blockId: 0 }).changed, 1); const three = doc.serialize();
    assert.equal(doc.undo().undoCount, 2); equalBytes(doc.serialize(), two);
    doc.undo(); equalBytes(doc.serialize(), one); doc.undo(); equalBytes(doc.serialize(), bytes);
    doc.redo(); equalBytes(doc.serialize(), one); doc.redo(); equalBytes(doc.serialize(), two); doc.redo(); equalBytes(doc.serialize(), three);
    doc.undo(); doc.editWorldProperties(payload(doc, { moonPhase: (doc.readWorldProperties().values.moonPhase + 1) % 8 }));
    assert.equal(doc.editState.redoCount, 0);
  });

  test(fixture.name + ': every available progress flag survives a full file roundtrip and stays one undo transaction', async () => {
    const bytes = await input(fixture.name), doc = await openWorld(bytes), before = doc.readWorldProperties();
    const flags = before.fields.filter(field => field.type === 'boolean');
    const changes = Object.fromEntries(flags.map(field => [field.id, !before.values[field.id]]));
    assert.ok(flags.length >= 50); doc.editWorldProperties(payload(doc, changes));
    const reopened = await openWorld(doc.serialize()), actual = reopened.readWorldProperties();
    for (const [id, value] of Object.entries(changes)) assert.equal(actual.values[id], value, id);
    assert.equal(doc.editState.undoCount, 1); doc.undo(); equalBytes(doc.serialize(), bytes);
  });
}

test('invalid/stale properties and unsupported format fields reject atomically without touching history or world identity', async () => {
  const bytes = await input('v1.3.5.3'), doc = await openWorld(bytes);
  const invalid = [{ worldId: 123 }, { seed: 'new' }, { spawnTileX: 20 }, { mapName: 'raw' }, { tempTime: 1 }, { difficulty: 2 },
    { name: '' }, { name: ' \t ' }, { name: 'a\nb' }, { name: String.fromCharCode(0xd800) }, { name: '界'.repeat(342) },
    { clock: 86400 }, { clock: -1 }, { clock: 1.5 }, { clock: '' }, { clouds: 129 }, { clouds: NaN }, { clouds: 1.5 }, { rainIntensity: Infinity },
    { wind: -1.21 }, { moonPhase: 8 }, { eye: 1 }, { moondialActive: true }, { deerclops: true }, { slimeCopper: true }, { cloudBackground: 0.5 }];
  for (const changes of invalid) assert.throws(() => doc.editWorldProperties(payload(doc, { name: '本项也不应写入', ...changes })), /参数无效/);
  assert.throws(() => doc.editWorldProperties({ revision: 99, changes: { name: '过时' } }), /版本已变化/);
  assert.throws(() => doc.editWorldProperties({ ...payload(doc, { name: '有额外参数' }), header: {} }), /版本已变化/);
  assert.equal(doc.editState.revision, 0); assert.equal(doc.editState.undoCount, 0); equalBytes(doc.serialize(), bytes);
});

test('clock boundaries match the 4:30 dawn and 19:30 dusk split; mechanical progress is derived and unrelated flags remain untouched', async () => {
  const world = await parse(await input('v1.4.5.5')), properties = createWorldProperties(world);
  for (const [clock, time, day] of [[0, 16200, false], [16199, 32399, false], [16200, 0, true], [43200, 27000, true], [70199, 53999, true], [70200, 0, false], [86399, 16199, false]]) {
    const change = properties.prepare({ revision: 0, changes: { clock } }, 0); if (change) properties.write(change.after);
    assert.equal(world.header.tempTime, time); assert.equal(world.header.tempDayTime, day); assert.equal(properties.read().values.clock, clock);
  }
  for (const changes of [{ destroyer: true, twins: false, prime: false }, { destroyer: false }, { twins: true }, { twins: false, prime: true }, { prime: false }]) {
    const change = properties.prepare({ revision: 0, changes }, 0); if (change) properties.write(change.after);
    assert.equal(world.header.downedMechBossAny, world.header.downedMechBoss1 || world.header.downedMechBoss2 || world.header.downedMechBoss3);
  }
});

test('header/footer expectations reject unauthorized seed, ID, spawn, NPC, footer, object and pointer mutations', async () => {
  const world = await parse(await input('v1.4.5.5')), original = new FileSaver().save(world), properties = createWorldProperties(world), objects = createObjectEditing(world);
  properties.write(properties.prepare({ revision: 0, changes: { name: '已批准世界', hardmode: true } }, 0).after);
  const allowed = new Map([...objects.expectedSections(), ...properties.expectedSections()]), valid = new FileSaver().save(world);
  assert.equal(preservesEditedSections(original, valid, allowed), true);
  for (const [key, value] of [['worldId', world.header.worldId + 1], ['seedText', '未批准'], ['spawnTileX', world.header.spawnTileX + 1], ['moonType', (world.header.moonType + 1) % 3]]) {
    const previous = world.header[key]; world.header[key] = value;
    assert.equal(preservesEditedSections(original, new FileSaver().save(world), allowed), false, key); world.header[key] = previous;
  }
  const chest = world.chests.chests[0]; chest.position.x++;
  assert.equal(preservesEditedSections(original, new FileSaver().save(world), allowed), false); chest.position.x--;
  const npc = world.NPCs.townNPCs[0]; npc.name += '未批准';
  assert.equal(preservesEditedSections(original, new FileSaver().save(world), allowed), false);
  const brokenFooter = valid.slice(0); new Uint8Array(brokenFooter)[brokenFooter.byteLength - 1] ^= 1;
  assert.equal(preservesEditedSections(original, brokenFooter, allowed), false);
  const brokenPointer = valid.slice(0); new DataView(brokenPointer).setInt32(30, 1, true);
  assert.equal(preservesEditedSections(original, brokenPointer, allowed), false);
  assert.equal(preservesEditedSections(original, valid, new Map([[0, allowed.get(0)]])), false);
  assert.equal(preservesEditedSections(original, valid, new Map([[4, new ArrayBuffer(0)]])), false);
});
