/* =========================================================
   WITHDRAWAL.JS — fully simulated withdrawal flow
   ---------------------------------------------------------
   No Firebase, no backend, no admin review of any kind.
   Relies only on window.DemoStore (demo-store.js), which must
   load BEFORE this script.

   Flow: pick asset + address + amount -> DemoStore.withdraw()
   validates against the simulated balance and, if OK, debits
   it and settles the transaction instantly.
   ========================================================= */

(function () {
  'use strict';

  const el = (id) => document.getElementById(id);

  const submitBtn = el('wd-submit-btn');
  const currencySelect = el('wd-currency');
  const addressInput = el('wd-address');
  const amountInput = el('wd-amount');
  const formError = el('wd-form-error');
  const rejectedNote = el('wd-rejected-note');
  const rejectedReason = el('wd-rejected-reason');
  const statusBadge = el('wd-status-badge');
  const statusEmpty = el('wd-status-empty');
  const statusDetail = el('wd-status-detail');
  const historyBody = el('wd-history-body');
  const usedTodayEl = el('wd-used-today');
  const usedBar = el('wd-used-bar');

  function renderHistory(state) {
    if (!historyBody) return;
    const withdrawals = state.transactions.filter(t => t.type === 'Withdrawal').slice(0, 10);

    historyBody.innerHTML = withdrawals.length
      ? withdrawals.map(tx => {
          const meta = DemoStore.statusMeta(tx.status);
          const asset = DemoStore.CURRENCY_META[tx.currency]?.label || tx.currency.toUpperCase();
          return `
          <tr>
            <td>${new Date(tx.ts).toLocaleString()}</td>
            <td>${asset}</td>
            <td>$${Math.abs(tx.usdAmount).toFixed(2)}</td>
            <td class="mono" title="${tx.address}">${tx.address.slice(0, 10)}…${tx.address.slice(-6)}</td>
            <td><span class="pill ${meta.cls}">${meta.label}</span></td>
            <td>--</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="6">You haven't requested a withdrawal yet — your history will show up here once you make one.</td></tr>`;

    if (rejectedNote) rejectedNote.hidden = true; // demo mode never rejects

    const last = withdrawals[0];
    if (last && statusEmpty && statusDetail) {
      statusEmpty.hidden = true;
      statusDetail.hidden = false;
      if (statusBadge) {
        statusBadge.hidden = false;
        const meta = DemoStore.statusMeta(last.status);
        statusBadge.className = 'pill ' + meta.cls;
        statusBadge.textContent = meta.label;
      }
      const asset = DemoStore.CURRENCY_META[last.currency]?.label || last.currency.toUpperCase();
      el('wd-detail-currency').textContent = asset;
      el('wd-detail-amount').textContent = `$${Math.abs(last.usdAmount).toFixed(2)}`;
      el('wd-detail-address').textContent = last.address;
    }
  }

  function renderUsedToday(state) {
    const usedToday = DemoStore.usedTodayForWithdrawals();
    if (usedTodayEl) usedTodayEl.textContent = `$${usedToday.toLocaleString()}`;
    if (usedBar) usedBar.style.width = Math.min(100, (usedToday / DemoStore.DAILY_WITHDRAWAL_LIMIT) * 100) + '%';
  }

  if (window.DemoStore) {
    DemoStore.subscribe((state) => {
      renderHistory(state);
      renderUsedToday(state);
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      formError.hidden = true;
      const currency = currencySelect.value;
      const address = addressInput.value.trim();
      const usdAmount = Number(amountInput.value);

      const result = DemoStore.withdraw(currency, address, usdAmount);
      if (!result.success) {
        formError.textContent = result.error;
        formError.hidden = false;
        return;
      }

      addressInput.value = '';
      amountInput.value = '';
    });
  }
})();
