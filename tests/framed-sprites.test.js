import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import catalogue from '../vendor/tedit-furniture/catalogue.json' with {type:'json'};
import sizes from './data/framed-atlas-sizes.json' with {type:'json'};
import {framedTileIds,framedFrameAt,frameGeometryAtZoom,renderUV} from '../vendor/tedit-blend-rules/framedRules.js';
import {rasterizeRegion} from '../src/rendering/worldRaster.js';
import {spriteCommand,drawSprites,SPRITE_STRIDE} from '../src/rendering/spriteCommands.js';

test('all 82167 general framed geometry cases match the fixed original C# renderer at three zoom levels',()=>{
 const values=[];let cases=0;
 for(const t of catalogue.tiles.filter(t=>framedTileIds.includes(t.id))){
  // The existing fixed-source catalogue retains frame UVs and grid intervals.
  const points=[];
  for(const f of t.styles){const[u,v]=f.uv;points.push([u,v],[u+t.interval[0],v],[u,v+t.interval[1]]);}
  const us=[-32768,-1,0,17,18,1908,1998,2016,2040,32767],vs=[0,18,32767,-1,54,18,2016,2040,1998,-32768];
  for(let i=0;i<20;i++)points.push([us[i%10],vs[i%10]]);
  for(let[u,v]of points){
   u=(u+32768)%65536-32768;v=(v+32768)%65536-32768;
   for(const[x,z]of [[2,4],[3,9],[2,16]]){
    const[w,h]=sizes[t.id],frame=framedFrameAt({blockId:t.id,frameX:u,frameY:v},x,{width:w,height:h});
    const result=frameGeometryAtZoom(frame,z);values.push(result?1:0);if(result)values.push(...result);cases++;
   }
  }
 }
 const bytes=Buffer.alloc(values.length*4);values.forEach((v,i)=>bytes.writeInt32LE(v,i*4));
 // Original GetRenderUV, general framed draw block and ApplyTileRenderOffset
 // executed unchanged at desktop source pin 84e3fc3; atlas dimensions measured
 // from real local XNB sheets, without distributing game images.
 assert.equal(cases,82167);assert.equal(bytes.length,2639760);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'7839e2eaffa4a83aaf395402733713481deca02f70cfccc45c3673094ee870c6');
});

test('general framing handles omitted zero UVs, exact wraps, clipping and dedicated branch exclusions',()=>{
 assert.equal(framedTileIds.length,376);
 for(const id of [3,4,10,21,55,79,88,104,227,406,658,733])assert.ok(framedTileIds.includes(id));
 for(const id of [5,19,72,128,171,269,314,323,334,395,470,475,520,583,617,634,698,723,724,751,752])assert.ok(!framedTileIds.includes(id));
 assert.deepEqual(renderUV(88,1998,0),[0,36]);assert.deepEqual(renderUV(15,0,2040),[36,0]);
 assert.deepEqual(renderUV(185,1908,18),[0,36]);assert.deepEqual(renderUV(185,1908,0),[1908,0]);
 assert.deepEqual(renderUV(88,-1,0),[-1,0]);
 const plant=framedFrameAt({blockId:3},2,{width:16,height:18});
 assert.equal(plant.sourceX,0);assert.equal(plant.sourceY,0);assert.equal(plant.height,18);assert.equal(plant.destHeight,20);assert.equal(plant.anchorY,-2);assert.equal(plant.flip,true);
 assert.equal(framedFrameAt({blockId:3},3).flip,false);
 for(const bad of [NaN,32768,-32769,1.5])assert.equal(framedFrameAt({blockId:3,frameX:bad},0),null);
 assert.equal(framedFrameAt({blockId:5},0),null);
});

const world=(width,height,tiles)=>({width,height,surface:height,rock:height,readTile(x,y){assert.ok(x>=0&&y>=0&&x<width&&y<height);return tiles.get(x+','+y)||{};}});
test('framed sprites retain offscreen overhangs, view-independent parity, selection demand and readonly world fields',()=>{
 const tiles=new Map([['3,2',{blockId:73}],['4,4',{blockId:21}],['6,4',{blockId:88,frameX:1998}],['5,5',{blockId:3}],['8,4',{blockId:19}]]);
 const before=structuredClone(tiles),source=world(12,12,tiles),atlases=Object.fromEntries([73,21,88,3].map(id=>[id,{width:sizes[id][0],height:sizes[id][1]}]));
 const region={x:3,y:3,width:6,height:4,step:1,atlases,textureIds:[73,21,88,3,19]};
 const crop=rasterizeRegion(source,region),full=rasterizeRegion(source,{...region,x:0,y:0,width:12,height:12});
 const records=image=>{const raw=new Int32Array(image.sprites);return Array.from({length:raw.length/SPRITE_STRIDE},(_,i)=>[...raw.slice(i*SPRITE_STRIDE,(i+1)*SPRITE_STRIDE)]);};
 const a=records(crop),b=records(full);assert.ok(a.some(r=>r[0]===73&&r[6]===-1),'Plant above viewport retains its visible lower sprite');
 for(const r of a){const match=b.find(q=>q[0]===r[0]&&q[5]===r[5]+region.x&&q[6]===r[6]+region.y);assert.ok(match);assert.deepEqual(r.slice(0,5),match.slice(0,5));assert.deepEqual(r.slice(7),match.slice(7));}
 assert.ok(crop.requiredTextures.includes(73));assert.ok(crop.requiredTextures.includes(19));assert.deepEqual(tiles,before);
 tiles.delete('4,4');assert.notDeepEqual(rasterizeRegion(source,region).sprites,crop.sprites);tiles.set('4,4',before.get('4,4'));assert.deepEqual(rasterizeRegion(source,region).sprites,crop.sprites);
 assert.equal(rasterizeRegion(source,{...region,layers:{block:false}}).sprites.byteLength,0);
 assert.equal(rasterizeRegion(source,{...region,step:2}).sprites.byteLength,0);
});

test('sprite drawing separates anchor truncation, flip state and clipped source size from destination size',()=>{
 const calls=[],context=Object.fromEntries(['save','restore','translate','scale','drawImage'].map(name=>[name,(...args)=>calls.push([name,...args])]));
 const atlas={},images=new Map([[3,atlas],[1,atlas]]),frame=framedFrameAt({blockId:3},2,{width:16,height:18});
 const record=spriteCommand(3,frame,2,-1);assert.equal(record.length,SPRITE_STRIDE);
 drawSprites(context,new Int32Array(record),images,10,20,9);
 assert.deepEqual(calls,[['save'],['translate',37,10],['scale',-1,1],['drawImage',atlas,0,0,16,18,0,0,9,11],['restore']]);
 calls.length=0;drawSprites(context,new Int32Array(spriteCommand(1,{sourceX:0,sourceY:0,width:16,height:16,offsetY:0},0,0)),images,0,0,13.5);
 assert.deepEqual(calls,[['drawImage',atlas,0,0,16,16,0,0,13.5,13.5]],'Ordinary terrain retains fractional browser scaling');
 calls.length=0;drawSprites(context,new Int32Array(record),new Map(),0,0,16);assert.deepEqual(calls,[]);
});
