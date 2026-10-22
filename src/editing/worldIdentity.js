// Terraria stores Guid.ToByteArray() order, with three little-endian components.
const guidOrder = [3, 2, 1, 0, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15];
export const TEAM_NAMES = ['白队', '红队', '绿队', '蓝队', '黄队', '粉队'];

export function guidBytes(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return null;
  const hex = value.replaceAll('-', '');
  return new Uint8Array(guidOrder.map(index => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)));
}

export function guidText(bytes) {
  const hex = guidOrder.map(index => bytes[index].toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

export function pointChanges(id, { x, y }) {
  if (!['spawn', 'dungeon', ...TEAM_NAMES.map((_, index) => 'team' + index)].includes(id)) return null;
  return { [id + 'X']: x, [id + 'Y']: y };
}

export function initializeTeamDraft(values) {
  return Object.fromEntries(TEAM_NAMES.flatMap((_, index) => [['team' + index + 'X', values.spawnX], ['team' + index + 'Y', values.spawnY]]));
}
