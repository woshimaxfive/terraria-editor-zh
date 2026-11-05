import {downloadWorld} from './platform/downloadWorld.js';
export function createPlayerHost(){
 let worker,ready,serial=Promise.resolve(),id=0,state={};const requests=new Map();
 function start(){if(worker)return ready;worker=new Worker(new URL('../../core/wwwroot/worker.js',import.meta.url),{type:'module'});ready=new Promise((resolve,reject)=>{
  worker.onmessage=({data})=>{if(data.ready)return resolve();if(data.startupError)return reject(new Error(data.startupError));const pending=requests.get(data.id);if(pending){requests.delete(data.id);data.type==='error'?pending.reject(new Error(data.message)):pending.resolve(data);}};
  worker.onerror=e=>{reject(new Error(e.message));for(const p of requests.values())p.reject(new Error(e.message));requests.clear();worker.terminate();worker=null;};
 });return ready;}
 function request(action,payload){const task=serial.then(async()=>{await start();return new Promise((resolve,reject)=>{const token=++id;requests.set(token,{resolve,reject});worker.postMessage({id:token,generation:1,action,...payload});});});serial=task.catch(()=>{});return task;}
 async function open(){const file=await new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.plr';input.onchange=()=>resolve(input.files[0]||null);input.oncancel=()=>resolve(null);input.click();});if(!file)return JSON.stringify(state);if(file.size>8*1024*1024)throw new Error('玩家文件超过8MiB');const result=await request('playerLoad',{file});state=result.player;return JSON.stringify(state);}
 async function edit(json){state=(await request('playerEdit',{json})).player;return JSON.stringify(state);}
 async function save(){const result=await request('playerSave',{});downloadWorld(result.bytes,(state.file||'player.plr').replace(/\.plr$/i,'-edited.plr'));return JSON.stringify(state);}
 function close(){worker?.terminate();worker=null;for(const p of requests.values())p.reject(new Error('玩家编辑器已关闭'));requests.clear();state={};}
 window.addEventListener('pagehide',close);
 return{open,edit,save,close,preview:json=>request('playerPreview',{json})};
}
