/* PriceEdge market alerts: one stable client, service-worker notifications, and resilient live-tick monitoring. */
(() => {
  'use strict';
  if (window.__priceEdgeNotifications) return;
  window.__priceEdgeNotifications = true;

  const $ = id => document.getElementById(id);
  const KEY = 'pe_alert_settings_v3';
  const DEFAULTS = { enabled:false, high:'', low:'', breakout:true, decision:true };
  let settings = load(), registration = null;
  let lastPrice = null, lastDecision = null, lastBreakout = null, lastAlertAt = {};
  let ws = null, reconnectTimer = null, analysisBusy = false, initialized = false;

  function load(){
    try { return {...DEFAULTS,...JSON.parse(localStorage.getItem(KEY)||'{}')}; }
    catch(_) { return {...DEFAULTS}; }
  }
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch(_) {} }
  function throttle(key, ms=60000){ const now=Date.now(); if(now-(lastAlertAt[key]||0)<ms)return false; lastAlertAt[key]=now; return true; }

  async function setupServiceWorker(){
    if(!window.isSecureContext || !('serviceWorker' in navigator)) return false;
    try {
      registration = await navigator.serviceWorker.register('/priceedge-sw.js',{scope:'/' ,updateViaCache:'none'});
      await navigator.serviceWorker.ready;
      return Boolean(registration.active || registration.waiting || registration.installing);
    } catch(e) {
      registration=null;
      setStatus(`Notification service unavailable: ${e?.message||'service worker registration failed.'}`, false);
      return false;
    }
  }

  async function notify(title, body, key){
    if(!settings.enabled || !('Notification' in window) || Notification.permission!=='granted' || !throttle(key)) return;
    try {
      if(!registration) await setupServiceWorker();
      if(registration?.showNotification) {
        await registration.showNotification(title,{body,tag:`priceedge-${key}`,renotify:true});
      } else if(typeof Notification === 'function') {
        new Notification(title,{body,tag:`priceedge-${key}`,renotify:true});
      } else return;
      setStatus(`${title}: ${body}`, true);
    } catch(e) {
      setStatus(`Notification failed: ${e?.message||'unknown error.'}`, false);
    }
  }

  function setStatus(message, success){
    const box=$('peAlertStatus');
    if(!box)return;
    box.textContent=message;
    box.className=`notice ${success?'success':'danger'}`;
  }

  async function requestPermission(){
    if(!window.isSecureContext){ setStatus('Notifications require HTTPS.', false); return; }
    if(!('Notification' in window)){ setStatus('This browser does not support notifications.', false); return; }
    const standalone=window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone===true;
    if(/iPhone|iPad|iPod/i.test(navigator.userAgent) && !standalone){
      setStatus('On iPhone/iPad, add PriceEdge to the Home Screen first, then enable notifications from the installed app.', false);
      return;
    }
    const sw=await setupServiceWorker();
    if(!sw){ setStatus('PriceEdge notification service could not start. Reload the app and try again.', false); return; }
    try {
      const p=await Notification.requestPermission();
      if(p==='granted'){
        settings.enabled=true; save(); render();
        await notify('PriceEdge notifications enabled','Alert system is ready.','enabled-test');
      } else {
        settings.enabled=false; save(); render();
        setStatus(p==='denied'?'Notifications are blocked in browser settings.':'Notification permission was not granted.', false);
      }
    } catch(e) { settings.enabled=false; save(); render(); setStatus(`Permission request failed: ${e?.message||'unknown error.'}`, false); }
  }

  function createCard(){
    if($('peAlerts')) return;
    const signal=$('signal'); if(!signal) return;
    const card=document.createElement('div'); card.id='peAlerts'; card.className='card'; card.style.marginTop='14px';
    card.innerHTML=`<h3>Price Alerts</h3><p class="muted small">Get alerts when XAU/USD reaches your levels, breaks a key level, or PriceEdge confirms BUY/SELL.</p><div class="rows"><div class="metric"><span>Upper price alert</span><input id="peAlertHigh" type="number" step="0.01" placeholder="e.g. 3500"></div><div class="metric"><span>Lower price alert</span><input id="peAlertLow" type="number" step="0.01" placeholder="e.g. 3400"></div></div><div class="controls" style="margin-top:9px"><button id="peAlertEnable">Enable notifications</button><button id="peAlertSave">Save levels</button><button id="peAlertReset">Reset</button></div><div class="rows" style="margin-top:9px"><label class="metric"><span><input id="peAlertBreakout" type="checkbox" style="width:auto;margin:0 6px 0 0">Breakout alerts</span></label><label class="metric"><span><input id="peAlertDecision" type="checkbox" style="width:auto;margin:0 6px 0 0">BUY/SELL decision alerts</span></label></div><div id="peAlertStatus" class="notice" style="margin-top:9px">Notifications are off.</div>`;
    signal.parentNode.parentNode.insertBefore(card, signal.parentNode.nextSibling);
    $('peAlertHigh').value=settings.high; $('peAlertLow').value=settings.low; $('peAlertBreakout').checked=!!settings.breakout; $('peAlertDecision').checked=!!settings.decision;
    $('peAlertEnable').onclick=requestPermission;
    $('peAlertSave').onclick=()=>{settings.high=$('peAlertHigh').value;settings.low=$('peAlertLow').value;settings.breakout=$('peAlertBreakout').checked;settings.decision=$('peAlertDecision').checked;save();render();};
    $('peAlertReset').onclick=()=>{settings={...DEFAULTS};save();$('peAlertHigh').value='';$('peAlertLow').value='';$('peAlertBreakout').checked=true;$('peAlertDecision').checked=true;render();};
    render();
  }

  function render(){
    const b=$('peAlertStatus'); if(!b)return;
    const granted='Notification' in window&&Notification.permission==='granted';
    if(settings.enabled&&granted){ b.textContent='Notifications enabled.'; b.className='notice success'; }
    else { b.textContent='Notifications are off.'; b.className='notice'; }
  }

  function checkPrice(price){
    const high=Number(settings.high),low=Number(settings.low); if(!Number.isFinite(price))return;
    if(Number.isFinite(high)&&lastPrice!==null&&lastPrice<high&&price>=high) notify('PriceEdge — Gold reached your upper level',`XAU/USD reached ${price.toFixed(2)} (target ${high.toFixed(2)}).`,'price-high');
    if(Number.isFinite(low)&&lastPrice!==null&&lastPrice>low&&price<=low) notify('PriceEdge — Gold reached your lower level',`XAU/USD reached ${price.toFixed(2)} (target ${low.toFixed(2)}).`,'price-low');
    lastPrice=price;
  }

  function checkBreakout(a,price){
    if(!settings.breakout||!a?.ready||!Number.isFinite(price))return;
    const r=Number(a.resistance),s=Number(a.support);
    if(lastPrice!==null&&Number.isFinite(r)&&lastPrice<=r&&price>r&&lastBreakout!=='bull'){ lastBreakout='bull'; notify('PriceEdge — Bullish breakout',`XAU/USD broke resistance near ${r.toFixed(2)}.`,'breakout-bull'); }
    if(lastPrice!==null&&Number.isFinite(s)&&lastPrice>=s&&price<s&&lastBreakout!=='bear'){ lastBreakout='bear'; notify('PriceEdge — Bearish breakout',`XAU/USD broke support near ${s.toFixed(2)}.`,'breakout-bear'); }
  }

  async function checkDecision(){
    if(analysisBusy)return; analysisBusy=true;
    try{
      const symbol=$('symbol')?.value||'XAU/USD';
      const r=await fetch(`/api/analysis?symbol=${encodeURIComponent(symbol)}`,{cache:'no-store'});
      const d=await r.json();
      if(!r.ok||!d.m5?.ready)return;
      const a=d.m5,action=a.action,price=Number(a.price);
      checkBreakout(a,price);
      if(settings.decision&&(action==='BUY'||action==='SELL')&&action!==lastDecision){
        lastDecision=action;
        notify(`PriceEdge — ${action} decision`,`${symbol} has a ${action} market decision. Quality ${a.setupQuality}%, structure ${a.structure}, momentum ${a.momentum}.`,'decision-'+action.toLowerCase());
      }
      if(action!=='BUY'&&action!=='SELL')lastDecision=null;
    } catch(_){} finally{analysisBusy=false;}
  }

  function scheduleReconnect(){
    if(reconnectTimer)return;
    reconnectTimer=setTimeout(()=>{reconnectTimer=null;connect();},5000);
  }

  function connect(){
    if(ws && (ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING))return;
    try{
      const proto=location.protocol==='https:'?'wss':'ws';
      ws=new WebSocket(`${proto}://${location.host}/ws/live`);
      ws.onmessage=e=>{try{const d=JSON.parse(e.data);if(d.type==='tick'&&d.symbol===($('symbol')?.value||'XAU/USD'))checkPrice(Number(d.price));}catch(_){}};
      ws.onclose=()=>{ws=null;scheduleReconnect();};
      ws.onerror=()=>{try{ws?.close();}catch(_) {}};
    }catch(_){ws=null;scheduleReconnect();}
  }

  async function init(){
    if(initialized)return;
    initialized=true;
    await setupServiceWorker();
    createCard();
    connect();
    setTimeout(checkDecision,2500);
    setInterval(checkDecision,15000);
    $('symbol')?.addEventListener('change',()=>{lastPrice=null;lastDecision=null;lastBreakout=null;});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')connect();});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
