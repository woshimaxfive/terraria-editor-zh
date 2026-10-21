// SPDX-License-Identifier: MS-PL
// TEdit contributors. Adapted from TileMaskSettings for plain browser data.
// Source and license: vendor/tedit-editing-rules/.
export const MASK_FIELDS = Object.freeze([
  { id: 'blockId', name: '方块 ID', min: -1, max: 65535, empty: -1 },
  { id: 'wallId', name: '墙壁 ID', min: 0, max: 65535, empty: 0 },
  { id: 'slope', name: '坡形', min: 0, max: 7, empty: 0 },
  { id: 'blockColor', name: '方块涂料 ID', min: 0, max: 255, empty: 0 },
  { id: 'wallColor', name: '墙壁涂料 ID', min: 0, max: 255, empty: 0 },
  ...[['actuator', '制动器'], ['actuated', '虚化'], ['invisibleBlock', '方块隐形'],
    ['fullBrightBlock', '方块全亮'], ['invisibleWall', '墙壁隐形'], ['fullBrightWall', '墙壁全亮'],
    ['wireRed', '红电线'], ['wireBlue', '蓝电线'], ['wireGreen', '绿电线'], ['wireYellow', '黄电线']]
    .map(([id, name]) => ({ id, name, boolean: true })),
  { id: 'liquidType', name: '液体种类', min: 0, max: 4, empty: 0 },
  { id: 'liquidAmount', name: '液量', min: 0, max: 255, quantity: true },
]);
export const MASK_MODES = Object.freeze({ off: '不限制', match: '匹配', empty: '为空 / 没有', not: '不匹配',
  equal: '等于', greater: '大于', less: '小于' });
export const modesFor = field => field.quantity ? ['off', 'equal', 'greater', 'less'] : ['off', 'match', 'empty', 'not'];
export const needsValue = rule => {
  const field = MASK_FIELDS.find(item => item.id === rule.field);
  return field && !field.boolean && !['off', 'empty'].includes(rule.mode);
};

export function validMasks(rules) {
  if (rules === undefined) return true;
  if (!Array.isArray(rules) || rules.length > MASK_FIELDS.length || new Set(rules.map(rule => rule?.field)).size !== rules.length) return false;
  return [...rules].every(rule => {
    const field = MASK_FIELDS.find(item => item.id === rule?.field);
    return field && modesFor(field).includes(rule.mode) && (!needsValue(rule) ||
      (Number.isSafeInteger(rule.value) && rule.value >= field.min && rule.value <= field.max));
  });
}

export function passesMasks(values, rules = []) {
  return rules.every(rule => {
    if (rule.mode === 'off') return true;
    const field = MASK_FIELDS.find(item => item.id === rule.field), actual = values[rule.field];
    if (field.boolean) return rule.mode === 'match' ? actual : !actual;
    // Desktop treats a dry liquid as empty, even if a dormant type is present.
    if (rule.mode === 'empty') return actual === field.empty || (rule.field === 'liquidType' && values.liquidAmount === 0);
    if (rule.mode === 'greater') return actual > rule.value;
    if (rule.mode === 'less') return actual < rule.value;
    return rule.mode === 'not' ? actual !== rule.value : actual === rule.value;
  });
}

export function masksFromSample(values) {
  return MASK_FIELDS.map(field => ({ field: field.id,
    mode: field.boolean ? values[field.id] ? 'match' : 'empty' : field.quantity ? 'equal' : 'match',
    ...(field.boolean ? {} : { value: values[field.id] }) }));
}
