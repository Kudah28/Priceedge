/* PriceEdge Chart Renderer V3
   Owns the actual candle drawing. Uses the live `candles` array and never reuses
   a shared high/low for every candle. This is intentionally dependency-free.
*/
(function(){
  'use strict';
  const canvas=document.getElementById('chart');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  let visible=60;
  let start=0;
  let dragging=false;
  let dragX=0;
  let dragStart=0;
  let pinch=null;

  const num=v=>Number(v);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const fmt=v=>v>=1000?v.toFixed(2):v>=100?v.toFixed(3):v.toFixed(4);

  function data(){
    if(!Array.isArray(window.candles) && typeof candles==='undefined')return [];
    const src=typeof candles!=='undefined'?candles:window.candles;
    if(!Array.isArray(src))return [];
    const count=Math.min(visible,src.length);
    const maxStart=Math.max(0,src.length-count);
    start=clamp(start,0,maxStart);
    return src.slice(start,start+count).map((c,i)=>{
      const o=num(c.open),h=num(c.high),l=num(c.low),x=num(c.close);
      if(![o,h,l,x].every(Number.isFinite))return null;
      return {open:o,high:Math.max(h,o,x),low:Math.min(l,o,x),close:x,datetime:c.datetime||c.timestamp||''};
    }).filter(Boolean);
  }

  function resize(){
    const r=canvas.getBoundingClientRect();
    const d=Math.max(1,window.devicePixelRatio||1);
    canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);
    ctx.setTransform(d,0,0,d,0,0);
    draw();
  }

  function draw(){
    const r=canvas.getBoundingClientRect(),w=r.width,h=r.height;
    if(!w||!h)return;
    const d=data();
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='#08111f';ctx.fillRect(0,0,w,h);
    if(!d.length){
      ctx.fillStyle='#71809d';ctx.font='12px system-ui';ctx.fillText('Waiting for candle data…',16,24);return;
    }

    const pad={left:12,right:58,top:28,bottom:22};
    const cw=Math.max(1,w-pad.left-pad.right), ch=Math.max(1,h-pad.top-pad.bottom);
    const highs=d.map(c=>c.high), lows=d.map(c=>c.low);
    let lo=Math.min(...lows), hi=Math.max(...highs);
    let range=hi-lo;
    if(!Number.isFinite(range)||range<=0)range=Math.max(Math.abs(hi)*0.0005,0.5);
    const extra=range*0.10;lo-=extra;hi+=extra;range=hi-lo;
    const y=v=>pad.top+(hi-v)/range*ch;
    const step=cw/d.length;
    const body=Math.max(2,Math.min(10,step*0.62));

    // Grid and price scale.
    ctx.font='10px system-ui,-apple-system,sans-serif';
    ctx.textBaseline='middle';ctx.textAlign='left';
    const gridN=6;
    for(let i=0;i<=gridN;i++){
      const py=pad.top+(ch*i/gridN), pv=hi-range*i/gridN;
      ctx.strokeStyle=i===gridN?'#20304a':'#16253a';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(pad.left,py);ctx.lineTo(pad.left+cw,py);ctx.stroke();
      ctx.fillStyle='#71809d';ctx.fillText(fmt(pv),pad.left+cw+8,py);
    }
    for(let i=0;i<5;i++){
      const px=pad.left+(cw*i/4);ctx.strokeStyle='#101d31';
      ctx.beginPath();ctx.moveTo(px,pad.top);ctx.lineTo(px,pad.top+ch);ctx.stroke();
    }

    // Candles: every candle gets its own OHLC values.
    d.forEach((c,i)=>{
      const x=pad.left+(i+.5)*step;
      const yo=y(c.open),yc=y(c.close),yh=y(c.high),yl=y(c.low);
      const up=c.close>=c.open;
      const col=up?'#43e39a':'#ff5f7d';
      ctx.strokeStyle=col;ctx.lineWidth=Math.max(1,Math.min(2,step*.18));
      ctx.beginPath();ctx.moveTo(x,yh);ctx.lineTo(x,yl);ctx.stroke();
      const top=Math.min(yo,yc), bh=Math.max(1.5,Math.abs(yc-yo));
      ctx.fillStyle=col;ctx.fillRect(x-body/2,top,body,bh);
      // Crisp edge for very small bodies.
      if(bh<=2.1){ctx.strokeStyle=col;ctx.strokeRect(x-body/2,top,body,bh);}
    });

    // Current price line and label.
    const last=d[d.length-1].close,py=y(last);
    ctx.strokeStyle='#f5c451';ctx.lineWidth=1;ctx.setLineDash([5,4]);
    ctx.beginPath();ctx.moveTo(pad.left,py);ctx.lineTo(pad.left+cw,py);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#f5c451';ctx.fillRect(pad.left+cw+3,py-10,55,20);
    ctx.fillStyle='#17130a';ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.fillText(fmt(last),pad.left+cw+30,py);

    // Small header.
    ctx.fillStyle='#71809d';ctx.font='bold 10px system-ui';ctx.textAlign='left';ctx.fillText('XAU/USD · LIVE',pad.left,14);
    ctx.textAlign='right';ctx.fillText((typeof tf!=='undefined'?String(tf).toUpperCase():'5MIN'),w-pad.right,14);

    // Subtle swing labels from actual visible candle highs/lows.
    const hiPts=[],loPts=[];
    for(let i=2;i<d.length-2;i++){
      if(d[i].high>=d[i-1].high&&d[i].high>=d[i+1].high&&d[i].high>=d[i-2].high&&d[i].high>=d[i+2].high)hiPts.push(i);
      if(d[i].low<=d[i-1].low&&d[i].low<=d[i+1].low&&d[i].low<=d[i-2].low&&d[i].low<=d[i+2].low)loPts.push(i);
    }
    ctx.font='bold 8px system-ui';ctx.textAlign='center';
    hiPts.slice(-3).forEach((i,n)=>{ctx.fillStyle='#ff718a';ctx.fillText(n?'LH':'HH',pad.left+(i+.5)*step,y(d[i].high)-8)});
    loPts.slice(-3).forEach((i,n)=>{ctx.fillStyle='#43e39a';ctx.fillText(n?'HL':'LL',pad.left+(i+.5)*step,y(d[i].low)+10)});

    const info=document.getElementById('zoomLevel');if(info)info.textContent=d.length+' candles';
  }

  function setVisible(n,anchor=.5){
    const src=typeof candles!=='undefined'?candles:(window.candles||[]);
    const total=src.length;const old=visible;
    visible=clamp(Math.round(n),25,Math.max(25,Math.min(160,total||160)));
    const maxOld=Math.max(0,total-old),maxNew=Math.max(0,total-visible);
    const pos=maxOld?start/maxOld:.5;
    start=clamp(Math.round(pos*maxNew),0,maxNew);
    draw();
  }
  window.zoomIn=()=>setVisible(visible*.8);
  window.zoomOut=()=>setVisible(visible/0.8);
  window.resetZoom=()=>{visible=60;start=Math.max(0,(typeof candles!=='undefined'?candles.length:0)-visible);draw();};
  window.live=()=>{start=Math.max(0,(typeof candles!=='undefined'?candles.length:0)-visible);draw();};
  window.older=()=>{start+=Math.max(8,Math.round(visible*.25));draw();};
  window.newer=()=>{start-=Math.max(8,Math.round(visible*.25));if(start<0)start=0;draw();};
  window.draw=draw;
  window.__priceEdgeChartV3={draw,resize};

  canvas.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'){
      if(!pinch){dragging=true;dragX=e.clientX;dragStart=start;}
    }else{dragging=true;dragX=e.clientX;dragStart=start;}
    try{canvas.setPointerCapture(e.pointerId)}catch(_){ }
  });
  canvas.addEventListener('pointermove',e=>{
    if(!dragging)return;
    const dx=e.clientX-dragX;
    if(Math.abs(dx)>2){
      const src=typeof candles!=='undefined'?candles:[];
      const step=Math.max(3,canvas.clientWidth/Math.max(1,visible));
      start=clamp(dragStart-Math.round(dx/step),0,Math.max(0,src.length-visible));
      draw();e.preventDefault();
    }
  },{passive:false});
  const end=()=>{dragging=false};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);

  let lastTouches=null,lastVisible=visible;
  canvas.addEventListener('touchstart',e=>{if(e.touches.length===2){const a=e.touches[0],b=e.touches[1];lastTouches=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);lastVisible=visible;}},{passive:false});
  canvas.addEventListener('touchmove',e=>{if(e.touches.length!==2||!lastTouches)return;e.preventDefault();const a=e.touches[0],b=e.touches[1];const dist=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);setVisible(lastVisible*(lastTouches/Math.max(1,dist)));},{passive:false});
  canvas.addEventListener('touchend',()=>{lastTouches=null});

  window.addEventListener('resize',resize);
  const tick=()=>{draw();requestAnimationFrame(tick)};requestAnimationFrame(tick);
  resize();
})();
