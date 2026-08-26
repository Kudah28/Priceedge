/* PriceEdge Phase 2 decision intelligence display. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const text = (id, value) => { const el = $(id); if (el) el.textContent = value ?? '—'; };
  let decisionTimer = null, decisionBusy = false;

  function setSignal(kind, title, message, detail) {
    const el = $('signal'); if (!el) return;
    el.classList.remove('buy','sell');
    if (kind === 'buy') el.classList.add('buy');
    if (kind === 'sell') el.classList.add('sell');
    el.innerHTML = `<h3>${title}</h3><span class="muted">${message}</span>${detail ? `<p class="muted pe-decision-detail">${detail}</p>` : ''}`;
  }

  function ensureIntelCard() {
    if ($('peDecisionIntel')) return $('peDecisionIntel');
    const signal = $('signal'); if (!signal) return null;
    const card = document.createElement('div');
    card.id = 'peDecisionIntel'; card.className = 'rows';
    card.innerHTML = `<div class="metric"><span>Why</span><b id="peWhy">—</b></div><div class="metric"><span>Confirmation</span><b id="peGate">—</b></div><div class="metric"><span>Next trigger</span><b id="peTrigger">—</b></div><div class="metric"><span>Next step</span><b id="peNext">—</b></div>`;
    signal.parentNode.insertBefore(card, signal.nextSibling);
    return card;
  }

  function renderBasic(a) {
    if (!a?.ready) return;
    text('bias', a.trend); text('trend', a.trend); text('structure', a.structure); text('momentum', a.momentum); text('quality', `${a.setupQuality}%`); text('support', Number(a.support).toFixed(2)); text('resistance', Number(a.resistance).toFixed(2));
    if (a.action === 'BUY') setSignal('buy','BUY WATCH','Bullish market conditions detected.',`${a.structure} · ${a.momentum} momentum · ${a.setupQuality}% quality. Waiting for full entry confirmation.`);
    else if (a.action === 'SELL') setSignal('sell','SELL WATCH','Bearish market conditions detected.',`${a.structure} · ${a.momentum} momentum · ${a.setupQuality}% quality. Waiting for full entry confirmation.`);
    else setSignal('','WAIT','No clear directional edge is confirmed yet.',`${a.structure} · ${a.momentum} · ${a.setupQuality}% quality.`);
  }

  function renderIntel(m) {
    const e = m?.decision?.explanation; if (!e) return;
    ensureIntelCard(); text('peWhy', e.summary); text('peGate', `${e.gate?.passed ?? 0}/${e.gate?.total ?? 8} gates (${e.gate?.score ?? 0}%)`);
    const t = e.trigger; text('peTrigger', t ? `${t.type} @ ${Number(t.price).toFixed(2)}` : 'Not defined yet'); text('peNext', e.nextStep || 'Wait for confirmation');
    const action = String(m.action || 'WAIT'); const factors = Array.isArray(e.factors) ? e.factors.slice(0,4).join(' · ') : '';
    if (action === 'BUY') setSignal('buy','BUY SETUP','Full confirmation gates passed.',`${e.summary} ${factors}`);
    else if (action === 'SELL') setSignal('sell','SELL SETUP','Full confirmation gates passed.',`${e.summary} ${factors}`);
    else if (action === 'BUY WATCH') setSignal('buy','BUY WATCH','Bullish multi-timeframe conditions detected.',`${e.summary} ${factors}`);
    else if (action === 'SELL WATCH') setSignal('sell','SELL WATCH','Bearish multi-timeframe conditions detected.',`${e.summary} ${factors}`);
    else setSignal('','WAIT',e.summary || 'No clear directional edge is confirmed yet.',factors);
  }

  async function refreshDecision() {
    if (decisionBusy) return; decisionBusy = true;
    try {
      const symbol = $('symbol')?.value || 'XAU/USD';
      const r = await fetch(`/api/analysis?symbol=${encodeURIComponent(symbol)}`, {cache:'no-store'}); if (!r.ok) return;
      const d = await r.json(); renderBasic(d.m5);
      const token = localStorage.getItem('pe_token'); if (!token) return;
      const mr = await fetch(`/api/multi-analysis?symbol=${encodeURIComponent(symbol)}`, {headers:{Authorization:`Bearer ${token}`},cache:'no-store'}); if (!mr.ok) return;
      const m = await mr.json(); text('confluence', `${m.confluenceCount}/5`); renderIntel(m);
    } catch (_) {} finally { decisionBusy = false; }
  }

  function patchStyles() {
    if ($('#peDecisionFixStyle')) return;
    const s = document.createElement('style'); s.id = 'peDecisionFixStyle';
    s.textContent = `.pe-decision-detail{margin:8px 0 0;font-size:11px;line-height:1.45}.signal.buy{border-color:#4ade80}.signal.sell{border-color:#fb7185}`;
    document.head.appendChild(s);
  }

  function removeHeaderArtifact() {
    const clean = () => {
      document.querySelectorAll('header img').forEach(img => {
        const bad = !img.getAttribute('src') || img.complete && img.naturalWidth === 0;
        if (bad) img.remove();
      });
      document.querySelectorAll('header button, header a').forEach(el => {
        const label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
        if (label === '?' || label === '❓' || label.toLowerCase() === 'help') el.remove();
      });
    };
    clean();
    window.addEventListener('load', clean, {once:true});
    setTimeout(clean, 300);
    setTimeout(clean, 1200);
    const header = document.querySelector('header');
    if (header) new MutationObserver(clean).observe(header, {childList:true,subtree:true});
  }

  function start() {
    patchStyles();
    ensureIntelCard();
    removeHeaderArtifact();
    refreshDecision();
    if (decisionTimer) clearInterval(decisionTimer);
    decisionTimer = setInterval(refreshDecision, 15000);
  }
  start();
  window.addEventListener('priceedge:market-updated', refreshDecision);
  document.addEventListener('change', e => { if (e.target?.id === 'symbol') refreshDecision(); });

  // Cybertruck safeguard: guarantee the professional live-tick client is loaded.
  function ensureLiveTicks() {
    if (document.querySelector('script[src="/live-ticks.js"]')) return;
    const s = document.createElement('script');
    s.src = '/live-ticks.js?v=cybertruck1';
    s.async = false;
    document.body.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureLiveTicks, { once:true });
  else ensureLiveTicks();

  // CYBERTRUCK CHART RESUME GUARD
  // Returning to the PWA/browser can restore a canvas with stale dimensions.
  // Repaint after visibility/focus/pageshow and after layout changes, without
  // creating a second render loop or changing the user's candle position.
  let resumeTimer = null;
  let resumeBusy = false;
  let lastCanvasW = 0;
  let lastCanvasH = 0;

  function stableChartResume(forceData = false) {
    if (resumeBusy) return;
    resumeBusy = true;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(async () => {
      try {
        const chart = $('chart');
        if (!chart) return;
        const wrap = chart.closest('.chartwrap');
        if (!wrap || wrap.clientWidth < 1 || wrap.clientHeight < 1) return;

        // Repaint only after the browser has restored the layout.
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (typeof draw === 'function') draw();

        // If the app was backgrounded long enough for the market to advance,
        // refresh once. loadCandles() resets the data cleanly instead of appending
        // duplicate candles, preventing clustered candles after resume.
        if (forceData && typeof loadCandles === 'function') await loadCandles();
      } finally {
        resumeBusy = false;
      }
    }, 80);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') stableChartResume(true);
  });
  window.addEventListener('pageshow', () => stableChartResume(true));
  window.addEventListener('focus', () => stableChartResume(false));

  if ('ResizeObserver' in window) {
    const observeChart = () => {
      const wrap = $('chart')?.closest('.chartwrap');
      if (!wrap) return;
      new ResizeObserver(() => {
        const w = wrap.clientWidth, h = wrap.clientHeight;
        if (w !== lastCanvasW || h !== lastCanvasH) {
          lastCanvasW = w; lastCanvasH = h;
          stableChartResume(false);
        }
      }).observe(wrap);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeChart, {once:true});
    else observeChart();
  }

  // Keep the chart state usable when iOS suspends/resumes the standalone PWA.
  // The view position is preserved; market data is refreshed only on resume.
  const originalDraw = window.draw;
  if (typeof originalDraw === 'function') {
    window.draw = function() {
      try { return originalDraw.apply(this, arguments); }
      finally {
        const c = $('chart');
        if (c) { lastCanvasW = c.clientWidth; lastCanvasH = c.clientHeight; }
      }
    };
  }
})();
