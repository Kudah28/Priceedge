/* PriceEdge chart stability + historical-candle recovery.
   Single owner: keeps the real M5 history visible after load/resume/reconnect.
*/
(function(){
'use strict';
const API='/api/candles?symbol=XAU%2FUSD&interval=5min&size=300';
let busy=false,lastGood=0;
const finite=v=>Number.isFinite(Number(v));
const clean=a=>(Array.isArray(a)?a:[]).map(c=>({datetime:c.datetime,open:+c.open,high:+c.high,low:+c.low,close:+c.close})).filter(c=>[c.open,c.high,c.low,c.close].every(finite));
async function hydrate(force){
 if(busy)return; busy=true;
 try{
  const r=await fetch(API+'&_='+Date.now(),{cache:'no-store'}); if(!r.ok)throw Error('candle request failed');
  const d=await r.json(), incoming=clean(d.values);
  const current=Array.isArray(window.candles)?window.candles:[];
  if(incoming.length>=20 || current.length<20){ window.candles=incoming; lastGood=incoming.length; }
  else if(force && current.length<20){ window.candles=incoming; }
  if(typeof window.draw==='function')window.draw();
 }catch(_){}
 finally{busy=false;}
}
function start(){
 hydrate(true);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){hydrate(true);setTimeout(()=>typeof window.draw==='function'&&window.draw(),250);}});
 window.addEventListener('pageshow',()=>{hydrate(true);});
 window.addEventListener('resize',()=>requestAnimationFrame(()=>typeof window.draw==='function'&&window.draw()),{passive:true});
 setInterval(()=>hydrate(false),30000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
