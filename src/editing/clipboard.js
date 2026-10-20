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

// File slope values: solid, lower half, TR, TL, BR, BL. No upper/side half exists.
const SLOPES = {
  clockwise: [0, null, 4, 2, 5, 3],
  counterclockwise: [0, null, 3, 5, 2, 4],
  horizontal: [0, 1, 3, 2, 5, 4],
  vertical: [0, null, 4, 5, 2, 3],
};

export function transformClipboard(clipboard, operation) {
  validateClipboard(clipboard, clipboard?.formatVersion);
  const slopes = SLOPES[operation];
  if (typeof operation !== 'string' || !Object.hasOwn(SLOPES, operation)) throw new EditError('无法识别这项变换，复制内容未改变。');
  const rotate = operation === 'clockwise' || operation === 'counterclockwise';
  const { width, height } = clipboard;
  const result = { schema: 1, formatVersion: clipboard.formatVersion,
    width: rotate ? height : width, height: rotate ? width : height, tiles: Array(width * height) };
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
    const tile = [...clipboard.tiles[x * height + y]], slope = (tile[8] >> 11) & 7;
    if (slopes[slope] === null) throw new EditError('此变换会产生无法保存的半砖方向，复制内容未改变；半砖可左右翻转。');
    tile[8] = (tile[8] & ~(7 << 11)) | (slopes[slope] << 11);
    const [nx, ny] = operation === 'clockwise' ? [height - 1 - y, x] :
      operation === 'counterclockwise' ? [y, width - 1 - x] :
      operation === 'horizontal' ? [width - 1 - x, y] : [x, height - 1 - y];
    result.tiles[nx * result.height + ny] = tile;
  }
  return result;
}
