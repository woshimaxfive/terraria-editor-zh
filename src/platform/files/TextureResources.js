import { selectTextureFiles, MAX_TEXTURE_TOTAL_BYTES, validateTextureSize } from './textureFiles.js';

// A resource request owns at most one decoder worker. Old loads and bitmaps
// are released on replacement, cancellation and world close.
export class TextureResources {
  constructor(workerFactory = () => new Worker(new URL('../../workers/texture.worker.js', import.meta.url), { type: 'module' }), timeoutMs = 5000) {
    this.workerFactory = workerFactory; this.timeoutMs = timeoutMs;
    this.images = new Map(); this.worker = null; this.cancelDecode = null; this.generation = 0;
  }

  async load(files, onProgress = () => {}) {
    const selected = selectTextureFiles(files);
    this.clear();
    const generation = this.generation;
    let total = 0;
    const failures = [];
    for (const [id, file] of selected) {
      if (generation !== this.generation) throw new DOMException('资源加载已取消。', 'AbortError');
      onProgress(`正在读取 ${file.name}…`);
      try {
        const bitmap = await this.decode(file);
        if (generation !== this.generation) { bitmap.close(); throw new DOMException('资源加载已取消。', 'AbortError'); }
        try {
          validateTextureSize(bitmap.width, bitmap.height);
          const bytes = bitmap.width * bitmap.height * 4;
          if (total + bytes > MAX_TEXTURE_TOTAL_BYTES) throw new Error('贴图总内存超过 12 MiB。');
          total += bytes;
        } catch (error) { bitmap.close(); throw error; }
        this.images.set(id, bitmap);
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        failures.push(`${file.name}：${error.message}`);
      }
    }
    return { loaded: this.images.size, bytes: total, failures };
  }

  decode(file) {
    return new Promise((resolve, reject) => {
      const worker = this.workerFactory();
      this.worker = worker;
      let settled = false;
      const finish = (bitmap, error) => {
        if (settled) { bitmap?.close(); return; }
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        if (this.worker === worker) { this.worker = null; this.cancelDecode = null; }
        if (error) reject(error); else resolve(bitmap);
      };
      const timer = setTimeout(() => finish(null, new Error('读取超过 5 秒，已停止。')), this.timeoutMs);
      this.cancelDecode = () => finish(null, new DOMException('资源加载已取消。', 'AbortError'));
      worker.onmessage = ({ data }) => finish(data.bitmap, data.error ? new Error(data.error) : null);
      worker.onerror = event => { event.preventDefault(); finish(null, new Error('贴图解码失败，请检查文件或浏览器支持。')); };
      worker.onmessageerror = () => finish(null, new Error('无法读取贴图结果。'));
      try { worker.postMessage({ file }); } catch { finish(null, new Error('无法启动贴图读取。')); }
    });
  }

  get atlases() { return Object.fromEntries([...this.images].map(([id, image]) => [id, { width: image.width, height: image.height }])); }

  clear() {
    this.generation++;
    this.cancelDecode?.();
    for (const image of this.images.values()) image.close();
    this.images.clear();
  }
}
