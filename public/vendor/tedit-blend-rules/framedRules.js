// SPDX-License-Identifier: MS-PL
// Adapted from TEdit TileProperty.GetRenderUV and WorldRenderXna, TEdit contributors.
// Fixed sources, hashes, adaptations and full license: source.json and LICENSE.
// Changes: pure geometry, local atlas dimensions and explicit deferred branches.
import data from './framed.json' with { type: 'json' };

const rules = new Map(data.tiles.map(t => [t.id, { ...t, anchors:new Map(t.anchors.map(([u,v,a]) => [u+','+v,a])) }]));
const flips = new Set(data.flip), vines = new Set(data.vines);
export const framedTileIds = Object.freeze(data.tiles.filter(t => t.eligible).map(t => t.id));
export const isFramedTexture = id => Boolean(rules.get(id)?.eligible);
export const FRAMED_OVERSCAN = Math.ceil(Math.max(...data.tiles.filter(t => t.eligible).flatMap(t => t.grid))/16)+1;
const short = value => value << 16 >> 16;

export function renderUV(id, u, v) {
  const wrap = rules.get(id)?.wrap;
  if (!wrap || !['U','V'].includes(wrap.axis) || wrap.wrapThreshold <= 0 ||
      (wrap.conditionalV !== undefined && v !== wrap.conditionalV)) return [u,v];
  const count = Math.trunc((wrap.axis === 'U' ? u : v) / wrap.wrapThreshold);
  return wrap.axis === 'U' ? [short(u-wrap.wrapThreshold*count),short(v+wrap.offsetIncrement*count)] :
    [short(u+wrap.offsetIncrement*count),short(v-wrap.wrapThreshold*count)];
}

// Pixel offsets are kept as separate anchor and shift terms. The desktop
// truncates these terms separately after zoom; merging them changes small views.
export function framedFrameAt(tile, x, atlas = { width:32768, height:32768 }) {
  return isFramedTexture(tile.blockId) ? storedFrameAt(tile,x,atlas) : null;
}

export function storedFrameAt(tile, x, atlas = { width:32768, height:32768 }) {
  const rule = rules.get(tile.blockId), u = tile.frameX ?? 0, v = tile.frameY ?? 0;
  if (!rule || !atlas || ![u,v].every(n => Number.isSafeInteger(n) && n >= -32768 && n <= 32767)) return null;
  let [sourceX,sourceY] = renderUV(tile.blockId,u,v);
  const [gridWidth,gridHeight] = rule.grid;
  let width = gridWidth > 0 ? gridWidth : 16, height = gridHeight > 0 ? gridHeight : 16;
  if (tile.blockId === 406) {
    const mode = Math.trunc(sourceY/54);
    if (mode === 1) sourceY = sourceY%54+56;
    if (mode === 2) sourceY = sourceY%54+336;
  } else if (tile.blockId === 658) {
    const mode = Math.trunc(sourceY/54);
    if (mode === 1) sourceY = sourceY%54+540;
    if (mode === 2) sourceY = sourceY%54+1080;
  } else if (tile.blockId === 733) {
    sourceX = sourceX%54+(sourceY < 54 ? 54 : 0); sourceY %= 54;
  }
  width = Math.min(width,atlas.width-sourceX); height = Math.min(height,atlas.height-sourceY);
  if (width <= 0 || height <= 0) return null;
  let anchorX = 0, anchorY = 0;
  if (gridWidth !== 16 || gridHeight !== 16) {
    const anchor = rule.anchors.get(u+','+v) || 'None';
    anchorX = anchor === 'Left' || anchor === 'Center' ? 0 : anchor === 'Right' ? 16-gridWidth : (16-gridWidth)/2;
    anchorY = anchor === 'Top' || anchor === 'Center' ? 0 : anchor === 'Bottom' ? 16-gridHeight : (16-gridHeight)/2;
  }
  let shiftX = 0, shiftY = vines.has(tile.blockId) ? -2 : 0;
  if (tile.blockId === 114 && v > 0) shiftY += 2;
  if (tile.blockId === 136) shiftX += Math.trunc(u/18) === 0 ? -2 : 2;
  if (tile.blockId === 442 && Math.trunc(u/22) === 3) shiftX += 2;
  if (tile.blockId === 733) shiftY -= 2;
  return { sourceX,sourceY,width,height,destWidth:gridWidth === 16 && gridHeight === 16 ? 16 : gridWidth,
    destHeight:gridWidth === 16 && gridHeight === 16 ? 16 : gridHeight,anchorX,anchorY,shiftX,shiftY,flip:flips.has(tile.blockId) && x%2 === 0 };
}

export function frameGeometryAtZoom(frame, zoom) {
  if (!frame) return null;
  return [frame.sourceX,frame.sourceY,frame.width,frame.height,
    Math.trunc(frame.anchorX*zoom/16)+Math.trunc(frame.shiftX*zoom/16),
    Math.trunc(frame.anchorY*zoom/16)+Math.trunc(frame.shiftY*zoom/16),
    Math.trunc(frame.destWidth*zoom/16),Math.trunc(frame.destHeight*zoom/16),Number(frame.flip)];
}
