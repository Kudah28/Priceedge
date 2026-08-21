/* PriceEdge dashboard stability + decision consistency + Phase 2 intelligence. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const txt = id => ($(id)?.textContent || '').trim();

  function isLivePanel(el) {
    if (!(el instanceof HTMLElement)) return false;
    const t = (el.innerText || '').replace(/\s+/g, ' ').trim().toUpperCase();
    return t.includes('TICK') && t.includes('OPEN') && t.includes('HIGH') && t.includes('LOW') && t.includes('CLOSE') && t.includes('CANDLE CLOSES');
  }

  function removeDuplicateLivePanels() {
    const home = $('#home');
    if (!home) return;

    // Both live-ticks.js and the server-injected live-ticks-v2.js use
    // #liveTickPanel. Invalid duplicate IDs can survive if the second
    // script runs after the initial dashboard pass, so explicitly collapse
    // every matching panel and then run the structural fallback below.
    const byId = [...home.querySelectorAll('#liveTickPanel')];
    if (byId.length > 1) byId.slice(1).forEach(el => el.remove());

    const all = [...home.querySelectorAll('div,section')].filter(isLivePanel);
    const outer = all.filter(el => !all.some(other => other !== el && other.contains(el)));
    if (outer.length > 1) {
      const canonical = outer.find(el => el.id === 'liveTickPanel' || el.id === 'peLiveCandle') || outer[0];
      outer.forEach(el => { if (el !== canonical) el.remove(); });
      canonical.setAttribute('aria-label', 'Live candle information');
    }

    // If a second live panel is injected after this function runs, observe
    // the dashboard briefly and collapse it immediately rather than waiting
    // for the next periodic pass.
    if (!home.dataset.peLiveObserver) {
      const observer = new MutationObserver(() => {
        const panels = [...home.querySelectorAll('#liveTickPanel')];
        if (panels.length > 1) panels.slice(1).forEach(el => el.remove());
      });
      observer.observe(home, { childList: true, subtree: true });
      home.dataset.peLiveObserver = '1';
    }
  }

  function stabilizeChart() {
    const wrap = document.querySelector('.chartwrap');
    const canvas = $('#chart');
    if (!wrap || !canvas) return;
    wrap.style.height = window.innerWidth <= 500 ? '320px' : (window.innerWidth <= 800 ? '340px' : '390px');
    wrap.style.minHeight = window.innerWidth <= 500 ? '320px' : '';
    wrap.style.position = 'relative';
    wrap.style.overflow = 'hidden';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
  }

  function setSignal(kind, title, message, detail) {
    const el = $('signal');
    if (!el) return;
    el.classList.remove('buy', 'sell');
    if (kind === 'buy') el.classList.add('buy');
    if (kind === 'sell') el.classList.add('sell');
    el.innerHTML = `<h3>${title}</h3><span class="muted">${message}</span><p class="muted pe-decision-detail">${detail}</p>`;
  }

  function normalizeDecision() {
    const bias = txt('bias'), trend = txt('trend'), structure = txt('structure'), momentum = txt('momentum'), qualityText = txt('quality'), confluence = txt('confluence');
    if (!bias || bias === '—') return;
    const quality = parseFloat(qualityText.replace(/[^0-9.]/g, '')) || 0;
    const bullish = bias.toLowerCase().includes('bull'), bearish = bias.toLowerCase().includes('bear');
    const alignedTrend = bullish ? trend.toLowerCase().includes('bull') : bearish ? trend.toLowerCase().includes('bear') : false;
    const alignedStructure = bullish ? /HH|HL|Higher/i.test(structure) : bearish ? /LH|LL|Lower/i.test(structure) : false;
    const confMatch = confluence.match(/(\d+)\s*\/\s*(\d+)/), confScore = confMatch ? Number(confMatch[1]) : 0, confTotal = confMatch ? Number(confMatch[2]) : 4;
    const actionable = (bullish || bearish) && alignedTrend && alignedStructure && /strong/i.test(momentum) && quality >= 65 && confScore >= confTotal;
    const direction = bullish ? 'bullish' : bearish ? 'bearish' : 'neutral';
    if (actionable) {
      const title = bullish ? 'BUY SETUP' : 'SELL SETUP';
      setSignal(bullish ? 'buy' : 'sell', title, bullish ? 'Bullish confluence confirmed. Entry conditions are aligned.' : 'Bearish confluence confirmed. Entry conditions are aligned.', `${direction[0].toUpperCase()+direction.slice(1)} bias · ${structure || 'structure'} · ${momentum} momentum · ${Math.round(quality)}% quality · ${confScore}/${confTotal} confluence.`);
    } else {
      const reasons = [];
      if (!alignedTrend) reasons.push('trend not aligned');
      if (!alignedStructure) reasons.push('structure not aligned');
      if (!/strong/i.test(momentum)) reasons.push('momentum needs to strengthen');
      if (quality < 65) reasons.push('quality below 65%');
      if (confScore < confTotal) reasons.push(`${confScore || 'partial'}/${confTotal} confluence`);
      setSignal('', 'WATCH', `${direction[0].toUpperCase()+direction.slice(1)} bias is present, but the strict entry gate is not satisfied.`, `${structure || 'Current structure'} · ${momentum || 'Momentum'} momentum · ${Math.round(quality)}% quality · ${confScore || 'partial'}/${confTotal} confluence. ${reasons.slice(0,2).join(' and ')}.`);
    }
  }

  function ensureContextCard() {
    if ($('peContext')) return;
    const signal = $('signal');
    if (!signal) return;
    const card = document.createElement('div');
    card.id = 'peContext';
    card.className = 'rows';
    card.style.marginTop = '9px';
    card.innerHTML = '<div class="metric"><span>Session</span><b id="peSession">—</b></div><div class="metric"><span>Volatility</span><b id="peVolatility">—</b></div><div class="metric"><span>Momentum quality</span><b id="peMomentumQuality">—</b></div><div class="metric"><span>Price action</span><b id="pePriceAction">—</b></div>';
    signal.parentNode.insertBefore(card, signal.nextSibling);
  }

  function setText(id, value) { const el = $(id); if (el) el.textContent = value ?? '—'; }

  async function syncPhase2Analysis() {
    try {
      const symbol = $('symbol')?.value || 'XAU/USD';
      const r = await fetch(`/api/analysis?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok || !d.m5?.ready) return;
      const a = d.m5;
      setText('bias', a.trend);
      setText('trend', a.trend);
      setText('structure', a.structure);
      setText('momentum', a.momentum);
      setText('quality', `${a.setupQuality}%`);
      setText('support', Number(a.support).toFixed(2));
      setText('resistance', Number(a.resistance).toFixed(2));
      ensureContextCard();
      setText('peSession', a.session);
      setText('peVolatility', `${a.volatility.regime} (${a.volatility.ratio.toFixed(2)}×)`);
      setText('peMomentumQuality', `${a.momentumQuality}%`);
      const pa = a.liquidity.sweepLow ? 'Low sweep' : a.liquidity.sweepHigh ? 'High sweep' : a.priceAction.breakoutBull ? 'Bull breakout' : a.priceAction.breakoutBear ? 'Bear breakout' : a.priceAction.retestBull ? 'Bull retest' : a.priceAction.retestBear ? 'Bear retest' : a.candle.pattern !== 'None' ? a.candle.pattern : a.candle.engulfing !== 'None' ? a.candle.engulfing : 'No trigger';
      setText('pePriceAction', pa);
      normalizeDecision();

      const token = localStorage.getItem('pe_token');
      if (token) {
        const mr = await fetch(`/api/multi-analysis?symbol=${encodeURIComponent(symbol)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (mr.ok) {
          const m = await mr.json();
          setText('confluence', `${m.confluenceCount}/5`);
          if (m.action === 'BUY') setSignal('buy', 'BUY SETUP', 'All strict confirmation gates passed.', m.reason);
          else if (m.action === 'SELL') setSignal('sell', 'SELL SETUP', 'All strict confirmation gates passed.', m.reason);
          else setSignal('', m.action || 'WATCH', m.reason || 'Confirmation is still required.', `Confluence ${m.confluenceCount}/5 · H4+D1 ${m.h4d1Aligned ? 'aligned' : 'not aligned'} · ${a.session} session · ${a.volatility.regime} volatility.`);
        }
      }
    } catch (_) {
      // Keep the last stable dashboard state when a background analysis refresh fails.
    }
  }

  function patchMobileLayout() {
    if ($('#peDashboardFixStyle')) return;
    const s = document.createElement('style');
    s.id = 'peDashboardFixStyle';
    s.textContent = `#peLiveCandle{margin-top:10px!important;padding:12px!important}.pe-decision-detail{margin:8px 0 0;font-size:11px;line-height:1.45}@media(max-width:500px){header{height:64px!important}nav{top:64px!important}main{padding:10px 10px 18px!important}.chartwrap{height:320px!important;min-height:320px!important}.controls{gap:6px!important}.controls button{padding:8px 9px!important}.ticker{gap:7px!important;flex-wrap:wrap}.price{font-size:28px!important}.metric{min-width:0}.metric b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}}`;
    document.head.appendChild(s);
  }

  function run() {
    removeDuplicateLivePanels();
    stabilizeChart();
    normalizeDecision();
    ensureContextCard();
    patchMobileLayout();
  }

  run();
  setTimeout(run, 250);
  setTimeout(run, 900);
  setInterval(run, 2500);
  setInterval(syncPhase2Analysis, 15000);
  setTimeout(syncPhase2Analysis, 1200);
  window.addEventListener('resize', stabilizeChart);
})();
