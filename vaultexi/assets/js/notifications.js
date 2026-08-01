/* =========================================================
   NOTIFICATIONS.JS — notification bell dropdown + badge
   ---------------------------------------------------------
   Now driven live by window.DemoStore: every simulated
   deposit/withdrawal pushes a real notification here instead
   of the old hardcoded static list.
   ========================================================= */

(function () {
  'use strict';

  function ensureBadges() {
    document.querySelectorAll('[data-dropdown-trigger="notif-panel"]').forEach((btn) => {
      if (btn.querySelector('[data-notif-badge]')) return;
      const badge = document.createElement('span');
      badge.setAttribute('data-notif-badge', '');
      badge.style.cssText = 'position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--coral);color:#fff;font-size:.62rem;font-weight:700;display:none;align-items:center;justify-content:center;line-height:1;';
      btn.appendChild(badge);
    });
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function render(state) {
    ensureBadges();

    const list = document.querySelector('[data-notif-list]');
    const notifs = state.notifications || [];

    if (list) {
      list.innerHTML = notifs.length
        ? notifs.map(n => `
          <div class="security-row" style="align-items:flex-start;">
            <div>
              <strong style="font-size:.88rem;">${n.title}</strong>
              <p style="margin:4px 0 0;font-size:.83rem;">${n.body}</p>
              <span style="font-size:.74rem;color:var(--muted);">${timeAgo(n.ts)}</span>
            </div>
            ${n.unread ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--mint);flex-shrink:0;margin-top:4px;"></span>' : ''}
          </div>`).join('')
        : `<div class="security-row"><p style="font-size:.85rem;color:var(--muted);margin:0;">No notifications yet.</p></div>`;
    }

    const unreadCount = notifs.filter(n => n.unread).length;
    document.querySelectorAll('[data-notif-badge]').forEach((b) => {
      b.textContent = unreadCount;
      b.style.display = unreadCount ? 'flex' : 'none';
    });
  }

  if (window.DemoStore) {
    DemoStore.subscribe(render);
  }

})();