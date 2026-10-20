import { exportFilename, MAX_WORLD_BYTES, openWorld, WorldFileError } from '../adapters/worldFile.js';

let document = null;
let filename = '';
let busy = false;

self.addEventListener('message', async ({ data }) => {
  const { id, action, file, region } = data;
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
      self.postMessage({ id, type: 'result', summary: document.summary });
    } else if (action === 'render') {
      if (!document) throw new WorldFileError('请先打开一个世界。');
      const image = document.render(region);
      self.postMessage({ id, type: 'result', image }, [image.buffer]);
    } else if (action === 'export') {
      if (!document) throw new WorldFileError('请先打开一个世界。');
      const buffer = document.serialize(progress);
      self.postMessage({ id, type: 'result', buffer, filename: exportFilename(filename) }, [buffer]);
    } else {
      throw new WorldFileError('无法识别这项操作。');
    }
  } catch (error) {
    document = null;
    self.postMessage({ id, type: 'error', message: error instanceof WorldFileError ? error.message : '文件处理失败，请重新打开世界。' });
  } finally {
    busy = false;
  }
});
