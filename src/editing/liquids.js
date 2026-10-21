// Desktop TEdit LiquidAmountMode values, rounded to the same byte amounts.
export const LIQUID_AMOUNTS = [0, 26, 51, 77, 102, 128, 153, 179, 204, 230, 255];
export const LIQUIDS = [
  { id: 1, name: '水', minVersion: 194 },
  { id: 2, name: '熔岩', minVersion: 194 },
  { id: 3, name: '蜂蜜', minVersion: 194 },
  { id: 4, name: '微光', minVersion: 269 },
];
export const findLiquid = (id, version) => LIQUIDS.find(item => item.id === id && item.minVersion <= version);
export const sampledLiquidAmount = amount => LIQUID_AMOUNTS.find(value => value >= amount) ?? 255;
export function validLiquid(type, amount, version) {
  return Number.isInteger(amount) && amount >= 0 && amount <= 255 &&
    (Boolean(findLiquid(type, version)) || (type === 0 && amount === 0));
}
