import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { default: IO } = await server.ssrLoadModule('/vendor/terraria-world-file/src/section/TileEntities.ts');
const { default: Reader } = await server.ssrLoadModule('/vendor/terraria-world-file/src/BinaryReader.ts');
const { default: Saver } = await server.ssrLoadModule('/vendor/terraria-world-file/src/BinarySaver.ts');
const { FileReader, FileSaver } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const ab = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
function save(data, version) {
  const saver = new Saver(); new IO().save(saver, data, { version });
  return Buffer.from(saver.getBuffer().slice(0, saver.getPosition()));
}

// Native section layout from TEdit TileEntity.Load, independent of vendor IO.
// Different item IDs in every group expose swapped slot groups and v311 order.
function native(version, { extra = 0, hatReserved = 0, full = true } = {}) {
  const chunks = [], n = (value, length) => {
    const b = Buffer.alloc(length);
    if (length === 1) b.writeUInt8(value); else if (length === 2) b.writeInt16LE(value); else b.writeInt32LE(value);
    chunks.push(b);
  };
  const item = (id, prefix = 7, stack = 3) => { n(id, 2); n(prefix, 1); n(stack, 2); };
  n(11, 4);
  for (let type = 0; type <= 10; type++) {
    n(type, 1); n(1000 + type, 4); n(100 + type, 2); n(200 + type, 2);
    if (type === 0) n(-1, 2);
    else if ([1, 4, 6, 8].includes(type)) item(full ? 100 + type : 0, full ? 7 : 0, full ? 3 : 0);
    else if (type === 2) { n(6, 1); n(1, 1); }
    else if (type === 3) {
      n(full ? 129 : 0, 1); n(full ? 66 : 0, 1);
      if (version >= 307) n(19, 1);
      if (version >= 308) n((full ? 7 : 0) | extra, 1);
      if (full) {
        item(301); item(308);
        if (version >= 308 && version !== 311) item(309);
        item(402); item(407);
        if (version >= 308) { item(409); item(501); }
        if (version === 311) item(309);
      }
    } else if (type === 5) {
      n((full ? 9 : 0) | hatReserved, 1);
      if (full) { item(601); item(702); }
    } else if (type === 9) n(4367, 2);
    else if (type === 10) n(2018, 2);
  }
  return Buffer.concat(chunks);
}

for (const version of [194, 306, 307, 308, 310, 311, 312, 318, 326]) for (const full of [false, true]) {
  test(`tile entity native ${version}/${full}: all eleven payload layouts, slot groups, pose and byte-exact roundtrip`, () => {
    const bytes = native(version, { full }), reader = new Reader().loadBuffer(ab(bytes));
    const data = new IO().parse(reader, { version });
    assert.equal(reader.getPosition(), bytes.length);
    assert.deepEqual(data.entities.map(entity => entity.type), Array.from({ length: 11 }, (_, i) => i));
    const doll = data.entities[3];
    assert.equal(doll.items[0]?.id ?? 0, full ? 301 : 0);
    assert.equal(doll.items[8]?.id ?? 0, full && version >= 308 ? 309 : 0);
    assert.equal(doll.dyes[8]?.id ?? 0, full && version >= 308 ? 409 : 0);
    assert.equal(doll.misc?.[0]?.id ?? 0, full && version >= 308 ? 501 : 0);
    assert.equal(doll.pose, version >= 307 ? 19 : undefined);
    assert.deepEqual(save(data, version), bytes);
    const moved = structuredClone(data); moved.entities[3].position = { x: 42, y: 53 };
    const expected = Buffer.from(bytes);
    // Locate the independent header directly, without using serializer offsets.
    const marker = Buffer.alloc(9); marker.writeUInt8(3); marker.writeInt32LE(1003, 1); marker.writeInt16LE(103, 5); marker.writeInt16LE(203, 7);
    const offset = expected.indexOf(marker); assert.ok(offset >= 0);
    expected.writeInt16LE(42, offset + 5); expected.writeInt16LE(53, offset + 7);
    assert.deepEqual(save(moved, version), expected);
  });
}

for (const version of [194, 308, 311, 326]) test(`tile entity ${version}: reserved doll and hat bits survive unchanged and slot edits`, () => {
  const bytes = native(version, { extra: 248, hatReserved: 240 }), io = new IO();
  const data = io.parse(new Reader().loadBuffer(ab(bytes)), { version });
  assert.deepEqual(save(data, version), bytes);
  data.entities[5].items[1] = { id: 777, prefix: 0, stack: 1 };
  const encoded = save(data, version), reparsed = io.parse(new Reader().loadBuffer(ab(encoded)), { version });
  assert.equal(reparsed.entities[5].items[1].id, 777);
  assert.equal(reparsed.entities[5].slotFlags & 240, 240);
  if (version >= 308) assert.equal(reparsed.entities[3].extraSlotFlags & 248, 248);
});

test('tile entity unknown type, truncated payload and invalid count are rejected explicitly', () => {
  const unknown = Buffer.from([1, 0, 0, 0, 99, 1, 0, 0, 0, 2, 0, 3, 0]);
  assert.throws(() => new IO().parse(new Reader().loadBuffer(ab(unknown)), { version: 326 }), /Unknown tile entity type/);
  const data = { entities: [{ type: 99, id: 1, position: { x: 2, y: 3 } }] };
  assert.throws(() => save(data, 326), /Unknown tile entity type/);
  assert.throws(() => new IO().parse(new Reader().loadBuffer(ab(Buffer.from([255, 255, 255, 255]))), { version: 326 }));
  const bytes = native(326);
  assert.throws(() => new IO().parse(new Reader().loadBuffer(ab(bytes.subarray(0, -1))), { version: 326 }));
});

for (const fixture of fixtures) test(fixture.name + ': full real world remains byte-exact after tile entity IO fixes', async () => {
  const bytes = ab(await readFile(new URL(fixture.name + '.wld', fixtureRoot)));
  const world = (await new FileReader().loadBuffer(bytes)).parse();
  assert.deepEqual(new Uint8Array(new FileSaver().save(world)), new Uint8Array(bytes));
});
