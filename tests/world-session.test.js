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
