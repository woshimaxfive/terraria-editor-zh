import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {tileContentDraws} from '../vendor/tedit-blend-rules/tileContentDraws.js';
import {contentFrameAt} from '../vendor/tedit-blend-rules/contentFrames.js';
import {frameGeometryAtZoom} from '../vendor/tedit-blend-rules/framedRules.js';
import metadata from '../vendor/tedit-blend-rules/itemDraws.json' with {type:'json'};
import baseSizes from './data/entity-atlas-sizes.json' with {type:'json'};
import tileSizes from './data/content-atlas-sizes.json' with {type:'json'};

const entries=Object.entries(metadata).map(([id,row])=>({id:Number(id),row}));
const tileIds=new Set([128,269,334,395,520,698,751,752,171]);
const combined={...baseSizes,...Object.fromEntries(Object.entries(tileSizes).filter(([name])=>tileIds.has(Number(name.slice(6,-4)))))};
const atlases=Object.fromEntries(Object.keys(combined).sort().map((name,key)=>[name.slice(0,-4),{width:combined[name][0],height:combined[name][1],key}]));

test('49524 dedicated tile cases retain all 148378 original C# draw calls, colors, origins and layers',()=>{
  const hash=createHash('sha256');let count=0,calls=0,bytes=0;
  function check(type,u,v,id=0,entity=true,anchor=false,nextU=0,variant=0){
    const[x,y,sx,sy,zoom]=[[1000,109,-995.125,-107.75,4],[22,40,-19.3,-38.7,9],
      [4001,1100,-3997.33,-1090.13,16],[0,0,-.75,.1,7.125]][variant%4];
    const color=[[255,255,255,255],[90,140,231,255],[255,64,0,127],[0,200,90,64]][variant%4];
    const tile={blockId:type,frameX:u,frameY:v},values=new Map([[`${x},${y}`,tile],[`${x+1},${y}`,{frameX:nextU}]]);
    if(anchor)values.set(`${x-Math.trunc(u/18)},${y-Math.trunc(v/18)}`,{blockId:type,frameX:0,frameY:0});
    const result=tileContentDraws(tile,x,y,entity?{item:id}:null,atlases,
      {scrollX:sx,scrollY:sy,zoom,color},(tx,ty)=>values.get(`${tx},${ty}`)??{});
    const buffer=Buffer.alloc(4+result.length*68);buffer.writeInt32LE(result.length,0);
    for(let j=0;j<result.length;j++){
      const draw=result[j],offset=4+j*68;
      buffer.writeInt32LE(draw[0]===null?-1:atlases[draw[0]].key,offset);buffer.writeInt32LE(draw[1],offset+4);
      for(let k=2;k<15;k++)buffer.writeFloatLE(draw[k],offset+8+(k-2)*4);
      buffer.writeInt32LE(draw[15],offset+60);for(let k=16;k<20;k++)buffer.writeUInt8(draw[k],offset+64+k-16);
    }
    hash.update(buffer);count++;calls+=result.length;bytes+=buffer.length;
  }
  for(const[n,item]of entries.entries()){
    for(const[type,u,v]of [[395,0,0],[698,0,0],[698,18,0],[698,36,0],[520,0,0],[520,18,0]])
      check(type,u,v,item.id,true,false,0,n);
    if(item.id<=4899)for(const flip of [1,2])check(334,item.id+100+flip*5000,0,item.id,true,false,5000,n+flip);
    for(const[slot,row]of [[1,0],[2,1],[3,2]])if(item.row[slot]!==null && item.row[slot]!==undefined && item.row[slot]*100+36<=32767)
      for(const type of [128,269])for(const side of [0,36])check(type,item.row[slot]*100+side,row*18,0,true,false,0,n+side);
  }
  for(const type of [698,751,752])for(const[u,v]of [[0,0],[0,18],[18,0],[18,18]])
    for(const anchor of [false,true])for(let variant=0;variant<4;variant++)check(type,u,v,2019,true,anchor,0,variant);
  for(const v of [0,1,7,8,15,63,64,127,1023,1024,2048,32767,-1])
    for(let variant=0;variant<4;variant++)check(171,10,v,0,true,false,0,variant);
  for(const[type,u,v]of [[395,36,0],[520,0,0],[698,0,0],[334,5101,0]])
    for(const entity of [false,true])check(type,u,v,0,entity);
  // Actual original branch bodies and original final Draw at 84e3fc3. The
  // original Frame/GetRarityColor and MonoGame 3.8.5.1 color operators execute
  // in C#. Colors here are inputs, not a claim of full world paint rendering.
  assert.equal(count,49524);assert.equal(calls,148378);assert.equal(bytes,10287800);
  assert.equal(hash.digest('hex'),'c9ba2be0771c05573995e08c7bc3b132fc0c448a52ef8a4172e76a2ac041f1f8');
});

test('2448 relic and dropper frames match original source/resource selection and clipped geometry',()=>{
  const extra=Object.fromEntries(Object.entries(baseSizes).filter(([name])=>name==='Extra_198.xnb'||name.startsWith('Gore_')));
  const tiles=Object.fromEntries(Object.entries(tileSizes).filter(([name])=>[617,373,374,375,461,709].includes(Number(name.slice(6,-4)))));
  const sizes={...extra,...tiles},resources=Object.fromEntries(Object.keys(sizes).sort().map((name,key)=>[name.slice(0,-4),{width:sizes[name][0],height:sizes[name][1],key}]));
  const values=[];let count=0;
  for(const id of [617,373,374,375,461,709]){
    const us=id===617?[...Array.from({length:84},(_,i)=>i*18),-1,-18,32767]:[0,18,36,54,-1,32767];
    for(const u of us)for(const v of id===617?[0,18,36,54,72,90,-1,32767]:[0,18,-1,32767])
      for(const[x,z]of [[100,4],[101,9],[100,16]]){
        const result=contentFrameAt({blockId:id,frameX:u,frameY:v},x,resources);
        values.push(result?.frame?1:0,...(result?.frame?[resources[result.resource].key,...frameGeometryAtZoom(result.frame,z)]:[]));count++;
      }
  }
  const bytes=Buffer.alloc(values.length*4);values.forEach((v,i)=>bytes.writeInt32LE(v,i*4));
  assert.equal(count,2448);assert.equal(bytes.length,97272);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'e5db1e7ef7dac991dd138266a007f8c27beb0e641218a7661c3cda8584ada7d1');
});

test('jar content is layered, missing anchors are explicit, and tile calls never mutate world data',()=>{
  const view={scrollX:-19.3,scrollY:-38.7,zoom:9},tile={blockId:698,frameX:18,frameY:0},entity={item:1};
  const before=structuredClone({tile,entity});
  const full=tileContentDraws(tile,22,40,entity,atlases,view);
  assert.equal(full.length,4);assert.deepEqual(full.map(d=>d[3]),[0,92,0,46]);
  assert.deepEqual(full[1].slice(16),[37,37,63,63]);assert.equal(full[3][19],127);
  assert.deepEqual({tile,entity},before);
  const empty=tileContentDraws(tile,22,40,{item:0},atlases,view);
  assert.equal(empty.length,2);assert.deepEqual(empty[1].slice(16),[150,150,255,127]);
  const bottom={...tile,frameY:18};
  assert.deepEqual(tileContentDraws(bottom,22,41,entity,atlases,view,()=>tile),[]);
  const orphan=tileContentDraws(bottom,22,41,entity,atlases,view);
  assert.equal(orphan.length,1);assert.deepEqual(orphan[0].slice(2,6),[48,16,16,16]);
  assert.equal(tileContentDraws({blockId:1},22,40,null,atlases,view),null);
});
