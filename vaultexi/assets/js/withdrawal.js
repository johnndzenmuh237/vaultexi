/* =========================================================
   WITHDRAWAL.JS — DEMO withdrawal flow (no admin review, no backend).
   Script order on withdrawals.html:
     firebase-* -> firebase-init.js -> auth-guard.js -> demo-ledger.js -> withdrawal.js
   ========================================================= */
(function () {
  'use strict';
  const V = window.VaultexDemo;
  const el = id => document.getElementById(id);

  const sel = el('wd-currency');
  const addr = el('wd-address');
  const amt = el('wd-amount');
  const quoteEl = el('wd-quote');
  const availEl = el('wd-available');
  const btn = el('wd-submit-btn');
  const errEl = el('wd-form-error');
  const historyBody = el('wd-history-body');
  let user = null;
  let wallet = { raw: {} };

  function renderAvailable() {
    const c = V.COINS[sel.value];
    const qty = Number(wallet.raw[c.base]) || 0;
    availEl.textContent = `${V.fmtQty(qty)} ${c.base}`;
  }

  async function updateQuote() {
    const c = V.COINS[sel.value];
    const usd = parseFloat(amt.value) || 0;
    if (!usd) { quoteEl.textContent = 'Enter an amount to see how much will be sent.'; return; }
    try {
      const price = await V.getPrice(c.base);
      quoteEl.textContent = `You will send ≈ ${V.fmtQty(V.floor8(usd / price))} ${c.base}  ·  1 ${c.base} = ${V.fmtUSD(price)}`;
    } catch (e) { quoteEl.textContent = 'Live price unavailable right now.'; }
  }
  sel.addEventListener('change', () => { renderAvailable(); updateQuote(); });
  amt.addEventListener('input', updateQuote);

  function showError(m) { errEl.textContent = m; errEl.hidden = false; }

  btn.addEventListener('click', async () => {
    errEl.hidden = true;
    if (!user) return showError('Please sign in again.');
    btn.disabled = true; btn.textContent = 'Processing…';
    try {
      const tx = await V.withdraw(user.uid, sel.value, parseFloat(amt.value), addr.value);
      showResult(tx);
      amt.value = ''; updateQuote();
    } catch (e) {
      showError(e.message || 'Withdrawal failed.');
    } finally {
      btn.disabled = false; btn.textContent = 'Proceed';
    }
  });

  function showResult(tx) {
    el('wd-status-empty').hidden = true;
    el('wd-status-detail').hidden = false;
    const badge = el('wd-status-badge');
    badge.hidden = false; badge.className = 'pill pill-success'; badge.textContent = 'Confirmed';
    el('wd-detail-currency').textContent = `${tx.coin} · ${tx.network}`;
    el('wd-detail-amount').textContent = `${V.fmtQty(tx.qty)} ${tx.coin} (${V.fmtUSD(tx.usd)})`;
    el('wd-detail-from').textContent = tx.fromAddress;
    el('wd-detail-address').textContent = tx.toAddress;
    el('wd-detail-hash').textContent = tx.hash;
    el('wd-detail-conf').textContent = `${tx.confirmations}/${tx.requiredConfirmations}`;
    el('wd-detail-time').textContent = new Date(tx.createdAtMs).toLocaleString();
    el('wd-receipt-link').href = V.receiptUrl(tx.id);
  }

  function renderHistory(list) {
    const rows = list.filter(t => t.type === 'withdrawal').slice(0, 10);
    if (!rows.length) return;
    historyBody.innerHTML = rows.map(t => `
      <tr>
        <td>${V.esc(new Date(t.createdAtMs).toLocaleString())}</td>
        <td>${V.esc(t.coin)}</td>
        <td>${V.fmtUSD(t.usd)} <span style="color:var(--muted)">(${V.fmtQty(t.qty)} ${V.esc(t.coin)})</span></td>
        <td class="mono">${V.esc(t.toAddress.slice(0, 8))}…${V.esc(t.toAddress.slice(-6))}</td>
        <td><span class="pill pill-success">Confirmed</span></td>
        <td class="mono"><a href="${V.receiptUrl(t.id)}">Receipt</a></td>
      </tr>`).join('');
  }

  auth.onAuthStateChanged(u => {
    user = u;
    if (!u) return;
    V.onWallet(u.uid, w => { wallet = w; renderAvailable(); });
    V.onTransactions(u.uid, renderHistory, 25);
  });
  renderAvailable();
  updateQuote();
})();