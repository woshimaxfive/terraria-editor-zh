import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { FURNITURE, furnitureFrames, furnitureWorldUV, furnitureType, furnitureLimit,
  furnitureCompanion, furnitureEntityType, searchFurniture } from '../src/editing/furniture.js';

test('every configured sprite frame matches the pinned desktop C# placement reference', () => {
  // Digest of 9546 results produced by executing the unchanged GetTiles,
  // GetWorldUV and Place(ITileData) C# bodies. No game resources are required.
  const cases = []; let count = 0;
  for (const tile of FURNITURE) for (let style = 0; style < tile.styles.length; style++) {
    const actual = furnitureFrames(tile.id, style);
    const cells = actual.frames.map(f => [f.x, f.y, f.u, f.v]);
    count += cells.length; cases.push({ id: tile.id, style, cells });
    assert.equal(cells.length, actual.width * actual.height);
    assert.ok(cells.every(([, , u, v]) => Number.isInteger(u) && u >= -32768 && u <= 32767 && Number.isInteger(v) && v >= -32768 && v <= 32767));
  }
  assert.equal(FURNITURE.length, 412); assert.equal(cases.length, 9546); assert.equal(count, 30487);
  assert.equal(createHash('sha256').update(JSON.stringify(cases)).digest('hex'), 'b428748b0a419cdf006a1298a2fceb760bf7e423656868f3609072678b3a69a4');
});

test('chest, dresser, wrapped lamp, tall gates and Christmas tree retain their specific coordinates', () => {
  assert.deepEqual(furnitureFrames(21, 0).frames.map(f => [f.u, f.v]), [[0,0],[0,18],[18,0],[18,18]]);
  const dresser = furnitureFrames(88, 64);
  assert.deepEqual([dresser.width,dresser.height], [3,2]);
  assert.deepEqual(dresser.frames.map(f => [f.u,f.v]), [[3456,0],[3456,18],[3474,0],[3474,18],[3492,0],[3492,18]]);
  assert.deepEqual(furnitureFrames(93, 129).frames.map(f => [f.u,f.v]), [[18,3456],[18,3474],[18,3492]]);
  for (const id of [388,389]) assert.deepEqual(furnitureFrames(id, 1).frames.map(f => f.v), [100,120,138,156,174]);
  const tree = furnitureFrames(171,0);
  assert.deepEqual([tree.width,tree.height],[4,8]); assert.deepEqual(tree.frames[0], {x:0,y:0,u:10,v:0});
  assert.deepEqual(tree.frames.at(-1), {x:3,y:7,u:3,v:7});
});

test('world-UV conversion follows conditional wrap truncation and ushort/short behavior', () => {
  assert.deepEqual(furnitureWorldUV(furnitureType(185), 0, 17), [0,17]);
  assert.deepEqual(furnitureWorldUV(furnitureType(185), 0, 36), [1908,18]);
  assert.deepEqual(furnitureWorldUV(furnitureType(185), 0, 0), [0,0]);
  assert.deepEqual(furnitureWorldUV({wrap: null},65535,32768),[-1,-32768]);
  assert.deepEqual(furnitureWorldUV(furnitureType(88),0,36),[1998,0]);
});

test('catalogue version filtering, exact name translations and all companion kinds remain explicit', () => {
  assert.ok(FURNITURE.every(tile=>/[一-龥]/.test(tile.zh)));
  for(const [query,id] of [['梳妆台',88],['人体模型',470],['箱子',21],['小动物锚点',724]]) assert.ok(searchFurniture(query,326).some(tile=>tile.id===id));
  assert.equal(furnitureLimit(194), 469); assert.equal(furnitureLimit(326),753);
  assert.equal(furnitureType(9999),null);
  assert.ok(searchFurniture('箱',326).some(t => t.id === 21));
  assert.ok(searchFurniture('Dresser',194).some(t => t.id === 88));
  assert.ok(!searchFurniture('',194).some(t => t.id === 470));
  for (const id of [21,88,441,467,468]) assert.equal(furnitureCompanion(id),'chest');
  for (const id of [55,85,425,573]) assert.equal(furnitureCompanion(id),'sign');
  assert.equal(furnitureCompanion(14),null);
  for (const [id,type] of [[378,0],[395,1],[423,2],[470,3],[471,4],[475,5],[520,6],[597,7],[698,8],[723,9],[724,10]]) {
    assert.equal(furnitureCompanion(id),'entity'); assert.equal(furnitureEntityType(id),type);
  }
  for (const [id,style] of [[21,-1],[21,0.5],[21,'0'],[21,9999],[9999,0]]) assert.throws(() => furnitureFrames(id,style),/家具样式无效/);
});
