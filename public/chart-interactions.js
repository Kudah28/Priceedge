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

  try{
    const source=window.draw.toString();
    const patched=source.replace("Math.min(70,candles.length)","Math.min(window.visible,candles.length)");
    window.draw=eval("("+patched+")");
  }catch(_){}

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

  window.older=()=>{offset=clamp()+Math.max(10,Math.round(window.visible*.28));clamp();draw();};
  window.newer=()=>{offset=clamp()-Math.max(10,Math.round(window.visible*.28));clamp();draw();};
  window.live=()=>{offset=0;draw();};

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
    }else set("peTickState","WAITING FOR LIVE TICK");

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

  const pointers=new Map();
  let startX=0,startOffset=0,pinchStart=0,pinchVisible=70,pinchRatio=.5;

  chart.addEventListener("pointerdown",e=>{
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    try{chart.setPointerCapture(e.pointerId);}catch(_){}
    if(pointers.size===1){startX=e.clientX;startOffset=offset;}
    else if(pointers.size===2){
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

  /* ================= PRICEEDGE SETTINGS ================= */
  const PE_SETTINGS_KEY="priceedge_settings_v1";
  let peSettings=Object.assign({theme:"dark",notifications:true,sound:true},JSON.parse(localStorage.getItem(PE_SETTINGS_KEY)||"{}"));
  let audioCtx=null;
  let lastAlertKey="";

  function peSave(){localStorage.setItem(PE_SETTINGS_KEY,JSON.stringify(peSettings));}

  function peInjectStyle(){
    if(document.getElementById("peSettingsStyle"))return;
    const s=document.createElement("style");
    s.id="peSettingsStyle";
    s.textContent=`
      .pe-settings-btn{border:1px solid #31405f;background:#0c1322;color:#dce5fa;border-radius:9px;padding:7px 10px;font-weight:800;line-height:1}
      .pe-settings-overlay{position:fixed;inset:0;background:rgba(0,0,0,.58);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:70px 14px 20px;overflow:auto}
      .pe-settings-modal{width:min(440px,100%);background:#111a2d;color:#edf2ff;border:1px solid #31405f;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.4);padding:18px}
      .pe-settings-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px}.pe-settings-head h2{margin:0;font-size:20px}
      .pe-close{border:1px solid #31405f;background:#0c1322;color:#fff;border-radius:8px;padding:6px 10px;font-size:18px}
      .pe-setting-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:13px 0;border-bottom:1px solid #26334f}.pe-setting-row:last-child{border-bottom:0}
      .pe-setting-label b{display:block}.pe-setting-label span{display:block;color:#8e9cb7;font-size:11px;margin-top:3px}
      .pe-switch{width:48px;height:28px;border-radius:999px;border:1px solid #31405f;background:#0c1322;position:relative;flex:0 0 auto}.pe-switch i{position:absolute;width:20px;height:20px;left:3px;top:3px;border-radius:50%;background:#8e9cb7;transition:.18s}.pe-switch.on{background:#f5c451;border-color:#f5c451}.pe-switch.on i{left:23px;background:#17130a}
      .pe-theme-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.pe-theme-buttons button{border:1px solid #31405f;background:#0c1322;color:#dce5fa;border-radius:9px;padding:10px}.pe-theme-buttons button.on{border-color:#f5c451;color:#f5c451}
      .pe-test{width:100%;margin-top:12px;border:1px solid #31405f;background:#18223a;color:#fff;border-radius:9px;padding:10px;font-weight:800}
      body.pe-light{background:#f5f7fb!important;color:#172033!important} body.pe-light header{background:rgba(255,255,255,.94);border-color:#d7deea} body.pe-light nav{background:#fff;border-color:#d7deea} body.pe-light nav button{color:#647089} body.pe-light nav button.on{background:#e9eef7;color:#172033}
      body.pe-light .card{background:#fff;border-color:#d7deea;box-shadow:0 8px 25px rgba(30,50,80,.08)} body.pe-light .metric,body.pe-light .level,body.pe-light input,body.pe-light select,body.pe-light textarea{background:#f7f9fc;border-color:#cbd5e5;color:#172033} body.pe-light .controls button,body.pe-light .ghost{background:#fff;border-color:#cbd5e5;color:#24324a} body.pe-light .chartwrap{background:#f8fafc;border-color:#d7deea} body.pe-light .signal{background:#eef2f8} body.pe-light .notice{background:#fff8df} body.pe-light .muted{color:#647089} body.pe-light th,body.pe-light td{border-color:#d7deea} body.pe-light .premium{background:#fffaf0} body.pe-light .pe-settings-modal{background:#fff;color:#172033;border-color:#d7deea} body.pe-light .pe-setting-row{border-color:#d7deea} body.pe-light .pe-close,body.pe-light .pe-switch{background:#f7f9fc;color:#172033;border-color:#cbd5e5} body.pe-light .pe-theme-buttons button{background:#f7f9fc;color:#24324a;border-color:#cbd5e5} body.pe-light #peLiveCandle{background:#f7f9fc!important;color:#172033!important;border-color:#cbd5e5!important}
      @media(max-width:500px){.pe-settings-overlay{padding-top:55px}.pe-settings-modal{padding:14px}.pe-settings-btn{padding:7px 8px}}
    `;
    document.head.appendChild(s);
  }

  function peApplyTheme(){
    document.body.classList.toggle("pe-light",peSettings.theme==="light");
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute("content",peSettings.theme==="light"?"#ffffff":"#080d19");
  }

  function peEnsureButton(){
    peInjectStyle();
    peApplyTheme();
    if(document.getElementById("peSettingsButton"))return;
    const top=document.querySelector("header .top")||document.querySelector("header");
    if(!top)return;
    const btn=document.createElement("button");
    btn.id="peSettingsButton";btn.className="pe-settings-btn";btn.type="button";btn.title="Settings";btn.setAttribute("aria-label","Settings");btn.textContent="⚙";
    btn.onclick=peOpen;
    top.insertBefore(btn,top.firstChild);
  }

  function peOpen(){
    if(document.getElementById("peSettingsOverlay"))return;
    const o=document.createElement("div");o.id="peSettingsOverlay";o.className="pe-settings-overlay";
    o.innerHTML='<div class="pe-settings-modal" role="dialog" aria-modal="true" aria-label="PriceEdge settings"><div class="pe-settings-head"><h2>PriceEdge Settings</h2><button class="pe-close" type="button" aria-label="Close">×</button></div><div><b>Theme</b><div class="pe-theme-buttons"><button id="peDark" type="button">🌙 Dark</button><button id="peLight" type="button">☀️ White</button></div></div><div class="pe-setting-row"><div class="pe-setting-label"><b>Notifications</b><span>Receive alerts when PriceEdge detects an important event.</span></div><button id="peNotif" class="pe-switch" type="button" aria-label="Toggle notifications"><i></i></button></div><div class="pe-setting-row"><div class="pe-setting-label"><b>Notification sound</b><span>Play a short sound with PriceEdge alerts.</span></div><button id="peSound" class="pe-switch" type="button" aria-label="Toggle notification sound"><i></i></button></div><button id="pePermission" class="pe-test" type="button">Enable browser notifications</button><button id="peTest" class="pe-test" type="button">Test notification + sound</button></div>';
    document.body.appendChild(o);
    o.querySelector(".pe-close").onclick=()=>o.remove();
    o.addEventListener("click",e=>{if(e.target===o)o.remove();});
    o.querySelector("#peDark").onclick=()=>{peSettings.theme="dark";peSave();peApplyTheme();peRefreshModal();};
    o.querySelector("#peLight").onclick=()=>{peSettings.theme="light";peSave();peApplyTheme();peRefreshModal();};
    o.querySelector("#peNotif").onclick=async()=>{peSettings.notifications=!peSettings.notifications;peSave();if(peSettings.notifications)await peRequestPermission();peRefreshModal();};
    o.querySelector("#peSound").onclick=async()=>{peSettings.sound=!peSettings.sound;peSave();if(peSettings.sound)peUnlockAudio();peRefreshModal();};
    o.querySelector("#pePermission").onclick=peRequestPermission;
    o.querySelector("#peTest").onclick=()=>peNotify("PriceEdge test","Notifications and sound are working.","test");
    peRefreshModal();
  }

  function peRefreshModal(){
    const o=document.getElementById("peSettingsOverlay");if(!o)return;
    ["peDark","peLight"].forEach(id=>document.getElementById(id)?.classList.toggle("on",document.getElementById(id).id==="peDark"?peSettings.theme==="dark":peSettings.theme==="light"));
    [["peNotif",peSettings.notifications],["peSound",peSettings.sound]].forEach(([id,on])=>document.getElementById(id)?.classList.toggle("on",on));
    const p=document.getElementById("pePermission");if(p)p.textContent=("Notification" in window&&Notification.permission==="granted")?"Browser notifications enabled":"Enable browser notifications";
  }

  async function peRequestPermission(){
    if(!("Notification" in window)){alert("This browser does not support web notifications.");return false;}
    try{const result=await Notification.requestPermission();peRefreshModal();return result==="granted";}catch(_){return false;}
  }

  function peUnlockAudio(){
    try{
      const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
      audioCtx=audioCtx||new C();
      if(audioCtx.state==="suspended")audioCtx.resume();
      const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=880;g.gain.setValueAtTime(.0001,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.08,audioCtx.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.12);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.13);
    }catch(_){ }
  }

  function peSoundAlert(){
    if(!peSettings.sound)return;
    try{
      const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
      audioCtx=audioCtx||new C();if(audioCtx.state==="suspended")audioCtx.resume();
      [660,880].forEach((freq,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain(),t=audioCtx.currentTime+i*.11;o.type="sine";o.frequency.value=freq;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.09,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+.12);o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+.13);});
    }catch(_){ }
  }

  function peNotify(title,body,key){
    if(!peSettings.notifications)return;
    if(key&&key===lastAlertKey)return;
    if(key)lastAlertKey=key;
    peSoundAlert();
    if("Notification" in window&&Notification.permission==="granted"){
      try{new Notification(title,{body,tag:"priceedge-"+key});}catch(_){ }
    }
  }

  function peWatchSignal(){
    const el=document.getElementById("signal");
    if(!el)return;
    const heading=el.querySelector("h3");
    const signal=(heading?.textContent||"").trim().toUpperCase();
    if(signal==="BUY"||signal==="SELL"){
      const text=(el.innerText||signal).replace(/\s+/g," ").trim();
      peNotify("PriceEdge "+signal,text,"signal-"+signal+"-"+text.slice(0,80));
    }
  }

  window.peOpenSettings=peOpen;
  peEnsureButton();
  setTimeout(peEnsureButton,500);
  peApplyTheme();
  if("serviceWorker" in navigator){try{navigator.serviceWorker.register("/sw.js").catch(()=>{});}catch(_){} }

  ensureLivePanel();
  showZoom();
  updateLivePanel();
  setInterval(updateLivePanel,1000);
  setInterval(peWatchSignal,1500);
  draw();
})();