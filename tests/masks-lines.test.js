import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { MASK_FIELDS, masksFromSample, passesMasks, validMasks } from '../src/editing/masks.js';
import { BrushStroke } from '../src/editing/brush.js';
import { EditHistory } from '../src/editing/EditHistory.js';
import { fixtures, fixtureRoot } from './worldFixtures.js';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { openWorld } = await server.ssrLoadModule('/src/adapters/worldFile.js');
const { tileMaskValues } = await server.ssrLoadModule('/src/adapters/tileMaskValues.js');
const { FileReader, FileSaver, TileFlag } = await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const { TILE_FIELDS, createBlockEditing } = await server.ssrLoadModule('/src/adapters/blockEditing.js');
const { preservesOtherSections } = await server.ssrLoadModule('/src/adapters/verifyExport.js');
const parse = async bytes => (await new FileReader().loadBuffer(bytes)).parse();
async function input(name = 'v1.4.5.5') {
  const bytes = await readFile(new URL(`${name}.wld`, fixtureRoot));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
const rule = (field, mode, value) => ({ field, mode, value });

for (const field of MASK_FIELDS) {
  test(`${field.id}: desktop match/empty/inverse or quantity conditions compose with AND`, () => {
    const values = { [field.id]: field.boolean ? true : 2, liquidAmount: 100 };
    if (field.quantity) values[field.id] = 100;
    const cases = field.boolean ? [['match', undefined, true], ['empty', undefined, false], ['not', undefined, false]] : field.quantity ?
      [['equal', 100, true], ['greater', 99, true], ['less', 101, true], ['equal', 99, false], ['greater', 100, false], ['less', 100, false]] :
      [['match', 2, true], ['match', 1, false], ['not', 2, false], ['not', 1, true], ['empty', undefined, false]];
    for (const [mode, value, expected] of cases) {
      const mask = rule(field.id, mode, value);
      assert.equal(validMasks([mask]), true); assert.equal(passesMasks(values, [mask]), expected);
      const blocker = field.id === 'wireYellow' ? 'wireRed' : 'wireYellow';
      assert.equal(passesMasks({ ...values, [blocker]: false }, [mask, rule(blocker, 'match')]), false);
    }
    assert.equal(passesMasks(values, [rule(field.id, 'off')]), true);
    if (field.boolean) {
      assert.equal(passesMasks({ [field.id]: false }, [rule(field.id, 'match')]), false);
      assert.equal(passesMasks({ [field.id]: false }, [rule(field.id, 'empty')]), true);
      assert.equal(passesMasks({ [field.id]: false }, [rule(field.id, 'not')]), true);
    } else if (!field.quantity) assert.equal(passesMasks({ [field.id]: field.empty, liquidAmount: 0 }, [rule(field.id, 'empty')]), true);
  });
}

for (const fixture of fixtures) {
  test(`${fixture.name}: selected matching replacement, masked erase and history preserve every field and other section`, async () => {
    const world = await parse(await input(fixture.name)), tiles = world.worldTiles.tiles;
    for (let x = 100; x < 104; x++) for (let y = 10; y < 12; y++) tiles.setTile(x, y, {
      blockId: x % 2 ? 30 : 1, blockColor: 2, wallId: 4, wallColor: 3, slope: 1,
      wireRed: x % 2 === 0, wireBlue: true, actuator: true, liquidAmount: 102, liquidType: 1 });
    const bytes = new FileSaver().save(world), document = await openWorld(bytes), selection = { x: 100, y: 10, width: 4, height: 2 };
    const masks = [rule('blockId', 'match', 1), rule('wireRed', 'match'), rule('liquidAmount', 'greater', 100)];
    const result = document.fillSelection({ layer: 'block', selection, masks, blockId: 54 });
    assert.equal(result.changed, 4); assert.equal(result.filtered, 4); assert.equal(result.skipped, 0);
    for (let x = 100; x < 104; x += 2) for (let y = 10; y < 12; y++) tiles.blockId[tiles.index(x, y)] = 54;
    const replaced = document.serialize();
    document.undo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes)); document.redo();
    const erased = document.eraseSelection({ layer: 'wall', selection, masks: [rule('blockId', 'not', 54)] });
    assert.equal(erased.changed, 4); assert.equal(erased.filtered, 4);
    for (let x = 101; x < 104; x += 2) for (let y = 10; y < 12; y++) {
      const index = tiles.index(x, y); tiles.wallId[index] = tiles.wallColor[index] = 0;
    }
    const output = document.serialize(), actual = (await parse(output)).worldTiles.tiles;
    for (const field of TILE_FIELDS) assert.deepEqual(actual[field], tiles[field], field);
    assert.equal(preservesOtherSections(bytes, output), true);
    document.undo(); assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(replaced)); document.redo();
    assert.deepEqual(new Uint8Array((await openWorld(output)).serialize()), new Uint8Array(output));
  });
}

test('exact sample masks retain inactive sentinels, dormant flags, unknown colors and all 17 desktop conditions', () => {
  const values = tileMaskValues([1, 0, 0, 255, 4, 254, 0, 3, (7 << 11) | 0x7fe]);
  assert.equal(values.blockId, -1); assert.equal(values.wireRed, true); assert.equal(values.fullBrightWall, true);
  const masks = masksFromSample(values);
  assert.equal(masks.length, 17); assert.equal(validMasks(masks), true); assert.equal(passesMasks(values, masks), true);
  for (const field of MASK_FIELDS) {
    const different = { ...values, [field.id]: field.boolean ? !values[field.id] : values[field.id] + 1 };
    assert.equal(passesMasks(different, masks), false, field.id);
  }
  assert.equal(passesMasks(values, [rule('liquidType', 'empty')]), true);
  assert.equal(passesMasks(values, [rule('liquidType', 'match', 3)]), true);
  assert.equal(passesMasks(values, [rule('blockId', 'match', 1)]), false);
});

test('invalid masks fail before reading tiles, validating material or committing any history', () => {
  const history = new EditHistory({ count: 10, version: 318, maskValues() { assert.fail('must not adapt'); },
    read() { assert.fail('must not read'); }, validateMaterial() { assert.fail('must not validate material'); } });
  for (const masks of [null, {}, Array(1), [null], [rule('unknown', 'match', 1)], [rule('blockId', 'greater', 1)],
    [rule('blockId', 'match', -2)], [rule('blockColor', 'match', 256)], [rule('wallId', 'match', NaN)],
    [rule('liquidAmount', 'empty')], [rule('wireRed', 'equal', 1)], [rule('blockId', 'match', '1')],
    [rule('blockId', 'empty'), rule('blockId', 'match', 1)], Array(18).fill(rule('wireRed', 'off'))]) {
    assert.throws(() => history.paint({ cells: [0], blockId: 1, masks }), /匹配条件/);
  }
  assert.deepEqual(history.state, { revision: 0, dirty: false, undoCount: 0, redoCount: 0 });
  assert.throws(() => history.paint({ cells: Array(1), blockId: 1 }), /画笔参数/);
});

test('all-disabled masks bypass adaptation and preserve ordinary history behavior', () => {
  let value = 0;
  const history = new EditHistory({ count: 1, read: () => [value], write: (_index, next) => { value = next[0]; },
    paint: (_index, _before, id) => [id], ensureWritable() {} });
  assert.equal(history.paint({ cells: [0], blockId: 1, masks: [rule('wireRed', 'off')] }).changed, 1);
  assert.equal(value, 1);
});

test('masks filter every editable layer before protection checks while leaving paste as a complete transaction', async () => {
  const world = await parse(await input()), tiles = world.worldTiles.tiles;
  tiles.setTile(10, 10, { blockId: 1, wallId: 4, wireRed: true });
  tiles.setTile(11, 10, { blockId: 1, wallId: 4 });
  const editing = createBlockEditing(world, () => {}), cells = [tiles.index(10, 10), tiles.index(11, 10)];
  const masks = [rule('wireRed', 'match')];
  for (const stroke of [
    { blockId: 30 }, { layer: 'wall', wallId: 5 }, { layer: 'liquid', liquidType: 2, liquidAmount: 255 },
    { layer: 'wire', wireMask: 8 }, { layer: 'actuator', actuator: true, actuated: true },
    { layer: 'slope', slope: 2 }, { layer: 'paint', appearance: { target: 'block', mode: 'color', color: 3 } },
    { layer: 'paint', appearance: { target: 'wall', mode: 'coating', invisible: true, fullBright: true } },
  ]) {
    const before = cells.map(index => TILE_FIELDS.map(field => tiles[field][index]));
    const result = editing.paint({ ...stroke, cells, masks });
    assert.equal(result.changed, 1); assert.equal(result.filtered, 1);
    assert.deepEqual(TILE_FIELDS.map(field => tiles[field][cells[1]]), before[1]);
    editing.undo(); assert.deepEqual(TILE_FIELDS.map(field => tiles[field][cells[0]]), before[0]);
  }
  const clipboard = editing.copy({ x: 10, y: 10, width: 2, height: 1 });
  assert.equal(editing.paste({ clipboard, position: { x: 20, y: 10 }, masks: [rule('wireRed', 'match')] }).changed, 2);
});

test('fully filtered operations preserve redo and exported revision, and do not create false history', async () => {
  const bytes = await input(), document = await openWorld(bytes), cells = [12010];
  document.paint({ cells, blockId: 1 }); document.undo();
  const state = document.editState;
  assert.equal(document.paint({ cells, blockId: 30, masks: [rule('blockId', 'match', 1)] }).filtered, 1);
  assert.deepEqual(document.editState, state); assert.equal(document.editState.redoCount, 1);
  assert.deepEqual(new Uint8Array(document.serialize()), new Uint8Array(bytes));
});

test('straight previews replace earlier endpoints, preserve anchor, respect size/selection/edges and reject over-budget drafts', () => {
  const world = { width: 30, height: 20 }, stroke = new BrushStroke(world, 1, null, 'line');
  stroke.add({ x: 1, y: 1 }); stroke.add({ x: 10, y: 1 }); stroke.add({ x: 1, y: 5 });
  assert.deepEqual([...stroke.cells], [21, 22, 23, 24, 25]);
  const reverse = new BrushStroke(world, 1, null, 'line'); reverse.add({ x: 1, y: 5 }); reverse.add({ x: 1, y: 1 });
  assert.deepEqual([...reverse.cells], [25, 24, 23, 22, 21]);
  const bounded = new BrushStroke(world, 3, { x: 0, y: 0, width: 2, height: 2 }, 'line');
  bounded.add({ x: 0, y: 0 }); bounded.add({ x: 5, y: 0 });
  assert.deepEqual([...bounded.cells].sort((a, b) => a - b), [0, 1, 20, 21]);
  const large = new BrushStroke({ width: 4200, height: 1200 }, 9, null, 'line'); large.add({ x: 0, y: 10 });
  assert.throws(() => large.add({ x: 4199, y: 10 }), /10000/);
});

test('straight-line tie breaks match fixed desktop vectors in all eight octants and reverse directions', () => {
  const start = { x: 5, y: 5 }, vectors = [
    [{ x: 9, y: 7 }, [[5, 5], [6, 6], [7, 6], [8, 7], [9, 7]]],
    [{ x: 7, y: 9 }, [[5, 5], [6, 6], [6, 7], [7, 8], [7, 9]]],
    [{ x: 1, y: 3 }, [[5, 5], [4, 4], [3, 4], [2, 3], [1, 3]]],
    [{ x: 3, y: 1 }, [[5, 5], [4, 4], [4, 3], [3, 2], [3, 1]]],
    [{ x: 9, y: 3 }, [[5, 5], [6, 4], [7, 4], [8, 3], [9, 3]]],
    [{ x: 7, y: 1 }, [[5, 5], [6, 4], [6, 3], [7, 2], [7, 1]]],
    [{ x: 1, y: 7 }, [[5, 5], [4, 6], [3, 6], [2, 7], [1, 7]]],
    [{ x: 3, y: 9 }, [[5, 5], [4, 6], [4, 7], [3, 8], [3, 9]]],
  ];
  for (const [end, points] of vectors) {
    const stroke = new BrushStroke({ width: 20, height: 20 }, 1, null, 'line'); stroke.add(start); stroke.add(end);
    assert.deepEqual([...stroke.cells], points.map(([x, y]) => x * 20 + y));
  }
});
