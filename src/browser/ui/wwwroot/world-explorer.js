// User-selected Files replace desktop automatic Documents/Steam enumeration.
// No world bytes leave this origin; only pin keys are persisted, never file paths.
export function createWorldExplorer({getOwner,readHeader,openFile}){
 let files=[],entries=[],generation=0,serial=Promise.resolve();const headers=new Map();
 const pins=()=>JSON.parse(localStorage.getItem('tedit-world-pins')||'[]');
 const path=f=>(f.webkitRelativePath||f.name).replaceAll('\\','/');
 const stem=name=>name.replace(/\.wld(?:\.bak|\.tedit(?:\.\d+)?)?$/i,'').replace(/\.autosave$/i,'').replace(/\.\d{14}$/,'');
 function describe(){const pinned=pins();return entries.map(e=>({...e,pinned:pinned.includes(e.key)})).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.modified-a.modified||a.key.localeCompare(b.key));}
 function choose(){return new Promise((resolve,reject)=>{const input=document.createElement('input');input.type='file';input.webkitdirectory=true;input.multiple=true;input.hidden=true;document.body.append(input);input.oncancel=()=>{input.remove();resolve();};input.onchange=()=>{try{
   const selected=Array.from(input.files);if(selected.length>20000)throw new Error('目录文件超过20000个，请选择更具体的世界目录');const known=new Map(selected.map(f=>[path(f).toLowerCase(),f]));
   const worlds=selected.filter(f=>/\.wld(?:\.bak|\.tedit(?:\.\d+)?)?$|\.autosave$/i.test(f.name));if(worlds.length>4096)throw new Error('世界和备份超过4096份，请选择更具体的目录');
   files=worlds;generation++;headers.clear();entries=files.map((f,id)=>{const filePath=path(f),backup=/\.wld\.(?:bak|tedit)|\.\d{14}\.wld$|\.autosave$/i.test(f.name),normal=filePath.replace(/\.wld(?:\.bak|\.tedit(?:\.\d+)?)?$/i,'.wld').replace(/\.autosave$/i,'.wld'),sidecar=known.get(normal.replace(/\.wld$/i,'.twld').toLowerCase());return {id,key:filePath,name:f.name,group:stem(f.name),backup,size:f.size,modified:f.lastModified,modded:!!sidecar,sidecar:sidecar?path(sidecar):null};});
   for(const e of entries)e._sidecar=e.sidecar?known.get(e.sidecar.toLowerCase()):null;resolve();
  }catch(error){reject(error);}finally{input.remove();}};input.click();});}
 return async(action,json)=>{
  const p=json?JSON.parse(json):{};
  if(action==='explorerChoose'){await choose();return JSON.stringify(describe().map(({_sidecar,...e})=>e));}
  if(action==='explorerList')return JSON.stringify(describe().map(({_sidecar,...e})=>e));
  const row=entries[p.id],file=files[p.id];if(!row||!file)throw new Error('请重新选择世界目录');
  if(action==='explorerPin'){const list=pins();localStorage.setItem('tedit-world-pins',JSON.stringify(list.includes(row.key)?list.filter(k=>k!==row.key):[...list,row.key].slice(-4096)));return JSON.stringify(describe().map(({_sidecar,...e})=>e));}
  if(file.size+(row._sidecar?.size||0)>256*1024*1024)throw new Error('世界与配套超过256MiB读取预算');
  if(action==='explorerHeader'){if(headers.has(row.id))return JSON.stringify(headers.get(row.id));const mine=generation,task=serial.then(()=>readHeader(file,row.modded));serial=task.catch(()=>{});const result=await task;if(mine!==generation)throw new DOMException('目录预览已过期','AbortError');if(result.bytes){const canvas=document.createElement('canvas');canvas.width=200;canvas.height=100;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.bytes),200,100),0,0);result.header.preview=canvas.toDataURL('image/png').split(',')[1];}if(headers.size>=64)headers.delete(headers.keys().next().value);headers.set(row.id,result.header);return JSON.stringify(result.header);}
  if(action==='explorerOpen'){
   const bytes=new Uint8Array(await file.arrayBuffer()),sidecar=row._sidecar?new Uint8Array(await row._sidecar.arrayBuffer()):new Uint8Array();const name=row.backup?stem(file.name)+'.wld':file.name;
   const before=getOwner();await openFile(bytes,name,sidecar,row._sidecar?name.slice(0,-4)+'.twld':'');if(before===getOwner())throw new Error('打开失败，原编辑状态保留；请检查所选文件及配套。');return '{}';
  }
  throw new Error('世界浏览操作无效');
 };
}
