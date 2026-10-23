import {entityDraws} from '../../vendor/tedit-blend-rules/entityDraws.js';
import {contentRecipeDraws} from './contentScene.js';
import {parseTextureName,textureName} from './textureKeys.js';
import {SPRITE_STRIDE} from './spriteCommands.js';

export function validContentDraw(call,atlas){
  return atlas && call.slice(1).every(Number.isFinite) && call[4]>0&&call[5]>0&&
    call[4]<=4096 && call[5]<=4096 && call[4]*call[5]*4<=8*1024*1024 &&
    (call[1]===1?call[12]>0:call[8]>0&&call[9]>0);
}

// Structured-cloned scene DTOs retain JS numbers without integer quantization.
// Projection is done on every draw, so pan/zoom can reuse the current snapshot
// while a new Worker region is in flight. No camera-dependent buffers go stale.
export function contentDrawCalls(scene,regular,images,region,x,y,zoom,view){
  const named=Object.fromEntries([...images].map(([id,image])=>[textureName(id),{width:image.width,height:image.height}]));
  const ordered=[];
  for(let i=0;i<(regular?.length??0);i+=SPRITE_STRIDE){
    const quantize=regular[i+13]&2?Math.trunc:value=>value;
    const call=[regular[i],0,regular[i+1],regular[i+2],regular[i+3],regular[i+4],
      x+regular[i+5]*zoom+Math.trunc(regular[i+9]*zoom/32)+Math.trunc(regular[i+11]*zoom/16),
      y+regular[i+6]*zoom+Math.trunc(regular[i+10]*zoom/32)+Math.trunc(regular[i+12]*zoom/16),
      quantize(regular[i+7]*zoom/16),quantize(regular[i+8]*zoom/16),0,0,1,0,Math.fround(1-Math.fround(.04)),regular[i+13]&1,255,255,255,255];
    ordered.push({call,x:region.x+regular[i+5],y:region.y+regular[i+6],pass:0});
  }
  function add(calls,tx,ty,pass=0){
    for(const record of calls){
      if(!record[0] || !validContentDraw(record,named[record[0]]))continue;
      const call=[...record];call[0]=parseTextureName(record[0]+'.xnb').key;
      if(call.length===16)call.push(255,255,255,255);
      ordered.push({call,x:tx,y:ty,pass});
    }
  }
  for(const recipe of scene.tiles)add(contentRecipeDraws(recipe,named,view,scene),recipe.x,recipe.y);
  for(const {entity,tile}of scene.entities)add(entityDraws(entity,tile,named,view),entity.x,entity.y,1);
  // DrawTileTextures uses Immediate in row/column order, preserving each
  // recipe's calls even when its depth values differ. DrawTileEntities runs
  // later in a separate BackToFront batch; depth never crosses that boundary.
  ordered.sort((a,b)=>a.pass-b.pass || (a.pass?b.call[14]-a.call[14]:a.y-b.y || a.x-b.x));
  return ordered.map(r=>r.call);
}

// The map paints an opaque background before these calls. MonoGame AlphaBlend
// uses premultiplied RGB factors: RGB is multiplied by vertex RGB independently
// of vertex alpha. destination-out followed by lighter preserves that equation
// on the opaque map, including colors whose RGB exceeds alpha (jar borders).
// Plain Canvas globalAlpha would incorrectly darken those layers twice.
export class ContentPainter {
  constructor(canvasFactory=(width,height)=>new OffscreenCanvas(width,height)){
    this.canvasFactory=canvasFactory;this.scratch=null;
  }

  paint(context,calls,images){
    for(const call of calls){
      const atlas=images.get(call[0]);if(!validContentDraw(call,atlas))continue;
      const [r,g,b,a]=call.length===20?call.slice(16):[255,255,255,255];
      let tinted=atlas,source=call.slice(2,6);
      const clamp=call[2]<0||call[3]<0||call[2]+call[4]>atlas.width||call[3]+call[5]>atlas.height;
      if(clamp||r!==255||g!==255||b!==255){
        const width=call[4],height=call[5];
        if(!this.scratch)this.scratch=this.canvasFactory(width,height);
        else if(this.scratch.width!==width||this.scratch.height!==height){this.scratch.width=width;this.scratch.height=height;}
        const scratch=this.scratch.getContext('2d',{willReadFrequently:true});
        scratch.clearRect(0,0,width,height);scratch.imageSmoothingEnabled=false;
        if(clamp){
          // SpriteBatch PointClamp samples edge texels outside the atlas.
          // Canvas clips source rectangles instead; assemble at most nine
          // interior/edge/corner rectangles before scaling the complete crop.
          const segments=(start,length,limit)=>{
            const edges=[0,Math.max(0,Math.min(length,-start)),Math.max(0,Math.min(length,limit-start)),length];
            return edges.slice(0,-1).flatMap((a,i)=>{
              const b=edges[i+1];if(b<=a)return [];
              return [[a,b-a,i===0?0:i===2?limit-1:start+a,i===1?b-a:1]];
            });
          };
          for(const[dx,dw,sx,sw]of segments(source[0],width,atlas.width))
            for(const[dy,dh,sy,sh]of segments(source[1],height,atlas.height))scratch.drawImage(atlas,sx,sy,sw,sh,dx,dy,dw,dh);
        }else scratch.drawImage(atlas,...source,0,0,width,height);
        if(r!==255||g!==255||b!==255){
          const pixels=scratch.getImageData(0,0,width,height);
          for(let i=0;i<pixels.data.length;i+=4){
            pixels.data[i]=pixels.data[i]*r/255;pixels.data[i+1]=pixels.data[i+1]*g/255;pixels.data[i+2]=pixels.data[i+2]*b/255;
          }
          scratch.putImageData(pixels,0,0);
        }
        tinted=this.scratch;source=[0,0,width,height];
      }
      context.save();
      try{
        const sw=call[4],sh=call[5],scaleX=call[1]===1?call[12]:call[8]/sw,scaleY=call[1]===1?call[12]:call[9]/sh;
        const width=call[1]===1?Math.fround(sw*scaleX):call[8],height=call[1]===1?Math.fround(sh*scaleY):call[9];
        context.translate(call[6],call[7]);if(call[13])context.rotate(call[13]);
        context.translate(-Math.fround(call[10]*scaleX),-Math.fround(call[11]*scaleY));
        if(call[15]){context.translate(width,0);context.scale(-1,1);}
        if(a!==255){
          context.globalCompositeOperation='destination-out';context.globalAlpha=a/255;
          // The tinted crop retains original alpha, including clamped edges.
          context.drawImage(tinted,...source,0,0,width,height);
          context.globalCompositeOperation='lighter';context.globalAlpha=1;
        }
        context.drawImage(tinted,...source,0,0,width,height);
      }finally{context.restore();}
    }
  }

  clear(){if(this.scratch){this.scratch.width=1;this.scratch.height=1;this.scratch=null;}}
}
