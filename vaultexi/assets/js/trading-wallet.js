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
    const qs = new URLSearchParams(location.search);
    const want = (qs.get('symbol') || (qs.get('coin') ? qs.get('coin') + 'USDT' : '')).toUpperCase();
    if (want) {                       // e.g. coming from the Assets page: trading.html?coin=ETH
      let tries = 0;
      const t = setInterval(() => { if (T().hasTicker && T().hasTicker(want)) { clearInterval(t); T().selectSymbol(want); } else if (++tries > 60) clearInterval(t); }, 250);
      return;
    }
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
        /* same look as the Assets page "Total balance" card */
        .vx-wallet{padding:20px 22px;margin-bottom:16px;}
        .vx-wallet .at-top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;}
        .vx-wallet .at-k{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;}
        .vx-wallet .at-v{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:2.1rem;line-height:1.1;}
        .vx-wallet .at-sub{font-size:.82rem;color:var(--muted);text-align:right;}
        .vx-wallet .at-bar{display:flex;height:8px;border-radius:6px;overflow:hidden;margin:16px 0 12px;background:var(--ink-soft);}
        .vx-wallet .at-bar i{display:block;height:100%;}
        .vx-wallet .at-chips{display:flex;flex-wrap:wrap;gap:10px;}
        .at-chip{display:flex;align-items:center;gap:10px;padding:9px 14px;border:1px solid var(--line);border-radius:12px;background:var(--ink-soft);color:inherit;font:inherit;text-align:left;cursor:pointer;}
        .at-chip:hover,.at-chip.active{border-color:var(--accent,#6C7CFF);}
        .at-chip.cash{cursor:default;}.at-chip.cash:hover{border-color:var(--line);}
        .at-chip img{width:28px;height:28px;border-radius:50%;background:#fff;padding:2px;box-sizing:border-box;object-fit:contain;flex-shrink:0;}
        .at-chip b{display:block;font-size:.86rem;}
        .at-chip small{display:block;font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--muted);}
        .at-chip .dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px;}
        .vw-empty{color:var(--muted);font-size:.84rem;}
        .market-row.vx-owned{box-shadow:inset 3px 0 0 var(--accent,#6C7CFF);}
        .market-row .vx-owned-badge{display:block;font-size:.62rem;color:var(--accent,#6C7CFF);font-family:'JetBrains Mono',monospace;margin-top:2px;}
        /* full-screen copy: compact, one line */
        .fs-balances{display:none !important;}
        #vx-fs-wallet{display:none;}
        .terminal-fullscreen-root.is-fullscreen #vx-fs-wallet{display:flex;align-items:center;gap:12px;margin-left:auto;min-width:0;overflow-x:auto;}
        #vx-fs-wallet .at-top{display:block;white-space:nowrap;padding-right:12px;border-right:1px solid var(--line);}
        #vx-fs-wallet .at-v{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:1.05rem;}
        #vx-fs-wallet .at-k{font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:0;}
        #vx-fs-wallet .at-sub,#vx-fs-wallet .at-bar{display:none;}
        #vx-fs-wallet .at-chips{display:flex;flex-wrap:nowrap;gap:6px;}
        #vx-fs-wallet .at-chip{padding:4px 10px;white-space:nowrap;gap:8px;}
        #vx-fs-wallet .at-chip img{width:20px;height:20px;}
        @media (max-width:640px){.vx-wallet{padding:14px;}.vx-wallet .at-v{font-size:1.6rem;}.vx-wallet .at-sub{text-align:left;}}
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

  const PAL = ['#6C7CFF', '#16c784', '#f7a600', '#ea3943', '#00bcd4', '#e91e63', '#9c27b0', '#8bc34a'];
  const logo = b => `https://assets.coincap.io/assets/icons/${String(b).toLowerCase()}@2x.png`;

  function walletHTML(cash, hs, sel) {
    // every asset incl. USDT, biggest first
    const items = hs.map(x => ({ base: x.base, sym: x.sym, qty: x.qty, value: x.value }));
    if (cash > 0.005) items.push({ base: 'USDT', sym: null, qty: cash, value: cash });
    items.sort((a, b) => b.value - a.value);
    const total = items.reduce((s, x) => s + x.value, 0);
    const bar = total > 0 ? items.map((x, i) => `<i style="width:${Math.max(0.5, x.value / total * 100).toFixed(2)}%;background:${PAL[i % PAL.length]}" title="${x.base}"></i>`).join('') : '';
    const chips = items.map((x, i) => {
      const inner = `<img src="${logo(x.base)}" data-coin-base="${x.base}" alt="">
        <div><b><span class="dot" style="background:${PAL[i % PAL.length]}"></span>${x.base}</b>
        <small>${fmtQty(x.qty)} · ${fmtUSD(x.value)}${total > 0 ? ' · ' + (x.value / total * 100).toFixed(1) + '%' : ''}</small></div>`;
      return x.sym
        ? `<button class="at-chip ${x.sym === sel ? 'active' : ''}" data-vw-pick="${x.sym}" title="Trade ${x.base}/USDT">${inner}</button>`
        : `<div class="at-chip cash" title="USDT is your buying balance">${inner}</div>`;
    }).join('');
    const sub = items.length ? items.length + (items.length === 1 ? ' asset' : ' assets') + ' held · live market prices' : 'No assets yet — deposit a coin to get started';
    return `<div class="at-top"><div><div class="at-k">Total balance</div><div class="at-v">${fmtUSD(total)}</div></div><div class="at-sub">${sub}</div></div>
      <div class="at-bar">${bar}</div>
      <div class="at-chips">${chips || '<span class="vw-empty">No coins yet — <a href="deposits.html">deposit</a> one to trade it here.</span>'}</div>`;
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
