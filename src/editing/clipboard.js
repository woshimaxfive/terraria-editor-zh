import { EditError, MAX_STROKE_TILES } from './brush.js';
import { validSelection } from './selection.js';
import { DESKTOP_SLOPES } from '../../vendor/tedit-furniture/clipboard-rules.js';

const RANGES = [[0, 65535], [-32768, 32767], [-32768, 32767], [0, 255], [0, 65535], [0, 255], [0, 255], [0, 4], [0, 16383]];

export function validateClipboard(clipboard, version) {
  if (!clipboard || ![1, 2].includes(clipboard.schema) || !Number.isSafeInteger(clipboard.formatVersion) ||
      clipboard.formatVersion < 194 || clipboard.formatVersion > 326 ||
      ![clipboard.width, clipboard.height].every(value => Number.isSafeInteger(value) && value > 0) ||
      clipboard.width * clipboard.height > MAX_STROKE_TILES || !Array.isArray(clipboard.tiles) ||
      clipboard.tiles.length !== clipboard.width * clipboard.height ||
      !Array.from(clipboard.tiles).every(tile => Array.isArray(tile) && tile.length === RANGES.length &&
        RANGES.every(([min, max], i) => Number.isSafeInteger(tile[i]) && tile[i] >= min && tile[i] <= max) &&
        ((tile[8] >> 11) & 7) <= 5)) {
    throw new EditError('复制内容无效或超过 10000 格，未修改世界。');
  }
  if (clipboard.schema === 1 && (Object.hasOwn(clipboard, 'objects') || Object.hasOwn(clipboard, 'structures'))) {
    throw new EditError('复制内容包含未声明版本的家具数据，未修改世界。');
  }
  if (clipboard.schema === 2 && (!Array.isArray(clipboard.structures) || clipboard.structures.length > clipboard.tiles.length ||
      !clipboard.objects || typeof clipboard.objects !== 'object' || Array.isArray(clipboard.objects) ||
      Object.keys(clipboard.objects).length !== 3 || !['chests','signs','entities'].every(k => Object.hasOwn(clipboard.objects,k) &&
        Array.isArray(clipboard.objects[k]) && clipboard.objects[k].length <= clipboard.tiles.length))) {
    throw new EditError('家具复制内容无效，未修改世界。');
  }
  if (clipboard.formatVersion !== version) throw new EditError('复制内容与当前世界的文件格式版本不同，暂不支持跨版本粘贴。');
}

export function pasteFits(clipboard, position, world) {
  return Boolean(clipboard && position && validSelection({ ...position, width: clipboard.width, height: clipboard.height }, world));
}

const SLOPES = DESKTOP_SLOPES;

export function transformClipboard(clipboard, operation) {
  validateClipboard(clipboard, clipboard?.formatVersion);
  if (clipboard.schema !== 1) throw new EditError('含家具的复制内容需要通过完整结构变换，复制内容未改变。');
  const slopes = SLOPES[operation];
  if (typeof operation !== 'string' || !Object.hasOwn(SLOPES, operation)) throw new EditError('无法识别这项变换，复制内容未改变。');
  const rotate = operation === 'clockwise' || operation === 'counterclockwise';
  const { width, height } = clipboard;
  const result = { schema: 1, formatVersion: clipboard.formatVersion,
    width: rotate ? height : width, height: rotate ? width : height, tiles: Array(width * height) };
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
    const tile = [...clipboard.tiles[x * height + y]], slope = (tile[8] >> 11) & 7;
    if (!rotate && (tile[8] & 1) && [421,422].includes(tile[0])) tile[0] = tile[0] === 421 ? 422 : 421;
    tile[8] = (tile[8] & ~(7 << 11)) | (slopes[slope] << 11);
    const [nx, ny] = operation === 'clockwise' ? [height - 1 - y, x] :
      operation === 'counterclockwise' ? [y, width - 1 - x] :
      operation === 'horizontal' ? [width - 1 - x, y] : [x, height - 1 - y];
    result.tiles[nx * result.height + ny] = tile;
  }
  return result;
}
