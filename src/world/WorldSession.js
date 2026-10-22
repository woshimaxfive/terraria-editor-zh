const createWorker = () => new Worker(new URL('../workers/world.worker.js', import.meta.url), { type: 'module' });

export class WorldSession {
  constructor(workerFactory = createWorker, timeoutMs = 60_000) {
    this.workerFactory = workerFactory;
    this.timeoutMs = timeoutMs;
    this.worker = null;
    this.pending = null;
    this.queue = [];
    this.nextId = 0;
    this.loaded = false;
  }

  open(file, onProgress) {
    this.close();
    try {
      const worker = this.workerFactory();
      this.worker = worker;
      worker.onmessage = ({ data }) => {
        if (worker !== this.worker || data.id !== this.pending?.id) return;
        if (data.type === 'progress') {
          this.pending.onProgress?.(Math.max(0, Math.min(100, data.percent)));
        } else if (data.type === 'error') {
          if (data.recoverable) {
            const request = this.pending;
            clearTimeout(request.timer);
            this.pending = null;
            request.reject(data.cancelled ? new DOMException(data.message, 'AbortError') : new Error(data.message));
            this.dispatch();
          } else this.close(new Error(data.message));
        } else if (data.type === 'result') {
          const request = this.pending;
          clearTimeout(request.timer);
          this.pending = null;
          if (request.action === 'open') this.loaded = true;
          if (request.cancelled) request.reject(new DOMException('连通填充已取消，世界未修改。', 'AbortError'));
          else request.resolve(data);
          this.dispatch();
        }
      };
      worker.onerror = event => {
        event.preventDefault?.();
        if (worker === this.worker) this.close(new Error('文件处理程序发生错误，请重新打开世界。'));
      };
      worker.onmessageerror = () => {
        if (worker === this.worker) this.close(new Error('无法读取文件处理结果，请重新打开世界。'));
      };
      return this.request('open', { file }, onProgress);
    } catch (error) {
      this.close();
      return Promise.reject(new Error('无法启动文件处理程序，请刷新网页后重试。', { cause: error }));
    }
  }

  export(onProgress) {
    if (!this.loaded) return Promise.reject(new Error('请先打开一个世界。'));
    if (this.pending?.action === 'export' || this.queue.some(request => request.action === 'export')) {
      return Promise.reject(new Error('请等待当前导出完成。'));
    }
    return this.request('export', {}, onProgress);
  }

  render(region) {
    if (!this.loaded) return Promise.reject(new Error('请先打开一个世界。'));
    this.queue = this.queue.filter(request => {
      if (request.action !== 'render') return true;
      request.reject(new DOMException('视图已更新。', 'AbortError'));
      return false;
    });
    return this.request('render', { region });
  }

  edit(action, stroke) {
    if (!this.loaded) return Promise.reject(new Error('请先打开一个世界。'));
    if (!['paint', 'erase', 'fillSelection', 'eraseSelection', 'paste', 'undo', 'redo', 'commitFill', 'editObject', 'editWorldProperties'].includes(action)) return Promise.reject(new Error('无法识别这项编辑操作。'));
    return this.request(action, { stroke });
  }

  listObjects(kind) {
    if (!this.loaded) return Promise.reject(new Error('请先打开一个世界。'));
    return this.request('listObjects', { kind });
  }

  readWorldProperties() {
    if (!this.loaded) return Promise.reject(new Error('请先打开一个世界。'));
    return this.request('readWorldProperties');
  }

  readObject(point) {
    if (!this.loaded) return Promise.reject(new Error('请先打开一个世界。'));
    return this.request('readObject', { point });
  }

  pick(point) {
    if (!this.loaded) return Promise.reject(new Error('请先打开一个世界。'));
    return this.request('pick', { point });
  }

  copy(selection) {
    if (!this.loaded) return Promise.reject(new Error('请先打开一个世界。'));
    return this.request('copy', { stroke: { selection } });
  }

  prepareClipboard(clipboard) {
    if (!this.loaded) return Promise.reject(new Error('请先打开一个世界。'));
    return this.request('prepareClipboard', { stroke: { clipboard } });
  }

  prepareFill(stroke, onProgress) {
    if (!this.loaded) return Promise.reject(new Error('请先打开一个世界。'));
    return this.request('prepareFill', { stroke }, onProgress);
  }

  cancelPrepareFill() {
    const reason = () => new DOMException('连通填充已取消，世界未修改。', 'AbortError');
    this.queue = this.queue.filter(request => {
      if (request.action !== 'prepareFill') return true;
      request.reject(reason()); return false;
    });
    if (this.pending?.action === 'prepareFill' && !this.pending.cancelled) {
      this.pending.cancelled = true;
      this.worker.postMessage({ action: 'cancelFill', targetId: this.pending.id });
    }
  }

  request(action, payload, onProgress) {
    return new Promise((resolve, reject) => {
      this.queue.push({ action, payload, resolve, reject, onProgress });
      this.dispatch();
    });
  }

  dispatch() {
    if (this.pending || !this.queue.length) return;
    const request = this.queue.shift();
    const id = ++this.nextId;
    const timer = setTimeout(() => this.close(new Error('处理超过一分钟，已停止。请重新打开文件。')), this.timeoutMs);
    this.pending = { ...request, id, timer };
    try {
      this.worker.postMessage({ id, action: request.action, ...request.payload });
    } catch {
      this.close(new Error('无法将文件交给处理程序，请重新选择。'));
    }
  }

  close(reason = new DOMException('操作已取消。', 'AbortError')) {
    this.worker?.terminate();
    this.worker = null;
    this.loaded = false;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(reason);
      this.pending = null;
    }
    for (const request of this.queue.splice(0)) request.reject(reason);
  }
}
