/* PriceEdge chart controls: LEFT = newer, RIGHT = older, pinch/wheel = zoom. */
(function(){
  let chart=document.getElementById("chart");
  if(!chart||typeof window.draw!=="function")return;

  window.visible=70;

  /* Make the existing renderer respect the zoom level without replacing the app's analysis code. */
  const source=window.draw.toString();
  const patched=source.replace("Math.min(70,candles.length)","Math.min(window.visible,candles.length)");
  try{window.draw=eval("("+patched+")");}catch(_){}

  /* Remove the old gesture listeners by replacing the canvas node. */
  const fresh=chart.cloneNode(true);
  chart.replaceWith(fresh);
  chart=fresh;

  const MIN_VISIBLE=20,MAX_VISIBLE=160;
  const clamp=()=>{offset=Math.max(0,Math.min(Math.max(0,candles.length-window.visible),offset));return offset;};

  function zoom(next,ratio=.5){
    const old=window.visible;
    const n=Math.max(MIN_VISIBLE,Math.min(MAX_VISIBLE,Math.round(next)));
    if(n===old)return;
    const end=candles.length-clamp();
    const start=Math.max(0,end-old);
    const r=Math.max(0,Math.min(1,ratio));
    const anchor=start+Math.round((Math.max(1,end-start-1))*r);
    let newStart=anchor-Math.round((n-1)*r);
    newStart=Math.max(0,Math.min(Math.max(0,candles.length-n),newStart));
    window.visible=n;
    offset=Math.max(0,candles.length-(newStart+n));
    clamp();draw();show();
  }
  function show(){const el=document.getElementById("zoomLevel");if(el)el.textContent=window.visible+" candles";}

  window.zoomIn=()=>zoom(window.visible*.8);
  window.zoomOut=()=>zoom(window.visible/0.8);
  window.resetZoom=()=>{window.visible=70;offset=0;draw();show();};

  /* Button navigation uses the same direction as touch navigation. */
  window.older=()=>{offset=clamp()+Math.max(10,Math.round(window.visible*.28));clamp();draw();};
  window.newer=()=>{offset=clamp()-Math.max(10,Math.round(window.visible*.28));clamp();draw();};
  window.live=()=>{offset=0;draw();};

  const pointers=new Map();
  let startX=0,startOffset=0,pinchStart=0,pinchVisible=70,pinchRatio=.5;

  chart.addEventListener("pointerdown",e=>{
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    try{chart.setPointerCapture(e.pointerId);}catch(_){}
    if(pointers.size===1){
      startX=e.clientX;startOffset=offset;
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
      e.preventDefault();return;
    }

    const dx=e.clientX-startX;
    if(Math.abs(dx)>5){
      /* dx < 0 = finger moves LEFT = NEWER. dx > 0 = RIGHT = OLDER. */
      offset=startOffset+Math.round(dx/Math.max(4,Math.min(12,window.visible/8)));
      clamp();draw();e.preventDefault();
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

  show();draw();
})();
