/* PriceEdge live-tick UI enhancement. The market-data key remains server-side. */
(() => {
  'use strict';
  let socket = null;
  let retry = null;
  let lastTickAt = 0;
  let lastPrice = null;

  const $ = id => document.getElementById(id);
  const fmt = v => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '—';

  function setStatus(text, ok) {
    const stream = $('stream');
    const dot = $('dot');
    const textEl = $('streamText');
    if (stream) { stream.textContent = text; stream.className = 'status' + (ok ? '' : ' off'); }
    if (dot) dot.className = 'dot' + (ok ? '' : ' off');
    if (textEl) textEl.textContent = text;
  }

  function getCandles() {
    try { if (typeof candles !== 'undefined' && Array.isArray(candles)) return candles; } catch (_) {}
    return Array.isArray(window.candles) ? window.candles : [];
  }

  function getTick() {
    try { if (typeof tick !== 'undefined' && tick) return tick; } catch (_) {}
    return window.tick || null;
  }

  function ensurePanel() {
    if ($('liveTickPanel')) return;
    const wrap = $('chart')?.parentElement;
    if (!wrap) return;
    const p = document.createElement('div');
    p.id = 'liveTickPanel';
    p.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px;padding:9px;background:#0c1322;border:1px solid #26334f;border-radius:10px;font-size:10px;font-variant-numeric:tabular-nums';
    p.innerHTML = `
      <div><span style="display:block;color:#71809c">TICK</span><b id="ltPrice">—</b></div>
      <div><span style="display:block;color:#71809c">OPEN</span><b id="ltOpen">—</b></div>
      <div><span style="display:block;color:#71809c">HIGH</span><b id="ltHigh">—</b></div>
      <div><span style="display:block;color:#71809c">LOW</span><b id="ltLow">—</b></div>
      <div><span style="display:block;color:#71809c">CLOSE</span><b id="ltClose">—</b></div>
      <div style="grid-column:1/-1;display:flex;justify-content:space-between;gap:8px;color:#8e9cb7;margin-top:2px">
        <span id="ltMove">WAITING FOR LIVE TICK</span><span id="ltTimer" style="color:#f5c451">5:00</span>
      </div>`;
    wrap.insertAdjacentElement('afterend', p);
  }

  function render() {
    ensurePanel();
    const list = getCandles();
    const c = list.at(-1);
    const t = getTick();
    const price = Number(t?.price ?? c?.close);
    if (!c || !Number.isFinite(price)) return;

    $('ltPrice') && ($('ltPrice').textContent = fmt(price));
    $('ltOpen') && ($('ltOpen').textContent = fmt(c.open));
    $('ltHigh') && ($('ltHigh').textContent = fmt(c.high));
    $('ltLow') && ($('ltLow').textContent = fmt(c.low));
    $('ltClose') && ($('ltClose').textContent = fmt(c.close));

    if (lastPrice != null && price !== lastPrice) {
      const d = price - lastPrice;
      const move = $('ltMove');
      if (move) { move.textContent = `${d > 0 ? '▲ +' : '▼ '}${d.toFixed(2)} LIVE TICK`; move.style.color = d > 0 ? '#4ade80' : '#fb7185'; }
    }
    lastPrice = price;

    const start = Date.parse(c.datetime);
    if (Number.isFinite(start)) {
      const bucket = Math.floor(start / 300000) * 300000;
      const remain = Math.max(0, Math.ceil((bucket + 300000 - Date.now()) / 1000));
      const mm = Math.floor(remain / 60);
      const ss = String(remain % 60).padStart(2, '0');
      if ($('ltTimer')) $('ltTimer').textContent = `CANDLE CLOSES ${mm}:${ss}`;
    }

    if (t?.receivedAt) lastTickAt = Number(t.receivedAt) || lastTickAt;
    const age = lastTickAt ? Math.floor((Date.now() - lastTickAt) / 1000) : null;
    if ($('tickAge') && age != null) $('tickAge').textContent = `tick ${age}s ago`;
  }

  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${proto}://${location.host}/ws/live`);
    socket.onopen = () => setStatus('LIVE TICK STREAM', true);
    socket.onmessage = e => {
      let d; try { d = JSON.parse(e.data); } catch (_) { return; }
      if (d.type === 'status') {
        if (d.status === 'connected') setStatus('LIVE TICK STREAM', true);
        else if (d.status === 'error' || d.status === 'disabled') setStatus(d.message || 'LIVE STREAM UNAVAILABLE', false);
        else setStatus(d.message || 'RECONNECTING LIVE TICKS…', false);
      }
      if (d.type === 'tick' && d.symbol === 'XAU/USD') {
        try { if (typeof tick !== 'undefined') tick = d; } catch (_) { window.tick = d; }
        lastTickAt = Date.now();
        setStatus('LIVE TICK STREAM', true);
        render();
        if (typeof draw === 'function') draw();
      }
    };
    socket.onerror = () => setStatus('LIVE TICK ERROR', false);
    socket.onclose = () => {
      setStatus('RECONNECTING LIVE TICKS…', false);
      clearTimeout(retry);
      retry = setTimeout(connect, 3000);
    };
  }

  ensurePanel();
  connect();
  setInterval(render, 1000);
})();
