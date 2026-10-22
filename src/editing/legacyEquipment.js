// Embedded-frame rules adapted from TEdit (MS-PL); pins in vendor/tedit-furniture/source.json.
import rules from '../../vendor/tedit-furniture/legacy-equipment.json' with { type: 'json' };
import limits from '../../vendor/tedit-objects/editing-limits.json' with { type: 'json' };
import { EditError } from './brush.js';

export const isLegacyEquipment = id => [128,269,334].includes(id);
export const legacyArmor = rules.armor;
const rackable = new Set(rules.rackable);
const fail = () => {throw new EditError('旧式装备内容无效或超出此存档可表示范围，未修改世界。');};
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));

export function legacyBaseU(tileId,u) {
  if (!isLegacyEquipment(tileId)) return u;
  if (u < 0) return null;
  return tileId===334 ? (u>=5000 ? (Math.trunc(u/5000)-1)*18 : u) : u%100;
}
export function legacyContents(pattern) {
  const frame = (x,y) => pattern.frames.find(f=>f.x===x&&f.y===y).u;
  if (pattern.tileId!==334) return {head:Math.trunc(frame(0,0)/100),body:Math.trunc(frame(0,1)/100),legs:Math.trunc(frame(0,2)/100)};
  return {item:frame(0,1)>=5000 ? {id:frame(0,1)%5000-100,prefix:frame(1,1)%5000} : null};
}
export function legacyItemCount(pattern) {
  if (!isLegacyEquipment(pattern.tileId)) return 0;
  const content = legacyContents(pattern);
  return pattern.tileId===334 ? Number(content.item?.id>0) : ['head','body','legs'].filter(field=>content[field]>0).length;
}
export function legacyWithContents(pattern,content) {
  const frames=pattern.frames.map(f=>({...f}));
  if (pattern.tileId===334) {
    if (content.item!==null) for(const f of frames) if(f.y===1&&f.x<2) f.u=(Math.trunc(f.u/18)+1)*5000+(f.x===0 ? 100+content.item.id : content.item.prefix);
  } else for(const f of frames) if(f.x===0) f.u+=100*content[['head','body','legs'][f.y]];
  if (frames.some(f=>!Number.isInteger(f.u)||f.u<0||f.u>32767)) fail();
  return {...pattern,frames};
}
export function validateLegacyChanges(tileId,changes,version) {
  const fields=tileId===334?['item']:['head','body','legs'];
  if(!plain(changes)||!Object.keys(changes).length||Object.keys(changes).some(field=>!fields.includes(field))) fail();
  const maxItem=limits.versions.findLast(entry=>entry.version<=version)?.maxItemId??0;
  for(const [field,value] of Object.entries(changes)) {
    if(field==='item') {
      if(value===null) continue;
      if(!plain(value)||Object.keys(value).length!==2||!Number.isInteger(value.id)||value.id<1||value.id>Math.min(4899,maxItem)||!rackable.has(value.id)||
        !Number.isInteger(value.prefix)||!limits.prefixes.includes(value.prefix)||(version<315&&value.prefix>84)) fail();
    } else if(!Number.isInteger(value)||value<0||value>327||value!==0&&!rules.armor[field].some(([id,index])=>index===value&&id<=maxItem)) fail();
  }
  return structuredClone(changes);
}
