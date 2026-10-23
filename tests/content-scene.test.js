import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseTextureName,textureKey,textureName} from '../src/rendering/textureKeys.js';
import {selectTextureFiles} from '../src/platform/files/textureFiles.js';
import {TextureResources} from '../src/platform/files/TextureResources.js';
import {contentEntityIndex} from '../src/adapters/contentEntities.js';
import {rasterizeRegion} from '../src/rendering/worldRaster.js';
import {contentDrawCalls,ContentPainter,validContentDraw} from '../src/rendering/contentPainter.js';
import {contentBaseFrame} from '../src/rendering/contentScene.js';
import {frameGeometryAtZoom} from '../vendor/tedit-blend-rules/framedRules.js';
import {itemDrawProperties} from '../vendor/tedit-blend-rules/entityDraws.js';
import itemMetadata from '../vendor/tedit-blend-rules/itemDraws.json' with {type:'json'};
import sizes from './data/entity-atlas-sizes.json' with {type:'json'};
import tileSizes from './data/content-atlas-sizes.json' with {type:'json'};

const key=name=>parseTextureName(name+'.xnb').key;
const dimensions={...sizes,...tileSizes};
const imagesFor=names=>new Map(names.map(name=>{const[w,h]=dimensions[name+'.xnb']??[256,256];return[key(name),{width:w,height:h}];}));
const atlasFor=images=>Object.fromEntries([...images].map(([k,{width,height}])=>[k,{width,height}]));
const files=names=>names.map(name=>({name:name+'.xnb',size:100}));
const point=(x,y)=>`${x},${y}`;
function sourceFor(tiles,records){
  return {width:100,height:100,surface:90,rock:95,content:contentEntityIndex(records),
    readTile(x,y){assert.ok(x>=0&&y>=0&&x<100&&y<100);return tiles.get(point(x,y))??{};}};
}

test('all real content atlas names have distinct identities and nested armor can be selected by basename',()=>{
  const parsed=Object.keys(sizes).map(name=>parseTextureName(name));
  assert.ok(parsed.every(Boolean));assert.equal(new Set(parsed.map(p=>p.key)).size,6917);
  for(const name of Object.keys(sizes))assert.equal(textureName(parseTextureName(name).key),name.slice(0,-4));
  assert.equal(key('Armor/Armor_Female_1'),key('Armor_Female_1'));
  assert.equal(selectTextureFiles(files(['Armor_1','Item_1','Armor_Head_1','Player_10_3'])).size,4);
  assert.throws(()=>selectTextureFiles(files(['Armor/Armor_1','Armor_1'])),/重复/);
  for(const name of ['../Item_1.xnb','Armor/../Armor_1.xnb','Player_12_0.xnb','Player_0_32.xnb','Xmas_5.xnb'])assert.equal(parseTextureName(name),null);
  for(const kind of ['item','armorHead','armorBody','armorLegs','player','extra','gore'])assert.notEqual(textureKey(kind,1),1);
});

test('append keeps unrelated cached resources and atomically invalidates only replacements and late decoding',async()=>{
  const closed=[],workers=[];
  const resources=new TextureResources(()=>{const w={terminate(){},postMessage({file}){this.file=file;}};workers.push(w);return w;});
  await resources.load(files(['Item_1','Armor_1']),()=>{},{defer:true});
  const initial=resources.ensure([key('Item_1')]);
  workers[0].onmessage({data:{bitmap:{width:20,height:20,close(){closed.push('first');}}}});await initial;
  const pending=resources.ensure([key('Armor_1')]);
  await resources.load(files(['Player_Hair_16']),()=>{},{append:true,defer:true});
  await assert.rejects(pending,{name:'AbortError'});
  workers[1].onmessage({data:{bitmap:{width:20,height:20,close(){closed.push('late');}}}});
  assert.equal(resources.files.size,3);assert.equal(resources.images.size,1);assert.equal(resources.bytes,1600);
  await assert.rejects(resources.load([{name:'bad.txt',size:100}],()=>{},{append:true}),/请选择/);
  assert.equal(resources.files.size,3);assert.equal(resources.images.size,1);
  await resources.load(files(['Item_1']),()=>{},{append:true,defer:true});
  assert.equal(resources.images.size,0);assert.equal(resources.bytes,0);assert.deepEqual(closed,['late','first']);resources.clear();
});

test('item frames, jars and modern entity DTOs request the selected files and project layered snapshots without mutation',()=>{
  const tiles=new Map([[point(20,20),{blockId:395,frameX:0,frameY:0}],[point(24,20),{blockId:698,frameX:18,frameY:0}]]);
  const records=[{type:1,position:{x:20,y:20},item:{id:1,stack:1,prefix:0}},{type:8,position:{x:24,y:20},item:{id:1,stack:1,prefix:0}}];
  const before=structuredClone({tiles,records}),source=sourceFor(tiles,records),names=['Tiles_395','Tiles_698','Item_1'],images=imagesFor(names);
  const region={x:18,y:18,width:10,height:8,step:1,textureIds:names.map(key),atlases:{}};
  const initial=rasterizeRegion(source,region);assert.deepEqual(new Set(initial.requiredTextures),new Set(names.map(key)));
  const image=rasterizeRegion(source,{...region,atlases:atlasFor(images)});
  assert.equal(image.contentScene.tiles.length,2);assert.equal(image.contentScene.entities.length,1);
  const scene=structuredClone(image.contentScene);assert.deepEqual(scene,image.contentScene);
  const calls=contentDrawCalls(scene,new Int32Array(image.sprites),images,region,0,0,9,{scrollX:-18,scrollY:-18,zoom:9});
  assert.ok(calls.some(c=>c[0]===key('Item_1')&&c[1]===1));
  assert.ok(calls.some(c=>c[0]===key('Tiles_698')&&c[3]===92&&c[19]===63));
  assert.deepEqual(calls.filter(c=>c[0]===key('Tiles_698')).map(c=>c[3]),[0,92,46]);
  assert.equal(calls.at(-1)[0],key('Item_1'),'Modern entity pass follows all dedicated tile recipes');
  const moved=contentDrawCalls(scene,new Int32Array(image.sprites),images,region,0,0,16,{scrollX:-19.25,scrollY:-18.5,zoom:16});
  assert.notDeepEqual(moved,calls);assert.deepEqual({tiles,records},before);
  assert.equal(rasterizeRegion(source,{...region,layers:{block:false}}).contentScene,undefined);
  assert.equal(rasterizeRegion(source,{...region,step:2}).contentScene,undefined);
});

test('deferred female armor is requested before fallback and known missing doll files fall back to selected wood parts',()=>{
  const tiles=new Map([[point(20,20),{blockId:470,frameX:72,frameY:0}]]);
  const bodyItem=Number(Object.keys(itemMetadata).find(id=>itemMetadata[id][2]!==null&&itemMetadata[id][2]!==undefined));
  const records=[{type:3,position:{x:20,y:20},items:[null,{id:bodyItem,stack:1},null],misc:[],pose:0}];
  const body=itemDrawProperties(bodyItem).body;
  const names=['Tiles_470',`Armor/Armor_Female_${body}`,`Armor/Armor_${body}`,'Player_10_3','Player_Hair_16'];
  const region={x:18,y:18,width:10,height:8,step:1,textureIds:names.map(key),atlases:{}};
  const image=rasterizeRegion(sourceFor(tiles,records),region);
  assert.ok(image.requiredTextures.includes(key(`Armor/Armor_Female_${body}`)));
  assert.ok(!image.requiredTextures.includes(key(`Armor/Armor_${body}`)));
  assert.ok(image.requiredTextures.includes(key('Player_10_3')));
  assert.ok(image.requiredTextures.includes(key('Player_Hair_16')));
  assert.deepEqual(records[0].items[1],{id:bodyItem,stack:1});
});

test('offscreen food and item anchors survive large icon overhang without scanning a large tile halo',()=>{
  let reads=0;
  const tiles=new Map([[point(20,10),{blockId:520,frameX:0,frameY:0}]]),records=[{type:6,position:{x:20,y:10},item:{id:1,stack:1}}];
  const source=sourceFor(tiles,records),read=source.readTile;source.readTile=(...args)=>{reads++;return read(...args);};
  const image=rasterizeRegion(source,{x:20,y:30,width:2,height:2,step:1,textureIds:[key('Item_1')],atlases:{}});
  assert.equal(image.contentScene.tiles.length,1);assert.deepEqual(image.requiredTextures,[key('Item_1')]);
  assert.ok(reads<1000,'Only entity records use the large padding; tile reads stay local');
});

test('painter keeps premultiplied alpha factors, source geometry and context state separate',()=>{
  const calls=[],context={save(){calls.push(['save']);},restore(){calls.push(['restore']);},translate(...v){calls.push(['translate',...v]);},
    scale(...v){calls.push(['scale',...v]);},drawImage(...v){calls.push(['draw',this.globalCompositeOperation,this.globalAlpha,...v.slice(1)]);}};
  const images=new Map([[1,{width:20,height:20}]]),draw=[1,1,2,3,8,10,40,50,0,0,4,5,.5625,0,.95,1,255,255,255,127];
  const painter=new ContentPainter(()=>{throw new Error('white RGB should not allocate a tint canvas');});
  painter.paint(context,[draw],images);
  assert.deepEqual(calls.filter(c=>c[0]==='draw').map(c=>c.slice(1,3)),[['destination-out',127/255],['lighter',1]]);
  assert.deepEqual(calls[1],['translate',40,50]);assert.deepEqual(calls[2],['translate',-2.25,-2.8125]);
  assert.deepEqual(calls.at(-1),['restore']);assert.deepEqual(draw,[1,1,2,3,8,10,40,50,0,0,4,5,.5625,0,.95,1,255,255,255,127]);
});

test('Chillet Egg retains the desktop source extending below the real atlas and suppresses the other structure cells',()=>{
  const tiles=new Map();for(let x=0;x<2;x++)for(let y=0;y<2;y++)tiles.set(point(20+x,20+y),{blockId:752,frameX:x*18,frameY:y*18});
  const images=imagesFor(['Tiles_752']),region={x:18,y:18,width:8,height:8,step:1,textureIds:[752],atlases:atlasFor(images)};
  assert.deepEqual(images.get(752),{width:38,height:36});
  const image=rasterizeRegion(sourceFor(tiles,[]),region),calls=contentDrawCalls(image.contentScene,new Int32Array(image.sprites),images,region,0,0,16,{scrollX:-18,scrollY:-18,zoom:16});
  assert.equal(image.textureStats.drawn,4);assert.equal(image.textureStats.fallback,0);
  assert.equal(calls.length,1);assert.deepEqual(calls[0].slice(2,6),[0,0,36,38]);assert.ok(validContentDraw(calls[0],images.get(752)));
  const oversized=[...calls[0]];oversized[4]=4096;oversized[5]=4096;assert.equal(validContentDraw(oversized,images.get(752)),false);
});

test('216 anchor base frame and offset cases match the original C# geometry independently of entity overlays',()=>{
  const resources={Tiles_723:{width:90,height:16,key:723},Tiles_724:{width:90,height:90,key:724}},values=[];
  for(const id of [723,724])for(const u of [0,18,36,54,-1,32767])for(const v of [0,18,36,54,-1,32767])for(const[x,z]of [[100,4],[101,9],[100,16]]){
    const result=contentBaseFrame({blockId:id,frameX:u,frameY:v},x,resources);
    values.push(result?.frame?1:0,...(result?.frame?[resources[result.resource].key,...frameGeometryAtZoom(result.frame,z)]:[]));
  }
  const bytes=Buffer.alloc(values.length*4);values.forEach((v,i)=>bytes.writeInt32LE(v,i*4));assert.equal(bytes.length,5064);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'0382f10d04af2d644df3f9f8923b7cdeb463205e251d054ef2e059a9c900df8b');
});

test('tile Immediate call order and the later BackToFront entity batch never share a depth sort',()=>{
  const tiles=new Map([[point(20,20),{blockId:171,frameX:10,frameY:1}],[point(24,20),{blockId:470,frameX:0,frameY:0}]]);
  const records=[{type:3,position:{x:24,y:20},items:[null,null,null],misc:[],pose:0}],images=imagesFor(['Xmas_0','Xmas_3','Tiles_470','Player_10_3']);
  const region={x:18,y:18,width:12,height:12,step:1,textureIds:[...images.keys()],atlases:atlasFor(images)};
  const image=rasterizeRegion(sourceFor(tiles,records),region),calls=contentDrawCalls(image.contentScene,new Int32Array(image.sprites),images,region,0,0,16,{scrollX:-18,scrollY:-18,zoom:16});
  assert.deepEqual(calls.slice(0,2).map(c=>c[0]),[key('Xmas_3'),key('Xmas_0')]);
  assert.ok(calls[0][14]<calls[1][14],'Immediate preserves overlay before base exactly as the original caller');
  assert.ok(calls.findIndex(c=>c[0]===key('Player_10_3'))>1,'Doll body follows the complete earlier tile batch');
});

test('intentional zero-sized desktop calls leave transparent Christmas cells and empty platters instead of fallback color',()=>{
  const tiles=new Map([[point(20,20),{blockId:171,frameX:10,frameY:0}],[point(20,21),{blockId:171,frameX:0,frameY:18}],
    [point(24,20),{blockId:520,frameX:0,frameY:0}]]),images=imagesFor(['Tiles_171','Xmas_0','Tiles_520']);
  const source=sourceFor(tiles,[]);source.background=[10,20,30];
  const region={x:18,y:18,width:10,height:10,step:1,textureIds:[...images.keys()],atlases:atlasFor(images)};
  const image=rasterizeRegion(source,region),pixels=new Uint8Array(image.buffer);
  assert.equal(image.textureStats.fallback,0);assert.equal(image.textureStats.drawn,3);
  for(const[x,y]of [[20,20],[20,21],[24,20]])assert.deepEqual([...pixels.slice(((y-18)*10+x-18)*4,((y-18)*10+x-18)*4+4)],[10,20,30,255]);
  const calls=contentDrawCalls(image.contentScene,new Int32Array(image.sprites),images,region,0,0,16,{scrollX:-18,scrollY:-18,zoom:16});
  assert.deepEqual(calls.map(c=>c[0]),[key('Xmas_0')]);
});
