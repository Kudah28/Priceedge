/* PriceEdge dashboard stability + decision display layer. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const text = (id, value) => { const el = $(id); if (el) el.textContent = value ?? '—'; };
  let decisionTimer = null;
  let decisionBusy = false;

  function setSignal(kind, title, message, detail) {
    const el = $('signal');
    if (!el) return;
    el.classList.remove('buy', 'sell');
    if (kind === 'buy') el.classList.add('buy');
    if (kind === 'sell') el.classList.add('sell');
    el.innerHTML = `<h3>${title}</h3><span class="muted">${message}</span>${detail ? `<p class="muted pe-decision-detail">${detail}</p>` : ''}`;
  }

  function renderBasicDecision(a) {
    if (!a?.ready) return;
    text('bias', a.trend);
    text('trend', a.trend);
    text('structure', a.structure);
    text('momentum', a.momentum);
    text('quality', `${a.setupQuality}%`);
    text('support', Number(a.support).toFixed(2));
    text('resistance', Number(a.resistance).toFixed(2));

    const direction = a.trend === 'Bullish' ? 'buy' : a.trend === 'Bearish' ? 'sell' : null;
    const action = a.action;
    if (action === 'BUY') {
      setSignal('buy', 'BUY WATCH', 'Bullish market conditions detected.', `${a.structure} · ${a.momentum} momentum · ${a.setupQuality}% quality. Waiting for full entry confirmation.`);
    } else if (action === 'SELL') {
      setSignal('sell', 'SELL WATCH', 'Bearish market conditions detected.', `${a.structure} · ${a.momentum} momentum · ${a.setupQuality}% quality. Waiting for full entry confirmation.`);
    } else {
      setSignal('', 'WAIT', 'No clear directional edge is confirmed yet.', `${a.structure} · ${a.momentum} momentum · ${a.setupQuality}% quality.`);
    }
    if (direction) $('signal')?.classList.add(direction);
  }

  async function refreshDecision() {
    if (decisionBusy) return;
    decisionBusy = true;
    try {
      const symbol = $('symbol')?.value || 'XAU/USD';
      const r = await fetch(`/api/analysis?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      renderBasicDecision(d.m5);

      // Premium users get the stricter multi-timeframe decision when available.
      const token = localStorage.getItem('pe_token');
      if (!token) return;
      const mr = await fetch(`/api/multi-analysis?symbol=${encodeURIComponent(symbol)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      if (!mr.ok) return;
      const m = await mr.json();
      text('confluence', `${m.confluenceCount}/5`);
      const action = String(m.action || 'WAIT');
      if (action === 'BUY') setSignal('buy', 'BUY SETUP', 'Full confirmation gates passed.', m.reason);
      else if (action === 'SELL') setSignal('sell', 'SELL SETUP', 'Full confirmation gates passed.', m.reason);
      else if (action === 'BUY WATCH') setSignal('buy', 'BUY WATCH', 'Bullish multi-timeframe conditions detected.', m.reason);
      else if (action === 'SELL WATCH') setSignal('sell', 'SELL WATCH', 'Bearish multi-timeframe conditions detected.', m.reason);
      else setSignal('', 'WAIT', m.reason || 'No clear directional edge is confirmed yet.');
    } catch (_) {
      // Preserve the last good dashboard decision during transient data/API failures.
    } finally {
      decisionBusy = false;
    }
  }

  function patchStyles() {
    if ($('#peDecisionFixStyle')) return;
    const s = document.createElement('style');
    s.id = 'peDecisionFixStyle';
    s.textContent = '.pe-decision-detail{margin:8px 0 0;font-size:11px;line-height:1.45}.signal.buy{border-color:#4ade80}.signal.sell{border-color:#fb7185}';
    document.head.appendChild(s);
  }

  function start() {
    patchStyles();
    refreshDecision();
    if (decisionTimer) clearInterval(decisionTimer);
    decisionTimer = setInterval(refreshDecision, 15000);
  }

  start();
  window.addEventListener('priceedge:market-updated', refreshDecision);
  document.addEventListener('change', e => {
    if (e.target?.id === 'symbol') refreshDecision();
  });
})();
