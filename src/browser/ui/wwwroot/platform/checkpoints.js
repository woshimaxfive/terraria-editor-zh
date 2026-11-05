const DATABASE='tedit-browser:'+new URL('../',import.meta.url).pathname;
const VERSION=2;
const COMMIT='84e3fc3466d405675a09da763169774b82c22d4d';
const LIMIT=256*1024*1024;
export const checkpointDatabaseName=DATABASE;
export async function sha256(data){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
function openDatabase(){
 return new Promise((resolve,reject)=>{
  let blocked=false;
  const request=indexedDB.open(DATABASE,VERSION);
  request.onupgradeneeded=()=>{
   const database=request.result;
   if(!database.objectStoreNames.contains('checkpoints'))database.createObjectStore('checkpoints',{keyPath:'id'});
   if(!database.objectStoreNames.contains('heads'))database.createObjectStore('heads',{keyPath:'id'}).createIndex('updatedAt','updatedAt');
   if(!database.objectStoreNames.contains('templates'))database.createObjectStore('templates',{keyPath:'id'});
  };
  request.onsuccess=()=>{const db=request.result;if(blocked){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>{blocked=true;reject(new Error('另一个页面正在使用旧存储版本，请关闭旧页面后重试'));};
 });
}
// Opaque original-codec clipboard states; geometry and identity stay in C#.
export class TemplateStore {
 async list(){const database=await openDatabase();try{const tx=database.transaction('templates','readonly'),done=transactionResult(tx);const [items]=await Promise.all([requestResult(tx.objectStore('templates').getAll()),done]);return items.map(({bytes,...meta})=>meta).sort((a,b)=>b.updatedAt-a.updatedAt);}finally{database.close();}}
 async put(title,bytes){
  if(typeof title!=='string'||!title.trim()||title.trim().length>64||!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>260*1024*1024)throw new Error('模板名称须为1–64字，恢复数据须在260MiB内');
  const record={id:crypto.randomUUID(),title:title.trim(),updatedAt:Date.now(),sourceCommit:COMMIT,size:bytes.length,checksum:await sha256(bytes),bytes:new Blob([bytes])};
  const database=await openDatabase();try{const tx=database.transaction('templates','readwrite',{durability:'strict'}),done=transactionResult(tx),store=tx.objectStore('templates');let budgetError=null;const request=store.getAll();request.onsuccess=()=>{if(request.result.length>=32||request.result.reduce((sum,item)=>sum+item.size,0)+record.size>128*1024*1024){budgetError=new Error('模板库达到32份或128MiB预算，请删除不需要的模板；已有模板保留');tx.abort();}else store.add(record);};try{await done;}catch(error){throw budgetError??error;}return record.id;}finally{database.close();}
 }
 async get(id){const database=await openDatabase();let record;try{const tx=database.transaction('templates','readonly'),done=transactionResult(tx);[record]=await Promise.all([requestResult(tx.objectStore('templates').get(id)),done]);}finally{database.close();}if(!record||record.sourceCommit!==COMMIT||!(record.bytes instanceof Blob)||record.bytes.size!==record.size||record.size>260*1024*1024)throw new Error('模板记录缺失或版本无效');const bytes=new Uint8Array(await record.bytes.arrayBuffer());if(await sha256(bytes)!==record.checksum)throw new Error('模板校验失败，原模板与世界保留');return bytes;}
 async remove(id){if(typeof id!=='string'||!id)throw new Error('请选择模板');const database=await openDatabase();try{const tx=database.transaction('templates','readwrite',{durability:'strict'}),done=transactionResult(tx);tx.objectStore('templates').delete(id);await done;}finally{database.close();}}
}
function transactionResult(transaction){
 return new Promise((resolve,reject)=>{
  transaction.oncomplete=()=>resolve();
  transaction.onabort=()=>reject(transaction.error??new DOMException('保存事务已中止，上一份记录保留','AbortError'));
  transaction.onerror=()=>{};
 });
}
function requestResult(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function validateRecord(record){
 if(![1,2].includes(record.schema)||record.sourceCommit!==COMMIT||typeof record.id!=='string'||!Number.isSafeInteger(record.revision)||record.revision<0||!(record.checkpoint instanceof Blob)||record.checkpoint.size>LIMIT||!(record.original instanceof File))throw new Error('本机恢复记录格式无效');
 const pair=record.originalSidecar;
 if(record.schema===1&&pair!=null||record.schema===2&&(typeof record.isTModLoader!=='boolean'||pair!==null&&!(pair instanceof File)||record.isTModLoader!==!!pair))throw new Error('本机恢复记录的配套信息无效');
 if(record.original.size+(pair?.size??0)>LIMIT)throw new Error('原始配套文件超过恢复容量');
 if(pair&&(!/\.wld$/i.test(record.original.name)||!/\.twld$/i.test(pair.name)||record.original.name.slice(0,-4).toLowerCase()!==pair.name.slice(0,-5).toLowerCase()||!/^[a-f0-9]{64}$/.test(record.originalSidecarChecksum)))throw new Error('原始配套文件名称或校验信息无效');
}
// Browser persistence adapter; checkpoint bytes and undo remain owned by C#.
function saveToken(record){return record?.saveToken??(record?`${record.revision}:${record.updatedAt}:${record.checksum}`:null);}
function backupMetadata(version,parent){return {id:parent+'#'+version.backupId,revision:version.revision,title:version.title,updatedAt:version.updatedAt,bytes:version.checkpoint.size,isBackup:true};}
function recordBytes(record){return record.checkpoint.size+record.original.size+(record.originalSidecar?.size??0)+(record.versions??[]).reduce((sum,v)=>sum+v.checkpoint.size,0);}
function headFor(record){return {id:record.id,revision:record.revision,title:record.title,updatedAt:record.updatedAt,bytes:recordBytes(record),originalName:record.original.name,originalSidecarName:record.originalSidecar?.name??null,isBackup:false,versions:record.versions.map(v=>backupMetadata(v,record.id))};}
function splitBackup(id){const index=id.indexOf('#');return index<0?[id,null]:[id.slice(0,index),id.slice(index+1)];}
function previousVersion(record){const {schema,revision,title,isTModLoader,updatedAt,checkpoint,checksum,settings,clipboardRevision}=record;return {schema,revision,title,isTModLoader,updatedAt,checkpoint,checksum,settings,clipboardRevision,backupId:crypto.randomUUID()};}
export class CheckpointStore {
 constructor({estimate=()=>navigator.storage?.estimate?.()}={}){this.estimate=estimate;}
 async put(record,{maxBackups=10,expectedToken}={}){
  validateRecord(record);
  if(!Number.isInteger(maxBackups)||maxBackups<1||maxBackups>50)throw new Error('备份数量须为1–50');
  const estimate=await this.estimate();
  if(estimate?.quota!=null&&estimate?.usage!=null&&estimate.quota-estimate.usage<record.checkpoint.size+record.original.size+(record.originalSidecar?.size??0)+1024*1024)throw new DOMException('本机存储空间不足，已有进度和备份保留；请导出副本','QuotaExceededError');
  const database=await openDatabase();
  try{
   const tx=database.transaction(['checkpoints','heads'],'readwrite',{durability:'strict'}),done=transactionResult(tx),store=tx.objectStore('checkpoints');let failure=null,token;
   const request=store.get(record.id);
   request.onsuccess=()=>{
    try{
     const previous=request.result;
     if(expectedToken!==undefined&&saveToken(previous)!==expectedToken||previous?.revision>record.revision)throw new Error('其他页面已保存较新进度，请重新恢复后再保存；已有进度和备份保留');
     if(previous){
      validateRecord(previous);
      if(previous.originalChecksum!==record.originalChecksum||(previous.originalSidecarChecksum??null)!==(record.originalSidecarChecksum??null)||previous.original.name!==record.original.name)throw new Error('恢复记录的原始文件身份不一致，拒绝覆盖');
     }
     const versions=[...(previous?.versions??[])];
     const same=previous&&previous.revision===record.revision&&(previous.clipboardRevision??0)===(record.clipboardRevision??0)&&JSON.stringify(previous.settings)===JSON.stringify(record.settings);
     if(previous&&!same)versions.unshift(previousVersion(previous));
     versions.length=Math.min(versions.length,maxBackups);
     token=crypto.randomUUID();
     const stored={...record,versions,saveToken:token};delete stored.bytes;delete stored.storageToken;
     store.put(stored);tx.objectStore('heads').put(headFor(stored));
    }catch(error){failure=error;try{tx.abort();}catch{}}
   };
   try{await done;}catch(error){throw failure??error;}return token;
  }finally{database.close();}
 }
 async list(){
  const database=await openDatabase();try{const tx=database.transaction('heads','readonly'),done=transactionResult(tx);const [items]=await Promise.all([requestResult(tx.objectStore('heads').getAll()),done]);return items.flatMap(({versions=[],...head})=>[head,...versions.map(v=>({...v,originalName:head.originalName,originalSidecarName:head.originalSidecarName}))]).sort((a,b)=>b.updatedAt-a.updatedAt||Number(a.isBackup)-Number(b.isBackup));}finally{database.close();}
 }
 async remove(id){
  if(typeof id!=='string'||!id)throw new Error('请选择恢复记录');
  const [parent,backup]=splitBackup(id),database=await openDatabase();
  try{const tx=database.transaction(['checkpoints','heads'],'readwrite',{durability:'strict'}),done=transactionResult(tx),store=tx.objectStore('checkpoints');let failure=null;
   if(!backup){store.delete(parent);tx.objectStore('heads').delete(parent);}
   else{const request=store.get(parent);request.onsuccess=()=>{try{const record=request.result;if(!record)throw new Error('恢复记录不存在');record.versions=(record.versions??[]).filter(v=>v.backupId!==backup);store.put(record);tx.objectStore('heads').put(headFor(record));}catch(error){failure=error;tx.abort();}};}
   try{await done;}catch(error){throw failure??error;}
  }finally{database.close();}
 }
 async latest(){
  const database=await openDatabase();try{const tx=database.transaction('heads','readonly'),done=transactionResult(tx);const [cursor]=await Promise.all([requestResult(tx.objectStore('heads').index('updatedAt').openCursor(null,'prev')),done]);return cursor?.value??null;}finally{database.close();}
 }
 async get(id){
  if(typeof id!=='string'||!id)throw new Error('请选择恢复记录');
  const [parent,backup]=splitBackup(id),database=await openDatabase();let record;
  try{const tx=database.transaction('checkpoints','readonly'),done=transactionResult(tx);[record]=await Promise.all([requestResult(tx.objectStore('checkpoints').get(parent)),done]);}finally{database.close();}
  if(!record)return null;
  const token=saveToken(record);
  if(backup){const version=record.versions?.find(v=>v.backupId===backup);if(!version)throw new Error('所选备份已不存在');record={...record,...version,id:crypto.randomUUID(),versions:[],saveToken:null};}
  validateRecord(record);
  const bytes=await record.checkpoint.arrayBuffer();
  if(await sha256(bytes)!==record.checksum||await sha256(await record.original.arrayBuffer())!==record.originalChecksum)throw new Error('本机恢复记录校验失败，未替换当前世界');
  if(record.originalSidecar&&await sha256(await record.originalSidecar.arrayBuffer())!==record.originalSidecarChecksum)throw new Error('原始模组配套校验失败，未替换当前世界');
  return {...record,bytes,storageToken:backup?null:token,isBackup:!!backup};
 }
 async requestPersistence(){try{return !!(await navigator.storage?.persist?.());}catch{return false;}}
}
