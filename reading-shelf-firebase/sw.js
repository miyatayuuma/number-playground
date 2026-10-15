// Offline cache contains public application code only; no Firebase user data.
const CACHE_NAME='yondene-static-v1';
const PUBLIC_ASSETS=['/','/index.html','/style.css','/app.mjs','/domain.mjs','/firebase-config.mjs','/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png'];
const PUBLIC_PATHS=new Set(PUBLIC_ASSETS);

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(PUBLIC_ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  // Do NOT intercept or store Firebase / Google auth / external book-cover traffic.
  if(url.origin!==self.location.origin||!PUBLIC_PATHS.has(url.pathname))return;
  event.respondWith(
    fetch(event.request).then(response=>{
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(c=>c.put(event.request,copy)));
      }
      return response;
    }).catch(()=>caches.match(event.request))
  );
});
