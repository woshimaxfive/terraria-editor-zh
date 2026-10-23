// Numeric resource identities keep the transferable sprite protocol independent
// of filenames. Tile IDs retain their existing values; atlas families cannot
// collide with one another or with stored world IDs.
const families = Object.freeze({ tile:0, tree:1, treeTop:2, treeBranch:3, shroomTop:4 });
const limits = Object.freeze({ tile:65535, tree:6, treeTop:31, treeBranch:31, shroomTop:0 });

export function textureKey(kind, id = 0) {
  if (!Object.hasOwn(families,kind) || !Number.isSafeInteger(id) || id < 0 || id > limits[kind]) return null;
  return families[kind]*65536+id;
}

export function parseTextureName(name) {
  const match = /^(Tiles_(5_)?(\d+)|Tree_Tops_(\d+)|Tree_Branches_(\d+)|Shroom_Tops)\.(xnb|png)$/i.exec(name);
  if (!match) return null;
  const kind = match[2] ? 'tree' : match[3] ? 'tile' : match[4] ? 'treeTop' : match[5] ? 'treeBranch' : 'shroomTop';
  const id = Number(match[3] ?? match[4] ?? match[5] ?? 0), key = textureKey(kind,id);
  return key === null ? null : { key,kind,id };
}

export function textureName(key) {
  if (!Number.isSafeInteger(key) || key < 0) return null;
  const id = key%65536, kind = Object.keys(families).find(k => families[k] === Math.floor(key/65536));
  if (textureKey(kind,id) !== key) return null;
  return kind === 'tile' ? `Tiles_${id}` : kind === 'tree' ? `Tiles_5_${id}` :
    kind === 'treeTop' ? `Tree_Tops_${id}` : kind === 'treeBranch' ? `Tree_Branches_${id}` : 'Shroom_Tops';
}
