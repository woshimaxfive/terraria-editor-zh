import {entityDraws} from '../../vendor/tedit-blend-rules/entityDraws.js';
import itemMetadata from '../../vendor/tedit-blend-rules/itemDraws.json' with {type:'json'};
import {tileContentDraws} from '../../vendor/tedit-blend-rules/tileContentDraws.js';
import {contentBaseFrame} from '../../vendor/tedit-blend-rules/contentFrames.js';
import {parseTextureName,textureName} from './textureKeys.js';
import {createCactusFrames} from './cactusFrames.js';

// Only entity anchors use this large coarse bound, never a rectangular tile
// scan. The limit follows the existing 4096px image limit and pinned scales.
export const CONTENT_ENTITY_PADDING=Math.ceil(4096*Math.max(1,...Object.values(itemMetadata).map(r=>r[0]))/16)+3;
export const CONTENT_TILE_PADDING=9;
const unitView={scrollX:0,scrollY:0,zoom:16};
const keyOf=name=>parseTextureName(name+'.xnb')?.key;
const tileDTO=tile=>({blockId:tile.blockId,frameX:tile.frameX??0,frameY:tile.frameY??0});

export {contentBaseFrame};

export function createContentScene(source,region,selected,required){
  const named=Object.fromEntries(Object.entries(region.atlases).map(([id,atlas])=>[textureName(Number(id)),atlas]));
  const candidates=new Set([...selected].map(textureName));
  const cactusSelected=['Tiles_80','Good_Cactus','Evil_Cactus','Crimson_Cactus'].some(name=>candidates.has(name)||named[name]);
  const placeholder={width:4096,height:4096};
  let requested=new Set();
  const probe=new Proxy(named,{get(target,name){
    if(typeof name!=='string')return undefined;
    if(candidates.has(name)){requested.add(keyOf(name));return target[name]??placeholder;}
    return target[name];
  }});
  const tiles=[],entities=[],seen=new Map(),cactusFrame=createCactusFrames(source);
  const read=(x,y)=>x>=0&&y>=0&&x<source.width&&y<source.height?source.readTile(x,y):{};
  const flush=()=>{for(const key of requested)required.set(key,(required.get(key)||0)+1);requested=new Set();};
  function inspect(x,y,tile){
    const identity=`${x},${y}`;if(seen.has(identity))return seen.get(identity);
    const entity=source.content?.at(x,y)??null,props=tileDTO(tile);
    // Requests are discovered using selected-file presence, so a deferred
    // female/body texture is not mistaken for an absent one during fallback.
    const tested=tileContentDraws(props,x,y,entity,probe,unitView,read,source);
    let frame=null,resource=null,recipe=null;
    if(props.blockId===80){
      const base=cactusSelected?cactusFrame(x,y):null,name=base?.resource??'Tiles_80';resource=keyOf(name);
      if(candidates.has(name))requested.add(resource);
      frame=base?.frame??null;
    }else if(tested===null){
      const base=contentBaseFrame(props,x,probe);resource=keyOf(base.resource);
      if(candidates.has(base.resource))requested.add(resource);
      frame=contentBaseFrame(props,x,named).frame;
    }else{
      const ox=Math.trunc(props.frameX/18),oy=Math.trunc(props.frameY/18);
      const anchor=tile.blockId===698?{x,y:y-oy}: {x:x-ox,y:y-oy};
      recipe={x,y,tile:props,entity,rightU:read(x+1,y).frameX??0,
        anchor:{...anchor,tile:tileDTO(read(anchor.x,anchor.y))}};
      tiles.push(recipe);
    }
    flush();
    const baseName=tile.blockId===171?'Xmas_0':`Tiles_${tile.blockId}`,atlas=named[baseName];
    const live=recipe?tileContentDraws(props,x,y,entity,named,unitView,read,source):null;
    const basePaint=atlas && live?.some(c=>c[0]===baseName && c[4]>0 && c[5]>0 &&
      c[4]<=4096&&c[5]<=4096&&c[4]*c[5]*4<=8*1024*1024 && (c[1]===1 || c[8]>0&&c[9]>0));
    const validFrame=frame && frame.sourceX>=0&&frame.sourceY>=0&&frame.sourceX+frame.width<=named[textureName(resource)]?.width&&
      frame.sourceY+frame.height<=named[textureName(resource)]?.height;
    // Empty draws are intentional in the desktop branches: non-anchor cells
    // of whole sprites, Christmas tree cells, and platters without an entity.
    // Once their base resource is available, preserve that transparent result
    // instead of leaving a palette-colored rectangle underneath the sprite.
    const silent=atlas && live?.every(c=>c[4]<=0||c[5]<=0||c[1]===0&&(c[8]<=0||c[9]<=0));
    const result={resource,frame,recipe,covered:tested===null?Boolean(validFrame):Boolean(basePaint||silent)};
    seen.set(identity,result);return result;
  }
  for(const entity of source.content?.within(region,CONTENT_ENTITY_PADDING)??[]){
    const tile=read(entity.x,entity.y);
    const entityCalls=entityDraws(entity,tile,probe,unitView);flush();
    if(entityCalls.some(call=>call[0]!==null))entities.push({entity,tile:tileDTO(tile)});
    if(entity.type===6 && tile.blockId===520)inspect(entity.x,entity.y,tile);
  }
  return {inspect,finish:()=>tiles.length||entities.length?{tiles,entities,width:source.width,height:source.height}:null};
}

export function contentRecipeDraws(recipe,atlases,view,bounds){
  const read=(x,y)=>x===recipe.x+1&&y===recipe.y?{frameX:recipe.rightU}:
    x===recipe.anchor.x&&y===recipe.anchor.y?recipe.anchor.tile:{};
  return tileContentDraws(recipe.tile,recipe.x,recipe.y,recipe.entity,atlases,view,read,bounds)??[];
}
