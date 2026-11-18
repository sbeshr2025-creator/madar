/* مدار v4 — التداول الذكي التجريبي (Paper Trading) + المختبر الخلفي.
   كل شيء يعمل داخل المتصفح بأموال افتراضية. لا حسابات، لا مفاتيح، لا أوامر حقيقية، لا اتصال بأي منصة تداول. */
(function(){
'use strict';
const E=window.SmartEngine,KEY='madar-smart-v1',H4=E.H4;
const COINS=['BTC','ETH','SOL','BNB','XRP'];
const $=id=>document.getElementById(id);
const r2=(x,d=2)=>Number.isFinite(+x)?(+x).toFixed(d):'—';
const pct=x=>Number.isFinite(+x)?((+x>=0?'+':'')+(+x).toFixed(2)+'%'):'—';
const usd=x=>Number.isFinite(+x)?((+x<0?'-':'')+'$'+Math.abs(+x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})):'—';
const px=x=>window.fmtPrice?fmtPrice(x):String(x);
const tm=t=>new Date(t*1000).toLocaleString('ar',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
const escH=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fresh(){return {v:1,running:false,killed:false,settings:Object.assign({},E.DEFAULTS),eq0:10000,equity:10000,positions:[],history:[],guard:null,lastBar:{},curve:[],log:[],startedAt:0}}
function load(){try{const x=JSON.parse(localStorage.getItem(KEY));if(x&&x.v===1){x.settings=E.clampSettings(x.settings||{});return Object.assign(fresh(),x)}}catch{}return fresh()}
let S=load(),G=null,signals={},dataInfo={},busy=false,lastEval=0,bt=null,btRunning=false,worker=null;
function save(){try{S.guard=G?G.toJSON():S.guard;localStorage.setItem(KEY,JSON.stringify(S))}catch{}}
function guard(){if(!G){G=E.Guard.from(E.clampSettings(S.settings),S.eq0,S.guard);if(G.dayStartEq==null)G.dayStartEq=S.equity}G.s=E.clampSettings(S.settings);return G}
function log(msg,kind='info'){S.log.unshift({t:Date.now(),msg,kind});S.log=S.log.slice(0,60)}
function livePrice(c){try{return asset(c).price}catch{return 0}}
function barIdx(t){return Math.floor(t/H4)}
function equityMtm(){let e=S.equity;for(const p of S.positions){const lp=livePrice(p.coin);if(lp>0)e+=E.tradePnl(p.side,p.entry,lp,p.notional,p.fee,E.fees(E.clampSettings(S.settings)).slip)[0]}return e}

/* ---------- التقييم الدوري ---------- */
async function evaluateAll(force){if(busy)return;if(!force&&Date.now()-lastEval<60000)return;busy=true;lastEval=Date.now();const s=E.clampSettings(S.settings);
  try{for(const coin of COINS){const res=await Market.engineBars(coin,livePrice(coin));const bars=res.bars;if(!bars.length)continue;const F=new E.Features(bars),i=bars.length-1;const sig=E.evaluate(F,i,s);const lastClose=bars[i].t+H4,ageH=(Date.now()/1000-lastClose)/3600;
      dataInfo[coin]={src:res.src,last:bars[i].t,ageH,stale:res.src==='sim'||ageH>8.5};signals[coin]=Object.assign(sig,{coin});
      if(S.running&&!S.killed)onBar(coin,bars,F,i,sig,s)}
    if(S.running){S.curve.push([Math.floor(Date.now()/1000),Math.round(equityMtm()*100)/100]);if(S.curve.length>800)S.curve=S.curve.filter((_,k)=>k%2===0)}save()}
  catch(e){console.warn('smart eval',e)}finally{busy=false;render()}}

function onBar(coin,bars,F,i,sig,s){const g=guard(),bt0=bars[i].t;if(S.lastBar[coin]===bt0)return;const first=S.lastBar[coin]==null;S.lastBar[coin]=bt0;
  const day=E.utcDay(Date.now()/1000);if(day!==g.day){g.newDay(day);g.dayStartEq=S.equity}
  const pos=S.positions.find(p=>p.coin===coin);const FE=E.fees(s);
  if(pos&&!first){const [xp,why]=E.manage(pos,F.high[i],F.low[i],F.close[i],F.atr[i],barIdx(bt0),FE.slip);if(xp!=null){closePos(pos,livePrice(coin)||xp,why);return}save()}
  if(S.positions.some(p=>p.coin===coin))return;
  if(dataInfo[coin].stale){sig.block='stale';return}
  if(sig.action!=='enter')return;
  const eq=equityMtm(),[ok,why]=g.canEnter(coin,barIdx(bt0),eq,18);if(!ok){sig.block=why;log(`${coin}: إشارة ${sig.side==='long'?'شراء':'بيع'} (${sig.conf}%) لم تُنفَّذ — ${E.GUARD_AR[why]||why}`,'warn');return}
  const market=sig.side==='long'?'spot':'fut',entry=livePrice(coin)||F.close[i],shift=entry-F.close[i],sl=sig.sl+shift,tp=sig.tp+shift;
  if(sig.side==='long'?!(sl<entry&&tp>entry):!(sl>entry&&tp<entry))return;
  const sz=E.sizePosition(S.equity,entry,sl,market,s,g.day_used);if(!sz.ok){sig.block='min';return}
  g.onOpen(sz.cost);const p={id:Date.now()+Math.random(),coin,side:sig.side,strategy:sig.strategy,market,entry,sl,sl0:sl,tp,notional:sz.notional,qty:sz.qty,lev:sz.lev,fee:FE[market],bar:barIdx(bt0)+1,t:Math.floor(Date.now()/1000),max_bars:sig.max_bars,conf:sig.conf,risk:sz.risk_usdt,reasons:sig.reasons.slice(0,4),be:false,trailed:false};
  S.positions.push(p);log(`فتح ${sig.side==='long'?'شراء':'بيع'} ${coin} عند ${px(entry)} · ثقة ${sig.conf}% · مخاطرة ${usd(sz.risk_usdt)}`,'open');showToast(`🤖 صفقة ورقية: ${sig.side==='long'?'شراء':'بيع'} ${coin} (تجريبي)`);if(window.V4)V4.notify('مدار — صفقة ورقية',`${sig.side==='long'?'شراء':'بيع'} ${coin} عند ${px(entry)} (محاكاة)`);save()}

function closePos(p,price,why){const s=E.clampSettings(S.settings),FE=E.fees(s),[pnl,pp]=E.tradePnl(p.side,p.entry,price,p.notional,p.fee,FE.slip);S.equity+=pnl;S.positions=S.positions.filter(x=>x!==p);guard().onClose(p.coin,pnl,barIdx(Date.now()/1000));
  S.history.unshift({coin:p.coin,side:p.side,strategy:p.strategy,t_in:p.t,t_out:Math.floor(Date.now()/1000),entry:p.entry,exit:price,pnl,pct:pp,why,conf:p.conf});S.history=S.history.slice(0,200);log(`إغلاق ${p.coin} (${E.EXIT_AR[why]||why}) عند ${px(price)} · ${usd(pnl)}`,pnl>=0?'win':'loss');save()}

/* فحص الوقف/الهدف بين الشموع بالسعر الحي */
function tick(){if(!S.positions.length)return;let ch=false;for(const p of [...S.positions]){const lp=livePrice(p.coin);if(!(lp>0))continue;const long=p.side==='long';
    if(long?lp<=p.sl:lp>=p.sl){closePos(p,lp,p.trailed?'trail':p.be?'be':'sl');ch=true}else if(long?lp>=p.tp:lp<=p.tp){closePos(p,lp,'tp');ch=true}}if(ch)render()}

/* ---------- التحكم ---------- */
function start(){if(S.killed){if(!confirm('الإيقاف الفوري مفعّل. هل تريد إلغاءه وتشغيل المحرك التجريبي من جديد؟'))return;S.killed=false}S.running=true;S.startedAt=S.startedAt||Date.now();for(const c of COINS)if(S.lastBar[c]==null)S.lastBar[c]=undefined;S.lastBar={};guard();log('تشغيل المحرك التجريبي (أموال افتراضية).','info');save();evaluateAll(true);render()}
function stop(){S.running=false;log('إيقاف الدخول الجديد. الصفقات المفتوحة تبقى بحمايتها (وقف/هدف) ويمكنك إغلاقها.','info');save();render()}
function kill(){for(const p of [...S.positions])closePos(p,livePrice(p.coin)||p.entry,'kill');S.running=false;S.killed=true;log('⛔ إيقاف فوري: أُغلقت كل الصفقات الورقية وتوقف المحرك.','loss');save();render();showToast('⛔ تم الإيقاف الفوري — كل الصفقات الورقية مغلقة')}
function closeOne(id){const p=S.positions.find(x=>String(x.id)===String(id));if(p){closePos(p,livePrice(p.coin)||p.entry,'manual');render()}}
function reset(){if(!confirm('إعادة الحساب الذكي الافتراضي إلى 10,000$ وحذف السجل؟'))return;const st=S.settings;S=fresh();S.settings=st;G=null;save();render()}
function applySettings(){const f=$('smartForm');if(!f)return;const g=n=>f.elements[n];const raw=Object.assign({},S.settings);
  for(const k of ['risk_pct','min_conf','max_trades_day','daily_loss_pct','dd_limit_pct','cooldown_bars','lev'])raw[k]=Number(g(k).value);raw.shorts=g('shorts').checked;
  raw.strategies=['trend','breakout','range'].filter(k=>g('st_'+k).checked);if(!raw.strategies.length)raw.strategies=['trend'];S.settings=E.clampSettings(raw);G&&(G.s=S.settings);save();showToast('حُفظت الإعدادات (ضمن حدود آمنة)');evaluateAll(true);renderForm()}

/* ---------- المختبر الخلفي ---------- */
function getWorker(){if(worker!==null)return worker;try{worker=new Worker('js/smart-worker.js?v=4')}catch{worker=false}return worker}
async function runBacktest(){if(btRunning)return;const f=$('btForm');const coins=COINS.filter(c=>f.elements['c_'+c].checked);if(!coins.length){showToast('اختر عملة واحدة على الأقل');return}
  const months=Number(f.elements.period.value),s=E.clampSettings(Object.assign({},S.settings,{risk_pct:Number(f.elements.risk.value),min_conf:Number(f.elements.conf.value),fee_spot:Number(f.elements.fee.value),fee_fut:Math.round(Number(f.elements.fee.value)*400)/1000,slip_bps:Number(f.elements.slip.value),shorts:f.elements.shorts.checked}));
  btRunning=true;$('btRun').disabled=true;$('btStatus').innerHTML='<span class="spinner"></span> جارٍ التحميل والحساب…';$('btResult').innerHTML='<div class="skeleton sk-block" style="height:180px"></div>';
  try{const data={},srcs={};for(const c of coins){const r=await Market.engineBars(c,livePrice(c));if(r.src==='sim'){srcs[c]='sim'}else srcs[c]=r.src;data[c]=r.bars}
    const last=Math.max(...coins.map(c=>data[c][data[c].length-1].t)),opts={equity0:Math.round(10000/coins.length*100)/100,start_t:months?last-months*30*86400:null};
    const t0=performance.now();let res;const w=getWorker();
    if(w){res=await new Promise((ok,bad)=>{const to=setTimeout(()=>bad(new Error('timeout')),120000);w.onmessage=e=>{clearTimeout(to);e.data&&e.data.error?bad(new Error(e.data.error)):ok(e.data)};w.onerror=e=>{clearTimeout(to);bad(e)};w.postMessage({data,settings:s,opts})}).catch(e=>{console.warn('worker failed, main thread',e);worker=false;return E.backtestMany(data,s,opts)})}
    else{await new Promise(r=>setTimeout(r,30));res=E.backtestMany(data,s,opts)}
    bt={res,coins,months,s,srcs,ms:Math.round(performance.now()-t0),eq0:opts.equity0*coins.length};renderBacktest();$('btStatus').textContent=`اكتمل خلال ${(bt.ms/1000).toFixed(1)} ث · ${coins.length} عملة · شموع 4 ساعات`}
  catch(e){console.error(e);$('btStatus').textContent='تعذّر تشغيل الاختبار: '+(e.message||e);$('btResult').innerHTML=''}finally{btRunning=false;$('btRun').disabled=false}}
function verdict(m,bhAvg){const pf=m.profit_factor==='∞'?99:m.profit_factor;if(!m.trades)return ['neutral','لم تُفتح أي صفقة بهذه الإعدادات على هذه الفترة — المرشحات صارمة.'];if(m.trades<30)return [pf>=1?'neutral':'bad',`عدد الصفقات (${m.trades}) قليل جدًا للحكم إحصائيًا؛ النتيجة قد تكون صدفة.`+(pf<1?' والنتيجة خاسرة بعد الرسوم.':'')];
  if(pf<1)return ['bad',`الإعدادات خاسرة على هذه الفترة بعد الرسوم والانزلاق (عامل الربح ${pf} أقل من 1).`];if(pf<1.2)return ['neutral',`قريبة من التعادل (عامل الربح ${pf}) — الأفضلية ضعيفة وقد تختفي مع تغيّر السوق.`];return ['good',`نتيجة إيجابية تاريخيًا (عامل الربح ${pf})، لكنها لا تضمن المستقبل — قارنها بالشراء والاحتفاظ (${pct(bhAvg)}) وبنتائج الفترات الثلاث.`]}
function renderBacktest(){if(!bt)return;const {res,coins}=bt,m=res.all;const bhAvg=coins.reduce((a,c)=>a+(res.per[c].bh_pct||0),0)/coins.length;const [vk,vt]=verdict(m,bhAvg);
  const tile=(k,v,cls='')=>`<div class="m-tile ${cls}"><small>${k}</small><b>${v}</b></div>`;const pfCls=m.profit_factor==='∞'||m.profit_factor>=1?'up':'down';
  const per=coins.map(c=>{const p=res.per[c];return `<tr><td><b>${c}</b> <small class="muted">${bt.srcs[c]==='sim'?'(محاكاة)':''}</small></td><td>${p.trades}</td><td>${p.win_rate==null?'—':p.win_rate+'%'}</td><td class="${p.profit_factor==='∞'||p.profit_factor>=1?'up':'down'}">${p.profit_factor??'—'}</td><td class="${p.ret_pct>=0?'up':'down'}">${pct(p.ret_pct)}</td><td>${r2(p.max_dd_pct)}%</td><td>${p.sharpe??'—'}</td><td class="${p.bh_pct>=0?'up':'down'}">${pct(p.bh_pct)}</td><td class="folds">${(p.folds||[]).map(fd=>`<span class="${fd.pnl_usdt>=0?'up':'down'}" title="${tm(fd.from)} → ${tm(fd.to)}">${fd.trades}ص · ${fd.pnl_usdt>=0?'+':''}${r2(fd.pnl_usdt,0)}$</span>`).join('')}</td></tr>`}).join('');
  const bys=Object.entries(m.by_strategy||{}).map(([k,v])=>`<tr><td>${E.STRAT_AR[k]||k}</td><td>${v.n}</td><td>${v.win}%</td><td class="${v.pnl>=0?'up':'down'}">${usd(v.pnl)}</td></tr>`).join('')||'<tr><td colspan="4" class="muted">لا صفقات</td></tr>';
  const trs=res.trades.slice(-60).reverse().map(t=>`<tr><td>${tm(t.t_in)}</td><td><b>${t.coin}</b></td><td class="${t.side==='long'?'up':'down'}">${t.side==='long'?'شراء':'بيع'}</td><td>${E.STRAT_AR[t.strategy]||t.strategy}</td><td>${px(t.entry)}</td><td>${px(t.exit)}</td><td>${E.EXIT_AR[t.why]||t.why}</td><td class="${t.pnl>=0?'up':'down'}">${usd(t.pnl)} <small>(${pct(t.pct)})</small></td></tr>`).join('')||'<tr><td colspan="8" class="muted">لا صفقات</td></tr>';
  const from=Math.min(...coins.map(c=>res.per[c].from||Infinity)),to=Math.max(...coins.map(c=>res.per[c].to||0));
  $('btResult').innerHTML=`<div class="verdict ${vk}">${vk==='good'?'✅':vk==='bad'?'❌':'⚖️'} ${vt}</div>
  <div class="m-grid">${tile('عدد الصفقات',m.trades)}${tile('نسبة الفوز',m.win_rate==null?'—':m.win_rate+'%')}${tile('عامل الربح (PF)',m.profit_factor??'—',pfCls)}${tile('أقصى تراجع',r2(m.max_dd_pct)+'%','down')}${tile('شارب (سنوي)',m.sharpe??'—',m.sharpe>0?'up':'down')}${tile('العائد',pct(m.ret_pct),m.ret_pct>=0?'up':'down')}${tile('صافي الربح',usd(m.pnl_usdt),m.pnl_usdt>=0?'up':'down')}${tile('الشراء والاحتفاظ (متوسط)',pct(bhAvg),bhAvg>=0?'up':'down')}</div>
  <p class="muted small">الفترة: ${Number.isFinite(from)?tm(from):'—'} → ${to?tm(to):'—'} · رأس مال افتراضي ${usd(bt.eq0)} مقسّم بالتساوي على العملات · رسوم ${bt.s.fee_spot}% فوري / ${bt.s.fee_fut}% عقود · انزلاق ${bt.s.slip_bps} نقطة أساس · مخاطرة ${bt.s.risk_pct}% · حد الثقة ${bt.s.min_conf}% · ${bt.s.shorts?'مع البيع على المكشوف':'شراء فقط'}</p>
  <div class="line-chart tall"><canvas id="btCurve"></canvas></div>
  <div class="bt-tables"><div class="table-wrap"><h3>حسب العملة · والفترات الثلاث (اختبار ثبات)</h3><table><thead><tr><th>العملة</th><th>صفقات</th><th>فوز</th><th>PF</th><th>العائد</th><th>أقصى تراجع</th><th>شارب</th><th>احتفاظ</th><th>الفترات 1·2·3</th></tr></thead><tbody>${per}</tbody></table></div>
  <div class="table-wrap"><h3>حسب الاستراتيجية</h3><table><thead><tr><th>الاستراتيجية</th><th>صفقات</th><th>فوز</th><th>الربح</th></tr></thead><tbody>${bys}</tbody></table></div></div>
  <details class="bt-trades"><summary>آخر ${Math.min(60,res.trades.length)} صفقة من ${res.trades.length}</summary><div class="table-wrap"><table><thead><tr><th>الدخول</th><th>العملة</th><th>الاتجاه</th><th>الاستراتيجية</th><th>سعر الدخول</th><th>سعر الخروج</th><th>سبب الخروج</th><th>النتيجة</th></tr></thead><tbody>${trs}</tbody></table></div></details>`;
  requestAnimationFrame(()=>lineChart($('btCurve'),res.curve,{base:bt.eq0,fmt:v=>'$'+Math.round(v).toLocaleString('en-US')}))}

/* ---------- العرض ---------- */
function statusChip(){if(S.killed)return '<span class="status cancel">⛔ إيقاف فوري</span>';if(S.running)return '<span class="status done"><i class="pulse"></i> يعمل · ورقي</span>';return '<span class="status open">متوقف</span>'}
function renderForm(){const f=$('smartForm');if(!f)return;const s=S.settings;for(const k of ['risk_pct','min_conf','max_trades_day','daily_loss_pct','dd_limit_pct','cooldown_bars','lev']){f.elements[k].value=s[k];const b=E.BOUNDS[k];if(b){f.elements[k].min=b[0];f.elements[k].max=b[1]}}f.elements.shorts.checked=!!s.shorts;for(const k of ['trend','breakout','range'])f.elements['st_'+k].checked=s.strategies.includes(k)}
function render(light){if(light)tick();if(typeof activeView!=='undefined'&&activeView!=='smart')return;const root=$('smartRoot');if(!root)return;const s=E.clampSettings(S.settings),g=guard(),eq=equityMtm(),ret=(eq/S.eq0-1)*100;
  $('smStatus').innerHTML=statusChip();$('smEquity').textContent=usd(eq);$('smRet').innerHTML=`<span class="${ret>=0?'up':'down'}">${pct(ret)}</span> منذ البداية`;
  $('smStart').disabled=S.running;$('smStop').disabled=!S.running;$('smKill').disabled=S.killed&&!S.positions.length;
  const dl=(g.dayStartEq||S.equity)*s.daily_loss_pct/100,peak=Math.max(g.peak||S.eq0,eq),dd=peak>0?(peak-eq)/peak*100:0;const bi=barIdx(Date.now()/1000);
  const halted=bi<(g.halt_until||-1),paused=bi<(g.pause_until||-1);
  $('smGuard').innerHTML=`<div class="g-row"><span>صفقات اليوم</span><b>${g.day===E.utcDay(Date.now()/1000)?g.day_trades:0} / ${s.max_trades_day}</b></div><div class="g-row"><span>ربح/خسارة اليوم</span><b class="${(g.day_pnl||0)>=0?'up':'down'}">${usd(g.day_pnl||0)} <small>(حد −${usd(dl)})</small></b></div><div class="g-row"><span>التراجع من القمة</span><b class="${dd>=s.dd_limit_pct*.7?'down':''}">${r2(dd)}% <small>(حد ${s.dd_limit_pct}%)</small></b></div><div class="g-row"><span>خسائر متتالية</span><b>${g.streak||0} / ${s.loss_streak}</b></div><div class="g-row"><span>حالة الحماية</span><b>${S.killed?'⛔ '+E.GUARD_AR.killed:halted?'🛑 '+E.GUARD_AR.dd:paused?'⏸ '+E.GUARD_AR.streak:'✅ طبيعية'}</b></div>`;
  $('smSignals').innerHTML=COINS.map(c=>{const x=signals[c],di=dataInfo[c];if(!x)return `<article class="sig"><span class="skeleton sk-line"></span><span class="skeleton sk-line short"></span></article>`;
    const act=x.action==='enter'?`<span class="status ${x.side==='long'?'done':'cancel'}">${x.side==='long'?'إشارة شراء':'إشارة بيع'}</span>`:x.action==='watch'?'<span class="status open">مراقبة</span>':'<span class="status">لا دخول</span>';const cf=x.action!=='none'?x.conf:(x.lean_pct||0);
    return `<article class="sig"><div class="sig-top">${icon(c)}<div><b>${c}</b><small>${E.REGIME_AR[x.regime]||x.regime}${di&&di.stale?' · <span class="down">بيانات قديمة/محاكاة</span>':''}</small></div>${act}</div><div class="conf"><div class="conf-bar"><i style="width:${Math.max(2,cf)}%" class="${x.action==='enter'?'ok':''}"></i><em style="right:${s.min_conf}%"></em></div><span>${x.action!=='none'?'الثقة':'الميل'} ${cf}%</span></div>${x.sl?`<div class="lv"><span>وقف ${px(x.sl)}</span><span>هدف ${px(x.tp)}</span><span>عائد/مخاطرة ${x.rr}</span></div>`:''}<ul class="reasons">${x.reasons.slice(0,5).map(r=>`<li>${escH(r)}</li>`).join('')}</ul>${x.block?`<p class="small down">لم تُنفذ: ${E.GUARD_AR[x.block]||x.block}</p>`:''}<small class="muted">شمعة 4س أُغلقت ${di?tm(di.last+H4):'—'} · ${di?Market.SRC_AR[di.src]||di.src:''}</small></article>`}).join('');
  const FE=E.fees(s);$('smPositions').innerHTML=S.positions.length?S.positions.map(p=>{const lp=livePrice(p.coin),[pnl,pp]=E.tradePnl(p.side,p.entry,lp,p.notional,p.fee,FE.slip);return `<tr><td><b>${p.coin}</b> <small class="${p.side==='long'?'up':'down'}">${p.side==='long'?'شراء':'بيع ×'+p.lev}</small></td><td>${E.STRAT_AR[p.strategy]}</td><td>${px(p.entry)}</td><td>${px(lp)}</td><td>${px(p.sl)}${p.trailed?' <small>متحرك</small>':p.be?' <small>تعادل</small>':''}</td><td>${px(p.tp)}</td><td>${usd(p.notional)}</td><td class="${pnl>=0?'up':'down'}">${usd(pnl)} <small>(${pct(pp)})</small></td><td><button class="row-action" onclick="Smart.closeOne('${p.id}')">إغلاق</button></td></tr>`}).join(''):'<tr><td colspan="9" class="empty-cell">لا صفقات ورقية مفتوحة.</td></tr>';
  const H=S.history,w=H.filter(t=>t.pnl>0).length,gp=H.filter(t=>t.pnl>0).reduce((a,t)=>a+t.pnl,0),gl=-H.filter(t=>t.pnl<=0).reduce((a,t)=>a+t.pnl,0);
  $('smHistStats').textContent=H.length?`${H.length} صفقة · فوز ${r2(w/H.length*100,0)}% · PF ${gl>0?r2(gp/gl):'—'}`:'لا سجل بعد';
  $('smHistory').innerHTML=H.length?H.slice(0,40).map(t=>`<tr><td>${tm(t.t_out)}</td><td><b>${t.coin}</b></td><td class="${t.side==='long'?'up':'down'}">${t.side==='long'?'شراء':'بيع'}</td><td>${px(t.entry)} → ${px(t.exit)}</td><td>${E.EXIT_AR[t.why]||t.why}</td><td class="${t.pnl>=0?'up':'down'}">${usd(t.pnl)}</td></tr>`).join(''):'<tr><td colspan="6" class="empty-cell">لم تُغلق صفقات بعد.</td></tr>';
  $('smLog').innerHTML=S.log.slice(0,12).map(l=>`<li class="${l.kind}"><time>${new Date(l.t).toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'})}</time> ${escH(l.msg)}</li>`).join('')||'<li class="muted">لا أحداث بعد.</li>';
  const cv=$('smCurve');if(cv)lineChart(cv,S.curve,{base:S.eq0,empty:'يبدأ المنحنى بعد تشغيل المحرك',fmt:v=>'$'+Math.round(v).toLocaleString('en-US')})}
function init(){renderForm();setInterval(()=>{if(S.running||(typeof activeView!=='undefined'&&activeView==='smart'))evaluateAll(false)},30000);if(S.running)evaluateAll(true)}
document.addEventListener('madar:view',e=>{if(e.detail==='smart'){evaluateAll(Date.now()-lastEval>60000);render()}});
document.addEventListener('DOMContentLoaded',init);
window.Smart={render,start,stop,kill,closeOne,reset,applySettings,runBacktest,evaluateAll,get state(){return S},get last(){return bt},COINS};
})();
