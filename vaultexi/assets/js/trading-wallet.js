/* =========================================================
   TRADING-WALLET.JS — connects the Trading Center to the demo wallet
   (demo-ledger.js). Replaces trading-deposits.js.

   The wallet is the single source of truth:
     • USDT in the wallet            = "Available balance" on the Trading Center
     • every other coin in the wallet = a holding you can select and sell
     • every buy / sell you place     = written straight back to the wallet,
       so the Dashboard, Assets, Withdraw and Deposit pages all follow.

   The trading page's own code is not changed: it keeps reading/writing
   localStorage keys "vaultex_practice_trade_balance_usdt" and
   "vaultex_practice_trade_holdings". This script mirrors those keys
   to/from the wallet in both directions.

   Script order on trading.html (bottom of the page):
     firebase-init.js -> demo-ledger.js (early) ... inline trading script
     -> trading-wallet.js -> trading-indicators.js
   ========================================================= */
(function () {
  'use strict';
  console.log('[trading-wallet] loaded');

  const LS_BAL = 'vaultex_practice_trade_balance_usdt';
  const LS_HOLD = 'vaultex_practice_trade_holdings';
  const WALLET_KEY = uid => 'vaultex_demo_wallet_' + uid;

  const V = () => window.VaultexDemo;
  const T = () => window.__vxTerminal;
  const $ = s => document.querySelector(s);
  const fmtUSD = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtQty = n => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  const floor8 = n => Math.floor((Number(n) || 0) * 1e8 + 1e-6) / 1e8;

  let uid = null;
  let ready = false;       // first pull from the wallet finished
  let syncing = false;     // we are the ones writing localStorage right now
  let pushTimer = null;
  let openedOwned = false;

  const readJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };

  /* ---------- watch the page's own writes so we can push them to the wallet ---------- */
  const rawSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    rawSetItem.call(this, k, v);
    if (this === window.localStorage && !syncing && ready && (k === LS_BAL || k === LS_HOLD)) schedulePush();
  };
  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushToWallet, 0);
  }

  function pushToWallet() {
    if (!uid || !V() || !V().setCoins) return;
    const bal = parseFloat(localStorage.getItem(LS_BAL) || '0') || 0;
    const hold = readJSON(LS_HOLD, {});
    const coins = { USDT: floor8(bal) };
    Object.keys(hold).forEach(sym => {
      const base = sym.replace(/USDT$/, '');
      const q = Number(hold[sym] && hold[sym].qty) || 0;
      if (q > 1e-9) coins[base] = floor8(q);
    });
    syncing = true;
    try { V().setCoins(uid, coins); } finally { syncing = false; }
    renderPanel();
  }

  /* ---------- wallet -> trading page ---------- */
  async function priceFor(base) {
    const t = T();
    const p = t && t.getPrice ? t.getPrice(base) : null;
    if (p) return p;
    try { return await V().getPrice(base); } catch (e) { return 0; }
  }

  function applyWallet(raw, prices) {
    const oldHold = readJSON(LS_HOLD, {});
    const next = {};
    Object.keys(raw).forEach(base => {
      if (base === 'USDT') return;
      const qty = Number(raw[base]) || 0;
      if (qty <= 1e-9) return;
      const sym = base + 'USDT';
      const old = oldHold[sym];
      const price = prices[base] || (old && old.costBasis) || 0;
      let cost = price;
      if (old && old.qty > 0) {
        cost = old.costBasis;
        if (qty > old.qty + 1e-9 && price) cost = (old.qty * old.costBasis + (qty - old.qty) * price) / qty;
      }
      next[sym] = { qty, costBasis: cost };
    });
    syncing = true;
    try {
      rawSetItem.call(localStorage, LS_BAL, String(Number(raw.USDT) || 0));
      rawSetItem.call(localStorage, LS_HOLD, JSON.stringify(next));
    } finally { syncing = false; }
  }

  async function pull(initial) {
    if (!uid || !V() || !V().getCoins) return;
    const raw = V().getCoins(uid);
    const prices = {};
    const bases = Object.keys(raw).filter(b => b !== 'USDT' && Number(raw[b]) > 0);
    for (const b of bases) prices[b] = await priceFor(b);
    applyWallet(raw, prices);
    ready = true;
    if (T() && T().rerender) T().rerender();
    renderPanel();
    if (initial) openOnOwnedCoin(raw, prices);
  }

  /* synchronous variant used right before a trade, using the live ticker prices already on the page */
  function pullNow() {
    if (!uid || !V() || !V().getCoins) return;
    const raw = V().getCoins(uid);
    const prices = {};
    Object.keys(raw).forEach(b => { if (b !== 'USDT') prices[b] = T() && T().getPrice ? T().getPrice(b) : 0; });
    applyWallet(raw, prices);
  }

  function openOnOwnedCoin(raw, prices) {
    if (openedOwned || !T() || !T().selectSymbol) return;
    openedOwned = true;
    if (new URLSearchParams(location.search).get('symbol')) return;
    let best = null, bestVal = 0;
    Object.keys(raw).forEach(b => {
      if (b === 'USDT') return;
      const val = (Number(raw[b]) || 0) * (prices[b] || 0);
      if (val > bestVal && T().hasTicker && T().hasTicker(b + 'USDT')) { best = b; bestVal = val; }
    });
    if (best) T().selectSymbol(best + 'USDT');
  }

  /* ---------- guard: never let a trade run on a stale / not-yet-loaded wallet ---------- */
  function guardSubmit() {
    const btn = $('[data-submit-btn]');
    if (!btn) return;
    btn.addEventListener('click', e => {
      if (!ready) {
        e.stopImmediatePropagation(); e.preventDefault();
        const m = $('[data-ticket-msg]');
        if (m) { m.className = 'ticket-msg err'; m.textContent = 'Loading your wallet… try again in a second.'; }
        return;
      }
      pullNow();   // pick up a deposit made in another tab a moment ago
      setTimeout(() => {
        const m = $('[data-ticket-msg]');
        if (m && /exceeds your available balance/i.test(m.textContent)) m.textContent = 'Not enough USDT to buy. Sell a coin first or deposit USDT.';
      }, 0);
    }, true);
  }

  /* ---------- wallet bar: Total balance + coin assets (same bar in full screen) ---------- */
  function ensurePanel() {
    let p = $('#vx-wallet-panel');
    if (!p) {
      const header = $('.trading-header');
      if (!header) return null;
      p = document.createElement('div');
      p.id = 'vx-wallet-panel';
      p.className = 'widget vx-wallet';
      header.insertAdjacentElement('afterend', p);
      const st = document.createElement('style');
      st.textContent = `
        .trading-header .balance-chip{display:none;}
        .vx-wallet{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:12px 16px;margin-bottom:14px;}
        .vx-wallet .vw-total{padding-right:18px;border-right:1px solid var(--line);}
        .vx-wallet .vw-k{font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;}
        .vx-wallet .vw-v{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:1.5rem;line-height:1.1;}
        .vx-wallet .vw-coins{display:flex;flex-wrap:wrap;gap:8px;flex:1;min-width:0;}
        .vw-coin{display:flex;align-items:center;gap:8px;padding:6px 11px;border:1px solid var(--line);border-radius:10px;background:transparent;color:inherit;cursor:pointer;font:inherit;text-align:left;}
        .vw-coin:hover,.vw-coin.active{border-color:var(--accent,#6C7CFF);background:var(--ink-soft);}
        .vw-coin.cash{cursor:default;}.vw-coin.cash:hover{border-color:var(--line);background:transparent;}
        .vw-coin b{font-size:.82rem;display:block;}
        .vw-coin small{display:block;color:var(--muted);font-size:.68rem;font-family:'JetBrains Mono',monospace;}
        .vw-empty{color:var(--muted);font-size:.84rem;}
        .market-row.vx-owned{box-shadow:inset 3px 0 0 var(--accent,#6C7CFF);}
        .market-row .vx-owned-badge{display:block;font-size:.62rem;color:var(--accent,#6C7CFF);font-family:'JetBrains Mono',monospace;margin-top:2px;}
        /* full-screen copy of the bar */
        .fs-balances{display:none !important;}
        #vx-fs-wallet{display:none;}
        .terminal-fullscreen-root.is-fullscreen #vx-fs-wallet{display:flex;align-items:center;gap:12px;margin-left:auto;min-width:0;overflow-x:auto;}
        #vx-fs-wallet .vw-total{padding-right:12px;border-right:1px solid var(--line);white-space:nowrap;}
        #vx-fs-wallet .vw-v{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:1.05rem;}
        #vx-fs-wallet .vw-k{font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;}
        #vx-fs-wallet .vw-coins{display:flex;gap:6px;}
        #vx-fs-wallet .vw-coin{padding:4px 9px;white-space:nowrap;}
        @media (max-width:640px){.vx-wallet{gap:10px;padding:10px 12px;}.vx-wallet .vw-v{font-size:1.2rem;}.vx-wallet .vw-total{border-right:0;padding-right:0;width:100%;}}
      `;
      document.head.appendChild(st);
    }
    const fsBar = $('[data-fullscreen-bar]');
    if (fsBar && !$('#vx-fs-wallet')) {
      const f = document.createElement('div'); f.id = 'vx-fs-wallet';
      const exit = fsBar.querySelector('[data-fullscreen-exit]');
      fsBar.insertBefore(f, exit || null);
    }
    return p;
  }

  function holdingsNow() {
    const hold = readJSON(LS_HOLD, {});
    return Object.keys(hold).map(sym => {
      const h = hold[sym];
      const base = sym.replace(/USDT$/, '');
      const live = T() && T().getPrice ? T().getPrice(base) : null;
      const price = live || h.costBasis || 0;
      return { sym, base, qty: h.qty, price, value: h.qty * price };
    }).filter(x => x.qty > 1e-9).sort((a, b) => b.value - a.value);
  }

  function walletHTML(cash, hs, sel) {
    const total = cash + hs.reduce((s, x) => s + x.value, 0);
    const chips = (cash > 0.005 || !hs.length ? `<div class="vw-coin cash"><div><b>USDT</b><small>${fmtQty(cash)}</small></div></div>` : '') +
      hs.map(x => `<button class="vw-coin ${x.sym === sel ? 'active' : ''}" data-vw-pick="${x.sym}" title="Trade ${x.base}/USDT"><div><b>${x.base}</b><small>${fmtQty(x.qty)} · ${fmtUSD(x.value)}</small></div></button>`).join('') +
      (!hs.length ? `<span class="vw-empty">No coins yet — <a href="deposits.html">deposit</a> one to trade it here.</span>` : '');
    return `<div class="vw-total"><div class="vw-k">Total balance</div><div class="vw-v">${fmtUSD(total)}</div></div><div class="vw-coins">${chips}</div>`;
  }

  function renderPanel() {
    const p = ensurePanel();
    if (!p) return;
    const cash = parseFloat(localStorage.getItem(LS_BAL) || '0') || 0;
    const hs = holdingsNow();
    const sel = T() && T().getSymbol ? T().getSymbol() : '';
    const html = walletHTML(cash, hs, sel);
    [p, $('#vx-fs-wallet')].forEach(box => {
      if (!box) return;
      if (box.dataset.sig === html) return;           // nothing changed — don't touch the DOM
      box.dataset.sig = html; box.innerHTML = html;
      box.querySelectorAll('[data-vw-pick]').forEach(b => b.addEventListener('click', () => {
        if (T() && T().selectSymbol) T().selectSymbol(b.dataset.vwPick);
        renderPanel();
        const fs = document.querySelector('.terminal-fullscreen-root.is-fullscreen');
        const cp = document.querySelector('[data-chart-panel]');
        if (!fs && cp) window.scrollTo({ top: cp.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
      }));
    });
    decorateMarketRows(hs);
  }

  /* ---------- pin deposited coins to the top of the market list ---------- */
  let rowObserver = null;
  function decorateMarketRows(hs) {
    const box = $('[data-market-rows]');
    if (!box) return;
    hs = hs || holdingsNow();
    const owned = new Map(hs.map(x => [x.sym, x]));
    if (rowObserver) rowObserver.disconnect();
    const rows = Array.from(box.querySelectorAll('.market-row'));
    const ownedRows = rows.filter(r => owned.has(r.dataset.symbol));
    ownedRows.slice().reverse().forEach(r => box.insertBefore(r, box.firstChild));
    rows.forEach(r => {
      const o = owned.get(r.dataset.symbol);
      r.classList.toggle('vx-owned', !!o);
      let b = r.querySelector('.vx-owned-badge');
      if (o) {
        if (!b) { b = document.createElement('span'); b.className = 'vx-owned-badge'; const nameBox = r.querySelector('.m-name'); (nameBox ? nameBox.parentNode : r).appendChild(b); }
        b.textContent = 'Held: ' + fmtQty(o.qty);
      } else if (b) b.remove();
    });
    if (rowObserver) rowObserver.observe(box, { childList: true });
  }
  function watchMarketRows() {
    const box = $('[data-market-rows]');
    if (!box || !window.MutationObserver) return;
    rowObserver = new MutationObserver(() => decorateMarketRows());
    rowObserver.observe(box, { childList: true });
  }

  /* ---------- boot ---------- */
  function start() {
    if (!window.VaultexDemo) return setTimeout(start, 100);
    guardSubmit();
    watchMarketRows();
    ensurePanel();
    V().whenUser(u => {
      const first = uid !== u.uid;
      uid = u.uid;
      if (first) { ready = false; pull(true); }
    });
    // deposits / withdrawals made on another page or tab
    window.addEventListener('storage', e => {
      if (uid && e.key === WALLET_KEY(uid)) pull(false);
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && uid && ready) pull(false); });
    window.addEventListener('pageshow', e => { if (e.persisted && uid) pull(false); });
    setInterval(renderPanel, 3000);          // keep totals in step with live prices / selected pair
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
