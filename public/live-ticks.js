/* PriceEdge live market stream — single chart owner.
   Historical candles come from /api/candles; ticks only update the final forming candle.
*/
(function(){
'use strict';
let ws=null,reconnect=null,syncTimer=null,lastPrice=null,lastTime=0,syncBusy=false;
const $=id=>document.getElementById(id);
const bucket=t=>Math.floor(t/300000)*300000;
const timeOf=c=>{const t=Date.parse(c?.datetime);return Number.isFinite(t)?bucket(t):NaN;};
const getCandles=()=>Array.isArray(window.candles)?window.candles:(typeof candles!=='undefined'&&Array.isArray(candles)?candles:null);
function status(text,off=false){if($('streamText'))$('streamText').textContent=text;if($('stream'))$('stream').className=off?'status off':'status';if($('dot'))$('dot').className=off?'dot off':'dot';}
function priceUI(p,prev){if($('price'))$('price').innerHTML=`$${p.toFixed(2)} <span class="${prev==null||p>=prev?'green':'red'}" style="font-size:15px">${prev==null?'':p>prev?'▲':p<prev?'▼':'•'}</span>`;if($('change')&&prev!=null){const d=p-prev;$('change').textContent=`${d>=0?'+':''}${d.toFixed(2)} LIVE`;$('change').className=d>0?'green':d<0?'red':'gold';}}
function repaint(){if(typeof window.draw==='function')window.draw();}
function applyTick(p,t){let a=getCandles();if(!Array.isArray(a))return;const b=bucket(t);let c=a[a.length-1],cb=timeOf(c);if(!Number.isFinite(cb)||b>cb){c={datetime:new Date(b).toISOString(),open:p,high:p,low:p,close:p,live:true};a.push(c);while(a.length>300)a.shift();}else if(b===cb){c.live=true;c.high=Math.max(Number(c.high)||p,p);c.low=Math.min(Number(c.low)||p,p);c.close=p;}window.__priceEdgeLastTick=p;window.__priceEdgeLastTickTime=t;try{window.dispatchEvent(new CustomEvent('pe:tick',{detail:{price:p,time:t}}));window.dispatchEvent(new CustomEvent('priceedge:market-updated',{detail:{price:p,time:t}}));}catch(_){}repaint();}
async function sync(){if(syncBusy)return;syncBusy=true;try{const r=await fetch('/api/candles?symbol=XAU%2FUSD&interval=5min&size=300&_='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('market data unavailable');const d=await r.json();const incoming=(Array.isArray(d.values)?d.values:[]).map(x=>({datetime:x.datetime,open:+x.open,high:+x.high,low:+x.low,close:+x.close})).filter(x=>[x.open,x.high,x.low,x.close].every(Number.isFinite));if(incoming.length<20)throw Error('insufficient candle history');window.candles=incoming.slice(-300);if(lastPrice!=null)applyTick(lastPrice,lastTime);else repaint();window.__priceEdgeCandleCount=window.candles.length;window.dispatchEvent(new CustomEvent('priceedge:candles-ready',{detail:{count:window.candles.length}}));status(lastPrice!=null?'LIVE TICK STREAM':'MARKET DATA READY');}catch(e){status('MARKET DATA RECONNECTING',true);}finally{syncBusy=false;}}
function tick(m){if(m.symbol&&m.symbol!=='XAU/USD')return;const p=Number(m.price);if(!Number.isFinite(p)||p<=0)return;const prev=lastPrice;lastPrice=p;lastTime=Number(m.time)||Date.now();priceUI(p,prev);applyTick(p,lastTime);status('LIVE TICK STREAM');}
function connect(){if(ws&&(ws.readyState===0||ws.readyState===1))return;const proto=location.protocol==='https:'?'wss:':'ws:';ws=new WebSocket(`${proto}//${location.host}/ws/live`);ws.onopen=()=>{status('LIVE TICK STREAM');sync();};ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='tick')tick(m);else if(m.type==='status'&&(m.status==='error'||m.status==='disabled'))status('LIVE STREAM UNAVAILABLE',true);}catch(_){} };ws.onclose=()=>{status('RECONNECTING LIVE TICKS');clearTimeout(reconnect);reconnect=setTimeout(connect,3000);};ws.onerror=()=>status('LIVE TICK ERROR',true);}
window.__priceEdgeLive={getPrice:()=>lastPrice,getTime:()=>lastTime,getCandles:getCandles,resync:sync};
syncTimer=setInterval(sync,30000);connect();window.addEventListener('online',sync);window.addEventListener('pageshow',sync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
})();
