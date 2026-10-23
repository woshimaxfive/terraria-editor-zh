// SPDX-License-Identifier: MS-PL
// Adapted from desktop TEdit WorldRenderXna and TileFraming, TEdit contributors.
// Pinned source and complete license: vendor/tedit-blend-rules/.
// Changes: scoped browser region cache, bounded merge passes and palette fallback.
import { getUVForMasks, lazyMergeValidation } from '../../vendor/tedit-blend-rules/blendRules.js';
import { ordinaryTileIds, tileRule, isGemSpark, blendMasks, frameVariant, gemSparkFrame } from '../../vendor/tedit-blend-rules/terrainRules.js';
import { framedTileIds, isFramedTexture, framedFrameAt } from '../../vendor/tedit-blend-rules/framedRules.js';

const offsets = [[1,0],[0,-1],[-1,0],[0,1],[1,-1],[-1,-1],[-1,1],[1,1]];
export const SUPPORTED_TEXTURE_IDS = Object.freeze([...ordinaryTileIds, ...framedTileIds].sort((a,b) => a-b));
export const MAX_DETAIL_TILES = 65_536;

function shapeSupported(tile) {
  return !tile.slope && !tile.actuated && !tile.invisibleBlock && !tile.fullBrightBlock && !tile.blockColor && !tile.liquidAmount;
}

export function supportsTexture(tile) {
  return shapeSupported(tile) && (isFramedTexture(tile.blockId) || Boolean(tileRule(tile.blockId)?.ordinary));
}

// The five-cell halo isolates four reciprocal passes plus the final convergence
// check from viewport crop. Rebuilding this bounded cache makes edits, undo and
// world replacement independent of any previous rendering.
export function createDesktopFrames(source, region) {
  const states = new Map(), index = (x,y) => x * source.height + y;
  const read = (x,y) => x < 0 || y < 0 || x >= source.width || y >= source.height ? {} : source.readTile(x,y);
  for (let x = Math.max(0,region.x-5); x < Math.min(source.width,region.x+region.width+5); x++) {
    for (let y = Math.max(0,region.y-5); y < Math.min(source.height,region.y+region.height+5); y++) {
      const tile = source.readTile(x,y);
      if (!tileRule(tile.blockId)?.ordinary) continue;
      const neighbors = offsets.map(([dx,dy]) => read(x+dx,y+dy).blockId);
      const masks = blendMasks(tile.blockId,neighbors), variant = frameVariant(tile.blockId,x,y);
      const gem = isGemSpark(tile.blockId);
      const uv = gem ? gemSparkFrame(source,x,y,tile) : getUVForMasks(masks.same,masks.blend,masks.strictness,variant);
      states.set(index(x,y),{x,y,id:tile.blockId,neighbors,variant,gem,uv});
    }
  }
  let unsettled = new Set();
  for (let pass = 0; pass < 4; pass++) {
    const next = new Map();
    unsettled = new Set();
    for (const [key,state] of states) {
      if (state.gem) continue;
      const lazy = offsets.slice(0,4).map(([dx,dy]) => {
        const neighbor = states.get(index(state.x+dx,state.y+dy));
        return !neighbor || neighbor.gem ? 255 : lazyMergeValidation[neighbor.uv[1]][neighbor.uv[0]];
      });
      const masks = blendMasks(state.id,state.neighbors,lazy);
      const uv = getUVForMasks(masks.same,masks.blend,masks.strictness,state.variant);
      if (uv[0] !== state.uv[0] || uv[1] !== state.uv[1]) unsettled.add(key);
      next.set(key,uv);
    }
    for (const [key,uv] of next) states.get(key).uv = uv;
    if (!unsettled.size) break;
  }
  return (x,y,tile) => {
    if (!shapeSupported(tile)) return null;
    if (isFramedTexture(tile.blockId)) return framedFrameAt(tile,x);
    const state = states.get(index(x,y));
    if (!state || unsettled.has(index(x,y)) || offsets.some(([dx,dy]) => x+dx >= 0 && y+dy >= 0 && x+dx < source.width && y+dy < source.height && unsettled.has(index(x+dx,y+dy)))) return null;
    const grid = tileRule(state.id).grid, width = grid[0] || 16, height = grid[1] || 16;
    return {sourceX:state.uv[0]*(width+2),sourceY:state.uv[1]*(height+2),width,height,offsetY:0};
  };
}

export function desktopFrameAt(source,x,y,tile=source.readTile(x,y)) {
  if (!shapeSupported(tile) || !SUPPORTED_TEXTURE_IDS.includes(tile.blockId)) return null;
  if (isFramedTexture(tile.blockId)) return framedFrameAt(tile,x);
  return createDesktopFrames(source,{x,y,width:1,height:1})(x,y,tile);
}

export function atlasSupports(atlas,frame) {
  return atlas && Number.isSafeInteger(atlas.width) && Number.isSafeInteger(atlas.height) &&
    frame.sourceX >= 0 && frame.sourceY >= 0 && frame.sourceX+frame.width <= atlas.width && frame.sourceY+frame.height <= atlas.height;
}
