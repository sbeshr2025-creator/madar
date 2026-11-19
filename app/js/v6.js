/* مدار v6 — الأداء الحقيقي، يوميات التداول، ماسح السوق، تنبيهات ذكية عبر البوت، خطة شراء دوري (DCA)، وتحسينات تيليجرام وPWA.
   لا مفاتيح ولا اتصال بحسابك: الأداء يُحسب من لقطة البوت؛ الأوامر الحقيقية تمر عبر Real.send → البوت → ✅. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n2=(x,d=2)=>Number.isFinite(+x)?(+x).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const nq=x=>Number.isFinite(+x)?(+x).toLocaleString('en-US',{maximumFractionDigits:8}):'—';
const usd=x=>Number.isFinite(+x)?((+x)<0?'-$':'$')+n2(Math.abs(x)):'—';
const sgn=x=>(x>0?'up':x<0?'down':'');
const pct=x=>Number.isFinite(+x)?((x>0?'+':'')+n2(x,1)+'%'):'—';
const dt=t=>new Date(t*1000).toLocaleString('ar',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
const lj=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch{return d}};
const sj=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const pk=()=>(window.Real&&Real.packet)||null;
const toast=m=>{try{showToast(m)}catch{}};
const tg=(window.Telegram&&Telegram.WebApp&&Telegram.WebApp.initData)?Telegram.WebApp:null;
const live=s=>{try{const a=ASSETS.find(x=>x.s===s);return a?a.price:0}catch{return 0}};

/* ================= account value history (from snapshots, this device only) ================= */
const EQK='madar-eq-v1';
function recordEquity(){const P=pk();if(!P)return;const t=P.bt||P.t,T=+P.T;if(!t||!Number.isFinite(T))return;const h=lj(EQK,[]);if(h.length&&h[h.length-1][0]>=t)return;h.push([t,+T.toFixed(4)]);sj(EQK,h.slice(-400))}

/* ================= performance (FIFO on fills) ================= */
function analyse(P){const fl=(P.fl||[]).slice().sort((a,b)=>a[0]-b[0]),lots={},coins={},closes=[];let fees=0,vol=0,unmatched=0,feeUnknown=0;
  for(const f of fl){const [t,sd,c,q,px,fee,unk]=f;const qty=+q,price=+px,fu=+fee||0;if(!(qty>0&&price>0))continue;fees+=fu;vol+=qty*price;if(unk)feeUnknown++;
    const C=coins[c]||(coins[c]={c,buys:0,sells:0,bq:0,bc:0,vol:0,fees:0,real:0,wins:0,closes:0});C.vol+=qty*price;C.fees+=fu;
    const L=lots[c]||(lots[c]=[]);
    if(sd==='b'){C.buys++;C.bq+=qty;C.bc+=qty*price+fu;L.push([qty,(qty*price+fu)/qty])}
    else{C.sells++;let left=qty,cost=0,m=0;while(left>1e-12&&L.length){const lot=L[0],take=Math.min(lot[0],left);cost+=take*lot[1];m+=take;lot[0]-=take;left-=take;if(lot[0]<=1e-12)L.shift()}
      if(left>1e-12)unmatched++;if(m>0){const pnl=m*price-fu*(m/qty)-cost;C.real+=pnl;C.closes++;if(pnl>0)C.wins++;closes.push({t,c,pnl,src:'spot'})}}}
  for(const x of (P.fc||[])){const pnl=+x[3];if(!Number.isFinite(pnl))continue;closes.push({t:+x[0],c:x[1],pnl,src:'fut',side:x[2]});fees+=Math.abs(+x[4]||0)*0}
  closes.sort((a,b)=>a.t-b.t);const wins=closes.filter(x=>x.pnl>0),loss=closes.filter(x=>x.pnl<0);const gw=wins.reduce((a,x)=>a+x.pnl,0),gl=-loss.reduce((a,x)=>a+x.pnl,0);
  let cum=0,peak=0,mdd=0;const curve=closes.map(x=>{cum+=x.pnl;peak=Math.max(peak,cum);mdd=Math.max(mdd,peak-cum);return [x.t,+cum.toFixed(6)]});
  const futFees=(P.fc||[]).reduce((a,x)=>a+Math.abs(+x[4]||0),0);
  return {fills:fl.length,coins:Object.values(coins).sort((a,b)=>b.vol-a.vol),closes,net:cum,wins:wins.length,losses:loss.length,winRate:closes.length?wins.length/closes.length*100:null,pf:gl>0?gw/gl:(gw>0?Infinity:null),avgW:wins.length?gw/wins.length:0,avgL:loss.length?gl/loss.length:0,fees,futFees,vol,unmatched,feeUnknown,curve,mdd,best:closes.reduce((a,x)=>!a||x.pnl>a.pnl?x:a,null),worst:closes.reduce((a,x)=>!a||x.pnl<a.pnl?x:a,null)}}
function renderPerf(){const root=$('perfRoot');if(!root)return;const P=pk();
  if(!P){root.innerHTML=`<section class="card pad real-empty"><h2>📊 أداؤك الحقيقي</h2><p>يُحسب الأداء من صفقاتك المنفذة في Gate التي يرسلها بوتك داخل زر «📈 مدار — حسابي». افتح مدار من البوت (<code>/madar</code>) لتظهر الأرقام هنا.</p><div class="form-actions"><button class="execute small-btn" onclick="navigate('real')">حسابي الحقيقي</button></div></section>`;return}
  const A=analyse(P),eq=lj(EQK,[]);const noteKeys=new Set(J.all().map(e=>e.ref).filter(Boolean));
  root.innerHTML=`<div class="kpis">
    <div class="kpi card"><small>صافي الربح المحقق</small><b class="${sgn(A.net)}">${usd(A.net)}</b><em>${A.closes.length} صفقة مغلقة</em></div>
    <div class="kpi card"><small>نسبة الفوز</small><b>${A.winRate==null?'—':n2(A.winRate,0)+'%'}</b><em>${A.wins} رابحة · ${A.losses} خاسرة</em></div>
    <div class="kpi card"><small>عامل الربح</small><b>${A.pf==null?'—':A.pf===Infinity?'∞':n2(A.pf)}</b><em>متوسط ربح ${usd(A.avgW)} · خسارة ${usd(-A.avgL)}</em></div>
    <div class="kpi card"><small>الرسوم المدفوعة</small><b class="down">${usd(A.fees+A.futFees)}</b><em>فوري ${usd(A.fees)} · عقود ${usd(A.futFees)}</em></div>
    <div class="kpi card"><small>أقصى تراجع (محقق)</small><b>${usd(-A.mdd)}</b><em>حجم التداول ${usd(A.vol)}</em></div>
    <div class="kpi card"><small>قيمة الحساب الآن</small><b>${usd(P.T)}</b><em>${eq.length} لقطة محفوظة</em></div></div>
  <div class="real-grid"><section class="card pad"><div class="table-title"><h2>منحنى الربح المحقق</h2><span class="sim-chip">فوري + عقود</span></div><div class="line-chart"><canvas id="perfCurve"></canvas></div></section>
   <section class="card pad"><div class="table-title"><h2>قيمة الحساب عبر اللقطات</h2><span class="sim-chip">من هذا الجهاز</span></div><div class="line-chart"><canvas id="perfEq"></canvas></div></section></div>
  <section class="card pad"><div class="table-title"><h2>حسب العملة (فوري)</h2></div><div class="table-wrap"><table><thead><tr><th>العملة</th><th>شراء/بيع</th><th>متوسط الشراء</th><th>الحجم</th><th>الرسوم</th><th>المحقق</th><th>فوز</th></tr></thead><tbody>${A.coins.map(c=>`<tr><td><b>${esc(c.c)}</b></td><td>${c.buys}/${c.sells}</td><td>${c.bq?nq(+(c.bc/c.bq).toPrecision(6)):'—'}</td><td>${usd(c.vol)}</td><td>${usd(c.fees)}</td><td class="${sgn(c.real)}">${c.closes?usd(c.real):'—'}</td><td>${c.closes?c.wins+'/'+c.closes:'—'}</td></tr>`).join('')||'<tr><td colspan="7" class="empty-cell">لا صفقات فورية في النافذة الحالية</td></tr>'}</tbody></table></div></section>
  <div class="real-grid"><section class="card pad"><div class="table-title"><h2>الصفقات الفورية المنفذة</h2><small class="muted">آخر ${A.fills}</small></div><div class="table-wrap"><table><thead><tr><th>الوقت</th><th>العملة</th><th>الاتجاه</th><th>القيمة</th><th>الرسوم</th><th></th></tr></thead><tbody>${(P.fl||[]).slice(0,40).map(f=>{const key='f:'+f[0]+':'+f[2]+':'+f[1]+':'+f[3];return `<tr><td>${dt(f[0])}</td><td>${esc(f[2])}</td><td class="${f[1]==='b'?'up':'down'}">${f[1]==='b'?'شراء':'بيع'}</td><td>${usd(f[3]*f[4])}</td><td>${f[6]?'؟':usd(f[5])}</td><td><button class="row-action" onclick="V6.noteFor('${key}','${esc(f[2])}','${f[1]==='b'?'buy':'sell'}','real')">${noteKeys.has(key)?'📝 ملاحظة ✓':'📝'}</button></td></tr>`}).join('')||'<tr><td colspan="6" class="empty-cell">لا صفقات فورية حديثة</td></tr>'}</tbody></table></div></section>
   <section class="card pad"><div class="table-title"><h2>مراكز العقود المغلقة</h2></div><div class="table-wrap"><table><thead><tr><th>الوقت</th><th>العقد</th><th>الاتجاه</th><th>الربح</th><th></th></tr></thead><tbody>${(P.fc||[]).slice(0,40).map(x=>{const key='c:'+x[0]+':'+x[1];return `<tr><td>${dt(x[0])}</td><td>${esc(x[1])}</td><td>${x[2]==='long'?'Long':x[2]==='short'?'Short':esc(x[2])}</td><td class="${sgn(+x[3])}">${usd(x[3])}</td><td><button class="row-action" onclick="V6.noteFor('${key}','${esc(String(x[1]).split('_')[0])}','${x[2]==='short'?'sell':'buy'}','real')">${noteKeys.has(key)?'📝 ✓':'📝'}</button></td></tr>`}).join('')||'<tr><td colspan="5" class="empty-cell">لا مراكز مغلقة</td></tr>'}</tbody></table></div></section></div>
  <p class="muted small">النافذة: آخر 100 صفقة فورية وآخر 40 مركز عقود من Gate. الربح الفوري يُحسب بطريقة FIFO داخل النافذة فقط${A.unmatched?` (${A.unmatched} بيع بلا شراء مقابل داخل النافذة لم يُحتسب)`:''}${A.feeUnknown?`، و${A.feeUnknown} رسوم بعملة أخرى (مثل GT) لم تُحوَّل`:''}. ربح العقود كما تحسبه Gate (يشمل الرسوم والتمويل). هذه أرقام تاريخية وليست توقعًا.</p>`;
  requestAnimationFrame(()=>{try{lineChart($('perfCurve'),A.curve.length?[[A.curve[0][0]-1,0],...A.curve]:[],{base:0,fmt:v=>'$'+v.toFixed(2),empty:'لا صفقات مغلقة بعد'});lineChart($('perfEq'),eq,{fmt:v=>'$'+v.toFixed(0),empty:'تتجمع النقاط مع كل فتح لمدار من البوت'})}catch(e){}})}

/* ================= trading journal ================= */
const JK='madar-journal-v1';
const J={all:()=>lj(JK,[]),save:x=>sj(JK,x.slice(0,1000))};
let jFilter={q:'',tag:''},jEdit=null,jPending=null;
function journalForm(pre){const p=pre||{};const syms=ASSETS.filter(a=>a.s!=='USDT').map(a=>a.s);return `<form id="jForm" class="form-grid" onsubmit="event.preventDefault();V6.jSave()">
  <label>العملة<select name="sym"><option value="">—</option>${syms.map(s=>`<option ${s===p.sym?'selected':''}>${s}</option>`).join('')}</select></label>
  <label>النوع<select name="kind">${[['real','صفقة حقيقية'],['paper','صفقة تجريبية'],['idea','فكرة/خطة'],['lesson','درس']].map(([v,l])=>`<option value="${v}" ${v===(p.kind||'idea')?'selected':''}>${l}</option>`).join('')}</select></label>
  <label>الاتجاه<select name="side">${[['','—'],['buy','شراء/Long'],['sell','بيع/Short']].map(([v,l])=>`<option value="${v}" ${v===(p.side||'')?'selected':''}>${l}</option>`).join('')}</select></label>
  <label>الحالة النفسية<select name="mood">${['','😌 هادئ','😬 متوتر','🤑 طمع','😨 خوف','😤 انتقام','🎯 منضبط'].map(m=>`<option ${m===(p.mood||'')?'selected':''}>${m}</option>`).join('')}</select></label>
  <label>التقييم (1-5)<input name="rating" type="number" min="1" max="5" step="1" value="${p.rating||''}"></label>
  <label>وسوم (بفاصلة)<input name="tags" value="${esc((p.tags||[]).join('، '))}" placeholder="اختراق، اتجاه، خطأ"></label>
  <label style="grid-column:1/-1">الملاحظة<textarea name="text" rows="3" maxlength="2000" placeholder="لماذا دخلت؟ ما الخطة؟ ماذا تعلمت؟">${esc(p.text||'')}</textarea></label>
  <input type="hidden" name="ref" value="${esc(p.ref||'')}">
  <div class="form-actions"><button class="execute small-btn" type="submit">${jEdit?'حفظ التعديل':'إضافة للسجل'}</button>${jEdit?'<button class="outline" type="button" onclick="V6.jCancel()">إلغاء</button>':''}<small class="muted">يُحفظ في هذا الجهاز فقط.</small></div></form>`}
function renderJournal(pre){const root=$('journalRoot');if(!root)return;if(!pre&&jPending){pre=jPending;jPending=null}const all=J.all();const tags={};all.forEach(e=>(e.tags||[]).forEach(t=>tags[t]=(tags[t]||0)+1));
  const q=jFilter.q.trim().toLowerCase();const list=all.filter(e=>(!jFilter.tag||(e.tags||[]).includes(jFilter.tag))&&(!q||(e.text+' '+e.sym+' '+(e.tags||[]).join(' ')).toLowerCase().includes(q)));
  const rated=all.filter(e=>e.rating),avg=rated.length?rated.reduce((a,e)=>a+e.rating,0)/rated.length:null;const KL={real:'حقيقية',paper:'تجريبية',idea:'فكرة',lesson:'درس'};
  root.innerHTML=`<div class="kpis"><div class="kpi card"><small>الملاحظات</small><b>${all.length}</b><em>${all.filter(e=>e.kind==='real').length} مرتبطة بصفقات حقيقية</em></div><div class="kpi card"><small>متوسط التقييم</small><b>${avg==null?'—':n2(avg,1)+' / 5'}</b><em>${rated.length} مقيّمة</em></div><div class="kpi card"><small>أكثر الوسوم</small><b class="kpi-tags">${Object.entries(tags).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,n])=>esc(t)+' ·'+n).join('  ')||'—'}</b><em>تساعدك على رؤية الأنماط</em></div></div>
  <div class="real-grid"><section class="card pad"><div class="table-title"><h2>${jEdit?'تعديل ملاحظة':'ملاحظة جديدة'}</h2></div>${journalForm(pre)}</section>
  <section class="card pad"><div class="table-title"><h2>السجل</h2><div class="sb-actions"><button class="outline" onclick="V6.jExport()">⬇️ CSV</button></div></div>
   <div class="j-filter"><input id="jQ" type="search" placeholder="بحث…" value="${esc(jFilter.q)}"><div class="chips">${['',...Object.keys(tags)].slice(0,12).map(t=>`<button class="chip ${t===jFilter.tag?'on':''}" data-tag="${esc(t)}">${t?esc(t):'الكل'}</button>`).join('')}</div></div>
   <ul class="j-list">${list.slice(0,100).map(e=>`<li><div class="j-head"><b>${esc(e.sym||'عام')}</b> <span class="sim-chip">${KL[e.kind]||''}</span>${e.side?` <small class="${e.side==='buy'?'up':'down'}">${e.side==='buy'?'شراء':'بيع'}</small>`:''}${e.mood?` <small>${esc(e.mood)}</small>`:''}${e.rating?` <small>${'★'.repeat(e.rating)}${'☆'.repeat(5-e.rating)}</small>`:''}<time>${dt(e.t)}</time></div><p>${esc(e.text)}</p>${(e.tags||[]).length?`<div class="chips">${e.tags.map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div>`:''}<div class="j-act"><button class="text-button" onclick="V6.jEditId('${e.id}')">تعديل</button><button class="text-button" onclick="V6.jDel('${e.id}')">حذف</button></div></li>`).join('')||'<li class="empty-cell">لا ملاحظات بعد. اكتب أول ملاحظة عن صفقتك القادمة: الخطة، الوقف، والسبب.</li>'}</ul></section></div>`;
  const qi=$('jQ');qi.oninput=()=>{jFilter.q=qi.value;clearTimeout(qi._t);qi._t=setTimeout(()=>{renderJournal(readForm());const n=$('jQ');n.focus();n.setSelectionRange(n.value.length,n.value.length)},250)};
  root.querySelectorAll('.j-filter .chip').forEach(b=>b.onclick=()=>{jFilter.tag=b.dataset.tag;renderJournal(readForm())})}
function readForm(){const f=$('jForm');if(!f)return null;const g=n=>f.elements[n].value;return {sym:g('sym'),kind:g('kind'),side:g('side'),mood:g('mood'),rating:parseInt(g('rating'),10)||0,tags:g('tags').split(/[,،]/).map(s=>s.trim()).filter(Boolean).slice(0,8),text:g('text').trim(),ref:g('ref')}}
function jSave(){const x=readForm();if(!x.text){toast('اكتب نص الملاحظة');return}x.rating=Math.max(0,Math.min(5,x.rating));const all=J.all();
  if(jEdit){const i=all.findIndex(e=>e.id===jEdit);if(i>=0)all[i]={...all[i],...x}}else all.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,5),t:Math.floor(Date.now()/1000),...x});
  J.save(all);jEdit=null;toast('حُفظت الملاحظة');renderJournal()}
function jDel(id){if(!confirm('حذف هذه الملاحظة؟'))return;J.save(J.all().filter(e=>e.id!==id));renderJournal()}
function jEditId(id){const e=J.all().find(x=>x.id===id);if(!e)return;jEdit=id;renderJournal(e);$('jForm').scrollIntoView({behavior:'smooth',block:'center'})}
function jCancel(){jEdit=null;renderJournal()}
function noteFor(ref,sym,side,kind){const e=J.all().find(x=>x.ref===ref);jEdit=e?e.id:null;jPending=e||{ref,sym,side,kind};if(typeof activeView!=='undefined'&&activeView==='journal'){renderJournal()}else navigate('journal');setTimeout(()=>{const t=$('jForm')&&$('jForm').elements.text;if(t&&!vpSmall())t.focus()},120)}
const vpSmall=()=>matchMedia('(max-width:520px)').matches;
function jExport(){const rows=[['time','symbol','kind','side','mood','rating','tags','note','ref'],...J.all().map(e=>[new Date(e.t*1000).toISOString(),e.sym,e.kind,e.side,e.mood,e.rating||'',(e.tags||[]).join('|'),e.text,e.ref||''])];
  const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='madar-journal.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}

/* ================= market scanner ================= */
let scan={tf:'1h',filter:'all',rows:null,at:0,busy:false};
function ema(v,n){const k=2/(n+1);let e=v[0];return v.map(x=>e=x*k+e*(1-k))}
function rsi(c,n=14){if(c.length<n+2)return null;let g=0,l=0;for(let i=1;i<=n;i++){const d=c[i]-c[i-1];g+=Math.max(d,0);l+=Math.max(-d,0)}g/=n;l/=n;for(let i=n+1;i<c.length;i++){const d=c[i]-c[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n}return l===0?100:100-100/(1+g/l)}
function analyseBars(bars,tf){const B=bars.filter(b=>b.closed!==false);if(B.length<40)return null;const c=B.map(b=>b.c),last=B[B.length-1],N=20;
  const prev=B.slice(-N-1,-1),hi=Math.max(...prev.map(b=>b.h)),lo=Math.min(...prev.map(b=>b.l)),avgV=prev.reduce((a,b)=>a+b.v,0)/N,vr=avgV>0?last.v/avgV:0;
  const per={'15m':96,'1h':24,'4h':6}[tf]||24,ref=B[Math.max(0,B.length-1-per)].c,ch=(last.c/ref-1)*100,r=rsi(c),e20=ema(c,20),e50=ema(c,50),i=c.length-1;
  const sig=[];if(vr>=2)sig.push({k:'vol',t:`🔥 حجم ×${n2(vr,1)}`,w:Math.min(3,vr/2)});if(last.c>hi)sig.push({k:'brk',t:'🚀 اختراق قمة 20 شمعة',w:2.5});if(last.c<lo)sig.push({k:'brk',t:'📉 كسر قاع 20 شمعة',w:2.5});
  if(r!=null&&r>=70)sig.push({k:'rsi',t:`RSI ${n2(r,0)} تشبّع شراء`,w:1.5});if(r!=null&&r<=30)sig.push({k:'rsi',t:`RSI ${n2(r,0)} تشبّع بيع`,w:1.5});
  if(e20[i]>e50[i]&&e20[i-1]<=e50[i-1])sig.push({k:'ema',t:'✳️ تقاطع EMA20 فوق EMA50',w:2});if(e20[i]<e50[i]&&e20[i-1]>=e50[i-1])sig.push({k:'ema',t:'✳️ تقاطع EMA20 تحت EMA50',w:2});
  return {price:last.c,ch,vr,rsi:r,trend:e20[i]>e50[i]?'up':'down',sig,score:sig.reduce((a,s)=>a+s.w,0),spark:c.slice(-30)}}
async function runScan(force){if(scan.busy)return;if(!force&&scan.rows&&Date.now()-scan.at<300000)return;scan.busy=true;renderScanner();const tf=scan.tf,out=[];
  const syms=ASSETS.filter(a=>a.s!=='USDT').map(a=>a.s);let i=0;
  await Promise.all(Array.from({length:4},async()=>{while(i<syms.length){const s=syms[i++];try{const bars=await Market.snapOnly(s,tf);const r=bars&&analyseBars(bars,tf);if(r)out.push({s,...r})}catch(e){}}}));
  if(tf===scan.tf){scan.rows=out.sort((a,b)=>b.score-a.score||Math.abs(b.ch)-Math.abs(a.ch));scan.at=Date.now()}scan.busy=false;renderScanner()}
function spark(v){if(!v||v.length<2)return '';const lo=Math.min(...v),hi=Math.max(...v),W=80,H=24;const pts=v.map((x,i)=>`${(i/(v.length-1)*W).toFixed(1)},${(H-(x-lo)/((hi-lo)||1)*H).toFixed(1)}`).join(' ');return `<svg class="spark ${v[v.length-1]>=v[0]?'up':'down'}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`}
function renderScanner(){const root=$('scannerRoot');if(!root)return;const rows=(scan.rows||[]).filter(r=>scan.filter==='all'?true:scan.filter==='sig'?r.sig.length:r.sig.some(s=>s.k===scan.filter));const P=pk(),pairs=(P&&P.pairs)||[];
  root.innerHTML=`<div class="card pad scan-bar"><div class="chips">${[['all','الكل'],['sig','بإشارة'],['vol','🔥 حجم'],['brk','🚀 اختراق'],['rsi','RSI'],['ema','تقاطع']].map(([k,l])=>`<button class="chip ${k===scan.filter?'on':''}" data-f="${k}">${l}</button>`).join('')}</div>
   <div class="sb-actions"><select id="scanTf" aria-label="الإطار">${['15m','1h','4h'].map(t=>`<option ${t===scan.tf?'selected':''}>${t}</option>`).join('')}</select><button class="outline" id="scanGo">${scan.busy?'⏳ جارٍ الفحص…':'🔄 فحص'}</button><small class="muted">${scan.at?'آخر فحص '+new Date(scan.at).toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit',hour12:false}):''}</small></div></div>
  <section class="card pad"><div class="table-wrap"><table class="scan-table"><thead><tr><th>العملة</th><th>السعر</th><th>تغير 24س</th><th>الحجم/المتوسط</th><th>RSI</th><th>الاتجاه</th><th>الإشارات</th><th></th></tr></thead><tbody>${scan.rows==null?'<tr><td colspan="8" class="empty-cell">⏳ جارٍ جلب الشموع…</td></tr>':rows.map(r=>`<tr><td><b>${r.s}</b>${spark(r.spark)}</td><td>${fmtPrice(r.price)}</td><td class="${sgn(r.ch)}">${pct(r.ch)}</td><td>×${n2(r.vr,1)}</td><td>${r.rsi==null?'—':n2(r.rsi,0)}</td><td class="${r.trend}">${r.trend==='up'?'صاعد':'هابط'}</td><td>${r.sig.map(s=>`<span class="chip sig-${s.k}">${s.t}</span>`).join(' ')||'<small class="muted">—</small>'}</td><td class="scan-act"><button class="row-action" onclick="selectAsset('${r.s}');navigate('trade')">شارت</button><button class="row-action" onclick="V6.alertPrefill('${r.s}',${r.price})">تنبيه</button>${pairs.includes(r.s)?`<button class="row-action" onclick="V6.realPrefill('${r.s}')">حقيقي</button>`:''}</td></tr>`).join('')||'<tr><td colspan="8" class="empty-cell">لا عملات تطابق هذا الفلتر الآن</td></tr>'}</tbody></table></div>
  <p class="muted small">الشموع من لقطة السوق العامة (Gate عبر Ajcoin) — العملات غير المتاحة فيها لا تظهر. الإشارات وصفية وليست توصيات؛ الاختبارات التاريخية لم تُظهر أفضلية مثبتة لمثل هذه القواعد.</p></section>`;
  root.querySelectorAll('.scan-bar .chip').forEach(b=>b.onclick=()=>{scan.filter=b.dataset.f;renderScanner()});$('scanTf').onchange=e=>{scan.tf=e.target.value;scan.rows=null;runScan(true)};$('scanGo').onclick=()=>runScan(true)}
function realPrefill(s){navigate('real');setTimeout(()=>{const f=$('rtSpot');if(!f)return;f.elements.sym.value=s;f.dispatchEvent(new Event('change'));f.scrollIntoView({behavior:'smooth',block:'center'})},50)}

/* ================= smart alerts via the bot ================= */
function renderSmartAlerts(){const root=$('smartAlertsRoot');if(!root)return;const P=pk();
  if(!P){root.innerHTML=`<section class="card pad"><div class="table-title"><h2>🔔 تنبيهات ذكية إلى تيليجرام</h2><span class="real-chip">للمالك</span></div><p class="muted small">تنبيهات السعر ونسبة التغير وتقاطع RSI يرسلها بوتك إليك في تيليجرام حتى والتطبيق مغلق. متاحة عند فتح مدار من زر البوت (<code>/madar</code>).</p></section>`;return}
  const syms=ASSETS.filter(a=>a.s!=='USDT').map(a=>a.s),K={p:'السعر',c:'تغير 24س %',r:'RSI(14)'},TF={q:'15m',h:'1h',f:'4h'};
  root.innerHTML=`<section class="card pad"><div class="table-title"><h2>🔔 تنبيهات ذكية إلى تيليجرام</h2><span class="real-chip">يرسلها بوتك</span></div>
  <form id="saForm" class="form-grid" onsubmit="event.preventDefault();V6.saSend()"><label>العملة<select name="sym">${syms.map(s=>`<option>${s}</option>`).join('')}</select></label>
   <label>الشرط<select name="k"><option value="p">السعر</option><option value="c">تغير 24 ساعة %</option><option value="r">تقاطع RSI(14)</option></select></label>
   <label>الاتجاه<select name="op"><option value="a">فوق / يعبر صعودًا</option><option value="b">تحت / يعبر هبوطًا</option></select></label>
   <label>القيمة<input name="v" type="number" step="any" inputmode="decimal" required></label><label class="sa-tf">الإطار<select name="tf"><option value="q">15m</option><option value="h" selected>1h</option><option value="f">4h</option></select></label>
   <div class="form-actions"><button class="execute small-btn" type="submit">إنشاء في البوت</button><small class="muted" id="saHint"></small></div></form>
  <div class="table-wrap"><table><thead><tr><th>التنبيه</th><th></th></tr></thead><tbody>${(P.ma||[]).map(a=>`<tr><td><b>${esc(a[1])}</b> · ${K[a[2]]||''} ${a[3]==='a'?'≥ / ↑':'≤ / ↓'} ${nq(a[4])}${a[2]==='r'?' · '+(TF[a[5]]||'1h'):a[2]==='c'?'%':''}</td><td><button class="row-action" onclick="Real.send({action:'madar_alert_del',id:'${esc(a[0])}'})">حذف</button></td></tr>`).join('')||'<tr><td colspan="2" class="empty-cell">لا تنبيهات ذكية بعد</td></tr>'}</tbody></table></div>
  <p class="muted small">التنبيه يُفحص في البوت كل دقيقة ويُرسل مرة واحدة ثم يُحذف. القائمة أعلاه من آخر لقطة. الحد 20 تنبيهًا. <button class="text-button" onclick="Real.send({action:'madar_alerts'})">عرض القائمة في البوت</button></p></section>`;
  const f=$('saForm'),upd=()=>{const k=f.elements.k.value,s=f.elements.sym.value;f.querySelector('.sa-tf').style.display=k==='r'?'':'none';$('saHint').textContent=k==='p'?'السعر الآن '+fmtPrice(live(s)):k==='c'?'مثال: 5 أو -5':'مثال: 30 أو 70'};f.addEventListener('change',upd);upd()}
function saSend(){const f=$('saForm');const p={action:'madar_alert',sym:f.elements.sym.value,k:f.elements.k.value,op:f.elements.op.value,v:Number(f.elements.v.value)};  if(!Number.isFinite(p.v)||(p.k==='p'&&!(p.v>0))||(p.k==='r'&&!(p.v>=1&&p.v<=99))||(p.k==='c'&&!(p.v>=-95&&p.v<=500))){toast('قيمة غير صالحة لهذا الشرط');return}
  if(p.k==='r')p.tf=f.elements.tf.value==='q'?'15m':f.elements.tf.value==='f'?'4h':'1h';Real.send(p)}
function alertPrefill(s,price){navigate('alerts');setTimeout(()=>{const f=$('saForm');if(f){f.elements.sym.value=s;f.elements.k.value='p';f.elements.v.value=+(+price).toPrecision(5);f.dispatchEvent(new Event('change'));f.scrollIntoView({behavior:'smooth',block:'center'})}else{try{openAlertModal()}catch{}}},60)}

/* ================= DCA planner (backtest + paper plan + real installment) ================= */
const DK='madar-dca-v1';
async function dcaRun(){const f=$('dcaForm');if(!f)return;const sym=f.elements.sym.value,amt=+f.elements.amt.value,every=+f.elements.every.value,months=+f.elements.months.value,fee=0.001;
  const out=$('dcaOut');if(!(amt>0)){out.innerHTML='<p class="muted">أدخل المبلغ</p>';return}out.innerHTML='<p class="muted">⏳ جارٍ الحساب…</p>';
  const bars=((await Market.bundle(sym))||[]).map(b=>Array.isArray(b)?{t:+b[0],c:+b[4]||+b[2]}:{t:+b.t,c:+b.c}).filter(b=>b.c>0);if(bars.length<50){out.innerHTML='<p class="muted">لا توجد بيانات تاريخية كافية</p>';return}
  const end=bars[bars.length-1].t,start=months?end-months*30*86400:bars[0].t,B=bars.filter(b=>b.t>=start);let next=B[0].t,qty=0,inv=0,n=0,peak=0,mdd=0;const curve=[];
  for(const b of B){if(b.t>=next){qty+=amt/b.c*(1-fee);inv+=amt;n++;next=b.t+every*86400}const val=qty*b.c,pl=val-inv;curve.push([b.t,+pl.toFixed(2)]);peak=Math.max(peak,pl);mdd=Math.max(mdd,peak-pl)}
  const lastC=B[B.length-1].c,val=qty*lastC,lump=inv/B[0].c*(1-fee)*lastC;
  out.innerHTML=`<div class="kpis sm"><div class="kpi"><small>المستثمَر</small><b>${usd(inv)}</b><em>${n} دفعة</em></div><div class="kpi"><small>القيمة الآن</small><b class="${sgn(val-inv)}">${usd(val)}</b><em>${pct((val/inv-1)*100)}</em></div><div class="kpi"><small>متوسط التكلفة</small><b>${fmtPrice(inv/qty)}</b><em>السعر الأخير ${fmtPrice(lastC)}</em></div><div class="kpi"><small>دفعة واحدة بالبداية</small><b class="${sgn(lump-inv)}">${usd(lump)}</b><em>${pct((lump/inv-1)*100)}</em></div></div>
   <div class="line-chart"><canvas id="dcaCurve"></canvas></div><p class="muted small">الربح/الخسارة غير المحققة عبر الزمن على شموع 4 ساعات تاريخية (رسوم 0.1%، بلا انزلاق). الشراء الدوري يقلل أثر التوقيت لكنه لا يمنع الخسارة إذا هبط السعر.</p>`;
  requestAnimationFrame(()=>{try{lineChart($('dcaCurve'),curve,{base:0,fmt:v=>'$'+v.toFixed(0)})}catch{}})}
function dcaPlan(){return lj(DK,null)}
function dcaStart(){const f=$('dcaForm');const p={sym:f.elements.sym.value,amt:+f.elements.amt.value,every:+f.elements.every.value,next:Date.now(),n:0};if(!(p.amt>0))return toast('أدخل المبلغ');sj(DK,p);dcaTick();renderDca();toast('بدأت الخطة الورقية — تُنفَّذ الدفعات عند فتح مدار')}
function dcaStop(){localStorage.removeItem(DK);renderDca();toast('أُوقفت الخطة الورقية')}
function dcaTick(){const p=dcaPlan();if(!p||Date.now()<p.next)return;try{const px=live(p.sym);if(!(px>0)||!state||(state.balances.USDT||0)<p.amt){p.next=Date.now()+3600e3;sj(DK,p);return}
  state.balances.USDT-=p.amt;state.balances[p.sym]=(state.balances[p.sym]||0)+p.amt/px*(1-0.001);addActivity('شراء دوري تجريبي (DCA)',`${fmtQty(p.amt/px)} ${p.sym} بسعر ${fmtPrice(px)}`,-p.amt);save();p.n++;p.next=Date.now()+p.every*86400e3;sj(DK,p);toast(`🗓️ دفعة DCA تجريبية: ${n2(p.amt)} USDT → ${p.sym}`);try{renderAll()}catch{}}catch(e){}}
function dcaReal(){const P=pk();if(!P)return toast('افتح مدار من زر البوت لتنفيذ دفعة حقيقية');const f=$('dcaForm'),sym=f.elements.sym.value,amt=Math.min(+f.elements.amt.value||0,P.cap[0]);if(!(P.pairs||[]).includes(sym))return toast('هذه العملة غير مفعّلة في البوت');if(!(amt>0))return toast('أدخل المبلغ');
  Real.confirm('دفعة شراء دوري حقيقية',[`شراء <b>${sym}/USDT</b> بسعر السوق`,`المبلغ: <b>${n2(amt)} USDT</b>${amt<+f.elements.amt.value?' (مقيّد بحد البوت)':''}`,'الدفعات الحقيقية لا تتكرر تلقائيًا: كل دفعة تحتاج ضغطك هنا ثم ✅ في البوت.'],{action:'trade',side:'buy',pair:sym+'_USDT',order_type:'market',usdt:amt})}
function renderDca(){const root=$('dcaRoot');if(!root)return;const p=dcaPlan();const keep=$('dcaForm')?{sym:$('dcaForm').elements.sym.value,amt:$('dcaForm').elements.amt.value,every:$('dcaForm').elements.every.value,months:$('dcaForm').elements.months.value}:null;const v=keep||{sym:'BTC',amt:p?p.amt:10,every:7,months:12};
  root.innerHTML=`<section class="card pad"><div class="table-title"><h2>🗓️ خطة الشراء الدوري (DCA)</h2><span class="sim-chip">اختبار تاريخي + ورقي</span></div>
  <form id="dcaForm" class="form-grid" onsubmit="event.preventDefault();V6.dcaRun()"><label>العملة<select name="sym">${['BTC','ETH','SOL','BNB','XRP'].map(s=>`<option ${s===v.sym?'selected':''}>${s}</option>`).join('')}</select></label><label>المبلغ لكل دفعة (USDT)<input name="amt" type="number" min="1" step="any" value="${v.amt}"></label><label>كل<select name="every">${[[1,'يوم'],[3,'3 أيام'],[7,'أسبوع'],[14,'أسبوعين'],[30,'شهر']].map(([d,l])=>`<option value="${d}" ${+v.every===d?'selected':''}>${l}</option>`).join('')}</select></label><label>المدة<select name="months">${[[3,'3 أشهر'],[6,'6 أشهر'],[12,'سنة'],[0,'كل البيانات']].map(([m,l])=>`<option value="${m}" ${+v.months===m?'selected':''}>${l}</option>`).join('')}</select></label>
   <div class="form-actions"><button class="execute small-btn" type="submit">احسب</button>${p?`<button class="outline" type="button" onclick="V6.dcaStop()">إيقاف الخطة الورقية</button>`:`<button class="outline" type="button" onclick="V6.dcaStart()">تفعيل خطة ورقية</button>`}${pk()?`<button class="outline real-outline" type="button" onclick="V6.dcaReal()">🔴 دفعة حقيقية الآن</button>`:''}</div></form>
  ${p?`<div class="alert"><span>الخطة الورقية فعّالة: ${n2(p.amt)} USDT من ${p.sym} كل ${p.every} يوم · نُفّذ ${p.n} · الدفعة القادمة ${new Date(p.next).toLocaleString('ar',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}</span></div>`:''}<div id="dcaOut"></div></section>`;dcaRun()}

/* ================= Telegram + PWA polish ================= */
function tgPolish(){if(!tg)return;document.documentElement.classList.add('in-tg');try{const pr=lj('madar-prefs-v1',{});if(!pr.theme&&tg.colorScheme){document.documentElement.dataset.theme=tg.colorScheme==='light'?'light':'dark'}}catch{}
  try{tg.setHeaderColor&&tg.setHeaderColor(document.documentElement.dataset.theme==='light'?'#f4f6fb':'#09111f');tg.setBackgroundColor&&tg.setBackgroundColor(document.documentElement.dataset.theme==='light'?'#f4f6fb':'#09111f')}catch{}
  try{tg.BackButton&&tg.BackButton.onClick&&tg.BackButton.onClick(()=>navigate('dashboard'))}catch{}
  document.addEventListener('madar:view',e=>{try{if(e.detail==='dashboard')tg.BackButton.hide();else tg.BackButton.show();tg.HapticFeedback&&tg.HapticFeedback.selectionChanged&&tg.HapticFeedback.selectionChanged()}catch{}})}
let deferred=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;const b=$('installBtn');if(b)b.hidden=false});
function install(){if(deferred){deferred.prompt();deferred.userChoice.finally(()=>{deferred=null;const b=$('installBtn');if(b)b.hidden=true})}else toast(/iphone|ipad/i.test(navigator.userAgent)?'في Safari: مشاركة ← إضافة إلى الشاشة الرئيسية':'من قائمة المتصفح اختر «تثبيت التطبيق»')}
function settingsRow(){const s=document.querySelector('#view-settings .card');if(!s||$('installRow'))return;const d=document.createElement('div');d.className='settings-row';d.id='installRow';d.innerHTML='<div><b>تثبيت مدار كتطبيق</b><small>يعمل دون اتصال للواجهة، مع اختصارات لحسابي والماسح واليوميات.</small></div><button class="outline" id="installBtn2" onclick="V6.install()">📲 تثبيت</button>';s.appendChild(d)}

/* ================= wiring ================= */
const R={perf:renderPerf,journal:()=>renderJournal(),scanner:()=>{renderScanner();runScan()},alerts:renderSmartAlerts,tools:renderDca};
document.addEventListener('madar:view',e=>{const f=R[e.detail];if(f)try{f()}catch(err){console.error(err)}});
document.addEventListener('madar:packet',()=>{recordEquity();try{const v=typeof activeView!=='undefined'?activeView:'';if(v==='perf')renderPerf();if(v==='alerts')renderSmartAlerts();if(v==='tools')renderDca()}catch{}});
document.addEventListener('DOMContentLoaded',()=>{tgPolish();settingsRow();setTimeout(dcaTick,4000);setInterval(dcaTick,60000);setInterval(()=>{if(typeof activeView!=='undefined'&&activeView==='scanner'&&!document.hidden)runScan()},60000)});
window.V6={analyse,renderPerf,renderJournal,jSave,jDel,jEditId,jCancel,noteFor,jExport,runScan,renderScanner,scan,realPrefill,alertPrefill,saSend,renderSmartAlerts,dcaRun,dcaStart,dcaStop,dcaReal,dcaTick,install,rsi,analyseBars};
})();
