import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {entityDraws,itemDrawProperties} from '../vendor/tedit-blend-rules/entityDraws.js';
import metadata from '../vendor/tedit-blend-rules/itemDraws.json' with {type:'json'};
import sizes from './data/entity-atlas-sizes.json' with {type:'json'};
import rules from '../vendor/tedit-furniture/entity-rules.json' with {type:'json'};

const atlases=Object.fromEntries(Object.entries(sizes).map(([name,[width,height]],key)=>[name.slice(0,-4),{width,height,key}]));
const entries=Object.entries(metadata).map(([id,row])=>({id:Number(id),row}));
const leashed=new Set([...rules.kites,...rules.critters]);
const keep=(name,missing)=>missing==='female'?!name.startsWith('Armor/Armor_Female_'):
  missing==='doll'?!/^Player_(10|11)_/.test(name):missing==='head'?!name.startsWith('Armor_Head_'):
  missing==='item'?!name.startsWith('Item_'):missing==='hair'?name!=='Player_Hair_16':false;
const sets=Object.fromEntries(['female','doll','head','item','hair','all'].map(m=>[m,Object.fromEntries(Object.entries(atlases).filter(([n])=>keep(n,m)))]));

test('43752 modern entity cases and 217532 draw calls match the unmodified desktop C# methods byte for byte',()=>{
  const hash=createHash('sha256');let count=0,calls=0,bytes=0;
  function check(type,item=0,items=null,misc=null,pose=0,u=0,tile=0,active=true,variant=0,missing=null){
    const [x,y,sx,sy,zoom]=[[1000,109,-995.125,-107.75,4],[22,40,-19.3,-38.7,9],
      [4001,1100,-3997.33,-1090.13,16],[0,0,-.75,.1,7.125]][variant%4];
    const entry=id=>id===null?null:{id,stack:1};
    const result=entityDraws({type,item,items:items?.map(entry),misc:misc?.map(entry),pose,x,y},
      {frameX:u,blockId:active?tile:undefined},missing?sets[missing]:atlases,{scrollX:sx,scrollY:sy,zoom});
    const buffer=Buffer.alloc(4+result.length*64);buffer.writeInt32LE(result.length,0);
    for(let j=0;j<result.length;j++){
      const draw=result[j],offset=4+j*64;
      buffer.writeInt32LE(draw[0]===null?-1:atlases[draw[0]].key,offset);buffer.writeInt32LE(draw[1],offset+4);
      for(let k=2;k<15;k++)buffer.writeFloatLE(draw[k],offset+8+(k-2)*4);
      buffer.writeInt32LE(draw[15],offset+60);
    }
    hash.update(buffer);count++;calls+=result.length;bytes+=buffer.length;
  }
  for(const [n,item]of entries.entries()){
    check(1,item.id,null,null,0,n%2?0:36,0,true,n);
    check(4,item.id,null,null,0,n%2?0:162,0,true,n+1);
  }
  for(const [n,item]of entries.entries()){
    const slots=item.row.slice(1,4);while(slots.length<3)slots.push(null);
    if(!slots.some(v=>v!==null))continue;
    for(let pose=0;pose<9;pose++)for(const u of [0,36,72,108])
      check(3,0,slots.map(v=>v===null?null:item.id),[n%2?3507:1],pose,u,0,true,n+pose+u/36);
  }
  for(const [n,item]of entries.entries())if(item.row[1]!==undefined && item.row[1]!==null || n%37===0)
    for(const u of [0,54])check(5,0,[item.id,1],null,0,u,0,true,n+u);
  for(let type=0;type<11;type++)for(const its of [null,[],[null,null,null],[0,0,0]])
    check(type,0,its,[],0,0,type===9?723:724,true,type);
  for(const [n,item]of entries.entries())if(leashed.has(item.id)||n%113===0)
    for(const [type,tile]of [[9,723],[10,724]])for(const u of [0,18,36,54,72])
      for(let variant=0;variant<4;variant++)check(type,item.id,null,null,0,u,tile,true,variant);
  for(const[type,tile]of [[9,723],[10,724]])for(const[active,actual]of [[false,tile],[true,1]])
    check(type,1,null,null,0,0,actual,active);
  for(const missing of ['female','doll','head','item','hair','all']){
    for(const pose of [0,1,2,3,4,8,255])for(const u of [0,36,72,108])
      check(3,0,[88,89,90],[3507],pose,u,0,true,pose+u/36,missing);
    for(const type of [1,4,5,9,10])check(type,1,[88,1],null,0,0,type===9?723:724,true,0,missing);
  }
  // Original DrawTileEntities and doll helpers at 84e3fc3, with the original
  // GetPlayerBody/GetPlayerHair loaders. SpriteBatch records both real overloads
  // using installed dimensions; this is a call oracle, not a GPU pixel claim.
  assert.equal(count,43752);assert.equal(calls,217532);assert.equal(bytes,14097056);
  assert.equal(hash.digest('hex'),'bdd0b0a989e4a4cc5a4dd490362264b2f2667a6f9a7e2c002cc408076091c587');
});

const view={scrollX:-19.3,scrollY:-38.7,zoom:9};
const entity={type:3,x:22,y:40,pose:0,items:[null,null,null],misc:[]};

test('doll wood, hair index, body fallback, pose and depth remain explicit without changing the input',()=>{
  const before=structuredClone(entity),tile={frameX:72};
  const calls=entityDraws(entity,tile,atlases,view);
  assert.equal(calls.length,7);assert.deepEqual(entity,before);
  assert.ok(calls.some(c=>c[0]==='Player_Hair_16'));
  assert.ok(!calls.some(c=>c[0]==='Player_Hair_15'));
  assert.ok(calls.every((c,i)=>i===0 || calls[i-1][14]>c[14]));
  assert.deepEqual(entityDraws({...entity,items:[]},tile,atlases,view),[]);
  const sitting=entityDraws({...entity,pose:1},tile,atlases,view);
  assert.equal(sitting.length,6);assert.ok(!sitting.some(c=>c[0]?.endsWith('_10')));
  const fallback=entityDraws(entity,tile,sets.doll,view);
  assert.ok(fallback.some(c=>c[0]?.startsWith('Player_0_')));
  assert.deepEqual(entityDraws(entity,tile,sets.all,view),[]);
});

test('item origins preserve half pixels and original scale; missing aliases use the original transparent default',()=>{
  const resource={Item_1:{width:31,height:17}};
  const frame=entityDraws({type:1,item:1,x:22,y:40},{frameX:0},resource,view)[0];
  const hat=entityDraws({type:5,item:0,x:22,y:40,items:[{id:1,stack:1}]},{frameX:0},resource,view)[0];
  assert.deepEqual(frame.slice(10,12),[15,8]);assert.deepEqual(hat.slice(10,12),[15.5,8.5]);
  assert.equal(frame[15],1);assert.equal(frame[12],Math.fround(Math.fround(itemDrawProperties(1).scale*9)/16));
  // The original GetItem(3665) does not redirect to its textureId=48 alias.
  const missing=entityDraws({type:1,item:3665,x:22,y:40},{frameX:36},{Item_48:{width:30,height:30}},view)[0];
  assert.equal(missing[0],null);assert.deepEqual(missing.slice(4,6),[1,1]);
  assert.deepEqual(entityDraws({type:5,x:22,y:40,items:[{id:1,stack:0}]},{frameX:0},resource,view),[]);
  assert.deepEqual(entityDraws({type:9,item:1,x:22,y:40},{blockId:1},resource,view),[]);
});
