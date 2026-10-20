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
