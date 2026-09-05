/* PriceEdge mobile chart lock: readable candles, clean time labels, stable zoom. */
(function(){
'use strict';
const MOBILE=()=>window.matchMedia('(max-width:600px)').matches;
let installed=false,originalDraw=null;
function cleanBottomLabels(canvas){
  if(!MOBILE()||!canvas)return;
  const ctx=canvas.getContext('2d'); if(!ctx)return;
  const w=canvas.clientWidth,h=canvas.clientHeight,d=Math.max(1,Math.min(3,devicePixelRatio||1));
  ctx.save();ctx.setTransform(d,0,0,d,0,0);
  /* pro-chart reserves the last 28px for labels; remove the duplicate range text
     and redraw four evenly spaced timestamps so they never collide. */
  ctx.fillStyle='#07101d';ctx.fillRect(0,Math.max(0,h-22),w,22);
  const list=Array.isArray(window.candles)?window.candles:[];
  const visible=Math.max(12,Math.min(24,Number(window.visible)||24));
  const offset=Math.max(0,Number(window.offset)||0);
  const start=Math.max(0,list.length-visible-offset),data=list.slice(start,start+visible);
  const left=10,right=72,pw=Math.max(10,w-left-right);
  ctx.fillStyle='#71809d';ctx.font='9px system-ui,-apple-system,Segoe UI,sans-serif';ctx.textBaseline='alphabetic';ctx.textAlign='center';
  [0,.33,.66,1].forEach(r=>{if(!data.length)return;const idx=Math.min(data.length-1,Math.round((data.length-1)*r));const dt=new Date(data[idx].datetime||data[idx].time||data[idx].timestamp);const label=Number.isNaN(dt.getTime())?'':dt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});ctx.fillText(label,left+(idx+.5)*(pw/data.length),h-7);});
  ctx.restore();
}
function install(){
  if(installed||!window.draw||!document.getElementById('chart'))return false;
  installed=true;originalDraw=window.draw;
  window.visible=24;
  window.offset=0;
  window.draw=function(){
    if(MOBILE() && (!Number.isFinite(Number(window.visible))||Number(window.visible)>24))window.visible=24;
    originalDraw();
    requestAnimationFrame(()=>cleanBottomLabels(document.getElementById('chart')));
  };
  window.zoomIn=()=>{window.visible=Math.max(12,Math.min(48,Math.round((Number(window.visible)||24)*.8)));window.draw();};
  window.zoomOut=()=>{window.visible=Math.max(12,Math.min(48,Math.round((Number(window.visible)||24)/.8)));window.draw();};
  window.resetZoom=()=>{window.visible=24;window.offset=0;window.draw();const z=document.getElementById('zoomLevel');if(z)z.textContent='24 candles';};
  const z=document.getElementById('zoomLevel');if(z)z.textContent='24 candles';
  const s=document.createElement('style');s.id='peMobileChartLockStyle';s.textContent='@media(max-width:600px){.chartwrap{height:330px!important}.chartwrap canvas{height:100%!important}.chartwrap #chartTools{bottom:8px!important;right:8px!important}.chartwrap #chartTools span{font-size:9px!important}.chartwrap #chartTools button{min-width:38px;min-height:36px}}';document.head.appendChild(s);
  window.addEventListener('resize',()=>{if(typeof window.draw==='function')window.draw();},{passive:true});
  return true;
}
let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>80)clearInterval(timer)},100);
if(document.readyState!=='loading')install();else document.addEventListener('DOMContentLoaded',install,{once:true});
})();
