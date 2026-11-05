// SPDX-License-Identifier: LGPL-3.0-or-later
// xnb integration adapter; source and notices: ./vendor/xnb-NOTICE.md
// Existing xnb 1.3.0-a decoder, with resource/type/allocation guards before decoding.
const maxFile=32*1024*1024,maxRgba=64*1024*1024;
function size(width,height){if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=4096)||width*height*4>maxRgba)throw new Error('贴图解码超过单张64MiB限制');}
self.onmessage=async({data:{file}})=>{
 try{
  if(!file.size||file.size>maxFile)throw new Error('贴图文件超过单张32MiB限制');
  const buffer=await file.arrayBuffer();let width,height,rgba;
  if(/\.png$/i.test(file.name)){
   const v=new DataView(buffer),b=new Uint8Array(buffer);if(b.length<33||![137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n))throw new Error('PNG文件头无效');width=v.getUint32(16);height=v.getUint32(20);size(width,height);
   const image=await createImageBitmap(new Blob([buffer],{type:'image/png'}));try{const canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);rgba=new Uint8Array(context.getImageData(0,0,width,height).data);for(let i=0;i<rgba.length;i+=4){const a=rgba[i+3];rgba[i]=Math.round(rgba[i]*a/255);rgba[i+1]=Math.round(rgba[i+1]*a/255);rgba[i+2]=Math.round(rgba[i+2]*a/255);}}finally{image.close();}
  }else{
   const b=new Uint8Array(buffer),v=new DataView(buffer);if(b.length<14||b[0]!==88||b[1]!==78||b[2]!==66||![4,5].includes(b[4])||v.getUint32(6,true)!==b.length)throw new Error('XNB文件头无效');if((b[5]&0xc0)&&v.getUint32(10,true)>maxRgba+4096)throw new Error('XNB解压超过限制');
   const {bufferToXnb,Readers,addReaders}=await import('./vendor/xnb.module.js');
   class TextureReader extends Readers.Texture2DReader{static type(){return 'Texture2D';}read(input){const format=input.readInt32(),w=input.readUInt32(),h=input.readUInt32(),mips=input.readUInt32(),bytes=input.readUInt32();size(w,h);if(format!==0||mips!==1||bytes!==w*h*4)throw new Error('当前解码器不支持这张XNB的纹理格式');return {format,export:{type:this.type,width:w,height:h,data:input.read(bytes)}};}}
   addReaders(Object.fromEntries(Object.entries(Readers).filter(([k])=>k!=='Texture2DReader').map(([k,R])=>[k,class extends R{static type(){return R.type();}read(){throw new Error('只接受Texture2D资源');}}])));addReaders({Texture2DReader:TextureReader});
   const texture=bufferToXnb(buffer).content.export;width=texture.width;height=texture.height;size(width,height);rgba=new Uint8Array(texture.data);if(rgba.length!==width*height*4)throw new Error('贴图像素长度错误');
  }
  // Original Textures.ApplyColorKeyTransparency, after PNG premultiplication.
  for(let i=0;i<rgba.length;i+=4)if(rgba[i+3]===255&&((rgba[i]===255&&rgba[i+1]===0&&rgba[i+2]===255)||(rgba[i]===247&&rgba[i+1]===119&&rgba[i+2]===249)))rgba.fill(0,i,i+4);
  self.postMessage({width,height,rgba},[rgba.buffer]);
 }catch(error){self.postMessage({error:error.message});}
};
