/* PriceEdge Professional Chart Tools
   Trendline, horizontal levels, zones/highlighter, text notes, Fibonacci,
   risk/reward and buy/sell markers. Canvas overlay; drawings persist locally.
*/
(function(){
  const chart=document.getElementById('chart');
  if(!chart)return;
  const KEY='priceedge_drawings_v1';
  let drawings=[];
  try{drawings=JSON.parse(localStorage.getItem(KEY)||'[]')}catch(_){drawings=[]}
  let tool='select', start=null, draft=null;
  const wrap=chart.closest('.chartwrap')||chart.parentElement;

  const style=document.createElement('style');style.textContent=`
    #peDrawingTools{display:flex;flex-wrap:wrap;gap:6px;padding:8px 0}
    #peDrawingTools button{border:1px solid #31405f;background:#0c1322;color:#dce5fa;border-radius:8px;padding:7px 9px;font-size:11px;font-weight:800}
    #peDrawingTools button.on{border-color:#f5c451;color:#f5c451;background:#17130a}
    #peDrawingTools .danger{color:#ff8b8b}
    .pe-tool-hint{font-size:10px;color:#8e9cb7;padding:2px 0 5px}
  `;document.head.appendChild(style);
  const bar=document.createElement('div');bar.id='peDrawingTools';
  bar.innerHTML=`<button data-t="select" class="on">↖ Select</button><button data-t="trend">↗ Trendline</button><button data-t="hline">━ Level</button><button data-t="zone">▭ Zone</button><button data-t="fib">⌁ Fib</button><button data-t="rr">⚖ R:R</button><button data-t="buy">🟢 Buy</button><button data-t="sell">🔴 Sell</button><button data-t="text">T Note</button><button data-t="clear" class="danger">Clear</button>`;
  const hint=document.createElement('div');hint.className='pe-tool-hint';hint.textContent='Choose a tool, then drag on the chart. Drawings are saved on this device.';
  wrap.parentElement.insertBefore(bar,wrap);wrap.parentElement.insertBefore(hint,wrap);

  function save(){localStorage.setItem(KEY,JSON.stringify(drawings))}
  function rect(){return chart.getBoundingClientRect()}
  function pt(e){const r=rect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
  function redraw(){ if(typeof window.draw==='function')window.draw(); requestAnimationFrame(overlay) }
  function overlay(){
    const r=chart.getBoundingClientRect();
    let c=document.getElementById('peDrawingCanvas');
    if(!c){c=document.createElement('canvas');c.id='peDrawingCanvas';c.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4';wrap.appendChild(c)}
    c.width=Math.max(1,Math.round(r.width*devicePixelRatio));c.height=Math.max(1,Math.round(r.height*devicePixelRatio));
    const x=c.getContext('2d');x.scale(devicePixelRatio,devicePixelRatio);x.clearRect(0,0,r.width,r.height);
    x.lineWidth=2;x.font='700 11px system-ui';
    const line=(a,b,dash=[])=>{x.setLineDash(dash);x.beginPath();x.moveTo(a.x,a.y);x.lineTo(b.x,b.y);x.stroke();x.setLineDash([])};
    drawings.forEach(d=>{
      x.strokeStyle=d.color||'#f5c451';x.fillStyle=(d.color||'#f5c451')+'22';
      if(d.type==='trend')line(d.a,d.b,[6,4]);
      else if(d.type==='hline'){line({x:0,y:d.a.y},{x:r.width,y:d.a.y},[7,4]);x.fillText((d.price||'LEVEL'),8,Math.max(12,d.a.y-5))}
      else if(d.type==='zone'){x.fillRect(d.a.x,d.a.y,d.b.x-d.a.x,d.b.y-d.a.y);x.strokeRect(d.a.x,d.a.y,d.b.x-d.a.x,d.b.y-d.a.y)}
      else if(d.type==='fib'){const ys=[d.a.y,d.a.y+(d.b.y-d.a.y)*.382,d.a.y+(d.b.y-d.a.y)*.5,d.a.y+(d.b.y-d.a.y)*.618,d.b.y];['0','0.382','0.5','0.618','1'].forEach((lab,i)=>{line({x:0,y:ys[i]},{x:r.width,y:ys[i]},[4,5]);x.fillText(lab,8,ys[i]-4)})}
      else if(d.type==='rr'){x.fillRect(d.a.x,Math.min(d.a.y,d.b.y),d.b.x-d.a.x,Math.abs(d.b.y-d.a.y));x.strokeRect(d.a.x,Math.min(d.a.y,d.b.y),d.b.x-d.a.x,Math.abs(d.b.y-d.a.y));x.fillText('R:R '+(d.rr||'—'),d.a.x+6,Math.min(d.a.y,d.b.y)+14)}
      else if(d.type==='buy'||d.type==='sell'){const up=d.type==='buy',px=d.a.x,py=d.a.y;x.beginPath();x.moveTo(px,py+(up?10:-10));x.lineTo(px-7,py+(up?-2:2));x.lineTo(px+7,py+(up?-2:2));x.closePath();x.fill();x.fillText(up?'BUY':'SELL',px+9,py+4)}
      else if(d.type==='text')x.fillText(d.text||'Note',d.a.x,d.a.y);
    });
    if(draft){x.strokeStyle='#67e8f9';x.setLineDash([4,4]);if(draft.type==='trend'||draft.type==='fib'||draft.type==='rr')line(draft.a,draft.b,[4,4]);else if(draft.type==='zone'){x.strokeRect(draft.a.x,draft.a.y,draft.b.x-draft.a.x,draft.b.y-draft.a.y)}else if(draft.type==='hline')line({x:0,y:draft.a.y},{x:r.width,y:draft.a.y},[4,4]);x.setLineDash([])}
  }
  function setTool(t){tool=t;bar.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));if(t==='clear'){drawings=[];save();tool='select';bar.querySelector('[data-t="select"]').classList.add('on');redraw()}}
  bar.querySelectorAll('button').forEach(b=>b.onclick=()=>setTool(b.dataset.t));
  chart.style.position='relative';chart.addEventListener('pointerdown',e=>{if(tool==='select')return;start=pt(e);draft={type:tool,a:start,b:start};if(tool==='buy'||tool==='sell'){drawings.push({type:tool,a:start});draft=null;save();redraw()};e.preventDefault()});
  chart.addEventListener('pointermove',e=>{if(!draft)return;draft.b=pt(e);overlay()});
  chart.addEventListener('pointerup',e=>{if(!draft)return;draft.b=pt(e);if(draft.type==='text'){const text=prompt('Chart note:');if(text)draft.text=text;else{draft=null;overlay();return}}if(draft.type==='rr'){draft.rr='drag';}if(draft.type==='hline')draft.price='LEVEL';drawings.push(draft);draft=null;save();redraw()});
  window.addEventListener('resize',overlay);setInterval(overlay,1500);overlay();
})();
