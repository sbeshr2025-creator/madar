/* مدار v5 — الحساب الحقيقي (للمالك فقط) عبر بوت @Ajcoinbot.
   - لا مفاتيح ولا اتصال مباشر بـ Gate من المتصفح.
   - بيانات الحساب تصل فقط داخل رابط زر المالك في تيليجرام (?mp=…) ثم تُحذف من شريط العنوان.
   - كل أمر يُرسل للبوت (sendData أو رابط /start)، والبوت يتحقق من هوية المالك ويطبق الحدود ويطلب ✅ قبل أي تنفيذ. */
(function(){
'use strict';
const BOT_USER='Ajcoinbot',KEY='madar-real-v1',$=id=>document.getElementById(id);
const tg=(window.Telegram&&window.Telegram.WebApp)||null;
const inTG=!!(tg&&tg.initData);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n2=(x,d=2)=>Number.isFinite(+x)?(+x).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const nq=x=>Number.isFinite(+x)?(+x).toLocaleString('en-US',{maximumFractionDigits:8}):'—';
const usd=x=>Number.isFinite(+x)?'$'+n2(x):'—';
const ago=t=>{if(!t)return '—';const m=Math.max(0,Math.round((Date.now()/1000-t)/60));return m<1?'الآن':m<60?`قبل ${m} د`:m<1440?`قبل ${Math.round(m/60)} س`:`قبل ${Math.round(m/1440)} يوم`};
let P=null,enc=null,fromKb=false;
try{fromKb=new URLSearchParams(location.search).get('src')==='kb'}catch{}
/* Start-parameter codec copied verbatim from the Ajcoin mini app (decoded by the daemon's terminal_orders / futures / auto_trade / smart_v21). */
  function baseSym(p) {
    p = String(p || "").toUpperCase().replace(/-/g, "_").trim();
    if (p.endsWith("_USDT")) p = p.slice(0, -5);
    return p;
  }
  function encNum(n) {
    n = Number(n);
    if (!isFinite(n) || n < 0) return null;
    if (Math.floor(n) === n && n < 1e12) return String(n);
    var s = n.toFixed(10).replace(/\.?0+$/, "");
    if (!s || s === "-0") s = "0";
    return s.replace(".", "p");
  }
  function encodeStartParam(payload) {
    var a = payload && payload.action;
    var out = null;
    if (a === "madar_refresh") out = "mdr";
    else if (a === "auto_smart") out = ({ status: "sm_st", real: "sm_real", paper: "sm_paper", resume: "sm_res", bt: "sm_bt" })[payload.op || "status"] || null;
    else if (a === "balance") out = "bal";
    else if (a === "portfolio") out = "pf";
    else if (a === "alerts_list") out = "als";
    else if (a === "deposit") {
      var cur = String(payload.currency || payload.coin || "").toUpperCase();
      var chain = String(payload.chain || payload.network || "").toUpperCase();
      if (!/^[A-Z0-9]+$/.test(cur)) return null;
      out = "dep_" + cur + (chain && /^[A-Z0-9]+$/.test(chain) ? "_" + chain : "");
    } else if (a === "open_orders" || a === "order_history" || a === "my_trades" || a === "cancel_all") {
      var pref = { open_orders: "ord", order_history: "oh", my_trades: "mt", cancel_all: "ca" }[a];
      var pair = String(payload.pair || "").toUpperCase().replace("-", "_");
      var sym = baseSym(pair);
      out = pref + (sym && /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(sym) ? "_" + sym : "");
    } else if (a === "alert") {
      var symbol = baseSym(payload.symbol || payload.pair || "");
      var tn = encNum(payload.target || payload.price);
      if (!/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(symbol || "") || !tn) return null;
      out = "al_" + symbol + "_" + tn;
    } else if (a === "cancel_order") {
      var oid = String(payload.order_id || payload.id || "");
      if (!oid || !/^[A-Za-z0-9_-]+$/.test(oid)) return null;
      var kind = String(payload.kind || "spot").toLowerCase();
      var cpair = String(payload.pair || "").toUpperCase().replace("-", "_");
      var csym = baseSym(cpair);
      if (kind === "price") out = "cx_p_" + oid;
      else if (csym && /^[A-Z0-9]+$/.test(csym)) out = "cx_s_" + csym + "_" + oid;
      else out = "cx_" + oid;
    } else if (a === "trade") {
      var sc = payload.side === "buy" ? "b" : (payload.side === "sell" ? "s" : "");
      var tpair = String(payload.pair || "").toUpperCase().replace("-", "_");
      var tsym = baseSym(tpair);
      var typ = payload.order_type || payload.type || "market";
      var tc = { market: "m", limit: "l", stop_limit: "k", take_profit: "t", stop_loss: "h" }[typ];
      if (!sc || !/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(tsym) || !tc) return null;
      var parts = ["o", sc, tsym, tc];
      var n;
      if (payload.percent != null && String(payload.percent) !== "") {
        n = encNum(payload.percent); if (!n) return null; parts.push("r" + n);
      } else if (payload.usdt != null && payload.side === "sell") {
        n = encNum(payload.usdt); if (!n) return null; parts.push("u" + n);
      } else if (payload.amount != null && payload.side === "buy") {
        n = encNum(payload.amount); if (!n) return null; parts.push("c" + n);
      } else if (payload.usdt != null) {
        n = encNum(payload.usdt); if (!n) return null; parts.push(payload.side === "buy" ? n : "u" + n);
      } else if (payload.amount != null) {
        n = encNum(payload.amount); if (!n) return null; parts.push(payload.side === "sell" ? n : "c" + n);
      } else return null;
      if (typ !== "market") {
        n = encNum(payload.price || payload.limit_price); if (!n) return null; parts.push(n);
      }
      if (typ === "stop_limit" || typ === "take_profit" || typ === "stop_loss") {
        n = encNum(payload.trigger || payload.trigger_price); if (!n) return null; parts.push(n);
      }
      out = parts.join("_");
    } else if (a === "ai" || a === "ai_review" || a === "ai_exec") {
      var asym = baseSym(payload.symbol || payload.pair || "BTC") || "BTC";
      if (!/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(asym)) return null;
      var ap = { ai: "ai", ai_review: "air", ai_exec: "aix" }[a];
      out = ap + "_" + asym;
    } else if (a === "ai_watch") {
      out = payload.enabled ? "aiw_on" : "aiw_off";
    } else if (a === "new_wallet") out = "nw";
    else if (a === "fut_pos") out = "fp";
    else if (a === "fut_ord") out = "fo";
    else if (a === "fut_close") {
      var fc = String(payload.contract || payload.pair || "").toUpperCase().replace("-", "_");
      var fcs = baseSym(fc);
      if (!/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(fcs)) return null;
      out = "fc_" + fcs;
    } else if (a === "fut_lev") {
      var lc = baseSym(payload.contract || "");
      var lev = parseInt(payload.leverage, 10);
      if (!/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(lc || "") || !(lev >= 1 && lev <= 20)) return null;
      out = "flev_" + lc + "_" + lev;
    } else if (a === "fut_cancel") {
      var foid = String(payload.order_id || payload.id || "");
      if (!foid || !/^[A-Za-z0-9_-]+$/.test(foid)) return null;
      out = "fx_" + foid;
    } else if (a === "fut_tpsl") {
      var tpc = baseSym(payload.contract || "");
      var tpn = encNum(payload.price || payload.trigger);
      var k = String(payload.kind || "tp").toLowerCase();
      if (!/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(tpc || "") || !tpn) return null;
      out = (k === "sl" ? "fsp_" : "ftp_") + tpc + "_" + tpn;
    } else if (a === "fut_open") {
      var fside = payload.side === "long" || payload.side === "buy" || payload.side === "l" ? "l" :
        (payload.side === "short" || payload.side === "sell" || payload.side === "s" ? "s" : "");
      var ftyp = (payload.order_type || payload.type || "market") === "limit" ? "l" : "m";
      var fcon = String(payload.contract || payload.pair || "").toUpperCase().replace("-", "_");
      var fsym = baseSym(fcon);
      var fu = encNum(payload.usdt || payload.margin);
      var fl = parseInt(payload.leverage, 10) || 2;
      var fm = String(payload.margin_mode || payload.mode || "isolated").toLowerCase() === "cross" ? "c" : "i";
      if (!fside || !/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(fsym) || !fu || !(fl >= 1 && fl <= 20)) return null;
      var fparts = ["f", fside, fsym, ftyp, fu, fl + "x" + fm];
      if (ftyp === "l") {
        var fpx = encNum(payload.price || payload.limit_price);
        if (!fpx) return null;
        fparts.push(fpx);
      }
      out = fparts.join("_");
    } else if (a === "auto_on") out = "aon";
    else if (a === "auto_off") out = "aof";
    else if (a === "auto_stop") out = "astop";
    else if (a === "auto_status") out = "ast";
    else if (a === "auto_scan") out = "asc";
    else if (a === "auto_sellall") out = "axa";
    else if (a === "auto_paper") out = payload.enabled ? "apm_on" : "apm_off";
    else if (a === "auto_watch" || a === "auto_exclude") {
      var wsym = baseSym(payload.symbol || payload.pair || payload.coin || "");
      if (!/^[A-Z0-9]{1,20}$/.test(wsym || "")) return null;
      var won = payload.enabled;
      if (typeof won === "string") won = !/^(0|false|off|no|remove)$/i.test(won);
      if (won === undefined || won === null) won = true;
      if (a === "auto_watch") out = (won ? "aw_" : "awx_") + wsym;
      else out = (won ? "ax_" : "axx_") + wsym;
    } else if (a === "auto_settings") {
      function n(v) {
        v = Number(v);
        if (!isFinite(v)) return null;
        return String(Math.round(v * 100));
      }
      var tp = n(payload.tp_pct ?? payload.tp ?? 4);
      var sl = n(payload.sl_pct ?? payload.sl ?? 2.5);
      var ar = n(payload.trail_arm_pct ?? payload.trail_arm ?? 2);
      var tr = n(payload.trail_pct ?? payload.trail ?? 1.5);
      var ho = n(payload.max_hold_h ?? payload.hold ?? 24);
      if (!tp || !sl || !ar || !tr || !ho) return null;
      out = "aset_t" + tp + "_s" + sl + "_a" + ar + "_r" + tr + "_h" + ho;
    }
    if (!out || out.length > 64 || !/^[A-Za-z0-9_-]+$/.test(out)) return null;
    return out;
  }
/* ---------- packet ---------- */
function b64urlToBytes(s){s=String(s).replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const bin=atob(s),b=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);return b}
async function inflate(bytes){if(typeof DecompressionStream==='function'){try{const st=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return new TextDecoder().decode(await new Response(st).arrayBuffer())}catch(e){}}
  if(typeof window.inflateRawSync==='function')return new TextDecoder().decode(window.inflateRawSync(bytes));throw new Error('no-inflate')}
async function decode(e){if(!e||e[0]!=='z')return null;try{const o=JSON.parse(await inflate(b64urlToBytes(e.slice(1))));return o&&o.v===1?o:null}catch{return null}}
async function load(){const cands=[];let url=null;try{url=new URLSearchParams(location.search).get('mp')}catch{}if(url)cands.push(url);try{const l=localStorage.getItem(KEY);if(l)cands.push(l)}catch{}
  for(const c of cands){const o=await decode(c);if(o&&(!P||(o.t||0)>(P.t||0))){P=o;enc=c}}
  if(P&&enc){try{localStorage.setItem(KEY,enc)}catch{}}
  if(url){try{const q=new URLSearchParams(location.search);q.delete('mp');history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash)}catch{}}
  document.documentElement.classList.toggle('has-real',!!P);render();renderSmart();
  if(url&&P&&typeof navigate==='function'){const h=(location.hash||'').slice(1);if(!h||!/^[a-z]+$/.test(h))navigate('real')}}
function forget(){if(!confirm('مسح لقطة حسابك الحقيقي من هذا الجهاز؟ (لا يؤثر على حسابك)'))return;try{localStorage.removeItem(KEY)}catch{}P=null;enc=null;document.documentElement.classList.remove('has-real');render();showToast('مُسحت بيانات الحساب من هذا الجهاز')}

/* ---------- sending (owner-verified by the bot) ---------- */
let lastSent=null;
function sendAction(payload){lastSent=payload;
  if(typeof window.__madarSend==='function'){window.__madarSend(payload);return true}
  if(fromKb&&tg&&typeof tg.sendData==='function'&&inTG){try{try{tg.HapticFeedback&&tg.HapticFeedback.notificationOccurred('success')}catch{}tg.sendData(JSON.stringify(payload));return true}catch(e){}}
  const param=encodeStartParam(payload);if(!param){showToast(fromKb?'تعذّر تجهيز الطلب':'هذا الإجراء يحتاج فتح مدار من زر «📈 مدار — حسابي» في البوت');return false}
  const url='https://t.me/'+BOT_USER+'?start='+encodeURIComponent(param);
  try{if(tg&&inTG&&typeof tg.openTelegramLink==='function'){tg.openTelegramLink(url);setTimeout(()=>{try{tg.close()}catch{}},400)}else window.open(url,'_blank','noopener')}catch{location.href=url}
  showToast('أُرسل الطلب إلى البوت — أكّد بـ ✅ في المحادثة');return true}

/* ---------- confirmation sheet ---------- */
function confirmSend(title,lines,payload){const body=$('modalBody');$('modalTitle').textContent=title;
  body.innerHTML=`<div class="real-confirm"><div class="rc-badge">🔴 أمر حقيقي على حسابك في Gate.io</div><ul>${lines.map(l=>`<li>${l}</li>`).join('')}</ul>
  <p class="modal-note">سيصل الطلب إلى @${BOT_USER} ولن يُنفّذ حتى تضغط <b>✅ تنفيذ</b> في المحادثة. الحدود في البوت: فوري ${P.cap[0]} USDT، هامش عقود ${P.cap[1]} USDT، ${P.cap[2]} USDT يوميًا، رافعة حتى ${P.cap[3]}×. لا يوجد سحب.</p>
  <label class="chk rc-chk"><input type="checkbox" id="rcOk"> أفهم أن هذا أمر حقيقي وقد أخسر المبلغ.</label>
  <div class="form-actions"><button class="execute small-btn" id="rcSend" disabled>إرسال للبوت للتأكيد</button><button class="outline" onclick="closeModal()">إلغاء</button></div></div>`;
  $('rcOk').onchange=e=>{$('rcSend').disabled=!e.target.checked};$('rcSend').onclick=()=>{closeModal();body.innerHTML='';sendAction(payload)};openModal()}

/* ---------- tickets ---------- */
function pairsList(){const ps=(P&&P.pairs&&P.pairs.length?P.pairs:['BTC','ETH','SOL','BNB','XRP','DOGE']);return ps}
function lp(sym){try{const a=ASSETS.find(x=>x.s===sym);return a?a.price:0}catch{return 0}}
function spotSubmit(){const f=$('rtSpot');const side=f.elements.side.value,sym=f.elements.sym.value,type=f.elements.type.value,amt=Number(f.elements.amt.value),px=Number(f.elements.px.value);
  if(!(amt>0))return showToast('أدخل المبلغ');const live=lp(sym);const usdtVal=side==='buy'?amt:amt*(type==='limit'?px:live);
  if(type==='limit'&&!(px>0))return showToast('أدخل سعر الأمر المحدد');
  if(usdtVal>P.cap[0]+1e-9)return showToast(`الحد الأقصى للصفقة الفورية ${P.cap[0]} USDT (القيمة الآن ≈ ${n2(usdtVal)})`);
  const payload={action:'trade',side,pair:sym+'_USDT',order_type:type};if(side==='buy')payload.usdt=amt;else payload.amount=amt;if(type==='limit')payload.price=px;
  confirmSend(side==='buy'?'تأكيد شراء حقيقي':'تأكيد بيع حقيقي',[`الزوج: <b>${sym}/USDT</b> — ${type==='market'?'أمر سوق':'أمر محدد عند '+fmtPrice(px)}`,side==='buy'?`المبلغ: <b>${n2(amt)} USDT</b>`:`الكمية: <b>${nq(amt)} ${sym}</b> (≈ ${n2(usdtVal)} USDT)`,`السعر المرجعي الآن: ${live?fmtPrice(live):'—'}`],payload)}
function futSubmit(){const f=$('rtFut');const side=f.elements.side.value,sym=f.elements.sym.value,type=f.elements.type.value,m=Number(f.elements.m.value),lev=parseInt(f.elements.lev.value,10),px=Number(f.elements.px.value),tp=Number(f.elements.tp.value),sl=Number(f.elements.sl.value);
  if(!(m>0))return showToast('أدخل الهامش');if(m>P.cap[1]+1e-9)return showToast(`حد هامش العقود ${P.cap[1]} USDT`);if(!(lev>=1&&lev<=P.cap[3]))return showToast(`الرافعة من 1 إلى ${P.cap[3]}`);if(type==='limit'&&!(px>0))return showToast('أدخل سعر الأمر');
  const fmn=(P.fm||{})[sym];if(fmn&&m*lev<fmn-1e-9){const need=Math.ceil(fmn/m);return showToast(need>P.cap[3]?`أصغر عقد ${sym} قيمته ≈ ${n2(fmn)} USDT — أكبر من هامش ${n2(m)} × ${P.cap[3]}×؛ اختر عقدًا آخر`:`أصغر عقد ${sym} ≈ ${n2(fmn)} USDT؛ ارفع الرافعة إلى ${need}× على الأقل`)}
  const live=lp(sym),entry=type==='limit'?px:live,liq=entry?(side==='long'?entry*(1-1/lev+0.005):entry*(1+1/lev-0.005)):0;
  const payload={action:'fut_open',side,contract:sym+'_USDT',order_type:type,usdt:m,leverage:lev,margin_mode:'isolated'};if(type==='limit')payload.price=px;if(tp>0)payload.tp=tp;if(sl>0)payload.sl=sl;
  confirmSend('تأكيد عقد آجل حقيقي',[`<b>${side==='long'?'شراء (Long)':'بيع (Short)'} ${sym}USDT</b> — ${type==='market'?'سوق':'محدد عند '+fmtPrice(px)}`,`الهامش: <b>${n2(m)} USDT</b> × رافعة <b>${lev}×</b> = حجم ≈ ${n2(m*lev)} USDT`,`تصفية تقريبية: ${liq?fmtPrice(liq):'—'}${lev>=10?' <span class="down">⚠️ رافعة عالية</span>':''}`,tp>0||sl>0?`TP ${tp>0?fmtPrice(tp):'—'} · SL ${sl>0?fmtPrice(sl):'—'}`:'بدون TP/SL'],payload)}
function alertSubmit(){const f=$('rtAlert');const sym=f.elements.sym.value,t=Number(f.elements.t.value);if(!(t>0))return showToast('أدخل السعر');sendAction({action:'alert',symbol:sym,pair:sym+'_USDT',target:t})}
function cancelOrder(id,pair,kind){confirmSend('إلغاء أمر',[`الأمر <code>${esc(id)}</code> على ${esc(pair)}`],{action:'cancel_order',order_id:id,pair,kind})}
function closeFut(c){confirmSend('إغلاق مركز عقود',[`إغلاق مركز <b>${esc(c)}</b> بسعر السوق`],{action:'fut_close',contract:c})}
function kill(){confirmSend('⛔ إيقاف فوري',['إيقاف التداول التلقائي والذكي الحقيقي فورًا (لا تُفتح صفقات جديدة).','الصفقات المفتوحة تبقى ويمكنك إغلاقها من البوت.'],{action:'auto_stop'})}
function smart(op){const lines={status:['عرض حالة المحرك الذكي في البوت.'],paper:['إرجاع المحرك الذكي إلى الوضع الورقي (بدون أموال حقيقية).'],real:['طلب تشغيل المحرك الذكي <b>بأموال حقيقية</b> ضمن الحدود.','البوت سيطلب ✅ منك، والاختبارات التاريخية لم تُظهر أفضلية (127 صفقة، −2.7%).'],resume:['استئناف المحرك بعد الإيقاف.'],bt:['تشغيل اختبار تاريخي في البوت.']}[op];
  if(op==='status'||op==='bt'){sendAction({action:'auto_smart',op});return}confirmSend('التداول الذكي في البوت',lines,{action:'auto_smart',op})}

/* ---------- render ---------- */
function opts(list,sel){return list.map(s=>`<option value="${s}"${s===sel?' selected':''}>${s}/USDT</option>`).join('')}
function render(){const root=$('realRoot');if(!root)return;
  if(!P){root.innerHTML=`<section class="card pad real-empty"><h2>🔐 حسابك الحقيقي على Gate.io</h2><p>لأمانك، لا يحمل الموقع أي مفاتيح ولا يتصل بحسابك. تفتح بيانات حسابك فقط من داخل تيليجرام عبر بوتك:</p>
    <ol><li>افتح <b>@${BOT_USER}</b> وأرسل <code>/madar</code>.</li><li>اضغط الزر أسفل المحادثة <b>«📈 مدار — حسابي»</b>.</li><li>كل أمر حقيقي يصلك في البوت ولا يُنفّذ حتى تضغط ✅.</li></ol>
    <div class="form-actions"><a class="execute small-btn" href="https://t.me/${BOT_USER}?start=mdr" target="_blank" rel="noopener">فتح البوت ←</a><button class="outline" onclick="navigate('wallet')">المحفظة التجريبية</button></div>
    <p class="muted small">هذه الصفحة عامة؛ أي شخص آخر يراها في الوضع التجريبي فقط، والبوت يرفض أي أمر لا يأتي من حسابك في تيليجرام.</p></section>`;return}
  const age=Date.now()/1000-(P.bt||P.t),stale=age>1800,cap=P.cap,used=cap[4]||0;
  const rows=(P.s||[]).map(r=>{const live=lp(r[0]),amt=(+r[1]||0)+(+r[2]||0),val=r[0]==='USDT'?amt:(live?amt*live:r[3]);return {c:r[0],av:r[1],lk:r[2],val}});const spotTot=rows.reduce((a,r)=>a+(+r.val||0),0);
  const f=P.f||{};const futTot=(+f.tot||0)+(+f.up||0);const total=spotTot+futTot;
  const pl=pairsList(),sel=(typeof selected!=='undefined'&&pl.includes(selected))?selected:pl[0];
  root.innerHTML=`<div class="real-head card pad"><div><span class="real-chip">🔴 حساب حقيقي · Gate.io</span><h2>${usd(total)}</h2><small class="muted">فوري ${usd(spotTot)} · عقود ${usd(futTot)}${f.up?` (غير محقق <span class="${f.up>=0?'up':'down'}">${usd(f.up)}</span>)`:''}</small></div>
    <div class="rh-side"><small class="${stale?'down':'muted'}">لقطة الرصيد ${ago(P.bt||P.t)}${stale?' — قديمة':''}</small><div class="sb-actions"><button class="outline" onclick="Real.refresh()">🔄 تحديث</button><button class="kill-btn" onclick="Real.kill()">⛔ إيقاف فوري</button></div></div>
    <div class="cap-bar"><span>المستخدم اليوم ${n2(used)} / ${cap[2]} USDT</span><div class="breadth"><i style="width:${Math.min(100,used/cap[2]*100)}%;background:var(--gold)"></i></div><small class="muted">حدود البوت: فوري ${cap[0]} · هامش عقود ${cap[1]} · رافعة ≤ ${cap[3]}× · لا سحب</small></div></div>
  <div class="real-grid">
   <section class="card pad"><div class="table-title"><h2>أمر فوري حقيقي</h2><span class="sim-chip">يتطلب ✅ في البوت</span></div>
    <form id="rtSpot" class="form-grid" onsubmit="event.preventDefault();Real.spot()"><label>الاتجاه<select name="side"><option value="buy">شراء</option><option value="sell">بيع</option></select></label><label>الزوج<select name="sym">${opts(pl,sel)}</select></label><label>النوع<select name="type"><option value="market">سوق</option><option value="limit">محدد</option></select></label><label><span class="rt-amt-l">المبلغ (USDT)</span><input name="amt" type="number" step="any" min="0" inputmode="decimal" value="${cap[0]}"></label><label class="rt-px">سعر الأمر<input name="px" type="number" step="any" min="0" inputmode="decimal"></label><div class="form-actions"><button class="execute small-btn" type="submit">مراجعة الأمر</button><small class="muted" id="rtSpotHint"></small></div></form><p class="muted small">أقل أمر في Gate ≈ 3 USDT وحد البوت ${cap[0]} USDT، لذا الشراء الفوري عمليًا ${cap[0]} USDT.</p></section>
   <section class="card pad"><div class="table-title"><h2>عقد آجل حقيقي</h2><span class="sim-chip">هامش معزول</span></div>
    <form id="rtFut" class="form-grid" onsubmit="event.preventDefault();Real.fut()"><label>الاتجاه<select name="side"><option value="long">شراء Long</option><option value="short">بيع Short</option></select></label><label>العقد<select name="sym">${opts(pl,sel).replace(/\/USDT/g,'USDT')}</select></label><label>النوع<select name="type"><option value="market">سوق</option><option value="limit">محدد</option></select></label><label>الهامش (USDT)<input name="m" type="number" step="any" min="0" value="${cap[1]}"></label><label>الرافعة<input name="lev" type="number" step="1" min="1" max="${cap[3]}" value="3"></label><label class="rt-px">سعر الأمر<input name="px" type="number" step="any" min="0"></label><label>جني الربح (اختياري)<input name="tp" type="number" step="any" min="0"></label><label>وقف الخسارة (اختياري)<input name="sl" type="number" step="any" min="0"></label><div class="form-actions"><button class="execute small-btn" type="submit">مراجعة العقد</button><small class="muted" id="rtFutHint"></small></div></form></section>
  </div>
  <section class="card pad"><div class="table-title"><h2>الأرصدة الفورية</h2><span class="sim-chip">${rows.length} أصل</span></div><div class="table-wrap"><table><thead><tr><th>الأصل</th><th>متاح</th><th>محجوز</th><th>القيمة</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.c)}</b></td><td>${nq(r.av)}</td><td>${nq(r.lk)}</td><td>${usd(r.val)}</td><td>${r.c!=='USDT'&&pl.includes(r.c)?`<button class="row-action" onclick="Real.prefillSell('${esc(r.c)}',${+r.av||0})">بيع</button>`:''}</td></tr>`).join('')||'<tr><td colspan="5" class="empty-cell">لا أرصدة</td></tr>'}</tbody></table></div></section>
  <div class="real-grid">
   <section class="card pad"><div class="table-title"><h2>الأوامر المفتوحة</h2><small class="muted">${ago(P.pt)}</small></div><div class="table-wrap"><table><thead><tr><th>الزوج</th><th>النوع</th><th>السعر</th><th>المتبقي</th><th></th></tr></thead><tbody>${(P.oo||[]).map(o=>`<tr><td><b>${esc(o[1])}</b> <small class="${o[2]==='buy'?'up':'down'}">${o[2]==='buy'?'شراء':'بيع'}</small></td><td>${esc(o[3])}</td><td>${nq(o[4])}</td><td>${nq(o[6])}</td><td><button class="row-action" onclick="Real.cancel('${esc(o[0])}','${esc(o[1])}','spot')">إلغاء</button></td></tr>`).join('')}${(P.po||[]).map(o=>`<tr><td><b>${esc(o[1])}</b> <small>مشروط</small></td><td>عند ${esc(o[4])} ${nq(o[3])}</td><td>${nq(o[5])}</td><td>${nq(o[6])}</td><td><button class="row-action" onclick="Real.cancel('${esc(o[0])}','${esc(o[1])}','price')">إلغاء</button></td></tr>`).join('')}${!(P.oo||[]).length&&!(P.po||[]).length?'<tr><td colspan="5" class="empty-cell">لا أوامر مفتوحة</td></tr>':''}</tbody></table></div></section>
   <section class="card pad"><div class="table-title"><h2>مراكز العقود</h2></div><div class="table-wrap"><table><thead><tr><th>العقد</th><th>الحجم</th><th>الدخول</th><th>الآن</th><th>ربح/خسارة</th><th></th></tr></thead><tbody>${(P.fp||[]).map(p=>`<tr><td><b>${esc(p[0])}</b> <small>${nq(p[4])}×</small></td><td class="${p[1]>0?'up':'down'}">${nq(p[1])}</td><td>${nq(p[2])}</td><td>${nq(p[3])}</td><td class="${p[5]>=0?'up':'down'}">${usd(p[5])}</td><td><button class="row-action" onclick="Real.closeFut('${esc(p[0])}')">إغلاق</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty-cell">لا مراكز مفتوحة</td></tr>'}</tbody></table></div></section>
  </div>
  <div class="real-grid">
   <section class="card pad"><div class="table-title"><h2>آخر الصفقات المنفذة</h2></div><div class="table-wrap"><table><thead><tr><th>الوقت</th><th>الزوج</th><th>الاتجاه</th><th>الكمية</th><th>السعر</th></tr></thead><tbody>${(P.h||[]).map(h=>`<tr><td>${new Date(h[0]*1000).toLocaleString('ar',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}</td><td>${esc(h[2])}</td><td class="${h[1]==='buy'?'up':'down'}">${h[1]==='buy'?'شراء':'بيع'}</td><td>${nq(h[3])}</td><td>${nq(h[4])}</td></tr>`).join('')||'<tr><td colspan="5" class="empty-cell">لا صفقات حديثة</td></tr>'}</tbody></table></div></section>
   <section class="card pad"><div class="table-title"><h2>تنبيه سعر في تيليجرام</h2><span class="sim-chip">يصلك من البوت</span></div>
    <form id="rtAlert" class="form-grid" onsubmit="event.preventDefault();Real.alert()"><label>العملة<select name="sym">${opts(pl,sel)}</select></label><label>السعر المستهدف<input name="t" type="number" step="any" min="0"></label><div class="form-actions"><button class="outline" type="submit">🔔 إنشاء التنبيه في البوت</button><button class="text-button" type="button" onclick="Real.send({action:'alerts_list'})">عرض تنبيهاتي</button></div></form>
    ${(P.al||[]).length?`<ul class="smlog">${P.al.map(a=>`<li>${esc(a[0])} → ${nq(a[1])} ${esc(a[2]||'')}</li>`).join('')}</ul>`:''}</section>
  </div>
  <p class="muted small" style="margin-top:10px">الأرقام لقطة أرسلها البوت لك وقت فتح الزر، والقيم تُعاد حسابها بالأسعار المرجعية الحالية. <button class="text-button" onclick="Real.forget()">مسح البيانات من هذا الجهاز</button></p>`;
  const sf=$('rtSpot');const upd=()=>{const s=sf.elements.side.value,t=sf.elements.type.value;root.querySelector('#rtSpot .rt-amt-l').textContent=s==='buy'?'المبلغ (USDT)':'الكمية ('+sf.elements.sym.value+')';sf.querySelector('.rt-px').style.display=t==='limit'?'':'none';const lv=lp(sf.elements.sym.value);$('rtSpotHint').textContent=lv?'السعر المرجعي '+fmtPrice(lv):''};['change','input'].forEach(e=>sf.addEventListener(e,upd));upd();
  const ff=$('rtFut');const updf=()=>{ff.querySelector('.rt-px').style.display=ff.elements.type.value==='limit'?'':'none';const sy=ff.elements.sym.value,fmn=(P.fm||{})[sy],m=+ff.elements.m.value||0,lv=+ff.elements.lev.value||0;$('rtFutHint').textContent=fmn?(m*lv>=fmn?`أصغر عقد ≈ ${n2(fmn)} USDT ✓`:(Math.ceil(fmn/(m||1))>P.cap[3]?`أصغر عقد ≈ ${n2(fmn)} USDT — غير ممكن بهذا الهامش`:`أصغر عقد ≈ ${n2(fmn)} USDT — يحتاج رافعة ${Math.ceil(fmn/(m||1))}×`)):''};['change','input'].forEach(e=>ff.addEventListener(e,updf));updf()}
function prefillSell(c,q){const f=$('rtSpot');f.elements.side.value='sell';f.elements.sym.value=c;const live=lp(c);f.elements.amt.value=live?+(Math.min(q,P.cap[0]/live*0.98)).toPrecision(6):q;f.dispatchEvent(new Event('change'));f.scrollIntoView({behavior:'smooth',block:'center'})}
function renderSmart(){const el=$('smartRealRoot');if(!el)return;if(!P){el.innerHTML='';return}const sm=P.sm||{};const mode=sm.k?'⛔ موقوف':sm.m==='real'?'🔴 حقيقي':sm.m==='paper'?'ورقي في البوت':'متوقف';
  el.innerHTML=`<div class="card pad real-smart"><div class="table-title"><h2>المحرك الذكي في بوتك (حساب حقيقي)</h2><span class="real-chip">${esc(mode)}</span></div><p class="muted small">المحرك الحقيقي <b>مطفأ افتراضيًا</b>. التشغيل الحقيقي يحتاج ضغط «حقيقي» هنا ثم ✅ في البوت (أو <code>/smart real</code>). الاختبار التاريخي: 127 صفقة بنتيجة −2.7% — <b>لا توجد أفضلية مثبتة</b>، فاستخدمه بمبالغ صغيرة فقط أو لا تستخدمه.</p><div class="sb-actions"><button class="outline" onclick="Real.smart('status')">الحالة</button><button class="outline" onclick="Real.smart('paper')">ورقي</button><button class="outline" onclick="Real.smart('bt')">اختبار تاريخي</button><button class="outline" onclick="Real.smart('resume')">استئناف</button><button class="execute small-btn" onclick="Real.smart('real')">تشغيل حقيقي…</button><button class="kill-btn" onclick="Real.kill()">⛔ إيقاف فوري</button></div></div>`}
document.addEventListener('madar:view',e=>{if(e.detail==='real')render()});
document.addEventListener('DOMContentLoaded',()=>{try{if(tg&&inTG){tg.ready();tg.expand&&tg.expand()}}catch{}load()});
window.Real={get packet(){return P},get lastSent(){return lastSent},get inTelegram(){return inTG},get fromKeyboard(){return fromKb},send:sendAction,encodeStartParam,spot:spotSubmit,fut:futSubmit,alert:alertSubmit,cancel:cancelOrder,closeFut,kill,smart,refresh:()=>sendAction({action:'madar_refresh'}),forget,prefillSell,render,renderSmart,decode};
})();

/* v5: عند الاستضافة تحت /madar/ على نطاق Ajcoin، عامل خدمة Ajcoin قد يخزّن صفحة مدار مكان صفحته الرئيسية؛ نصلح ذلك. */
(function(){function fix(){try{if(!('caches' in window)||!/^\/madar\//.test(location.pathname))return;caches.keys().then(function(ks){ks.filter(function(k){return /^ajcoin-/.test(k)}).forEach(function(k){caches.open(k).then(function(c){var key=location.origin+'/index.html';return c.match(key).then(function(r){return r&&r.text()}).then(function(t){if(!t||t.indexOf('data-madar-page')<0)return;return fetch('/index.html',{cache:'no-store'}).then(function(r){if(!r.ok)return;return r.text().then(function(b){if(b.indexOf('data-madar-page')<0)return c.put(key,new Response(b,{headers:{'Content-Type':'text/html; charset=utf-8'}}))})})})})})}).catch(function(){})}catch(e){}}
fix();setTimeout(fix,4000);setTimeout(fix,15000);window.__madarAjFix=fix})();
