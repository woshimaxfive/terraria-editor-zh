import palette from '../../vendor/tedit-map-colors/palette.json' with { type: 'json' };
import { atlasSupports, createDesktopFrames, MAX_DETAIL_TILES, supportsTexture } from './desktopTerrain.js';
import { circuitFlags } from './circuitOverlay.js';
import { appearanceColor } from './appearance.js';
import { framedFrameAt, isFramedTexture, FRAMED_OVERSCAN } from '../../vendor/tedit-blend-rules/framedRules.js';
import { spriteCommand } from './spriteCommands.js';
import { treeFrameAt, isTreeTexture, TREE_OVERSCAN } from '../../vendor/tedit-blend-rules/treeRules.js';
import {createContentScene,CONTENT_TILE_PADDING} from './contentScene.js';
import {isContentTexture} from './contentTypes.js';

export const MAX_RASTER_PIXELS = 1024 * 1024;
const UNKNOWN = [255, 0, 255];

function background(y, source) {
  if (source.background) return source.background;
  if (y >= source.height - 200) return palette.background.underworld;
  if (y >= source.rock) return palette.background.cavern;
  if (y >= source.surface) return palette.background.ground;
  const ratio = Math.max(0, Math.min(1, y / Math.max(1, source.surface)));
  return palette.background.sky[0].map((value, i) => Math.round(value + (palette.background.sky[1][i] - value) * ratio));
}

export function rasterizeRegion(source, region) {
  const { x, y, width, height, step } = region;
  const layers = { block: true, wall: true, liquid: true, wire: false, actuator: false, ...region.layers };
  if (!['block', 'wall', 'liquid', 'wire', 'actuator'].every(key => typeof layers[key] === 'boolean')) throw new Error('Invalid map layers');
  if (![x, y, width, height, step].every(Number.isSafeInteger) || x < 0 || y < 0 ||
      width < 1 || height < 1 || step < 1 || step > 64 || (step & (step - 1)) !== 0 ||
      x + width > source.width || y + height > source.height) {
    throw new Error('Invalid map region');
  }
  const imageWidth = Math.ceil(width / step);
  const imageHeight = Math.ceil(height / step);
  if (imageWidth * imageHeight > MAX_RASTER_PIXELS) throw new Error('Map region exceeds pixel budget');
  const pixels = new Uint8ClampedArray(imageWidth * imageHeight * 4);
  const detailed = Boolean(region.atlases) && step === 1 && width * height <= MAX_DETAIL_TILES;
  const frameAt = detailed && layers.block && Object.keys(region.atlases).length ? createDesktopFrames(source, region) : null;
  const sprites = [], circuits = [], shapes = [];
  const selectedTextures = new Set(region.textureIds || []), requiredTextures = new Map();
  const resourceIds=[...selectedTextures,...Object.keys(region.atlases??{}).map(Number)];
  const treeResources = detailed && resourceIds.some(id => id>=65536&&id<327680 || isTreeTexture(id));
  const content=detailed&&layers.block&&resourceIds.some(id=>id>=327680||isContentTexture(id))?
    createContentScene(source,region,selectedTextures,requiredTextures):null;
  let fallbackCount = 0, contentDrawn = 0;
  for (let row = 0; row < imageHeight; row++) {
    const tileY = y + row * step;
    const base = background(tileY, source);
    for (let column = 0; column < imageWidth; column++) {
      const tile = source.readTile(x + column * step, tileY);
      if (step === 1 && (layers.wire || layers.actuator)) {
        const tx = x + column;
        const nearby = layers.wire && (tile.wireRed || tile.wireBlue || tile.wireGreen || tile.wireYellow) ?
          [[tx - 1, tileY], [tx + 1, tileY], [tx, tileY - 1], [tx, tileY + 1]].map(([nx, ny]) =>
            nx < 0 || ny < 0 || nx >= source.width || ny >= source.height ? {} : source.readTile(nx, ny)) : [];
        const flags = circuitFlags(tile, nearby, layers);
        if (flags) circuits.push(column, row, flags);
      }
      const wallColor = layers.wall && tile.wallId ? appearanceColor(palette.walls[tile.wallId] ?? UNKNOWN,
        tile.wallColor, tile.invisibleWall, tile.fullBrightWall) : base;
      let color = wallColor;
      if (layers.block && tile.blockId !== undefined) color = appearanceColor(palette.blocks[tile.blockId] ?? UNKNOWN,
        tile.blockColor, tile.invisibleBlock, tile.fullBrightBlock);
      const liquid = layers.liquid && tile.liquidAmount > 0 && palette.liquids[tile.liquidType];
      if (region.detailShapes && step === 1 && layers.block && tile.blockId !== undefined && tile.slope >= 1 && tile.slope <= 5) {
        const shapeColor = liquid ? color.map((value, channel) => Math.round(value * .35 + liquid[channel] * .65)) : color;
        shapes.push(column, row, tile.slope, ...shapeColor);
        color = wallColor;
      }
      if (detailed && layers.block && tile.blockId !== undefined) {
        const dedicated=content&&isContentTexture(tile.blockId)&&supportsTexture(tile)?content.inspect(x+column,tileY,tile):null;
        if(dedicated){
          if(dedicated.covered){
            color=wallColor;
            if(dedicated.frame)sprites.push(spriteCommand(dedicated.resource,dedicated.frame,column,row));
            else contentDrawn++;
          }else fallbackCount++;
        }else{
        const tree = treeResources && isTreeTexture(tile.blockId) && supportsTexture(tile) ? treeFrameAt(source,x+column,tileY,tile,region.atlases) : null;
        const resource = tree?.resource ?? tile.blockId, atlas = region.atlases[resource];
        if (selectedTextures.has(resource) && supportsTexture(tile)) requiredTextures.set(resource,(requiredTextures.get(resource)||0)+1);
        const frame = atlas && supportsTexture(tile) ? tree?.frame ?? (isFramedTexture(tile.blockId) ?
          framedFrameAt(tile,x+column,atlas) : isTreeTexture(tile.blockId) ? null : frameAt(x+column,tileY,tile)) : null;
        if (frame && atlasSupports(atlas, frame)) {
          color = wallColor;
          sprites.push(spriteCommand(resource,frame,column,row));
        } else fallbackCount++;
        }
      }
      const offset = (row * imageWidth + column) * 4;
      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = liquid ? Math.round(color[channel] * .35 + liquid[channel] * .65) : color[channel];
      }
      pixels[offset + 3] = 255;
    }
  }
  const result = { x, y, width, height, step, imageWidth, imageHeight, buffer: pixels.buffer };
  if (shapes.length) result.shapes = new Int32Array(shapes).buffer;
  if (layers.wire || layers.actuator) result.circuits = new Int32Array(circuits).buffer;
  if (region.atlases) {
    // Frame sprites can overhang their origin tile. Include nearby offscreen
    // origins without allocating background pixels or touching world data.
    if (detailed && layers.block) {
      const overscan = Math.max(treeResources ? TREE_OVERSCAN : FRAMED_OVERSCAN,content?CONTENT_TILE_PADDING:0);
      const palm = treeResources && [323,131087].some(id => selectedTextures.has(id) || region.atlases[id]);
      // Palm V stores horizontal lean, rather than a texture row. Production
      // supplies measured world margins; standalone sources retain full Int16 coverage.
      const lean = palm ? source.palmPadding?.() ?? {left:2048,right:2048} : {left:0,right:0};
      for (let ty = Math.max(0,y-overscan); ty < Math.min(source.height,y+height+overscan); ty++) {
        for (let tx = Math.max(0,x-overscan-lean.left); tx < Math.min(source.width,x+width+overscan+lean.right); tx++) {
          if (tx >= x && tx < x+width && ty >= y && ty < y+height) continue;
          const tile = source.readTile(tx,ty);
          if(content && isContentTexture(tile.blockId) && supportsTexture(tile)){
            const dedicated=content.inspect(tx,ty,tile);
            if(dedicated.covered&&dedicated.frame)sprites.push(spriteCommand(dedicated.resource,dedicated.frame,tx-x,ty-y));
            continue;
          }
          if (!(isFramedTexture(tile.blockId) || treeResources && isTreeTexture(tile.blockId)) || !supportsTexture(tile)) continue;
          const tree = isTreeTexture(tile.blockId) ? treeFrameAt(source,tx,ty,tile,region.atlases) : null;
          const resource = tree?.resource ?? tile.blockId, atlas = region.atlases[resource];
          const frame = tree?.frame ?? (isFramedTexture(tile.blockId) ? framedFrameAt(tile,tx,atlas) : null);
          if (!frame || tx+(frame.anchorX+frame.shiftX+frame.destWidth)/16 < x-1 ||
              tx+(frame.anchorX+frame.shiftX)/16 > x+width+1 ||
              ty+(frame.anchorY+frame.shiftY+frame.destHeight)/16 < y-1 ||
              ty+(frame.anchorY+frame.shiftY)/16 > y+height+1) continue;
          if (selectedTextures.has(resource)) requiredTextures.set(resource,(requiredTextures.get(resource)||0)+1);
          if (atlasSupports(atlas,frame)) sprites.push(spriteCommand(resource,frame,tx-x,ty-y));
        }
      }
    }
    sprites.sort((a,b) => a[6]-b[6] || a[5]-b[5]);
    const commands = new Int32Array(sprites.flat());
    result.sprites = commands.buffer;
    result.textureStats = { detailed, drawn:sprites.length+contentDrawn, fallback: fallbackCount };
    if(content){const scene=content.finish();if(scene)result.contentScene=scene;}
    if (region.textureIds) result.requiredTextures = [...requiredTextures].sort((a,b) => b[1]-a[1] || a[0]-b[0]).map(([id]) => id);
  }
  return result;
}
