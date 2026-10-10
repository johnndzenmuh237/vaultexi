/* =========================================================
   TRADING-INDICATORS.JS — technical-analysis tools for the Trading Center.

   • Indicators button: searchable library of ~55 indicators (moving averages,
     Bollinger / Keltner / Donchian / Ichimoku / Supertrend / PSAR / VWAP,
     RSI, MACD, Stochastic, StochRSI, ADX, CCI, MFI, OBV, Aroon …) with real
     settings (lengths, source, multipliers, colours, line width, show/hide).
     Overlays draw on the price chart; oscillators get their own synced pane.
   • Drawing tools: trend line, ray, horizontal / vertical line, rectangle,
     Fibonacci retracement, measure, text note. Click-click to draw, drag to
     move, drag the handles to resize, Delete key / bar to remove, magnet to
     snap to OHLC. Saved per coin in the browser./* =========================================================
   TRADING-INDICATORS.JS — technical-analysis tools for the Trading Center.

   • Indicators button: searchable library of ~55 indicators (moving averages,
     Bollinger / Keltner / Donchian / Ichimoku / Supertrend / PSAR / VWAP,
     RSI, MACD, Stochastic, StochRSI, ADX, CCI, MFI, OBV, Aroon …) with real
     settings (lengths, source, multipliers, colours, line width, show/hide).
     Overlays draw on the price chart; oscillators get their own synced pane.
   • Drawing tools: trend line, ray, horizontal / vertical line, rectangle,
     Fibonacci retracement, measure, text note. Click-click to draw, drag to
     move, drag the handles to resize, Delete key / bar to remove, magnet to
     snap to OHLC. Saved per coin in the browser.
   • Chart legend with live OHLC + indicator values under the crosshair.
   • Log-scale toggle.

   Everything is saved in localStorage ("vaultex_ta_*"), so your layout is
   still there after a refresh. Pure client-side; uses the candles the page
   already loads from Binance.
   Needs the hooks (__vxOnCandles / __vxOnTick / __vxTerminal) that are added
   to trading.html's own script.
   ========================================================= */
(function () {
  'use strict';
  console.log('[trading-indicators] loaded');
  const LW = window.LightweightCharts;
  if (!LW) { console.error('[trading-indicators] lightweight-charts is not loaded'); return; }

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full / blocked */ } };

  /* =====================================================================
     1. MATH
     Series are arrays aligned with the candles; `null` = not defined yet.
     ===================================================================== */
  const nul = n => new Array(n).fill(null);
  const ok = v => v != null && !isNaN(v);
  const first = x => { for (let i = 0; i < x.length; i++) if (ok(x[i])) return i; return -1; };
  const map2 = (a, b, f) => a.map((v, i) => (ok(v) && ok(b[i])) ? f(v, b[i], i) : null);
  const map1 = (a, f) => a.map((v, i) => ok(v) ? f(v, i) : null);

  function sma(x, p) {
    const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o;
    let sum = 0;
    for (let i = s0; i < n; i++) { sum += x[i]; if (i - s0 >= p) sum -= x[i - p]; if (i - s0 >= p - 1) o[i] = sum / p; }
    return o;
  }
  function ema(x, p, alpha) {
    const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o;
    const k = alpha || 2 / (p + 1); let prev = null, sum = 0;
    for (let i = s0; i < n; i++) {
      const j = i - s0;
      if (j < p - 1) { sum += x[i]; continue; }
      if (j === p - 1) { sum += x[i]; prev = sum / p; } else prev = x[i] * k + prev * (1 - k);
      o[i] = prev;
    }
    return o;
  }
  const rma = (x, p) => ema(x, p, 1 / p);
  function wma(x, p) {
    const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o;
    const den = p * (p + 1) / 2;
    for (let i = s0 + p - 1; i < n; i++) { let s = 0; for (let k = 0; k < p; k++) s += x[i - p + 1 + k] * (k + 1); o[i] = s / den; }
    return o;
  }
  function hma(x, p) {
    const h = Math.max(1, Math.floor(p / 2)), r = Math.max(1, Math.round(Math.sqrt(p)));
    const w1 = wma(x, h), w2 = wma(x, p);
    return wma(map2(w1, w2, (a, b) => 2 * a - b), r);
  }
  function vwma(x, v, p) {
    const n = x.length, o = nul(n);
    for (let i = p - 1; i < n; i++) { let a = 0, b = 0; for (let k = i - p + 1; k <= i; k++) { a += x[k] * v[k]; b += v[k]; } o[i] = b ? a / b : null; }
    return o;
  }
  function stdev(x, p) {
    const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o;
    for (let i = s0 + p - 1; i < n; i++) {
      let m = 0; for (let k = i - p + 1; k <= i; k++) m += x[k]; m /= p;
      let s = 0; for (let k = i - p + 1; k <= i; k++) s += (x[k] - m) * (x[k] - m);
      o[i] = Math.sqrt(s / p);
    }
    return o;
  }
  function highest(x, p) { const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o; for (let i = s0 + p - 1; i < n; i++) { let m = -Infinity; for (let k = i - p + 1; k <= i; k++) if (x[k] > m) m = x[k]; o[i] = m; } return o; }
  function lowest(x, p) { const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o; for (let i = s0 + p - 1; i < n; i++) { let m = Infinity; for (let k = i - p + 1; k <= i; k++) if (x[k] < m) m = x[k]; o[i] = m; } return o; }
  function sumN(x, p) { const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o; let s = 0; for (let i = s0; i < n; i++) { s += x[i]; if (i - s0 >= p) s -= x[i - p]; if (i - s0 >= p - 1) o[i] = s; } return o; }
  function trueRange(h, l, c) { return h.map((hv, i) => i === 0 ? hv - l[i] : Math.max(hv - l[i], Math.abs(hv - c[i - 1]), Math.abs(l[i] - c[i - 1]))); }
  const atr = (h, l, c, p) => rma(trueRange(h, l, c), p);
  function linreg(x, p) {
    const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o;
    const sx = p * (p - 1) / 2, sxx = (p - 1) * p * (2 * p - 1) / 6;
    for (let i = s0 + p - 1; i < n; i++) {
      let sy = 0, sxy = 0;
      for (let k = 0; k < p; k++) { const y = x[i - p + 1 + k]; sy += y; sxy += k * y; }
      const slope = (p * sxy - sx * sy) / (p * sxx - sx * sx), icpt = (sy - slope * sx) / p;
      o[i] = icpt + slope * (p - 1);
    }
    return o;
  }
  const shiftArr = (x, k) => { const n = x.length, o = nul(n); for (let i = 0; i < n; i++) { const j = i - k; if (j >= 0 && j < n) o[i] = x[j]; } return o; };

  function srcArr(d, k) {
    switch (k) {
      case 'open': return d.o; case 'high': return d.h; case 'low': return d.l;
      case 'hl2': return d.h.map((v, i) => (v + d.l[i]) / 2);
      case 'hlc3': return d.h.map((v, i) => (v + d.l[i] + d.c[i]) / 3);
      case 'ohlc4': return d.h.map((v, i) => (d.o[i] + v + d.l[i] + d.c[i]) / 4);
      default: return d.c;
    }
  }

  /* =====================================================================
     2. INDICATOR LIBRARY
     overlay:true  -> drawn on the price chart
     overlay:false -> own pane under the chart
     ===================================================================== */
  const NUM = (k, l, d, min, max, step) => ({ k, l, d, t: 'num', min: min == null ? 1 : min, max: max == null ? 1000 : max, step: step || 1 });
  const SRC = { k: 'src', l: 'Source', d: 'close', t: 'sel', o: ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'] };
  const LINE = (k, l, c, extra) => Object.assign({ k, l, c, w: 2, type: 'line' }, extra || {});
  const HIST = (k, l, c, c2, extra) => Object.assign({ k, l, c, c2, w: 1, type: 'hist' }, extra || {});
  const GREEN = '#26a69a', RED = '#ef5350', BLUE = '#2962ff', ORANGE = '#ff6d00', PURPLE = '#7e57c2', YELLOW = '#f7a600', PINK = '#e91e63', CYAN = '#00bcd4';

  const IND = {};
  const add = (id, cat, name, desc, def) => { IND[id] = Object.assign({ id, cat, name, desc, overlay: false, params: [], lines: [], levels: [], future: () => 0 }, def); };

  /* ---- Moving averages (overlay) ---- */
  add('sma', 'Moving averages', 'SMA', 'Simple Moving Average', { overlay: true, params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'SMA', YELLOW)], calc: (d, p) => ({ v: sma(srcArr(d, p.src), p.len) }) });
  add('ema', 'Moving averages', 'EMA', 'Exponential Moving Average', { overlay: true, params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'EMA', BLUE)], calc: (d, p) => ({ v: ema(srcArr(d, p.src), p.len) }) });
  add('wma', 'Moving averages', 'WMA', 'Weighted Moving Average', { overlay: true, params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'WMA', PINK)], calc: (d, p) => ({ v: wma(srcArr(d, p.src), p.len) }) });
  add('hma', 'Moving averages', 'HMA', 'Hull Moving Average', { overlay: true, params: [NUM('len', 'Length', 21), SRC], lines: [LINE('v', 'HMA', CYAN)], calc: (d, p) => ({ v: hma(srcArr(d, p.src), p.len) }) });
  add('smma', 'Moving averages', 'SMMA', 'Smoothed MA (Wilder / RMA)', { overlay: true, params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'SMMA', PURPLE)], calc: (d, p) => ({ v: rma(srcArr(d, p.src), p.len) }) });
  add('vwma', 'Moving averages', 'VWMA', 'Volume Weighted Moving Average', { overlay: true, params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'VWMA', ORANGE)], calc: (d, p) => ({ v: vwma(srcArr(d, p.src), d.v, p.len) }) });
  add('dema', 'Moving averages', 'DEMA', 'Double Exponential MA', { overlay: true, params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'DEMA', GREEN)], calc: (d, p) => { const e1 = ema(srcArr(d, p.src), p.len), e2 = ema(e1, p.len); return { v: map2(e1, e2, (a, b) => 2 * a - b) }; } });
  add('tema', 'Moving averages', 'TEMA', 'Triple Exponential MA', { overlay: true, params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'TEMA', RED)], calc: (d, p) => { const e1 = ema(srcArr(d, p.src), p.len), e2 = ema(e1, p.len), e3 = ema(e2, p.len); return { v: e1.map((a, i) => ok(a) && ok(e2[i]) && ok(e3[i]) ? 3 * a - 3 * e2[i] + e3[i] : null) }; } });
  add('lsma', 'Moving averages', 'LSMA', 'Least Squares MA (linear regression curve)', { overlay: true, params: [NUM('len', 'Length', 25), SRC], lines: [LINE('v', 'LSMA', YELLOW)], calc: (d, p) => ({ v: linreg(srcArr(d, p.src), p.len) }) });
  add('alligator', 'Moving averages', 'Alligator', 'Williams Alligator (jaw / teeth / lips)', {
    overlay: true, params: [NUM('jaw', 'Jaw length', 13), NUM('teeth', 'Teeth length', 8), NUM('lips', 'Lips length', 5)],
    lines: [LINE('jaw', 'Jaw', BLUE, { shift: () => 8 }), LINE('teeth', 'Teeth', RED, { shift: () => 5 }), LINE('lips', 'Lips', GREEN, { shift: () => 3 })],
    future: () => 8,
    calc: (d, p) => { const s = srcArr(d, 'hl2'); return { jaw: rma(s, p.jaw), teeth: rma(s, p.teeth), lips: rma(s, p.lips) }; },
  });

  /* ---- Bands & channels (overlay) ---- */
  add('bb', 'Bands & channels', 'Bollinger Bands', 'Moving average ± standard deviations', {
    overlay: true, params: [NUM('len', 'Length', 20), NUM('mult', 'StdDev', 2, 0.1, 10, 0.1), SRC],
    lines: [LINE('u', 'Upper', BLUE), LINE('b', 'Basis', ORANGE), LINE('l', 'Lower', BLUE)],
    fills: [{ a: 'u', b: 'l', c: 'rgba(41,98,255,.08)' }],
    calc: (d, p) => { const s = srcArr(d, p.src), b = sma(s, p.len), sd = stdev(s, p.len); return { u: map2(b, sd, (m, x) => m + p.mult * x), b, l: map2(b, sd, (m, x) => m - p.mult * x) }; },
  });
  add('keltner', 'Bands & channels', 'Keltner Channels', 'EMA ± ATR multiple', {
    overlay: true, params: [NUM('len', 'EMA length', 20), NUM('mult', 'Multiplier', 2, 0.1, 10, 0.1), NUM('atrLen', 'ATR length', 10), SRC],
    lines: [LINE('u', 'Upper', BLUE), LINE('b', 'Basis', ORANGE), LINE('l', 'Lower', BLUE)],
    fills: [{ a: 'u', b: 'l', c: 'rgba(41,98,255,.07)' }],
    calc: (d, p) => { const b = ema(srcArr(d, p.src), p.len), a = atr(d.h, d.l, d.c, p.atrLen); return { u: map2(b, a, (m, x) => m + p.mult * x), b, l: map2(b, a, (m, x) => m - p.mult * x) }; },
  });
  add('donchian', 'Bands & channels', 'Donchian Channels', 'Highest high / lowest low', {
    overlay: true, params: [NUM('len', 'Length', 20)],
    lines: [LINE('u', 'Upper', BLUE), LINE('b', 'Basis', ORANGE), LINE('l', 'Lower', BLUE)],
    fills: [{ a: 'u', b: 'l', c: 'rgba(41,98,255,.06)' }],
    calc: (d, p) => { const u = highest(d.h, p.len), l = lowest(d.l, p.len); return { u, l, b: map2(u, l, (a, b) => (a + b) / 2) }; },
  });
  add('envelope', 'Bands & channels', 'MA Envelope', 'SMA ± percentage', {
    overlay: true, params: [NUM('len', 'Length', 20), NUM('pct', 'Percent', 2.5, 0.1, 50, 0.1), SRC],
    lines: [LINE('u', 'Upper', GREEN), LINE('b', 'Basis', YELLOW), LINE('l', 'Lower', RED)],
    calc: (d, p) => { const b = sma(srcArr(d, p.src), p.len); return { u: map1(b, v => v * (1 + p.pct / 100)), b, l: map1(b, v => v * (1 - p.pct / 100)) }; },
  });
  add('ichimoku', 'Bands & channels', 'Ichimoku Cloud', 'Tenkan, Kijun, Senkou A/B cloud, Chikou', {
    overlay: true, params: [NUM('conv', 'Conversion', 9), NUM('base', 'Base', 26), NUM('spanB', 'Span B', 52), NUM('disp', 'Displacement', 26)],
    lines: [LINE('tenkan', 'Conversion', BLUE, { w: 1 }), LINE('kijun', 'Base', RED, { w: 1 }), LINE('chikou', 'Lagging', PURPLE, { w: 1, shift: p => -p.disp }),
      LINE('a', 'Span A', GREEN, { w: 1, shift: p => p.disp }), LINE('b', 'Span B', RED, { w: 1, shift: p => p.disp })],
    fills: [{ a: 'a', b: 'b', up: 'rgba(38,166,154,.16)', down: 'rgba(239,83,80,.16)', shiftKey: 'disp' }],
    future: p => p.disp,
    calc: (d, p) => {
      const mid = n => map2(highest(d.h, n), lowest(d.l, n), (a, b) => (a + b) / 2);
      const t = mid(p.conv), k = mid(p.base);
      return { tenkan: t, kijun: k, a: map2(t, k, (x, y) => (x + y) / 2), b: mid(p.spanB), chikou: d.c.slice() };
    },
  });
  add('psar', 'Bands & channels', 'Parabolic SAR', 'Stop-and-reverse dots', {
    overlay: true, params: [NUM('start', 'Start', 0.02, 0.001, 1, 0.001), NUM('inc', 'Increment', 0.02, 0.001, 1, 0.001), NUM('max', 'Max', 0.2, 0.01, 1, 0.01)],
    lines: [LINE('v', 'SAR', BLUE, { type: 'dots', c2: ORANGE })],
    calc: (d, p) => {
      const n = d.c.length, o = nul(n), bullArr = nul(n); if (n < 3) return { v: o, bull: bullArr };
      let bull = d.c[1] >= d.c[0], ep = bull ? d.h[0] : d.l[0], sar = bull ? d.l[0] : d.h[0], af = p.start;
      for (let i = 1; i < n; i++) {
        sar = sar + af * (ep - sar);
        if (bull) {
          sar = Math.min(sar, d.l[i - 1], i > 1 ? d.l[i - 2] : d.l[i - 1]);
          if (d.l[i] < sar) { bull = false; sar = ep; ep = d.l[i]; af = p.start; }
          else if (d.h[i] > ep) { ep = d.h[i]; af = Math.min(af + p.inc, p.max); }
        } else {
          sar = Math.max(sar, d.h[i - 1], i > 1 ? d.h[i - 2] : d.h[i - 1]);
          if (d.h[i] > sar) { bull = true; sar = ep; ep = d.h[i]; af = p.start; }
          else if (d.l[i] < ep) { ep = d.l[i]; af = Math.min(af + p.inc, p.max); }
        }
        o[i] = sar; bullArr[i] = bull ? 1 : 0;
      }
      return { v: o, bull: bullArr };
    },
  });
  add('supertrend', 'Bands & channels', 'Supertrend', 'ATR trend-following stop line', {
    overlay: true, params: [NUM('len', 'ATR length', 10), NUM('mult', 'Factor', 3, 0.1, 20, 0.1)],
    lines: [LINE('up', 'Up trend', GREEN), LINE('dn', 'Down trend', RED)],
    calc: (d, p) => {
      const n = d.c.length, a = atr(d.h, d.l, d.c, p.len), up = nul(n), dn = nul(n);
      let fub = null, flb = null, dir = 1, started = false;
      for (let i = 0; i < n; i++) {
        if (!ok(a[i])) continue;
        const hl2 = (d.h[i] + d.l[i]) / 2; let ub = hl2 + p.mult * a[i], lb = hl2 - p.mult * a[i];
        if (started) {
          ub = (ub < fub || d.c[i - 1] > fub) ? ub : fub;
          lb = (lb > flb || d.c[i - 1] < flb) ? lb : flb;
          if (dir === -1 && d.c[i] > ub) dir = 1; else if (dir === 1 && d.c[i] < lb) dir = -1;
        }
        fub = ub; flb = lb; started = true;
        if (dir === 1) up[i] = lb; else dn[i] = ub;
      }
      return { up, dn };
    },
  });
  add('vwap', 'Bands & channels', 'VWAP', 'Volume Weighted Average Price (resets each period)', {
    overlay: true, params: [{ k: 'anchor', l: 'Anchor', d: 'Day', t: 'sel', o: ['Day', 'Week', 'Month', 'Range'] }],
    lines: [LINE('v', 'VWAP', PINK)],
    calc: (d, p) => {
      const n = d.c.length, o = nul(n); let pv = 0, vv = 0, key = null;
      let anchor = p.anchor; if (d.step >= 86400 && anchor === 'Day') anchor = 'Range';
      for (let i = 0; i < n; i++) {
        const dt = new Date(d.t[i] * 1000);
        let k = 'all';
        if (anchor === 'Day') k = dt.toISOString().slice(0, 10);
        else if (anchor === 'Month') k = dt.toISOString().slice(0, 7);
        else if (anchor === 'Week') { const t = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); k = t.toISOString().slice(0, 10); }
        if (k !== key) { key = k; pv = 0; vv = 0; }
        const tp = (d.h[i] + d.l[i] + d.c[i]) / 3; pv += tp * d.v[i]; vv += d.v[i]; o[i] = vv ? pv / vv : null;
      }
      return { v: o };
    },
  });

  /* ---- Momentum (pane) ---- */
  const RSI_CALC = (c, len) => {
    const n = c.length, g = nul(n), l = nul(n);
    for (let i = 1; i < n; i++) { const df = c[i] - c[i - 1]; g[i] = df > 0 ? df : 0; l[i] = df < 0 ? -df : 0; }
    const ag = rma(g, len), al = rma(l, len);
    return ag.map((a, i) => ok(a) && ok(al[i]) ? (al[i] === 0 ? 100 : 100 - 100 / (1 + a / al[i])) : null);
  };
  add('rsi', 'Momentum', 'RSI', 'Relative Strength Index', { params: [NUM('len', 'Length', 14), SRC], lines: [LINE('v', 'RSI', PURPLE)], levels: [70, 50, 30], range: [0, 100], calc: (d, p) => ({ v: RSI_CALC(srcArr(d, p.src), p.len) }) });
  add('macd', 'Momentum', 'MACD', 'Moving Average Convergence Divergence', {
    params: [NUM('fast', 'Fast', 12), NUM('slow', 'Slow', 26), NUM('sig', 'Signal', 9), SRC],
    lines: [HIST('hist', 'Histogram', GREEN, RED, { mode: 'sign4' }), LINE('macd', 'MACD', BLUE), LINE('signal', 'Signal', ORANGE)], levels: [0],
    calc: (d, p) => { const s = srcArr(d, p.src), m = map2(ema(s, p.fast), ema(s, p.slow), (a, b) => a - b), sg = ema(m, p.sig); return { macd: m, signal: sg, hist: map2(m, sg, (a, b) => a - b) }; },
  });
  add('ppo', 'Momentum', 'PPO', 'Percentage Price Oscillator', {
    params: [NUM('fast', 'Fast', 12), NUM('slow', 'Slow', 26), NUM('sig', 'Signal', 9), SRC],
    lines: [HIST('hist', 'Histogram', GREEN, RED, { mode: 'sign4' }), LINE('ppo', 'PPO', BLUE), LINE('signal', 'Signal', ORANGE)], levels: [0],
    calc: (d, p) => { const s = srcArr(d, p.src), sl = ema(s, p.slow), m = map2(ema(s, p.fast), sl, (a, b) => b ? (a - b) / b * 100 : null), sg = ema(m, p.sig); return { ppo: m, signal: sg, hist: map2(m, sg, (a, b) => a - b) }; },
  });
  add('stoch', 'Momentum', 'Stochastic', 'Stochastic Oscillator %K / %D', {
    params: [NUM('k', '%K length', 14), NUM('smooth', '%K smoothing', 3), NUM('d', '%D smoothing', 3)],
    lines: [LINE('k', '%K', BLUE), LINE('d', '%D', ORANGE)], levels: [80, 50, 20], range: [0, 100],
    calc: (d, p) => { const hh = highest(d.h, p.k), ll = lowest(d.l, p.k), raw = d.c.map((c, i) => ok(hh[i]) && ok(ll[i]) ? (hh[i] === ll[i] ? 50 : 100 * (c - ll[i]) / (hh[i] - ll[i])) : null), k = sma(raw, p.smooth); return { k, d: sma(k, p.d) }; },
  });
  add('stochrsi', 'Momentum', 'Stochastic RSI', 'Stochastic applied to RSI', {
    params: [NUM('rsi', 'RSI length', 14), NUM('stoch', 'Stochastic length', 14), NUM('k', '%K', 3), NUM('d', '%D', 3), SRC],
    lines: [LINE('k', '%K', BLUE), LINE('d', '%D', ORANGE)], levels: [80, 20], range: [0, 100],
    calc: (d, p) => { const r = RSI_CALC(srcArr(d, p.src), p.rsi), hh = highest(r, p.stoch), ll = lowest(r, p.stoch), s = r.map((v, i) => ok(v) && ok(hh[i]) ? (hh[i] === ll[i] ? 50 : 100 * (v - ll[i]) / (hh[i] - ll[i])) : null), k = sma(s, p.k); return { k, d: sma(k, p.d) }; },
  });
  add('cci', 'Momentum', 'CCI', 'Commodity Channel Index', {
    params: [NUM('len', 'Length', 20)], lines: [LINE('v', 'CCI', BLUE)], levels: [100, 0, -100],
    calc: (d, p) => { const tp = srcArr(d, 'hlc3'), m = sma(tp, p.len), n = tp.length, o = nul(n); for (let i = p.len - 1; i < n; i++) { let s = 0; for (let k = i - p.len + 1; k <= i; k++) s += Math.abs(tp[k] - m[i]); const md = s / p.len; o[i] = md ? (tp[i] - m[i]) / (0.015 * md) : 0; } return { v: o }; },
  });
  add('willr', 'Momentum', 'Williams %R', 'Williams Percent Range', {
    params: [NUM('len', 'Length', 14)], lines: [LINE('v', '%R', PURPLE)], levels: [-20, -50, -80], range: [-100, 0],
    calc: (d, p) => { const hh = highest(d.h, p.len), ll = lowest(d.l, p.len); return { v: d.c.map((c, i) => ok(hh[i]) ? (hh[i] === ll[i] ? -50 : 100 * (c - hh[i]) / (hh[i] - ll[i])) : null) }; },
  });
  add('roc', 'Momentum', 'ROC', 'Rate of Change (%)', { params: [NUM('len', 'Length', 9), SRC], lines: [LINE('v', 'ROC', BLUE)], levels: [0], calc: (d, p) => { const s = srcArr(d, p.src); return { v: s.map((v, i) => i >= p.len && s[i - p.len] ? 100 * (v - s[i - p.len]) / s[i - p.len] : null) }; } });
  add('mom', 'Momentum', 'Momentum', 'Price change over N bars', { params: [NUM('len', 'Length', 10), SRC], lines: [LINE('v', 'MOM', BLUE)], levels: [0], calc: (d, p) => { const s = srcArr(d, p.src); return { v: s.map((v, i) => i >= p.len ? v - s[i - p.len] : null) }; } });
  add('ao', 'Momentum', 'Awesome Oscillator', 'SMA(5) − SMA(34) of median price', {
    params: [NUM('fast', 'Fast', 5), NUM('slow', 'Slow', 34)], lines: [HIST('v', 'AO', GREEN, RED, { mode: 'delta' })], levels: [0],
    calc: (d, p) => { const s = srcArr(d, 'hl2'); return { v: map2(sma(s, p.fast), sma(s, p.slow), (a, b) => a - b) }; },
  });
  add('trix', 'Momentum', 'TRIX', 'Triple-smoothed EMA rate of change', {
    params: [NUM('len', 'Length', 15), NUM('sig', 'Signal', 9)], lines: [LINE('v', 'TRIX', BLUE), LINE('s', 'Signal', ORANGE)], levels: [0],
    calc: (d, p) => { const lg = d.c.map(v => Math.log(v)), e = ema(ema(ema(lg, p.len), p.len), p.len), t = e.map((v, i) => ok(v) && ok(e[i - 1]) ? 10000 * (v - e[i - 1]) : null); return { v: t, s: ema(t, p.sig) }; },
  });
  add('uo', 'Momentum', 'Ultimate Oscillator', 'Three-timeframe momentum', {
    params: [NUM('a', 'Fast', 7), NUM('b', 'Middle', 14), NUM('c', 'Slow', 28)], lines: [LINE('v', 'UO', PURPLE)], levels: [70, 30], range: [0, 100],
    calc: (d, p) => { const n = d.c.length, bp = nul(n), tr = nul(n); for (let i = 1; i < n; i++) { const lo = Math.min(d.l[i], d.c[i - 1]), hi = Math.max(d.h[i], d.c[i - 1]); bp[i] = d.c[i] - lo; tr[i] = hi - lo; } const f = k => { const a = sumN(bp, k), b = sumN(tr, k); return a.map((v, i) => ok(v) && ok(b[i]) && b[i] ? v / b[i] : null); }; const A = f(p.a), B = f(p.b), C = f(p.c); return { v: A.map((v, i) => ok(v) && ok(B[i]) && ok(C[i]) ? 100 * (4 * v + 2 * B[i] + C[i]) / 7 : null) }; },
  });
  add('tsi', 'Momentum', 'True Strength Index', 'Double-smoothed momentum', {
    params: [NUM('long', 'Long', 25), NUM('short', 'Short', 13), NUM('sig', 'Signal', 13), SRC], lines: [LINE('v', 'TSI', BLUE), LINE('s', 'Signal', ORANGE)], levels: [0],
    calc: (d, p) => { const s = srcArr(d, p.src), m = s.map((v, i) => i ? v - s[i - 1] : null), am = m.map(v => ok(v) ? Math.abs(v) : null), a = ema(ema(m, p.long), p.short), b = ema(ema(am, p.long), p.short), t = a.map((v, i) => ok(v) && ok(b[i]) && b[i] ? 100 * v / b[i] : null); return { v: t, s: ema(t, p.sig) }; },
  });
  add('cmo', 'Momentum', 'Chande Momentum', 'Chande Momentum Oscillator', {
    params: [NUM('len', 'Length', 9), SRC], lines: [LINE('v', 'CMO', PURPLE)], levels: [50, 0, -50], range: [-100, 100],
    calc: (d, p) => { const s = srcArr(d, p.src), up = s.map((v, i) => i ? Math.max(v - s[i - 1], 0) : null), dn = s.map((v, i) => i ? Math.max(s[i - 1] - v, 0) : null), su = sumN(up, p.len), sd = sumN(dn, p.len); return { v: su.map((u, i) => ok(u) && ok(sd[i]) && (u + sd[i]) ? 100 * (u - sd[i]) / (u + sd[i]) : null) }; },
  });
  add('dpo', 'Momentum', 'DPO', 'Detrended Price Oscillator', {
    params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'DPO', BLUE)], levels: [0],
    calc: (d, p) => { const s = srcArr(d, p.src), m = sma(s, p.len), k = Math.floor(p.len / 2) + 1; return { v: m.map((v, i) => ok(v) && i - k >= 0 ? s[i - k] - v : null) }; },
  });
  add('coppock', 'Momentum', 'Coppock Curve', 'Long-term momentum (WMA of two ROCs)', {
    params: [NUM('wma', 'WMA length', 10), NUM('r1', 'Long ROC', 14), NUM('r2', 'Short ROC', 11), SRC], lines: [HIST('v', 'Coppock', GREEN, RED, { mode: 'delta' })], levels: [0],
    calc: (d, p) => { const s = srcArr(d, p.src), roc = k => s.map((v, i) => i >= k && s[i - k] ? 100 * (v - s[i - k]) / s[i - k] : null); return { v: wma(map2(roc(p.r1), roc(p.r2), (a, b) => a + b), p.wma) }; },
  });
  add('bop', 'Momentum', 'Balance of Power', 'Buyers vs sellers strength', {
    params: [NUM('len', 'Smoothing', 14)], lines: [LINE('v', 'BoP', BLUE)], levels: [0],
    calc: (d, p) => ({ v: sma(d.c.map((c, i) => d.h[i] === d.l[i] ? 0 : (c - d.o[i]) / (d.h[i] - d.l[i])), p.len) }),
  });

  /* ---- Trend strength (pane) ---- */
  add('adx', 'Trend', 'ADX / DMI', 'Average Directional Index with +DI / −DI', {
    params: [NUM('len', 'DI length', 14), NUM('smooth', 'ADX smoothing', 14)], lines: [LINE('adx', 'ADX', RED), LINE('pdi', '+DI', BLUE), LINE('mdi', '−DI', ORANGE)], levels: [25],
    calc: (d, p) => {
      const n = d.c.length, pdm = nul(n), mdm = nul(n);
      for (let i = 1; i < n; i++) { const up = d.h[i] - d.h[i - 1], dn = d.l[i - 1] - d.l[i]; pdm[i] = up > dn && up > 0 ? up : 0; mdm[i] = dn > up && dn > 0 ? dn : 0; }
      const a = atr(d.h, d.l, d.c, p.len), P = rma(pdm, p.len), M = rma(mdm, p.len);
      const pdi = P.map((v, i) => ok(v) && ok(a[i]) && a[i] ? 100 * v / a[i] : null), mdi = M.map((v, i) => ok(v) && ok(a[i]) && a[i] ? 100 * v / a[i] : null);
      const dx = pdi.map((v, i) => ok(v) && ok(mdi[i]) && (v + mdi[i]) ? 100 * Math.abs(v - mdi[i]) / (v + mdi[i]) : null);
      return { adx: rma(dx, p.smooth), pdi, mdi };
    },
  });
  add('aroon', 'Trend', 'Aroon', 'Time since highest high / lowest low', {
    params: [NUM('len', 'Length', 14)], lines: [LINE('up', 'Aroon Up', GREEN), LINE('dn', 'Aroon Down', RED)], levels: [70, 50, 30], range: [0, 100],
    calc: (d, p) => { const n = d.c.length, up = nul(n), dn = nul(n); for (let i = p.len; i < n; i++) { let hi = -Infinity, lo = Infinity, hiI = i, loI = i; for (let k = i - p.len; k <= i; k++) { if (d.h[k] >= hi) { hi = d.h[k]; hiI = k; } if (d.l[k] <= lo) { lo = d.l[k]; loI = k; } } up[i] = 100 * (p.len - (i - hiI)) / p.len; dn[i] = 100 * (p.len - (i - loI)) / p.len; } return { up, dn }; },
  });
  add('vortex', 'Trend', 'Vortex', 'Vortex Indicator VI+ / VI−', {
    params: [NUM('len', 'Length', 14)], lines: [LINE('p', 'VI +', BLUE), LINE('m', 'VI −', RED)], levels: [1],
    calc: (d, p) => { const n = d.c.length, vp = nul(n), vm = nul(n), tr = trueRange(d.h, d.l, d.c); for (let i = 1; i < n; i++) { vp[i] = Math.abs(d.h[i] - d.l[i - 1]); vm[i] = Math.abs(d.l[i] - d.h[i - 1]); } const st = sumN(tr, p.len), sp = sumN(vp, p.len), sm = sumN(vm, p.len); return { p: sp.map((v, i) => ok(v) && ok(st[i]) && st[i] ? v / st[i] : null), m: sm.map((v, i) => ok(v) && ok(st[i]) && st[i] ? v / st[i] : null) }; },
  });
  add('chop', 'Trend', 'Choppiness Index', 'Trending vs sideways market', {
    params: [NUM('len', 'Length', 14)], lines: [LINE('v', 'CHOP', PURPLE)], levels: [61.8, 38.2], range: [0, 100],
    calc: (d, p) => { const s = sumN(trueRange(d.h, d.l, d.c), p.len), hh = highest(d.h, p.len), ll = lowest(d.l, p.len); return { v: s.map((v, i) => ok(v) && ok(hh[i]) && hh[i] !== ll[i] ? 100 * Math.log10(v / (hh[i] - ll[i])) / Math.log10(p.len) : null) }; },
  });
  add('mass', 'Trend', 'Mass Index', 'Range expansion / reversal bulge', {
    params: [NUM('ema', 'EMA length', 9), NUM('sum', 'Sum length', 25)], lines: [LINE('v', 'Mass', BLUE)], levels: [27, 26.5],
    calc: (d, p) => { const r = d.h.map((h, i) => h - d.l[i]), e1 = ema(r, p.ema), e2 = ema(e1, p.ema); return { v: sumN(e1.map((v, i) => ok(v) && ok(e2[i]) && e2[i] ? v / e2[i] : null), p.sum) }; },
  });

  /* ---- Volatility (pane) ---- */
  add('atr', 'Volatility', 'ATR', 'Average True Range', { params: [NUM('len', 'Length', 14)], lines: [LINE('v', 'ATR', RED)], calc: (d, p) => ({ v: atr(d.h, d.l, d.c, p.len) }) });
  add('stdev', 'Volatility', 'Standard Deviation', 'Standard deviation of price', { params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'StdDev', BLUE)], calc: (d, p) => ({ v: stdev(srcArr(d, p.src), p.len) }) });
  add('hv', 'Volatility', 'Historical Volatility', 'Annualised stdev of log returns (%)', {
    params: [NUM('len', 'Length', 10), NUM('ann', 'Bars per year', 365, 1, 100000)], lines: [LINE('v', 'HV', PURPLE)],
    calc: (d, p) => { const r = d.c.map((c, i) => i ? Math.log(c / d.c[i - 1]) : null); return { v: map1(stdev(r, p.len), v => v * Math.sqrt(p.ann) * 100) }; },
  });
  add('bbpb', 'Volatility', 'Bollinger %B', 'Where price sits inside the bands', {
    params: [NUM('len', 'Length', 20), NUM('mult', 'StdDev', 2, 0.1, 10, 0.1), SRC], lines: [LINE('v', '%B', BLUE)], levels: [1, 0.5, 0],
    calc: (d, p) => { const s = srcArr(d, p.src), b = sma(s, p.len), sd = stdev(s, p.len); return { v: s.map((c, i) => ok(b[i]) && ok(sd[i]) && sd[i] ? (c - (b[i] - p.mult * sd[i])) / (2 * p.mult * sd[i]) : null) }; },
  });
  add('bbw', 'Volatility', 'Bollinger Bandwidth', 'Width of Bollinger Bands', {
    params: [NUM('len', 'Length', 20), NUM('mult', 'StdDev', 2, 0.1, 10, 0.1), SRC], lines: [LINE('v', 'BBW', ORANGE)],
    calc: (d, p) => { const s = srcArr(d, p.src), b = sma(s, p.len), sd = stdev(s, p.len); return { v: b.map((m, i) => ok(m) && ok(sd[i]) && m ? 2 * p.mult * sd[i] / m : null) }; },
  });

  /* ---- Volume (pane) ---- */
  add('obv', 'Volume', 'OBV', 'On Balance Volume', { lines: [LINE('v', 'OBV', BLUE)], calc: d => { let s = 0; return { v: d.c.map((c, i) => { if (i) s += c > d.c[i - 1] ? d.v[i] : c < d.c[i - 1] ? -d.v[i] : 0; return s; }) }; } });
  add('ad', 'Volume', 'Accumulation / Distribution', 'A/D line', { lines: [LINE('v', 'A/D', BLUE)], calc: d => { let s = 0; return { v: d.c.map((c, i) => { const r = d.h[i] - d.l[i]; s += r ? ((c - d.l[i]) - (d.h[i] - c)) / r * d.v[i] : 0; return s; }) }; } });
  add('cmf', 'Volume', 'Chaikin Money Flow', 'Buying / selling pressure', {
    params: [NUM('len', 'Length', 20)], lines: [HIST('v', 'CMF', GREEN, RED, { mode: 'sign' })], levels: [0],
    calc: (d, p) => { const m = d.c.map((c, i) => { const r = d.h[i] - d.l[i]; return r ? ((c - d.l[i]) - (d.h[i] - c)) / r * d.v[i] : 0; }), a = sumN(m, p.len), b = sumN(d.v, p.len); return { v: a.map((v, i) => ok(v) && b[i] ? v / b[i] : null) }; },
  });
  add('mfi', 'Volume', 'MFI', 'Money Flow Index (volume-weighted RSI)', {
    params: [NUM('len', 'Length', 14)], lines: [LINE('v', 'MFI', PURPLE)], levels: [80, 50, 20], range: [0, 100],
    calc: (d, p) => { const tp = srcArr(d, 'hlc3'), n = tp.length, pos = nul(n), neg = nul(n); for (let i = 1; i < n; i++) { const mf = tp[i] * d.v[i]; pos[i] = tp[i] > tp[i - 1] ? mf : 0; neg[i] = tp[i] < tp[i - 1] ? mf : 0; } const a = sumN(pos, p.len), b = sumN(neg, p.len); return { v: a.map((v, i) => ok(v) && ok(b[i]) ? (b[i] === 0 ? 100 : 100 - 100 / (1 + v / b[i])) : null) }; },
  });
  add('force', 'Volume', 'Force Index', 'Elder Force Index', { params: [NUM('len', 'Length', 13)], lines: [LINE('v', 'FI', BLUE)], levels: [0], calc: (d, p) => ({ v: ema(d.c.map((c, i) => i ? (c - d.c[i - 1]) * d.v[i] : null), p.len) }) });
  add('volosc', 'Volume', 'Volume Oscillator', 'Fast vs slow volume EMA (%)', {
    params: [NUM('fast', 'Fast', 5), NUM('slow', 'Slow', 10)], lines: [HIST('v', 'VO', GREEN, RED, { mode: 'sign' })], levels: [0],
    calc: (d, p) => ({ v: map2(ema(d.v, p.fast), ema(d.v, p.slow), (a, b) => b ? 100 * (a - b) / b : null) }),
  });

  const CATS = ['Moving averages', 'Bands & channels', 'Momentum', 'Trend', 'Volatility', 'Volume'];

  /* =====================================================================
     3. STATE
     ===================================================================== */
  const LS_IND = 'vaultex_ta_indicators_v1';
  const LS_VOL = 'vaultex_ta_volume_visible';
  const LS_LOG = 'vaultex_ta_log_scale';
  const drawKey = sym => 'vaultex_ta_drawings_' + sym;

  let D = { t: [], o: [], h: [], l: [], c: [], v: [], step: 3600 };   // candles
  let idxByTime = new Map();
  let symbol = 'BTCUSDT', interval = '1h';
  let chart = null, candleSeries = null, volumeSeries = null;
  let instances = lsGet(LS_IND, []).filter(i => IND[i.type]);
  let rt = {};                       // runtime per instance id: {series:{}, pane, markers}
  let panes = [];                    // sub-pane charts in order
  let lock = false;                  // range-sync guard
  let hoverTime = null;
  let volumeVisible = lsGet(LS_VOL, true) !== false;
  let logScale = lsGet(LS_LOG, false) === true;
  let drawings = [], selectedId = null, tool = 'cursor', magnet = false, pending = null, hoverPt = null;

  const uid = () => 'i' + Math.random().toString(36).slice(2, 9);
  const saveInst = () => lsSet(LS_IND, instances.map(i => ({ id: i.id, type: i.type, params: i.params, styles: i.styles, hidden: !!i.hidden })));
  const fmtV = v => v == null || isNaN(v) ? '—' : Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : Math.abs(v) >= 1 ? v.toFixed(2) : Math.abs(v) >= 0.01 ? v.toFixed(4) : Math.abs(v) < 1e-9 ? '0' : v.toPrecision(3);
  const hexA = (hex, a) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : hex; };

  function defaultsFor(def) { const p = {}; def.params.forEach(x => { p[x.k] = x.d; }); return p; }
  function defaultStyles(def) { const s = {}; def.lines.forEach(l => { s[l.k] = { c: l.c, c2: l.c2, w: l.w, vis: true }; }); return s; }
  function newInstance(type) { const def = IND[type]; return { id: uid(), type, params: defaultsFor(def), styles: defaultStyles(def), hidden: false }; }
  function normalise(inst) {          // keep saved layouts working when a definition gains a param/line
    const def = IND[inst.type], dp = defaultsFor(def), ds = defaultStyles(def);
    inst.params = Object.assign(dp, inst.params || {});
    inst.styles = Object.assign(ds, inst.styles || {});
    def.lines.forEach(l => { inst.styles[l.k] = Object.assign({}, ds[l.k], inst.styles[l.k]); });
  }
  instances.forEach(normalise);

  function labelOf(inst) {
    const def = IND[inst.type];
    const parts = def.params.filter(p => p.t === 'num').map(p => inst.params[p.k]);
    if (inst.params.src && inst.params.src !== 'close') parts.push(inst.params.src);
    return def.name + (parts.length ? ' ' + parts.join(' ') : '');
  }

  /* =====================================================================
     4. COMPUTE
     ===================================================================== */
  function compute(inst) {
    const def = IND[inst.type];
    const p = {}; def.params.forEach(x => { let v = inst.params[x.k]; if (x.t === 'num') { v = Number(v); if (!isFinite(v)) v = x.d; v = Math.max(x.min, Math.min(x.max, v)); if (x.step >= 1) v = Math.round(v); } p[x.k] = v; });
    try { return def.calc(Object.assign({}, D), p); } catch (e) { console.error('[trading-indicators] ' + def.name + ' failed', e); return {}; }
  }
  function futureBars() {
    let m = 0;
    instances.forEach(i => { if (i.hidden) return; const def = IND[i.type]; const p = i.params; m = Math.max(m, def.future ? Number(def.future(p)) || 0 : 0); });
    return Math.min(m, 120);
  }
  function timeAt(i) {   // time for (possibly future / past) bar index
    const n = D.t.length; if (!n) return 0;
    if (i >= 0 && i < n) return D.t[i];
    if (i < 0) return D.t[0] + i * D.step;
    return D.t[n - 1] + (i - (n - 1)) * D.step;
  }

  /* =====================================================================
     5. DOM SCAFFOLD
     ===================================================================== */
  const CSS = `
  /* bigger, Binance-style chart */
  .chart-container{height:clamp(440px,66vh,760px) !important;}
  .terminal-fullscreen-root.is-fullscreen .chart-container{height:auto !important;min-height:460px;}
  .market-rows{max-height:clamp(440px,66vh,760px) !important;}
  @media (max-width:900px){.chart-container{height:clamp(340px,56vh,520px) !important;}}
  .trading-layout{grid-template-columns:220px minmax(0,1fr) 310px !important;}
  @media (max-width:1180px){.trading-layout{grid-template-columns:200px minmax(0,1fr) 270px !important;}}
  @media (max-width:1024px){.trading-layout{grid-template-columns:minmax(0,1fr) 280px !important;}}
  @media (max-width:900px){.trading-layout{grid-template-columns:1fr !important;}}
  .vx-tools{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
  .vx-btn .lb{display:inline;}
  .vx-fab{display:none;}
  .vx-mtrade{display:none;}
  @media (max-width:900px){
    .vx-fab{display:inline-flex;}
    .vx-tools.in-drawer{position:absolute;left:0;top:0;bottom:0;z-index:20;flex-direction:column;flex-wrap:nowrap;align-items:stretch;gap:4px;width:150px;padding:8px;background:var(--ink-soft);border:1px solid var(--line);border-left:0;border-radius:0 12px 12px 0;box-shadow:6px 0 24px rgba(0,0,0,.45);overflow-y:auto;transform:translateX(-105%);transition:transform .2s;}
    .vx-tools.in-drawer.open{transform:none;}
    .vx-tools.in-drawer .vx-btn{justify-content:flex-start;padding:9px 10px;}
    .vx-tools.in-drawer .vx-sep{width:auto;height:1px;margin:4px 0;}
    .vx-mtrade{display:flex;gap:8px;margin-top:10px;}
    .vx-mtrade button{flex:1;padding:12px;border:0;border-radius:10px;font:700 .9rem 'Inter',sans-serif;color:#fff;cursor:pointer;}
    .vx-mtrade .b{background:#16c784;}.vx-mtrade .s{background:#ea3943;}
  }
  .vx-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--muted);cursor:pointer;font:600 .74rem 'JetBrains Mono',monospace;line-height:1;white-space:nowrap;}
  .vx-btn:hover{color:var(--paper);border-color:var(--accent,#6C7CFF);}
  .vx-btn.on{background:var(--ink-soft);color:var(--paper);border-color:var(--accent,#6C7CFF);}
  .vx-btn svg{width:15px;height:15px;display:block;}
  .vx-sep{width:1px;height:20px;background:var(--line);margin:0 4px;}
  .vx-stage{position:relative;}
  .vx-canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:3;}
  .vx-canvas.active{pointer-events:auto;cursor:crosshair;}
  .vx-legend{position:absolute;left:8px;top:6px;z-index:6;pointer-events:none;font:500 .72rem 'JetBrains Mono',monospace;max-width:calc(100% - 90px);}
  .vx-lg-row{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;margin-bottom:2px;text-shadow:0 0 4px var(--ink,#0b1020);}
  .vx-lg-name{color:var(--paper);font-weight:700;}
  .vx-lg-val{font-weight:600;}
  .vx-lg-btns{display:inline-flex;gap:2px;pointer-events:auto;opacity:.0;transition:opacity .15s;}
  .vx-lg-row:hover .vx-lg-btns{opacity:1;}
  .vx-lg-btns button{border:0;background:var(--ink-soft);color:var(--muted);border-radius:5px;cursor:pointer;font-size:.74rem;padding:2px 6px;line-height:1.1;}
  .vx-lg-btns button:hover{color:var(--paper);}
  .vx-lg-row.off .vx-lg-name,.vx-lg-row.off .vx-lg-val{opacity:.4;}
  @media (hover:none){.vx-lg-btns{opacity:1;}}
  #vx-panes{display:flex;flex-direction:column;gap:6px;}
  .vx-pane{position:relative;height:140px;border-top:1px solid var(--line);}
  .vx-pane .vx-legend{max-width:calc(100% - 20px);}
  .vx-selbar{position:absolute;right:76px;top:8px;z-index:8;display:none;gap:6px;align-items:center;padding:5px 8px;background:var(--ink-soft);border:1px solid var(--line);border-radius:9px;font:600 .72rem 'JetBrains Mono',monospace;color:var(--paper);}
  .vx-selbar input[type=color]{width:24px;height:22px;border:0;padding:0;background:none;cursor:pointer;}
  .vx-selbar button{border:0;background:rgba(234,57,67,.16);color:#ea3943;border-radius:6px;padding:4px 8px;cursor:pointer;font:inherit;}
  .vx-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px;}
  .vx-modal{background:var(--ink-soft,#121a30);color:var(--paper,#fff);border:1px solid var(--line);border-radius:14px;width:min(640px,100%);max-height:86vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.5);}
  .vx-modal h3{margin:0;font-size:1rem;}
  .vx-m-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line);}
  .vx-m-x{border:0;background:none;color:var(--muted);font-size:1.3rem;cursor:pointer;line-height:1;}
  .vx-m-body{padding:14px 16px;overflow:auto;}
  .vx-m-foot{display:flex;justify-content:space-between;gap:8px;padding:12px 16px;border-top:1px solid var(--line);}
  .vx-search{width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line);background:var(--ink,#0b1020);color:var(--paper);font:inherit;margin-bottom:10px;box-sizing:border-box;}
  .vx-cats{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}
  .vx-list{display:flex;flex-direction:column;}
  .vx-li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 8px;border-bottom:1px solid var(--line);cursor:pointer;border-radius:6px;}
  .vx-li:hover{background:rgba(128,128,128,.1);}
  .vx-li b{font-size:.88rem;} .vx-li small{display:block;color:var(--muted);font-size:.72rem;margin-top:2px;}
  .vx-li .tag{font:600 .64rem 'JetBrains Mono',monospace;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:2px 6px;white-space:nowrap;}
  .vx-sec{font:700 .7rem 'JetBrains Mono',monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 6px;}
  .vx-act{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid var(--line);border-radius:9px;margin-bottom:6px;font-size:.82rem;}
  .vx-act .b{display:flex;gap:6px;} .vx-act button{border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:6px;padding:4px 9px;cursor:pointer;font:inherit;font-size:.74rem;}
  .vx-act button:hover{color:var(--paper);}
  .vx-field{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);font-size:.84rem;}
  .vx-field input,.vx-field select{background:var(--ink,#0b1020);color:var(--paper);border:1px solid var(--line);border-radius:7px;padding:6px 8px;font:inherit;width:130px;box-sizing:border-box;}
  .vx-field input[type=color]{width:36px;height:30px;padding:2px;}
  .vx-field input[type=checkbox]{width:auto;}
  .vx-tabs{display:flex;gap:6px;margin-bottom:8px;}
  .vx-primary{border:0;background:var(--accent,#6C7CFF);color:#fff;border-radius:8px;padding:8px 18px;cursor:pointer;font:600 .84rem 'Inter',sans-serif;}
  .vx-ghost{border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:8px;padding:8px 14px;cursor:pointer;font:600 .84rem 'Inter',sans-serif;}
  .terminal-fullscreen-root.is-fullscreen .vx-stage{flex:1 1 auto;display:flex;flex-direction:column;min-height:300px;}
  .terminal-fullscreen-root.is-fullscreen .vx-stage .chart-container{flex:1 1 auto;}
  `;

  let stage, canvas, ctx, legendEl, panesEl, selbar, toolsEl;
  const ICON = {
    fx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c4 0 4-10 8-10M13 12h5M15 8l4 8M19 8l-4 8"/></svg>',
    cursor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 3l14 8-6 2-2 6z"/></svg>',
    trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19L20 5"/><circle cx="4" cy="19" r="2" fill="currentColor"/><circle cx="20" cy="5" r="2" fill="currentColor"/></svg>',
    ray: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 18L22 6M4 18h0"/><circle cx="4" cy="18" r="2" fill="currentColor"/></svg>',
    hline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
    vline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
    rect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>',
    fib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18M3 10h18M3 14h18M3 19h18"/></svg>',
    measure: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17L17 3l4 4L7 21zM8 12l2 2M11 9l2 2M14 6l2 2"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5h14M12 5v14M9 19h6"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    magnet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3v8a7 7 0 0014 0V3h-4v8a3 3 0 01-6 0V3z"/></svg>',
  };
  const TOOLS = [['cursor', 'Cursor'], ['trend', 'Trend line'], ['ray', 'Ray'], ['hline', 'Horizontal line'], ['vline', 'Vertical line'], ['rect', 'Rectangle'], ['fib', 'Fib retracement'], ['measure', 'Measure'], ['text', 'Text']];

  function scaffold() {
    if (stage) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    const cc = $('[data-chart-container]');
    const toolbar = $('.chart-toolbar');
    if (!cc || !toolbar) return;

    toolsEl = document.createElement('div'); toolsEl.className = 'vx-tools';
    toolsEl.innerHTML =
      `<button class="vx-btn" data-vx="indicators" title="Indicators">${ICON.fx}<span class="lb">Indicators</span><span data-vx-count></span></button><span class="vx-sep"></span>` +
      TOOLS.map(t => `<button class="vx-btn ${t[0] === 'cursor' ? 'on' : ''}" data-vx-tool="${t[0]}" title="${t[1]}">${ICON[t[0]]}<span class="lb">${t[1]}</span></button>`).join('') +
      `<span class="vx-sep"></span>` +
      `<button class="vx-btn" data-vx="magnet" title="Magnet — snap to candle OHLC">${ICON.magnet}<span class="lb">Magnet</span></button>` +
      `<button class="vx-btn" data-vx="undo" title="Remove last drawing">${ICON.undo}<span class="lb">Undo</span></button>` +
      `<button class="vx-btn" data-vx="clear" title="Remove all drawings">${ICON.trash}<span class="lb">Clear</span></button>` +
      `<button class="vx-btn" data-vx="log" title="Logarithmic price scale"><span class="lb">LOG</span></button>`;
    toolbar.insertAdjacentElement('afterend', toolsEl);

    stage = document.createElement('div'); stage.className = 'vx-stage';
    cc.parentNode.insertBefore(stage, cc); stage.appendChild(cc);

    // phones: tools live in a slide-out drawer on the left of the chart (opened with the "Tools" button, closes after a pick)
    const fab = document.createElement('button'); fab.className = 'vx-btn vx-fab'; fab.innerHTML = ICON.fx + '<span class="lb">Tools</span>';
    const fs = toolbar.querySelector('.fullscreen-toggle'); toolbar.insertBefore(fab, fs || null);
    const mq = window.matchMedia('(max-width: 900px)');
    const place = () => {
      if (mq.matches) { stage.appendChild(toolsEl); toolsEl.classList.add('in-drawer'); toolsEl.classList.remove('open'); }
      else { toolbar.insertAdjacentElement('afterend', toolsEl); toolsEl.classList.remove('in-drawer', 'open'); }
    };
    mq.addEventListener ? mq.addEventListener('change', place) : mq.addListener(place);
    place();
    fab.addEventListener('click', e => { e.stopPropagation(); toolsEl.classList.toggle('open'); });
    document.addEventListener('click', e => { if (toolsEl.classList.contains('open') && !toolsEl.contains(e.target) && e.target !== fab) toolsEl.classList.remove('open'); });
    window.__vxCloseDrawer = () => { if (toolsEl.classList.contains('in-drawer')) toolsEl.classList.remove('open'); };
    canvas = document.createElement('canvas'); canvas.className = 'vx-canvas'; stage.appendChild(canvas); ctx = canvas.getContext('2d');
    legendEl = document.createElement('div'); legendEl.className = 'vx-legend'; stage.appendChild(legendEl);
    selbar = document.createElement('div'); selbar.className = 'vx-selbar'; stage.appendChild(selbar);
    panesEl = document.createElement('div'); panesEl.id = 'vx-panes'; stage.insertAdjacentElement('afterend', panesEl);
    const mt = document.createElement('div'); mt.className = 'vx-mtrade'; mt.innerHTML = '<button class="b" data-mt="buy">Buy</button><button class="s" data-mt="sell">Sell</button>';
    panesEl.insertAdjacentElement('afterend', mt);
    mt.addEventListener('click', e => {
      const b = e.target.closest('[data-mt]'); if (!b) return;
      const tab = document.querySelector('[data-term-tab="trade"]'); if (tab) tab.click();
      const side = document.querySelector('[data-side-tabs] [data-side="' + b.dataset.mt + '"]'); if (side) side.click();
      const tk = document.querySelector('.order-ticket'); if (tk) setTimeout(() => tk.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    });

    toolsEl.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.vxTool) { setTool(b.dataset.vxTool); window.__vxCloseDrawer(); return; }
      switch (b.dataset.vx) {
        case 'indicators': window.__vxCloseDrawer(); return openLibrary();
        case 'magnet': magnet = !magnet; b.classList.toggle('on', magnet); return;
        case 'undo': if (drawings.length) { drawings.pop(); selectedId = null; saveDrawings(); redraw(true); } return;
        case 'clear': if (drawings.length && confirm('Remove all drawings on ' + symbol.replace('USDT', '/USDT') + '?')) { drawings = []; selectedId = null; saveDrawings(); redraw(true); } return;
        case 'log': logScale = !logScale; lsSet(LS_LOG, logScale); applyLog(); b.classList.toggle('on', logScale); return;
      }
    });
    legendEl.addEventListener('click', legendClick);
    panesEl.addEventListener('click', legendClick);
    updateCount();

    if (window.ResizeObserver) new ResizeObserver(() => { sizeCanvas(); redraw(true); resizePanes(); }).observe(stage);
    window.addEventListener('resize', () => { sizeCanvas(); resizePanes(); });
    bindDrawingEvents();
    requestAnimationFrame(loop);
  }

  function updateCount() { const el = $('[data-vx-count]'); if (el) el.textContent = instances.length ? '(' + instances.length + ')' : ''; }
  function applyLog() { if (!chart) return; try { chart.priceScale('right').applyOptions({ mode: logScale ? LW.PriceScaleMode.Logarithmic : LW.PriceScaleMode.Normal }); } catch (e) { /* older build */ } const b = $('[data-vx="log"]'); if (b) b.classList.toggle('on', logScale); }

  /* =====================================================================
     6. RENDER INDICATORS
     ===================================================================== */
  function chartOptions(el, showTime) {
    return {
      layout: { background: { color: 'transparent' }, textColor: getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#8993AB' },
      grid: { vertLines: { color: 'rgba(128,128,128,.08)' }, horzLines: { color: 'rgba(128,128,128,.08)' } },
      rightPriceScale: { borderColor: 'rgba(128,128,128,.15)', minimumWidth: 72 },
      timeScale: { borderColor: 'rgba(128,128,128,.15)', timeVisible: true, secondsVisible: false, visible: showTime, rightOffset: 4, fixLeftEdge: true, rightBarStaysOnScroll: true, shiftVisibleRangeOnNewBar: false, lockVisibleTimeRangeOnResize: true },
      crosshair: { mode: LW.CrosshairMode.Normal },
      handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: true },
      width: el.clientWidth, height: el.clientHeight,
    };
  }

  function teardown() {
    Object.keys(rt).forEach(id => {
      const r = rt[id]; if (!r) return;
      if (r.pane) { try { r.pane.chart.remove(); } catch (e) { /* gone */ } r.pane.wrap.remove(); }
      else Object.keys(r.series).forEach(k => { try { chart.removeSeries(r.series[k]); } catch (e) { /* gone */ } });
    });
    rt = {}; panes = [];
    if (panesEl) panesEl.innerHTML = '';
  }

  function build() {
    if (!chart) return;
    teardown();
    instances.forEach(inst => {
      const def = IND[inst.type], r = rt[inst.id] = { series: {}, markers: null, pane: null };
      const vis = !inst.hidden;
      if (def.overlay) {
        def.lines.forEach(l => {
          const st = inst.styles[l.k];
          if (l.type === 'dots') {
            const s = chart.addLineSeries({ color: 'rgba(0,0,0,0)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, visible: vis && st.vis });
            r.series[l.k] = s;
          } else {
            r.series[l.k] = chart.addLineSeries({ color: st.c, lineWidth: st.w, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, visible: vis && st.vis });
          }
        });
      } else {
        const wrap = document.createElement('div'); wrap.className = 'vx-pane';
        const leg = document.createElement('div'); leg.className = 'vx-legend'; leg.dataset.paneFor = inst.id;
        const host = document.createElement('div'); host.style.cssText = 'position:absolute;inset:0;';
        wrap.appendChild(host); wrap.appendChild(leg); panesEl.appendChild(wrap);
        const pc = LW.createChart(host, chartOptions(host, false));
        let firstSeries = null;
        def.lines.forEach((l, li) => {
          const st = inst.styles[l.k];
          const opts = { lastValueVisible: li === 0 || l.type !== 'hist', priceLineVisible: false, visible: vis && st.vis };
          if (def.range && !firstSeries) opts.autoscaleInfoProvider = () => ({ priceRange: { minValue: def.range[0], maxValue: def.range[1] } });
          let s;
          if (l.type === 'hist') s = pc.addHistogramSeries(Object.assign({ color: st.c, priceFormat: { type: 'price', precision: 4, minMove: 0.0001 } }, opts));
          else s = pc.addLineSeries(Object.assign({ color: st.c, lineWidth: st.w, crosshairMarkerVisible: false }, opts));
          if (!firstSeries) firstSeries = s;
          r.series[l.k] = s;
        });
        (def.levels || []).forEach(v => { try { firstSeries.createPriceLine({ price: v, color: 'rgba(128,128,128,.55)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' }); } catch (e) { /* ignore */ } });
        r.pane = { wrap, chart: pc, host, leg, first: firstSeries };
        panes.push(r.pane);
        pc.timeScale().subscribeVisibleLogicalRangeChange(rg => { if (lock || !rg) return; syncRange(rg, pc); });
        pc.subscribeCrosshairMove(p => onCrosshair(p, pc));
      }
    });
    updateData();
    syncRange(chart.timeScale().getVisibleLogicalRange(), chart);
    updateLegends();
    updateCount();
  }

  /* The chart stands still: no dragging sideways, no jumping when a new candle opens.
     Only zoom (mouse wheel / pinch / drag the axes) — each timeframe keeps its own zoom. */
  function lockChart(c) {
    try {
      c.applyOptions({
        handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: true },
        rightPriceScale: { minimumWidth: 72 },
        timeScale: { rightOffset: 4, fixLeftEdge: true, rightBarStaysOnScroll: true, shiftVisibleRangeOnNewBar: false, lockVisibleTimeRangeOnResize: true },
      });
    } catch (e) { /* older build */ }
  }
  function defaultZoom() {
    const n = D.t.length; if (!chart || !n) return;
    const bars = Math.min(n, interval === '1M' || interval === '1w' ? 60 : 110);
    try { chart.timeScale().setVisibleLogicalRange({ from: n - bars, to: n - 1 + 5 + futureBars() }); } catch (e) { /* not ready */ }
  }

  function syncRange(rg, source) {
    if (!rg || lock) return;
    lock = true;
    try {
      if (source !== chart) chart.timeScale().setVisibleLogicalRange(rg);
      panes.forEach(p => { if (p.chart !== source) p.chart.timeScale().setVisibleLogicalRange(rg); });
    } catch (e) { /* range not ready */ }
    lock = false;
  }
  function resizePanes() {
    panes.forEach(p => { try { p.chart.applyOptions({ width: p.host.clientWidth, height: p.host.clientHeight }); } catch (e) { /* removed */ } });
  }

  function seriesData(values, shift, times, style, def, lineDef) {
    const out = [];
    const n = values.length;
    for (let i = 0; i < n; i++) {
      const j = i + shift; const t = timeAt(j);
      if (j < 0) continue;
      const v = values[i];
      out.push(ok(v) ? { time: t, value: v } : { time: t });
    }
    return out;
  }

  function histColors(vals, lineDef, st) {
    return vals.map((v, i) => {
      if (!ok(v)) return null;
      const prev = i ? vals[i - 1] : null;
      if (lineDef.mode === 'delta') return ok(prev) && v < prev ? st.c2 : st.c;
      if (lineDef.mode === 'sign') return v >= 0 ? st.c : st.c2;
      /* sign4 */
      if (v >= 0) return ok(prev) && v < prev ? hexA(st.c, .45) : st.c;
      return ok(prev) && v > prev ? hexA(st.c2, .45) : st.c2;
    });
  }

  function updateData() {
    if (!chart) return;
    const fut = futureBars();
    const n = D.t.length;
    instances.forEach(inst => {
      const r = rt[inst.id]; if (!r) return;
      const def = IND[inst.type], out = compute(inst); inst._out = out;
      def.lines.forEach((l, li) => {
        const s = r.series[l.k]; if (!s) return;
        const vals = out[l.k] || nul(n);
        const shift = l.shift ? Number(l.shift(inst.params)) || 0 : 0;
        let data;
        if (l.type === 'hist') {
          const cols = histColors(vals, l, inst.styles[l.k]);
          data = vals.map((v, i) => ok(v) ? { time: D.t[i], value: v, color: cols[i] } : { time: D.t[i] });
        } else data = seriesData(vals, shift);
        // sub panes: pad with future whitespace so the shared time axis lines up with the main chart
        if (r.pane && li === 0 && fut > 0) for (let k = 1; k <= fut; k++) data.push({ time: timeAt(n - 1 + k) });
        try { s.setData(data); } catch (e) { console.warn('[trading-indicators] setData', def.name, e.message); }
        if (l.type === 'dots') {                          // Parabolic SAR → coloured dots
          const bull = out.bull || [];
          const st = inst.styles[l.k];
          const mk = [];
          vals.forEach((v, i) => { if (ok(v)) mk.push({ time: D.t[i], position: 'inBar', shape: 'circle', color: bull[i] ? st.c : (st.c2 || ORANGE), size: 0.4 }); });
          try { s.setMarkers(inst.hidden || !st.vis ? [] : mk); } catch (e) { /* markers unsupported */ }
        }
      });
    });
    if (panes.length === 0 && fut === 0) { /* nothing */ }
    updateLegends();
    redraw(true);
  }

  /* =====================================================================
     7. LEGEND
     ===================================================================== */
  function valuesAt(inst, idx) {
    const def = IND[inst.type], out = inst._out || {};
    return def.lines.filter(l => l.type !== 'dots' || true).map(l => {
      const arr = out[l.k]; let v = null;
      if (arr) { const shift = l.shift ? Number(l.shift(inst.params)) || 0 : 0; v = arr[idx - shift]; }
      return { l, v, c: inst.styles[l.k].c };
    });
  }
  function legendRow(inst, idx) {
    const vals = valuesAt(inst, idx).filter(x => inst.styles[x.l.k].vis);
    return `<div class="vx-lg-row ${inst.hidden ? 'off' : ''}">
      <span class="vx-lg-name">${esc(labelOf(inst))}</span>
      ${vals.map(x => `<span class="vx-lg-val" style="color:${x.c}">${fmtV(x.v)}</span>`).join(' ')}
      <span class="vx-lg-btns"><button data-act="eye" data-id="${inst.id}" title="${inst.hidden ? 'Show' : 'Hide'}">${inst.hidden ? '○' : '●'}</button><button data-act="cfg" data-id="${inst.id}" title="Settings">⚙</button><button data-act="del" data-id="${inst.id}" title="Remove">✕</button></span>
    </div>`;
  }
  function updateLegends() {
    if (!legendEl) return;
    const n = D.t.length; if (!n) { legendEl.innerHTML = ''; return; }
    let idx = n - 1;
    if (hoverTime != null && idxByTime.has(hoverTime)) idx = idxByTime.get(hoverTime);
    else if (hoverTime != null && hoverTime > D.t[n - 1]) idx = n - 1;
    const o = D.o[idx], h = D.h[idx], l = D.l[idx], c = D.c[idx];
    const prev = idx > 0 ? D.c[idx - 1] : o, chg = prev ? (c - prev) / prev * 100 : 0, col = c >= o ? '#16c784' : '#ea3943';
    let html = `<div class="vx-lg-row"><span class="vx-lg-name">${esc(symbol.replace('USDT', '/USDT'))} · ${esc(interval.toUpperCase())}</span>
      <span class="vx-lg-val" style="color:${col}">O ${fmtV(o)} H ${fmtV(h)} L ${fmtV(l)} C ${fmtV(c)} (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%)</span></div>`;
    html += `<div class="vx-lg-row ${volumeVisible ? '' : 'off'}"><span class="vx-lg-name">Volume</span><span class="vx-lg-val" style="color:#6C7CFF">${fmtV(D.v[idx])}</span>
      <span class="vx-lg-btns"><button data-act="vol" title="${volumeVisible ? 'Hide' : 'Show'} volume">${volumeVisible ? '●' : '○'}</button></span></div>`;
    html += instances.filter(i => IND[i.type].overlay).map(i => legendRow(i, idx)).join('');
    legendEl.innerHTML = html;
    panes.forEach(p => {
      const id = p.leg.dataset.paneFor, inst = instances.find(i => i.id === id); if (inst) p.leg.innerHTML = legendRow(inst, idx);
    });
  }

  function onCrosshair(param, source) {
    const t = param && param.time ? param.time : null;
    hoverTime = typeof t === 'number' ? t : null;
    updateLegends();
    // mirror the crosshair onto the other charts
    if (lock) return;
    const all = [{ chart }].concat(panes.map(p => ({ chart: p.chart, first: p.first })));
    if (hoverTime == null) { all.forEach(a => { if (a.chart !== source && a.chart.clearCrosshairPosition) { try { a.chart.clearCrosshairPosition(); } catch (e) { /* n/a */ } } }); return; }
    if (!source || !source.setCrosshairPosition) return;
    all.forEach(a => {
      if (a.chart === source || !a.chart.setCrosshairPosition) return;
      const ser = a.chart === chart ? candleSeries : a.first;
      try { a.chart.setCrosshairPosition(NaN, hoverTime, ser); } catch (e) { /* n/a */ }
    });
  }

  function legendClick(e) {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const inst = instances.find(i => i.id === b.dataset.id);
    switch (b.dataset.act) {
      case 'eye': inst.hidden = !inst.hidden; saveInst(); build(); break;
      case 'del': instances = instances.filter(i => i !== inst); saveInst(); build(); break;
      case 'cfg': openSettings(inst); break;
      case 'vol': volumeVisible = !volumeVisible; lsSet(LS_VOL, volumeVisible); applyVolume(); updateLegends(); break;
    }
  }
  function applyVolume() { if (volumeSeries) volumeSeries.applyOptions({ visible: volumeVisible }); }

  /* =====================================================================
     8. MODALS (library + settings)
     ===================================================================== */
  function modal(html, onMount) {
    const bg = document.createElement('div'); bg.className = 'vx-modal-bg';
    bg.innerHTML = `<div class="vx-modal">${html}</div>`;
    document.body.appendChild(bg);
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
    bg.querySelectorAll('.vx-m-x').forEach(x => x.addEventListener('click', close));
    onMount(bg, close);
    return bg;
  }

  function openLibrary() {
    let cat = 'All', q = '';
    modal(`<div class="vx-m-head"><h3>Indicators</h3><button class="vx-m-x">×</button></div>
      <div class="vx-m-body">
        <input class="vx-search" placeholder="Search indicators (RSI, MACD, Bollinger…)" data-q>
        <div class="vx-cats" data-cats></div>
        <div data-active></div>
        <div class="vx-list" data-list></div>
      </div>
      <div class="vx-m-foot"><button class="vx-ghost" data-removeall>Remove all</button><button class="vx-primary vx-m-x">Done</button></div>`, (bg, close) => {
      const list = $('[data-list]', bg), cats = $('[data-cats]', bg), act = $('[data-active]', bg);
      function renderCats() { cats.innerHTML = ['All'].concat(CATS).map(c => `<button class="vx-btn ${c === cat ? 'on' : ''}" data-cat="${c}">${c}</button>`).join(''); }
      function renderActive() {
        act.innerHTML = instances.length ? `<div class="vx-sec">On chart</div>` + instances.map(i => `<div class="vx-act"><span>${esc(labelOf(i))}</span><span class="b"><button data-cfg="${i.id}">Settings</button><button data-del="${i.id}">Remove</button></span></div>`).join('') : '';
      }
      function renderList() {
        const ids = Object.keys(IND).filter(id => (cat === 'All' || IND[id].cat === cat) && (!q || (IND[id].name + ' ' + IND[id].desc + ' ' + id).toLowerCase().includes(q)));
        list.innerHTML = (ids.length ? `<div class="vx-sec">Library · ${ids.length}</div>` : '<div class="vx-sec">No match</div>') +
          ids.map(id => `<div class="vx-li" data-add="${id}"><div><b>${esc(IND[id].name)}</b><small>${esc(IND[id].desc)}</small></div><span class="tag">${IND[id].overlay ? 'on chart' : 'pane'}</span></div>`).join('');
      }
      renderCats(); renderActive(); renderList();
      $('[data-q]', bg).addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); renderList(); });
      bg.addEventListener('click', e => {
        const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; renderCats(); renderList(); return; }
        const a = e.target.closest('[data-add]'); if (a) { const inst = newInstance(a.dataset.add); instances.push(inst); saveInst(); build(); renderActive(); const el = a.querySelector('.tag'); if (el) { el.textContent = 'added ✓'; setTimeout(renderList, 700); } return; }
        const d = e.target.closest('[data-del]'); if (d) { instances = instances.filter(i => i.id !== d.dataset.del); saveInst(); build(); renderActive(); return; }
        const g = e.target.closest('[data-cfg]'); if (g) { const inst = instances.find(i => i.id === g.dataset.cfg); close(); openSettings(inst); return; }
        if (e.target.closest('[data-removeall]')) { if (!instances.length || confirm('Remove all indicators from the chart?')) { instances = []; saveInst(); build(); renderActive(); } }
      });
    });
  }

  function openSettings(inst) {
    if (!inst) return;
    const def = IND[inst.type];
    const work = { params: Object.assign({}, inst.params), styles: JSON.parse(JSON.stringify(inst.styles)) };
    modal(`<div class="vx-m-head"><h3>${esc(def.name)} — settings</h3><button class="vx-m-x">×</button></div>
      <div class="vx-m-body">
        <div class="vx-tabs"><button class="vx-btn on" data-tab="in">Inputs</button><button class="vx-btn" data-tab="st">Style</button></div>
        <div data-pane="in"></div><div data-pane="st" style="display:none;"></div>
      </div>
      <div class="vx-m-foot"><button class="vx-ghost" data-reset>Defaults</button><span><button class="vx-ghost vx-m-x">Cancel</button> <button class="vx-primary" data-ok>OK</button></span></div>`, (bg, close) => {
      const pin = $('[data-pane="in"]', bg), pst = $('[data-pane="st"]', bg);
      function paint() {
        pin.innerHTML = def.params.length ? def.params.map(p => p.t === 'sel'
          ? `<div class="vx-field"><label>${esc(p.l)}</label><select data-p="${p.k}">${p.o.map(o => `<option ${work.params[p.k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`
          : `<div class="vx-field"><label>${esc(p.l)}</label><input type="number" data-p="${p.k}" value="${work.params[p.k]}" min="${p.min}" max="${p.max}" step="${p.step}"></div>`).join('')
          : '<div class="vx-field"><label>This indicator has no inputs.</label></div>';
        pst.innerHTML = def.lines.map(l => {
          const s = work.styles[l.k];
          return `<div class="vx-field"><label><input type="checkbox" data-s="${l.k}" data-f="vis" ${s.vis ? 'checked' : ''}> ${esc(l.l)}</label>
            <span style="display:flex;gap:8px;align-items:center;">
              <input type="color" data-s="${l.k}" data-f="c" value="${s.c}">${l.c2 ? `<input type="color" data-s="${l.k}" data-f="c2" value="${s.c2}" title="Second colour">` : ''}
              ${l.type === 'line' ? `<select data-s="${l.k}" data-f="w" style="width:64px;">${[1, 2, 3, 4].map(w => `<option ${s.w === w ? 'selected' : ''}>${w}</option>`).join('')}</select>` : ''}
            </span></div>`;
        }).join('');
      }
      paint();
      bg.addEventListener('click', e => {
        const t = e.target.closest('[data-tab]');
        if (t) { $$('[data-tab]', bg).forEach(b => b.classList.toggle('on', b === t)); pin.style.display = t.dataset.tab === 'in' ? '' : 'none'; pst.style.display = t.dataset.tab === 'st' ? '' : 'none'; }
        if (e.target.closest('[data-reset]')) { work.params = defaultsFor(def); work.styles = defaultStyles(def); paint(); }
        if (e.target.closest('[data-ok]')) {
          def.params.forEach(p => { if (p.t === 'num') { let v = parseFloat(work.params[p.k]); if (!isFinite(v)) v = p.d; work.params[p.k] = Math.max(p.min, Math.min(p.max, v)); } });
          inst.params = work.params; inst.styles = work.styles; saveInst(); build(); close();
        }
      });
      bg.addEventListener('input', e => {
        const el = e.target;
        if (el.dataset.p) { const p = def.params.find(x => x.k === el.dataset.p); work.params[el.dataset.p] = p.t === 'num' ? el.value : el.value; }
        if (el.dataset.s) { const f = el.dataset.f; work.styles[el.dataset.s][f] = f === 'vis' ? el.checked : f === 'w' ? Number(el.value) : el.value; }
      });
    });
  }

  /* =====================================================================
     9. DRAWINGS
     ===================================================================== */
  const FIB = [[0, '#8993AB'], [0.236, '#f23645'], [0.382, '#ff9800'], [0.5, '#4caf50'], [0.618, '#26a69a'], [0.786, '#2196f3'], [1, '#8993AB'], [1.272, '#9c27b0'], [1.618, '#e91e63']];
  const NEED = { trend: 2, ray: 2, hline: 1, vline: 1, rect: 2, fib: 2, measure: 2, text: 1 };
  const loadDrawings = () => { drawings = lsGet(drawKey(symbol), []); selectedId = null; };
  const saveDrawings = () => lsSet(drawKey(symbol), drawings);

  function timeToLogical(t) {
    const n = D.t.length; if (!n) return 0;
    const T0 = D.t[0], T1 = D.t[n - 1], st = D.step || 3600;
    if (t <= T0) return (t - T0) / st;
    if (t >= T1) return n - 1 + (t - T1) / st;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (D.t[m] <= t) lo = m; else hi = m; }
    return lo + (t - D.t[lo]) / (D.t[hi] - D.t[lo]);
  }
  function logicalToTime(l) {
    const n = D.t.length; if (!n) return 0;
    if (l <= 0) return D.t[0] + l * D.step;
    if (l >= n - 1) return D.t[n - 1] + (l - (n - 1)) * D.step;
    const i = Math.floor(l); return D.t[i] + (l - i) * (D.t[i + 1] - D.t[i]);
  }
  function plotSize() {
    const W = stage.clientWidth, H = $('[data-chart-container]').clientHeight;
    let pw = 0, th = 0;
    try { pw = chart.priceScale('right').width(); } catch (e) { pw = 60; }
    try { th = chart.timeScale().height(); } catch (e) { th = 26; }
    return { W, H, w: Math.max(10, W - pw), h: Math.max(10, H - th) };
  }
  function xOf(t) {
    const l = timeToLogical(t); let x = null;
    try { x = chart.timeScale().logicalToCoordinate(l); } catch (e) { /* n/a */ }
    return x;
  }
  const yOf = p => { try { return candleSeries.priceToCoordinate(p); } catch (e) { return null; } };
  function toPoint(x, y) {
    let l = null, p = null;
    try { l = chart.timeScale().coordinateToLogical(x); } catch (e) { /* n/a */ }
    try { p = candleSeries.coordinateToPrice(y); } catch (e) { /* n/a */ }
    if (l == null || p == null) return null;
    return { t: logicalToTime(l), p };
  }
  function snap(pt, x, y) {
    if (!magnet || !pt) return pt;
    const n = D.t.length; if (!n) return pt;
    let i = Math.round(timeToLogical(pt.t)); i = Math.max(0, Math.min(n - 1, i));
    const cands = [D.o[i], D.h[i], D.l[i], D.c[i]];
    let best = null, bd = 18;
    cands.forEach(pr => { const yy = yOf(pr); if (yy != null && Math.abs(yy - y) < bd) { bd = Math.abs(yy - y); best = pr; } });
    return best != null ? { t: D.t[i], p: best } : { t: pt.t, p: pt.p };
  }

  function screenPts(d) { return d.pts.map(pt => ({ x: xOf(pt.t), y: yOf(pt.p) })); }

  function sizeCanvas() {
    if (!canvas || !stage) return;
    const dpr = window.devicePixelRatio || 1, W = stage.clientWidth, H = $('[data-chart-container]').clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    }
  }

  let lastSig = '';
  function loop() {
    requestAnimationFrame(loop);
    if (!chart || !canvas) return;
    let sig = '';
    try {
      const r = chart.timeScale().getVisibleLogicalRange();
      sig = (r ? r.from.toFixed(3) + '|' + r.to.toFixed(3) : '') + '|' + (yOf(1) || 0).toFixed(2) + '|' + (yOf(1000) || 0).toFixed(2) + '|' + stage.clientWidth + '|' + D.t.length + '|' + (D.c[D.c.length - 1] || 0);
    } catch (e) { return; }
    if (sig !== lastSig) { lastSig = sig; redraw(true); }
  }
  let rafPending = false;
  function redraw(force) {
    if (!ctx || !chart) return;
    if (!force) { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; redraw(true); }); return; }
    sizeCanvas();
    const dpr = window.devicePixelRatio || 1, ps = plotSize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ps.W, ps.H);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, ps.w, ps.h); ctx.clip();
    try { drawFills(ps); drawings.forEach(d => drawOne(d, ps, d.id === selectedId)); if (pending) drawOne(pending, ps, true, true); } catch (e) { /* mid-resize */ }
    ctx.restore();
    // price labels for horizontal lines (outside the clip, on the price scale)
    try {
      drawings.concat(pending ? [pending] : []).forEach(d => {
        if (d.type !== 'hline' || !d.pts[0]) return;
        const y = yOf(d.pts[0].p); if (y == null || y < 0 || y > ps.h) return;
        const txt = fmtV(d.pts[0].p); ctx.font = '600 11px JetBrains Mono, monospace';
        const w = ctx.measureText(txt).width + 10;
        ctx.fillStyle = d.color; ctx.fillRect(ps.w, y - 9, Math.min(w, ps.W - ps.w), 18);
        ctx.fillStyle = '#fff'; ctx.fillText(txt, ps.w + 5, y + 4);
      });
    } catch (e) { /* ignore */ }
    updateSelbar();
  }

  function drawFills(ps) {
    instances.forEach(inst => {
      if (inst.hidden) return; const def = IND[inst.type]; if (!def.fills || !inst._out) return;
      def.fills.forEach(f => {
        const A = inst._out[f.a], B = inst._out[f.b]; if (!A || !B) return;
        if (inst.styles[f.a] && !inst.styles[f.a].vis) return;
        const shift = f.shiftKey ? Number(inst.params[f.shiftKey]) || 0 : 0;
        for (let i = 0; i < A.length - 1; i++) {
          if (!ok(A[i]) || !ok(B[i]) || !ok(A[i + 1]) || !ok(B[i + 1])) continue;
          const x1 = xAtIndex(i + shift), x2 = xAtIndex(i + 1 + shift);
          if (x1 == null || x2 == null || x2 < -5 || x1 > ps.w + 5) continue;
          const ya1 = yOf(A[i]), yb1 = yOf(B[i]), ya2 = yOf(A[i + 1]), yb2 = yOf(B[i + 1]);
          if (ya1 == null || yb1 == null || ya2 == null || yb2 == null) continue;
          ctx.fillStyle = f.c || (A[i] >= B[i] ? f.up : f.down);
          ctx.beginPath(); ctx.moveTo(x1, ya1); ctx.lineTo(x2, ya2); ctx.lineTo(x2, yb2); ctx.lineTo(x1, yb1); ctx.closePath(); ctx.fill();
        }
      });
    });
  }
  function xAtIndex(i) { try { return chart.timeScale().logicalToCoordinate(i); } catch (e) { return null; } }

  function label(txt, x, y, color, ps, align) {
    ctx.font = '600 11px JetBrains Mono, monospace';
    const w = ctx.measureText(txt).width + 12, h = 20;
    let lx = align === 'right' ? x - w : x, ly = y;
    lx = Math.max(2, Math.min(ps.w - w - 2, lx)); ly = Math.max(2, Math.min(ps.h - h - 2, ly));
    ctx.fillStyle = color; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(lx, ly, w, h, 5); else ctx.rect(lx, ly, w, h);
    ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(txt, lx + 6, ly + 14);
  }
  function handle(x, y, color) { ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }

  function drawOne(d, ps, selected, isPreview) {
    const pts = screenPts(d); const a = pts[0], b = pts[1];
    if (!a || a.x == null || a.y == null) return;
    ctx.lineWidth = d.w || 2; ctx.strokeStyle = d.color; ctx.fillStyle = d.color; ctx.setLineDash(isPreview ? [5, 4] : []);
    const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    switch (d.type) {
      case 'hline': line(0, a.y, ps.w, a.y); break;
      case 'vline': line(a.x, 0, a.x, ps.h); break;
      case 'text': ctx.setLineDash([]); label(d.text || 'Text', a.x, a.y - 10, d.color, ps); break;
      case 'trend': if (b && b.x != null) line(a.x, a.y, b.x, b.y); break;
      case 'ray': if (b && b.x != null) { const dx = b.x - a.x, dy = b.y - a.y; const k = Math.abs(dx) < 1e-6 ? 1e5 : (dx > 0 ? ps.w + 50 - a.x : -a.x - 50) / dx; line(a.x, a.y, a.x + dx * Math.abs(k) * Math.sign(dx || 1), a.y + dy * Math.abs(k) * Math.sign(dx || 1)); } break;
      case 'rect': if (b && b.x != null) { ctx.fillStyle = hexA(d.color, .13); ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); } break;
      case 'fib': if (b && b.x != null) {
        const p1 = d.pts[0].p, p2 = d.pts[1].p, x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x) + 60;
        ctx.setLineDash([]);
        FIB.forEach(([lv, col], i) => {
          const price = p2 + (p1 - p2) * lv, y = yOf(price); if (y == null) return;
          ctx.strokeStyle = col; ctx.lineWidth = 1; line(x1, y, x2, y);
          ctx.fillStyle = col; ctx.font = '600 10.5px JetBrains Mono, monospace'; ctx.fillText(lv + ' (' + fmtV(price) + ')', x1 + 4, y - 3);
          const yn = i < FIB.length - 1 ? yOf(p2 + (p1 - p2) * FIB[i + 1][0]) : null;
          if (yn != null && i < 6) { ctx.fillStyle = hexA(col, .06); ctx.fillRect(x1, Math.min(y, yn), x2 - x1, Math.abs(yn - y)); }
        });
        ctx.strokeStyle = d.color; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); line(a.x, a.y, b.x, b.y);
      } break;
      case 'measure': if (b && b.x != null) {
        const dp = d.pts[1].p - d.pts[0].p, pc = d.pts[0].p ? dp / d.pts[0].p * 100 : 0, up = dp >= 0, col = up ? '#16c784' : '#ea3943';
        const bars = Math.round(timeToLogical(d.pts[1].t) - timeToLogical(d.pts[0].t));
        const secs = Math.abs(d.pts[1].t - d.pts[0].t), dur = secs >= 86400 ? (secs / 86400).toFixed(1) + 'd' : secs >= 3600 ? (secs / 3600).toFixed(1) + 'h' : Math.round(secs / 60) + 'm';
        ctx.fillStyle = hexA(col, .14); ctx.strokeStyle = col; ctx.setLineDash([]);
        ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        label(`${dp >= 0 ? '+' : ''}${fmtV(dp)} (${pc >= 0 ? '+' : ''}${pc.toFixed(2)}%) · ${bars} bars · ${dur}`, (a.x + b.x) / 2 - 80, b.y + (up ? -26 : 8), col, ps);
      } break;
    }
    ctx.setLineDash([]);
    if (selected && !isPreview) pts.forEach(p => { if (p.x != null && p.y != null && d.type !== 'hline' && d.type !== 'vline') handle(p.x, p.y, d.color); });
    if (selected && !isPreview && (d.type === 'hline')) handle(ps.w / 2, a.y, d.color);
    if (selected && !isPreview && d.type === 'vline') handle(a.x, ps.h / 2, d.color);
    if (isPreview) pts.forEach(p => { if (p.x != null && p.y != null) handle(p.x, p.y, d.color); });
  }

  /* ---- hit testing ---- */
  const distSeg = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy; let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); };
  function hit(d, x, y, ps) {
    const pts = screenPts(d); const a = pts[0], b = pts[1];
    if (!a || a.x == null || a.y == null) return null;
    for (let i = 0; i < pts.length; i++) if (pts[i].x != null && Math.hypot(x - pts[i].x, y - pts[i].y) < 9) return { kind: 'handle', i };
    switch (d.type) {
      case 'hline': return Math.abs(y - a.y) < 6 ? { kind: 'body' } : null;
      case 'vline': return Math.abs(x - a.x) < 6 ? { kind: 'body' } : null;
      case 'text': return Math.abs(x - a.x) < 60 && y > a.y - 32 && y < a.y + 6 ? { kind: 'body' } : null;
      case 'trend': case 'ray': return b && distSeg(x, y, a.x, a.y, b.x, b.y) < 6 ? { kind: 'body' } : null;
      case 'rect': case 'measure': return b && x >= Math.min(a.x, b.x) - 4 && x <= Math.max(a.x, b.x) + 4 && y >= Math.min(a.y, b.y) - 4 && y <= Math.max(a.y, b.y) + 4 ? { kind: 'body' } : null;
      case 'fib': { if (!b) return null; const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x) + 60; if (x < x1 - 4 || x > x2 + 4) return null; const p1 = d.pts[0].p, p2 = d.pts[1].p; for (const [lv] of FIB) { const yy = yOf(p2 + (p1 - p2) * lv); if (yy != null && Math.abs(yy - y) < 5) return { kind: 'body' }; } return null; }
    }
    return null;
  }

  function setTool(t) {
    tool = t; pending = null; hoverPt = null;
    $$('[data-vx-tool]').forEach(b => b.classList.toggle('on', b.dataset.vxTool === t));
    canvas.classList.toggle('active', t !== 'cursor');
    redraw(true);
  }

  function localXY(e) { const r = canvas.getBoundingClientRect(); const c = e.touches && e.touches[0] ? e.touches[0] : e; return { x: c.clientX - r.left, y: c.clientY - r.top }; }

  function bindDrawingEvents() {
    // creating: click-click on the overlay canvas (only receives events while a tool is active)
    canvas.addEventListener('click', e => {
      if (tool === 'cursor') return;
      const { x, y } = localXY(e); const ps = plotSize(); if (x > ps.w || y > ps.h) return;
      let pt = toPoint(x, y); if (!pt) return; pt = snap(pt, x, y);
      if (!pending) pending = { id: uid(), type: tool, pts: [], n: 0, color: '#6C7CFF', w: 2 };
      pending.pts = pending.pts.slice(0, pending.n);   // drop the moving preview point
      pending.pts.push(pt); pending.n++;
      if (pending.n >= NEED[pending.type]) {
        const d = pending; pending = null; hoverPt = null;
        if (d.type === 'text') { const txt = prompt('Text', ''); if (txt == null || txt === '') { setTool('cursor'); return; } d.text = txt; }
        drawings.push(d); selectedId = d.id; saveDrawings(); setTool('cursor');
      }
      redraw(true);
    });
    canvas.addEventListener('wheel', e => {
      const prev = canvas.style.pointerEvents; canvas.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY); canvas.style.pointerEvents = prev;
      if (el) { el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey })); }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('mousemove', e => {
      if (tool === 'cursor' || !pending) return;
      const { x, y } = localXY(e); let pt = toPoint(x, y); if (!pt) return; pt = snap(pt, x, y);
      pending.pts = pending.pts.slice(0, pending.n).concat([pt]); redraw(true);
    });
    document.addEventListener('keydown', e => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) return;
      if (e.key === 'Escape') { if (pending || tool !== 'cursor') setTool('cursor'); else { selectedId = null; redraw(true); } }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { drawings = drawings.filter(d => d.id !== selectedId); selectedId = null; saveDrawings(); redraw(true); e.preventDefault(); }
    });

    // selecting / dragging: capture on the stage, before the chart sees the mouse
    let drag = null;
    stage.addEventListener('mousedown', e => {
      if (tool !== 'cursor' || e.button !== 0) return;
      if (e.target.closest('.vx-legend,.vx-selbar')) return;
      const { x, y } = localXY(e); const ps = plotSize();
      if (x > ps.w || y > ps.h) return;
      for (let k = drawings.length - 1; k >= 0; k--) {
        const h = hit(drawings[k], x, y, ps); if (!h) continue;
        e.stopPropagation(); e.preventDefault();
        selectedId = drawings[k].id;
        drag = { d: drawings[k], h, x0: x, y0: y, orig: screenPts(drawings[k]), origPts: drawings[k].pts.map(p => ({ t: p.t, p: p.p })) };
        redraw(true); return;
      }
      if (selectedId) { selectedId = null; redraw(true); }
    }, true);
    window.addEventListener('mousemove', e => {
      if (!drag) { if (tool === 'cursor' && stage) { const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top, ps = plotSize(); if (x >= 0 && y >= 0 && x <= ps.w && y <= ps.h && e.target.closest && e.target.closest('.vx-stage')) { let over = false; for (let k = drawings.length - 1; k >= 0; k--) if (hit(drawings[k], x, y, ps)) { over = true; break; } stage.style.cursor = over ? 'move' : ''; } } return; }
      const { x, y } = localXY(e);
      if (drag.h.kind === 'handle') {
        let pt = toPoint(x, y); if (pt) { pt = snap(pt, x, y); drag.d.pts[drag.h.i] = pt; }
      } else {
        const dx = x - drag.x0, dy = y - drag.y0;
        drag.d.pts = drag.orig.map((s, i) => toPoint(s.x + dx, s.y + dy) || drag.origPts[i]);
      }
      redraw(true);
    });
    window.addEventListener('mouseup', () => { if (drag) { drag = null; saveDrawings(); } });
  }

  function updateSelbar() {
    if (!selbar) return;
    const d = drawings.find(x => x.id === selectedId);
    if (!d) { selbar.style.display = 'none'; return; }
    if (selbar.dataset.id !== d.id) {
      selbar.dataset.id = d.id;
      const names = { trend: 'Trend line', ray: 'Ray', hline: 'Horizontal line', vline: 'Vertical line', rect: 'Rectangle', fib: 'Fib retracement', measure: 'Measure', text: 'Text' };
      selbar.innerHTML = `<span>${names[d.type] || d.type}</span><input type="color" value="${d.color}" title="Colour"><button>Delete</button>`;
      selbar.querySelector('input').addEventListener('input', e => { d.color = e.target.value; saveDrawings(); redraw(true); });
      selbar.querySelector('button').addEventListener('click', () => { drawings = drawings.filter(x => x.id !== d.id); selectedId = null; selbar.dataset.id = ''; saveDrawings(); redraw(true); });
    }
    selbar.style.display = 'flex';
  }

  /* =====================================================================
     10. HOOKS called by trading.html's own chart code
     ===================================================================== */
  function parseUrl(url) { const m = /symbol=([A-Z0-9]+).*interval=([0-9a-zA-Z]+)/.exec(url || ''); return m ? { symbol: m[1], interval: m[2] } : null; }
  const kl2c = k => ({ t: Math.floor(k[0] / 1000), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] });

  function ensureChart() {
    const t = window.__vxTerminal;
    if (chart || !t || !t.getChart) return !!chart;
    const c = t.getChart(); if (!c || !c.chart) return false;
    chart = c.chart; candleSeries = c.candleSeries; volumeSeries = c.volumeSeries;
    lockChart(chart);
    chart.timeScale().subscribeVisibleLogicalRangeChange(rg => { if (lock || !rg) return; syncRange(rg, chart); });
    chart.subscribeCrosshairMove(p => onCrosshair(p, chart));
    applyLog(); applyVolume(); sizeCanvas();
    return true;
  }

  window.__vxOnCandles = function (klines, url) {
    scaffold(); if (!stage) return;
    if (!ensureChart()) return;
    const info = parseUrl(url);
    if (info) {
      if (info.symbol !== symbol) { symbol = info.symbol; loadDrawings(); pending = null; }
      interval = info.interval;
    }
    const rows = (klines || []).map(kl2c);
    D = { t: rows.map(r => r.t), o: rows.map(r => r.o), h: rows.map(r => r.h), l: rows.map(r => r.l), c: rows.map(r => r.c), v: rows.map(r => r.v), step: 3600 };
    const n = D.t.length; D.step = n > 1 ? D.t[n - 1] - D.t[n - 2] : 3600;
    if (interval === '1M') D.step = 30 * 86400;
    idxByTime = new Map(D.t.map((t, i) => [t, i]));
    build();
    // the page calls fitContent() right after this hook; set our zoom once that has run
    setTimeout(() => { defaultZoom(); syncRange(chart.timeScale().getVisibleLogicalRange(), chart); redraw(true); }, 30);
  };

  window.__vxOnTick = function (kline, url) {
    if (!chart || !D.t.length) return;
    const info = parseUrl(url); if (info && (info.symbol !== symbol || info.interval !== interval)) return;
    const k = kl2c(kline), n = D.t.length;
    if (k.t === D.t[n - 1]) { D.o[n - 1] = k.o; D.h[n - 1] = k.h; D.l[n - 1] = k.l; D.c[n - 1] = k.c; D.v[n - 1] = k.v; }
    else if (k.t > D.t[n - 1]) { D.t.push(k.t); D.o.push(k.o); D.h.push(k.h); D.l.push(k.l); D.c.push(k.c); D.v.push(k.v); idxByTime.set(k.t, n); }
    else return;
    updateData();
  };

  /* make sure the toolbar exists even before the first candles arrive */
  function boot() {
    scaffold();
    if (!stage) return setTimeout(boot, 200);
    loadDrawings();
    // the terminal may have loaded candles before this script ran
    const t = window.__vxTerminal;
    if (t && t.getSymbol) { symbol = t.getSymbol(); interval = t.getInterval(); loadDrawings(); }
    let tries = 0;
    const wait = setInterval(() => {
      if (ensureChart() || ++tries > 100) { clearInterval(wait); if (chart && t && t.reloadCandles && !D.t.length) t.reloadCandles(); }
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  /* expose for debugging / console use */
  window.VaultexTA = {
    add: type => { if (!IND[type]) throw new Error('Unknown indicator: ' + type + '. Try: ' + Object.keys(IND).join(', ')); const i = newInstance(type); instances.push(i); saveInst(); build(); return i; },
    clear: () => { instances = []; saveInst(); build(); },
    list: () => Object.keys(IND),
    values: (type, params) => compute({ type, params: Object.assign(defaultsFor(IND[type]), params || {}) }),
    state: () => ({ symbol, interval, candles: D.t.length, instances: instances.map(i => labelOf(i)), drawings: drawings.length }),
  };
})();
   • Chart legend with live OHLC + indicator values under the crosshair.
   • Log-scale toggle.

   Everything is saved in localStorage ("vaultex_ta_*"), so your layout is
   still there after a refresh. Pure client-side; uses the candles the page
   already loads from Binance.
   Needs the hooks (__vxOnCandles / __vxOnTick / __vxTerminal) that are added
   to trading.html's own script.
   ========================================================= */
(function () {
  'use strict';
  console.log('[trading-indicators] loaded');
  const LW = window.LightweightCharts;
  if (!LW) { console.error('[trading-indicators] lightweight-charts is not loaded'); return; }

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full / blocked */ } };

  /* =====================================================================
     1. MATH
     Series are arrays aligned with the candles; `null` = not defined yet.
     ===================================================================== */
  const nul = n => new Array(n).fill(null);
  const ok = v => v != null && !isNaN(v);
  const first = x => { for (let i = 0; i < x.length; i++) if (ok(x[i])) return i; return -1; };
  const map2 = (a, b, f) => a.map((v, i) => (ok(v) && ok(b[i])) ? f(v, b[i], i) : null);
  const map1 = (a, f) => a.map((v, i) => ok(v) ? f(v, i) : null);

  function sma(x, p) {
    const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o;
    let sum = 0;
    for (let i = s0; i < n; i++) { sum += x[i]; if (i - s0 >= p) sum -= x[i - p]; if (i - s0 >= p - 1) o[i] = sum / p; }
    return o;
  }
  function ema(x, p, alpha) {
    const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o;
    const k = alpha || 2 / (p + 1); let prev = null, sum = 0;
    for (let i = s0; i < n; i++) {
      const j = i - s0;
      if (j < p - 1) { sum += x[i]; continue; }
      if (j === p - 1) { sum += x[i]; prev = sum / p; } else prev = x[i] * k + prev * (1 - k);
      o[i] = prev;
    }
    return o;
  }
  const rma = (x, p) => ema(x, p, 1 / p);
  function wma(x, p) {
    const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o;
    const den = p * (p + 1) / 2;
    for (let i = s0 + p - 1; i < n; i++) { let s = 0; for (let k = 0; k < p; k++) s += x[i - p + 1 + k] * (k + 1); o[i] = s / den; }
    return o;
  }
  function hma(x, p) {
    const h = Math.max(1, Math.floor(p / 2)), r = Math.max(1, Math.round(Math.sqrt(p)));
    const w1 = wma(x, h), w2 = wma(x, p);
    return wma(map2(w1, w2, (a, b) => 2 * a - b), r);
  }
  function vwma(x, v, p) {
    const n = x.length, o = nul(n);
    for (let i = p - 1; i < n; i++) { let a = 0, b = 0; for (let k = i - p + 1; k <= i; k++) { a += x[k] * v[k]; b += v[k]; } o[i] = b ? a / b : null; }
    return o;
  }
  function stdev(x, p) {
    const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o;
    for (let i = s0 + p - 1; i < n; i++) {
      let m = 0; for (let k = i - p + 1; k <= i; k++) m += x[k]; m /= p;
      let s = 0; for (let k = i - p + 1; k <= i; k++) s += (x[k] - m) * (x[k] - m);
      o[i] = Math.sqrt(s / p);
    }
    return o;
  }
  function highest(x, p) { const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o; for (let i = s0 + p - 1; i < n; i++) { let m = -Infinity; for (let k = i - p + 1; k <= i; k++) if (x[k] > m) m = x[k]; o[i] = m; } return o; }
  function lowest(x, p) { const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o; for (let i = s0 + p - 1; i < n; i++) { let m = Infinity; for (let k = i - p + 1; k <= i; k++) if (x[k] < m) m = x[k]; o[i] = m; } return o; }
  function sumN(x, p) { const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o; let s = 0; for (let i = s0; i < n; i++) { s += x[i]; if (i - s0 >= p) s -= x[i - p]; if (i - s0 >= p - 1) o[i] = s; } return o; }
  function trueRange(h, l, c) { return h.map((hv, i) => i === 0 ? hv - l[i] : Math.max(hv - l[i], Math.abs(hv - c[i - 1]), Math.abs(l[i] - c[i - 1]))); }
  const atr = (h, l, c, p) => rma(trueRange(h, l, c), p);
  function linreg(x, p) {
    const n = x.length, o = nul(n), s0 = first(x); if (s0 < 0) return o;
    const sx = p * (p - 1) / 2, sxx = (p - 1) * p * (2 * p - 1) / 6;
    for (let i = s0 + p - 1; i < n; i++) {
      let sy = 0, sxy = 0;
      for (let k = 0; k < p; k++) { const y = x[i - p + 1 + k]; sy += y; sxy += k * y; }
      const slope = (p * sxy - sx * sy) / (p * sxx - sx * sx), icpt = (sy - slope * sx) / p;
      o[i] = icpt + slope * (p - 1);
    }
    return o;
  }
  const shiftArr = (x, k) => { const n = x.length, o = nul(n); for (let i = 0; i < n; i++) { const j = i - k; if (j >= 0 && j < n) o[i] = x[j]; } return o; };

  function srcArr(d, k) {
    switch (k) {
      case 'open': return d.o; case 'high': return d.h; case 'low': return d.l;
      case 'hl2': return d.h.map((v, i) => (v + d.l[i]) / 2);
      case 'hlc3': return d.h.map((v, i) => (v + d.l[i] + d.c[i]) / 3);
      case 'ohlc4': return d.h.map((v, i) => (d.o[i] + v + d.l[i] + d.c[i]) / 4);
      default: return d.c;
    }
  }

  /* =====================================================================
     2. INDICATOR LIBRARY
     overlay:true  -> drawn on the price chart
     overlay:false -> own pane under the chart
     ===================================================================== */
  const NUM = (k, l, d, min, max, step) => ({ k, l, d, t: 'num', min: min == null ? 1 : min, max: max == null ? 1000 : max, step: step || 1 });
  const SRC = { k: 'src', l: 'Source', d: 'close', t: 'sel', o: ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'] };
  const LINE = (k, l, c, extra) => Object.assign({ k, l, c, w: 2, type: 'line' }, extra || {});
  const HIST = (k, l, c, c2, extra) => Object.assign({ k, l, c, c2, w: 1, type: 'hist' }, extra || {});
  const GREEN = '#26a69a', RED = '#ef5350', BLUE = '#2962ff', ORANGE = '#ff6d00', PURPLE = '#7e57c2', YELLOW = '#f7a600', PINK = '#e91e63', CYAN = '#00bcd4';

  const IND = {};
  const add = (id, cat, name, desc, def) => { IND[id] = Object.assign({ id, cat, name, desc, overlay: false, params: [], lines: [], levels: [], future: () => 0 }, def); };

  /* ---- Moving averages (overlay) ---- */
  add('sma', 'Moving averages', 'SMA', 'Simple Moving Average', { overlay: true, params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'SMA', YELLOW)], calc: (d, p) => ({ v: sma(srcArr(d, p.src), p.len) }) });
  add('ema', 'Moving averages', 'EMA', 'Exponential Moving Average', { overlay: true, params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'EMA', BLUE)], calc: (d, p) => ({ v: ema(srcArr(d, p.src), p.len) }) });
  add('wma', 'Moving averages', 'WMA', 'Weighted Moving Average', { overlay: true, params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'WMA', PINK)], calc: (d, p) => ({ v: wma(srcArr(d, p.src), p.len) }) });
  add('hma', 'Moving averages', 'HMA', 'Hull Moving Average', { overlay: true, params: [NUM('len', 'Length', 21), SRC], lines: [LINE('v', 'HMA', CYAN)], calc: (d, p) => ({ v: hma(srcArr(d, p.src), p.len) }) });
  add('smma', 'Moving averages', 'SMMA', 'Smoothed MA (Wilder / RMA)', { overlay: true, params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'SMMA', PURPLE)], calc: (d, p) => ({ v: rma(srcArr(d, p.src), p.len) }) });
  add('vwma', 'Moving averages', 'VWMA', 'Volume Weighted Moving Average', { overlay: true, params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'VWMA', ORANGE)], calc: (d, p) => ({ v: vwma(srcArr(d, p.src), d.v, p.len) }) });
  add('dema', 'Moving averages', 'DEMA', 'Double Exponential MA', { overlay: true, params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'DEMA', GREEN)], calc: (d, p) => { const e1 = ema(srcArr(d, p.src), p.len), e2 = ema(e1, p.len); return { v: map2(e1, e2, (a, b) => 2 * a - b) }; } });
  add('tema', 'Moving averages', 'TEMA', 'Triple Exponential MA', { overlay: true, params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'TEMA', RED)], calc: (d, p) => { const e1 = ema(srcArr(d, p.src), p.len), e2 = ema(e1, p.len), e3 = ema(e2, p.len); return { v: e1.map((a, i) => ok(a) && ok(e2[i]) && ok(e3[i]) ? 3 * a - 3 * e2[i] + e3[i] : null) }; } });
  add('lsma', 'Moving averages', 'LSMA', 'Least Squares MA (linear regression curve)', { overlay: true, params: [NUM('len', 'Length', 25), SRC], lines: [LINE('v', 'LSMA', YELLOW)], calc: (d, p) => ({ v: linreg(srcArr(d, p.src), p.len) }) });
  add('alligator', 'Moving averages', 'Alligator', 'Williams Alligator (jaw / teeth / lips)', {
    overlay: true, params: [NUM('jaw', 'Jaw length', 13), NUM('teeth', 'Teeth length', 8), NUM('lips', 'Lips length', 5)],
    lines: [LINE('jaw', 'Jaw', BLUE, { shift: () => 8 }), LINE('teeth', 'Teeth', RED, { shift: () => 5 }), LINE('lips', 'Lips', GREEN, { shift: () => 3 })],
    future: () => 8,
    calc: (d, p) => { const s = srcArr(d, 'hl2'); return { jaw: rma(s, p.jaw), teeth: rma(s, p.teeth), lips: rma(s, p.lips) }; },
  });

  /* ---- Bands & channels (overlay) ---- */
  add('bb', 'Bands & channels', 'Bollinger Bands', 'Moving average ± standard deviations', {
    overlay: true, params: [NUM('len', 'Length', 20), NUM('mult', 'StdDev', 2, 0.1, 10, 0.1), SRC],
    lines: [LINE('u', 'Upper', BLUE), LINE('b', 'Basis', ORANGE), LINE('l', 'Lower', BLUE)],
    fills: [{ a: 'u', b: 'l', c: 'rgba(41,98,255,.08)' }],
    calc: (d, p) => { const s = srcArr(d, p.src), b = sma(s, p.len), sd = stdev(s, p.len); return { u: map2(b, sd, (m, x) => m + p.mult * x), b, l: map2(b, sd, (m, x) => m - p.mult * x) }; },
  });
  add('keltner', 'Bands & channels', 'Keltner Channels', 'EMA ± ATR multiple', {
    overlay: true, params: [NUM('len', 'EMA length', 20), NUM('mult', 'Multiplier', 2, 0.1, 10, 0.1), NUM('atrLen', 'ATR length', 10), SRC],
    lines: [LINE('u', 'Upper', BLUE), LINE('b', 'Basis', ORANGE), LINE('l', 'Lower', BLUE)],
    fills: [{ a: 'u', b: 'l', c: 'rgba(41,98,255,.07)' }],
    calc: (d, p) => { const b = ema(srcArr(d, p.src), p.len), a = atr(d.h, d.l, d.c, p.atrLen); return { u: map2(b, a, (m, x) => m + p.mult * x), b, l: map2(b, a, (m, x) => m - p.mult * x) }; },
  });
  add('donchian', 'Bands & channels', 'Donchian Channels', 'Highest high / lowest low', {
    overlay: true, params: [NUM('len', 'Length', 20)],
    lines: [LINE('u', 'Upper', BLUE), LINE('b', 'Basis', ORANGE), LINE('l', 'Lower', BLUE)],
    fills: [{ a: 'u', b: 'l', c: 'rgba(41,98,255,.06)' }],
    calc: (d, p) => { const u = highest(d.h, p.len), l = lowest(d.l, p.len); return { u, l, b: map2(u, l, (a, b) => (a + b) / 2) }; },
  });
  add('envelope', 'Bands & channels', 'MA Envelope', 'SMA ± percentage', {
    overlay: true, params: [NUM('len', 'Length', 20), NUM('pct', 'Percent', 2.5, 0.1, 50, 0.1), SRC],
    lines: [LINE('u', 'Upper', GREEN), LINE('b', 'Basis', YELLOW), LINE('l', 'Lower', RED)],
    calc: (d, p) => { const b = sma(srcArr(d, p.src), p.len); return { u: map1(b, v => v * (1 + p.pct / 100)), b, l: map1(b, v => v * (1 - p.pct / 100)) }; },
  });
  add('ichimoku', 'Bands & channels', 'Ichimoku Cloud', 'Tenkan, Kijun, Senkou A/B cloud, Chikou', {
    overlay: true, params: [NUM('conv', 'Conversion', 9), NUM('base', 'Base', 26), NUM('spanB', 'Span B', 52), NUM('disp', 'Displacement', 26)],
    lines: [LINE('tenkan', 'Conversion', BLUE, { w: 1 }), LINE('kijun', 'Base', RED, { w: 1 }), LINE('chikou', 'Lagging', PURPLE, { w: 1, shift: p => -p.disp }),
      LINE('a', 'Span A', GREEN, { w: 1, shift: p => p.disp }), LINE('b', 'Span B', RED, { w: 1, shift: p => p.disp })],
    fills: [{ a: 'a', b: 'b', up: 'rgba(38,166,154,.16)', down: 'rgba(239,83,80,.16)', shiftKey: 'disp' }],
    future: p => p.disp,
    calc: (d, p) => {
      const mid = n => map2(highest(d.h, n), lowest(d.l, n), (a, b) => (a + b) / 2);
      const t = mid(p.conv), k = mid(p.base);
      return { tenkan: t, kijun: k, a: map2(t, k, (x, y) => (x + y) / 2), b: mid(p.spanB), chikou: d.c.slice() };
    },
  });
  add('psar', 'Bands & channels', 'Parabolic SAR', 'Stop-and-reverse dots', {
    overlay: true, params: [NUM('start', 'Start', 0.02, 0.001, 1, 0.001), NUM('inc', 'Increment', 0.02, 0.001, 1, 0.001), NUM('max', 'Max', 0.2, 0.01, 1, 0.01)],
    lines: [LINE('v', 'SAR', BLUE, { type: 'dots', c2: ORANGE })],
    calc: (d, p) => {
      const n = d.c.length, o = nul(n), bullArr = nul(n); if (n < 3) return { v: o, bull: bullArr };
      let bull = d.c[1] >= d.c[0], ep = bull ? d.h[0] : d.l[0], sar = bull ? d.l[0] : d.h[0], af = p.start;
      for (let i = 1; i < n; i++) {
        sar = sar + af * (ep - sar);
        if (bull) {
          sar = Math.min(sar, d.l[i - 1], i > 1 ? d.l[i - 2] : d.l[i - 1]);
          if (d.l[i] < sar) { bull = false; sar = ep; ep = d.l[i]; af = p.start; }
          else if (d.h[i] > ep) { ep = d.h[i]; af = Math.min(af + p.inc, p.max); }
        } else {
          sar = Math.max(sar, d.h[i - 1], i > 1 ? d.h[i - 2] : d.h[i - 1]);
          if (d.h[i] > sar) { bull = true; sar = ep; ep = d.h[i]; af = p.start; }
          else if (d.l[i] < ep) { ep = d.l[i]; af = Math.min(af + p.inc, p.max); }
        }
        o[i] = sar; bullArr[i] = bull ? 1 : 0;
      }
      return { v: o, bull: bullArr };
    },
  });
  add('supertrend', 'Bands & channels', 'Supertrend', 'ATR trend-following stop line', {
    overlay: true, params: [NUM('len', 'ATR length', 10), NUM('mult', 'Factor', 3, 0.1, 20, 0.1)],
    lines: [LINE('up', 'Up trend', GREEN), LINE('dn', 'Down trend', RED)],
    calc: (d, p) => {
      const n = d.c.length, a = atr(d.h, d.l, d.c, p.len), up = nul(n), dn = nul(n);
      let fub = null, flb = null, dir = 1, started = false;
      for (let i = 0; i < n; i++) {
        if (!ok(a[i])) continue;
        const hl2 = (d.h[i] + d.l[i]) / 2; let ub = hl2 + p.mult * a[i], lb = hl2 - p.mult * a[i];
        if (started) {
          ub = (ub < fub || d.c[i - 1] > fub) ? ub : fub;
          lb = (lb > flb || d.c[i - 1] < flb) ? lb : flb;
          if (dir === -1 && d.c[i] > ub) dir = 1; else if (dir === 1 && d.c[i] < lb) dir = -1;
        }
        fub = ub; flb = lb; started = true;
        if (dir === 1) up[i] = lb; else dn[i] = ub;
      }
      return { up, dn };
    },
  });
  add('vwap', 'Bands & channels', 'VWAP', 'Volume Weighted Average Price (resets each period)', {
    overlay: true, params: [{ k: 'anchor', l: 'Anchor', d: 'Day', t: 'sel', o: ['Day', 'Week', 'Month', 'Range'] }],
    lines: [LINE('v', 'VWAP', PINK)],
    calc: (d, p) => {
      const n = d.c.length, o = nul(n); let pv = 0, vv = 0, key = null;
      let anchor = p.anchor; if (d.step >= 86400 && anchor === 'Day') anchor = 'Range';
      for (let i = 0; i < n; i++) {
        const dt = new Date(d.t[i] * 1000);
        let k = 'all';
        if (anchor === 'Day') k = dt.toISOString().slice(0, 10);
        else if (anchor === 'Month') k = dt.toISOString().slice(0, 7);
        else if (anchor === 'Week') { const t = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); k = t.toISOString().slice(0, 10); }
        if (k !== key) { key = k; pv = 0; vv = 0; }
        const tp = (d.h[i] + d.l[i] + d.c[i]) / 3; pv += tp * d.v[i]; vv += d.v[i]; o[i] = vv ? pv / vv : null;
      }
      return { v: o };
    },
  });

  /* ---- Momentum (pane) ---- */
  const RSI_CALC = (c, len) => {
    const n = c.length, g = nul(n), l = nul(n);
    for (let i = 1; i < n; i++) { const df = c[i] - c[i - 1]; g[i] = df > 0 ? df : 0; l[i] = df < 0 ? -df : 0; }
    const ag = rma(g, len), al = rma(l, len);
    return ag.map((a, i) => ok(a) && ok(al[i]) ? (al[i] === 0 ? 100 : 100 - 100 / (1 + a / al[i])) : null);
  };
  add('rsi', 'Momentum', 'RSI', 'Relative Strength Index', { params: [NUM('len', 'Length', 14), SRC], lines: [LINE('v', 'RSI', PURPLE)], levels: [70, 50, 30], range: [0, 100], calc: (d, p) => ({ v: RSI_CALC(srcArr(d, p.src), p.len) }) });
  add('macd', 'Momentum', 'MACD', 'Moving Average Convergence Divergence', {
    params: [NUM('fast', 'Fast', 12), NUM('slow', 'Slow', 26), NUM('sig', 'Signal', 9), SRC],
    lines: [HIST('hist', 'Histogram', GREEN, RED, { mode: 'sign4' }), LINE('macd', 'MACD', BLUE), LINE('signal', 'Signal', ORANGE)], levels: [0],
    calc: (d, p) => { const s = srcArr(d, p.src), m = map2(ema(s, p.fast), ema(s, p.slow), (a, b) => a - b), sg = ema(m, p.sig); return { macd: m, signal: sg, hist: map2(m, sg, (a, b) => a - b) }; },
  });
  add('ppo', 'Momentum', 'PPO', 'Percentage Price Oscillator', {
    params: [NUM('fast', 'Fast', 12), NUM('slow', 'Slow', 26), NUM('sig', 'Signal', 9), SRC],
    lines: [HIST('hist', 'Histogram', GREEN, RED, { mode: 'sign4' }), LINE('ppo', 'PPO', BLUE), LINE('signal', 'Signal', ORANGE)], levels: [0],
    calc: (d, p) => { const s = srcArr(d, p.src), sl = ema(s, p.slow), m = map2(ema(s, p.fast), sl, (a, b) => b ? (a - b) / b * 100 : null), sg = ema(m, p.sig); return { ppo: m, signal: sg, hist: map2(m, sg, (a, b) => a - b) }; },
  });
  add('stoch', 'Momentum', 'Stochastic', 'Stochastic Oscillator %K / %D', {
    params: [NUM('k', '%K length', 14), NUM('smooth', '%K smoothing', 3), NUM('d', '%D smoothing', 3)],
    lines: [LINE('k', '%K', BLUE), LINE('d', '%D', ORANGE)], levels: [80, 50, 20], range: [0, 100],
    calc: (d, p) => { const hh = highest(d.h, p.k), ll = lowest(d.l, p.k), raw = d.c.map((c, i) => ok(hh[i]) && ok(ll[i]) ? (hh[i] === ll[i] ? 50 : 100 * (c - ll[i]) / (hh[i] - ll[i])) : null), k = sma(raw, p.smooth); return { k, d: sma(k, p.d) }; },
  });
  add('stochrsi', 'Momentum', 'Stochastic RSI', 'Stochastic applied to RSI', {
    params: [NUM('rsi', 'RSI length', 14), NUM('stoch', 'Stochastic length', 14), NUM('k', '%K', 3), NUM('d', '%D', 3), SRC],
    lines: [LINE('k', '%K', BLUE), LINE('d', '%D', ORANGE)], levels: [80, 20], range: [0, 100],
    calc: (d, p) => { const r = RSI_CALC(srcArr(d, p.src), p.rsi), hh = highest(r, p.stoch), ll = lowest(r, p.stoch), s = r.map((v, i) => ok(v) && ok(hh[i]) ? (hh[i] === ll[i] ? 50 : 100 * (v - ll[i]) / (hh[i] - ll[i])) : null), k = sma(s, p.k); return { k, d: sma(k, p.d) }; },
  });
  add('cci', 'Momentum', 'CCI', 'Commodity Channel Index', {
    params: [NUM('len', 'Length', 20)], lines: [LINE('v', 'CCI', BLUE)], levels: [100, 0, -100],
    calc: (d, p) => { const tp = srcArr(d, 'hlc3'), m = sma(tp, p.len), n = tp.length, o = nul(n); for (let i = p.len - 1; i < n; i++) { let s = 0; for (let k = i - p.len + 1; k <= i; k++) s += Math.abs(tp[k] - m[i]); const md = s / p.len; o[i] = md ? (tp[i] - m[i]) / (0.015 * md) : 0; } return { v: o }; },
  });
  add('willr', 'Momentum', 'Williams %R', 'Williams Percent Range', {
    params: [NUM('len', 'Length', 14)], lines: [LINE('v', '%R', PURPLE)], levels: [-20, -50, -80], range: [-100, 0],
    calc: (d, p) => { const hh = highest(d.h, p.len), ll = lowest(d.l, p.len); return { v: d.c.map((c, i) => ok(hh[i]) ? (hh[i] === ll[i] ? -50 : 100 * (c - hh[i]) / (hh[i] - ll[i])) : null) }; },
  });
  add('roc', 'Momentum', 'ROC', 'Rate of Change (%)', { params: [NUM('len', 'Length', 9), SRC], lines: [LINE('v', 'ROC', BLUE)], levels: [0], calc: (d, p) => { const s = srcArr(d, p.src); return { v: s.map((v, i) => i >= p.len && s[i - p.len] ? 100 * (v - s[i - p.len]) / s[i - p.len] : null) }; } });
  add('mom', 'Momentum', 'Momentum', 'Price change over N bars', { params: [NUM('len', 'Length', 10), SRC], lines: [LINE('v', 'MOM', BLUE)], levels: [0], calc: (d, p) => { const s = srcArr(d, p.src); return { v: s.map((v, i) => i >= p.len ? v - s[i - p.len] : null) }; } });
  add('ao', 'Momentum', 'Awesome Oscillator', 'SMA(5) − SMA(34) of median price', {
    params: [NUM('fast', 'Fast', 5), NUM('slow', 'Slow', 34)], lines: [HIST('v', 'AO', GREEN, RED, { mode: 'delta' })], levels: [0],
    calc: (d, p) => { const s = srcArr(d, 'hl2'); return { v: map2(sma(s, p.fast), sma(s, p.slow), (a, b) => a - b) }; },
  });
  add('trix', 'Momentum', 'TRIX', 'Triple-smoothed EMA rate of change', {
    params: [NUM('len', 'Length', 15), NUM('sig', 'Signal', 9)], lines: [LINE('v', 'TRIX', BLUE), LINE('s', 'Signal', ORANGE)], levels: [0],
    calc: (d, p) => { const lg = d.c.map(v => Math.log(v)), e = ema(ema(ema(lg, p.len), p.len), p.len), t = e.map((v, i) => ok(v) && ok(e[i - 1]) ? 10000 * (v - e[i - 1]) : null); return { v: t, s: ema(t, p.sig) }; },
  });
  add('uo', 'Momentum', 'Ultimate Oscillator', 'Three-timeframe momentum', {
    params: [NUM('a', 'Fast', 7), NUM('b', 'Middle', 14), NUM('c', 'Slow', 28)], lines: [LINE('v', 'UO', PURPLE)], levels: [70, 30], range: [0, 100],
    calc: (d, p) => { const n = d.c.length, bp = nul(n), tr = nul(n); for (let i = 1; i < n; i++) { const lo = Math.min(d.l[i], d.c[i - 1]), hi = Math.max(d.h[i], d.c[i - 1]); bp[i] = d.c[i] - lo; tr[i] = hi - lo; } const f = k => { const a = sumN(bp, k), b = sumN(tr, k); return a.map((v, i) => ok(v) && ok(b[i]) && b[i] ? v / b[i] : null); }; const A = f(p.a), B = f(p.b), C = f(p.c); return { v: A.map((v, i) => ok(v) && ok(B[i]) && ok(C[i]) ? 100 * (4 * v + 2 * B[i] + C[i]) / 7 : null) }; },
  });
  add('tsi', 'Momentum', 'True Strength Index', 'Double-smoothed momentum', {
    params: [NUM('long', 'Long', 25), NUM('short', 'Short', 13), NUM('sig', 'Signal', 13), SRC], lines: [LINE('v', 'TSI', BLUE), LINE('s', 'Signal', ORANGE)], levels: [0],
    calc: (d, p) => { const s = srcArr(d, p.src), m = s.map((v, i) => i ? v - s[i - 1] : null), am = m.map(v => ok(v) ? Math.abs(v) : null), a = ema(ema(m, p.long), p.short), b = ema(ema(am, p.long), p.short), t = a.map((v, i) => ok(v) && ok(b[i]) && b[i] ? 100 * v / b[i] : null); return { v: t, s: ema(t, p.sig) }; },
  });
  add('cmo', 'Momentum', 'Chande Momentum', 'Chande Momentum Oscillator', {
    params: [NUM('len', 'Length', 9), SRC], lines: [LINE('v', 'CMO', PURPLE)], levels: [50, 0, -50], range: [-100, 100],
    calc: (d, p) => { const s = srcArr(d, p.src), up = s.map((v, i) => i ? Math.max(v - s[i - 1], 0) : null), dn = s.map((v, i) => i ? Math.max(s[i - 1] - v, 0) : null), su = sumN(up, p.len), sd = sumN(dn, p.len); return { v: su.map((u, i) => ok(u) && ok(sd[i]) && (u + sd[i]) ? 100 * (u - sd[i]) / (u + sd[i]) : null) }; },
  });
  add('dpo', 'Momentum', 'DPO', 'Detrended Price Oscillator', {
    params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'DPO', BLUE)], levels: [0],
    calc: (d, p) => { const s = srcArr(d, p.src), m = sma(s, p.len), k = Math.floor(p.len / 2) + 1; return { v: m.map((v, i) => ok(v) && i - k >= 0 ? s[i - k] - v : null) }; },
  });
  add('coppock', 'Momentum', 'Coppock Curve', 'Long-term momentum (WMA of two ROCs)', {
    params: [NUM('wma', 'WMA length', 10), NUM('r1', 'Long ROC', 14), NUM('r2', 'Short ROC', 11), SRC], lines: [HIST('v', 'Coppock', GREEN, RED, { mode: 'delta' })], levels: [0],
    calc: (d, p) => { const s = srcArr(d, p.src), roc = k => s.map((v, i) => i >= k && s[i - k] ? 100 * (v - s[i - k]) / s[i - k] : null); return { v: wma(map2(roc(p.r1), roc(p.r2), (a, b) => a + b), p.wma) }; },
  });
  add('bop', 'Momentum', 'Balance of Power', 'Buyers vs sellers strength', {
    params: [NUM('len', 'Smoothing', 14)], lines: [LINE('v', 'BoP', BLUE)], levels: [0],
    calc: (d, p) => ({ v: sma(d.c.map((c, i) => d.h[i] === d.l[i] ? 0 : (c - d.o[i]) / (d.h[i] - d.l[i])), p.len) }),
  });

  /* ---- Trend strength (pane) ---- */
  add('adx', 'Trend', 'ADX / DMI', 'Average Directional Index with +DI / −DI', {
    params: [NUM('len', 'DI length', 14), NUM('smooth', 'ADX smoothing', 14)], lines: [LINE('adx', 'ADX', RED), LINE('pdi', '+DI', BLUE), LINE('mdi', '−DI', ORANGE)], levels: [25],
    calc: (d, p) => {
      const n = d.c.length, pdm = nul(n), mdm = nul(n);
      for (let i = 1; i < n; i++) { const up = d.h[i] - d.h[i - 1], dn = d.l[i - 1] - d.l[i]; pdm[i] = up > dn && up > 0 ? up : 0; mdm[i] = dn > up && dn > 0 ? dn : 0; }
      const a = atr(d.h, d.l, d.c, p.len), P = rma(pdm, p.len), M = rma(mdm, p.len);
      const pdi = P.map((v, i) => ok(v) && ok(a[i]) && a[i] ? 100 * v / a[i] : null), mdi = M.map((v, i) => ok(v) && ok(a[i]) && a[i] ? 100 * v / a[i] : null);
      const dx = pdi.map((v, i) => ok(v) && ok(mdi[i]) && (v + mdi[i]) ? 100 * Math.abs(v - mdi[i]) / (v + mdi[i]) : null);
      return { adx: rma(dx, p.smooth), pdi, mdi };
    },
  });
  add('aroon', 'Trend', 'Aroon', 'Time since highest high / lowest low', {
    params: [NUM('len', 'Length', 14)], lines: [LINE('up', 'Aroon Up', GREEN), LINE('dn', 'Aroon Down', RED)], levels: [70, 50, 30], range: [0, 100],
    calc: (d, p) => { const n = d.c.length, up = nul(n), dn = nul(n); for (let i = p.len; i < n; i++) { let hi = -Infinity, lo = Infinity, hiI = i, loI = i; for (let k = i - p.len; k <= i; k++) { if (d.h[k] >= hi) { hi = d.h[k]; hiI = k; } if (d.l[k] <= lo) { lo = d.l[k]; loI = k; } } up[i] = 100 * (p.len - (i - hiI)) / p.len; dn[i] = 100 * (p.len - (i - loI)) / p.len; } return { up, dn }; },
  });
  add('vortex', 'Trend', 'Vortex', 'Vortex Indicator VI+ / VI−', {
    params: [NUM('len', 'Length', 14)], lines: [LINE('p', 'VI +', BLUE), LINE('m', 'VI −', RED)], levels: [1],
    calc: (d, p) => { const n = d.c.length, vp = nul(n), vm = nul(n), tr = trueRange(d.h, d.l, d.c); for (let i = 1; i < n; i++) { vp[i] = Math.abs(d.h[i] - d.l[i - 1]); vm[i] = Math.abs(d.l[i] - d.h[i - 1]); } const st = sumN(tr, p.len), sp = sumN(vp, p.len), sm = sumN(vm, p.len); return { p: sp.map((v, i) => ok(v) && ok(st[i]) && st[i] ? v / st[i] : null), m: sm.map((v, i) => ok(v) && ok(st[i]) && st[i] ? v / st[i] : null) }; },
  });
  add('chop', 'Trend', 'Choppiness Index', 'Trending vs sideways market', {
    params: [NUM('len', 'Length', 14)], lines: [LINE('v', 'CHOP', PURPLE)], levels: [61.8, 38.2], range: [0, 100],
    calc: (d, p) => { const s = sumN(trueRange(d.h, d.l, d.c), p.len), hh = highest(d.h, p.len), ll = lowest(d.l, p.len); return { v: s.map((v, i) => ok(v) && ok(hh[i]) && hh[i] !== ll[i] ? 100 * Math.log10(v / (hh[i] - ll[i])) / Math.log10(p.len) : null) }; },
  });
  add('mass', 'Trend', 'Mass Index', 'Range expansion / reversal bulge', {
    params: [NUM('ema', 'EMA length', 9), NUM('sum', 'Sum length', 25)], lines: [LINE('v', 'Mass', BLUE)], levels: [27, 26.5],
    calc: (d, p) => { const r = d.h.map((h, i) => h - d.l[i]), e1 = ema(r, p.ema), e2 = ema(e1, p.ema); return { v: sumN(e1.map((v, i) => ok(v) && ok(e2[i]) && e2[i] ? v / e2[i] : null), p.sum) }; },
  });

  /* ---- Volatility (pane) ---- */
  add('atr', 'Volatility', 'ATR', 'Average True Range', { params: [NUM('len', 'Length', 14)], lines: [LINE('v', 'ATR', RED)], calc: (d, p) => ({ v: atr(d.h, d.l, d.c, p.len) }) });
  add('stdev', 'Volatility', 'Standard Deviation', 'Standard deviation of price', { params: [NUM('len', 'Length', 20), SRC], lines: [LINE('v', 'StdDev', BLUE)], calc: (d, p) => ({ v: stdev(srcArr(d, p.src), p.len) }) });
  add('hv', 'Volatility', 'Historical Volatility', 'Annualised stdev of log returns (%)', {
    params: [NUM('len', 'Length', 10), NUM('ann', 'Bars per year', 365, 1, 100000)], lines: [LINE('v', 'HV', PURPLE)],
    calc: (d, p) => { const r = d.c.map((c, i) => i ? Math.log(c / d.c[i - 1]) : null); return { v: map1(stdev(r, p.len), v => v * Math.sqrt(p.ann) * 100) }; },
  });
  add('bbpb', 'Volatility', 'Bollinger %B', 'Where price sits inside the bands', {
    params: [NUM('len', 'Length', 20), NUM('mult', 'StdDev', 2, 0.1, 10, 0.1), SRC], lines: [LINE('v', '%B', BLUE)], levels: [1, 0.5, 0],
    calc: (d, p) => { const s = srcArr(d, p.src), b = sma(s, p.len), sd = stdev(s, p.len); return { v: s.map((c, i) => ok(b[i]) && ok(sd[i]) && sd[i] ? (c - (b[i] - p.mult * sd[i])) / (2 * p.mult * sd[i]) : null) }; },
  });
  add('bbw', 'Volatility', 'Bollinger Bandwidth', 'Width of Bollinger Bands', {
    params: [NUM('len', 'Length', 20), NUM('mult', 'StdDev', 2, 0.1, 10, 0.1), SRC], lines: [LINE('v', 'BBW', ORANGE)],
    calc: (d, p) => { const s = srcArr(d, p.src), b = sma(s, p.len), sd = stdev(s, p.len); return { v: b.map((m, i) => ok(m) && ok(sd[i]) && m ? 2 * p.mult * sd[i] / m : null) }; },
  });

  /* ---- Volume (pane) ---- */
  add('obv', 'Volume', 'OBV', 'On Balance Volume', { lines: [LINE('v', 'OBV', BLUE)], calc: d => { let s = 0; return { v: d.c.map((c, i) => { if (i) s += c > d.c[i - 1] ? d.v[i] : c < d.c[i - 1] ? -d.v[i] : 0; return s; }) }; } });
  add('ad', 'Volume', 'Accumulation / Distribution', 'A/D line', { lines: [LINE('v', 'A/D', BLUE)], calc: d => { let s = 0; return { v: d.c.map((c, i) => { const r = d.h[i] - d.l[i]; s += r ? ((c - d.l[i]) - (d.h[i] - c)) / r * d.v[i] : 0; return s; }) }; } });
  add('cmf', 'Volume', 'Chaikin Money Flow', 'Buying / selling pressure', {
    params: [NUM('len', 'Length', 20)], lines: [HIST('v', 'CMF', GREEN, RED, { mode: 'sign' })], levels: [0],
    calc: (d, p) => { const m = d.c.map((c, i) => { const r = d.h[i] - d.l[i]; return r ? ((c - d.l[i]) - (d.h[i] - c)) / r * d.v[i] : 0; }), a = sumN(m, p.len), b = sumN(d.v, p.len); return { v: a.map((v, i) => ok(v) && b[i] ? v / b[i] : null) }; },
  });
  add('mfi', 'Volume', 'MFI', 'Money Flow Index (volume-weighted RSI)', {
    params: [NUM('len', 'Length', 14)], lines: [LINE('v', 'MFI', PURPLE)], levels: [80, 50, 20], range: [0, 100],
    calc: (d, p) => { const tp = srcArr(d, 'hlc3'), n = tp.length, pos = nul(n), neg = nul(n); for (let i = 1; i < n; i++) { const mf = tp[i] * d.v[i]; pos[i] = tp[i] > tp[i - 1] ? mf : 0; neg[i] = tp[i] < tp[i - 1] ? mf : 0; } const a = sumN(pos, p.len), b = sumN(neg, p.len); return { v: a.map((v, i) => ok(v) && ok(b[i]) ? (b[i] === 0 ? 100 : 100 - 100 / (1 + v / b[i])) : null) }; },
  });
  add('force', 'Volume', 'Force Index', 'Elder Force Index', { params: [NUM('len', 'Length', 13)], lines: [LINE('v', 'FI', BLUE)], levels: [0], calc: (d, p) => ({ v: ema(d.c.map((c, i) => i ? (c - d.c[i - 1]) * d.v[i] : null), p.len) }) });
  add('volosc', 'Volume', 'Volume Oscillator', 'Fast vs slow volume EMA (%)', {
    params: [NUM('fast', 'Fast', 5), NUM('slow', 'Slow', 10)], lines: [HIST('v', 'VO', GREEN, RED, { mode: 'sign' })], levels: [0],
    calc: (d, p) => ({ v: map2(ema(d.v, p.fast), ema(d.v, p.slow), (a, b) => b ? 100 * (a - b) / b : null) }),
  });

  const CATS = ['Moving averages', 'Bands & channels', 'Momentum', 'Trend', 'Volatility', 'Volume'];

  /* =====================================================================
     3. STATE
     ===================================================================== */
  const LS_IND = 'vaultex_ta_indicators_v1';
  const LS_VOL = 'vaultex_ta_volume_visible';
  const LS_LOG = 'vaultex_ta_log_scale';
  const drawKey = sym => 'vaultex_ta_drawings_' + sym;

  let D = { t: [], o: [], h: [], l: [], c: [], v: [], step: 3600 };   // candles
  let idxByTime = new Map();
  let symbol = 'BTCUSDT', interval = '1h';
  let chart = null, candleSeries = null, volumeSeries = null;
  let instances = lsGet(LS_IND, []).filter(i => IND[i.type]);
  let rt = {};                       // runtime per instance id: {series:{}, pane, markers}
  let panes = [];                    // sub-pane charts in order
  let lock = false;                  // range-sync guard
  let hoverTime = null;
  let volumeVisible = lsGet(LS_VOL, true) !== false;
  let logScale = lsGet(LS_LOG, false) === true;
  let drawings = [], selectedId = null, tool = 'cursor', magnet = false, pending = null, hoverPt = null;

  const uid = () => 'i' + Math.random().toString(36).slice(2, 9);
  const saveInst = () => lsSet(LS_IND, instances.map(i => ({ id: i.id, type: i.type, params: i.params, styles: i.styles, hidden: !!i.hidden })));
  const fmtV = v => v == null || isNaN(v) ? '—' : Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : Math.abs(v) >= 1 ? v.toFixed(2) : Math.abs(v) >= 0.01 ? v.toFixed(4) : Math.abs(v) < 1e-9 ? '0' : v.toPrecision(3);
  const hexA = (hex, a) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : hex; };

  function defaultsFor(def) { const p = {}; def.params.forEach(x => { p[x.k] = x.d; }); return p; }
  function defaultStyles(def) { const s = {}; def.lines.forEach(l => { s[l.k] = { c: l.c, c2: l.c2, w: l.w, vis: true }; }); return s; }
  function newInstance(type) { const def = IND[type]; return { id: uid(), type, params: defaultsFor(def), styles: defaultStyles(def), hidden: false }; }
  function normalise(inst) {          // keep saved layouts working when a definition gains a param/line
    const def = IND[inst.type], dp = defaultsFor(def), ds = defaultStyles(def);
    inst.params = Object.assign(dp, inst.params || {});
    inst.styles = Object.assign(ds, inst.styles || {});
    def.lines.forEach(l => { inst.styles[l.k] = Object.assign({}, ds[l.k], inst.styles[l.k]); });
  }
  instances.forEach(normalise);

  function labelOf(inst) {
    const def = IND[inst.type];
    const parts = def.params.filter(p => p.t === 'num').map(p => inst.params[p.k]);
    if (inst.params.src && inst.params.src !== 'close') parts.push(inst.params.src);
    return def.name + (parts.length ? ' ' + parts.join(' ') : '');
  }

  /* =====================================================================
     4. COMPUTE
     ===================================================================== */
  function compute(inst) {
    const def = IND[inst.type];
    const p = {}; def.params.forEach(x => { let v = inst.params[x.k]; if (x.t === 'num') { v = Number(v); if (!isFinite(v)) v = x.d; v = Math.max(x.min, Math.min(x.max, v)); if (x.step >= 1) v = Math.round(v); } p[x.k] = v; });
    try { return def.calc(Object.assign({}, D), p); } catch (e) { console.error('[trading-indicators] ' + def.name + ' failed', e); return {}; }
  }
  function futureBars() {
    let m = 0;
    instances.forEach(i => { if (i.hidden) return; const def = IND[i.type]; const p = i.params; m = Math.max(m, def.future ? Number(def.future(p)) || 0 : 0); });
    return Math.min(m, 120);
  }
  function timeAt(i) {   // time for (possibly future / past) bar index
    const n = D.t.length; if (!n) return 0;
    if (i >= 0 && i < n) return D.t[i];
    if (i < 0) return D.t[0] + i * D.step;
    return D.t[n - 1] + (i - (n - 1)) * D.step;
  }

  /* =====================================================================
     5. DOM SCAFFOLD
     ===================================================================== */
  const CSS = `
  .vx-tools{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
  .vx-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--muted);cursor:pointer;font:600 .74rem 'JetBrains Mono',monospace;line-height:1;white-space:nowrap;}
  .vx-btn:hover{color:var(--paper);border-color:var(--accent,#6C7CFF);}
  .vx-btn.on{background:var(--ink-soft);color:var(--paper);border-color:var(--accent,#6C7CFF);}
  .vx-btn svg{width:15px;height:15px;display:block;}
  .vx-sep{width:1px;height:20px;background:var(--line);margin:0 4px;}
  .vx-stage{position:relative;}
  .vx-canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:3;}
  .vx-canvas.active{pointer-events:auto;cursor:crosshair;}
  .vx-legend{position:absolute;left:8px;top:6px;z-index:6;pointer-events:none;font:500 .72rem 'JetBrains Mono',monospace;max-width:calc(100% - 90px);}
  .vx-lg-row{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;margin-bottom:2px;text-shadow:0 0 4px var(--ink,#0b1020);}
  .vx-lg-name{color:var(--paper);font-weight:700;}
  .vx-lg-val{font-weight:600;}
  .vx-lg-btns{display:inline-flex;gap:2px;pointer-events:auto;opacity:.0;transition:opacity .15s;}
  .vx-lg-row:hover .vx-lg-btns{opacity:1;}
  .vx-lg-btns button{border:0;background:var(--ink-soft);color:var(--muted);border-radius:5px;cursor:pointer;font-size:.74rem;padding:2px 6px;line-height:1.1;}
  .vx-lg-btns button:hover{color:var(--paper);}
  .vx-lg-row.off .vx-lg-name,.vx-lg-row.off .vx-lg-val{opacity:.4;}
  @media (hover:none){.vx-lg-btns{opacity:1;}}
  #vx-panes{display:flex;flex-direction:column;gap:6px;}
  .vx-pane{position:relative;height:140px;border-top:1px solid var(--line);}
  .vx-pane .vx-legend{max-width:calc(100% - 20px);}
  .vx-selbar{position:absolute;right:76px;top:8px;z-index:8;display:none;gap:6px;align-items:center;padding:5px 8px;background:var(--ink-soft);border:1px solid var(--line);border-radius:9px;font:600 .72rem 'JetBrains Mono',monospace;color:var(--paper);}
  .vx-selbar input[type=color]{width:24px;height:22px;border:0;padding:0;background:none;cursor:pointer;}
  .vx-selbar button{border:0;background:rgba(234,57,67,.16);color:#ea3943;border-radius:6px;padding:4px 8px;cursor:pointer;font:inherit;}
  .vx-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px;}
  .vx-modal{background:var(--ink-soft,#121a30);color:var(--paper,#fff);border:1px solid var(--line);border-radius:14px;width:min(640px,100%);max-height:86vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.5);}
  .vx-modal h3{margin:0;font-size:1rem;}
  .vx-m-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line);}
  .vx-m-x{border:0;background:none;color:var(--muted);font-size:1.3rem;cursor:pointer;line-height:1;}
  .vx-m-body{padding:14px 16px;overflow:auto;}
  .vx-m-foot{display:flex;justify-content:space-between;gap:8px;padding:12px 16px;border-top:1px solid var(--line);}
  .vx-search{width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line);background:var(--ink,#0b1020);color:var(--paper);font:inherit;margin-bottom:10px;box-sizing:border-box;}
  .vx-cats{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}
  .vx-list{display:flex;flex-direction:column;}
  .vx-li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 8px;border-bottom:1px solid var(--line);cursor:pointer;border-radius:6px;}
  .vx-li:hover{background:rgba(128,128,128,.1);}
  .vx-li b{font-size:.88rem;} .vx-li small{display:block;color:var(--muted);font-size:.72rem;margin-top:2px;}
  .vx-li .tag{font:600 .64rem 'JetBrains Mono',monospace;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:2px 6px;white-space:nowrap;}
  .vx-sec{font:700 .7rem 'JetBrains Mono',monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 6px;}
  .vx-act{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid var(--line);border-radius:9px;margin-bottom:6px;font-size:.82rem;}
  .vx-act .b{display:flex;gap:6px;} .vx-act button{border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:6px;padding:4px 9px;cursor:pointer;font:inherit;font-size:.74rem;}
  .vx-act button:hover{color:var(--paper);}
  .vx-field{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);font-size:.84rem;}
  .vx-field input,.vx-field select{background:var(--ink,#0b1020);color:var(--paper);border:1px solid var(--line);border-radius:7px;padding:6px 8px;font:inherit;width:130px;box-sizing:border-box;}
  .vx-field input[type=color]{width:36px;height:30px;padding:2px;}
  .vx-field input[type=checkbox]{width:auto;}
  .vx-tabs{display:flex;gap:6px;margin-bottom:8px;}
  .vx-primary{border:0;background:var(--accent,#6C7CFF);color:#fff;border-radius:8px;padding:8px 18px;cursor:pointer;font:600 .84rem 'Inter',sans-serif;}
  .vx-ghost{border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:8px;padding:8px 14px;cursor:pointer;font:600 .84rem 'Inter',sans-serif;}
  .terminal-fullscreen-root.is-fullscreen .vx-stage{flex:1 1 auto;display:flex;flex-direction:column;min-height:300px;}
  .terminal-fullscreen-root.is-fullscreen .vx-stage .chart-container{flex:1 1 auto;}
  `;

  let stage, canvas, ctx, legendEl, panesEl, selbar, toolsEl;
  const ICON = {
    fx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c4 0 4-10 8-10M13 12h5M15 8l4 8M19 8l-4 8"/></svg>',
    cursor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 3l14 8-6 2-2 6z"/></svg>',
    trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19L20 5"/><circle cx="4" cy="19" r="2" fill="currentColor"/><circle cx="20" cy="5" r="2" fill="currentColor"/></svg>',
    ray: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 18L22 6M4 18h0"/><circle cx="4" cy="18" r="2" fill="currentColor"/></svg>',
    hline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
    vline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
    rect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>',
    fib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18M3 10h18M3 14h18M3 19h18"/></svg>',
    measure: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17L17 3l4 4L7 21zM8 12l2 2M11 9l2 2M14 6l2 2"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5h14M12 5v14M9 19h6"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    magnet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3v8a7 7 0 0014 0V3h-4v8a3 3 0 01-6 0V3z"/></svg>',
  };
  const TOOLS = [['cursor', 'Cursor'], ['trend', 'Trend line'], ['ray', 'Ray'], ['hline', 'Horizontal line'], ['vline', 'Vertical line'], ['rect', 'Rectangle'], ['fib', 'Fib retracement'], ['measure', 'Measure'], ['text', 'Text']];

  function scaffold() {
    if (stage) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    const cc = $('[data-chart-container]');
    const toolbar = $('.chart-toolbar');
    if (!cc || !toolbar) return;

    toolsEl = document.createElement('div'); toolsEl.className = 'vx-tools';
    toolsEl.innerHTML =
      `<button class="vx-btn" data-vx="indicators" title="Indicators">${ICON.fx}<span>Indicators</span><span data-vx-count></span></button><span class="vx-sep"></span>` +
      TOOLS.map(t => `<button class="vx-btn ${t[0] === 'cursor' ? 'on' : ''}" data-vx-tool="${t[0]}" title="${t[1]}">${ICON[t[0]]}</button>`).join('') +
      `<span class="vx-sep"></span>` +
      `<button class="vx-btn" data-vx="magnet" title="Magnet — snap to candle OHLC">${ICON.magnet}</button>` +
      `<button class="vx-btn" data-vx="undo" title="Remove last drawing">${ICON.undo}</button>` +
      `<button class="vx-btn" data-vx="clear" title="Remove all drawings">${ICON.trash}</button>` +
      `<button class="vx-btn" data-vx="log" title="Logarithmic price scale">LOG</button>`;
    toolbar.insertAdjacentElement('afterend', toolsEl);

    stage = document.createElement('div'); stage.className = 'vx-stage';
    cc.parentNode.insertBefore(stage, cc); stage.appendChild(cc);
    canvas = document.createElement('canvas'); canvas.className = 'vx-canvas'; stage.appendChild(canvas); ctx = canvas.getContext('2d');
    legendEl = document.createElement('div'); legendEl.className = 'vx-legend'; stage.appendChild(legendEl);
    selbar = document.createElement('div'); selbar.className = 'vx-selbar'; stage.appendChild(selbar);
    panesEl = document.createElement('div'); panesEl.id = 'vx-panes'; stage.insertAdjacentElement('afterend', panesEl);

    toolsEl.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.vxTool) return setTool(b.dataset.vxTool);
      switch (b.dataset.vx) {
        case 'indicators': return openLibrary();
        case 'magnet': magnet = !magnet; b.classList.toggle('on', magnet); return;
        case 'undo': if (drawings.length) { drawings.pop(); selectedId = null; saveDrawings(); redraw(true); } return;
        case 'clear': if (drawings.length && confirm('Remove all drawings on ' + symbol.replace('USDT', '/USDT') + '?')) { drawings = []; selectedId = null; saveDrawings(); redraw(true); } return;
        case 'log': logScale = !logScale; lsSet(LS_LOG, logScale); applyLog(); b.classList.toggle('on', logScale); return;
      }
    });
    legendEl.addEventListener('click', legendClick);
    panesEl.addEventListener('click', legendClick);
    updateCount();

    if (window.ResizeObserver) new ResizeObserver(() => { sizeCanvas(); redraw(true); resizePanes(); }).observe(stage);
    window.addEventListener('resize', () => { sizeCanvas(); resizePanes(); });
    bindDrawingEvents();
    requestAnimationFrame(loop);
  }

  function updateCount() { const el = $('[data-vx-count]'); if (el) el.textContent = instances.length ? '(' + instances.length + ')' : ''; }
  function applyLog() { if (!chart) return; try { chart.priceScale('right').applyOptions({ mode: logScale ? LW.PriceScaleMode.Logarithmic : LW.PriceScaleMode.Normal }); } catch (e) { /* older build */ } const b = $('[data-vx="log"]'); if (b) b.classList.toggle('on', logScale); }

  /* =====================================================================
     6. RENDER INDICATORS
     ===================================================================== */
  function chartOptions(el, showTime) {
    return {
      layout: { background: { color: 'transparent' }, textColor: getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#8993AB' },
      grid: { vertLines: { color: 'rgba(128,128,128,.08)' }, horzLines: { color: 'rgba(128,128,128,.08)' } },
      rightPriceScale: { borderColor: 'rgba(128,128,128,.15)', minimumWidth: 72 },
      timeScale: { borderColor: 'rgba(128,128,128,.15)', timeVisible: true, secondsVisible: false, visible: showTime, rightOffset: 4 },
      crosshair: { mode: LW.CrosshairMode.Normal },
      handleScroll: true, handleScale: true,
      width: el.clientWidth, height: el.clientHeight,
    };
  }

  function teardown() {
    Object.keys(rt).forEach(id => {
      const r = rt[id]; if (!r) return;
      if (r.pane) { try { r.pane.chart.remove(); } catch (e) { /* gone */ } r.pane.wrap.remove(); }
      else Object.keys(r.series).forEach(k => { try { chart.removeSeries(r.series[k]); } catch (e) { /* gone */ } });
    });
    rt = {}; panes = [];
    if (panesEl) panesEl.innerHTML = '';
  }

  function build() {
    if (!chart) return;
    teardown();
    instances.forEach(inst => {
      const def = IND[inst.type], r = rt[inst.id] = { series: {}, markers: null, pane: null };
      const vis = !inst.hidden;
      if (def.overlay) {
        def.lines.forEach(l => {
          const st = inst.styles[l.k];
          if (l.type === 'dots') {
            const s = chart.addLineSeries({ color: 'rgba(0,0,0,0)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, visible: vis && st.vis });
            r.series[l.k] = s;
          } else {
            r.series[l.k] = chart.addLineSeries({ color: st.c, lineWidth: st.w, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, visible: vis && st.vis });
          }
        });
      } else {
        const wrap = document.createElement('div'); wrap.className = 'vx-pane';
        const leg = document.createElement('div'); leg.className = 'vx-legend'; leg.dataset.paneFor = inst.id;
        const host = document.createElement('div'); host.style.cssText = 'position:absolute;inset:0;';
        wrap.appendChild(host); wrap.appendChild(leg); panesEl.appendChild(wrap);
        const pc = LW.createChart(host, chartOptions(host, false));
        let firstSeries = null;
        def.lines.forEach((l, li) => {
          const st = inst.styles[l.k];
          const opts = { lastValueVisible: li === 0 || l.type !== 'hist', priceLineVisible: false, visible: vis && st.vis };
          if (def.range && !firstSeries) opts.autoscaleInfoProvider = () => ({ priceRange: { minValue: def.range[0], maxValue: def.range[1] } });
          let s;
          if (l.type === 'hist') s = pc.addHistogramSeries(Object.assign({ color: st.c, priceFormat: { type: 'price', precision: 4, minMove: 0.0001 } }, opts));
          else s = pc.addLineSeries(Object.assign({ color: st.c, lineWidth: st.w, crosshairMarkerVisible: false }, opts));
          if (!firstSeries) firstSeries = s;
          r.series[l.k] = s;
        });
        (def.levels || []).forEach(v => { try { firstSeries.createPriceLine({ price: v, color: 'rgba(128,128,128,.55)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' }); } catch (e) { /* ignore */ } });
        r.pane = { wrap, chart: pc, host, leg, first: firstSeries };
        panes.push(r.pane);
        pc.timeScale().subscribeVisibleLogicalRangeChange(rg => { if (lock || !rg) return; syncRange(rg, pc); });
        pc.subscribeCrosshairMove(p => onCrosshair(p, pc));
      }
    });
    updateData();
    syncRange(chart.timeScale().getVisibleLogicalRange(), chart);
    updateLegends();
    updateCount();
  }

  function syncRange(rg, source) {
    if (!rg || lock) return;
    lock = true;
    try {
      if (source !== chart) chart.timeScale().setVisibleLogicalRange(rg);
      panes.forEach(p => { if (p.chart !== source) p.chart.timeScale().setVisibleLogicalRange(rg); });
    } catch (e) { /* range not ready */ }
    lock = false;
  }
  function resizePanes() {
    panes.forEach(p => { try { p.chart.applyOptions({ width: p.host.clientWidth, height: p.host.clientHeight }); } catch (e) { /* removed */ } });
  }

  function seriesData(values, shift, times, style, def, lineDef) {
    const out = [];
    const n = values.length;
    for (let i = 0; i < n; i++) {
      const j = i + shift; const t = timeAt(j);
      if (j < 0) continue;
      const v = values[i];
      out.push(ok(v) ? { time: t, value: v } : { time: t });
    }
    return out;
  }

  function histColors(vals, lineDef, st) {
    return vals.map((v, i) => {
      if (!ok(v)) return null;
      const prev = i ? vals[i - 1] : null;
      if (lineDef.mode === 'delta') return ok(prev) && v < prev ? st.c2 : st.c;
      if (lineDef.mode === 'sign') return v >= 0 ? st.c : st.c2;
      /* sign4 */
      if (v >= 0) return ok(prev) && v < prev ? hexA(st.c, .45) : st.c;
      return ok(prev) && v > prev ? hexA(st.c2, .45) : st.c2;
    });
  }

  function updateData() {
    if (!chart) return;
    const fut = futureBars();
    const n = D.t.length;
    instances.forEach(inst => {
      const r = rt[inst.id]; if (!r) return;
      const def = IND[inst.type], out = compute(inst); inst._out = out;
      def.lines.forEach((l, li) => {
        const s = r.series[l.k]; if (!s) return;
        const vals = out[l.k] || nul(n);
        const shift = l.shift ? Number(l.shift(inst.params)) || 0 : 0;
        let data;
        if (l.type === 'hist') {
          const cols = histColors(vals, l, inst.styles[l.k]);
          data = vals.map((v, i) => ok(v) ? { time: D.t[i], value: v, color: cols[i] } : { time: D.t[i] });
        } else data = seriesData(vals, shift);
        // sub panes: pad with future whitespace so the shared time axis lines up with the main chart
        if (r.pane && li === 0 && fut > 0) for (let k = 1; k <= fut; k++) data.push({ time: timeAt(n - 1 + k) });
        try { s.setData(data); } catch (e) { console.warn('[trading-indicators] setData', def.name, e.message); }
        if (l.type === 'dots') {                          // Parabolic SAR → coloured dots
          const bull = out.bull || [];
          const st = inst.styles[l.k];
          const mk = [];
          vals.forEach((v, i) => { if (ok(v)) mk.push({ time: D.t[i], position: 'inBar', shape: 'circle', color: bull[i] ? st.c : (st.c2 || ORANGE), size: 0.4 }); });
          try { s.setMarkers(inst.hidden || !st.vis ? [] : mk); } catch (e) { /* markers unsupported */ }
        }
      });
    });
    if (panes.length === 0 && fut === 0) { /* nothing */ }
    updateLegends();
    redraw(true);
  }

  /* =====================================================================
     7. LEGEND
     ===================================================================== */
  function valuesAt(inst, idx) {
    const def = IND[inst.type], out = inst._out || {};
    return def.lines.filter(l => l.type !== 'dots' || true).map(l => {
      const arr = out[l.k]; let v = null;
      if (arr) { const shift = l.shift ? Number(l.shift(inst.params)) || 0 : 0; v = arr[idx - shift]; }
      return { l, v, c: inst.styles[l.k].c };
    });
  }
  function legendRow(inst, idx) {
    const vals = valuesAt(inst, idx).filter(x => inst.styles[x.l.k].vis);
    return `<div class="vx-lg-row ${inst.hidden ? 'off' : ''}">
      <span class="vx-lg-name">${esc(labelOf(inst))}</span>
      ${vals.map(x => `<span class="vx-lg-val" style="color:${x.c}">${fmtV(x.v)}</span>`).join(' ')}
      <span class="vx-lg-btns"><button data-act="eye" data-id="${inst.id}" title="${inst.hidden ? 'Show' : 'Hide'}">${inst.hidden ? '○' : '●'}</button><button data-act="cfg" data-id="${inst.id}" title="Settings">⚙</button><button data-act="del" data-id="${inst.id}" title="Remove">✕</button></span>
    </div>`;
  }
  function updateLegends() {
    if (!legendEl) return;
    const n = D.t.length; if (!n) { legendEl.innerHTML = ''; return; }
    let idx = n - 1;
    if (hoverTime != null && idxByTime.has(hoverTime)) idx = idxByTime.get(hoverTime);
    else if (hoverTime != null && hoverTime > D.t[n - 1]) idx = n - 1;
    const o = D.o[idx], h = D.h[idx], l = D.l[idx], c = D.c[idx];
    const prev = idx > 0 ? D.c[idx - 1] : o, chg = prev ? (c - prev) / prev * 100 : 0, col = c >= o ? '#16c784' : '#ea3943';
    let html = `<div class="vx-lg-row"><span class="vx-lg-name">${esc(symbol.replace('USDT', '/USDT'))} · ${esc(interval.toUpperCase())}</span>
      <span class="vx-lg-val" style="color:${col}">O ${fmtV(o)} H ${fmtV(h)} L ${fmtV(l)} C ${fmtV(c)} (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%)</span></div>`;
    html += `<div class="vx-lg-row ${volumeVisible ? '' : 'off'}"><span class="vx-lg-name">Volume</span><span class="vx-lg-val" style="color:#6C7CFF">${fmtV(D.v[idx])}</span>
      <span class="vx-lg-btns"><button data-act="vol" title="${volumeVisible ? 'Hide' : 'Show'} volume">${volumeVisible ? '●' : '○'}</button></span></div>`;
    html += instances.filter(i => IND[i.type].overlay).map(i => legendRow(i, idx)).join('');
    legendEl.innerHTML = html;
    panes.forEach(p => {
      const id = p.leg.dataset.paneFor, inst = instances.find(i => i.id === id); if (inst) p.leg.innerHTML = legendRow(inst, idx);
    });
  }

  function onCrosshair(param, source) {
    const t = param && param.time ? param.time : null;
    hoverTime = typeof t === 'number' ? t : null;
    updateLegends();
    // mirror the crosshair onto the other charts
    if (lock) return;
    const all = [{ chart }].concat(panes.map(p => ({ chart: p.chart, first: p.first })));
    if (hoverTime == null) { all.forEach(a => { if (a.chart !== source && a.chart.clearCrosshairPosition) { try { a.chart.clearCrosshairPosition(); } catch (e) { /* n/a */ } } }); return; }
    if (!source || !source.setCrosshairPosition) return;
    all.forEach(a => {
      if (a.chart === source || !a.chart.setCrosshairPosition) return;
      const ser = a.chart === chart ? candleSeries : a.first;
      try { a.chart.setCrosshairPosition(NaN, hoverTime, ser); } catch (e) { /* n/a */ }
    });
  }

  function legendClick(e) {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const inst = instances.find(i => i.id === b.dataset.id);
    switch (b.dataset.act) {
      case 'eye': inst.hidden = !inst.hidden; saveInst(); build(); break;
      case 'del': instances = instances.filter(i => i !== inst); saveInst(); build(); break;
      case 'cfg': openSettings(inst); break;
      case 'vol': volumeVisible = !volumeVisible; lsSet(LS_VOL, volumeVisible); applyVolume(); updateLegends(); break;
    }
  }
  function applyVolume() { if (volumeSeries) volumeSeries.applyOptions({ visible: volumeVisible }); }

  /* =====================================================================
     8. MODALS (library + settings)
     ===================================================================== */
  function modal(html, onMount) {
    const bg = document.createElement('div'); bg.className = 'vx-modal-bg';
    bg.innerHTML = `<div class="vx-modal">${html}</div>`;
    document.body.appendChild(bg);
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
    bg.querySelectorAll('.vx-m-x').forEach(x => x.addEventListener('click', close));
    onMount(bg, close);
    return bg;
  }

  function openLibrary() {
    let cat = 'All', q = '';
    modal(`<div class="vx-m-head"><h3>Indicators</h3><button class="vx-m-x">×</button></div>
      <div class="vx-m-body">
        <input class="vx-search" placeholder="Search indicators (RSI, MACD, Bollinger…)" data-q>
        <div class="vx-cats" data-cats></div>
        <div data-active></div>
        <div class="vx-list" data-list></div>
      </div>
      <div class="vx-m-foot"><button class="vx-ghost" data-removeall>Remove all</button><button class="vx-primary vx-m-x">Done</button></div>`, (bg, close) => {
      const list = $('[data-list]', bg), cats = $('[data-cats]', bg), act = $('[data-active]', bg);
      function renderCats() { cats.innerHTML = ['All'].concat(CATS).map(c => `<button class="vx-btn ${c === cat ? 'on' : ''}" data-cat="${c}">${c}</button>`).join(''); }
      function renderActive() {
        act.innerHTML = instances.length ? `<div class="vx-sec">On chart</div>` + instances.map(i => `<div class="vx-act"><span>${esc(labelOf(i))}</span><span class="b"><button data-cfg="${i.id}">Settings</button><button data-del="${i.id}">Remove</button></span></div>`).join('') : '';
      }
      function renderList() {
        const ids = Object.keys(IND).filter(id => (cat === 'All' || IND[id].cat === cat) && (!q || (IND[id].name + ' ' + IND[id].desc + ' ' + id).toLowerCase().includes(q)));
        list.innerHTML = (ids.length ? `<div class="vx-sec">Library · ${ids.length}</div>` : '<div class="vx-sec">No match</div>') +
          ids.map(id => `<div class="vx-li" data-add="${id}"><div><b>${esc(IND[id].name)}</b><small>${esc(IND[id].desc)}</small></div><span class="tag">${IND[id].overlay ? 'on chart' : 'pane'}</span></div>`).join('');
      }
      renderCats(); renderActive(); renderList();
      $('[data-q]', bg).addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); renderList(); });
      bg.addEventListener('click', e => {
        const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; renderCats(); renderList(); return; }
        const a = e.target.closest('[data-add]'); if (a) { const inst = newInstance(a.dataset.add); instances.push(inst); saveInst(); build(); renderActive(); const el = a.querySelector('.tag'); if (el) { el.textContent = 'added ✓'; setTimeout(renderList, 700); } return; }
        const d = e.target.closest('[data-del]'); if (d) { instances = instances.filter(i => i.id !== d.dataset.del); saveInst(); build(); renderActive(); return; }
        const g = e.target.closest('[data-cfg]'); if (g) { const inst = instances.find(i => i.id === g.dataset.cfg); close(); openSettings(inst); return; }
        if (e.target.closest('[data-removeall]')) { if (!instances.length || confirm('Remove all indicators from the chart?')) { instances = []; saveInst(); build(); renderActive(); } }
      });
    });
  }

  function openSettings(inst) {
    if (!inst) return;
    const def = IND[inst.type];
    const work = { params: Object.assign({}, inst.params), styles: JSON.parse(JSON.stringify(inst.styles)) };
    modal(`<div class="vx-m-head"><h3>${esc(def.name)} — settings</h3><button class="vx-m-x">×</button></div>
      <div class="vx-m-body">
        <div class="vx-tabs"><button class="vx-btn on" data-tab="in">Inputs</button><button class="vx-btn" data-tab="st">Style</button></div>
        <div data-pane="in"></div><div data-pane="st" style="display:none;"></div>
      </div>
      <div class="vx-m-foot"><button class="vx-ghost" data-reset>Defaults</button><span><button class="vx-ghost vx-m-x">Cancel</button> <button class="vx-primary" data-ok>OK</button></span></div>`, (bg, close) => {
      const pin = $('[data-pane="in"]', bg), pst = $('[data-pane="st"]', bg);
      function paint() {
        pin.innerHTML = def.params.length ? def.params.map(p => p.t === 'sel'
          ? `<div class="vx-field"><label>${esc(p.l)}</label><select data-p="${p.k}">${p.o.map(o => `<option ${work.params[p.k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`
          : `<div class="vx-field"><label>${esc(p.l)}</label><input type="number" data-p="${p.k}" value="${work.params[p.k]}" min="${p.min}" max="${p.max}" step="${p.step}"></div>`).join('')
          : '<div class="vx-field"><label>This indicator has no inputs.</label></div>';
        pst.innerHTML = def.lines.map(l => {
          const s = work.styles[l.k];
          return `<div class="vx-field"><label><input type="checkbox" data-s="${l.k}" data-f="vis" ${s.vis ? 'checked' : ''}> ${esc(l.l)}</label>
            <span style="display:flex;gap:8px;align-items:center;">
              <input type="color" data-s="${l.k}" data-f="c" value="${s.c}">${l.c2 ? `<input type="color" data-s="${l.k}" data-f="c2" value="${s.c2}" title="Second colour">` : ''}
              ${l.type === 'line' ? `<select data-s="${l.k}" data-f="w" style="width:64px;">${[1, 2, 3, 4].map(w => `<option ${s.w === w ? 'selected' : ''}>${w}</option>`).join('')}</select>` : ''}
            </span></div>`;
        }).join('');
      }
      paint();
      bg.addEventListener('click', e => {
        const t = e.target.closest('[data-tab]');
        if (t) { $$('[data-tab]', bg).forEach(b => b.classList.toggle('on', b === t)); pin.style.display = t.dataset.tab === 'in' ? '' : 'none'; pst.style.display = t.dataset.tab === 'st' ? '' : 'none'; }
        if (e.target.closest('[data-reset]')) { work.params = defaultsFor(def); work.styles = defaultStyles(def); paint(); }
        if (e.target.closest('[data-ok]')) {
          def.params.forEach(p => { if (p.t === 'num') { let v = parseFloat(work.params[p.k]); if (!isFinite(v)) v = p.d; work.params[p.k] = Math.max(p.min, Math.min(p.max, v)); } });
          inst.params = work.params; inst.styles = work.styles; saveInst(); build(); close();
        }
      });
      bg.addEventListener('input', e => {
        const el = e.target;
        if (el.dataset.p) { const p = def.params.find(x => x.k === el.dataset.p); work.params[el.dataset.p] = p.t === 'num' ? el.value : el.value; }
        if (el.dataset.s) { const f = el.dataset.f; work.styles[el.dataset.s][f] = f === 'vis' ? el.checked : f === 'w' ? Number(el.value) : el.value; }
      });
    });
  }

  /* =====================================================================
     9. DRAWINGS
     ===================================================================== */
  const FIB = [[0, '#8993AB'], [0.236, '#f23645'], [0.382, '#ff9800'], [0.5, '#4caf50'], [0.618, '#26a69a'], [0.786, '#2196f3'], [1, '#8993AB'], [1.272, '#9c27b0'], [1.618, '#e91e63']];
  const NEED = { trend: 2, ray: 2, hline: 1, vline: 1, rect: 2, fib: 2, measure: 2, text: 1 };
  const loadDrawings = () => { drawings = lsGet(drawKey(symbol), []); selectedId = null; };
  const saveDrawings = () => lsSet(drawKey(symbol), drawings);

  function timeToLogical(t) {
    const n = D.t.length; if (!n) return 0;
    const T0 = D.t[0], T1 = D.t[n - 1], st = D.step || 3600;
    if (t <= T0) return (t - T0) / st;
    if (t >= T1) return n - 1 + (t - T1) / st;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (D.t[m] <= t) lo = m; else hi = m; }
    return lo + (t - D.t[lo]) / (D.t[hi] - D.t[lo]);
  }
  function logicalToTime(l) {
    const n = D.t.length; if (!n) return 0;
    if (l <= 0) return D.t[0] + l * D.step;
    if (l >= n - 1) return D.t[n - 1] + (l - (n - 1)) * D.step;
    const i = Math.floor(l); return D.t[i] + (l - i) * (D.t[i + 1] - D.t[i]);
  }
  function plotSize() {
    const W = stage.clientWidth, H = $('[data-chart-container]').clientHeight;
    let pw = 0, th = 0;
    try { pw = chart.priceScale('right').width(); } catch (e) { pw = 60; }
    try { th = chart.timeScale().height(); } catch (e) { th = 26; }
    return { W, H, w: Math.max(10, W - pw), h: Math.max(10, H - th) };
  }
  function xOf(t) {
    const l = timeToLogical(t); let x = null;
    try { x = chart.timeScale().logicalToCoordinate(l); } catch (e) { /* n/a */ }
    return x;
  }
  const yOf = p => { try { return candleSeries.priceToCoordinate(p); } catch (e) { return null; } };
  function toPoint(x, y) {
    let l = null, p = null;
    try { l = chart.timeScale().coordinateToLogical(x); } catch (e) { /* n/a */ }
    try { p = candleSeries.coordinateToPrice(y); } catch (e) { /* n/a */ }
    if (l == null || p == null) return null;
    return { t: logicalToTime(l), p };
  }
  function snap(pt, x, y) {
    if (!magnet || !pt) return pt;
    const n = D.t.length; if (!n) return pt;
    let i = Math.round(timeToLogical(pt.t)); i = Math.max(0, Math.min(n - 1, i));
    const cands = [D.o[i], D.h[i], D.l[i], D.c[i]];
    let best = null, bd = 18;
    cands.forEach(pr => { const yy = yOf(pr); if (yy != null && Math.abs(yy - y) < bd) { bd = Math.abs(yy - y); best = pr; } });
    return best != null ? { t: D.t[i], p: best } : { t: pt.t, p: pt.p };
  }

  function screenPts(d) { return d.pts.map(pt => ({ x: xOf(pt.t), y: yOf(pt.p) })); }

  function sizeCanvas() {
    if (!canvas || !stage) return;
    const dpr = window.devicePixelRatio || 1, W = stage.clientWidth, H = $('[data-chart-container]').clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    }
  }

  let lastSig = '';
  function loop() {
    requestAnimationFrame(loop);
    if (!chart || !canvas) return;
    let sig = '';
    try {
      const r = chart.timeScale().getVisibleLogicalRange();
      sig = (r ? r.from.toFixed(3) + '|' + r.to.toFixed(3) : '') + '|' + (yOf(1) || 0).toFixed(2) + '|' + (yOf(1000) || 0).toFixed(2) + '|' + stage.clientWidth + '|' + D.t.length + '|' + (D.c[D.c.length - 1] || 0);
    } catch (e) { return; }
    if (sig !== lastSig) { lastSig = sig; redraw(true); }
  }
  let rafPending = false;
  function redraw(force) {
    if (!ctx || !chart) return;
    if (!force) { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; redraw(true); }); return; }
    sizeCanvas();
    const dpr = window.devicePixelRatio || 1, ps = plotSize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ps.W, ps.H);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, ps.w, ps.h); ctx.clip();
    try { drawFills(ps); drawings.forEach(d => drawOne(d, ps, d.id === selectedId)); if (pending) drawOne(pending, ps, true, true); } catch (e) { /* mid-resize */ }
    ctx.restore();
    // price labels for horizontal lines (outside the clip, on the price scale)
    try {
      drawings.concat(pending ? [pending] : []).forEach(d => {
        if (d.type !== 'hline' || !d.pts[0]) return;
        const y = yOf(d.pts[0].p); if (y == null || y < 0 || y > ps.h) return;
        const txt = fmtV(d.pts[0].p); ctx.font = '600 11px JetBrains Mono, monospace';
        const w = ctx.measureText(txt).width + 10;
        ctx.fillStyle = d.color; ctx.fillRect(ps.w, y - 9, Math.min(w, ps.W - ps.w), 18);
        ctx.fillStyle = '#fff'; ctx.fillText(txt, ps.w + 5, y + 4);
      });
    } catch (e) { /* ignore */ }
    updateSelbar();
  }

  function drawFills(ps) {
    instances.forEach(inst => {
      if (inst.hidden) return; const def = IND[inst.type]; if (!def.fills || !inst._out) return;
      def.fills.forEach(f => {
        const A = inst._out[f.a], B = inst._out[f.b]; if (!A || !B) return;
        if (inst.styles[f.a] && !inst.styles[f.a].vis) return;
        const shift = f.shiftKey ? Number(inst.params[f.shiftKey]) || 0 : 0;
        for (let i = 0; i < A.length - 1; i++) {
          if (!ok(A[i]) || !ok(B[i]) || !ok(A[i + 1]) || !ok(B[i + 1])) continue;
          const x1 = xAtIndex(i + shift), x2 = xAtIndex(i + 1 + shift);
          if (x1 == null || x2 == null || x2 < -5 || x1 > ps.w + 5) continue;
          const ya1 = yOf(A[i]), yb1 = yOf(B[i]), ya2 = yOf(A[i + 1]), yb2 = yOf(B[i + 1]);
          if (ya1 == null || yb1 == null || ya2 == null || yb2 == null) continue;
          ctx.fillStyle = f.c || (A[i] >= B[i] ? f.up : f.down);
          ctx.beginPath(); ctx.moveTo(x1, ya1); ctx.lineTo(x2, ya2); ctx.lineTo(x2, yb2); ctx.lineTo(x1, yb1); ctx.closePath(); ctx.fill();
        }
      });
    });
  }
  function xAtIndex(i) { try { return chart.timeScale().logicalToCoordinate(i); } catch (e) { return null; } }

  function label(txt, x, y, color, ps, align) {
    ctx.font = '600 11px JetBrains Mono, monospace';
    const w = ctx.measureText(txt).width + 12, h = 20;
    let lx = align === 'right' ? x - w : x, ly = y;
    lx = Math.max(2, Math.min(ps.w - w - 2, lx)); ly = Math.max(2, Math.min(ps.h - h - 2, ly));
    ctx.fillStyle = color; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(lx, ly, w, h, 5); else ctx.rect(lx, ly, w, h);
    ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(txt, lx + 6, ly + 14);
  }
  function handle(x, y, color) { ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }

  function drawOne(d, ps, selected, isPreview) {
    const pts = screenPts(d); const a = pts[0], b = pts[1];
    if (!a || a.x == null || a.y == null) return;
    ctx.lineWidth = d.w || 2; ctx.strokeStyle = d.color; ctx.fillStyle = d.color; ctx.setLineDash(isPreview ? [5, 4] : []);
    const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    switch (d.type) {
      case 'hline': line(0, a.y, ps.w, a.y); break;
      case 'vline': line(a.x, 0, a.x, ps.h); break;
      case 'text': ctx.setLineDash([]); label(d.text || 'Text', a.x, a.y - 10, d.color, ps); break;
      case 'trend': if (b && b.x != null) line(a.x, a.y, b.x, b.y); break;
      case 'ray': if (b && b.x != null) { const dx = b.x - a.x, dy = b.y - a.y; const k = Math.abs(dx) < 1e-6 ? 1e5 : (dx > 0 ? ps.w + 50 - a.x : -a.x - 50) / dx; line(a.x, a.y, a.x + dx * Math.abs(k) * Math.sign(dx || 1), a.y + dy * Math.abs(k) * Math.sign(dx || 1)); } break;
      case 'rect': if (b && b.x != null) { ctx.fillStyle = hexA(d.color, .13); ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); } break;
      case 'fib': if (b && b.x != null) {
        const p1 = d.pts[0].p, p2 = d.pts[1].p, x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x) + 60;
        ctx.setLineDash([]);
        FIB.forEach(([lv, col], i) => {
          const price = p2 + (p1 - p2) * lv, y = yOf(price); if (y == null) return;
          ctx.strokeStyle = col; ctx.lineWidth = 1; line(x1, y, x2, y);
          ctx.fillStyle = col; ctx.font = '600 10.5px JetBrains Mono, monospace'; ctx.fillText(lv + ' (' + fmtV(price) + ')', x1 + 4, y - 3);
          const yn = i < FIB.length - 1 ? yOf(p2 + (p1 - p2) * FIB[i + 1][0]) : null;
          if (yn != null && i < 6) { ctx.fillStyle = hexA(col, .06); ctx.fillRect(x1, Math.min(y, yn), x2 - x1, Math.abs(yn - y)); }
        });
        ctx.strokeStyle = d.color; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); line(a.x, a.y, b.x, b.y);
      } break;
      case 'measure': if (b && b.x != null) {
        const dp = d.pts[1].p - d.pts[0].p, pc = d.pts[0].p ? dp / d.pts[0].p * 100 : 0, up = dp >= 0, col = up ? '#16c784' : '#ea3943';
        const bars = Math.round(timeToLogical(d.pts[1].t) - timeToLogical(d.pts[0].t));
        const secs = Math.abs(d.pts[1].t - d.pts[0].t), dur = secs >= 86400 ? (secs / 86400).toFixed(1) + 'd' : secs >= 3600 ? (secs / 3600).toFixed(1) + 'h' : Math.round(secs / 60) + 'm';
        ctx.fillStyle = hexA(col, .14); ctx.strokeStyle = col; ctx.setLineDash([]);
        ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        label(`${dp >= 0 ? '+' : ''}${fmtV(dp)} (${pc >= 0 ? '+' : ''}${pc.toFixed(2)}%) · ${bars} bars · ${dur}`, (a.x + b.x) / 2 - 80, b.y + (up ? -26 : 8), col, ps);
      } break;
    }
    ctx.setLineDash([]);
    if (selected && !isPreview) pts.forEach(p => { if (p.x != null && p.y != null && d.type !== 'hline' && d.type !== 'vline') handle(p.x, p.y, d.color); });
    if (selected && !isPreview && (d.type === 'hline')) handle(ps.w / 2, a.y, d.color);
    if (selected && !isPreview && d.type === 'vline') handle(a.x, ps.h / 2, d.color);
    if (isPreview) pts.forEach(p => { if (p.x != null && p.y != null) handle(p.x, p.y, d.color); });
  }

  /* ---- hit testing ---- */
  const distSeg = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy; let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); };
  function hit(d, x, y, ps) {
    const pts = screenPts(d); const a = pts[0], b = pts[1];
    if (!a || a.x == null || a.y == null) return null;
    for (let i = 0; i < pts.length; i++) if (pts[i].x != null && Math.hypot(x - pts[i].x, y - pts[i].y) < 9) return { kind: 'handle', i };
    switch (d.type) {
      case 'hline': return Math.abs(y - a.y) < 6 ? { kind: 'body' } : null;
      case 'vline': return Math.abs(x - a.x) < 6 ? { kind: 'body' } : null;
      case 'text': return Math.abs(x - a.x) < 60 && y > a.y - 32 && y < a.y + 6 ? { kind: 'body' } : null;
      case 'trend': case 'ray': return b && distSeg(x, y, a.x, a.y, b.x, b.y) < 6 ? { kind: 'body' } : null;
      case 'rect': case 'measure': return b && x >= Math.min(a.x, b.x) - 4 && x <= Math.max(a.x, b.x) + 4 && y >= Math.min(a.y, b.y) - 4 && y <= Math.max(a.y, b.y) + 4 ? { kind: 'body' } : null;
      case 'fib': { if (!b) return null; const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x) + 60; if (x < x1 - 4 || x > x2 + 4) return null; const p1 = d.pts[0].p, p2 = d.pts[1].p; for (const [lv] of FIB) { const yy = yOf(p2 + (p1 - p2) * lv); if (yy != null && Math.abs(yy - y) < 5) return { kind: 'body' }; } return null; }
    }
    return null;
  }

  function setTool(t) {
    tool = t; pending = null; hoverPt = null;
    $$('[data-vx-tool]').forEach(b => b.classList.toggle('on', b.dataset.vxTool === t));
    canvas.classList.toggle('active', t !== 'cursor');
    redraw(true);
  }

  function localXY(e) { const r = canvas.getBoundingClientRect(); const c = e.touches && e.touches[0] ? e.touches[0] : e; return { x: c.clientX - r.left, y: c.clientY - r.top }; }

  function bindDrawingEvents() {
    // creating: click-click on the overlay canvas (only receives events while a tool is active)
    canvas.addEventListener('click', e => {
      if (tool === 'cursor') return;
      const { x, y } = localXY(e); const ps = plotSize(); if (x > ps.w || y > ps.h) return;
      let pt = toPoint(x, y); if (!pt) return; pt = snap(pt, x, y);
      if (!pending) pending = { id: uid(), type: tool, pts: [], n: 0, color: '#6C7CFF', w: 2 };
      pending.pts = pending.pts.slice(0, pending.n);   // drop the moving preview point
      pending.pts.push(pt); pending.n++;
      if (pending.n >= NEED[pending.type]) {
        const d = pending; pending = null; hoverPt = null;
        if (d.type === 'text') { const txt = prompt('Text', ''); if (txt == null || txt === '') { setTool('cursor'); return; } d.text = txt; }
        drawings.push(d); selectedId = d.id; saveDrawings(); setTool('cursor');
      }
      redraw(true);
    });
    canvas.addEventListener('mousemove', e => {
      if (tool === 'cursor' || !pending) return;
      const { x, y } = localXY(e); let pt = toPoint(x, y); if (!pt) return; pt = snap(pt, x, y);
      pending.pts = pending.pts.slice(0, pending.n).concat([pt]); redraw(true);
    });
    document.addEventListener('keydown', e => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) return;
      if (e.key === 'Escape') { if (pending || tool !== 'cursor') setTool('cursor'); else { selectedId = null; redraw(true); } }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { drawings = drawings.filter(d => d.id !== selectedId); selectedId = null; saveDrawings(); redraw(true); e.preventDefault(); }
    });

    // selecting / dragging: capture on the stage, before the chart sees the mouse
    let drag = null;
    stage.addEventListener('mousedown', e => {
      if (tool !== 'cursor' || e.button !== 0) return;
      if (e.target.closest('.vx-legend,.vx-selbar')) return;
      const { x, y } = localXY(e); const ps = plotSize();
      if (x > ps.w || y > ps.h) return;
      for (let k = drawings.length - 1; k >= 0; k--) {
        const h = hit(drawings[k], x, y, ps); if (!h) continue;
        e.stopPropagation(); e.preventDefault();
        selectedId = drawings[k].id;
        drag = { d: drawings[k], h, x0: x, y0: y, orig: screenPts(drawings[k]), origPts: drawings[k].pts.map(p => ({ t: p.t, p: p.p })) };
        redraw(true); return;
      }
      if (selectedId) { selectedId = null; redraw(true); }
    }, true);
    window.addEventListener('mousemove', e => {
      if (!drag) { if (tool === 'cursor' && stage) { const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top, ps = plotSize(); if (x >= 0 && y >= 0 && x <= ps.w && y <= ps.h && e.target.closest && e.target.closest('.vx-stage')) { let over = false; for (let k = drawings.length - 1; k >= 0; k--) if (hit(drawings[k], x, y, ps)) { over = true; break; } stage.style.cursor = over ? 'move' : ''; } } return; }
      const { x, y } = localXY(e);
      if (drag.h.kind === 'handle') {
        let pt = toPoint(x, y); if (pt) { pt = snap(pt, x, y); drag.d.pts[drag.h.i] = pt; }
      } else {
        const dx = x - drag.x0, dy = y - drag.y0;
        drag.d.pts = drag.orig.map((s, i) => toPoint(s.x + dx, s.y + dy) || drag.origPts[i]);
      }
      redraw(true);
    });
    window.addEventListener('mouseup', () => { if (drag) { drag = null; saveDrawings(); } });
  }

  function updateSelbar() {
    if (!selbar) return;
    const d = drawings.find(x => x.id === selectedId);
    if (!d) { selbar.style.display = 'none'; return; }
    if (selbar.dataset.id !== d.id) {
      selbar.dataset.id = d.id;
      const names = { trend: 'Trend line', ray: 'Ray', hline: 'Horizontal line', vline: 'Vertical line', rect: 'Rectangle', fib: 'Fib retracement', measure: 'Measure', text: 'Text' };
      selbar.innerHTML = `<span>${names[d.type] || d.type}</span><input type="color" value="${d.color}" title="Colour"><button>Delete</button>`;
      selbar.querySelector('input').addEventListener('input', e => { d.color = e.target.value; saveDrawings(); redraw(true); });
      selbar.querySelector('button').addEventListener('click', () => { drawings = drawings.filter(x => x.id !== d.id); selectedId = null; selbar.dataset.id = ''; saveDrawings(); redraw(true); });
    }
    selbar.style.display = 'flex';
  }

  /* =====================================================================
     10. HOOKS called by trading.html's own chart code
     ===================================================================== */
  function parseUrl(url) { const m = /symbol=([A-Z0-9]+).*interval=([0-9a-zA-Z]+)/.exec(url || ''); return m ? { symbol: m[1], interval: m[2] } : null; }
  const kl2c = k => ({ t: Math.floor(k[0] / 1000), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] });

  function ensureChart() {
    const t = window.__vxTerminal;
    if (chart || !t || !t.getChart) return !!chart;
    const c = t.getChart(); if (!c || !c.chart) return false;
    chart = c.chart; candleSeries = c.candleSeries; volumeSeries = c.volumeSeries;
    try { chart.applyOptions({ rightPriceScale: { minimumWidth: 72 }, timeScale: { rightOffset: 4 } }); } catch (e) { /* n/a */ }
    chart.timeScale().subscribeVisibleLogicalRangeChange(rg => { if (lock || !rg) return; syncRange(rg, chart); });
    chart.subscribeCrosshairMove(p => onCrosshair(p, chart));
    applyLog(); applyVolume(); sizeCanvas();
    return true;
  }

  window.__vxOnCandles = function (klines, url) {
    scaffold(); if (!stage) return;
    if (!ensureChart()) return;
    const info = parseUrl(url);
    if (info) {
      if (info.symbol !== symbol) { symbol = info.symbol; loadDrawings(); pending = null; }
      interval = info.interval;
    }
    const rows = (klines || []).map(kl2c);
    D = { t: rows.map(r => r.t), o: rows.map(r => r.o), h: rows.map(r => r.h), l: rows.map(r => r.l), c: rows.map(r => r.c), v: rows.map(r => r.v), step: 3600 };
    const n = D.t.length; D.step = n > 1 ? D.t[n - 1] - D.t[n - 2] : 3600;
    if (interval === '1M') D.step = 30 * 86400;
    idxByTime = new Map(D.t.map((t, i) => [t, i]));
    build();
    setTimeout(() => syncRange(chart.timeScale().getVisibleLogicalRange(), chart), 60);
  };

  window.__vxOnTick = function (kline, url) {
    if (!chart || !D.t.length) return;
    const info = parseUrl(url); if (info && (info.symbol !== symbol || info.interval !== interval)) return;
    const k = kl2c(kline), n = D.t.length;
    if (k.t === D.t[n - 1]) { D.o[n - 1] = k.o; D.h[n - 1] = k.h; D.l[n - 1] = k.l; D.c[n - 1] = k.c; D.v[n - 1] = k.v; }
    else if (k.t > D.t[n - 1]) { D.t.push(k.t); D.o.push(k.o); D.h.push(k.h); D.l.push(k.l); D.c.push(k.c); D.v.push(k.v); idxByTime.set(k.t, n); }
    else return;
    updateData();
  };

  /* make sure the toolbar exists even before the first candles arrive */
  function boot() {
    scaffold();
    if (!stage) return setTimeout(boot, 200);
    loadDrawings();
    // the terminal may have loaded candles before this script ran
    const t = window.__vxTerminal;
    if (t && t.getSymbol) { symbol = t.getSymbol(); interval = t.getInterval(); loadDrawings(); }
    let tries = 0;
    const wait = setInterval(() => {
      if (ensureChart() || ++tries > 100) { clearInterval(wait); if (chart && t && t.reloadCandles && !D.t.length) t.reloadCandles(); }
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  /* expose for debugging / console use */
  window.VaultexTA = {
    add: type => { if (!IND[type]) throw new Error('Unknown indicator: ' + type + '. Try: ' + Object.keys(IND).join(', ')); const i = newInstance(type); instances.push(i); saveInst(); build(); return i; },
    clear: () => { instances = []; saveInst(); build(); },
    list: () => Object.keys(IND),
    values: (type, params) => compute({ type, params: Object.assign(defaultsFor(IND[type]), params || {}) }),
    state: () => ({ symbol, interval, candles: D.t.length, instances: instances.map(i => labelOf(i)), drawings: drawings.length }),
  };
})();
