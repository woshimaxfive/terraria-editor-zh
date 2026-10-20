import { TileFlag } from '../../vendor/terraria-world-file/src/index.ts';
import { EditHistory } from '../editing/EditHistory.js';

// Read and restore every stored field, including dormant flags hidden by getTile.
export const TILE_FIELDS = ['blockId', 'frameX', 'frameY', 'blockColor', 'wallId', 'wallColor', 'liquidAmount', 'liquidType', 'flags'];

export function createBlockEditing(world, ensureWritable) {
  const tiles = world.worldTiles.tiles;
  return new EditHistory({
    count: tiles.count,
    ensureWritable,
    read: index => TILE_FIELDS.map(field => tiles[field][index]),
    write(index, values) { TILE_FIELDS.forEach((field, i) => { tiles[field][index] = values[i]; }); },
    paint(index, before, blockId) {
      if (world.fileFormatHeader.importants[blockId] ||
          (tiles.hasBlock(index) && world.fileFormatHeader.importants[tiles.blockId[index]])) return null;
      const after = [...before];
      after[0] = blockId;
      after[1] = 0;
      after[2] = 0;
      after[8] |= TileFlag.IS_BLOCK_ACTIVE;
      return after;
    },
  });
}
