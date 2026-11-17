/* مدار — بيانات السوق المرجعية: قراءة فقط من واجهة Gate العامة (بدون مفاتيح) مع بديل محاكاة */
(function(){
'use strict';
const REST='https://api.gateio.ws/api/v4',WS='wss://api.gateio.ws/ws/v4/';
const INTERVAL_SEC={'15m':900,'1h':3600,'4h':14400,'1d':86400,'7d':604800};
const listeners=new Set();
const M={mode:'sim',enabled:true,lastUpdate:0,error:'',candles:new Map(),books:new Map(),trades:new Map()};
let ws=null,wsTimer=null,pingTimer=null,simTimer=null,retry=0,pairs=[];
function emit(kind,data){for(const fn of listeners){try{fn(kind,data)}catch(e){console.error(e)}}}
async function getJSON(path,timeout=8000){const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),timeout);try{const r=await fetch(REST+path,{signal:ctl.signal,cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(t)}}
function seedOf(s){return s.split('').reduce((v,c)=>v*31+c.charCodeAt(0)>>>0,7)}
function rng(seed){let x=seed||1;return()=>{x^=x<<13;x>>>=0;x^=x>>17;x^=x<<5;x>>>=0;return x/4294967296}}
function simCandles(symbol,price,interval,n=96){const step=INTERVAL_SEC[interval]||3600,now=Math.floor(Date.now()/1000/step)*step,r=rng(seedOf(symbol+interval));const vol={'15m':.004,'1h':.007,'4h':.013,'1d':.028,'7d':.06}[interval]||.007;let p=1;const out=[];for(let i=0;i<n;i++){const o=p,c=o*(1+(r()-.5)*2*vol),h=Math.max(o,c)*(1+r()*vol*.6),l=Math.min(o,c)*(1-r()*vol*.6);out.push({t:now-(n-1-i)*step,o,c,h,l,v:50+r()*100});p=c}const f=price/p;for(const k of out){k.o*=f;k.c*=f;k.h*=f;k.l*=f}return out}
async function loadCandles(symbol,interval,fallbackPrice){
  const key=symbol+'|'+interval,cached=M.candles.get(key);
  if(cached&&Date.now()-cached.at<60000)return cached;
  if(M.enabled){try{const raw=await getJSON(`/spot/candlesticks?currency_pair=${symbol}_USDT&interval=${interval}&limit=96`);
      const data=raw.map(r=>({t:+r[0],v:+r[6],c:+r[2],h:+r[3],l:+r[4],o:+r[5]})).filter(k=>k.o>0);if(data.length){const res={at:Date.now(),data,src:'live'};M.candles.set(key,res);return res}}catch(e){M.error=String(e.message||e)}}
  const res={at:Date.now(),data:simCandles(symbol,fallbackPrice,interval),src:'sim'};M.candles.set(key,res);return res}
function patchLastCandle(symbol,price){for(const [key,res] of M.candles){if(!key.startsWith(symbol+'|'))continue;const iv=key.split('|')[1],step=INTERVAL_SEC[iv],d=res.data,last=d[d.length-1];if(!last)continue;const now=Math.floor(Date.now()/1000);if(now>=last.t+step&&res.src==='live'){d.push({t:last.t+step,o:last.c,h:Math.max(last.c,price),l:Math.min(last.c,price),c:price,v:0});if(d.length>120)d.shift()}else{last.c=price;last.h=Math.max(last.h,price);last.l=Math.min(last.l,price)}}}
async function loadBook(symbol){if(!M.enabled||M.mode!=='live')return null;try{const [b,t]=await Promise.all([getJSON(`/spot/order_book?currency_pair=${symbol}_USDT&limit=6`,5000),getJSON(`/spot/trades?currency_pair=${symbol}_USDT&limit=8`,5000)]);const book={asks:(b.asks||[]).map(x=>[+x[0],+x[1]]),bids:(b.bids||[]).map(x=>[+x[0],+x[1]])};const trades=(t||[]).map(x=>({p:+x.price,q:+x.amount,side:x.side,t:+x.create_time}));M.books.set(symbol,book);M.trades.set(symbol,trades);return {book,trades}}catch(e){return null}}
function applyTicker(r){const s=(r.currency_pair||'').replace('_USDT','');const last=+r.last;if(!s||!(last>0))return;emit('ticker',{s,price:last,change:+r.change_percentage,vol:+r.quote_volume,high:+r.high_24h,low:+r.low_24h});patchLastCandle(s,last);M.lastUpdate=Date.now()}
async function loadTickers(){const res=await Promise.allSettled(pairs.map(s=>getJSON(`/spot/tickers?currency_pair=${s}_USDT`,7000)));let ok=0;for(const r of res){if(r.status==='fulfilled'&&Array.isArray(r.value)&&r.value[0]){applyTicker(r.value[0]);ok++}}return ok}
function setMode(mode,err=''){if(M.mode===mode&&!err)return;M.mode=mode;if(err)M.error=err;emit('status',{mode:M.mode,error:M.error})}
function startSim(){stopSim();simTimer=setInterval(()=>{if(M.mode==='live')return;emit('simtick')},3000)}
function stopSim(){clearInterval(simTimer);simTimer=null}
function connectWS(){try{ws=new WebSocket(WS)}catch(e){scheduleReconnect();return}
  ws.onopen=()=>{retry=0;ws.send(JSON.stringify({time:Math.floor(Date.now()/1000),channel:'spot.tickers',event:'subscribe',payload:pairs.map(s=>s+'_USDT')}));clearInterval(pingTimer);pingTimer=setInterval(()=>{try{ws.send(JSON.stringify({time:Math.floor(Date.now()/1000),channel:'spot.ping'}))}catch{}},20000)};
  ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.channel==='spot.tickers'&&m.event==='update'&&m.result){applyTicker(m.result);setMode('live')}}catch{}};
  ws.onclose=()=>{clearInterval(pingTimer);if(M.enabled)scheduleReconnect()};ws.onerror=()=>{try{ws.close()}catch{}}}
function scheduleReconnect(){clearTimeout(wsTimer);retry++;const d=Math.min(30000,1500*2**Math.min(retry,4));wsTimer=setTimeout(async()=>{if(!M.enabled)return;const ok=await loadTickers().catch(()=>0);setMode(ok?'live':'sim',ok?'':'تعذّر الوصول إلى بيانات السوق');connectWS()},d)}
async function start(symbols){pairs=symbols;M.enabled=true;startSim();let ok=0;try{ok=await loadTickers()}catch{}setMode(ok?'live':'sim',ok?'':'تعذّر الوصول إلى بيانات السوق؛ تُعرض أسعار محاكاة');connectWS()}
function stop(){M.enabled=false;clearTimeout(wsTimer);clearInterval(pingTimer);if(ws){ws.onclose=null;try{ws.close()}catch{}ws=null}M.candles.clear();M.books.clear();M.trades.clear();setMode('sim','');startSim()}
// إيقاف/استئناف عند إخفاء الصفحة لتوفير البطارية
document.addEventListener('visibilitychange',()=>{if(!M.enabled)return;if(document.hidden){if(ws){ws.onclose=null;try{ws.close()}catch{}ws=null}}else if(!ws){loadTickers().then(ok=>setMode(ok?'live':'sim')).catch(()=>{});connectWS()}});
window.addEventListener('online',()=>{if(M.enabled&&!ws)connectWS()});
window.Market={state:M,start,stop,loadCandles,loadBook,simCandles,on:fn=>listeners.add(fn),INTERVAL_SEC};
})();
