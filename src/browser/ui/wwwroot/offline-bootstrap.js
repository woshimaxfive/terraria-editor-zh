// Platform startup only. Domain files and user data stay outside this cache.
async function prepareOffline(){
 if(!('serviceWorker' in navigator))return {available:false,reason:'Service Worker unavailable'};
 let timeout;
 try{
  const registration=await navigator.serviceWorker.register(new URL('../../service-worker.js',import.meta.url),{scope:new URL('../../',import.meta.url).href,updateViaCache:'none'});
  await Promise.race([
   navigator.serviceWorker.ready.then(()=>navigator.serviceWorker.controller||new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}))),
   new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Offline resource preparation timed out')),60000);})
  ]);
  return {available:!!navigator.serviceWorker.controller,waiting:!!registration.waiting};
 }catch(error){return {available:!!navigator.serviceWorker.controller,reason:String(error)};}
 finally{clearTimeout(timeout);}
}
window.r6Offline=await prepareOffline();
await import('./main.js');
