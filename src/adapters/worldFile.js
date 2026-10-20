import { FileReader, FileSaver } from '../../vendor/terraria-world-file/src/index.ts';
import { rasterizeRegion } from '../rendering/worldRaster.js';
import { createBlockEditing } from './blockEditing.js';
import { preservesOtherSections } from './verifyExport.js';
import { EditError } from '../editing/brush.js';

export const MAX_WORLD_BYTES = 128 * 1024 * 1024;
const MIN_VERSION = 194;
const MAX_VERSION = 326;

export class WorldFileError extends Error {
  constructor(message, code = 'INVALID_WORLD') {
    super(message);
    this.name = 'WorldFileError';
    this.code = code;
  }
}

// Validate the container before the upstream parser allocates tile storage.
export function validateWorldContainer(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 64) {
    throw new WorldFileError('文件不完整，无法读取世界。');
  }
  if (buffer.byteLength > MAX_WORLD_BYTES) {
    throw new WorldFileError('暂不支持超过 128 MiB 的世界文件。', 'FILE_TOO_LARGE');
  }
  const view = new DataView(buffer);
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 4, 7));
  if (magic !== 'relogic' || view.getUint8(11) !== 2) {
    throw new WorldFileError('请选择泰拉瑞亚世界文件（.wld），不能打开角色或模组配套文件。', 'WRONG_FILE_TYPE');
  }
  const version = view.getInt32(0, true);
  if (version < MIN_VERSION || version > MAX_VERSION) {
    throw new WorldFileError(`暂不支持文件格式版本 ${version}。当前支持范围为 ${MIN_VERSION}–${MAX_VERSION}。`, 'UNSUPPORTED_VERSION');
  }
  const count = view.getInt16(24, true);
  if (count !== (version < 225 ? 10 : 11)) {
    throw new WorldFileError('世界文件的区段表异常，无法安全读取。');
  }
  const tableEnd = 26 + count * 4;
  if (tableEnd + 2 > buffer.byteLength) throw new WorldFileError('世界文件已截断。');
  let previous = tableEnd + 2 + Math.ceil(view.getUint16(tableEnd, true) / 8);
  for (let i = 0; i < count; i++) {
    const pointer = view.getInt32(26 + i * 4, true);
    // Pre-1.4 files reserve a tenth, unused pointer containing zero.
    if (version < 225 && i === count - 1 && pointer === 0) continue;
    if (pointer < previous || pointer >= buffer.byteLength) {
      throw new WorldFileError('世界文件的区段位置异常或文件已截断。');
    }
    previous = pointer;
  }
  return version;
}

export function bytesEqual(first, second) {
  if (first.byteLength !== second.byteLength) return false;
  const a = new Uint8Array(first);
  const b = new Uint8Array(second);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function exportFilename(name) {
  return `${name.replace(/\.wld$/i, '')}-副本.wld`;
}

// The third-party world stays inside this adapter and its Worker.
export async function openWorld(buffer, progress = () => {}) {
  validateWorldContainer(buffer);
  try {
    const reader = await new FileReader().loadBuffer(buffer);
    const world = reader.parse({ progressCallback: progress });
    const { header, footer } = world;
    if (!footer.signoff1 || footer.signoff2 !== header.mapName || footer.signoff3 !== header.worldId) {
      throw new WorldFileError('世界文件的结束校验不一致，无法安全读取。');
    }
    const summary = {
      name: header.mapName,
      formatVersion: world.fileFormatHeader.version,
      worldId: header.worldId,
      width: header.maxTilesX,
      height: header.maxTilesY,
      seed: header.seedText,
      gameMode: header.gameMode,
      hardmode: header.hardMode,
      spawn: { x: header.spawnTileX, y: header.spawnTileY },
      counts: {
        chests: world.chests.chests.length,
        signs: world.signs.signs.length,
        npcs: world.NPCs.townNPCs.length,
        tileEntities: world.tileEntities.entities.length,
      },
    };
    let editable = false;
    function save(onProgress) {
      if (typeof ArrayBuffer.prototype.transfer !== 'function') {
        throw new WorldFileError('当前浏览器缺少文件导出能力，请更新浏览器后重试。');
      }
      return new FileSaver().save(world, onProgress);
    }
    const editing = createBlockEditing(world, () => {
      if (editable) return;
      if (!bytesEqual(buffer, save())) {
        throw new EditError('当前解析器不能完整保留这份存档，未进行修改。仍可浏览地图。');
      }
      editable = true;
    });
    return {
      summary,
      get editState() { return editing.state; },
      paint: stroke => editing.paint(stroke),
      undo: () => editing.undo(),
      redo: () => editing.redo(),
      render(region) {
        return rasterizeRegion({
          width: summary.width, height: summary.height,
          surface: header.worldSurface, rock: header.rockLayer,
          readTile: (x, y) => world.worldTiles.tiles.getTile(x, y),
        }, region);
      },
      serialize(onProgress = () => {}) {
        const output = save(onProgress);
        validateWorldContainer(output);
        if (!editable && !bytesEqual(buffer, output)) {
          throw new WorldFileError('重新生成的文件与原文件存在差异，本次未导出。当前版本暂不能完整保留这份存档。', 'EXPORT_CHANGED');
        }
        if (editable && !preservesOtherSections(buffer, output)) {
          throw new WorldFileError('未编辑的存档区段出现差异，本次未导出。请撤销修改或重新打开原始文件。', 'EXPORT_CHANGED');
        }
        editing.markExported();
        return output;
      },
    };
  } catch (error) {
    if (error instanceof WorldFileError) throw error;
    throw new WorldFileError('无法完整读取世界。文件可能损坏，或含有当前尚不支持的数据。');
  }
}
