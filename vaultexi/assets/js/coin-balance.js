/* =========================================================
   COIN-BALANCES.JS — per-coin balances (DEMO WALLET VERSION)
   ---------------------------------------------------------
   Same API as before (window.VaultexBalances: load, onChange,
   normalizeCoin, logoUrl) but the coins now come from the demo
   wallet (demo-ledger.js) instead of NOWPayments transactions.
   It loads demo-ledger.js itself if the page doesn't have it.
   Refreshes automatically after every deposit / withdrawal.
   ========================================================= */
(function () {
  'use strict';

  if (!window.VaultexDemo) {
    const src = (document.currentScript && document.currentScript.src) || '';
    document.write('<script src="' + src.slice(0, src.lastIndexOf('/') + 1) + 'demo-ledger.js"><\/script>');
  }

  const REST = 'https://api.binance.com/api/v3';
  const LS_LAST = 'vaultex_last_deposit_coin';
  const listeners = [];
  let cache = null;
  let inflight = null;

  const NETWORK_SUFFIX = /(erc20|trc20|bep20|bsc|sol|matic|arb|base|op|ton|algo)$/;
  function normalizeCoin(code) {
    let c = String(code || '').toLowerCase().trim();
    if (!c) return '';
    if (c.startsWith('usdt')) return 'USDT';
    if (c.startsWith('usdc')) return 'USDC';
    if (c.startsWith('busd')) return 'BUSD';
    if (c.startsWith('dai')) return 'DAI';
    const stripped = c.replace(NETWORK_SUFFIX, '');
    return (stripped || c).toUpperCase();
  }

  const logoUrl = base => `https://assets.coincap.io/assets/icons/${String(base).toLowerCase()}@2x.png`;
  const STABLES = new Set(['USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD', 'TUSD']);

  async function fetchPrices(bases) {
    const prices = {};
    const need = bases.filter(b => !STABLES.has(b));
    bases.filter(b => STABLES.has(b)).forEach(b => { prices[b] = { price: 1, pct: 0 }; });
    if (!need.length) return prices;
    try {
      const symbols = encodeURIComponent(JSON.stringify(need.map(b => b + 'USDT')));
      const res = await fetch(`${REST}/ticker/24hr?symbols=${symbols}`);
      if (res.ok) {
        const data = await res.json();
        data.forEach(t => {
          prices[t.symbol.slice(0, -4)] = { price: parseFloat(t.lastPrice), pct: parseFloat(t.priceChangePercent) };
        });
      }
    } catch (e) { console.error('VaultexBalances: price fetch failed', e); }
    return prices;
  }

  const currentUser = () => (window.VaultexDemo ? VaultexDemo.currentUser() : Promise.resolve(null));
  const once = (subscribe, uid, pickLimit) => new Promise(resolve => {
    let off = null, got = false;
    off = pickLimit
      ? subscribe(uid, v => { if (got) return; got = true; setTimeout(() => off && off(), 0); resolve(v); }, pickLimit)
      : subscribe(uid, v => { if (got) return; got = true; setTimeout(() => off && off(), 0); resolve(v); });
  });

  async function build() {
    const user = await currentUser();
    let raw = {}, lastCoinFromTx = null;
    if (user && window.VaultexDemo) {
      const w = await once(VaultexDemo.onWallet, user.uid);
      raw = w.raw || {};
      const txs = await once(VaultexDemo.onTransactions, user.uid, 200);
      const lastDep = txs.find(t => t.type === 'deposit');
      lastCoinFromTx = lastDep ? lastDep.coin : null;
    }

    const bases = Object.keys(raw).filter(b => Number(raw[b]) > 1e-12);
    const prices = await fetchPrices(bases);

    const coins = bases.map(base => {
      const qty = Number(raw[base]) || 0;
      const p = prices[base] || { price: 0, pct: 0 };
      return { base, symbol: base + 'USDT', qty, price: p.price, pct: p.pct, value: qty * p.price, usdIn: 0, lastTs: Date.now() };
    }).sort((a, b) => b.value - a.value);

    const totalUsd = coins.reduce((s, c) => s + c.value, 0);
    const lastCoin = lastCoinFromTx || (coins[0] && coins[0].base) || localStorage.getItem(LS_LAST) || null;
    if (lastCoin) { try { localStorage.setItem(LS_LAST, lastCoin); } catch (e) {} }
    return { coins, totalUsd, lastCoin };
  }

  async function load(opts) {
    if (cache && !(opts && opts.force)) return cache;
    if (inflight) return inflight;
    inflight = build().then(r => {
      cache = r; inflight = null;
      listeners.forEach(fn => { try { fn(r); } catch (e) { console.error(e); } });
      return r;
    }).catch(e => { inflight = null; console.error('VaultexBalances: load failed', e); return cache || { coins: [], totalUsd: 0, lastCoin: null }; });
    return inflight;
  }

  function onChange(fn) { listeners.push(fn); if (cache) fn(cache); }

  window.VaultexBalances = { load, onChange, normalizeCoin, logoUrl };

  window.addEventListener('load', () => {
    let tries = 0;
    const t = setInterval(() => {
      if (window.VaultexDemo) { clearInterval(t); VaultexDemo.whenUser(() => load({ force: true })); }
      else if (++tries > 50) {
        clearInterval(t);
        console.error('VaultexBalances: demo-ledger.js did not load. Add <script src="../assets/js/demo-ledger.js"></script> before coin-balances.js on this page.');
      }
    }, 100);
  });
  window.addEventListener('vaultex:deposit-finished', () => load({ force: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && window.VaultexDemo) load({ force: true }); });
  setInterval(() => { if (window.VaultexDemo && !document.hidden) load({ force: true }); }, 30000); // keep prices fresh
})();
