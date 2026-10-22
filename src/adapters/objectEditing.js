import BinarySaver from '../../vendor/terraria-world-file/src/BinarySaver.ts';
import ChestsIO from '../../vendor/terraria-world-file/src/section/Chests.ts';
import SignsIO from '../../vendor/terraria-world-file/src/section/Signs.ts';
import itemMetadata from '../../vendor/tedit-objects/editing-limits.json' with { type: 'json' };
import { EditError } from '../editing/brush.js';

const itemById = new Map(itemMetadata.items);
const prefixes = new Set(itemMetadata.prefixes);
const MAX_OBJECT_SLOTS = 1000, MAX_TEXT_BYTES = 1024 * 1024;
const clone = value => structuredClone(value);
const plain = value => value && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const hasKeys = (value, allowed) => plain(value) && Object.keys(value).every(key => allowed.includes(key));
const fail = () => { throw new EditError('对象编辑参数无效，未修改世界。'); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function validText(text) {
  return typeof text === 'string' && text.length <= MAX_TEXT_BYTES &&
    ![...text].some(char => { const code = char.codePointAt(0); return code >= 0xd800 && code <= 0xdfff; }) &&
    new TextEncoder().encode(text).byteLength <= MAX_TEXT_BYTES;
}
export function objectItemLimit(version) {
  return itemMetadata.versions.findLast(entry => entry.version <= version)?.maxItemId ?? 0;
}
export function validObjectItem(item, version) {
  if (item === null) return true;
  if (!hasKeys(item, ['id', 'stack', 'prefix']) || Object.keys(item).length !== 3) return false;
  const type = itemById.get(item.id);
  return Boolean(type && item.id <= objectItemLimit(version) && Number.isInteger(item.stack) && item.stack >= 1 &&
    item.stack <= Math.min(32767, type) && Number.isInteger(item.prefix) && prefixes.has(item.prefix) && (item.prefix <= 84 || version >= 315));
}

// Vendor objects stay here. The editor receives detached plain snapshots only.
export function createObjectEditing(world) {
  const version = world.fileFormatHeader.version;
  const expected = { chest: clone(world.chests.chests), sign: clone(world.signs.signs) };
  const collection = kind => kind === 'chest' ? world.chests.chests : kind === 'sign' ? world.signs.signs : null;
  const locate = (kind, index) => {
    const list = collection(kind);
    if (!list || !Number.isSafeInteger(index) || index < 0 || index >= list.length) fail();
    return expected[kind][index];
  };
  function read({ kind, index } = {}) {
    const object = locate(kind, index);
    return { kind, index, x: object.position.x, y: object.position.y, ...(kind === 'sign' ? { text: object.text } :
      { name: object.name ?? '', slots: clone(object.items ?? []), slotCount: version >= 294 ? object.maxItems ?? 40 : 40 }) };
  }
  return {
    read,
    snapshot: kind => clone(expected[kind]),
    prepareCollection(kind, after) {
      const before = clone(expected[kind]);
      if (equal(before, after)) return null;
      const bytes = new TextEncoder().encode(JSON.stringify(before) + JSON.stringify(after)).byteLength;
      return { kind: `collection:${kind}`, index: 0, before, after: clone(after), cost: Math.max(1, Math.ceil(bytes / 64)) };
    },
    list(kind) {
      if (!collection(kind)) fail();
      return expected[kind].map((object, index) => ({ kind, index, x: object.position.x, y: object.position.y,
        ...(kind === 'chest' ? { name: object.name ?? '' } : { text: object.text.slice(0, 80) }) }));
    },
    prepare(payload, revision) {
      if (!hasKeys(payload, ['kind', 'index', 'revision', 'changes']) || payload.revision !== revision) {
        throw new EditError('对象内容或世界版本已变化，请重新选择对象后再保存。');
      }
      const { kind, index, changes } = payload, before = clone(locate(kind, index)), after = clone(before);
      if (kind === 'sign') {
        if (!hasKeys(changes, ['text']) || Object.keys(changes).length !== 1 || !validText(changes.text)) fail();
        after.text = changes.text;
      } else {
        if (!hasKeys(changes, ['name', 'slots']) || !Object.keys(changes).length) fail();
        if (Object.hasOwn(changes, 'name')) {
          if (!validText(changes.name) || /[\r\n]/.test(changes.name)) fail();
          if (changes.name) after.name = changes.name; else delete after.name;
        }
        if (Object.hasOwn(changes, 'slots')) {
          const count = version >= 294 ? before.maxItems ?? 40 : 40;
          if (!Array.isArray(changes.slots) || changes.slots.length > count || !Number.isInteger(count) || count < 1 || count > MAX_OBJECT_SLOTS) fail();
          const seen = new Set();
          for (const entry of changes.slots) {
            if (!hasKeys(entry, ['slot', 'item']) || Object.keys(entry).length !== 2 || !Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot >= count || seen.has(entry.slot) || !validObjectItem(entry.item, version)) fail();
            seen.add(entry.slot); after.items[entry.slot] = clone(entry.item);
          }
        }
      }
      if (equal(before, after)) return null;
      // Two snapshots count against the shared history budget. UTF-8 payloads
      // are charged as equivalent records so long signs cannot evade eviction.
      const bytes = new TextEncoder().encode(JSON.stringify(before) + JSON.stringify(after)).byteLength;
      return { kind, index, before, after, cost: Math.max(1, Math.ceil(bytes / 64)) };
    },
    write(kind, index, snapshot) {
      if (kind.startsWith('collection:')) {
        kind = kind.slice('collection:'.length);
        if (kind === 'chest') world.chests.chests = clone(snapshot);
        else if (kind === 'sign') world.signs.signs = clone(snapshot);
        else fail();
        expected[kind] = clone(snapshot);
        return;
      }
      collection(kind)[index] = clone(snapshot);
      expected[kind][index] = clone(snapshot);
    },
    expectedSections() {
      const result = new Map();
      for (const [index, io, data] of [[2, new ChestsIO(), { chests: expected.chest }], [3, new SignsIO(), { signs: expected.sign }]]) {
        const saver = new BinarySaver(); io.save(saver, data, { version }); saver.trimBuffer(); result.set(index, saver.getBuffer());
      }
      return result;
    },
  };
}
