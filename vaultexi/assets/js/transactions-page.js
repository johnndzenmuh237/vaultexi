/* =========================================================
   TRANSACTIONS-PAGE.JS — tab filtering for transactions.html
   Merges two sources into one table:
     1. VaultexDemo (demo-ledger.js)  -> wallet Deposits / Withdrawals
        (Firestore, with openable receipts)
     2. window.DemoStore (if present) -> Trades, Bot, Staking, NFT
   When VaultexDemo is loaded it is the source of truth for
   Deposit/Withdrawal, so any such rows in DemoStore are skipped
   to avoid showing them twice.
   Do NOT also include demo-transactions.js on this page.
   ========================================================= */
(function () {
  'use strict';

  const tabRow = document.querySelector('.tab-row');
  const txBody = document.querySelector('[data-tx-table]');
  let currentFilter = 'All';
  let walletTx = [];   // from VaultexDemo
  let storeTx = [];    // from DemoStore

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const usd = n => '$' + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function storeLabel(tx) {
    if (tx.label) return tx.label;
    if (tx.type === 'Trade' && tx.pair) return `${tx.pair} ${tx.side || ''} · Demo`.trim();
    return tx.type;
  }

  /* ---- normalise both sources to one row shape ---- */
  function fromWallet(t) {
    const dep = t.type === 'deposit';
    return {
      ts: t.createdAtMs,
      kind: dep ? 'Deposit' : 'Withdrawal',
      label: `${dep ? 'Deposit' : 'Withdrawal'} · ${t.coin}`,
      href: VaultexDemo.receiptUrl(t.id),
      amount: `${dep ? '+' : '−'}${VaultexDemo.fmtQty(t.qty)} ${t.coin} (${usd(t.usd)})`,
      statusLabel: `${t.status} ${t.confirmations}/${t.requiredConfirmations}`,
      cls: 'pill-success',
    };
  }

  function fromStore(tx) {
    const meta = window.DemoStore && DemoStore.statusMeta ? DemoStore.statusMeta(tx.status) : { cls: 'pill-neutral', label: tx.status || '' };
    const cm = window.DemoStore && DemoStore.CURRENCY_META;
    const asset = (cm && cm[tx.currency] && cm[tx.currency].label) || (tx.currency || 'USDT').toUpperCase();
    return {
      ts: tx.ts,
      kind: tx.type,
      label: storeLabel(tx),
      href: null,
      amount: `${tx.usdAmount >= 0 ? '+' : '−'}${usd(tx.usdAmount)} ${asset}`,
      statusLabel: meta.label,
      cls: meta.cls,
    };
  }

  function render() {
    if (!txBody) return;

    const walletActive = !!window.VaultexDemo;
    const store = storeTx
      .filter(t => !(walletActive && (t.type === 'Deposit' || t.type === 'Withdrawal')))
      .map(fromStore);
    let rows = [...walletTx.map(fromWallet), ...store].sort((a, b) => (b.ts || 0) - (a.ts || 0));

    if (currentFilter === 'Deposits') rows = rows.filter(r => r.kind === 'Deposit');
    else if (currentFilter === 'Withdrawals') rows = rows.filter(r => r.kind === 'Withdrawal');
    else if (currentFilter === 'Trades') rows = rows.filter(r => !['Deposit', 'Withdrawal'].includes(r.kind));

    txBody.innerHTML = rows.length
      ? rows.map(r => `
          <tr>
            <td>${esc(new Date(r.ts).toLocaleString())}</td>
            <td>${r.href ? `<a href="${r.href}">${esc(r.label)}</a>` : esc(r.label)}</td>
            <td class="mono">${esc(r.amount)}</td>
            <td><span class="pill ${esc(r.cls)}">${esc(r.statusLabel)}</span></td>
          </tr>`).join('')
      : `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px;">No transactions in this category yet.</td></tr>`;
  }

  function init() {
    if (tabRow) {
      tabRow.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        tabRow.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.textContent.trim();
        render();
      });
    }

    if (window.DemoStore) {
      DemoStore.subscribe(state => { storeTx = state.transactions || []; render(); });
    }
    if (window.VaultexDemo && window.auth) {
      auth.onAuthStateChanged(u => {
        if (u) VaultexDemo.onTransactions(u.uid, list => { walletTx = list; render(); }, 100);
      });
    }
    render();
  }

  window.addEventListener('load', init);
})();