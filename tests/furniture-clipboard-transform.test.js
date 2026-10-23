import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtureRoot } from './worldFixtures.js';
import { encodeTemplate, decodeTemplate, MAX_TEMPLATE_BYTES } from '../src/editing/template.js';
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
after(()=>server.close());
const {openWorld}=await server.ssrLoadModule('/src/adapters/worldFile.js');
const {FileReader,FileSaver}=await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const {furnitureFrames}=await server.ssrLoadModule('/src/editing/furniture.js');
const {legacyContents}=await server.ssrLoadModule('/src/editing/legacyEquipment.js');
const {TILE_FIELDS}=await server.ssrLoadModule('/src/adapters/blockEditing.js');
const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const input=async(name='v1.4.5.5')=>ab(await readFile(new URL(name+'.wld',fixtureRoot)));
const parse=async bytes=>(await new FileReader().loadBuffer(bytes)).parse();
const same=(a,b)=>assert.deepEqual(new Uint8Array(a),new Uint8Array(b));
const place=(d,id,x,y)=>d.editFurniture({action:'place',revision:d.editState.revision,tileId:id,styleIndex:0,x,y});
const pos=(op,x,y,w,h)=>op==='horizontal'?[w-1-x,y]:op==='vertical'?[x,h-1-y]:op==='clockwise'?[h-1-y,x]:[y,w-1-x];
async function source() {
  const d=await openWorld(await input());
  for(const [id,x] of [[88,10],[55,15],[470,20],[128,25],[334,30],[428,35]])place(d,id,x,10);
  d.editObject({kind:'chest',index:d.listObjects('chest').at(-1).index,revision:d.editState.revision,changes:{name:'衣柜中文🧰',slots:[{slot:0,item:{id:1,prefix:0,stack:2}}]}});
  d.editObject({kind:'sign',index:d.listObjects('sign').at(-1).index,revision:d.editState.revision,changes:{text:'告示牌\n第二行'}});
  d.editFurniture({action:'content',x:25,y:10,revision:d.editState.revision,changes:{head:1,body:2,legs:3}});
  d.editFurniture({action:'content',x:30,y:10,revision:d.editState.revision,changes:{item:{id:1,prefix:84}}});
  const world=await parse(d.serialize()),tiles=world.worldTiles.tiles;
  const doll=world.tileEntities.entities.find(e=>e.position.x===20&&e.position.y===10);
  doll.pose=255;doll.extraSlotFlags=130;doll.items[8]={id:32767,prefix:255,stack:1};
  world.weightedPressurePlates.weightedPressurePlates.push({position:{x:35,y:10}});
  for(let x=10;x<38;x++)for(let y=10;y<14;y++) {
    const i=tiles.index(x,y);tiles.wallId[i]=4;tiles.wallColor[i]=(x+y)%32;tiles.liquidAmount[i]=127;tiles.liquidType[i]=3;
    tiles.flags[i]|=2|4|8|16|256|1024;
    if(tiles.hasBlock(i)){tiles.blockColor[i]=x%32;tiles.flags[i]|=32|64|128|512;}
  }
  const bytes=new FileSaver().save(world),doc=await openWorld(bytes);
  return {doc,bytes,clip:doc.copy({selection:{x:10,y:10,width:28,height:4}}).clipboard};
}
function pattern(clip,owner) {
  const p=furnitureFrames(owner.tileId,owner.styleIndex);
  return {...p,frames:p.frames.map(f=>({...f,u:clip.tiles[(owner.x+f.x)*clip.height+owner.y+f.y][1]}))};
}
for(const operation of ['horizontal','vertical'])test(operation+': complete dresser, sign, modern and embedded legacy contents move without aliasing; every lower layer follows its source cell',async()=>{
  const {doc,bytes,clip}=await source(),before=structuredClone(clip);
  const {clipboard:result,removed}=doc.transformClipboard(clip,operation);
  assert.equal(removed,null);assert.equal(result.structures.length,6);
  for(const owner of clip.structures) {
    const p=furnitureFrames(owner.tileId,owner.styleIndex),x=operation==='horizontal'?clip.width-owner.x-p.width:owner.x,
      y=operation==='vertical'?clip.height-owner.y-p.height:owner.y;
    const target=result.structures.find(o=>o.x===x&&o.y===y);assert.equal(target.tileId,owner.tileId);
    if([128,334].includes(owner.tileId))assert.deepEqual(legacyContents(pattern(result,target)),legacyContents(pattern(clip,owner)));
    for(const name of ['chests','signs','entities']) {
      const record=clip.objects[name].find(r=>r.position.x===owner.x&&r.position.y===owner.y);
      if(record)assert.deepEqual(result.objects[name].find(r=>r.position.x===x&&r.position.y===y),{...record,position:{x,y}});
    }
  }
  for(let x=0;x<clip.width;x++)for(let y=0;y<clip.height;y++) {
    const [nx,ny]=pos(operation,x,y,clip.width,clip.height),a=clip.tiles[x*clip.height+y],b=result.tiles[nx*result.height+ny];
    assert.deepEqual(b.slice(3),a.slice(3));
  }
  assert.deepEqual(doc.transformClipboard(result,operation).clipboard,clip);
  assert.deepEqual(clip,before);same(doc.serialize(),bytes);
  result.objects.chests[0].name='caller changed';result.tiles[0][4]=1;assert.deepEqual(clip,before);
});
for(const operation of ['clockwise','counterclockwise'])test(operation+': desktop rotation clears furniture and contents while retaining walls, liquids, wires and wall coatings',async()=>{
  const {doc,bytes,clip}=await source(),before=structuredClone(clip),{clipboard:result,removed}=doc.transformClipboard(clip,operation);
  assert.deepEqual([result.width,result.height],[4,28]);assert.deepEqual(result.structures,[]);assert.deepEqual(result.objects,{chests:[],signs:[],entities:[]});
  assert.deepEqual(removed,{furniture:6,chests:1,signs:1,entities:1,legacyItems:4,texts:1,items:6});
  for(let x=0;x<clip.width;x++)for(let y=0;y<clip.height;y++) {
    const a=clip.tiles[x*clip.height+y],[nx,ny]=pos(operation,x,y,clip.width,clip.height),b=result.tiles[nx*result.height+ny];
    assert.deepEqual(b.slice(4,8),a.slice(4,8));assert.equal(b[8],a[8]&~(1|32|64|128|512|(7<<11)));
    assert.deepEqual(b.slice(0,4),[0,0,0,0]);
  }
  assert.deepEqual(clip,before);same(doc.serialize(),bytes);
  const preview=doc.previewPaste({clipboard:result,position:{x:50,y:10}});assert.equal(Object.values(preview.removed).some(Boolean),false);
  doc.paste({clipboard:result,position:{x:50,y:10},revision:preview.revision});
  const saved=doc.serialize(),after=await parse(saved),old=await parse(bytes);
  for(const field of TILE_FIELDS){const expected=old.worldTiles.tiles[field].slice();for(let x=0;x<result.width;x++)for(let y=0;y<result.height;y++)expected[(50+x)*old.header.maxTilesY+10+y]=result.tiles[x*result.height+y][TILE_FIELDS.indexOf(field)];assert.deepEqual(after.worldTiles.tiles[field],expected,field);}
  for(const key of ['chests','signs','tileEntities','weightedPressurePlates'])assert.deepEqual(after[key],old[key]);
  doc.undo();same(doc.serialize(),bytes);doc.redo();same(doc.serialize(),saved);
});

test('schema 2 templates retain unknown native payloads and embedded equipment; old schema 1 stays compatible',async()=>{
  const {doc,bytes,clip}=await source(),encoded=encodeTemplate(clip),decoded=decodeTemplate(encoded);
  assert.equal(JSON.parse(new TextDecoder().decode(encoded)).version,2);assert.notDeepEqual([...encoded.slice(0,3)],[239,187,191]);
  assert.ok(new TextDecoder().decode(encoded).includes('衣柜中文'));assert.deepEqual(decoded,clip);
  const prepared=doc.prepareClipboard(decoded);assert.deepEqual(prepared.clipboard,clip);
  const transformed=doc.transformClipboard(prepared.clipboard,'horizontal').clipboard;
  assert.deepEqual(doc.prepareClipboard(decodeTemplate(encodeTemplate(transformed))).clipboard,transformed);
  const ordinary=doc.copy({selection:{x:50,y:10,width:2,height:2}}).clipboard;
  assert.equal(ordinary.schema,1);assert.equal(JSON.parse(new TextDecoder().decode(encodeTemplate(ordinary))).version,1);
  assert.deepEqual(doc.prepareClipboard(decodeTemplate(encodeTemplate(ordinary))).clipboard,ordinary);
  decoded.objects.chests[0].name='changed';assert.equal(prepared.clipboard.objects.chests[0].name,'衣柜中文🧰');same(doc.serialize(),bytes);
  const huge=structuredClone(clip);huge.objects.signs[0].text='中'.repeat(MAX_TEMPLATE_BYTES/2);
  assert.throws(()=>encodeTemplate(huge),/2 MiB/);
});

test('complete target loss preview is read-only, requires confirmation and revision, and shares one undo step',async()=>{
  const d=await openWorld(await input());place(d,88,29,10);place(d,55,10,10);
  d.editObject({kind:'chest',index:d.listObjects('chest').at(-1).index,revision:d.editState.revision,changes:{slots:[{slot:0,item:{id:1,prefix:0,stack:3}}]}});
  const bytes=d.serialize(),clip=d.copy({selection:{x:10,y:10,width:2,height:2}}).clipboard,payload={clipboard:clip,position:{x:31,y:10}},count=d.editState.undoCount;
  const preview=d.previewPaste(payload);assert.equal(preview.affected.length,8);assert.equal(preview.removed.furniture,1);assert.equal(preview.removed.chests,1);assert.equal(preview.removed.items,1);same(d.serialize(),bytes);
  for(const ack of [{},{confirmed:true},{confirmed:true,revision:preview.revision-1}]){assert.throws(()=>d.paste({...payload,...ack}),/确认|变化/);same(d.serialize(),bytes);assert.equal(d.editState.undoCount,count);}
  d.paste({...payload,confirmed:true,revision:preview.revision});const saved=d.serialize();assert.equal(d.editState.undoCount,count+1);
  assert.equal(d.inspectFurniture({x:29,y:10}),null);assert.equal(d.inspectFurniture({x:31,y:10}).tileId,55);
  d.undo();same(d.serialize(),bytes);d.redo();same(d.serialize(),saved);
  assert.throws(()=>d.previewPaste({...payload,revision:preview.revision}),/变化/);
});

test('in-place complete furniture copies preserve IDs and contents without a spurious destructive confirmation',async()=>{
  const {doc,bytes,clip}=await source(),payload={clipboard:clip,position:{x:10,y:10}},count=doc.editState.undoCount;
  const preview=doc.previewPaste(payload);assert.equal(preview.changes,0);assert.equal(Object.values(preview.removed).some(Boolean),false);
  assert.equal(doc.paste(payload).changed,0);assert.equal(doc.editState.undoCount,count);same(doc.serialize(),bytes);
});

test('untrusted furniture templates cannot bypass common layer encoding or companion validation',async()=>{
  for(const name of ['v1.3.5.3','v1.4.5.5']) {
    const doc=await openWorld(await input(name));place(doc,21,10,10);const bytes=doc.serialize(),clip=doc.copy({selection:{x:10,y:10,width:2,height:2}}).clipboard;
    const changes=[c=>c.tiles[0][4]=512,c=>{c.tiles[0][4]=0;c.tiles[0][5]=2;},c=>{c.tiles[0][6]=0;c.tiles[0][7]=1;},c=>c.objects.chests[0].unknown='lost',c=>c.objects.chests[0].position.x=1];
    if(name==='v1.3.5.3')changes.push(c=>c.tiles[0][8]|=128,c=>{c.tiles[0][6]=127;c.tiles[0][7]=4;});
    for(const change of changes){const invalid=structuredClone(clip);change(invalid);assert.throws(()=>doc.prepareClipboard(decodeTemplate(encodeTemplate(invalid))));same(doc.serialize(),bytes);}
    const raw=JSON.parse(new TextDecoder().decode(encodeTemplate(clip)));raw.version=1;
    assert.throws(()=>decodeTemplate(new TextEncoder().encode(JSON.stringify(raw))),/版本/);
  }
});
