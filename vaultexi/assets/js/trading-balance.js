/* =========================================================
   TRADING-BALANCE.JS — feeds the Trading Center's practice balance
   from the demo wallet (demo-ledger.js). Replaces the old
   /api/account/summary top-up, which has no backend.

   Add at the very bottom of trading.html (after the inline script):
     <script src="../assets/js/demo-ledger.js"></script>   (also earlier, after firebase-init.js)
     <script src="../assets/js/trading-balance.js"></script>

   How it works: net USD credited (deposits − withdrawals) is tracked;
   every change is applied as a delta to the trading page's own
   practice balance (localStorage "vaultex_practice_trade_balance_usdt"),
   so money you already traded is never reset.
   Do NOT also put demo-bridge.js on the trading page.
   ========================================================= */
(function () {
  'use strict';
  console.log('[trading-balance] loaded');

  const LS_BAL = 'vaultex_practice_trade_balance_usdt';
  const seenKey = uid => 'vaultex_demo_trade_seen_' + uid;
  const fmt = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const netFrom = list => Math.max(0, Math.round(list.reduce((s, t) => s + (t.type === 'deposit' ? Number(t.usd) : -Number(t.usd)), 0) * 100) / 100);

  function apply(uid, net) {
    const raw = localStorage.getItem(seenKey(uid));
    const seen = raw === null ? NaN : parseFloat(raw);
    let bal = parseFloat(localStorage.getItem(LS_BAL) || '0') || 0;
    bal = isNaN(seen) ? net : Math.max(0, bal + (net - seen));
    localStorage.setItem(LS_BAL, String(bal));
    localStorage.setItem(seenKey(uid), String(net));

    // show it straight away (the page re-reads localStorage on its next refresh too)
    document.querySelectorAll('[data-available-balance]').forEach(el => { el.textContent = fmt(bal); });
    document.querySelectorAll('[data-avail-line]').forEach(el => {
      if (/^Available balance/.test(el.textContent)) el.textContent = 'Available balance: ' + fmt(bal);
    });
    console.log('[trading-balance] demo net', net, '→ practice balance', bal);
  }

  function start() {
    if (!window.VaultexDemo) { console.error('[trading-balance] demo-ledger.js is not loaded on this page'); return; }
    VaultexDemo.whenUser(u => {
      VaultexDemo.onTransactions(u.uid, list => apply(u.uid, netFrom(list)), 500);
    });
  }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
