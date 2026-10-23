import { selectTextureFiles, MAX_TEXTURE_TOTAL_BYTES, validateTextureSize } from './textureFiles.js';

const cancelled = () => new DOMException('资源加载已取消。', 'AbortError');

// Files remain local references. A single decoder fills a bounded bitmap cache;
// visible IDs are supplied in priority order and already accepted IDs are pinned.
export class TextureResources {
  constructor(workerFactory = () => new Worker(new URL('../../workers/texture.worker.js', import.meta.url), { type: 'module' }), timeoutMs = 5000) {
    this.workerFactory = workerFactory; this.timeoutMs = timeoutMs;
    this.images = new Map(); this.files = new Map(); this.sizes = new Map(); this.errors = new Map();
    this.worker = null; this.cancelDecode = null; this.generation = 0; this.request = 0; this.bytes = 0;
  }

  async load(files, onProgress = () => {}, { defer = false, append = false } = {}) {
    const selected = selectTextureFiles(files);
    if (!append) { this.clear(); this.files = selected; }
    else {
      this.generation++; this.cancel();
      for(const [id,file]of selected){
        const previous=this.images.get(id);
        if(previous){previous.close();this.images.delete(id);this.bytes-=this.sizes.get(id);}
        this.sizes.delete(id);this.errors.delete(id);this.files.set(id,file);
      }
    }
    if (defer) return { selected:this.files.size, loaded:this.images.size, bytes:this.bytes, failures:[] };
    return this.ensure([...selected.keys()], onProgress);
  }

  cancel() {
    this.request++;
    this.cancelDecode?.();
  }

  async ensure(ids, onProgress = () => {}) {
    this.cancel();
    const generation = this.generation, request = this.request, pinned = new Set(), failures = [];
    let changed = false;
    const current = () => {
      if (generation !== this.generation || request !== this.request) throw cancelled();
    };
    const wanted = [...new Set(ids)].filter(id => this.files.has(id));
    for (const id of wanted) {
      current();
      const file = this.files.get(id);
      if (this.errors.has(id)) { failures.push(this.errors.get(id)); continue; }
      if (this.images.has(id)) {
        const bitmap = this.images.get(id);
        this.images.delete(id); this.images.set(id, bitmap); pinned.add(id);
        continue;
      }
      const protectedBytes = [...pinned].reduce((total,key) => total + this.sizes.get(key), 0);
      if (this.sizes.has(id) && protectedBytes + this.sizes.get(id) > MAX_TEXTURE_TOTAL_BYTES) {
        failures.push(file.name + '：当前可见贴图超过 12 MiB，优先显示较常见的材料。');
        continue;
      }
      onProgress('正在读取 ' + file.name + '…');
      let bitmap;
      try {
        bitmap = await this.decode(file);
        current();
        validateTextureSize(bitmap.width, bitmap.height);
        const bytes = bitmap.width * bitmap.height * 4;
        this.sizes.set(id, bytes);
        if (protectedBytes + bytes > MAX_TEXTURE_TOTAL_BYTES) {
          bitmap.close(); bitmap = null;
          failures.push(file.name + '：当前可见贴图超过 12 MiB，优先显示较常见的材料。');
          continue;
        }
        while (this.bytes + bytes > MAX_TEXTURE_TOTAL_BYTES) {
          const remove = [...this.images.keys()].find(key => !pinned.has(key));
          const previous = this.images.get(remove);
          previous.close(); this.images.delete(remove); this.bytes -= this.sizes.get(remove); changed = true;
        }
        this.images.set(id, bitmap); this.bytes += bytes; pinned.add(id); bitmap = null; changed = true;
      } catch (error) {
        bitmap?.close();
        current();
        if (error.name === 'AbortError') throw error;
        const message = file.name + '：' + error.message;
        this.errors.set(id, message); failures.push(message);
      }
    }
    current();
    return { selected:this.files.size, loaded:this.images.size, bytes:this.bytes, changed, failures };
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

  get selectedIds() { return [...this.files.keys()]; }
  get atlases() { return Object.fromEntries([...this.images].map(([id, image]) => [id, { width:image.width, height:image.height }])); }

  clear() {
    this.generation++;
    this.cancel();
    for (const image of this.images.values()) image.close();
    this.images.clear(); this.files.clear(); this.sizes.clear(); this.errors.clear(); this.bytes = 0;
  }
}
