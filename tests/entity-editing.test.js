import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';
import rules from '../vendor/tedit-furniture/entity-rules.json' with {type:'json'};

const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
after(()=>server.close());
const {openWorld}=await server.ssrLoadModule('/src/adapters/worldFile.js');
const {FileReader,FileSaver,TileData}=await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const {createFurnitureEditing}=await server.ssrLoadModule('/src/adapters/furnitureEditing.js');
const {createObjectEditing}=await server.ssrLoadModule('/src/adapters/objectEditing.js');
const {TILE_FIELDS}=await server.ssrLoadModule('/src/adapters/blockEditing.js');
const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const input=async name=>ab(await readFile(new URL(name+'.wld',fixtureRoot)));
const parse=async bytes=>(await new FileReader().loadBuffer(bytes)).parse();
const same=(a,b)=>assert.deepEqual(new Uint8Array(a),new Uint8Array(b));
const item={id:1,stack:1,prefix:0},unknown={id:32767,stack:32767,prefix:255};
function adapter(type,version=318,extras={}) {
  const record={type,id:98,position:{x:5,y:6},...structuredClone(extras)};
  const world={worldTiles:{tiles:new TileData(20,20)},fileFormatHeader:{version,importants:[]},chests:{chests:[]},signs:{signs:[]},
    tileEntities:{entities:[record,{type:1,id:99,position:{x:15,y:15},item:structuredClone(unknown)}]},weightedPressurePlates:{weightedPressurePlates:[]}};
  return createFurnitureEditing(world,createObjectEditing(world));
}
const patch=(editor,changes,revision=0)=>editor.prepareEntity({index:0,revision,changes},0);

test('entity enums match the pinned desktop definitions, including nine doll poses',()=>{
  assert.deepEqual(rules.poses,[0,1,2,3,4,5,6,7,8]);assert.equal(rules.kites.length,24);assert.equal(rules.critters.length,93);
  assert.ok(rules.kites.includes(4612));assert.ok(rules.critters.includes(2019));
});

test('all eleven entity families expose only their content fields, preserving IDs, positions, unrelated records and unknown values',()=>{
  for(const type of [0,1,2,3,4,5,6,7,8,9,10]) {
    const extra=type===0?{npc:-1}:type===2?{logicCheck:200,on:false}:type===3?{pose:250,items:Array(9).fill(unknown),dyes:Array(9).fill(null),misc:[null],extraSlotFlags:248}:
      type===5?{items:[unknown,null],dyes:[null,null],slotFlags:240}:[1,4,6,8].includes(type)?{item:unknown}:[9,10].includes(type)?{itemId:32767}:{};
    const editor=adapter(type,318,extra),before=editor.readEntities().records;
    const changes=type===0?{npc:32767}:type===2?{logicCheck:0,on:true}:type===3?{pose:8,slots:[{group:'items',slot:8,item},{group:'dyes',slot:8,item},{group:'misc',slot:0,item}]}:
      type===5?{slots:[{group:'dyes',slot:1,item}]}:[1,4,6,8].includes(type)?{item}:[9,10].includes(type)?{itemId:type===9?4612:2019}:{};
    if(type===7) {assert.throws(()=>patch(editor,{item}));assert.deepEqual(editor.readEntities().records,before);continue;}
    const result=patch(editor,changes);assert.equal(result.length,1);assert.ok(result[0].cost>0);
    assert.deepEqual(result[0].before[1],{type:1,id:99,position:{x:15,y:15},item:unknown});
    const after=result[0].after[0];assert.equal(after.id,98);assert.deepEqual(after.position,{x:5,y:6});
    if(type===3) {assert.deepEqual(after.items[0],unknown);assert.equal(after.extraSlotFlags,248);assert.deepEqual(after.items[8],item);assert.deepEqual(after.misc[0],item);}
    if(type===5) {assert.deepEqual(after.items[0],unknown);assert.equal(after.slotFlags,240);assert.deepEqual(after.dyes[1],item);}
    editor.write(result[0].after);assert.deepEqual(patch(editor,changes),[]);
    const detached=editor.readEntities();detached.records[0].position.x=100;assert.equal(editor.readEntities().records[0].position.x,5);
  }
});

test('doll pose/extra slots follow format 307/308 boundaries, and null clears items without normalizing untouched slots',()=>{
  for(const version of [194,306,307,308,310,311,312,318,326]) {
    const editor=adapter(3,version,{items:Array(9).fill(unknown),dyes:Array(9).fill(null),...(version>=307?{pose:255}:{}),...(version>=308?{misc:[unknown],extraSlotFlags:248}:{})});
    if(version<307) assert.throws(()=>patch(editor,{pose:0}));else assert.equal(patch(editor,{pose:8})[0].after[0].pose,8);
    for(const change of [{group:'items',slot:8,item},{group:'dyes',slot:8,item},{group:'misc',slot:0,item}]) {
      if(version<308) assert.throws(()=>patch(editor,{slots:[change]}));else assert.deepEqual(patch(editor,{slots:[change]})[0].after[0][change.group][change.slot],item);
    }
    assert.equal(patch(editor,{slots:[{group:'items',slot:0,item:null}]})[0].after[0].items[0],null);
    assert.deepEqual(patch(editor,{slots:[{group:'items',slot:0,item:null}]})[0].after[0].items[1],unknown);
  }
  assert.deepEqual(patch(adapter(1,318,{item}),{item:null})[0].after[0].item,{id:0,stack:0,prefix:0});
});

test('invalid fields, slots, prototype names, items, stale revisions and enum values reject atomically',()=>{
  const editor=adapter(3,318,{items:Array(9).fill(null),dyes:Array(9).fill(null),misc:[null],pose:0,extraSlotFlags:0});
  const before=editor.readEntities();
  for(const changes of [{pose:9},{pose:-1},{pose:1.5},{position:{x:1,y:1}},{id:5},{item},
    {slots:[{group:'__proto__',slot:0,item}]},{slots:[{group:'constructor',slot:0,item}]},{slots:[{group:'items',slot:9,item}]},
    {slots:[{group:'items',slot:0,item},{group:'items',slot:0,item}]},{slots:[{group:'items',slot:0,item:{...item,id:99999}}]},
    {slots:[{group:'items',slot:0,item:{...item,stack:0}}]},{slots:[{group:'items',slot:0,item:{...item,prefix:255}}]},
    {slots:[{group:'items',slot:0,item,extra:true}]},{}]) {
    assert.throws(()=>patch(editor,changes));assert.deepEqual(editor.readEntities(),before);
  }
  for(const payload of [{index:-1,revision:0,changes:{pose:1}},{index:0,revision:1,changes:{pose:1}},{index:0,revision:0,changes:{pose:1},extra:0}]) assert.throws(()=>editor.prepareEntity(payload,0));
  for(const [type,extra,changes] of [[0,{npc:-1},{npc:32768}],[2,{logicCheck:1,on:false},{logicCheck:256}],[2,{logicCheck:1,on:false},{on:1}],
    [9,{itemId:4612},{itemId:2019}],[10,{itemId:2019},{itemId:4612}]]) assert.throws(()=>patch(adapter(type,318,extra),changes));
  assert.throws(()=>patch(adapter(1,194,{item}),{item:{...item,id:6000}}));
});

for(const fixture of fixtures) test(fixture.name+': native world with added item frame, content save, structure removal and complete byte-exact history',async()=>{
  const bytes=await input(fixture.name),before=await parse(bytes),doc=await openWorld(bytes);
  doc.editFurniture({revision:0,action:'place',tileId:395,styleIndex:0,x:10,y:10});const placed=doc.serialize(),placedWorld=await parse(placed);
  const index=doc.readEntities().records.length-1,revision=doc.editState.revision;
  doc.editEntity({index,revision,changes:{item}});const filled=doc.serialize(),after=await parse(filled);
  assert.deepEqual(after.tileEntities.entities.at(-1).item,item);
  for(const field of TILE_FIELDS) assert.deepEqual(after.worldTiles.tiles[field],placedWorld.worldTiles.tiles[field]);
  for(const field of ['header','footer','NPCs','chests','signs','weightedPressurePlates','townManager','bestiary','creativePowers']) assert.deepEqual(after[field],before[field],field);
  assert.throws(()=>doc.editEntity({index,revision,changes:{item:null}}),/已变化/);same(doc.serialize(),filled);
  const preview=doc.previewFurniture({revision:doc.editState.revision,action:'remove',x:10,y:10});
  assert.deepEqual(preview.removed,{chests:0,signs:0,entities:1,items:1,texts:0});same(doc.serialize(),filled);
  doc.editFurniture({revision:doc.editState.revision,action:'remove',x:10,y:10});const removed=doc.serialize();
  for(const expected of [filled,placed,bytes]) {doc.undo();same(doc.serialize(),expected);}
  for(const expected of [placed,filled,removed]) {doc.redo();same(doc.serialize(),expected);}
});

test('actual modern save retains reserved bits and unknown untouched equipment while editing ninth items, dyes and hand slots',async()=>{
  const world=await parse(await input('v1.4.5.5'));
  const doll={type:3,id:70000,position:{x:10,y:10},items:Array(9).fill(null),dyes:Array(9).fill(null),misc:[null],pose:250,extraSlotFlags:248};doll.items[0]=unknown;
  const hat={type:5,id:70001,position:{x:20,y:10},items:[unknown,null],dyes:[null,null],slotFlags:240};
  world.tileEntities.entities.push(doll,hat);const bytes=new FileSaver().save(world),before=await parse(bytes),doc=await openWorld(bytes),base=before.tileEntities.entities.length-2;
  doc.editEntity({index:base,revision:0,changes:{pose:8,slots:[{group:'items',slot:8,item},{group:'dyes',slot:8,item},{group:'misc',slot:0,item}]}});
  doc.editEntity({index:base+1,revision:1,changes:{slots:[{group:'dyes',slot:1,item}]}});
  const saved=await parse(doc.serialize()),records=saved.tileEntities.entities;
  assert.deepEqual(records[base].items[0],unknown);assert.deepEqual(records[base].items[8],item);assert.deepEqual(records[base].dyes[8],item);assert.deepEqual(records[base].misc,[item]);
  assert.equal(records[base].extraSlotFlags,255);assert.equal(records[base].pose,8);assert.equal(records[base+1].slotFlags,249);assert.deepEqual(records[base+1].items[0],unknown);
  assert.deepEqual(records.slice(0,base),before.tileEntities.entities.slice(0,base));
  for(const field of TILE_FIELDS) assert.deepEqual(saved.worldTiles.tiles[field],before.worldTiles.tiles[field]);
  for(const field of ['header','footer','NPCs','chests','signs','weightedPressurePlates','townManager','bestiary','creativePowers']) assert.deepEqual(saved[field],before[field]);
  doc.undo();doc.undo();same(doc.serialize(),bytes);
});
