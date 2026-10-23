import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {getUVForMasks} from '../vendor/tedit-blend-rules/blendRules.js';
import {ordinaryTileIds,tileRule,blendMasks,frameVariant,gemSparkFrame,tilesMerge} from '../vendor/tedit-blend-rules/terrainRules.js';
import {createDesktopFrames,desktopFrameAt,SUPPORTED_TEXTURE_IDS} from '../src/rendering/desktopTerrain.js';
import {rasterizeRegion} from '../src/rendering/worldRaster.js';

const digest=bytes=>createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const offsets=[[1,0],[0,-1],[-1,0],[0,1],[1,-1],[-1,-1],[-1,1],[1,1]];
const source=(width,height,readTile)=>({width,height,surface:4,rock:8,readTile});

test('all ordinary tile masks, reciprocal readiness and coordinate variants match 174592 original C# cases',()=>{
 const bytes=[];
 for(const id of ordinaryTileIds)for(let code=0;code<512;code++){
  const tile=tileRule(id),neighbors=[],lazy=[];
  for(let i=0;i<8;i++){
   const mode=(code>>((i%3)*3))%5;
   neighbors.push(mode===0?undefined:mode===1?id:mode===2?(tile.mergeWith!==null&&tile.mergeWith>=0?tile.mergeWith:0):mode===3?1:(id*13+code*17+i*71)%754);
   const flag=(code+i*7)%17;lazy.push(flag===16?255:flag);
  }
  const variant=frameVariant(id,code%12,Math.floor(code/12)%12),masks=blendMasks(id,neighbors,lazy);
  bytes.push(...getUVForMasks(masks.same,masks.blend,masks.strictness,variant),variant);
 }
 // Original WorldRenderXna statement block, TileProperty.Merges and
 // TileFraming.DetermineFrameNumber executed with fixed tiles.json in .NET 8.
 assert.equal(bytes.length,174592*3);
 assert.equal(digest(bytes),'dad6df3d549a6f1503e2a64640d33e725c793d3df1a54c51dbf6bca1a0af9353');
});

test('SelfFrame8Way matches 30000 original C# cases with every center slope and shaped corner neighbors',()=>{
 const bytes=[];
 for(let slope=0;slope<6;slope++)for(let code=0;code<5000;code++){
  const tiles=new Map([['3,3',{blockId:255,slope}]]);let random=code+1;
  for(let i=0;i<8;i++){
   random=(Math.imul(random,1664525)+1013904223)>>>0;
   const choice=(random>>>16)%7,[dx,dy]=offsets[i];
   tiles.set([3+dx,3+dy].join(','),choice<6?{blockId:255,slope:choice%6}:{});
  }
  bytes.push(...gemSparkFrame(source(7,7,(x,y)=>tiles.get([x,y].join(','))||{}),3,3));
 }
 assert.equal(digest(bytes),'a9c8a122a0280e65b413e52fcc8af8858e3c83418bc293831ab5bad31ae4e416');
});

test('ordinary eligibility excludes dedicated sprites, platforms and cactus and retains broad terrain families',()=>{
 assert.equal(ordinaryTileIds.length,341);assert.equal(SUPPORTED_TEXTURE_IDS.length,342);
 for(const id of [0,1,2,30,41,53,57,59,60,147,161,255,273,274,409,719,749])assert.ok(ordinaryTileIds.includes(id),String(id));
 for(const id of [3,5,19,21,80,88,128,470])assert.ok(!ordinaryTileIds.includes(id),String(id));
 assert.ok(SUPPORTED_TEXTURE_IDS.includes(3));assert.ok(!SUPPORTED_TEXTURE_IDS.includes(754));
 assert.equal(tilesMerge(1,59),true);assert.equal(tilesMerge(59,1),true);
 assert.equal(tilesMerge(57,59),false);
 assert.equal(tileRule(2).grass,true);assert.equal(tileRule(1).stone,true);
 assert.throws(()=>{tileRule(273).grid[0]=1;},TypeError);
});

test('large-frame materials retain original four-variant coordinate patterns and ordinary clamp behavior',()=>{
 assert.deepEqual(Array.from({length:4},(_,y)=>Array.from({length:3},(_,x)=>frameVariant(273,x,y))),[[1,3,1],[0,2,0],[1,1,3],[0,0,2]]);
 assert.deepEqual(Array.from({length:2},(_,x)=>Array.from({length:2},(_,y)=>frameVariant(409,x,y))),[[0,2],[1,3]]);
 const world=source(12,12,()=>({blockId:273}));
 const frames=createDesktopFrames(world,{x:0,y:0,width:12,height:12});
 assert.deepEqual(frames(3,4,world.readTile(3,4)),{sourceX:36,sourceY:18,width:16,height:16,offsetY:0});
 assert.deepEqual(frames(4,4,world.readTile(4,4)),{sourceX:54,sourceY:18,width:16,height:16,offsetY:0});
});

test('web, stone groups and grass use distinct neighbor masks rather than treating IDs as strictness',()=>{
 assert.equal(blendMasks(51,Array(8).fill(21)).same,0x1111);
 assert.equal(blendMasks(1,Array(8).fill(63)).same,0x11111111);
 assert.equal(blendMasks(57,Array(8).fill(57)).strictness,0);
 assert.equal(blendMasks(59,Array(8).fill(0)).strictness,1);
 assert.equal(blendMasks(60,Array(8).fill(59)).strictness,2);
 const pending=blendMasks(59,[0,0,0,0], [255,0,0,0]);
 const ready=blendMasks(59,[0,0,0,0], [0,0,0,0]);
 assert.equal(pending.same,0x1111);assert.equal(ready.same,0);
});

test('all ordinary families produce bounded terrain commands, preserve inputs and fall back without each atlas',()=>{
 for(const id of ordinaryTileIds){
  const tile={blockId:id},snapshot=structuredClone(tile),world=source(3,3,()=>tile),region={x:0,y:0,width:3,height:3,step:1};
  const color=rasterizeRegion(world,region),image=rasterizeRegion(world,{...region,atlases:{[id]:{width:4096,height:4096}}});
  assert.equal(image.textureStats.drawn,9,String(id));assert.equal(image.textureStats.fallback,0,String(id));
  const sprites=new Int32Array(image.sprites);
  for(let i=0;i<sprites.length;i+=8){assert.equal(sprites[i],id);assert.ok(sprites[i+1]>=0&&sprites[i+2]>=0);assert.equal(sprites[i+3],16);assert.equal(sprites[i+4],16);}
  assert.deepEqual(tile,snapshot);
  assert.deepEqual(rasterizeRegion(world,{...region,atlases:{}}).buffer,color.buffer);
 }
});

test('mixed extended terrain crop, edit and undo preserve frames and never change source data',()=>{
 const ids=[0,1,2,57,59,60,161,147,273,409,255,53],tiles=Array.from({length:48*48},(_,i)=>({blockId:ids[(i*19+Math.floor(i/48)*17)%ids.length]}));
 const world=source(48,48,(x,y)=>tiles[x*48+y]),snapshot=structuredClone(tiles);
 const full=createDesktopFrames(world,{x:0,y:0,width:48,height:48});
 for(const region of [{x:0,y:0,width:7,height:9},{x:13,y:15,width:11,height:8},{x:41,y:40,width:7,height:8}]){
  const crop=createDesktopFrames(world,region);
  for(let x=region.x;x<region.x+region.width;x++)for(let y=region.y;y<region.y+region.height;y++)assert.deepEqual(crop(x,y,world.readTile(x,y)),full(x,y,world.readTile(x,y)),x+','+y);
 }
 const simple=source(7,7,(x,y)=>x===3&&y===3?{blockId:57}:tiles[x*48+y]);
 const before=desktopFrameAt(simple,3,3),old=tiles[4*48+3];tiles[4*48+3]={blockId:57};
 assert.notDeepEqual(desktopFrameAt(simple,3,3),before);
 tiles[4*48+3]=old;assert.deepEqual(desktopFrameAt(simple,3,3),before);
 assert.deepEqual(tiles,snapshot);
});
