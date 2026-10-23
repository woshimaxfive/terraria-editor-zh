// SPDX-License-Identifier: MS-PL
// Temporary-cache adaptation of TEdit cactus rendering. TEdit contributors;
// fixed source and full license: vendor/tedit-blend-rules/source.json, LICENSE.
import {cactusDraw} from '../../vendor/tedit-blend-rules/cactusRules.js';

// A complete connected plant receives the original row/column cold pass, then
// the warm pass selects its computed biome atlas. This removes view-history
// dependence without storing render caches in the world. Neighbors and the
// original downward sand search share a bounded snapshot of temporary records.
export const MAX_CACTUS_CACHE_CELLS=65_536;
const offsets=[[1,0],[0,-1],[-1,0],[0,1],[1,-1],[-1,-1],[-1,1],[1,1]];
const unitView={scrollX:0,scrollY:0,zoom:16};

export function createCactusFrames(source){
  const cache=new Map(),frames=new Map();let exhausted=false;
  const key=(x,y)=>x*source.height+y;
  const inside=(x,y)=>x>=0&&y>=0&&x<source.width&&y<source.height;
  const readTile=(x,y)=>{
    const id=key(x,y);if(cache.has(id))return cache.get(id);
    if(cache.size>=MAX_CACTUS_CACHE_CELLS){exhausted=true;throw new RangeError('Cactus cache budget');}
    const tile=source.readTile(x,y),record={id:tile.blockId,cache:65535,lazy:false};
    cache.set(id,record);return record;
  };
  const world={width:source.width,height:source.height,readTile};
  return(x,y)=>{
    const id=key(x,y);if(frames.has(id))return frames.get(id);
    if(exhausted||!inside(x,y))return null;
    const members=new Set([id]),queue=[[x,y]];
    try{
      if(readTile(x,y).id!==80)return null;
      for(let i=0;i<queue.length;i++){
        const[tx,ty]=queue[i];
        for(const[dx,dy]of offsets){
          const nx=tx+dx,ny=ty+dy,nid=key(nx,ny);
          if(!inside(nx,ny)||members.has(nid)||readTile(nx,ny).id!==80)continue;
          members.add(nid);queue.push([nx,ny]);
        }
      }
      queue.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
      for(const[tx,ty]of queue){
        try{cactusDraw(world,tx,ty,unitView);}
        catch(error){if(exhausted||!(error instanceof RangeError))throw error;}
      }
      for(const[tx,ty]of queue){
        let result=null;
        try{
          const call=cactusDraw(world,tx,ty,unitView);
          result={resource:call[0],frame:{sourceX:call[2],sourceY:call[3],width:call[4],height:call[5],
            destWidth:16,destHeight:16,offsetY:0}};
        }catch(error){if(exhausted||!(error instanceof RangeError))throw error;}
        frames.set(key(tx,ty),result);
      }
    }catch(error){
      if(!(error instanceof RangeError))throw error;
      for(const member of members)frames.set(member,null);
    }
    return frames.get(id)??null;
  };
}
