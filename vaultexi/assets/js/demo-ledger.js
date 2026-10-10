/* =========================================================
   DEMO-LEDGER.JS — simulated wallet for TESTING ONLY.
   No Firebase database, no payment provider, no blockchain.
   Everything is stored in this browser's localStorage, per user:
     vaultex_demo_wallet_<uid>  -> { coins: {BTC: 0.01}, daily: {date, deposited} }
     vaultex_demo_tx_<uid>      -> [ transaction, ... ] (newest first)
   Only live prices are fetched (Binance public API).
   Data lives in this browser only: clearing site data resets it.
   ========================================================= */
(function () {
  'use strict';

  const REST = 'https://api.binance.com/api/v3';
  const DAILY_LIMIT = 50000000; // $50 million per day

  const COINS = {
    btc:       { base: 'BTC',  name: 'Bitcoin',  network: 'Bitcoin',                 addr: 'btc',  conf: 3 },
    eth:       { base: 'ETH',  name: 'Ethereum', network: 'Ethereum',                addr: 'evm',  conf: 12 },
    ltc:       { base: 'LTC',  name: 'Litecoin', network: 'Litecoin',                addr: 'ltc',  conf: 6 },
    sol:       { base: 'SOL',  name: 'Solana',   network: 'Solana',                  addr: 'sol',  conf: 32 },
    bnb:       { base: 'BNB',  name: 'BNB',      network: 'BNB Smart Chain',         addr: 'evm',  conf: 15 },
    trx:       { base: 'TRX',  name: 'TRON',     network: 'Tron',                    addr: 'trx',  conf: 19 },
    doge:      { base: 'DOGE', name: 'Dogecoin', network: 'Dogecoin',                addr: 'doge', conf: 6 },
    xrp:       { base: 'XRP',  name: 'XRP',      network: 'XRP Ledger',              addr: 'xrp',  conf: 1 },
    usdterc20: { base: 'USDT', name: 'Tether',   network: 'Ethereum (ERC20)',        addr: 'evm',  conf: 12 },
    usdttrc20: { base: 'USDT', name: 'Tether',   network: 'Tron (TRC20)',            addr: 'trx',  conf: 19 },
    usdtbep20: { base: 'USDT', name: 'Tether',   network: 'BNB Smart Chain (BEP20)', addr: 'evm',  conf: 15 },
  };

  /* ---------- storage ---------- */
  const WKEY = uid => 'vaultex_demo_wallet_' + uid;
  const TKEY = uid => 'vaultex_demo_tx_' + uid;
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const listeners = { wallet: [], tx: [] };
  function emit(kind, uid) {
    listeners[kind].forEach(l => { if (l.uid === uid) l.fire(); });
    if (kind === 'wallet') window.dispatchEvent(new Event('vaultex:deposit-finished')); // coin-balances.js reloads on this
  }
  window.addEventListener('storage', e => {            // keep other open tabs in sync
    if (!e.key) return;
    if (e.key.indexOf('vaultex_demo_wallet_') === 0) emit('wallet', e.key.slice('vaultex_demo_wallet_'.length));
    if (e.key.indexOf('vaultex_demo_tx_') === 0) emit('tx', e.key.slice('vaultex_demo_tx_'.length));
  });

  /* ---------- helpers ---------- */
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const HEX = '0123456789abcdef';

  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }
  const cryptoRnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  const pick = (chars, n, rnd) => Array.from({ length: n }, () => chars[Math.floor(rnd() * chars.length)]).join('');

  function makeAddress(kind, rnd) {
    switch (kind) {
      case 'btc':  return 'bc1q' + pick(B32, 38, rnd);
      case 'ltc':  return 'ltc1q' + pick(B32, 38, rnd);
      case 'evm':  return '0x' + pick(HEX, 40, rnd);
      case 'sol':  return pick(B58, 44, rnd);
      case 'trx':  return 'T' + pick(B58, 33, rnd);
      case 'doge': return 'D' + pick(B58, 33, rnd);
      case 'xrp':  return 'r' + pick(B58, 33, rnd);
      default:     return pick(B58, 40, rnd);
    }
  }
  const makeHash = kind => (kind === 'evm' ? '0x' : '') + pick(HEX, 64, cryptoRnd);
  const makeId = () => 'tx_' + Date.now().toString(36) + pick(HEX, 8, cryptoRnd);

  function walletAddress(uid, key) { return makeAddress(COINS[key].addr, seeded(uid + ':' + key)); }

  const priceCache = {};
  async function getPrice(base) {
    if (base === 'USDT') return 1;
    const hit = priceCache[base];
    if (hit && Date.now() - hit.t < 10000) return hit.p;
    const res = await fetch(`${REST}/ticker/price?symbol=${base}USDT`);
    if (!res.ok) throw new Error('Could not fetch the live price. Try again.');
    const p = parseFloat((await res.json()).price);
    if (!(p > 0)) throw new Error('Invalid price received.');
    priceCache[base] = { p, t: Date.now() };
    return p;
  }

  const floor8 = n => Math.floor(n * 1e8) / 1e8;
  const fmtQty = n => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 8 });
  const fmtUSD = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- auth access that works whether or not window.auth exists ---------- */
  function getAuth() {
    try { if (window.auth && window.auth.onAuthStateChanged) return window.auth; } catch (e) {}
    try { if (typeof auth !== 'undefined' && auth && auth.onAuthStateChanged) return auth; } catch (e) {}
    try { if (window.firebase && firebase.apps && firebase.apps.length) return firebase.auth(); } catch (e) {}
    return null;
  }
  /** Resolves with the signed-in user (or null after ~8s). */
  function currentUser() {
    return new Promise(resolve => {
      let tries = 0;
      const t = setInterval(() => {
        const a = getAuth();
        if (a && a.currentUser) { clearInterval(t); resolve(a.currentUser); }
        else if (++tries > 80) { clearInterval(t); resolve(null); }
      }, 100);
    });
  }
  /** Calls cb(user) once auth is ready and a user is signed in (and again on re-login). */
  function whenUser(cb) {
    let tries = 0;
    const t = setInterval(() => {
      const a = getAuth();
      if (a) { clearInterval(t); a.onAuthStateChanged(u => { if (u) cb(u); }); }
      else if (++tries > 100) clearInterval(t);
    }, 100);
  }
  async function debug() {
    const u = await currentUser();
    const out = { user: u && u.uid, keys: Object.keys(localStorage).filter(k => k.indexOf('vaultex_demo_') === 0) };
    console.log('VaultexDemo debug', out);
    return out;
  }

  /* Keep DemoStore (Trading / Staking / NFT balance) in step when it is on the page. */
  function mirrorToStore(tx) {
    try {
      if (!window.DemoStore) return;
      const dep = tx.type === 'deposit';
      const label = (dep ? 'Deposit' : 'Withdrawal') + ' · ' + tx.coin;
      if (dep && DemoStore.credit) DemoStore.credit(tx.usd, { category: 'Deposit', label, notify: false, extra: { wallet: true } });
      else if (!dep && DemoStore.debit) DemoStore.debit(tx.usd, { category: 'Withdrawal', label, notify: false, extra: { wallet: true } });
    } catch (e) { console.warn('VaultexDemo: could not mirror to DemoStore', e); }
  }

  function saveTx(uid, tx) {
    const list = read(TKEY(uid), []);
    list.unshift(tx);
    write(TKEY(uid), list.slice(0, 200));
  }

  /* ---------- deposit ---------- */
  async function deposit(uid, key, usd) {
    const c = COINS[key];
    if (!c) throw new Error('Unsupported asset.');
    usd = Math.round(Number(usd) * 100) / 100;
    if (!(usd >= 5)) throw new Error('Minimum deposit is $5.00.');

    const price = await getPrice(c.base);
    const qty = floor8(usd / price);
    if (!(qty > 0)) throw new Error('Amount is too small for this asset.');

    const today = new Date().toISOString().slice(0, 10);
    const w = read(WKEY(uid), { coins: {}, daily: null });
    const used = w.daily && w.daily.date === today ? Number(w.daily.deposited) || 0 : 0;
    if (used + usd > DAILY_LIMIT) {
      throw new Error(`Daily deposit limit is ${fmtUSD(DAILY_LIMIT)}. You can still deposit ${fmtUSD(Math.max(0, DAILY_LIMIT - used))} today.`);
    }

    w.coins = w.coins || {};
    w.coins[c.base] = floor8((Number(w.coins[c.base]) || 0) + qty);
    w.daily = { date: today, deposited: used + usd };

    const tx = {
      id: makeId(), type: 'deposit', demo: true, status: 'Confirmed',
      confirmations: c.conf, requiredConfirmations: c.conf,
      hash: makeHash(c.addr), assetKey: key, coin: c.base, coinName: c.name, network: c.network,
      qty, usd, price,
      fromAddress: makeAddress(c.addr, cryptoRnd),
      toAddress: walletAddress(uid, key),
      block: 800000 + Math.floor(cryptoRnd() * 900000),
      createdAtMs: Date.now(),
    };
    write(WKEY(uid), w);
    saveTx(uid, tx);
    mirrorToStore(tx);
    emit('wallet', uid); emit('tx', uid);
    return tx;
  }

  /* ---------- withdraw ---------- */
  async function withdraw(uid, key, usd, toAddress) {
    const c = COINS[key];
    if (!c) throw new Error('Unsupported asset.');
    toAddress = String(toAddress || '').trim();
    if (toAddress.length < 20 || toAddress.length > 128) throw new Error('Enter a valid recipient address.');
    usd = Math.round(Number(usd) * 100) / 100;
    if (!(usd > 0)) throw new Error('Enter an amount in USD.');

    const price = await getPrice(c.base);
    const qty = floor8(usd / price);
    if (!(qty > 0)) throw new Error('Amount is too small for this asset.');

    const w = read(WKEY(uid), { coins: {}, daily: null });
    const have = Number((w.coins || {})[c.base]) || 0;
    if (qty > have + 1e-9) throw new Error(`Insufficient ${c.base}. You have ${fmtQty(have)} ${c.base} (${fmtUSD(have * price)}).`);

    w.coins[c.base] = Math.max(0, floor8(have - qty));

    const tx = {
      id: makeId(), type: 'withdrawal', demo: true, status: 'Confirmed',
      confirmations: c.conf, requiredConfirmations: c.conf,
      hash: makeHash(c.addr), assetKey: key, coin: c.base, coinName: c.name, network: c.network,
      qty, usd, price,
      fromAddress: walletAddress(uid, key), toAddress,
      block: 800000 + Math.floor(cryptoRnd() * 900000),
      createdAtMs: Date.now(),
    };
    write(WKEY(uid), w);
    saveTx(uid, tx);
    mirrorToStore(tx);
    emit('wallet', uid); emit('tx', uid);
    return tx;
  }

  /* ---------- reads / live listeners ---------- */
  async function priceList(coinsMap) {
    const out = [];
    for (const base of Object.keys(coinsMap || {})) {
      const qty = Number(coinsMap[base]) || 0;
      if (qty <= 1e-12) continue;
      let price = 0;
      try { price = await getPrice(base); } catch (e) { /* leave 0 */ }
      out.push({ base, qty, price, value: qty * price });
    }
    return out;
  }

  /** cb({ coins:[{base,qty,price,value}], raw:{BTC:..}, totalUsd }) — returns an unsubscribe function */
  function onWallet(uid, cb) {
    const fire = async () => {
      const raw = (read(WKEY(uid), { coins: {} }).coins) || {};
      const coins = await priceList(raw);
      cb({ coins, raw, totalUsd: coins.reduce((s, c) => s + c.value, 0) });
    };
    const l = { uid, fire };
    listeners.wallet.push(l);
    fire();
    return () => { listeners.wallet = listeners.wallet.filter(x => x !== l); };
  }

  function onTransactions(uid, cb, limit) {
    const fire = () => cb(read(TKEY(uid), []).slice(0, limit || 25).map(t => Object.assign({}, t)));
    const l = { uid, fire };
    listeners.tx.push(l);
    fire();
    return () => { listeners.tx = listeners.tx.filter(x => x !== l); };
  }

  async function getTransaction(uid, id) {
    return read(TKEY(uid), []).find(t => t.id === id) || null;
  }


  /* ---------- trading (swap inside the wallet, no fee) ---------- */
  const RKEY = uid => 'vaultex_demo_trades_' + uid;
  const QUOTE = 'USDT';
  /** side 'buy': spend `usd` of USDT, receive base. side 'sell': sell `usd` worth of base, receive USDT. */
  async function trade(uid, base, side, usd) {
    base = String(base || '').toUpperCase();
    if (!base || base === QUOTE) throw new Error('Pick a coin other than USDT to trade.');
    if (side !== 'buy' && side !== 'sell') throw new Error('Invalid side.');
    usd = Math.round(Number(usd) * 100) / 100;
    if (!(usd >= 1)) throw new Error('Minimum trade is $1.00.');
    const price = await getPrice(base);
    const qty = floor8(usd / price);
    if (!(qty > 0)) throw new Error('Amount is too small.');
    const w = read(WKEY(uid), { coins: {}, daily: null });
    w.coins = w.coins || {};
    const haveQ = Number(w.coins[QUOTE]) || 0, haveB = Number(w.coins[base]) || 0;
    if (side === 'buy') {
      if (usd > haveQ + 1e-6) throw new Error('Insufficient USDT. You have ' + fmtUSD(haveQ) + '. Deposit USDT or sell another coin first.');
      w.coins[QUOTE] = Math.max(0, floor8(haveQ - usd));
      w.coins[base] = floor8(haveB + qty);
    } else {
      if (qty > haveB + 1e-9) throw new Error('Insufficient ' + base + '. You have ' + fmtQty(haveB) + ' ' + base + ' (' + fmtUSD(haveB * price) + ').');
      w.coins[base] = Math.max(0, floor8(haveB - qty));
      w.coins[QUOTE] = floor8(haveQ + usd);
    }
    const t = { id: makeId(), side, base, qty, usd, price, pair: base + '/' + QUOTE, status: 'Filled', createdAtMs: Date.now() };
    write(WKEY(uid), w);
    const list = read(RKEY(uid), []); list.unshift(t); write(RKEY(uid), list.slice(0, 200));
    emit('wallet', uid);
    return t;
  }
  function getTrades(uid) { return read(RKEY(uid), []); }


  /* ---------- direct wallet access (used by the Trading Center) ---------- */
  function getCoins(uid) { return Object.assign({}, (read(WKEY(uid), { coins: {} }).coins) || {}); }
  /** Replace the whole coin map, e.g. {USDT:120.5, BTC:0.01}. Zero/empty entries are dropped. */
  function setCoins(uid, map) {
    const w = read(WKEY(uid), { coins: {}, daily: null });
    const out = {};
    Object.keys(map || {}).forEach(b => { const q = floor8(Number(map[b]) || 0); if (q > 0) out[b] = q; });
    w.coins = out;
    write(WKEY(uid), w);
    emit('wallet', uid);
  }

  window.VaultexDemo = {
    COINS, DAILY_LIMIT, getPrice, walletAddress, deposit, withdraw, trade, getTrades, getCoins, setCoins,
    onWallet, onTransactions, getTransaction, fmtQty, fmtUSD, esc, floor8,
    getAuth, currentUser, whenUser, debug,
    receiptUrl: id => 'tx-receipt.html?id=' + encodeURIComponent(id),
  };
})();
