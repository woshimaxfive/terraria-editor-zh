import { EditError } from './brush.js';
import { validateClipboard } from './clipboard.js';

export const MAX_TEMPLATE_BYTES = 2 * 1024 * 1024;
export const TEMPLATE_EXTENSION = '.tedit-template.json';
const TYPE = 'terraria-editor-zh-template';

export function encodeTemplate(clipboard) {
  validateClipboard(clipboard, clipboard?.formatVersion);
  const data = { schema: clipboard.schema, formatVersion: clipboard.formatVersion, width: clipboard.width, height: clipboard.height,
    tiles: clipboard.tiles.map(tile => [...tile]) };
  if (clipboard.schema === 2) {
    data.structures = structuredClone(clipboard.structures);
    data.objects = structuredClone(clipboard.objects);
  }
  let bytes;
  try { bytes = new TextEncoder().encode(JSON.stringify({ type: TYPE, version: clipboard.schema, clipboard: data }) + '\n'); }
  catch { throw new EditError('模板包含无法保存的数据，未导出。'); }
  if (bytes.byteLength > MAX_TEMPLATE_BYTES) throw new EditError('模板超过 2 MiB，未导出。');
  return bytes;
}

export function decodeTemplate(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_TEMPLATE_BYTES) {
    throw new EditError('模板为空或超过 2 MiB，未导入。');
  }
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new EditError('模板必须是有效的 UTF-8 JSON 文件，未导入。'); }
  if (parsed?.type !== TYPE || ![1,2].includes(parsed.version) || parsed.version !== parsed.clipboard?.schema) throw new EditError('模板类型或版本不受支持；请选择本项目导出的模板。');
  validateClipboard(parsed.clipboard, parsed.clipboard?.formatVersion);
  const { formatVersion, width, height, tiles } = parsed.clipboard;
  const result = { schema:parsed.clipboard.schema, formatVersion, width, height, tiles: tiles.map(tile => [...tile]) };
  if (result.schema === 2) {
    result.structures = structuredClone(parsed.clipboard.structures);
    result.objects = structuredClone(parsed.clipboard.objects);
  }
  return result;
}
