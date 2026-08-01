/* ============================================================
   VaultexDemoStore (v3)
   ------------------------------------------------------------
   THE single source of truth for the simulated balance across
   EVERY page: Dashboard, Deposits, Withdrawals, Trading Center,
   AutoTrading, Staking, NFT Marketplace, Earnings.

   THIS FILE INTENTIONALLY CONTAINS NO NETWORK CALLS.
   - No Firebase / Firestore, no /api/* backend requests
   - No admin approval step of any kind

   Money flow:
     Deposits (deposit.js)      -> credit balance
     Withdrawals (withdrawal.js)-> debit balance, no admin gate
     Manual trading (trading page) -> debit on buy, credit on sell
     AutoTrading bot            -> credit/debit each simulated tick
     Staking                    -> debit to convert into a coin
                                    position, credit back (principal
                                    + reward) on unstake
     NFT mints                  -> debit only (no resale mechanic)

   Every one of those categories writes into the SAME
   `transactions` ledger below, so the dashboard, transactions
   page, and earnings page all show one consistent history and
   one consistent balance — and anything earned anywhere is
   immediately part of the balance that withdrawals.html can
   draw down.
   ============================================================ */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'vaultex_demo_ledger_v2';
  const DEMO_LABEL = 'ACTIVE';
  const DAILY_WITHDRAWAL_LIMIT = 100000;

  // Simulated USD rates — for demo display/conversion only, not live prices.
  const CURRENCY_META = {
    btc:        { label: 'BTC',  rate: 65000 },
    eth:        { label: 'ETH',  rate: 3400 },
    ltc:        { label: 'LTC',  rate: 90 },
    sol:        { label: 'SOL',  rate: 165 },
    bnb:        { label: 'BNB',  rate: 580 },
    trx:        { label: 'TRX',  rate: 0.13 },
    doge:       { label: 'DOGE', rate: 0.15 },
    xrp:        { label: 'XRP',  rate: 0.55 },
    usdterc20:  { label: 'USDT (ERC20)', rate: 1 },
    usdttrc20:  { label: 'USDT (TRC20)', rate: 1 },
    usdtbep20:  { label: 'USDT (BEP20)', rate: 1 },
  };

  const STATUS_META = {
    waiting:    { label: 'Waiting for payment',             cls: 'pill-neutral' },
    confirming: { label: 'Confirming on-chain (simulated)',  cls: 'pill-info' },
    finished:   { label: 'Confirmed — balance updated',      cls: 'pill-success' },
    completed:  { label: 'Completed',                        cls: 'pill-success' },
    failed:     { label: 'Failed',                            cls: 'pill-danger' },
    rejected:   { label: 'Rejected',                          cls: 'pill-danger' },
    simulated:  { label: 'Simulated',                         cls: 'pill-neutral' },
  };

  const STARTING_STATE = () => ({
    balance: 10000, // fake starting play-money balance
    createdAt: Date.now(),
    transactions: [], // { id, ts, type, status, usdAmount, label, currency?, coinAmount?, address?, paymentId?, expiresAt?, pair?, side?, pnl? }
    notifications: [
      { id: _id(), ts: Date.now() - 5 * 60 * 60 * 1000, title: 'Welcome to demo mode', body: 'This entire account is simulated. Try a demo deposit to get started — it will fund every part of the site: Trading, AutoTrading, Staking, and NFTs.', unread: false },
    ],
    allocation: [{ label: 'Balance', value: 10000, color: '#2ee6a6' }],
  });

  function _id() {
    return 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function _randHex(len) {
    let s = '';
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }

  function generateDemoAddress(currency) {
    const code = (CURRENCY_META[currency]?.label || currency || 'ASSET').replace(/\s.*$/, '');
    return `DEMO-${code.toUpperCase()}-${_randHex(24)}`;
  }

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return STARTING_STATE();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.balance !== 'number') return STARTING_STATE();
      if (!Array.isArray(parsed.notifications)) parsed.notifications = [];
      return parsed;
    } catch (e) {
      console.warn('DemoStore: failed to read local state, resetting', e);
      return STARTING_STATE();
    }
  }

  let _state = _load();
  const _listeners = new Set();

  function _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    _listeners.forEach(fn => {
      try { fn(_state); } catch (e) { console.error('DemoStore listener error', e); }
    });
  }

  function subscribe(fn) {
    _listeners.add(fn);
    fn(_state);
    return () => _listeners.delete(fn);
  }

  function getState() {
    return _state;
  }

  function statusMeta(status) {
    return STATUS_META[status] || STATUS_META.waiting;
  }

  function addNotification(title, body) {
    _state = {
      ..._state,
      notifications: [
        { id: _id(), ts: Date.now(), title, body, unread: true },
        ..._state.notifications,
      ].slice(0, 30),
    };
  }

  function markAllRead() {
    _state = {
      ..._state,
      notifications: _state.notifications.map(n => ({ ...n, unread: false })),
    };
    _save();
  }

  /* ----------------------------------------------------------
     GENERIC DEBIT / CREDIT — used by Trading, Staking, NFT,
     and AutoTrading to spend from / earn into the ONE shared
     balance. Every call writes a transaction into the same
     ledger the dashboard, transactions page, and earnings page
     all read from.

     meta: {
       category: 'Trade' | 'Bot' | 'Stake' | 'NFT' | ...
       label:    human-readable description shown in tables
       extra:    optional extra fields merged onto the tx
                 (e.g. { pair, side, pnl })
       notify:   set false to skip a notification (default true
                 for credit, false for debit)
     }
  ---------------------------------------------------------- */
  function debit(amount, meta) {
    meta = meta || {};
    amount = Number(amount);
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: 'Invalid amount.' };
    if (amount > _state.balance) return { success: false, error: 'Amount exceeds your available balance.' };

    const tx = {
      id: _id(), ts: Date.now(), type: meta.category || 'Spend', status: 'completed',
      usdAmount: -amount, label: meta.label || '', ...(meta.extra || {}),
    };
    _state = { ..._state, balance: _state.balance - amount, transactions: [tx, ..._state.transactions] };
    if (meta.notify) addNotification(meta.notifyTitle || `${meta.category || 'Spend'}`, meta.label || `$${amount.toFixed(2)} deducted from your balance.`);
    _save();
    return { success: true, transaction: tx };
  }

  function credit(amount, meta) {
    meta = meta || {};
    amount = Number(amount);
    if (!Number.isFinite(amount)) return { success: false, error: 'Invalid amount.' };

    const tx = {
      id: _id(), ts: Date.now(), type: meta.category || 'Earn', status: 'completed',
      usdAmount: amount, label: meta.label || '', ...(meta.extra || {}),
    };
    _state = { ..._state, balance: Math.max(0, _state.balance + amount), transactions: [tx, ..._state.transactions] };
    if (meta.notify !== false) {
      addNotification(meta.notifyTitle || `${meta.category || 'Earning'} credited`, meta.label || `$${amount.toFixed(2)} added to your balance.`);
    }
    _save();
    return { success: true, transaction: tx };
  }

  /* ----------------------------------------------------------
     DEPOSIT — shows a simulated address/QR flow like a real
     payment processor, then auto-confirms after a short mock
     delay and credits balance. No real payment ever occurs.
  ---------------------------------------------------------- */
  function createDeposit(currency, usdAmount) {
    usdAmount = Number(usdAmount);
    if (!CURRENCY_META[currency]) return { success: false, error: 'Unsupported asset.' };
    if (!Number.isFinite(usdAmount) || usdAmount < 5) {
      return { success: false, error: 'Enter an amount of at least $5.00.' };
    }

    const rate = CURRENCY_META[currency].rate;
    const coinAmount = usdAmount / rate;
    const tx = {
      id: _id(),
      ts: Date.now(),
      type: 'Deposit',
      status: 'waiting',
      currency,
      usdAmount,
      coinAmount,
      address: generateDemoAddress(currency),
      paymentId: 'pay_' + _id().slice(3),
      expiresAt: Date.now() + 15 * 60 * 1000,
    };

    _state = { ..._state, transactions: [tx, ..._state.transactions] };
    _save();

    setTimeout(() => _advanceDeposit(tx.id, 'confirming'), 4000);
    setTimeout(() => _advanceDeposit(tx.id, 'finished'), 9000);

    return { success: true, transaction: tx };
  }

  function _advanceDeposit(id, status) {
    const tx = _state.transactions.find(t => t.id === id);
    if (!tx || tx.status === 'finished' || tx.status === 'failed') return;

    const updated = { ...tx, status };
    _state = {
      ..._state,
      transactions: _state.transactions.map(t => (t.id === id ? updated : t)),
      balance: status === 'finished' ? _state.balance + tx.usdAmount : _state.balance,
    };
    if (status === 'finished') {
      addNotification(
        'Deposit confirmed',
        `${tx.coinAmount.toFixed(6)} ${CURRENCY_META[tx.currency].label} ($${tx.usdAmount.toFixed(2)}) credited to your simulated balance.`
      );
    }
    _save();
  }

  /* ----------------------------------------------------------
     WITHDRAW — instant, simulated. No admin approval, no queue.
     Draws from the SAME balance every other page feeds into.
  ---------------------------------------------------------- */
  function withdraw(currency, address, usdAmount) {
    usdAmount = Number(usdAmount);
    if (!CURRENCY_META[currency]) return { success: false, error: 'Unsupported asset.' };
    if (!address || address.trim().length < 20) {
      return { success: false, error: 'Enter a valid-looking recipient address.' };
    }
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      return { success: false, error: 'Enter a valid amount.' };
    }
    if (usdAmount > _state.balance) {
      return { success: false, error: 'Amount exceeds your available simulated balance.' };
    }

    const rate = CURRENCY_META[currency].rate;
    const tx = {
      id: _id(),
      ts: Date.now(),
      type: 'Withdrawal',
      status: 'completed',
      currency,
      usdAmount: -usdAmount,
      coinAmount: usdAmount / rate,
      address: address.trim(),
    };

    _state = {
      ..._state,
      balance: _state.balance - usdAmount,
      transactions: [tx, ..._state.transactions],
    };
    addNotification(
      'Withdrawal completed',
      `$${usdAmount.toFixed(2)} (${CURRENCY_META[currency].label}) sent to ${tx.address.slice(0, 10)}…${tx.address.slice(-6)}.`
    );
    _save();
    return { success: true, transaction: tx };
  }

  /* ----------------------------------------------------------
     TRADE — legacy convenience wrapper around credit(), kept
     for simple pair/side/pnl entries.
  ---------------------------------------------------------- */
  function trade(pair, side, pnl) {
    pnl = Number(pnl) || 0;
    return credit(pnl, { category: 'Trade', label: `${pair || ''} ${side || ''}`.trim(), extra: { pair, side, pnl }, notify: false });
  }

  function usedTodayForWithdrawals() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return _state.transactions
      .filter(t => t.type === 'Withdrawal' && t.status === 'completed' && t.ts >= startOfDay.getTime())
      .reduce((sum, t) => sum + Math.abs(t.usdAmount), 0);
  }

  function resetDemo() {
    _state = STARTING_STATE();
    _save();
  }

  /* ----------------------------------------------------------
     GLOBAL CHROME — auto-binds elements present on ANY page:
     [data-user-balance] text.
  ---------------------------------------------------------- */
  function _renderGlobalChrome(state) {
    document.querySelectorAll('[data-user-balance]').forEach(el => {
      el.textContent = `$${state.balance.toFixed(2)}`;
    });
  }

  subscribe(_renderGlobalChrome);

  // Cross-tab sync: if balance changes in another tab (e.g. a deposit
  // made on the Dashboard while Trading Center is open elsewhere),
  // reload state here and notify this page's listeners too.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    _state = _load();
    _listeners.forEach(fn => {
      try { fn(_state); } catch (err) { console.error('DemoStore listener error', err); }
    });
  });

  global.DemoStore = {
    DEMO_LABEL,
    DAILY_WITHDRAWAL_LIMIT,
    CURRENCY_META,
    subscribe,
    getState,
    statusMeta,
    generateDemoAddress,
    createDeposit,
    withdraw,
    trade,
    debit,
    credit,
    addNotification,
    markAllRead,
    usedTodayForWithdrawals,
    resetDemo,
  };
})(window);
