import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const ui = new URL('../src/browser/ui/wwwroot/', import.meta.url);

test('原生文件选择取消返回空列表，后续选择正常，真实错误继续抛出', async () => {
  const listeners = new Map();
  const existingInput = { removed: false, remove() { this.removed = true; } };
  const document = {
    querySelectorAll() { return [existingInput]; },
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name) { listeners.delete(name); }
  };
  class StorageItems {
    constructor(items) { this.items = items; }
  }
  let outcome = 'cancel';
  const selected = new StorageItems([{ name: 'practice.wld' }]);
  const failure = new Error('读取权限不足');
  const provider = {
    async openFileDialog() {
      if (outcome === 'cancel') throw Object.assign(new Error('取消'), { name: 'AbortError' });
      if (outcome === 'failure') throw failure;
      return selected;
    }
  };
  const { installPickerCompatibility } = await loadModule(
    'platform/storage-picker-compat.js', 'installPickerCompatibility', { document, HTMLInputElement: class {} }
  );
  installPickerCompatibility(provider, StorageItems);
  const cancelled = await provider.openFileDialog();
  assert.ok(cancelled instanceof StorageItems);
  assert.equal(cancelled.items.length, 0);
  outcome = 'selected';
  assert.equal(await provider.openFileDialog(), selected);
  outcome = 'failure';
  await assert.rejects(provider.openFileDialog(), error => error === failure);
  assert.equal(listeners.size, 0);
  assert.equal(existingInput.removed, false);
});

async function loadModule(name, exports, globals) {
  const source = await readFile(new URL(name, ui), 'utf8');
  return vm.runInNewContext(
    source.replaceAll('import.meta.url', JSON.stringify(new URL(name, ui).href)).replaceAll('export function ', 'function ') + `\n({${exports}})`, globals
  );
}

test('地图导航保持缩放锚点，并能适应全图和回到出生点', async () => {
  let current = { info: { width: 6400, height: 1800, spawnX: 3200, spawnY: 350 } };
  const { createRenderer } = await loadModule('render-bridge.js', 'createRenderer', {
    window: { addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} }
  });
  const renderer = createRenderer({ owner: () => current, hooks: () => ({}), notify() {} });
  renderer.suspend();
  const command = operation => renderer.command(JSON.stringify(operation));
  await command({ operation: 'set', view: { width: 1200, height: 700, x: 100, y: 200, zoom: 16 } });
  const anchor = { x: 100 + 120 / 16, y: 200 + 240 / 16 };
  await command({ operation: 'zoom', factor: 1.2, px: 120, py: 240 });
  let view = renderer.diagnostics().view;
  assert.equal(view.x + 120 / view.zoom, anchor.x);
  assert.equal(view.y + 240 / view.zoom, anchor.y);
  await command({ operation: 'fit' });
  view = renderer.diagnostics().view;
  assert.ok(view.x <= 0 && view.y <= 0);
  assert.ok(view.x + view.width / view.zoom >= 6400);
  assert.ok(view.y + view.height / view.zoom >= 1800);
  const zoom = view.zoom;
  await command({ operation: 'spawn' });
  view = renderer.diagnostics().view;
  assert.equal(view.zoom, zoom);
  assert.equal(view.x + view.width / (2 * zoom), 3200);
  assert.equal(view.y + view.height / (2 * zoom), 350);
  current = null;
  await command({ operation: 'fit' });
  await command({ operation: 'spawn' });
});

function colorDom() {
  const elements = [];
  const document = {
    createElement(tag) {
      const element = {
        tag, style: {}, dataset: {}, children: [], attributes: {},
        append(...children) { this.children.push(...children); },
        setAttribute(name, value) { this.attributes[name] = value; },
        showModal() { this.open = true; },
        close() { this.open = false; this.onclose?.(); },
        remove() { this.removed = true; }
      };
      elements.push(element);
      return element;
    },
    body: { append() {} }
  };
  return { document, elements };
}

test('选色预览在取消、Esc 和重新打开时恢复原值，应用保留新值', async () => {
  const dom = colorDom();
  const { chooseColor } = await loadModule('choose-color.js', 'chooseColor', { document: dom.document });
  const changes = [];
  const open = value => chooseColor(JSON.stringify({ value, target: 'colorField' }),
    (target, color) => changes.push({ target, color }));
  const latest = tag => dom.elements.filter(element => element.tag === tag).at(-1);
  const preview = value => { const input = latest('input'); input.value = value; input.oninput(); };
  open('#aabbcc');
  preview('#112233');
  assert.equal(changes.at(-1).color, '#112233');
  dom.elements.find(element => element.tag === 'button' && element.textContent === '取消').onclick();
  assert.equal(changes.at(-1).color, '#aabbcc');
  assert.equal(latest('dialog').removed, true);
  open('#aabbcc');
  preview('#445566');
  latest('dialog').oncancel({ preventDefault() {} });
  assert.equal(changes.at(-1).color, '#aabbcc');
  open('#aabbcc');
  preview('#778899');
  open('#ddeeff');
  assert.equal(changes.at(-1).color, '#aabbcc');
  preview('#123abc');
  latest('button').onclick();
  assert.deepEqual(changes.at(-1), { target: 'colorField', color: '#123ABC' });
});
