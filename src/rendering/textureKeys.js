// Numeric resource identities keep the transferable sprite protocol independent
// of filenames. Tile IDs retain their existing values; atlas families cannot
// collide with one another or with stored world IDs.
const families = Object.freeze({ tile:0, tree:1, treeTop:2, treeBranch:3, shroomTop:4,
  item:5,armorHead:6,armorBody:7,armorFemale:8,armorLegs:9,player:10,hair:11,extra:12,gore:13,xmas:14,cactus:15 });
const limits = Object.freeze({ tile:65535, tree:6, treeTop:31, treeBranch:31, shroomTop:0,
  item:65535,armorHead:65535,armorBody:65535,armorFemale:65535,armorLegs:65535,player:383,hair:255,extra:65535,gore:65535,xmas:4,cactus:2 });
const cactusNames=['Good_Cactus','Evil_Cactus','Crimson_Cactus'];
const patterns = [
  ['item',/^Item_(\d+)$/i],['armorHead',/^Armor_Head_(\d+)$/i],
  ['armorFemale',/^(?:Armor\/)?Armor_Female_(\d+)$/i],['armorBody',/^(?:Armor\/)?Armor_(\d+)$/i],
  ['armorLegs',/^Armor_Legs_(\d+)$/i],['hair',/^Player_Hair_(\d+)$/i],
  ['extra',/^Extra_(\d+)$/i],['gore',/^Gore_(\d+)$/i],['xmas',/^Xmas_(\d+)$/i],
];

export function textureKey(kind, id = 0) {
  if (!Object.hasOwn(families,kind) || !Number.isSafeInteger(id) || id < 0 || id > limits[kind]) return null;
  return families[kind]*65536+id;
}

export function parseTextureName(name) {
  const file = /^(.*)\.(xnb|png)$/i.exec(name);
  if (!file) return null;
  const cactus=cactusNames.findIndex(n=>n.toLowerCase()===file[1].toLowerCase());
  if(cactus>=0)return {key:textureKey('cactus',cactus),kind:'cactus',id:cactus};
  const player = /^Player_(\d+)_(\d+)$/i.exec(file[1]);
  if (player) {
    const variant=Number(player[1]),part=Number(player[2]);
    if(variant>11 || part>31)return null;
    const id=variant*32+part;return {key:textureKey('player',id),kind:'player',id};
  }
  for(const [kind,pattern]of patterns){
    const match=pattern.exec(file[1]);if(!match)continue;
    const id=Number(match[1]),key=textureKey(kind,id);return key===null?null:{key,kind,id};
  }
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
  if(kind==='player')return `Player_${Math.trunc(id/32)}_${id%32}`;
  if(kind==='cactus')return cactusNames[id];
  const prefix={tile:'Tiles_',tree:'Tiles_5_',treeTop:'Tree_Tops_',treeBranch:'Tree_Branches_',item:'Item_',
    armorHead:'Armor_Head_',armorBody:'Armor/Armor_',armorFemale:'Armor/Armor_Female_',armorLegs:'Armor_Legs_',
    hair:'Player_Hair_',extra:'Extra_',gore:'Gore_',xmas:'Xmas_'}[kind];
  return prefix ? prefix+id : 'Shroom_Tops';
}
