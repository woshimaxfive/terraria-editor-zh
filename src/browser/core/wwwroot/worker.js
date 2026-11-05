import {decryptPlayer,encryptPlayer} from './player-crypto.js';
import {dotnet} from './_framework/dotnet.js';
import {checkpointHashImports} from './checkpoint-hash.js';
import {bootResource} from './platform/boot-resource-loader.js';
try {
 const host=dotnet.withResourceLoader(bootResource).withConfig({enableDownloadRetry:true});
 await host.download();
 const runtime=await host.create();
 runtime.setModuleImports("checkpointHash",checkpointHashImports);
 let progressGeneration=0;let previousUndoIndex=null;
 runtime.setModuleImports("operationProgress",{report:count=>self.postMessage({type:"operationProgress",generation:progressGeneration,count})});
 let drawId=0;const draws=new Map();
 runtime.setModuleImports("renderExport",{report:(overall,layer,text)=>self.postMessage({type:"renderExportProgress",generation:progressGeneration,overall,layer,text}),draw:scene=>new Promise((resolve,reject)=>{const token=++drawId;const timer=setTimeout(()=>{draws.delete(token);reject(new Error('绘图回传超时'));},30000);draws.set(token,{resolve,reject,timer});self.postMessage({type:'renderExportChunk',generation:progressGeneration,token,scene});})});
 const api=(await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName)).WorkerCore;
 self.onmessage=async({data})=>{
  if(data.action==='renderExportReply'){const pending=draws.get(data.token);if(pending){clearTimeout(pending.timer);draws.delete(data.token);data.error?pending.reject(new Error(data.error)):pending.resolve(data.result);}return;}
  const {id,action,generation}=data;progressGeneration=generation;
  try{
   let result;
   if(action==='playerLoad'){result={player:JSON.parse(api.OpenPlayer(await decryptPlayer(new Uint8Array(await data.file.arrayBuffer())),data.file.name))};}
   else if(action==='playerPreview')result={bytes:api.PreviewPlayer(data.json)};
   else if(action==='playerEdit')result={player:JSON.parse(api.EditPlayer(data.json))};
   else if(action==='playerSave')result={bytes:await encryptPlayer(api.SavePlayer())};
   else if(action==='open'){
    if(data.newWorld)await api.PrepareNewWorld(JSON.stringify(data.newWorld));
    const world=data.newWorld?api.TakeExport():new Uint8Array(await data.file.arrayBuffer()),sidecar=data.sidecar?new Uint8Array(await data.sidecar.arrayBuffer()):new Uint8Array();
    let info=JSON.parse(data.restore?api.Restore(world,data.savedRevision):data.replay?await api.OpenReplay(world):data.replacementRevision!=null?api.OpenTransformedWorld(world,data.replacementRevision):api.Open(world,sidecar,!!data.sidecar));
    if(data.configurations){api.ApplySpriteConfigurations(JSON.stringify(data.configurations));info=JSON.parse(api.Info());}
    if(!data.restore&&!data.replay&&data.replacementRevision==null)await api.PrepareBaseline(world,sidecar,!!data.sidecar);
    result={info,catalog:JSON.parse(api.Catalog()),frame:api.Frame(),...(data.newWorld?{generatedSource:world}: {})};
   }
   else if(action==='previewTexture'){api.PreviewTexture(data.key,data.width,data.height,data.rgba);result={};}
   else if(action==='previewClear'){api.ClearPreviewTextures();result={};}
   else if(action==='catalogPreview'){result={scene:data.kind==='player'?api.RenderPlayerPreview(data.plain,data.options||'{}'):api.CatalogPreview(data.kind,data.key,data.style||0)};}
   else if(action==='paletteTexture'){api.PaletteTexture(data.key,data.width,data.height,data.rgba);result={};}
   else if(action==='transformWorldOutput'){await api.PrepareTransformedWorld(JSON.stringify(data.payload));result={bytes:api.TakeExport()};}
   else if(action==='transformWorld'){await api.TransformWorld(JSON.stringify(data.payload));result={info:JSON.parse(api.Info()),frame:api.Frame()};}
   else if(action==='desktopImport'){api.ImportDesktopData(data.payload.page,new Uint8Array(data.payload.bytes));result={info:JSON.parse(api.Info()),frame:api.Frame()};}
   else if(action==='explorerHeader'){const bytes=new Uint8Array(await data.file.arrayBuffer());result={header:JSON.parse(api.ExplorerHeader(bytes,!!data.modded))};if(!data.modded&&!result.header.IsCorrupt)try{result.bytes=api.ExplorerPreview(bytes);}catch(error){result.previewError=String(error);}}
   else if(action==='script'){await api.RunScript(JSON.stringify(data.payload));result={info:JSON.parse(api.Info()),frame:api.Frame(),downloads:JSON.parse(api.ScriptDownloadNames()).map((name,index)=>({name,bytes:api.ScriptDownload(index)}))};}
   else if(action==='renderPacket'){
    api.PrepareRenderPacket(JSON.stringify(data.options));let scene;const textures=[];
    try{
     const decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];let count=0;const length=api.RenderPacketLength();
     while(count<length){const chunk=api.ReadRenderPacketChunk();if(!chunk.length||count+chunk.length>length)throw Error('预览指令长度错误');count+=chunk.length;parts.push(decoder.decode(chunk,{stream:true}));}parts.push(decoder.decode());scene=parts.join('');
     const metadata=JSON.parse(api.RenderPacketTextures());
     for(let index=0;index<metadata.length;index++){
      const t=metadata[index];if(!Number.isInteger(t.width)||!Number.isInteger(t.height)||t.width<1||t.height<1||t.width>4096||t.height>4096||t.length!==t.width*t.height*4)throw Error('预览像素尺寸错误');
      const pixels=new Uint8Array(t.length);let offset=0;
      while(offset<pixels.length){const chunk=api.ReadRenderTextureChunk(index,offset);if(!chunk.length||chunk.length>65536||offset+chunk.length>pixels.length)throw Error('预览像素长度错误');pixels.set(chunk,offset);offset+=chunk.length;}
      textures.push({key:t.key,width:t.width,height:t.height,pixels});
     }
    }finally{api.FinishRenderPacket();}
    result={scene,textures,minimap:api.Minimap(),hover:api.RenderHover(JSON.stringify(data.options))};
   }
   else if(action==='render'){
    api.PrepareRenderScene(JSON.stringify(data.options));let scene;
    try{const decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];let count=0;const length=api.RenderSceneLength();while(count<length){const chunk=api.ReadRenderSceneChunk();if(!chunk.length)throw Error('预览数据不完整');count+=chunk.length;parts.push(decoder.decode(chunk,{stream:true}));}parts.push(decoder.decode());scene=parts.join('');}finally{api.FinishRenderScene();}
    result={scene,minimap:api.Minimap(),hover:api.RenderHover(JSON.stringify(data.options))};
   }
   else if(action==='renderTextures'){api.RenderTextures(JSON.stringify({metadata:data.metadata,available:data.available}));result={};}
   else if(action==='renderExport'){await api.PrepareRenderExport(JSON.stringify(data.options));result={bytes:api.TakeExport()};}
   else if(action==='playerMap'||action==='replayExport'||action==='recordingExport'){await api.PrepareArtifact(action);result={bytes:api.TakeExport(),info:JSON.parse(api.Info())};}
   else if(action==='clipboardTransform')result={bytes:api.TransformClipboardIsolated(new Uint8Array(await data.file.arrayBuffer()),data.operation,data.allowSpriteRemoval)};
   else if(action==='toolPreferences')result={info:JSON.parse(api.RestoreToolPreferences(JSON.stringify(data.payload)))};
   else if(action==='clipboardRelease'){api.ReleaseClipboardForReplacement();result={};}
   else if(action==='templateImport')result={info:JSON.parse(api.ImportTemplate(new Uint8Array(await data.file.arrayBuffer())))};
   else if(action==='templateExport')result={bytes:api.ExportTemplate()};
   else if(action==='clipboardExport')result={bytes:api.ExportClipboardState()};
   else if(action==='clipboardImport')result={info:JSON.parse(api.ImportClipboardState(new Uint8Array(data.bytes)))};
   else if(action==='export'||action==='report'){await api.PrepareExport(data.payload?.worldName??'world.wld');result={bytes:api.TakeExport(),worldSha256:api.ExportedWorldHash(),paired:api.ExportedPair(),report:api.ExportedReport()};}
   else if(action==='exportVersion'){await api.PrepareVersionExport(data.payload.gameVersion,data.payload.preserveAll,data.payload.worldName);result={bytes:api.TakeExport(),paired:api.ExportedPair(),worldSha256:api.ExportedWorldHash()};}
   else if(action==='validateRecovery'){await api.PrepareCheckpoint();api.FinishCheckpoint();result={};}
   else if(action==='checkpoint'){
    console.info('Checkpoint prepare');await api.PrepareCheckpoint();console.info('Checkpoint prepared managed',JSON.parse(api.Info()).managedBytes);
    try{const bytes=new Uint8Array(api.CheckpointLength());let offset=0;
     while(offset<bytes.length){const chunk=api.ReadCheckpointChunk();if(!chunk.length||chunk.length>bytes.length-offset)throw new Error('检查点传输长度错误');bytes.set(chunk,offset);offset+=chunk.length;}
     result={bytes,info:JSON.parse(api.Info())};console.info('Checkpoint marshalled',bytes.length);
    }finally{api.FinishCheckpoint();}
   }
   else result={info:JSON.parse(api.Command(action,JSON.stringify(data.payload))),frame:action==='collect'?undefined:api.Frame()};
   if(action==='spriteEditor'&&data.payload?.action==='save')result.catalog=JSON.parse(api.Catalog());
   if(result.info){if(previousUndoIndex!==null&&result.info.undoIndex!==previousUndoIndex&&action!=='open')await api.ValidateRecoveryCapacity();previousUndoIndex=result.info.undoIndex;}
   const transfers=[...(result.textures||[]).map(t=>t.pixels.buffer),result.bytes?.buffer,result.frame?.buffer,...(result.downloads||[]).map(d=>d.bytes.buffer)].filter(Boolean);
   self.postMessage({id,generation,type:'result',...result},transfers);
  }catch(error){console.error('Core operation failed',action,String(error),error.stack);self.postMessage({id,generation,type:'error',recoverable:true,message:String(error)});}
 };
 self.postMessage({ready:true});
}catch(error){self.postMessage({startupError:String(error)});}
