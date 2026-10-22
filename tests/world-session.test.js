import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorldSession } from '../src/world/WorldSession.js';

function setup(timeout = 1000) {
  const workers = [];
  const session = new WorldSession(() => {
    const worker = {
      postMessage(message) { this.message = message; },
      terminate() { this.terminated = true; },
      reply(data) { this.onmessage({ data: { id: this.message.id, ...data } }); },
    };
    workers.push(worker);
    return worker;
  }, timeout);
  return { session, workers };
}

test('cancel terminates work, invalidates the loaded world and ignores late results', async () => {
  const { session, workers } = setup();
  const opening = session.open({ name: 'first.wld' });
  const rejected = assert.rejects(opening, /取消/);
  session.close();
  await rejected;
  assert.equal(workers[0].terminated, true);
  workers[0].reply({ type: 'result', summary: { name: 'stale' } });
  await assert.rejects(session.export(), /先打开/);
});

test('a failed replacement load cannot export the previous world', async () => {
  const { session, workers } = setup();
  const first = session.open({ name: 'first.wld' });
  workers[0].reply({ type: 'result', summary: { name: 'first' } });
  await first;
  const second = session.open({ name: 'broken.wld' });
  const rejected = assert.rejects(second, /损坏/);
  workers[1].reply({ type: 'error', message: '损坏' });
  await rejected;
  workers[0].reply({ type: 'result', summary: { name: 'old' } });
  await assert.rejects(session.export(), /先打开/);
  assert.equal(workers.every(worker => worker.terminated), true);
});

test('timeout stops the worker and permits a clean restart', async () => {
  const { session, workers } = setup(10);
  await assert.rejects(session.open({ name: 'slow.wld' }), /已停止/);
  assert.equal(workers[0].terminated, true);
  const restarted = session.open({ name: 'new.wld' });
  workers[1].reply({ type: 'result', summary: { name: 'new' } });
  assert.equal((await restarted).summary.name, 'new');
  session.close();
});

test('progress and replies must match the current request; concurrent export is rejected', async () => {
  const { session, workers } = setup();
  const progress = [];
  const opening = session.open({ name: 'world.wld' }, value => progress.push(value));
  workers[0].onmessage({ data: { id: 999, type: 'progress', percent: 90 } });
  workers[0].reply({ type: 'progress', percent: 25 });
  workers[0].reply({ type: 'result', summary: {} });
  await opening;
  assert.deepEqual(progress, [25]);
  const exporting = session.export();
  await assert.rejects(session.export(), /等待/);
  const buffer = new ArrayBuffer(4);
  workers[0].reply({ type: 'result', buffer, filename: 'world-副本.wld' });
  assert.equal((await exporting).buffer, buffer);
  session.close();
});

test('worker crashes and clone failures invalidate the session', async () => {
  for (const mode of ['error', 'messageerror', 'clone']) {
    const { session, workers } = setup();
    const opening = session.open({ name: 'world.wld' });
    if (mode === 'error') workers[0].onerror({ preventDefault() {} });
    if (mode === 'messageerror') workers[0].onmessageerror();
    if (mode === 'clone') {
      workers[0].reply({ type: 'result', summary: {} });
      await opening;
      workers[0].postMessage = () => { throw new Error('DataCloneError'); };
      await assert.rejects(session.export(), /交给处理程序/);
    } else await assert.rejects(opening, /重新打开/);
    assert.equal(workers[0].terminated, true);
    await assert.rejects(session.export(), /先打开/);
  }
});

test('rendering and export are serialized; only the latest queued view is retained', async () => {
  const { session, workers } = setup();
  const opening = session.open({ name: 'world.wld' });
  workers[0].reply({ type: 'result', summary: {} });
  await opening;
  const first = session.render({ x: 1 });
  const outdated = session.render({ x: 2 });
  const rejected = assert.rejects(outdated, error => error.name === 'AbortError');
  const exporting = session.export();
  const latest = session.render({ x: 3 });
  await rejected;
  const firstId = workers[0].message.id;
  workers[0].reply({ type: 'result', image: { x: 1 } });
  assert.equal(workers[0].message.action, 'export');
  workers[0].onmessage({ data: { id: firstId, type: 'result', image: { x: 999 } } });
  workers[0].reply({ type: 'result', buffer: new ArrayBuffer(1) });
  assert.equal(workers[0].message.action, 'render');
  assert.equal(workers[0].message.region.x, 3);
  workers[0].reply({ type: 'result', image: { x: 3 } });
  assert.equal((await first).image.x, 1);
  await exporting;
  assert.equal((await latest).image.x, 3);
  session.close();
});

test('closing rejects both active rendering and queued export before starting a new world', async () => {
  const { session, workers } = setup();
  const opening = session.open({ name: 'world.wld' });
  workers[0].reply({ type: 'result', summary: {} });
  await opening;
  const rendering = session.render({ x: 1 });
  const exporting = session.export();
  const rejectedRender = assert.rejects(rendering, error => error.name === 'AbortError');
  const rejectedExport = assert.rejects(exporting, error => error.name === 'AbortError');
  session.close();
  await Promise.all([rejectedRender, rejectedExport]);
  assert.equal(workers[0].terminated, true);
  await assert.rejects(session.render({ x: 1 }), /先打开/);
});

test('paint runs before queued export; a rejected edit keeps the loaded world usable', async () => {
  const { session, workers } = setup();
  const opening = session.open({ name: 'world.wld' });
  workers[0].reply({ type: 'result', summary: {} });
  await opening;
  const painting = session.edit('paint', { cells: [12010], blockId: 0 });
  assert.equal(workers[0].message.action, 'paint');
  const exporting = session.export();
  const rejected = assert.rejects(painting, /未修改/);
  workers[0].reply({ type: 'error', recoverable: true, message: '参数无效，未修改世界。' });
  await rejected;
  assert.equal(session.loaded, true);
  assert.equal(workers[0].message.action, 'export');
  workers[0].reply({ type: 'result', buffer: new ArrayBuffer(1) });
  await exporting;
  const undoing = session.edit('undo');
  workers[0].reply({ type: 'result', editState: { revision: 0 } });
  assert.equal((await undoing).editState.revision, 0);
  session.close();
});

test('erase, pick and export run in order, and closing cancels pending inspection', async () => {
  const { session, workers } = setup();
  await assert.rejects(session.pick({ x: 10, y: 10 }), /先打开/);
  const opening = session.open({ name: 'world.wld' });
  workers[0].reply({ type: 'result', summary: {} });
  await opening;
  const erasing = session.edit('erase', { cells: [12010] });
  const picking = session.pick({ x: 10, y: 10 });
  const exporting = session.export();
  assert.equal(workers[0].message.action, 'erase');
  workers[0].reply({ type: 'result', editState: { revision: 1 } });
  await erasing;
  assert.equal(workers[0].message.action, 'pick');
  assert.deepEqual(workers[0].message.point, { x: 10, y: 10 });
  workers[0].reply({ type: 'result', tile: { blockId: null } });
  assert.equal((await picking).tile.blockId, null);
  assert.equal(workers[0].message.action, 'export');
  workers[0].reply({ type: 'result', buffer: new ArrayBuffer(1) });
  await exporting;
  const stale = session.pick({ x: 10, y: 10 });
  const rejection = assert.rejects(stale, error => error.name === 'AbortError');
  session.close();
  await rejection;
  workers[0].reply({ type: 'result', tile: { blockId: 1 } });
});

test('area edits are queued before export and send rectangle coordinates without expanding main-thread cells', async () => {
  const { session, workers } = setup();
  const opening = session.open({ name: 'world.wld' });
  workers[0].reply({ type: 'result', summary: {} });
  await opening;
  const selection = { x: 10, y: 10, width: 3, height: 2 };
  const filling = session.edit('fillSelection', { selection, blockId: 1 });
  const erasing = session.edit('eraseSelection', { selection });
  const exporting = session.export();
  assert.equal(workers[0].message.action, 'fillSelection');
  assert.deepEqual(workers[0].message.stroke, { selection, blockId: 1 });
  workers[0].reply({ type: 'result', editState: { undoCount: 1 } });
  await filling;
  assert.equal(workers[0].message.action, 'eraseSelection');
  workers[0].reply({ type: 'result', editState: { undoCount: 2 } });
  await erasing;
  assert.equal(workers[0].message.action, 'export');
  workers[0].reply({ type: 'result', buffer: new ArrayBuffer(1) });
  await exporting;
  session.close();
});

test('copy is queued read-only; paste is serialized before export and failed paste keeps the session loaded', async () => {
  const { session, workers } = setup();
  await assert.rejects(session.copy({}), /先打开/);
  const opening = session.open({ name: 'world.wld' });
  workers[0].reply({ type: 'result', summary: {} }); await opening;
  const selection = { x: 10, y: 10, width: 2, height: 2 };
  const copying = session.copy(selection);
  assert.equal(workers[0].message.action, 'copy');
  assert.deepEqual(workers[0].message.stroke, { selection });
  const clipboard = { schema: 1, width: 2, height: 2, tiles: [] };
  workers[0].reply({ type: 'result', clipboard });
  assert.deepEqual((await copying).clipboard, clipboard);
  const payload = { clipboard, position: { x: 30, y: 10 } };
  const pasting = session.edit('paste', payload), exporting = session.export();
  assert.equal(workers[0].message.action, 'paste');
  assert.deepEqual(workers[0].message.stroke, payload);
  const rejected = assert.rejects(pasting, /家具/);
  workers[0].reply({ type: 'error', recoverable: true, message: '区域接触家具，未修改世界。' });
  await rejected;
  assert.equal(session.loaded, true);
  assert.equal(workers[0].message.action, 'export');
  workers[0].reply({ type: 'result', buffer: new ArrayBuffer(1) }); await exporting;
  const pending = session.copy(selection), cancelled = assert.rejects(pending, error => error.name === 'AbortError');
  session.close(); await cancelled;
});

test('template preparation queues before export, preserves recoverable sessions and is cancelled on close', async () => {
  const { session, workers } = setup();
  await assert.rejects(session.prepareClipboard({}), /先打开/);
  const opening = session.open({ name: 'world.wld' });
  workers[0].reply({ type: 'result', summary: {} }); await opening;
  const clipboard = { schema: 1, width: 1, height: 1, tiles: [] };
  const preparing = session.prepareClipboard(clipboard), exporting = session.export();
  assert.equal(workers[0].message.action, 'prepareClipboard');
  assert.deepEqual(workers[0].message.stroke, { clipboard });
  const rejected = assert.rejects(preparing, /跨版本/);
  workers[0].reply({ type: 'error', recoverable: true, message: '暂不支持跨版本粘贴。' }); await rejected;
  assert.equal(session.loaded, true); assert.equal(workers[0].message.action, 'export');
  workers[0].reply({ type: 'result', buffer: new ArrayBuffer(1) }); await exporting;
  const pending = session.prepareClipboard(clipboard), cancelled = assert.rejects(pending, error => error.name === 'AbortError');
  session.close(); await cancelled;
});

test('fill cancellation bypasses a busy queue, rejects with AbortError and keeps world loaded for export', async () => {
  const { session, workers } = setup();
  const opening = session.open({ name: 'world.wld' }); workers[0].reply({ type: 'result', summary: {} }); await opening;
  const preparing = session.prepareFill({ point: { x: 0, y: 0 }, layer: 'block', blockId: 1 });
  const id = workers[0].message.id, exporting = session.export();
  const rejected = assert.rejects(preparing, { name: 'AbortError' });
  session.cancelPrepareFill(); assert.deepEqual(workers[0].message, { action: 'cancelFill', targetId: id });
  workers[0].onmessage({ data: { id, type: 'error', recoverable: true, cancelled: true, message: '已取消' } }); await rejected;
  assert.equal(session.loaded, true); assert.equal(workers[0].terminated, undefined); assert.equal(workers[0].message.action, 'export');
  workers[0].reply({ type: 'result', buffer: new ArrayBuffer(1) }); await exporting; session.close();
});

test('queued fill cancellation leaves active render and other requests intact; late successful fill cannot revive cancelled preview', async () => {
  const { session, workers } = setup();
  const opening = session.open({ name: 'world.wld' }); workers[0].reply({ type: 'result', summary: {} }); await opening;
  const render = session.render({ x: 0 });
  const queued = session.prepareFill({}), queuedRejection = assert.rejects(queued, { name: 'AbortError' });
  session.cancelPrepareFill(); await queuedRejection; assert.equal(workers[0].message.action, 'render');
  workers[0].reply({ type: 'result', image: {} }); await render;
  const preparing = session.prepareFill({}), id = workers[0].message.id;
  const cancelled = assert.rejects(preparing, { name: 'AbortError' }); session.cancelPrepareFill();
  workers[0].onmessage({ data: { id, type: 'result', fill: { token: 1 } } }); await cancelled;
  const commit = session.edit('commitFill', { token: 2 }); assert.equal(workers[0].message.action, 'commitFill');
  const rejected = assert.rejects(commit, /失效/); workers[0].reply({ type: 'error', recoverable: true, message: '预览失效' }); await rejected;
  assert.equal(session.loaded, true); session.close();
});


test('object reads, content writes and undo share the ordinary serialized request queue', async () => {
  const { session, workers } = setup(); const opening = session.open({ name: 'objects.wld' });
  workers[0].reply({ type: 'result', summary: {} }); await opening;
  const list = session.listObjects('chest'), edit = session.edit('editObject', { kind: 'chest', index: 0, revision: 0, changes: { name: '中文箱子' } }), read = session.readObject({ kind: 'chest', index: 0 });
  assert.equal(workers[0].message.action, 'listObjects'); workers[0].reply({ type: 'result', objects: [{ index: 0 }] }); await list;
  assert.equal(workers[0].message.action, 'editObject'); assert.equal(workers[0].message.stroke.revision, 0);
  workers[0].reply({ type: 'result', editState: { revision: 1 } }); await edit;
  assert.equal(workers[0].message.action, 'readObject'); workers[0].reply({ type: 'result', object: { name: '中文箱子', revision: 1 } });
  assert.equal((await read).object.revision, 1); session.close();
});

test('a rejected stale object save retains the loaded world and queued export still completes', async () => {
  const { session, workers } = setup(); const opening = session.open({ name: 'objects.wld' });
  workers[0].reply({ type: 'result', summary: {} }); await opening;
  const editing = session.edit('editObject', { kind: 'chest', index: 0, revision: 99, changes: { name: '过时' } });
  const rejected = assert.rejects(editing, /版本已变化/), output = session.export();
  workers[0].reply({ type: 'error', recoverable: true, message: '世界版本已变化' }); await rejected;
  assert.equal(session.loaded, true); assert.equal(workers[0].message.action, 'export');
  workers[0].reply({ type: 'result', buffer: new ArrayBuffer(4), filename: 'objects-副本.wld' }); assert.equal((await output).buffer.byteLength, 4); session.close();
});

test('world property reads and writes serialize with exports; recoverable rejection keeps the world and summary responses', async () => {
  const { session, workers } = setup(); await assert.rejects(session.readWorldProperties(), /先打开/);
  const opening = session.open({ name: 'world.wld' }); workers[0].reply({ type: 'result', summary: {} }); await opening;
  const read = session.readWorldProperties(), edit = session.edit('editWorldProperties', { revision: 0, changes: { name: '中文世界' } });
  assert.equal(workers[0].message.action, 'readWorldProperties'); workers[0].reply({ type: 'result', properties: { revision: 0 } }); await read;
  assert.equal(workers[0].message.action, 'editWorldProperties');
  workers[0].reply({ type: 'result', summary: { name: '中文世界' }, editState: { revision: 1 } }); assert.equal((await edit).summary.name, '中文世界');
  const invalid = session.edit('editWorldProperties', { revision: 0, changes: { name: '旧版本' } }), rejected = assert.rejects(invalid, /版本/), exporting = session.export();
  workers[0].reply({ type: 'error', recoverable: true, message: '版本已变化' }); await rejected; assert.equal(session.loaded, true);
  workers[0].reply({ type: 'result', buffer: new ArrayBuffer(4) }); await exporting; session.close();
});


test('NPC reads and writes queue with export and recoverable stale edits retain the loaded session', async () => {
  const { session, workers } = setup(); await assert.rejects(session.readNpcs(), /先打开/);
  const opening = session.open({ name: 'npcs.wld' }); workers[0].reply({ type: 'result', summary: {} }); await opening;
  const read = session.readNpcs(), edit = session.edit('editNpc', { revision: 0, action: 'update', key: '1', changes: { name: '中文居民' } });
  assert.equal(workers[0].message.action, 'readNpcs'); workers[0].reply({ type: 'result', npcs: { records: [], revision: 0 } }); await read;
  assert.equal(workers[0].message.action, 'editNpc'); assert.equal(workers[0].message.stroke.key, '1');
  workers[0].reply({ type: 'result', summary: { counts: { npcs: 1 } }, editState: { revision: 1 } }); assert.equal((await edit).editState.revision, 1);
  const stale = session.edit('editNpc', { revision: 0, action: 'remove', key: '1' }), rejected = assert.rejects(stale, /版本/), exporting = session.export();
  workers[0].reply({ type: 'error', recoverable: true, message: '版本已变化' }); await rejected; assert.equal(session.loaded, true);
  workers[0].reply({ type: 'result', buffer: new ArrayBuffer(4) }); await exporting; session.close();
});
