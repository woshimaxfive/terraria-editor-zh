import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transformClipboard } from '../src/editing/clipboard.js';
import { decodeTemplate, encodeTemplate, MAX_TEMPLATE_BYTES } from '../src/editing/template.js';
import { readTemplate } from '../src/platform/files/templateFile.js';

const make = () => ({ schema: 1, formatVersion: 326, width: 3, height: 2,
  tiles: [0, 2, 3, 4, 5, 0].map((slope, i) => [1, i, i ? -i : 0, i + 1, 4, i + 2, 127, 1, 2047 | slope << 11]) });
// Independent geometric oracle: solid halves of the file's four triangle shapes.
function solid(slope, x, y) {
  return slope === 0 || (slope === 1 ? y >= .5 : slope === 2 ? y >= x :
    slope === 3 ? y >= 1 - x : slope === 4 ? y <= 1 - x : y <= x);
}
const operations = {
  clockwise: (x, y, w, h) => [h - 1 - y, x],
  counterclockwise: (x, y, w, h) => [y, w - 1 - x],
  horizontal: (x, y, w) => [w - 1 - x, y],
  vertical: (x, y, w, h) => [x, h - 1 - y],
};

for (const [operation, position] of Object.entries(operations)) {
  test(`${operation}: non-square positions, triangle geometry and all other fields survive without aliasing`, () => {
    const source = make(), before = structuredClone(source), result = transformClipboard(source, operation);
    assert.equal(result.width * result.height, 6);
    for (let x = 0; x < 3; x++) for (let y = 0; y < 2; y++) {
      const original = source.tiles[x * 2 + y], [nx, ny] = position(x, y, 3, 2);
      const tile = result.tiles[nx * result.height + ny];
      assert.deepEqual(tile.slice(0, 8), original.slice(0, 8));
      assert.equal(tile[8] & 2047, original[8] & 2047);
      for (let px = 0; px < 7; px++) for (let py = 0; py < 7; py++) {
        const u = (px + .25) / 8, v = (py + .6) / 8;
        // Square samples use the same transform, centred on the unit tile.
        const [tx, ty] = position(u, v, 2, 2);
        assert.equal(solid(tile[8] >> 11, tx, ty), solid(original[8] >> 11, u, v));
      }
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

test('half blocks only mirror horizontally; failed late-cell transforms preserve the entire source', () => {
  const source = make(); source.tiles[5][8] = 2047 | 1 << 11;
  const before = structuredClone(source), mirrored = transformClipboard(source, 'horizontal');
  assert.deepEqual(mirrored.tiles[1], source.tiles[5]);
  for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) {
    assert.equal(solid(1, x / 7, y / 7), solid(1, 1 - x / 7, y / 7));
  }
  for (const operation of ['clockwise', 'counterclockwise', 'vertical']) assert.throws(() => transformClipboard(source, operation), /半砖/);
  for (const operation of [null, '__proto__', 'toString', ['clockwise'], '']) assert.throws(() => transformClipboard(source, operation), /无法识别/);
  assert.deepEqual(source, before);
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
