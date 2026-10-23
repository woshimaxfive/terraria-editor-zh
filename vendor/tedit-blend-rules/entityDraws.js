// SPDX-License-Identifier: MS-PL
// Adapted from TEdit DrawTileEntities, doll helpers and Textures player loaders.
// TEdit contributors; fixed source and license are recorded in source.json.
// This module produces read-only draw calls, before camera-independent transport.
// Calls retain the desktop overload (rectangle/vector), float32 arithmetic,
// origin, scale and depth; the consumer must not round them into tile integers.
import items from './itemDraws.json' with { type: 'json' };

const f = Math.fround, t = Math.trunc;
const add = (a,b) => f(f(a)+f(b)), mul = (a,b) => f(f(a)*f(b)), div = (a,b) => f(f(a)/f(b));
const track = f(1-f(.05)), bodyDepth = f(1-f(.048));
const empty = Object.freeze({name:null,width:1,height:1});

export function itemDrawProperties(id) {
  const row = items[id];
  return row ? {scale:f(row[0]),head:row[1],body:row[2],legs:row[3],food:Boolean(row[4]),rarity:row[5]??'Blue'} : {scale:1,rarity:'Blue'};
}

// source: {name, width, height}; unavailable resources resolve to the original
// transparent 1x1 default. No item.textureId alias is applied by GetItem.
export function entityDraws(entity, tile, atlases, view) {
  const calls = [], sx=f(view.scrollX), sy=f(view.scrollY), z=f(view.zoom);
  const x=entity.x,y=entity.y,u=tile.frameX ?? 0, pose=entity.pose ?? 0;
  const tex = name => {
    const size = atlases[name];
    return size ? {name,width:size.width,height:size.height} : empty;
  };
  const item = id => tex(`Item_${id}`);
  const point = (scroll,position,offset=0) => 1+t(mul(add(add(scroll,position),offset),z));
  const scaled = value => div(mul(value,z),16);
  const rect = (image,source,dest,flip,depth=track) => calls.push([image.name,0,...source,...dest,0,0,1,0,depth,Number(flip)]);
  const vector = (image,px,py,ox,oy,scale,flip,depth=track) =>
    calls.push([image.name,1,0,0,image.width,image.height,px,py,0,0,ox,oy,scaled(scale),0,depth,Number(flip)]);
  const fitted = (image,scale,cap) => {
    const max = mul(Math.max(image.width,image.height),scale);
    return max > cap ? mul(scale,div(cap,max)) : scale;
  };
  const occupied = entry => entry && entry.id > 0 && entry.stack > 0;
  const player = (variant,part) => {
    let image=tex(`Player_${variant}_${part}`);
    if(image.name)return image;
    const fallback=[1,2,3,8].includes(variant)?0:[5,6,7,9].includes(variant)?4:
      variant===4?0:variant===11?10:variant===10?0:-1;
    if(fallback<0)return empty;
    image=tex(`Player_${fallback}_${part}`);
    return image.name ? image : [4,10].includes(fallback) ? tex(`Player_0_${part}`) : empty;
  };
  if (entity.type===1 && entity.item !== 0) {
    const image=item(entity.item);
    vector(image,point(sx,x,1),point(sy,y,1),t(image.width/2),t(image.height/2),itemDrawProperties(entity.item).scale,u===0);
  } else if (entity.type===4 && entity.item !== 0) {
    const image=item(entity.item);
    let scale=1;
    if(image.width>40 || image.height>40)scale=div(40,Math.max(image.width,image.height));
    scale=mul(scale,itemDrawProperties(entity.item).scale);
    // Literal 1.5 and .5 promote the scroll expression to C# double here.
    vector(image,1+t((add(sx,x)+1.5)*z),1+t((add(sy,y+1)+.5)*z),
      t(image.width/2),t(image.height/2),scale,t(u/54)>=3);
  } else if (entity.type===3 && entity.items?.length) {
    const female=t(u/72)===1, right=u%72===36, flip=!right;
    const bodyY=pose===2?280:pose===3?504:0, legY=bodyY, offset=pose===1?10:0;
    let order=0;
    const skin = (image,frameX,frameY) => {
      const w=Math.min(image.width-frameX,40),h=Math.min(image.height-frameY,56);
      const depth=f(bodyDepth-mul(order++,.00001));
      if(!image.name || w<=0 || h<=0)return;
      rect(image,[frameX,frameY,w,h],[point(sx,x)-t(scaled(4)),point(sy,y)-t(scaled(12))+t(scaled(offset)),t(scaled(w)),t(scaled(h))],flip,depth);
    };
    const variant=female?11:10;
    skin(player(variant,7),0,bodyY);
    if(pose!==1)skin(player(variant,10),0,legY);
    skin(player(variant,3),0,female?112:0);
    skin(player(variant,5),0,female?112:0);
    skin(player(variant,0),0,bodyY);
    skin(tex('Player_Hair_16'),0,bodyY);
    skin(player(variant,9),0,bodyY);
    const poseOff=scaled(offset);
    for(let slot=0;slot<3;slot++) {
      const entry=entity.items[slot];
      if(!occupied(entry) || slot===2 && pose===1)continue;
      const props=itemDrawProperties(entry.id),id=[props.head,props.body,props.legs][slot];
      if(id===undefined || id===null)continue;
      let image;
      if(slot===1){image=female?tex(`Armor/Armor_Female_${id}`):empty;if(!image.name)image=tex(`Armor/Armor_${id}`);}
      else image=tex(`${slot===0?'Armor_Head':'Armor_Legs'}_${id}`);
      const source=[2,slot===2?legY+42:bodyY,36,slot===0?36:slot===1?54:12];
      if(!image.name || source[1]+source[3]>image.height)continue;
      let dy=point(sy,y+slot);
      if(slot!==2)dy+=t(add(scaled((16-source[3]-(slot===0?4:18))/2),poseOff));
      else dy-=t(f(scaled(2)-poseOff));
      rect(image,source,[point(sx,x)-t(scaled(2)),dy,t(scaled(source[2])),t(scaled(source[3]))],flip);
    }
    const weapon=entity.misc?.[0];
    if(occupied(weapon)) {
      const image=item(weapon.id),scale=fitted(image,itemDrawProperties(weapon.id).scale,32);
      const weaponX=f(x+(right?1.5:.5));
      let weaponY=f(y+1.5);
      if(pose===1)weaponY=add(weaponY,div(14,16));
      else if(pose>=4 && pose<=8)weaponY=f(weaponY-f(.25));
      vector(image,point(sx,weaponX),point(sy,weaponY),div(image.width,2),div(image.height,2),scale,flip);
    }
  } else if(entity.type===5 && entity.items?.length) {
    const flip=u>=54;
    for(let i=0;i<2 && i<entity.items.length;i++) {
      const entry=entity.items[i];if(!occupied(entry))continue;
      const props=itemDrawProperties(entry.id),px=point(sx,x,i===0?(flip?.75:1.75):1.25),py=point(sy,y,i===0?.75:2.25);
      if(props.head!==null && props.head!==undefined) {
        const image=tex(`Armor_Head_${props.head}`);
        if(image.name)rect(image,[2,0,36,36],[px-t(scaled(18)),py+t(scaled(-12)),t(scaled(36)),t(scaled(36))],flip);
      } else {
        const image=item(entry.id),scale=fitted(image,props.scale,24);
        vector(image,px,py,div(image.width,2),div(image.height,2),scale,flip);
      }
    }
  } else if((entity.type===9 || entity.type===10) && entity.item>0 &&
      tile.blockId===(entity.type===9?723:724)) {
    const image=item(entity.item);if(!image.name)return calls;
    const props=itemDrawProperties(entity.item),scale=props.scale>0?props.scale:1;
    const sourceHeight=image.height>image.width*3?image.width:image.height;
    const w=t(mul(image.width,scaled(scale))),h=t(mul(sourceHeight,scaled(scale)));
    const orientation=t(u/18),offsetX=orientation===2?-2:orientation===3?2:0,
      offsetY=orientation===0?2:orientation===1?-2:0;
    const dx=mul(add(add(sx,x),.5),z),dy=mul(add(add(sy,y),entity.type===9?-.5:.5),z);
    const px=t(entity.type===9?dx:add(dx,scaled(offsetX))),py=t(entity.type===9?dy:add(dy,scaled(offsetY)));
    rect(image,[0,0,image.width,sourceHeight],[1+px-t(w/2),1+py-t(h/2),w,h],false);
  }
  return calls;
}
