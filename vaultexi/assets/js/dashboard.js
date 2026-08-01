(function () {
  'use strict';

  /* ---- Render sidebar nav (single source of truth) ---- */
  const NAV_ITEMS = [
    { href: 'dashboard.html',       icon: '⌂', label: 'Overview' },
    { href: 'assets.html',          icon: '◇', label: 'Assets' },
    { href: 'markets.html',          icon: '☰', label: 'Markets' },
    { href: 'trading.html',         icon: '⇄', label: 'Trading' },
    { href: 'autotrading.html',     icon: '🤖', label: 'AutoTrading' },
    { href: 'staking.html',         icon: '◎', label: 'Staking' },
    { href: 'nft-marketplace.html', icon: '◆', label: 'NFT Marketplace' },
    { href: 'transactions.html',    icon: '⇵', label: 'Transactions' },
    { href: 'deposits.html',        icon: '⬇', label: 'Deposits' },
    { href: 'withdrawals.html',     icon: '⬆', label: 'Withdrawals' },
    { href: 'trading-history.html', icon: '⌗', label: 'Trading history' },
    { href: 'earnings.html',        icon: '⚡', label: 'Earnings' },
  ];

  const ACCOUNT_ITEMS = [
    { href: 'profile.html',        icon: '◉', label: 'Profile' },
    { href: 'security.html',       icon: '⛉', label: 'Security' },
    { href: 'notifications.html',  icon: '⚑', label: 'Notifications' },
    { href: 'api-management.html', icon: '⌬', label: 'API keys' },
    { href: 'settings.html',       icon: '⚙', label: 'Settings' },
  ];

  function renderSidebar() {
    const navEl = document.querySelector('.dash-nav');
    if (!navEl) return;

    const currentPage = location.pathname.split('/').pop() || 'dashboard.html';

    const renderLink = (item) => `
      <a href="${item.href}" class="${item.href === currentPage ? 'active' : ''}">
        ${item.icon} <span class="label">${item.label}</span>
      </a>`;

    navEl.innerHTML =
      NAV_ITEMS.map(renderLink).join('') +
      `<div class="group-label">Account</div>` +
      ACCOUNT_ITEMS.map(renderLink).join('');
  }

  renderSidebar();

  /* ---------------------------------------------------------
     SIDEBAR / MOBILE DRAWER  (unchanged — pure UI, no data)
  --------------------------------------------------------- */
  const sidebarToggle = document.querySelector('[data-sidebar-toggle]');
  const sidebar = document.querySelector('.dash-sidebar');

  if (sidebarToggle && sidebar) {
    let backdrop = document.querySelector('.dash-sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'dash-sidebar-backdrop';
      document.body.appendChild(backdrop);
    }

    function openSidebar() {
      sidebar.classList.add('open');
      backdrop.classList.add('open');
      document.body.classList.add('sidebar-open');
      sidebarToggle.setAttribute('aria-expanded', 'true');
    }

    function closeSidebar() {
      sidebar.classList.remove('open');
      backdrop.classList.remove('open');
      document.body.classList.remove('sidebar-open');
      sidebarToggle.setAttribute('aria-expanded', 'false');
    }

    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });

    backdrop.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) closeSidebar();
    });

    sidebar.addEventListener('click', (e) => {
      if (e.target.closest('a')) closeSidebar();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768 && sidebar.classList.contains('open')) {
        closeSidebar();
      }
    });
  }

  /* ---------------------------------------------------------
     ACCOUNT BALANCE / ALLOCATION / TRANSACTIONS
     ---------------------------------------------------------
     FULLY SIMULATED — driven entirely by window.DemoStore
     (demo-store.js). No backend, no Firebase, no admin step
     anywhere in this flow.
  --------------------------------------------------------- */

  function renderBalance(state) {
    const balanceEl = document.querySelector('.balance-amount');
    if (balanceEl) {
      const [whole, cents] = state.balance.toFixed(2).split('.');
      balanceEl.innerHTML = `$${Number(whole).toLocaleString()}<span class="cents">.${cents}</span>`;
    }

    if (window.CEPChart) {
      const settled = state.transactions
        .filter(tx => tx.status === 'finished' || tx.status === 'completed' || tx.status === 'simulated')
        .slice(0, 7)
        .reverse();
      let running = state.balance - settled.reduce((s, t) => s + t.usdAmount, 0);
      const points = settled.length ? settled.map(t => (running += t.usdAmount)) : [state.balance];
      document.querySelectorAll('[data-chart="balance"]').forEach(canvas => {
        CEPChart.line(canvas, points, { color: '#2ee6a6' });
      });
    }
  }

  function renderAllocation(state) {
    const widget = document.querySelector('[data-chart="allocation"]')?.closest('.widget');
    if (!widget) return;
    const canvas = widget.querySelector('[data-chart="allocation"]');
    const list = widget.querySelector('ul');

    if (canvas && window.CEPChart) {
      CEPChart.donut(canvas, state.allocation);
    }
    if (list) {
      list.innerHTML = state.allocation.map(a => `
        <li style="display:flex;align-items:center;gap:8px;">
          <span style="width:9px;height:9px;border-radius:50%;background:${a.color};display:inline-block;"></span>
          ${a.label} — $${a.value.toLocaleString()}
        </li>`).join('');
    }
  }

  function renderQuickStats(state) {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const deposited30d = state.transactions
      .filter(tx => tx.type === 'Deposit' && tx.status === 'finished' && tx.ts >= thirtyDaysAgo)
      .reduce((sum, tx) => sum + tx.usdAmount, 0);
    const withdrawn30d = state.transactions
      .filter(tx => tx.type === 'Withdrawal' && tx.status === 'completed' && tx.ts >= thirtyDaysAgo)
      .reduce((sum, tx) => sum + Math.abs(tx.usdAmount), 0);
    // "Staking rewards" = realized unstake credits (the debit that
    // converts USD into a coin position doesn't count as a reward).
    const staking = state.transactions
      .filter(tx => tx.type === 'Stake' && tx.usdAmount > 0 && tx.ts >= thirtyDaysAgo)
      .reduce((sum, tx) => sum + tx.usdAmount, 0);

    const stats = document.querySelectorAll('.quick-stat strong');
    if (stats[0]) stats[0].textContent = `$${deposited30d.toLocaleString()}`;
    if (stats[1]) stats[1].textContent = `$${staking.toLocaleString()}`;
    if (stats[2]) stats[2].textContent = `$${withdrawn30d.toLocaleString()}`;
  }

  function txLabel(tx) {
    if (tx.label) return tx.label;
    if (tx.type === 'Trade' && tx.pair) return `${tx.pair} ${tx.side || ''} · Demo`.trim();
    return tx.type;
  }

  function renderTransactions(state) {
    const txBody = document.querySelector('[data-tx-table]');
    if (!txBody) return;

    const rows = state.transactions.slice(0, 15);
    txBody.innerHTML = rows.length
      ? rows.map(tx => {
          const meta = DemoStore.statusMeta(tx.status);
          const asset = (tx.currency && DemoStore.CURRENCY_META[tx.currency]?.label) || 'USDT';
          return `
          <tr>
            <td>${new Date(tx.ts).toLocaleString()}</td>
            <td>${txLabel(tx)}</td>
            <td class="mono">${tx.usdAmount >= 0 ? '+' : '−'}$${Math.abs(tx.usdAmount).toFixed(2)} ${asset}</td>
            <td><span class="pill ${meta.cls}">${meta.label}</span></td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px;">No transactions yet — try a demo deposit to get started.</td></tr>`;
  }

  function renderWeeklyPill(state) {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weeklyPnl = state.transactions
      .filter(tx => tx.ts >= sevenDaysAgo && (tx.type === 'Bot' || (tx.type === 'Trade' && typeof tx.pnl === 'number')))
      .reduce((sum, tx) => sum + (tx.type === 'Bot' ? tx.usdAmount : tx.pnl), 0);

    document.querySelectorAll('.balance-card .pill').forEach(el => {
      if (!weeklyPnl) {
        el.textContent = '— $0.00 this week';
        el.classList.remove('pill-up', 'pill-down');
        el.classList.add('pill-neutral');
        return;
      }
      const up = weeklyPnl > 0;
      el.textContent = `${up ? '+' : '-'}$${Math.abs(weeklyPnl).toFixed(2)} this week`;
      el.classList.remove('pill-neutral', up ? 'pill-down' : 'pill-up');
      el.classList.add(up ? 'pill-up' : 'pill-down');
    });
  }

  function renderAll(state) {
    renderBalance(state);
    renderAllocation(state);
    renderQuickStats(state);
    renderTransactions(state);
    renderWeeklyPill(state);
  }

  if (window.DemoStore) {
    window.DemoStore.subscribe(renderAll);
  } else {
    console.warn('DemoStore not loaded — include demo-store.js before dashboard.js');
  }

  /* ---------------------------------------------------------
     VAULTEXBOTTRADE — DEMO AUTOTRADING BOT WIDGET
     ---------------------------------------------------------
     Driven by DemoStore trade history. Still read-only here;
     activation happens on trading.html via DemoStore.trade(...).
  --------------------------------------------------------- */

  function renderBotWidget(state) {
    const el = document.querySelector('[data-bot-widget]');
    if (!el) return;

    const botTrades = state.transactions.filter(tx => tx.type === 'Bot');

    if (!botTrades.length) {
      el.innerHTML = `
        <div class="widget-head"><h3>VaultexBotTrade <span class="demo-chip">VBT</span></h3><span class="pill pill-neutral">Inactive</span></div>
        <p style="color:var(--muted);font-size:.85rem;margin:6px 0 14px;">No AutoTrading activity yet. Head to the AutoTrading page to run a simulated session — it uses this same balance.</p>
        <a href="autotrading.html" class="btn btn-primary btn-sm">Go to AutoTrading</a>
      `;
      return;
    }

    const totalEarnings = botTrades.reduce((sum, tx) => sum + tx.usdAmount, 0);
    const fmtMoney = n => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtSigned = n => (n >= 0 ? '+' : '−') + fmtMoney(n);
    const recent = botTrades.slice(0, 3);

    el.innerHTML = `
      <div class="widget-head"><h3>VaultexBotTrade <span class="demo-chip">VBT</span></h3><span class="pill pill-up">Active</span></div>
      <div style="margin:6px 0 14px;">
        <div style="font-family:var(--font-mono);font-size:1.3rem;color:${totalEarnings >= 0 ? 'var(--mint)' : 'var(--coral)'};font-weight:700;">${fmtSigned(totalEarnings)}</div>
        <div style="font-size:.68rem;color:var(--muted);">Simulated session earnings — already reflected in your balance above</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
        ${recent.map(a => `
          <div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:.72rem;color:var(--muted);">
            <span>${a.label || (a.pair || '') + ' ' + (a.side || '')}</span><span style="color:${a.usdAmount >= 0 ? 'var(--mint)' : 'var(--coral)'}">${fmtSigned(a.usdAmount)}</span>
          </div>`).join('')}
      </div>
      <p style="color:var(--muted);font-size:.68rem;margin-bottom:10px;">Simulated demo balance only — no real funds involved.</p>
      <a href="autotrading.html" class="btn btn-ghost btn-sm">Manage bot</a>
    `;
  }

  if (window.DemoStore) {
    window.DemoStore.subscribe(renderBotWidget);
  }

  /* ---- Tab switching (generic, used across widgets) ---- */
  document.querySelectorAll('.tab-row').forEach(row => {
    row.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      row.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  /* ---- Security toggles ---- */
  document.querySelectorAll('.toggle').forEach(t => {
    t.addEventListener('click', () => t.classList.toggle('on'));
  });

  /* ---- Copy-to-clipboard for wallet addresses / API keys ---- */
  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.copy;
      navigator.clipboard?.writeText(text).then(() => {
        const original = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => (btn.textContent = original), 1500);
      });
    });
  });

})();
