import {chooseColor} from './choose-color.js';
import {createWorldExplorer} from './world-explorer.js';
const worldExplorer=createWorldExplorer({getOwner:()=>active,openFile,readHeader:async(file,modded)=>{const utility=createSession(null,null,false,null,{modded});try{return await utility.session.open(file);}finally{utility.session.close();}}});
import {sheetStorage} from './sheet-storage.js';
import {createScriptLibrary} from './script-library.js';
const scriptLibrary=createScriptLibrary();
import {createPlayerHost} from './player-host.js';
const playerHost=createPlayerHost();
const loadedBrowserBuild=fetch(new URL('./build-version.json',import.meta.url)).then(async response=>{if(!response.ok)throw new Error('页面版本信息不可用');return (await response.json()).version;});loadedBrowserBuild.catch(()=>{});
import {createRenderer} from './render-bridge.js';
import {WorldSession} from './platform/WorldSession.js';
import {downloadWorld} from './platform/downloadWorld.js';
import {CheckpointStore,TemplateStore,sha256} from './platform/checkpoints.js';

let nextGeneration=0;
// Adapt the existing serial request queue; the domain protocol stays outside it.
function createSession(restoredRevision=null,sidecar=null,replay=false,newWorld=null,utility=null,replacementRevision=null){
 const generation=++nextGeneration;
 const record={generation,closed:false,ready:false,id:crypto.randomUUID(),savedRevision:0,downloadedRevision:-1,savedClipboardRevision:0,persisted:false};
 const session=new WorldSession(()=>{
  const worker=new Worker(new URL('../../core/wwwroot/worker.js',import.meta.url),{type:'module'});
  const buffered=[];
  const facade={postMessage(message){const tagged={...message,generation,...(utility?(utility.clipboard?{action:"clipboardTransform",...utility.clipboard}:{action:"explorerHeader",modded:utility.modded}):{}),...(message.action==='open'?{configurations:JSON.parse(localStorage.getItem('tedit-sprite-sheet-configurations')||'{}')}:{}),...(message.action==='open'?(restoredRevision!==null?{restore:true,savedRevision:restoredRevision}:{sidecar,replay,newWorld,replacementRevision}):{})};if(record.ready)worker.postMessage(tagged);else buffered.push(tagged);},terminate(){record.closed=true;buffered.length=0;worker.terminate();if(active===record){active=null;clearTimeout(saveTimer);saveTimer=null;status='处理程序已停止，可恢复最后成功保存的进度或下载原始副本';publish();}}};
  worker.onmessage=({data})=>{
   if(record.closed)return;
   if(data.ready){record.ready=true;for(const message of buffered.splice(0))worker.postMessage(message);return;}
   if(data.startupError){facade.onerror?.({preventDefault(){}});return;}
   if(data.generation!==generation)return;
   if(data.type==="operationProgress"){session.touch();if((active===record||operation?.utility===record)&&busy){status="正在处理，已处理 "+Math.round(data.count)+" 步；可取消并回滚";publishProgress();}return;}
   if(data.type==='renderExportProgress'){session.touch();renderer.progress(record,data);return;}
   if(data.type==='renderExportChunk'){void renderer.exportChunk(record,data.scene).then(result=>worker.postMessage({action:'renderExportReply',token:data.token,result}),error=>worker.postMessage({action:'renderExportReply',token:data.token,error:String(error)}));return;}
   facade.onmessage?.({data});
  };
  worker.onerror=event=>facade.onerror?.(event);
  worker.onmessageerror=event=>facade.onmessageerror?.(event);
  return facade;
 },120000);
 record.session=session;return record;
}
let active=null,staging=null,opening=0,busy=false,exportEpoch=0,originalFile=null,originalSidecar=null,completedOpens=0,completedCommands=0;
let operation=null;
let info={},catalog={},status='打开世界文件开始编辑；存档在本机处理。';
const checkpoints=new CheckpointStore();
const templateStore=new TemplateStore();let library=[];
let autoSave=true,saveTimer=null,storageStatus='',recoveryAvailable=false,recoveries=[];
const preferenceKey='tedit-browser:autosave:'+new URL('.',import.meta.url).pathname;
const hooks=()=>window.r2;
function publishProgress(){const dirty=!!active&&active.info.revision>active.savedRevision;hooks()?.ApplyProgress(status+(storageStatus?' · '+storageStatus:'')+(dirty?' · 当前更改尚未保存到本机进度':''));}
function saveState(){
 if(!active)return '';
 const local=active.persisted&&active.savedRevision===active.info.revision?'本机进度已保存':'本机进度待保存';
 const file=active.downloadedRevision!==active.info.revision?'当前版本待下载':active.downloadedRevision===0?'已打开世界文件':'已发起当前版本下载';
 return local+' · '+file;
}
function publish(){const dirty=!!active&&active.info.revision>active.savedRevision;hooks()?.ApplyInfo(JSON.stringify({...info,...catalog,status:status+(storageStatus?' · '+storageStatus:'')+(dirty?' · 当前更改尚未保存到本机进度':''),saveState:saveState(),storageStatus,dirty,autoSave,recoveryAvailable,recoveries,library,busy,editable:!!active&&!busy&&!staging}));}
function apply(result){queueMicrotask(()=>renderer.refresh());if(result.frame)hooks().ApplyFrame(result.frame);if(result.info)info=result.info;if(result.catalog)catalog=result.catalog;}
function validateSettings(settings,choices=catalog){
 if(settings===null)return null;
 if(!settings||!Number.isInteger(settings.tile)||!choices.materials?.some(item=>item.id===settings.tile)||typeof settings.tileActive!=='boolean'||!Number.isInteger(settings.width)||settings.width<1||settings.width>400||!Number.isInteger(settings.height)||settings.height<1||settings.height>400||!choices.maskModes?.includes(settings.mask))throw new Error('工具设置无效，未替换或保存进度');
 if(settings.toolState!=null){
  if(!choices.tools?.includes(settings.tool)||!choices.toolSchema)throw new Error('工具设置版本无效');
  for(const [group,fields] of Object.entries(choices.toolSchema)){
   const values=settings.toolState[group];if(!values||typeof values!=='object')throw new Error('工具参数组缺失');
   for(const field of fields){const value=values[field.name];if(field.type==='bool'?typeof value!=='boolean':field.type==='enum'?!field.choices.includes(value):field.type==='number'?!Number.isFinite(value):typeof value!=='string'||value.length>100)throw new Error('工具参数类型无效：'+field.name);}
   if(Object.keys(values).some(key=>!fields.some(field=>field.name===key)))throw new Error('未知工具参数');
  }
  const s=settings.toolState.selection;if(!s||typeof s.active!=='boolean'||!['x','y','width','height'].every(k=>Number.isSafeInteger(s[k])))throw new Error('工具选区参数无效');
 }
 const clip=settings.clipboard;
 if(clip!==undefined&&(!clip||!['selectMode','allowSpriteRemoval','pasteEmpty','pasteTiles','pasteWalls','pasteLiquids','pasteWires','pasteSprites','pasteOverTiles'].every(key=>typeof clip[key]==='boolean')||!['selectionX','selectionY','selectionWidth','selectionHeight','pasteX','pasteY'].every(key=>Number.isSafeInteger(clip[key])&&Math.abs(clip[key])<=2147483647)))throw new Error('剪贴板设置无效，未替换或保存进度');
 if(clip&&!['filterTiles','filterWalls','filterLiquids','filterWires'].every(key=>!(key in clip)||typeof clip[key]==='boolean'))throw new Error('复制过滤设置无效，未替换或保存进度');
 return settings;
}
function saveFailure(error){storageStatus='本机进度保存失败，上一份记录保留；请导出副本：'+error.message;if(active&&!active.session.loaded){active=null;status='处理程序已停止，可恢复最后成功保存的进度或下载原始副本';}publish();}
function scheduleSave(owner){
 clearTimeout(saveTimer);saveTimer=null;
 if(!autoSave||owner!==active||owner.closed)return;
 saveTimer=setTimeout(()=>{saveTimer=null;if(busy||staging){scheduleSave(owner);return;}void saveCheckpoint(owner).catch(saveFailure);},2000);
}
function maxBackups(){const value=JSON.parse(localStorage.getItem('tedit-r5-desktop')||'{}').maxBackups??10;if(!Number.isInteger(value)||value<1||value>50)throw new Error('备份数量须为1–50');return value;}
async function saveCheckpoint(owner,force=false){
 const settingsKey=()=>JSON.stringify(owner.settings??null);
 if(owner.saving)await owner.saving;
 if(!force&&owner.persisted&&owner.savedRevision>=owner.info.revision&&owner.savedClipboardRevision===(owner.info.clipboardRevision??0)&&owner.savedSettings===settingsKey())return;
 owner.saving=(async()=>{
  const settings=owner.settings??null;
  const snapshot=await owner.session.request('checkpoint',{});
  const capturedAt=Date.now();
  const checksum=await sha256(snapshot.bytes);
  owner.originalChecksum??=await sha256(await owner.original.arrayBuffer());
  if(owner.originalSidecar)owner.originalSidecarChecksum??=await sha256(await owner.originalSidecar.arrayBuffer());
  const record={schema:2,sourceCommit:'84e3fc3466d405675a09da763169774b82c22d4d',id:owner.id,revision:snapshot.info.revision,title:snapshot.info.title,isTModLoader:snapshot.info.isTModLoader,updatedAt:capturedAt,checkpoint:new Blob([snapshot.bytes]),checksum,original:owner.original,originalChecksum:owner.originalChecksum,originalSidecar:owner.originalSidecar??null,originalSidecarChecksum:owner.originalSidecarChecksum??null,settings};
  record.clipboardRevision=snapshot.info.clipboardRevision??0;owner.persistedToken=await checkpoints.put(record,{maxBackups:maxBackups(),expectedToken:owner.persistedToken??null});
  owner.savedRevision=record.revision;owner.savedClipboardRevision=snapshot.info.clipboardRevision??0;owner.savedSettings=JSON.stringify(settings);owner.persisted=true;recoveryAvailable=true;
  if(owner===active){storageStatus='本机进度已保存（含撤销历史）';publish();}
 })();
 try{await owner.saving;}finally{owner.saving=null;}
}
async function preserveBeforeSwitch(){if(active&&(active.info.revision>0||active.info.clipboard||active.settings)&&(!active.persisted||active.savedRevision<active.info.revision||active.savedClipboardRevision!==(active.info.clipboardRevision??0)||active.savedSettings!==JSON.stringify(active.settings??null)))await saveCheckpoint(active);}
export async function openFile(bytes,name,sidecarBytes=new Uint8Array(),sidecarName='',replay=false,newWorld=null){
 if(busy||staging)throw new Error('请先完成或取消当前操作');
 if(replay?!/\.terp$/i.test(name):(!/\.wld$/i.test(name)||sidecarName&&(!/\.twld$/i.test(sidecarName)||name.slice(0,-4).toLowerCase()!==sidecarName.slice(0,-5).toLowerCase())))throw new Error('请选择同名 .wld/.twld，原编辑状态保留');
 if(bytes.length+sidecarBytes.length>256*1024*1024)throw new Error('世界和配套文件超过当前读取预算');
 const retainedSettings=active&&!replay?validateSettings(JSON.parse(hooks().Settings())):null;
 const file=new File([bytes],name),epoch=++opening;busy=true;
 const sidecar=sidecarName?new File([sidecarBytes],sidecarName):null;
 clearTimeout(saveTimer);saveTimer=null;
 let candidate;
 try{
  candidate=createSession(null,sidecar,replay,newWorld);staging=candidate;status='正在打开世界；原编辑状态保留，可以取消';publish();
  const result=await candidate.session.open(file);
  if(retainedSettings)result.info=(await candidate.session.request('toolPreferences',{payload:retainedSettings.toolState})).info;
  if(epoch!==opening||candidate!==staging)throw new DOMException('迟到的加载结果','AbortError');
  if(active?.info.clipboard){
   const carried=await active.session.request('clipboardExport',{});
   if(epoch!==opening||candidate!==staging)throw new DOMException('剪贴板交接已取消','AbortError');
   const imported=await candidate.session.request('clipboardImport',{bytes:carried.bytes});result.info=imported.info;
   await candidate.session.request('validateRecovery',{});
  }
  await preserveBeforeSwitch();
  if(epoch!==opening||candidate!==staging)throw new DOMException('打开已取消','AbortError');
  candidate.original=result.generatedSource?new File([result.generatedSource],name):file;candidate.originalSidecar=sidecar;candidate.info=result.info;candidate.downloadedRevision=newWorld||replay?-1:result.info.revision;
  apply(result);const old=active;active=candidate;staging=null;originalFile=candidate.original;originalSidecar=sidecar;old?.session.close();
  if(retainedSettings){retainedSettings.toolState=result.info.toolState;candidate.settings=retainedSettings;hooks().ApplySettings(JSON.stringify(retainedSettings));}
  storageStatus='';
  status=`${info.title} · v${info.version} · ${info.width}×${info.height}${sidecar?' · 已加载模组配套；导出会重建已知区段，请保留原始副本':''}`;
 }catch(error){candidate?.session.close();if(staging===candidate)staging=null;status=error.name==='AbortError'?'打开已取消，原编辑状态保留':`打开失败，原编辑状态保留：${error.message}`;}
 finally{busy=false;completedOpens++;publish();if(active&&(active.savedRevision<active.info.revision||active.savedClipboardRevision!==(active.info.clipboardRevision??0)))scheduleSave(active);}
 return '{}';
}
async function restoreLast(selectedId=null){
 if(busy||staging)throw new Error('请先完成或取消当前操作');
 const epoch=++opening;busy=true;status='读取本机恢复进度…';clearTimeout(saveTimer);saveTimer=null;publish();let candidate;
 try{
  const head=selectedId?{id:selectedId}:await checkpoints.latest();if(!head)throw new Error('没有可恢复的本机进度');
  const record=await checkpoints.get(head.id);if(!record)throw new Error('本机恢复记录已不存在');
  if(epoch!==opening)throw new DOMException('恢复已取消','AbortError');
  candidate=createSession(record.revision);staging=candidate;status='正在恢复世界及撤销历史；当前编辑保留';publish();
  const result=await candidate.session.open(record.checkpoint);
  if(!!result.info.isTModLoader!==!!record.originalSidecar)throw new Error('恢复世界与原始配套不一致，未替换当前世界');
  const restoredSettings=validateSettings(record.settings,result.catalog);
  if(epoch!==opening||candidate!==staging)throw new DOMException('恢复已取消','AbortError');
  await preserveBeforeSwitch();
  if(epoch!==opening||candidate!==staging)throw new DOMException('恢复已取消','AbortError');
  candidate.id=record.id;candidate.persistedToken=record.storageToken;
  candidate.original=record.original;candidate.originalChecksum=record.originalChecksum;candidate.originalSidecar=record.originalSidecar??null;candidate.originalSidecarChecksum=record.originalSidecarChecksum;candidate.info=result.info;candidate.settings=record.settings;candidate.savedRevision=record.revision;candidate.savedClipboardRevision=result.info.clipboardRevision??0;candidate.savedSettings=JSON.stringify(record.settings);candidate.persisted=!record.isBackup;
  apply(result);const old=active;active=candidate;staging=null;originalFile=record.original;originalSidecar=record.originalSidecar??null;old?.session.close();storageStatus='已恢复本机进度及撤销历史';status=info.title;
  publish();if(restoredSettings)hooks().ApplySettings(JSON.stringify(restoredSettings));
 }catch(error){candidate?.session.close();if(staging===candidate)staging=null;status='恢复未完成，原编辑状态保留：'+error.message;}
 finally{busy=false;completedOpens++;publish();}
}
export async function run(action,payload='null'){return execute(action,JSON.parse(payload));}
export async function importTemplate(bytes,name){if(!/\.TEditSch$/i.test(name))throw new Error('请选择 .TEditSch 模板');return execute('templateImport',{file:new File([bytes],name)});}
async function rollbackOperation(transaction,refresh=true,snapshot=transaction.snapshot){
 const owner=transaction.owner;transaction.phase=refresh?'rollback':'restart';
 status=refresh?'正在恢复操作前的世界、撤销历史和模板…':'正在准备大区域操作；恢复计算状态后执行，可取消';publish();
 if(!refresh)active=null;owner.session.close();
 const candidate=createSession(snapshot.info.revision);
 try{
  const result=await candidate.session.open(new Blob([snapshot.bytes]));
  for(const key of ['id','persistedToken','original','originalChecksum','originalSidecar','originalSidecarChecksum','settings','savedRevision','downloadedRevision','savedSettings','persisted'])candidate[key]=owner[key];
  candidate.savedClipboardRevision=owner.savedClipboardRevision===snapshot.info.clipboardRevision?result.info.clipboardRevision:-1;
  candidate.info=result.info;active=candidate;if(refresh)apply(result);else renderer.rebind(owner,candidate);return candidate;
 }catch(error){candidate.session.close();active=null;throw new Error('操作前状态自动恢复失败，请恢复本机进度或下载原始副本：'+error.message);}
}
async function execute(action,payload=null){
 if(action==='initialize'){try{autoSave=localStorage.getItem(preferenceKey)!=='false';recoveryAvailable=!!(await checkpoints.latest());storageStatus=recoveryAvailable?'有本机进度可恢复':'';}catch(error){storageStatus='本机存储不可用：'+error.message;}publish();return '{}';}
 if(action==='autoSave'){autoSave=!autoSave;try{localStorage.setItem(preferenceKey,String(autoSave));}catch(error){storageStatus='自动保存偏好未能持久保存：'+error.message;}clearTimeout(saveTimer);saveTimer=null;if(autoSave&&active)scheduleSave(active);publish();return '{}';}
 if(action==='recoveries'){recoveries=await checkpoints.list();recoveryAvailable=recoveries.length>0;status=`本机恢复与备份 ${recoveries.length} 份；每个世界保留最近 ${maxBackups()} 份历史备份，空间由浏览器管理`;publish();return '{}';}
 if(action==='restoreSelected'){if(typeof payload?.id!=='string'||!payload.id)throw new Error('请选择恢复记录');await restoreLast(payload.id);return '{}';}
 if(action==='deleteSelected'){
  if(busy||staging||active?.saving)throw new Error('请等待当前操作及保存完成');
  await checkpoints.remove(payload.id);if(active?.id===payload.id){active.persisted=false;active.persistedToken=null;active.savedRevision=-1;active.savedClipboardRevision=-1;}
  recoveries=await checkpoints.list();recoveryAvailable=recoveries.length>0;status=payload.id.includes('#')?'已删除所选历史备份；当前进度保留':'已删除所选世界的本机进度及其历史备份；当前打开的世界保留';publish();return '{}';
 }
 if(action==='restore'){await restoreLast();return '{}';}
 if(action==='libraryList'){library=await templateStore.list();status=`本机模板库 ${library.length} / 32；总预算128MiB`;publish();return '{}';}
 if(action==='libraryDelete'){if(busy||staging)throw new Error('请等待当前操作完成');await templateStore.remove(payload.id);library=await templateStore.list();status='已删除所选库内模板，当前模板保留';publish();return '{}';}
 if(action==='reloadOriginal'){if(!active||busy||staging)throw new Error('请等待当前操作完成');await openFile(new Uint8Array(await active.original.arrayBuffer()),active.original.name,active.originalSidecar?new Uint8Array(await active.originalSidecar.arrayBuffer()):new Uint8Array(),active.originalSidecar?.name||'');return '{}';}
 if(action==='original'){if(!originalFile)throw new Error('没有可下载的原始文件');const file=originalFile,pair=originalSidecar;if(pair){const bytes=hooks().PackPair(new Uint8Array(await file.arrayBuffer()),new Uint8Array(await pair.arrayBuffer()),file.name,pair.name);downloadWorld(bytes,file.name.replace(/\.wld$/i,'')+'-original.zip');}else downloadWorld(file,file.name);return '{}';}
 if(!active)throw new Error(originalFile?'处理程序已停止，可恢复最后成功保存的进度或下载原始副本':'请先打开世界');
 if(busy||staging)throw new Error('世界正在操作，请稍候');
 const initialUi=validateSettings(JSON.parse(hooks().Settings()));let owner=active;const epoch=exportEpoch;busy=true;status='正在准备可回滚操作；可以取消';publish();
 let transaction=null,rendererPaused=false;
 try{
  if(owner.saving)await owner.saving;
  if(action==='save'){
   clearTimeout(saveTimer);saveTimer=null;
   owner.settings=validateSettings(payload);
   const persistent=await checkpoints.requestPersistence();await saveCheckpoint(owner,true);
   status=persistent?'进度已保存到本机':'进度已保存到本机；浏览器清理站点数据会删除记录';return '{}';
  }
  const nextSettings=(action==='stroke'||action==='tool')?validateSettings(payload.settings):payload?.uiSettings?validateSettings(payload.uiSettings):null;
  transaction={owner,phase:'snapshot',cancelled:false,snapshot:null};operation=transaction;
  transaction.snapshot=await owner.session.request('checkpoint',{});
  if(transaction.cancelled){status='操作已取消，尚未执行修改';return '{}';}
  // Reuse the protected checkpoint before the measured high-memory operations.
  // Ordinary history keeps its existing fast path.
  const maximumHistory=['undo','redo'].includes(action)&&info.width*info.height>=20160000&&info.clipboard&&info.clipboard.width*info.clipboard.height>1048576;
  if(maximumHistory||(action==='floating'&&payload?.operation==='accept'&&info.floatingPaste?.active&&info.floatingPaste.width*info.floatingPaste.height>1048576)){
   renderer.suspend();rendererPaused=true;
   owner=await rollbackOperation(transaction,false);transaction.owner=owner;
   // Restore's exported byte[] input is unrooted after the call returns.
   // Collect it before the next allocation-heavy command, not during restore.
   const collected=await owner.session.request('collect',{});owner.info=collected.info;
   if(transaction.cancelled){apply({info:owner.info});status='操作已取消，世界、撤销历史和模板已保留';return '{}';}
  }
  transaction.phase='command';status='正在处理；取消将停止计算并恢复操作前状态';publish();
  let result;
  const largeClipboard=info.clipboard&&info.clipboard.width*info.clipboard.height>1048576;
  let carriedTransformClipboard=null;
  if(action==='transformWorld'&&info.clipboard){
   carriedTransformClipboard=await owner.session.request('clipboardExport',{});
   if(largeClipboard){
    transaction.releasedClipboard=true;await owner.session.request('clipboardRelease');
    const computationCheckpoint=await owner.session.request('checkpoint',{});
    renderer.suspend();rendererPaused=true;
    owner=await rollbackOperation(transaction,false,computationCheckpoint);transaction.owner=owner;
    const collected=await owner.session.request('collect',{});owner.info=collected.info;
    transaction.phase='command';status='正在处理；取消将停止计算并恢复操作前状态';publish();
   }
   if(transaction.cancelled)throw new DOMException('操作已取消','AbortError');
  }
  if(largeClipboard&&['copy','cut','templateImport','libraryLoad'].includes(action)){
   transaction.releasedClipboard=true;await owner.session.request('clipboardRelease');
   if(transaction.cancelled)throw new DOMException('操作已取消','AbortError');
  }
  if(largeClipboard&&['flipX','flipY','rotate'].includes(action)){
   const state=await owner.session.request('clipboardExport');
   transaction.utility=createSession(null,null,false,null,{clipboard:{operation:action,allowSpriteRemoval:payload?.allowSpriteRemoval===true}});
   try{
    transaction.releasedClipboard=true;await owner.session.request('clipboardRelease');
    if(transaction.cancelled)throw new DOMException('操作已取消','AbortError');
    const transformed=await transaction.utility.session.open(new Blob([state.bytes]));
    transaction.utility.session.close();
    if(transaction.cancelled)throw new DOMException('操作已取消','AbortError');
    result=await owner.session.request('clipboardImport',{bytes:transformed.bytes});
   }finally{transaction.utility.session.close();}
  }
  else if(action==='transformWorld'&&(info.width*info.height>1048576||payload.width*payload.height>1048576)){
   const output=await owner.session.request('transformWorldOutput',{payload});
   if(transaction.cancelled)throw new DOMException('操作已取消','AbortError');
   renderer.suspend();rendererPaused=true;owner.session.close();
   const candidate=createSession(null,null,false,null,null,owner.info.revision);transaction.utility=candidate;
   try{
    result=await candidate.session.open(new Blob([output.bytes]));
    if(transaction.cancelled)throw new DOMException('操作已取消','AbortError');
    for(const key of ['id','persistedToken','original','originalChecksum','originalSidecar','originalSidecarChecksum','settings','savedRevision','downloadedRevision','savedSettings','persisted'])candidate[key]=owner[key];
    candidate.savedClipboardRevision=-1;candidate.info=result.info;active=candidate;owner=candidate;transaction.owner=candidate;transaction.utility=null;
   }catch(error){candidate.session.close();throw error;}
  }
  else if(action==='libraryLoad')result=await owner.session.request('clipboardImport',{bytes:await templateStore.get(payload.id)});
  else if(action==='script'){let timer;try{result=await Promise.race([owner.session.request('script',{payload}),new Promise((_,reject)=>{timer=setTimeout(()=>{owner.session.close();reject(new Error('脚本超过浏览器执行时限，已停止并恢复修改前状态'));},Math.min(300000,Math.max(50,payload.timeoutMs||10000))+2000);})]);}finally{clearTimeout(timer);}}
  else result=await owner.session.request(action==='librarySave'?'clipboardExport':action,action==='templateImport'?{file:payload.file}:{payload:action==='export'?{worldName:owner.original.name}:action==='exportVersion'?{...payload,worldName:owner.original.name}:payload});
  if(carriedTransformClipboard){
   const imported=await owner.session.request('clipboardImport',{bytes:carriedTransformClipboard.bytes});result.info=imported.info;
   if(transaction.cancelled)throw new DOMException('操作已取消','AbortError');
  }
  // A new clipboard must remain exportable/checkpointable before UI commit.
  // Reuse the original codec and existing protected rollback; never strand edits.
  if(result.info?.clipboard&&(result.info.clipboardRevision!==info.clipboardRevision||action==='transformWorld')){
   transaction.changedClipboard=true;
   await owner.session.request('validateRecovery',{});
   if(transaction.cancelled)throw new DOMException('操作已取消','AbortError');
  }
  if(action==='transformWorld')result.info=(await owner.session.request('toolPreferences',{payload:initialUi.toolState})).info;
  if(owner!==active)throw new DOMException('世界已切换','AbortError');
  if(action==='librarySave'){
   if(transaction.cancelled)return '{}';await templateStore.put(payload.title,result.bytes);library=await templateStore.list();status='当前模板已保存到本机模板库（含源模组身份）';
  }else if(action==='report'){
   if(epoch!==exportEpoch){status='报告下载已取消';return '{}';}
   downloadWorld(new Blob([result.report],{type:'application/json;charset=utf-8'}),owner.original.name.replace(/\.wld$/i,'')+'-保存变化报告.json');
   const report=JSON.parse(result.report);status=report.unavailable??`保存报告：原版规范化移除NBT ${report.originalToCanonical.tags.Removed}项、改变${report.originalToCanonical.tags.Changed}项；世界字节变化不等于语义损坏。原始副本仍保留`;
  }else if(action==='templateExport'){
   if(epoch!==exportEpoch){status='模板下载已取消，原模板保留';return '{}';}
   downloadWorld(result.bytes,'template.TEditSch');status='已导出原版建筑模板';
  }else if(action==='playerMap'||action==='replayExport'||action==='recordingExport'){if(epoch!==exportEpoch)return '{}';downloadWorld(result.bytes,info.title+(action==='playerMap'?'.map':'.terp'));apply(result);owner.info=result.info;status='已导出原版'+(action==='playerMap'?'玩家地图':'图格回放')+'文件';
  }else if(action==='exportVersion'){
   if(epoch!==exportEpoch){status='版本副本下载已取消';return '{}';}
   downloadWorld(result.bytes,owner.original.name.replace(/\.wld$/i,'')+'-v'+payload.gameVersion+(result.paired?'.zip':'.wld'));status='已按原版规则导出指定版本副本；降级可能移除目标版本不支持的内容，请在游戏内验证副本';
  }else if(action==='export'){
   if(epoch!==exportEpoch){status='下载已取消；序列化已结束，编辑状态保留';return '{}';}
   downloadWorld(result.bytes,originalFile.name.replace(/\.wld$/i,'')+'-edited'+(result.paired?'.zip':'.wld'));owner.downloadedRevision=owner.info.revision;status=result.paired?'已成对导出世界与模组配套；原版保存会重建部分区段，原始副本仍保留':'已导出副本';
  }else{apply(result);owner.info=result.info;if(nextSettings)owner.settings=structuredClone(nextSettings);if(result.info.toolState){
  const latest=validateSettings(JSON.parse(hooks().Settings())),merged=structuredClone(latest);
  for(const [group,values] of Object.entries(result.info.toolState)){
   for(const [key,value] of Object.entries(values))if(JSON.stringify(latest.toolState[group]?.[key])===JSON.stringify(initialUi.toolState[group]?.[key]))merged.toolState[group][key]=value;
  }
  hooks().ApplySettings(JSON.stringify(merged));owner.settings=validateSettings(JSON.parse(hooks().Settings()));
 }status=action==='rotate'?'已按原版旋转；家具、箱子、告示牌及实体已移除':action==='bindLegacy'?'已按当前世界的 ID 定义绑定旧模板；世界未修改':`${info.title} · 历史 ${info.undoIndex}`;if(['uvEditor','spriteEditor','desktopImport','transformWorld','desktopEdit','script','recordingExport','floating','pixelArt','point','domain','cad','sprite','tool','stroke','cut','delete','paste','undo','redo','copy','flipX','flipY','rotate','templateImport','bindLegacy'].includes(action))scheduleSave(owner);}
  if(action==='script'&&!transaction.cancelled&&epoch===exportEpoch){for(const d of result.downloads||[])downloadWorld(d.bytes,d.name);}
  return JSON.stringify(info);
 }catch(error){
  if(transaction?.snapshot&&(transaction.cancelled||transaction.releasedClipboard||transaction.changedClipboard||!owner.session.loaded||['uvEditor','spriteEditor','desktopImport','transformWorld','desktopEdit','script','recordingExport','floating','pixelArt','point','domain','cad','sprite','tool','stroke','cut','delete','paste','undo','redo'].includes(action))){
   await rollbackOperation(transaction);status=transaction.cancelled?'操作已取消，计算已停止；操作前的世界、撤销历史和模板已恢复':'操作失败，已回滚到操作前状态：'+error.message;
   if(transaction.cancelled)return '{}';
   throw new Error(status);
  }else{status=error.message;if(action==='save')saveFailure(error);if(!owner.session.loaded){active=null;status+='；处理程序已停止，可恢复最后保存进度或下载原始副本';}}
  throw error;
 }
 finally{if(operation===transaction)operation=null;busy=false;if(rendererPaused)renderer.resume();completedCommands++;publish();if(active&&autoSave)scheduleSave(active);}
}
export function cancel(){
 if(operation){
  if(operation.phase==='rollback'){status='正在恢复操作前状态，请等待';publish();return;}
  operation.cancelled=true;exportEpoch++;
  if(operation.phase==='command'){operation.utility?.session.close();operation.owner.session.close();status='计算已停止，正在恢复操作前状态';}
  else status='已请求取消，安全快照准备完成后退出，尚未执行修改';
  publish();return;
 }
 if(staging){opening++;staging.session.close();staging=null;status='打开已取消，原编辑状态保留';publish();}
 else if(busy){exportEpoch++;status='已请求取消：若正在导出，将取消下载交付，等待序列化结束';publish();}
}
export function diagnostics(){return {activeGeneration:active?.generation,entryId:active?.id,savedRevision:active?.savedRevision,saving:!!active?.saving,autoSave,recoveryAvailable,storageStatus,operationPhase:operation?.phase,stagingGeneration:staging?.generation,stagingReady:staging?.ready,busy,completedOpens,completedCommands,uiOwnsWorld:false,info,originalFileName:originalFile?.name,originalSidecarName:originalSidecar?.name};}
export async function inspectHash(){
 if(!active||busy||staging)throw new Error('处理尚未结束');
 const result=await active.session.request('export',{payload:{worldName:active.original.name}});
 return result.worldSha256;
}
export async function inspectMemory(){if(!active||busy||staging)throw new Error('处理尚未结束');return (await active.session.request('collect',{})).info;}
export function close(){renderer.command(JSON.stringify({operation:'clear'}));opening++;clearTimeout(saveTimer);saveTimer=null;const previous=active,candidate=staging;staging=null;active=null;originalFile=null;originalSidecar=null;candidate?.session.close();previous?.session.close();}
// Poll metadata only: Avalonia owns its controls; no world data crosses this path.
setInterval(()=>{
 if(!active||busy||staging||!hooks()?.Settings)return;
 try{const settings=validateSettings(JSON.parse(hooks().Settings()));if(JSON.stringify(settings)!==JSON.stringify(active.settings??null)){active.settings=settings;scheduleSave(active);}}
 catch(error){storageStatus='设置尚未保存：'+error.message;publish();}
},500);
window.addEventListener('pagehide',close);

// Browsers provide File objects for drops; reuse the same staged open boundary.
export async function openDropped(files){
 const list=Array.from(files),worlds=list.filter(f=>/\.wld$/i.test(f.name)),pairs=list.filter(f=>/\.twld$/i.test(f.name));
 if(worlds.length!==1||pairs.length>1||worlds.length+pairs.length!==list.length)throw new Error('请拖入一个 .wld，可同时拖入一个同名 .twld；原编辑状态保留');
 if(list.reduce((sum,f)=>sum+f.size,0)>256*1024*1024)throw new Error('世界与配套文件超过当前256MiB读取预算');
 return openFile(new Uint8Array(await worlds[0].arrayBuffer()),worlds[0].name,pairs.length?new Uint8Array(await pairs[0].arrayBuffer()):new Uint8Array(),pairs[0]?.name??'');
}
window.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
window.addEventListener('drop',event=>{if(!event.dataTransfer?.files.length)return;event.preventDefault();void openDropped(event.dataTransfer.files).catch(error=>{status=error.message;publish();});});

export async function importReplay(bytes,name){return openFile(bytes,name,new Uint8Array(),'',true);}
export async function importImage(bytes,name,options){
 if(bytes.length>16*1024*1024)throw new Error('图片文件超过16MiB预算');
 const bitmap=await createImageBitmap(new Blob([bytes]));
 try{if(bitmap.width>1024||bitmap.height>1024)throw new Error('图片最大1024×1024，请先缩小');const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;let text='';for(let i=0;i<rgba.length;i+=8192)text+=String.fromCharCode(...rgba.subarray(i,i+8192));return execute('pixelArt',{width:canvas.width,height:canvas.height,rgba:btoa(text),options:JSON.parse(options)});}finally{bitmap.close();}
}

export async function createWorld(options){const before=active;await openFile(new Uint8Array(),"NewWorld.wld",new Uint8Array(),"",false,JSON.parse(options));if(active===before)throw new Error(status);return '{}';}

const renderer=createRenderer({owner:()=>active,hooks,notify:message=>{status=message;publish();}});
export function renderView(json){return renderer.command(json);}
export function chooseTextures(){return renderer.choose();}
export function exportPng(){return renderer.exportPng();}
window.r4Render=renderer;

export async function desktopData(action,json){
 if(action==='settingsSnapshot')return JSON.stringify({view:structuredClone(renderer.diagnostics().view),input:localStorage.getItem('tedit-r5-input'),desktop:localStorage.getItem('tedit-r5-desktop'),autoSave});
 if(action==='settingsRestore'){const previous=JSON.parse(json);for(const [key,value] of [['tedit-r5-input',previous.input],['tedit-r5-desktop',previous.desktop]]){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}autoSave=previous.autoSave;localStorage.setItem(preferenceKey,String(autoSave));clearTimeout(saveTimer);saveTimer=null;if(autoSave&&active)scheduleSave(active);await renderer.command(JSON.stringify({operation:'set',view:previous.view}));publish();return '{}';}
 if(action==='projectLink'){const url={github:'https://github.com/TEdit/Terraria-Map-Editor',discord:'https://discord.gg/xHcHd7mfpn',patreon:'https://www.patreon.com/bePatron?u=2278324'}[json];if(!url)throw new Error('未知原版项目链接');window.open(url,'_blank','noopener,noreferrer');return '{}';}

 if(action==='chooseColor')return chooseColor(json,(target,value)=>hooks().ApplyColor(target,value));
 if(action.startsWith('explorer'))return worldExplorer(action,json);
 if(action.startsWith('sheet'))return sheetStorage(action,json);
 if(action==='checkUpdate'){const current=await loadedBrowserBuild;const response=await fetch(new URL('./build-version.json',import.meta.url),{cache:'no-store'});if(!response.ok)throw new Error('无法检查此站点版本：'+response.status);const latest=(await response.json()).version;if(typeof latest!=='string'||!/^[a-f0-9]{64}$/.test(latest))throw new Error('站点版本信息无效');return JSON.stringify({current,latest,available:current!==latest});}
 if(action==='openPlayer')return playerHost.open();
 if(action==='editPlayer')return playerHost.edit(json);
 if(action==='playerPreview'){const result=await playerHost.preview(json);return await renderer.command(JSON.stringify({operation:'preview',kind:'player',id:0,plain:Array.from(result.bytes),preview:JSON.parse(json).preview}));}
 if(action==='savePlayer')return playerHost.save();
 if(action.startsWith('script'))return scriptLibrary(action,json);
 if(action==='readInputBindings')return localStorage.getItem('tedit-r5-input')||'{}';
 if(action==='saveInputBindings'){if(json.length>131072)throw new Error('快捷键设置超过128KiB');localStorage.setItem('tedit-r5-input',json);return '{}';}
 if(action==='examples')return await(await fetch(new URL('./script-examples.json',import.meta.url))).text();
 if(action==='preference'){localStorage.setItem('tedit-r5-desktop',json);return '{}';}
 if(action==='readPreference')return localStorage.getItem('tedit-r5-desktop')||'{}';
 if(action==='close'){if(busy||staging)throw new Error('请等待当前操作完成');close();info={};status='世界已关闭';publish();return '{}';}
 if(action==='wiki'){window.open('https://terraria.wiki.gg/zh/wiki/Terraria_Wiki','_blank','noopener,noreferrer');return '{}';}
 throw new Error('浏览器宿主尚未接入该操作：'+action);
}
