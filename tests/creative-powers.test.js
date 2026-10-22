import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { default: BinaryReader } = await server.ssrLoadModule('/vendor/terraria-world-file/src/BinaryReader.ts');
const { default: BinarySaver } = await server.ssrLoadModule('/vendor/terraria-world-file/src/BinarySaver.ts');
const { default: CreativePowersIO } = await server.ssrLoadModule('/vendor/terraria-world-file/src/section/CreativePowers.ts');
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { FileReader } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { preservesEditedSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
const { TILE_FIELDS } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const io = new CreativePowersIO();
const decode = bytes => io.parse(new BinaryReader().loadBuffer(ab(bytes)));
function encode(data) { const writer = new BinarySaver(); io.save(writer, data); return Buffer.from(writer.getBuffer().slice(0, writer.getPosition())); }
const input = async name => ab(await readFile(new URL(name + '.wld', fixtureRoot)));
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();
const equal = (a, b) => assert.deepEqual(new Uint8Array(a), new Uint8Array(b));
// Actual unmodified desktop CreativePowers.Load/Save at 84e3fc3466d405675a09da763169774b82c22d4d.
// Original .NET reference execution also confirms empty, sparse and player-only records.
const golden = {
  empty: 'AA==',
  sparse: 'AQ0AAQEIAAAAQD8A',
  allReversed: 'AQ4AAACAPgENAAABDAAAAAA/AQsAAQEKAAABCQABAQgAAABAPwEFAAEBAAAAAA==',
  playerOnly: 'AQUAAQELAAABDgAAAIA/AA==',
  duplicates: 'AQgAAACAPgEAAAABCAAAAEA/AQAAAQA=',
};
for (const [name, value] of Object.entries(golden)) test('creative powers: desktop reference ' + name, () => {
  const bytes = Buffer.from(value, 'base64'), data = decode(bytes);
  assert.deepEqual(encode(data), bytes);
  assert.deepEqual(encode(structuredClone(data)), bytes);
  if (name === 'empty') assert.equal(data.freezeTime, undefined);
  if (name === 'sparse') { assert.equal(data.stopBiomeSpreadPower, true); assert.equal(data.modifyTimeRate, 0.75); }
  if (name === 'playerOnly') { assert.equal(data.godModePower, true); assert.equal(data.farPlacementRangePower, false); assert.equal(data.spawnRateSliderPerPlayerPower, 1); }
  if (name === 'duplicates') { assert.equal(data.records.length, 4); assert.equal(data.modifyTimeRate, 0.75); assert.equal(data.freezeTime, true); }
});
// Written as explicit raw wire bytes, independent of the production codec:
// noncanonical true markers and bools, -0, signalling/quiet NaN and Infinity.
const raw = Buffer.from([2, 13, 0, 255, 1, 8, 0, 0, 0, 0, 128, 255, 12, 0, 1, 0, 128, 127,
  1, 14, 0, 42, 0, 192, 127, 1, 8, 0, 0, 0, 128, 127, 0]);
test('creative powers: exact float and boolean bytes survive cloning and duplicate semantic values', () => {
  const data = decode(raw);
  assert.equal(data.stopBiomeSpreadPower, true);
  assert.equal(data.modifyTimeRate, Infinity);
  assert.ok(Number.isNaN(data.difficultySliderPower));
  assert.ok(Number.isNaN(data.spawnRateSliderPerPlayerPower));
  assert.ok(Object.is(new DataView(data.records[1].payload.buffer).getFloat32(0, true), -0));
  assert.deepEqual(encode(structuredClone(data)), raw);
});
test('creative powers: changes affect last record, absent fields stay absent and explicit removal removes duplicates', () => {
  const data = decode(Buffer.from(golden.duplicates, 'base64'));
  data.modifyTimeRate = 0.5;
  const expected = Buffer.from(golden.duplicates, 'base64'); expected.set([0, 0, 0, 63], 14);
  assert.deepEqual(encode(data), expected);
  data.modifyTimeRate = undefined;
  assert.deepEqual(encode(data), Buffer.from([1, 0, 0, 0, 1, 0, 0, 1, 0]));
  assert.deepEqual(encode({}), Buffer.from([0]));
  assert.deepEqual(encode({ freezeTime: false }), Buffer.from([1, 0, 0, 0, 0]));
  assert.throws(() => encode({ freezeTime: 1 }), /Invalid creative power value/);
});
test('creative powers: malformed/unknown records stop without guessing payload sizes', () => {
  for (const type of [1, 6, 7, 15, 65535]) {
    const reader = new BinaryReader().loadBuffer(ab(Buffer.from([1, type & 255, type >>> 8, 255, 255, 255, 255, 0])));
    assert.throws(() => io.parse(reader), /Unknown creative power type/);
    assert.equal(reader.getPosition(), 3);
  }
  for (const bytes of [[], [1], [1, 0], [1, 0, 0], [1, 0, 0, 1], [1, 8, 0, 0, 0, 0]]) assert.throws(() => decode(Buffer.from(bytes)));
  const data = decode(Buffer.from(golden.sparse, 'base64'));
  data.records[0].payload = new Uint8Array(); assert.throws(() => encode(data), /Invalid creative power payload/);
});
function range(bytes, index) {
  const view = new DataView(bytes), start = view.getInt32(26 + index * 4, true);
  const end = index < 10 ? view.getInt32(26 + (index + 1) * 4, true) : bytes.byteLength;
  return { start, end };
}
function replacePowers(bytes, powers) {
  const { start, end } = range(bytes, 9), output = new Uint8Array(bytes.byteLength + powers.length - (end - start));
  output.set(new Uint8Array(bytes, 0, start)); output.set(powers, start); output.set(new Uint8Array(bytes, end), start + powers.length);
  new DataView(output.buffer).setInt32(26 + 10 * 4, start + powers.length, true);
  return output.buffer;
}
for (const fixture of fixtures.filter(f => f.version >= 225)) test(fixture.name + ': derived empty powers stay empty through real edit/export/history', async () => {
  const bytes = replacePowers(await input(fixture.name), Buffer.from([0]));
  const before = await parse(bytes), doc = await openWorld(bytes);
  equal(doc.serialize(), bytes);
  doc.fillSelection({ selection: { x: 10, y: 10, width: 1, height: 1 }, layer: 'wall', wallId: 1 });
  assert.equal(doc.editState.undoCount, 1);
  const saved = doc.serialize(), after = await parse(saved);
  equal(saved.slice(range(saved, 9).start, range(saved, 9).end), new Uint8Array([0]).buffer);
  for (const field of TILE_FIELDS) {
    const expected = before.worldTiles.tiles[field].slice();
    if (field === 'wallId') expected[before.worldTiles.tiles.index(10, 10)] = 1;
    assert.deepEqual(after.worldTiles.tiles[field], expected, field);
  }
  assert.equal(preservesEditedSections(bytes, saved), true);
  doc.undo(); equal(doc.serialize(), bytes); doc.redo(); equal(doc.serialize(), saved);
});
test('derived reordered/duplicate/raw powers survive world IO and cannot bypass export guard', async () => {
  const original = await input('v1.4.5.5');
  for (const powers of [Buffer.from(golden.allReversed, 'base64'), Buffer.from(golden.duplicates, 'base64'), raw]) {
    const bytes = replacePowers(original, powers), doc = await openWorld(bytes);
    equal(doc.serialize(), bytes);
    doc.fillSelection({ selection: { x: 10, y: 10, width: 1, height: 1 }, layer: 'wall', wallId: 1 });
    const saved = doc.serialize(); assert.equal(preservesEditedSections(bytes, saved), true);
    const altered = replacePowers(saved, Buffer.from([0]));
    assert.equal(preservesEditedSections(bytes, altered), false);
    assert.equal(preservesEditedSections(bytes, altered, new Map([[9, new Uint8Array([0]).buffer]])), false);
  }
  await assert.rejects(openWorld(replacePowers(original, Buffer.from([1, 255, 255, 0]))), /无法完整读取/);
});
