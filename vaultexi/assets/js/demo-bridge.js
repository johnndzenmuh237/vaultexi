/* =========================================================
   DEMO-BRIDGE.JS — connects the demo wallet (demo-ledger.js) to the
   existing dashboard / assets / trading code, without editing them.

   1. window.fetch("/api/account/summary") is answered locally:
        totalBalance  = net USD credited (deposits − withdrawals)
        transactions  = demo deposits/withdrawals
      -> dashboard.js (Overview balance + recent transactions) and
         trading.html (practice-balance top-up) work unchanged.
   (Coin balances now come from the modified coin-balances.js.)

   USAGE: add ONE tag on dashboard.html and trading.html,
   right after firebase-init.js:
     <script src="../assets/js/demo-bridge.js"></script>
   It loads demo-ledger.js itself if it isn't on the page.
   Remove the tag when you go live with real deposits.
   ========================================================= */
(function () {
  'use strict';

  /* ---- make sure the ledger is loaded (synchronously, same folder) ---- */
  if (!window.VaultexDemo) {
    const src = (document.currentScript && document.currentScript.src) || '';
    const base = src.slice(0, src.lastIndexOf('/') + 1);
    document.write('<script src="' + base + 'demo-ledger.js"><\/script>');
  }

  /* ---- who is signed in ---- */
  function getUser() {
    return new Promise(resolve => {
      if (window.auth && auth.currentUser) return resolve(auth.currentUser);
      if (!window.auth) return resolve(null);
      let done = false;
      const off = auth.onAuthStateChanged(u => { if (!done) { done = true; off && off(); resolve(u || null); } });
      setTimeout(() => { if (!done) { done = true; resolve(null); } }, 4000);
    });
  }

  function txSnapshot(uid) {
    return new Promise(resolve => {
      let off = null, got = false;
      off = VaultexDemo.onTransactions(uid, list => { if (got) return; got = true; setTimeout(() => off && off(), 0); resolve(list); }, 200);
    });
  }

  /* ---------------------------------------------------------
     /api/account/summary
  --------------------------------------------------------- */
  async function buildSummary() {
    const user = await getUser();
    if (!user || !window.VaultexDemo) return { success: false };
    const txs = await txSnapshot(user.uid);
    let net = 0;
    txs.forEach(t => { net += t.type === 'deposit' ? Number(t.usd) : -Number(t.usd); });
    return {
      success: true,
      totalBalance: Math.max(0, Math.round(net * 100) / 100),
      earningsWithdrawn: 0,
      earningsPending: 0,
      balanceHistory: null,
      allocation: null,
      transactions: txs.map(t => ({
        date: new Date(t.createdAtMs).toLocaleDateString(),
        type: t.type === 'deposit' ? 'Deposit' : 'Withdrawal',
        amount: VaultexDemo.fmtQty(t.qty),
        asset: t.coin,
        status: 'Completed',
        ts: t.createdAtMs,
      })),
    };
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (/\/api\/account\/summary(\?|$)/.test(url)) {
      return buildSummary().then(data => new Response(JSON.stringify(data), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    }
    return realFetch(input, init);
  };

})();