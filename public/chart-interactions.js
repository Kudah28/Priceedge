/* PriceEdge chart interactions
   LEFT = newer/live data
   RIGHT = older data
   Pinch/wheel/buttons = zoom
   Live candle panel = real-time OHLC + correct candle countdown
*/
(function(){
  let chart=document.getElementById("chart");
  if(!chart||typeof window.draw!=="function")return;

  window.visible=70;

  /* Make the existing renderer respect the zoom level. */
  try{
    const source=window.draw.toString();
    const patched=source.replace("Math.min(70,candles.length)","Math.min(window.visible,candles.length)");
    window.draw=eval("("+patched+")");
  }catch(_){}

  /* Remove the original gesture listeners from the inline renderer. */
  const fresh=chart.cloneNode(true);
  chart.replaceWith(fresh);
  chart=fresh;

  const MIN_VISIBLE=20,MAX_VISIBLE=160;
  const clamp=()=>{
    offset=Math.max(0,Math.min(Math.max(0,candles.length-window.visible),offset));
    return offset;
  };

  function zoom(next,ratio=.5){
    const old=window.visible;
    const n=Math.max(MIN_VISIBLE,Math.min(MAX_VISIBLE,Math.round(next)));
    if(n===old)return;
    const end=candles.length-clamp();
    const start=Math.max(0,end-old);
    const r=Math.max(0,Math.min(1,ratio));
    const anchor=start+Math.round(Math.max(0,end-start-1)*r);
    let newStart=anchor-Math.round((n-1)*r);
    newStart=Math.max(0,Math.min(Math.max(0,candles.length-n),newStart));
    window.visible=n;
    offset=Math.max(0,candles.length-(newStart+n));
    clamp();
    draw();
    showZoom();
  }

  function showZoom(){
    const el=document.getElementById("zoomLevel");
    if(el)el.textContent=window.visible+" candles";
  }

  window.zoomIn=()=>zoom(window.visible*.8);
  window.zoomOut=()=>zoom(window.visible/0.8);
  window.resetZoom=()=>{window.visible=70;offset=0;draw();showZoom();};

  /* Button direction matches touch direction. */
  window.older=()=>{offset=clamp()+Math.max(10,Math.round(window.visible*.28));clamp();draw();};
  window.newer=()=>{offset=clamp()-Math.max(10,Math.round(window.visible*.28));clamp();draw();};
  window.live=()=>{offset=0;draw();};

  /* ---------- Live candle / tick panel ---------- */
  function ensureLivePanel(){
    let panel=document.getElementById("peLiveCandle");
    if(panel)return panel;
    const wrap=chart.closest(".chartwrap");
    if(!wrap)return null;
    panel=document.createElement("div");
    panel.id="peLiveCandle";
    panel.style.cssText="margin-top:10px;padding:10px 12px;background:#0c1322;border:1px solid #31405f;border-radius:10px;color:#dce5fa;";
    panel.innerHTML='<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;text-align:left"><div><span style="display:block;color:#8e9cb7;font-size:10px">TICK</span><b id="peTick">—</b></div><div><span style="display:block;color:#8e9cb7;font-size:10px">OPEN</span><b id="peOpen">—</b></div><div><span style="display:block;color:#8e9cb7;font-size:10px">HIGH</span><b id="peHigh">—</b></div><div><span style="display:block;color:#8e9cb7;font-size:10px">LOW</span><b id="peLow">—</b></div><div><span style="display:block;color:#8e9cb7;font-size:10px">CLOSE</span><b id="peClose">—</b></div></div><div style="display:flex;justify-content:space-between;gap:10px;margin-top:10px;font-size:10px"><span id="peTickState" style="color:#8e9cb7">WAITING FOR LIVE TICK</span><span id="peCandleCountdown" style="color:#f5c451;font-weight:800">CANDLE CLOSES —</span></div>';
    wrap.insertAdjacentElement("afterend",panel);
    return panel;
  }

  function num(v){
    const n=Number(v);
    return Number.isFinite(n)?n.toFixed(2):"—";
  }

  function intervalMs(){
    const map={"5min":300000,"15min":900000,"1h":3600000,"4h":14400000,"1day":86400000};
    return map[tf]||300000;
  }

  function updateLivePanel(){
    const panel=ensureLivePanel();
    if(!panel)return;

    const t=typeof tick!=="undefined"?tick:null;
    const f=typeof forming!=="undefined"?forming:null;
    const livePrice=t&&Number.isFinite(Number(t.price))?Number(t.price):(f?Number(f.close):NaN);

    const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
    set("peTick",num(livePrice));
    set("peOpen",f?num(f.open):"—");
    set("peHigh",f?num(f.high):"—");
    set("peLow",f?num(f.low):"—");
    set("peClose",f?num(f.close):"—");

    if(t&&t.time){
      const age=Math.max(0,Math.floor((Date.now()-new Date(t.time).getTime())/1000));
      set("peTickState",age<=3?"LIVE TICK RECEIVED":"LAST TICK "+age+"s AGO");
      const state=document.getElementById("peTickState");
      if(state)state.style.color=age<=3?"#4ade80":"#8e9cb7";
    }else{
      set("peTickState","WAITING FOR LIVE TICK");
    }

    /* Correct countdown: always counts down to the next timeframe boundary.
       It can never show a value longer than the selected candle duration. */
    const ms=intervalMs();
    const now=Date.now();
    const next=Math.floor(now/ms+1)*ms;
    const remaining=Math.max(0,next-now);
    const totalSec=Math.ceil(remaining/1000);
    const mins=Math.floor(totalSec/60);
    const secs=totalSec%60;
    const label=(mins>0?mins+":"+String(secs).padStart(2,"0"):"0:"+String(secs).padStart(2,"0"));
    set("peCandleCountdown","CANDLE CLOSES "+label);
  }

  /* ---------- Gestures ---------- */
  const pointers=new Map();
  let startX=0,startOffset=0,pinchStart=0,pinchVisible=70,pinchRatio=.5;

  chart.addEventListener("pointerdown",e=>{
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    try{chart.setPointerCapture(e.pointerId);}catch(_){}
    if(pointers.size===1){
      startX=e.clientX;
      startOffset=offset;
    }else if(pointers.size===2){
      const p=[...pointers.values()];
      pinchStart=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);
      pinchVisible=window.visible;
      const r=chart.getBoundingClientRect();
      pinchRatio=Math.max(0,Math.min(1,((p[0].x+p[1].x)/2-r.left)/r.width));
    }
  });

  chart.addEventListener("pointermove",e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});

    if(pointers.size===2){
      const p=[...pointers.values()];
      const dist=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);
      if(pinchStart>0)zoom(pinchVisible*(pinchStart/Math.max(1,dist)),pinchRatio);
      e.preventDefault();
      return;
    }

    const dx=e.clientX-startX;
    if(Math.abs(dx)>5){
      /* Finger LEFT (dx<0) => offset decreases => NEWER.
         Finger RIGHT (dx>0) => offset increases => OLDER. */
      offset=startOffset+Math.round(dx/Math.max(4,Math.min(12,window.visible/8)));
      clamp();
      draw();
      e.preventDefault();
    }
  },{passive:false});

  const end=e=>{pointers.delete(e.pointerId);if(pointers.size===0)pinchStart=0;};
  chart.addEventListener("pointerup",end);
  chart.addEventListener("pointercancel",end);

  chart.addEventListener("wheel",e=>{
    e.preventDefault();
    const r=chart.getBoundingClientRect();
    zoom(window.visible*(e.deltaY<0?.8:1.25),Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)));
  },{passive:false});

  chart.style.touchAction="pan-y";
  const wrap=chart.closest(".chartwrap");
  if(wrap){
    wrap.style.touchAction="pan-y";
    wrap.style.position="relative";
    if(!document.getElementById("chartTools")){
      const tools=document.createElement("div");
      tools.id="chartTools";
      tools.style.cssText="position:absolute;right:10px;bottom:10px;display:flex;gap:5px;align-items:center;z-index:3;";
      tools.innerHTML='<button type="button" onclick="zoomOut()" style="border:1px solid #31405f;background:#0c1322;color:#dce5fa;border-radius:7px;padding:6px 10px;font-weight:800">−</button><button type="button" onclick="resetZoom()" style="border:1px solid #31405f;background:#0c1322;color:#dce5fa;border-radius:7px;padding:6px 9px;font-size:11px">Reset</button><button type="button" onclick="zoomIn()" style="border:1px solid #31405f;background:#0c1322;color:#dce5fa;border-radius:7px;padding:6px 10px;font-weight:800">+</button><span id="zoomLevel" style="background:rgba(12,19,34,.88);border:1px solid #31405f;border-radius:7px;padding:6px 8px;color:#8e9cb7;font-size:10px">70 candles</span>';
      wrap.appendChild(tools);
    }
  }

  ensureLivePanel();
  showZoom();
  updateLivePanel();
  setInterval(updateLivePanel,1000);
  draw();
})();