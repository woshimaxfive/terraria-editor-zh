import { exportFilename, MAX_WORLD_BYTES, openWorld, WorldFileError } from '../adapters/worldFile.js';
import { EditError } from '../editing/brush.js';

let document = null;
let filename = '';
let busy = false;
let fillPreparation = null;

self.addEventListener('message', async ({ data }) => {
  const { id, action, file, region, stroke, point } = data;
  // Cancellation must bypass the ordinary single-request queue while traversal yields.
  if (action === 'cancelFill') {
    if (fillPreparation?.id === data.targetId) {
      fillPreparation.cancelled = true;
      document?.cancelFill();
    }
    return;
  }
  if (busy) return;
  busy = true;
  const progress = percent => self.postMessage({ id, type: 'progress', percent });
  try {
    if (action === 'open') {
      document = null;
      if (!file || !/\.wld$/i.test(file.name)) {
        throw new WorldFileError('请选择扩展名为 .wld 的世界文件。');
      }
      if (file.size > MAX_WORLD_BYTES) {
        throw new WorldFileError('暂不支持超过 128 MiB 的世界文件。');
      }
      filename = file.name;
      document = await openWorld(await file.arrayBuffer(), progress);
      self.postMessage({ id, type: 'result', summary: document.summary, editState: document.editState });
    } else if (action === 'prepareFill') {
      if (!document) throw new WorldFileError('请先打开一个世界。');
      const preparation = { id, cancelled: false };
      fillPreparation = preparation;
      const fill = await document.prepareFill(stroke, { cancelled: () => preparation.cancelled, progress });
      self.postMessage({ id, type: 'result', fill });
    } else if (['paint', 'erase', 'fillSelection', 'eraseSelection', 'paste', 'undo', 'redo', 'commitFill', 'editObject'].includes(action)) {
      if (!document) throw new WorldFileError('请先打开一个世界。');
      const editState = document[action](stroke);
      self.postMessage({ id, type: 'result', editState });
    } else if (action === 'copy' || action === 'prepareClipboard') {
      if (!document) throw new WorldFileError('请先打开一个世界。');
      const result = action === 'copy' ? document.copy(stroke) : document.prepareClipboard(stroke?.clipboard);
      self.postMessage({ id, type: 'result', ...result }, [result.image.buffer]);
    } else if (action === 'listObjects' || action === 'readObject') {
      if (!document) throw new WorldFileError('请先打开一个世界。');
      const result = action === 'listObjects' ? { objects: document.listObjects(data.kind) } : { object: document.readObject(point) };
      self.postMessage({ id, type: 'result', ...result });
    } else if (action === 'pick') {
      if (!document) throw new WorldFileError('请先打开一个世界。');
      self.postMessage({ id, type: 'result', tile: document.pick(point) });
    } else if (action === 'render') {
      if (!document) throw new WorldFileError('请先打开一个世界。');
      const image = document.render(region);
      self.postMessage({ id, type: 'result', image }, [image.buffer, ...(image.sprites ? [image.sprites] : []), ...(image.circuits ? [image.circuits] : []), ...(image.shapes ? [image.shapes] : [])]);
    } else if (action === 'export') {
      if (!document) throw new WorldFileError('请先打开一个世界。');
      const buffer = document.serialize(progress);
      self.postMessage({ id, type: 'result', buffer, filename: exportFilename(filename), editState: document.editState }, [buffer]);
    } else {
      throw new WorldFileError('无法识别这项操作。');
    }
  } catch (error) {
    const cancelled = action === 'prepareFill' && error.name === 'AbortError';
    const recoverable = Boolean(document) && (cancelled || error instanceof EditError || (action === 'export' && error instanceof WorldFileError));
    if (!recoverable) document = null;
    self.postMessage({ id, type: 'error', recoverable, cancelled, message: cancelled || error instanceof WorldFileError || error instanceof EditError ? error.message : '文件处理失败，请重新打开世界。' });
  } finally {
    busy = false;
  }
});
