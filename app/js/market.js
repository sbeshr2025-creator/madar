/* مدار v4 — أسعار مرجعية للعرض فقط. ترتيب المصادر:
   1) لقطة Ajcoin العامة على raw.githubusercontent.com (قراءة فقط، بلا مفاتيح)
   2) واجهة CoinGecko العامة (طابور طلبات + تخزين مؤقت + احترام حد الطلبات)
   3) محاكي محلي.  لا تُرسل أي أوامر لأي جهة، ولا توجد حسابات أو أموال حقيقية. */
(function(){
'use strict';
const RAW='https://raw.githubusercontent.com/sbeshr2025-creator/ajcoin-data/main/';
const CG='https://api.coingecko.com/api/v3';
const IDS={BTC:'bitcoin',ETH:'ethereum',SOL:'solana',BNB:'binancecoin',XRP:'ripple',ADA:'cardano',DOGE:'dogecoin',LINK:'chainlink',AVAX:'avalanche-2',TRX:'tron',DOT:'polkadot',LTC:'litecoin',SUI:'sui',NEAR:'near',UNI:'uniswap',AAVE:'aave'};
const STEP={'15m':900,'1h':3600,'4h':14400,'1d':86400};
const CG_OHLC={'15m':{days:1},'1h':{days:1},'4h':{days:30},'1d':{days:30,agg:86400}};
const POLL_MS=90000,CANDLE_TTL=5*60000,CG_GAP=2500,SNAP_STALE=15*60;
const listeners=new Set();
const M={mode:'sim',src:'sim',enabled:true,lastUpdate:0,snapT:0,error:'',candles:new Map(),ready:false};
let pollTimer=null,simTimer=null,pairs=[],cgQueue=Promise.resolve(),cgLast=0,cgPausedUntil=0,skew=0,snapDownUntil=0,c5=null;
try{skew=Number(localStorage.getItem('madar_snap_skew')||0)||0}catch{}
function emit(k,d){for(const fn of listeners){try{fn(k,d)}catch(e){console.error(e)}}}
function tfetch(url,ms){const ac=new AbortController(),t=setTimeout(()=>ac.abort(),ms||8000);return fetch(url,{signal:ac.signal,credentials:'omit',cache:'no-store'}).finally(()=>clearTimeout(t))}
async function rawJson(p,ms){const r=await tfetch(RAW+p,ms);if(!r.ok){const e=new Error('http '+r.status);e.status=r.status;throw e}return r.json()}
const nowS=()=>Date.now()/1000+skew;
function adoptSkew(t){const d=t-Date.now()/1000;if(Math.abs(d-skew)>120){skew=Math.abs(d)>120?Math.round(d):0;try{localStorage.setItem('madar_snap_skew',String(skew))}catch{}}}
// ---------- 1) لقطة Ajcoin ----------
let mCache=null,mNext=0,mP=null;
async function snapMinute(){if(mCache&&nowS()<mNext)return mCache;if(mP)return mP;mP=(async()=>{const b=Math.floor((nowS()-25)/60);let m=null;for(let i=0;i<3&&!m;i++){try{m=await rawJson('m/'+(b-i)+'.json',7000)}catch(e){if(!e.status)throw e}}
  if(!m){const L=await rawJson('latest.json',7000);adoptSkew(L.t);m=await rawJson('m/'+L.b+'.json',8000)}if(mCache&&m.t<mCache.t)m=mCache;mCache=m;M.snapT=m.t*1000;mNext=(m.b+1)*60+25;if(mNext<nowS())mNext=nowS()+30;return m})().finally(()=>{mP=null});return mP}
async function snapIndex(){const b5=Math.floor((nowS()-40)/300);if(c5&&(c5.k===b5||c5.k===b5-1)&&Date.now()-c5.at<300000)return c5;for(let i=0;i<2;i++){const k=b5-i;try{const idx=await rawJson('c/'+k+'/index.json',6000);c5={k,idx,at:Date.now()};return c5}catch(e){if(!e.status)throw e}}const L=await rawJson('latest.json',7000);adoptSkew(L.t);const idx=await rawJson('c/'+L.b5+'/index.json',7000);c5={k:L.b5,idx,at:Date.now()};return c5}
function parseGate(rows){const out=[];for(const r of rows||[]){const t=+r[0],v=+r[1],c=+r[2],h=+r[3],l=+r[4],o=+r[5];if(!(c>0&&h>0&&l>0))continue;out.push({t,o,h,l,c,v,closed:String(r[7]).toLowerCase()!=='false'})}out.sort((a,b)=>a.t-b.t);return out}
async function snapCandles(sym,tf){const ci=await snapIndex(),name=sym+'_USDT';if(!((ci.idx[name]||[]).includes(tf)))return null;const rows=await rawJson('c/'+ci.k+'/'+name+'_'+tf+'.json',8000);return parseGate(rows)}
async function pollSnapshot(){if(Date.now()<snapDownUntil)throw new Error('snapshot-down');try{const m=await snapMinute();if(nowS()-m.t>SNAP_STALE)throw new Error('stale');const want=new Set(pairs.map(s=>s+'_USDT'));let ok=0;for(const r of m.s||[]){if(!want.has(r[0]))continue;const s=r[0].slice(0,-5);emit('ticker',{s,price:+r[1],change:+r[2],vol:+r[3],high:+r[7],low:+r[8]});patchLast(s,+r[1]);ok++}if(!ok)throw new Error('empty');return ok}catch(e){snapDownUntil=Date.now()+180000;throw e}}
// ---------- 2) CoinGecko (طابور) ----------
function cgJSON(path){const run=async()=>{if(Date.now()<cgPausedUntil)throw new Error('rate-limited');const w=Math.max(0,cgLast+CG_GAP-Date.now());if(w)await new Promise(r=>setTimeout(r,w));cgLast=Date.now();const r=await tfetch(CG+path,9000);if(r.status===429){cgPausedUntil=Date.now()+90000;throw new Error('429')}if(!r.ok)throw new Error('HTTP '+r.status);return r.json()};const p=cgQueue.then(run,run);cgQueue=p.catch(()=>{});return p}
async function pollCG(){const ids=pairs.map(s=>IDS[s]).filter(Boolean).join(',');const d=await cgJSON('/simple/price?ids='+ids+'&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true');let ok=0;for(const s of pairs){const x=d&&d[IDS[s]];if(!x||!(x.usd>0))continue;emit('ticker',{s,price:+x.usd,change:+x.usd_24h_change,vol:+x.usd_24h_vol});patchLast(s,+x.usd);ok++}if(!ok)throw new Error('empty');return ok}
async function cgCandles(sym,tf){if(!IDS[sym])return null;const cfg=CG_OHLC[tf]||CG_OHLC['1h'];const raw=await cgJSON('/coins/'+IDS[sym]+'/ohlc?vs_currency=usd&days='+cfg.days);let d=(raw||[]).map(r=>({t:Math.floor(r[0]/1000),o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:0})).filter(k=>k.o>0);if(cfg.agg){const out=[];let cur=null;for(const b of d){const k=b.t-b.t%cfg.agg;if(!cur||cur.t!==k){if(cur)out.push(cur);cur={...b,t:k}}else{cur.h=Math.max(cur.h,b.h);cur.l=Math.min(cur.l,b.l);cur.c=b.c}}if(cur)out.push(cur);d=out}return d.length>2?d:null}
// ---------- 3) محاكاة ----------
function seedOf(s){return s.split('').reduce((v,c)=>v*31+c.charCodeAt(0)>>>0,7)}
function rng(seed){let x=seed||1;return()=>{x^=x<<13;x>>>=0;x^=x>>17;x^=x<<5;x>>>=0;return x/4294967296}}
function simCandles(symbol,price,tf,n=160){const step=STEP[tf]||3600,now=Math.floor(Date.now()/1000/step)*step,r=rng(seedOf(symbol+tf));const vol={'15m':.003,'1h':.006,'4h':.012,'1d':.03}[tf]||.006;let p=1;const out=[];for(let i=0;i<n;i++){const o=p,c=o*(1+(r()-.5)*2*vol),h=Math.max(o,c)*(1+r()*vol*.6),l=Math.min(o,c)*(1-r()*vol*.6);out.push({t:now-(n-1-i)*step,o,c,h,l,v:50+r()*100});p=c}const k=price/p;for(const b of out){b.o*=k;b.c*=k;b.h*=k;b.l*=k}return out}
// ---------- candles API (للمخطط) ----------
const inflight=new Map();
function loadCandles(sym,tf,fallbackPrice){const k=sym+'|'+tf;if(inflight.has(k))return inflight.get(k);const p=loadCandles_(sym,tf,fallbackPrice).finally(()=>inflight.delete(k));inflight.set(k,p);return p}
async function loadCandles_(sym,tf,fallbackPrice){const key=sym+'|'+tf,cached=M.candles.get(key);if(cached&&Date.now()-cached.at<(cached.src==='sim'?60000:CANDLE_TTL))return cached;
  if(M.enabled){if(Date.now()>=snapDownUntil){try{const d=await snapCandles(sym,tf);if(d&&d.length>2){const res={at:Date.now(),data:d.slice(-160),src:'snapshot'};M.candles.set(key,res);return res}}catch(e){}}
    try{const d=await cgCandles(sym,tf);if(d){const res={at:Date.now(),data:d.slice(-160),src:'coingecko'};M.candles.set(key,res);return res}}catch(e){M.error=String(e.message||e)}}
  if(cached)return cached;const res={at:Date.now(),data:simCandles(sym,fallbackPrice,tf),src:'sim'};M.candles.set(key,res);return res}
function patchLast(sym,price){for(const [key,res] of M.candles){if(!key.startsWith(sym+'|'))continue;const L=res.data[res.data.length-1];if(!L)continue;L.c=price;L.h=Math.max(L.h,price);L.l=Math.min(L.l,price)}}
// ---------- تاريخ 4 ساعات للمحرك الذكي: حزمة مضمّنة + اللقطة/CoinGecko ----------
const hist={};
async function bundle(sym){if(hist[sym]!==undefined)return hist[sym];try{const r=await fetch(new URL('../assets/data/hist_'+sym+'_4h.json',document.baseURI));if(!r.ok)throw 0;const j=await r.json();hist[sym]=j.d.map(x=>({t:x[0],o:x[1],h:x[2],l:x[3],c:x[4],v:x[5]}))}catch{hist[sym]=null}return hist[sym]}
const engCache=new Map();
async function engineBars(sym,price){const c=engCache.get(sym);if(c&&Date.now()-c.at<CANDLE_TTL)return c;const base=(await bundle(sym))||[];let recent=null,src='bundle';
  if(M.enabled&&Date.now()>=snapDownUntil){try{recent=await snapCandles(sym,'4h');if(recent)src='snapshot'}catch{}}
  if(M.enabled&&!recent){try{recent=await cgCandles(sym,'4h');if(recent)src='coingecko'}catch{}}
  const map=new Map();for(const b of base)map.set(b.t,b);for(const b of recent||[])if(b.closed!==false)map.set(b.t,{t:b.t,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v||((map.get(b.t)||{}).v)||0});
  let bars=[...map.values()].sort((a,b)=>a.t-b.t);if(bars.length<260){bars=simCandles(sym,price||1,'4h',400).slice(0,-1);src='sim'}
  const res={at:Date.now(),bars,src,last:bars.length?bars[bars.length-1].t:0};engCache.set(sym,res);return res}
// ---------- الحلقة ----------
function setMode(mode,src,err){const changed=M.mode!==mode||M.src!==src;M.mode=mode;M.src=src;M.error=err||'';M.ready=true;emit(changed?'status':'statusinfo',{mode,src,error:M.error})}
async function poll(){if(!M.enabled||document.hidden)return;try{const ok=await pollSnapshot();M.lastUpdate=Date.now();setMode('live','snapshot');return ok}catch(e){}
  try{const ok=await pollCG();M.lastUpdate=Date.now();setMode('live','coingecko');return ok}catch(e){setMode('sim','sim','تعذّر الوصول إلى مصادر الأسعار؛ تُعرض أسعار محاكاة')}}
function startSim(){clearInterval(simTimer);simTimer=setInterval(()=>{if(M.mode!=='live')emit('simtick')},3000)}
async function start(symbols){pairs=symbols;M.enabled=true;startSim();clearInterval(pollTimer);await poll();pollTimer=setInterval(poll,POLL_MS)}
function stop(){M.enabled=false;clearInterval(pollTimer);pollTimer=null;M.candles.clear();engCache.clear();setMode('sim','sim','');startSim()}
document.addEventListener('visibilitychange',()=>{if(M.enabled&&!document.hidden&&Date.now()-M.lastUpdate>POLL_MS)poll()});
window.addEventListener('online',()=>{if(M.enabled){snapDownUntil=0;poll()}});
const SRC_AR={snapshot:'لقطة أسعار عامة (Ajcoin)',coingecko:'CoinGecko العامة',sim:'محاكاة محلية',bundle:'بيانات تاريخية مضمّنة'};
window.Market={state:M,start,stop,poll,loadCandles,simCandles,engineBars,bundle,on:fn=>listeners.add(fn),POLL_MS,SRC_AR,IDS};
})();
