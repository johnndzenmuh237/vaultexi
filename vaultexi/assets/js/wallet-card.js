/* Shared "Total balance" card (total, allocation bar, one chip per coin with logo) — same look as the Assets page.
   Usage: const card = VaultexWalletCard.mount(containerEl);
          card.update({ coins:[{base,qty,price}], stakedUsd:0, sub:'optional text' }); */
(function () {
  'use strict';
  const PAL = ['#6C7CFF', '#16c784', '#f7a600', '#ea3943', '#00bcd4', '#e91e63', '#9c27b0', '#8bc34a'];
  const css = `
  .vxw{padding:20px 22px;background:var(--ink-soft,#121829);border:1px solid var(--line,#262E45);border-radius:var(--radius-lg,16px);color:var(--paper,#E9ECF6)}
  .vxw .at-top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
  .vxw .at-k{font-size:.72rem;color:var(--muted,#8993AB);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
  .vxw .at-v{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:2.1rem;line-height:1.1}
  .vxw .at-sub{font-size:.82rem;color:var(--muted,#8993AB);text-align:right}
  .vxw .at-bar{display:flex;height:8px;border-radius:6px;overflow:hidden;margin:16px 0 12px;background:var(--ink-raise,#1B2236)}
  .vxw .at-bar i{display:block;height:100%}
  .vxw .at-chips{display:flex;flex-wrap:wrap;gap:10px}
  .vxw .at-chip{display:flex;align-items:center;gap:10px;padding:9px 14px;border:1px solid var(--line,#262E45);border-radius:12px;background:var(--ink-raise,#1B2236)}
  .vxw .at-chip img{width:28px;height:28px;border-radius:50%;background:#fff;padding:2px;box-sizing:border-box;object-fit:contain}
  .vxw .at-chip b{display:block;font-size:.86rem}
  .vxw .at-chip small{display:block;font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--muted,#8993AB)}
  .vxw .at-chip .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;display:inline-block;margin-right:6px}
  @media(max-width:640px){.vxw .at-v{font-size:1.6rem}.vxw .at-sub{text-align:left}}`;
  const money = n => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const qtyF = n => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 6 });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function mount(host) {
    if (!document.getElementById('vxw-css')) { const s = document.createElement('style'); s.id = 'vxw-css'; s.textContent = css; document.head.appendChild(s); }
    host.classList.add('vxw');
    host.innerHTML = '<div class="at-top"><div><div class="at-k">Total balance</div><div class="at-v" data-t>$0.00</div></div><div class="at-sub" data-s>Loading your assets…</div></div><div class="at-bar" data-b></div><div class="at-chips" data-c></div>';
    const q = a => host.querySelector('[' + a + ']');
    let last = '';
    return {
      update(o) {
        const coins = (o.coins || []).map(c => ({ base: String(c.base).toUpperCase(), qty: Number(c.qty) || 0, price: Number(c.price) || (String(c.base).toUpperCase() === 'USDT' ? 1 : 0) }))
          .map(c => Object.assign(c, { value: c.qty * c.price })).filter(c => c.qty > 1e-12).sort((a, b) => b.value - a.value);
        const stk = Number(o.stakedUsd) || 0;
        const total = coins.reduce((s, c) => s + c.value, 0) + stk;
        const sig = JSON.stringify([coins.map(c => [c.base, c.qty, Math.round(c.price * 100)]), Math.round(stk * 100), o.sub]);
        if (sig === last) return; last = sig;
        q('data-t').textContent = money(total);
        q('data-s').textContent = o.sub != null ? o.sub : (coins.length ? coins.length + (coins.length === 1 ? ' asset' : ' assets') + ' held' + (stk > 0.005 ? ' · ' + money(stk) + ' staked' : '') + ' · live market prices' : 'No assets yet — deposit a coin to get started');
        q('data-b').innerHTML = total > 0 ? coins.map((c, i) => `<i style="width:${Math.max(0.5, c.value / total * 100).toFixed(2)}%;background:${PAL[i % PAL.length]}" title="${esc(c.base)}"></i>`).join('') +
          (stk > 0.005 ? `<i style="width:${Math.max(0.5, stk / total * 100).toFixed(2)}%;background:#8993AB" title="Staked"></i>` : '') : '';
        q('data-c').innerHTML = coins.map((c, i) => `<div class="at-chip"><img src="https://assets.coincap.io/assets/icons/${esc(c.base.toLowerCase())}@2x.png" alt="" onerror="this.style.visibility='hidden'"><div><b><span class="dot" style="background:${PAL[i % PAL.length]}"></span>${esc(c.base)}</b><small>${qtyF(c.qty)} · ${money(c.value)}${total > 0 ? ' · ' + (c.value / total * 100).toFixed(1) + '%' : ''}</small></div></div>`).join('') +
          (stk > 0.005 ? `<div class="at-chip"><div><b><span class="dot" style="background:#8993AB"></span>Staked</b><small>${money(stk)}${total > 0 ? ' · ' + (stk / total * 100).toFixed(1) + '%' : ''}</small></div></div>` : '');
      }
    };
  }
  window.VaultexWalletCard = { mount };
})();
