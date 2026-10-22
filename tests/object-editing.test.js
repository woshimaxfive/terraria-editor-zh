import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';
import { EditHistory } from '../src/editing/EditHistory.js';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { createObjectEditing, validObjectItem, objectItemLimit } = await server.ssrLoadModule('/src/adapters/objectEditing.js');
const { FileReader, FileSaver } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { TILE_FIELDS } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const { preservesOtherSections, preservesEditedSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
const input = async name => { const b = await readFile(new URL(name + '.wld', fixtureRoot)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const parse = async b => (await new FileReader().loadBuffer(b)).parse();
const bytesEqual = (a, b) => assert.deepEqual(new Uint8Array(a), new Uint8Array(b));
const payload = (doc, kind, index, changes) => ({ kind, index, revision: doc.editState.revision, changes });
const item = { id: 3, stack: 7, prefix: 0 };
const catalogue = JSON.parse(await readFile(new URL('../vendor/tedit-objects/catalogue.json', import.meta.url), 'utf8'));
assert.equal(catalogue.items.length, 6170); assert.equal(catalogue.items.filter(row => row[3]).length, 6163);
assert.equal(catalogue.items.find(row => row[0] === 3)[3], '石块');
assert.equal(catalogue.prefixes.length, 98);
function unchanged(a, b, excluded = []) {
  for (const field of TILE_FIELDS) assert.deepEqual(a.worldTiles.tiles[field], b.worldTiles.tiles[field], field);
  for (const section of ['header', 'NPCs', 'tileEntities', 'weightedPressurePlates', 'townManager', 'bestiary', 'creativePowers', 'footer', 'chests', 'signs'])
    if (!excluded.includes(section)) assert.deepEqual(a[section], b[section], section);
}

test('object metadata uses pinned format boundaries and rejects malformed, out-of-version and overstacked item payloads', () => {
  assert.equal(objectItemLimit(194), 3929); assert.equal(objectItemLimit(230), 5044); assert.equal(objectItemLimit(318), 6144);
  assert.equal(validObjectItem({ id: 1, stack: 1, prefix: 85 }, 194), false); assert.equal(validObjectItem({ id: 1, stack: 1, prefix: 85 }, 318), true);
  assert.equal(validObjectItem(item, 194), true); assert.equal(validObjectItem(null, 194), true);
  for (const value of [undefined, {}, { ...item, id: 0 }, { ...item, id: 6195 }, { ...item, id: 2147483647 }, { ...item, stack: 0 }, { ...item, stack: 32768 }, { ...item, stack: 1.5 }, { ...item, prefix: 255 }, { ...item, extra: 1 }]) assert.equal(validObjectItem(value, 194), false);
});

test('tile and object edits share revisions, export dirty state, redo branches and history eviction', () => {
  const values = [0], objects = ['old']; let writable = 0;
  const history = new EditHistory({ ensureWritable() { writable++; }, write(i, v) { values[i] = v; }, writeObject(kind, i, v) { objects[i] = v; } });
  history.commit([{ index: 0, before: 0, after: 1 }]);
  history.commit([{ kind: 'sign', index: 0, before: 'old', after: 'new', cost: 1000 }]);
  assert.equal(history.retainedTiles, 1001); history.markExported(); assert.equal(history.state.dirty, false);
  history.undo(); assert.deepEqual(objects, ['old']); assert.equal(history.state.dirty, true);
  history.undo(); assert.deepEqual(values, [0]); history.redo(); history.redo(); assert.equal(history.state.dirty, false);
  history.undo(); history.commit([{ index: 0, before: 1, after: 2 }]); assert.equal(history.state.redoCount, 0); assert.equal(history.retainedTiles, 2); assert.equal(writable, 3);
  for (let i = 0; i < 60; i++) history.commit([{ kind: 'sign', index: 0, before: String(i - 1), after: String(i), cost: 1000 }]);
  assert.ok(history.retainedTiles <= 50000); assert.ok(history.state.undoCount <= 100);
  const state = history.state, prior = [...objects], calls = writable;
  assert.throws(() => history.commit([{ kind: 'sign', index: 0, before: 'old', after: 'oversized', cost: 50001 }]), /撤销记录预算/);
  assert.deepEqual(history.state, state); assert.deepEqual(objects, prior); assert.equal(writable, calls);
});

for (const fixture of fixtures) {
  test(fixture.name + ': real existing chest contents interleave with tiles and preserve every other object, field and section', async () => {
    const bytes = await input(fixture.name), original = await parse(bytes), doc = await openWorld(bytes);
    assert.equal(doc.listObjects('chest').length, fixture.chests);
    const chest = doc.readObject({ kind: 'chest', index: 0 });
    assert.equal(chest.revision, 0); assert.equal(chest.slotCount, 40);
    chest.slots[0] = item; assert.notDeepEqual(doc.readObject({ kind: 'chest', index: 0 }).slots[0], item, 'read returns a detached snapshot');
    const patch = payload(doc, 'chest', 0, { name: '中文箱子🧭', slots: [{ slot: 0, item: { ...item } }] });
    assert.equal(doc.editObject(patch).changed, 1); patch.changes.slots[0].item.stack = 99;
    assert.equal(doc.readObject({ kind: 'chest', index: 0 }).slots[0].stack, 7);
    const output = doc.serialize(), edited = await parse(output), expected = structuredClone(original.chests.chests);
    expected[0].name = '中文箱子🧭'; expected[0].items[0] = item;
    assert.deepEqual(edited.chests.chests, expected); unchanged(original, edited, ['chests']);
    assert.equal(preservesOtherSections(bytes, output), false, 'tile-only export gate still rejects changed chest data');
    assert.equal(doc.editObject(payload(doc, 'chest', 0, { name: '中文箱子🧭' })).changed, 0);
    assert.equal(doc.editState.dirty, false); assert.equal(doc.editState.undoCount, 1);
    const index = 10 * original.header.maxTilesY + 10;
    assert.equal(doc.paint({ cells: [index], blockId: 0 }).changed, 1);
    assert.equal(doc.undo().undoCount, 1); bytesEqual(doc.serialize(), output);
    assert.equal(doc.undo().undoCount, 0); bytesEqual(doc.serialize(), bytes);
    assert.equal(doc.redo().undoCount, 1); bytesEqual(doc.serialize(), output);
    assert.equal(doc.redo().undoCount, 2); assert.equal(doc.undo().undoCount, 1);
    assert.equal(doc.editObject(payload(doc, 'chest', 0, { slots: [{ slot: 0, item: null }] })).redoCount, 0);
    assert.equal(doc.readObject({ kind: 'chest', index: 0 }).slots[0], null);
    const reopened = await openWorld(doc.serialize()); assert.equal(reopened.readObject({ kind: 'chest', index: 0 }).slots[0], null);
  });

  test(fixture.name + ': explicitly derived sign section preserves UTF-8 multiline content and independent object history', async () => {
    const world = await parse(await input(fixture.name));
    world.signs.signs = [{ text: '原告示牌🧭\r\n第二行', position: { x: 30, y: 40 } }, { text: '保留的告示牌', position: { x: 35, y: 40 } }];
    const bytes = new FileSaver().save(world), doc = await openWorld(bytes);
    const patch = payload(doc, 'sign', 0, { text: '新的中文与 emoji 🧱\n第二行\nThird line' });
    assert.equal(doc.editObject(patch).changed, 1);
    const output = doc.serialize(), edited = await parse(output);
    assert.deepEqual(edited.signs.signs, [{ text: patch.changes.text, position: { x: 30, y: 40 } }, world.signs.signs[1]]);
    unchanged(world, edited, ['signs']); assert.equal(preservesOtherSections(bytes, output), false);
    doc.undo(); bytesEqual(doc.serialize(), bytes); doc.redo(); bytesEqual(doc.serialize(), output);
  });
}

test('invalid, stale and unsupported object changes are atomic and do not create undo entries or dirty state', async () => {
  const bytes = await input('v1.4.5.5'), doc = await openWorld(bytes);
  const bad = [
    { kind: 'npc', index: 0, changes: { text: 'x' } }, { kind: 'chest', index: -1, changes: { name: 'x' } },
    { kind: 'chest', index: 0, changes: { x: 10 } }, { kind: 'chest', index: 0, changes: { maxItems: 80 } },
    { kind: 'chest', index: 0, changes: { name: 'a\nb' } }, { kind: 'chest', index: 0, changes: { name: 'x'.repeat(1024 * 1024 + 1) } },
    { kind: 'chest', index: 0, changes: { slots: [{ slot: 40, item }] } },
    { kind: 'chest', index: 0, changes: { slots: [{ slot: 0, item }, { slot: 0, item }] } },
    { kind: 'chest', index: 0, changes: { slots: [{ slot: 0, item: { ...item, stack: 0 } }] } },
    { kind: 'chest', index: 0, changes: { slots: [{ slot: 0, item: { ...item, id: 6195 } }] } },
    { kind: 'chest', index: 0, revision: 99, changes: { name: 'stale' } },
  ];
  for (const value of bad) { assert.throws(() => doc.editObject({ revision: 0, ...value })); assert.equal(doc.editState.undoCount, 0); assert.equal(doc.editState.dirty, false); }
  bytesEqual(doc.serialize(), bytes);
});

test('modern variable-slot chests retain unknown untouched item bytes and reject edits to slot counts or unsupported item IDs', async () => {
  const world = await parse(await input('v1.4.5.5'));
  world.chests.chests[0].maxItems = 80; world.chests.chests[0].items.push(...Array(40).fill(null));
  world.chests.chests[0].items[79] = { id: 2147483647, stack: 2, prefix: 255 };
  const bytes = new FileSaver().save(world), doc = await openWorld(bytes);
  assert.equal(doc.readObject({ kind: 'chest', index: 0 }).slotCount, 80);
  doc.editObject(payload(doc, 'chest', 0, { name: '八十槽', slots: [{ slot: 40, item }] }));
  const edited = await parse(doc.serialize()); assert.equal(edited.chests.chests[0].maxItems, 80);
  assert.deepEqual(edited.chests.chests[0].items[79], world.chests.chests[0].items[79]); assert.deepEqual(edited.chests.chests[0].items[40], item);
  assert.throws(() => doc.editObject(payload(doc, 'chest', 0, { slots: [{ slot: 79, item: world.chests.chests[0].items[79] }] })));
  doc.undo(); bytesEqual(doc.serialize(), bytes);
});

test('scoped export rejects unrelated objects, positions, slots, signs, headers, broken pointers and broadened allowlists', async () => {
  const world = await parse(await input('v1.4.5.5')), original = new FileSaver().save(world), objects = createObjectEditing(world);
  const change = objects.prepare({ kind: 'chest', index: 0, revision: 0, changes: { name: '允许的修改', slots: [{ slot: 0, item }] } }, 0);
  objects.write(change.kind, change.index, change.after);
  const allowed = objects.expectedSections(), valid = new FileSaver().save(world);
  assert.equal(preservesEditedSections(original, valid, allowed), true);
  for (const mutate of [
    () => world.chests.chests[1].name = '未编辑对象', () => world.chests.chests[0].position.x++,
    () => world.chests.chests[0].items[1] = item, () => world.signs.signs.push({ text: '未授权', position: { x: 20, y: 20 } }),
    () => world.header.seedText += 'x',
  ]) {
    const before = structuredClone({ chests: world.chests.chests, signs: world.signs.signs, seed: world.header.seedText });
    mutate(); assert.equal(preservesEditedSections(original, new FileSaver().save(world), allowed), false);
    world.chests.chests = before.chests; world.signs.signs = before.signs; world.header.seedText = before.seed;
  }
  const broken = valid.slice(0); new DataView(broken).setInt32(34, 1, true);
  assert.equal(preservesEditedSections(original, broken, allowed), false);
  assert.equal(preservesEditedSections(original, valid, new Map([[4, new ArrayBuffer(0)]])), false);
  assert.equal(preservesEditedSections(original, new ArrayBuffer(5), allowed), false);
});
