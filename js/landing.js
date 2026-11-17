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
const FALLBACK={BTC:63500,ETH:1770,SOL:72,BNB:583,XRP:.953,DOGE:.058,ADA:.151,AVAX:7.02,LINK:9.06};
const IDS={BTC:'bitcoin',ETH:'ethereum',SOL:'solana',BNB:'binancecoin',XRP:'ripple',DOGE:'dogecoin',ADA:'cardano',AVAX:'avalanche-2',LINK:'chainlink'};
async function load(){try{const r=await fetch('https://api.coingecko.com/api/v3/simple/price?ids='+SYMS.map(s=>IDS[s]).join(',')+'&vs_currencies=usd&include_24hr_change=true');if(r.ok){const d=await r.json();const list=SYMS.map(s=>d[IDS[s]]&&d[IDS[s]].usd>0?{s,p:+d[IDS[s]].usd,c:+(d[IDS[s]].usd_24h_change||0)}:null).filter(Boolean);if(list.length){render(list,true);return}}}catch{}render(SYMS.map(s=>({s,p:FALLBACK[s],c:0})),false)}
render(SYMS.map(s=>({s,p:FALLBACK[s],c:0})),false);load();setInterval(()=>{if(!document.hidden)load()},60000);
if('serviceWorker' in navigator&&location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
})();
