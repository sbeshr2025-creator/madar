/* مدار v4 — نظرة على السوق، خريطة حرارية، توزيع المحفظة، تاريخ الربح والخسارة، متوسط التكلفة،
   إشعارات محلية، مفاتيح المؤشرات، وحاسبة المخاطر. كل شيء محلي في المتصفح. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const COST_KEY='madar-cost-v1',PNL_KEY='madar-pnl-v1';
const COLORS={BTC:'#f2a93b',ETH:'#8c96ff',SOL:'#38d6b0',USDT:'#26a17b',BNB:'#f0c74a',XRP:'#5aa9e6',ADA:'#3c7bf0',DOGE:'#c9a640',LINK:'#3f6ff0',AVAX:'#e84142',TRX:'#ff3b3b',DOT:'#e6007a',LTC:'#a6b4c8',SUI:'#4da2ff',NEAR:'#59d8a1',UNI:'#ff4fb0',AAVE:'#b6509e',other:'#6b7a90'};
let cost=lj(COST_KEY)||{},pnl=lj(PNL_KEY)||[],lastSnap=0,lastFull=0;
function lj(k){try{return JSON.parse(localStorage.getItem(k))}catch{return null}}
function sj(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
const pct=x=>(x>=0?'+':'')+x.toFixed(2)+'%';
const usdS=n=>'$'+(n>=1e9?(n/1e9).toFixed(2)+'B':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':n.toFixed(0));

/* ---------- متوسط التكلفة ---------- */
function onFill(o){const s=o.symbol;if(s==='USDT')return;const c=cost[s]||(cost[s]={qty:0,cost:0,realized:0});const gross=o.qty*o.price,fee=o.fee||0;
  if(o.side==='buy'){c.qty+=o.qty;c.cost+=gross+fee}else{const avg=c.qty>0?c.cost/c.qty:o.price,q=Math.min(o.qty,c.qty);c.realized+=(gross-fee)-avg*q;c.cost-=avg*q;c.qty-=q}sj(COST_KEY,cost)}
function reconcile(){let ch=false;for(const a of ASSETS){if(a.s==='USDT')continue;const bal=state.balances[a.s]||0,c=cost[a.s]||(cost[a.s]={qty:0,cost:0,realized:0,est:true});
    if(Math.abs(bal-c.qty)>1e-12){if(bal<c.qty){c.cost=c.qty>0?c.cost*bal/c.qty:0;c.qty=bal}else{if(!(a.price>0))continue;c.cost+=(bal-c.qty)*a.price;c.qty=bal;c.est=true}ch=true}}if(ch)sj(COST_KEY,cost)}
function costCells(a,qty){if(a.s==='USDT')return '<td class="align-left muted">—</td><td class="align-left muted">—</td>';const c=cost[a.s];if(!c||!(c.qty>0))return '<td class="align-left muted">—</td><td class="align-left muted">—</td>';
  const avg=c.cost/c.qty,u=(a.price-avg)*qty,up=avg>0?(a.price/avg-1)*100:0;if(state.hideBalances)return `<td class="align-left">${fmtPrice(avg)}</td><td class="align-left">••••</td>`;
  return `<td class="align-left">${fmtPrice(avg)}${c.est?' <small class="muted" title="الرصيد الابتدائي أو المُضاف قُيّم بسعر لحظة إضافته">تقديري</small>':''}</td><td class="align-left ${u>=0?'up':'down'}">${u>=0?'+':'-'}$${Math.abs(u).toFixed(2)} <small>(${pct(up)})</small></td>`}

/* ---------- تاريخ الربح والخسارة ---------- */
function snapPnl(force){const now=Math.floor(Date.now()/1000);if(!force&&now-lastSnap<600&&pnl.length)return;const v=totalValue();if(!(v>0))return;
  if(pnl.length&&now-pnl[pnl.length-1][0]<600&&!force){return}lastSnap=now;pnl.push([now,Math.round(v*100)/100]);if(pnl.length>500)pnl=pnl.filter((_,i)=>i===0||i%2===1);sj(PNL_KEY,pnl)}
function renderPnl(){const cv=$('pnlChart');if(!cv)return;const pts=pnl.concat([[Math.floor(Date.now()/1000),totalValue()]]);const base=pts[0][1];lineChart(cv,pts,{base,empty:'تُسجّل النقاط تلقائيًا أثناء استخدامك التطبيق',fmt:v=>state.hideBalances?'••':'$'+Math.round(v).toLocaleString('en-US')});
  const d=totalValue()-base,b=$('pnlBadge');if(b){b.textContent=state.hideBalances?'••••':(d>=0?'+':'-')+'$'+Math.abs(d).toFixed(2)+' منذ '+new Date(pts[0][0]*1000).toLocaleDateString('ar',{month:'short',day:'numeric'});b.className='sim-chip '+(d>=0?'up':'down')}}

/* ---------- توزيع المحفظة (Donut) ---------- */
function renderDonut(){const svg=$('donut');if(!svg)return;const tot=totalValue();let items=ASSETS.map(a=>({s:a.s,v:(state.balances[a.s]||0)*a.price})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);if(items.length>7){const rest=items.slice(6).reduce((a,x)=>a+x.v,0);items=items.slice(0,6).concat([{s:'other',v:rest}])}
  const R=46,C=2*Math.PI*R;let off=0;svg.innerHTML=`<circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--grid)" stroke-width="16"/>`+items.map(x=>{const len=tot?x.v/tot*C:0,seg=`<circle cx="60" cy="60" r="${R}" fill="none" stroke="${COLORS[x.s]||COLORS.other}" stroke-width="16" stroke-dasharray="${Math.max(0,len-1.2)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"><title>${x.s}: ${(x.v/tot*100).toFixed(1)}%</title></circle>`;off+=len;return seg}).join('')+`<text x="60" y="56" text-anchor="middle" class="donut-t1">${items.length} أصول</text><text x="60" y="72" text-anchor="middle" class="donut-t2">${state.hideBalances?'••••':usdS(tot)}</text>`;
  $('donutLegend').innerHTML=items.map(x=>`<div><i style="background:${COLORS[x.s]||COLORS.other}"></i><span>${x.s==='other'?'أخرى':x.s}</span><b>${tot?(x.v/tot*100).toFixed(1):0}%</b></div>`).join('')}

/* ---------- نظرة على السوق + الخريطة الحرارية ---------- */
function heatColor(ch){const k=Math.max(-1,Math.min(1,ch/6)),light=document.documentElement.dataset.theme==='light',a=(light?.55:.3)+Math.abs(k)*(light?.45:.65);return k>=0?(light?`rgba(12,150,100,${a})`:`rgba(38,196,140,${a})`):(light?`rgba(210,48,74,${a})`:`rgba(240,82,104,${a})`)}
function renderHeat(id){const el=$(id);if(!el)return;const coins=ASSETS.filter(a=>a.s!=='USDT');if(!Market.state.ready&&prefs.live){el.innerHTML='<span class="skeleton sk-block"></span>';return}
  const byVol=coins.slice().sort((a,b)=>(b.vol||0)-(a.vol||0));const rank=new Map(byVol.map((a,i)=>[a.s,i]));
  el.innerHTML=byVol.map(a=>{const r=rank.get(a.s),sz=r<2?'xl':r<5?'lg':'';return `<button class="heat ${sz}" style="background:${heatColor(a.change)}" onclick="navigate('trade');selectAsset('${a.s}')" aria-label="${a.name} ${pct(a.change)}"><b>${a.s}</b><span>${pct(a.change)}</span>${sz==='xl'?`<small>${fmtPrice(a.price)}</small>`:''}</button>`}).join('')}
function renderOverview(){const el=$('overview');if(!el)return;document.querySelectorAll('.src-chip').forEach(e=>e.textContent=Market.state.mode==='live'?Market.SRC_AR[Market.state.src]:'محاكاة محلية');if(!Market.state.ready&&prefs.live){el.innerHTML='<span class="skeleton sk-block"></span>';return}
  const coins=ASSETS.filter(a=>a.s!=='USDT'),up=coins.filter(a=>a.change>0).length,dn=coins.filter(a=>a.change<0).length,avg=coins.reduce((s,a)=>s+a.change,0)/coins.length,vol=coins.reduce((s,a)=>s+(a.vol||0),0);
  const best=coins.reduce((a,b)=>b.change>a.change?b:a),worst=coins.reduce((a,b)=>b.change<a.change?b:a),btc=asset('BTC'),btcShare=vol?(btc.vol||0)/vol*100:0;
  const mood=avg>2?['متفائل','up']:avg>0.3?['إيجابي','up']:avg<-2?['متشائم','down']:avg<-0.3?['سلبي','down']:['محايد',''];
  el.innerHTML=`<div class="ov"><small>اتساع السوق</small><b><span class="up">${up}↑</span> · <span class="down">${dn}↓</span></b><div class="breadth"><i style="width:${up/(coins.length||1)*100}%"></i></div></div>
  <div class="ov"><small>متوسط التغيّر 24س</small><b class="${avg>=0?'up':'down'}">${pct(avg)}</b><span class="muted small">مزاج: <span class="${mood[1]}">${mood[0]}</span></span></div>
  <div class="ov"><small>حجم 24س (${coins.length} عملة)</small><b>${vol?usdS(vol):'—'}</b><span class="muted small">حصة BTC ${vol?btcShare.toFixed(0)+'%':'—'}</span></div>
  <div class="ov"><small>الأفضل / الأسوأ</small><b><span class="up">${best.s} ${pct(best.change)}</span></b><span class="down small">${worst.s} ${pct(worst.change)}</span></div>`}

/* ---------- الإشعارات المحلية ---------- */
function notifyState(){const b=$('notifyBtn');if(!b)return;const ok=('Notification' in window);const on=ok&&prefs.notify&&Notification.permission==='granted';b.textContent=!ok?'🔕 الإشعارات غير مدعومة':on?'🔔 إشعارات المتصفح: مفعّلة':'🔕 تفعيل إشعارات المتصفح';b.classList.toggle('on',on);b.disabled=!ok}
async function toggleNotify(){if(!('Notification' in window)){showToast('هذا المتصفح لا يدعم الإشعارات');return}if(prefs.notify){prefs.notify=false;savePrefs();notifyState();showToast('أُوقفت إشعارات المتصفح');return}
  let p=Notification.permission;if(p==='default')p=await Notification.requestPermission();if(p!=='granted'){showToast('لم يُسمح بالإشعارات من إعدادات المتصفح');prefs.notify=false}else{prefs.notify=true;showToast('🔔 فُعّلت الإشعارات المحلية (تعمل والتطبيق مفتوح فقط)');notify('مدار','تم تفعيل إشعارات التنبيهات المحلية — تجريبي')}savePrefs();notifyState()}
function notify(title,body){try{if(!prefs.notify||!('Notification' in window)||Notification.permission!=='granted')return;const o={body,icon:'../assets/icon-192.png',badge:'../assets/icon-192.png',tag:'madar-'+title,lang:'ar',dir:'rtl'};
  if(navigator.serviceWorker&&navigator.serviceWorker.controller)navigator.serviceWorker.ready.then(r=>r.showNotification(title,o)).catch(()=>new Notification(title,o));else new Notification(title,o)}catch(e){console.warn(e)}}

/* ---------- المؤشرات ---------- */
function syncInd(){document.querySelectorAll('[data-ind]').forEach(b=>{const on=!!prefs.ind[b.dataset.ind];b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)})}
function bindInd(){document.querySelectorAll('[data-ind]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.ind;prefs.ind={...prefs.ind,[k]:!prefs.ind[k]};savePrefs();syncInd();['chartDash','chartTrade','chartFut'].forEach(id=>{const c=chart(id);if(c)c.setIndicators(prefs.ind)})}));syncInd()}

/* ---------- حاسبة المخاطر ---------- */
function calc(){const f=$('riskForm');if(!f)return;const v=n=>Number(f.elements[n].value);const bal=v('bal'),rp=v('riskp'),en=v('entry'),sl=v('stop'),tp=v('target'),lev=Math.max(1,v('lev')||1),fee=v('fee')/100,side=f.elements.side.value;const out=$('riskOut');
  const err=m=>{out.innerHTML=`<div class="calc-err">${m}</div>`};if(!(bal>0&&rp>0&&en>0&&sl>0))return err('أدخل الرصيد ونسبة المخاطرة وسعري الدخول والوقف.');const long=side==='long';if(long?sl>=en:sl<=en)return err(long?'في صفقة الشراء يجب أن يكون الوقف أقل من سعر الدخول.':'في صفقة البيع يجب أن يكون الوقف أعلى من سعر الدخول.');
  if(tp>0&&(long?tp<=en:tp>=en))return err('الهدف يجب أن يكون في اتجاه الربح.');const risk=bal*rp/100,dist=Math.abs(en-sl)/en,feeR=2*fee;let notional=risk/(dist+feeR),capped=false;if(notional/lev>bal){notional=bal*lev;capped=true}
  const qty=notional/en,margin=notional/lev,loss=notional*(dist+feeR),gain=tp>0?notional*(Math.abs(tp-en)/en-feeR):null,rr=gain!=null?gain/loss:null,be=rr!=null&&rr>0?1/(1+rr)*100:null,liq=lev>1?(long?en*(1-1/lev+0.005):en*(1+1/lev-0.005)):null;const liqBad=liq!=null&&(long?liq>=sl:liq<=sl);
  const row=(k,val,cls='')=>`<div class="calc-row ${cls}"><span>${k}</span><b>${val}</b></div>`;const $$=n=>'$'+n.toLocaleString('en-US',{maximumFractionDigits:2});
  out.innerHTML=row('المبلغ المعرّض للخطر',$$(loss),'down')+row('حجم المركز (القيمة)',$$(notional))+row('الكمية',qty.toLocaleString('en-US',{maximumFractionDigits:6}))+row('الهامش المطلوب',$$(margin)+(lev>1?` <small>(رافعة ×${lev})</small>`:''))+row('مسافة الوقف',(dist*100).toFixed(2)+'%')+(gain!=null?row('الربح المحتمل عند الهدف',$$(gain),'up')+row('العائد / المخاطرة',rr.toFixed(2)+'R',rr>=1.5?'up':rr<1?'down':'')+row('نسبة الفوز اللازمة للتعادل',be.toFixed(1)+'%'):'')+(liq?row('سعر التصفية التقريبي',fmtPrice(liq),liqBad?'down':''):'')+(capped?'<div class="calc-err">⚠️ الحجم المطلوب يتجاوز رصيدك بهذه الرافعة؛ عُرض الحد الأقصى المتاح.</div>':'')+(liqBad?'<div class="calc-err">⚠️ سعر التصفية قبل الوقف! خفّض الرافعة.</div>':'')+'<p class="muted small">الحساب يشمل رسوم دخول وخروج تقديرية. للتعليم فقط — ليست نصيحة مالية.</p>'}
function fillEntry(){const f=$('riskForm');const s=f.elements.asset.value,p=asset(s).price;f.elements.entry.value=+p.toPrecision(6);const long=f.elements.side.value==='long';f.elements.stop.value=+(p*(long?.97:1.03)).toPrecision(6);f.elements.target.value=+(p*(long?1.06:.94)).toPrecision(6);calc()}
function initCalc(){const f=$('riskForm');if(!f)return;const sel=f.elements.asset;sel.innerHTML=ASSETS.filter(a=>a.s!=='USDT').map(a=>`<option value="${a.s}">${a.s} — ${a.name}</option>`).join('');f.addEventListener('input',e=>{if(e.isTrusted)f.dataset.touched='1';calc()});f.elements.side.addEventListener('change',fillEntry);sel.addEventListener('change',fillEntry);f.elements.bal.value=Math.round(state.balances.USDT||10000);fillEntry()}

/* ---------- تجميع ---------- */
let trail=null;function render(full){if(typeof state==='undefined'||typeof ASSETS==='undefined')return;reconcile();snapPnl(false);const now=Date.now();if(!full&&now-lastFull<1500){if(!trail)trail=setTimeout(()=>{trail=null;render(true)},1600);return}lastFull=now;const v=typeof activeView!=='undefined'?activeView:'dashboard';
  if(v==='dashboard'){renderOverview();renderHeat('heatDash')}if(v==='markets')renderHeat('heatMarkets');if(v==='wallet'){renderDonut();renderPnl()}notifyState()}
document.addEventListener('madar:view',e=>{lastFull=0;render(true);if(e.detail==='tools'){const f=$('riskForm');if(f&&!f.dataset.touched){f.elements.bal.value=Math.round(state.balances.USDT||10000);fillEntry()}}});
document.addEventListener('DOMContentLoaded',()=>{bindInd();initCalc();snapPnl(true)});
window.addEventListener('resize',()=>{if(typeof activeView!=='undefined'&&activeView==='wallet')renderPnl()});
window.V4={onFill,costCells,notify,toggleNotify,render,calc,fillEntry,renderPnl,COLORS};
})();
