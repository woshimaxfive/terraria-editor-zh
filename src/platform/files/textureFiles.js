import { SUPPORTED_TEXTURE_IDS } from '../../rendering/desktopTerrain.js';

export const MAX_TEXTURE_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_TEXTURE_RGBA_BYTES = 8 * 1024 * 1024;
export const MAX_TEXTURE_TOTAL_BYTES = 12 * 1024 * 1024;

export function selectTextureFiles(files) {
  const selected = new Map();
  for (const file of files) {
    const match = /^Tiles_(\d+)\.(xnb|png)$/i.exec(file.name);
    if (!match || !SUPPORTED_TEXTURE_IDS.includes(Number(match[1]))) continue;
    const id = Number(match[1]);
    if (selected.has(id)) throw new Error(`Tiles_${id} 重复，请每种贴图只选择一个文件。`);
    if (!file.size || file.size > MAX_TEXTURE_FILE_BYTES) throw new Error(`${file.name} 超过单张 4 MiB 限制，或文件为空。`);
    selected.set(id, file);
  }
  if (!selected.size) throw new Error('请选择 Terraria Content/Images 中的普通地形 Tiles_编号.xnb，或对应 PNG。');
  return selected;
}

export function validateTextureSize(width, height) {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 4096) || width * height * 4 > MAX_TEXTURE_RGBA_BYTES) {
    throw new Error('贴图尺寸超过限制：单边最多 4096，解码后每张最多 8 MiB。');
  }
}

export function validateXnbHeader(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 14 || buffer.byteLength > MAX_TEXTURE_FILE_BYTES) throw new Error('XNB 文件大小无效。');
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  if (bytes[0] !== 88 || bytes[1] !== 78 || bytes[2] !== 66 || ![4, 5].includes(bytes[4]) || view.getUint32(6, true) !== buffer.byteLength) throw new Error('XNB 文件头无效或文件已截断。');
  if ((bytes[5] & 0xc0) && (view.getUint32(10, true) < 1 || view.getUint32(10, true) > MAX_TEXTURE_RGBA_BYTES + 4096)) throw new Error('XNB 解压尺寸超过限制。');
}

export function pngDimensions(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
  if (bytes.length < 33 || !signature.every((n, i) => bytes[i] === n)) throw new Error('PNG 文件头无效。');
  const width = view.getUint32(16), height = view.getUint32(20);
  validateTextureSize(width, height);
  return { width, height };
}
