/* PriceEdge production hardening: live telemetry, mobile polish, safe states, risk/journal UX. */
(()=>{
  'use strict';
  if(window.__PRICEEDGE_HARDENING__) return;
  window.__PRICEEDGE_HARDENING__=true;
  const $=id=>document.getElementById(id);
  const set=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n.toFixed(2):'—';};
  let lastUiState='';

  function style(){
    if($('peHardeningStyle'))return;
    const s=document.createElement('style');s.id='peHardeningStyle';s.textContent=`
      .pe-live-good{color:#4ade80!important}.pe-live-warn{color:#f5c451!important}.pe-live-bad{color:#fb7185!important}
      .pe-data-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;background:#0c1322;border:1px solid #26334f;font-size:9px;font-weight:800;letter-spacing:.2px}
      .pe-validation{font-size:10px;color:#fb7185;min-height:14px;margin-top:-6px;margin-bottom:5px}.pe-valid{border-color:#4ade80!important}.pe-invalid{border-color:#fb7185!important}
      @media(max-width:500px){.pe-data-badge{font-size:8px;padding:4px 7px}button,input,select,textarea{font-size:16px!important}}
    `;document.head.appendChild(s);
  }
  function getLive(){return window.__priceEdgeLive||null;}
  function getCandles(){const l=getLive();if(l&&typeof l.getCandles==='function')return l.getCandles()||[];return Array.isArray(window.candles)?window.candles:[];}
  function ensureFreshness(){
    const tickState=$('peTickState'),stream=$('stream'),dot=$('dot'),streamText=$('streamText'),live=getLive();
    const t=live&&typeof live.getTime==='function'?Number(live.getTime()):0,p=live&&typeof live.getPrice==='function'?Number(live.getPrice()):NaN,age=t?Math.max(0,Math.floor((Date.now()-t)/1000)):Infinity;
    let state='waiting',label='WAITING FOR LIVE DATA',cls='pe-live-warn';
    if(Number.isFinite(p)&&age<=8){state='live';label='LIVE';cls='pe-live-good';}
    else if(Number.isFinite(p)&&age<=30){state='stale';label=`STALE · ${age}s`;cls='pe-live-warn';}
    else if(Number.isFinite(p)){state='offline';label='DATA OFFLINE';cls='pe-live-bad';}
    if(lastUiState!==state){lastUiState=state;if(stream)stream.className='status '+(state==='live'?'':'off');if(dot)dot.className='dot '+(state==='live'?'':'off');}
    if(streamText)streamText.textContent=state==='live'?'LIVE TICK STREAM':state==='stale'?`LIVE DATA DELAYED · ${age}s`:'LIVE STREAM UNAVAILABLE';
    if(tickState){tickState.textContent=Number.isFinite(age)?(age<=8?'LIVE TICK RECEIVED':`LAST TICK ${age}s AGO`):label;tickState.className=cls;}
    const ageEl=$('tickAge');if(ageEl)ageEl.textContent=Number.isFinite(age)?(age===0?'just now':`${age}s ago`):'waiting';
    const badge=$('peDataBadge');if(badge){badge.textContent=label;badge.className='pe-data-badge '+cls;}
    updateOhlc();
  }
  function updateOhlc(){const a=getCandles();if(!a.length)return;const c=a[a.length-1];set('peOpen',num(c.open));set('peHigh',num(c.high));set('peLow',num(c.low));set('peClose',num(c.close));const live=getLive(),p=live&&typeof live.getPrice==='function'?Number(live.getPrice()):Number(c.close);if(Number.isFinite(p))set('peTick',num(p));}
  function ensureDataBadge(){if($('peDataBadge'))return;const ticker=document.querySelector('.ticker');if(!ticker)return;const b=document.createElement('span');b.id='peDataBadge';b.className='pe-data-badge pe-live-warn';b.textContent='WAITING FOR LIVE DATA';ticker.appendChild(b);}
  function validateRisk(){['rb','rp','re','rs','rc'].forEach(id=>{const e=$(id);if(!e)return;e.addEventListener('input',()=>{e.classList.remove('pe-invalid');e.classList.toggle('pe-valid',e.value!==''&&Number(e.value)>0);});});const rp=$('rp');if(rp)rp.addEventListener('change',()=>{if(Number(rp.value)>2){rp.value=2;rp.classList.add('pe-invalid');}});}
  function validateJournal(){['je','jstop','jt'].forEach(id=>{const e=$(id);if(!e)return;e.addEventListener('input',()=>e.classList.remove('pe-invalid'));});document.addEventListener('click',e=>{if(e.target?.textContent?.trim()!=='Save Trade')return;const entry=Number($('je')?.value),stop=Number($('jstop')?.value),target=Number($('jt')?.value);if(!Number.isFinite(entry)||!Number.isFinite(stop)||!Number.isFinite(target))return;const side=$('js')?.value||'BUY',valid=side==='BUY'?stop<entry&&target>entry:stop>entry&&target<entry;if(!valid){e.preventDefault();e.stopImmediatePropagation();['je','jstop','jt'].forEach(id=>$(id)?.classList.add('pe-invalid'));alert('Check Entry, Stop and Target. The levels must match the selected BUY/SELL direction.');}},true);}
  function connectionRecovery(){document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>window.dispatchEvent(new Event('resize')),100);});window.addEventListener('online',()=>{if($('streamText'))$('streamText').textContent='RECONNECTING LIVE DATA…';});window.addEventListener('offline',()=>{if($('streamText'))$('streamText').textContent='DEVICE OFFLINE';});}
  function start(){style();ensureDataBadge();validateRisk();validateJournal();connectionRecovery();ensureFreshness();setInterval(ensureFreshness,1000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
