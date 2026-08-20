/* PriceEdge mobile UI polish + de-duplication layer. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const text = id => ($(id)?.textContent || '').trim();

  function removeDuplicateLivePanels() {
    const panels = [...document.querySelectorAll('#liveTickPanel, #peLiveCandle')];
    if (panels.length <= 1) return;

    // chart-interactions owns #peLiveCandle and updates it from the forming candle.
    // Keep that panel as the single source of truth and remove the older v2 panel.
    const canonical = $('peLiveCandle') || panels[0];
    panels.forEach(panel => {
      if (panel !== canonical) panel.remove();
    });

    canonical.id = 'peLiveCandle';
    canonical.setAttribute('aria-label', 'Live candle information');
  }

  function improveLivePanel() {
    const panel = $('peLiveCandle');
    if (!panel) return;
    panel.style.marginTop = '10px';
    panel.style.padding = '12px';
    panel.style.borderRadius = '12px';
    panel.style.fontVariantNumeric = 'tabular-nums';
    panel.style.overflow = 'hidden';
    const grid = panel.firstElementChild;
    if (grid) {
      grid.style.gridTemplateColumns = 'repeat(5,minmax(0,1fr))';
      grid.style.gap = '8px';
    }
  }

  function calculateConfluence() {
    const bias = text('bias');
    const trend = text('trend');
    const structure = text('structure');
    const momentum = text('momentum');
    const quality = text('quality');
    const out = $('confluence');
    if (!out) return;

    if (!bias || bias === '—') {
      out.textContent = 'Waiting';
      return;
    }

    let score = 0;
    if (bias === trend) score++;
    if ((bias === 'Bullish' && /HH|HL|Higher/i.test(structure)) || (bias === 'Bearish' && /LH|LL|Lower/i.test(structure))) score++;
    if ((bias === 'Bullish' && /strong|moderate/i.test(momentum)) || (bias === 'Bearish' && /strong|moderate/i.test(momentum))) score++;
    if (/High|Strong|Watchlist/i.test(quality)) score++;

    const direction = bias === 'Bullish' ? 'bullish' : 'bearish';
    out.textContent = `${score}/4 ${direction}`;
    out.className = score >= 3 ? 'green' : score >= 2 ? 'gold' : 'red';
    out.title = 'Core confluence: bias, trend, structure, momentum and setup quality.';
  }

  function improveDecisionCard() {
    const signal = $('signal');
    if (!signal) return;
    const bias = text('bias');
    const momentum = text('momentum');
    const quality = text('quality');
    const structure = text('structure');
    if (!bias || bias === '—') return;

    // Only add an explanatory footer if the existing signal does not already contain one.
    if (!signal.querySelector('.pe-signal-detail')) {
      const p = document.createElement('p');
      p.className = 'muted pe-signal-detail';
      p.style.margin = '7px 0 0';
      p.style.fontSize = '11px';
      p.textContent = `${bias} bias from ${structure || 'current structure'} · ${momentum || 'momentum'} momentum · ${quality || 'developing'} quality. Confirmation is still required before entry.`;
      signal.appendChild(p);
    }
  }

  function improveChart() {
    const wrap = document.querySelector('.chartwrap');
    const canvas = $('chart');
    if (!wrap || !canvas) return;

    wrap.style.minHeight = '300px';
    wrap.style.height = 'min(390px, 48vh)';
    wrap.style.maxHeight = '390px';
    wrap.style.position = 'relative';
    wrap.style.overflow = 'hidden';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    // Keep the mobile chart from becoming too cramped while preserving vertical page scrolling.
    if (window.innerWidth <= 500) {
      wrap.style.height = '320px';
      wrap.style.minHeight = '320px';
    }
  }

  function improveMobileSpacing() {
    if (!document.getElementById('peMobilePolish')) {
      const style = document.createElement('style');
      style.id = 'peMobilePolish';
      style.textContent = `
        .pe-signal-detail{line-height:1.45}
        .metric b,.level b{font-variant-numeric:tabular-nums}
        @media(max-width:500px){
          header{padding-left:14px!important;padding-right:14px!important}
          .brand{font-size:23px!important}
          nav{padding:8px 10px!important}
          nav button{padding:10px 13px!important;font-size:14px}
          main{padding:10px!important}
          .card{border-radius:16px!important}
          .rows{gap:8px!important}
          .metric{min-width:0;overflow:hidden}
          .metric b,.level b{font-size:14px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .levels{gap:8px!important}
          #peLiveCandle>div:first-child{gap:5px!important}
          #peLiveCandle>div:first-child b{font-size:11px!important}
        }
      `;
      document.head.appendChild(style);
    }
  }

  function run() {
    removeDuplicateLivePanels();
    improveLivePanel();
    calculateConfluence();
    improveDecisionCard();
    improveChart();
    improveMobileSpacing();
  }

  // Some of the existing modules build their panels after DOMContentLoaded.
  run();
  setTimeout(run, 300);
  setTimeout(run, 1000);
  setInterval(() => {
    removeDuplicateLivePanels();
    calculateConfluence();
    improveDecisionCard();
  }, 2000);
  window.addEventListener('resize', improveChart);
})();
