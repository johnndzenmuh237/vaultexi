(function () {
  'use strict';

  /* ---------------------------------------------------------
     TOTAL BALANCE = account balance + Earnings balance

     Load this AFTER dashboard.js on any page that has a
     ".balance-amount" element (Overview, Earnings).

     DEMO WALLET: when demo-ledger.js is present, the account
     balance is the net USD credited by the demo wallet
     (deposits − withdrawals), read straight from the ledger, so it
     no longer depends on what dashboard.js writes. Without the
     ledger it falls back to the old behaviour (remember whatever
     dashboard.js wrote).

     Earnings = VaultexBotTrade all-time earnings
              + staking rewards paid out (USD)
              + staking rewards accruing now (USD)
  --------------------------------------------------------- */

  const LS_BOT_LIFETIME = 'vaultex_bot_lifetime_earnings';
  const LS_BOT_TX = 'vaultex_bot_tx';
  const LS_STAKES = 'vaultex_demo_staking_positions';
  const LS_STAKE_HIST = 'vaultex_demo_staking_history';
  const LS_STAKE_PRICE_CACHE = 'vaultex_demo_staking_price_cache';
  const LS_EARN_PRICES = 'vaultex_earn_prices';
  const COIN_IDS = {
    btc: 'bitcoin', eth: 'ethereum', sol: 'solana', dot: 'polkadot', ada: 'cardano',
    avax: 'avalanche-2', matic: 'matic-network', link: 'chainlink', atom: 'cosmos', trx: 'tron'
  };

  const prices = {};
  const read = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  };
  const money = n => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ---------- prices ---------- */
  function loadPrices() {
    [LS_STAKE_PRICE_CACHE, LS_EARN_PRICES].forEach(k => {
      const c = read(k, null);
      if (c && c.p) Object.assign(prices, c.p);
    });
  }

  async function fetchPrices() {
    const last = read(LS_EARN_PRICES, null);
    if (last && last.ts && Date.now() - last.ts < 55000) { loadPrices(); return; }
    const ids = Object.keys(COIN_IDS).map(k => COIN_IDS[k]).join(',');
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd');
      if (!res.ok) return;
      const data = await res.json();
      const fresh = {};
      Object.keys(COIN_IDS).forEach(sym => {
        const row = data[COIN_IDS[sym]];
        if (row && typeof row.usd === 'number') fresh[sym] = row.usd;
      });
      Object.assign(prices, fresh);
      try { localStorage.setItem(LS_EARN_PRICES, JSON.stringify({ p: fresh, ts: Date.now() })); } catch (e) { /* ignore */ }
      render();
    } catch (e) { /* offline: cached prices are used */ }
  }

  /* ---------- earnings in USD ---------- */
  function botLifetime() {
    const v = parseFloat(localStorage.getItem(LS_BOT_LIFETIME));
    if (!isNaN(v)) return v;
    return read(LS_BOT_TX, []).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  }

  function stakeReward(s) {
    const years = (Date.now() - s.startedAt) / (365 * 86400000);
    return s.amount * (s.apy / 100) * years;
  }

  function earningsTotal() {
    let total = botLifetime();
    read(LS_STAKE_HIST, []).forEach(h => {
      const p = prices[String(h.symbol || '').toLowerCase()];
      if (typeof p === 'number') total += (h.reward || 0) * p;
    });
    read(LS_STAKES, []).forEach(s => {
      const p = prices[String(s.symbol || '').toLowerCase()];
      if (typeof p === 'number') total += stakeReward(s) * p;
    });
    return total;
  }

  /* ---------- the Total balance element ---------- */
  const el = document.querySelector('.balance-amount');
  if (!el) return;

  const parse = text => { const n = parseFloat(String(text).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
  let realBalance = parse(el.textContent);
  let demoActive = false;
  let note = null;

  function render() {
    const earn = earningsTotal();
    const total = realBalance + earn;
    const parts = Math.abs(total).toFixed(2).split('.');
    el.innerHTML = (total < 0 ? '−' : '') + '$' + Number(parts[0]).toLocaleString('en-US') + '<span class="cents">.' + parts[1] + '</span>';
    el.dataset.vxShown = el.textContent;

    if (!note) {
      note = document.createElement('div');
      note.className = 'vx-incl';
      note.style.cssText = 'font-size:.74rem;color:var(--muted);margin:2px 0 10px;';
      el.insertAdjacentElement('afterend', note);
    }
    note.textContent = Math.abs(earn) >= 0.005 ? 'Includes ' + money(earn) + ' from VaultexBotTrade and staking earnings' : '';
  }

  new MutationObserver(() => {
    if (el.textContent === el.dataset.vxShown) return; // our own write
    if (demoActive) { render(); return; }               // demo wallet is the source of truth; restore it
    realBalance = parse(el.textContent);
    render();
  }).observe(el, { childList: true, characterData: true, subtree: true });

  /* ---------- demo wallet: net USD credited ---------- */
  function startDemoWallet() {
    if (!window.VaultexDemo || !window.auth) return;
    auth.onAuthStateChanged(u => {
      if (!u) return;
      demoActive = true;
      VaultexDemo.onTransactions(u.uid, list => {
        let net = 0;
        list.forEach(t => { net += t.type === 'deposit' ? Number(t.usd) : -Number(t.usd); });
        realBalance = Math.max(0, Math.round(net * 100) / 100);
        render();
      }, 500);
    });
  }

  loadPrices();
  render();
  fetchPrices();
  window.addEventListener('load', startDemoWallet);
  setInterval(render, 1000);
  setInterval(fetchPrices, 60000);
  window.addEventListener('storage', render);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
})();