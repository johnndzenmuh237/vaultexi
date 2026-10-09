/* =========================================================
   NOTIFICATIONS.JS — bell dropdown + badge + notifications page.
   Built from real demo deposits/withdrawals (demo-ledger.js).
   Script order doesn't matter: it initialises on window load.
   ========================================================= */
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const readKey = uid => 'vaultex_notif_read_' + uid;

  function ago(ms) {
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  function ensureBadges() {
    document.querySelectorAll('[data-dropdown-trigger="notif-panel"]').forEach(btn => {
      if (btn.querySelector('[data-notif-badge]')) return;
      const b = document.createElement('span');
      b.setAttribute('data-notif-badge', '');
      b.style.cssText = 'position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--coral,#ea3943);color:#fff;font-size:.62rem;font-weight:700;align-items:center;justify-content:center;display:none;';
      btn.appendChild(b);
    });
  }

  function toNotif(t, lastRead) {
    const dep = t.type === 'deposit';
    const amount = `${Number(t.qty).toLocaleString('en-US', { maximumFractionDigits: 8 })} ${t.coin}`;
    return {
      title: dep ? 'Deposit confirmed' : 'Withdrawal confirmed',
      body: dep
        ? `${amount} (${'$' + Number(t.usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}) has been credited to your wallet.`
        : `${amount} (${'$' + Number(t.usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}) was sent to ${String(t.toAddress).slice(0, 8)}…${String(t.toAddress).slice(-6)}.`,
      time: ago(t.createdAtMs),
      unread: t.createdAtMs > lastRead,
      href: 'tx-receipt.html?id=' + encodeURIComponent(t.id),
    };
  }

  function render(notifs) {
    document.querySelectorAll('[data-notif-list]').forEach(list => {
      list.innerHTML = notifs.length ? notifs.map(n => `
        <a href="${n.href}" class="security-row" style="align-items:flex-start;text-decoration:none;color:inherit;">
          <div>
            <strong style="font-size:.88rem;">${esc(n.title)}</strong>
            <p style="margin:4px 0 0;font-size:.83rem;">${esc(n.body)}</p>
            <span style="font-size:.74rem;color:var(--muted);">${esc(n.time)}</span>
          </div>
          ${n.unread ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--mint);flex-shrink:0;margin-top:4px;"></span>' : ''}
        </a>`).join('')
        : '<p style="padding:18px 4px;font-size:.85rem;color:var(--muted);">No notifications yet — deposits and withdrawals will show up here.</p>';
    });
    const unread = notifs.filter(n => n.unread).length;
    document.querySelectorAll('[data-notif-badge]').forEach(b => {
      b.textContent = unread;
      b.style.display = unread ? 'flex' : 'none';
    });
  }

  function init() {
    ensureBadges();
    render([]);
    if (!window.VaultexDemo) return;

    VaultexDemo.whenUser(user => {
      let items = [];
      const lastRead = () => Number(localStorage.getItem(readKey(user.uid)) || 0);
      const draw = () => render(items.slice(0, 30).map(t => toNotif(t, lastRead())));

      VaultexDemo.onTransactions(user.uid, list => { items = list; draw(); }, 30);
      setInterval(draw, 60000); // keep "2m ago" labels fresh

      document.querySelectorAll('[data-notif-read-all]').forEach(btn => {
        btn.addEventListener('click', () => {
          localStorage.setItem(readKey(user.uid), String(Date.now()));
          draw();
        });
      });
    });
  }

  window.addEventListener('load', init);
})();
