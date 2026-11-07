export function createRenderer({owner,hooks,notify}){
 let suspended=false;
 let generation=0,epoch=0,pending=false,running=false,files=new Map(),decoded=new Map(),usedBytes=0,readyAssets=false,last=null;
 let view={width:640,height:400,x:0,y:0,zoom:16,backgroundScaleZoom:9,textureVisibilityZoomLevel:6,lightGlowIntensity:.5,layers:{},filter:{tiles:[],walls:[],liquids:[],wires:[],sprites:[],mode:'Darken'}};
 try{const saved=JSON.parse(localStorage.getItem('tedit-r5-view')||'{}');if(saved.zoom>=.01&&saved.zoom<=256)view.zoom=saved.zoom;if(saved.layers&&typeof saved.layers==='object')view.layers=saved.layers;if(['Default','Minimap','Realistic'].includes(saved.colorMode))view.colorMode=saved.colorMode;if(saved.filter&&typeof saved.filter==='object')view.filter=saved.filter;for(const [key,min,max] of [['backgroundScaleZoom',7,12],['textureVisibilityZoomLevel',3,10],['lightGlowIntensity',0,1]])if(Number.isFinite(saved[key])&&saved[key]>=min&&saved[key]<=max)view[key]=saved[key];}catch{}
 const maxCache=256*1024*1024;
 async function sheetTexture(data){
  const current=owner(),token=generation;if(!current||current.closed)throw new Error('请先打开世界');const name='tiles_'+data.id;
  await load([name],token);if(owner()!==current||token!==generation)throw new DOMException('贴图选择已改变','AbortError');const texture=decoded.get(name);if(!texture)return '{}';
  await current.session.request('previewTexture',{key:name,width:texture.width,height:texture.height,rgba:texture.rgba});
  const canvas=document.createElement('canvas');canvas.width=texture.width;canvas.height=texture.height;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(texture.rgba),texture.width,texture.height),0,0);return JSON.stringify({png:canvas.toDataURL('image/png').split(',')[1]});
 }
 function key(file){const path=(file.webkitRelativePath||file.name).replaceAll('\\','/');const match=path.match(/(?:^|\/)images\/(.*)$/i);return (match?match[1]:path).replace(/\.(png|xnb)$/i,'').toLowerCase();}
 async function decode(file){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./render-texture-worker.js',import.meta.url),{type:'module'});const timer=setTimeout(()=>{worker.terminate();reject(new Error('贴图解码超时'));},10000);function end(){clearTimeout(timer);worker.terminate();}worker.onmessage=({data})=>{end();data.error?reject(new Error(file.name+'：'+data.error)):resolve(data);};worker.onerror=event=>{end();reject(new Error(event.message));};worker.postMessage({file});});}
 async function appAssets(){if(readyAssets)return;for(const name of ['grid','spawn_marker','dungeon_marker']){const blob=await(await fetch(new URL('./render-assets/'+name+'.png',import.meta.url))).blob();const d=await decode(new File([blob],name+'.png'));hooks().RegisterTexture('@app/'+name,d.width,d.height,d.rgba);}readyAssets=true;}
 async function load(keys,token){let added=0;for(const k of keys){if(token!==generation)throw new DOMException('资源选择已改变','AbortError');if(decoded.has(k)||!files.has(k))continue;const data=await decode(files.get(k));if(token!==generation)throw new DOMException('资源结果已过期','AbortError');if(data.rgba.length+usedBytes>maxCache){for(const [old,row] of decoded){if(!keys.includes(old)){decoded.delete(old);usedBytes-=row.rgba.length;hooks().ReleaseTexture(old);}if(data.rgba.length+usedBytes<=maxCache)break;}if(data.rgba.length+usedBytes>maxCache)throw new Error('当前视图贴图超过256MiB缓存，请缩小可见范围');}decoded.set(k,data);usedBytes+=data.rgba.length;hooks().RegisterTexture(k,data.width,data.height,data.rgba);added++;}return added;}
 async function render(){
  if(suspended)return;const current=owner();if(!current||current.closed){last=null;hooks().ClearScene();return;}if(exporting)return;
  const mine=++epoch,token=generation;await appAssets();
  if(current.paletteGeneration!==token){current.paletteGeneration=token;current.paletteKeys=new Set();}
  if(view.colorMode==='Realistic'&&files.size)await preloadPalette(current,token);
  const state=JSON.parse(hooks().RenderState());view={...view,width:Math.max(1,Math.min(4096,state.width||640)),height:Math.max(1,Math.min(4096,state.height||400))};
  if(last?.owner!==current){view.x=(current.info.spawnX??current.info.width/2)-view.width/(2*view.zoom);view.y=(current.info.spawnY??current.info.height/2)-view.height/(2*view.zoom);}
  const options={...view,tool:state.tool??'Brush',toolState:state.toolState,cursor:state.cursor,shift:state.shift??false,language:state.language||'zh-Hans'};
  let scene,minimap,hover;
  for(let pass=0;pass<8;pass++){
   if(current!==owner()||mine!==epoch||token!==generation)return;
   if(current.paletteGeneration!==token){current.paletteGeneration=token;current.paletteKeys=new Set();}
   for(const [key,t] of decoded){if(!/^(tiles|wall)_\d+$/.test(key)||current.paletteKeys.has(key))continue;await current.session.request('paletteTexture',{key,width:t.width,height:t.height,rgba:t.rgba});current.paletteKeys.add(key);}
   await current.session.request('renderTextures',{available:files.size>0,metadata:Array.from(decoded,([key,t])=>({key,width:t.width,height:t.height}))});
   const result=await current.session.request('renderPacket',{options});scene=JSON.parse(result.scene);scene.dynamic=result.textures;minimap=result.minimap;hover=result.hover;
   if(current!==owner()||mine!==epoch||token!==generation)return;
   if(!await load(scene.missing,token))break;
  }
  if(current!==owner()||mine!==epoch||token!==generation)return;
  last={owner:current,scene,options,resources:generation};if(minimap)hooks().ApplyMinimap(minimap);if(hover)hooks().ApplyHover(hover);hooks().ApplyScene(JSON.stringify({...scene,dynamic:[]}));
  for(const tile of scene.dynamic??[]){const pixels=typeof tile.pixels==='string'?Uint8Array.from(atob(tile.pixels),c=>c.charCodeAt(0)):new Uint8Array(tile.pixels);hooks().RegisterTexture(tile.key,tile.width,tile.height,pixels);}
  hooks().RenderStatus(`${view.zoom.toFixed(2)} 像素/格 · ${scene.passes.reduce((n,p)=>n+p.sprites.length,0)} 条绘图指令 · 本机贴图 ${decoded.size}/${files.size}${scene.missing.length?' · 尚缺 '+scene.missing.length+' 张贴图':''}`);
 }
 function refresh(){hooks()?.ApplyRenderPreferences?.(JSON.stringify(view));epoch++;pending=true;try{localStorage.setItem('tedit-r5-view',JSON.stringify({zoom:view.zoom,layers:view.layers,colorMode:view.colorMode,filter:view.filter,backgroundScaleZoom:view.backgroundScaleZoom,textureVisibilityZoomLevel:view.textureVisibilityZoomLevel,lightGlowIntensity:view.lightGlowIntensity}));}catch{}if(running||suspended)return;running=true;void(async()=>{try{while(pending){pending=false;try{await render();}catch(error){if(error.name!=='AbortError'&&owner()&&!suspended)notify('显示失败：'+error.message);}}}finally{running=false;}})();}
 async function select(input){const next=new Map();for(const file of input){if(!/\.(png|xnb)$/i.test(file.name))continue;const k=key(file);if(k.includes('..')||next.has(k))throw new Error('贴图路径重复或无效：'+k);next.set(k,file);}if(!next.size)throw new Error('目录中没有PNG/XNB贴图');generation++;epoch++;for(const k of decoded.keys())hooks().ReleaseTexture(k);files=next;decoded.clear();usedBytes=0;refresh();hooks().RefreshMaterialPreview?.();return '{}';}
 async function choose(){const input=document.createElement('input');input.type='file';input.multiple=true;input.webkitdirectory=true;input.accept='.png,.xnb';input.setAttribute('aria-label','选择Terraria的Content/Images目录');input.hidden=true;document.body.append(input);input.addEventListener('change',()=>{void select(input.files).catch(e=>notify(e.message));input.remove();},{once:true});input.addEventListener('cancel',()=>input.remove(),{once:true});input.click();return '{}';}
 async function command(json){const data=JSON.parse(json);if(data.operation==='sheetTexture')return sheetTexture(data);if(data.operation==='spriteSizes')return spriteSizes();if(data.operation==='preview')return catalogPreview(data);if(data.operation==='exportRegion')return exportRegion(data);if(data.operation==='cancelExport'){cancelExport();return '{}';}if(data.operation==='setLayer'){view.layers={...view.layers,[data.name]:data.enabled};if(data.name==='ShowAllWires'){delete view.layers.ShowAllWires;for(const color of ['Red','Blue','Green','Yellow'])view.layers['Show'+color+'Wires']=data.enabled;}}else if(data.operation==='fit'||data.operation==='spawn'){
   const current=owner();if(!current||current.closed)return '{}';
   if(data.operation==='fit'){
    view.zoom=Math.max(0.01,Math.min(256,Math.min(view.width/current.info.width,view.height/current.info.height)*0.94));
    view.x=current.info.width/2-view.width/(2*view.zoom);view.y=current.info.height/2-view.height/(2*view.zoom);
   }else{view.x=(current.info.spawnX??current.info.width/2)-view.width/(2*view.zoom);view.y=(current.info.spawnY??current.info.height/2)-view.height/(2*view.zoom);}
  }else if(data.operation==='center'){view.x=data.x-view.width/(2*view.zoom);view.y=data.y-view.height/(2*view.zoom);}else if(data.operation==='pan'){view.x+=data.dx/view.zoom;view.y+=data.dy/view.zoom;}else if(data.operation==='zoom'){const next=Math.max(0.01,Math.min(256,view.zoom*data.factor)),px=data.px??view.width/2,py=data.py??view.height/2;view.x+=px/view.zoom-px/next;view.y+=py/view.zoom-py/next;view.zoom=next;}else if(data.operation==='set')view={...view,...data.view};else if(data.operation==='clear'){generation++;epoch++;for(const k of decoded.keys())hooks().ReleaseTexture(k);files.clear();decoded.clear();usedBytes=0;last=null;hooks().ClearScene();}refresh();return '{}';}
 async function spriteSizes(){
  const current=owner(),token=generation;if(!current||!files.size)throw new Error('请先打开世界并选择 Terraria 贴图目录');const sizes=[];
  for(const key of files.keys()){const match=key.match(/^tiles_(\d+)$/);if(!match)continue;await load([key],token);const texture=decoded.get(key);sizes.push([Number(match[1]),texture.width,texture.height]);}
  if(owner()!==current||generation!==token)throw new DOMException('资源选择已改变','AbortError');return JSON.stringify(sizes);
 }
 async function preloadPalette(current,token){
  if(current.completePalette===token)return;
  let count=0;for(const key of files.keys()){
   if(!/^(tiles|wall)_\d+$/.test(key))continue;if(owner()!==current||generation!==token)throw new DOMException('资源选择已改变','AbortError');
   if(current.paletteKeys.has(key))continue;await load([key],token);const t=decoded.get(key);await current.session.request('paletteTexture',{key,width:t.width,height:t.height,rgba:t.rgba});current.paletteKeys.add(key);if(++count%100===0)notify('正在读取原版真实颜色 '+count+' 张');
  }current.completePalette=token;
 }
 async function catalogPreview(data){
  const current=owner(),token=generation;if(!current||current.closed)throw new Error('请先打开世界');
  if(current.previewGeneration!==token){await current.session.request('previewClear',{});current.previewGeneration=token;}
  let scene;for(let pass=0;pass<8;pass++){
   if(owner()!==current||token!==generation)throw new DOMException('预览已过期','AbortError');
   await current.session.request('renderTextures',{available:files.size>0,metadata:Array.from(decoded,([key,t])=>({key,width:t.width,height:t.height}))});
    const result=await current.session.request('catalogPreview',{kind:data.kind,key:data.id,style:data.style||0,plain:data.plain?new Uint8Array(data.plain):undefined,options:JSON.stringify(data.preview||{})});scene=result.scene;const parsed=JSON.parse(scene);let sent=0;
   for(const key of parsed.pixelRequests||[]){const pixels=decoded.get(key);if(pixels){await current.session.request('previewTexture',{key,width:pixels.width,height:pixels.height,rgba:pixels.rgba});sent++;}}
   if(!await load(parsed.missing,token)&&!sent)break;
  }
  if(owner()!==current||token!==generation)throw new DOMException('预览已过期','AbortError');
  if(JSON.parse(scene).pixelRequests?.length)throw new Error('预览纹理未能同时装入64MiB缓存，请减少预览资源大小');
  const bytes=hooks().SnapshotScene(scene,true);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return JSON.stringify({png:btoa(binary)});
 }
 let exporting=false,exportContext=null;
 async function exportChunk(record,json){
  const context=exportContext;if(!context||context.current!==record||owner()!==record||context.token!==generation||context.cancelled)throw new DOMException('导出已取消','AbortError');
  const scene=JSON.parse(json);const added=await load(scene.missing,context.token);
  if(exportContext!==context||context.token!==generation||context.cancelled||owner()!==record)throw new DOMException('导出已过期','AbortError');
  if(added)return JSON.stringify({metadata:{available:files.size>0,metadata:Array.from(decoded,([key,t])=>({key,width:t.width,height:t.height}))}});
  const rgba=hooks().SnapshotScene(json,false);let binary='';for(let i=0;i<rgba.length;i+=32768)binary+=String.fromCharCode(...rgba.subarray(i,i+32768));
  notify('正在导出地图，贴图已加载 '+decoded.size+' 张');return JSON.stringify({rgba:btoa(binary)});
 }
 async function exportRegion(options={}){
  if(exporting)throw new Error('图片正在导出');const current=owner();if(!last||!current)throw new Error('请先打开世界');
  exporting=true;hooks().ExportProgress(true,0,0,"正在准备导出");epoch++;exportContext={current,token:generation,cancelled:false};const context=exportContext;
  try{
   await current.session.request('renderTextures',{available:files.size>0,metadata:Array.from(decoded,([key,t])=>({key,width:t.width,height:t.height}))});
   const result=await current.session.request('renderExport',{options:{...options,layers:view.layers,filter:view.filter}});
   if(context.cancelled||owner()!==current||context.token!==generation)throw new DOMException('导出已取消','AbortError');
   const blob=new Blob([result.bytes],{type:options.tiles?'application/zip':'image/png'});if(options.download===false)return blob;
   const url=URL.createObjectURL(blob);try{const a=document.createElement('a');a.href=url;a.download=options.tiles?'TEdit-map-tiles.zip':'TEdit-map.png';a.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}return '{}';
  }finally{hooks().ExportProgress(false,0,0,"");exportContext=null;exporting=false;refresh();}
 }
 function progress(record,data){if(exportContext?.current===record&&owner()===record&&!exportContext.cancelled)hooks().ExportProgress(true,data.overall,data.layer,data.text);}
 function cancelExport(){if(exportContext)exportContext.cancelled=true;}
 async function exportPng(options={}){
  if(options.area&&[1,4,8,16].includes(options.scale)&&Object.values(options.area).every(Number.isSafeInteger))return exportRegion(options);
  if(exporting)throw new Error('图片正在导出');if(!last)throw new Error('请先打开世界');
  const current=owner(),token=generation;exporting=true;
  try{
   const area=options.area??{x:view.x,y:view.y,width:view.width/view.zoom,height:view.height/view.zoom};
   const scale=options.scale??view.zoom,width=Math.ceil(area.width*scale),height=Math.ceil(area.height*scale);
   if(![area.x,area.y,area.width,area.height,scale].every(Number.isFinite)||area.width<=0||area.height<=0||scale<0.01||scale>256||width>16384||height>16384||width*height>16777216)throw new Error('图片最大16384边长、16777216像素，请缩小区域或比例');
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');
   for(let py=0;py<height;py+=2048)for(let px=0;px<width;px+=2048){
    let scene;for(let pass=0;pass<8;pass++){
     if(owner()!==current||token!==generation)throw new DOMException('导出已过期','AbortError');
     await current.session.request('renderTextures',{available:files.size>0,metadata:Array.from(decoded,([key,t])=>({key,width:t.width,height:t.height}))});
     const result=await current.session.request('render',{options:{...view,tool:'Brush',width:Math.min(2048,width-px),height:Math.min(2048,height-py),x:area.x+px/scale,y:area.y+py/scale,zoom:scale,export:true}});scene=JSON.parse(result.scene);if(!await load(scene.missing,token))break;
    }
    if(owner()!==current||token!==generation)throw new DOMException('导出已过期','AbortError');
    const bytes=hooks().SnapshotScene(JSON.stringify(scene),true);const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));try{context.drawImage(image,px,py);}finally{image.close();}
   }
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('浏览器未能编码图片');
   if(owner()!==current||token!==generation)throw new DOMException('导出已过期','AbortError');
   if(options.download===false)return blob;
   const url=URL.createObjectURL(blob);try{const a=document.createElement('a');a.href=url;a.download='TEdit-map.png';a.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}return '{}';
  }finally{exporting=false;refresh();}
 }
 window.addEventListener('pagehide',()=>{generation++;epoch++;for(const key of decoded.keys())hooks().ReleaseTexture(key);decoded.clear();files.clear();hooks().ClearScene();});
 return {suspend(){suspended=true;epoch++;},resume(){suspended=false;refresh();},rebind(previous,next){if(last?.owner===previous)last.owner=next;},progress,refresh,choose,select,command,exportPng,exportRegion,exportChunk,cancelExport,diagnostics:()=>({exporting,generation,usedBytes,decoded:decoded.size,files:files.size,view,last:last?{scene:last.scene,options:last.options,resources:last.resources}:null,running,pending})};
}
