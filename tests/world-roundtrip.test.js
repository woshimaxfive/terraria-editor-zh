import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const { openWorld, validateWorldContainer, exportFilename } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { FileReader, FileSaver } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');

async function input(name = 'v1.4.5.5') {
  const bytes = await readFile(new URL(`${name}.wld`, fixtureRoot));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

for (const fixture of fixtures) {
  test(`${fixture.name}: serialize every section, byte-compare and reopen`, async () => {
    const bytes = await input(fixture.name);
    const document = await openWorld(bytes);
    assert.equal(document.summary.formatVersion, fixture.version);
    assert.equal(document.summary.width, 4200);
    assert.equal(document.summary.height, 1200);
    assert.equal(document.summary.counts.chests, fixture.chests);
    assert.equal(document.summary.counts.npcs, 2);
    const image = document.render({ x: 100, y: 200, width: 129, height: 65, step: 2 });
    assert.equal(image.imageWidth, 65);
    assert.equal(image.imageHeight, 33);
    assert.equal(image.buffer.byteLength, 65 * 33 * 4);
    const output = document.serialize();
    assert.notEqual(output, bytes, 'must use the serializer, not return the original buffer');
    assert.deepEqual(new Uint8Array(output), new Uint8Array(bytes));
    const reloaded = await openWorld(output);
    assert.deepEqual(reloaded.summary, document.summary);
  });
}

test('reject unknown versions, wrong file types and broken section pointers', async () => {
  const base = await input();
  for (const version of [193, 327, 9999]) {
    const bytes = base.slice(0);
    new DataView(bytes).setInt32(0, version, true);
    assert.throws(() => validateWorldContainer(bytes), /暂不支持文件格式版本/);
  }
  const player = base.slice(0);
  new DataView(player).setUint8(11, 1);
  assert.throws(() => validateWorldContainer(player), /世界文件/);
  const pointers = base.slice(0);
  new DataView(pointers).setInt32(30, pointers.byteLength + 1, true);
  assert.throws(() => validateWorldContainer(pointers), /区段/);
  for (const end of [0, 20, 70, base.byteLength - 10]) {
    await assert.rejects(openWorld(base.slice(0, end)));
  }
});

test('reject malformed tile runs instead of hanging or crossing column boundaries', async () => {
  for (const run of [-1, 32767]) {
    const bytes = await input();
    const view = new DataView(bytes);
    const tilesStart = view.getInt32(30, true);
    view.setUint8(tilesStart, 128);
    view.setInt16(tilesStart + 1, run, true);
    await assert.rejects(openWorld(bytes), /无法完整读取/);
  }
});

test('footer mismatch is rejected and unknown trailing data is not silently dropped', async () => {
  const bytes = await input();
  const footerStart = new DataView(bytes).getInt32(26 + 10 * 4, true);
  const invalid = bytes.slice(0);
  new DataView(invalid).setUint8(footerStart, 0);
  await assert.rejects(openWorld(invalid), /结束校验/);
  const extra = new Uint8Array(bytes.byteLength + 5);
  extra.set(new Uint8Array(bytes));
  extra.set([1, 2, 3, 4, 5], bytes.byteLength);
  await assert.rejects(openWorld(extra.buffer));
});

test('serialization changes block export instead of silently replacing input data', async () => {
  const bytes = await input();
  new DataView(bytes).setBigUint64(16, 2n, true);
  const document = await openWorld(bytes);
  assert.throws(() => document.serialize(), error => error.code === 'EXPORT_CHANGED');
});

test('negative counts and impossible string or array sizes fail before allocation', async () => {
  for (const count of [-1, 2147483647]) {
    const bytes = await input();
    const view = new DataView(bytes);
    const entitiesStart = view.getInt32(26 + 5 * 4, true);
    view.setInt32(entitiesStart, count, true);
    await assert.rejects(openWorld(bytes), /无法完整读取/);
  }
  const bytes = await input();
  const headerStart = new DataView(bytes).getInt32(26, true);
  new Uint8Array(bytes).set([255, 255, 255, 255, 7], headerStart);
  await assert.rejects(openWorld(bytes), /无法完整读取/);
});

test('Chinese names and format 326 flags survive actual serialization', async () => {
  const world = (await new FileReader().loadBuffer(await input())).parse();
  world.fileFormatHeader.version = 326;
  world.header.mapName = '中文世界🌳';
  world.header.moreLightningSeed = true;
  world.header.noLightningSeed = true;
  const bytes = new FileSaver().save(world);
  const document = await openWorld(bytes);
  assert.equal(document.summary.name, '中文世界🌳');
  assert.equal(document.summary.formatVersion, 326);
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
  assert.equal(exportFilename('中文世界.WLD'), '中文世界-副本.wld');
});
