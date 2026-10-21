import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';
import { detectDirection, snapDirection, continuesLine } from '../src/editing/constraints.js';
import { BrushStroke } from '../src/editing/brush.js';

test('desktop strict integer direction thresholds include equality on the axis side', () => {
  assert.equal(detectDirection(5, 2), 0); assert.equal(detectDirection(5, 3), 2);
  assert.equal(detectDirection(2, 5), 1); assert.equal(detectDirection(3, 5), 2);
  assert.equal(detectDirection(0, 0), 0); assert.equal(detectDirection(0, 3), 1);
});

test('desktop diagonal projection truncates average distance and retains independent signs', () => {
  const anchor = { x: 10, y: 10 };
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    assert.deepEqual(snapDirection({ x: 10 + sx * 5, y: 10 + sy * 2 }, anchor, 2), { x: 10 + sx * 3, y: 10 + sy * 3 });
  }
  assert.deepEqual(snapDirection({ x: 16, y: 19 }, anchor, 0), { x: 16, y: 10 });
  assert.deepEqual(snapDirection({ x: 16, y: 19 }, anchor, 1), { x: 10, y: 19 });
});

test('constrained stroke locks once beyond one tile and retains swept cells on reversal', () => {
  const stroke = new BrushStroke({ width: 30, height: 30 }, 1, null, 'constrain');
  stroke.add({ x: 10, y: 10 }); stroke.add({ x: 15, y: 11 });
  assert.equal(stroke.direction, 0); assert.equal(stroke.directionLocked, true);
  stroke.add({ x: 12, y: 20 });
  assert.deepEqual([...stroke.cells], [310, 340, 370, 400, 430, 460]);
  assert.deepEqual(stroke.previous, { x: 12, y: 10 });
});

test('polyline uses retained anchor but recomputes candidate path and classifies click against current mouse-down', () => {
  const stroke = new BrushStroke({ width: 20, height: 20 }, 1, null, 'polyline', { x: 2, y: 2 });
  stroke.add({ x: 5, y: 2 }); stroke.add({ x: 2, y: 6 });
  assert.deepEqual([...stroke.cells], [42, 43, 44, 45, 46]);
  assert.deepEqual(stroke.inputStart, { x: 5, y: 2 }); assert.deepEqual(stroke.inputEnd, { x: 2, y: 6 });
  assert.equal(continuesLine(stroke.inputStart, stroke.inputEnd), false);
  assert.equal(continuesLine({ x: 10, y: 10 }, { x: 12, y: 8 }), true);
  assert.equal(continuesLine({ x: 10, y: 10 }, { x: 13, y: 10 }), false);
});

test('snapped endpoints outside world still clip thickness and selection; both new modes reject excessive drafts', () => {
  const stroke = new BrushStroke({ width: 10, height: 10 }, 3, { x: 0, y: 8, width: 2, height: 2 }, 'constrain');
  stroke.add({ x: 0, y: 9 }); stroke.add({ x: 9, y: 9 });
  assert.deepEqual([...stroke.cells].sort((a, b) => a - b), [8, 9, 18, 19]);
  for (const mode of ['polyline', 'constrain']) {
    const draft = new BrushStroke({ width: 4200, height: 1200 }, 9, null, mode);
    draft.add({ x: 0, y: 10 }); assert.throws(() => draft.add({ x: 4199, y: 10 }), /10000/);
  }
});

test('unlocked first-cell motion retains preceding constraint direction until a new direction locks', () => {
  const stroke = new BrushStroke({ width: 30, height: 30 }, 1, null, 'constrain');
  stroke.direction = 1;
  stroke.add({ x: 10, y: 10 }); stroke.add({ x: 11, y: 11 });
  assert.equal(stroke.directionLocked, false); assert.deepEqual([...stroke.cells], [310, 311]);
  stroke.add({ x: 15, y: 10 });
  assert.equal(stroke.directionLocked, true); assert.equal(stroke.direction, 0);
  assert.deepEqual(stroke.previous, { x: 15, y: 10 });
});

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { FileReader } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { TILE_FIELDS } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const { preservesOtherSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();
for (const fixture of fixtures) {
  test(`${fixture.name}: connected and constrained segments preserve every field, masks, export sections and per-segment undo`, async () => {
    const input = await readFile(new URL(`${fixture.name}.wld`, fixtureRoot));
    const bytes = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    const document = await openWorld(bytes), original = (await parse(bytes)).worldTiles.tiles;
    const a = { x: 100, y: 10 }, b = { x: 105, y: 10 }, c = { x: 105, y: 14 };
    const expected = new Set();
    for (const [point, anchor, changed] of [[a, null, 1], [b, a, 5], [c, b, 4]]) {
      const stroke = new BrushStroke(document.summary, 1, null, 'polyline', anchor); stroke.add(point);
      const result = document.paint({ cells: [...stroke.cells], blockId: 1, masks: [{ field: 'blockId', mode: 'empty' }] });
      assert.equal(result.changed, changed);
      for (const index of stroke.cells) expected.add(index);
    }
    assert.equal(document.editState.undoCount, 3);
    const poly = document.serialize(); document.undo(); document.redo();
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(poly));
    const constrained = new BrushStroke(document.summary, 1, { x: 110, y: 10, width: 4, height: 4 }, 'constrain');
    constrained.add({ x: 110, y: 10 }); constrained.add({ x: 115, y: 13 });
    assert.deepEqual([...constrained.cells], [110 * original.height + 10, 111 * original.height + 11, 112 * original.height + 12, 113 * original.height + 13]);
    assert.equal(document.paint({ cells: [...constrained.cells], blockId: 1 }).changed, 4);
    for (const index of constrained.cells) expected.add(index);
    const output = document.serialize(), actual = (await parse(output)).worldTiles.tiles;
    for (const field of TILE_FIELDS) {
      const values = original[field].slice();
      for (const index of expected) {
        if (field === 'blockId') values[index] = 1;
        if (field === 'frameX' || field === 'frameY') values[index] = 0;
        if (field === 'flags') values[index] |= 1;
      }
      assert.deepEqual(actual[field], values, field);
    }
    assert.equal(preservesOtherSections(bytes, output), true);
    for (let i = 0; i < 4; i++) document.undo();
    assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
  });
}
