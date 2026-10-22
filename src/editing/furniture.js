// Frame geometry adapted from TEdit (MS-PL). See vendor/tedit-furniture.
import catalogue from '../../vendor/tedit-furniture/catalogue.json' with { type: 'json' };
import { EditError } from './brush.js';
import { furnitureLabels } from './furnitureLabels.js';

export const FURNITURE = catalogue.tiles.map(tile => ({...tile,zh:furnitureLabels[tile.id]??tile.zh}));
const byId = new Map(FURNITURE.map(tile => [tile.id, tile]));
const chests = new Set([21, 88, 441, 467, 468]), signs = new Set([55, 85, 425, 573]);
const entityTypes = new Map([[378, 0], [395, 1], [423, 2], [470, 3],
  [471, 4], [475, 5], [520, 6], [597, 7], [698, 8], [723, 9], [724, 10]]);
const short = value => (value << 16) >> 16;
export const furnitureLimit = version => catalogue.versions.findLast(v => v.version <= version)?.maxTileId ?? -1;
export const furnitureType = id => byId.get(id) ?? null;
export function furnitureCompanion(id) {
  return chests.has(id) ? 'chest' : signs.has(id) ? 'sign' : entityTypes.has(id) ? 'entity' : null;
}
export const furnitureEntityType = id => entityTypes.get(id);
export function searchFurniture(query, version) {
  const text = String(query).trim().toLocaleLowerCase();
  return FURNITURE.filter(tile => tile.id <= furnitureLimit(version) &&
    (!text || `${tile.id} ${tile.name} ${tile.key} ${tile.zh} ${tile.styles.map(s => `${s.name} ${s.zh ?? ''} ${s.variety ?? ''}`).join(' ')}`.toLocaleLowerCase().includes(text)));
}

// TileProperty.GetWorldUV uses unsigned inputs and signed-short output.
export function furnitureWorldUV(tile, u, v) {
  u &= 65535; v &= 65535;
  let x = u, y = v;
  const wrap = tile.wrap;
  if (wrap?.wrapThreshold > 0 && wrap.offsetIncrement > 0) {
    if (wrap.axis === 'U') {
      const count = Math.trunc((v - (wrap.conditionalV ?? 0)) / wrap.offsetIncrement);
      if (wrap.conditionalV === undefined || count > 0) {
        x += wrap.wrapThreshold * count; y -= wrap.offsetIncrement * count;
      }
    } else if (wrap.axis === 'V') {
      const count = Math.trunc(u / wrap.offsetIncrement);
      x -= wrap.offsetIncrement * count; y += wrap.wrapThreshold * count;
    }
  }
  return [short(x), short(y)];
}

export function furnitureFrames(tileId, styleIndex) {
  const tile = byId.get(tileId), style = tile?.styles[styleIndex];
  if (!Number.isSafeInteger(styleIndex) || styleIndex < 0 || !style) throw new EditError('家具样式无效，未修改世界。');
  const [width, height] = style.size ?? tile.size, [u, v] = style.uv, frames = [];
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
    let uv;
    if (tileId === 171) uv = [x === 0 && y === 0 ? 10 : x, y];
    else {
      const frameY = [388, 389].includes(tileId) && y > 0 ? v + 20 + 18 * (y - 1) : v + tile.interval[1] * y;
      uv = furnitureWorldUV(tile, u + tile.interval[0] * x, frameY);
    }
    frames.push({ x, y, u: uv[0], v: uv[1] });
  }
  return { tileId, styleIndex, width, height, frames };
}
