import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import sizes from './data/tree-atlas-sizes.json' with {type:'json'};
import {treeFrameAt,treeTileIds} from '../vendor/tedit-blend-rules/treeRules.js';
import {frameGeometryAtZoom} from '../vendor/tedit-blend-rules/framedRules.js';
import {parseTextureName,textureKey,textureName} from '../src/rendering/textureKeys.js';
import {selectTextureFiles} from '../src/platform/files/textureFiles.js';
import {TextureResources} from '../src/platform/files/TextureResources.js';
import {SUPPORTED_TEXTURE_IDS} from '../src/rendering/desktopTerrain.js';
import {rasterizeRegion} from '../src/rendering/worldRaster.js';
import {SPRITE_STRIDE} from '../src/rendering/spriteCommands.js';
const atlases=Object.fromEntries(Object.entries(sizes).map(([name,[width,height]])=>[parseTextureName(name).key,{width,height}]));

test('all 12195 tree atlas, frame, anchor and zoom cases match independent original C# output',()=>{
 const values=[];let cases=0;
 const points=[[0,0],[22,0],[66,44],[88,66],[88,110],[22,132],[44,176],[22,198],[44,220],[66,242],[88,198],[132,198],[-1,0]];
 for(const id of [5,72,323,583,584,585,586,587,588,589,596,616,634]){
  for(const[u,v]of [...points,...(id===72?[[36,0],[36,18],[36,36]]:[])]){
   let environments=[[2,1,0,120,0,0,0]];
   if(id===5){
    environments=[];
    for(const[soil,depth,shift,surface]of [[2,1,0,120],[23,1,0,120],[60,20,0,110],[60,20,0,130],[70,1,0,120],[109,1,0,120],[147,1,0,120],[199,1,0,120],[2,99,0,120],[23,100,0,120],[199,1,1,120],[109,1,-1,120],[0,-1,0,120]])
     for(const[jungle,snow,style]of [[0,0,0],[1,1,1],[0,2,2],[1,3,3],[0,32,4],[0,42,5]])environments.push([soil,depth,shift,surface,jungle,snow,style]);
   }
   if(id===323)environments=[53,112,116,234,2].flatMap(soil=>[1,99,100].map(depth=>[soil,depth,0,120,0,0,0]));
   for(const[soil,depth,shift,surface,jungle,snow,style]of environments)for(const[x,z]of [[99,4],[100,9],[101,16],[200,4],[201,9],[300,16],[301,4],[2099,9],[2100,16]]){
    const tile={blockId:id,frameX:u,frameY:v},y=100;
    const source={width:4200,height:1200,surface,tree:{x:[100,200,300],styles:[style,(style+1)%6,(style+2)%6,(style+3)%6],jungleBackground:jungle,snowBackground:snow},readTile:(tx,ty)=>tx===x&&ty===y?tile:depth>=0&&tx===x+shift&&ty===y+depth?{blockId:soil}:{}};
    const actual=treeFrameAt(source,x,y,tile,atlases),geometry=actual?[actual.resource,...frameGeometryAtZoom(actual.frame,z).slice(0,8)]:null;
    values.push(geometry?1:0,...geometry??[]);cases++;
   }
  }
 }
 const bytes=Buffer.alloc(values.length*4);values.forEach((v,i)=>bytes.writeInt32LE(v,i*4));
 // Unmodified desktop World methods, tree selection, foliage and generic trunk
 // geometry executed in C# at source pin 84e3fc3. Only dimension facts are shared.
 assert.equal(cases,12195);assert.equal(bytes.length,487152);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'1ebbab637dbb7bd8ca8c48b18fdbcdf07b062e7708071dd70f2ba2da9505f06c');
});

test('tree atlas families retain distinct numeric identities, exact filenames and bounded local file selection',()=>{
 const keys=Object.keys(sizes).map(name=>parseTextureName(name).key);
 assert.equal(new Set(keys).size,85);assert.equal(treeTileIds.length,13);
 for(const name of Object.keys(sizes))assert.equal(textureName(parseTextureName(name).key),name.slice(0,-4));
 assert.notEqual(textureKey('tile',5),textureKey('tree',5));assert.notEqual(textureKey('treeTop',3),textureKey('treeBranch',3));
 for(const name of ['Tiles_5_7.xnb','Tree_Tops_32.png','Tree_Branches_-1.xnb','Shroom_Tops_1.xnb','Tiles_65536.xnb','../Tree_Tops_0.xnb'])assert.equal(parseTextureName(name),null);
 for(const key of [-1,NaN,327680,1.5])assert.equal(textureName(key),null);
 const files=[...SUPPORTED_TEXTURE_IDS.map(id=>({name:`Tiles_${id}.xnb`,size:100})),...Object.keys(sizes).filter(name=>!/^Tiles_\d+\.xnb$/.test(name)).map(name=>({name,size:100}))];
 assert.equal(selectTextureFiles(files).size,802);
 assert.throws(()=>selectTextureFiles([{name:'Tree_Tops_3.xnb',size:100},{name:'tree_tops_3.PNG',size:100}]),/重复/);
 assert.throws(()=>selectTextureFiles([{name:'Tree_Branches_3.xnb',size:4*1024*1024+1}]),/4 MiB/);
});

test('same-number tile, trunk, crown and branch images share the existing bounded cache without collisions',async()=>{
 const decoded=[],closed=[],resources=new TextureResources(()=>({terminate(){},postMessage({file}){
  const key=parseTextureName(file.name).key;decoded.push(key);queueMicrotask(()=>this.onmessage({data:{bitmap:{width:1024,height:1024,close(){closed.push(key);}}}}));
 }}));
 const keys=[5,textureKey('tree',5),textureKey('treeTop',5),textureKey('treeBranch',5)];
 await resources.load(keys.map(id=>({name:textureName(id)+'.xnb',size:100})),()=>{},{defer:true});
 assert.deepEqual(decoded,[]);await resources.ensure(keys.slice(0,3));assert.deepEqual([...resources.images.keys()],keys.slice(0,3));
 await resources.ensure(keys.slice(1));assert.deepEqual([...resources.images.keys()],keys.slice(1));assert.deepEqual(closed,[5]);assert.equal(resources.bytes,12*1024*1024);
 await resources.ensure([5]);assert.equal(decoded.at(-1),5);assert.ok(resources.bytes<=12*1024*1024);
 resources.clear();assert.equal(resources.bytes,0);assert.equal(closed.length,decoded.length);
});

const records=image=>{const raw=new Int32Array(image.sprites);return Array.from({length:raw.length/SPRITE_STRIDE},(_,i)=>[...raw.slice(i*SPRITE_STRIDE,(i+1)*SPRITE_STRIDE)]);};
const sourceFor=(tiles,padding)=>({width:90,height:50,surface:40,rock:45,tree:{x:[20,40,60],styles:[0,1,2,3]},palmPadding:padding,readTile(x,y){assert.ok(x>=0&&x<90&&y>=0&&y<50);return tiles.get(`${x},${y}`)??{};}});

test('offscreen tall crowns and both signs of palm lean request the resolved atlas and survive clipping without world edits',()=>{
 for(const[origin,view,padding]of [
  [[20,20,5,22,198,109],[18,12,5,2],()=>({left:0,right:0})],
  [[5,20,323,88,320,53],[24,17,2,2],()=>({left:20,right:0})],
  [[70,20,323,88,-640,234],[28,17,2,2],()=>({left:0,right:40})],
 ]){
  const[tx,ty,id,u,v,soil]=origin,tiles=new Map([[`${tx},${ty}`,{blockId:id,frameX:u,frameY:v}],[`${tx},${ty+1}`,{blockId:soil}]]),before=structuredClone(tiles),source=sourceFor(tiles,padding);
  const resolved=treeFrameAt(source,tx,ty,tiles.get(`${tx},${ty}`),atlases),[x,y,width,height]=view;
  const region={x,y,width,height,step:1,atlases,textureIds:[resolved.resource]},image=rasterizeRegion(source,region),draws=records(image);
  assert.equal(draws.length,1);assert.equal(draws[0][0],resolved.resource);assert.deepEqual(image.requiredTextures,[resolved.resource]);
  const full=records(rasterizeRegion(source,{...region,x:0,y:0,width:90,height:50})).find(r=>r[0]===resolved.resource);
  assert.deepEqual(draws[0].slice(0,5),full.slice(0,5));assert.deepEqual(draws[0].slice(7),full.slice(7));assert.equal(draws[0][5]+x,full[5]);assert.equal(draws[0][6]+y,full[6]);
  assert.deepEqual(tiles,before);assert.equal(rasterizeRegion(source,{...region,layers:{block:false}}).sprites.byteLength,0);
  assert.equal(rasterizeRegion(source,{...region,step:2}).sprites.byteLength,0);
  assert.equal(rasterizeRegion(source,{...region,atlases:{}}).sprites.byteLength,0);
  assert.deepEqual(rasterizeRegion(source,{...region,atlases:{}}).requiredTextures,[resolved.resource]);
 }
});

test('soil and world style changes immediately change tree resources; malformed UV and world-edge roots remain bounded',()=>{
 const tile={blockId:5,frameX:22,frameY:198},tiles=new Map([['20,20',tile],['20,21',{blockId:2}]]),source=sourceFor(tiles);
 const before=structuredClone(tile);assert.equal(treeFrameAt(source,20,20,tile,atlases).resource,textureKey('treeTop',0));
 source.tree.styles[0]=5;assert.equal(treeFrameAt(source,20,20,tile,atlases).resource,textureKey('treeTop',10));
 tiles.set('20,21',{blockId:23});assert.equal(treeFrameAt(source,20,20,tile,atlases).resource,textureKey('treeTop',1));
 tiles.set('20,21',{blockId:60});source.tree.jungleBackground=1;assert.equal(treeFrameAt(source,20,20,tile,atlases).resource,textureKey('treeTop',11));
 assert.deepEqual(tile,before);assert.equal(treeFrameAt(source,0,49,{blockId:5,frameX:88,frameY:66},atlases).resource,5);
 for(const value of [NaN,32768,-32769,1.2])assert.equal(treeFrameAt(source,20,20,{...tile,frameY:value},atlases),null);
 assert.equal(treeFrameAt(source,20,20,{blockId:128},atlases),null);
});
