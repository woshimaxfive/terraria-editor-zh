import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
after(()=>server.close());
const {openWorld}=await server.ssrLoadModule('/src/adapters/worldFile.js');
const {FileReader,FileSaver}=await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const {createFurnitureEditing}=await server.ssrLoadModule('/src/adapters/furnitureEditing.js');
const {createObjectEditing}=await server.ssrLoadModule('/src/adapters/objectEditing.js');
const {copyFurnitureRegion,validateFurnitureClipboard,prepareFurniturePaste}=await server.ssrLoadModule('/src/adapters/furnitureClipboard.js');
const {preservesEditedSections}=await server.ssrLoadModule('/src/adapters/verifyExport.js');
const {TILE_FIELDS,createBlockEditing}=await server.ssrLoadModule('/src/adapters/blockEditing.js');
const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const input=async name=>ab(await readFile(new URL(name+'.wld',fixtureRoot)));
const parse=async bytes=>(await new FileReader().loadBuffer(bytes)).parse();
const copy=(world,selection)=>copyFurnitureRegion(world,createFurnitureEditing(world,createObjectEditing(world)),selection);
const same=(a,b)=>assert.deepEqual(new Uint8Array(a),new Uint8Array(b));
const place=(doc,tileId,x,y)=>doc.editFurniture({action:'place',revision:doc.editState.revision,tileId,styleIndex:0,x,y});
const offset=(record,x,y)=>({...structuredClone(record),position:{x:record.position.x-x,y:record.position.y-y}});

for(const fixture of fixtures)test(fixture.name+': furniture copy retains complete structures, relative companions, legacy equipment and every tile field without source mutation',async()=>{
 const doc=await openWorld(await input(fixture.name));
 place(doc,21,10,10);place(doc,55,14,10);place(doc,128,18,10);
 const chest=doc.listObjects('chest').at(-1),sign=doc.listObjects('sign').at(-1);
 doc.editObject({kind:'chest',index:chest.index,revision:doc.editState.revision,changes:{name:'中文箱子🧰',slots:[{slot:0,item:{id:1,prefix:0,stack:2}}]}});
 doc.editObject({kind:'sign',index:sign.index,revision:doc.editState.revision,changes:{text:'中文告示牌\n第二行'}});
 doc.editFurniture({action:'content',x:18,y:10,revision:doc.editState.revision,changes:{head:1,body:2,legs:3}});
 const before=doc.serialize(),world=await parse(before),selection={x:10,y:10,width:10,height:4},clip=copy(world,selection);
 assert.equal(clip.schema,2);assert.equal(clip.formatVersion,fixture.version);
 assert.deepEqual(clip.structures,[{x:0,y:0,tileId:21,styleIndex:0},{x:4,y:0,tileId:55,styleIndex:0},{x:8,y:0,tileId:128,styleIndex:0}]);
 assert.deepEqual(clip.objects.chests,[offset(world.chests.chests.at(-1),10,10)]);
 assert.deepEqual(clip.objects.signs,[offset(world.signs.signs.at(-1),10,10)]);assert.deepEqual(clip.objects.entities,[]);
 for(let x=0;x<clip.width;x++)for(let y=0;y<clip.height;y++)assert.deepEqual(clip.tiles[x*clip.height+y],TILE_FIELDS.map(f=>world.worldTiles.tiles[f][world.worldTiles.tiles.index(10+x,10+y)]));
 same(new FileSaver().save(world),before);
 const retained=structuredClone(clip);clip.tiles[0][0]=0;clip.objects.chests[0].items[0].id=2;clip.objects.signs[0].text='changed';
 same(new FileSaver().save(world),before);world.chests.chests.at(-1).name='source changed';assert.equal(retained.objects.chests[0].name,'中文箱子🧰');
});

test('all eleven entity payload families retain unknown item values, flags, slots and poses in detached relative snapshots',async()=>{
 const doc=await openWorld(await input('v1.4.5.5'));
 const ids=[378,395,423,470,471,475,520,597,698,723,724];
 for(let i=0;i<ids.length;i++)place(doc,ids[i],10+i*5,20);
 const world=await parse(doc.serialize()),selected=world.tileEntities.entities.filter(r=>r.position.y===20);
 assert.deepEqual(selected.map(r=>r.type),ids.map((_,i)=>i));
 for(const e of selected){if(e.item)e.item={id:32767,prefix:255,stack:32767};if(e.type===3){e.pose=255;e.extraSlotFlags=130;e.items[8]={id:32767,prefix:255,stack:1};}if(e.type===5)e.slotFlags=128;}
 const bytes=new FileSaver().save(world),source=await parse(bytes),clip=copy(source,{x:10,y:20,width:55,height:4});
 assert.equal(clip.structures.length,11);assert.deepEqual(clip.objects.entities,selected.map(r=>offset(r,10,20)));
 same(new FileSaver().save(source),bytes);
 const first=selected.find(e=>e.item),copied=clip.objects.entities.find(e=>e.type===first.type);copied.item.id=1;assert.equal(first.item.id,32767);
 const doll=clip.objects.entities.find(e=>e.type===3);assert.equal(doll.extraSlotFlags,130);assert.equal(doll.pose,255);assert.equal(doll.items[8].id,32767);
});

test('copying an incomplete or unknown framed structure refuses the source without changing bytes',async()=>{
 const doc=await openWorld(await input('v1.4.5.5'));place(doc,21,10,10);
 const bytes=doc.serialize(),world=await parse(bytes);
 for(const selection of [{x:10,y:10,width:1,height:2},{x:11,y:11,width:2,height:2}])assert.throws(()=>copy(world,selection),/完整范围/);
 same(new FileSaver().save(world),bytes);
 world.worldTiles.tiles.frameX[world.worldTiles.tiles.index(10,10)]=32767;
 const malformed=new FileSaver().save(world);assert.throws(()=>copy(world,{x:10,y:10,width:2,height:2}),/未知或结构不完整/);same(new FileSaver().save(world),malformed);
});

test('source companions must have one matching owner; unrelated outside records remain untouched',async()=>{
 const doc=await openWorld(await input('v1.4.5.5'));place(doc,21,10,10);const world=await parse(doc.serialize()),selection={x:10,y:10,width:2,height:2};
 const chest=world.chests.chests.at(-1);
 world.chests.chests.push(structuredClone(chest));assert.throws(()=>copy(world,selection),/重复/);world.chests.chests.pop();
 world.chests.chests.pop();assert.equal(copy(world,selection).objects.chests.length,0);world.chests.chests.push(chest);
 world.signs.signs.push({position:{x:11,y:11},text:'orphan'});assert.throws(()=>copy(world,selection),/孤立/);world.signs.signs.pop();
 world.signs.signs.push({position:{x:30,y:30},text:'outside orphan'});const bytes=new FileSaver().save(world);assert.equal(copy(world,selection).objects.signs.length,0);same(new FileSaver().save(world),bytes);
});

test('copying a weighted plate does not clone the saved pressed-location set',async()=>{
 const doc=await openWorld(await input('v1.4.5.5'));place(doc,428,10,10);const world=await parse(doc.serialize());
 world.weightedPressurePlates.weightedPressurePlates=[{position:{x:10,y:10}},{position:{x:500,y:100}}];const bytes=new FileSaver().save(world);
 const clip=copy(world,{x:10,y:10,width:1,height:1});assert.equal(clip.schema,2);assert.deepEqual(clip.objects,{chests:[],signs:[],entities:[]});assert.equal(Object.hasOwn(clip,'pressure'),false);same(new FileSaver().save(world),bytes);
 world.weightedPressurePlates.weightedPressurePlates.push({position:{x:10,y:10}});assert.throws(()=>copy(world,{x:10,y:10,width:1,height:1}),/重复/);
});

test('ordinary source regions keep schema 1, while over-budget furniture data refuses atomically',async()=>{
 const doc=await openWorld(await input('v1.4.5.5'));place(doc,55,10,10);const world=await parse(doc.serialize());
 const ordinary=copy(world,{x:12,y:10,width:2,height:2});assert.equal(ordinary.schema,1);assert.equal(Object.hasOwn(ordinary,'objects'),false);
 world.signs.signs.at(-1).text='中'.repeat(800000);const bytes=new FileSaver().save(world);
 assert.throws(()=>copy(world,{x:10,y:10,width:2,height:2}),/预算/);same(new FileSaver().save(world),bytes);
 for(const selection of [null,{x:0,y:0,width:101,height:100},{x:-1,y:0,width:1,height:1}])assert.throws(()=>copy(world,selection));
});

function session(world) {
 const objects=createObjectEditing(world),furniture=createFurnitureEditing(world,objects);
 const original=new FileSaver().save(world);let writable=false;
 const editing=createBlockEditing(world,()=>{if(!writable){same(new FileSaver().save(world),original);writable=true;}},
  {write:(kind,index,value)=>kind==='entities'?furniture.write(value):kind==='pressure'?furniture.writePressure(value):objects.write(kind,index,value)});
 return {objects,furniture,editing};
}
const prepare=(world,state,clipboard,position)=>prepareFurniturePaste(world,state.furniture,state.objects,state.editing,{clipboard,position,revision:state.editing.state.revision});
for(const fixture of fixtures)test(fixture.name+': prepared complete furniture paste and source contents share exact full-field undo/redo',async()=>{
 const doc=await openWorld(await input(fixture.name));place(doc,21,10,10);place(doc,55,14,10);place(doc,128,18,10);
 doc.editObject({kind:'sign',index:doc.listObjects('sign').at(-1).index,revision:doc.editState.revision,changes:{text:'随建筑复制的文字'}});
 const bytes=doc.serialize(),world=await parse(bytes),state=session(world),clip=copy(world,{x:10,y:10,width:10,height:4});
 assert.deepEqual(validateFurnitureClipboard(world,state.editing,clip),clip);
 const transaction=prepare(world,state,clip,{x:30,y:10});same(new FileSaver().save(world),bytes);assert.equal(state.editing.state.undoCount,0);
 state.editing.commit(transaction.changes);const saved=new FileSaver().save(world),after=await parse(saved),before=await parse(bytes);
 assert.equal(preservesEditedSections(bytes,saved,new Map([...state.objects.expectedSections(),...state.furniture.expectedSections()])),true);
 assert.equal(state.editing.state.undoCount,1);assert.equal(after.chests.chests.length,before.chests.chests.length+1);assert.equal(after.signs.signs.at(-1).text,'随建筑复制的文字');
 assert.deepEqual(after.chests.chests.at(-1),offset(clip.objects.chests[0],-30,-10));
 for(const field of TILE_FIELDS){const expected=before.worldTiles.tiles[field].slice();for(let x=0;x<10;x++)for(let y=0;y<4;y++)expected[(30+x)*world.header.maxTilesY+10+y]=clip.tiles[x*4+y][TILE_FIELDS.indexOf(field)];assert.deepEqual(after.worldTiles.tiles[field],expected,field);}
 for(const section of ['header','footer','NPCs','tileEntities','weightedPressurePlates','townManager','bestiary','creativePowers'])assert.deepEqual(after[section],before[section],section);
 clip.objects.signs[0].text='mutated caller';clip.tiles[0][0]=1;assert.equal(world.signs.signs.at(-1).text,'随建筑复制的文字');same(new FileSaver().save(world),saved);
 state.editing.undo();same(new FileSaver().save(world),bytes);state.editing.redo();same(new FileSaver().save(world),saved);
});

test('paste validation rejects forged geometry, truncated or extra payload fields, stale revisions and orphan companions atomically',async()=>{
 const doc=await openWorld(await input('v1.4.5.5'));place(doc,21,10,10);const bytes=doc.serialize(),world=await parse(bytes),state=session(world),clip=copy(world,{x:10,y:10,width:2,height:2});
 const modify=fn=>{const data=structuredClone(clip);fn(data);return data;};
 const invalid=[modify(c=>c.objects.chests[0].maxItems=1e12),modify(c=>c.objects.chests[0].items[0]={id:1,stack:32768,prefix:0}),
  modify(c=>c.objects.chests[0].unknown='not serialized'),modify(c=>c.objects.chests[0].position.x=1),modify(c=>c.objects.chests.push(structuredClone(c.objects.chests[0]))),
  modify(c=>c.structures[0].x=1),modify(c=>c.structures[0].styleIndex=999999),modify(c=>c.structures=[]),modify(c=>c.tiles[0][1]=32767)];
 for(const data of invalid){assert.throws(()=>prepare(world,state,data,{x:30,y:10}));same(new FileSaver().save(world),bytes);assert.equal(state.editing.state.undoCount,0);}
 assert.throws(()=>prepareFurniturePaste(world,state.furniture,state.objects,state.editing,{clipboard:clip,position:{x:30,y:10},revision:9}),/变化/);
 assert.throws(()=>prepare(world,state,clip,{x:4199,y:10}),/地图内/);
});

test('overlap clears the complete old dresser outside the pasted rectangle and uses one collection/history step',async()=>{
 const doc=await openWorld(await input('v1.4.5.5'));place(doc,55,10,10);place(doc,88,29,10);
 doc.editObject({kind:'chest',index:doc.listObjects('chest').at(-1).index,revision:doc.editState.revision,changes:{name:'will be replaced',slots:[{slot:0,item:{id:1,prefix:0,stack:1}}]}});
 const bytes=doc.serialize(),world=await parse(bytes),state=session(world),clip=copy(world,{x:10,y:10,width:2,height:2});
 const tx=prepare(world,state,clip,{x:31,y:10});assert.equal(tx.affected.length,8);same(new FileSaver().save(world),bytes);
 const lost=tx.changes.find(c=>c.kind==='collection:chest');assert.equal(lost.after.length,lost.before.length-1);assert.equal(lost.before.at(-1).name,'will be replaced');
 state.editing.commit(tx.changes);const saved=new FileSaver().save(world);
 assert.equal(world.worldTiles.tiles.hasBlock(world.worldTiles.tiles.index(29,10)),false);assert.equal(world.signs.signs.at(-1).position.x,31);
 state.editing.undo();same(new FileSaver().save(world),bytes);state.editing.redo();same(new FileSaver().save(world),saved);
});

test('entity copies receive unique target IDs, retain in-place IDs for a no-op and preserve unknown contents',async()=>{
 const doc=await openWorld(await input('v1.4.5.5'));place(doc,395,10,10);place(doc,395,14,10);
 const world=await parse(doc.serialize());world.tileEntities.entities[0].item={id:32767,prefix:255,stack:1};
 const bytes=new FileSaver().save(world),state=session(world),clip=copy(world,{x:10,y:10,width:6,height:2}),originalIds=world.tileEntities.entities.map(e=>e.id);
 const noop=prepare(world,state,clip,{x:10,y:10});assert.equal(noop.changes.length,0);same(new FileSaver().save(world),bytes);
 state.editing.commit(prepare(world,state,clip,{x:30,y:10}).changes);
 const entities=world.tileEntities.entities;assert.equal(new Set(entities.map(e=>e.id)).size,entities.length);assert.deepEqual(entities.slice(0,2).map(e=>e.id),originalIds);assert.deepEqual(entities.at(-2).item,{id:32767,prefix:255,stack:1});
 const saved=new FileSaver().save(world),expected=new Map([...state.objects.expectedSections(),...state.furniture.expectedSections()]);assert.equal(preservesEditedSections(bytes,saved,expected),true);
 const tampered=saved.slice(0),view=new DataView(tampered),start=view.getInt32(46,true);view.setInt32(start+5,123456,true);assert.equal(preservesEditedSections(bytes,tampered,expected),false);
 state.editing.undo();same(new FileSaver().save(world),bytes);state.editing.redo();same(new FileSaver().save(world),saved);
});

test('target pressed records survive only the same plate anchor; pasted copies do not invent pressed entries',async()=>{
 const doc=await openWorld(await input('v1.4.5.5'));place(doc,428,10,10);place(doc,428,30,10);place(doc,55,14,10);
 const world=await parse(doc.serialize());world.weightedPressurePlates.weightedPressurePlates=[{position:{x:10,y:10}},{position:{x:30,y:10}}];
 const state=session(world),plate=copy(world,{x:10,y:10,width:1,height:1}),sign=copy(world,{x:14,y:10,width:2,height:2}),bytes=new FileSaver().save(world);
 assert.equal(prepare(world,state,plate,{x:30,y:10}).changes.length,0);
 state.editing.commit(prepare(world,state,plate,{x:40,y:10}).changes);assert.deepEqual(world.weightedPressurePlates.weightedPressurePlates,[{position:{x:10,y:10}},{position:{x:30,y:10}}]);
 state.editing.commit(prepare(world,state,sign,{x:30,y:10}).changes);assert.deepEqual(world.weightedPressurePlates.weightedPressurePlates,[{position:{x:10,y:10}}]);
 state.editing.undo();state.editing.undo();same(new FileSaver().save(world),bytes);
});


test('legacy ordinary schema 1 can replace a complete target owner without leaving its chest record or peripheral frame',async()=>{
 const doc=await openWorld(await input('v1.4.5.5'));place(doc,21,30,10);const bytes=doc.serialize(),world=await parse(bytes),state=session(world);
 const clip=copy(world,{x:10,y:10,width:1,height:1});assert.equal(clip.schema,1);
 assert.throws(()=>prepare(world,state,{...clip,objects:{chests:[],signs:[],entities:[]}},{x:31,y:11}),/未声明版本/);
 const tx=prepare(world,state,clip,{x:31,y:11});assert.equal(tx.affected.length,4);state.editing.commit(tx.changes);
 for(let x=30;x<32;x++)for(let y=10;y<12;y++)assert.equal(world.worldTiles.tiles.hasBlock(world.worldTiles.tiles.index(x,y)),false);
 assert.equal(world.chests.chests.length,(await parse(bytes)).chests.chests.length-1);state.editing.undo();same(new FileSaver().save(world),bytes);
});

test('complete-target expansion, history byte budget and exhausted entity IDs refuse before any writes',async()=>{
 const doc=await openWorld(await input('v1.4.5.5'));place(doc,21,110,109);place(doc,55,10,10);place(doc,395,20,10);
 const world=await parse(doc.serialize());let state=session(world),bytes=new FileSaver().save(world);
 const large=copy(world,{x:200,y:10,width:100,height:100});assert.equal(large.schema,1);
 assert.throws(()=>prepare(world,state,large,{x:11,y:10}),/10000/);same(new FileSaver().save(world),bytes);
 const entity=world.tileEntities.entities.find(e=>e.position.x===20);entity.id=2147483647;state=session(world);bytes=new FileSaver().save(world);
 const entityClip=copy(world,{x:20,y:10,width:2,height:2});assert.equal(prepare(world,state,entityClip,{x:20,y:10}).changes.length,0);
 assert.throws(()=>prepare(world,state,entityClip,{x:40,y:10}),/编号/);same(new FileSaver().save(world),bytes);
 const sign=copy(world,{x:10,y:10,width:2,height:2});world.signs.signs.push({position:{x:1000,y:1000},text:'x'.repeat(2*1024*1024)});state=session(world);bytes=new FileSaver().save(world);
 const transaction=prepare(world,state,sign,{x:30,y:10});assert.throws(()=>state.editing.commit(transaction.changes),/预算/);
 assert.equal(state.editing.state.undoCount,0);same(new FileSaver().save(world),bytes);
});

test('target orphan/duplicate companions refuse even when the pasted source is ordinary and every tile is replaceable',async()=>{
 const doc=await openWorld(await input('v1.4.5.5'));const world=await parse(doc.serialize()),clip=copy(world,{x:10,y:10,width:2,height:2});
 world.signs.signs.push({position:{x:31,y:11},text:'orphan'});let bytes=new FileSaver().save(world),state=session(world);
 assert.throws(()=>prepare(world,state,clip,{x:30,y:10}),/孤立/);same(new FileSaver().save(world),bytes);
 world.signs.signs.pop();place(doc,21,30,10);const target=await parse(doc.serialize());target.chests.chests.push(structuredClone(target.chests.chests.at(-1)));bytes=new FileSaver().save(target);state=session(target);
 assert.throws(()=>prepare(target,state,clip,{x:30,y:10}),/重复/);same(new FileSaver().save(target),bytes);
});


test('complete source furniture without a companion preserves absence instead of inventing content or blocking copy',async()=>{
 const doc=await openWorld(await input('v1.4.5.5'));place(doc,21,10,10);place(doc,55,14,10);place(doc,395,18,10);
 const world=await parse(doc.serialize());world.chests.chests.pop();world.signs.signs.pop();world.tileEntities.entities.pop();
 const bytes=new FileSaver().save(world),state=session(world),clip=copy(world,{x:10,y:10,width:10,height:2});
 assert.equal(clip.structures.length,3);assert.deepEqual(clip.objects,{chests:[],signs:[],entities:[]});same(new FileSaver().save(world),bytes);
 state.editing.commit(prepare(world,state,clip,{x:30,y:10}).changes);
 assert.deepEqual(world.chests.chests,(await parse(bytes)).chests.chests);assert.deepEqual(world.signs.signs,(await parse(bytes)).signs.signs);assert.deepEqual(world.tileEntities.entities,(await parse(bytes)).tileEntities.entities);
 for(const x of [30,34,38])assert.ok(state.furniture.inspect({x,y:10}));state.editing.undo();same(new FileSaver().save(world),bytes);
});
