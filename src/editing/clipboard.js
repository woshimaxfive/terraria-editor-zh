import { EditError, MAX_STROKE_TILES } from './brush.js';
import { validSelection } from './selection.js';

const RANGES = [[0, 65535], [-32768, 32767], [-32768, 32767], [0, 255], [0, 65535], [0, 255], [0, 255], [0, 4], [0, 16383]];

export function validateClipboard(clipboard, version) {
  if (!clipboard || clipboard.schema !== 1 || !Number.isSafeInteger(clipboard.formatVersion) ||
      clipboard.formatVersion < 194 || clipboard.formatVersion > 326 ||
      ![clipboard.width, clipboard.height].every(value => Number.isSafeInteger(value) && value > 0) ||
      clipboard.width * clipboard.height > MAX_STROKE_TILES || !Array.isArray(clipboard.tiles) ||
      clipboard.tiles.length !== clipboard.width * clipboard.height ||
      !Array.from(clipboard.tiles).every(tile => Array.isArray(tile) && tile.length === RANGES.length &&
        RANGES.every(([min, max], i) => Number.isSafeInteger(tile[i]) && tile[i] >= min && tile[i] <= max) &&
        ((tile[8] >> 11) & 7) <= 5)) {
    throw new EditError('复制内容无效或超过 10000 格，未修改世界。');
  }
  if (clipboard.formatVersion !== version) throw new EditError('复制内容与当前世界的文件格式版本不同，暂不支持跨版本粘贴。');
}

export function pasteFits(clipboard, position, world) {
  return Boolean(clipboard && position && validSelection({ ...position, width: clipboard.width, height: clipboard.height }, world));
}
