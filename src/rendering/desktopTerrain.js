// SPDX-License-Identifier: MS-PL
// Adapted from desktop TEdit WorldRenderXna and TileFraming, TEdit contributors.
// Pinned source and complete license: vendor/tedit-blend-rules/.
// Changes: scoped browser region cache, bounded merge passes and palette fallback.
import { getUVForMasks, lazyMergeValidation } from '../../vendor/tedit-blend-rules/blendRules.js';

// Neighbor order and variant follow the pinned desktop renderer. Only full,
// unpainted dirt/stone/forest grass and stored-frame short plants are covered.
const offsets = [[1, 0], [0, -1], [-1, 0], [0, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]];
const bits = [1, 16, 256, 4096, 65536, 1048576, 16777216, 268435456];
export const SUPPORTED_TEXTURE_IDS = Object.freeze([0, 1, 2, 3]);
export const MAX_DETAIL_TILES = 65_536;

function shapeSupported(tile) {
  return !tile.slope && !tile.actuated && !tile.invisibleBlock && !tile.blockColor && !tile.liquidAmount;
}

// Browser adaptation of desktop WorldRenderXna's sameStyle/mergeMask and
// reciprocal lazy-merge flags, scoped to IDs 0/1/2. A bounded region cache is
// recreated for every render; edits, undo and world replacement cannot reuse it.
export function createDesktopFrames(source, region) {
  const states = new Map(), index = (x, y) => x * source.height + y;
  const merges = (a, b) => a !== 0 || b !== 0; // all non-dirt entries mergeWith=0
  // Four reciprocal passes plus the neighbor convergence check require five
  // cached cells beyond the crop. A smaller halo changes frames when panning.
  const halo = 5;
  for (let x = Math.max(0, region.x - halo); x < Math.min(source.width, region.x + region.width + halo); x++) {
    for (let y = Math.max(0, region.y - halo); y < Math.min(source.height, region.y + region.height + halo); y++) {
      const tile = source.readTile(x, y);
      if (![0, 1, 2].includes(tile.blockId) || !shapeSupported(tile)) continue;
      let same = 0, blend = 0, supported = true;
      for (let i = 0; i < offsets.length; i++) {
        const nx = x + offsets[i][0], ny = y + offsets[i][1];
        if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) continue;
        const neighbor = source.readTile(nx, ny), id = neighbor.blockId;
        if (id === undefined) continue;
        if (![0, 1, 2, 3].includes(id) || neighbor.slope || neighbor.actuated) { supported = false; continue; }
        if (id === 3) continue;
        if (tile.blockId === 1 ? id === 1 : id === tile.blockId || merges(tile.blockId, id)) same |= bits[i];
        if (tile.blockId !== 0 && id === 0) blend |= bits[i];
      }
      const variant = (x * 7 + y * 11) % 3;
      const uv = getUVForMasks(same, blend, tile.blockId, variant);
      states.set(index(x, y), { x, y, id: tile.blockId, same, blend, variant, uv, supported });
    }
  }
  let unsettled = new Set();
  for (let pass = 0; pass < 4; pass++) {
    const next = new Map();
    unsettled = new Set();
    for (const [key, state] of states) {
      let same = state.same;
      for (let i = 0; i < 4; i++) {
        const nx = state.x + offsets[i][0], ny = state.y + offsets[i][1];
        if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) continue;
        const neighbor = states.get(index(nx, ny));
        if (!neighbor || !merges(state.id, neighbor.id)) continue;
        const flags = lazyMergeValidation[neighbor.uv[1]][neighbor.uv[0]];
        if (!(flags & [4, 8, 1, 2][i])) same &= ~bits[i];
      }
      const uv = getUVForMasks(same, state.blend, state.id, state.variant);
      if (uv[0] !== state.uv[0] || uv[1] !== state.uv[1]) unsettled.add(key);
      next.set(key, uv);
    }
    for (const [key, uv] of next) states.get(key).uv = uv;
    if (!unsettled.size) break;
  }
  return (x, y, tile) => {
    if (tile.blockId === 3) return desktopFrameAt(source, x, y, tile);
    const state = states.get(index(x, y));
    if (!state?.supported || unsettled.has(index(x, y)) || offsets.some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < source.width && y + dy < source.height && unsettled.has(index(x + dx, y + dy)))) return null;
    return { sourceX: state.uv[0] * 18, sourceY: state.uv[1] * 18, width: 16, height: 16, offsetY: 0 };
  };
}

export function desktopFrameAt(source, x, y, tile = source.readTile(x, y)) {
  if (!SUPPORTED_TEXTURE_IDS.includes(tile.blockId) || tile.slope || tile.actuated || tile.invisibleBlock || tile.blockColor || tile.liquidAmount) return null;
  if (tile.blockId === 3) {
    if (![tile.frameX, tile.frameY].every(n => Number.isSafeInteger(n) && n >= 0)) return null;
    return { sourceX: tile.frameX, sourceY: tile.frameY, width: 16, height: 20, offsetY: -4 };
  }
  return createDesktopFrames(source, { x, y, width: 1, height: 1 })(x, y, tile);
}

export function atlasSupports(atlas, frame) {
  return atlas && Number.isSafeInteger(atlas.width) && Number.isSafeInteger(atlas.height) &&
    frame.sourceX >= 0 && frame.sourceY >= 0 && frame.sourceX + frame.width <= atlas.width && frame.sourceY + frame.height <= atlas.height;
}
