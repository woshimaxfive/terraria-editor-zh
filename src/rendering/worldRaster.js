import palette from '../../vendor/tedit-map-colors/palette.json' with { type: 'json' };

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
  const layers = { block: true, wall: true, liquid: true, ...region.layers };
  if (!['block', 'wall', 'liquid'].every(key => typeof layers[key] === 'boolean')) throw new Error('Invalid map layers');
  if (![x, y, width, height, step].every(Number.isSafeInteger) || x < 0 || y < 0 ||
      width < 1 || height < 1 || step < 1 || step > 64 || (step & (step - 1)) !== 0 ||
      x + width > source.width || y + height > source.height) {
    throw new Error('Invalid map region');
  }
  const imageWidth = Math.ceil(width / step);
  const imageHeight = Math.ceil(height / step);
  if (imageWidth * imageHeight > MAX_RASTER_PIXELS) throw new Error('Map region exceeds pixel budget');
  const pixels = new Uint8ClampedArray(imageWidth * imageHeight * 4);
  for (let row = 0; row < imageHeight; row++) {
    const tileY = y + row * step;
    const base = background(tileY, source);
    for (let column = 0; column < imageWidth; column++) {
      const tile = source.readTile(x + column * step, tileY);
      let color = layers.wall && tile.wallId ? palette.walls[tile.wallId] ?? UNKNOWN : base;
      if (layers.block && tile.blockId !== undefined) color = palette.blocks[tile.blockId] ?? UNKNOWN;
      const liquid = layers.liquid && tile.liquidAmount > 0 && palette.liquids[tile.liquidType];
      const offset = (row * imageWidth + column) * 4;
      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = liquid ? Math.round(color[channel] * .35 + liquid[channel] * .65) : color[channel];
      }
      pixels[offset + 3] = 255;
    }
  }
  return { x, y, width, height, step, imageWidth, imageHeight, buffer: pixels.buffer };
}
