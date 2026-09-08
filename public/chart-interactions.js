/* PriceEdge chart controls — single owner for zoom/pan, never covering candles or time axis. */
(function(){
  'use strict';
  const chart=document.getElementById('chart');
  if(!chart)return;
  const isMobile=()=>window.matchMedia&&window.matchMedia('(max-width:600px)').matches;
  const MOBILE_DEFAULT=24,DESKTOP_DEFAULT=70,MIN_VISIBLE=20,MAX_VISIBLE=160;
  const candles=()=>Array.isArray(window.candles)?window.candles:[];
  function clamp(){
    const a=candles(); let v=Number(window.visible);
    if(!Number.isFinite(v)||v<MIN_VISIBLE)v=isMobile()?MOBILE_DEFAULT:DESKTOP_DEFAULT;
    window.visible=Math.min(Math.max(v,MIN_VISIBLE),Math.max(MIN_VISIBLE,a.length||MIN_VISIBLE));
    window.offset=Math.max(0,Math.min(Math.max(0,a.length-window.visible),Number(window.offset)||0));
  }
  function label(){const e=document.getElementById('zoomLevel');if(e)e.textContent=(window.visible||MOBILE_DEFAULT)+' candles';}
  function draw(){clamp();if(typeof window.draw==='function')window.draw();label();}
  window.visible=isMobile()?MOBILE_DEFAULT:DESKTOP_DEFAULT; window.offset=0;
  function zoom(next,ratio=.5){
    const a=candles(),old=window.visible||MOBILE_DEFAULT;if(!a.length)return;
    let n=Math.round(next);n=Math.max(MIN_VISIBLE,Math.min(MAX_VISIBLE,n));if(isMobile())n=Math.max(MOBILE_DEFAULT,n);if(n===old)return;
    const maxStart=Math.max(0,a.length-old),oldStart=Math.max(0,a.length-old-(Number(window.offset)||0));
    const r=Math.max(0,Math.min(1,ratio)),anchor=oldStart+Math.round(Math.max(0,old-1)*r);
    let ns=anchor-Math.round((n-1)*r);ns=Math.max(0,Math.min(Math.max(0,a.length-n),ns));
    window.visible=n;window.offset=Math.max(0,a.length-(ns+n));draw();
  }
  window.zoomIn=()=>zoom((window.visible||MOBILE_DEFAULT)*.8);
  window.zoomOut=()=>zoom((window.visible||MOBILE_DEFAULT)*1.25);
  window.resetZoom=()=>{window.visible=isMobile()?MOBILE_DEFAULT:DESKTOP_DEFAULT;window.offset=0;draw();};
  window.live=()=>{window.offset=0;draw();};
  window.older=()=>{window.offset=(Number(window.offset)||0)+Math.max(5,Math.round((window.visible||MOBILE_DEFAULT)*.25));draw();};
  window.newer=()=>{window.offset=(Number(window.offset)||0)-Math.max(5,Math.round((window.visible||MOBILE_DEFAULT)*.25));draw();};

  const wrap=chart.closest('.chartwrap');
  if(wrap){
    wrap.style.position='relative';
    let tools=document.getElementById('chartTools');
    if(!tools){
      tools=document.createElement('div');tools.id='chartTools';
      tools.innerHTML='<button type="button" onclick="zoomOut()">−</button><button type="button" onclick="resetZoom()">Reset</button><button type="button" onclick="zoomIn()">+</button><span id="zoomLevel">24 candles</span>';
      /* IMPORTANT: controls live OUTSIDE the canvas so they can never hide
         the last candle, price line, or time labels. */
      wrap.insertAdjacentElement('afterend',tools);
    }
    const style=document.createElement('style');style.id='peChartControlsStyle';style.textContent=`
      #chartTools{display:flex;justify-content:flex-end;align-items:center;gap:6px;margin:8px 2px 0;min-height:38px}
      #chartTools button,#chartTools span{border:1px solid #31405f;background:#0c1322;color:#dce5fa;border-radius:8px;padding:7px 11px;font:800 12px system-ui,-apple-system,Segoe UI,sans-serif}
      #chartTools button:active{transform:translateY(1px)}
      #chartTools span{color:#8e9cb7;font-weight:600;min-width:78px;text-align:center}
      @media(max-width:600px){#chartTools{justify-content:flex-end;margin:7px 0 0;gap:5px}#chartTools button,#chartTools span{min-height:38px;padding:7px 9px;font-size:11px}}
    `;document.head.appendChild(style);
  }

  const pointers=new Map();let sx=0,so=0,pinchStart=0,pinchVisible=24,pinchRatio=.5;
  chart.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});try{chart.setPointerCapture(e.pointerId)}catch(_){}if(pointers.size===1){sx=e.clientX;so=Number(window.offset)||0}else if(pointers.size===2){const p=[...pointers.values()];pinchStart=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);pinchVisible=window.visible||MOBILE_DEFAULT;const r=chart.getBoundingClientRect();pinchRatio=Math.max(0,Math.min(1,((p[0].x+p[1].x)/2-r.left)/r.width));}});
  chart.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);if(pinchStart)zoom(pinchVisible*pinchStart/Math.max(1,d),pinchRatio);e.preventDefault();return}const dx=e.clientX-sx;if(Math.abs(dx)>6){window.offset=so+Math.round(dx/Math.max(5,(window.visible||MOBILE_DEFAULT)/7));draw();e.preventDefault();}},{passive:false});
  const end=e=>{pointers.delete(e.pointerId);if(!pointers.size)pinchStart=0};chart.addEventListener('pointerup',end);chart.addEventListener('pointercancel',end);
  chart.addEventListener('wheel',e=>{e.preventDefault();const r=chart.getBoundingClientRect();zoom((window.visible||MOBILE_DEFAULT)*(e.deltaY<0?.8:1.25),Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)));},{passive:false});
  chart.style.touchAction='pan-y';if(wrap)wrap.style.touchAction='pan-y';
  function enforce(){if(isMobile()){window.visible=MOBILE_DEFAULT;window.offset=0}clamp();label();if(typeof window.draw==='function')window.draw();}
  window.addEventListener('resize',enforce,{passive:true});window.addEventListener('pageshow',enforce);document.addEventListener('visibilitychange',()=>{if(!document.hidden)enforce()});window.addEventListener('priceedge:candles-ready',enforce);window.addEventListener('priceedge:market-updated',()=>{clamp();if(typeof window.draw==='function')window.draw()});
  enforce();
})();
