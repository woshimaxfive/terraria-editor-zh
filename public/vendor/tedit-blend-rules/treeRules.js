// SPDX-License-Identifier: MS-PL
// Adapted from TEdit World.GetTreeStyleAtPosition and WorldRenderXna tree paths.
// TEdit contributors; fixed sources, hashes and full license: source.json/LICENSE.
// Changes: read-only world access, explicit atlas identities and pure geometry.
import { storedFrameAt } from './framedRules.js';

export const treeTileIds = Object.freeze([5,72,323,583,584,585,586,587,588,589,596,616,634]);
export const isTreeTexture = id => treeTileIds.includes(id);
export const TREE_OVERSCAN = 10;
const treeSoils = new Map([[2,-1],[23,0],[60,1],[70,6],[109,2],[147,3],[199,4]]);
const palmSoils = new Map([[53,0],[234,1],[116,2],[112,3]]);
const key = (family,id) => family*65536+id;

function soilAt(source,x,y,palm = false,atSoil = false) {
  if (x < 0 || x >= source.width || y < 0 || y >= source.height) return palm ? 0 : -1;
  const soils = palm ? palmSoils : treeSoils;
  for (let ny = y; ny < Math.min(y+100,source.height); ny++) {
    const id = source.readTile(x,ny).blockId;
    if (soils.has(id)) return id === 60 && (atSoil ? ny : y) > source.surface ? 5 : soils.get(id);
  }
  return palm ? 0 : -1;
}

export function treeStyleAt(source,x,y) {
  const config = source.tree ?? {}, type = soilAt(source,x,y,false,true);
  if (type === 0) return 1;
  if (type === 1) return config.jungleBackground === 1 ? 11 : 2;
  if (type === 2) return 3;
  if (type === 4) return 5;
  if (type === 5) return 13;
  if (type === 6) return 14;
  if (type === 3) {
    const snow = config.snowBackground ?? 0;
    if (snow === 0) return x%10 === 0 ? 18 : 12;
    if ([2,3,32,4,42].includes(snow)) return snow%2 === 0 ? (x < source.width/2 ? 16 : 17) : (x < source.width/2 ? 17 : 16);
    return 4;
  }
  const boundaries = config.x ?? [0,0,0], styles = config.styles ?? [0,0,0,0];
  const style = styles[x <= boundaries[0] ? 0 : x <= boundaries[1] ? 1 : x <= boundaries[2] ? 2 : 3] ?? 0;
  return style === 0 ? 0 : style === 5 ? 10 : 5+style;
}

export function treeFrameAt(source,x,y,tile,atlases = {}) {
  const id = tile.blockId, u = tile.frameX ?? 0, v = tile.frameY ?? 0;
  if (!isTreeTexture(id) || ![u,v].every(n => Number.isSafeInteger(n) && n >= -32768 && n <= 32767)) return null;
  let resource = id, style = 0, baseX = 0, special = false, top = false, left = false, right = false;
  if (id === 5) {
    if (u === 66 && v <= 45) baseX++;
    if (u === 88 && v >= 66 && v <= 110) baseX--;
    if (u === 22 && v >= 132 && v < 198) baseX--;
    if (u === 44 && v >= 132 && v < 198) baseX++;
  }
  if (id !== 72 && id !== 323 && u >= 22 && v >= 198) {
    special = true; top = u === 22; left = u === 44; right = u === 66;
    if (id === 5) {
      if (left) baseX++;
      if (right) baseX--;
      style = treeStyleAt(source,x+baseX,y);
    } else style = id >= 583 && id <= 589 ? id-583+22 : id === 596 ? 29 : id === 616 ? 30 : 31;
    resource = key(top ? 2 : 3,style);
  } else if (id === 5) {
    const type = soilAt(source,x+baseX,y);
    resource = type < 0 ? 5 : key(1,type);
  }
  if (id === 323) {
    style = soilAt(source,x,y,true);
    if (u >= 88 && u <= 132) { special = true; top = true; resource = key(2,15); }
  }
  const mushroom = id === 72 && u >= 36;
  if (mushroom) resource = key(4,0);
  let frame;
  if (special || mushroom) {
    let width = 40, height = 40, sx = 0, sy = 0, anchorX = 0, anchorY = 0, shiftX = 0;
    if (mushroom) { width = 60; height = 42; sx = Math.trunc(v/18)*62; anchorY = 16-height; }
    else if (top) {
      width = 80; height = 80;
      if (id === 323) { sy = style*82; sx = Math.trunc((u-88)/22)*82; shiftX = v; }
      else {
        if ([2,11,13].includes(style)) { width = 114; height = 96; }
        else if (style === 3) { sx = x%3*246; height = 140; }
        else if (style >= 22 && style <= 28 || style === 31) { width = 116; height = 96; }
        else if ([29,30].includes(style)) { width = 118; height = 96; }
        sx += x%3*(width+2);
      }
      anchorY = 16-height;
    } else {
      if (left || right) {
        sx = right ? 42 : 0; sy = (style === 3 ? x%3*126 : 0)+x%3*42;
        anchorX = left ? 16-width : 0;
      } else anchorX = (16-width)/2;
      anchorY = (16-height)/2;
    }
    if (top || mushroom) anchorX = (16-width)/2;
    frame = {sourceX:sx,sourceY:sy,width,height,destWidth:width,destHeight:height,anchorX,anchorY,shiftX,shiftY:0,flip:false};
  } else {
    frame = storedFrameAt(id === 323 ? {...tile,frameY:22*style} : tile,x,atlases[resource]);
    if (frame && id === 323) frame = {...frame,shiftX:v};
  }
  return frame ? {resource,frame} : null;
}
