import { TILE_FIELDS } from './blockEditing.js';
import { TileData } from '../../vendor/terraria-world-file/src/index.ts';
import BinaryReader from '../../vendor/terraria-world-file/src/BinaryReader.ts';
import BinarySaver from '../../vendor/terraria-world-file/src/BinarySaver.ts';
import ChestsIO from '../../vendor/terraria-world-file/src/section/Chests.ts';
import SignsIO from '../../vendor/terraria-world-file/src/section/Signs.ts';
import TileEntitiesIO from '../../vendor/terraria-world-file/src/section/TileEntities.ts';
import { createFurnitureEditing } from './furnitureEditing.js';
import { createObjectEditing } from './objectEditing.js';
import { validateClipboard, pasteFits, transformClipboard } from '../editing/clipboard.js';
import { selectionCells, EditError } from '../editing/brush.js';
import { containsCell } from '../editing/selection.js';
import { furnitureType, furnitureFrames, furnitureLimit, furnitureCompanion, furnitureEntityType } from '../editing/furniture.js';
import { isLegacyEquipment, legacyContents, legacyWithContents, legacyItemCount } from '../editing/legacyEquipment.js';
import { mirrorFurnitureStyle, mirrorFurnitureOrigin, clearClipboardTile } from '../../vendor/tedit-furniture/clipboard-rules.js';
import { MAX_TEMPLATE_BYTES } from '../editing/template.js';

const key = (x, y) => `${x},${y}`;
const fail = message => { throw new EditError(message); };

// A bounded detached snapshot. The full vendor world remains in its Worker.
// This is the source half of schema 2; target validation and paste transactions
// are separate so taking a copy never repairs or changes source records.
export function copyFurnitureRegion(world, furniture, selection) {
  const tiles = world.worldTiles.tiles, cells = selectionCells(selection, tiles);
  const owners = new Map(), snapshots = [];
  for (const index of cells) {
    const x = Math.floor(index / tiles.height), y = index % tiles.height;
    if (tiles.hasBlock(index)) {
      const tileId = tiles.blockId[index];
      if (tileId >= world.fileFormatHeader.importants.length) fail('选区包含无法识别的方块，未复制。');
      if (world.fileFormatHeader.importants[tileId]) {
        const owner = furniture.inspect({ x, y });
        if (!containsCell(selection, owner.x, owner.y) ||
            !containsCell(selection, owner.x + owner.width - 1, owner.y + owner.height - 1)) {
          fail(`选区只包含部分家具，请包含完整范围：${owner.x}, ${owner.y} 至 ${owner.x + owner.width - 1}, ${owner.y + owner.height - 1}。`);
        }
        owners.set(key(owner.x, owner.y), owner);
      }
    }
    snapshots.push(TILE_FIELDS.map(field => tiles[field][index]));
  }
  const objects = { chests: [], signs: [], entities: [] };
  let textUnits = 0;
  for (const [kind, records, target] of [
    ['chest', world.chests.chests, objects.chests],
    ['sign', world.signs.signs, objects.signs],
    ['entity', world.tileEntities.entities, objects.entities],
    ['pressure', world.weightedPressurePlates.weightedPressurePlates, null],
  ]) {
    const seen = new Set();
    for (const record of records) {
      const { x, y } = record.position;
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !containsCell(selection, x, y)) continue;
      const positionKey = key(x, y), owner = owners.get(positionKey);
      if (!owner || seen.has(positionKey) ||
          (kind === 'pressure' ? owner.tileId !== 428 : furnitureCompanion(owner.tileId) !== kind) ||
          (kind === 'entity' && record.type !== furnitureEntityType(owner.tileId))) {
        fail('复制区域存在孤立、重复或不匹配的家具配套记录，未复制。');
      }
      seen.add(positionKey);
      if (!target) continue; // Saved pressed locations describe runtime state, not new copies.
      textUnits += (record.name?.length ?? 0) + (record.text?.length ?? 0);
      if (textUnits > MAX_TEMPLATE_BYTES || (kind === 'chest' && record.items.length > 1000)) {
        fail('复制的家具内容超过模板预算，未复制。');
      }
      target.push({ ...structuredClone(record), position: { x: x - selection.x, y: y - selection.y } });
    }
  }
  // Desktop GetSelectionBuffer copies a companion only when one exists.
  // Preserve absence too: taking a copy must not invent default records.
  const clipboard = { schema: owners.size ? 2 : 1, formatVersion: world.fileFormatHeader.version,
    width: selection.width, height: selection.height, tiles: snapshots };
  if (owners.size) {
    clipboard.structures = [...owners.values()].map(owner => ({ x: owner.x - selection.x, y: owner.y - selection.y,
      tileId: owner.tileId, styleIndex: owner.styleIndex }));
    clipboard.objects = objects;
    if (new TextEncoder().encode(JSON.stringify(clipboard)).byteLength > MAX_TEMPLATE_BYTES) {
      fail('复制的家具内容超过 2 MiB 模板预算，未复制。');
    }
  }
  return clipboard;
}

const plain = value => value && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
function equalData(a, b, depth = 0) {
  if (Object.is(a, b)) return true;
  if (depth > 12 || !a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equalData(a[k], b[k], depth + 1));
}
const objectCost = (before, after) => Math.max(1, Math.ceil(new TextEncoder().encode(JSON.stringify(before) + JSON.stringify(after)).byteLength / 64));

// Validate a detached, untrusted schema 2 payload before preparing any target
// changes. Existing section codecs independently check representability: unknown
// item values can survive, while silently truncated fields and JS extras cannot.
export function validateFurnitureClipboard(world, editing, clipboard) {
  const invalid = () => fail('家具复制内容无效或无法完整保存，未修改世界。');
  if (!plain(clipboard) || clipboard.schema !== 2 || Object.keys(clipboard).some(k =>
      !['schema','formatVersion','width','height','tiles','structures','objects'].includes(k))) invalid();
  validateClipboard({ schema:1, formatVersion:clipboard.formatVersion, width:clipboard.width, height:clipboard.height, tiles:clipboard.tiles }, world.fileFormatHeader.version);
  if (!plain(clipboard.objects) || Object.keys(clipboard.objects).length !== 3 ||
      !['chests','signs','entities'].every(k => Object.hasOwn(clipboard.objects, k) && Array.isArray(clipboard.objects[k]) && clipboard.objects[k].length <= clipboard.tiles.length) ||
      !Array.isArray(clipboard.structures) || clipboard.structures.length > clipboard.tiles.length) invalid();
  try {
    if (new TextEncoder().encode(JSON.stringify(clipboard)).byteLength > MAX_TEMPLATE_BYTES) invalid();
    for (const record of clipboard.objects.chests) {
      const size = clipboard.formatVersion >= 294 ? record.maxItems : 40;
      if (!Number.isInteger(size) || size < 1 || size > 1000 || !Array.isArray(record.items) || record.items.length !== size) invalid();
    }
    for (const [name, io] of [['chests', new ChestsIO()], ['signs', new SignsIO()], ['entities', new TileEntitiesIO()]]) {
      const saver = new BinarySaver(), properties = { version: clipboard.formatVersion };
      io.save(saver, { [name]: clipboard.objects[name] }, properties); saver.trimBuffer();
      const reader = new BinaryReader().loadBuffer(saver.getBuffer()), parsed = io.parse(reader, properties)[name];
      if (!reader.isFinished() || !equalData(parsed, clipboard.objects[name])) invalid();
    }
  } catch (error) {
    if (error instanceof EditError) throw error;
    invalid();
  }
  // Check common representability for every layer, including under furniture.
  // Frame geometry is independently checked against the catalogue below.
  const projected = clipboard.tiles.map(tile => {
    if (!(tile[8] & 1) || !world.fileFormatHeader.importants[tile[0]]) return tile;
    const result = [...tile]; result[0] = 1; result[1] = result[2] = 0; return result;
  });
  editing.validateClipboard({ schema:1, formatVersion:clipboard.formatVersion, width:clipboard.width, height:clipboard.height, tiles:projected });
  const tiles = new TileData(clipboard.width, clipboard.height);
  for (let i = 0; i < clipboard.tiles.length; i++) TILE_FIELDS.forEach((field, f) => { tiles[field][i] = clipboard.tiles[i][f]; });
  const detached = { worldTiles: { tiles }, fileFormatHeader: world.fileFormatHeader,
    chests: { chests: clipboard.objects.chests }, signs: { signs: clipboard.objects.signs },
    tileEntities: { entities: clipboard.objects.entities }, weightedPressurePlates: { weightedPressurePlates: [] } };
  const furniture = createFurnitureEditing(detached, createObjectEditing(detached));
  const canonical = copyFurnitureRegion(detached, furniture, { x: 0, y: 0, width: tiles.width, height: tiles.height });
  const owners = new Map((canonical.structures ?? []).map(owner => [key(owner.x, owner.y), owner]));
  if (owners.size !== clipboard.structures.length) invalid();
  const seen = new Set();
  for (const owner of clipboard.structures) {
    if (!plain(owner) || Object.keys(owner).length !== 4 || !['x','y','tileId','styleIndex'].every(k => Number.isSafeInteger(owner[k]))) invalid();
    const position = key(owner.x, owner.y), actual = owners.get(position);
    if (!actual || seen.has(position) || actual.tileId !== owner.tileId || owner.tileId > furnitureLimit(clipboard.formatVersion) ||
        !equalData(furnitureFrames(owner.tileId, owner.styleIndex).frames, furnitureFrames(actual.tileId, actual.styleIndex).frames)) invalid();
    seen.add(position);
  }
  return structuredClone(clipboard);
}

// One transaction covers the complete target owners, including peripheral cells
// beyond the pasted rectangle. The caller commits these changes through the
// existing shared history only after displaying the loss preview.
export function prepareFurniturePaste(world, furniture, objects, editing, payload) {
  if (!plain(payload) || payload.revision !== editing.state.revision) fail('世界已变化，请重新预览后再确认粘贴。');
  let source = payload.clipboard;
  if (source?.schema === 1) {
    if (Object.hasOwn(source, 'objects') || Object.hasOwn(source, 'structures')) fail('复制内容包含未声明版本的家具数据，未修改世界。');
    editing.validateClipboard(source);
    source = { ...source, schema: 2, structures: [], objects: { chests: [], signs: [], entities: [] } };
  }
  const clipboard = validateFurnitureClipboard(world, editing, source), position = payload.position;
  const tiles = world.worldTiles.tiles;
  if (!pasteFits(clipboard, position, tiles)) fail('粘贴区域必须完整位于地图内，未修改世界。');
  const owners = new Map(), changes = new Map(), affected = new Set();
  const read = index => TILE_FIELDS.map(field => tiles[field][index]);
  for (let offset = 0; offset < clipboard.tiles.length; offset++) {
    const x = position.x + Math.floor(offset / clipboard.height), y = position.y + offset % clipboard.height, index = tiles.index(x, y);
    affected.add(index);
    if (tiles.hasBlock(index) && world.fileFormatHeader.importants[tiles.blockId[index]]) {
      const owner = furniture.inspect({ x, y }); owners.set(key(owner.x, owner.y), owner);
    }
  }
  for (const owner of owners.values()) {
    const removal = furniture.prepare({ action: 'remove', x: owner.x, y: owner.y, revision: payload.revision }, payload.revision);
    for (const change of removal.changes) if (!change.kind) { affected.add(change.index); changes.set(change.index, change); }
  }
  if (affected.size > 10000) fail('完整家具粘贴事务超过 10000 格，未修改世界。');
  const previous = { chest: objects.snapshot('chest'), sign: objects.snapshot('sign'),
    entity: structuredClone(world.tileEntities.entities), pressure: structuredClone(world.weightedPressurePlates.weightedPressurePlates) };
  for (const [kind, records] of Object.entries(previous)) {
    const seen = new Set();
    for (const record of records) {
      const { x, y } = record.position;
      if (x < 0 || y < 0 || x >= tiles.width || y >= tiles.height || !affected.has(tiles.index(x, y))) continue;
      const id = key(x, y), owner = owners.get(id);
      if (!owner || seen.has(id) || (kind === 'pressure' ? owner.tileId !== 428 : furnitureCompanion(owner.tileId) !== kind) ||
          (kind === 'entity' && record.type !== furnitureEntityType(owner.tileId))) fail('粘贴目标存在孤立、重复或不匹配的配套记录，未修改世界。');
      seen.add(id);
    }
  }
  const incoming = {};
  for (const [kind, name] of [['chest','chests'], ['sign','signs'], ['entity','entities']]) {
    incoming[kind] = new Map(clipboard.objects[name].map(record => {
      const result = structuredClone(record); result.position.x += position.x; result.position.y += position.y;
      return [key(result.position.x, result.position.y), result];
    }));
  }
  const usedIds = new Set(previous.entity.filter(r => !owners.has(key(r.position.x, r.position.y))).map(r => r.id));
  let nextId = previous.entity.reduce((max, record) => Math.max(max, record.id), -1) + 1;
  const assignId = (record, original) => {
    if (original && original.type === record.type && original.id >= 0 && !usedIds.has(original.id)) record.id = original.id;
    else {
      if (!Number.isSafeInteger(nextId) || nextId > 2147483647) fail('实体编号已超出存档范围，未修改世界。');
      record.id = nextId++;
    }
    usedIds.add(record.id);
  };
  const after = {};
  for (const kind of ['chest','sign','entity']) {
    after[kind] = [];
    for (const record of previous[kind]) {
      const id = key(record.position.x, record.position.y);
      if (!owners.has(id)) { after[kind].push(record); continue; }
      const replacement = incoming[kind].get(id);
      if (!replacement) continue;
      if (kind === 'entity') assignId(replacement, record);
      after[kind].push(replacement); incoming[kind].delete(id);
    }
    for (const record of incoming[kind].values()) { if (kind === 'entity') assignId(record); after[kind].push(record); }
  }
  const newOwners = new Map(clipboard.structures.map(owner => [key(position.x + owner.x, position.y + owner.y), owner]));
  after.pressure = previous.pressure.filter(record => {
    const id = key(record.position.x, record.position.y);
    return !owners.has(id) || newOwners.get(id)?.tileId === 428;
  });
  for (const kind of ['chest','sign']) if (after[kind].length > (clipboard.formatVersion < 216 ? 1000 : 32767)) fail('箱子或告示牌数量超过此格式上限，未修改世界。');
  for (let offset = 0; offset < clipboard.tiles.length; offset++) {
    const index = tiles.index(position.x + Math.floor(offset / clipboard.height), position.y + offset % clipboard.height);
    changes.set(index, { index, before: read(index), after: [...clipboard.tiles[offset]] });
  }
  const result = [...changes.values()].filter(c => !c.before.every((v, i) => v === c.after[i]));
  for (const kind of ['chest','sign']) { const change = objects.prepareCollection(kind, after[kind]); if (change) result.push(change); }
  for (const [kind, name] of [['entity','entities'], ['pressure','pressure']]) if (!equalData(previous[kind], after[kind])) {
    result.push({ kind: name, index: 0, before: previous[kind], after: after[kind], cost: objectCost(previous[kind], after[kind]) });
  }
  const removedLegacyItems = [...owners.values()].reduce((count, owner) => {
    const replacement = newOwners.get(key(owner.x, owner.y));
    const retained = replacement && isLegacyEquipment(owner.tileId) && isLegacyEquipment(replacement.tileId) &&
      ((owner.tileId === 334) === (replacement.tileId === 334)) &&
      equalData(legacyContents(owner), legacyContents(sourcePattern(clipboard, replacement)));
    return count + (retained ? 0 : legacyItemCount(owner));
  }, 0);
  const removedFurniture = [...owners.values()].filter(owner => owner.frames.some(f => {
    const change = changes.get(tiles.index(owner.x + f.x, owner.y + f.y));
    return change && [0,1,2].some(field => change.before[field] !== change.after[field]);
  })).length;
  return { changes: result, affected: [...affected].map(index => ({ x: Math.floor(index / tiles.height), y: index % tiles.height })),
    owners: [...owners.values()], removedLegacyItems, removedFurniture,
    structures: clipboard.structures.map(owner => ({ ...owner, x: owner.x + position.x, y: owner.y + position.y })) };
}

function sourcePattern(clipboard, owner) {
  const pattern = furnitureFrames(owner.tileId, owner.styleIndex);
  return { ...pattern, frames: pattern.frames.map(f => ({ ...f, u: clipboard.tiles[(owner.x + f.x) * clipboard.height + owner.y + f.y][1] })) };
}
export function furnitureClipboardLoss(clipboard) {
  const objects = clipboard.objects ?? { chests:[], signs:[], entities:[] };
  const legacyItems = (clipboard.structures ?? []).reduce((n, owner) => n + legacyItemCount(sourcePattern(clipboard, owner)), 0);
  return { furniture:(clipboard.structures ?? []).length, chests:objects.chests.length, signs:objects.signs.length,
    entities:objects.entities.length, legacyItems, texts:objects.signs.filter(r => Boolean(r.text)).length,
    items:legacyItems + [...objects.chests,...objects.entities].reduce((n,r) => n +
      [r.item,...(r.items??[]),...(r.dyes??[]),...(r.misc??[])].filter(item => item?.stack > 0).length, 0) };
}

export function transformFurnitureClipboard(world, editing, input, operation) {
  if (input?.schema !== 2) {
    editing.validateClipboard(input);
    return { clipboard:transformClipboard(input, operation), removed:null };
  }
  const source = validateFurnitureClipboard(world, editing, input), rotate = ['clockwise','counterclockwise'].includes(operation);
  const projection = { schema:1, formatVersion:source.formatVersion, width:source.width, height:source.height, tiles:source.tiles.map(t => [...t]) };
  if (rotate) for (const owner of source.structures) for (const f of furnitureFrames(owner.tileId, owner.styleIndex).frames) {
    const index = (owner.x + f.x) * source.height + owner.y + f.y;
    projection.tiles[index] = clearClipboardTile(projection.tiles[index]);
  }
  const result = { ...transformClipboard(projection, operation), schema:2, structures:[], objects:{chests:[],signs:[],entities:[]} };
  if (rotate) {
    validateFurnitureClipboard(world, editing, result);
    return { clipboard:result, removed:furnitureClipboardLoss(source) };
  }
  const horizontal = operation === 'horizontal', destinations = new Map();
  for (const owner of source.structures) {
    const pattern = sourcePattern(source, owner), tile = furnitureType(owner.tileId);
    const styleIndex = mirrorFurnitureStyle(tile, owner.styleIndex, horizontal);
    let next = furnitureFrames(owner.tileId, styleIndex);
    if (next.width !== pattern.width || next.height !== pattern.height) fail('家具镜像样式的尺寸不一致，复制内容未改变。');
    if (isLegacyEquipment(owner.tileId)) next = legacyWithContents(next, legacyContents(pattern));
    const position = mirrorFurnitureOrigin(source.width, source.height, owner, pattern, horizontal);
    result.structures.push({ ...position, tileId:owner.tileId, styleIndex });
    destinations.set(key(owner.x, owner.y), position);
    for (const f of next.frames) {
      const cell = result.tiles[(position.x + f.x) * result.height + position.y + f.y];
      cell[0] = owner.tileId; cell[1] = f.u; cell[2] = f.v; cell[8] |= 1;
    }
  }
  for (const name of ['chests','signs','entities']) result.objects[name] = source.objects[name].map(record => ({
    ...structuredClone(record), position:{...destinations.get(key(record.position.x,record.position.y))},
  }));
  validateFurnitureClipboard(world, editing, result);
  return { clipboard:result, removed:null };
}
