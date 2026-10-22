import BinarySaver from '../../vendor/terraria-world-file/src/BinarySaver.ts';
import NPCsIO from '../../vendor/terraria-world-file/src/section/NPCs.ts';
import { EditError } from '../editing/brush.js';
import { npcType, npcLimit } from '../editing/npcs.js';

const clone = value => structuredClone(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hasKeys = (value, allowed) => value && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Object.keys(value).every(key => allowed.includes(key));
const fail = () => { throw new EditError('NPC 编辑参数无效，未修改世界。'); };
const validName = name => typeof name === 'string' && name.length <= 1024 && !/[\r\n\x00]/.test(name) &&
  ![...name].some(char => char.codePointAt(0) >= 0xd800 && char.codePointAt(0) <= 0xdfff) && new TextEncoder().encode(name).byteLength <= 1024;

// Raw records and flags never leave this adapter. Keys survive undo and are
// never reused, so duplicate names/types and list removal cannot retarget edits.
export function createNpcEditing(world, properties) {
  const version = world.fileFormatHeader.version;
  let nextKey = 0;
  let expected = { data: clone(world.NPCs), keys: world.NPCs.townNPCs.map(() => String(++nextKey)) };
  const inside = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < world.header.maxTilesX && y < world.header.maxTilesY;
  function records() {
    return expected.data.townNPCs.map((npc, index) => ({ key: expected.keys[index], id: npc.id, name: npc.name,
      x: npc.position.x / 16, y: npc.position.y / 16, homeX: npc.homePosition.x, homeY: npc.homePosition.y,
      homeless: npc.homeless, homelessDespawn: npc.homelessDespawn, variant: npc.variationIndex ?? null,
      shimmered: expected.data.shimmeredNPCIds.includes(npc.id), partying: properties.npcParty(npc.id) }));
  }
  return {
    read: () => ({ records: records(), version, maxNpcId: npcLimit(version) }),
    points: () => records().filter(npc => Number.isFinite(npc.x) && Number.isFinite(npc.y)).map(npc => ({
      id: 'npc:' + npc.key, label: `${npcType(npc.id)?.zh ?? 'NPC ' + npc.id} · ${npc.name} (#${npc.key})`, x: npc.x, y: npc.y,
    })),
    prepare(payload, revision) {
      if (!hasKeys(payload, ['revision', 'action', 'key', 'id', 'changes', 'x', 'y']) || payload.revision !== revision) {
        throw new EditError('NPC 内容或世界版本已变化，请重新选择后再保存。');
      }
      const { action } = payload, before = clone(expected), after = clone(before), changes = [];
      if (action === 'add') {
        if (!hasKeys(payload, ['revision', 'action', 'id']) || !npcType(payload.id) || payload.id > npcLimit(version) ||
            after.data.townNPCs.length >= 1000 || after.data.townNPCs.some(npc => npc.id === payload.id)) fail();
        const x = world.header.spawnTileX, y = world.header.spawnTileY;
        if (!inside(x, y)) fail();
        after.keys.push(String(++nextKey));
        after.data.townNPCs.push({ id: payload.id, name: npcType(payload.id).name, homeless: true,
          homePosition: { x, y }, position: { x: x * 16, y: y * 16 },
          ...(version >= 213 ? { variationFlags: 1, variationIndex: 0 } : {}), ...(version >= 315 ? { homelessDespawn: false } : {}),
          ...(after.data.shimmeredNPCIds.includes(payload.id) ? { shimmered: true } : {}),
        });
      } else {
        const index = expected.keys.indexOf(payload.key);
        if (index < 0 || typeof payload.key !== 'string') fail();
        const npc = after.data.townNPCs[index], type = npcType(npc.id);
        if (action === 'remove') {
          if (!hasKeys(payload, ['revision', 'action', 'key'])) fail();
          after.keys.splice(index, 1); after.data.townNPCs.splice(index, 1);
        } else if (action === 'move') {
          if (!hasKeys(payload, ['revision', 'action', 'key', 'x', 'y']) || !inside(payload.x, payload.y)) fail();
          npc.homePosition = { x: payload.x, y: payload.y }; npc.position = { x: payload.x * 16, y: payload.y * 16 };
        } else if (action === 'update') {
          if (!hasKeys(payload, ['revision', 'action', 'key', 'changes']) || !hasKeys(payload.changes, ['name', 'variant', 'shimmered', 'partying', 'homeless', 'homelessDespawn']) || !Object.keys(payload.changes).length) fail();
          for (const [key, value] of Object.entries(payload.changes)) {
            if (key === 'name') { if (!validName(value)) fail(); npc.name = value; }
            else if (key === 'variant') {
              if (version < 213 || !type?.variants.length || !Number.isInteger(value) || value < 0 || value >= type.variants.length) fail();
              npc.variationIndex = value;
            } else {
              if (typeof value !== 'boolean') fail();
              if (key === 'shimmered') {
                if (version < 268 || !type?.canShimmer) fail();
                const ids = after.data.shimmeredNPCIds;
                if (ids.includes(npc.id) !== value) {
                  after.data.shimmeredNPCIds = value ? [...ids, npc.id] : ids.filter(id => id !== npc.id);
                  for (const instance of after.data.townNPCs.filter(record => record.id === npc.id)) {
                    if (value) instance.shimmered = true; else delete instance.shimmered;
                  }
                }
              } else if (key === 'partying') {
                const patch = properties.prepareNpcParty(npc.id, value); if (patch) changes.push(patch);
              } else {
                if (key === 'homelessDespawn' && version < 315) fail();
                npc[key] = value;
              }
            }
          }
        } else fail();
      }
      if (!equal(before, after)) changes.unshift({ kind: 'npc', index: 0, before, after,
        cost: Math.max(1, Math.ceil(new TextEncoder().encode(JSON.stringify(before) + JSON.stringify(after)).byteLength / 64)) });
      return changes;
    },
    write(snapshot) { expected = clone(snapshot); world.NPCs = clone(snapshot.data); },
    expectedSections() {
      const saver = new BinarySaver(); new NPCsIO().save(saver, expected.data, { version }); saver.trimBuffer();
      return new Map([[4, saver.getBuffer()]]);
    },
  };
}
