(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const token = () => localStorage.getItem('pe_token');

  function style() {
    if ($('peMonetizationStyle')) return;
    const s = document.createElement('style');
    s.id = 'peMonetizationStyle';
    s.textContent = `
      .pe-price-card{border:1px solid #6e5a1f!important;background:linear-gradient(145deg,#1b1d26,#111827)!important;position:relative;overflow:hidden}
      .pe-price-card:before{content:'PREMIUM';position:absolute;right:-34px;top:12px;transform:rotate(35deg);background:#f5c451;color:#17130a;font-size:9px;font-weight:900;padding:5px 38px}
      .pe-price{font-size:34px;font-weight:950;letter-spacing:-1px;margin:8px 0}.pe-price small{font-size:12px;color:#8e9cb7;font-weight:600}
      .pe-features{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:12px 0}.pe-feature{padding:9px;border:1px solid #26334f;background:#0c1322;border-radius:9px;font-size:11px}.pe-feature b{display:block;margin-bottom:3px}.pe-check{color:#4ade80;margin-right:5px}
      .pe-upgrade-strip{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #6e5a1f;background:#181a22;border-radius:12px;margin:10px 0}.pe-upgrade-strip button{width:auto!important;white-space:nowrap}
      .pe-billing-status{margin-top:10px}.pe-fine{font-size:10px;color:#6f7e9b;line-height:1.5;margin-top:9px}
      @media(max-width:500px){.pe-features{grid-template-columns:1fr}.pe-upgrade-strip{align-items:flex-start;flex-direction:column}.pe-upgrade-strip button{width:100%!important}}
    `;
    document.head.appendChild(s);
  }

  function premiumCard() {
    const billing = $('billing');
    if (!billing || $('pePremiumCard')) return;
    const card = document.createElement('div');
    card.id = 'pePremiumCard';
    card.className = 'card pe-price-card';
    card.innerHTML = `
      <div class="muted small">PRICEEDGE PREMIUM</div>
      <div class="pe-price">$19.99 <small>/ month</small></div>
      <div class="muted">For traders who want the complete decision-support layer without removing human control.</div>
      <div class="pe-features">
        <div class="pe-feature"><b><span class="pe-check">✓</span>Multi-timeframe</b>M5, M15, H1, H4 and D1 confluence.</div>
        <div class="pe-feature"><b><span class="pe-check">✓</span>Strict decisions</b>Structured BUY / SELL / WAIT logic.</div>
        <div class="pe-feature"><b><span class="pe-check">✓</span>Risk guardrails</b>2% maximum risk and daily-loss protection.</div>
        <div class="pe-feature"><b><span class="pe-check">✓</span>Advanced context</b>Price action, liquidity and volatility signals.</div>
      </div>
      <button id="peUpgrade" class="primary">Upgrade with Stripe — $19.99/mo</button>
      <button id="pePortal" class="ghost" style="width:100%;margin-top:8px">Manage subscription</button>
      <div class="pe-fine">Secure checkout is handled by Stripe. Cancel through the billing portal. PriceEdge provides educational and analytical information, not financial advice.</div>
      <div id="peBillingStatus" class="pe-billing-status"></div>`;
    billing.appendChild(card);
    $('peUpgrade').onclick = checkout;
    $('pePortal').onclick = portal;
    refreshStatus();
  }

  function dashboardUpsell() {
    const home = $('home');
    if (!home || $('peUpgradeStrip')) return;
    const grid = home.querySelector('.grid');
    if (!grid) return;
    const strip = document.createElement('div');
    strip.id = 'peUpgradeStrip';
    strip.className = 'pe-upgrade-strip';
    strip.innerHTML = `<div><b>Unlock the full PriceEdge decision engine</b><div class="muted small">Multi-timeframe confluence, advanced setup confirmation and analytics.</div></div><button class="primary">View Premium</button>`;
    strip.querySelector('button').onclick = () => { document.querySelector('[data-page="billing"]')?.click(); };
    grid.parentNode.insertBefore(strip, grid);
  }

  async function refreshStatus() {
    const out = $('peBillingStatus');
    const plan = $('plan');
    if (!token()) {
      if (out) out.innerHTML = '<div class="notice">Create an account to subscribe and keep your subscription attached to your PriceEdge profile.</div>';
      if (plan) plan.textContent = 'FREE';
      return;
    }
    try {
      const r = await fetch('/api/billing/status', {headers:{Authorization:`Bearer ${token()}`},cache:'no-store'});
      const d = await r.json();
      const active = d.premium || d.status === 'active';
      if (plan) plan.textContent = active ? 'PREMIUM' : 'FREE';
      if (out) out.innerHTML = active ? '<div class="notice success">Premium is active on this account.</div>' : `<div class="notice">Your account is on Free. Upgrade to unlock the complete decision-support layer.</div>`;
      const buy = $('peUpgrade'); if (buy) buy.textContent = active ? 'Premium Active' : 'Upgrade with Stripe — $19.99/mo';
      if (buy) buy.disabled = active;
    } catch (_) {}
  }

  function run() {
    style();
    premiumCard();
    dashboardUpsell();
    refreshStatus();
  }
  run();
  setTimeout(run, 300);
  setTimeout(run, 1200);
  window.addEventListener('storage', refreshStatus);
})();
