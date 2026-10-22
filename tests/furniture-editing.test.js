import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';

const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
after(()=>server.close());
const {openWorld}=await server.ssrLoadModule('/src/adapters/worldFile.js');
const {FileReader,FileSaver,TileData}=await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const {FURNITURE,furnitureFrames}=await server.ssrLoadModule('/src/editing/furniture.js');
const {TILE_FIELDS}=await server.ssrLoadModule('/src/adapters/blockEditing.js');
const {createObjectEditing}=await server.ssrLoadModule('/src/adapters/objectEditing.js');
const {createFurnitureEditing}=await server.ssrLoadModule('/src/adapters/furnitureEditing.js');
const {preservesEditedSections}=await server.ssrLoadModule('/src/adapters/verifyExport.js');
const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const input=async name=>ab(await readFile(new URL(name+'.wld',fixtureRoot)));
const parse=async bytes=>(await new FileReader().loadBuffer(bytes)).parse();
const edit=(doc,values)=>doc.editFurniture({revision:doc.editState.revision,...values});
const same=(a,b)=>assert.deepEqual(new Uint8Array(a),new Uint8Array(b));
function untouched(a,b,changedSections=[]) {
  for(const name of ['header','footer','NPCs','chests','signs','tileEntities','weightedPressurePlates','townManager','bestiary','creativePowers']) {
    if(!changedSections.includes(name)) assert.deepEqual(b[name],a[name],name);
  }
}
function assertTiles(a,b,expected) {
  for(const field of TILE_FIELDS) {
    const values=a.worldTiles.tiles[field].slice();
    for(const [x,y,patch] of expected) if(Object.hasOwn(patch,field)) values[x*a.header.maxTilesY+y]=patch[field];
    assert.deepEqual(b.worldTiles.tiles[field],values,field);
  }
}

test('all 9546 configured styles can be recognized from every cell of an isolated complete structure',()=>{
  const tiles=new TileData(100,100),world={worldTiles:{tiles},fileFormatHeader:{version:326,importants:Array(754).fill(true)},
    chests:{chests:[]},signs:{signs:[]},tileEntities:{entities:[]},weightedPressurePlates:{weightedPressurePlates:[]}};
  const adapter=createFurnitureEditing(world,createObjectEditing(world));let count=0;
  for(const tile of FURNITURE) for(let style=0;style<tile.styles.length;style++) {
    const pattern=furnitureFrames(tile.id,style);
    for(const f of pattern.frames) {const i=tiles.index(10+f.x,10+f.y);tiles.blockId[i]=tile.id;tiles.frameX[i]=f.u;tiles.frameY[i]=f.v;tiles.flags[i]=1;}
    for(const f of pattern.frames) {
      const found=adapter.inspect({x:10+f.x,y:10+f.y});
      assert.deepEqual([found.x,found.y,found.width,found.height],[10,10,pattern.width,pattern.height],`${tile.id}/${style}`);count++;
    }
    for(const f of pattern.frames) {const i=tiles.index(10+f.x,10+f.y);tiles.flags[i]=0;tiles.blockId[i]=tiles.frameX[i]=tiles.frameY[i]=0;}
  }
  assert.equal(count,30487);
});

for(const fixture of fixtures) test(fixture.name+': full chest/dresser/sign structure, preserved contents and chronological compound undo/export',async()=>{
  const bytes=await input(fixture.name),before=await parse(bytes),doc=await openWorld(bytes),snapshots=[bytes];
  const tiles=before.worldTiles.tiles;
  for(const chest of before.chests.chests) {
    const found=doc.inspectFurniture(chest.position);
    assert.ok(found);assert.deepEqual([found.x,found.y],[chest.position.x,chest.position.y]);
    const corner=doc.inspectFurniture({x:found.x+found.width-1,y:found.y+found.height-1});
    assert.deepEqual([corner.x,corner.y],[found.x,found.y]);
  }
  for(let x=10;x<13;x++) for(let y=10;y<12;y++) assert.equal(tiles.hasBlock(tiles.index(x,y)),false);
  const payload={revision:0,action:'place',tileId:21,styleIndex:0,x:10,y:10};
  assert.equal(doc.previewFurniture(payload).affected.length,4);assert.equal(doc.editState.revision,0);same(doc.serialize(),bytes);
  edit(doc,payload);snapshots.push(doc.serialize());
  assert.equal(doc.summary.counts.chests,before.chests.chests.length+1);
  const created=await parse(snapshots.at(-1));
  untouched(before,created,['chests']);
  assertTiles(before,created,[[10,10,{blockId:21,frameX:0,frameY:0,flags:1}], [10,11,{blockId:21,frameX:0,frameY:18,flags:1}],
    [11,10,{blockId:21,frameX:18,frameY:0,flags:1}],[11,11,{blockId:21,frameX:18,frameY:18,flags:1}]]);
  for(const [x,y] of [[10,10],[10,11],[11,10],[11,11]]) {
    const found=doc.inspectFurniture({x,y});assert.deepEqual([found.x,found.y,found.width,found.height],[10,10,2,2]);
  }
  assert.equal(edit(doc,{action:'place',tileId:21,styleIndex:0,x:10,y:10}).changed,0);
  const index=before.chests.chests.length;
  doc.editObject({kind:'chest',index,revision:doc.editState.revision,changes:{name:'完整结构箱子',slots:[{slot:3,item:{id:1,stack:1,prefix:0}}]}});
  snapshots.push(doc.serialize());
  edit(doc,{action:'place',tileId:21,styleIndex:1,x:10,y:10});snapshots.push(doc.serialize());
  assert.equal(doc.readObject({kind:'chest',index}).slots[3].id,1);
  assert.equal((await parse(snapshots.at(-1))).worldTiles.tiles.frameX[tiles.index(10,10)],36);
  edit(doc,{action:'place',tileId:88,styleIndex:0,x:10,y:10});snapshots.push(doc.serialize());
  assert.deepEqual([doc.inspectFurniture({x:12,y:11}).width,doc.readObject({kind:'chest',index}).name],[3,'完整结构箱子']);
  edit(doc,{action:'place',tileId:55,styleIndex:0,x:10,y:10});snapshots.push(doc.serialize());
  assert.equal(doc.summary.counts.chests,before.chests.chests.length);assert.equal(doc.summary.counts.signs,before.signs.signs.length+1);
  const signWorld=await parse(snapshots.at(-1));assert.equal(signWorld.worldTiles.tiles.hasBlock(tiles.index(12,10)),false);
  assert.equal(signWorld.worldTiles.tiles.hasBlock(tiles.index(12,11)),false);untouched(before,signWorld,['chests','signs']);
  edit(doc,{action:'remove',x:11,y:11});snapshots.push(doc.serialize());
  assert.equal(doc.summary.counts.signs,before.signs.signs.length);
  assert.equal(edit(doc,{action:'remove',x:11,y:11}).changed,0);
  for(const snapshot of snapshots.slice(0,-1).reverse()) {doc.undo();same(doc.serialize(),snapshot);}
  for(const snapshot of snapshots.slice(1)) {doc.redo();same(doc.serialize(),snapshot);}
});

test('all eleven modern entity defaults, full multi-tile removal, replacement and ID reuse through history',async()=>{
  const bytes=await input('v1.4.5.5'),doc=await openWorld(bytes),before=await parse(bytes),start=doc.summary.counts.tileEntities;
  const definitions=[[378,0],[395,1],[423,2],[470,3],[471,4],[475,5],[520,6],[597,7],[698,8],[723,9],[724,10]];
  for(let i=0;i<definitions.length;i++) {
    const [tileId,type]=definitions[i],x=20+i*10,y=20;
    edit(doc,{action:'place',tileId,styleIndex:0,x,y});
    const world=await parse(doc.serialize()),record=world.tileEntities.entities.at(-1);
    assert.equal(record.type,type);assert.deepEqual(record.position,{x,y});
    assert.equal(record.id,(before.tileEntities.entities.length ? Math.max(...before.tileEntities.entities.map(r=>r.id))+1 : 0)+i);
    if(type===0) assert.equal(record.npc,-1);
    else if([1,4,6,8].includes(type)) assert.deepEqual(record.item,{id:0,prefix:0,stack:0});
    else if(type===2) assert.deepEqual([record.logicCheck,record.on],[1,false]);
    else if(type===3) {assert.deepEqual(record.items,Array(9).fill(null));assert.deepEqual(record.dyes,Array(9).fill(null));assert.deepEqual(record.misc,[null]);assert.equal(record.pose,0);}
    else if(type===5) assert.deepEqual(record.items,[null,null]);
    else if(type===9 || type===10) assert.equal(record.itemId,type===9?4612:2019);
    untouched(before,world,['tileEntities']);
  }
  assert.equal(doc.summary.counts.tileEntities,start+11);
  const all=doc.serialize();edit(doc,{action:'remove',x:51,y:22});const removed=doc.serialize();
  assert.equal(doc.summary.counts.tileEntities,start+10);assert.equal(doc.inspectFurniture({x:50,y:20}),null);
  doc.undo();same(doc.serialize(),all);doc.redo();same(doc.serialize(),removed);
  edit(doc,{action:'place',tileId:470,styleIndex:0,x:50,y:20});
  assert.equal(doc.summary.counts.tileEntities,start+11);
  const recreated=await parse(doc.serialize());assert.equal(recreated.tileEntities.entities.at(-1).id, start ? Math.max(...before.tileEntities.entities.map(r=>r.id))+12 : 11);
});

test('stale/invalid/version/edge/partial-selection/legacy and broken structures fail atomically; previews never write',async()=>{
  const bytes=await input('v1.3.5.3'),doc=await openWorld(bytes);
  const base={action:'place',tileId:21,styleIndex:0,x:10,y:10};
  for(const change of [{revision:-1},{tileId:470},{tileId:0},{styleIndex:-1},{x:doc.summary.width-1},{y:doc.summary.height-1},
    {selection:{x:10,y:10,width:1,height:2}},{tileId:128},{action:'x'},{injected:1}]) {
    assert.throws(()=>doc.editFurniture({revision:0,...base,...change}));assert.equal(doc.editState.revision,0);same(doc.serialize(),bytes);
  }
  edit(doc,base);const placed=doc.serialize(),revision=doc.editState.revision;
  assert.throws(()=>edit(doc,{...base,x:11,selection:{x:11,y:10,width:2,height:2}}),/完整/);same(doc.serialize(),placed);
  assert.equal(doc.editState.revision,revision);
  assert.throws(()=>doc.editFurniture({revision:0,action:'remove',x:10,y:10}),/已变化/);
  const world=await parse(placed);world.worldTiles.tiles.frameY[world.worldTiles.tiles.index(11,11)]=123;
  const broken=new FileSaver().save(world),bad=await openWorld(broken);
  assert.throws(()=>edit(bad,{action:'remove',x:10,y:10}),/不完整/);same(bad.serialize(),broken);
});

test('duplicate and orphan companion records reject, unrelated unknown records remain intact, and history budget rejects before writing',async()=>{
  const original=await parse(await input('v1.4.5.5'));
  const seed=await openWorld(new FileSaver().save(original));edit(seed,{action:'place',tileId:21,styleIndex:0,x:10,y:10});
  for(const kind of ['duplicate','orphan','budget']) {
    const world=await parse(seed.serialize());
    if(kind==='duplicate') world.chests.chests.push(structuredClone(world.chests.chests.at(-1)));
    if(kind==='orphan') {world.chests.chests.at(-1).position={x:12,y:10};}
    if(kind==='budget') world.chests.chests.at(-1).name='字'.repeat(1200000);
    const bytes=new FileSaver().save(world),doc=await openWorld(bytes);
    const operation={action:'place',tileId:kind==='budget'?55:88,styleIndex:0,x:10,y:10};
    assert.throws(()=>edit(doc,operation),kind==='budget'?/预算/:/配套/);
    assert.equal(doc.editState.revision,0);same(doc.serialize(),bytes);
  }
  const world=await parse(seed.serialize());world.tileEntities.entities.push({type:1,id:1000000,position:{x:500,y:100},item:{id:32767,prefix:255,stack:32767}});
  const doc=await openWorld(new FileSaver().save(world));edit(doc,{action:'place',tileId:88,styleIndex:0,x:10,y:10});
  assert.deepEqual((await parse(doc.serialize())).tileEntities,world.tileEntities);
});

test('current structural records and undo immediately update existing clipboard protection',async()=>{
  const doc=await openWorld(await input('v1.4.5.5'));
  edit(doc,{action:'place',tileId:21,styleIndex:0,x:10,y:10});
  assert.throws(()=>doc.copy({selection:{x:9,y:9,width:1,height:1}}),/家具或实体/);
  edit(doc,{action:'remove',x:11,y:11});assert.doesNotThrow(()=>doc.copy({selection:{x:9,y:9,width:1,height:1}}));
  doc.undo();assert.throws(()=>doc.copy({selection:{x:9,y:9,width:1,height:1}}),/家具或实体/);
  doc.redo();assert.doesNotThrow(()=>doc.copy({selection:{x:9,y:9,width:1,height:1}}));
});

test('entity section changes require the independent expected collection; wrong contents, IDs, coordinates and other sections still fail export verification',async()=>{
  const doc=await openWorld(await input('v1.4.5.5'));
  edit(doc,{action:'place',tileId:395,styleIndex:0,x:10,y:10});
  const bytes=doc.serialize(),world=await parse(bytes),objects=createObjectEditing(world),furniture=createFurnitureEditing(world,objects);
  const expected=new Map([...objects.expectedSections(),...furniture.expectedSections()]);
  assert.equal(preservesEditedSections(bytes,new FileSaver().save(world),expected),true);
  for(const mutate of [w=>{w.tileEntities.entities.at(-1).position.x++;},w=>{w.tileEntities.entities.at(-1).id++;},
    w=>{w.tileEntities.entities.at(-1).item={id:1,prefix:0,stack:1};},w=>{w.tileEntities.entities=[];},
    w=>{w.NPCs.townNPCs[0].name='非本事务';},w=>{w.header.spawnTileX++;}]) {
    const copy=await parse(bytes);mutate(copy);
    assert.equal(preservesEditedSections(bytes,new FileSaver().save(copy),expected),false);
  }
});
