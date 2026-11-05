const key='tedit-sprite-sheet-configurations';
function read(){const data=JSON.parse(localStorage.getItem(key)||'{}');if(!data||Array.isArray(data)||typeof data!=='object')throw new Error('本机精灵表配置损坏，请先备份浏览器数据');return data;}
export async function sheetStorage(action,json){
 const input=JSON.parse(json);
 if(action==='sheetRead')return JSON.stringify(read()[input.tile]??null);
 if(action==='sheetStore'||action==='sheetDelete'){
  const data=read();if(action==='sheetDelete')delete data[input.tile];else data[input.tile]=input;
  const text=JSON.stringify(data);if(Object.keys(data).length>256||new TextEncoder().encode(text).length>4*1024*1024)throw new Error('本机精灵表配置最多256种、4MiB，请下载备份后清理');localStorage.setItem(key,text);return '{}';
 }
 if(action==='sheetDownload'){
  const url=URL.createObjectURL(new Blob([JSON.stringify(input,null,2)+'\n'],{type:'application/json;charset=utf-8'}));try{const a=document.createElement('a');a.href=url;a.download='tile-'+input.tile+'-frames.json';a.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}return '{}';
 }
 throw new Error('精灵表存储操作无效');
}
