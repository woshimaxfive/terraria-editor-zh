import catalogue from '../../vendor/tedit-materials/catalogue.json' with { type: 'json' };

export const MATERIALS = catalogue.filter(item => item.layer === 'block');
export const WALL_MATERIALS = catalogue.filter(item => item.layer === 'wall');

export function materialsFor(layer, version) {
  return catalogue.filter(item => item.layer === layer && item.minVersion <= version);
}

export function findMaterial(layer, id, version) {
  return catalogue.find(item => item.layer === layer && item.id === id && item.minVersion <= version);
}

export function searchMaterials(materials, query, group = '') {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return materials.filter(item => (!group || item.group === group) && words.every(word =>
    `${item.name} ${item.english} ${item.id}${item.layer === 'block' && item.id === 0 ? ' 泥土' : ''}`.toLowerCase().includes(word)));
}
