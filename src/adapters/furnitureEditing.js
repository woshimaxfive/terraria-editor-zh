import BinarySaver from '../../vendor/terraria-world-file/src/BinarySaver.ts';
import TileEntitiesIO from '../../vendor/terraria-world-file/src/section/TileEntities.ts';
import { TileFlag } from '../../vendor/terraria-world-file/src/types.ts';
import { TILE_FIELDS } from './blockEditing.js';
import { furnitureType, furnitureFrames, furnitureLimit, furnitureCompanion, furnitureEntityType } from '../editing/furniture.js';
import { EditError, MAX_STROKE_TILES } from '../editing/brush.js';
import { containsCell, validSelection } from '../editing/selection.js';
import { validObjectItem } from './objectEditing.js';
import entityRules from '../../vendor/tedit-furniture/entity-rules.json' with { type: 'json' };

const clone = value => structuredClone(value);
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const plain = value => value && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = message => { throw new EditError(message ?? '家具编辑参数无效，未修改世界。'); };
const key = (x,y) => `${x},${y}`;
const blockFlags = TileFlag.IS_BLOCK_ACTIVE | TileFlag.SLOPE_MASK | TileFlag.ACTUATOR | TileFlag.ACTUATED |
  TileFlag.INVISIBLE_BLOCK | TileFlag.FULL_BRIGHT_BLOCK;

// Companion defaults follow TileEntity.CreateForTile; file DTOs stay here.
function newEntity(tileId, pattern, x, y, id, version) {
  const type = furnitureEntityType(tileId), entity = { type, id, position: { x,y } };
  if (type === 0) entity.npc = -1;
  else if ([1,4,6,8].includes(type)) entity.item = {id:0,prefix:0,stack:0};
  else if (type === 2) Object.assign(entity, { logicCheck: Math.trunc(pattern.frames[0].v / 18) + 1, on: false });
  else if (type === 3) {
    entity.items = Array(9).fill(null); entity.dyes = Array(9).fill(null);
    if (version >= 307) entity.pose = 0;
    if (version >= 308) { entity.misc = [null]; entity.extraSlotFlags = 0; }
  } else if (type === 5) Object.assign(entity, {items:[null,null],dyes:[null,null],slotFlags:0});
  else if (type === 9 || type === 10) entity.itemId = type === 9 ? 4612 : 2019;
  return entity;
}

export function createFurnitureEditing(world, objects) {
  const tiles = world.worldTiles.tiles, version = world.fileFormatHeader.version;
  let expectedEntities = clone(world.tileEntities.entities);
  const indexes = new Map();
  const bounds = (x,y) => Number.isSafeInteger(x) && Number.isSafeInteger(y) && x >= 0 && y >= 0 && x < tiles.width && y < tiles.height;
  const read = index => TILE_FIELDS.map(field => tiles[field][index]);
  function frameIndex(tileId) {
    if (!indexes.has(tileId)) {
      const result = new Map(), tile = furnitureType(tileId);
      for (let style = 0; style < (tile?.styles.length ?? 0); style++) {
        const pattern = furnitureFrames(tileId,style);
        for (const f of pattern.frames) {
          const k = key(f.u,f.v); if (!result.has(k)) result.set(k,[]);
          result.get(k).push({pattern,offset:f});
        }
      }
      indexes.set(tileId,result);
    }
    return indexes.get(tileId);
  }
  function inspect({x,y} = {}) {
    if (!bounds(x,y)) fail();
    const index = tiles.index(x,y);
    if (!tiles.hasBlock(index) || !world.fileFormatHeader.importants[tiles.blockId[index]]) return null;
    const tileId = tiles.blockId[index], matches = new Map();
    for (const {pattern,offset} of frameIndex(tileId).get(key(tiles.frameX[index],tiles.frameY[index])) ?? []) {
      const left = x - offset.x, top = y - offset.y;
      if (!bounds(left,top) || !bounds(left + pattern.width - 1,top + pattern.height - 1)) continue;
      if (!pattern.frames.every(f => {
        const i = tiles.index(left+f.x,top+f.y);
        return tiles.hasBlock(i) && tiles.blockId[i] === tileId && tiles.frameX[i] === f.u && tiles.frameY[i] === f.v;
      })) continue;
      const k = `${left},${top},${pattern.width},${pattern.height}`;
      if (!matches.has(k)) matches.set(k,{...pattern,x:left,y:top});
    }
    if (matches.size !== 1) fail(matches.size ? '家具帧对应多个完整结构，暂不能确定编辑范围。' : '家具帧未知或结构不完整，未修改世界。');
    return [...matches.values()][0];
  }
  function prepare(payload,revision) {
    if (!plain(payload) || Object.keys(payload).some(k => !['action','revision','x','y','tileId','styleIndex','selection'].includes(k)) || payload.revision !== revision) fail('世界或家具已变化，请重新预览后再确认。');
    const {action,x,y,selection} = payload;
    if (!['place','remove'].includes(action) || !bounds(x,y) || (selection != null && !validSelection(selection,tiles))) fail();
    let next = null;
    if (action === 'place') {
      if (payload.tileId > furnitureLimit(version) || !world.fileFormatHeader.importants[payload.tileId]) fail('此世界格式不支持该家具。');
      // Legacy equipment uses embedded UV item encoding, not modern TE records.
      // Keep it explicit until conversion/legacy editing has its own reference.
      if ([128,269,334].includes(payload.tileId)) fail('旧式装备家具的帧内物品规则尚未接入。');
      next = {...furnitureFrames(payload.tileId,payload.styleIndex),x,y};
    } else {
      if (Object.hasOwn(payload,'tileId') || Object.hasOwn(payload,'styleIndex')) fail();
      next = inspect({x,y}); if (!next) return {changes:[], affected:[], placed:null};
    }
    const affected = new Map(), owners = new Map();
    function addCell(x,y) {
      if (!bounds(x,y) || !containsCell(selection,x,y)) fail('家具必须完整位于世界和选区内，未修改世界。');
      affected.set(tiles.index(x,y),{x,y});
      if (affected.size > MAX_STROKE_TILES) fail('家具事务超过 10000 格，未修改世界。');
    }
    for (const f of next.frames) addCell(next.x+f.x,next.y+f.y);
    for (const {x:cx,y:cy} of [...affected.values()]) {
      const i = tiles.index(cx,cy);
      if (tiles.hasBlock(i) && world.fileFormatHeader.importants[tiles.blockId[i]]) {
        const owner = inspect({x:cx,y:cy}), k=key(owner.x,owner.y);
        if (owners.has(k)) continue;
        owners.set(k,owner);
        for (const f of owner.frames) addCell(owner.x+f.x,owner.y+f.y);
      }
    }
    const data = {chest:objects.snapshot('chest'),sign:objects.snapshot('sign'),entity:clone(expectedEntities)};
    // Never silently repair unrelated orphan records or discard duplicate data.
    for (const [kind,list] of Object.entries(data)) {
      const seen = new Set();
      for (const record of list) {
        const {x:rx,y:ry}=record.position;
        if (!bounds(rx,ry) || !affected.has(tiles.index(rx,ry))) continue;
        const owner = owners.get(key(rx,ry));
        if (!owner || furnitureCompanion(owner.tileId) !== kind || seen.has(key(rx,ry)) ||
          (kind==='entity' && record.type !== furnitureEntityType(owner.tileId))) fail('编辑区域存在重复或不匹配的配套记录，未修改世界。');
        seen.add(key(rx,ry));
      }
    }
    if (world.weightedPressurePlates.weightedPressurePlates.some(p => bounds(p.position.x,p.position.y) && affected.has(tiles.index(p.position.x,p.position.y)))) fail('编辑区域包含压力板配套记录，尚不能整体替换。');
    const newKind = action==='place' ? furnitureCompanion(next.tileId) : null;
    const keep = newKind ? data[newKind].find(r => r.position.x===x && r.position.y===y &&
      (newKind!=='entity' || r.type===furnitureEntityType(next.tileId))) : null;
    for (const [kind,list] of Object.entries(data)) data[kind]=list.filter(record => {
      if (kind===newKind && record===keep) return true;
      return !owners.has(key(record.position.x,record.position.y));
    });
    if (newKind && !keep) {
      const position={x,y}; let record;
      if (newKind==='chest') record={position,items:Array(40).fill(null),...(version>=294 ? {maxItems:40} : {})};
      else if (newKind==='sign') record={position,text:''};
      else {
        if (x>32767 || y>32767) fail();
        const id=expectedEntities.length ? expectedEntities.reduce((max,r)=>Math.max(max,r.id),-2147483648)+1 : 0;
        if (!Number.isInteger(id) || id<0 || id>2147483647) fail('实体编号已超出存档范围。');
        record=newEntity(next.tileId,next,x,y,id,version);
      }
      data[newKind].push(record);
    }
    for (const kind of ['chest','sign']) if (data[kind].length > (version<216 ? 1000 : 32767)) fail('箱子或告示牌数量超过此格式上限。');
    const changes=[];
    for (const [index] of affected) {
      const before=read(index),after=[...before];
      const cx=Math.floor(index/tiles.height),cy=index%tiles.height;
      if (owners.size && [...owners.values()].some(owner => cx>=owner.x && cx<owner.x+owner.width && cy>=owner.y && cy<owner.y+owner.height)) {
        after[0]=after[1]=after[2]=after[3]=0; after[8]&=~blockFlags;
      }
      if (action==='place') {
        const f=next.frames.find(f => next.x+f.x===cx && next.y+f.y===cy);
        if (f) {
          // Preserve destination extras as SpritePlacer does, including paint.
          after[0]=next.tileId; after[1]=f.u; after[2]=f.v; after[3]=before[3]; after[8]=before[8]|TileFlag.IS_BLOCK_ACTIVE;
        }
      }
      if (!before.every((value,i)=>value===after[i])) changes.push({index,before,after});
    }
    for (const kind of ['chest','sign']) {const change=objects.prepareCollection(kind,data[kind]);if(change) changes.push(change);}
    if (!equal(expectedEntities,data.entity)) {
      const before=clone(expectedEntities),after=data.entity;
      const cost=Math.max(1,Math.ceil(new TextEncoder().encode(JSON.stringify(before)+JSON.stringify(after)).byteLength/64));
      changes.push({kind:'entities',index:0,before,after,cost});
    }
    return {changes,affected:[...affected.values()],placed:action==='place'?next:null};
  }
  return {
    inspect,prepare,
    readEntities: () => ({version,records:expectedEntities.map((record,index) => ({...clone(record),index}))}),
    prepareEntity(payload,revision) {
      if (!plain(payload) || Object.keys(payload).some(k=>!['index','revision','changes'].includes(k)) || payload.revision!==revision) fail('世界或实体已变化，请重新读取后保存。');
      const {index,changes}=payload, original=expectedEntities[index];
      if (!Number.isSafeInteger(index) || index<0 || !original || !plain(changes) || !Object.keys(changes).length) fail();
      const record=clone(original), type=record.type;
      const allowed=type===0?['npc']:type===2?['logicCheck','on']:type===3?['pose','slots']:type===5?['slots']:
        [1,4,6,8].includes(type)?['item']:[9,10].includes(type)?['itemId']:[];
      if (Object.keys(changes).some(k=>!allowed.includes(k))) fail();
      for (const [field,value] of Object.entries(changes)) {
        if (field==='item') {
          if (!validObjectItem(value,version)) fail();
          record.item=value===null?{id:0,prefix:0,stack:0}:clone(value);
        } else if (field==='npc') {
          if (!Number.isInteger(value)||value < -1 || value>32767) fail();record.npc=value;
        } else if (field==='logicCheck') {
          if (!Number.isInteger(value)||value<0||value>255) fail();record.logicCheck=value;
        } else if (field==='on') {
          if (typeof value!=='boolean') fail();record.on=value;
        } else if (field==='pose') {
          if (version<307 || !entityRules.poses.includes(value)) fail();record.pose=value;
        } else if (field==='itemId') {
          if (!(type===9?entityRules.kites:entityRules.critters).includes(value)) fail();record.itemId=value;
        } else if (field==='slots') {
          if (!Array.isArray(value)||value.length>19) fail();const seen=new Set();
          const sizes=type===5?{items:2,dyes:2}:{items:version>=308?9:8,dyes:version>=308?9:8,...(version>=308?{misc:1}:{})};
          for (const entry of value) {
            if (!plain(entry)||Object.keys(entry).length!==3||!['group','slot','item'].every(k=>Object.hasOwn(entry,k))||
              !Object.hasOwn(sizes,entry.group)||!Number.isInteger(entry.slot)||entry.slot<0||entry.slot >= sizes[entry.group]||seen.has(entry.group+':'+entry.slot)||!validObjectItem(entry.item,version)) fail();
            seen.add(entry.group+':'+entry.slot);record[entry.group][entry.slot]=clone(entry.item);
          }
        }
      }
      if (equal(original,record)) return [];
      const before=clone(expectedEntities),after=clone(expectedEntities);after[index]=record;
      const cost=Math.max(1,Math.ceil(new TextEncoder().encode(JSON.stringify(before)+JSON.stringify(after)).byteLength/64));
      return [{kind:'entities',index:0,before,after,cost}];
    },
    write(snapshot) {world.tileEntities.entities=clone(snapshot);expectedEntities=clone(snapshot);},
    expectedSections() {
      const saver=new BinarySaver();new TileEntitiesIO().save(saver,{entities:expectedEntities},{version});saver.trimBuffer();
      return new Map([[5,saver.getBuffer()]]);
    },
  };
}
