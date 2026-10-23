// SPDX-License-Identifier: MS-PL
// Adapted from the pinned TEdit WorldRenderXna IsCactus branch. TEdit
// contributors; full source pin and license: source.json and LICENSE.
// The caller owns mutable temporary cache records, never world-file tiles.
const f=Math.fround,t=Math.trunc;
const trunk=column=>[0,1,4,5].includes(column);
export function cactusDraw(world,x,y,view){
 const read=(x,y)=>{
  if(x<0||y<0||x>=world.width||y>=world.height)throw new RangeError('Original cactus edge');
  return world.readTile(x,y);
 };
 const neighbors=[[1,0],[0,-1],[-1,0],[0,1],[1,-1],[-1,-1],[-1,1],[1,1]].map(([dx,dy])=>
  x+dx<0||y+dy<0||x+dx>=world.width||y+dy>=world.height?null:{...read(x+dx,y+dy)});
 const current=read(x,y),low=current.cache&255;
 const image=low>=24?'Crimson_Cactus':low>=16?'Evil_Cactus':low>=8?'Good_Cactus':'Tiles_80';
 if(current.cache===65535||!current.lazy){
  let isRight=trunk(((neighbors[2]?.cache??0)&255)%8),isLeft=trunk((neighbors[0]?.cache??0)&255),isBase=trunk(low);
  if(!isLeft&&!isRight&&!isBase){
   let length1=0,length2=0;
   while(y+length1<world.height&&read(x,y+length1).id===current.id)length1++;
   if(x+1<world.width)while(y+length2<world.height&&read(x+1,y+length2).id===current.id)length2++;
   let baseX=0,baseY=length1;isBase=true;
   if(length2>=length1){baseX=1;baseY=length2;isBase=false;isLeft=true;}
   for(let cy=y;cy<y+baseY;cy++){
    const tile=read(x+baseX,cy);if(tile.cache===65535)tile.cache=cy===y?0:256;
   }
  }
  let u=0,v=0;
  const same=i=>neighbors[i]?.id===current.id;
  const east=same(0),north=same(1),west=same(2),south=same(3),sw=same(6),se=same(7);
  if(isLeft){u=3;v=south?(north?1:0):2;if(!south&&!north)u=6;}
  if(isRight){u=2;v=south?(north?1:0):2;if(!south&&!north){u=6;v=1;}}
  if(isBase){
   v=north?2:0;
   if(west&&!sw&&(!east||se))u=4;
   else if(east&&!se&&(!west||sw))u=1;
   else if(west&&!sw&&east&&!se)u=5;
   else{u=0;v=north?1:0;}
  }
  for(let i=0;i<100;i++){
   const baseX=isLeft?1:isRight?-1:0,tile=y+i<world.height?read(x+baseX,y+i):null;
   if(tile?.id===234){u+=24;break;}
   if(tile?.id===112){u+=16;break;}
   else if(tile?.id===116){u+=8;break;}
  }
  current.lazy=true;current.cache=((v<<8)+u)&65535;
 }
 const z=f(view.zoom),point=(scroll,pos)=>1+t(f(f(f(scroll)+pos)*z));
 return [image,0,(current.cache&255)%8*18,(current.cache>>8)*18,16,16,
  point(view.scrollX,x),point(view.scrollY,y),t(z),t(z),0,0,1,0,f(1-f(.04)),0,...(view.color??[255,255,255,255])];
}
