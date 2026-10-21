// SPDX-License-Identifier: MS-PL
// TEdit contributors. Desktop appearance facts: vendor/tedit-appearance/.
import metadata from '../../vendor/tedit-appearance/metadata.json' with { type: 'json' };

const slopeIds = new Set(metadata.slopeIds);
export const supportsSlope = id => slopeIds.has(id);
// Corner names identify the removed half, as in desktop BrickStyle.
export const SHAPES = Object.freeze([
  { id: 0, name: '完整方块', symbol: '■' }, { id: 1, name: '半砖', symbol: '▄' },
  { id: 2, name: '右上削角', symbol: '◣' }, { id: 3, name: '左上削角', symbol: '◢' },
  { id: 4, name: '右下削角', symbol: '◤' }, { id: 5, name: '左下削角', symbol: '◥' },
]);
const names = ['无涂料', '红', '橙', '黄', '黄绿', '绿', '青绿', '青', '天蓝', '蓝', '紫', '蓝紫', '粉'];
export const PAINTS = Object.freeze(metadata.paints.map(item => ({ ...item,
  name: item.id < 13 ? names[item.id] : item.id < 25 ? `深${names[item.id - 12]}` :
    ['黑', '白', '灰', '棕', '暗影', '反色', '夜明'][item.id - 25],
})));

export function validAppearance(layer, value, version) {
  if (layer === 'slope') return Number.isInteger(value) && value >= 0 && value <= 5;
  if (layer !== 'paint' || !value || !['block', 'wall'].includes(value.target)) return false;
  if (value.mode === 'color') return Number.isInteger(value.color) && value.color >= 0 && value.color <= 31;
  return value.mode === 'coating' && version >= 269 && typeof value.invisible === 'boolean' && typeof value.fullBright === 'boolean';
}
