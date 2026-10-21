export const WIRES = [
  { bit: 1, name: '红', property: 'wireRed', color: '#ff5555' },
  { bit: 2, name: '蓝', property: 'wireBlue', color: '#579bff' },
  { bit: 4, name: '绿', property: 'wireGreen', color: '#54dc73' },
  { bit: 8, name: '黄', property: 'wireYellow', color: '#ffe16b' },
];
export const wireMaskOf = tile => WIRES.reduce((mask, wire) => tile[wire.property] ? mask | wire.bit : mask, 0);
export function validCircuit(layer, value) {
  return layer === 'wire' ? Number.isInteger(value.mask) && value.mask >= 0 && value.mask <= 15 && typeof value.erase === 'boolean' :
    typeof value.actuator === 'boolean' && typeof value.actuated === 'boolean';
}
