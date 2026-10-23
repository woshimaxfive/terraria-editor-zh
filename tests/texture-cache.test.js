import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TextureResources} from '../src/platform/files/TextureResources.js';
import {SUPPORTED_TEXTURE_IDS} from '../src/rendering/desktopTerrain.js';
import {MAX_TEXTURE_TOTAL_BYTES,validateTextureSize} from '../src/platform/files/textureFiles.js';
import {rasterizeRegion} from '../src/rendering/worldRaster.js';

function harness(dimensions=()=>[1024,1024]){
 const decoded=[],closed=[],workers=[];
 const resources=new TextureResources(()=>{
  const worker={terminate(){this.terminated=true;},postMessage({file}){
   const id=Number(/Tiles_(\d+)/.exec(file.name)[1]);decoded.push(id);
   queueMicrotask(()=>{const [width,height]=dimensions(id);this.onmessage({data:{bitmap:{width,height,close(){closed.push(id);}}}});});
  }};workers.push(worker);return worker;
 });
 return{resources,decoded,closed,workers};
}
const files=ids=>ids.map(id=>({name:'Tiles_'+id+'.xnb',size:100}));
const deferred={defer:true};

test('registering every supported local file decodes nothing until the visible IDs are requested',async()=>{
 const {resources,decoded,closed}=harness();
 const result=await resources.load(files(SUPPORTED_TEXTURE_IDS),()=>{},deferred);
 assert.equal(result.selected,342);assert.equal(result.loaded,0);assert.deepEqual(decoded,[]);
 await resources.ensure([57,161,57,9999]);
 assert.deepEqual(decoded,[57,161]);assert.deepEqual([...resources.images.keys()],[57,161]);
 assert.equal(resources.bytes,8*1024*1024);assert.equal(resources.files.size,342);
 resources.clear();assert.deepEqual(closed,[57,161]);assert.equal(resources.files.size,0);assert.equal(resources.bytes,0);
});

test('visible priorities pin accepted images while unused cache entries are evicted and can reload',async()=>{
 const {resources,decoded,closed}=harness();
 await resources.load(files([0,1,2,3]),()=>{},deferred);await resources.ensure([0,1,2]);
 assert.equal(resources.bytes,MAX_TEXTURE_TOTAL_BYTES);
 await resources.ensure([0,3]);assert.deepEqual([...resources.images.keys()],[2,0,3]);assert.deepEqual(closed,[1]);
 const result=await resources.ensure([0,3,2,1]);
 assert.equal(result.failures.length,1);assert.match(result.failures[0],/12 MiB/);
 assert.deepEqual([...resources.images.keys()],[0,3,2]);assert.equal(resources.bytes,MAX_TEXTURE_TOTAL_BYTES);
 const count=decoded.length;await resources.ensure([0,3,2,1]);assert.equal(decoded.length,count,'Known oversized visible set does not repeatedly decode the omitted image');
 await resources.ensure([1]);assert.equal(decoded.at(-1),1);assert.ok(resources.bytes<=MAX_TEXTURE_TOTAL_BYTES);
 assert.equal(resources.files.size,4);resources.clear();
});

test('the measured 1152 by 1080 atlas fits the new per-image limit but over-limit images are released',async()=>{
 assert.doesNotThrow(()=>validateTextureSize(1152,1080));
 const {resources,closed}=harness(id=>id===719?[1152,1080]:[2048,2048]);
 await resources.load(files([719,57]),()=>{},deferred);
 const result=await resources.ensure([719,57]);
 assert.deepEqual([...resources.images.keys()],[719]);assert.equal(resources.bytes,1152*1080*4);
 assert.equal(result.failures.length,1);assert.deepEqual(closed,[57]);resources.clear();assert.deepEqual(closed,[57,719]);
});

test('bad input does not clear existing resources and failed decodes wait for a new file selection before retrying',async()=>{
 const {resources,decoded}=harness();
 await resources.load(files([0]),()=>{},deferred);await resources.ensure([0]);
 await assert.rejects(resources.load([...files([1]),{name:'Tiles_1.png',size:100}],()=>{},deferred),/重复/);
 assert.deepEqual([...resources.images.keys()],[0]);assert.equal(resources.files.size,1);
 resources.decode=async()=>{decoded.push('bad');throw new Error('broken');};
 await resources.load(files([57]),()=>{},deferred);
 assert.match((await resources.ensure([57])).failures[0],/broken/);
 await resources.ensure([57]);assert.equal(decoded.filter(id=>id==='bad').length,1);
 await resources.load(files([57]),()=>{},deferred);await resources.ensure([57]);
 assert.equal(decoded.filter(id=>id==='bad').length,2);resources.clear();
});

test('a superseded view or file selection cannot install a late bitmap and cancellation keeps already cached resources',async()=>{
 const workers=[],closed=[];
 const resources=new TextureResources(()=>{
  const worker={postMessage(){},terminate(){this.terminated=true;}};workers.push(worker);return worker;
 });
 const bitmap=id=>({width:256,height:256,close(){closed.push(id);}});
 await resources.load(files([0,1]),()=>{},deferred);
 const first=resources.ensure([0]);const rejected=assert.rejects(first,{name:'AbortError'});
 const second=resources.ensure([1]);await rejected;assert.equal(workers[0].terminated,true);
 workers[0].onmessage({data:{bitmap:bitmap(0)}});assert.deepEqual(closed,[0]);
 workers[1].onmessage({data:{bitmap:bitmap(1)}});await second;
 resources.cancel();assert.deepEqual([...resources.images.keys()],[1]);assert.equal(resources.files.size,2);
 const old=resources.ensure([0]);const rejectedOld=assert.rejects(old,{name:'AbortError'});
 await resources.load(files([57]),()=>{},deferred);await rejectedOld;
 workers[2].onmessage({data:{bitmap:bitmap(2)}});assert.deepEqual(closed,[0,1,2]);
 assert.equal(resources.images.size,0);assert.deepEqual(resources.selectedIds,[57]);resources.clear();
});

test('visible texture requests are frequency ordered, exclude unsupported shapes and do not allocate overview images',()=>{
 const values=[{blockId:57},{blockId:161},{blockId:57},{blockId:1},{blockId:161},{blockId:57},{blockId:0,slope:1},{blockId:2,blockColor:1},{blockId:88}];
 const source={width:9,height:1,surface:1,rock:1,readTile:x=>values[x]};
 const region={x:0,y:0,width:9,height:1,step:1,atlases:{},textureIds:[0,1,2,57,161,88]};
 const image=rasterizeRegion(source,region);assert.deepEqual(image.requiredTextures,[57,161,1]);
 assert.deepEqual(image.buffer,rasterizeRegion(source,{x:0,y:0,width:9,height:1,step:1}).buffer);
 assert.deepEqual(rasterizeRegion(source,{...region,layers:{block:false}}).requiredTextures,[]);
 assert.deepEqual(rasterizeRegion(source,{...region,step:2}).requiredTextures,[]);
});
