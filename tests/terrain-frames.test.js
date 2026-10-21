import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectTerrainFrame, terrainFrameAt } from '../src/rendering/terrainFrames.js';

const empty = () => Array(8).fill(null);
const sourceCell = frame => [frame.sourceX / 18, frame.sourceY / 18];

test('ordinary terrain ignores stored frames, distinguishing isolated tiles, edges and internal corners', () => {
  assert.deepEqual(sourceCell(selectTerrainFrame(0, empty(), 0)), [9, 3]); // D10
  assert.deepEqual(sourceCell(selectTerrainFrame(0, [0, null, 0, 0, null, null, 0, 0], 1)), [2, 0]); // A3
  const neighbors = Array(8).fill(0);
  assert.deepEqual(sourceCell(selectTerrainFrame(0, neighbors, 0)), [1, 1]); // B2
  neighbors[4] = null; neighbors[6] = null;
  assert.deepEqual(sourceCell(selectTerrainFrame(0, neighbors, 0)), [10, 0]); // A11 overrides B2
  assert.equal(selectTerrainFrame(999, neighbors), null);
});

test('stone uses dirt blend sheets, including diagonal dirt and mixed junctions', () => {
  assert.deepEqual(sourceCell(selectTerrainFrame(1, [1, null, 1, 0, null, null, null, null])), [13, 0]); // A14
  assert.deepEqual(sourceCell(selectTerrainFrame(1, [0, 0, 0, 1, null, null, null, null])), [11, 5]); // F12
  assert.deepEqual(sourceCell(selectTerrainFrame(1, [1, 1, 1, 1, 1, 1, 1, 0])), [0, 5]); // F1
  assert.deepEqual(sourceCell(selectTerrainFrame(1, [null, null, null, 0, null, null, null, null])), [6, 5]); // F7
});

test('grass chooses dedicated corners and treats dirt as connected only after special rules fail', () => {
  assert.deepEqual(sourceCell(selectTerrainFrame(2, [2, 0, null, 0, null, null, null, null])), [0, 15]); // P1
  assert.deepEqual(sourceCell(selectTerrainFrame(2, [2, null, 2, 2, null, null, null, null])), [8, 12]); // M9
  assert.deepEqual(sourceCell(selectTerrainFrame(2, [2, null, 2, 2, null, null, 0, null])), [0, 18]); // S1: BL may be grass OR dirt
  const junction = [2, 2, 2, 2, null, null, null, null];
  assert.deepEqual(sourceCell(selectTerrainFrame(2, junction)), [8, 13]); // N9: more specific than R3
  const fallback = [2, null, 2, 0, null, null, null, null];
  assert.deepEqual(sourceCell(selectTerrainFrame(2, fallback)), [1, 0]); // A2, dirt fills bottom edge
  assert.deepEqual(sourceCell(selectTerrainFrame(0, Array(8).fill(2))), [1, 1]); // dirt joins grass
});

test('all 3^8 neighbor states and variants yield bounded immutable frames, including cache hits', () => {
  const dimensions = [[288, 270], [288, 270], [288, 1980]];
  for (const id of [0, 1, 2]) for (let code = 0; code < 3 ** 8; code++) {
    let value = code;
    const neighbors = Array.from({ length: 8 }, () => { const state = value % 3; value = Math.floor(value / 3); return state === 0 ? id : state === 1 ? (id === 0 ? 2 : 0) : null; });
    for (const variant of [0, 1, 2]) {
      const frame = selectTerrainFrame(id, neighbors, variant);
      assert.ok(Number.isSafeInteger(frame.sourceX) && frame.sourceX >= 0 && frame.sourceX + 16 <= dimensions[id][0]);
      assert.ok(Number.isSafeInteger(frame.sourceY) && frame.sourceY >= 0 && frame.sourceY + 16 <= dimensions[id][1]);
      assert.ok(Object.isFrozen(frame));
      assert.equal(selectTerrainFrame(id, neighbors, variant), frame);
    }
  }
  assert.deepEqual(selectTerrainFrame(0, Array(8)), selectTerrainFrame(0, empty()));
  assert.deepEqual(selectTerrainFrame(0, Array(8).fill(9000)), selectTerrainFrame(0, empty()));
});

test('world boundaries and unsupported shapes do not read outside the world', () => {
  const reads = [];
  const source = { width: 1, height: 1, readTile(x, y) { assert.equal(x, 0); assert.equal(y, 0); reads.push([x, y]); return { blockId: 0, frameX: 30000, frameY: 30000 }; } };
  const frame = terrainFrameAt(source, 0, 0);
  assert.ok(frame);
  assert.equal(reads.length, 1);
  const before = reads.length;
  for (const [x, y] of [[-1, 0], [0, 1], [NaN, 0], [.5, 0]]) assert.throws(() => terrainFrameAt(source, x, y), /Invalid terrain position/);
  assert.equal(reads.length, before);
  for (const tile of [{}, { blockId: 3 }, { blockId: 0, slope: 1 }, { blockId: 1, actuated: true }, { blockId: 2, invisibleBlock: true }]) {
    assert.equal(terrainFrameAt({ width: 1, height: 1, readTile: () => tile }, 0, 0), null);
  }
});

test('view crops keep world-space variants and read a halo; edits immediately affect neighboring frames', () => {
  const data = Array.from({ length: 25 }, () => ({ blockId: 0 }));
  const source = { width: 5, height: 5, readTile: (x, y) => data[y * 5 + x] };
  const before = terrainFrameAt(source, 2, 2);
  const serialized = JSON.stringify(data);
  assert.deepEqual(terrainFrameAt(source, 2, 2), before);
  assert.equal(JSON.stringify(data), serialized);
  data[1 * 5 + 2] = {}; // delete tile above the visible tile
  const after = terrainFrameAt(source, 2, 2);
  assert.equal(before.sourceY, 18);
  assert.equal(after.sourceY, 0);
  data[1 * 5 + 2] = { blockId: 0 };
  assert.deepEqual(terrainFrameAt(source, 2, 2), before);
});

test('invalid neighbor states and variants fail before cache lookup', () => {
  for (const neighbors of [null, [], Array(7).fill(0), [...Array(7).fill(0), -1], [...Array(7).fill(0), NaN], [...Array(7).fill(0), '0']]) assert.throws(() => selectTerrainFrame(0, neighbors), /Invalid terrain frame input/);
  for (const variant of [-1, 3, .5, Infinity]) assert.throws(() => selectTerrainFrame(0, empty(), variant), /Invalid terrain frame input/);
});
