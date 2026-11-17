/* مدار — مخطط شموع خفيف مرسوم على Canvas (بدون مكتبات خارجية) */
(function(){
'use strict';
function cssVar(name,fallback){const v=getComputedStyle(document.documentElement).getPropertyValue(name).trim();return v||fallback}
function fmt(n){if(!Number.isFinite(n))return '—';const d=n>=1000?2:n>=1?3:n>=0.01?5:7;return Number(n).toLocaleString('en-US',{minimumFractionDigits:Math.min(d,2),maximumFractionDigits:d})}
function timeLabel(t,interval){const d=new Date(t*1000);if(interval!=='1d')return d.toLocaleDateString('ar',{month:'short',day:'numeric'});return d.toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit',hour12:false})}
class CandleChart{
  constructor(el){
    this.el=el;this.canvas=el.querySelector('canvas');this.tip=el.querySelector('.chart-tip');this.ctx=this.canvas.getContext('2d');
    this.data=[];this.interval='1d';this.hover=-1;this.lines=[];
    this.ro=new ResizeObserver(()=>this.draw());this.ro.observe(el);
    const move=e=>{const r=this.canvas.getBoundingClientRect();this.hoverX=e.clientX-r.left;this.draw()};
    this.canvas.addEventListener('pointermove',move);
    this.canvas.addEventListener('pointerdown',move);
    this.canvas.addEventListener('pointerleave',()=>{this.hoverX=null;this.draw()});
  }
  setData(candles,opts={}){this.data=candles||[];this.interval=opts.interval||this.interval;this.lines=opts.lines||[];this.draw()}
  draw(){
    const el=this.el,c=this.canvas,ctx=this.ctx;const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;
    const dpr=Math.min(window.devicePixelRatio||1,2);if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr)}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const up=cssVar('--green','#36d5a0'),down=cssVar('--red','#ff7185'),grid=cssVar('--grid','#ffffff12'),muted=cssVar('--muted','#8998ad'),accent=cssVar('--blue','#8c96ff');
    const data=this.data;ctx.font='10px Tahoma, Arial, sans-serif';
    if(!data.length){ctx.fillStyle=muted;ctx.textAlign='center';ctx.fillText('جارٍ تحميل البيانات…',w/2,h/2);this.tip.style.opacity=0;return}
    const axisW=62,timeH=18,volH=data.some(k=>k.v>0)?Math.round((h-timeH)*.16):0,plotW=w-axisW,plotH=h-timeH-volH-6;
    let lo=Infinity,hi=-Infinity,vmax=0;for(const k of data){lo=Math.min(lo,k.l);hi=Math.max(hi,k.h);vmax=Math.max(vmax,k.v||0)}
    for(const L of this.lines){if(L.price>0){lo=Math.min(lo,L.price);hi=Math.max(hi,L.price)}}
    if(hi===lo){hi*=1.001;lo*=.999}const pad=(hi-lo)*.08;hi+=pad;lo-=pad;
    const y=p=>6+(hi-p)/(hi-lo)*(plotH-6);const step=plotW/data.length,bw=Math.max(1,Math.min(14,step*.68));const x=i=>i*step+step/2;
    // grid + price labels (right side)
    ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.fillStyle=muted;ctx.textAlign='left';ctx.textBaseline='middle';
    for(let g=0;g<=4;g++){const p=lo+(hi-lo)*g/4,yy=Math.round(y(p))+.5;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(plotW,yy);ctx.stroke();ctx.fillText(fmt(p),plotW+6,yy)}
    // time labels
    ctx.textAlign='center';ctx.textBaseline='alphabetic';const every=Math.max(1,Math.ceil(data.length/Math.max(2,Math.floor(plotW/80))));
    for(let i=0;i<data.length;i+=every){ctx.fillText(timeLabel(data[i].t,this.interval),Math.min(Math.max(x(i),24),plotW-24),h-4)}
    // volume
    const vy=h-timeH;for(let i=0;i<data.length;i++){const k=data[i];if(!vmax)break;const vh=(k.v/vmax)*volH;ctx.fillStyle=(k.c>=k.o?up:down)+'40';ctx.fillRect(x(i)-bw/2,vy-vh,bw,vh)}
    // candles
    for(let i=0;i<data.length;i++){const k=data[i],col=k.c>=k.o?up:down;ctx.strokeStyle=col;ctx.fillStyle=col;const cx=Math.round(x(i))+.5;ctx.beginPath();ctx.moveTo(cx,y(k.h));ctx.lineTo(cx,y(k.l));ctx.stroke();const top=y(Math.max(k.o,k.c)),bh=Math.max(1,Math.abs(y(k.o)-y(k.c)));ctx.fillRect(cx-bw/2,top,bw,bh)}
    // extra lines (entry / liquidation / limit)
    for(const L of this.lines){if(!(L.price>0))continue;const yy=Math.round(y(L.price))+.5;ctx.setLineDash([4,4]);ctx.strokeStyle=L.color||accent;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(plotW,yy);ctx.stroke();ctx.setLineDash([]);if(L.label){ctx.fillStyle=L.color||accent;ctx.textAlign='left';ctx.textBaseline='bottom';ctx.fillText(L.label,4,yy-2)}}
    // last price tag
    const last=data[data.length-1],ly=Math.round(y(last.c))+.5,lc=last.c>=last.o?up:down;ctx.setLineDash([2,3]);ctx.strokeStyle=lc;ctx.beginPath();ctx.moveTo(0,ly);ctx.lineTo(plotW,ly);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=lc;ctx.fillRect(plotW+1,ly-9,axisW-1,18);ctx.fillStyle='#fff';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(fmt(last.c),plotW+5,ly);
    // crosshair
    if(this.hoverX!=null&&this.hoverX<plotW){const i=Math.max(0,Math.min(data.length-1,Math.floor(this.hoverX/step))),k=data[i];ctx.strokeStyle=muted;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(Math.round(x(i))+.5,0);ctx.lineTo(Math.round(x(i))+.5,vy);ctx.stroke();ctx.setLineDash([]);
      const ch=((k.c-k.o)/k.o*100);this.tip.innerHTML=`<b>${timeLabel(k.t,this.interval==='1d'?'1d':'30d')}${this.interval!=='1d'?'':' · '+new Date(k.t*1000).toLocaleDateString('ar',{month:'short',day:'numeric'})}</b><span>افتتاح ${fmt(k.o)}</span><span>أعلى ${fmt(k.h)}</span><span>أدنى ${fmt(k.l)}</span><span>إغلاق ${fmt(k.c)}</span><span class="${ch>=0?'up':'down'}">${ch>=0?'+':''}${ch.toFixed(2)}%</span>`;this.tip.style.opacity=1}
    else this.tip.style.opacity=0;
  }
}
window.CandleChart=CandleChart;
})();
