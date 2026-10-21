import { TileFlag } from '../../vendor/terraria-world-file/src/index.ts';
import { EditHistory } from '../editing/EditHistory.js';
import { EditError, selectionCells } from '../editing/brush.js';
import { pasteFits, validateClipboard } from '../editing/clipboard.js';

// Read and restore every stored field, including dormant flags hidden by getTile.
export const TILE_FIELDS = ['blockId', 'frameX', 'frameY', 'blockColor', 'wallId', 'wallColor', 'liquidAmount', 'liquidType', 'flags'];

export function createBlockEditing(world, ensureWritable) {
  const tiles = world.worldTiles.tiles;
  const important = index => tiles.hasBlock(index) && world.fileFormatHeader.importants[tiles.blockId[index]];
  const blockFlags = TileFlag.IS_BLOCK_ACTIVE | TileFlag.SLOPE_MASK | TileFlag.ACTUATOR | TileFlag.ACTUATED |
    TileFlag.INVISIBLE_BLOCK | TileFlag.FULL_BRIGHT_BLOCK;
  const wallFlags = TileFlag.INVISIBLE_WALL | TileFlag.FULL_BRIGHT_WALL;
  function nearImportant(index) {
    const x = Math.floor(index / tiles.height), y = index % tiles.height;
    for (let bx = Math.max(0, x - 1); bx <= Math.min(tiles.width - 1, x + 1); bx++) {
      for (let by = Math.max(0, y - 1); by <= Math.min(tiles.height - 1, y + 1); by++) {
        if (important(bx * tiles.height + by)) return true;
      }
    }
    return false;
  }
  const entityPositions = [
    ...world.chests.chests, ...world.signs.signs, ...world.tileEntities.entities,
    ...world.weightedPressurePlates.weightedPressurePlates,
  ].map(item => item.position);
  const entityNear = (x, y) => entityPositions.some(point => Math.abs(point.x - x) <= 1 && Math.abs(point.y - y) <= 1);
  const read = index => TILE_FIELDS.map(field => tiles[field][index]);
  const editing = new EditHistory({
    count: tiles.count,
    version: world.fileFormatHeader.version,
    ensureWritable,
    validateMaterial(layer, id) {
      if (layer === 'block' && id !== null && (id >= world.fileFormatHeader.importants.length || world.fileFormatHeader.importants[id])) {
        throw new EditError('此世界不支持将该材料作为普通方块放置，未修改世界。');
      }
    },
    read,
    write(index, values) { TILE_FIELDS.forEach((field, i) => { tiles[field][index] = values[i]; }); },
    paint(index, before, blockId, layer) {
      if (layer === 'liquid') {
        const x = Math.floor(index / tiles.height), y = index % tiles.height;
        if (important(index) || entityNear(x, y)) return null;
        const after = [...before];
        after[6] = blockId.amount;
        // A dry tile has no liquid type in the world file.
        after[7] = blockId.amount ? blockId.type : 0;
        return after;
      }
      if (layer === 'wall') {
        if (blockId === null && !tiles.wallId[index]) return before;
        if (important(index) || (blockId === null && nearImportant(index))) return null;
        const after = [...before];
        after[4] = blockId ?? 0;
        if (blockId === null) { after[5] = 0; after[8] &= ~wallFlags; }
        return after;
      }
      if (blockId === null) {
        if (!tiles.hasBlock(index)) return before;
        if (nearImportant(index)) return null;
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
  editing.copy = selection => {
    const cells = selectionCells(selection, tiles);
    const snapshots = cells.map(index => {
      const x = Math.floor(index / tiles.height), y = index % tiles.height;
      if (important(index) || entityNear(x, y)) throw new EditError('选区包含家具或实体，当前仅支持复制普通图格。');
      if (tiles.hasBlock(index) && tiles.blockId[index] >= world.fileFormatHeader.importants.length) {
        throw new EditError('选区包含无法识别的方块，未复制。');
      }
      return read(index);
    });
    const clipboard = { schema: 1, formatVersion: world.fileFormatHeader.version,
      width: selection.width, height: selection.height, tiles: snapshots };
    validateClipboard(clipboard, world.fileFormatHeader.version);
    return clipboard;
  };
  editing.validateClipboard = clipboard => {
    validateClipboard(clipboard, world.fileFormatHeader.version);
    for (const tile of clipboard.tiles) {
      if ((tile[8] & TileFlag.IS_BLOCK_ACTIVE) && (tile[0] >= world.fileFormatHeader.importants.length || world.fileFormatHeader.importants[tile[0]])) {
        throw new EditError('复制内容包含特殊或无法识别的方块，未修改世界。');
      }
      const active = tile[8] & TileFlag.IS_BLOCK_ACTIVE, version = world.fileFormatHeader.version;
      const coatings = TileFlag.INVISIBLE_BLOCK | TileFlag.INVISIBLE_WALL | TileFlag.FULL_BRIGHT_BLOCK | TileFlag.FULL_BRIGHT_WALL;
      // The current writer only retains ordinary zero frames and one wall high byte.
      // Old formats cannot express shimmer/coatings. Reject instead of normalising input.
      if (tile[1] || tile[2] || (!active && (tile[0] || tile[3])) || (!tile[4] && tile[5]) ||
          tile[4] > (version < 222 ? 255 : 511) || (tile[6] ? !tile[7] : Boolean(tile[7])) ||
          (version < 269 && (tile[7] === 4 || (tile[8] & coatings)))) {
        throw new EditError('复制内容存在无法完整保存的图格，未修改世界。');
      }
    }
  };
  editing.paste = payload => {
    const { clipboard, position } = payload || {};
    editing.validateClipboard(clipboard);
    if (!pasteFits(clipboard, position, tiles)) throw new EditError('粘贴区域必须完整位于地图内，未修改世界。');
    const changes = [];
    for (let offset = 0; offset < clipboard.tiles.length; offset++) {
      const after = [...clipboard.tiles[offset]];
      const x = position.x + Math.floor(offset / clipboard.height), y = position.y + offset % clipboard.height;
      const index = x * tiles.height + y;
      if (nearImportant(index) || entityNear(x, y)) throw new EditError('粘贴区域接触家具、实体或其支撑，整次未修改世界。');
      const before = read(index);
      if (!before.every((value, i) => value === after[i])) changes.push({ index, before, after });
    }
    return editing.commit(changes);
  };
  return editing;
}
