/* PriceEdge stable professional chart renderer — mobile density locked to a readable default. */
(function(){
  'use strict';
  if(!document.getElementById('chart'))return;
  const C={bg:'#07101d',grid:'#14233a',axis:'#71809d',up:'#35e28b',down:'#ff5c78',gold:'#f5c451',muted:'#71809d'};
  const n=v=>Number(v), finite=v=>Number.isFinite(n(v));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const dpr=()=>Math.max(1,Math.min(3,window.devicePixelRatio||1));
  const fmt=v=>finite(v)?n(v).toFixed(2):'—';
  const niceStep=(range,target)=>{const raw=range/target,p=Math.pow(10,Math.floor(Math.log10(raw||1))),x=raw/p;return (x<=1?1:x<=2?2:x<=5?5:10)*p;};
  const candle=k=>{const close=n(k.close),open=finite(k.open)?n(k.open):close,high=finite(k.high)?n(k.high):Math.max(open,close),low=finite(k.low)?n(k.low):Math.min(open,close);return{open,close,high:Math.max(high,open,close),low:Math.min(low,open,close),time:k.datetime||k.timestamp||k.time};};
  const mobile=()=>window.matchMedia&&window.matchMedia('(max-width:600px)').matches;
  const MOBILE_DEFAULT=24;
  let raf=0;
  function render(){
    raf=0;const canvas=document.getElementById('chart');if(!canvas)return;const ctx=canvas.getContext('2d');const w=canvas.clientWidth,h=canvas.clientHeight;if(!ctx||!w||!h)return;
    const d=dpr(),W=Math.round(w*d),H=Math.round(h*d);if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}ctx.setTransform(d,0,0,d,0,0);
    const list=Array.isArray(window.candles)?window.candles:[];if(!list.length){ctx.clearRect(0,0,w,h);ctx.fillStyle=C.bg;ctx.fillRect(0,0,w,h);return;}
    const isMob=mobile();if(!Number.isFinite(Number(window.visible))||Number(window.visible)<=0)window.visible=isMob?MOBILE_DEFAULT:70;
    const minVisible=isMob?MOBILE_DEFAULT:20;const visible=Math.max(minVisible,Math.min(Number(window.visible)||70,list.length));
    const maxStart=Math.max(0,list.length-visible),off=clamp(Number(window.offset)||0,0,maxStart),start=Math.max(0,list.length-visible-off),data=list.slice(start,start+visible).map(candle);if(!data.length)return;
    let lo=Math.min(...data.map(x=>x.low)),hi=Math.max(...data.map(x=>x.high));const range=Math.max(.01,hi-lo),pad=range*.10;lo-=pad;hi+=pad;
    const left=10,right=72,top=20,bottom=36,pw=Math.max(10,w-left-right),ph=Math.max(10,h-top-bottom),y=v=>top+(hi-v)/(hi-lo)*ph,step=pw/data.length;
    const body=Math.max(isMob?5:2,Math.min(isMob?10:12,step*.62));ctx.clearRect(0,0,w,h);ctx.fillStyle=C.bg;ctx.fillRect(0,0,w,h);
    ctx.fillStyle=C.muted;ctx.font='700 10px system-ui,-apple-system,Segoe UI,sans-serif';ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.fillText('XAU/USD · '+(window.tf||'5min').toUpperCase(),left,12);ctx.textAlign='right';ctx.fillText('LIVE',left+pw,12);
    const ts=niceStep(hi-lo,7),first=Math.ceil(lo/ts)*ts;ctx.font='10px system-ui,-apple-system,Segoe UI,sans-serif';ctx.textBaseline='middle';
    for(let p=first;p<=hi+ts*.01;p+=ts){const yy=y(p);ctx.strokeStyle=C.grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(left+pw,yy);ctx.stroke();ctx.fillStyle=C.axis;ctx.textAlign='left';ctx.fillText(fmt(p),left+pw+9,yy);}
    for(let i=0;i<=6;i++){const xx=left+i*pw/6;ctx.strokeStyle='#0f1d31';ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,top+ph);ctx.stroke();}
    data.forEach((k,i)=>{const x=left+(i+.5)*step,up=k.close>=k.open,col=up?C.up:C.down;ctx.strokeStyle=col;ctx.lineWidth=Math.max(1,Math.min(2,step*.12));ctx.beginPath();ctx.moveTo(x,y(k.high));ctx.lineTo(x,y(k.low));ctx.stroke();const a=y(Math.max(k.open,k.close)),b=y(Math.min(k.open,k.close));ctx.fillStyle=col;ctx.fillRect(x-body/2,a,body,Math.max(1.5,b-a));});
    const highs=[],lows=[];for(let i=2;i<data.length-2;i++){if(data[i].high>=data[i-1].high&&data[i].high>=data[i+1].high&&data[i].high>=data[i-2].high&&data[i].high>=data[i+2].high)highs.push(i);if(data[i].low<=data[i-1].low&&data[i].low<=data[i+1].low&&data[i].low<=data[i-2].low&&data[i].low<=data[i+2].low)lows.push(i);}
    const sh=highs.slice(-3),sl=lows.slice(-3);const label=(x,yy,t,col)=>{ctx.fillStyle=col;ctx.font='800 9px system-ui,-apple-system,Segoe UI,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,x,yy);};
    sh.slice(-2).forEach((idx,j)=>label(left+(idx+.5)*step,y(data[idx].high)-12,j?'LH':'HH',C.down));sl.slice(-2).forEach((idx,j)=>label(left+(idx+.5)*step,y(data[idx].low)+12,j?'HL':'LL',C.up));
    if(sh.length){const level=Math.max(...sh.map(i=>data[i].high)),yy=y(level);ctx.fillStyle='rgba(255,92,120,.055)';ctx.fillRect(left,yy-5,pw,10);ctx.strokeStyle=C.down;ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(left+pw,yy);ctx.stroke();ctx.setLineDash([]);label(left+pw-35,yy-9,'RES',C.down);}
    if(sl.length){const level=Math.min(...sl.map(i=>data[i].low)),yy=y(level);ctx.fillStyle='rgba(53,226,139,.055)';ctx.fillRect(left,yy-5,pw,10);ctx.strokeStyle=C.up;ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(left+pw,yy);ctx.stroke();ctx.setLineDash([]);label(left+pw-35,yy+9,'SUP',C.up);}
    const last=data[data.length-1].close,py=y(last);ctx.strokeStyle=C.gold;ctx.lineWidth=1.3;ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(left,py);ctx.lineTo(left+pw,py);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=C.gold;ctx.fillRect(left+pw+3,py-10,64,20);ctx.fillStyle='#17130a';ctx.font='800 10px system-ui,-apple-system,Segoe UI,sans-serif';ctx.textAlign='left';ctx.fillText(fmt(last),left+pw+8,py+3);
    ctx.fillStyle=C.axis;ctx.font='9px system-ui,-apple-system,Segoe UI,sans-serif';ctx.textAlign='center';ctx.textBaseline='alphabetic';
    const labelCount=isMob?3:4;for(let i=0;i<labelCount;i++){const r=labelCount===1?0:i/(labelCount-1),idx=Math.min(data.length-1,Math.round((data.length-1)*r)),k=data[idx],dt=new Date(k.time),lab=Number.isNaN(dt.getTime())?'':dt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});ctx.fillText(lab,left+(idx+.5)*step,h-10);}
  }
  function schedule(){if(!raf)raf=requestAnimationFrame(render);}
  window.draw=schedule;window.addEventListener('resize',schedule,{passive:true});
  if(window.ResizeObserver){const wrap=document.querySelector('.chartwrap');if(wrap)new ResizeObserver(schedule).observe(wrap);}
  ['pe:tick','pe:candle','market:update'].forEach(ev=>window.addEventListener(ev,schedule));window.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  if(mobile()){window.visible=MOBILE_DEFAULT;window.offset=0;}
  schedule();
})();
