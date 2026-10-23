// SPDX-License-Identifier: MS-PL
// Adapted from TEdit WorldRenderXna dedicated framed-tile branches and
// GetRarityColor. TEdit contributors; source pin and license: source.json.
// Original call order is retained, including the separate ItemFrame tile
// and entity passes. The returned records are read-only, before transport.
import {itemDrawProperties} from './entityDraws.js';
import rarityColors from './rarityColors.json' with {type:'json'};

const f=Math.fround,t=Math.trunc;
const add=(a,b)=>f(f(a)+f(b)),mul=(a,b)=>f(f(a)*f(b)),div=(a,b)=>f(f(a)/f(b));
const depth=f(1-f(.04)),track=f(1-f(.05));
const empty=Object.freeze({name:null,width:1,height:1});
const supported=new Set([128,269,334,395,520,698,751,752,171,314]);
export const contentTileIds=Object.freeze([...supported]);

const trackFrames=[
  [0,0],[1,0],[2,1],[3,1],[0,2],[1,2],[0,1],[1,1],[0,3],[1,3],
  [4,1],[5,1],[6,1],[7,1],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],
  [0,4],[1,4],[0,5],[1,5],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],
  [2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[0,6],[1,6],[0,7],[1,7]
];

export function tileContentDraws(tile,x,y,entity,atlases,view,readTile=()=>({}),bounds={width:10000,height:10000}) {
  const type=tile.blockId,u=tile.frameX??0,v=tile.frameY??0;
  if(!supported.has(type))return null;
  const z=f(view.zoom),sx=f(view.scrollX),sy=f(view.scrollY),calls=[];
  const color=view.color??[255,255,255,255],tex=name=>atlases[name]?{...atlases[name],name}:empty;
  const item=id=>tex(`Item_${id}`),base=tex(`Tiles_${type}`);
  const scaled=value=>div(mul(value,z),16);
  const point=(scroll,position,offset=0)=>1+t(mul(add(add(scroll,position),offset),z));
  const rect=(image,source,dest,rgba=color,layer=depth,flip=false)=>
    calls.push([image.name,0,...source,...dest,0,0,1,0,layer,Number(flip),...rgba]);
  const vector=(image,source,px,py,ox,oy,scale,rgba=color,layer=track,flip=false)=>
    calls.push([image.name,1,...source,px,py,0,0,ox,oy,scaled(scale),0,layer,Number(flip),...rgba]);
  const frame=image=>[0,0,image.width,image.height];
  const fitted=(image,scale,limit)=>{
    const max=mul(Math.max(image.width,image.height),scale);
    return max>limit?mul(scale,div(limit,max)):scale;
  };
  const limitScale=(image,limit)=>image.width>limit || image.height>limit?div(limit,Math.max(image.width,image.height)):1;
  const unit=[point(sx,x),point(sy,y),t(z),t(z)];
  let finalImage=base,source=[0,0,0,0],dest=[0,0,0,0];
  if((type===128 || type===269) && u>=100){
    const armor=t(u/100),row=t(v/18);
    let image=base,overlay=[0,0,0,0],target=[...unit];
    if(row>=0 && row<=2){
      image=tex(row===0?`Armor_Head_${armor}`:row===2?`Armor_Legs_${armor}`:type===128?`Armor/Armor_${armor}`:`Armor/Armor_Female_${armor}`);
      overlay=[2,row===2?42:0,36,row===0?36:row===1?54:12];
      target[2]=t(scaled(overlay[2]));target[3]=t(scaled(overlay[3]));
      target[0]-=t(scaled(2));
      if(row===2)target[1]-=t(scaled(2));
      else target[1]+=t(scaled((16-overlay[3]-(row===0?4:18))/2));
    }
    rect(image,overlay,target,color,track,u%100<36);
    source=[u%100,v,16,16];dest=unit;
  } else if(type===334 && u>=5000){
    if((readTile(x+1,y).frameX??0)>=5000){
      const id=u%5000-100,image=item(id),scale=mul(limitScale(image,40),itemDrawProperties(id).scale);
      vector(image,frame(image),1+t((add(sx,x)+1.5)*z),1+t((add(sy,y)+.5)*z),
        t(image.width/2),t(image.height/2),scale,color,track,t(u/5000)>=3);
    }
    source=[(t(u/5000)-1)*18,v,16,16];dest=unit;
  } else if(type===395 && v===0 && u%36===0){
    if(entity && entity.item>0){
      const image=item(entity.item),scale=mul(limitScale(image,20),itemDrawProperties(entity.item).scale);
      vector(image,frame(image),point(sx,x,1),point(sy,y,1),t(image.width/2),t(image.height/2),scale,[255,255,255,255]);
    }
    source=[u,v,16,16];dest=unit;
  } else if(type===520){
    if(entity){
      if(entity.item>0){
        const image=item(entity.item),height=itemDrawProperties(entity.item).food?t(image.height/3):image.height;
        const src=[0,itemDrawProperties(entity.item).food?height*2:0,image.width,height];
        vector(image,src,1+t((add(sx,x)+.5)*z),point(sy,y,1),t(src[2]/2),src[3],1,color,track,u===0);
      }
      source=[u===0?0:t(base.width/2),0,t(base.width/2),base.height];
      vector(base,source,point(sx,x,1),1+t((add(sy,y)+.5)*z),t(base.width/2),t(base.height/2),1,color,depth,u===0);
    }
  } else if(type===698 && v===0){
    const variant=t(u/18),px=variant*38;
    const target=[point(sx,x)-t(scaled(10)),point(sy,y),t(scaled(36)),t(scaled(44))];
    rect(base,[px,0,36,44],target);
    if(entity && entity.item>0){
      const props=itemDrawProperties(entity.item),hex=rarityColors[props.rarity || 'Blue'];
      const rgba=hex?hex.slice(1).match(/../g).map(v=>parseInt(v,16)):[150,150,255,255];
      rect(base,[px,92,36,44],target,rgba.map(v=>t(mul(v,.25))));
      const image=item(entity.item),limit=variant===1?18:variant===2?20:22,extra=variant===1?4:variant===2?6:-1;
      const scale=fitted(image,props.scale,limit),offsetY=div(add(24,extra),16);
      const itemColor=color.map(v=>t(add(v,mul(255-v,.5))));
      vector(image,frame(image),point(sx,x,.5),point(sy,y,offsetY),div(image.width,2),div(image.height,2),scale,itemColor,depth);
      rect(base,[px,46,36,44],target,[...rgba.slice(0,3),127]);
    }else rect(base,[px,46,36,44],target,[150,150,255,127]);
    return calls;
  } else if(type===698){
    const offset=t(v/18),ay=y-offset,anchor=ay>=0&&ay<bounds.height?readTile(x,ay):{};
    if(anchor.blockId===698 && (anchor.frameY??0)===0)return calls;
    rect(base,[t(u/18)*38+10,offset*16,16,16],unit);return calls;
  } else if(type===751 || type===752){
    if(u===0 && v===0){
      if(type===751)rect(base,[0,(x+y*2)%7*46,56,46],[unit[0]-t(scaled(12)),unit[1]-t(scaled(7)),t(scaled(56)),t(scaled(46))]);
      else rect(base,[0,0,36,38],[unit[0]-t(scaled(2)),unit[1]+t(scaled(2)),t(scaled(36)),t(scaled(38))]);
    }else{
      const ox=t(u/18),oy=t(v/18),ax=x-ox,ay=y-oy;
      const anchor=ax>=0&&ay>=0&&ax<bounds.width&&ay<bounds.height?readTile(ax,ay):{};
      if(anchor.blockId===type && (anchor.frameX??0)===0 && (anchor.frameY??0)===0)return calls;
      rect(base,[(type===751?12:2)+ox*16,(type===751?7:3)+oy*16,16,16],unit);
    }
    return calls;
  } else if(type===314){
    const uv=frame=>trackFrames[frame]??trackFrames[0];
    const trackSource=frame=>{const[c,r]=uv(frame);return[c*18,r*18,16,16];};
    if(v>=0)rect(base,trackSource(v),unit,color,f(1-f(.03)));
    if(u>=2&&u<=3 || u>=10&&u<=13)
      rect(base,[0,126,16,16],[unit[0],point(sy,y,-1),unit[2],unit[3]],color,track);
    if(u>=24&&u<=29)
      rect(base,[18,126,16,16],[unit[0],point(sy,y,-1),unit[2],unit[3]],color,track);
    if([4,9,10,16,26,33,35].includes(u)||v===4)
      for(let slice=0;slice<6;slice++)
        vector(base,[slice*2,108,2,12-slice*2],t(add(unit[0],div(mul(slice,z),8)))||0,point(sy,y,1),0,0,1);
    if([5,8,11,17,27,32,34].includes(u)||v===5)
      for(let slice=2;slice<8;slice++)
        vector(base,[18+slice*2,108,2,slice*2-2],t(add(unit[0],div(mul(slice,z),8)))||0,point(sy,y,1),0,0,1);
    source=trackSource(u);dest=unit;
  } else if(type===171){
    if(u>=10){
      source=[0,0,64,128];dest=[unit[0],unit[1],t(z)*4,t(z)*8];
      for(const[part,style]of [[3,v&7],[1,(v>>3)&7],[2,(v>>6)&15],[4,(v>>10)&15]])
        if(style>0)rect(tex(`Xmas_${part}`),[66*(style-1),0,64,128],dest,color,track);
      finalImage=tex('Xmas_0');
    }
  }else return null;
  rect(finalImage,source,dest);return calls;
}
