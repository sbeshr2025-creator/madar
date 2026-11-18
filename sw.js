/* مدار — Service Worker: يعمل دون اتصال للواجهة فقط؛ لا يخزّن بيانات السوق الحية (الحزمة التاريخية الثابتة تُخزَّن عند أول طلب) */
const VERSION='madar-v4';
const SHELL=['./','./index.html','./404.html','./css/landing.css?v=4','./js/landing.js?v=4','./app/','./app/index.html','./app/css/app.css?v=4','./app/js/smart-engine.js?v=4','./app/js/charts.js?v=4','./app/js/market.js?v=4','./app/js/v4.js?v=4','./app/js/smart.js?v=4','./app/js/smart-worker.js?v=4','./app/js/app.js?v=4','./assets/fonts/NotoSansArabic-var.woff2','./manifest.webmanifest','./assets/logo.svg','./assets/favicon.svg','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==location.origin)return; // لا نتدخل في طلبات الأسعار الخارجية
  if(req.mode==='navigate'){e.respondWith(fetch(req).then(r=>{const copy=r.clone();caches.open(VERSION).then(c=>c.put(req,copy));return r}).catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||caches.match(url.pathname.includes('/app/')?'./app/index.html':'./index.html'))));return}
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok){const copy=r.clone();caches.open(VERSION).then(c=>c.put(req,copy))}return r})))});
