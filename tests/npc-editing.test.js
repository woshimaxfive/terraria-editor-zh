import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';
import { NPC_TYPES, npcLimit, npcType, searchNpcs } from '../src/editing/npcs.js';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { FileReader, FileSaver } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { default: Reader } = await server.ssrLoadModule('/vendor/terraria-world-file/src/BinaryReader.ts');
const { default: Saver } = await server.ssrLoadModule('/vendor/terraria-world-file/src/BinarySaver.ts');
const { default: IO } = await server.ssrLoadModule('/vendor/terraria-world-file/src/section/NPCs.ts');
const { createNpcEditing } = await server.ssrLoadModule('/src/adapters/npcEditing.js');
const { createWorldProperties } = await server.ssrLoadModule('/src/adapters/worldProperties.js');
const { EditHistory } = await server.ssrLoadModule('/src/editing/EditHistory.js');
const { TILE_FIELDS } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const { preservesEditedSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
const ab = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const input = async name => ab(await readFile(new URL(name + '.wld', fixtureRoot)));
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();
const bytesEqual = (a, b) => assert.deepEqual(new Uint8Array(a), new Uint8Array(b));
const edit = (doc, action, values = {}) => doc.editNpc({ revision: doc.editState.revision, action, ...values });
function untouched(before, after, header = before.header) {
  assert.deepEqual({ ...after.header }, { ...header }); assert.deepEqual(after.footer, before.footer);
  for (const field of TILE_FIELDS) assert.deepEqual(after.worldTiles.tiles[field], before.worldTiles.tiles[field], field);
  for (const section of ['chests', 'signs', 'tileEntities', 'weightedPressurePlates', 'townManager', 'bestiary', 'creativePowers']) assert.deepEqual(after[section], before[section], section);
}

// Independent native layout: deliberately does not call BinarySaver/FileSaver.
function encode(version, flags, record = {}) {
  const chunks = [], byte = n => chunks.push(Buffer.from([n]));
  const number = (n, float = false) => { const b = Buffer.alloc(4); float ? b.writeFloatLE(n) : b.writeInt32LE(n); chunks.push(b); };
  const string = s => { const b = Buffer.from(s, 'utf8'); assert.ok(b.length < 128); byte(b.length); chunks.push(b); };
  if (version >= 268) { number(3); for (const id of [17, 9999, 17]) number(id); }
  byte(1); number(17); string(record.name ?? '独立原始布局'); number(record.x ?? 160.5, true); number(record.y ?? 320.25, true);
  byte(1); number(record.homeX ?? 10); number(record.homeY ?? 20);
  if (version >= 213) { byte(flags); if (flags & 1) number(record.variant ?? 2); }
  if (version >= 315) byte(1);
  byte(0); byte(1); number(517); number(500.5, true); number(700.25, true); byte(0);
  return Buffer.concat(chunks);
}
for (const version of [194, 212, 213, 224, 225, 267, 268, 314, 315, 318, 326]) for (const flags of version < 213 ? [0] : [0, 1, 128, 129]) {
  test(`NPC binary ${version}/${flags}: independent native layout, absent/unknown flags, shimmer IDs, Chinese name and movement`, () => {
    const bytes = encode(version, flags), io = new IO(), data = io.parse(new Reader().loadBuffer(ab(bytes)), { version });
    const save = value => { const saver = new Saver(); io.save(saver, value, { version }); return Buffer.from(saver.getBuffer().slice(0, saver.getPosition())); };
    assert.equal(data.townNPCs.length, 1); assert.equal(data.pillars.length, 1);
    assert.equal(data.townNPCs[0].variationIndex, version >= 213 && (flags & 1) ? 2 : undefined);
    assert.deepEqual(data.shimmeredNPCIds, version >= 268 ? [17, 9999, 17] : []);
    assert.deepEqual(save(data), bytes);
    const named = structuredClone(data); named.townNPCs[0].name = '居民中文🧭'; assert.deepEqual(save(named), encode(version, flags, { name: '居民中文🧭' }));
    const moved = structuredClone(data); Object.assign(moved.townNPCs[0], { homePosition: { x: 42, y: 53 }, position: { x: 672, y: 848 } });
    assert.deepEqual(save(moved), encode(version, flags, { x: 672, y: 848, homeX: 42, homeY: 53 }));
    if (version >= 213) { const changed = structuredClone(data); changed.townNPCs[0].variationIndex = 3; assert.deepEqual(save(changed), encode(version, flags | 1, { variant: 3 })); }
  });
}

test('NPC catalogue has complete identities, Chinese aliases, variants and format limits without image resources', () => {
  assert.equal(NPC_TYPES.length, 60); assert.equal(new Set(NPC_TYPES.map(npc => npc.id)).size, 60);
  assert.equal(NPC_TYPES.filter(npc => npc.canShimmer).length, 27); assert.equal(NPC_TYPES.filter(npc => npc.variants.length).length, 4);
  for (const npc of NPC_TYPES) { assert.match(npc.zh, /[一-龥]/); assert.ok(!npc.zh.includes('{$')); assert.ok(searchNpcs(npc.name, 326).some(value => value.id === npc.id)); assert.ok(searchNpcs(npc.zh, 326).some(value => value.id === npc.id)); assert.equal(npc.variants.length, npc.variantLabels.length); }
  assert.equal(npcType(695).zh, '捣蛋猫'); assert.equal(npcType(696).zh, '火绒狐');
  assert.equal(npcLimit(194), 579); assert.equal(npcLimit(268), 669); assert.equal(npcLimit(326), 696);
  assert.ok(!searchNpcs('', 194).some(npc => npc.id === 637)); assert.ok(searchNpcs('637', 326).some(npc => npc.id === 637));
});

for (const fixture of fixtures) test(fixture.name + ': NPC native roundtrip, add at current spawn, rename, move, remove and chronological restoration preserve all other data', async () => {
  const bytes = await input(fixture.name), before = await parse(bytes), doc = await openWorld(bytes);
  bytesEqual(doc.serialize(), bytes); assert.equal(doc.readNpcs().records.length, before.NPCs.townNPCs.length);
  doc.editWorldProperties({ revision: 0, changes: { spawnX: 42, spawnY: 53 } }); const spawn = doc.serialize();
  const type = NPC_TYPES.find(npc => npc.id <= npcLimit(fixture.version ?? doc.summary.formatVersion) && !before.NPCs.townNPCs.some(record => record.id === npc.id));
  assert.ok(type); edit(doc, 'add', { id: type.id }); const added = doc.serialize(), npc = doc.readNpcs().records.at(-1);
  assert.equal(npc.id, type.id); assert.equal(npc.name, type.name); assert.equal(npc.homeless, true);
  assert.deepEqual([npc.x, npc.y, npc.homeX, npc.homeY], [42, 53, 42, 53]);
  assert.equal(doc.summary.counts.npcs, before.NPCs.townNPCs.length + 1); assert.ok(doc.summary.points.some(point => point.id === 'npc:' + npc.key));
  edit(doc, 'update', { key: npc.key, changes: { name: '中文居民🧭', partying: true } }); const named = doc.serialize(), actual = await parse(named);
  assert.equal(actual.NPCs.townNPCs.at(-1).name, '中文居民🧭'); assert.deepEqual(actual.NPCs.townNPCs.slice(0, -1), before.NPCs.townNPCs); assert.deepEqual(actual.NPCs.pillars, before.NPCs.pillars);
  const expectedHeader = { ...before.header, spawnTileX: 42, spawnTileY: 53, tempPartyCelebratingNPCs: [...before.header.tempPartyCelebratingNPCs.filter(id => id !== type.id), type.id] };
  // Existing membership is retained as-is by an explicit enable.
  if (before.header.tempPartyCelebratingNPCs.includes(type.id)) expectedHeader.tempPartyCelebratingNPCs = before.header.tempPartyCelebratingNPCs;
  untouched(before, actual, expectedHeader);
  edit(doc, 'move', { key: npc.key, x: 100, y: 200 }); const moved = doc.serialize();
  assert.deepEqual((await parse(moved)).NPCs.townNPCs.at(-1).position, { x: 1600, y: 3200 });
  edit(doc, 'remove', { key: npc.key }); const removed = doc.serialize(); assert.equal(doc.summary.counts.npcs, before.NPCs.townNPCs.length);
  for (const snapshot of [moved, named, added, spawn, bytes]) { doc.undo(); bytesEqual(doc.serialize(), snapshot); }
  for (const snapshot of [spawn, added, named, moved, removed]) { doc.redo(); bytesEqual(doc.serialize(), snapshot); }
});

async function derived() {
  const world = await parse(await input('v1.4.5.5')), base = world.NPCs.townNPCs[0];
  world.NPCs.townNPCs = [
    { ...structuredClone(base), id: 17, name: '同名居民', variationFlags: 128, variationIndex: undefined },
    { ...structuredClone(base), id: 17, name: '同名居民', variationFlags: 129, variationIndex: 12345 },
    { ...structuredClone(base), id: 637, name: '城镇猫', variationFlags: 128, variationIndex: undefined },
    { ...structuredClone(base), id: 9999, name: '未知居民', variationFlags: 255, variationIndex: -77 },
  ];
  world.NPCs.shimmeredNPCIds = [9999, 17, 12345, 17]; world.header.tempPartyCelebratingNPCs = [8888, 17, 17, 7777];
  const bytes = new FileSaver().save(world); return { bytes, world: await parse(bytes), doc: await openWorld(bytes) };
}

test('duplicate instances keep stable keys; targeted rename/removal never retargets another record and keys are not reused after branching', async () => {
  const { bytes, world, doc } = await derived(), [a, b] = doc.readNpcs().records;
  edit(doc, 'update', { key: b.key, changes: { name: '只改第二位' } }); const actual = await parse(doc.serialize());
  assert.deepEqual(actual.NPCs.townNPCs, world.NPCs.townNPCs.map((npc, i) => i === 1 ? { ...npc, name: '只改第二位' } : npc)); untouched(world, actual);
  edit(doc, 'remove', { key: a.key }); assert.equal(doc.readNpcs().records[0].key, b.key); doc.undo(); assert.equal(doc.readNpcs().records[0].key, a.key);
  doc.undo(); bytesEqual(doc.serialize(), bytes); edit(doc, 'add', { id: 18 }); const abandoned = doc.readNpcs().records.at(-1).key; doc.undo(); edit(doc, 'add', { id: 19 });
  assert.notEqual(doc.readNpcs().records.at(-1).key, abandoned); assert.throws(() => edit(doc, 'remove', { key: abandoned }), /参数无效/);
});

test('explicit shimmer and party toggles change only target membership; unknown IDs, duplicates, raw variation flags and mobs survive', async () => {
  const { bytes, world, doc } = await derived(), npc = doc.readNpcs().records[0];
  assert.equal(edit(doc, 'update', { key: npc.key, changes: { shimmered: true, partying: true } }).changed, 0); bytesEqual(doc.serialize(), bytes);
  edit(doc, 'update', { key: npc.key, changes: { shimmered: false, partying: false, name: '双段事务' } }); const out = doc.serialize(), actual = await parse(out);
  assert.deepEqual(actual.NPCs.shimmeredNPCIds, [9999, 12345]); assert.deepEqual(actual.header.tempPartyCelebratingNPCs, [8888, 7777]);
  assert.ok(doc.readNpcs().records.filter(value => value.id === 17).every(value => !value.shimmered && !value.partying));
  assert.deepEqual(actual.NPCs.pillars, world.NPCs.pillars); assert.equal(actual.NPCs.townNPCs[0].variationFlags, 128); assert.equal(actual.NPCs.townNPCs[1].variationFlags, 129);
  untouched(world, actual, { ...world.header, tempPartyCelebratingNPCs: [8888, 7777] }); doc.undo(); bytesEqual(doc.serialize(), bytes); doc.redo(); bytesEqual(doc.serialize(), out);
  edit(doc, 'update', { key: npc.key, changes: { shimmered: true, partying: true } }); const enabled = await parse(doc.serialize());
  assert.deepEqual(enabled.NPCs.shimmeredNPCIds, [9999, 12345, 17]); assert.deepEqual(enabled.header.tempPartyCelebratingNPCs, [8888, 7777, 17]);
});

test('variant and homelessness edits preserve unknown flag bits, allow unknown types to retain raw data, and version gates reject atomically', async () => {
  const { world, doc } = await derived(), cat = doc.readNpcs().records[2];
  edit(doc, 'update', { key: cat.key, changes: { variant: 5, homeless: false, homelessDespawn: true } }); const actual = await parse(doc.serialize());
  assert.deepEqual(actual.NPCs.townNPCs[2], { ...world.NPCs.townNPCs[2], variationFlags: 129, variationIndex: 5, homeless: false, homelessDespawn: true });
  const oldBytes = await input('v1.3.5.3'), old = await openWorld(oldBytes), first = old.readNpcs().records[0];
  for (const changes of [{ variant: 1 }, { shimmered: true }, { homelessDespawn: true }]) assert.throws(() => edit(old, 'update', { key: first.key, changes: { name: '不能部分保存', partying: !first.partying, ...changes } }), /参数无效/);
  assert.throws(() => edit(old, 'add', { id: 637 }), /参数无效/); bytesEqual(old.serialize(), oldBytes);
});

test('stale, malformed, oversized and unsupported payloads reject before changing NPCs, party header or history', async () => {
  const { bytes, doc } = await derived(), [npc] = doc.readNpcs().records;
  const invalid = [{ action: 'add', id: 17 }, { action: 'add', id: 9999 }, { action: 'add', id: '18' }, { action: 'remove', key: 0 },
    { action: 'move', key: npc.key, x: -1, y: 2 }, { action: 'move', key: npc.key, x: 1.5, y: 2 }, { action: 'move', key: npc.key, x: doc.summary.width, y: 0 },
    ...[{ name: '中'.repeat(342) }, { name: String.fromCharCode(0xd800) }, { name: 'a\n' }, { name: 1 }, { variant: 999 }, { shimmered: 1 }, { position: { x: 1, y: 2 } }, {}].map(changes => ({ action: 'update', key: npc.key, changes })),
    { action: 'remove', key: npc.key, id: 17 }, { action: 'update', key: npc.key, changes: { partying: false, name: 'x'.repeat(1025) } }];
  for (const payload of invalid) assert.throws(() => doc.editNpc({ revision: 0, ...payload }), /参数无效/);
  assert.throws(() => doc.editNpc({ revision: 99, action: 'remove', key: npc.key }), /版本已变化/);
  assert.equal(doc.editState.undoCount, 0); bytesEqual(doc.serialize(), bytes);
});

test('oversized retained NPC snapshot rejects its compound party transaction before ensureWritable or writes', async () => {
  const world = await parse(await input('v1.4.5.5')), base = world.NPCs.townNPCs[0];
  world.NPCs.townNPCs = Array.from({ length: 500 }, () => ({ ...structuredClone(base), name: '原始长名称'.repeat(1000) }));
  const original = structuredClone(world.NPCs), properties = createWorldProperties(world), npcs = createNpcEditing(world, properties);
  let writes = 0; const history = new EditHistory({ ensureWritable() { writes++; }, writeObject() { writes++; } });
  const npc = npcs.read().records[0], changes = npcs.prepare({ revision: 0, action: 'update', key: npc.key, changes: { name: '小改动', partying: !npc.partying } }, 0);
  assert.throws(() => history.commit(changes), /预算/); assert.equal(writes, 0); assert.deepEqual({ ...world.NPCs }, original); assert.equal(history.state.revision, 0);
});

test('independent NPC expectations reject unauthorized flags, membership, record and mob mutations after an approved name change', async () => {
  const { bytes, world } = await derived(), properties = createWorldProperties(world), npcs = createNpcEditing(world, properties);
  const patch = npcs.prepare({ revision: 0, action: 'update', key: npcs.read().records[0].key, changes: { name: '已批准' } }, 0)[0]; npcs.write(patch.after);
  const expected = new Map([...npcs.expectedSections(), ...properties.expectedSections()]);
  assert.equal(preservesEditedSections(bytes, new FileSaver().save(world), expected), true);
  for (const mutate of [w => { w.NPCs.townNPCs[0].name = '未批准'; }, w => { w.NPCs.townNPCs[1].variationFlags ^= 128; }, w => { w.NPCs.shimmeredNPCIds.push(18); }, w => { w.header.tempPartyCelebratingNPCs.push(18); }, w => { w.NPCs.pillars.push({ id: 517, position: { x: 1, y: 2 } }); }]) {
    const copy = structuredClone(world); mutate(copy); copy.worldTiles = world.worldTiles;
    assert.equal(preservesEditedSections(bytes, new FileSaver().save(copy), expected), false);
  }
});

test('NPC, header, chest and tiles use one chronological history without stale independent expectations', async () => {
  const bytes = await input('v1.4.5.5'), doc = await openWorld(bytes), npc = doc.readNpcs().records[0], snapshots = [bytes];
  edit(doc, 'update', { key: npc.key, changes: { name: '混合居民', partying: !npc.partying } }); snapshots.push(doc.serialize());
  doc.editWorldProperties({ revision: doc.editState.revision, changes: { identityId: -123, name: '混合世界' } }); snapshots.push(doc.serialize());
  doc.editObject({ revision: doc.editState.revision, kind: 'chest', index: 0, changes: { name: '混合箱子' } }); snapshots.push(doc.serialize());
  doc.paint({ layer: 'wire', wireMask: 1, cells: [10 * doc.summary.height + 10] }); snapshots.push(doc.serialize());
  for (const snapshot of snapshots.slice(0, -1).reverse()) { doc.undo(); bytesEqual(doc.serialize(), snapshot); }
  for (const snapshot of snapshots.slice(1)) { doc.redo(); bytesEqual(doc.serialize(), snapshot); }
});
