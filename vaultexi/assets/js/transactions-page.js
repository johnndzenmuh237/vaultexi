/* =========================================================
   TRANSACTIONS-PAGE.JS — tab filtering for transactions.html
   Driven entirely by window.DemoStore. "Trades" covers every
   category that isn't a Deposit/Withdrawal — manual Trading,
   AutoTrading (Bot), Staking, and NFT activity — since they all
   now share the one balance.
   ========================================================= */

(function () {
  'use strict';

  const tabRow = document.querySelector('.tab-row');
  const txBody = document.querySelector('[data-tx-table]');
  let currentFilter = 'All';

  function txLabel(tx) {
    if (tx.label) return tx.label;
    if (tx.type === 'Trade' && tx.pair) return `${tx.pair} ${tx.side || ''} · Demo`.trim();
    return tx.type;
  }

  function render(state) {
    if (!txBody) return;

    let rows = state.transactions;
    if (currentFilter === 'Deposits') rows = rows.filter(t => t.type === 'Deposit');
    else if (currentFilter === 'Withdrawals') rows = rows.filter(t => t.type === 'Withdrawal');
    else if (currentFilter === 'Trades') rows = rows.filter(t => !['Deposit', 'Withdrawal'].includes(t.type));

    txBody.innerHTML = rows.length
      ? rows.map(tx => {
          const meta = DemoStore.statusMeta(tx.status);
          const asset = DemoStore.CURRENCY_META[tx.currency]?.label || (tx.currency || 'USDT').toUpperCase();
          return `
          <tr>
            <td>${new Date(tx.ts).toLocaleString()}</td>
            <td>${txLabel(tx)}</td>
            <td class="mono">${tx.usdAmount >= 0 ? '+' : '−'}$${Math.abs(tx.usdAmount).toFixed(2)} ${asset}</td>
            <td><span class="pill ${meta.cls}">${meta.label}</span></td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px;">No transactions in this category yet.</td></tr>`;
  }

  if (tabRow) {
    tabRow.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      currentFilter = btn.textContent.trim();
      if (window.DemoStore) render(DemoStore.getState());
    });
  }

  if (window.DemoStore) {
    DemoStore.subscribe(render);
  }
})();