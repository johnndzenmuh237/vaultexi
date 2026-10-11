/* =========================================================
   VAULTEX-EARNINGS.JS — one place that adds up everything the
   user has earned and lists everything the user has done.
   Sources (all stored in this browser, same as the wallet):
     Trading      vaultex_practice_trade_history   (realized P&L on sells)
     AutoTrading  vaultex_bot_tx / _state / _lifetime_earnings
     Staking      vaultex_demo_staking_positions / _history
     NFT          vaultex_demo_nft_owned / _history (value change since minting, in USD)
   window.VaultexEarnings = { compute(), events(), ensurePrices(), money(), prices }
   ========================================================= */
(function () {
  'use strict';
  const K = {
    trades: 'vaultex_practice_trade_history',
    botTx: 'vaultex_bot_tx', botLog: 'vaultex_bot_log', botState: 'vaultex_bot_state', botLife: 'vaultex_bot_lifetime_earnings',
    stakes: 'vaultex_demo_staking_positions', stakeHist: 'vaultex_demo_staking_history',
    stakePrices: 'vaultex_demo_staking_price_cache', earnPrices: 'vaultex_earn_prices',
    nftOwned: 'vaultex_demo_nft_owned', nftHist: 'vaultex_demo_nft_history',
  };
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const money = n => (n < 0 ? '−' : '') + '$' + Math.abs(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const prices = {};                       // lower-case symbol -> USD
  function loadCached() {
    [K.stakePrices, K.earnPrices].forEach(k => { const c = read(k, null); if (c && c.p) Object.keys(c.p).forEach(s => { if (typeof c.p[s] === 'number') prices[s] = c.p[s]; }); });
  }
  const px = sym => prices[String(sym || '').toLowerCase()] || 0;

  /* live prices from the wallet's price feed (ETH is needed for NFTs, the staked coins for rewards) */
  async function ensurePrices() {
    loadCached();
    if (!window.VaultexDemo) return;
    const bases = new Set(['ETH']);
    read(K.stakes, []).concat(read(K.stakeHist, [])).forEach(s => s.symbol && bases.add(String(s.symbol).toUpperCase()));
    await Promise.all([...bases].map(async b => { try { const p = Number(await VaultexDemo.getPrice(b)); if (p > 0) prices[b.toLowerCase()] = p; } catch (e) { /* keep cached */ } }));
  }

  const stakeReward = s => (Number(s.amount) || 0) * ((Number(s.apy) || 0) / 100) * ((Date.now() - (s.startedAt || Date.now())) / 31536000000);

  function compute() {
    loadCached();
    const now = Date.now(), weekAgo = now - 7 * 86400000;

    // Trading: realized profit/loss on every sell
    const trades = read(K.trades, []).slice().sort((a, b) => a.ts - b.ts);
    let cum = 0, week = 0; const series = [];
    trades.forEach(t => { if (t.side === 'sell' && typeof t.pnl === 'number') { cum += t.pnl; if (t.ts >= weekAgo) week += t.pnl; series.push({ ts: t.ts, cum }); } });
    const trading = { total: cum, week, count: trades.length, closed: series.length, series };

    // AutoTrading
    let life = parseFloat(localStorage.getItem(K.botLife));
    const botTx = read(K.botTx, []);
    if (isNaN(life)) life = botTx.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const st = read(K.botState, null);
    const bot = { total: life, count: botTx.length, session: st ? Number(st.totalEarnings) || 0 : 0, rate: st && st.active ? st.dailyRate : null, active: !!(st && st.active), pkg: st ? st.packageName : null, week: botTx.filter(t => t.ts >= weekAgo).reduce((s, t) => s + (Number(t.amount) || 0), 0) };

    // Staking
    let paid = 0, accruing = 0, principal = 0;
    read(K.stakeHist, []).forEach(h => { paid += (Number(h.reward) || 0) * px(h.symbol); });
    const act = read(K.stakes, []);
    act.forEach(s => { accruing += stakeReward(s) * px(s.symbol); principal += (Number(s.amount) || 0) * px(s.symbol); });
    const staking = { paid, accruing, total: paid + accruing, active: act.length, principal };

    // NFTs: what the collection is worth now (ETH price) vs what it cost when minted
    const owned = read(K.nftOwned, []), hist = read(K.nftHist, []), eth = px('eth');
    let cost = 0, value = 0;
    owned.forEach(id => { const h = hist.find(x => x.id === id); if (!h) return; const p = Number(h.priceEth) || 0; cost += p * (Number(h.ethUsd) || eth); value += p * eth; });
    const nft = { owned: owned.length, cost, value, total: eth ? value - cost : 0, ethPrice: eth };

    return { trading, bot, staking, nft, total: trading.total + bot.total + staking.total + nft.total };
  }

  /* every action across the four sections, newest first */
  function events() {
    const out = [];
    read(K.trades, []).forEach(t => out.push({
      ts: t.ts, source: 'Trading', asset: (t.base || '') + '/USDT', action: t.side === 'sell' ? 'Sell' : 'Buy', price: t.price, amountText: fmtQ(t.qty) + ' ' + (t.base || ''),
      valueUsd: t.amount, pnl: t.side === 'sell' && typeof t.pnl === 'number' ? t.pnl : null, status: 'Filled' }));
    read(K.botTx, []).forEach(t => {
      const m = /·\s*([A-Z0-9]+\/[A-Z0-9]+)\s+(LONG|SHORT)/.exec(t.label || '');
      out.push({ ts: t.ts, source: 'AutoTrading', asset: m ? m[1] : 'Portfolio', action: m ? (m[2] === 'LONG' ? 'Long' : 'Short') : 'While away', price: null, amountText: t.packageName ? t.packageName + ' bot' : 'Bot', valueUsd: null, pnl: Number(t.amount) || 0, status: 'Closed' });
    });
    read(K.botLog, []).filter(l => l.kind === 'system').forEach(l => out.push({ ts: l.ts, source: 'AutoTrading', asset: 'System', action: l.side || 'Event', price: null, amountText: '—', valueUsd: null, pnl: null, status: 'Done' }));
    const stakeEv = (s, status) => out.push({ ts: s.startedAt, source: 'Staking', asset: String(s.symbol).toUpperCase(), action: 'Stake', price: px(s.symbol) || null, amountText: fmtQ(s.amount) + ' ' + String(s.symbol).toUpperCase() + ' · ' + (s.planLabel || '') + (s.apy ? ' ' + Number(s.apy).toFixed(1) + '%' : ''), valueUsd: (Number(s.amount) || 0) * px(s.symbol) || null, pnl: null, status });
    read(K.stakes, []).forEach(s => stakeEv(s, s.unlockAt && Date.now() < s.unlockAt ? 'Locked' : 'Active'));
    read(K.stakeHist, []).forEach(h => {
      stakeEv(h, 'Completed');
      out.push({ ts: h.endedAt, source: 'Staking', asset: String(h.symbol).toUpperCase(), action: 'Unstake', price: px(h.symbol) || null, amountText: fmtQ((Number(h.amount) || 0) + (Number(h.reward) || 0)) + ' ' + String(h.symbol).toUpperCase(), valueUsd: ((Number(h.amount) || 0) + (Number(h.reward) || 0)) * px(h.symbol) || null, pnl: (Number(h.reward) || 0) * px(h.symbol) || null, status: 'Completed' });
    });
    const eth = px('eth');
    read(K.nftHist, []).forEach(h => out.push({ ts: h.ts, source: 'NFT', asset: h.name, action: 'Mint', price: Number(h.ethUsd) || eth || null, amountText: (Number(h.priceEth) || 0).toFixed(2) + ' ETH', valueUsd: (Number(h.priceEth) || 0) * (Number(h.ethUsd) || eth) || null, pnl: null, status: 'Completed', detail: h.collection }));
    return out.filter(e => e.ts).sort((a, b) => b.ts - a.ts);
  }
  const fmtQ = n => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 6 });

  loadCached();
  window.VaultexEarnings = { compute, events, ensurePrices, money, prices, fmtQ };
})();
