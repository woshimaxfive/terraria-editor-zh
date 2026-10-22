import catalogue from '../../vendor/tedit-npcs/catalogue.json' with { type: 'json' };

export const NPC_TYPES = catalogue.npcs;
export const npcType = id => NPC_TYPES.find(type => type.id === id);
export const npcLimit = version => catalogue.versions.findLast(row => row.version <= version)?.maxNpcId ?? 0;
export function searchNpcs(query, version) {
  const text = query.trim().toLocaleLowerCase();
  return NPC_TYPES.filter(type => type.id <= npcLimit(version) && [type.id, type.name, type.key, type.zh].some(value => String(value).toLocaleLowerCase().includes(text)));
}
