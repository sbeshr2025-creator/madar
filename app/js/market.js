/* مدار — أسعار مرجعية للعرض فقط من واجهة CoinGecko العامة (بدون مفاتيح أو حساب) مع بديل محاكاة تلقائي */
(function(){
'use strict';
const API='https://api.coingecko.com/api/v3';
const IDS={BTC:'bitcoin',ETH:'ethereum',SOL:'solana',BNB:'binancecoin',XRP:'ripple',ADA:'cardano',DOGE:'dogecoin',LINK:'chainlink',AVAX:'avalanche-2'};
// الفترة → أيام CoinGecko وطول الشمعة (ثوانٍ)
const PERIODS={'1d':{days:1,step:1800},'7d':{days:7,step:14400},'30d':{days:30,step:14400},'90d':{days:90,step:345600}};
const POLL_MS=45000,CANDLE_TTL=5*60000,MIN_GAP=2500;
const listeners=new Set();
const M={mode:'sim',enabled:true,lastUpdate:0,error:'',candles:new Map(),source:'CoinGecko'};
let pollTimer=null,simTimer=null,pairs=[],queue=Promise.resolve(),lastReq=0,pausedUntil=0;
function emit(kind,data){for(const fn of listeners){try{fn(kind,data)}catch(e){console.error(e)}}}
// طابور طلبات بفاصل أدنى، وإيقاف مؤقت عند تجاوز حد المعدّل (429)
function getJSON(path,timeout=9000){const run=async()=>{if(Date.now()<pausedUntil)throw new Error('rate-limited');const wait=Math.max(0,lastReq+MIN_GAP-Date.now());if(wait)await new Promise(r=>setTimeout(r,wait));lastReq=Date.now();const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),timeout);try{const r=await fetch(API+path,{signal:ctl.signal});if(r.status===429){pausedUntil=Date.now()+90000;throw new Error('تجاوز حد الطلبات مؤقتًا')}if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(t)}};const p=queue.then(run,run);queue=p.catch(()=>{});return p}
function seedOf(s){return s.split('').reduce((v,c)=>v*31+c.charCodeAt(0)>>>0,7)}
function rng(seed){let x=seed||1;return()=>{x^=x<<13;x>>>=0;x^=x>>17;x^=x<<5;x>>>=0;return x/4294967296}}
function simCandles(symbol,price,period,n=96){const step=(PERIODS[period]||PERIODS['1d']).step,now=Math.floor(Date.now()/1000/step)*step,r=rng(seedOf(symbol+period));const vol={'1d':.005,'7d':.012,'30d':.012,'90d':.05}[period]||.006;let p=1;const out=[];for(let i=0;i<n;i++){const o=p,c=o*(1+(r()-.5)*2*vol),h=Math.max(o,c)*(1+r()*vol*.6),l=Math.min(o,c)*(1-r()*vol*.6);out.push({t:now-(n-1-i)*step,o,c,h,l,v:50+r()*100});p=c}const f=price/p;for(const k of out){k.o*=f;k.c*=f;k.h*=f;k.l*=f}return out}
const inflight=new Map();
function loadCandles(symbol,period,fallbackPrice){const k=symbol+'|'+period;if(inflight.has(k))return inflight.get(k);const pr=loadCandles_(symbol,period,fallbackPrice).finally(()=>inflight.delete(k));inflight.set(k,pr);return pr}
async function loadCandles_(symbol,period,fallbackPrice){
  const key=symbol+'|'+period,cached=M.candles.get(key);
  if(cached&&(cached.src==='live'?Date.now()-cached.at<CANDLE_TTL:Date.now()-cached.at<60000))return cached;
  const cfg=PERIODS[period]||PERIODS['1d'];
  if(M.enabled&&IDS[symbol]){try{const raw=await getJSON(`/coins/${IDS[symbol]}/ohlc?vs_currency=usd&days=${cfg.days}`);
      const data=(raw||[]).map(r=>({t:Math.floor(r[0]/1000),o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:0})).filter(k=>k.o>0);if(data.length>2){const res={at:Date.now(),data,src:'live'};M.candles.set(key,res);return res}}catch(e){M.error=String(e.message||e)}}
  if(cached)return cached;
  const res={at:Date.now(),data:simCandles(symbol,fallbackPrice,period),src:'sim'};M.candles.set(key,res);return res}
function patchLastCandle(symbol,price){for(const [key,res] of M.candles){if(!key.startsWith(symbol+'|'))continue;const last=res.data[res.data.length-1];if(!last)continue;last.c=price;last.h=Math.max(last.h,price);last.l=Math.min(last.l,price)}}
async function loadPrices(){const ids=pairs.map(s=>IDS[s]).filter(Boolean).join(',');const d=await getJSON(`/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`);let ok=0;for(const s of pairs){const x=d&&d[IDS[s]];if(!x||!(x.usd>0))continue;emit('ticker',{s,price:+x.usd,change:+x.usd_24h_change,vol:+x.usd_24h_vol});patchLastCandle(s,+x.usd);ok++}if(ok)M.lastUpdate=Date.now();return ok}
function setMode(mode,err=''){const changed=M.mode!==mode;M.mode=mode;M.error=err;if(changed)emit('status',{mode,error:err});else emit('statusinfo',{mode,error:err})}
async function poll(){if(!M.enabled||document.hidden)return;try{const ok=await loadPrices();setMode(ok?'live':'sim',ok?'':'لا توجد بيانات أسعار')}catch(e){setMode('sim','تعذّر الوصول إلى مصدر الأسعار؛ تُعرض أسعار محاكاة')}}
function startSim(){clearInterval(simTimer);simTimer=setInterval(()=>{if(M.mode!=='live')emit('simtick')},3000)}
async function start(symbols){pairs=symbols;M.enabled=true;startSim();clearInterval(pollTimer);await poll();pollTimer=setInterval(poll,POLL_MS)}
function stop(){M.enabled=false;clearInterval(pollTimer);pollTimer=null;M.candles.clear();setMode('sim','');startSim()}
document.addEventListener('visibilitychange',()=>{if(M.enabled&&!document.hidden&&Date.now()-M.lastUpdate>POLL_MS)poll()});
window.addEventListener('online',()=>{if(M.enabled)poll()});
window.Market={state:M,start,stop,loadCandles,simCandles,on:fn=>listeners.add(fn),PERIODS,POLL_MS};
})();
