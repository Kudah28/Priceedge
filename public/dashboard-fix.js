/* PriceEdge dashboard stability + decision consistency fix. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const txt = id => ($(id)?.textContent || '').trim();

  function isLivePanel(el) {
    if (!(el instanceof HTMLElement)) return false;
    const t = (el.innerText || '').replace(/\s+/g, ' ').trim().toUpperCase();
    return t.includes('TICK') && t.includes('OPEN') && t.includes('HIGH') &&
           t.includes('LOW') && t.includes('CLOSE') && t.includes('CANDLE CLOSES');
  }

  function removeDuplicateLivePanels() {
    const home = $('#home');
    if (!home) return;
    const all = [...home.querySelectorAll('div,section')].filter(isLivePanel);
    const outer = all.filter(el => !all.some(other => other !== el && other.contains(el)));
    if (outer.length <= 1) return;

    const canonical = outer.find(el => el.id === 'peLiveCandle') || outer[0];
    outer.forEach(el => {
      if (el !== canonical) el.remove();
    });

    canonical.id = 'peLiveCandle';
    canonical.setAttribute('aria-label', 'Live candle information');
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
    const bias = txt('bias');
    const trend = txt('trend');
    const structure = txt('structure');
    const momentum = txt('momentum');
    const qualityText = txt('quality');
    const confluence = txt('confluence');
    if (!bias || bias === '—') return;

    const quality = parseFloat(qualityText.replace(/[^0-9.]/g, '')) || 0;
    const bullish = bias.toLowerCase().includes('bull');
    const bearish = bias.toLowerCase().includes('bear');
    const alignedTrend = bullish ? trend.toLowerCase().includes('bull') : bearish ? trend.toLowerCase().includes('bear') : false;
    const alignedStructure = bullish ? /HH|HL|Higher/i.test(structure) : bearish ? /LH|LL|Lower/i.test(structure) : false;
    const confMatch = confluence.match(/(\d+)\s*\/\s*4/);
    const confScore = confMatch ? Number(confMatch[1]) : 0;
    const actionable = (bullish || bearish) && alignedTrend && alignedStructure && /strong/i.test(momentum) && quality >= 65 && confScore >= 4;
    const direction = bullish ? 'bullish' : bearish ? 'bearish' : 'neutral';

    if (actionable) {
      const title = bullish ? 'BUY SETUP' : 'SELL SETUP';
      const message = bullish ? 'Bullish confluence confirmed. Entry conditions are aligned.' : 'Bearish confluence confirmed. Entry conditions are aligned.';
      setSignal(bullish ? 'buy' : 'sell', title, message,
        `${direction[0].toUpperCase()+direction.slice(1)} bias · ${structure || 'structure'} · ${momentum} momentum · ${Math.round(quality)}% quality · ${confScore}/4 confluence.`);
    } else {
      const reasons = [];
      if (!alignedTrend) reasons.push('trend not aligned');
      if (!alignedStructure) reasons.push('structure not aligned');
      if (!/strong/i.test(momentum)) reasons.push('momentum needs to strengthen');
      if (quality < 65) reasons.push('quality below 65%');
      if (confScore < 4) reasons.push(`${confScore || 'partial'}/4 confluence`);
      setSignal('', 'WATCH',
        `${direction[0].toUpperCase()+direction.slice(1)} bias is present, but the strict entry gate is not satisfied.`,
        `${structure || 'Current structure'} · ${momentum || 'Momentum'} momentum · ${Math.round(quality)}% quality · ${confScore || 'partial'}/4 confluence. ${reasons.slice(0,2).join(' and ')}.`);
    }
  }

  function patchMobileLayout() {
    if ($('#peDashboardFixStyle')) return;
    const s = document.createElement('style');
    s.id = 'peDashboardFixStyle';
    s.textContent = `
      #peLiveCandle { margin-top:10px !important; padding:12px !important; }
      .pe-decision-detail { margin:8px 0 0; font-size:11px; line-height:1.45; }
      @media (max-width:500px) {
        header { height:64px !important; }
        nav { top:64px !important; }
        main { padding:10px 10px 18px !important; }
        .chartwrap { height:320px !important; min-height:320px !important; }
        .controls { gap:6px !important; }
        .controls button { padding:8px 9px !important; }
        .ticker { gap:7px !important; flex-wrap:wrap; }
        .price { font-size:28px !important; }
        .metric { min-width:0; }
        .metric b { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; }
      }
    `;
    document.head.appendChild(s);
  }

  function run() {
    removeDuplicateLivePanels();
    stabilizeChart();
    normalizeDecision();
    patchMobileLayout();
  }

  run();
  setTimeout(run, 250);
  setTimeout(run, 900);
  setInterval(run, 2500);
  window.addEventListener('resize', stabilizeChart);
})();
