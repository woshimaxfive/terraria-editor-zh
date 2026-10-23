import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cactusDraw} from '../vendor/tedit-blend-rules/cactusRules.js';
import {createCactusFrames,MAX_CACTUS_CACHE_CELLS} from '../src/rendering/cactusFrames.js';
import {textureKey,parseTextureName,textureName} from '../src/rendering/textureKeys.js';
import {selectTextureFiles} from '../src/platform/files/textureFiles.js';
import {rasterizeRegion} from '../src/rendering/worldRaster.js';
import {SPRITE_STRIDE} from '../src/rendering/spriteCommands.js';

const keyOf=name=>({Tiles_80:80,Good_Cactus:1,Evil_Cactus:2,Crimson_Cactus:3})[name];
const offsets=[[1,0],[0,-1],[-1,0],[0,1],[-1,1],[1,1]];
const modes=[[65535,65535,65535,0],[0,65535,65535,0],[2,0,65535,0],[3,65535,0,0],[65535,8,16,0],
  [257,264,272,1],[8,8,8,0],[16,16,16,0],[24,24,24,0],[6,6,6,0]];
function sandbox(width,height,rows){
  const tiles=Array.from({length:width*height},()=>({id:undefined,cache:65535,lazy:false}));
  for(const[x,y,id,cache,lazy]of rows)tiles[x*height+y]={id,cache,lazy:Boolean(lazy)};
  return{width,height,tiles,readTile:(x,y)=>tiles[x*height+y]};
}
function drawBytes(draw,error){
  const buffer=Buffer.alloc(5+(draw?68:0));buffer[0]=Number(error);buffer.writeInt32LE(draw?1:0,1);
  if(draw){buffer.writeInt32LE(keyOf(draw[0]),5);buffer.writeInt32LE(draw[1],9);
    for(let k=2;k<15;k++)buffer.writeFloatLE(draw[k],13+(k-2)*4);
    buffer.writeInt32LE(draw[15],65);for(let k=16;k<20;k++)buffer.writeUInt8(draw[k],69+k-16);}
  return buffer;
}

test('10256 cactus cases retain the original C# cold/warm draw calls, all cache bytes and edge exceptions',()=>{
  const hash=createHash('sha256');let cases=0,calls=0,failures=0,bytes=0;
  function check(rows,camera,x=3,y=3){
    const world=sandbox(7,12,rows);
    for(let repeat=0;repeat<2;repeat++){
      let draw=null,error=false;
      try{draw=cactusDraw(world,x,y,{scrollX:camera[0],scrollY:camera[1],zoom:camera[2],color:[90,140,231,255]});}
      catch(e){assert.ok(e instanceof RangeError);error=true;}
      const b=drawBytes(draw,error),cache=Buffer.alloc(world.tiles.length*3);
      world.tiles.forEach((tile,i)=>{cache.writeUInt16LE(tile.cache,i*3);cache[i*3+2]=Number(tile.lazy);});
      hash.update(b);hash.update(cache);bytes+=b.length+cache.length;calls+=Number(Boolean(draw));failures+=Number(error);
    }
    cases++;
  }
  for(let state=0;state<64;state++)for(const[center,west,east,lazy]of modes)for(const sand of [53,112,116,234])
    for(const camera of [[-2.125,-1.75,4],[-1.3,-.7,9],[-2.33,-.13,16],[-3.75,-3.1,7.125]]){
      const tiles=new Map([['3,3',[3,3,80,center,lazy]]]);
      offsets.forEach(([dx,dy],bit)=>{if(state&(1<<bit))tiles.set(`${3+dx},${3+dy}`,[3+dx,3+dy,80,dx===-1&&dy===0?west:dx===1&&dy===0?east:65535,0]);});
      for(const x of [2,3,4])tiles.set(`${x},10`,[x,10,sand,65535,0]);
      for(let dy=2;dy<2+state%4;dy++)tiles.set(`3,${3+dy}`,[3,3+dy,80,65535,0]);
      for(let dy=2;dy<2+(state+1)%4;dy++)tiles.set(`4,${3+dy}`,[4,3+dy,80,65535,0]);
      check([...tiles.values()],camera);
    }
  for(const[x,y]of [[0,0],[0,11],[6,0],[6,11]])for(const sand of [53,112,116,234])check([[x,y,80,65535,0]],[0,0,7.125],x,y);
  // Unchanged IsCactus body at TEdit 84e3fc3, including original exceptions.
  assert.equal(cases,10256);assert.equal(calls,20480);assert.equal(failures,32);assert.equal(bytes,6664224);
  assert.equal(hash.digest('hex'),'63f690ea119f098ce8ec2ca9c14ac655f59db02b42dbefd17945b784fd031cd6');
});

test('772 whole-plant cases requested backwards match 6724 original warm-pass cactus frames',()=>{
  const hash=createHash('sha256');let cases=0,tiles=0,bytes=0;
  function check(width,height,rows){
    const data=new Map(rows.map(([x,y,id])=>[`${x},${y}`,Object.freeze({blockId:id})]));
    const before=structuredClone(data),source={width,height,readTile:(x,y)=>data.get(`${x},${y}`)??{}},frameAt=createCactusFrames(source);
    const positions=rows.filter(r=>r[2]===80).map(r=>r.slice(0,2)).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
    for(const[x,y]of [...positions].reverse())frameAt(x,y);
    for(const[x,y]of positions){
      const result=frameAt(x,y),values=result?[1,keyOf(result.resource),result.frame.sourceX,result.frame.sourceY,result.frame.width,result.frame.height]:[0];
      const buffer=Buffer.alloc(values.length*4);values.forEach((v,i)=>buffer.writeInt32LE(v,i*4));hash.update(buffer);bytes+=buffer.length;tiles++;
    }
    assert.deepEqual(data,before);cases++;
  }
  for(let state=0;state<64;state++)for(const sand of [53,112,116,234])for(const distance of [4,20,100]){
    const x=5,y=9,rows=new Map([[`${x},${y}`,[x,y,80,65535,0]]]);
    offsets.forEach(([dx,dy],bit)=>{if(state&(1<<bit))rows.set(`${x+dx},${y+dy}`,[x+dx,y+dy,80,65535,0]);});
    for(let dy=2;dy<4;dy++)rows.set(`${x},${y+dy}`,[x,y+dy,80,65535,0]);
    if(state&4)for(let dy=-3;dy<1;dy++)rows.set(`${x-1},${y+dy}`,[x-1,y+dy,80,65535,0]);
    if(state&1)for(let dy=-2;dy<2;dy++)rows.set(`${x+1},${y+dy}`,[x+1,y+dy,80,65535,0]);
    for(const dx of [-1,0,1])rows.set(`${x+dx},${y+distance}`,[x+dx,y+distance,sand,65535,0]);
    check(11,112,[...rows.values()]);
  }
  for(const[x,y]of [[0,0],[0,11],[6,0],[6,11]])check(7,12,[[x,y,80,65535,0]]);
  assert.equal(cases,772);assert.equal(tiles,6724);assert.equal(bytes,161296);
  assert.equal(hash.digest('hex'),'bea9696898e56ba37c474665adaab389c5c854785713807d97cebc08f64a5dee');
});

const variants=['Good_Cactus','Evil_Cactus','Crimson_Cactus'];
test('cactus resources have exact collision-free identities and use existing selection limits',()=>{
  for(const[id,name]of variants.entries()){
    const parsed=parseTextureName(name+'.xnb');assert.equal(parsed.key,textureKey('cactus',id));assert.equal(parsed.kind,'cactus');
    assert.equal(textureName(parsed.key),name);assert.deepEqual(parseTextureName(name.toLowerCase()+'.PNG'),parsed);
    assert.notEqual(parsed.key,textureKey('tile',80));
  }
  for(const name of ['../Good_Cactus.xnb','Good_Cactus_0.png','Cactus.xnb','Armor/Evil_Cactus.xnb'])assert.equal(parseTextureName(name),null);
  assert.equal(textureKey('cactus',3),null);assert.equal(textureName(15*65536+3),null);
  assert.equal(selectTextureFiles(['Tiles_80',...variants].map(name=>({name:name+'.xnb',size:100}))).size,4);
  assert.throws(()=>selectTextureFiles([{name:'Good_Cactus.xnb',size:100},{name:'good_cactus.PNG',size:100}]),/重复/);
  assert.throws(()=>selectTextureFiles([{name:'Good_Cactus.xnb',size:4*1024*1024+1}]),/4 MiB/);
});

test('biome demand, missing files, crop order and soil edit/undo use fresh readonly plant snapshots',()=>{
  const data=new Map();
  for(const[n,sand]of [53,116,112,234].entries()){
    for(let y=10;y<=13;y++)data.set(`${5+n*8},${y}`,{blockId:80,frameX:0,frameY:0});
    data.set(`${5+n*8},14`,{blockId:sand});
  }
  const before=structuredClone(data),source={width:40,height:40,surface:20,rock:30,readTile:(x,y)=>data.get(`${x},${y}`)??{}};
  const ids=[80,...variants.map((_,i)=>textureKey('cactus',i))],atlases=Object.fromEntries(ids.map(id=>[id,{width:126,height:id===80?216:54}]));
  const region={x:3,y:9,width:30,height:7,step:1,textureIds:ids,atlases:{}};
  assert.deepEqual(new Set(rasterizeRegion(source,region).requiredTextures),new Set(ids));
  const rendered=rasterizeRegion(source,{...region,atlases}),raw=new Int32Array(rendered.sprites);
  const cactus=Array.from({length:raw.length/SPRITE_STRIDE},(_,i)=>[...raw.slice(i*SPRITE_STRIDE,(i+1)*SPRITE_STRIDE)]).filter(r=>ids.includes(r[0]));
  assert.equal(cactus.length,16);assert.deepEqual(new Set(cactus.map(c=>c[0])),new Set(ids));
  const crop=rasterizeRegion(source,{...region,x:28,y:12,width:3,height:2,atlases});
  const cropRaw=new Int32Array(crop.sprites),visible=[];
  for(let i=0;i<cropRaw.length;i+=SPRITE_STRIDE){
    const r=cropRaw.slice(i,i+SPRITE_STRIDE);
    if(r[5]<0||r[5]>=3||r[6]<0||r[6]>=2)continue;
    visible.push(r[0]);
    const original=cactus.find(q=>q[5]+region.x===r[5]+28&&q[6]+region.y===r[6]+12);
    assert.ok(original);assert.deepEqual([...r.slice(0,5)],original.slice(0,5));
  }
  assert.deepEqual([...new Set(visible)],[textureKey('cactus',2)]);
  const changed=()=>rasterizeRegion(source,{...region,atlases}).sprites;
  data.set('5,14',{blockId:116});assert.notDeepEqual(changed(),rendered.sprites);
  data.set('5,14',before.get('5,14'));assert.deepEqual(changed(),rendered.sprites);assert.deepEqual(data,before);
  const missing=rasterizeRegion(source,{...region,textureIds:[80],atlases:{80:atlases[80]}});
  assert.equal(new Int32Array(missing.sprites).filter((_,i)=>i%SPRITE_STRIDE===0).filter(id=>id===80).length,4);
  assert.deepEqual(rasterizeRegion(source,{...region,atlases,layers:{block:false}}).requiredTextures,[]);
});

test('oversized connected cactus regions fall back atomically within a bounded temporary cache',()=>{
  let reads=0;const tile=Object.freeze({blockId:80,frameX:18,frameY:36}),source={width:1_000_000,height:1_000_000,readTile(){reads++;return tile;}};
  const frameAt=createCactusFrames(source);assert.equal(frameAt(100,100),null);assert.equal(reads,MAX_CACTUS_CACHE_CELLS);
  for(let i=0;i<100;i++)assert.equal(frameAt(100+i,100),null);
  assert.equal(reads,MAX_CACTUS_CACHE_CELLS);assert.deepEqual(tile,{blockId:80,frameX:18,frameY:36});
});

test('unrelated selected item atlases do not trigger a whole-plant scan when cactus images are absent',()=>{
  let reads=0;const source={width:100,height:5000,surface:4000,rock:4500,readTile(x){reads++;return x===50?{blockId:80}:{};}};
  const result=rasterizeRegion(source,{x:50,y:2000,width:1,height:1,step:1,textureIds:[textureKey('item',1)],atlases:{}});
  assert.deepEqual(result.requiredTextures,[]);assert.equal(result.textureStats.fallback,1);
  assert.ok(reads<1000,`unselected cactus used ${reads} source reads`);
});
