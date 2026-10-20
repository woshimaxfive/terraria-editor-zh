import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_RASTER_PIXELS, rasterizeRegion } from '../src/rendering/worldRaster.js';
import { constrainCamera, fitCamera, screenToWorld, visibleRegion, zoomCamera } from '../src/rendering/viewport.js';

const world = { width: 8400, height: 2400 };
const size = { width: 1200, height: 600 };

test('fit includes the world and keeps canvas center at the world center', () => {
  const camera = fitCamera(size, world);
  assert.deepEqual(screenToWorld({ x: 600, y: 300 }, camera, size), { x: 4200, y: 1200 });
  assert.ok(world.width * camera.zoom <= size.width);
  assert.ok(world.height * camera.zoom <= size.height);
  assert.deepEqual(visibleRegion(camera, size, world), { x: 0, y: 0, width: 8400, height: 2400, step: 8 });
});

test('zoom stays anchored under the pointer away from world boundaries', () => {
  const camera = { x: 4200, y: 1200, zoom: 2 };
  const point = { x: 210, y: 180 };
  const before = screenToWorld(point, camera, size);
  const next = zoomCamera(camera, 1.5, point, size, world);
  const after = screenToWorld(point, next, size);
  assert.ok(Math.abs(before.x - after.x) < 1e-9);
  assert.ok(Math.abs(before.y - after.y) < 1e-9);
});

test('camera and region stay within bounds at both extremes and different device sizes', () => {
  for (const dimensions of [{ width: 232, height: 320 }, size, { width: 3840, height: 2160 }]) {
    for (const zoom of [.001, .1, 1, 4, 1000]) {
      for (const sign of [-1, 1]) {
        const camera = constrainCamera({ x: sign * 1e9, y: sign * 1e9, zoom }, dimensions, world);
        assert.ok(camera.zoom <= 16);
        const region = visibleRegion(camera, dimensions, world);
        assert.ok(region.x >= 0 && region.y >= 0);
        assert.ok(region.x + region.width <= world.width);
        assert.ok(region.y + region.height <= world.height);
        assert.ok(region.width > 0 && region.height > 0);
        assert.ok(Math.ceil(region.width / region.step) * Math.ceil(region.height / region.step) <= MAX_RASTER_PIXELS);
      }
    }
  }
});

test('colors distinguish dirt ID zero, stone, liquid and unknown blocks', () => {
  const source = {
    width: 4, height: 600, surface: 200, rock: 400,
    readTile: x => [{ blockId: 0 }, { blockId: 1 }, { blockId: 1, liquidAmount: 255, liquidType: 1 }, { blockId: 99999 }][x],
  };
  const image = rasterizeRegion(source, { x: 0, y: 100, width: 4, height: 1, step: 1 });
  assert.deepEqual([...new Uint8Array(image.buffer)], [151, 107, 75, 255, 128, 128, 128, 255, 51, 84, 169, 255, 255, 0, 255, 255]);
});

test('sampled region matches independently cropped full pixels, including the final partial cell', () => {
  const source = { width: 8, height: 600, surface: 200, rock: 400, readTile: (x, y) => (x + y) % 2 ? { blockId: 0 } : {} };
  const full = new Uint8Array(rasterizeRegion(source, { x: 0, y: 0, width: 8, height: 600, step: 1 }).buffer);
  const image = rasterizeRegion(source, { x: 1, y: 101, width: 7, height: 9, step: 4 });
  assert.equal(image.imageWidth, 2);
  assert.equal(image.imageHeight, 3);
  const sampled = new Uint8Array(image.buffer);
  for (let row = 0; row < 3; row++) for (let column = 0; column < 2; column++) {
    const from = ((101 + row * 4) * 8 + 1 + column * 4) * 4;
    const to = (row * 2 + column) * 4;
    assert.deepEqual(sampled.slice(to, to + 4), full.slice(from, from + 4));
  }
});

test('invalid regions fail before allocating pixels or reading tiles', () => {
  const source = { ...world, readTile: () => { throw new Error('must not read'); } };
  for (const region of [
    { x: -1, y: 0, width: 1, height: 1, step: 1 },
    { x: 0, y: 0, width: 8401, height: 1, step: 1 },
    { x: 0, y: 0, width: 1, height: 1, step: 3 },
    { x: 0, y: 0, width: 1.5, height: 1, step: 1 },
    { x: 0, y: 0, width: 8400, height: 2400, step: 1 },
  ]) assert.throws(() => rasterizeRegion(source, region), /Invalid map region|pixel budget/);
});
