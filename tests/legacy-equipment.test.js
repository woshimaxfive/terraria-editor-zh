import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {after,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'vite';
import rules from '../vendor/tedit-furniture/legacy-equipment.json' with {type:'json'};
import {furnitureFrames,furnitureCompanion} from '../src/editing/furniture.js';
import {legacyBaseU,legacyWithContents,validateLegacyChanges} from '../src/editing/legacyEquipment.js';
import {fixtures,fixtureRoot} from './worldFixtures.js';

const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
after(()=>server.close());
const {openWorld}=await server.ssrLoadModule('/src/adapters/worldFile.js');
const {FileReader,FileSaver,TileFlag}=await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const {TILE_FIELDS}=await server.ssrLoadModule('/src/adapters/blockEditing.js');
const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),input=async name=>ab(await readFile(new URL(name+'.wld',fixtureRoot)));
const parse=async b=>(await new FileReader().loadBuffer(b)).parse(),same=(a,b)=>assert.deepEqual(new Uint8Array(a),new Uint8Array(b));
const edit=(doc,payload)=>doc.editFurniture({revision:doc.editState.revision,...payload});
function sections(before,after){for(const key of ['header','footer','chests','signs','tileEntities','NPCs','weightedPressurePlates','townManager','bestiary','creativePowers'])assert.deepEqual(after[key],before[key],key);}
function checkTiles(before,after,patches){for(const field of TILE_FIELDS){const expected=before.worldTiles.tiles[field].slice();for(const [x,y,values]of patches)if(Object.hasOwn(values,field))expected[x*before.header.maxTilesY+y]=values[field];assert.deepEqual(after.worldTiles.tiles[field],expected,field);}}
function expected(tileId,style,content,x=10,y=10){const result=[];for(let dx=0;dx<(tileId===334?3:2);dx++)for(let dy=0;dy<3;dy++){
  let u=style*(tileId===334?54:36)+dx*18;
  if(tileId===334&&content.item&&dy===1&&dx<2)u=(u/18+1)*5000+(dx===0?100+content.item.id:content.item.prefix);
  if(tileId!==334&&dx===0)u+=100*content[['head','body','legs'][dy]];
  result.push([x+dx,y+dy,{blockId:tileId,frameX:u,frameY:dy*18,flags:1}]);
}return result;}

test('legacy embedded frames match 2886 executions of the unchanged desktop C# save bodies, without modern entity companions',()=>{
  const hash=createHash('sha256');let count=0,cells=0;
  function record(tileId,style,content){const p=legacyWithContents(furnitureFrames(tileId,style),content);for(const f of p.frames)assert.equal(legacyBaseU(tileId,f.u),style*p.width*18+f.x*18);hash.update(JSON.stringify(p.frames));count++;cells+=p.frames.length;}
  for(const id of[128,269])for(let style=0;style<2;style++)for(let i=0;i<=rules.armor.head.length;i++)record(id,style,{head:rules.armor.head[i-1]?.[1]??0,body:rules.armor.body[i%rules.armor.body.length][1],legs:rules.armor.legs[i%rules.armor.legs.length][1]});
  for(let style=0;style<2;style++)for(let i=0;i<rules.rackable.length;i++)if(rules.rackable[i]<=4899)record(334,style,{item:{id:rules.rackable[i],prefix:[0,1,84,255][i%4]}});
  for(let style=0;style<2;style++)for(let prefix=0;prefix<256;prefix++)record(334,style,{item:{id:1,prefix}});
  assert.deepEqual([count,cells],[2886,22578]);assert.equal(hash.digest('hex'),'4fab5711fc3500559211cd0a9ff53f906590344acaf67a183c378160ccce1fe0');
  for(const id of[128,269,334])assert.equal(furnitureCompanion(id),null);
});

for(const fixture of fixtures)test(fixture.name+': legacy placement/content/style/removal exports all fields and sections with exact chronological undo',async()=>{
  const bytes=await input(fixture.name),before=await parse(bytes),doc=await openWorld(bytes),snapshots=[bytes];
  for(const tileId of[128,269,334]){
    const content=tileId===334?{item:{id:1,prefix:84}}:{head:1,body:1,legs:1};
    const base={action:'place',tileId,styleIndex:0,x:10,y:10};
    const preview=doc.previewFurniture({revision:doc.editState.revision,...base});assert.equal(preview.affected.length,tileId===334?9:6);same(doc.serialize(),snapshots.at(-1));
    edit(doc,base);snapshots.push(doc.serialize());
    edit(doc,{action:'content',x:tileId===334?12:11,y:12,changes:content});snapshots.push(doc.serialize());
    let saved=await parse(snapshots.at(-1));sections(before,saved);checkTiles(before,saved,expected(tileId,0,content));
    for(let x=10;x<10+(tileId===334?3:2);x++)for(let y=10;y<13;y++)assert.deepEqual(doc.inspectFurniture({x,y}).legacy,content);
    assert.equal(doc.previewFurniture({revision:doc.editState.revision,...base,styleIndex:1}).removed.legacyItems,0);
    edit(doc,{...base,styleIndex:1});snapshots.push(doc.serialize());saved=await parse(snapshots.at(-1));sections(before,saved);checkTiles(before,saved,expected(tileId,1,content));
    assert.equal(edit(doc,{...base,styleIndex:1}).changed,0);
    const removal=doc.previewFurniture({revision:doc.editState.revision,action:'remove',x:11,y:11});assert.equal(removal.removed.legacyItems,tileId===334?1:3);
    edit(doc,{action:'content',x:10,y:10,changes:tileId===334?{item:null}:{head:0,body:0,legs:0}});snapshots.push(doc.serialize());
    assert.equal(doc.previewFurniture({revision:doc.editState.revision,action:'remove',x:11,y:11}).removed.legacyItems,0);
    edit(doc,{action:'remove',x:11,y:11});snapshots.push(doc.serialize());same(doc.serialize(),bytes);
  }
  for(const snapshot of snapshots.slice(0,-1).reverse()){doc.undo();same(doc.serialize(),snapshot);}
  for(const snapshot of snapshots.slice(1)){doc.redo();same(doc.serialize(),snapshot);}
});

test('same-origin male/female legacy conversion preserves equipment; partial and overlapping replacements warn and remove complete content',async()=>{
  const doc=await openWorld(await input('v1.4.5.5'));
  edit(doc,{action:'place',tileId:128,styleIndex:0,x:10,y:10});edit(doc,{action:'content',x:10,y:10,changes:{head:1,body:1,legs:1}});
  edit(doc,{action:'place',tileId:269,styleIndex:1,x:10,y:10});assert.deepEqual(doc.inspectFurniture({x:11,y:12}).legacy,{head:1,body:1,legs:1});
  const bytes=doc.serialize(),revision=doc.editState.revision;
  assert.throws(()=>edit(doc,{action:'content',x:10,y:10,changes:{head:0},selection:{x:10,y:10,width:1,height:3}}),/完整/);same(doc.serialize(),bytes);
  const request={revision,action:'place',tileId:21,styleIndex:0,x:11,y:10},preview=doc.previewFurniture(request);assert.equal(preview.affected.length,8);assert.equal(preview.removed.legacyItems,3);
  doc.editFurniture(request);assert.equal(doc.inspectFurniture({x:10,y:12}),null);assert.equal(doc.inspectFurniture({x:11,y:10}).tileId,21);doc.undo();same(doc.serialize(),bytes);
});

test('untouched unknown armor and rack contents survive style changes; unrelated fields and corrupt/orphan structures stay protected',async()=>{
  const bytes=await input('v1.4.5.5'),original=await parse(bytes);
  for(const tileId of[128,269,334]){
    const world=await parse(bytes),values=expected(tileId,0,tileId===334?{item:{id:4899,prefix:255}}:{head:327,body:1,legs:1});
    for(const[x,y,patch]of values)for(const[field,value]of Object.entries(patch))world.worldTiles.tiles[field][world.worldTiles.tiles.index(x,y)]=value;
    const seed=new FileSaver().save(world),doc=await openWorld(seed);same(doc.serialize(),seed);
    if(tileId!==334)edit(doc,{action:'content',x:10,y:10,changes:{body:0}});
    edit(doc,{action:'place',tileId,styleIndex:1,x:10,y:10});const result=await parse(doc.serialize());sections(original,result);
    assert.deepEqual(doc.inspectFurniture({x:11,y:11}).legacy,tileId===334?{item:{id:4899,prefix:255}}:{head:327,body:0,legs:1});
    const saved=doc.serialize();assert.throws(()=>edit(doc,{action:'content',x:10,y:10,changes:tileId===334?{item:{id:4899,prefix:0}}:{head:326}}),/旧式装备/);same(doc.serialize(),saved);
    for(const corrupt of['half','extra','orphan']){
      const bad=await parse(seed),t=bad.worldTiles.tiles;
      if(corrupt==='half')t.frameX[t.index(11,11)]=123;
      if(corrupt==='extra')t.frameX[t.index(tileId===334?12:11,12)]+=100;
      if(corrupt==='orphan')bad.tileEntities.entities.push({type:tileId===334?4:3,id:999999,position:{x:10,y:10},...(tileId===334?{item:{id:1,prefix:0,stack:1}}:{items:Array(9).fill(null),dyes:Array(9).fill(null),pose:0,misc:[null],extraSlotFlags:0})});
      const badBytes=new FileSaver().save(bad),badDoc=await openWorld(badBytes);assert.throws(()=>edit(badDoc,{action:'remove',x:10,y:10}),/不完整|配套/);same(badDoc.serialize(),badBytes);
    }
  }
});

test('legacy edits reject invalid/version-unavailable/overflow/shape payloads before changing history or bytes',async()=>{
  const doc=await openWorld(await input('v1.3.5.3'));
  edit(doc,{action:'place',tileId:128,styleIndex:0,x:10,y:10});const bytes=doc.serialize(),revision=doc.editState.revision;
  for(const changes of[{head:-1},{head:328},{head:1.5},{head:'1'},{head:292},{head:1,items:[]},{},null,{head:{id:89}},Object.assign(Object.create(null),{head:NaN})]){
    assert.throws(()=>edit(doc,{action:'content',x:10,y:10,changes}));same(doc.serialize(),bytes);assert.equal(doc.editState.revision,revision);
  }
  assert.throws(()=>doc.editFurniture({revision:revision-1,action:'content',x:10,y:10,changes:{head:1}}),/已变化/);
  for(const item of[{id:4900,prefix:0},{id:0,prefix:0},{id:1,prefix:85},{id:1,prefix:256},{id:1,prefix:0,stack:1},{id:2,prefix:0}])assert.throws(()=>validateLegacyChanges(334,{item},194));
  assert.throws(()=>edit(doc,{action:'place',tileId:128,styleIndex:0,x:10,y:10,changes:{head:1}}));same(doc.serialize(),bytes);
});

test('editing embedded equipment preserves painted/actuated/coated tile extras, background walls, liquids and all wire colors',async()=>{
  for(const id of[128,334]){
    const world=await parse(await input('v1.4.5.5')),tiles=world.worldTiles.tiles;
    for(const[x,y,values]of expected(id,0,id===334?{item:{id:1,prefix:84}}:{head:1,body:1,legs:1})){
      const i=tiles.index(x,y);for(const[field,value]of Object.entries(values))tiles[field][i]=value;
      tiles.blockColor[i]=14;tiles.wallId[i]=1;tiles.wallColor[i]=8;tiles.liquidAmount[i]=50;tiles.liquidType[i]=3;
      tiles.flags[i]=TileFlag.IS_BLOCK_ACTIVE|TileFlag.WIRE_RED|TileFlag.WIRE_BLUE|TileFlag.WIRE_GREEN|TileFlag.WIRE_YELLOW|TileFlag.ACTUATOR|TileFlag.ACTUATED|TileFlag.INVISIBLE_BLOCK|TileFlag.INVISIBLE_WALL|TileFlag.FULL_BRIGHT_BLOCK|TileFlag.FULL_BRIGHT_WALL;
    }
    const bytes=new FileSaver().save(world),before=await parse(bytes),doc=await openWorld(bytes);
    edit(doc,{action:'content',x:10,y:10,changes:id===334?{item:{id:1,prefix:0}}:{head:0,legs:0}});
    const saved=doc.serialize(),after=await parse(saved);sections(before,after);
    checkTiles(before,after,id===334?[[11,11,{frameX:10000}]]:[[10,10,{frameX:0}],[10,12,{frameX:0}]]);
    doc.undo();same(doc.serialize(),bytes);doc.redo();same(doc.serialize(),saved);
  }
});
