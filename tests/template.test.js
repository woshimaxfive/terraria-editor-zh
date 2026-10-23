import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transformClipboard } from '../src/editing/clipboard.js';
import { decodeTemplate, encodeTemplate, MAX_TEMPLATE_BYTES } from '../src/editing/template.js';
import { readTemplate } from '../src/platform/files/templateFile.js';

const make = () => ({ schema: 1, formatVersion: 326, width: 3, height: 2,
  tiles: [0, 2, 3, 4, 5, 0].map((slope, i) => [1, i, i ? -i : 0, i + 1, 4, i + 2, 127, 1, 2047 | slope << 11]) });
// Golden mappings from unmodified desktop ClipboardBuffer.Flip executed in .NET.
const desktopSlopes = { clockwise:[0,1,4,5,2,3], counterclockwise:[0,1,4,5,2,3],
  horizontal:[0,1,3,2,5,4], vertical:[0,1,4,5,2,3] };
const operations = {
  clockwise: (x, y, w, h) => [h - 1 - y, x],
  counterclockwise: (x, y, w, h) => [y, w - 1 - x],
  horizontal: (x, y, w) => [w - 1 - x, y],
  vertical: (x, y, w, h) => [x, h - 1 - y],
};

for (const [operation, position] of Object.entries(operations)) {
  test(`${operation}: non-square positions, desktop slope styles and all other fields survive without aliasing`, () => {
    const source = make(), before = structuredClone(source), result = transformClipboard(source, operation);
    assert.equal(result.width * result.height, 6);
    for (let x = 0; x < 3; x++) for (let y = 0; y < 2; y++) {
      const original = source.tiles[x * 2 + y], [nx, ny] = position(x, y, 3, 2);
      const tile = result.tiles[nx * result.height + ny];
      assert.deepEqual(tile.slice(0, 8), original.slice(0, 8));
      assert.equal(tile[8] & 2047, original[8] & 2047);
      assert.equal((tile[8] >> 11) & 7, desktopSlopes[operation][(original[8] >> 11) & 7]);
    }
    assert.deepEqual(source, before);
    result.tiles[0][0] = 30;
    assert.deepEqual(source, before);
  });
}

test('inverse rotations, four quarter turns and two mirrors restore every snapshot field', () => {
  const source = make();
  assert.deepEqual(transformClipboard(transformClipboard(source, 'clockwise'), 'counterclockwise'), source);
  let rotated = source;
  for (let n = 0; n < 4; n++) rotated = transformClipboard(rotated, 'clockwise');
  assert.deepEqual(rotated, source);
  for (const operation of ['horizontal', 'vertical']) assert.deepEqual(transformClipboard(transformClipboard(source, operation), operation), source);
});

test('half bricks retain desktop style on all transforms; invalid operations leave the source intact', () => {
  const source = make(); source.tiles[5][8] = 2047 | 1 << 11;
  const before = structuredClone(source);
  for (const [operation, position] of Object.entries(operations)) {
    const result = transformClipboard(source, operation), [x,y] = position(2,1,3,2);
    assert.deepEqual(result.tiles[x*result.height+y], source.tiles[5]);
  }
  for (const operation of [null, '__proto__', 'toString', ['clockwise'], '']) assert.throws(() => transformClipboard(source, operation), /无法识别/);
  assert.deepEqual(source, before);
});

test('active conveyor belts exchange direction on both mirrors and retain IDs on rotations', () => {
  for (const operation of Object.keys(operations)) for (const active of [0,1]) for (const id of [421,422]) {
    const source={schema:1,formatVersion:326,width:1,height:1,tiles:[[id,0,0,0,0,0,0,0,active]]};
    const result=transformClipboard(source,operation);
    assert.equal(result.tiles[0][0],active && ['horizontal','vertical'].includes(operation) ? 843-id : id);
    assert.equal(source.tiles[0][0],id);
  }
});

test('template round-trip is UTF-8 without BOM, canonical, independent and bounded at 10000 cells', async () => {
  const source = make(); source.sourceWorldName = '不导出的世界名'; source.tiles[0].extra = '不导出的属性';
  const encoded = encodeTemplate(source), text = new TextDecoder().decode(encoded);
  assert.notDeepEqual([...encoded.slice(0, 3)], [239, 187, 191]);
  assert.equal(text.includes('不导出的'), false);
  const decoded = decodeTemplate(encoded);
  assert.deepEqual(decoded, make());
  decoded.tiles[0][0] = 30; assert.equal(source.tiles[0][0], 1);
  const maximum = { ...make(), width: 100, height: 100, tiles: Array.from({ length: 10000 }, () => [...make().tiles[0]]) };
  const bytes = encodeTemplate(maximum);
  assert.ok(bytes.byteLength < MAX_TEMPLATE_BYTES);
  assert.deepEqual(await readTemplate(new File([bytes], '中文建筑.tedit-template.json')), maximum);
});

test('invalid template signatures, encoding, fields and oversized files fail before replacing content', async () => {
  const pack = value => new TextEncoder().encode(JSON.stringify(value));
  const envelope = JSON.parse(new TextDecoder().decode(encodeTemplate(make())));
  const invalid = [new Uint8Array(), new Uint8Array([255]), new Uint8Array(MAX_TEMPLATE_BYTES + 1),
    pack(null), pack({}), pack({ ...envelope, type: 'TEditSch' }), pack({ ...envelope, version: 2 }),
    pack({ ...envelope, clipboard: { ...make(), width: 10001 } }),
    pack({ ...envelope, clipboard: { ...make(), tiles: [null] } }),
    new TextEncoder().encode('{'), new TextEncoder().encode('不是 JSON')];
  for (const bytes of invalid) assert.throws(() => decodeTemplate(bytes));
  let reads = 0;
  for (const size of [0, MAX_TEMPLATE_BYTES + 1, NaN, -1]) {
    await assert.rejects(readTemplate({ size, arrayBuffer() { reads++; } }), /模板/);
  }
  assert.equal(reads, 0);
  const hostile = JSON.parse(JSON.stringify(envelope));
  hostile.clipboard.tiles[5][8] = 6 << 11;
  assert.throws(() => decodeTemplate(pack(hostile)), /复制内容/);
});
