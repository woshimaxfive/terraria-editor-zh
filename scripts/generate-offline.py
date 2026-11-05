"""Emit a static, integrity checked application-only cache from actual output."""
from pathlib import Path
import hashlib,json,base64,sys
r=Path(__file__).resolve().parent
root=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else r/'publish'
assets=[]
downloads=[]
entry='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./ui/wwwroot/"><title>TEdit 浏览器编辑器</title></head><body><a href="./ui/wwwroot/">打开编辑器</a></body></html>\n'
(root/'index.html').write_text(entry,encoding='utf-8',newline='\n')
raw=(root/'index.html').read_bytes()
assets.append({'url':'index.html','integrity':'sha256-'+base64.b64encode(hashlib.sha256(raw).digest()).decode('ascii'),'bytes':len(raw)})
for part in ['core','ui']:
 for p in sorted((root/part/'wwwroot').rglob('*')):
  if not p.is_file():continue
  raw=p.read_bytes()
  asset={'url':p.relative_to(root).as_posix(),'integrity':'sha256-'+base64.b64encode(hashlib.sha256(raw).digest()).decode('ascii'),'bytes':len(raw)}
  # The LGPL corresponding-source archive is a user download, not an editor runtime.
  # Keep shipping it at its documented URL; download-manager interception must not
  # prevent the entire editor from installing. Its build hash remains in the manifest.
  (downloads if asset['url']=='ui/wwwroot/vendor/xnb-source.zip' else assets).append(asset)
if len(assets)<400:raise RuntimeError('Incomplete publish tree; offline manifest not generated')
template='''// Adapted from this repository's public/service-worker.js. No user data is cached.
const VERSION=__VERSION__;
const SCOPE=new URL(self.registration.scope);
const CACHE_PREFIX=`terraria-editor-zh:${SCOPE.href}:`;
const CACHE_NAME=CACHE_PREFIX+VERSION;
const APP_SHELL=new URL('ui/wwwroot/index.html',SCOPE).href;
const ASSETS=new Map(__ASSETS__.map(asset=>[new URL(asset.url,SCOPE).href,asset]));
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  try{const cache=await caches.open(CACHE_NAME);await cache.addAll([...ASSETS].map(([url,asset])=>new Request(url,{cache:'reload',integrity:asset.integrity})));}
  catch(error){await caches.delete(CACHE_NAME);throw error;}
 })());
});
// The standard waiting lifecycle protects open world sessions from mixed versions.
// No skipWaiting message or automatic page reload is accepted.
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const names=await caches.keys();await Promise.all(names.filter(name=>name.startsWith(CACHE_PREFIX)&&name!==CACHE_NAME).map(name=>caches.delete(name)));
  await self.clients.claim();
 })());
});
self.addEventListener('message',event=>{
 if(event.data?.type==='BUILD_INFO')event.ports[0]?.postMessage({version:VERSION,assets:ASSETS.size,cacheName:CACHE_NAME});
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==SCOPE.origin||!url.pathname.startsWith(SCOPE.pathname))return;
 let assetUrl=url.origin+url.pathname;
 // Only an explicit update probe bypasses the pinned version cache.
 if(assetUrl===new URL('ui/wwwroot/build-version.json',SCOPE).href&&event.request.cache==='no-store')return;
 if(event.request.mode==='navigate'&&url.pathname===SCOPE.pathname){event.respondWith(Promise.resolve(Response.redirect(new URL('ui/wwwroot/',SCOPE).href,302)));return;}
 if(event.request.mode==='navigate'&&url.pathname===new URL('ui/wwwroot/',SCOPE).pathname)assetUrl=APP_SHELL;
 const asset=ASSETS.get(assetUrl);if(!asset)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE_NAME),cached=await cache.match(assetUrl);if(cached)return cached;
  try{const response=await fetch(new Request(assetUrl,{cache:'reload',integrity:asset.integrity}));if(!response.ok)throw new Error('Application asset unavailable');await cache.put(assetUrl,response.clone());return response;}
  catch{return new Response('应用离线资源不完整，请联网后关闭所有编辑器页面再重新打开；本机存档保留。',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});}
 })());
});
'''
encoded=json.dumps(assets,ensure_ascii=False,separators=(',',':'))
version=hashlib.sha256((template+encoded).encode('utf-8')).hexdigest()
(root/'service-worker.js').write_text(template.replace('__VERSION__',json.dumps(version)).replace('__ASSETS__',encoded),encoding='utf-8')
(root/'offline-manifest.json').write_text(json.dumps({'version':version,'assets':assets,'downloads':downloads,'bytes':sum(a['bytes'] for a in assets)},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Integrity checked offline cache: {len(assets)} application assets, {sum(a["bytes"] for a in assets)} bytes')
