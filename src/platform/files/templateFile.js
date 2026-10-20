import { EditError } from '../../editing/brush.js';
import { decodeTemplate, MAX_TEMPLATE_BYTES } from '../../editing/template.js';

export async function readTemplate(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_TEMPLATE_BYTES) throw new EditError('模板为空或超过 2 MiB，未导入。');
  return decodeTemplate(new Uint8Array(await file.arrayBuffer()));
}
