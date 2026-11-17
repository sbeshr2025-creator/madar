(function(){'use strict';
const root=document.documentElement,KEY='madar-prefs-v1';
function prefs(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}}
document.getElementById('themeBtn').addEventListener('click',()=>{const p=prefs();p.theme=(root.dataset.theme==='light')?'dark':'light';root.dataset.theme=p.theme;try{localStorage.setItem(KEY,JSON.stringify(p))}catch{}document.querySelector('meta[name=theme-color]').content=p.theme==='light'?'#f5f7fc':'#09111f'});
const mb=document.getElementById('menuBtn'),menu=document.getElementById('menu');
mb.addEventListener('click',()=>{const o=menu.classList.toggle('open');mb.setAttribute('aria-expanded',String(o))});
menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu.classList.remove('open');mb.setAttribute('aria-expanded','false')}));
document.getElementById('year').textContent=new Date().getFullYear();
// tabs
const tabs=[...document.querySelectorAll('.tabs [role=tab]')],img=document.getElementById('shotImg'),frame=document.getElementById('shot');
function select(t){tabs.forEach(x=>{const on=x===t;x.setAttribute('aria-selected',String(on));x.tabIndex=on?0:-1});img.style.opacity=.2;const src='assets/screens/'+t.dataset.shot+'.webp';const n=new Image();n.onload=()=>{img.src=src;img.alt=t.dataset.alt;img.style.opacity=1};n.src=src}
tabs.forEach((t,i)=>{t.addEventListener('click',()=>select(t));t.addEventListener('keydown',e=>{let j=null;if(e.key==='ArrowLeft')j=(i+1)%tabs.length;if(e.key==='ArrowRight')j=(i-1+tabs.length)%tabs.length;if(j!=null){e.preventDefault();tabs[j].focus();select(tabs[j])}})});
// reveal
if('IntersectionObserver' in window){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});document.querySelectorAll('.feature,.steps li,details,.shot-frame').forEach(el=>{el.classList.add('reveal');io.observe(el)})}
// ticker (قراءة فقط)
const SYMS=['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK'],box=document.getElementById('ticker');
function fmt(n){const d=n>=1000?2:n>=1?3:5;return '$'+n.toLocaleString('en-US',{minimumFractionDigits:Math.min(d,2),maximumFractionDigits:d})}
function render(list,live){box.innerHTML=list.map(t=>`<span class="tk"><b>${t.s}</b><span class="p">${fmt(t.p)}</span><span class="${t.c>=0?'up':'down'}">${t.c>=0?'+':''}${t.c.toFixed(2)}%</span></span>`).join('');document.getElementById('tickerDot').classList.toggle('on',live);document.getElementById('tickerState').textContent=live?'أسعار مرجعية مباشرة':'أسعار تقريبية (غير متصل)'}
const FALLBACK={BTC:64000,ETH:3400,SOL:180,BNB:600,XRP:1.1,DOGE:.16,ADA:.7,AVAX:36,LINK:14.5};
async function load(){try{const res=await Promise.all(SYMS.map(s=>fetch(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${s}_USDT`,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)));const list=res.map((r,i)=>r&&r[0]?{s:SYMS[i],p:+r[0].last,c:+r[0].change_percentage}:null).filter(Boolean);if(list.length){render(list,true);return}}catch{}render(SYMS.map(s=>({s,p:FALLBACK[s],c:0})),false)}
render(SYMS.map(s=>({s,p:FALLBACK[s],c:0})),false);load();setInterval(()=>{if(!document.hidden)load()},30000);
if('serviceWorker' in navigator&&location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
})();
