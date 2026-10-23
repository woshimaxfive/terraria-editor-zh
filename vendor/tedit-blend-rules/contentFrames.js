// SPDX-License-Identifier: MS-PL
// TEdit contributors. Relic and magic-dropper resource selection and source UVs
// adapted from WorldRenderXna; generic geometry remains in framedRules.js.
import {renderUV,storedFrameAt} from './framedRules.js';

const gore=new Map([[373,706],[374,716],[375,717],[461,943],[709,1383]]);
export const contentFrameIds=Object.freeze([617,...gore.keys()]);

export function contentFrameAt(tile,x,atlases) {
  const type=tile.blockId;
  if(type!==617 && !gore.has(type))return null;
  let [u,v]=renderUV(type,tile.frameX??0,tile.frameY??0),resource=`Tiles_${type}`;
  if(type===617){
    if(v%72===54)u%=54;
    else{resource='Extra_198';v=Math.trunc(v%72/18)*16+Math.trunc(u/54)*50;u=Math.trunc(u%54/18)*16;}
  }else{resource=`Gore_${gore.get(type)}`;v=80;}
  const atlas=atlases[resource];
  return {resource,frame:atlas?storedFrameAt(tile,x,atlas,[u,v]):null};
}

export function contentBaseFrame(tile,x,atlases){
  const special=contentFrameAt(tile,x,atlases);
  if(special)return special;
  const resource=`Tiles_${tile.blockId}`,atlas=atlases[resource];
  const frame=atlas?storedFrameAt(tile,x,atlas):null;
  if(frame && tile.blockId===723)frame.shiftY+=(tile.frameX??0)===0?2:(tile.frameX??0)===18?-2:0;
  if(frame && tile.blockId===724)frame.shiftX+=(tile.frameY??0)===0?2:(tile.frameY??0)===18?-2:0;
  return {resource,frame};
}
