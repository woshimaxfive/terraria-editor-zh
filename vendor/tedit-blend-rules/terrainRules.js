// SPDX-License-Identifier: MS-PL
// Adapted from TEdit TileProperty.Merges, WorldRenderXna and TileFraming.
// Fixed original sources, hashes and full license: source.json and LICENSE.
// Changes: plain tile DTOs, pure return values and no persistent world caches.
import data from './terrain.json' with { type: 'json' };

const properties = new Map(data.tiles.map(tile => [tile.id, Object.freeze({ ...tile, grid: Object.freeze(tile.grid) })]));
export const ordinaryTileIds = Object.freeze(data.tiles.filter(tile => tile.ordinary).map(tile => tile.id));
const gemSpark = new Set(data.gemSparkIds);
export const tileRule = id => properties.get(id);
export const isGemSpark = id => gemSpark.has(id);

export function frameVariant(id, x, y) {
  const mode = properties.get(id)?.largeFrameType;
  if (mode === 1) return data.phlebas[y % 4][x % 3] - 1;
  if (mode === 2) return data.lazure[x % 2][y % 2] - 1;
  return (x * 7 + y * 11) % 3;
}

export function tilesMerge(id, otherId) {
  const a = properties.get(id), b = properties.get(otherId);
  return Boolean(a && b && ((b.mergeWith !== null && b.mergeWith === id) ||
    (a.mergeWith !== null && a.mergeWith === otherId) ||
    (a.mergeWith !== null && b.mergeWith !== null && a.mergeWith === b.mergeWith)));
}

const bits = [1, 16, 256, 4096, 65536, 1048576, 16777216, 268435456];

// Neighbor order is E,N,W,S,NE,NW,SW,SE. Undefined means inactive/outside.
// Reciprocal flags are used only when all required neighbors have a cache,
// matching the desktop's lazyCheckReady check.
export function blendMasks(id, neighbors, lazy) {
  const tile = properties.get(id);
  let same = 0, blend = 0;
  for (let i = 0; i < 8; i++) {
    const other = neighbors[i];
    if (other === undefined || other === null) continue;
    if (tile.mergeWith === -1 ? i < 4 : tile.stone ? properties.get(other)?.stone : id === other || tilesMerge(id, other)) same |= bits[i];
    if (tile.mergeWith !== null && tile.mergeWith >= 0 && other === tile.mergeWith) blend |= bits[i];
  }
  const linked = neighbors.slice(0, 4).map(other => other !== undefined && other !== null && tilesMerge(id, other));
  if (lazy && linked.every((value, i) => !value || lazy[i] !== 255)) {
    for (let i = 0; i < 4; i++) if (linked[i] && !(lazy[i] & [4, 8, 1, 2][i])) same &= ~bits[i];
  }
  return { same, blend, strictness: tile.grass ? 2 : tile.mergeWith !== null && tile.mergeWith >= 0 ? 1 : 0 };
}

// Face order: top,left,right,bottom. Retain the original six BrickStyle cases.
const faces = [
  [true,true,true,true], [false,true,true,true], [false,true,false,true],
  [false,false,true,true], [true,false,true,false], [true,false,false,true],
];
const closed = [false,false,false,false];
export function gemSparkFrame(source, x, y, tile = source.readTile(x, y)) {
  if (x < 0 || y < 0 || x >= source.width || y >= source.height || tile.blockId === undefined) return [0, 0];
  const style = tile => faces[tile.slope] || faces[0];
  const read = (dx, dy) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) return closed;
    const neighbor = source.readTile(nx, ny);
    return neighbor.blockId === tile.blockId ? style(neighbor) : closed;
  };
  const center = style(tile), cardinals = [[0,-1,0,3,1],[-1,0,1,2,2],[1,0,2,1,4],[0,1,3,0,8]];
  let index = 0;
  const connected = cardinals.map(([dx,dy,own,opposite,bit]) => {
    const neighbor = read(dx,dy);
    if (center[own] && neighbor[opposite]) { index |= bit; return neighbor; }
    return closed;
  });
  const [up,left,right,down] = connected;
  for (const [allowed,dx,dy,a,b,bit] of [
    [up[1] && left[0],-1,-1,2,3,16], [up[2] && right[0],1,-1,1,3,32],
    [down[1] && left[3],-1,1,2,0,64], [down[2] && right[3],1,1,1,0,128],
  ]) {
    if (allowed) { const corner = read(dx,dy); if (corner[a] && corner[b]) index |= bit; }
  }
  return [...(data.selfFrame8Way[index]?.[frameVariant(tile.blockId,x,y)] || [1,1])];
}
