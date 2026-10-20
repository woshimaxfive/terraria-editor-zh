import { TileFlag } from '../../vendor/terraria-world-file/src/index.ts';
import { EditHistory } from '../editing/EditHistory.js';

// Read and restore every stored field, including dormant flags hidden by getTile.
export const TILE_FIELDS = ['blockId', 'frameX', 'frameY', 'blockColor', 'wallId', 'wallColor', 'liquidAmount', 'liquidType', 'flags'];

export function createBlockEditing(world, ensureWritable) {
  const tiles = world.worldTiles.tiles;
  const important = index => tiles.hasBlock(index) && world.fileFormatHeader.importants[tiles.blockId[index]];
  const blockFlags = TileFlag.IS_BLOCK_ACTIVE | TileFlag.SLOPE_MASK | TileFlag.ACTUATOR | TileFlag.ACTUATED |
    TileFlag.INVISIBLE_BLOCK | TileFlag.FULL_BRIGHT_BLOCK;
  return new EditHistory({
    count: tiles.count,
    ensureWritable,
    read: index => TILE_FIELDS.map(field => tiles[field][index]),
    write(index, values) { TILE_FIELDS.forEach((field, i) => { tiles[field][index] = values[i]; }); },
    paint(index, before, blockId) {
      if (blockId === null) {
        if (!tiles.hasBlock(index)) return before;
        const x = Math.floor(index / tiles.height), y = index % tiles.height;
        for (let bx = Math.max(0, x - 1); bx <= Math.min(tiles.width - 1, x + 1); bx++) {
          for (let by = Math.max(0, y - 1); by <= Math.min(tiles.height - 1, y + 1); by++) {
            if (important(bx * tiles.height + by)) return null;
          }
        }
        const after = [...before];
        after[0] = after[1] = after[2] = after[3] = 0;
        after[8] &= ~blockFlags;
        return after;
      }
      if (world.fileFormatHeader.importants[blockId] ||
          important(index)) return null;
      const after = [...before];
      after[0] = blockId;
      after[1] = 0;
      after[2] = 0;
      after[8] |= TileFlag.IS_BLOCK_ACTIVE;
      return after;
    },
  });
}
