/* PriceEdge professional live chart renderer
   Uses the existing live candle stream, viewport controls and drawing overlay.
*/
(function(){
  const canvas=document.getElementById('chart');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const DPR=()=>Math.max(1,Math.min(3,window.devicePixelRatio||1));
  const C={bg:'#07101d',grid:'#14233a',axis:'#71809d',up:'#35e28b',down:'#ff5c78',gold:'#f5c451',text:'#dce5fa',muted:'#71809d'};
  const $=id=>document.getElementById(id);
  const n=v=>Number(v);
  const finite=v=>Number.isFinite(n(v));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const fmt=v=>!finite(v)?'—':(Math.abs(v)>=1000?n(v).toFixed(2):n(v).toFixed(2));
  function niceStep(range,target){const raw=range/target,p=Math.pow(10,Math.floor(Math.log10(raw||1))),x=raw/p;return (x<=1?1:x<=2?2:x<=5?5:10)*p;}
  function candle(k){
    const close=n(k.close),open=finite(k.open)?n(k.open):close,high=finite(k.high)?n(k.high):Math.max(open,close),low=finite(k.low)?n(k.low):Math.min(open,close);
    return {open,close,high:Math.max(high,open,close),low:Math.min(low,open,close),time:k.datetime||k.timestamp||k.time};
  }
  function draw(){
    const list=Array.isArray(window.candles)?window.candles:[];
    if(!list.length)return;
    const d=DPR(),w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);ctx.setTransform(d,0,0,d,0,0);
    ctx.clearRect(0,0,w,h);ctx.fillStyle=C.bg;ctx.fillRect(0,0,w,h);
    const visible=Math.max(20,Math.min(Number(window.visible)||70,list.length));
    const maxStart=Math.max(0,list.length-visible);
    const off=clamp(Number(window.offset)||0,0,maxStart);
    const start=Math.max(0,list.length-visible-off);
    const data=list.slice(start,start+visible).map(candle);
    if(!data.length)return;
    let lo=Math.min(...data.map(x=>x.low)),hi=Math.max(...data.map(x=>x.high));
    const rawRange=Math.max(0.01,hi-lo),pad=rawRange*.10;lo-=pad;hi+=pad;
    const left=10,right=72,top=20,bottom=28,pw=Math.max(10,w-left-right),ph=Math.max(10,h-top-bottom);
    const y=v=>top+(hi-v)/(hi-lo)*ph;
    const step=pw/data.length,body=Math.max(2,Math.min(12,step*.62));
    // Header
    ctx.fillStyle=C.muted;ctx.font='700 10px system-ui,-apple-system,Segoe UI,sans-serif';ctx.textAlign='left';ctx.textBaseline='alphabetic';
    ctx.fillText('XAU/USD · '+(window.tf||'5min').toUpperCase(),left,12);ctx.textAlign='right';ctx.fillText('LIVE',left+pw,12);
    // Grid and price axis
    const tickStep=niceStep(hi-lo,7),first=Math.ceil(lo/tickStep)*tickStep;
    ctx.font='10px system-ui,-apple-system,Segoe UI,sans-serif';ctx.textBaseline='middle';
    for(let p=first;p<=hi+tickStep*.01;p+=tickStep){
      const yy=y(p);ctx.strokeStyle=C.grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(left+pw,yy);ctx.stroke();ctx.fillStyle=C.axis;ctx.textAlign='left';ctx.fillText(fmt(p),left+pw+9,yy);
    }
    for(let i=0;i<=6;i++){const xx=left+i*pw/6;ctx.strokeStyle='#0f1d31';ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,top+ph);ctx.stroke();}
    // Candles
    data.forEach((k,i)=>{
      const x=left+(i+.5)*step,up=k.close>=k.open,col=up?C.up:C.down;
      ctx.strokeStyle=col;ctx.lineWidth=Math.max(1,Math.min(2,step*.12));ctx.beginPath();ctx.moveTo(x,y(k.high));ctx.lineTo(x,y(k.low));ctx.stroke();
      const topY=y(Math.max(k.open,k.close)),botY=y(Math.min(k.open,k.close));ctx.fillStyle=col;ctx.fillRect(x-body/2,topY,body,Math.max(1.5,botY-topY));
    });
    // Swing structure: genuine local pivots, deliberately sparse
    const highs=[],lows=[];
    for(let i=2;i<data.length-2;i++){
      if(data[i].high>=data[i-1].high&&data[i].high>=data[i+1].high&&data[i].high>=data[i-2].high&&data[i].high>=data[i+2].high)highs.push(i);
      if(data[i].low<=data[i-1].low&&data[i].low<=data[i+1].low&&data[i].low<=data[i-2].low&&data[i].low<=data[i+2].low)lows.push(i);
    }
    const sh=highs.slice(-3),sl=lows.slice(-3);
    const label=(x,yv,text,col)=>{ctx.fillStyle=col;ctx.font='800 9px system-ui,-apple-system,Segoe UI,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,yv);};
    sh.slice(-2).forEach((idx,j)=>label(left+(idx+.5)*step,y(data[idx].high)-12,j===sh.slice(-2).length-1?'LH':'HH',C.down));
    sl.slice(-2).forEach((idx,j)=>label(left+(idx+.5)*step,y(data[idx].low)+12,j===sl.slice(-2).length-1?'HL':'LL',C.up));
    // Support/resistance zones based on recent pivots
    if(sh.length){const level=Math.max(...sh.map(i=>data[i].high)),yy=y(level);ctx.fillStyle='rgba(255,92,120,.055)';ctx.fillRect(left,yy-5,pw,10);ctx.strokeStyle=C.down;ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(left+pw,yy);ctx.stroke();ctx.setLineDash([]);label(left+pw-35,yy-9,'RES',C.down);}
    if(sl.length){const level=Math.min(...sl.map(i=>data[i].low)),yy=y(level);ctx.fillStyle='rgba(53,226,139,.055)';ctx.fillRect(left,yy-5,pw,10);ctx.strokeStyle=C.up;ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(left+pw,yy);ctx.stroke();ctx.setLineDash([]);label(left+pw-35,yy+9,'SUP',C.up);}
    // Current/live price
    const last=data[data.length-1].close,py=y(last);ctx.strokeStyle=C.gold;ctx.lineWidth=1.3;ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(left,py);ctx.lineTo(left+pw,py);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=C.gold;ctx.fillRect(left+pw+3,py-10,64,20);ctx.fillStyle='#17130a';ctx.font='800 10px system-ui,-apple-system,Segoe UI,sans-serif';ctx.textAlign='left';ctx.fillText(fmt(last),left+pw+8,py+3);
    // Time axis
    ctx.fillStyle=C.axis;ctx.font='9px system-ui,-apple-system,Segoe UI,sans-serif';ctx.textAlign='center';ctx.textBaseline='alphabetic';
    [0,.33,.66,1].forEach(r=>{const idx=Math.min(data.length-1,Math.round((data.length-1)*r)),k=data[idx];if(!k)return;const dt=new Date(k.time);const label=Number.isNaN(dt.getTime())?'':dt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});ctx.fillText(label,left+(idx+.5)*step,h-9);});
    // Footer state
    ctx.textAlign='left';ctx.fillStyle=C.muted;ctx.font='9px system-ui,-apple-system,Segoe UI,sans-serif';ctx.fillText(`${data.length} candles · ${start+1}-${start+data.length}`,left,h-9);
  }
  window.draw=draw;
  function redraw(){draw();}
  window.addEventListener('resize',redraw);
  setInterval(redraw,1000);
  // Repaint after live tick / candle formation without replacing the existing stream logic.
  ['pe:tick','pe:candle','market:update'].forEach(ev=>window.addEventListener(ev,redraw));
  setTimeout(draw,50);
})();
