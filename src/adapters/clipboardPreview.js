import { rasterizeRegion } from '../rendering/worldRaster.js';

// A bounded ordinary-tile snapshot; never allocates or exposes the full world.
export function clipboardPreview(clipboard) {
  const { width, height, tiles } = clipboard;
  return rasterizeRegion({ width, height, background: [13, 21, 17], readTile(x, y) {
    const tile = tiles[x * height + y];
    return { blockId: tile[8] & 1 ? tile[0] : undefined, wallId: tile[4], liquidAmount: tile[6], liquidType: tile[7] };
  } }, { x: 0, y: 0, width, height, step: 1 });
}
