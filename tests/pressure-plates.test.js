import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';

const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
after(()=>server.close());
const {openWorld}=await server.ssrLoadModule('/src/adapters/worldFile.js');
const {FileReader,FileSaver}=await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const {createFurnitureEditing}=await server.ssrLoadModule('/src/adapters/furnitureEditing.js');
const {createObjectEditing}=await server.ssrLoadModule('/src/adapters/objectEditing.js');
const {preservesEditedSections}=await server.ssrLoadModule('/src/adapters/verifyExport.js');
const {TILE_FIELDS}=await server.ssrLoadModule('/src/adapters/blockEditing.js');
const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const input=async name=>ab(await readFile(new URL(name+'.wld',fixtureRoot)));
const parse=async bytes=>(await new FileReader().loadBuffer(bytes)).parse();
const edit=(doc,values)=>doc.editFurniture({revision:doc.editState.revision,...values});
const same=(a,b)=>assert.deepEqual(new Uint8Array(a),new Uint8Array(b));
const records=points=>points.map(([x,y])=>({position:{x,y}}));
function section(bytes,index) {
  const view=new DataView(bytes),count=view.getInt16(24,true),start=view.getInt32(26+index*4,true);
  let end=bytes.byteLength;
  for(let i=index+1;i<count;i++) {const next=view.getInt32(26+i*4,true);if(next) {end=next;break;}}
  return bytes.slice(start,end);
}
// Independent reference layout: original TEdit SavePressurePlate writes signed
// Int32 count, X and Y. This does not call the production pressure serializer.
function reference(points) {
  const bytes=new ArrayBuffer(4+points.length*8),view=new DataView(bytes);view.setInt32(0,points.length,true);
  points.forEach(([x,y],i)=>{view.setInt32(4+i*8,x,true);view.setInt32(8+i*8,y,true);});return bytes;
}
function unchanged(a,b,changed=[]) {
  for(const name of ['header','footer','NPCs','chests','signs','tileEntities','weightedPressurePlates','townManager','bestiary','creativePowers'])
    if(!changed.includes(name)) assert.deepEqual(b[name],a[name],name);
}
function tilesMatch(a,b,patches) {
  for(const field of TILE_FIELDS) {
    const expected=a.worldTiles.tiles[field].slice();
    for(const [x,y,patch] of patches) if(Object.hasOwn(patch,field)) expected[a.worldTiles.tiles.index(x,y)]=patch[field];
    assert.deepEqual(b.worldTiles.tiles[field],expected,field);
  }
}
function plate(world,x,y,style=0) {
  const t=world.worldTiles.tiles,i=t.index(x,y);t.blockId[i]=428;t.frameX[i]=style<4?0:18;t.frameY[i]=(style%4)*18;t.flags[i]=1;
}

test('pressure section codec matches actual original C# golden bytes, including duplicates and signed coordinates',async()=>{
  const world=await parse(await input('v1.4.5.5'));
  const cases=[
    [[], 'AAAAAA=='],
    [[[0,0]], 'AQAAAAAAAAAAAAAA'],
    [[[10,10],[10,10]], 'AgAAAAoAAAAKAAAACgAAAAoAAAA='],
    [[[2147483647,-2147483648],[-1,0],[8400,2400]], 'AwAAAP///38AAACA/////wAAAADQIAAAYAkAAA=='],
  ];
  for(const [points,golden] of cases) {
    world.weightedPressurePlates.weightedPressurePlates=records(points);
    const bytes=new FileSaver().save(world);assert.equal(Buffer.from(section(bytes,6)).toString('base64'),golden);
    same(section(bytes,6),reference(points));assert.deepEqual((await parse(bytes)).weightedPressurePlates.weightedPressurePlates,records(points));
  }
  const points=Array.from({length:1000},(_,i)=>[i*7,i*2]);world.weightedPressurePlates.weightedPressurePlates=records(points);
  const bytes=section(new FileSaver().save(world),6);
  assert.equal(createHash('sha256').update(new Uint8Array(bytes)).digest('hex'),'6515d5244083ee43631af14e7354a5701a57ac1dce615d0be92e8bb8a65324de');
});

for(const fixture of fixtures) test(fixture.name+': derived pressure records survive recolouring and share atomic full furniture removal/history/export',async()=>{
  const world=await parse(await input(fixture.name));
  assert.deepEqual(world.weightedPressurePlates.weightedPressurePlates,[],'fixture has no native saved pressed plates');
  plate(world,10,10);plate(world,11,10,4);plate(world,12,10,7);
  // Keep unrelated unknown and duplicate coordinates byte-identical.
  const points=[[-1,0],[10,10],[500,100],[11,10],[500,100],[12,10]];
  world.weightedPressurePlates.weightedPressurePlates=records(points);
  const bytes=new FileSaver().save(world),before=await parse(bytes),doc=await openWorld(bytes),snapshots=[bytes];
  same(doc.serialize(),bytes);
  for(let style=0;style<8;style++) {
    const payload={action:'place',tileId:428,styleIndex:style,x:10,y:10};
    const preview=doc.previewFurniture({revision:doc.editState.revision,...payload});
    assert.equal(preview.removed.pressurePlates,0);same(doc.serialize(),snapshots.at(-1));
    if(style===0) {assert.equal(edit(doc,payload).changed,0);continue;}
    edit(doc,payload);snapshots.push(doc.serialize());const saved=await parse(snapshots.at(-1));
    unchanged(before,saved);tilesMatch(before,saved,[[10,10,{frameX:style<4?0:18,frameY:(style%4)*18}]]);
    same(section(snapshots.at(-1),6),reference(points));
  }
  const payload={revision:doc.editState.revision,action:'place',tileId:21,styleIndex:0,x:10,y:10};
  const preview=doc.previewFurniture(payload);assert.equal(preview.removed.pressurePlates,2);assert.equal(preview.affected.length,4);
  same(doc.serialize(),snapshots.at(-1));
  doc.editFurniture(payload);snapshots.push(doc.serialize());
  const replaced=await parse(snapshots.at(-1)),remaining=[[-1,0],[500,100],[500,100],[12,10]];
  same(section(snapshots.at(-1),6),reference(remaining));unchanged(before,replaced,['chests','weightedPressurePlates']);
  tilesMatch(before,replaced,[[10,10,{blockId:21,frameX:0,frameY:0}],[10,11,{blockId:21,frameX:0,frameY:18,flags:1}],
    [11,10,{blockId:21,frameX:18,frameY:0}],[11,11,{blockId:21,frameX:18,frameY:18,flags:1}]]);
  assert.deepEqual(replaced.chests.chests.at(-1).position,{x:10,y:10});
  assert.equal(doc.copy({selection:{x:12,y:10,width:1,height:1}}).clipboard.schema,2);
  assert.equal(doc.previewFurniture({revision:doc.editState.revision,action:'remove',x:12,y:10}).removed.pressurePlates,1);
  edit(doc,{action:'remove',x:12,y:10});snapshots.push(doc.serialize());
  const removed=await parse(snapshots.at(-1));same(section(snapshots.at(-1),6),reference(remaining.slice(0,-1)));
  tilesMatch(replaced,removed,[[12,10,{blockId:0,frameX:0,frameY:0,blockColor:0,flags:0}]]);unchanged(replaced,removed,['weightedPressurePlates']);
  assert.equal(doc.copy({selection:{x:12,y:10,width:1,height:1}}).clipboard.schema,1);
  doc.editObject({kind:'chest',index:before.chests.chests.length,revision:doc.editState.revision,changes:{name:'压力板替换后的箱子'}});
  snapshots.push(doc.serialize());
  for(const snapshot of snapshots.slice(0,-1).reverse()) {doc.undo();same(doc.serialize(),snapshot);}
  for(const snapshot of snapshots.slice(1)) {doc.redo();same(doc.serialize(),snapshot);}
  doc.undo();doc.undo();assert.equal(doc.copy({selection:{x:12,y:10,width:1,height:1}}).clipboard.schema,2);
  doc.redo();doc.redo();assert.equal(doc.copy({selection:{x:12,y:10,width:1,height:1}}).clipboard.schema,1);
});

test('all configured plate frames can be placed and changed without fabricating saved pressed locations',async()=>{
  const doc=await openWorld(await input('v1.4.5.5'));
  for(let style=0;style<8;style++) {
    edit(doc,{action:'place',tileId:428,styleIndex:style,x:10,y:10});
    const world=await parse(doc.serialize());assert.deepEqual(world.weightedPressurePlates.weightedPressurePlates,[]);
    assert.equal(doc.inspectFurniture({x:10,y:10}).styleIndex,style);
  }
});

test('affected duplicate, orphan, wrong plate kind and stale/partial transactions reject without dropping unrelated records',async()=>{
  const original=await input('v1.4.5.5');
  for(const type of ['duplicate','empty','ordinary plate','wrong furniture']) {
    const world=await parse(original);plate(world,10,10);
    world.weightedPressurePlates.weightedPressurePlates=records([[10,10],[700,100]]);
    const t=world.worldTiles.tiles,i=t.index(10,10);
    if(type==='duplicate') world.weightedPressurePlates.weightedPressurePlates.push(records([[10,10]])[0]);
    if(type==='empty') {t.flags[i]=0;t.blockId[i]=t.frameX[i]=t.frameY[i]=0;}
    if(type==='ordinary plate') t.blockId[i]=135;
    if(type==='wrong furniture') t.blockId[i]=136;
    const bytes=new FileSaver().save(world),doc=await openWorld(bytes);
    assert.throws(()=>edit(doc,{action:'place',tileId:21,styleIndex:0,x:10,y:10}),/配套/);
    same(doc.serialize(),bytes);assert.equal(doc.editState.revision,0);
  }
  const world=await parse(original);plate(world,10,10);world.weightedPressurePlates.weightedPressurePlates=records([[10,10]]);
  const bytes=new FileSaver().save(world),doc=await openWorld(bytes);
  for(const values of [{revision:-1},{selection:{x:10,y:10,width:1,height:1}},{x:doc.summary.width-1}]) {
    assert.throws(()=>doc.editFurniture({revision:0,action:'place',tileId:21,styleIndex:0,x:10,y:10,...values}));
    same(doc.serialize(),bytes);assert.equal(doc.editState.revision,0);
  }
});

test('pressure snapshot budget is checked before either tiles or records change',async()=>{
  const world=await parse(await input('v1.4.5.5'));plate(world,10,10);
  world.weightedPressurePlates.weightedPressurePlates=[...records([[10,10]]),...Array.from({length:100000},()=>({position:{x:500,y:100}}))];
  const bytes=new FileSaver().save(world),doc=await openWorld(bytes);
  assert.throws(()=>edit(doc,{action:'remove',x:10,y:10}),/预算/);same(doc.serialize(),bytes);assert.equal(doc.editState.revision,0);
});

test('pressure section must match the independent snapshot and cannot authorize changes to any other section',async()=>{
  const world=await parse(await input('v1.4.5.5'));plate(world,10,10);world.weightedPressurePlates.weightedPressurePlates=records([[10,10],[700,100]]);
  const bytes=new FileSaver().save(world),objects=createObjectEditing(world),adapter=createFurnitureEditing(world,objects);
  const expected=adapter.expectedSections();same(expected.get(6),reference([[10,10],[700,100]]));
  world.weightedPressurePlates.weightedPressurePlates=[];
  assert.equal(preservesEditedSections(bytes,new FileSaver().save(world),expected),false,'live-world mutation is not its own expected value');
  world.weightedPressurePlates.weightedPressurePlates=records([[10,10],[700,100]]);
  const prepared=adapter.prepare({revision:0,action:'remove',x:10,y:10},0),change=prepared.changes.find(c=>c.kind==='pressure');
  adapter.writePressure(change.after);const approved=adapter.expectedSections();same(approved.get(6),reference([[700,100]]));
  assert.equal(preservesEditedSections(bytes,new FileSaver().save(world)),false);
  assert.equal(preservesEditedSections(bytes,new FileSaver().save(world),approved),true);
  for(const mutate of [w=>w.weightedPressurePlates.weightedPressurePlates.push(records([[800,200]])[0]),
    w=>w.weightedPressurePlates.weightedPressurePlates[0].position.x++,w=>w.weightedPressurePlates.weightedPressurePlates=[],
    w=>w.header.spawnTileX++,w=>w.NPCs.townNPCs[0].name='越界修改']) {
    const copy=await parse(new FileSaver().save(world));mutate(copy);
    assert.equal(preservesEditedSections(bytes,new FileSaver().save(copy),approved),false);
  }
  assert.equal(preservesEditedSections(bytes,new FileSaver().save(world),new Map([...approved,[7,new ArrayBuffer(4)]])),false);
});
