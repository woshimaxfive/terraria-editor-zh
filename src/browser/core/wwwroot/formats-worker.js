import {dotnet} from './_framework/dotnet.js';
try{
 const runtime=await dotnet.create();
 const api=(await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName)).FileProbe;
 self.onmessage=async({data})=>{
  try{
   const info=JSON.parse(api.Load(new Uint8Array(await data.file.arrayBuffer()),data.sidecar?new Uint8Array(await data.sidecar.arrayBuffer()):new Uint8Array()));
   await api.Save();const bytes=api.SavedWorld(),sidecar=api.Sidecar(),reopened=JSON.parse(api.Reopen());
   self.postMessage({id:data.id,info,reopened,bytes,sidecar},[bytes.buffer,sidecar.buffer]);
  }catch(error){self.postMessage({id:data.id,error:String(error)});}
 };
 self.postMessage({ready:true});
}catch(error){self.postMessage({startupError:String(error)});}
