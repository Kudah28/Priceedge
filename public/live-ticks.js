/* PriceEdge live XAU/USD tick client.
   The server remains the source of live ticks; Twelve Data candle history is
   used as a periodic OHLC baseline. The current 5-minute candle is then
   reconciled from the same UTC bucket, with the live tick as its close.
*/
(function () {
  "use strict";

  let socket = null;
  let reconnectTimer = null;
  let frameQueued = false;
  let analysisTimer = null;
  let candleSyncTimer = null;
  let lastTick = 0;
  let lastTickTime = 0;

  const $id = id => document.getElementById(id);

  function getCandles() {
    try {
      if (typeof candles !== "undefined" && Array.isArray(candles)) return candles;
    } catch (_) {}
    return Array.isArray(window.candles) ? window.candles : null;
  }

  function setStatus(text, type) {
    for (const id of ["liveStatusText", "streamText"]) {
      const el = $id(id);
      if (el) el.textContent = text;
    }
    const stream = $id("stream");
    if (stream) stream.className = type === "error" ? "status off" : "status";
    const dot = $id("dot");
    if (dot) dot.className = "dot" + (type === "error" ? " off" : "");
  }

  function candleBucket(ms) { return Math.floor(ms / 300000) * 300000; }
  function candleStartMs(candle) { const raw=candle?.datetime; if(!raw)return NaN; const t=Date.parse(raw); return Number.isFinite(t)?candleBucket(t):NaN; }
  function secondsRemaining(bucket) { return Math.max(0,Math.ceil((bucket+300000-Date.now())/1000)); }
  function formatClock(seconds) { const m=Math.floor(seconds/60),s=seconds%60; return `${m}:${String(s).padStart(2,"0")}`; }

  function updateCountdown() {
    const list=getCandles(); if(!list?.length)return;
    const bucket=candleStartMs(list[list.length-1]); if(!Number.isFinite(bucket))return;
    const meta=$id("liveTickMeta"); if(meta&&lastTick)meta.textContent=`LIVE TICK • ${lastTick.toFixed(2)} • NEW 5M CANDLE IN ${formatClock(secondsRemaining(bucket))}`;
  }

  function ensureTickMeta() {
    let el=$id("liveTickMeta"); if(el)return el;
    const parent=$id("streamText")?.parentElement; if(!parent)return null;
    el=document.createElement("div");el.id="liveTickMeta";el.style.cssText="margin-top:3px;font-size:10px;opacity:.72;font-variant-numeric:tabular-nums;";parent.appendChild(el);return el;
  }

  function updatePriceUi(price,previousPrice) {
    const priceEl=$id("price");
    if(priceEl){const direction=previousPrice==null?"":price>previousPrice?" ▲":price<previousPrice?" ▼":"";const cls=previousPrice==null||price>=previousPrice?"green":"red";priceEl.innerHTML=`$${price.toFixed(2)} <span style="font-size:15px" class="${cls}">${direction}</span>`;}
    const changeEl=$id("change")||$id("priceMetaText");
    if(changeEl&&previousPrice!=null){const delta=price-previousPrice;changeEl.textContent=`${delta>0?"+":""}${delta.toFixed(2)} LIVE`;changeEl.className=delta>0?"green":delta<0?"red":"gold";}
  }

  function renderChartAndScheduleAnalysis(){
    if(!frameQueued){frameQueued=true;requestAnimationFrame(()=>{frameQueued=false;if(typeof window.drawChart==="function")window.drawChart();});}
    if(!analysisTimer){analysisTimer=setTimeout(()=>{analysisTimer=null;if(typeof window.analyze==="function")window.analyze();},1000);}
  }

  function updateFormingCandle(price,time){
    const list=getCandles();if(!list)return;
    const bucket=candleBucket(time);let last=list[list.length-1];const lastBucket=candleStartMs(last);
    if(!Number.isFinite(lastBucket)||bucket>lastBucket){last={datetime:new Date(bucket).toISOString(),open:price,high:price,low:price,close:price,live:true};list.push(last);while(list.length>300)list.shift();}
    else if(bucket<lastBucket)return;
    else{last.live=true;last.high=Math.max(Number(last.high),price);last.low=Math.min(Number(last.low),price);last.close=price;}
    ensureTickMeta();updateCountdown();renderChartAndScheduleAnalysis();
  }

  async function syncCandleBaseline(){
    const list=getCandles();if(!list)return;
    try{
      const r=await fetch("/api/candles?symbol=XAU%2FUSD&interval=5min&size=300",{cache:"no-store"});if(!r.ok)return;const d=await r.json();if(!Array.isArray(d.values)||!d.values.length)return;
      const incoming=d.values.map(c=>({datetime:c.datetime,open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)})).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite));if(!incoming.length)return;
      const latest=incoming[incoming.length-1],latestBucket=candleStartMs(latest),nowBucket=candleBucket(lastTickTime||Date.now()),current=list[list.length-1],currentBucket=candleStartMs(current);
      if(Number.isFinite(currentBucket)&&Number.isFinite(latestBucket)&&latestBucket<currentBucket)return;
      if(lastTick&&Number.isFinite(nowBucket)){
        if(!Number.isFinite(currentBucket)||nowBucket>currentBucket){const baseline=latestBucket===nowBucket?latest:null;list.push(baseline?{...baseline,live:true,close:lastTick,high:Math.max(baseline.high,lastTick),low:Math.min(baseline.low,lastTick)}:{datetime:new Date(nowBucket).toISOString(),open:lastTick,high:lastTick,low:lastTick,close:lastTick,live:true});}
        else if(nowBucket===currentBucket){const c=current;if(latestBucket===nowBucket){c.open=latest.open;c.high=Math.max(latest.high,c.high,lastTick);c.low=Math.min(latest.low,c.low,lastTick);}c.close=lastTick;c.live=true;}
      }else list.splice(0,list.length,...incoming);
      while(list.length>300)list.shift();updateCountdown();renderChartAndScheduleAnalysis();
    }catch(_){ }
  }

  function handleTick(msg){
    if(msg.symbol&&msg.symbol!=="XAU/USD")return;const price=Number(msg.price);if(!Number.isFinite(price)||price<=0)return;
    const previousPrice=lastTick||null;lastTick=price;lastTickTime=Number(msg.time)||Date.now();updatePriceUi(price,previousPrice);updateFormingCandle(price,lastTickTime);
    const received=$id("dataReceived");if(received)received.textContent=`Live tick received • ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
    const updated=$id("lastUpdated");if(updated)updated.textContent="LIVE TICK STREAM";setStatus("LIVE TICK STREAM","live");
  }

  function connect(){
    if(socket&&(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING))return;
    const protocol=location.protocol==="https:"?"wss:":"ws:";socket=new WebSocket(`${protocol}//${location.host}/ws/live`);
    socket.addEventListener("open",()=>{setStatus("LIVE TICK STREAM","live");syncCandleBaseline();});
    socket.addEventListener("message",event=>{let msg;try{msg=JSON.parse(event.data);}catch(_){return;}if(msg.type==="status"){if(msg.status==="connected")setStatus("LIVE TICK STREAM","live");else if(msg.status==="reconnecting")setStatus("RECONNECTING LIVE TICKS","cached");else if(msg.status==="error"||msg.status==="disabled")setStatus("LIVE STREAM UNAVAILABLE","error");return;}if(msg.type==="tick")handleTick(msg);});
    socket.addEventListener("close",()=>{setStatus("RECONNECTING LIVE TICKS","cached");clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,3000);});socket.addEventListener("error",()=>setStatus("LIVE TICK ERROR","error"));
  }

  setInterval(updateCountdown,1000);clearInterval(candleSyncTimer);candleSyncTimer=setInterval(syncCandleBaseline,30000);syncCandleBaseline();connect();

  /* CYBERTRUCK LIVE CHART OVERRIDE: replace the old stretched candle renderer. */
  function installProfessionalLiveRenderer(){
    const canvas=$id("chart");if(!canvas)return;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    window.drawChart=function(){
      const list=getCandles();if(!list||!list.length)return;
      const dpr=Math.max(1,window.devicePixelRatio||1),w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const visible=Math.max(20,Math.min(160,Number(window.visible)||70));const offset=Math.max(0,Math.min(Math.max(0,list.length-visible),Number(window.offset)||0));const end=list.length-offset;const data=list.slice(Math.max(0,end-visible),end).map(k=>({open:Number(k.open),high:Number(k.high),low:Number(k.low),close:Number(k.close),time:k.datetime})).filter(k=>[k.open,k.high,k.low,k.close].every(Number.isFinite));if(!data.length)return;
      let lo=Math.min(...data.map(k=>k.low)),hi=Math.max(...data.map(k=>k.high));let range=hi-lo;if(!(range>0))range=Math.max(.05,Math.abs(hi)*.001);const pad=range*.1;lo-=pad;hi+=pad;
      const L=12,R=70,T=22,B=24,PW=Math.max(20,w-L-R),PH=Math.max(20,h-T-B),step=PW/data.length,bw=Math.max(3,Math.min(12,step*.62)),x=i=>L+(i+.5)*step,y=v=>T+(hi-v)/(hi-lo)*PH;
      ctx.fillStyle="#0a1220";ctx.fillRect(0,0,w,h);ctx.font="10px system-ui";ctx.textBaseline="middle";ctx.textAlign="left";
      for(let i=0;i<=6;i++){const v=hi-(hi-lo)*i/6,yy=y(v);ctx.strokeStyle="#18263c";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(w-R,yy);ctx.stroke();ctx.fillStyle="#71809b";ctx.fillText(v.toFixed(2),w-R+7,yy);}
      for(let i=0;i<=5;i++){const xx=L+i*PW/5;ctx.strokeStyle="#111e31";ctx.beginPath();ctx.moveTo(xx,T);ctx.lineTo(xx,T+PH);ctx.stroke();}
      data.forEach((k,i)=>{const xx=x(i),up=k.close>=k.open,col=up?"#39e58c":"#ff5f7d";ctx.strokeStyle=col;ctx.lineWidth=Math.max(1,Math.min(2,step*.12));ctx.beginPath();ctx.moveTo(xx,y(k.high));ctx.lineTo(xx,y(k.low));ctx.stroke();const top=y(Math.max(k.open,k.close)),body=Math.max(2,Math.abs(y(k.open)-y(k.close)));ctx.fillStyle=col;ctx.fillRect(xx-bw/2,top,bw,body);});
      const last=data[data.length-1],cy=y(last.close);ctx.strokeStyle="#f5c451";ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(L,cy);ctx.lineTo(w-R,cy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#f5c451";ctx.fillRect(w-R+2,cy-9,66,18);ctx.fillStyle="#17130a";ctx.font="800 10px system-ui";ctx.textAlign="center";ctx.fillText(last.close.toFixed(2),w-R+35,cy+3);
      const hiIdx=[],loIdx=[];for(let i=2;i<data.length-2;i++){if(data[i].high>=data[i-1].high&&data[i].high>=data[i+1].high&&data[i].high>=data[i-2].high&&data[i].high>=data[i+2].high)hiIdx.push(i);if(data[i].low<=data[i-1].low&&data[i].low<=data[i+1].low&&data[i].low<=data[i-2].low&&data[i].low<=data[i+2].low)loIdx.push(i);}
      const drawZone=(level,col,label)=>{const yy=y(level);ctx.fillStyle=col==="sell"?"rgba(255,95,125,.055)":"rgba(57,229,140,.055)";ctx.fillRect(L,yy-4,PW,8);ctx.strokeStyle=col==="sell"?"rgba(255,95,125,.7)":"rgba(57,229,140,.7)";ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(w-R,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=col==="sell"?"#ff8096":"#65efad";ctx.font="800 9px system-ui";ctx.textAlign="right";ctx.fillText(label,w-R-5,yy-7);};
      if(hiIdx.length)drawZone(Math.max(...hiIdx.slice(-3).map(i=>data[i].high)),"sell","RESISTANCE");if(loIdx.length)drawZone(Math.min(...loIdx.slice(-3).map(i=>data[i].low)),"buy","SUPPORT");
      ctx.font="800 9px system-ui";ctx.textAlign="center";hiIdx.slice(-2).forEach((i,j)=>{ctx.fillStyle="#ff8096";ctx.fillText(j?"HH":"LH",x(i),y(data[i].high)-10);});loIdx.slice(-2).forEach((i,j)=>{ctx.fillStyle="#65efad";ctx.fillText(j?"HL":"LL",x(i),y(data[i].low)+12);});
      ctx.fillStyle="#71809b";ctx.font="800 9px system-ui";ctx.textAlign="left";ctx.fillText(`XAU/USD · LIVE · ${data.length} CANDLES`,L,11);
    };
    window.drawChart();setInterval(()=>window.drawChart(),1000);window.addEventListener("resize",window.drawChart);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installProfessionalLiveRenderer);else installProfessionalLiveRenderer();
})();
