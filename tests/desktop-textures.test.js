import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { getUVForMasks } from '../vendor/tedit-blend-rules/blendRules.js';
import { createDesktopFrames, desktopFrameAt, MAX_DETAIL_TILES } from '../src/rendering/desktopTerrain.js';
import { rasterizeRegion } from '../src/rendering/worldRaster.js';
import { pngDimensions, selectTextureFiles, validateTextureSize, validateXnbHeader } from '../src/platform/files/textureFiles.js';
import { TextureResources } from '../src/platform/files/TextureResources.js';

test('ported selector matches the original C# reference digest for all 59,049 mask/variant cases', () => {
  const result = [];
  for (let strictness = 0; strictness < 3; strictness++) for (let code = 0; code < 6561; code++) {
    let state = code, same = 0, blend = 0;
    for (let i = 0; i < 8; i++, state = Math.floor(state / 3)) {
      if (state % 3 === 0) same |= 16 ** i;
      if (state % 3 === 1) blend |= 16 ** i;
    }
    for (let variant = 0; variant < 3; variant++) result.push(...getUVForMasks(same, blend, strictness, variant));
  }
  // Original constructor, MatchRule and GetUVForMasks run in C#, fixed upstream
  // commit in vendor/source.json; no game image or generated JS used by oracle.
  assert.equal(createHash('sha256').update(new Uint8Array(result)).digest('hex'), 'c88999990240b2a38e136ef0aeae0ac68f9665b397d13cf0f2b4cbb24c8a57b7');
});

test('overlapping same/blend masks match all 589,824 original C# outputs', () => {
  const result = new Uint8Array(589824 * 2);
  let offset = 0;
  for (let strictness = 0; strictness < 3; strictness++) for (let code = 0; code < 65536; code++) {
    let state = code, same = 0, blend = 0;
    for (let i = 0; i < 8; i++, state = Math.floor(state / 4)) {
      if (state % 4 === 0 || state % 4 === 2) same |= 16 ** i;
      if (state % 4 === 1 || state % 4 === 2) blend |= 16 ** i;
    }
    for (let variant = 0; variant < 3; variant++) {
      const uv = getUVForMasks(same, blend, strictness, variant);
      result[offset++] = uv[0]; result[offset++] = uv[1];
    }
  }
  assert.equal(createHash('sha256').update(result).digest('hex'), '514961c36a224de035630980b3f38723a6715d1c2138c5c54a9ba0f121607622');
});

const source = (width, height, readTile) => ({ width, height, surface: 0, rock: 0, background: [20, 30, 40], readTile(x, y) {
  assert.ok(x >= 0 && y >= 0 && x < width && y < height, 'no reads outside world');
  return readTile(x, y);
} });
const atlases = { 0: { width: 288, height: 270 }, 1: { width: 288, height: 270 }, 2: { width: 288, height: 1980 }, 3: { width: 792, height: 22 } };

test('detail rendering leaves data unchanged; no resources, hidden blocks and out-of-bounds frames preserve palette', () => {
  const tiles = [{ blockId: 0, frameX: 30000 }, { blockId: 1 }, { blockId: 3, frameX: 0, frameY: 0 }];
  const world = source(3, 1, x => tiles[x]);
  const snapshot = structuredClone(tiles), region = { x: 0, y: 0, width: 3, height: 1, step: 1 };
  const color = rasterizeRegion(world, region);
  assert.deepEqual(rasterizeRegion(world, { ...region, atlases: {} }).buffer, color.buffer);
  const image = rasterizeRegion(world, { ...region, atlases });
  assert.ok(image.textureStats.drawn >= 2);
  const commands = new Int32Array(image.sprites);
  assert.deepEqual([...commands.slice(-14)], [3,0,0,16,20,2,0,16,20,0,-4,0,0,3]);
  assert.deepEqual(tiles, snapshot);
  assert.deepEqual(rasterizeRegion(world, { ...region, atlases: { 0: { width: 1, height: 1 } } }).buffer, color.buffer);
  const hidden = { ...region, layers: { block: false } };
  assert.deepEqual(rasterizeRegion(world, { ...hidden, atlases }).buffer, rasterizeRegion(world, hidden).buffer);
  assert.equal(rasterizeRegion(world, { ...hidden, atlases }).textureStats.drawn, 0);
});

test('detail allocation is capped and coarse overview never requests sprite selection', () => {
  const world = source(MAX_DETAIL_TILES + 1, 1, () => ({ blockId: 0 }));
  for (const step of [1, 2]) {
    const region = { x: 0, y: 0, width: world.width, height: 1, step };
    const image = rasterizeRegion(world, { ...region, atlases });
    assert.equal(image.textureStats.detailed, false);
    assert.equal(image.sprites.byteLength, 0);
    assert.deepEqual(image.buffer, rasterizeRegion(world, region).buffer);
  }
});

test('recreated region frames respond to neighboring edits and undo, independently of viewport crop', () => {
  let changed = false;
  const world = source(12, 12, (x, y) => x === 6 && y === 6 || (changed && x === 7 && y === 6) ? { blockId: 1 } : {});
  const full = { x: 0, y: 0, width: 12, height: 12 }, crop = { x: 5, y: 5, width: 3, height: 3 };
  const frame = () => createDesktopFrames(world, crop)(6, 6, world.readTile(6, 6));
  const before = frame();
  assert.deepEqual(before, createDesktopFrames(world, full)(6, 6, world.readTile(6, 6)));
  changed = true; assert.notDeepEqual(frame(), before);
  changed = false; assert.deepEqual(frame(), before);
  for (const tile of [{ blockId: 0, slope: 1 }, { blockId: 2, blockColor: 1 }, { blockId: 3, invisibleBlock: true }, { blockId: 1, liquidAmount: 20 }, { blockId: 128 }]) {
    assert.equal(desktopFrameAt(source(1, 1, () => tile), 0, 0), null);
  }
});

test('mixed material reciprocal passes and fallback are invariant across viewport crops', () => {
  const world = source(40, 40, (x, y) => ({ blockId: ((x * 37 + y * 19) ^ (x * y)) % 3 }));
  const whole = createDesktopFrames(world, { x: 0, y: 0, width: 40, height: 40 });
  for (const region of [{ x: 0, y: 0, width: 5, height: 8 }, { x: 12, y: 13, width: 10, height: 11 }, { x: 35, y: 32, width: 5, height: 8 }]) {
    const crop = createDesktopFrames(world, region);
    for (let x = region.x; x < region.x + region.width; x++) for (let y = region.y; y < region.y + region.height; y++) {
      assert.deepEqual(crop(x, y, world.readTile(x, y)), whole(x, y, world.readTile(x, y)));
    }
  }
});

test('resource selection filters a full directory, rejects duplicate/oversized input and validates allocation headers', () => {
  assert.equal(selectTextureFiles([{ name: 'Tiles_0.xnb', size: 128 }, { name: 'Player_0.xnb', size: 128 }]).size, 1);
  assert.throws(() => selectTextureFiles([{ name: 'Tiles_0.xnb', size: 100 }, { name: 'Tiles_0.png', size: 100 }]), /重复/);
  assert.throws(() => selectTextureFiles([{ name: 'Tiles_1.xnb', size: 5 * 1024 * 1024 }]), /限制/);
  assert.throws(() => selectTextureFiles([]), /请选择/);
  assert.throws(() => validateTextureSize(2 ** 30, 100), /限制/);
  const xnb = new Uint8Array(14); xnb.set([88, 78, 66, 119, 5, 128]);
  new DataView(xnb.buffer).setUint32(6, 14, true);
  new DataView(xnb.buffer).setUint32(10, 4 * 1024 * 1024, true);
  assert.doesNotThrow(() => validateXnbHeader(xnb.buffer));
  new DataView(xnb.buffer).setUint32(10, 2 ** 30, true);
  assert.throws(() => validateXnbHeader(xnb.buffer), /解压/);
  xnb[0] = 0; assert.throws(() => validateXnbHeader(xnb.buffer), /文件头/);
  assert.throws(() => pngDimensions(new ArrayBuffer(4)), /PNG/);
});

test('resource replacement, cancellation, decode errors and timeout release workers and bitmaps', async () => {
  const workers = [];
  const resources = new TextureResources(() => {
    const worker = { terminated: false, postMessage() {}, terminate() { this.terminated = true; } };
    workers.push(worker); return worker;
  }, 50);
  const file = { name: 'Tiles_0.xnb', size: 100 };
  let closed = 0;
  const bitmap = () => ({ width: 288, height: 270, close() { closed++; } });
  const first = resources.load([file]);
  workers[0].onmessage({ data: { bitmap: bitmap() } });
  assert.equal((await first).loaded, 1);
  assert.equal(workers[0].terminated, true);
  const canceled = resources.load([file]);
  assert.equal(closed, 1);
  resources.clear();
  await assert.rejects(canceled, { name: 'AbortError' });
  assert.equal(workers[1].terminated, true);
  assert.equal(resources.images.size, 0);
  // A late result belonging to a canceled worker must also be released.
  workers[1].onmessage({ data: { bitmap: bitmap() } });
  assert.equal(closed, 2);
  const failed = resources.load([file]);
  workers[2].onmessage({ data: { error: 'bad image' } });
  assert.equal((await failed).failures.length, 1);
  const timed = await resources.load([file]);
  assert.match(timed.failures[0], /已停止/);
  assert.equal(workers[3].terminated, true);
});
