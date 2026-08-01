/* =========================================================
   DEPOSIT.JS — fully simulated deposit flow
   ---------------------------------------------------------
   No Firebase, no backend, no real payment of any kind.
   Relies only on window.DemoStore (demo-store.js), which must
   load BEFORE this script.

   Flow: pick asset + USD amount -> DemoStore.createDeposit()
   generates a fake "DEMO-" address + QR code -> after a short
   simulated confirmation delay, balance is credited
   automatically and it shows up in history/notifications.
   ========================================================= */

(function () {
  'use strict';

  const el = (id) => document.getElementById(id);

  const generateBtn = el('generate-btn');
  const currencySelect = el('currency-select');
  const amountInput = el('amount-input');
  const formError = el('form-error');
  const resultPanel = el('result-panel');
  const statusBadge = el('status-badge');
  const historyBody = el('history-body');

  let activeDepositId = null;
  let countdownTimer = null;

  function renderHistory(state) {
    if (!historyBody) return;
    const deposits = state.transactions.filter(t => t.type === 'Deposit').slice(0, 10);

    historyBody.innerHTML = deposits.length
      ? deposits.map(tx => {
          const meta = DemoStore.statusMeta(tx.status);
          const asset = DemoStore.CURRENCY_META[tx.currency]?.label || tx.currency.toUpperCase();
          return `
          <tr>
            <td>${new Date(tx.ts).toLocaleString()}</td>
            <td>${asset}</td>
            <td>$${tx.usdAmount.toFixed(2)}</td>
            <td><span class="pill ${meta.cls}">${meta.label}</span></td>
            <td class="mono">${tx.paymentId}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="5">You haven't made a deposit yet — your history will show up here once you make one.</td></tr>`;
  }

  function renderActiveStatus(state) {
    if (!activeDepositId || !statusBadge) return;
    const tx = state.transactions.find(t => t.id === activeDepositId);
    if (!tx) return;

    const meta = DemoStore.statusMeta(tx.status);
    statusBadge.className = 'pill ' + meta.cls;
    statusBadge.textContent = meta.label;

    if (tx.status === 'finished' && countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      const countdownEl = el('countdown');
      if (countdownEl) countdownEl.textContent = 'Confirmed';
    }
  }

  if (window.DemoStore) {
    DemoStore.subscribe((state) => {
      renderHistory(state);
      renderActiveStatus(state);
    });
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      formError.hidden = true;
      const usdAmount = Number(amountInput.value);
      const currency = currencySelect.value;

      const result = DemoStore.createDeposit(currency, usdAmount);
      if (!result.success) {
        formError.textContent = result.error;
        formError.hidden = false;
        return;
      }

      activeDepositId = result.transaction.id;
      showResult(result.transaction);
    });
  }

  function showResult(tx) {
    resultPanel.hidden = false;

    const asset = DemoStore.CURRENCY_META[tx.currency]?.label || tx.currency.toUpperCase();
    const coinStr = tx.coinAmount.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');

    el('pay-amount').textContent = `${coinStr} ${asset}`;
    el('pay-address').textContent = tx.address;
    el('pay-address').title = tx.address;
    el('payment-id').textContent = tx.paymentId;

    el('qrcode').innerHTML = '';
    // eslint-disable-next-line no-undef
    new QRCode(el('qrcode'), {
      text: tx.address,
      width: 144,
      height: 144,
    });

    const meta = DemoStore.statusMeta(tx.status);
    statusBadge.className = 'pill ' + meta.cls;
    statusBadge.textContent = meta.label;

    startCountdown(tx.expiresAt);
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function startCountdown(expiryTs) {
    if (countdownTimer) clearInterval(countdownTimer);
    const countdownEl = el('countdown');
    if (!countdownEl) return;

    countdownTimer = setInterval(() => {
      const diff = expiryTs - Date.now();
      if (diff <= 0) {
        countdownEl.textContent = 'Expired';
        clearInterval(countdownTimer);
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      countdownEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
    }, 1000);
  }

  function pad(n) {
    return n.toString().padStart(2, '0');
  }

  document.querySelectorAll('[data-copy-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.copyTarget;
      const text = el(targetId).textContent;
      navigator.clipboard.writeText(text).then(() => {
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => (btn.textContent = original), 1500);
      });
    });
  });
})();
