/* PriceEdge mobile chart lock — one chart, 24 readable candles, controls never cover data. */
(function(){
'use strict';
const mobile=()=>window.matchMedia('(max-width:600px)').matches;
let installed=false,originalDraw=null;
function moveControlsOutside(){
  const wrap=document.querySelector('.chartwrap');if(!wrap)return;
  const tools=document.getElementById('chartTools');if(!tools)return;
  if(tools.parentElement===wrap)wrap.insertAdjacentElement('afterend',tools);
  tools.style.position='static';tools.style.inset='auto';tools.style.transform='none';tools.style.float='none';tools.style.width='100%';tools.style.boxSizing='border-box';
}
function cleanBottomLabels(canvas){
  if(!mobile()||!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
  const w=canvas.clientWidth,h=canvas.clientHeight,d=Math.max(1,Math.min(3,devicePixelRatio||1));ctx.save();ctx.setTransform(d,0,0,d,0,0);
  ctx.fillStyle='#07101d';ctx.fillRect(0,Math.max(0,h-24),w,24);
  const list=Array.isArray(window.candles)?window.candles:[],visible=Math.max(12,Math.min(24,Number(window.visible)||24)),offset=Math.max(0,Number(window.offset)||0),start=Math.max(0,list.length-visible-offset),data=list.slice(start,start+visible),left=10,right=74,pw=Math.max(10,w-left-right);
  ctx.fillStyle='#71809d';ctx.font='9px system-ui,-apple-system,Segoe UI,sans-serif';ctx.textBaseline='alphabetic';ctx.textAlign='center';
  [0,.33,.66,1].forEach(r=>{if(!data.length)return;const idx=Math.min(data.length-1,Math.round((data.length-1)*r)),dt=new Date(data[idx].datetime||data[idx].time||data[idx].timestamp),label=Number.isNaN(dt.getTime())?'':dt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});ctx.fillText(label,left+(idx+.5)*(pw/data.length),h-8)});ctx.restore();
}
function install(){
  if(installed||!window.draw||!document.getElementById('chart'))return false;installed=true;originalDraw=window.draw;window.visible=24;window.offset=0;
  window.draw=function(){if(mobile()&&Number(window.visible)!==24)window.visible=24;originalDraw();moveControlsOutside();requestAnimationFrame(()=>cleanBottomLabels(document.getElementById('chart')))};
  window.zoomIn=()=>{if(mobile())return;window.visible=Math.max(20,Math.round((Number(window.visible)||70)*.8));window.draw()};
  window.zoomOut=()=>{if(mobile())return;window.visible=Math.min(160,Math.round((Number(window.visible)||70)*1.25));window.draw()};
  window.resetZoom=()=>{window.visible=mobile()?24:70;window.offset=0;window.draw();const z=document.getElementById('zoomLevel');if(z)z.textContent=`${window.visible} candles`};
  const s=document.createElement('style');s.id='peMobileChartLockStyle';s.textContent='@media(max-width:600px){.chartwrap{height:330px!important;margin-bottom:0!important;overflow:hidden!important;position:relative!important}.chartwrap canvas{height:100%!important;display:block!important}#chartTools{position:static!important;inset:auto!important;transform:none!important;float:none!important;width:100%!important;display:flex!important;justify-content:flex-end!important;align-items:center!important;gap:5px!important;margin:8px 0 12px!important;padding:0!important;box-sizing:border-box!important;z-index:1!important}#chartTools button,#chartTools span{min-height:38px!important;padding:7px 9px!important;font-size:11px!important}}';document.head.appendChild(s);moveControlsOutside();
  const watch=new MutationObserver(moveControlsOutside),wrap=document.querySelector('.chartwrap');if(wrap?.parentElement)watch.observe(wrap.parentElement,{childList:true});window.addEventListener('resize',()=>{moveControlsOutside();window.draw()},{passive:true});window.addEventListener('pageshow',()=>{moveControlsOutside();window.draw()});return true;
}
let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer)},100);if(document.readyState!=='loading')install();else document.addEventListener('DOMContentLoaded',install,{once:true});
})();
