/* =========================================================
   DEPOSIT.JS — DEMO deposit flow (no NOWPayments, no backend).
   Script order on deposits.html:
     firebase-* -> firebase-init.js -> auth-guard.js -> demo-ledger.js -> deposit.js
   ========================================================= */
(function () {
  'use strict';
  const V = window.VaultexDemo;
  const el = id => document.getElementById(id);

  const sel = el('currency-select');
  const amountInput = el('amount-input');
  const quoteEl = el('quote');
  const btn = el('generate-btn');
  const errEl = el('form-error');
  const panel = el('result-panel');
  const historyBody = el('history-body');
  let user = null;

  async function updateQuote() {
    const c = V.COINS[sel.value];
    const usd = parseFloat(amountInput.value) || 0;
    if (!usd) { quoteEl.textContent = 'Enter an amount to see how much you will receive.'; return; }
    try {
      const price = await V.getPrice(c.base);
      quoteEl.textContent = `≈ ${V.fmtQty(V.floor8(usd / price))} ${c.base}  ·  1 ${c.base} = ${V.fmtUSD(price)}`;
    } catch (e) { quoteEl.textContent = 'Live price unavailable right now.'; }
  }
  sel.addEventListener('change', updateQuote);
  amountInput.addEventListener('input', updateQuote);

  function showError(msg) { errEl.textContent = msg; errEl.hidden = false; }

  btn.addEventListener('click', async () => {
    errEl.hidden = true;
    if (!user) return showError('Please sign in again.');
    btn.disabled = true; btn.textContent = 'Processing…';
    try {
      const tx = await V.deposit(user.uid, sel.value, parseFloat(amountInput.value));
      showResult(tx);
      amountInput.value = ''; updateQuote();
    } catch (e) {
      showError(e.message || 'Deposit failed.');
    } finally {
      btn.disabled = false; btn.textContent = 'Proceed';
    }
  });

  function showResult(tx) {
    panel.hidden = false;
    el('r-credited').textContent = `${V.fmtQty(tx.qty)} ${tx.coin}  (${V.fmtUSD(tx.usd)})`;
    el('r-network').textContent = tx.network;
    el('r-from').textContent = tx.fromAddress;
    el('r-to').textContent = tx.toAddress;
    el('r-hash').textContent = tx.hash;
    el('r-conf').textContent = `${tx.confirmations}/${tx.requiredConfirmations}`;
    el('r-time').textContent = new Date(tx.createdAtMs).toLocaleString();
    el('r-link').href = V.receiptUrl(tx.id);
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderHistory(list) {
    const rows = list.filter(t => t.type === 'deposit').slice(0, 10);
    if (!rows.length) return;
    historyBody.innerHTML = rows.map(t => `
      <tr>
        <td>${V.esc(new Date(t.createdAtMs).toLocaleString())}</td>
        <td>${V.esc(t.coin)}</td>
        <td>${V.fmtUSD(t.usd)} <span style="color:var(--muted)">(${V.fmtQty(t.qty)} ${V.esc(t.coin)})</span></td>
        <td><span class="pill pill-success">Confirmed</span></td>
        <td class="mono"><a href="${V.receiptUrl(t.id)}">${V.esc(t.hash.slice(0, 10))}…${V.esc(t.hash.slice(-6))}</a></td>
      </tr>`).join('');
  }

  document.querySelectorAll('[data-copy-target]').forEach(b => {
    b.addEventListener('click', () => {
      navigator.clipboard.writeText(el(b.dataset.copyTarget).textContent).then(() => {
        const o = b.textContent; b.textContent = 'Copied!'; setTimeout(() => (b.textContent = o), 1500);
      });
    });
  });

  auth.onAuthStateChanged(u => {
    user = u;
    if (u) V.onTransactions(u.uid, renderHistory, 25);
  });
  updateQuote();
})();