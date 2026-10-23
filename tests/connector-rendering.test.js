import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import catalogue from '../vendor/tedit-furniture/catalogue.json' with {type:'json'};
import sizes from './data/connector-atlas-sizes.json' with {type:'json'};
import {tileContentDraws} from '../vendor/tedit-blend-rules/tileContentDraws.js';
import {contentBaseFrame} from '../src/rendering/contentScene.js';
import {frameGeometryAtZoom} from '../vendor/tedit-blend-rules/framedRules.js';
import {rasterizeRegion} from '../src/rendering/worldRaster.js';
import {contentDrawCalls} from '../src/rendering/contentPainter.js';
import {SUPPORTED_TEXTURE_IDS} from '../src/rendering/desktopTerrain.js';

const atlases=Object.fromEntries(Object.entries(sizes).map(([name,[width,height]])=>[name.slice(0,-4),{width,height,key:Number(name.slice(6,-4))}]));
const cameras=[[1000,109,-995.125,-107.75,4,[255,255,255,255]],[22,40,-19.3,-38.7,9,[90,140,231,255]],
  [4001,1100,-3997.33,-1090.13,16,[255,64,0,127]],[0,0,-.75,.1,7.125,[0,200,90,64]]];

test('7396 track recipes retain all 32860 original C# calls, switch tracks, endcaps and sloped slices',()=>{
  const hash=createHash('sha256');let count=0,calls=0,bytes=0;
  for(const u of [-1,...Array.from({length:41},(_,i)=>i),32767])
    for(const v of [-1,...Array.from({length:41},(_,i)=>i),32767])
      for(const[x,y,scrollX,scrollY,zoom,color]of cameras){
        const draws=tileContentDraws({blockId:314,frameX:u,frameY:v},x,y,null,atlases,{scrollX,scrollY,zoom,color});
        const buffer=Buffer.alloc(4+draws.length*68);buffer.writeInt32LE(draws.length);
        for(let j=0;j<draws.length;j++){
          const draw=draws[j],o=4+j*68;
          buffer.writeInt32LE(draw[0]===null?-1:atlases[draw[0]].key,o);buffer.writeInt32LE(draw[1],o+4);
          for(let k=2;k<15;k++)buffer.writeFloatLE(draw[k],o+8+(k-2)*4);
          buffer.writeInt32LE(draw[15],o+60);for(let k=16;k<20;k++)buffer.writeUInt8(draw[k],o+64+k-16);
        }
        hash.update(buffer);count++;calls+=draws.length;bytes+=buffer.length;
      }
  // Original MinecartTrack branch, TrackUV and final Draw, fixed TEdit
  // 84e3fc3; atlas is the measured 144x144 local XNB. No GPU pixel claim.
  assert.equal(count,7396);assert.equal(calls,32860);assert.equal(bytes,2264064);
  assert.equal(hash.digest('hex'),'4fb5c5282fc06e8871a76389eebfae06844f2e96adbc2177a8933bc384dc7839');
});

test('22344 platform and target-dummy frames follow the original IsFramed dispatch and clipping',()=>{
  const values=[];let count=0;
  for(const tile of catalogue.tiles.filter(t=>[19,378,427,435,436,437,438,439].includes(t.id))){
    const points=tile.styles.flatMap(s=>{const[u,v]=s.uv;return[[u,v],[u+18,v],[u,v+18]];});
    for(const u of [-32768,-1,0,17,18,126,144,468,486,32767])
      for(const v of [-32768,-1,0,17,18,36,1230,1242,1260,32767])points.push([u,v]);
    for(const[u,v]of points)for(const[x,z]of [[100,4],[101,9],[100,16]]){
      const result=contentBaseFrame({blockId:tile.id,frameX:u,frameY:v},x,atlases);
      values.push(result.frame?1:0,...(result.frame?[atlases[result.resource].key,...frameGeometryAtZoom(result.frame,z)]:[]));count++;
    }
  }
  const bytes=Buffer.alloc(values.length*4);values.forEach((v,i)=>bytes.writeInt32LE(v,i*4));
  // All seven platforms have IsFramed=true in the original tile definitions,
  // so its earlier framed branch wins over the later IsPlatform else-if.
  assert.equal(count,22344);assert.equal(bytes.length,894696);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'1baf0b1b3d0627741b6e30882f2b44b2c0393d0877c556aa32f9a08fa8ff9683');
});

const atlasMap=Object.fromEntries(Object.values(atlases).map(a=>[a.key,{width:a.width,height:a.height}]));
const images=new Map(Object.entries(atlasMap).map(([id,a])=>[Number(id),a]));
function sourceFor(tiles){
  let reads=0;
  return{width:100,height:100,surface:80,rock:90,get reads(){return reads;},readTile(x,y){
    reads++;assert.ok(x>=0&&x<100&&y>=0&&y<100);return tiles.get(`${x},${y}`)??{};
  }};
}
function callsFor(result,region,zoom=9){
  return contentDrawCalls(structuredClone(result.contentScene),new Int32Array(result.sprites),images,region,0,0,zoom,
    {scrollX:-region.x,scrollY:-region.y,zoom});
}

test('connector resource requests, missing-atlas fallback and revision refresh preserve stored data',()=>{
  const tiles=new Map([['20,20',{blockId:314,frameX:10,frameY:5}],['21,20',{blockId:19,frameX:144,frameY:18}],
    ['22,20',{blockId:378,frameX:36,frameY:0}]]),snapshot=structuredClone(tiles),source=sourceFor(tiles);
  const region={x:19,y:19,width:5,height:4,step:1,textureIds:[314,19,378],atlases:{}};
  const pending=rasterizeRegion(source,region);
  assert.deepEqual(new Set(pending.requiredTextures),new Set([314,19,378]));assert.equal(pending.textureStats.fallback,3);
  const drawn=rasterizeRegion(source,{...region,atlases:atlasMap});
  assert.equal(drawn.textureStats.drawn,3);assert.equal(drawn.textureStats.fallback,0);
  const calls=callsFor(drawn,region);assert.equal(calls.filter(c=>c[0]===314).length,15);
  assert.equal(calls.filter(c=>c[0]===314&&c[1]===1).length,12);
  assert.deepEqual(tiles,snapshot);
  tiles.set('20,20',{blockId:314,frameX:24,frameY:-1});
  const changed=callsFor(rasterizeRegion(source,{...region,atlases:atlasMap}),region);
  assert.notDeepEqual(changed,calls);assert.equal(changed.filter(c=>c[0]===314).length,2);
  tiles.set('20,20',snapshot.get('20,20'));
  assert.deepEqual(callsFor(rasterizeRegion(source,{...region,atlases:atlasMap}),region),calls);
  const hidden=rasterizeRegion(source,{...region,atlases:atlasMap,layers:{block:false}});
  assert.equal(hidden.contentScene,undefined);assert.deepEqual(hidden.requiredTextures,[]);
  assert.equal(SUPPORTED_TEXTURE_IDS.length,new Set(SUPPORTED_TEXTURE_IDS).size);
  for(const id of [19,314,378])assert.ok(SUPPORTED_TEXTURE_IDS.includes(id));
});

test('bounded offscreen tracks retain upper endcaps and lower slopes without scanning the world',()=>{
  const tiles=new Map([['10,9',{blockId:314,frameX:4,frameY:-1}],['10,11',{blockId:314,frameX:2,frameY:-1}]]);
  const source=sourceFor(tiles),region={x:10,y:10,width:1,height:1,step:1,textureIds:[314],atlases:{314:atlasMap[314]}};
  const drawn=rasterizeRegion(source,region),calls=callsFor(drawn,region,16);
  assert.equal(drawn.contentScene.tiles.length,2);assert.equal(calls.length,9);
  assert.ok(calls.some(c=>c[2]===0&&c[3]===126&&c[7]===1));
  assert.equal(calls.filter(c=>c[3]===108&&c[7]===1).length,6);
  assert.ok(source.reads<1000,`bounded region used ${source.reads} reads`);
  assert.deepEqual([...tiles.values()].map(t=>[t.frameX,t.frameY]),[[4,-1],[2,-1]]);
});
