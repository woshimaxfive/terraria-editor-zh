import palette from '../../vendor/tedit-map-colors/palette.json' with { type: 'json' };
import { atlasSupports, createDesktopFrames, MAX_DETAIL_TILES } from './desktopTerrain.js';
import { circuitFlags } from './circuitOverlay.js';

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
  const sprites = [], plants = [], circuits = [];
  let fallbackCount = 0;
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
      let color = layers.wall && tile.wallId ? palette.walls[tile.wallId] ?? UNKNOWN : base;
      if (layers.block && tile.blockId !== undefined) color = palette.blocks[tile.blockId] ?? UNKNOWN;
      const liquid = layers.liquid && tile.liquidAmount > 0 && palette.liquids[tile.liquidType];
      if (detailed && layers.block && tile.blockId !== undefined) {
        const atlas = region.atlases[tile.blockId];
        const frame = atlas ? frameAt(x + column, tileY, tile) : null;
        if (frame && atlasSupports(atlas, frame)) {
          color = layers.wall && tile.wallId ? palette.walls[tile.wallId] ?? UNKNOWN : base;
          (tile.blockId === 3 ? plants : sprites).push(tile.blockId, frame.sourceX, frame.sourceY, frame.width, frame.height, column, row, frame.offsetY);
        } else fallbackCount++;
      }
      const offset = (row * imageWidth + column) * 4;
      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = liquid ? Math.round(color[channel] * .35 + liquid[channel] * .65) : color[channel];
      }
      pixels[offset + 3] = 255;
    }
  }
  const result = { x, y, width, height, step, imageWidth, imageHeight, buffer: pixels.buffer };
  if (layers.wire || layers.actuator) result.circuits = new Int32Array(circuits).buffer;
  if (region.atlases) {
    const commands = new Int32Array([...sprites, ...plants]);
    result.sprites = commands.buffer;
    result.textureStats = { detailed, drawn: commands.length / 8, fallback: fallbackCount };
  }
  return result;
}
