export function createScriptLibrary(){
 const key='tedit-r5-script-library';
 const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'{}');}catch{return {};}};
 const store=(name,code)=>{if(!name||name.length>128||code.length>262144)throw new Error('脚本名称或长度超过限制');const library=read();library[name]=code;if(Object.keys(library).length>64||JSON.stringify(library).length>4*1024*1024)throw new Error('本机脚本库最多64项、4MiB文本');localStorage.setItem(key,JSON.stringify(library));return library;};
 return async(action,json)=>{
  if(action==='scriptLibrary')return JSON.stringify(read());
  if(action==='scriptStore'){const p=JSON.parse(json);return JSON.stringify(store(p.name,p.code));}
  if(action==='scriptDelete'){const p=JSON.parse(json),library=read();delete library[p.name];localStorage.setItem(key,JSON.stringify(library));return JSON.stringify(library);}
  if(action==='scriptOpen')return new Promise((resolve,reject)=>{const input=document.createElement('input');input.type='file';input.accept='.js,.lua';input.multiple=true;input.hidden=true;document.body.append(input);input.oncancel=()=>{input.remove();resolve('{}');};input.onchange=async()=>{try{const files=Array.from(input.files);if(files.some(f=>f.size>1024*1024))throw new Error('单个脚本文件超过1MiB');for(const f of files)store(f.name,await f.text());resolve(JSON.stringify(read()));}catch(error){reject(error);}finally{input.remove();}};input.click();});
  if(action==='scriptSave'){const p=JSON.parse(json);store(p.name,p.code);const url=URL.createObjectURL(new Blob([p.code],{type:'text/plain;charset=utf-8'}));try{const a=document.createElement('a');a.href=url;a.download=p.name;a.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}return '{}';}
  throw new Error('脚本库操作无效');
 };
}
