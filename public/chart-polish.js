/* PriceEdge mobile chart polish — permanent readable default and clean axis. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const MOBILE_DEFAULT=24;
function css(){if($('peChartPolishStyle'))return;const s=document.createElement('style');s.id='peChartPolishStyle';s.textContent=`
@media(max-width:600px){
 .chartwrap{height:310px!important;margin-top:14px;border-radius:14px;position:relative;overflow:hidden}
 .chartwrap canvas{height:100%!important;width:100%!important}
 .card>.controls[style]{margin-top:12px!important;gap:7px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}
 .card>.controls[style] button{min-height:42px;padding:8px 5px;font-size:12px}
 .ticker{padding:7px 2px;min-height:28px}
 #tickAge{margin-left:auto;font-variant-numeric:tabular-nums}
 #zoomLevel{min-width:66px;text-align:center}
}
@media(max-width:390px){.chartwrap{height:295px!important}.card>.controls[style]{grid-template-columns:repeat(2,minmax(0,1fr))}}
#peChartStatus{position:absolute;right:10px;top:8px;z-index:2;padding:3px 7px;border:1px solid #26334f;border-radius:999px;background:rgba(7,17,31,.82);font-size:9px;font-weight:800;color:#8e9cb7;pointer-events:none}
`;document.head.appendChild(s)}
function polishStatus(){const wrap=$('chart')?.closest('.chartwrap');if(!wrap)return;if(!$('peChartStatus')){const x=document.createElement('span');x.id='peChartStatus';x.textContent='M5 · LIVE';wrap.appendChild(x)}}
function forceMobileDefault(){if(!(window.matchMedia&&window.matchMedia('(max-width:600px)').matches))return;window.visible=MOBILE_DEFAULT;window.offset=0;const oldReset=window.resetZoom;window.resetZoom=()=>{window.visible=MOBILE_DEFAULT;window.offset=0;if(typeof window.draw==='function')window.draw();const el=$('zoomLevel');if(el)el.textContent=MOBILE_DEFAULT+' candles';};const el=$('zoomLevel');if(el)el.textContent=MOBILE_DEFAULT+' candles';if(typeof window.draw==='function')window.draw();return oldReset}
let lastTick=0;
function ageText(){const e=$('tickAge');if(!e)return;if(!lastTick){e.textContent='No recent tick';e.className='muted';return}const sec=Math.max(0,Math.floor((Date.now()-lastTick)/1000));e.textContent=sec<2?'LIVE':sec<60?`tick ${sec}s ago`:`tick ${Math.floor(sec/60)}m ago`;e.className=sec<=10?'green':sec<=60?'gold':'red'}
function onTick(ev){const t=Number(ev?.detail?.time);lastTick=Number.isFinite(t)&&t>0?t:Date.now();ageText()}
function start(){css();forceMobileDefault();polishStatus();window.addEventListener('pe:tick',onTick);window.addEventListener('priceedge:market-updated',onTick);setInterval(ageText,1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){setTimeout(()=>{forceMobileDefault();polishStatus();ageText()},300)}});window.addEventListener('pageshow',()=>setTimeout(()=>{forceMobileDefault();polishStatus()},150));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
