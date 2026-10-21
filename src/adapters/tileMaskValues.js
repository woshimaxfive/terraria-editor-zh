import { TileFlag } from '../../vendor/terraria-world-file/src/index.ts';

// Adapt opaque snapshots, retaining dormant flags and paint fields for masks.
export function tileMaskValues(tile) {
  const flags = tile[8];
  return { blockId: flags & TileFlag.IS_BLOCK_ACTIVE ? tile[0] : -1, wallId: tile[4],
    blockColor: tile[3], wallColor: tile[5], slope: (flags & TileFlag.SLOPE_MASK) >> TileFlag.SLOPE_SHIFT,
    actuator: Boolean(flags & TileFlag.ACTUATOR), actuated: Boolean(flags & TileFlag.ACTUATED),
    invisibleBlock: Boolean(flags & TileFlag.INVISIBLE_BLOCK), fullBrightBlock: Boolean(flags & TileFlag.FULL_BRIGHT_BLOCK),
    invisibleWall: Boolean(flags & TileFlag.INVISIBLE_WALL), fullBrightWall: Boolean(flags & TileFlag.FULL_BRIGHT_WALL),
    wireRed: Boolean(flags & TileFlag.WIRE_RED), wireBlue: Boolean(flags & TileFlag.WIRE_BLUE),
    wireGreen: Boolean(flags & TileFlag.WIRE_GREEN), wireYellow: Boolean(flags & TileFlag.WIRE_YELLOW),
    liquidAmount: tile[6], liquidType: tile[7] };
}
