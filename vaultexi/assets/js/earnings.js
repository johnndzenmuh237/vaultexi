(function () {
  'use strict';

  /* ---------------------------------------------------------
     EARNINGS PAGE — now reads entirely from window.DemoStore,
     the same balance and transaction ledger used by the
     Dashboard, Trading Center, AutoTrading, Staking, NFT
     Marketplace, and Withdrawals. There is no separate "real"
     vs "demo" split anymore — everything here IS the balance
     you can withdraw from withdrawals.html.

     Position-tracking data that isn't money (active stake count,
     NFTs owned count) is still read from each page's own local
     storage, purely for display context — but every dollar
     figure on this page comes from DemoStore.transactions.
  --------------------------------------------------------- */

  const fmtMoney = n => '$' + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtSigned = n => (Number(n) >= 0 ? '+' : '−') + fmtMoney(n);

  function setVal(key, text, color) {
    const el = document.querySelector(`[data-earn-stat="${key}"] [data-val]`);
    if (!el) return;
    el.textContent = text;
    el.style.color = color || '';
  }

  /* ===================== balance banner ===================== */

  function renderBalanceBanner(state) {
    const balanceEl = document.querySelector('.balance-amount');
    if (balanceEl) {
      const [whole, cents] = state.balance.toFixed(2).split('.');
      balanceEl.innerHTML = `$${Number(whole).toLocaleString()}<span class="cents">.${cents}</span>`;
    }
    const pill = document.querySelector('[data-balance-pill]');
    if (pill) {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const weekly = state.transactions
        .filter(tx => tx.ts >= sevenDaysAgo && (tx.type === 'Bot' || (tx.type === 'Trade' && typeof tx.pnl === 'number')))
        .reduce((sum, tx) => sum + (tx.type === 'Bot' ? tx.usdAmount : tx.pnl), 0);
      if (!weekly) {
        pill.textContent = '— $0.00 this week';
        pill.className = 'pill pill-neutral';
      } else {
        const up = weekly > 0;
        pill.textContent = `${up ? '+' : '-'}$${Math.abs(weekly).toFixed(2)} this week`;
        pill.className = 'pill ' + (up ? 'pill-up' : 'pill-down');
      }
    }
  }

  /* ===================== Markets trading ===================== */

  function renderTrading(state) {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const sells = state.transactions.filter(tx => tx.type === 'Trade' && typeof tx.pnl === 'number');

    const allTime = sells.reduce((sum, tx) => sum + tx.pnl, 0);
    const week = sells.filter(tx => tx.ts >= sevenDaysAgo).reduce((sum, tx) => sum + tx.pnl, 0);

    setVal('all-time', fmtSigned(allTime), allTime >= 0 ? 'var(--mint)' : 'var(--coral)');
    setVal('week', fmtSigned(week), week >= 0 ? 'var(--mint)' : 'var(--coral)');

    const ordered = sells.slice().sort((a, b) => a.ts - b.ts);
    const points = [];
    let running = 0;
    ordered.forEach(tx => { running += tx.pnl; points.push(running); });

    const canvas = document.querySelector('[data-chart="trading-pnl"]');
    const emptyMsg = document.querySelector('[data-trading-empty]');
    if (canvas && window.CEPChart) {
      if (points.length) {
        const color = allTime >= 0
          ? (getComputedStyle(document.documentElement).getPropertyValue('--mint').trim() || '#00D9A3')
          : (getComputedStyle(document.documentElement).getPropertyValue('--coral').trim() || '#FF5C72');
        CEPChart.line(canvas, points, { color });
        canvas.style.display = '';
      } else {
        canvas.style.display = 'none';
      }
    }
    if (emptyMsg) emptyMsg.style.display = points.length ? 'none' : '';
  }

  /* ===================== AutoTrading (Bot) ===================== */

  const LS_BOT_STATE = 'vaultex_bot_state';
  function getBotState() { try { return JSON.parse(localStorage.getItem(LS_BOT_STATE) || 'null'); } catch (e) { return null; } }

  function renderBot(state) {
    const st = getBotState();
    const active = !!(st && st.active);
    const botTx = state.transactions.filter(tx => tx.type === 'Bot');
    const sessionEarnings = botTx.reduce((sum, tx) => sum + tx.usdAmount, 0);

    setVal('bot-session', fmtSigned(sessionEarnings), sessionEarnings >= 0 ? 'var(--mint)' : 'var(--coral)');
    setVal('bot-rate', st ? st.dailyRate.toFixed(2) + '%' : '—');
    setVal('bot-status', active ? `Active · ${st.packageName}` : 'Idle');
  }

  /* ===================== Staking ===================== */

  const LS_STAKES = 'vaultex_staking_positions';
  function getStakes() { try { return JSON.parse(localStorage.getItem(LS_STAKES) || '[]'); } catch (e) { return []; } }

  function renderStaking(state) {
    const stakes = getStakes();
    const stakeCredits = state.transactions.filter(tx => tx.type === 'Stake' && tx.usdAmount > 0);
    const totalPaid = stakeCredits.reduce((sum, tx) => sum + tx.usdAmount, 0);

    setVal('staking-active', String(stakes.length ? stakes.length : 0) + (stakes.length === 1 ? ' stake accruing' : ' stakes accruing'), stakes.length ? 'var(--mint)' : '');
    setVal('staking-count', String(stakes.length));
    setVal('staking-paid', fmtMoney(totalPaid), totalPaid ? 'var(--mint)' : '');
  }

  /* ===================== NFT ===================== */

  const LS_NFT_OWNED = 'vaultex_nft_owned';
  function getNftOwned() { try { return JSON.parse(localStorage.getItem(LS_NFT_OWNED) || '[]'); } catch (e) { return []; } }

  function renderNft(state) {
    const owned = getNftOwned();
    const mints = state.transactions.filter(tx => tx.type === 'NFT');
    const totalSpend = mints.reduce((sum, tx) => sum + Math.abs(tx.usdAmount), 0);

    setVal('nft-owned', String(owned.length));
    setVal('nft-spend', fmtMoney(totalSpend));
  }

  /* ===================== combined activity table ===================== */

  function txLabel(tx) {
    if (tx.label) return tx.label;
    if (tx.type === 'Trade' && tx.pair) return `${tx.pair} ${tx.side || ''} · Demo`.trim();
    return tx.type;
  }

  function sourceTagClass(type) {
    if (type === 'Bot') return 'bot';
    return 'demo';
  }
  function sourceTagLabel(type) {
    const map = { Deposit: 'Deposit', Withdrawal: 'Withdrawal', Trade: 'Trading', Bot: 'AutoTrading', Stake: 'Staking', NFT: 'NFT' };
    return map[type] || type;
  }

  function renderCombinedTable(state) {
    const body = document.querySelector('[data-earn-table]');
    if (!body) return;

    const rows = state.transactions.slice(0, 150);
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px;">No activity yet.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map(tx => {
      const positive = tx.usdAmount >= 0;
      return `
        <tr>
          <td>${new Date(tx.ts).toLocaleString()}</td>
          <td><span class="earn-source-tag ${sourceTagClass(tx.type)}">${sourceTagLabel(tx.type)}</span></td>
          <td>${txLabel(tx)}</td>
          <td class="mono" style="color:${positive ? 'var(--mint)' : 'var(--coral)'}">${fmtSigned(tx.usdAmount)}</td>
        </tr>`;
    }).join('');
  }

  /* ===================== render everything ===================== */

  function renderAll(state) {
    renderBalanceBanner(state);
    renderTrading(state);
    renderBot(state);
    renderStaking(state);
    renderNft(state);
    renderCombinedTable(state);
  }

  /* ===================== init ===================== */

  if (window.DemoStore) {
    DemoStore.subscribe(renderAll);
  } else {
    console.warn('DemoStore not loaded — include demo-store.js before earnings.js');
  }

  // Bot/Staking/NFT position counts are local-only and don't fire
  // DemoStore's change events, so poll them lightly for freshness.
  setInterval(() => { if (window.DemoStore) renderAll(DemoStore.getState()); }, 3000);
  window.addEventListener('storage', () => { if (window.DemoStore) renderAll(DemoStore.getState()); });

})();