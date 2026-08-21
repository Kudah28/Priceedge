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
    card.innerHTML = `
      <div class="metric"><span>Why</span><b id="peWhy">—</b></div>
      <div class="metric"><span>Confirmation</span><b id="peGate">—</b></div>
      <div class="metric"><span>Next trigger</span><b id="peTrigger">—</b></div>
      <div class="metric"><span>Next step</span><b id="peNext">—</b></div>`;
    signal.parentNode.insertBefore(card, signal.nextSibling);
    return card;
  }

  function renderBasic(a) {
    if (!a?.ready) return;
    text('bias', a.trend); text('trend', a.trend); text('structure', a.structure);
    text('momentum', a.momentum); text('quality', `${a.setupQuality}%`);
    text('support', Number(a.support).toFixed(2)); text('resistance', Number(a.resistance).toFixed(2));
    if (a.action === 'BUY') setSignal('buy','BUY WATCH','Bullish market conditions detected.',`${a.structure} · ${a.momentum} momentum · ${a.setupQuality}% quality. Waiting for full entry confirmation.`);
    else if (a.action === 'SELL') setSignal('sell','SELL WATCH','Bearish market conditions detected.',`${a.structure} · ${a.momentum} momentum · ${a.setupQuality}% quality. Waiting for full entry confirmation.`);
    else setSignal('','WAIT','No clear directional edge is confirmed yet.',`${a.structure} · ${a.momentum} momentum · ${a.setupQuality}% quality.`);
  }

  function renderIntel(m) {
    const e = m?.decision?.explanation; if (!e) return;
    ensureIntelCard();
    text('peWhy', e.summary);
    text('peGate', `${e.gate?.passed ?? 0}/${e.gate?.total ?? 8} gates (${e.gate?.score ?? 0}%)`);
    const t = e.trigger;
    text('peTrigger', t ? `${t.type} @ ${Number(t.price).toFixed(2)}` : 'Not defined yet');
    text('peNext', e.nextStep || 'Wait for confirmation');
    const action = String(m.action || 'WAIT');
    const factors = Array.isArray(e.factors) ? e.factors.slice(0,4).join(' · ') : '';
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
      const r = await fetch(`/api/analysis?symbol=${encodeURIComponent(symbol)}`, {cache:'no-store'});
      if (!r.ok) return;
      const d = await r.json(); renderBasic(d.m5);
      const token = localStorage.getItem('pe_token'); if (!token) return;
      const mr = await fetch(`/api/multi-analysis?symbol=${encodeURIComponent(symbol)}`, {headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
      if (!mr.ok) return;
      const m = await mr.json();
      text('confluence', `${m.confluenceCount}/5`); renderIntel(m);
    } catch (_) {
      // Preserve the last good decision during transient API/data failures.
    } finally { decisionBusy = false; }
  }

  function patchStyles() {
    if ($('#peDecisionFixStyle')) return;
    const s = document.createElement('style'); s.id = 'peDecisionFixStyle';
    s.textContent = `.pe-decision-detail{margin:8px 0 0;font-size:11px;line-height:1.45}.signal.buy{border-color:#4ade80}.signal.sell{border-color:#fb7185}#peDecisionIntel{margin-top:9px}.#peDecisionIntel .metric b{white-space:normal;line-height:1.35}`;
    document.head.appendChild(s);
  }

  function start() {
    patchStyles(); ensureIntelCard(); refreshDecision();
    if (decisionTimer) clearInterval(decisionTimer);
    decisionTimer = setInterval(refreshDecision, 15000);
  }
  start();
  window.addEventListener('priceedge:market-updated', refreshDecision);
  document.addEventListener('change', e => { if (e.target?.id === 'symbol') refreshDecision(); });
})();
