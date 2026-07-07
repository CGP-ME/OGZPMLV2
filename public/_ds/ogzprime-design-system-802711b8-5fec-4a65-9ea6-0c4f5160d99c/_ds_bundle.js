/* @ds-bundle: {"format":3,"namespace":"OGZPrimeDesignSystem_802711","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Metric","sourcePath":"components/dashboard/Metric.jsx"},{"name":"Panel","sourcePath":"components/dashboard/Panel.jsx"},{"name":"StatusLight","sourcePath":"components/dashboard/StatusLight.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"bcd715fb94e9","components/core/Button.jsx":"cca0152d67ff","components/core/Card.jsx":"5867057164fc","components/dashboard/Metric.jsx":"14873a57d80a","components/dashboard/Panel.jsx":"7c5c61311539","components/dashboard/StatusLight.jsx":"e57a464b5bde","components/forms/Input.jsx":"d399aac61eaf","components/navigation/Tabs.jsx":"9efe748d78f0","public/js/ChartManager.js":"2dc031c05b4a","public/js/IndicatorAdapter.js":"b0b291df14cd","public/js/command-palette.js":"a7bfebc57c0a","public/js/core.js":"9f28eeac5f79","public/js/drawing-tools.js":"766db7112d12","public/js/indicators.js":"86bb2d5665a0","public/js/operator/trade-manager.js":"8a0cf7ddd86e","public/js/panels/ambient-fx.js":"9fc85b09fe54","public/js/panels/asset-tf-card.js":"198ca99eec1a","public/js/panels/bot-intelligence.js":"3d44341559e0","public/js/panels/candle-countdown.js":"dadd5b93e6f2","public/js/panels/celebration.js":"205d8d4f484a","public/js/panels/chart-panel.js":"5f13d82b2fb1","public/js/panels/confidence-heatbar.js":"87586c384bc0","public/js/panels/custom-alerts.js":"251406acf7fa","public/js/panels/edge-analytics-panel.js":"99bd2dadce37","public/js/panels/edge-analytics.js":"34573e54a6f0","public/js/panels/equity-curve.js":"66fe3f2c4cdd","public/js/panels/goal-tracker.js":"093375825eff","public/js/panels/header-strip.js":"404aa5f11b1c","public/js/panels/layout-switcher.js":"77cc618bb47f","public/js/panels/live-readouts.js":"cdb6a93ac4ae","public/js/panels/live-report.js":"62ccec44f60f","public/js/panels/loss-recovery.js":"8887591880c3","public/js/panels/milestone-effects.js":"4db6efa33e52","public/js/panels/news-ticker.js":"0a459e09316d","public/js/panels/open-positions.js":"7c2f46d2dcf6","public/js/panels/pattern-card.js":"00db2ee0dd34","public/js/panels/pattern-sparkline.js":"e226df502346","public/js/panels/rail-resize.js":"626f94c82d3d","public/js/panels/risk-gauge.js":"51c153809adc","public/js/panels/session-phase.js":"22816099f829","public/js/panels/size-preview.js":"69c43583face","public/js/panels/spoofing-detector.js":"522256dc9557","public/js/panels/strategy-leaderboard.js":"ef3aeaec0ce3","public/js/panels/system-health.js":"e09667ad2342","public/js/panels/system-snapshot.js":"fe429dd7f3c5","public/js/panels/trade-log.js":"d169e804bed7","public/js/panels/trade-replay.js":"f14a62265076","public/js/panels/trai-brain.js":"13c28f1d4f56","public/js/panels/victory-animations.js":"70e8ed7c3985","public/js/panels/voice-fx.js":"a3846f0d0894","public/js/panels/voice-manager.js":"a7d46a0ef036","public/js/panels/watchlist-strip.js":"64575b44913e","public/js/run-frontend-empire-v2.js":"06c081e6491b","public/js/theme-customizer.js":"5627ad3c0630","public/js/websocket.js":"8a7e6d1f01ff","ui_kits/trading-dashboard/dashboard.jsx":"ed365fee53fa","ui_kits/trading-dashboard/data.jsx":"633629236d49","ui_kits/trading-dashboard/panels-chart.jsx":"beb6b7303433","ui_kits/trading-dashboard/panels-left.jsx":"9401cff3bd5f","ui_kits/trading-dashboard/panels-rail.jsx":"21f76c18989c","ui_kits/trading-dashboard/panels-top.jsx":"21bbb54a0852"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.OGZPrimeDesignSystem_802711 = window.OGZPrimeDesignSystem_802711 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * OGZPrime Badge — compact status / category marker.
 * Covers the brand's pill family: RECOMMENDED tier pill, LONG/SHORT direction
 * tags, and semantic state chips. Solid or soft (tinted) fill.
 */
function Badge({
  children,
  tone = 'red',
  // 'red' | 'verified' | 'gold' | 'profit' | 'loss' | 'cyan' | 'neutral'
  soft = false,
  // tinted background + colored text instead of solid
  size = 'md',
  // 'sm' | 'md'
  uppercase = true,
  style = {},
  ...rest
}) {
  const tones = {
    red: {
      solid: 'var(--ogz-red)',
      c: '#fff',
      soft: 'rgba(220,38,38,0.12)',
      sc: 'var(--ogz-red-light)'
    },
    verified: {
      solid: 'var(--ogz-verified)',
      c: '#03150a',
      soft: 'rgba(34,197,94,0.12)',
      sc: 'var(--ogz-verified)'
    },
    gold: {
      solid: 'var(--ogz-gold)',
      c: '#1a1500',
      soft: 'rgba(255,215,0,0.12)',
      sc: 'var(--ogz-gold)'
    },
    profit: {
      solid: 'var(--ogz-profit)',
      c: '#03150a',
      soft: 'rgba(0,255,136,0.12)',
      sc: 'var(--ogz-profit)'
    },
    loss: {
      solid: 'var(--ogz-loss)',
      c: '#fff',
      soft: 'rgba(255,51,102,0.12)',
      sc: 'var(--ogz-loss)'
    },
    cyan: {
      solid: 'var(--ogz-cyan)',
      c: '#001318',
      soft: 'rgba(0,204,255,0.12)',
      sc: 'var(--ogz-cyan)'
    },
    neutral: {
      solid: '#2a2a2a',
      c: '#cfcfcf',
      soft: 'rgba(255,255,255,0.06)',
      sc: 'var(--ogz-text-dim)'
    }
  };
  const t = tones[tone] || tones.red;
  const dims = size === 'sm' ? {
    pad: '2px 8px',
    fs: '9px',
    ls: '0.5px'
  } : {
    pad: '4px 12px',
    fs: '11px',
    ls: '1px'
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      fontFamily: 'var(--font-mono)',
      fontWeight: 700,
      fontSize: dims.fs,
      letterSpacing: uppercase ? dims.ls : 'normal',
      textTransform: uppercase ? 'uppercase' : 'none',
      padding: dims.pad,
      borderRadius: 'var(--radius-pill)',
      background: soft ? t.soft : t.solid,
      color: soft ? t.sc : t.c,
      lineHeight: 1.4,
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * OGZPrime Button — the brand's primary action control.
 * Filled red by default; outline + ghost variants; hover brightens and lifts -2px.
 */
function Button({
  children,
  variant = 'primary',
  // 'primary' | 'outline' | 'ghost' | 'verified'
  size = 'md',
  // 'sm' | 'md' | 'lg'
  uppercase = false,
  disabled = false,
  full = false,
  onClick,
  style = {},
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const sizes = {
    sm: {
      padding: '8px 16px',
      font: '12px'
    },
    md: {
      padding: '12px 26px',
      font: '15px'
    },
    lg: {
      padding: '16px 36px',
      font: '17px'
    }
  };
  const s = sizes[size] || sizes.md;
  const palettes = {
    primary: {
      bg: hover ? 'var(--ogz-red-bright)' : 'var(--ogz-red)',
      color: '#fff',
      border: 'none'
    },
    verified: {
      bg: hover ? '#2ec45f' : 'var(--ogz-verified)',
      color: '#03150a',
      border: 'none'
    },
    outline: {
      bg: hover ? 'rgba(220,38,38,0.10)' : 'transparent',
      color: 'var(--ogz-red)',
      border: '2px solid var(--ogz-red)'
    },
    ghost: {
      bg: hover ? 'rgba(255,255,255,0.06)' : 'transparent',
      color: hover ? 'var(--ogz-text)' : 'var(--ogz-text-dim)',
      border: '1px solid var(--ogz-border)'
    }
  };
  const p = palettes[variant] || palettes.primary;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    style: {
      display: full ? 'flex' : 'inline-flex',
      width: full ? '100%' : 'auto',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: s.font,
      padding: s.padding,
      borderRadius: 'var(--radius-md)',
      textTransform: uppercase ? 'uppercase' : 'none',
      letterSpacing: uppercase ? '1px' : 'normal',
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: disabled ? '#444' : p.bg,
      color: disabled ? '#888' : p.color,
      border: p.border,
      opacity: disabled ? 0.7 : 1,
      transform: disabled ? 'none' : press ? 'translateY(0)' : hover ? 'translateY(-2px)' : 'none',
      transition: 'background var(--dur-base) ease, transform var(--dur-base) ease',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * OGZPrime Card — dark surface that lights its border on hover.
 * Default accent is brand red; `accent="verified"` switches to green (used for
 * the featured / RECOMMENDED pricing tier).
 */
function Card({
  children,
  accent = 'red',
  // 'red' | 'verified' | 'none'
  featured = false,
  // persistent accent border + glow (no hover needed)
  padding = '28px 24px',
  radius = 'var(--radius-lg)',
  style = {},
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const accents = {
    red: {
      border: 'var(--ogz-red)',
      glow: 'var(--halo-red)'
    },
    verified: {
      border: 'var(--ogz-verified)',
      glow: 'var(--halo-green)'
    },
    none: {
      border: 'var(--ogz-border)',
      glow: 'none'
    }
  };
  const a = accents[accent] || accents.red;
  const lit = featured || hover;
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      background: 'var(--ogz-surface-2)',
      border: `1px solid ${lit ? a.border : 'var(--ogz-border)'}`,
      borderRadius: radius,
      padding,
      boxShadow: lit && accent !== 'none' ? a.glow : 'none',
      transition: 'border-color var(--dur-slow) ease, box-shadow var(--dur-slow) ease',
      position: 'relative',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/dashboard/Metric.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * OGZPrime Metric — a big Orbitron readout: label, value, optional delta/sub.
 * The numbers ARE the iconography of this product. Value color carries meaning.
 */
function Metric({
  label,
  value,
  delta,
  // optional change string, e.g. "+2.4%"
  trend,
  // 'up' | 'down' | null — colors value + delta
  sub,
  // optional small caption under the value
  glow = false,
  // neon glow on the value (for live/featured numbers)
  align = 'left',
  style = {},
  ...rest
}) {
  const trends = {
    up: {
      color: 'var(--ogz-profit)',
      glow: 'var(--glow-profit)'
    },
    down: {
      color: 'var(--ogz-loss)',
      glow: 'var(--glow-loss)'
    }
  };
  const t = trend ? trends[trend] : null;
  const valColor = t ? t.color : 'var(--ogz-text)';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      fontFamily: 'var(--font-mono)',
      textAlign: align,
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      minWidth: 0,
      ...style
    }
  }, rest), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '10px',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: 'var(--ogz-text-faint)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: '22px',
      lineHeight: 1,
      color: valColor,
      textShadow: glow ? t ? t.glow : 'var(--glow-red)' : 'none'
    }
  }, value), delta && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      color: t ? t.color : 'var(--ogz-text-dim)'
    }
  }, delta), sub && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      color: 'var(--ogz-text-faint)'
    }
  }, sub));
}
Object.assign(__ds_scope, { Metric });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/dashboard/Metric.jsx", error: String((e && e.message) || e) }); }

// components/dashboard/Panel.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * OGZPrime Panel — the glass container every dashboard module sits in.
 * Translucent dark fill, hairline border, soft underglow, tiny uppercase title.
 */
function Panel({
  title,
  right,
  // optional right-aligned node in the header (count, control)
  children,
  glass = true,
  // glass fill + blur vs. flat solid panel
  padding = '14px 16px',
  style = {},
  bodyStyle = {},
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("section", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      background: glass ? 'var(--ogz-glass)' : 'var(--ogz-panel)',
      border: '1px solid var(--ogz-border-hairline)',
      borderRadius: 'var(--radius-md)',
      boxShadow: hover ? 'var(--shadow-underglow-strong)' : 'var(--shadow-underglow)',
      backdropFilter: glass ? 'var(--blur-panel)' : 'none',
      transform: hover ? 'translateY(-1px)' : 'none',
      transition: 'box-shadow var(--dur-slow) ease, transform var(--dur-slow) ease',
      padding,
      ...style
    }
  }, rest), (title || right) && /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '10px'
    }
  }, title && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '10px',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: 'var(--ogz-text-faint)'
    }
  }, title), right), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      color: 'var(--ogz-text)',
      ...bodyStyle
    }
  }, children));
}
Object.assign(__ds_scope, { Panel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/dashboard/Panel.jsx", error: String((e && e.message) || e) }); }

// components/dashboard/StatusLight.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * OGZPrime StatusLight — the BOT / DATA / TRAI health indicator.
 * A glowing dot (green active / red error / gray idle) with a pulse and label.
 */
function StatusLight({
  label,
  state = 'active',
  // 'active' | 'error' | 'idle'
  pulse = true,
  style = {},
  ...rest
}) {
  const states = {
    active: {
      dot: '#00ff88',
      glow: '0 0 8px rgba(0,255,136,0.6)',
      text: '#00ff88'
    },
    error: {
      dot: '#ff3366',
      glow: '0 0 8px rgba(255,51,102,0.6)',
      text: '#ff3366'
    },
    idle: {
      dot: '#444444',
      glow: 'none',
      text: '#888888'
    }
  };
  const s = states[state] || states.active;
  const animate = pulse && state !== 'idle';
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: s.dot,
      boxShadow: s.glow,
      flex: 'none',
      animation: animate ? 'ogz-status-pulse 1.2s infinite' : 'none'
    }
  }), label && /*#__PURE__*/React.createElement("span", {
    style: {
      color: s.text
    }
  }, label));
}
Object.assign(__ds_scope, { StatusLight });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/dashboard/StatusLight.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * OGZPrime Input — dark field with a red focus ring.
 * Matches the lead-capture modal + account inputs across the product.
 */
function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  mono = false,
  // monospace value (tickers, amounts, API keys)
  disabled = false,
  full = true,
  style = {},
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      width: full ? '100%' : 'auto',
      boxSizing: 'border-box',
      padding: '12px 14px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--ogz-surface-2)',
      color: 'var(--ogz-text)',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
      fontSize: '15px',
      border: `1px solid ${focus ? 'var(--ogz-red)' : 'var(--ogz-border)'}`,
      boxShadow: focus ? '0 0 0 3px rgba(220,38,38,0.18)' : 'none',
      outline: 'none',
      opacity: disabled ? 0.6 : 1,
      transition: 'border-color var(--dur-base) ease, box-shadow var(--dur-base) ease',
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * OGZPrime Tabs — underline tab bar. Active tab is red (marketing) or gold
 * (command-center); the active underline matches. Mono uppercase-friendly.
 */
function Tabs({
  tabs = [],
  // [{ id, label }]
  active,
  // id of active tab
  onChange,
  accent = 'red',
  // 'red' | 'gold' | 'cyan'
  style = {},
  ...rest
}) {
  const accents = {
    red: 'var(--ogz-red)',
    gold: 'var(--ogz-gold)',
    cyan: 'var(--ogz-cyan)'
  };
  const a = accents[accent] || accents.red;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      gap: 0,
      borderBottom: '1px solid var(--ogz-border-hairline)',
      ...style
    }
  }, rest), tabs.map(t => {
    const on = t.id === active;
    return /*#__PURE__*/React.createElement("button", {
      key: t.id,
      type: "button",
      onClick: () => onChange && onChange(t.id),
      style: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '10px 20px',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        fontWeight: 500,
        color: on ? a : 'var(--ogz-text-faint)',
        borderBottom: `2px solid ${on ? a : 'transparent'}`,
        marginBottom: '-1px',
        transition: 'color var(--dur-base) ease, border-color var(--dur-base) ease'
      }
    }, t.label);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// public/js/ChartManager.js
try { (() => {
/**
 * ChartManager.js - Centralized chart data management
 * Handles OHLCV data storage, indicator caching, and multi-timeframe support
 */

class ChartManager {
  constructor() {
    this.candleStorage = new Map(); // Store candles by asset-timeframe key
    this.indicatorCache = new Map(); // Cache calculated indicators
    this.chartInstances = {}; // Multiple Chart.js instances
    this.maxCandles = 500; // Memory management
    this.subscribers = new Set(); // Components listening for updates
  }

  /**
   * Add or update a candle
   * @param {string} asset - Asset symbol (TSLA, SPY, NVDA, BTC-USD, etc)
   * @param {string} timeframe - Timeframe (1m, 5m, 1h, etc)
   * @param {object} candle - OHLCV candle data
   */
  addCandle(asset, timeframe, candle) {
    const key = `${asset}-${timeframe}`;
    if (!this.candleStorage.has(key)) {
      this.candleStorage.set(key, []);
    }
    const candles = this.candleStorage.get(key);

    // Check if we're updating the current candle or adding a new one
    if (candles.length > 0 && candles[candles.length - 1].t === candle.t) {
      // Update existing candle (real-time update)
      candles[candles.length - 1] = {
        ...candles[candles.length - 1],
        h: Math.max(candles[candles.length - 1].h, candle.h),
        l: Math.min(candles[candles.length - 1].l, candle.l),
        c: candle.c,
        v: candles[candles.length - 1].v + candle.v
      };
    } else {
      // Add new candle
      candles.push(candle);

      // Maintain memory limit
      if (candles.length > this.maxCandles) {
        candles.shift();
      }
    }

    // Notify subscribers of update
    this.notifySubscribers('candle_update', {
      asset,
      timeframe,
      candle
    });
  }

  /**
   * Add multiple candles (for historical data loading)
   */
  addCandles(asset, timeframe, candleArray) {
    const key = `${asset}-${timeframe}`;
    this.candleStorage.set(key, candleArray.slice(-this.maxCandles));
    this.notifySubscribers('candles_loaded', {
      asset,
      timeframe,
      count: candleArray.length
    });
  }

  /**
   * Get candles for specific asset and timeframe
   */
  getCandles(asset, timeframe) {
    return this.candleStorage.get(`${asset}-${timeframe}`) || [];
  }

  /**
   * Get latest candle
   */
  getLatestCandle(asset, timeframe) {
    const candles = this.getCandles(asset, timeframe);
    return candles[candles.length - 1] || null;
  }

  /**
   * Cache indicator values
   */
  cacheIndicator(asset, timeframe, indicatorType, values) {
    const key = `${asset}-${timeframe}-${indicatorType}`;
    this.indicatorCache.set(key, values);
  }

  /**
   * Get cached indicator values
   */
  getCachedIndicator(asset, timeframe, indicatorType) {
    const key = `${asset}-${timeframe}-${indicatorType}`;
    return this.indicatorCache.get(key) || [];
  }

  /**
   * Subscribe to updates
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Notify all subscribers
   */
  notifySubscribers(type, data) {
    this.subscribers.forEach(callback => callback({
      type,
      data
    }));
  }

  /**
   * Clear old data (memory management)
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    this.candleStorage.forEach((candles, key) => {
      const filtered = candles.filter(c => now - c.t < maxAge);
      if (filtered.length !== candles.length) {
        this.candleStorage.set(key, filtered);
      }
    });
  }

  /**
   * Get memory usage stats
   */
  getStats() {
    let totalCandles = 0;
    let totalIndicators = 0;
    this.candleStorage.forEach(candles => {
      totalCandles += candles.length;
    });
    this.indicatorCache.forEach(values => {
      totalIndicators += values.length;
    });
    return {
      assets: new Set([...this.candleStorage.keys()].map(k => k.split('-')[0])).size,
      timeframes: new Set([...this.candleStorage.keys()].map(k => k.split('-')[1])).size,
      totalCandles,
      totalIndicators,
      memoryUsage: `${((totalCandles * 48 + totalIndicators * 16) / 1024).toFixed(2)} KB`
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChartManager;
} else {
  window.ChartManager = ChartManager;
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/ChartManager.js", error: String((e && e.message) || e) }); }

// public/js/IndicatorAdapter.js
try { (() => {
/**
 * IndicatorAdapter.js - Bridge between dashboard and existing IndicatorEngine
 * Maps the comprehensive IndicatorEngine from /core/indicators to dashboard needs
 */

class IndicatorAdapter {
  constructor(chartManager) {
    this.chartManager = chartManager;
    // We'll create IndicatorEngine instances per asset-timeframe pair
    this.engines = new Map(); // key: "BTC-1m", value: IndicatorEngine instance
  }

  /**
   * Get or create an IndicatorEngine for an asset-timeframe pair
   */
  getEngine(asset, timeframe) {
    const key = `${asset}-${timeframe}`;
    if (!this.engines.has(key)) {
      // Note: IndicatorEngine expects to be loaded server-side
      // For client-side dashboard, we receive calculated values via WebSocket
      console.log(`Creating indicator engine for ${key}`);
      this.engines.set(key, {
        symbol: asset,
        timeframe: timeframe,
        lastIndicators: {}
      });
    }
    return this.engines.get(key);
  }

  /**
   * Process WebSocket indicator update from bot
   * The bot's IndicatorEngine sends pre-calculated values
   */
  processIndicatorUpdate(data) {
    const {
      symbol,
      tf,
      indicators
    } = data;
    const engine = this.getEngine(symbol, tf);

    // Store the latest indicator values
    engine.lastIndicators = indicators;

    // Cache in ChartManager for display
    if (indicators.rsi !== null) {
      this.chartManager.cacheIndicator(symbol, tf, 'RSI', [indicators.rsi]);
    }
    if (indicators.macd) {
      this.chartManager.cacheIndicator(symbol, tf, 'MACD', [indicators.macd]);
    }
    if (indicators.bb) {
      this.chartManager.cacheIndicator(symbol, tf, 'BB', [indicators.bb]);
    }
    if (indicators.atr !== null) {
      this.chartManager.cacheIndicator(symbol, tf, 'ATR', [indicators.atr]);
    }
    if (indicators.vwap !== null) {
      this.chartManager.cacheIndicator(symbol, tf, 'VWAP', [indicators.vwap]);
    }
    if (indicators.obv !== null) {
      this.chartManager.cacheIndicator(symbol, tf, 'OBV', [indicators.obv]);
    }
    if (indicators.stochRsi) {
      this.chartManager.cacheIndicator(symbol, tf, 'STOCH', [indicators.stochRsi]);
    }
    return indicators;
  }

  /**
   * Get formatted indicator values for display
   */
  getIndicatorDisplay(asset, timeframe) {
    const engine = this.getEngine(asset, timeframe);
    const ind = engine.lastIndicators;
    const display = {
      trend: [],
      momentum: [],
      volume: [],
      volatility: []
    };

    // Trend indicators
    if (ind.sma) {
      Object.entries(ind.sma).forEach(([period, value]) => {
        if (value !== null) {
          display.trend.push({
            name: `SMA ${period}`,
            value: value.toFixed(2)
          });
        }
      });
    }
    if (ind.ema) {
      Object.entries(ind.ema).forEach(([period, value]) => {
        if (value !== null) {
          display.trend.push({
            name: `EMA ${period}`,
            value: value.toFixed(2)
          });
        }
      });
    }
    if (ind.vwap !== null) {
      display.trend.push({
        name: 'VWAP',
        value: ind.vwap.toFixed(2)
      });
    }

    // Momentum indicators
    if (ind.rsi !== null) {
      display.momentum.push({
        name: 'RSI',
        value: ind.rsi.toFixed(2),
        signal: ind.rsi < 30 ? 'oversold' : ind.rsi > 70 ? 'overbought' : 'neutral'
      });
    }
    if (ind.macd) {
      display.momentum.push({
        name: 'MACD',
        value: ind.macd.macd?.toFixed(4) || '0',
        signal: ind.macd.hist > 0 ? 'bullish' : 'bearish'
      });
    }
    if (ind.stochRsi) {
      display.momentum.push({
        name: 'Stoch RSI',
        value: `K:${ind.stochRsi.k?.toFixed(2) || 'N/A'} D:${ind.stochRsi.d?.toFixed(2) || 'N/A'}`
      });
    }

    // Volume indicators
    if (ind.obv !== null) {
      display.volume.push({
        name: 'OBV',
        value: (ind.obv / 1000000).toFixed(2) + 'M'
      });
    }
    if (ind.mfi !== null) {
      display.volume.push({
        name: 'MFI',
        value: ind.mfi.toFixed(2)
      });
    }

    // Volatility indicators
    if (ind.bb) {
      display.volatility.push({
        name: 'BB Width',
        value: ((ind.bb.upper - ind.bb.lower) / ind.bb.mid * 100).toFixed(2) + '%'
      });
    }
    if (ind.atr !== null) {
      display.volatility.push({
        name: 'ATR',
        value: ind.atr.toFixed(2)
      });
    }
    if (ind.keltner) {
      display.volatility.push({
        name: 'Keltner',
        value: `${ind.keltner.upper.toFixed(2)} / ${ind.keltner.lower.toFixed(2)}`
      });
    }
    return display;
  }

  /**
   * Get chart overlay data for indicators
   */
  getChartOverlays(asset, timeframe) {
    const engine = this.getEngine(asset, timeframe);
    const ind = engine.lastIndicators;
    const candles = this.chartManager.getCandles(asset, timeframe);
    const overlays = {
      lines: [],
      bands: [],
      oscillators: []
    };
    if (!ind || candles.length === 0) return overlays;

    // Moving averages as lines
    if (ind.sma) {
      Object.entries(ind.sma).forEach(([period, value]) => {
        if (value !== null) {
          overlays.lines.push({
            id: `sma${period}`,
            name: `SMA ${period}`,
            data: [{
              x: candles[candles.length - 1].t,
              y: value
            }],
            color: period === '20' ? '#FFA500' : period === '50' ? '#FF6347' : '#FFD700'
          });
        }
      });
    }
    if (ind.ema) {
      Object.entries(ind.ema).forEach(([period, value]) => {
        if (value !== null) {
          overlays.lines.push({
            id: `ema${period}`,
            name: `EMA ${period}`,
            data: [{
              x: candles[candles.length - 1].t,
              y: value
            }],
            color: period === '20' ? '#00BFFF' : period === '50' ? '#1E90FF' : '#4169E1'
          });
        }
      });
    }

    // Bollinger Bands
    if (ind.bb) {
      overlays.bands.push({
        id: 'bb',
        name: 'Bollinger Bands',
        upper: [{
          x: candles[candles.length - 1].t,
          y: ind.bb.upper
        }],
        middle: [{
          x: candles[candles.length - 1].t,
          y: ind.bb.mid
        }],
        lower: [{
          x: candles[candles.length - 1].t,
          y: ind.bb.lower
        }],
        color: 'rgba(128, 128, 128, 0.2)'
      });
    }

    // Oscillators (separate panel)
    if (ind.rsi !== null) {
      overlays.oscillators.push({
        id: 'rsi',
        name: 'RSI',
        data: [{
          x: candles[candles.length - 1].t,
          y: ind.rsi
        }],
        color: '#9370DB',
        panel: 'rsi',
        yAxis: {
          min: 0,
          max: 100,
          levels: [30, 70]
        }
      });
    }
    if (ind.macd) {
      overlays.oscillators.push({
        id: 'macd',
        name: 'MACD',
        data: [{
          x: candles[candles.length - 1].t,
          y: ind.macd.macd
        }],
        color: '#32CD32',
        panel: 'macd'
      });
      overlays.oscillators.push({
        id: 'macd_signal',
        name: 'Signal',
        data: [{
          x: candles[candles.length - 1].t,
          y: ind.macd.signal
        }],
        color: '#DC143C',
        panel: 'macd'
      });
      overlays.oscillators.push({
        id: 'macd_hist',
        name: 'Histogram',
        data: [{
          x: candles[candles.length - 1].t,
          y: ind.macd.hist
        }],
        color: ind.macd.hist > 0 ? '#00FF00' : '#FF0000',
        panel: 'macd',
        type: 'bar'
      });
    }
    return overlays;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IndicatorAdapter;
} else {
  window.IndicatorAdapter = IndicatorAdapter;
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/IndicatorAdapter.js", error: String((e && e.message) || e) }); }

// public/js/command-palette.js
try { (() => {
/**
 * command-palette.js — OGZPrime Command Palette (Ctrl/Cmd + K)
 *
 * Keyboard-triggered action launcher with fuzzy search. Zero external deps;
 * self-injects DOM + styles; self-registers with window.OGZ.
 *
 * Design goals
 *   • Always reachable via Ctrl+K / Cmd+K (also `/` when no input focused)
 *   • Zero impact when closed (no polling, no listeners firing)
 *   • Uses ONLY existing selectors / buttons that already live in the DOM —
 *     never invents its own trading verbs. Asset / timeframe / indicator
 *     commands drive the existing <select>s and checkboxes, so behavior
 *     stays in lock-step with manual clicks.
 *   • Commands auto-populate from DOM state at open time — add a new
 *     asset to #assetSelector and it shows up in the palette immediately.
 *
 * Modes
 *   closed  → invisible, no event loop, no rAF
 *   open    → modal with backdrop, keyboard trap, fuzzy-filtered list
 *
 * Shortcuts
 *   Ctrl/Cmd + K   open
 *   /              open (only if focus is not in an input/textarea/select)
 *   Esc            close
 *   ↑ / ↓          move selection
 *   Enter          execute selected command
 *   Tab            (swallowed — keeps focus inside palette)
 *
 * Extending
 *   Register extra commands at runtime:
 *     OGZ.get('CommandPalette').register({
 *       id: 'my-custom',
 *       title: 'Do the thing',
 *       subtitle: 'what it does',
 *       category: 'Custom',
 *       icon: '✨',
 *       run: () => { ... }
 *     });
 *
 * @module public/js/command-palette
 */
(function (OGZ) {
  'use strict';

  // ─── Config ──────────────────────────────────────────────────────────
  const STYLE_ID = 'ogz-command-palette-styles';
  const ROOT_ID = 'ogz-command-palette-root';
  const OVERLAY_ID = 'ogz-command-palette-overlay';
  const INPUT_ID = 'ogz-command-palette-input';
  const LIST_ID = 'ogz-command-palette-list';
  const HINT_ID = 'ogz-command-palette-hint';
  const MAX_VISIBLE = 10;

  // ─── State ───────────────────────────────────────────────────────────
  const state = {
    open: false,
    query: '',
    selected: 0,
    commands: [],
    // Registered (static) commands
    dynamic: [],
    // Rebuilt each open() from DOM
    filtered: [],
    // Currently-displayed rows
    lastToast: null,
    previouslyFocused: null
  };

  // Capture a reference to the ORIGINAL window.confirm at module load
  // time, BEFORE any page script has a chance to override it. All
  // palette confirmations use _origConfirm instead of window.confirm
  // so a later `window.confirm = () => true` from a malicious same-
  // origin script cannot bypass the user dialog on trading-state
  // mutations. `.bind(window)` preserves the native `this`.
  const _origConfirm = typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm.bind(window) : () => true; // fallback for non-browser environments (tests, SSR)

  // ─── Styles (self-injected once) ─────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
#${OVERLAY_ID} {
    position: fixed;
    inset: 0;
    background: rgba(5, 5, 8, 0.55);
    backdrop-filter: blur(6px) saturate(120%);
    -webkit-backdrop-filter: blur(6px) saturate(120%);
    z-index: 99990;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 14vh;
    animation: ogzCpFade 0.16s ease-out;
}
@keyframes ogzCpFade {
    from { opacity: 0; }
    to   { opacity: 1; }
}
@keyframes ogzCpRise {
    from { opacity: 0; transform: translateY(6px) scale(0.985); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
}
#${ROOT_ID} {
    width: min(640px, calc(100vw - 32px));
    max-height: 70vh;
    background: linear-gradient(180deg, rgba(18,18,22,0.96) 0%, rgba(10,10,13,0.98) 100%);
    border: 1px solid rgba(220, 38, 38, 0.38);
    border-radius: 14px;
    box-shadow:
        0 30px 80px rgba(0, 0, 0, 0.65),
        0 0 0 1px rgba(220, 38, 38, 0.08) inset,
        0 0 40px rgba(220, 38, 38, 0.22);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: ogzCpRise 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #f4f4f5;
}
.ogz-cp-search {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(220, 38, 38, 0.18);
    background: rgba(8, 8, 10, 0.6);
}
.ogz-cp-search-icon {
    font-size: 16px;
    opacity: 0.7;
}
#${INPUT_ID} {
    flex: 1;
    background: transparent;
    border: 0;
    outline: 0;
    color: #f4f4f5;
    font-size: 15px;
    font-family: inherit;
    padding: 2px 0;
    letter-spacing: 0.01em;
}
#${INPUT_ID}::placeholder { color: rgba(244, 244, 245, 0.38); }
.ogz-cp-kbd {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    color: rgba(244, 244, 245, 0.65);
    background: rgba(220, 38, 38, 0.14);
    border: 1px solid rgba(220, 38, 38, 0.35);
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.04em;
}
#${LIST_ID} {
    flex: 1;
    overflow-y: auto;
    padding: 6px 6px 10px 6px;
}
#${LIST_ID}::-webkit-scrollbar { width: 6px; }
#${LIST_ID}::-webkit-scrollbar-track { background: transparent; }
#${LIST_ID}::-webkit-scrollbar-thumb {
    background: rgba(220, 38, 38, 0.35);
    border-radius: 3px;
}
.ogz-cp-section {
    font-family: 'Orbitron', 'Segoe UI', sans-serif;
    font-size: 9.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(239, 68, 68, 0.8);
    padding: 10px 14px 4px 14px;
    user-select: none;
}
.ogz-cp-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.08s ease;
    border: 1px solid transparent;
}
.ogz-cp-row:hover {
    background: rgba(220, 38, 38, 0.08);
}
.ogz-cp-row.ogz-cp-active {
    background: linear-gradient(90deg, rgba(220, 38, 38, 0.18) 0%, rgba(220, 38, 38, 0.04) 100%);
    border-color: rgba(220, 38, 38, 0.35);
    box-shadow: 0 0 0 1px rgba(220, 38, 38, 0.15) inset;
}
.ogz-cp-icon {
    font-size: 16px;
    width: 22px;
    text-align: center;
    flex-shrink: 0;
}
.ogz-cp-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
}
.ogz-cp-title {
    font-size: 13.5px;
    font-weight: 500;
    color: #f4f4f5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ogz-cp-title .ogz-cp-match {
    color: #fca5a5;
    font-weight: 600;
}
.ogz-cp-subtitle {
    font-size: 11px;
    color: rgba(244, 244, 245, 0.45);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ogz-cp-category {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    letter-spacing: 0.06em;
    color: rgba(239, 68, 68, 0.72);
    background: rgba(220, 38, 38, 0.08);
    border: 1px solid rgba(220, 38, 38, 0.22);
    padding: 3px 7px;
    border-radius: 999px;
    text-transform: uppercase;
    flex-shrink: 0;
}
.ogz-cp-empty {
    padding: 32px 18px;
    text-align: center;
    color: rgba(244, 244, 245, 0.45);
    font-size: 13px;
}
#${HINT_ID} {
    display: flex;
    gap: 14px;
    align-items: center;
    padding: 8px 14px;
    border-top: 1px solid rgba(220, 38, 38, 0.14);
    background: rgba(5, 5, 7, 0.5);
    font-size: 10.5px;
    color: rgba(244, 244, 245, 0.55);
}
#${HINT_ID} span b {
    font-weight: 600;
    color: rgba(244, 244, 245, 0.85);
}

.ogz-cp-toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(18, 18, 22, 0.96);
    border: 1px solid rgba(220, 38, 38, 0.45);
    color: #f4f4f5;
    padding: 9px 16px;
    border-radius: 8px;
    font-size: 12.5px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    z-index: 99999;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(220, 38, 38, 0.25);
    animation: ogzCpToast 0.18s ease-out;
}
@keyframes ogzCpToast {
    from { opacity: 0; transform: translate(-50%, 6px); }
    to   { opacity: 1; transform: translate(-50%, 0); }
}
`;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── DOM scaffolding (self-injected once) ────────────────────────────
  function ensureDom() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.display = 'none';
    overlay.innerHTML = `
            <div id="${ROOT_ID}" role="dialog" aria-modal="true" aria-label="Command palette">
                <div class="ogz-cp-search">
                    <span class="ogz-cp-search-icon">⌘</span>
                    <input
                        id="${INPUT_ID}"
                        type="text"
                        placeholder="Type a command or search…"
                        autocomplete="off"
                        spellcheck="false" />
                    <span class="ogz-cp-kbd">ESC</span>
                </div>
                <div id="${LIST_ID}" role="listbox"></div>
                <div id="${HINT_ID}">
                    <span><b>↑↓</b> navigate</span>
                    <span><b>↵</b> run</span>
                    <span><b>esc</b> close</span>
                    <span style="margin-left:auto;opacity:0.6;">${state.commands.length || '·'} actions</span>
                </div>
            </div>
        `;
    document.body.appendChild(overlay);

    // Close on backdrop click (not on palette content)
    overlay.addEventListener('mousedown', e => {
      if (e.target === overlay) close();
    });
    const input = overlay.querySelector(`#${INPUT_ID}`);
    input.addEventListener('input', onQueryChange);
    input.addEventListener('keydown', onPaletteKeydown);
    return overlay;
  }

  // ─── Fuzzy scoring ───────────────────────────────────────────────────
  // Lightweight Sublime-style fuzzy matcher. Scores:
  //   • exact-substring bonus (handles e.g. "tsla" → "Tesla (TSLA)")
  //   • word-start substring bonus (e.g. "open" → "Open …")
  //   • consecutive-letter bonus
  //   • start-of-string bonus
  //   • shorter match wins on tie
  function fuzzyScore(haystack, needle) {
    if (!needle) return {
      score: 0,
      indices: []
    };
    const hs = haystack.toLowerCase();
    const nd = needle.toLowerCase();

    // Fast path 1: exact substring. Prefer the LAST occurrence so a
    // query like "tsla" lines up with the ticker at the end of the
    // title rather than the first stray "t" earlier in the string.
    let subIdx = hs.lastIndexOf(nd);
    if (subIdx === -1) subIdx = hs.indexOf(nd);
    if (subIdx !== -1) {
      let score = 40 + nd.length * 2;
      if (subIdx === 0) score += 15; // start-of-string
      else if (isWordBoundary(hs, subIdx)) score += 10; // word-start
      score -= (haystack.length - needle.length) * 0.03;
      const indices = [];
      for (let i = 0; i < nd.length; i++) indices.push(subIdx + i);
      return {
        score,
        indices
      };
    }

    // Slow path: classic fuzzy character walk.
    let score = 0;
    let hi = 0;
    let prevMatched = false;
    let prevWasSpace = true;
    const indices = [];
    for (let ni = 0; ni < nd.length; ni++) {
      const ch = nd[ni];
      let found = false;
      while (hi < hs.length) {
        const hc = hs[hi];
        if (hc === ch) {
          let bonus = 1;
          if (prevMatched) bonus += 5;
          if (prevWasSpace) bonus += 3;
          if (hi === 0) bonus += 4;
          score += bonus;
          indices.push(hi);
          prevMatched = true;
          hi++;
          found = true;
          break;
        }
        prevMatched = false;
        prevWasSpace = hc === ' ' || hc === '-' || hc === '_' || hc === '.';
        hi++;
      }
      if (!found) return null;
    }

    // Penalty for leftover length (shorter hits rank higher)
    score -= (haystack.length - needle.length) * 0.03;
    return {
      score,
      indices
    };
  }
  function isWordBoundary(hs, i) {
    if (i === 0) return true;
    const prev = hs[i - 1];
    return prev === ' ' || prev === '-' || prev === '_' || prev === '.' || prev === '(' || prev === '/';
  }
  function highlightTitle(title, indices) {
    if (!indices || indices.length === 0) return escapeHtml(title);
    const chars = [];
    let idxCursor = 0;
    for (let i = 0; i < title.length; i++) {
      const matchedHere = indices[idxCursor] === i;
      const safe = escapeHtml(title[i]);
      if (matchedHere) {
        chars.push(`<span class="ogz-cp-match">${safe}</span>`);
        idxCursor++;
      } else {
        chars.push(safe);
      }
    }
    return chars.join('');
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);
  }

  // ─── Command registry (static) ───────────────────────────────────────
  function buildStaticCommands() {
    const cmds = [];

    // ─── Bot controls ────────────────────────────────────────────
    // Trading-state-mutating commands gated behind a confirm()
    // dialog. Without the gate, any code path that opens the
    // palette and programmatically fires run() (e.g., an iframe
    // attack that calls OGZ.get('CommandPalette').open() +
    // auto-executes the first command) could pause/resume the
    // bot without user intent. The confirm() blocks unless the
    // user actively clicks OK.
    cmds.push({
      id: 'bot-pause',
      title: 'Pause trading',
      subtitle: 'Halt all new entries until resumed',
      category: 'Bot',
      icon: '⏸',
      run: () => {
        if (!_origConfirm('Pause trading?\n\nThis halts all new entries until resumed.')) {
          toast('Pause cancelled');
          return;
        }
        sendSocket({
          type: 'command',
          command: 'pause_trading',
          reason: 'Manual pause from command palette'
        });
        toast('Pause command sent to bot');
      }
    });
    cmds.push({
      id: 'bot-resume',
      title: 'Resume trading',
      subtitle: 'Re-enable entries',
      category: 'Bot',
      icon: '▶',
      run: () => {
        if (!_origConfirm('Resume trading?\n\nThis re-enables new entries.')) {
          toast('Resume cancelled');
          return;
        }
        sendSocket({
          type: 'command',
          command: 'resume_trading'
        });
        toast('Resume command sent to bot');
      }
    });
    cmds.push({
      id: 'bot-ping',
      title: 'Ping bot',
      subtitle: 'Send a heartbeat and log latency',
      category: 'Diagnostic',
      icon: '📡',
      run: () => {
        const start = Date.now();
        sendSocket({
          type: 'ping',
          timestamp: start
        });
        toast('Ping sent');
      }
    });
    cmds.push({
      id: 'bot-status',
      title: 'Show bot feed status',
      subtitle: 'Seconds since last bot message',
      category: 'Diagnostic',
      icon: '🩺',
      run: () => {
        const last = window.OGZ && window.OGZ.state && window.OGZ.state.lastBotMessageAt || 0;
        const delta = last ? Math.round((Date.now() - last) / 1000) : null;
        toast(delta == null ? 'No bot message yet this session' : `Last bot message: ${delta}s ago`);
      }
    });

    // ─── Dashboard ───────────────────────────────────────────────
    cmds.push({
      id: 'ui-clear-chain',
      title: 'Clear Chain of Thought',
      subtitle: 'Reset the narrator / reasoning panel',
      category: 'Dashboard',
      icon: '🧹',
      run: () => {
        const el = document.getElementById('chainOfThought');
        if (el) {
          el.innerHTML = '<div class="thought-entry" id="thoughtDisplay"><p>Cleared. Awaiting next event…</p></div>';
          toast('Chain of Thought cleared');
        }
      }
    });
    cmds.push({
      id: 'ui-clear-trades',
      title: 'Clear Trade Log',
      subtitle: 'Wipe visible trade entries',
      category: 'Dashboard',
      icon: '🗑',
      run: () => {
        const el = document.getElementById('tradeLog');
        if (el) {
          el.innerHTML = '';
          toast('Trade Log cleared');
        }
      }
    });
    cmds.push({
      id: 'ui-copy-price',
      title: 'Copy current price',
      subtitle: 'Copies the live ticker price to clipboard',
      category: 'Dashboard',
      icon: '📋',
      run: async () => {
        const el = document.getElementById('currentPrice');
        const val = el ? el.textContent.trim() : '';
        if (!val || val === '$0.00') {
          toast('No price yet — waiting on feed');
          return;
        }
        try {
          await navigator.clipboard.writeText(val);
          toast(`Copied ${val}`);
        } catch (_) {
          toast('Clipboard blocked by browser');
        }
      }
    });
    cmds.push({
      id: 'ui-focus-chart',
      title: 'Focus chart',
      subtitle: 'Scroll to the chart container',
      category: 'Navigate',
      icon: '🎯',
      run: () => {
        const el = document.querySelector('.chart-container') || document.getElementById('tvChartContainer');
        if (el) el.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    });
    cmds.push({
      id: 'ui-focus-cot',
      title: 'Focus Chain of Thought',
      subtitle: 'Scroll the CoT panel into view',
      category: 'Navigate',
      icon: '🧠',
      run: () => {
        const el = document.getElementById('chainOfThought');
        if (el) el.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    });
    cmds.push({
      id: 'ui-focus-trades',
      title: 'Focus Trade Log',
      subtitle: 'Scroll the trade log into view',
      category: 'Navigate',
      icon: '📒',
      run: () => {
        const el = document.getElementById('tradeLog');
        if (el) el.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    });
    cmds.push({
      id: 'ui-focus-trai',
      title: 'Focus TRAI chat',
      subtitle: 'Open the TRAI widget if collapsed',
      category: 'Navigate',
      icon: '💬',
      run: () => {
        // trai-widget.js uses a known button id; fall back to any *trai*
        // button we can find. Trigger a click.
        const btn = document.getElementById('traiChatToggle') || document.querySelector('[id*="trai" i][id*="toggle" i]') || document.querySelector('.trai-widget button, .trai-chat-toggle');
        if (btn) {
          btn.click();
          toast('Opened TRAI widget');
        } else {
          toast('TRAI widget not found on this page');
        }
      }
    });
    cmds.push({
      id: 'ui-goto-command-center',
      title: 'Open Command Center',
      subtitle: 'Navigate to /command-center for backtest CSVs',
      category: 'Navigate',
      icon: '📊',
      run: () => {
        window.location.href = '/command-center';
      }
    });
    cmds.push({
      id: 'ui-reload',
      title: 'Reload dashboard',
      subtitle: 'Hard refresh this page',
      category: 'Dashboard',
      icon: '🔄',
      run: () => {
        window.location.reload();
      }
    });
    return cmds;
  }

  // ─── Command registry (dynamic, built on each open) ──────────────────
  // Scrapes the DOM for existing selectors / checkboxes and turns them
  // into palette commands. Anything new added to those controls will
  // surface in the palette automatically on next open.
  function buildDynamicCommands() {
    const cmds = [];

    // Asset switch — reads #assetSelector
    const assetSel = document.getElementById('assetSelector');
    if (assetSel) {
      for (const opt of assetSel.options) {
        if (!opt.value) continue;
        cmds.push({
          id: `asset-${opt.value}`,
          title: `Switch to ${opt.textContent.trim()}`,
          subtitle: `Asset: ${opt.value}`,
          category: 'Asset',
          icon: isCryptoCode(opt.value) ? '₿' : '📈',
          run: () => changeSelect(assetSel, opt.value, 'Asset')
        });
      }
    }

    // Timeframe switch — reads #timeframeSelector
    const tfSel = document.getElementById('timeframeSelector');
    if (tfSel) {
      for (const opt of tfSel.options) {
        if (!opt.value) continue;
        cmds.push({
          id: `tf-${opt.value}`,
          title: `Timeframe ${opt.textContent.trim()}`,
          subtitle: `Switch candles to ${opt.value}`,
          category: 'Timeframe',
          icon: '⏱',
          run: () => changeSelect(tfSel, opt.value, 'Timeframe')
        });
      }
    }

    // Chart type switch — reads #chartTypeSelector
    const ctSel = document.getElementById('chartTypeSelector');
    if (ctSel) {
      for (const opt of ctSel.options) {
        if (!opt.value) continue;
        cmds.push({
          id: `charttype-${opt.value}`,
          title: `Chart type: ${opt.textContent.trim()}`,
          subtitle: `Set chart rendering to ${opt.value}`,
          category: 'Chart',
          icon: '📐',
          run: () => changeSelect(ctSel, opt.value, 'Chart type')
        });
      }
    }

    // Tier switch — reads #tierSelector
    const tierSel = document.getElementById('tierSelector');
    if (tierSel) {
      for (const opt of tierSel.options) {
        if (!opt.value) continue;
        cmds.push({
          id: `tier-${opt.value}`,
          title: `Version: ${opt.textContent.trim().replace(/[🧠⚡]\s?/g, '').trim()}`,
          subtitle: `Switch tier to ${opt.value}`,
          category: 'Chart',
          icon: '🎚',
          run: () => changeSelect(tierSel, opt.value, 'Tier')
        });
      }
    }

    // Indicator toggles — scan for any #chk-* checkbox
    const checks = document.querySelectorAll('#indicatorCheckboxes input[type="checkbox"]');
    checks.forEach(chk => {
      const labelEl = chk.closest('label');
      const name = labelEl ? labelEl.querySelector('span:last-child')?.textContent || chk.value : chk.value;
      cmds.push({
        id: `ind-${chk.id}`,
        title: `Toggle ${name}`,
        subtitle: chk.checked ? 'Currently ON → will turn OFF' : 'Currently OFF → will turn ON',
        category: 'Indicators',
        icon: chk.checked ? '🔆' : '🔅',
        run: () => {
          chk.checked = !chk.checked;
          chk.dispatchEvent(new Event('change', {
            bubbles: true
          }));
          toast(`${name}: ${chk.checked ? 'ON' : 'OFF'}`);
        }
      });
    });
    return cmds;
  }
  function isCryptoCode(code) {
    return /-USD$/.test(code) || /^(BTC|ETH|SOL|XRP|DOGE|ADA|AVAX|LINK|LTC|DOT)/.test(code);
  }
  function changeSelect(sel, value, label) {
    sel.value = value;
    sel.dispatchEvent(new Event('change', {
      bubbles: true
    }));
    const opt = sel.options[sel.selectedIndex];
    toast(`${label} → ${opt ? opt.textContent.trim() : value}`);
  }
  function sendSocket(payload) {
    const sock = window.OGZ && window.OGZ.get && window.OGZ.get('Socket');
    if (sock && typeof sock.send === 'function') {
      sock.send(payload);
    } else {
      toast('Socket not connected');
    }
  }

  // ─── Filtering / rendering ───────────────────────────────────────────
  function allCommands() {
    return state.commands.concat(state.dynamic);
  }
  function refreshFiltered() {
    const q = state.query.trim();
    const all = allCommands();
    if (!q) {
      state.filtered = all.map(c => ({
        cmd: c,
        score: 0,
        indices: []
      }));
    } else {
      const results = [];
      for (const cmd of all) {
        const hay = cmd.title + ' ' + (cmd.subtitle || '') + ' ' + (cmd.category || '');
        const scored = fuzzyScore(hay, q);
        if (scored) {
          results.push({
            cmd,
            score: scored.score,
            indices: scored.indices
          });
        }
      }
      results.sort((a, b) => b.score - a.score);
      state.filtered = results;
    }
    if (state.selected >= state.filtered.length) state.selected = 0;
    render();
  }
  function render() {
    const list = document.getElementById(LIST_ID);
    if (!list) return;
    if (state.filtered.length === 0) {
      list.innerHTML = `<div class="ogz-cp-empty">No commands match "${escapeHtml(state.query)}".</div>`;
      return;
    }
    const showSections = state.query.trim().length === 0;
    const visible = state.filtered.slice(0, MAX_VISIBLE);
    const html = [];
    let lastCat = null;
    visible.forEach((row, i) => {
      const {
        cmd,
        indices
      } = row;
      if (showSections && cmd.category !== lastCat) {
        html.push(`<div class="ogz-cp-section">${escapeHtml(cmd.category || 'Other')}</div>`);
        lastCat = cmd.category;
      }
      const isActive = i === state.selected;
      // Only highlight indices that fall inside the title portion
      const titleIndices = indices.filter(idx => idx < cmd.title.length);
      html.push(`
                <div class="ogz-cp-row ${isActive ? 'ogz-cp-active' : ''}"
                     data-idx="${i}"
                     role="option"
                     aria-selected="${isActive}">
                    <div class="ogz-cp-icon">${escapeHtml(cmd.icon || '›')}</div>
                    <div class="ogz-cp-body">
                        <div class="ogz-cp-title">${highlightTitle(cmd.title, titleIndices)}</div>
                        ${cmd.subtitle ? `<div class="ogz-cp-subtitle">${escapeHtml(cmd.subtitle)}</div>` : ''}
                    </div>
                    <div class="ogz-cp-category">${escapeHtml(cmd.category || '')}</div>
                </div>
            `);
    });
    list.innerHTML = html.join('');

    // Wire row click / hover
    list.querySelectorAll('.ogz-cp-row').forEach(el => {
      el.addEventListener('mouseenter', () => {
        state.selected = parseInt(el.dataset.idx, 10);
        updateActive();
      });
      el.addEventListener('click', ev => {
        state.selected = parseInt(el.dataset.idx, 10);
        runSelected(ev);
      });
    });

    // Scroll selected into view (important for arrow nav)
    const activeEl = list.querySelector('.ogz-cp-active');
    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({
        block: 'nearest'
      });
    }
  }
  function updateActive() {
    const rows = document.querySelectorAll(`#${LIST_ID} .ogz-cp-row`);
    rows.forEach((el, i) => {
      el.classList.toggle('ogz-cp-active', i === state.selected);
      el.setAttribute('aria-selected', i === state.selected ? 'true' : 'false');
    });
    const activeEl = rows[state.selected];
    if (activeEl) activeEl.scrollIntoView({
      block: 'nearest'
    });
  }

  // ─── Open / close / run ──────────────────────────────────────────────
  function open() {
    if (state.open) return;
    state.open = true;
    state.query = '';
    state.selected = 0;
    state.previouslyFocused = document.activeElement;
    ensureDom();
    state.dynamic = buildDynamicCommands();

    // Update hint's action count
    const hintCount = document.querySelector(`#${HINT_ID} span[style*="margin-left"]`);
    if (hintCount) hintCount.textContent = `${allCommands().length} actions`;
    const overlay = document.getElementById(OVERLAY_ID);
    overlay.style.display = 'flex';
    const input = document.getElementById(INPUT_ID);
    input.value = '';
    setTimeout(() => input.focus(), 0);
    refreshFiltered();
  }
  function close() {
    if (!state.open) return;
    state.open = false;
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.style.display = 'none';
    // Restore focus to whatever was focused before
    if (state.previouslyFocused && typeof state.previouslyFocused.focus === 'function') {
      try {
        state.previouslyFocused.focus({
          preventScroll: true
        });
      } catch (_) {/* noop */}
    }
  }
  function toggle() {
    state.open ? close() : open();
  }
  function runSelected(triggerEvent) {
    const row = state.filtered[state.selected];
    if (!row) return;
    const cmd = row.cmd;
    // Trusted-event gate: only execute commands when the trigger
    // event came from a genuine user action (click / keydown the
    // user actually performed). Synthesized events (dispatched by
    // an iframe or another same-origin script via dispatchEvent)
    // have isTrusted === false. This blocks the attack vector
    // where a malicious page opens the palette and programmatically
    // fires Enter/click to execute a command without user consent.
    if (!triggerEvent || triggerEvent.isTrusted !== true) {
      console.warn('[CommandPalette] run rejected — trigger not isTrusted');
      toast('Command requires a real user action');
      return;
    }
    close();
    // Defer to next tick so the palette DOM is hidden before the
    // command mutates state / navigates away.
    setTimeout(() => {
      try {
        cmd.run();
      } catch (e) {
        console.error('[CommandPalette] Command failed:', e);
        toast(`Error: ${e.message || e}`);
      }
    }, 0);
  }

  // ─── Input handlers ──────────────────────────────────────────────────
  function onQueryChange(e) {
    state.query = e.target.value;
    state.selected = 0;
    refreshFiltered();
  }
  function onPaletteKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.filtered.length === 0) return;
      state.selected = (state.selected + 1) % state.filtered.length;
      updateActive();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.filtered.length === 0) return;
      state.selected = (state.selected - 1 + state.filtered.length) % state.filtered.length;
      updateActive();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      runSelected(e);
      return;
    }
    if (e.key === 'Tab') {
      // Swallow Tab so focus stays inside the palette
      e.preventDefault();
    }
  }

  // ─── Global keybinding ───────────────────────────────────────────────
  function onGlobalKeydown(e) {
    // Ctrl/Cmd + K — always opens (even from input)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      toggle();
      return;
    }
    // "/" opens only when the user is not currently typing into something
    if (e.key === '/' && !state.open) {
      const a = document.activeElement;
      const tag = a && a.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || a && a.isContentEditable;
      if (!isTyping) {
        e.preventDefault();
        open();
      }
    }
  }

  // ─── Toast ───────────────────────────────────────────────────────────
  function toast(message, ms = 1800) {
    // Dedupe back-to-back identical toasts
    if (state.lastToast && state.lastToast.message === message && Date.now() - state.lastToast.shownAt < 400) {
      return;
    }
    state.lastToast = {
      message,
      shownAt: Date.now()
    };
    const el = document.createElement('div');
    el.className = 'ogz-cp-toast';
    el.textContent = message;
    document.body.appendChild(el);
    // Track the auto-dismiss timer so destroy() can cancel any in-flight
    // toast animation if the palette is torn down mid-display.
    const dismissTimer = setTimeout(() => {
      _trackedToastTimers.delete(dismissTimer);
      el.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%, 4px)';
      const removeTimer = setTimeout(() => {
        _trackedToastTimers.delete(removeTimer);
        el.remove();
      }, 200);
      _trackedToastTimers.add(removeTimer);
    }, ms);
    _trackedToastTimers.add(dismissTimer);
  }

  // ─── Public API ──────────────────────────────────────────────────────
  // Tracking state for explicit teardown. The palette's global keydown
  // listener (Ctrl+K) would otherwise persist for the lifetime of the
  // page with no way to unhook it. destroy() closes the loop.
  let _isInitialized = false;
  const _trackedToastTimers = new Set();
  const CommandPalette = {
    init() {
      if (_isInitialized) return; // idempotent re-init guard
      injectStyles();
      ensureDom();
      state.commands = buildStaticCommands();
      window.addEventListener('keydown', onGlobalKeydown);
      _isInitialized = true;
      console.log(`[CommandPalette] Ready — ${state.commands.length} static commands (Ctrl+K to open)`);
    },
    /**
     * Explicit teardown. Removes the global keydown listener, clears
     * pending toast timers. Useful for hot-reload / test re-mount /
     * programmatic unload scenarios. Wired to beforeunload below so
     * the listener never outlives the page.
     */
    destroy() {
      if (!_isInitialized) return;
      try {
        window.removeEventListener('keydown', onGlobalKeydown);
      } catch (e) {
        console.warn('[CommandPalette] removeEventListener failed:', e);
      }
      // Cancel any in-flight toast auto-dismiss timers
      for (const tid of _trackedToastTimers) {
        try {
          clearTimeout(tid);
        } catch (_) {/* timer may be stale */}
      }
      _trackedToastTimers.clear();
      _isInitialized = false;
      console.log('[CommandPalette] destroy() — teardown complete.');
    },
    open,
    close,
    toggle,
    toast,
    register(cmd) {
      if (!cmd || !cmd.id || !cmd.title || typeof cmd.run !== 'function') {
        console.warn('[CommandPalette] register() needs { id, title, run }');
        return;
      }
      state.commands.push({
        id: cmd.id,
        title: cmd.title,
        subtitle: cmd.subtitle || '',
        category: cmd.category || 'Custom',
        icon: cmd.icon || '›',
        run: cmd.run
      });
    },
    unregister(id) {
      state.commands = state.commands.filter(c => c.id !== id);
    },
    isOpen() {
      return state.open;
    }
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('CommandPalette', CommandPalette);
  } else {
    window.OGZ = window.OGZ || {};
    window.OGZ.CommandPalette = CommandPalette;
  }

  // Auto-init as soon as DOM is ready. If the page is already loaded
  // (script included after body), run immediately.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CommandPalette.init());
  } else {
    CommandPalette.init();
  }

  // Wire destroy() to beforeunload so the global keydown listener + any
  // in-flight toast timers are torn down before the browser collects
  // the page. Belt-and-suspenders — the browser would clean most of
  // this anyway, but explicit teardown closes the re-mount leak gap.
  window.addEventListener('beforeunload', () => {
    try {
      CommandPalette.destroy();
    } catch (e) {
      console.warn('[CommandPalette] destroy() failed on unload:', e);
    }
  });
})(window.OGZ || (window.OGZ = {}));
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/command-palette.js", error: String((e && e.message) || e) }); }

// public/js/core.js
try { (() => {
/**
 * core.js - OGZPrime Orchestrator
 * Centralized State Management & Module Registry
 */
window.OGZ = function () {
  'use strict';

  const state = {
    tier: 'ml',
    lastPrice: 0,
    lastPriceDelta: 0,
    proximityToGolden: 0,
    isGolden: false,
    lastBotMessageAt: 0,
    activeModules: {}
  };
  return {
    register: (name, mod) => {
      state.activeModules[name] = mod;
      console.log(`[OGZ] Module Registered: ${name}`);
    },
    get: name => state.activeModules[name],
    state,
    init: async function () {
      console.log('[Core] Booting Modular System...');

      // Chart MUST init before Socket binds handlers (price/pattern_analysis/trade
      // handlers reference Chart). Socket has special boot (bindGlobalHandlers + connect),
      // not init(). Theme is init'd separately by unified-dashboard.html's window.onload.
      // Every other registered module gets init() called automatically — new modules
      // added via OGZ.register() require no further wiring here.
      const SPECIAL = new Set(['Chart', 'Socket', 'Theme']);
      if (this.get('Chart')) this.get('Chart').init();
      if (this.get('Socket')) {
        this.bindGlobalHandlers();
        this.get('Socket').connect();
      }
      Object.keys(state.activeModules).forEach(name => {
        if (SPECIAL.has(name)) return;
        const mod = this.get(name);
        if (!mod || typeof mod.init !== 'function') return;
        try {
          mod.init();
        } catch (e) {
          console.error(`[OGZ] Module init failed: ${name}`, e);
        }
      });

      // Check TRAI status light
      fetch('/api/trai/status').then(r => r.ok ? r.json() : null).then(d => {
        const traiLight = document.getElementById('traiLight');
        if (traiLight && d && d.ready) {
          traiLight.classList.remove('red', 'yellow');
          traiLight.classList.add('green');
        }
      }).catch(() => {});

      // Bot feed watchdog: if no price/pattern/trade message arrives for
      // >15s, surface a visible "bot offline" state + seed placeholders
      // so the empty bottom panels aren't silent.
      state.lastBotMessageAt = 0;
      setInterval(() => {
        const pill = document.getElementById('feedStatusPill');
        const stale = Date.now() - (state.lastBotMessageAt || 0) > 15000;
        if (pill) pill.style.display = stale ? 'block' : 'none';
        ['botLight'].forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          el.classList.remove(stale ? 'green' : 'red');
          el.classList.add(stale ? 'red' : 'green');
        });
        if (stale) {
          const thought = document.getElementById('thoughtDisplay');
          if (thought && !thought.dataset.stale) {
            thought.dataset.stale = '1';
            thought.innerHTML = '<p style="color:#888;font-size:11px;">Bot offline — no feed received in 15s. Check <code>pm2 list</code> for <code>ogz-prime-v2</code>.</p>';
          }
          const patternName = document.getElementById('currentPatternName');
          if (patternName && !patternName.dataset.stale) {
            patternName.dataset.stale = '1';
            patternName.textContent = 'Waiting for bot…';
          }
        } else {
          const thought = document.getElementById('thoughtDisplay');
          if (thought) delete thought.dataset.stale;
          const patternName = document.getElementById('currentPatternName');
          if (patternName) delete patternName.dataset.stale;
        }
      }, 3000);
    },
    bindGlobalHandlers: function () {
      const socket = this.get('Socket');
      if (!socket) return;

      // DORMANT: Golden Setup State (awaits backend emitter)
      socket.registerHandler('golden_setup_state', d => {
        state.proximityToGolden = d.proximity;
        state.isGolden = d.is_golden;

        // UI Trigger: Golden Alert Pulse
        if (d.proximity >= 0.8) {
          document.body.classList.add('golden-alert-pulse');
        } else {
          document.body.classList.remove('golden-alert-pulse');
        }

        // Update Proximity Fill UI
        const fill = document.getElementById('goldenProximityFill');
        if (fill) fill.style.width = d.proximity * 100 + '%';
        if (this.get('Edge')) this.get('Edge').renderConfluenceMatrix(d.conditions);
        if (this.get('Operator')) this.get('Operator').syncWithGoldenSetup(d.is_golden);
      });

      // LIVE: Standard Price Routing + Bottom Panel Updates
      socket.registerHandler('price', d => {
        state.lastBotMessageAt = Date.now();
        const data = d.data || d;
        const priceCandidate = data.price != null ? data.price : data.close;
        const p = parseFloat(priceCandidate);
        if (!isFinite(p) || p <= 0) return;
        state.lastPriceDelta = p - state.lastPrice;
        state.lastPrice = p;
        if (this.get('Chart')) this.get('Chart').update(data);

        // Update indicator bar from price message
        if (data.indicators) {
          const ind = data.indicators;
          const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
          };
          set('rsiCore', ind.rsi != null ? ind.rsi.toFixed(1) : '--');
          set('macdCore', ind.macd != null ? typeof ind.macd === 'object' ? (ind.macd.macd || 0).toFixed(2) : ind.macd.toFixed(2) : '--');
          const vol = data.volume != null ? data.volume : data.candle && data.candle.volume;
          set('volumeCore', vol != null ? Number(vol).toFixed(0) : '--');
          set('atrML', ind.atr != null ? ind.atr.toFixed(2) : '--');
          set('confidenceML', data.confidence != null ? data.confidence.toFixed(0) + '%' : '--');
        }

        // Session Performance is owned by TradeLog (panels/trade-log.js) —
        // updated on every closed trade via TradeLog.addEntry, ticked by the
        // session timer. The previous per-tick `data.stats.*` writer was
        // clobbering session counters with state.json cumulative numbers,
        // breaking the "session-scope everywhere" guarantee. Removed.

        // Update status lights — all three
        ['dataLight', 'botLight'].forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.classList.remove('red', 'yellow');
            el.classList.add('green');
          }
        });
        const statusText = document.getElementById('statusText');
        if (statusText) statusText.textContent = 'Connected';
        const connDot = document.getElementById('connectionStatus');
        if (connDot) {
          connDot.classList.remove('red');
          connDot.classList.add('green');
        }
      });

      // LIVE: Intelligence Routing (Strategy HUD)
      socket.registerHandler('bot_thinking', d => {
        state.lastBotMessageAt = Date.now();
        if (this.get('Intelligence')) this.get('Intelligence').updateWinnerHUD(d);
        // Populate the indicators-bar "Live Conf" field. bot_thinking
        // carries decision.confidence which the price event does not —
        // without this wire, #confidenceML rendered '--' on every tick.
        const conf = d && d.confidence != null ? d.confidence : d && d.data && d.data.confidence != null ? d.data.confidence : null;
        if (conf != null) {
          const el = document.getElementById('confidenceML');
          if (el) el.textContent = Number(conf).toFixed(0) + '%';
        }
      });

      // LIVE: Pattern Analysis — updates pattern panel + ghost projection
      socket.registerHandler('pattern_analysis', d => {
        state.lastBotMessageAt = Date.now();
        // Ghost projection (guarded)
        if (this.get('Chart') && d.projection_path) {
          this.get('Chart').plotGhost(d.projection_path);
        }

        // Pattern display panel
        if (d.pattern) {
          const nameEl = document.getElementById('currentPatternName');
          const descEl = document.getElementById('patternDescription');
          const patternCore = document.getElementById('patternCore');
          const patternML = document.getElementById('patternML');
          const confEl = document.getElementById('confidence');
          if (nameEl) nameEl.textContent = d.pattern.name || 'No pattern';
          if (descEl) descEl.innerHTML = `<p class="pattern-info">${d.pattern.description || 'Analyzing market structure...'}</p>`;
          if (patternCore) patternCore.textContent = d.pattern.name || 'None';
          if (patternML) patternML.textContent = d.pattern.name || 'None';
          if (confEl && d.pattern.confidence != null) {
            confEl.textContent = (d.pattern.confidence * 100).toFixed(0) + '%';
          }
        }

        // Indicator values from pattern_analysis (the bot sends these here too)
        if (d.indicators) {
          const ind = d.indicators;
          const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
          };
          if (ind.rsi != null) set('rsiCore', ind.rsi.toFixed(1));
          if (ind.macd != null) set('macdCore', typeof ind.macd === 'object' ? (ind.macd.macd || ind.macd).toFixed(2) : ind.macd.toFixed(2));
          if (ind.atr != null) set('atrML', ind.atr.toFixed(2));
        }
      });

      // LIVE: Trade execution events — trade log + performance stats update
      socket.registerHandler('trade', d => {
        state.lastBotMessageAt = Date.now();
        if (this.get('TradeLog')) this.get('TradeLog').addEntry(d);

        // tradesExecuted / totalPnl updates removed — TradeLog.addEntry
        // already updates these via renderSessionPerformance(). Doubling
        // up here was double-counting the trade and reading the prior
        // value back from textContent (broken if first event).
      });

      // LIVE: Market Internals (Whale Absorption)
      socket.registerHandler('market_internals', d => {
        if (this.get('Edge')) this.get('Edge').updateMarketInternals(d);
      });

      // DORMANT: Whale Walls & Depth (awaits Kraken L2 feed)
      socket.registerHandler('depth_update', d => {
        if (this.get('Chart')) this.get('Chart').renderLiquidity(d);
        if (this.get('Edge')) this.get('Edge').updateWallRadar(d);
      });

      // LIVE: Historical candle loading
      socket.registerHandler('historical_candles', d => {
        if (this.get('Chart')) this.get('Chart').loadHistorical(d);
      });

      // LIVE: Balance sync
      socket.registerHandler('balance_update', d => {
        if (this.get('Operator')) this.get('Operator').updateBalance(d.balance);
      });

      // LIVE: State update (fallback balance delivery)
      socket.registerHandler('state_update', d => {
        if (d.state?.balance && this.get('Operator')) {
          this.get('Operator').updateBalance(d.state.balance);
        }
      });

      // LIVE: Narrator events (USER_NARRATOR only — sanitized customer story).
      // Prepends each event to Chain of Thought so the panel fills with
      // the trade story as it unfolds. TradeNarrator broadcasts text in
      // payload.text (see commit 5b6845c) so we can render directly.
      socket.registerHandler('narrator_event', d => {
        state.lastBotMessageAt = Date.now();
        const container = document.getElementById('chainOfThought');
        if (!container) return;
        // Clear placeholder on first narrator event
        const placeholder = container.querySelector('#thoughtDisplay');
        if (placeholder && !container.dataset.narratorStarted) {
          placeholder.remove();
          container.dataset.narratorStarted = '1';
        }
        const entry = document.createElement('div');
        entry.className = 'thought-entry narrator-entry';
        const ts = new Date(d.timestamp || Date.now()).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        // Sanitize d.text before injecting
        const safeText = String(d.text || '').replace(/[&<>"']/g, c => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[c]);
        entry.innerHTML = `
                    <div style="display:flex;gap:10px;align-items:baseline;">
                        <span style="color:#71717a;font-size:10px;font-family:'JetBrains Mono',monospace;letter-spacing:0.05em;">${ts}</span>
                        <span style="color:#e4e4e7;font-size:12px;line-height:1.5;flex:1;">${safeText}</span>
                    </div>`;
        container.prepend(entry);
        // Cap at 40 entries
        while (container.children.length > 40) container.lastChild.remove();
      });
    }
  };
}();
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/core.js", error: String((e && e.message) || e) }); }

// public/js/drawing-tools.js
try { (() => {
/**
 * drawing-tools.js - Chart Interaction Layer
 * Interactive hooks for LightweightCharts with tvChart access fix
 */
(function (OGZ) {
  'use strict';

  let activeTool = null;
  const DrawingTools = {
    init: function () {
      console.log('[DrawingTools] Initialized.');
    },
    activateTool: function (toolType, el) {
      const chartMod = OGZ.get('Chart');
      if (!chartMod) return;

      // UI Toggle
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      if (el) el.classList.add('active');
      activeTool = toolType;
      console.log('[DrawingTools] Active Tool:', toolType);
    },
    clearAll: function () {
      console.log('[DrawingTools] Clearing all drawings.');
      activeTool = null;
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    }
  };
  OGZ.register('DrawingTools', DrawingTools);

  // Legacy global wrappers for onclick handlers in HTML
  window.activateDrawingTool = (type, el) => {
    if (OGZ.get('DrawingTools')) OGZ.get('DrawingTools').activateTool(type, el);
  };
  window.clearDrawings = () => {
    if (OGZ.get('DrawingTools')) OGZ.get('DrawingTools').clearAll();
  };
})(window.OGZ);
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/drawing-tools.js", error: String((e && e.message) || e) }); }

// public/js/indicators.js
try { (() => {
/**
 * indicators.js - Deterministic Indicator Math
 * Pure stateless calculations for chart overlays
 */
(function (OGZ) {
  'use strict';

  const Indicators = {
    calculateEMA: (data, period) => {
      const k = 2 / (period + 1);
      let ema = [data[0]];
      for (let i = 1; i < data.length; i++) {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
      }
      return ema;
    },
    calculateSMA: (data, period) => {
      const sma = [];
      for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
          sma.push(null);
          continue;
        }
        const slice = data.slice(i - period + 1, i + 1);
        sma.push(slice.reduce((a, b) => a + b) / period);
      }
      return sma;
    },
    calculateBollinger: (data, period = 20, stdDev = 2) => {
      const bands = {
        upper: [],
        middle: [],
        lower: []
      };
      for (let i = 0; i < data.length; i++) {
        if (i < period) {
          bands.upper.push(null);
          bands.middle.push(null);
          bands.lower.push(null);
          continue;
        }
        const slice = data.slice(i - period, i);
        const mean = slice.reduce((a, b) => a + b) / period;
        const sd = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
        bands.middle.push(mean);
        bands.upper.push(mean + stdDev * sd);
        bands.lower.push(mean - stdDev * sd);
      }
      return bands;
    },
    calculateRSI: (data, period = 14) => {
      let gains = 0,
        losses = 0;
      for (let i = 1; i <= period; i++) {
        const diff = data[i] - data[i - 1];
        if (diff >= 0) gains += diff;else losses -= diff;
      }
      let avgG = gains / period,
        avgL = losses / period;
      const rsi = [null];
      for (let i = period + 1; i < data.length; i++) {
        const diff = data[i] - data[i - 1];
        avgG = (avgG * (period - 1) + (diff > 0 ? diff : 0)) / period;
        avgL = (avgL * (period - 1) + (diff < 0 ? -diff : 0)) / period;
        rsi.push(100 - 100 / (1 + avgG / avgL));
      }
      return rsi;
    },
    calculateVWAP: candles => {
      let cumVol = 0,
        cumTP = 0;
      return candles.map(c => {
        const tp = (c.high + c.low + c.close) / 3;
        cumVol += c.volume;
        cumTP += tp * c.volume;
        return cumVol > 0 ? cumTP / cumVol : tp;
      });
    },
    calculateATR: (candles, period = 14) => {
      const tr = candles.map((c, i) => {
        if (i === 0) return c.high - c.low;
        const prev = candles[i - 1];
        return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
      });
      const atr = [tr[0]];
      for (let i = 1; i < tr.length; i++) {
        atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
      }
      return atr;
    },
    calculateMACD: (closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
      const ema = (data, period) => {
        const k = 2 / (period + 1);
        let e = [data[0]];
        for (let i = 1; i < data.length; i++) e.push(data[i] * k + e[i - 1] * (1 - k));
        return e;
      };
      const emaFast = ema(closes, fastPeriod);
      const emaSlow = ema(closes, slowPeriod);
      const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
      const signalLine = ema(macdLine, signalPeriod);
      return {
        macd: macdLine,
        signal: signalLine
      };
    },
    calculateIchimoku: candles => {
      const tenkan = [],
        kijun = [],
        senkouA = [],
        senkouB = [];
      const highLow = (data, start, len) => {
        const slice = data.slice(Math.max(0, start - len + 1), start + 1);
        return {
          high: Math.max(...slice.map(c => c.high)),
          low: Math.min(...slice.map(c => c.low))
        };
      };
      for (let i = 0; i < candles.length; i++) {
        if (i >= 8) {
          const hl9 = highLow(candles, i, 9);
          tenkan.push((hl9.high + hl9.low) / 2);
        } else {
          tenkan.push(null);
        }
        if (i >= 25) {
          const hl26 = highLow(candles, i, 26);
          kijun.push((hl26.high + hl26.low) / 2);
        } else {
          kijun.push(null);
        }
        if (tenkan[i] && kijun[i]) {
          senkouA.push((tenkan[i] + kijun[i]) / 2);
        } else {
          senkouA.push(null);
        }
        if (i >= 51) {
          const hl52 = highLow(candles, i, 52);
          senkouB.push((hl52.high + hl52.low) / 2);
        } else {
          senkouB.push(null);
        }
      }
      return {
        tenkan,
        kijun,
        senkouA,
        senkouB
      };
    },
    calculateFibonacci: (candles, lookback = 50) => {
      const recent = candles.slice(-lookback);
      const high = Math.max(...recent.map(c => c.high));
      const low = Math.min(...recent.map(c => c.low));
      const diff = high - low;
      return [{
        level: 0,
        price: high,
        label: '0%'
      }, {
        level: 0.236,
        price: high - diff * 0.236,
        label: '23.6%'
      }, {
        level: 0.382,
        price: high - diff * 0.382,
        label: '38.2%'
      }, {
        level: 0.5,
        price: high - diff * 0.5,
        label: '50%'
      }, {
        level: 0.618,
        price: high - diff * 0.618,
        label: '61.8%'
      }, {
        level: 0.786,
        price: high - diff * 0.786,
        label: '78.6%'
      }, {
        level: 1,
        price: low,
        label: '100%'
      }];
    },
    calculateTrendLines: (candles, lookback = 80) => {
      const recent = candles.slice(-lookback);
      const highs = [],
        lows = [];
      // Find swing highs and lows
      for (let i = 3; i < recent.length - 3; i++) {
        if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i - 2].high && recent[i].high > recent[i + 1].high && recent[i].high > recent[i + 2].high) {
          highs.push({
            index: i,
            price: recent[i].high,
            time: recent[i].time
          });
        }
        if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i - 2].low && recent[i].low < recent[i + 1].low && recent[i].low < recent[i + 2].low) {
          lows.push({
            index: i,
            price: recent[i].low,
            time: recent[i].time
          });
        }
      }
      const lines = [];
      // Resistance trend line: connect last two swing highs
      if (highs.length >= 2) {
        const h1 = highs[highs.length - 2],
          h2 = highs[highs.length - 1];
        lines.push({
          type: 'resistance',
          points: [{
            time: h1.time,
            value: h1.price
          }, {
            time: h2.time,
            value: h2.price
          }]
        });
      }
      // Support trend line: connect last two swing lows
      if (lows.length >= 2) {
        const l1 = lows[lows.length - 2],
          l2 = lows[lows.length - 1];
        lines.push({
          type: 'support',
          points: [{
            time: l1.time,
            value: l1.price
          }, {
            time: l2.time,
            value: l2.price
          }]
        });
      }
      return lines;
    },
    calculateSupportResistance: (candles, lookback = 50) => {
      const recent = candles.slice(-lookback);
      const levels = [];
      for (let i = 2; i < recent.length - 2; i++) {
        if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i - 2].high && recent[i].high > recent[i + 1].high && recent[i].high > recent[i + 2].high) {
          levels.push({
            price: recent[i].high,
            type: 'resistance'
          });
        }
        if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i - 2].low && recent[i].low < recent[i + 1].low && recent[i].low < recent[i + 2].low) {
          levels.push({
            price: recent[i].low,
            type: 'support'
          });
        }
      }
      // Cluster nearby levels
      const clustered = [];
      const used = new Set();
      for (let i = 0; i < levels.length; i++) {
        if (used.has(i)) continue;
        let sum = levels[i].price,
          count = 1;
        for (let j = i + 1; j < levels.length; j++) {
          if (used.has(j)) continue;
          if (Math.abs(levels[j].price - levels[i].price) / levels[i].price < 0.003) {
            sum += levels[j].price;
            count++;
            used.add(j);
          }
        }
        clustered.push({
          price: sum / count,
          type: levels[i].type,
          strength: count
        });
        used.add(i);
      }
      return clustered.sort((a, b) => b.strength - a.strength).slice(0, 6);
    }
  };
  OGZ.register('Indicators', Indicators);
})(window.OGZ);
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/indicators.js", error: String((e && e.message) || e) }); }

// public/js/operator/trade-manager.js
try { (() => {
/**
 * trade-manager.js - OGZPrime Execution & Risk Layer
 * Position sizing, SL/TP management, execution commands, Golden Mode lock
 */
(function (OGZ) {
  'use strict';

  let stopLossMode = 'fixed';
  const Operator = {
    init: function () {
      console.log('[Operator] Controls Active.');

      // Auto-calculate whenever risk/entry/stop inputs change
      ['accountBalance', 'riskPercent', 'entryPrice', 'stopLoss', 'tp1'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => this.calculatePosition());
      });

      // Live Price Sync: Pull current price into entry field if empty
      setInterval(() => {
        const entryInput = document.getElementById('entryPrice');
        if (entryInput && !entryInput.value && OGZ.state.lastPrice > 0) {
          entryInput.value = OGZ.state.lastPrice.toFixed(2);
        }
      }, 1000);
      this.bindTradeControls();
    },
    bindTradeControls: function () {
      // Trade manager panel toggle
      const tmToggle = document.querySelector('.trade-toggle');
      if (tmToggle) tmToggle.addEventListener('click', () => {
        const panel = document.getElementById('tradePanel');
        if (panel) panel.classList.toggle('active');
      });

      // SL mode buttons (already have window.setSLMode but strip inline onclick)
      document.querySelectorAll('.sl-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          const mode = this.textContent.toLowerCase().includes('trail') ? 'trailing' : this.textContent.toLowerCase().includes('break') ? 'breakeven' : 'fixed';
          OGZ.get('Operator').setSLMode(mode, this);
        });
      });

      // Apply Stop Loss button
      const applySlBtn = document.querySelector('.sl-section .apply-btn');
      if (applySlBtn) applySlBtn.addEventListener('click', () => {
        const socket = OGZ.get('Socket');
        if (socket) socket.send({
          type: 'update_stop_loss',
          mode: stopLossMode,
          stopLoss: parseFloat(document.getElementById('currentSL')?.value) || 0,
          trailDistance: parseFloat(document.getElementById('trailDistance')?.value) || 50,
          breakEvenTarget: parseFloat(document.getElementById('beTarget')?.value) || 100
        });
      });

      // Quick action buttons
      const quickActions = document.querySelectorAll('.quick-actions button');
      const actionMap = ['close_half', 'close_all', 'reverse', 'hedge'];
      quickActions.forEach((btn, i) => {
        if (actionMap[i]) {
          btn.addEventListener('click', () => {
            const socket = OGZ.get('Socket');
            if (socket) socket.send({
              type: 'command',
              action: actionMap[i],
              timestamp: Date.now()
            });
          });
        }
      });

      // Set Take Profits button
      const tpApply = document.querySelector('.tp-section .apply-btn');
      if (tpApply) tpApply.addEventListener('click', () => {
        const targets = ['tp1', 'tp2', 'tp3'].map(id => ({
          level: parseFloat(document.getElementById(id)?.value) || 0
        })).filter(t => t.level > 0);
        const socket = OGZ.get('Socket');
        if (socket) socket.send({
          type: 'set_take_profits',
          targets
        });
      });
    },
    // CP1: Golden Setup Integration — highlights exec buttons on high-conviction setup
    syncWithGoldenSetup: function (isGolden) {
      const execButtons = document.querySelectorAll('.exec-btn');
      execButtons.forEach(btn => {
        if (isGolden) {
          btn.classList.add('golden-mode');
          btn.style.boxShadow = '0 0 20px var(--ml-color)';
        } else {
          btn.classList.remove('golden-mode');
          btn.style.boxShadow = 'none';
        }
      });
    },
    calculatePosition: function () {
      const bal = parseFloat(document.getElementById('accountBalance')?.value) || 0;
      const risk = parseFloat(document.getElementById('riskPercent')?.value) || 0;
      const entry = parseFloat(document.getElementById('entryPrice')?.value) || 0;
      const sl = parseFloat(document.getElementById('stopLoss')?.value) || 0;
      const tp1 = parseFloat(document.getElementById('tp1')?.value) || 0;
      if (bal && risk && entry && sl && entry !== sl) {
        const riskAmt = bal * (risk / 100);
        const priceDiff = Math.abs(entry - sl);
        const size = riskAmt / priceDiff;
        const sizeEl = document.getElementById('positionSize');
        const riskEl = document.getElementById('riskAmount');
        const rrEl = document.getElementById('riskReward');
        if (sizeEl) sizeEl.textContent = size.toFixed(4);
        if (riskEl) riskEl.textContent = `$${riskAmt.toFixed(2)}`;
        if (tp1) {
          const reward = Math.abs(tp1 - entry);
          if (rrEl) rrEl.textContent = `1:${(reward / priceDiff).toFixed(2)}`;
        }
      }
    },
    // FIXED: setSLMode now accepts el directly to prevent event.target crashes
    setSLMode: function (mode, el) {
      stopLossMode = mode;
      document.querySelectorAll('.sl-btn').forEach(btn => btn.classList.remove('active'));
      if (el) el.classList.add('active');
      const trailSection = document.getElementById('trailDistance')?.parentElement;
      const beSection = document.getElementById('beTarget')?.parentElement;
      if (trailSection) trailSection.style.display = mode === 'trailing' ? 'flex' : 'none';
      if (beSection) beSection.style.display = mode === 'breakeven' ? 'flex' : 'none';
    },
    executeOrder: function (side) {
      const socket = OGZ.get('Socket');
      if (!socket || !socket.isConnected()) {
        console.error('[Operator] Socket disconnected');
        return;
      }
      socket.send({
        type: 'execute_trade',
        side: side,
        size: parseFloat(document.getElementById('positionSize')?.textContent) || 0,
        price: parseFloat(document.getElementById('entryPrice')?.value) || 0,
        stopLoss: parseFloat(document.getElementById('stopLoss')?.value) || 0,
        mode: stopLossMode,
        isGolden: OGZ.state.isGolden
      });
    },
    updateBalance: function (val) {
      const balInput = document.getElementById('accountBalance');
      if (balInput) {
        balInput.value = parseFloat(val).toFixed(2);
        this.calculatePosition();
      }
    }
  };
  OGZ.register('Operator', Operator);

  // Legacy global wrappers for inline onclick handlers
  window.calculatePosition = Operator.calculatePosition.bind(Operator);
  window.setSLMode = Operator.setSLMode.bind(Operator);
  window.executeOrder = Operator.executeOrder.bind(Operator);
})(window.OGZ);
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/operator/trade-manager.js", error: String((e && e.message) || e) }); }

// public/js/panels/ambient-fx.js
try { (() => {
/**
 * ambient-fx.js — AmbientFX: ambient engagement glow/pulse accent engine
 *
 * Makes the dashboard feel alive by applying SUBTLE, TASTEFUL glow/pulse
 * accents to panels when REAL events fire. It draws the user's eye to where
 * something just happened — ambient and restrained, not a rave.
 *
 * Every glow is a reaction to a real event. NO synthetic data, NO timers
 * that fake activity. If nothing happens, nothing glows. (One exception: an
 * optional, extremely understated slow "breathing" pulse on the TRAI status
 * dot to signal the dashboard is alive — reduced-motion-gated.)
 *
 * All FX = add a CSS class to a target element, then remove it after the
 * animation duration. Re-triggering restarts cleanly via a reflow trick.
 *
 * Subscribes to OGZ.bus (verified against custom-alerts.js / milestone-effects.js):
 *   - 'celebration:win'          → brief GREEN glow pulse on #chartPanel
 *   - 'celebration:loss'         → brief RED glow pulse on #chartPanel
 *   - 'celebration:milestone-hit'→ larger GOLD glow pulse on #chartPanel
 *   - 'celebration:alert'        → brief GOLD edge-glow on #chainOfThought
 *   - 'watchlist:select'         → quick CYAN glow on #chartPanel (asset changed)
 *
 * Subscribes to the socket (verified against core.js registerHandler types):
 *   - 'bot_thinking'  → soft GOLD pulse on #traiBrain
 *   - 'trade'         → brief glow on #openPositions
 *   - 'state_update'  → very subtle brief glow on #dashHeader
 *
 * Self-registers as OGZ.AmbientFX via OGZ.register(). core.js auto-inits it.
 * Self-injects a guarded <style> block with keyframes/classes.
 *
 * Public API:
 *   init()
 *   setEnabled(bool) — mute / unmute all FX
 *   teardown() — remove style tag + clear pending timeouts
 *   _compute() — debug snapshot
 *
 * @module public/js/panels/ambient-fx
 */
(function (OGZ) {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────
  const STYLE_ID = 'ogz-ambient-fx-styles';

  // FX class names — one per effect flavor. Pulse durations match the CSS
  // keyframes below (~500-700ms). Re-triggering removes then re-adds.
  const FX = {
    win: {
      cls: 'ogz-afx-win',
      ms: 650
    },
    loss: {
      cls: 'ogz-afx-loss',
      ms: 650
    },
    milestone: {
      cls: 'ogz-afx-milestone',
      ms: 900
    },
    alert: {
      cls: 'ogz-afx-alert',
      ms: 600
    },
    cyan: {
      cls: 'ogz-afx-cyan',
      ms: 550
    },
    gold: {
      cls: 'ogz-afx-gold',
      ms: 600
    },
    trade: {
      cls: 'ogz-afx-trade',
      ms: 650
    },
    header: {
      cls: 'ogz-afx-header',
      ms: 500
    }
  };

  // ─── Module State ───────────────────────────────────────────────────
  const state = {
    enabled: true,
    timers: new Set(),
    // pending setTimeout ids (for clean teardown)
    glowsFired: 0
  };

  // ─── CSS Injection ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            /* Ambient engagement FX — gold-on-near-black palette.
               Subtle, brief box-shadow / outline pulses. */
            .ogz-afx-win {
                animation: ogzAfxWin 650ms ease-out;
            }
            .ogz-afx-loss {
                animation: ogzAfxLoss 650ms ease-out;
            }
            .ogz-afx-milestone {
                animation: ogzAfxMilestone 900ms ease-out;
            }
            .ogz-afx-alert {
                animation: ogzAfxAlert 600ms ease-out;
            }
            .ogz-afx-cyan {
                animation: ogzAfxCyan 550ms ease-out;
            }
            .ogz-afx-gold {
                animation: ogzAfxGold 600ms ease-out;
            }
            .ogz-afx-trade {
                animation: ogzAfxTrade 650ms ease-out;
            }
            .ogz-afx-header {
                animation: ogzAfxHeader 500ms ease-out;
            }

            @keyframes ogzAfxWin {
                0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.0); }
                35%  { box-shadow: 0 0 22px 3px rgba(34, 197, 94, 0.45); }
                100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.0); }
            }
            @keyframes ogzAfxLoss {
                0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.0); }
                35%  { box-shadow: 0 0 22px 3px rgba(239, 68, 68, 0.42); }
                100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.0); }
            }
            @keyframes ogzAfxMilestone {
                0%   { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
                30%  { box-shadow: 0 0 34px 6px rgba(255, 215, 0, 0.55); }
                65%  { box-shadow: 0 0 20px 3px rgba(255, 215, 0, 0.30); }
                100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
            }
            @keyframes ogzAfxAlert {
                0%   { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
                40%  { box-shadow: 0 0 0 2px rgba(255, 215, 0, 0.40),
                                   0 0 16px 1px rgba(255, 215, 0, 0.22); }
                100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
            }
            @keyframes ogzAfxCyan {
                0%   { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.0); }
                40%  { box-shadow: 0 0 20px 2px rgba(34, 211, 238, 0.40); }
                100% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.0); }
            }
            @keyframes ogzAfxGold {
                0%   { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
                45%  { box-shadow: 0 0 16px 2px rgba(255, 215, 0, 0.30); }
                100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
            }
            @keyframes ogzAfxTrade {
                0%   { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
                40%  { box-shadow: 0 0 18px 2px rgba(255, 215, 0, 0.34); }
                100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
            }
            @keyframes ogzAfxHeader {
                0%   { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
                50%  { box-shadow: 0 0 12px 0 rgba(255, 215, 0, 0.16); }
                100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
            }

            /* Optional ambient "alive" signal — extremely understated slow
               breathing glow on the TRAI status dot. Reaction-free but tiny. */
            .ogz-afx-breathe {
                animation: ogzAfxBreathe 4200ms ease-in-out infinite;
            }
            @keyframes ogzAfxBreathe {
                0%, 100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
                50%      { box-shadow: 0 0 6px 1px rgba(255, 215, 0, 0.22); }
            }

            /* Respect motion preferences — disable every animation. */
            @media (prefers-reduced-motion: reduce) {
                .ogz-afx-win, .ogz-afx-loss, .ogz-afx-milestone,
                .ogz-afx-alert, .ogz-afx-cyan, .ogz-afx-gold,
                .ogz-afx-trade, .ogz-afx-header, .ogz-afx-breathe {
                    animation: none !important;
                }
            }
        `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Core: pulse a target with an FX flavor ─────────────────────────
  // Adds the FX class, schedules removal after the animation duration.
  // Re-triggering restarts cleanly: remove the class + force a reflow
  // before re-adding so the keyframe replays from 0%.
  function pulse(elementId, fxKey) {
    if (!state.enabled) return;
    const fx = FX[fxKey];
    if (!fx) return;
    const el = document.getElementById(elementId);
    if (!el) return; // target absent — skip gracefully

    // Restart cleanly if a previous pulse is still on this element.
    if (el.classList.contains(fx.cls)) {
      el.classList.remove(fx.cls);
      // Force reflow so the browser registers the removal before re-add.
      void el.offsetWidth;
    }
    el.classList.add(fx.cls);
    const t = setTimeout(() => {
      state.timers.delete(t);
      try {
        el.classList.remove(fx.cls);
      } catch (_) {/* swallow */}
    }, fx.ms + 50);
    state.timers.add(t);
    state.glowsFired++;
  }

  // ─── OGZ.bus Subscribers ────────────────────────────────────────────
  function onWin() {
    pulse('chartPanel', 'win');
  }
  function onLoss() {
    pulse('chartPanel', 'loss');
  }
  function onMilestone() {
    pulse('chartPanel', 'milestone');
  }
  function onAlert() {
    pulse('chainOfThought', 'alert');
  }
  function onWatchlist() {
    pulse('chartPanel', 'cyan');
  }

  // ─── Socket Subscribers ─────────────────────────────────────────────
  function onBotThinking() {
    pulse('traiBrain', 'gold');
  }
  function onTrade() {
    pulse('openPositions', 'trade');
  }
  function onStateUpdate() {
    pulse('dashHeader', 'header');
  }

  // ─── Optional ambient "alive" breathing signal ──────────────────────
  // A single very-subtle slow pulse on the small TRAI status dot. Not a
  // reaction to events — just signals the dashboard is alive. Reduced-
  // motion is handled by the CSS @media gate above.
  function startBreathing() {
    const dot = document.getElementById('traiLight');
    if (dot) dot.classList.add('ogz-afx-breathe');
  }
  function stopBreathing() {
    const dot = document.getElementById('traiLight');
    if (dot) dot.classList.remove('ogz-afx-breathe');
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const api = {
    init() {
      try {
        injectStyles();

        // Bind OGZ.bus — it may not exist yet (CustomAlerts creates
        // it). Poll until ready, mirroring voice-fx.js's bindBus.
        (function bindBus() {
          if (!OGZ.bus || typeof OGZ.bus.on !== 'function') {
            setTimeout(bindBus, 100);
            return;
          }
          OGZ.bus.on('celebration:win', onWin);
          OGZ.bus.on('celebration:loss', onLoss);
          OGZ.bus.on('celebration:milestone-hit', onMilestone);
          OGZ.bus.on('celebration:alert', onAlert);
          OGZ.bus.on('watchlist:select', onWatchlist);
        })();

        // Bind socket — poll until ready, mirroring custom-alerts.js.
        (function bindSocket() {
          const socket = OGZ && typeof OGZ.get === 'function' ? OGZ.get('Socket') : null;
          if (!socket || typeof socket.registerHandler !== 'function') {
            setTimeout(bindSocket, 250);
            return;
          }
          socket.registerHandler('bot_thinking', () => {
            try {
              onBotThinking();
            } catch (_) {}
          });
          socket.registerHandler('trade', () => {
            try {
              onTrade();
            } catch (_) {}
          });
          socket.registerHandler('state_update', () => {
            try {
              onStateUpdate();
            } catch (_) {}
          });
        })();

        // Ambient alive-signal — gated by reduced-motion in CSS.
        startBreathing();
      } catch (_) {/* swallow */}
    },
    setEnabled(v) {
      state.enabled = !!v;
      if (!state.enabled) {
        // Clear any in-flight pulse timers and the breathing signal.
        state.timers.forEach(t => clearTimeout(t));
        state.timers.clear();
        stopBreathing();
      } else {
        startBreathing();
      }
    },
    teardown() {
      try {
        state.timers.forEach(t => clearTimeout(t));
        state.timers.clear();
        stopBreathing();
        if (OGZ && OGZ.bus && typeof OGZ.bus.off === 'function') {
          OGZ.bus.off('celebration:win', onWin);
          OGZ.bus.off('celebration:loss', onLoss);
          OGZ.bus.off('celebration:milestone-hit', onMilestone);
          OGZ.bus.off('celebration:alert', onAlert);
          OGZ.bus.off('watchlist:select', onWatchlist);
        }
        const style = document.getElementById(STYLE_ID);
        if (style) style.remove();
      } catch (_) {/* swallow */}
    },
    _compute() {
      return {
        enabled: state.enabled,
        glowsFired: state.glowsFired,
        pendingTimers: state.timers.size,
        styleInjected: !!document.getElementById(STYLE_ID)
      };
    }
  };

  // ─── Registration ───────────────────────────────────────────────────
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('AmbientFX', api);
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('AmbientFX', api);
      }
    });
  }
  try {
    window.OGZAmbientFX = api;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/ambient-fx.js", error: String((e && e.message) || e) }); }

// public/js/panels/asset-tf-card.js
try { (() => {
/**
 * asset-tf-card.js - Left-rail asset card + timeframe pill behavior.
 *
 * - Symbol display mirrors #symbolSelector.value (the canonical source).
 * - Price display mirrors #currentPrice.textContent (chart.js writes
 *   to it on every tick; we observe via MutationObserver).
 * - Pills set #timeframeSelector.value and dispatch a 'change' event
 *   so all eight existing consumers (chart.js, websocket.js,
 *   command-palette.js, candle-countdown.js) keep working unchanged.
 * - Active pill mirrors #timeframeSelector.value via 'change' listener,
 *   so external timeframe switches (command-palette, etc.) update the
 *   pill state too.
 *
 * Modular from day one (2026-04-25). Loaded via <script> tag at
 * bottom of unified-dashboard.html alongside other panel JS.
 */
(function () {
  'use strict';

  const SELECTORS = {
    card: '.asset-tf-card',
    symbol: '.asset-tf-card__symbol',
    price: '.asset-tf-card__price',
    delta: '.asset-tf-card__delta',
    pillRoot: '.asset-tf-card__pills',
    pill: '.asset-tf-card__pill',
    symbolSelect: '#symbolSelector',
    timeframeSelect: '#timeframeSelector',
    priceSrc: '#currentPrice'
  };
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }
  function syncSymbol() {
    const symbolSel = $(SELECTORS.symbolSelect);
    const symbolEl = $(SELECTORS.symbol);
    if (!symbolSel || !symbolEl) return;
    // Initial fallback only — once 'price' WS frames arrive, the
    // handler in init() takes over with the LIVE active symbol from
    // the bot (which reflects SessionRouter's actual session, not
    // the static dropdown).
    symbolEl.textContent = symbolSel.value || 'TSLA';
  }

  /**
   * Update the symbol label from a live WS payload. Authoritative source
   * — reflects whatever the bot is actually trading right now (Kraken
   * BTC/USD on weekend, Alpaca TSLA during RTH, etc.).
   *
   * Bug fix 2026-04-27: pre-fix the card hardcoded "TSLA" via the
   * dropdown mirror, lying about the active session. Now driven by
   * the data.symbol field on every price tick.
   */
  function syncSymbolFromPriceEvent(data) {
    const symbolEl = $(SELECTORS.symbol);
    if (!symbolEl || !data || !data.symbol) return;
    const sym = String(data.symbol);
    if (symbolEl.textContent !== sym) symbolEl.textContent = sym;
  }
  function syncPrice() {
    const src = $(SELECTORS.priceSrc);
    const dst = $(SELECTORS.price);
    if (!src || !dst) return;
    const v = (src.textContent || '').trim();
    if (v && v !== dst.textContent) dst.textContent = v;
  }
  function syncActivePill() {
    const tfSel = $(SELECTORS.timeframeSelect);
    if (!tfSel) return;
    const active = tfSel.value;
    $$(SELECTORS.pill).forEach(btn => {
      const on = btn.dataset.tf === active;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function onPillClick(e) {
    const btn = e.target.closest(SELECTORS.pill);
    if (!btn) return;
    const tf = btn.dataset.tf;
    const tfSel = $(SELECTORS.timeframeSelect);
    if (!tfSel || !tf) return;
    if (tfSel.value === tf) return; /* no-op when already active */
    tfSel.value = tf;
    /* Bubbles + fires the change handlers chart.js, websocket.js,
       command-palette.js, candle-countdown.js are all listening for. */
    tfSel.dispatchEvent(new Event('change', {
      bubbles: true
    }));
    syncActivePill();
  }
  function init() {
    const card = $(SELECTORS.card);
    if (!card) return; /* DOM not present — silently no-op */

    /* Initial sync */
    syncSymbol();
    syncPrice();
    syncActivePill();

    /* Pill click delegation — single listener on the pill root. */
    const pillRoot = $(SELECTORS.pillRoot);
    if (pillRoot) pillRoot.addEventListener('click', onPillClick);

    /* External symbol changes (e.g. user picks AAPL from dropdown). */
    const symbolSel = $(SELECTORS.symbolSelect);
    if (symbolSel) symbolSel.addEventListener('change', syncSymbol);

    /* External timeframe changes (command-palette, etc.) — re-mirror
       the active pill state when something else writes the select. */
    const tfSel = $(SELECTORS.timeframeSelect);
    if (tfSel) tfSel.addEventListener('change', syncActivePill);

    /* Live price updates — chart.js writes #currentPrice.textContent
       on every tick. MutationObserver mirrors into card. */
    const priceSrc = $(SELECTORS.priceSrc);
    if (priceSrc && typeof MutationObserver === 'function') {
      const mo = new MutationObserver(syncPrice);
      mo.observe(priceSrc, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    /* LIVE symbol — subscribe to the bot's 'price' WS frames so the
       card reflects whatever broker/symbol is actually active right
       now (SessionRouter's true active session, not the static
       dropdown). Falls back to dropdown via syncSymbol() if no
       OGZ.Socket is available yet. */
    function attachPriceHandler() {
      const ogz = typeof window !== 'undefined' && window.OGZ;
      const socket = ogz && (typeof ogz.get === 'function' ? ogz.get('Socket') : ogz.Socket);
      if (socket && typeof socket.registerHandler === 'function') {
        socket.registerHandler('price', d => {
          const data = d && d.data || d;
          syncSymbolFromPriceEvent(data);
        });
        return true;
      }
      return false;
    }
    if (!attachPriceHandler()) {
      /* OGZ.Socket may not be ready at first init() tick (script
         order). Retry briefly until it is. */
      const start = Date.now();
      const retry = setInterval(() => {
        if (attachPriceHandler() || Date.now() - start > 5000) {
          clearInterval(retry);
        }
      }, 100);
    }

    /* Delta % field is left as a placeholder for now — chart.js does
       not currently expose a 24h-change number, so we don't fabricate
       one. When that signal lands, this is the hook point:
         setDelta(pct) {
           dst.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
           dst.classList.toggle('profit', pct > 0);
           dst.classList.toggle('loss',   pct < 0);
         }
    */
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/asset-tf-card.js", error: String((e && e.message) || e) }); }

// public/js/panels/bot-intelligence.js
try { (() => {
/**
 * bot-intelligence.js - AI Strategy Visualization
 * Strategy Winner HUD with confidence bar chart
 *
 * LIVE-PARTIAL: Shows winner name + confidence from existing bot_thinking emission.
 * Full battleground bar chart requires strategy_stack in payload (future backend work).
 */
(function (OGZ) {
  'use strict';

  const Intelligence = {
    // Strategy Winner HUD
    updateWinnerHUD: function (data) {
      const display = document.getElementById('thoughtDisplay');
      if (!display) return;
      let strategyStackHTML = '';
      if (data.strategy_stack) {
        strategyStackHTML = `<div class="strategy-battleground" style="margin-top: 15px; border-top: 1px solid rgba(255,215,0,0.1); padding-top: 10px;">
                    <p style="font-size: 9px; color: var(--text-secondary); margin-bottom: 8px; letter-spacing: 1px;">STRATEGY BATTLEGROUND</p>`;
        data.strategy_stack.forEach(strat => {
          const isWinner = strat.id === data.winner_id;
          const barColor = isWinner ? 'var(--ml-color)' : '#333';
          strategyStackHTML += `
                        <div class="strat-row" style="margin-bottom: 6px;">
                            <div style="display: flex; justify-content: space-between; font-size: 11px;">
                                <span style="color: ${isWinner ? 'var(--ml-color)' : '#999'}; font-weight: ${isWinner ? '800' : '400'};">
                                    ${isWinner ? '>> ' : ''}${strat.name}
                                </span>
                                <span style="font-family: Orbitron;">${(strat.confidence * 100).toFixed(0)}%</span>
                            </div>
                            <div style="height: 2px; background: rgba(255,255,255,0.05); width: 100%; margin-top: 2px;">
                                <div style="height: 100%; width: ${strat.confidence * 100}%; background: ${barColor}; transition: width 0.4s ease-out;"></div>
                            </div>
                        </div>`;
        });
        strategyStackHTML += '</div>';
      }

      // Fallback for existing bot_thinking format (message + confidence only)
      const analysis = data.analysis || data.message || data.data?.reasoning || 'Analyzing...';
      const decision = data.decision || data.data?.module || 'HOLD';
      const confidence = data.confidence != null ? data.confidence > 1 ? data.confidence / 100 : data.confidence : 0;
      display.innerHTML = `
                <div class="thought-entry">
                    <p class="thought-step"><strong>Analysis:</strong> ${analysis}</p>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin: 10px 0;">
                        <span class="decision-badge ${decision.toLowerCase()}">${decision.toUpperCase()}</span>
                        <div style="text-align: right;">
                            <div style="font-size: 9px; color: #888;">TOTAL CONFIDENCE</div>
                            <div style="font-family: Orbitron; color: var(--ml-color); font-size: 18px;">${(confidence * 100).toFixed(1)}%</div>
                        </div>
                    </div>
                    ${strategyStackHTML}
                </div>`;
    }
  };
  OGZ.register('Intelligence', Intelligence);
})(window.OGZ);
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/bot-intelligence.js", error: String((e && e.message) || e) }); }

// public/js/panels/candle-countdown.js
try { (() => {
/**
 * candle-countdown.js — Candle Countdown Ring (Phase F)
 *
 * Compact SVG ring + digital m:ss label mounted inline with the timeframe
 * selector. Ticks down to the next candle close aligned to the selected
 * timeframe boundary. Drift-corrects from price.data.candle.time when that
 * server-authoritative bucket start is available. Dims to 45% on stale feed.
 *
 * Self-injects CSS; self-registers as OGZ.CandleCountdown.
 *
 * @module public/js/panels/candle-countdown
 */
(function (OGZ) {
  'use strict';

  const STYLE_ID = 'ogz-candle-countdown-styles';
  const ROOT_ID = 'candleCountdown';
  const TF_MS = {
    '1m': 60000,
    '5m': 300000,
    '15m': 900000,
    '30m': 1800000,
    '1h': 3600000,
    '4h': 14400000,
    '1d': 86400000
  };
  const RING_R = 10;
  const RING_C = 2 * Math.PI * RING_R;
  const state = {
    mounted: false,
    boundaryMs: 0,
    // Absolute timestamp the current bucket ends at
    lastTickAt: 0,
    // Last time we saw a price message
    tfKey: '15m',
    tickerId: null
  };

  // ─── Helpers ────────────────────────────────────────────────────────
  function currentTf() {
    const sel = document.getElementById('timeframeSelector');
    const v = sel ? String(sel.value || '').toLowerCase() : '15m';
    return TF_MS[v] ? v : '15m';
  }
  function tfMs() {
    return TF_MS[state.tfKey] || TF_MS['15m'];
  }
  function anchorWallClock() {
    const ms = tfMs();
    const now = Date.now();
    state.boundaryMs = Math.ceil(now / ms) * ms;
  }
  function anchorFromCandleStart(startMs) {
    // Server-authoritative bucket start → boundary = start + tfMs.
    const ms = tfMs();
    if (!isFinite(startMs) || startMs <= 0) return;
    state.boundaryMs = startMs + ms;
  }

  // ─── Style injection ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 2px 8px 2px 4px;
                background: rgba(0,0,0,0.35);
                border: 1px solid rgba(220, 38, 38, 0.25);
                border-radius: 999px;
                font-family: 'JetBrains Mono', 'Courier New', monospace;
                transition: opacity 0.25s ease;
                user-select: none;
            }
            #${ROOT_ID}.stale { opacity: 0.45; }
            #${ROOT_ID} .cc-ring-wrap {
                position: relative;
                width: 28px;
                height: 28px;
            }
            #${ROOT_ID} .cc-ring-track {
                fill: none;
                stroke: rgba(255,255,255,0.07);
                stroke-width: 2;
            }
            #${ROOT_ID} .cc-ring-fill {
                fill: none;
                stroke-width: 2;
                stroke-linecap: round;
                transform: rotate(-90deg);
                transform-origin: 50% 50%;
                stroke-dasharray: ${RING_C.toFixed(3)};
                stroke-dashoffset: 0;
                transition: stroke-dashoffset 0.28s linear, stroke 0.2s ease;
                stroke: #dc2626;
            }
            #${ROOT_ID}.warn .cc-ring-fill { stroke: #f59e0b; }
            #${ROOT_ID}.crit .cc-ring-fill { stroke: #ef4444; }
            #${ROOT_ID} .cc-label {
                font-size: 11px;
                color: #e4e4e7;
                letter-spacing: 0.06em;
                min-width: 28px;
                text-align: center;
            }
        `;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ─── Mount ──────────────────────────────────────────────────────────
  function mount() {
    if (state.mounted) return true;
    if (document.getElementById(ROOT_ID)) {
      state.mounted = true;
      return true;
    }
    const tfSel = document.getElementById('timeframeSelector');
    const host = tfSel && tfSel.parentNode || document.querySelector('.chart-controls');
    if (!host) return false;
    const span = document.createElement('span');
    span.id = ROOT_ID;
    span.innerHTML = `
            <span class="cc-ring-wrap">
                <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
                    <circle class="cc-ring-track" cx="14" cy="14" r="${RING_R}"></circle>
                    <circle class="cc-ring-fill"  cx="14" cy="14" r="${RING_R}"></circle>
                </svg>
            </span>
            <span class="cc-label">--:--</span>
        `;
    if (tfSel && tfSel.nextSibling && host === tfSel.parentNode) {
      host.insertBefore(span, tfSel.nextSibling);
    } else {
      host.appendChild(span);
    }
    state.mounted = true;
    return true;
  }

  // ─── Render tick ───────────────────────────────────────────────────
  function fmt(ms) {
    if (!isFinite(ms) || ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, '0')}`;
  }
  function renderTick() {
    if (!mount()) return;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const fill = root.querySelector('.cc-ring-fill');
    const label = root.querySelector('.cc-label');
    const total = tfMs();
    const now = Date.now();
    if (!state.boundaryMs || state.boundaryMs <= now) anchorWallClock();
    const remaining = Math.max(0, state.boundaryMs - now);
    const pct = total > 0 ? remaining / total : 0;

    // Ring — filled portion represents time remaining.
    if (fill) {
      const off = RING_C * (1 - pct);
      fill.setAttribute('stroke-dashoffset', off.toFixed(3));
    }
    if (label) label.textContent = fmt(remaining);
    root.classList.remove('warn', 'crit');
    if (pct <= 0.10) root.classList.add('crit');else if (pct <= 0.25) root.classList.add('warn');

    // Stale feed dim (>15s without a price tick)
    if (state.lastTickAt && now - state.lastTickAt > 15000) {
      root.classList.add('stale');
    } else if (state.lastTickAt) {
      root.classList.remove('stale');
    }
  }
  function startTicker() {
    if (state.tickerId) clearInterval(state.tickerId);
    state.tickerId = setInterval(renderTick, 300);
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const CandleCountdown = {
    init() {
      try {
        injectStyles();
        mount();
        state.tfKey = currentTf();
        anchorWallClock();
        const tfSel = document.getElementById('timeframeSelector');
        if (tfSel) {
          tfSel.addEventListener('change', () => {
            try {
              state.tfKey = currentTf();
              anchorWallClock();
              renderTick();
            } catch (_) {/* swallow */}
          });
        }
        const socket = OGZ.get && OGZ.get('Socket');
        if (socket && socket.registerHandler) {
          socket.registerHandler('price', d => {
            try {
              state.lastTickAt = Date.now();
              const candle = d && d.data && d.data.candle;
              // CandleProcessor sends candle.timestamp, not
              // candle.time (verified against
              // core/CandleProcessor.js:346-368). Read both
              // field names so drift correction fires whether
              // the broadcast uses the spec name (.time) or
              // the implementation name (.timestamp).
              // Without this, setInterval-based drift could
              // accumulate up to hours over a long session.
              const rawTime = candle ? isFinite(candle.time) ? candle.time : isFinite(candle.timestamp) ? candle.timestamp : null : null;
              if (rawTime != null) {
                const t = Number(rawTime);
                const ms = t > 1e12 ? t : t * 1000;
                anchorFromCandleStart(ms);
              }
            } catch (_) {/* swallow */}
          });
        }
        startTicker();
      } catch (_) {/* init must never throw */}
    }
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('CandleCountdown', CandleCountdown);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('CandleCountdown', CandleCountdown);
      }
    });
  }
  try {
    window.OGZCandleCountdown = CandleCountdown;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/candle-countdown.js", error: String((e && e.message) || e) }); }

// public/js/panels/celebration.js
try { (() => {
/**
 * celebration.js — OGZPrime Celebration & Visual Delight Module
 *
 * Autonomous celebration engine: listens for trade wins, high-confidence setups,
 * and strategic alignments, then triggers visual effects to delight the operator.
 *
 * Core features:
 *   - Money rain on profitable trade closes (>= 10% P&L)
 *   - Session cumulative P&L threshold (first time > 10% profit triggers rain once)
 *   - Cell flash + glow on high-confidence signals (confidence > 0.85)
 *   - Screen-edge pulse on trade entry execution
 *   - Strategy confluence glow when multiple strategies align
 *   - Customizable demo mode for testing (fires money rain every 8s)
 *
 * WebSocket subscriptions:
 *   - trade (event === 'close') with pnlPercent >= 10
 *   - bot_thinking (confidence > 0.85)
 *   - narrator_event (event === 'entry' or 'execution')
 *
 * Cooldowns prevent spam:
 *   - Money rain: max once per 30s
 *   - Cell flash: max twice per 5s
 *   - Confluence pulse: max once per 15s
 *
 * Public API:
 *   init() — boot, subscribe to events, create overlay container
 *   triggerMoneyRain(opts) — manual trigger. opts: { count, duration, char }
 *   triggerCellFlash(elementOrId, color) — flash element (gold/green/red)
 *   triggerStrategyAlignment(strategies) — N strategies aligned → edge pulse
 *   setEnabled(bool) — operator toggle for effect disable
 *   teardown() — clean up all DOM, timers, listeners
 *
 * NO Math.random anywhere. Particle layout uses deterministic index-based
 * spread. NO demo mode. Effects fire only on real WS events (real 10%+ wins,
 * real high-confidence narrator events).
 *
 * Self-registers as OGZ.Celebration via OGZ.register().
 * Creates overlay elements on demand, appends to document.body.
 * Self-injects fallback CSS (production styling moves to cyberpunk-polish.css later).
 *
 * @module public/js/panels/celebration
 */

(function (OGZ) {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────
  const MODULE_NAME = 'Celebration';
  const STYLE_ID = 'ogz-celebration-styles';
  const OVERLAY_ID = 'ogz-celebration-overlay';

  // Cooldown windows (ms)
  const MONEY_RAIN_COOLDOWN_MS = 30000;
  const CELL_FLASH_COOLDOWN_MS = 5000;
  const CONFLUENCE_COOLDOWN_MS = 15000;

  // Timing
  const DEFAULT_RAIN_COUNT = 80;
  const DEFAULT_RAIN_DURATION_MS = 4000;
  const DEFAULT_RAIN_CHARS = ['💰', '💵', '💸', '$'];
  // (DEMO_MODE_INTERVAL_MS removed — no demo mode, effects fire on real events only)

  // Color palette
  const COLORS = {
    gold: 'rgba(255, 215, 0, 0.8)',
    green: 'rgba(0, 255, 136, 0.8)',
    red: 'rgba(255, 51, 102, 0.8)'
  };

  // ─── Private State ──────────────────────────────────────────────────
  const state = {
    enabled: true,
    // (demoMode field removed — no demo path)
    mounted: false,
    // Cooldown tracking
    lastMoneyRainAt: 0,
    lastCellFlashAt: 0,
    lastConfluenceAt: 0,
    // Session P&L tracking
    sessionPnlThresholdTriggered: false,
    lastSessionStartAt: Date.now(),
    // DOM references
    overlay: null,
    // Active timers/intervals (for cleanup)
    timers: [],
    intervals: [],
    listeners: []
  };

  // ─── CSS Injection ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
            /* Money Rain Container */
            #${OVERLAY_ID} {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 9999;
            }

            /* Individual particle */
            .cb-money-particle {
                position: fixed;
                font-size: 24px;
                font-weight: bold;
                user-select: none;
                pointer-events: none;
            }

            /* Fall animation: gravity + horizontal drift */
            @keyframes cb-money-fall {
                0% {
                    opacity: 1;
                    transform: translateY(0) translateX(0) rotate(0deg);
                }
                100% {
                    opacity: 0;
                    transform: translateY(100vh) translateX(var(--drift)) rotate(360deg);
                }
            }

            /* Twinkle effect for particles */
            @keyframes cb-twinkle {
                0%, 100% {
                    opacity: 0.8;
                    text-shadow: none;
                }
                50% {
                    opacity: 1;
                    text-shadow: 0 0 6px rgba(255, 215, 0, 0.8);
                }
            }

            .cb-money-particle {
                animation: cb-money-fall var(--duration) linear forwards,
                           cb-twinkle var(--twinkle-duration) ease-in-out infinite;
            }

            /* Edge pulse vignette */
            @keyframes cb-edge-pulse {
                0% {
                    opacity: 0.6;
                    box-shadow: inset 0 0 60px rgba(255, 215, 0, 0.7),
                                inset 0 0 120px rgba(255, 215, 0, 0.4);
                }
                100% {
                    opacity: 0;
                    box-shadow: inset 0 0 0px rgba(255, 215, 0, 0),
                                inset 0 0 0px rgba(255, 215, 0, 0);
                }
            }

            .cb-edge-pulse {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                border: 2px solid rgba(255, 215, 0, 0.4);
                border-radius: 0;
                animation: cb-edge-pulse 0.8s ease-out forwards;
                z-index: 9998;
            }

            /* Cell flash effect (applied inline to element) */
            @keyframes cb-cell-flash {
                0% {
                    box-shadow: 0 0 0 rgba(255, 215, 0, 0.8);
                }
                50% {
                    box-shadow: 0 0 20px var(--flash-color);
                }
                100% {
                    box-shadow: 0 0 0 rgba(255, 215, 0, 0.8);
                }
            }

            .cb-cell-flash {
                animation: cb-cell-flash 0.6s ease-out forwards !important;
            }
        `;
    document.head.appendChild(style);
  }

  // ─── Overlay Container Setup ─────────────────────────────────────
  function ensureOverlay() {
    if (state.overlay) return state.overlay;
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    document.body.appendChild(overlay);
    state.overlay = overlay;
    return overlay;
  }

  // ─── Cooldown Check ─────────────────────────────────────────────
  function isInCooldown(lastTs, windowMs) {
    return Date.now() - lastTs < windowMs;
  }

  // ─── Money Rain ─────────────────────────────────────────────────
  /**
   * Spawn falling money particles across the viewport.
   * @param {Object} opts - Options
   * @param {number} [opts.count=80] - Number of particles
   * @param {number} [opts.duration=4000] - Fall duration in ms
   * @param {string[]} [opts.chars] - Characters to use (default: ['💰','💵','💸','$'])
   */
  function triggerMoneyRain(opts) {
    if (!state.enabled) return;
    opts = opts || {};
    const count = opts.count || DEFAULT_RAIN_COUNT;
    const duration = opts.duration || DEFAULT_RAIN_DURATION_MS;
    const chars = opts.chars || DEFAULT_RAIN_CHARS;
    const overlay = ensureOverlay();

    // Deterministic spread — NO Math.random. Particle visuals are derived
    // from the loop index so layout is reproducible and contains zero
    // synthetic randomness. (Cosmetic spread only; no data implications.)
    const vw = window.innerWidth;
    const charCount = chars.length || 1;
    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'cb-money-particle';

      // Character — cycle through provided chars by index
      particle.textContent = chars[i % charCount];

      // Horizontal position — evenly spread across viewport with a
      // half-step offset so adjacent rains don't visually pattern-match
      const xStart = (i + 0.5) / count * vw;

      // Horizontal drift — alternate left/right by index parity, scaled
      // by golden-ratio fraction for variety without random
      const driftStep = (i % 7 - 3) * 28; // -84..84 px range, deterministic
      const driftAmount = driftStep;

      // Fall duration — graduated from 2000ms..5000ms based on index
      const fallDuration = 2000 + Math.floor(i / Math.max(count, 1) * 3000);

      // Color alternation — even index gold, odd index green
      const color = i % 2 === 0 ? COLORS.gold : COLORS.green;

      // Twinkle duration — graduated 800..1200 by index modulo
      const twinkleDur = 800 + i * 41 % 401; // 41 is coprime with most counts → spread

      // Set CSS variables and position
      particle.style.setProperty('--duration', fallDuration + 'ms');
      particle.style.setProperty('--drift', driftAmount + 'px');
      particle.style.setProperty('--twinkle-duration', twinkleDur + 'ms');
      particle.style.left = xStart + 'px';
      particle.style.top = '-40px';
      particle.style.color = color;
      particle.style.textShadow = `0 0 4px ${color}`;
      overlay.appendChild(particle);

      // Auto-cleanup after animation ends
      const cleanupTimer = setTimeout(() => {
        particle.remove();
      }, fallDuration);
      state.timers.push(cleanupTimer);
    }
  }

  // ─── Cell Flash ─────────────────────────────────────────────────
  /**
   * Flash an element with a color glow.
   * @param {string|HTMLElement} elementOrId - Element or element ID
   * @param {string} [color='gold'] - Color: 'gold', 'green', or 'red'
   */
  function triggerCellFlash(elementOrId, color) {
    if (!state.enabled) return;
    let el = elementOrId;
    if (typeof elementOrId === 'string') {
      el = document.getElementById(elementOrId);
    }
    if (!el) return;
    color = color || 'gold';
    const colorMap = {
      gold: COLORS.gold,
      green: COLORS.green,
      red: COLORS.red
    };
    const colorValue = colorMap[color] || colorMap.gold;

    // Remove existing class to reset animation
    el.classList.remove('cb-cell-flash');

    // Trigger reflow to restart animation
    void el.offsetWidth;

    // Add flash class with color
    el.classList.add('cb-cell-flash');
    el.style.setProperty('--flash-color', colorValue);

    // Auto-remove class after animation
    const timer = setTimeout(() => {
      el.classList.remove('cb-cell-flash');
    }, 700);
    state.timers.push(timer);
  }

  // ─── Edge Pulse / Vignette ──────────────────────────────────────
  /**
   * Brief screen-edge gold pulse effect.
   */
  function triggerEdgePulse() {
    if (!state.enabled) return;
    const overlay = ensureOverlay();
    const pulse = document.createElement('div');
    pulse.className = 'cb-edge-pulse';
    overlay.appendChild(pulse);

    // Auto-remove after animation
    const timer = setTimeout(() => {
      pulse.remove();
    }, 900);
    state.timers.push(timer);
  }

  // ─── Event Handlers ─────────────────────────────────────────────

  /**
   * Handle trade event: close with pnlPercent >= 10 triggers money rain.
   */
  function onTradeEvent(data) {
    try {
      if (!state.enabled) return;

      // Trigger on close event with profit >= 10%
      if (data.event === 'close' && data.pnlPercent >= 10) {
        // Check cooldown
        if (!isInCooldown(state.lastMoneyRainAt, MONEY_RAIN_COOLDOWN_MS)) {
          triggerMoneyRain();
          state.lastMoneyRainAt = Date.now();
        }
      }
    } catch (err) {
      // Silent swallow
    }
  }

  /**
   * Handle bot_thinking event: confidence > 0.85 triggers cell flash.
   */
  function onBotThinkingEvent(data) {
    try {
      if (!state.enabled) return;
      const confidence = data.confidence || data.data && data.data.confidence;
      if (confidence != null && confidence > 0.85) {
        // Check cooldown (max twice per 5s)
        if (!isInCooldown(state.lastCellFlashAt, CELL_FLASH_COOLDOWN_MS)) {
          // Flash the confidence readout
          const confEl = document.getElementById('confidenceML');
          if (confEl) {
            triggerCellFlash(confEl, 'green');
          }

          // Also apply .is-high-confidence class for CSS animation
          const liveReadouts = document.getElementById('liveReadouts');
          if (liveReadouts) {
            liveReadouts.classList.add('is-high-confidence');
            const timer = setTimeout(() => {
              liveReadouts.classList.remove('is-high-confidence');
            }, 1500);
            state.timers.push(timer);
          }
          state.lastCellFlashAt = Date.now();
        }
      }
    } catch (err) {
      // Silent swallow
    }
  }

  /**
   * Handle narrator_event: entry/execution triggers trade-entry flash.
   */
  function onNarratorEvent(data) {
    try {
      if (!state.enabled) return;
      if (data.event === 'entry' || data.event === 'execution') {
        // Trigger edge pulse
        triggerEdgePulse();

        // Apply .is-trading-entry class to chart container
        const chart = document.getElementById('unifiedChart');
        if (chart) {
          chart.classList.add('is-trading-entry');
          const timer = setTimeout(() => {
            chart.classList.remove('is-trading-entry');
          }, 850);
          state.timers.push(timer);
        }
      }
    } catch (err) {
      // Silent swallow
    }
  }

  // ─── Public API ────────────────────────────────────────────────

  const Public = {
    /**
     * Initialize the celebration module.
     */
    init() {
      if (state.mounted) return;
      injectStyles();
      ensureOverlay();

      // Subscribe to WebSocket events
      const socket = OGZ.get('Socket');
      if (socket) {
        socket.registerHandler('trade', onTradeEvent);
        socket.registerHandler('bot_thinking', onBotThinkingEvent);
        socket.registerHandler('narrator_event', onNarratorEvent);
        state.listeners.push({
          type: 'trade',
          fn: onTradeEvent
        });
        state.listeners.push({
          type: 'bot_thinking',
          fn: onBotThinkingEvent
        });
        state.listeners.push({
          type: 'narrator_event',
          fn: onNarratorEvent
        });
      }
      state.mounted = true;
    },
    /**
     * Trigger money rain manually.
     * @param {Object} [opts] - Options { count, duration, chars }
     */
    triggerMoneyRain(opts) {
      triggerMoneyRain(opts);
    },
    /**
     * Trigger cell flash on an element.
     * @param {string|HTMLElement} elementOrId
     * @param {string} [color='gold']
     */
    triggerCellFlash(elementOrId, color) {
      triggerCellFlash(elementOrId, color);
    },
    /**
     * Trigger strategy alignment celebration.
     * @param {Array} strategies - Array of strategy objects (unused in v1, reserved for future)
     */
    triggerStrategyAlignment(strategies) {
      if (!state.enabled) return;

      // Check confluence cooldown
      if (!isInCooldown(state.lastConfluenceAt, CONFLUENCE_COOLDOWN_MS)) {
        triggerEdgePulse();

        // Apply .is-confluence class to strategy leaderboard
        const leaderboard = document.getElementById('strategyLeaderboard');
        if (leaderboard) {
          leaderboard.classList.add('is-confluence');
          const timer = setTimeout(() => {
            leaderboard.classList.remove('is-confluence');
          }, 1000);
          state.timers.push(timer);
        }
        state.lastConfluenceAt = Date.now();
      }
    },
    /**
     * Enable/disable all visual effects.
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
      state.enabled = !!enabled;
    },
    /**
     * Clean up all DOM, timers, listeners.
     */
    teardown() {
      // Clear timers
      state.timers.forEach(clearTimeout);
      state.timers = [];

      // Clear intervals
      state.intervals.forEach(clearInterval);
      state.intervals = [];

      // Remove overlay DOM
      if (state.overlay && state.overlay.parentNode) {
        state.overlay.parentNode.removeChild(state.overlay);
        state.overlay = null;
      }

      // Remove styles
      const styleEl = document.getElementById(STYLE_ID);
      if (styleEl && styleEl.parentNode) {
        styleEl.parentNode.removeChild(styleEl);
      }
      state.mounted = false;
      state.listeners = [];
    },
    /**
     * Debug: return current state snapshot.
     */
    _debug() {
      return {
        enabled: state.enabled,
        mounted: state.mounted,
        lastMoneyRainAt: state.lastMoneyRainAt,
        lastCellFlashAt: state.lastCellFlashAt,
        lastConfluenceAt: state.lastConfluenceAt,
        activeTimers: state.timers.length,
        activeIntervals: state.intervals.length
      };
    }
  };

  // Register with OGZ module system
  OGZ.register(MODULE_NAME, Public);
})(window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/celebration.js", error: String((e && e.message) || e) }); }

// public/js/panels/chart-panel.js
try { (() => {
/**
 * chart-panel.js — Self-Rendering Chart Module (Phase 5 Refactor)
 *
 * Refactored from public/js/chart.js. Converts the legacy DOM-binder into
 * a fully self-contained, modular panel that creates its own HTML scaffold
 * at mount time. The v2 shell no longer needs ~120 lines of inline chart HTML.
 *
 * Core Responsibility:
 *   - Self-injects the entire chart scaffold (header + controls + container + HUD + tooltips)
 *   - Initializes TradingView Lightweight Charts inside the self-created tvChartContainer
 *   - Manages 11 indicator overlays: EMA (3x), SMA (3x), Bollinger Bands (3x),
 *     VWAP, RSI, MACD, ATR, Ichimoku (4x), Trend Lines (2x), Fibonacci, Support/Resistance
 *   - Handles crosshair tooltip with OHLC readout + live price flash animation
 *   - Wires trade markers, drawing tools, asset/timeframe selectors, indicator toggles
 *   - Subscribes to WS events: price, candle, historical_candles, trade, etc.
 *   - Preserves all behavior from legacy chart.js (ghost projections, liquidity TPO, volume alpha)
 *
 * EXTRACTION SOURCE:
 *   Refactored from public/js/chart.js lines 1-1090. All functionality preserved:
 *   - TradingView Lightweight Charts API unchanged
 *   - IndicatorAdapter.js integration preserved
 *   - drawing-tools.js wiring unchanged (chart instance exposed as window.OGZ_chart)
 *   - Volume gradient opacity (98th percentile cap, alpha envelope)
 *   - Candle outlier clipping (2nd/98th percentile, dynamic padding)
 *   - RSI 70/30 bands with proper price line cleanup
 *   - Layout rebalance on oscillator toggle (candle 80%/20% → 60%/20%/20% split)
 *
 * Public API:
 *   - init() / mount() / renderScaffold() / initChart() — lifecycle
 *   - teardown() — explicit cleanup (listeners, timers, subscriptions, RSI bands)
 *   - setSymbol(symbol) — change asset, refetch historical
 *   - setTimeframe(tf) — change timeframe, refetch historical
 *   - setChartType(type) — candlestick / line / area / bar
 *   - toggleIndicator(indicatorName, enabled) — show/hide overlay
 *   - addTradeMarker(price, time, side) — place marker at price/time
 *   - clearMarkers() — remove all trade markers
 *   - _compute() — debug helper returning internal state
 *
 * Mount Contract:
 *   Expects <div id="chartPanel"></div> to exist in the page DOM.
 *   At init(), the module creates all child elements inside chartPanel:
 *     - chart-header (with selectors, indicator checkboxes)
 *     - chart-container (tvChartContainer, crosshairTooltip, chartHud, tradeTooltip, feedStatusPill)
 *
 * Teardown:
 *   destroy() unwinds: all WS handlers, event listeners, timers, ResizeObserver,
 *   cached DOM refs, RSI price lines, TradingView chart instance.
 *
 * WS Subscriptions:
 *   - 'price': live tick updates, price flash, HUD readout
 *   - 'candle': per-timeframe candle updates (OHLCV)
 *   - 'historical_candles': batch load on asset/timeframe change
 *   - 'trade': add markers to chart for executed trades
 *   - 'state_update': open positions (for trade side coloring)
 *   - 'projection_path': ghost projections overlay (ML path)
 *   - 'depth_update': TPO/wall rendering (dormant, gate-guarded)
 *
 * Self-registers as OGZ.ChartPanel via OGZ.register('ChartPanel', ...).
 * LEGACY COMPAT: Exposes window.OGZ_chart for drawing-tools.js access.
 *
 * @module public/js/panels/chart-panel
 */
(function (OGZ) {
  'use strict';

  // ─── Module-Scoped State ──────────────────────────────────────────────
  // Every identifier is module-private. Chart instance + series exposed via
  // public API. DOM refs cached after mount for hot-path performance.
  let tvChart, candleSeries, volumeSeries, ghostSeries;
  let tpoLines = [],
    wallLines = [];

  // Indicator overlay series
  let ema20Series, ema50Series, ema200Series;
  let bbUpperSeries, bbMiddleSeries, bbLowerSeries;
  let vwapSeries, sma20Series, sma50Series, sma200Series;
  let rsiOverlaySeries, macdLineSeries, macdSignalSeries, atrSeries;
  let activeOverlays = [];
  let storedCandles = [];

  // Cached hot-path DOM refs (resolved once at mount)
  let _cachedPriceEl = null;
  let _cachedHudPrice = null;
  let _cachedHudOhlc = null;
  let _cachedTooltipEl = null;
  let _loadedAsset = null;

  // Teardown tracking
  const _trackedListeners = [];
  const _trackedTimers = new Set();
  let _trackedVisibleRangeCB = null;
  let _trackedRsiSeries = null;

  // Trade markers (by time+action+price key)
  let tradeMarkers = new Map();
  // Per-time-second context map for hover tooltips
  // Key: candle-time seconds (integer). Value: Array of trade contexts at that time.
  const tradeMarkerData = new Map();
  // Floating marker tooltip element (created lazily)
  let _markerTooltipEl = null;
  let _hoveredMarkerTime = null;

  // ─── Oscillator Panes (stacked multi-pane system) ───────────────────
  // Each oscillator (volume, rsi, macd, atr) can be toggled to appear as
  // its OWN LightweightCharts instance stacked below the main candle pane.
  // Every active pane is time-axis + crosshair synced to the main chart.
  // v4 has no native panes — each pane is a separate createChart() instance.
  //
  // _oscPanes: registry keyed by 'volume'|'rsi'|'macd'|'atr'. Each entry:
  //   { container, chart, series, rangeCB, crosshairCB, resizeObserver }
  // where `series` is an object whose values are the pane's series
  // (volume/rsi/atr have one; macd has { macd, signal }).
  // _oscSyncing is a SINGLE re-entrance guard shared across all panes.
  const OSC_PANE_LS_KEY = 'ogz.chartPanel.oscPanes'; // JSON array of active keys
  const OSC_PANE_ORDER = ['volume', 'rsi', 'macd', 'atr'];
  let _oscPanes = {}; // key -> pane entry (see above)
  let _oscSyncing = false; // re-entrance guard for time-axis sync (shared)
  let _oscMainRangeCB = null; // single main-chart range sub feeding all panes

  // ─── Constants ─────────────────────────────────────────────────────────
  const STYLE_ID = 'ogz-chart-panel-styles';
  const ROOT_ID = 'chartPanel';
  const MIN_AUTOSCALE_SAMPLE = 10;
  const RESCALE_THROTTLE_MS = 80;
  const PRICE_FLASH_MS = 180;
  const MIN_INDICATOR_CANDLES = 30;
  const MIN_VOLUME_STATS_CANDLES = 20;
  const VOL_CAP_PCTILE = 0.98;
  const VOL_ALPHA_FLOOR = 0.25;
  const VOL_ALPHA_RANGE = 0.55;
  const VOL_LIVE_ALPHA_DEFAULT = 0.5;
  const VOL_LIVE_HEADROOM = 1.15;
  const CANDLE_PCTILE_LOW = 0.02;
  const CANDLE_PCTILE_HIGH = 0.98;
  const CANDLE_PAD_RATIO = 0.05;
  const PRICE_FLASH_CLASS = 'ogz-chart-panel-price-flash';
  const TF_SECONDS = {
    '1s': 1,
    '5s': 5,
    '15s': 15,
    '30s': 30,
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '2h': 7200,
    '4h': 14400,
    '6h': 21600,
    '12h': 43200,
    '1d': 86400
  };
  const DEFAULT_SYMBOL = 'TSLA';
  const DEFAULT_TIMEFRAME = '1m';
  function normalizeDashboardSymbol(symbol) {
    const raw = String(symbol || '').trim().toUpperCase();
    if (!raw) return '';
    const dashed = raw.replace(/^XBT/, 'BTC').replace(/\//g, '-');
    if (dashed === 'BTC' || dashed === 'ETH' || dashed === 'SOL') return `${dashed}-USD`;
    return dashed;
  }
  function selectedAssetSymbol() {
    try {
      const root = document.getElementById(ROOT_ID);
      const selector = root && root.querySelector ? root.querySelector('#cp-assetSelector') : null;
      return normalizeDashboardSymbol(selector && selector.value ? selector.value : DEFAULT_SYMBOL);
    } catch (_) {
      return normalizeDashboardSymbol(DEFAULT_SYMBOL);
    }
  }
  function payloadSymbol(payload) {
    if (!payload) return '';
    const data = payload.data && typeof payload.data === 'object' ? payload.data : null;
    const candle = payload.candle && typeof payload.candle === 'object' ? payload.candle : null;
    return normalizeDashboardSymbol(payload.symbol || payload.asset || data && (data.symbol || data.asset) || candle && (candle.symbol || candle.asset));
  }
  function payloadMatchesSelectedAsset(payload) {
    const incoming = payloadSymbol(payload);
    if (!incoming) return false;
    return incoming === selectedAssetSymbol();
  }

  // ─── CSS Injection (Fallback) ──────────────────────────────────────────
  (function injectFlashStyle() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('ogz-chart-panel-flash-style')) return;
    const s = document.createElement('style');
    s.id = 'ogz-chart-panel-flash-style';
    s.textContent = '.' + PRICE_FLASH_CLASS + '{transition:color 0.08s ease,text-shadow 0.08s ease;}';
    if (document.head) document.head.appendChild(s);
  })();

  // ─── Trade Marker Tooltip CSS ──────────────────────────────────────────
  (function injectMarkerTooltipStyle() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('ogz-chart-marker-tip-style')) return;
    const s = document.createElement('style');
    s.id = 'ogz-chart-marker-tip-style';
    s.textContent = `
            .ogz-chart-marker-tip {
                position: absolute;
                background: rgba(10, 10, 16, 0.96);
                border: 1px solid rgba(255, 215, 0, 0.35);
                border-radius: 6px;
                padding: 8px 12px;
                color: #e6e6e6;
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                line-height: 1.45;
                pointer-events: none;
                z-index: 9550;
                box-shadow: 0 10px 26px rgba(0, 0, 0, 0.55),
                            0 0 0 1px rgba(255, 255, 255, 0.04) inset;
                max-width: 280px;
                opacity: 0;
                transform: translateY(-2px);
                transition: opacity 120ms, transform 120ms;
                white-space: nowrap;
            }
            .ogz-chart-marker-tip.show { opacity: 1; transform: translateY(0); }
            .ogz-chart-marker-tip .tip-head {
                font-size: 10px;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: rgba(255, 215, 0, 0.85);
                margin-bottom: 4px;
                font-weight: 700;
            }
            .ogz-chart-marker-tip .tip-pnl-pos { color: #22c55e; font-weight: 700; }
            .ogz-chart-marker-tip .tip-pnl-neg { color: #ef4444; font-weight: 700; }
            .ogz-chart-marker-tip .tip-meta {
                color: rgba(255, 255, 255, 0.55);
                font-size: 10px;
                margin-top: 4px;
            }
            .ogz-chart-marker-tip .tip-hint {
                font-size: 9px;
                color: rgba(255, 215, 0, 0.5);
                margin-top: 6px;
                letter-spacing: 0.5px;
            }

            /* Oscillator pane (opt-in split) */
            .cp-osc-toggle {
                cursor: pointer;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.12);
                color: rgba(255, 255, 255, 0.85);
                transition: background 150ms, border-color 150ms;
            }
            .cp-osc-toggle:hover {
                background: rgba(255, 215, 0, 0.08);
                border-color: rgba(255, 215, 0, 0.35);
            }
            .cp-osc-toggle.active {
                background: rgba(255, 215, 0, 0.16);
                border-color: rgba(255, 215, 0, 0.55);
                color: #ffd700;
            }
            .cp-osc-pane {
                width: 100%;
                height: 120px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                background: var(--bg, #0a0a0a);
                position: relative;
                margin-top: 4px;
            }
            /* Only the last stacked pane gets the rounded bottom corners */
            .cp-osc-pane:last-child {
                border-radius: 0 0 6px 6px;
            }
            .cp-osc-pane + .cp-osc-pane {
                margin-top: 0;
            }
            .cp-osc-label {
                position: absolute;
                top: 4px;
                left: 8px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 9px;
                color: rgba(255, 255, 255, 0.4);
                letter-spacing: 1px;
                text-transform: uppercase;
                pointer-events: none;
                z-index: 2;
            }
        `;
    if (document.head) document.head.appendChild(s);
  })();

  // ─── Marker Tooltip Helpers ────────────────────────────────────────────
  function ensureMarkerTooltip() {
    if (_markerTooltipEl) return _markerTooltipEl;
    const container = document.getElementById('tvChartContainer') || document.body;
    const el = document.createElement('div');
    el.className = 'ogz-chart-marker-tip';
    container.appendChild(el);
    _markerTooltipEl = el;
    return el;
  }
  function renderMarkerTooltipContent(contexts) {
    // contexts: Array of trade contexts at the same candle-time.
    // Most cases one entry, but in tight markets there could be entry + exit
    // at the same candle.
    if (!contexts || !contexts.length) return '';
    const fmtTime = ms => {
      const d = new Date(ms);
      return d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    };
    return contexts.map(c => {
      const sideText = c.isEntry ? `${c.direction === 'short' ? 'SHORT' : 'LONG'} entry @ $${c.price.toFixed(2)}` : `${c.direction === 'short' ? 'COVER' : 'SELL'} @ $${c.price.toFixed(2)}`;
      let pnlLine = '';
      if (c.isClose) {
        const sign = c.pnl >= 0 ? '+' : '';
        const cls = c.pnl >= 0 ? 'tip-pnl-pos' : 'tip-pnl-neg';
        pnlLine = `<div><span class="${cls}">${sign}$${Math.abs(c.pnl).toFixed(2)}</span></div>`;
      }
      let metaBits = [];
      if (c.strategy) metaBits.push(`strat: ${c.strategy}`);
      if (c.pattern) metaBits.push(`pattern: ${c.pattern}`);
      if (c.confidence != null) metaBits.push(`conf: ${Number(c.confidence).toFixed(0)}%`);
      if (c.duration) metaBits.push(`held: ${c.duration}`);
      const metaStr = metaBits.length ? `<div class="tip-meta">${metaBits.join(' · ')}</div>` : '';
      return `
                <div class="tip-head">${c.isEntry ? 'ENTRY' : 'EXIT'} · ${fmtTime(c.tsMs)}</div>
                <div>${sideText}</div>
                ${pnlLine}
                ${metaStr}
                <div class="tip-hint">click marker to replay</div>
            `;
    }).join('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:6px 0;">');
  }
  function showMarkerTooltipAt(point, contexts) {
    if (!point || !contexts || !contexts.length) return;
    const el = ensureMarkerTooltip();
    const container = document.getElementById('tvChartContainer');
    if (!container) return;
    el.innerHTML = renderMarkerTooltipContent(contexts);

    // Position relative to chart container
    const rect = container.getBoundingClientRect();
    const tipW = 240; // approximate
    const tipH = 90;
    let x = point.x + 18;
    let y = point.y - tipH - 10;
    if (x + tipW > rect.width) x = point.x - tipW - 18;
    if (y < 4) y = point.y + 18;
    el.style.left = Math.max(4, x) + 'px';
    el.style.top = Math.max(4, y) + 'px';
    el.classList.add('show');
  }
  function hideMarkerTooltip() {
    if (_markerTooltipEl) _markerTooltipEl.classList.remove('show');
    _hoveredMarkerTime = null;
  }

  // ─── Helper: Track & Cleanup Listeners ─────────────────────────────────
  function trackListener(target, type, handler) {
    for (let i = 0; i < _trackedListeners.length; i++) {
      const e = _trackedListeners[i];
      if (e.target === target && e.type === type && e.handler === handler) return;
    }
    target.addEventListener(type, handler);
    _trackedListeners.push({
      target,
      type,
      handler
    });
  }
  function trackTimer(id) {
    _trackedTimers.add(id);
    return id;
  }

  // ─── Helper: RSI Band Removal ──────────────────────────────────────────
  function removeRsiBands(chartInstance) {
    const rsiSeries = chartInstance && chartInstance._rsiOverlaySeries || _trackedRsiSeries;
    if (!rsiSeries) return;
    if (chartInstance && chartInstance._rsiBand70) {
      try {
        rsiSeries.removePriceLine(chartInstance._rsiBand70);
      } catch (e) {/* swallow */}
      chartInstance._rsiBand70 = null;
    }
    if (chartInstance && chartInstance._rsiBand30) {
      try {
        rsiSeries.removePriceLine(chartInstance._rsiBand30);
      } catch (e) {/* swallow */}
      chartInstance._rsiBand30 = null;
    }
  }

  // ─── Helper: Visible Slice (Autoscale Clipping) ────────────────────────
  function visibleSlice() {
    if (!storedCandles.length) return [];
    try {
      const lr = tvChart.timeScale().getVisibleLogicalRange();
      if (lr && lr.from != null && lr.to != null) {
        const from = Math.max(0, Math.floor(lr.from));
        const to = Math.min(storedCandles.length - 1, Math.ceil(lr.to));
        if (to > from) return storedCandles.slice(from, to + 1);
      }
    } catch (e) {
      /* swallow */
    }
    return storedCandles;
  }

  // ─── Helper: Current Bucket Size ───────────────────────────────────────
  function currentBucketSeconds() {
    const root = document.getElementById(ROOT_ID);
    const tf = root ? root.querySelector('#cp-timeframeSelector')?.value : DEFAULT_TIMEFRAME;
    return TF_SECONDS[tf || DEFAULT_TIMEFRAME] || 60;
  }

  // ─── Helper: Oscillator-Pane Persistence ───────────────────────────────
  // OSC_PANE_LS_KEY stores a JSON array of active pane keys. When the key is
  // absent (first-ever load / new feature) the VOLUME pane defaults ON.
  function readSavedOscPanes() {
    try {
      const raw = localStorage.getItem(OSC_PANE_LS_KEY);
      if (raw == null) return ['volume']; // default: volume split ON
      // Back-compat: the key used to hold a '1'/'0' flag.
      if (raw === '1') return ['volume'];
      if (raw === '0') return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return ['volume'];
      return arr.filter(k => OSC_PANE_ORDER.indexOf(k) !== -1);
    } catch (e) {
      return ['volume'];
    }
  }
  function persistOscPanes() {
    try {
      const active = OSC_PANE_ORDER.filter(k => !!_oscPanes[k]);
      localStorage.setItem(OSC_PANE_LS_KEY, JSON.stringify(active));
    } catch (e) {/* swallow */}
  }

  // ─── Helper: Per-Oscillator Pane Spec ──────────────────────────────────
  // Describes how to build each oscillator's aux-pane series.
  const OSC_PANE_SPEC = {
    volume: {
      label: 'VOLUME',
      build: function (chart) {
        const s = chart.addHistogramSeries({
          color: '#26a69a',
          priceFormat: {
            type: 'volume'
          },
          priceScaleId: 'right'
        });
        return {
          volume: s
        };
      }
    },
    rsi: {
      label: 'RSI 14',
      build: function (chart) {
        const s = chart.addLineSeries({
          color: '#ec4899',
          lineWidth: 1.5,
          title: 'RSI',
          priceScaleId: 'right',
          priceFormat: {
            type: 'custom',
            minMove: 1,
            formatter: v => v.toFixed(0)
          },
          lastValueVisible: false,
          priceLineVisible: false,
          // Fixed 0-100 RSI scale
          autoscaleInfoProvider: () => ({
            priceRange: {
              minValue: 0,
              maxValue: 100
            }
          })
        });
        // 70 / 30 guide lines
        try {
          s.createPriceLine({
            price: 70,
            color: 'rgba(239,68,68,0.45)',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: '70'
          });
          s.createPriceLine({
            price: 30,
            color: 'rgba(34,197,94,0.45)',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: '30'
          });
        } catch (e) {/* swallow */}
        return {
          rsi: s
        };
      }
    },
    macd: {
      label: 'MACD 12/26/9',
      build: function (chart) {
        const macd = chart.addLineSeries({
          color: '#8b5cf6',
          lineWidth: 1.5,
          title: 'MACD',
          priceScaleId: 'right',
          lastValueVisible: false,
          priceLineVisible: false
        });
        const signal = chart.addLineSeries({
          color: '#fbbf24',
          lineWidth: 1,
          title: 'Signal',
          priceScaleId: 'right',
          lastValueVisible: false,
          priceLineVisible: false
        });
        return {
          macd: macd,
          signal: signal
        };
      }
    },
    atr: {
      label: 'ATR 14',
      build: function (chart) {
        const s = chart.addLineSeries({
          color: '#f59e0b',
          lineWidth: 1,
          title: 'ATR',
          priceScaleId: 'right',
          lastValueVisible: false,
          priceLineVisible: false
        });
        return {
          atr: s
        };
      }
    }
  };

  // ─── Helper: Recompute & Feed Oscillator Panes ─────────────────────────
  // Recompute RSI/MACD/ATR from the given candle array and push the result
  // into whichever oscillator panes are currently active. Volume is fed
  // separately by the caller (it already has the colored volData on hand).
  function feedOscIndicatorPanes(candles) {
    if (!candles || candles.length < MIN_INDICATOR_CANDLES) return;
    const haveRsi = _oscPanes['rsi'] && _oscPanes['rsi'].series && _oscPanes['rsi'].series.rsi;
    const haveMacd = _oscPanes['macd'] && _oscPanes['macd'].series;
    const haveAtr = _oscPanes['atr'] && _oscPanes['atr'].series && _oscPanes['atr'].series.atr;
    if (!haveRsi && !haveMacd && !haveAtr) return;
    const Ind = OGZ.get('Indicators');
    if (!Ind) return;
    const closes = candles.map(c => c.close);
    const times = candles.map(c => c.time);
    const mapSeries = values => values.map((v, i) => v != null ? {
      time: times[i],
      value: v
    } : null).filter(Boolean);
    try {
      if (haveRsi) {
        _oscPanes['rsi'].series.rsi.setData(mapSeries(Ind.calculateRSI(closes, 14)));
      }
      if (haveAtr) {
        _oscPanes['atr'].series.atr.setData(mapSeries(Ind.calculateATR(candles, 14)));
      }
      if (haveMacd) {
        const macd = Ind.calculateMACD(closes);
        if (_oscPanes['macd'].series.macd) _oscPanes['macd'].series.macd.setData(mapSeries(macd.macd));
        if (_oscPanes['macd'].series.signal) _oscPanes['macd'].series.signal.setData(mapSeries(macd.signal));
      }
    } catch (e) {/* swallow */}
  }

  // ─── Helper: Render Scaffold HTML ─────────────────────────────────────
  function renderScaffold() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return false;
    root.innerHTML = '';
    root.className = 'cp-root';

    // Header with selectors & indicator checkboxes
    const header = document.createElement('div');
    header.className = 'cp-header';
    const titleContainer = document.createElement('div');
    titleContainer.className = 'cp-title-container';
    const title = document.createElement('h2');
    title.className = 'cp-title';
    title.id = 'chartTitle';
    title.textContent = 'ML VERSION';
    title.style.display = 'none';
    const priceDisplay = document.createElement('span');
    priceDisplay.className = 'cp-price-display';
    priceDisplay.id = 'currentPrice';
    priceDisplay.textContent = '$0.00';
    titleContainer.appendChild(title);
    titleContainer.appendChild(priceDisplay);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'cp-controls';
    const chartTypeSelector = document.createElement('select');
    chartTypeSelector.id = 'cp-chartTypeSelector';
    chartTypeSelector.className = 'cp-selector';
    chartTypeSelector.innerHTML = `
            <option value="candlestick" selected>Candlestick</option>
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="bar">Bar</option>
        `;
    const assetSelector = document.createElement('select');
    assetSelector.id = 'cp-assetSelector';
    assetSelector.className = 'cp-selector';
    assetSelector.innerHTML = `
            <optgroup label="Crypto (Kraken)">
                <option value="BTC-USD">Bitcoin (BTC)</option>
                <option value="ETH-USD">Ethereum (ETH)</option>
            </optgroup>
            <optgroup label="Stocks (Alpaca)">
                <option value="TSLA" selected>Tesla (TSLA)</option>
                <option value="NVDA">NVIDIA (NVDA)</option>
                <option value="SPY">S&P 500 (SPY)</option>
                <option value="QQQ">Nasdaq 100 (QQQ)</option>
                <option value="COIN">Coinbase (COIN)</option>
                <option value="MARA">Marathon (MARA)</option>
                <option value="RIOT">Riot Platforms (RIOT)</option>
            </optgroup>
        `;
    // #48: selector now covers every watchlist ticker the backend serves —
    // watchlist DEFAULT_TICKERS = TSLA,NVDA,SPY,QQQ,COIN,MARA,RIOT (Alpaca)
    // + BTC,ETH (Kraken). stock-data-adapter STOCK_TICKERS confirms all
    // seven stocks are supported. Previously only TSLA/NVDA/SPY were
    // options, so clicking QQQ/COIN/MARA/RIOT in the watchlist hit
    // switchAsset's unknown-symbol guard and silently did nothing.

    const timeframeSelector = document.createElement('select');
    timeframeSelector.id = 'cp-timeframeSelector';
    timeframeSelector.className = 'cp-selector';
    timeframeSelector.innerHTML = `
            <option value="1m" selected>1M</option>
            <option value="5m">5M</option>
            <option value="15m">15M</option>
            <option value="30m">30M</option>
            <option value="1h">1H</option>
            <option value="4h">4H</option>
            <option value="1d">1D</option>
        `;
    controls.appendChild(chartTypeSelector);
    controls.appendChild(assetSelector);
    controls.appendChild(timeframeSelector);

    // Oscillator-pane toggle button (opt-in pane split)
    const oscToggle = document.createElement('button');
    oscToggle.id = 'cp-oscToggle';
    oscToggle.className = 'cp-selector cp-osc-toggle';
    oscToggle.type = 'button';
    oscToggle.textContent = 'Volume Split';
    oscToggle.title = 'Toggle the volume oscillator pane (volume in its own row below the chart)';
    oscToggle.addEventListener('click', () => {
      try {
        if (_oscPanes['volume']) {
          ChartPanel.removeOscPane('volume');
        } else {
          ChartPanel.addOscPane('volume');
        }
      } catch (e) {/* swallow */}
    });
    controls.appendChild(oscToggle);

    // Indicator checkboxes
    const indicatorCheckboxes = document.createElement('div');
    indicatorCheckboxes.id = 'cp-indicatorCheckboxes';
    indicatorCheckboxes.className = 'cp-indicator-checkboxes';
    const indicatorConfigs = [{
      value: 'ema',
      label: 'EMA',
      color: '#fbbf24'
    }, {
      value: 'sma',
      label: 'SMA',
      color: '#60a5fa'
    }, {
      value: 'bollinger',
      label: 'Bollinger Bands',
      color: '#a78bfa'
    }, {
      value: 'atr',
      label: 'ATR',
      color: '#f59e0b'
    }, {
      value: 'fibonacci',
      label: 'Fibonacci',
      color: '#9900ff'
    }, {
      value: 'trendlines',
      label: 'Trend Lines',
      color: '#00ff00'
    }, {
      value: 'rsi',
      label: 'RSI',
      color: '#ec4899'
    }, {
      value: 'macd',
      label: 'MACD',
      color: '#8b5cf6'
    }, {
      value: 'vwap',
      label: 'VWAP',
      color: '#e879f9'
    }, {
      value: 'ichimoku',
      label: 'Ichimoku',
      color: '#06b6d4'
    }, {
      value: 'sr',
      label: 'Support/Resistance',
      color: '#ff9900'
    }];
    indicatorConfigs.forEach(config => {
      const label = document.createElement('label');
      label.className = 'cp-indicator-check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = config.value;
      const dot = document.createElement('span');
      dot.className = 'cp-color-dot';
      dot.style.backgroundColor = config.color;
      const text = document.createElement('span');
      text.textContent = config.label;
      label.appendChild(checkbox);
      label.appendChild(dot);
      label.appendChild(text);
      indicatorCheckboxes.appendChild(label);
    });
    header.appendChild(titleContainer);
    header.appendChild(controls);
    header.appendChild(indicatorCheckboxes);

    // Chart container
    const container = document.createElement('div');
    container.className = 'cp-container';
    const tvChartContainer = document.createElement('div');
    tvChartContainer.id = 'tvChartContainer';
    tvChartContainer.className = 'cp-tv-chart-container';
    const tradeTooltip = document.createElement('div');
    tradeTooltip.id = 'tradeTooltip';
    tradeTooltip.className = 'cp-trade-tooltip';
    tradeTooltip.style.display = 'none';
    const tooltipContent = document.createElement('div');
    tooltipContent.id = 'tooltipContent';
    tradeTooltip.appendChild(tooltipContent);
    const crosshairTooltip = document.createElement('div');
    crosshairTooltip.id = 'crosshairTooltip';
    crosshairTooltip.className = 'cp-crosshair-tooltip';
    crosshairTooltip.style.display = 'none';
    const feedStatusPill = document.createElement('div');
    feedStatusPill.id = 'feedStatusPill';
    feedStatusPill.className = 'cp-feed-status-pill';
    feedStatusPill.style.display = 'none';
    feedStatusPill.textContent = 'Bot offline - waiting for feed';
    const chartHud = document.createElement('div');
    chartHud.id = 'chartHud';
    chartHud.className = 'cp-chart-hud';
    chartHud.style.visibility = 'hidden';
    const hudPrice = document.createElement('div');
    hudPrice.id = 'chartHudPrice';
    hudPrice.className = 'cp-hud-price';
    hudPrice.style.display = 'none';
    const hudOhlc = document.createElement('div');
    hudOhlc.id = 'chartHudOhlc';
    hudOhlc.className = 'cp-hud-ohlc';
    hudOhlc.textContent = 'O 0.00  H 0.00  L 0.00  C 0.00';
    chartHud.appendChild(hudPrice);
    chartHud.appendChild(hudOhlc);
    container.appendChild(tvChartContainer);
    container.appendChild(tradeTooltip);
    container.appendChild(crosshairTooltip);
    container.appendChild(feedStatusPill);
    container.appendChild(chartHud);
    root.appendChild(header);
    root.appendChild(container);
    return true;
  }

  // ─── Main Chart Initialization ─────────────────────────────────────────
  function initChart() {
    const container = document.getElementById('tvChartContainer');
    if (!container) return false;

    // Cache hot-path DOM refs
    _cachedPriceEl = document.getElementById('currentPrice');
    _cachedHudPrice = document.getElementById('chartHudPrice');
    _cachedHudOhlc = document.getElementById('chartHudOhlc');
    _cachedTooltipEl = document.getElementById('crosshairTooltip');
    if (_cachedPriceEl) _cachedPriceEl.classList.add(PRICE_FLASH_CLASS);
    if (_cachedHudPrice) _cachedHudPrice.classList.add(PRICE_FLASH_CLASS);
    tvChart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: {
          color: '#0a0a0a'
        },
        textColor: '#d1d4dc'
      },
      grid: {
        vertLines: {
          color: 'rgba(255,255,255,0.06)'
        },
        horzLines: {
          color: 'rgba(255,255,255,0.06)'
        }
      },
      crosshair: {
        mode: 0,
        vertLine: {
          color: 'rgba(220, 38, 38, 0.45)'
        },
        horzLine: {
          color: 'rgba(220, 38, 38, 0.45)'
        }
      },
      timeScale: {
        rightOffset: 12,
        timeVisible: true,
        secondsVisible: false
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true
      },
      handleScale: {
        mouseWheel: false,
        pinch: true,
        axisPressedMouseMove: true,
        axisDoubleClickReset: true
      }
    });

    // Candlestick series
    candleSeries = tvChart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      autoscaleInfoProvider: baseImpl => {
        try {
          const base = baseImpl();
          const slice = visibleSlice();
          if (slice.length < MIN_AUTOSCALE_SAMPLE) return base;
          const lows = slice.map(c => c.low).sort((a, b) => a - b);
          const highs = slice.map(c => c.high).sort((a, b) => a - b);
          const loIdx = Math.max(0, Math.floor(lows.length * CANDLE_PCTILE_LOW));
          const hiIdx = Math.min(highs.length - 1, Math.ceil(highs.length * CANDLE_PCTILE_HIGH) - 1);
          const pLow = lows[loIdx];
          const pHigh = highs[hiIdx];
          if (!(pLow < pHigh)) return base;
          const pad = (pHigh - pLow) * CANDLE_PAD_RATIO;
          return {
            priceRange: {
              minValue: pLow - pad,
              maxValue: pHigh + pad
            },
            margins: base?.margins || {
              above: 10,
              below: 20
            }
          };
        } catch (e) {
          return baseImpl();
        }
      }
    });

    // Volume series
    volumeSeries = tvChart.addHistogramSeries({
      priceScaleId: 'vol',
      color: '#26a69a',
      priceFormat: {
        type: 'volume'
      },
      autoscaleInfoProvider: baseImpl => {
        try {
          const base = baseImpl();
          const slice = visibleSlice();
          const vols = slice.map(c => Number(c.volume || 0)).filter(v => v > 0).sort((a, b) => a - b);
          if (vols.length < MIN_AUTOSCALE_SAMPLE) return base;
          const capIdx = Math.min(vols.length - 1, Math.ceil(vols.length * VOL_CAP_PCTILE) - 1);
          const cap = vols[capIdx];
          if (!(cap > 0)) return base;
          return {
            priceRange: {
              minValue: 0,
              maxValue: cap * VOL_LIVE_HEADROOM
            },
            margins: base?.margins || {
              above: 10,
              below: 0
            }
          };
        } catch (e) {
          return baseImpl();
        }
      }
    });
    tvChart.priceScale('vol').applyOptions({
      drawTicks: false,
      borderVisible: false
    });
    tvChart.priceScale('right').applyOptions({
      borderVisible: false
    });

    // Ghost series for projections
    ghostSeries = tvChart.addLineSeries({
      color: 'rgba(0, 255, 255, 0.4)',
      lineWidth: 2,
      lineStyle: 3,
      priceLineVisible: false
    });

    // Indicator overlay series
    ema20Series = tvChart.addLineSeries({
      color: '#fbbf24',
      lineWidth: 1.5,
      visible: false,
      title: 'EMA20',
      lastValueVisible: false,
      priceLineVisible: false
    });
    ema50Series = tvChart.addLineSeries({
      color: '#22d3ee',
      lineWidth: 1.5,
      visible: false,
      title: 'EMA50',
      lastValueVisible: false,
      priceLineVisible: false
    });
    ema200Series = tvChart.addLineSeries({
      color: '#a78bfa',
      lineWidth: 2,
      visible: false,
      title: 'EMA200',
      lastValueVisible: false,
      priceLineVisible: false
    });
    bbUpperSeries = tvChart.addLineSeries({
      color: 'rgba(255,255,255,0.35)',
      lineWidth: 1,
      visible: false,
      lineStyle: 2,
      lastValueVisible: false,
      priceLineVisible: false
    });
    bbMiddleSeries = tvChart.addLineSeries({
      color: 'rgba(255,255,255,0.55)',
      lineWidth: 1,
      visible: false,
      lastValueVisible: false,
      priceLineVisible: false
    });
    bbLowerSeries = tvChart.addLineSeries({
      color: 'rgba(255,255,255,0.35)',
      lineWidth: 1,
      visible: false,
      lineStyle: 2,
      lastValueVisible: false,
      priceLineVisible: false
    });
    vwapSeries = tvChart.addLineSeries({
      color: '#e879f9',
      lineWidth: 2,
      visible: false,
      title: 'VWAP',
      lastValueVisible: false,
      priceLineVisible: false
    });
    sma20Series = tvChart.addLineSeries({
      color: '#60a5fa',
      lineWidth: 1,
      visible: false,
      title: 'SMA20',
      lastValueVisible: false,
      priceLineVisible: false
    });
    sma50Series = tvChart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 1,
      visible: false,
      title: 'SMA50',
      lastValueVisible: false,
      priceLineVisible: false
    });
    sma200Series = tvChart.addLineSeries({
      color: '#1d4ed8',
      lineWidth: 2,
      visible: false,
      title: 'SMA200',
      lastValueVisible: false,
      priceLineVisible: false
    });

    // Oscillator series — RSI/MACD/ATR are NO LONGER drawn on the main
    // price chart (fix #42). They now live in their own stacked aux panes
    // (see OSC_PANE_SPEC / addOscPane). These main-chart series are kept
    // DECLARED-but-permanently-hidden to keep the diff focused; nothing
    // makes them visible and nothing feeds them anymore. A later cleanup
    // will excise them entirely.
    rsiOverlaySeries = tvChart.addLineSeries({
      color: '#ec4899',
      lineWidth: 1.5,
      visible: false,
      title: 'RSI',
      priceScaleId: 'rsi',
      priceFormat: {
        type: 'custom',
        formatter: v => v.toFixed(0)
      },
      lastValueVisible: false,
      priceLineVisible: false
    });
    tvChart.priceScale('rsi').applyOptions({
      visible: false,
      borderVisible: false
    });
    _trackedRsiSeries = rsiOverlaySeries;
    ChartPanel._rsiOverlaySeries = rsiOverlaySeries;
    macdLineSeries = tvChart.addLineSeries({
      color: '#8b5cf6',
      lineWidth: 1.5,
      visible: false,
      title: 'MACD',
      priceScaleId: 'macd',
      lastValueVisible: false,
      priceLineVisible: false
    });
    macdSignalSeries = tvChart.addLineSeries({
      color: '#fbbf24',
      lineWidth: 1,
      visible: false,
      title: 'Signal',
      priceScaleId: 'macd',
      lastValueVisible: false,
      priceLineVisible: false
    });
    tvChart.priceScale('macd').applyOptions({
      visible: false,
      borderVisible: false
    });
    atrSeries = tvChart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 1,
      visible: false,
      title: 'ATR',
      priceScaleId: 'atr',
      lastValueVisible: false,
      priceLineVisible: false
    });
    tvChart.priceScale('atr').applyOptions({
      visible: false,
      borderVisible: false
    });

    // Ichimoku
    ChartPanel._ichiTenkan = tvChart.addLineSeries({
      color: '#06b6d4',
      lineWidth: 1,
      visible: false,
      title: 'Tenkan',
      lastValueVisible: false,
      priceLineVisible: false
    });
    ChartPanel._ichiKijun = tvChart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 1,
      visible: false,
      title: 'Kijun',
      lastValueVisible: false,
      priceLineVisible: false
    });
    ChartPanel._ichiSenkouA = tvChart.addLineSeries({
      color: 'rgba(34,197,94,0.45)',
      lineWidth: 1,
      visible: false,
      title: 'Senkou A',
      lastValueVisible: false,
      priceLineVisible: false
    });
    ChartPanel._ichiSenkouB = tvChart.addLineSeries({
      color: 'rgba(239,68,68,0.45)',
      lineWidth: 1,
      visible: false,
      title: 'Senkou B',
      lastValueVisible: false,
      priceLineVisible: false
    });

    // Trend lines
    ChartPanel._trendResistance = tvChart.addLineSeries({
      color: '#ef4444',
      lineWidth: 2,
      visible: false,
      lineStyle: 0,
      lastValueVisible: false,
      priceLineVisible: false
    });
    ChartPanel._trendSupport = tvChart.addLineSeries({
      color: '#22c55e',
      lineWidth: 2,
      visible: false,
      lineStyle: 0,
      lastValueVisible: false,
      priceLineVisible: false
    });

    // Fibonacci & S/R price lines
    ChartPanel._fibLines = [];
    ChartPanel._srLines = [];

    // Apply initial layout
    ChartPanel._applyLayout();

    // Visible-range rescale listener
    let _rescaleTimer = null;
    _trackedVisibleRangeCB = () => {
      if (_rescaleTimer) return;
      _rescaleTimer = trackTimer(setTimeout(() => {
        _trackedTimers.delete(_rescaleTimer);
        _rescaleTimer = null;
        try {
          tvChart.priceScale('right').applyOptions({});
          tvChart.priceScale('vol').applyOptions({});
        } catch (e) {
          /* swallow */
        }
      }, RESCALE_THROTTLE_MS));
    };
    tvChart.timeScale().subscribeVisibleLogicalRangeChange(_trackedVisibleRangeCB);

    // Crosshair tooltip
    const tooltipEl = _cachedTooltipEl;
    tvChart.subscribeCrosshairMove(param => {
      const priceEl = _cachedPriceEl;
      const candleData = param.seriesData ? param.seriesData.get(candleSeries) : null;
      if (priceEl) {
        if (!param.time || !candleData) {
          priceEl.textContent = `$${OGZ.state.lastPrice.toLocaleString()}`;
        } else {
          priceEl.textContent = `O:${candleData.open.toFixed(2)} H:${candleData.high.toFixed(2)} L:${candleData.low.toFixed(2)} C:${candleData.close.toFixed(2)}`;
        }
      }
      if (!tooltipEl) return;
      if (!param.time || !candleData || !param.point) {
        tooltipEl.style.display = 'none';
        return;
      }
      const ts = (typeof param.time === 'number' ? param.time : param.time.timestamp || 0) * 1000;
      const dateStr = new Date(ts).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const priceAt = candleSeries.coordinateToPrice(param.point.y);
      const dir = candleData.close >= candleData.open ? '#22c55e' : '#ef4444';
      while (tooltipEl.firstChild) tooltipEl.removeChild(tooltipEl.firstChild);
      const dateRow = document.createElement('div');
      dateRow.style.cssText = 'color:#888;font-size:10px;letter-spacing:0.5px;';
      dateRow.textContent = dateStr;
      tooltipEl.appendChild(dateRow);
      const priceRow = document.createElement('div');
      priceRow.style.cssText = 'font-family:Orbitron,monospace;font-size:13px;font-weight:700;margin-top:2px;color:' + dir;
      priceRow.textContent = priceAt != null && typeof priceAt === 'number' ? '$' + priceAt.toFixed(2) : '--';
      tooltipEl.appendChild(priceRow);
      const ohlcRow = document.createElement('div');
      ohlcRow.style.cssText = 'color:#aaa;font-size:10px;margin-top:4px;font-family:monospace;';
      const oh = document.createElement('div');
      const ll = document.createElement('div');
      oh.textContent = 'O ' + Number(candleData.open).toFixed(2) + '   H ' + Number(candleData.high).toFixed(2);
      ll.textContent = 'L ' + Number(candleData.low).toFixed(2) + '   C ' + Number(candleData.close).toFixed(2);
      ohlcRow.appendChild(oh);
      ohlcRow.appendChild(ll);
      tooltipEl.appendChild(ohlcRow);
      const containerRect = container.getBoundingClientRect();
      const tipW = 150,
        tipH = 78;
      let x = param.point.x + 18;
      let y = param.point.y + 18;
      if (x + tipW > containerRect.width) x = param.point.x - tipW - 18;
      if (y + tipH > containerRect.height) y = param.point.y - tipH - 18;
      tooltipEl.style.left = Math.max(4, x) + 'px';
      tooltipEl.style.top = Math.max(4, y) + 'px';
      tooltipEl.style.display = 'block';

      // ─── Trade Marker Tooltip ──────────────────────────────────
      // Check if the hovered candle-time has any trade markers attached.
      // If yes, show the rich trade-context floating tooltip with the
      // entry/exit details, P&L, strategy, pattern, confidence.
      try {
        const candleTime = typeof param.time === 'number' ? param.time : param.time && param.time.timestamp;
        if (candleTime != null && tradeMarkerData.has(candleTime)) {
          if (_hoveredMarkerTime !== candleTime) {
            _hoveredMarkerTime = candleTime;
            showMarkerTooltipAt(param.point, tradeMarkerData.get(candleTime));
          }
        } else if (_hoveredMarkerTime != null) {
          hideMarkerTooltip();
        }
      } catch (e) {/* swallow */}
    });

    // ─── Click Handler — open Trade Replay on marker click ─────────
    try {
      tvChart.subscribeClick(param => {
        try {
          if (!param || !param.time) return;
          const candleTime = typeof param.time === 'number' ? param.time : param.time && param.time.timestamp;
          if (candleTime == null || !tradeMarkerData.has(candleTime)) return;
          const contexts = tradeMarkerData.get(candleTime);
          if (!contexts || !contexts.length) return;
          // Prefer the close (exit) marker — that's what TradeReplay expects
          const target = contexts.find(c => c.isClose) || contexts[0];
          const tr = OGZ && typeof OGZ.get === 'function' ? OGZ.get('TradeReplay') : null;
          if (tr && typeof tr.openReplay === 'function') {
            tr.openReplay({
              symbol: document.getElementById('cp-assetSelector')?.value || 'ASSET',
              side: target.direction,
              entry: target.isEntry ? target.price : target.metadata?.entryPrice ?? target.price,
              exit: target.isClose ? target.price : null,
              entryTs: target.tsMs,
              exitTs: target.isClose ? target.tsMs : null,
              pnl: target.pnl,
              pnlPercent: null,
              strategy: target.strategy,
              pattern: target.pattern,
              confidence: target.confidence,
              indicatorsAtEntry: target.indicators,
              narratorLines: target.narratorText ? [target.narratorText] : []
            });
          }
        } catch (_) {/* swallow */}
      });
    } catch (_) {/* subscribeClick missing in older lightweight-charts versions — swallow */}

    // Expose for legacy drawing-tools.js
    window.OGZ_chart = tvChart;
    window.tvChart = tvChart;
    window.candleSeries = candleSeries;

    // Bind control events
    ChartPanel.bindControls();

    // Resize handlers
    trackListener(window, 'resize', () => {
      if (tvChart && container) {
        tvChart.resize(container.clientWidth, container.clientHeight);
      }
    });
    if (typeof ResizeObserver !== 'undefined') {
      ChartPanel._chartResizeObserver = new ResizeObserver(() => {
        if (tvChart && container) {
          tvChart.resize(container.clientWidth, container.clientHeight);
        }
      });
      try {
        ChartPanel._chartResizeObserver.observe(container);
      } catch (e) {
        /* swallow */
      }
    }

    // Unload handler
    trackListener(window, 'beforeunload', () => {
      try {
        ChartPanel.teardown();
      } catch (e) {
        /* swallow */
      }
    });
    return true;
  }

  // ─── WS Wiring State ──────────────────────────────────────────────────
  let _wsBootstrapped = false;
  let _wsBootstrapTimer = null;
  let _entryPriceLine = null;
  let _stopPriceLine = null;
  let _targetPriceLine = null;
  let _lastPositionState = null;
  let _noDataWatchdogTimer = null; // fix #42: timeframe-change "no data" watchdog
  let _pendingAssetHistoryTimer = null;

  // Auto-bootstrap historical candles + supplemental WS subscriptions.
  // Core.js routes price/historical_candles/pattern_analysis/depth_update to
  // ChartPanel.update/loadHistorical/plotGhost/renderLiquidity already, but it
  // does NOT route: (a) the initial request_historical handshake, (b) `delta`
  // sub-tick flashes, (c) `trade` markers, (d) `state_update` position lines.
  // Those four are wired here directly against the real socket.registerHandler.
  function bootstrapWS(rootEl) {
    if (_wsBootstrapped) return;
    const socket = OGZ.get('Socket');
    if (!socket || typeof socket.registerHandler !== 'function') {
      // Socket not registered yet — poll once a frame for up to 10s
      _wsBootstrapTimer = trackTimer(setTimeout(() => bootstrapWS(rootEl), 250));
      return;
    }
    _wsBootstrapped = true;

    // (a) Initial historical load.
    //
    // Historical candles are requested directly by asset/timeframe. The
    // backend must answer this contract without a client-side asset-swap
    // kick; changing the selected asset just to provoke a response can
    // mislabel candles while multiple symbols/brokers are visible.
    try {
      const sym = rootEl?.querySelector('#cp-assetSelector')?.value || DEFAULT_SYMBOL;
      const tf = rootEl?.querySelector('#cp-timeframeSelector')?.value || DEFAULT_TIMEFRAME;
      if (typeof socket.send === 'function') {
        socket.send({
          type: 'asset_change',
          asset: sym
        });
        socket.send({
          type: 'request_historical',
          timeframe: tf,
          asset: sym,
          limit: 500
        });
        _loadedAsset = sym;
      }
    } catch (e) {/* swallow */}

    // (b) `delta` — sub-tick {price, volume, timestamp} from
    // DashboardBroadcaster.broadcastEdgeAnalytics(). Used to keep the HUD
    // price color/flash alive between full `price` ticks. Bot shape:
    //   { type:'delta', tick:{ price, volume, timestamp } }
    socket.registerHandler('delta', d => {
      try {
        if (!ChartPanel.isSelectedAssetPayload(d)) return;
        const tick = d && d.tick ? d.tick : d || {};
        const p = Number(tick.price);
        if (!isFinite(p) || p <= 0) return;
        // Update only the HUD readout (chart series stays on real candle ticks)
        const priceEl = _cachedPriceEl;
        if (priceEl) {
          const prev = OGZ.state.lastPrice || p;
          OGZ.state.lastPriceDelta = p - prev;
          OGZ.state.lastPrice = p;
          const up = OGZ.state.lastPriceDelta >= 0;
          priceEl.textContent = `$${p.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}`;
          priceEl.style.color = up ? '#22c55e' : '#ef4444';
          priceEl.style.textShadow = up ? '0 0 12px rgba(34,197,94,0.75)' : '0 0 12px rgba(239,68,68,0.75)';
        }
      } catch (e) {/* swallow */}
    });

    // (c) `trade` — bot OrderExecutor broadcast. Real shape:
    //   { type:'trade', action:'BUY'|'SELL', direction:'long'|'short',
    //     price, pnl, timestamp, confidence }
    // Drop a marker line at the executed price.
    socket.registerHandler('trade', d => {
      try {
        const data = d && d.data ? d.data : d;
        if (!data || !isFinite(Number(data.price)) || Number(data.price) <= 0) return;
        if (!ChartPanel.isSelectedAssetPayload(data)) return;
        // Pass the FULL trade payload so the marker carries all the
        // white-box context (action, direction, pnl, confidence,
        // pattern, strategy, duration) for hover-tooltip rendering.
        ChartPanel.addTradeMarker(data);
      } catch (e) {/* swallow */}
    });

    // (d) `state_update` — StateManager.broadcastToDashboard. Real shape:
    //   { type:'state_update', source, updates, context,
    //     state:{ position, balance, totalBalance, realizedPnL,
    //             unrealizedPnL, totalPnL, tradeCount, dailyTradeCount,
    //             recoveryMode }, timestamp }
    // Maintain entry/stop/target price lines while a position is open.
    socket.registerHandler('state_update', d => {
      try {
        const s = d && d.state ? d.state : {};
        const pos = s.position;
        _lastPositionState = pos || null;

        // Strip stale lines whenever position absent or flat
        const stripLine = line => {
          if (!line || !candleSeries) return null;
          try {
            candleSeries.removePriceLine(line);
          } catch (e) {/* swallow */}
          return null;
        };
        if (!pos || pos === 'flat' || pos === 'FLAT' || typeof pos === 'object' && (pos.size === 0 || !pos.entryPrice)) {
          _entryPriceLine = stripLine(_entryPriceLine);
          _stopPriceLine = stripLine(_stopPriceLine);
          _targetPriceLine = stripLine(_targetPriceLine);
          return;
        }
        if (typeof pos !== 'object' || !candleSeries) return;
        const entry = Number(pos.entryPrice || pos.entry || pos.avgPrice);
        const stop = Number(pos.stopLoss || pos.stop || 0);
        const targ = Number(pos.takeProfit || pos.target || 0);
        const isLong = String(pos.direction || pos.side || '').toLowerCase() === 'long' || pos === 'long' || pos === 'LONG';
        if (isFinite(entry) && entry > 0) {
          _entryPriceLine = stripLine(_entryPriceLine);
          _entryPriceLine = candleSeries.createPriceLine({
            price: entry,
            color: isLong ? 'rgba(34,197,94,0.85)' : 'rgba(239,68,68,0.85)',
            lineWidth: 2,
            lineStyle: 0,
            axisLabelVisible: true,
            title: 'ENTRY ' + (isLong ? 'L' : 'S')
          });
        }
        if (isFinite(stop) && stop > 0) {
          _stopPriceLine = stripLine(_stopPriceLine);
          _stopPriceLine = candleSeries.createPriceLine({
            price: stop,
            color: 'rgba(239,68,68,0.55)',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'STOP'
          });
        }
        if (isFinite(targ) && targ > 0) {
          _targetPriceLine = stripLine(_targetPriceLine);
          _targetPriceLine = candleSeries.createPriceLine({
            price: targ,
            color: 'rgba(34,197,94,0.55)',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'TGT'
          });
        }
      } catch (e) {/* swallow */}
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────
  const ChartPanel = {
    /**
     * Initialize: render scaffold, create chart, wire controls,
     * bootstrap WS subscriptions (historical, delta, trade, state_update).
     * Safe to call multiple times (idempotent).
     */
    init: function () {
      try {
        if (!renderScaffold()) return;
        if (!initChart()) return;
        bootstrapWS(document.getElementById(ROOT_ID));

        // Restore oscillator-pane set from last session. The volume pane
        // defaults ON when the key is absent (requested default). Defer
        // to next frame so the main chart finishes initial layout before
        // we add siblings that trigger resize.
        try {
          const keys = readSavedOscPanes();
          if (keys.length) {
            requestAnimationFrame(() => {
              keys.forEach(k => {
                try {
                  ChartPanel.addOscPane(k, true);
                } catch (e) {/* swallow */}
                // Keep the indicator checkbox UI coherent: an
                // rsi/macd/atr pane restored from LS should show
                // its checkbox ticked (volume is the Split button).
                if (k === 'rsi' || k === 'macd' || k === 'atr') {
                  try {
                    const root = document.getElementById(ROOT_ID);
                    const chk = root && root.querySelector('#cp-indicatorCheckboxes input[value="' + k + '"]');
                    if (chk) {
                      chk.checked = true;
                      if (activeOverlays.indexOf(k) === -1) activeOverlays.push(k);
                    }
                  } catch (e) {/* swallow */}
                }
              });
              try {
                ChartPanel._applyLayout();
              } catch (e) {/* swallow */}
            });
          }
        } catch (e) {/* swallow */}

        // ─── FIX #41: subscribe to watchlist:select ──────────────
        // Clicking a watchlist ticker emits {symbol, broker}. Switch
        // the chart by reusing the same asset-switch sequence the
        // #cp-assetSelector dropdown uses.
        try {
          if (OGZ && OGZ.bus && typeof OGZ.bus.on === 'function') {
            OGZ.bus.on('watchlist:select', payload => {
              try {
                const sym = payload && payload.symbol ? String(payload.symbol) : typeof payload === 'string' ? payload : null;
                if (sym) ChartPanel.switchAsset(sym);
              } catch (e) {/* swallow */}
            });
          }
        } catch (e) {/* swallow */}
      } catch (e) {
        /* swallow */
      }
    },
    /**
     * Apply layout for the stacked oscillator-pane system.
     *
     * Oscillators (RSI/MACD/ATR/volume) now each live in their OWN aux
     * LightweightCharts instance (separate DOM panes below the main chart),
     * so they no longer share the main chart's price scales. This method:
     *   - keeps the main chart's `right`/`vol` scales sized correctly
     *     (the in-chart `vol` histogram strip is hidden whenever the
     *     volume pane is split out, so the price scale can use full height)
     *   - divides the aux-pane DOM heights evenly across whatever
     *     oscillator panes are currently active.
     *
     * Accepts no argument; reads `_oscPanes` directly. The legacy boolean
     * arg is ignored for back-compat with any stray caller.
     */
    _applyLayout: function () {
      if (!tvChart) return;
      const volSplitOut = !!_oscPanes['volume'];
      try {
        if (volSplitOut) {
          // Volume lives in its own pane — give the price chart full height.
          tvChart.priceScale('right').applyOptions({
            scaleMargins: {
              top: 0.1,
              bottom: 0.06
            }
          });
          tvChart.priceScale('vol').applyOptions({
            scaleMargins: {
              top: 0.999,
              bottom: 0
            }
          });
        } else {
          // Volume rides inside the main chart as a bottom strip.
          tvChart.priceScale('right').applyOptions({
            scaleMargins: {
              top: 0.1,
              bottom: 0.1
            }
          });
          tvChart.priceScale('vol').applyOptions({
            scaleMargins: {
              top: 0.8,
              bottom: 0
            }
          });
        }
      } catch (e) {/* swallow */}

      // Divide vertical space across the active aux panes. Each pane is a
      // fixed-height DOM block; we scale that height down as more panes
      // stack so the price chart keeps a reasonable share.
      try {
        const activeKeys = OSC_PANE_ORDER.filter(k => !!_oscPanes[k]);
        const n = activeKeys.length;
        if (n > 0) {
          // #49: oscillator panes were too short to read — with all
          // 4 active each was ~90px, unusable even on a large monitor.
          // Raised the floor so each pane stays legible: 1 → 160px,
          // otherwise 480/n floored at 130px (2 → 240, 3 → 160, 4 → 130).
          const perPane = n <= 1 ? 160 : Math.max(130, Math.round(480 / n));
          activeKeys.forEach(k => {
            const entry = _oscPanes[k];
            if (entry && entry.container) {
              entry.container.style.height = perPane + 'px';
              if (entry.chart) {
                try {
                  entry.chart.resize(entry.container.clientWidth, perPane);
                } catch (e) {/* swallow */}
              }
            }
          });
        }
        // Main chart shares the remaining space — let its ResizeObserver
        // pick up the flex re-layout.
        const mainContainer = document.getElementById('tvChartContainer');
        if (mainContainer) {
          try {
            tvChart.resize(mainContainer.clientWidth, mainContainer.clientHeight);
          } catch (e) {/* swallow */}
        }
      } catch (e) {/* swallow */}
    },
    /**
     * Bind control events (selectors, checkboxes, etc.).
     */
    bindControls: function () {
      const root = document.getElementById(ROOT_ID);
      if (!root) return;

      // Chart type selector
      const chartType = root.querySelector('#cp-chartTypeSelector');
      if (chartType) trackListener(chartType, 'change', e => {
        const type = e.target.value;
        if (this._lineSeries) this._lineSeries.applyOptions({
          visible: false
        });
        if (this._areaSeries) this._areaSeries.applyOptions({
          visible: false
        });
        if (this._barSeries) this._barSeries.applyOptions({
          visible: false
        });
        if (type === 'candlestick') {
          candleSeries.applyOptions({
            visible: true
          });
        } else {
          candleSeries.applyOptions({
            visible: false
          });
          let data = [];
          try {
            data = candleSeries.data ? candleSeries.data() : [];
          } catch (err) {}
          if (type === 'line') {
            if (!this._lineSeries) this._lineSeries = tvChart.addLineSeries({
              color: '#22c55e',
              lineWidth: 2
            });
            if (data.length) this._lineSeries.setData(data.map(d => ({
              time: d.time,
              value: d.close
            })));
            this._lineSeries.applyOptions({
              visible: true
            });
          } else if (type === 'area') {
            if (!this._areaSeries) this._areaSeries = tvChart.addAreaSeries({
              topColor: 'rgba(34, 197, 94, 0.4)',
              bottomColor: 'rgba(34, 197, 94, 0.0)',
              lineColor: '#22c55e',
              lineWidth: 2
            });
            if (data.length) this._areaSeries.setData(data.map(d => ({
              time: d.time,
              value: d.close
            })));
            this._areaSeries.applyOptions({
              visible: true
            });
          } else if (type === 'bar') {
            if (!this._barSeries) this._barSeries = tvChart.addBarSeries({
              upColor: '#22c55e',
              downColor: '#ef4444'
            });
            if (data.length) this._barSeries.setData(data);
            this._barSeries.applyOptions({
              visible: true
            });
          }
        }
      });

      // Asset selector — delegate to the shared switchAsset() sequence
      // so the dropdown and the watchlist:select bus event (fix #41)
      // share ONE code path.
      const assetSel = root.querySelector('#cp-assetSelector');
      if (assetSel) trackListener(assetSel, 'change', e => {
        this.switchAsset(e.target.value);
      });

      // Timeframe selector — fix #42: do NOT call clearAll() preemptively.
      // The incoming `historical_candles` handler (loadHistorical) does a
      // full setData() replace, so blanking the chart first only risks a
      // silent black void if the response is slow/empty. Instead we arm a
      // ~5s watchdog that surfaces a visible "No data" message.
      const tfSel = root.querySelector('#cp-timeframeSelector');
      if (tfSel) trackListener(tfSel, 'change', e => {
        const socket = OGZ.get('Socket');
        if (socket) {
          socket.send({
            type: 'timeframe_change',
            timeframe: e.target.value
          });
          socket.send({
            type: 'request_historical',
            timeframe: e.target.value,
            asset: root.querySelector('#cp-assetSelector')?.value || DEFAULT_SYMBOL,
            limit: 500
          });
          this._armNoDataWatchdog();
        }
      });

      // Indicator checkboxes
      const checkboxContainer = root.querySelector('#cp-indicatorCheckboxes');
      if (checkboxContainer) {
        checkboxContainer.querySelectorAll('input[type="checkbox"]').forEach(chk => {
          trackListener(chk, 'change', () => {
            activeOverlays = [];
            checkboxContainer.querySelectorAll('input:checked').forEach(c => activeOverlays.push(c.value));
            this.toggleIndicators(activeOverlays);
            if (storedCandles.length > 0) this.calculateIndicators(storedCandles);
          });
        });
      }
    },
    /**
     * Switch the chart to a new asset/symbol (fix #41).
     *
     * This is the SINGLE asset-switch code path, shared by:
     *   - the #cp-assetSelector dropdown 'change' handler, and
     *   - the OGZ.bus 'watchlist:select' subscription.
     *
     * Sequence (identical to the legacy dropdown behavior):
     *   1. send `asset_change`
     *   2. clearAll() — blank the chart
     *   3. after 500ms, send `request_historical` for the new asset
     *
     * Guards: if `symbol` is not a valid <option> of #cp-assetSelector,
     * the call is ignored. Keeps the dropdown's `.value` in sync so the
     * UI reflects the active symbol regardless of how the switch began.
     */
    switchAsset: function (symbol) {
      const root = document.getElementById(ROOT_ID);
      if (!root) return;
      const assetSel = root.querySelector('#cp-assetSelector');
      if (!assetSel) return;
      let sym = String(symbol || '').trim();
      if (!sym) return;

      // #48: the watchlist emits BARE symbols ('BTC', 'ETH', 'TSLA'...).
      // Stock symbols already equal the selector option values; crypto in
      // the selector uses the server's required '-USD' form (verified via
      // live socket — the server's asset_change accepts 'BTC-USD' and
      // returns nothing for bare 'BTC'). So if the bare symbol is not a
      // valid option, try its '-USD' form before giving up.
      const optionExists = v => Array.prototype.some.call(assetSel.options, opt => opt.value === v);
      if (!optionExists(sym) && optionExists(sym + '-USD')) {
        sym = sym + '-USD';
      }
      if (!optionExists(sym)) return; // genuinely unknown symbol — ignore

      if (_loadedAsset === sym) return;
      const socket = OGZ.get('Socket');
      if (!socket || typeof socket.send !== 'function') {
        console.warn('[ChartPanel] asset_change skipped: socket unavailable', {
          asset: sym
        });
        return;
      }
      try {
        socket.send({
          type: 'asset_change',
          asset: sym
        });
        _loadedAsset = sym;
        assetSel.value = sym;
      } catch (e) {
        console.warn('[ChartPanel] asset_change send failed', {
          asset: sym,
          error: e && e.message ? e.message : e
        });
        return;
      }
      this.clearAll();
      if (_pendingAssetHistoryTimer) {
        clearTimeout(_pendingAssetHistoryTimer);
        _trackedTimers.delete(_pendingAssetHistoryTimer);
        _pendingAssetHistoryTimer = null;
      }
      const tid = setTimeout(() => {
        _trackedTimers.delete(tid);
        if (_pendingAssetHistoryTimer === tid) _pendingAssetHistoryTimer = null;
        const tf = root.querySelector('#cp-timeframeSelector')?.value || DEFAULT_TIMEFRAME;
        try {
          socket.send({
            type: 'request_historical',
            timeframe: tf,
            asset: sym,
            limit: 500
          });
        } catch (e) {
          console.warn('[ChartPanel] request_historical send failed', {
            asset: sym,
            error: e && e.message ? e.message : e
          });
        }
      }, 500);
      _pendingAssetHistoryTimer = trackTimer(tid);
    },
    /**
     * Arm a watchdog after a timeframe change (fix #42). If no
     * `historical_candles` arrive within ~5s, surface a visible
     * "No data for this timeframe" message instead of a silent void.
     * loadHistorical() clears the watchdog on the next data arrival.
     */
    _armNoDataWatchdog: function () {
      this._clearNoDataWatchdog();
      const tid = setTimeout(() => {
        _trackedTimers.delete(tid);
        _noDataWatchdogTimer = null;
        try {
          const pill = document.getElementById('feedStatusPill');
          if (pill) {
            pill.textContent = 'No data for this timeframe';
            pill.style.display = 'block';
          }
        } catch (e) {/* swallow */}
      }, 5000);
      _noDataWatchdogTimer = tid;
      trackTimer(tid);
    },
    /**
     * Clear the no-data watchdog and hide the warning pill if it was
     * raised by the watchdog.
     */
    _clearNoDataWatchdog: function () {
      if (_noDataWatchdogTimer) {
        try {
          clearTimeout(_noDataWatchdogTimer);
        } catch (e) {/* swallow */}
        _trackedTimers.delete(_noDataWatchdogTimer);
        _noDataWatchdogTimer = null;
      }
      try {
        const pill = document.getElementById('feedStatusPill');
        if (pill && pill.textContent === 'No data for this timeframe') {
          pill.style.display = 'none';
        }
      } catch (e) {/* swallow */}
    },
    /**
     * Toggle indicator visibility and recalculate layout.
     */
    toggleIndicators: function (active) {
      // ─── Price-chart overlays (unchanged) ───────────────────────
      // EMA / SMA / Bollinger / VWAP / Ichimoku / trendlines /
      // fibonacci / sr are correct price overlays — they stay on the
      // main chart exactly as before.
      ema20Series.applyOptions({
        visible: active.includes('ema')
      });
      ema50Series.applyOptions({
        visible: active.includes('ema')
      });
      ema200Series.applyOptions({
        visible: active.includes('ema')
      });
      bbUpperSeries.applyOptions({
        visible: active.includes('bollinger')
      });
      bbMiddleSeries.applyOptions({
        visible: active.includes('bollinger')
      });
      bbLowerSeries.applyOptions({
        visible: active.includes('bollinger')
      });
      vwapSeries.applyOptions({
        visible: active.includes('vwap')
      });
      sma20Series.applyOptions({
        visible: active.includes('sma')
      });
      sma50Series.applyOptions({
        visible: active.includes('sma')
      });
      sma200Series.applyOptions({
        visible: active.includes('sma')
      });
      this._ichiTenkan.applyOptions({
        visible: active.includes('ichimoku')
      });
      this._ichiKijun.applyOptions({
        visible: active.includes('ichimoku')
      });
      this._ichiSenkouA.applyOptions({
        visible: active.includes('ichimoku')
      });
      this._ichiSenkouB.applyOptions({
        visible: active.includes('ichimoku')
      });
      this._trendResistance.applyOptions({
        visible: active.includes('trendlines')
      });
      this._trendSupport.applyOptions({
        visible: active.includes('trendlines')
      });

      // ─── Oscillators (fix #42) ──────────────────────────────────
      // RSI / MACD / ATR are no longer main-chart overlays — each
      // toggles its own stacked aux pane. The legacy main-chart series
      // rsiOverlaySeries/macdLineSeries/macdSignalSeries/atrSeries are
      // intentionally left hidden + unfed.
      ['rsi', 'macd', 'atr'].forEach(key => {
        if (active.includes(key)) {
          if (!_oscPanes[key]) this.addOscPane(key);
        } else {
          if (_oscPanes[key]) this.removeOscPane(key);
        }
      });
      this._fibLines.forEach(l => {
        try {
          candleSeries.removePriceLine(l);
        } catch (e) {}
      });
      this._fibLines = [];
      this._srLines.forEach(l => {
        try {
          candleSeries.removePriceLine(l);
        } catch (e) {}
      });
      this._srLines = [];
      this._applyLayout();
    },
    /**
     * Calculate and render indicator overlays from stored candles.
     */
    calculateIndicators: function (candles) {
      if (!candles || candles.length < MIN_INDICATOR_CANDLES) return;
      const Ind = OGZ.get('Indicators');
      if (!Ind) return;
      const closes = candles.map(c => c.close);
      const times = candles.map(c => c.time);
      const mapSeries = values => values.map((v, i) => v != null ? {
        time: times[i],
        value: v
      } : null).filter(Boolean);
      try {
        const ema20 = Ind.calculateEMA(closes, 20);
        const ema50 = Ind.calculateEMA(closes, 50);
        const ema200 = Ind.calculateEMA(closes, 200);
        ema20Series.setData(mapSeries(ema20));
        ema50Series.setData(mapSeries(ema50));
        ema200Series.setData(mapSeries(ema200));
        const sma20 = Ind.calculateSMA(closes, 20);
        const sma50 = Ind.calculateSMA(closes, 50);
        const sma200 = Ind.calculateSMA(closes, 200);
        sma20Series.setData(mapSeries(sma20));
        sma50Series.setData(mapSeries(sma50));
        sma200Series.setData(mapSeries(sma200));
        const bb = Ind.calculateBollinger(closes, 20, 2);
        bbUpperSeries.setData(mapSeries(bb.upper));
        bbMiddleSeries.setData(mapSeries(bb.middle));
        bbLowerSeries.setData(mapSeries(bb.lower));
        const vwap = Ind.calculateVWAP(candles);
        vwapSeries.setData(mapSeries(vwap));

        // ─── Oscillator panes (fix #42) ─────────────────────────
        // RSI / ATR computed data is routed into their aux panes
        // when active. The legacy main-chart series stay unfed.
        if (_oscPanes['rsi'] && _oscPanes['rsi'].series && _oscPanes['rsi'].series.rsi) {
          const rsi = Ind.calculateRSI(closes, 14);
          try {
            _oscPanes['rsi'].series.rsi.setData(mapSeries(rsi));
          } catch (e) {/* swallow */}
        }
        if (_oscPanes['atr'] && _oscPanes['atr'].series && _oscPanes['atr'].series.atr) {
          const atr = Ind.calculateATR(candles, 14);
          try {
            _oscPanes['atr'].series.atr.setData(mapSeries(atr));
          } catch (e) {/* swallow */}
        }
        if (activeOverlays.includes('trendlines')) {
          const trendLines = Ind.calculateTrendLines(candles);
          trendLines.forEach(tl => {
            if (tl.type === 'resistance') this._trendResistance.setData(tl.points);
            if (tl.type === 'support') this._trendSupport.setData(tl.points);
          });
        }
        if (_oscPanes['macd'] && _oscPanes['macd'].series) {
          const macd = Ind.calculateMACD(closes);
          try {
            if (_oscPanes['macd'].series.macd) _oscPanes['macd'].series.macd.setData(mapSeries(macd.macd));
            if (_oscPanes['macd'].series.signal) _oscPanes['macd'].series.signal.setData(mapSeries(macd.signal));
          } catch (e) {/* swallow */}
        }
        const ichi = Ind.calculateIchimoku(candles);
        this._ichiTenkan.setData(mapSeries(ichi.tenkan));
        this._ichiKijun.setData(mapSeries(ichi.kijun));
        this._ichiSenkouA.setData(mapSeries(ichi.senkouA));
        this._ichiSenkouB.setData(mapSeries(ichi.senkouB));
        if (activeOverlays.includes('fibonacci')) {
          const fibColors = ['#00cc00', '#33cc33', '#66cc66', '#999900', '#cc6600', '#cc3300', '#cc0000'];
          const fibs = Ind.calculateFibonacci(candles);
          fibs.forEach((f, i) => {
            const line = candleSeries.createPriceLine({
              price: f.price,
              color: fibColors[i] || '#888',
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: `Fib ${f.label}`
            });
            this._fibLines.push(line);
          });
        }
        if (activeOverlays.includes('sr')) {
          const sr = Ind.calculateSupportResistance(candles);
          sr.forEach(level => {
            const line = candleSeries.createPriceLine({
              price: level.price,
              color: level.type === 'resistance' ? '#ef4444' : '#22c55e',
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: `${level.type === 'resistance' ? 'R' : 'S'} (${level.strength})`
            });
            this._srLines.push(line);
          });
        }
      } catch (e) {
        /* swallow */
      }
    },
    /**
     * Clear all chart data (candles, volume, indicators, markers).
     */
    clearAll: function () {
      if (candleSeries) candleSeries.setData([]);
      if (volumeSeries) volumeSeries.setData([]);
      if (this._lineSeries) this._lineSeries.setData([]);
      if (this._areaSeries) this._areaSeries.setData([]);
      if (this._barSeries) this._barSeries.setData([]);
      if (ghostSeries) ghostSeries.setData([]);
      wallLines.forEach(l => {
        try {
          candleSeries.removePriceLine(l);
        } catch (e) {/* swallow */}
      });
      tpoLines.forEach(l => {
        try {
          candleSeries.removePriceLine(l);
        } catch (e) {/* swallow */}
      });
      wallLines = [];
      tpoLines = [];
      removeRsiBands(this);
    },
    /**
     * Explicit teardown: remove listeners, timers, subscriptions, chart instance.
     */
    teardown: function () {
      for (const tid of _trackedTimers) {
        try {
          clearTimeout(tid);
        } catch (e) {/* swallow */}
      }
      _trackedTimers.clear();
      _pendingAssetHistoryTimer = null;
      for (const {
        target,
        type,
        handler
      } of _trackedListeners) {
        try {
          target.removeEventListener(type, handler);
        } catch (e) {/* swallow */}
      }
      _trackedListeners.length = 0;
      if (_trackedVisibleRangeCB && tvChart && tvChart.timeScale) {
        try {
          tvChart.timeScale().unsubscribeVisibleLogicalRangeChange(_trackedVisibleRangeCB);
        } catch (e) {/* swallow */}
        _trackedVisibleRangeCB = null;
      }
      removeRsiBands(this);
      _trackedRsiSeries = null;
      this._rsiOverlaySeries = null;
      _cachedPriceEl = null;
      _cachedHudPrice = null;
      _cachedHudOhlc = null;
      _cachedTooltipEl = null;
      if (this._chartResizeObserver) {
        try {
          this._chartResizeObserver.disconnect();
        } catch (e) {/* swallow */}
      }

      // Strip position lines (they live on candleSeries which is about to be nulled)
      const _strip = line => {
        if (!line || !candleSeries) return null;
        try {
          candleSeries.removePriceLine(line);
        } catch (e) {/* swallow */}
        return null;
      };
      _entryPriceLine = _strip(_entryPriceLine);
      _stopPriceLine = _strip(_stopPriceLine);
      _targetPriceLine = _strip(_targetPriceLine);
      _lastPositionState = null;

      // Note: websocket.js does not currently expose unregisterHandler,
      // so the delta/trade/state_update subs we registered survive teardown.
      // They will no-op safely because candleSeries is null below.
      _wsBootstrapped = false;

      // Tear down ALL active oscillator panes BEFORE nulling tvChart
      // (removeOscPane needs tvChart to unsubscribe the crosshair sub).
      // We preserve the persisted active-set in LS so the panes
      // auto-restore on the next init(): snapshot it first, then
      // restore it after the removeOscPane calls (which would otherwise
      // re-persist an empty set).
      try {
        const savedSet = OSC_PANE_ORDER.filter(k => !!_oscPanes[k]);
        OSC_PANE_ORDER.slice().forEach(k => {
          if (_oscPanes[k]) {
            try {
              ChartPanel.removeOscPane(k);
            } catch (e) {/* swallow */}
          }
        });
        if (savedSet.length) {
          try {
            localStorage.setItem(OSC_PANE_LS_KEY, JSON.stringify(savedSet));
          } catch (e) {/* swallow */}
        }
      } catch (e) {/* swallow */}
      _oscPanes = {};
      _oscMainRangeCB = null;
      _oscSyncing = false;

      // Clear the timeframe-change watchdog if still pending.
      try {
        ChartPanel._clearNoDataWatchdog();
      } catch (e) {/* swallow */}
      tvChart = null;
      candleSeries = null;
      volumeSeries = null;
      ghostSeries = null;
      storedCandles = [];
      activeOverlays = [];
      tradeMarkers.clear();
      tradeMarkerData.clear();
      if (_markerTooltipEl) {
        try {
          _markerTooltipEl.remove();
        } catch (e) {/* swallow */}
        _markerTooltipEl = null;
      }
      _hoveredMarkerTime = null;
    },
    /**
     * Handle live price ticks: update candles, volume, price flash, HUD.
     */
    update: function (d) {
      if (!this.isSelectedAssetPayload(d)) return;
      if (!candleSeries) return;
      const candle = d.candle || d;
      const price = candle.close || candle.c;
      const open = candle.open || candle.o;
      const high = candle.high || candle.h;
      const low = candle.low || candle.l;
      const rawMs = candle.timestamp || candle.t || Date.now();
      const t = Math.floor(rawMs / 1000);
      const bucket = currentBucketSeconds();
      const timeAligned = Math.floor(t / bucket) * bucket;
      let tickOpen = open,
        tickHigh = high,
        tickLow = low,
        tickClose = price;
      if (price != null && (open == null || high == null || low == null)) {
        const last = storedCandles[storedCandles.length - 1];
        if (last && last.time === timeAligned) {
          tickOpen = last.open;
          tickHigh = Math.max(last.high, price);
          tickLow = Math.min(last.low, price);
          tickClose = price;
          last.high = tickHigh;
          last.low = tickLow;
          last.close = tickClose;
        } else if (price != null) {
          tickOpen = tickHigh = tickLow = tickClose = price;
          storedCandles.push({
            time: timeAligned,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 0
          });
        }
      } else if (open != null) {
        const last = storedCandles[storedCandles.length - 1];
        if (last && last.time === timeAligned) {
          last.open = open;
          last.high = high;
          last.low = low;
          last.close = price;
        } else {
          storedCandles.push({
            time: timeAligned,
            open,
            high,
            low,
            close: price,
            volume: candle.volume || candle.v || 0
          });
        }
      }
      if (tickClose != null) {
        candleSeries.update({
          time: timeAligned,
          open: tickOpen,
          high: tickHigh,
          low: tickLow,
          close: tickClose
        });
      }
      if (candle.volume || candle.v) {
        const up = tickClose >= tickOpen;
        let liveAlpha = VOL_LIVE_ALPHA_DEFAULT;
        if (storedCandles.length > MIN_VOLUME_STATS_CANDLES) {
          const sortedVols = storedCandles.map(c => c.volume).filter(v => v > 0).sort((a, b) => a - b);
          const capVol = sortedVols[Math.min(sortedVols.length - 1, Math.ceil(sortedVols.length * VOL_CAP_PCTILE) - 1)] || 1;
          const ratio = Math.min(1, (candle.volume || candle.v) / capVol);
          liveAlpha = VOL_ALPHA_FLOOR + VOL_ALPHA_RANGE * ratio;
        }
        const rgb = up ? '34,197,94' : '239,68,68';
        const volEntry = {
          time: timeAligned,
          value: candle.volume || candle.v,
          color: `rgba(${rgb},${liveAlpha.toFixed(3)})`
        };
        volumeSeries.update(volEntry);
        // Mirror live volume tick into the volume pane when active.
        const volPane = _oscPanes['volume'];
        if (volPane && volPane.series && volPane.series.volume) {
          try {
            volPane.series.volume.update(volEntry);
          } catch (e) {/* swallow */}
        }
      }

      // Feed live RSI/MACD/ATR into their panes (recomputed from the
      // updated storedCandles window). Cheap enough at tick cadence —
      // the same indicator math the panel already runs on every toggle.
      if ((_oscPanes['rsi'] || _oscPanes['macd'] || _oscPanes['atr']) && storedCandles.length >= MIN_INDICATOR_CANDLES) {
        feedOscIndicatorPanes(storedCandles);
      }
      if (price != null) {
        OGZ.state.lastPriceDelta = price - OGZ.state.lastPrice;
        OGZ.state.lastPrice = price;
        const up = OGZ.state.lastPriceDelta >= 0;
        const flashColor = up ? '#22c55e' : '#ef4444';
        const flashShadow = up ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)';
        const priceEl = _cachedPriceEl;
        if (priceEl) {
          priceEl.textContent = `$${price.toLocaleString()}`;
          priceEl.style.color = flashColor;
          priceEl.style.textShadow = `0 0 12px ${flashShadow}`;
          if (priceEl._flashTimer) {
            clearTimeout(priceEl._flashTimer);
            _trackedTimers.delete(priceEl._flashTimer);
          }
          priceEl._flashTimer = setTimeout(() => {
            _trackedTimers.delete(priceEl._flashTimer);
            priceEl._flashTimer = null;
            priceEl.style.textShadow = '';
          }, PRICE_FLASH_MS);
          trackTimer(priceEl._flashTimer);
        }
        const hudPrice = _cachedHudPrice;
        if (hudPrice) {
          hudPrice.textContent = `$${Number(price).toFixed(2)}`;
          hudPrice.style.color = flashColor;
          hudPrice.style.textShadow = `0 0 14px ${flashShadow}`;
          if (hudPrice._flashTimer) {
            clearTimeout(hudPrice._flashTimer);
            _trackedTimers.delete(hudPrice._flashTimer);
          }
          hudPrice._flashTimer = setTimeout(() => {
            _trackedTimers.delete(hudPrice._flashTimer);
            hudPrice._flashTimer = null;
            hudPrice.style.textShadow = `0 0 6px ${flashShadow}`;
          }, PRICE_FLASH_MS);
          trackTimer(hudPrice._flashTimer);
        }
        const hudOhlc = _cachedHudOhlc;
        if (hudOhlc) {
          if (storedCandles.length) {
            const lc = storedCandles[storedCandles.length - 1];
            hudOhlc.textContent = `O ${lc.open.toFixed(2)}  H ${lc.high.toFixed(2)}  L ${lc.low.toFixed(2)}  C ${lc.close.toFixed(2)}`;
            const hud = hudOhlc.parentElement;
            if (hud && hud.style.visibility !== 'visible') {
              hud.style.visibility = 'visible';
            }
          }
        }
      }
    },
    /**
     * Render ghost projection path (ML).
     */
    plotGhost: function (path) {
      if (ghostSeries && path && path.length > 0) {
        ghostSeries.setData(path);
      }
    },
    /**
     * Render TPO/liquidity overlay (gate-guarded).
     */
    renderLiquidity: function (data) {
      if (!candleSeries) return;
      if (!data.isLive) return;
      wallLines.forEach(l => {
        try {
          candleSeries.removePriceLine(l);
        } catch (e) {/* swallow */}
      });
      tpoLines.forEach(l => {
        try {
          candleSeries.removePriceLine(l);
        } catch (e) {/* swallow */}
      });
      wallLines = [];
      tpoLines = [];
      if (data.density) {
        data.density.forEach(level => {
          const line = candleSeries.createPriceLine({
            price: level.price,
            color: `rgba(220, 38, 38, ${Math.min(level.weight * 0.01, 0.15)})`,
            lineWidth: 1,
            lineStyle: 0,
            axisLabelVisible: false
          });
          tpoLines.push(line);
        });
      }
      if (data.walls) {
        data.walls.forEach(wall => {
          const color = wall.side === 'BID' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';
          const line = candleSeries.createPriceLine({
            price: wall.price,
            color: color,
            lineWidth: 3,
            lineStyle: 0,
            axisLabelVisible: true,
            title: `$${(wall.size / 1000000).toFixed(1)}M`
          });
          wallLines.push(line);
        });
      }
    },
    /**
     * Load historical candles and recalculate indicators.
     */
    loadHistorical: function (message) {
      const envelope = Array.isArray(message) ? {
        candles: message
      } : message || {};
      if (!this.isSelectedAssetPayload(envelope)) return;
      const candles = envelope.candles;
      if (!candleSeries || !candles || candles.length === 0) return;
      try {
        const formatted = candles.map(c => {
          const rawTime = c.time || c.t || c.timestamp || 0;
          const time = Math.floor(rawTime / (rawTime > 1e12 ? 1000 : 1));
          return {
            time,
            open: c.open || c.o || 0,
            high: c.high || c.h || 0,
            low: c.low || c.l || 0,
            close: c.close || c.c || 0,
            volume: c.volume || c.v || 0
          };
        }).filter(c => c.time > 0 && c.open > 0);
        if (formatted.length === 0) return;
        candleSeries.setData(formatted.map(c => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close
        })));
        if (volumeSeries) {
          const sortedVols = formatted.map(c => c.volume).filter(v => v > 0).sort((a, b) => a - b);
          const capVol = sortedVols.length ? sortedVols[Math.min(sortedVols.length - 1, Math.ceil(sortedVols.length * VOL_CAP_PCTILE) - 1)] : 1;
          const volData = formatted.map(c => {
            const up = c.close >= c.open;
            const ratio = capVol > 0 ? Math.min(1, (c.volume || 0) / capVol) : 0;
            const alpha = VOL_ALPHA_FLOOR + VOL_ALPHA_RANGE * ratio;
            const rgb = up ? '34,197,94' : '239,68,68';
            return {
              time: c.time,
              value: c.volume,
              color: `rgba(${rgb},${alpha.toFixed(3)})`
            };
          });
          volumeSeries.setData(volData);
          // Mirror full historical volume into the volume pane when active.
          const volPane = _oscPanes['volume'];
          if (volPane && volPane.series && volPane.series.volume) {
            try {
              volPane.series.volume.setData(volData);
            } catch (e) {/* swallow */}
          }
        }
        storedCandles = formatted;

        // fix #42: real data arrived — cancel the timeframe-change watchdog.
        this._clearNoDataWatchdog();
        if (activeOverlays.length > 0) this.calculateIndicators(formatted);

        // Feed any active RSI/MACD/ATR panes with the fresh history.
        feedOscIndicatorPanes(formatted);
        if (tvChart) {
          try {
            tvChart.priceScale('right').applyOptions({
              autoScale: true
            });
            // fitContent() spreads the whole loaded batch evenly
            // across the full chart width. The old scrollToRealTime()
            // call right after it FOUGHT that — it jumped the
            // viewport to the live edge at the default narrow bar
            // spacing, so the batch ended up jammed into the right
            // ~40% of the x-axis with dead space on the left.
            // fitContent() alone is correct for a one-shot
            // historical load; live-follow on streaming candles is
            // handled separately by the per-tick update path.
            tvChart.timeScale().fitContent();
          } catch (e) {/* swallow */}
        }
      } catch (e) {
        /* swallow */
      }
    },
    /**
     * Add a rich trade marker. Accepts either:
     *   - (price, time, side)           — legacy 3-arg form (no rich tooltip)
     *   - (tradeData)                   — preferred: full bot trade payload
     *
     * Rich tradeData shape (from OrderExecutor broadcast):
     *   { action:'BUY'|'SELL'|'SELL_SHORT'|'COVER',
     *     direction:'long'|'short', price, pnl, timestamp, confidence,
     *     duration?, pattern?, strategy? }
     *
     * Uses LightweightCharts' native setMarkers() — hover/click are
     * detected via the crosshair callback in initChart(), which reads
     * tradeMarkerData (a Map keyed by candle-time-seconds) to render
     * the floating trade tooltip card.
     */
    addTradeMarker: function (arg1, arg2, arg3) {
      if (!candleSeries) return;

      // Normalize input into a trade-data object
      let td;
      if (typeof arg1 === 'object' && arg1 !== null) {
        td = arg1;
      } else {
        td = {
          price: Number(arg1),
          timestamp: Number(arg2) * 1000,
          action: arg3 === 'SHORT' ? 'SELL_SHORT' : arg3 === 'EXIT' ? 'SELL' : 'BUY',
          direction: arg3 === 'SHORT' ? 'short' : 'long'
        };
      }
      const price = Number(td.price);
      const tsMs = Number(td.timestamp) || Date.now();
      const tsSec = Math.floor((tsMs > 1e12 ? tsMs : tsMs * 1000) / 1000);
      if (!isFinite(price) || price <= 0) return;
      const action = String(td.action || '').toUpperCase();
      const direction = String(td.direction || (action === 'SELL_SHORT' || action === 'COVER' ? 'short' : 'long')).toLowerCase();
      const isEntry = action === 'BUY' || action === 'SELL_SHORT';
      const isClose = action === 'SELL' || action === 'COVER';
      const pnl = Number(td.pnl) || 0;
      const win = isClose && pnl > 0;
      const loss = isClose && pnl < 0;

      // Marker visual config
      let position, color, shape, text;
      if (isEntry) {
        position = direction === 'short' ? 'aboveBar' : 'belowBar';
        color = direction === 'short' ? '#ff6b8a' : '#22c55e';
        shape = direction === 'short' ? 'arrowDown' : 'arrowUp';
        text = direction === 'short' ? 'S' : 'L';
      } else if (isClose) {
        position = direction === 'short' ? 'belowBar' : 'aboveBar';
        shape = win ? 'circle' : loss ? 'square' : 'circle';
        color = win ? '#22c55e' : loss ? '#ef4444' : '#9ca3af';
        const sign = pnl >= 0 ? '+' : '';
        text = `${sign}$${Math.abs(pnl).toFixed(0)}`;
      } else {
        position = 'belowBar';
        color = '#9ca3af';
        shape = 'circle';
        text = '·';
      }
      const markerObj = {
        time: tsSec,
        position,
        color,
        shape,
        text,
        size: 1
      };
      const key = `${tsSec}:${action}:${price.toFixed(2)}`;

      // Idempotency: skip exact duplicates (same second + action + price)
      if (tradeMarkers.has(key)) return;
      tradeMarkers.set(key, markerObj);

      // Stash full context for tooltip / click
      const ctxEntry = {
        key,
        time: tsSec,
        price,
        action,
        direction,
        pnl,
        isEntry,
        isClose,
        win,
        loss,
        confidence: td.confidence != null ? Number(td.confidence) : null,
        pattern: td.pattern || null,
        strategy: td.strategy || null,
        duration: td.duration || null,
        narratorText: td.narratorText || null,
        indicators: td.indicators || null,
        tsMs
      };
      if (!tradeMarkerData.has(tsSec)) tradeMarkerData.set(tsSec, []);
      tradeMarkerData.get(tsSec).push(ctxEntry);

      // Push to chart
      const sorted = Array.from(tradeMarkers.values()).sort((a, b) => a.time - b.time);
      try {
        candleSeries.setMarkers(sorted);
      } catch (e) {/* swallow */}
    },
    /**
     * Remove all trade markers.
     */
    clearMarkers: function () {
      tradeMarkers.clear();
      tradeMarkerData.clear();
      try {
        if (candleSeries) candleSeries.setMarkers([]);
      } catch (e) {/* swallow */}
      hideMarkerTooltip();
    },
    /**
     * Get chart instance (for drawing-tools.js etc).
     */
    getChart: () => tvChart,
    /**
     * Re-sync the single main→pane time-axis subscription. The main
     * chart has ONE range-change callback; it pushes the range into
     * every active pane. Bottom→top sync is wired per-pane in
     * _buildOscPane(). All sync paths share the `_oscSyncing` guard.
     */
    _ensureOscMainRangeSub: function () {
      if (_oscMainRangeCB || !tvChart) return;
      _oscMainRangeCB = range => {
        if (_oscSyncing || !range) return;
        _oscSyncing = true;
        try {
          OSC_PANE_ORDER.forEach(k => {
            const entry = _oscPanes[k];
            if (entry && entry.chart) {
              try {
                entry.chart.timeScale().setVisibleLogicalRange(range);
              } catch (e) {/* swallow */}
            }
          });
        } finally {
          setTimeout(() => {
            _oscSyncing = false;
          }, 0);
        }
      };
      try {
        tvChart.timeScale().subscribeVisibleLogicalRangeChange(_oscMainRangeCB);
      } catch (e) {/* swallow */}
    },
    /**
     * Build ONE aux LightweightCharts pane for a given oscillator key.
     * Shared by addOscPane(). Wires per-pane bottom→top time-axis sync,
     * main→pane crosshair sync, and a ResizeObserver. Returns the pane
     * registry entry, or null on failure.
     *
     * v4 only — each pane is a separate createChart() instance, the same
     * proven pattern the old single volume pane used.
     */
    _buildOscPane: function (key) {
      const spec = OSC_PANE_SPEC[key];
      if (!spec || !tvChart || typeof LightweightCharts === 'undefined') return null;
      const mainContainer = document.getElementById('tvChartContainer');
      if (!mainContainer || !mainContainer.parentElement) return null;

      // Build the pane container.
      const container = document.createElement('div');
      container.className = 'cp-osc-pane';
      container.dataset.oscKey = key;
      const label = document.createElement('div');
      label.className = 'cp-osc-label';
      label.textContent = spec.label;
      container.appendChild(label);

      // Insert in fixed stack order: after the last pane that precedes
      // `key` in OSC_PANE_ORDER, otherwise right after the main chart.
      const parent = mainContainer.parentElement;
      let insertBefore = mainContainer.nextSibling;
      const idx = OSC_PANE_ORDER.indexOf(key);
      for (let i = idx - 1; i >= 0; i--) {
        const prev = _oscPanes[OSC_PANE_ORDER[i]];
        if (prev && prev.container) {
          insertBefore = prev.container.nextSibling;
          break;
        }
      }
      // If a later pane already exists, make sure we land before it.
      for (let i = idx + 1; i < OSC_PANE_ORDER.length; i++) {
        const later = _oscPanes[OSC_PANE_ORDER[i]];
        if (later && later.container) {
          insertBefore = later.container;
          break;
        }
      }
      parent.insertBefore(container, insertBefore);

      // Build the aux chart instance.
      const chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
          background: {
            color: '#0a0a0a'
          },
          textColor: '#888'
        },
        grid: {
          vertLines: {
            color: 'rgba(255,255,255,0.04)'
          },
          horzLines: {
            color: 'rgba(255,255,255,0.04)'
          }
        },
        crosshair: {
          mode: 0,
          vertLine: {
            color: 'rgba(220,38,38,0.45)'
          },
          horzLine: {
            color: 'rgba(220,38,38,0.45)'
          }
        },
        timeScale: {
          rightOffset: 12,
          timeVisible: true,
          secondsVisible: false,
          visible: false
        },
        handleScroll: false,
        handleScale: false,
        rightPriceScale: {
          borderVisible: false
        }
      });

      // Build the pane's series via its spec.
      const series = spec.build(chart);

      // Bottom→top time-axis sync (per pane), shares the _oscSyncing guard.
      const rangeCB = range => {
        if (_oscSyncing || !range || !tvChart) return;
        _oscSyncing = true;
        try {
          tvChart.timeScale().setVisibleLogicalRange(range);
          // Mirror into the OTHER active panes too.
          OSC_PANE_ORDER.forEach(k => {
            if (k === key) return;
            const other = _oscPanes[k];
            if (other && other.chart) {
              try {
                other.chart.timeScale().setVisibleLogicalRange(range);
              } catch (e) {/* swallow */}
            }
          });
        } finally {
          setTimeout(() => {
            _oscSyncing = false;
          }, 0);
        }
      };
      try {
        chart.timeScale().subscribeVisibleLogicalRangeChange(rangeCB);
      } catch (e) {/* swallow */}

      // Main→pane crosshair sync. Anchor the crosshair on the pane's
      // first series so the vertical line lines up with the main chart.
      const anchorSeries = series[Object.keys(series)[0]];
      const crosshairCB = param => {
        if (!param || !param.time || !anchorSeries) return;
        try {
          chart.setCrosshairPosition(NaN, param.time, anchorSeries);
        } catch (e) {/* swallow */}
      };
      try {
        tvChart.subscribeCrosshairMove(crosshairCB);
      } catch (e) {/* swallow */}

      // ResizeObserver for the pane.
      let resizeObserver = null;
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          if (chart && container) {
            try {
              chart.resize(container.clientWidth, container.clientHeight);
            } catch (e) {/* swallow */}
          }
        });
        try {
          resizeObserver.observe(container);
        } catch (e) {/* swallow */}
      }

      // Match the main chart's current visible range immediately.
      try {
        const lr = tvChart.timeScale().getVisibleLogicalRange();
        if (lr) chart.timeScale().setVisibleLogicalRange(lr);
      } catch (e) {/* swallow */}
      return {
        container,
        chart,
        series,
        rangeCB,
        crosshairCB,
        resizeObserver
      };
    },
    /**
     * Add (activate) a stacked oscillator pane for `key` — one of
     * 'volume' | 'rsi' | 'macd' | 'atr'. Idempotent. The pane is built
     * below the price chart, time-axis + crosshair synced, then fed with
     * data computed from the current storedCandles.
     *
     * @param {string} key
     * @param {boolean} [skipLayout] - when true, the caller will run
     *        _applyLayout() itself (used by init() batch restore).
     */
    addOscPane: function (key, skipLayout) {
      if (!OSC_PANE_SPEC[key]) return false;
      if (_oscPanes[key]) return true; // idempotent
      if (!tvChart) return false;
      const entry = this._buildOscPane(key);
      if (!entry) return false;
      _oscPanes[key] = entry;

      // Ensure the single main→pane range subscription is live.
      this._ensureOscMainRangeSub();

      // Feed the pane with current data.
      if (key === 'volume') {
        // Hide the in-chart volume strip — volume now lives in its pane.
        try {
          if (volumeSeries) volumeSeries.applyOptions({
            visible: false
          });
        } catch (e) {/* swallow */}
        this._feedVolumePane();
      } else {
        feedOscIndicatorPanes(storedCandles);
      }

      // Persist + UI.
      persistOscPanes();
      if (key === 'volume') {
        const btn = document.getElementById('cp-oscToggle');
        if (btn) {
          btn.classList.add('active');
          btn.textContent = 'Volume Split On';
        }
      }
      if (!skipLayout) this._applyLayout();
      return true;
    },
    /**
     * Remove (deactivate) the stacked oscillator pane for `key`.
     * Idempotent. Unwinds all subscriptions, the chart instance, the
     * ResizeObserver, and the DOM container.
     */
    removeOscPane: function (key) {
      const entry = _oscPanes[key];
      if (!entry) return;
      try {
        if (entry.rangeCB && entry.chart) {
          try {
            entry.chart.timeScale().unsubscribeVisibleLogicalRangeChange(entry.rangeCB);
          } catch (e) {/* swallow */}
        }
        if (entry.crosshairCB && tvChart) {
          try {
            tvChart.unsubscribeCrosshairMove(entry.crosshairCB);
          } catch (e) {/* swallow */}
        }
        if (entry.resizeObserver) {
          try {
            entry.resizeObserver.disconnect();
          } catch (e) {/* swallow */}
        }
        if (entry.chart && typeof entry.chart.remove === 'function') {
          try {
            entry.chart.remove();
          } catch (e) {/* swallow */}
        }
        if (entry.container && entry.container.parentElement) {
          try {
            entry.container.parentElement.removeChild(entry.container);
          } catch (e) {/* swallow */}
        }
      } catch (e) {/* swallow */}
      delete _oscPanes[key];

      // If no panes remain, drop the shared main→pane range subscription.
      if (Object.keys(_oscPanes).length === 0 && _oscMainRangeCB && tvChart) {
        try {
          tvChart.timeScale().unsubscribeVisibleLogicalRangeChange(_oscMainRangeCB);
        } catch (e) {/* swallow */}
        _oscMainRangeCB = null;
      }

      // Restore the in-chart volume strip when the volume pane closes.
      if (key === 'volume') {
        try {
          if (volumeSeries) volumeSeries.applyOptions({
            visible: true
          });
        } catch (e) {/* swallow */}
        const btn = document.getElementById('cp-oscToggle');
        if (btn) {
          btn.classList.remove('active');
          btn.textContent = 'Volume Split';
        }
      }
      persistOscPanes();
      this._applyLayout();
    },
    /**
     * Feed the volume pane (if active) with colored volume bars derived
     * from the current storedCandles. Mirrors the alpha-envelope logic
     * used by the in-chart volume series.
     */
    _feedVolumePane: function () {
      const entry = _oscPanes['volume'];
      if (!entry || !entry.series || !entry.series.volume) return;
      if (!storedCandles || !storedCandles.length) return;
      const sortedVols = storedCandles.map(c => c.volume).filter(v => v > 0).sort((a, b) => a - b);
      const capVol = sortedVols.length ? sortedVols[Math.min(sortedVols.length - 1, Math.ceil(sortedVols.length * VOL_CAP_PCTILE) - 1)] : 1;
      const volData = storedCandles.filter(c => c && typeof c.time === 'number').map(c => {
        const up = c.close >= c.open;
        const ratio = capVol > 0 ? Math.min(1, (c.volume || 0) / capVol) : 0;
        const alpha = VOL_ALPHA_FLOOR + VOL_ALPHA_RANGE * ratio;
        const rgb = up ? '34,197,94' : '239,68,68';
        return {
          time: c.time,
          value: c.volume || 0,
          color: `rgba(${rgb},${alpha.toFixed(3)})`
        };
      });
      try {
        entry.series.volume.setData(volData);
      } catch (e) {/* swallow */}
    },
    /**
     * Returns true if any oscillator pane is currently active.
     * (Diagnostics / UI sync.)
     */
    isOscillatorPaneActive: function () {
      return Object.keys(_oscPanes).length > 0;
    },
    /**
     * Returns the list of active oscillator-pane keys.
     */
    getActiveOscPanes: function () {
      return OSC_PANE_ORDER.filter(k => !!_oscPanes[k]);
    },
    /**
     * Get series references.
     */
    getSeries: () => ({
      candle: candleSeries,
      volume: volumeSeries,
      ghost: ghostSeries
    }),
    /**
     * Return up to `count` real candles centered around a given timestamp.
     * Used by TradeReplay to render the mini-chart for a closed trade.
     * NO synthetic candle generation — only returns what's in storedCandles.
     * If the trade timestamp falls outside the loaded window, returns the
     * closest contiguous slice we have. If storedCandles is empty, returns [].
     *
     * @param {number} ts - Epoch milliseconds OR seconds (auto-detected)
     * @param {number} count - Total candles to return (default 30)
     * @returns {Array<{time, open, high, low, close, volume}>}
     */
    getCandlesAroundTime: function (ts, count) {
      try {
        if (!storedCandles || storedCandles.length === 0) return [];
        const n = Math.max(1, Number(count) || 30);
        // Normalize ts to seconds (storedCandles uses second-aligned bucket times)
        const tsSec = ts > 1e12 ? Math.floor(Number(ts) / 1000) : Math.floor(Number(ts));
        if (!isFinite(tsSec)) return [];

        // Binary search the nearest candle by time
        let lo = 0,
          hi = storedCandles.length - 1,
          nearest = 0;
        while (lo <= hi) {
          const mid = lo + hi >> 1;
          const t = storedCandles[mid].time;
          if (t === tsSec) {
            nearest = mid;
            break;
          }
          if (t < tsSec) {
            nearest = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }

        // Center the slice on the nearest candle, clamp to array bounds
        const half = Math.floor(n / 2);
        let start = Math.max(0, nearest - half);
        let end = Math.min(storedCandles.length, start + n);
        start = Math.max(0, end - n); // re-align if we hit the right wall

        // Return a shallow copy so the caller can't mutate live state
        return storedCandles.slice(start, end).map(c => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume
        }));
      } catch (e) {
        return [];
      }
    },
    /**
     * Debug helper: return internal state.
     */
    _compute: function () {
      return {
        tvChart: !!tvChart,
        storedCandles: storedCandles.length,
        activeOverlays: activeOverlays,
        tradeMarkers: tradeMarkers.size,
        cachedDomRefs: {
          priceEl: !!_cachedPriceEl,
          hudPrice: !!_cachedHudPrice,
          hudOhlc: !!_cachedHudOhlc,
          tooltip: !!_cachedTooltipEl
        }
      };
    },
    isSelectedAssetPayload: function (payload) {
      return payloadMatchesSelectedAsset(payload);
    }
  };

  // ─── Registration ──────────────────────────────────────────────────────
  // Dual-register: 'ChartPanel' is the canonical v2 name; 'Chart' is the
  // legacy alias core.js + websocket.js consumers do OGZ.get('Chart') against.
  // Without the alias, every price/historical_candles event short-circuits
  // silently (Wolf cotwerk diagnosis 2026-05-08).
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('ChartPanel', ChartPanel);
    OGZ.register('Chart', ChartPanel);
  } else {
    if (typeof document !== 'undefined') {
      document.addEventListener('DOMContentLoaded', () => {
        if (window.OGZ && typeof window.OGZ.register === 'function') {
          window.OGZ.register('ChartPanel', ChartPanel);
          window.OGZ.register('Chart', ChartPanel);
        }
      });
    }
  }
  try {
    window.OGZChartPanel = ChartPanel;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/chart-panel.js", error: String((e && e.message) || e) }); }

// public/js/panels/confidence-heatbar.js
try { (() => {
/**
 * confidence-heatbar.js — Ensemble Confidence Heatbar (Phase E)
 *
 * Horizontal bar above the chart. Each strategy gets a segment whose width
 * is proportional to its confidence. The winner glows with brand-red
 * outline + halo. Opposing-direction strategies render grey.
 *
 * Data sources (priority order):
 *   1. bot_thinking      — d.strategy_stack[], winner from d.winner_id
 *   2. signal_analysis   — d.signal.signals[], winner from d.modules.orchestrator.winner
 *   3. orchestrator_result (legacy) — d.signalBreakdown.signals / d.allResults
 *
 * Mounts inside .chart-container, immediately before #tvChartContainer.
 * Self-injects its own scoped CSS; self-registers as OGZ.Heatbar.
 *
 * @module public/js/panels/confidence-heatbar
 */
(function (OGZ) {
  'use strict';

  const STYLE_ID = 'ogz-heatbar-styles';
  const ROOT_ID = 'confidenceHeatbar';

  // ─── State ──────────────────────────────────────────────────────────
  const state = {
    mounted: false,
    stack: [],
    // [{ name, confidence, direction }]
    winner: null,
    // winner strategy name
    lastUpdate: 0
  };

  // ─── Helpers ────────────────────────────────────────────────────────

  // Normalize confidence: incoming values may be 0-1 OR 0-100.
  function normConf(c) {
    const n = Number(c);
    if (!isFinite(n) || n <= 0) return 0;
    return n > 1 ? Math.min(1, n / 100) : Math.min(1, n);
  }
  function directionOf(sig) {
    const d = sig && sig.direction ? String(sig.direction).toLowerCase() : '';
    if (d === 'buy' || d === 'long' || d === 'up') return 'buy';
    if (d === 'sell' || d === 'short' || d === 'down') return 'sell';
    return null;
  }

  // Read incoming strategy list from any of the 3 supported message shapes.
  function normalizeStack(input) {
    if (!Array.isArray(input)) return [];
    return input.map(s => {
      if (!s) return null;
      const name = s.name || s.strategyName || s.id || s.label;
      if (!name) return null;
      return {
        name: String(name),
        confidence: normConf(s.confidence),
        direction: directionOf(s)
      };
    }).filter(Boolean);
  }

  // ─── Mount + style injection ────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                display: flex;
                align-items: center;
                gap: 8px;
                height: 30px;
                padding: 4px 10px;
                margin-bottom: 6px;
                background: rgba(15, 15, 15, 0.72);
                backdrop-filter: blur(10px) saturate(140%);
                -webkit-backdrop-filter: blur(10px) saturate(140%);
                border: 1px solid rgba(220, 38, 38, 0.14);
                border-radius: 6px;
                font-family: 'JetBrains Mono', 'Courier New', monospace;
                overflow: hidden;
                user-select: none;
            }
            #${ROOT_ID} .hb-label {
                font-size: 9px;
                color: #a1a1aa;
                text-transform: uppercase;
                letter-spacing: 0.14em;
                flex: 0 0 auto;
            }
            #${ROOT_ID} .hb-track {
                display: flex;
                align-items: stretch;
                gap: 4px;
                flex: 1 1 auto;
                height: 18px;
            }
            #${ROOT_ID} .hb-segment {
                position: relative;
                height: 100%;
                min-width: 28px;
                padding: 0 6px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 6px;
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.06);
                border-radius: 3px;
                font-size: 9px;
                color: #a1a1aa;
                overflow: hidden;
                transition: border-color 0.18s ease, transform 0.18s ease;
            }
            #${ROOT_ID} .hb-segment .hb-fill {
                position: absolute;
                inset: 0;
                transform-origin: left center;
                transform: scaleX(0);
                background: linear-gradient(90deg,
                    rgba(220, 38, 38, 0.30) 0%,
                    rgba(220, 38, 38, 0.10) 100%);
                transition: transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
                z-index: 0;
            }
            #${ROOT_ID} .hb-segment .hb-name,
            #${ROOT_ID} .hb-segment .hb-conf {
                position: relative;
                z-index: 1;
            }
            #${ROOT_ID} .hb-segment .hb-name {
                font-weight: 600;
                color: #e4e4e7;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #${ROOT_ID} .hb-segment .hb-conf {
                color: #a1a1aa;
                font-size: 9px;
                letter-spacing: 0.04em;
            }
            #${ROOT_ID} .hb-segment.hb-opposing {
                filter: saturate(0) opacity(0.55);
            }
            #${ROOT_ID} .hb-segment.hb-winner {
                border-color: #dc2626;
                box-shadow: 0 0 0 1px #dc2626, 0 0 14px rgba(220, 38, 38, 0.45);
                transform: translateY(-0.5px);
            }
            #${ROOT_ID} .hb-segment.hb-winner .hb-name {
                color: #fca5a5;
                text-shadow: 0 0 8px rgba(220, 38, 38, 0.35);
            }
            #${ROOT_ID} .hb-winner-tag {
                flex: 0 0 auto;
                font-size: 10px;
                color: #fca5a5;
                letter-spacing: 0.06em;
                white-space: nowrap;
                opacity: 0;
                transition: opacity 0.25s ease;
            }
            #${ROOT_ID} .hb-winner-tag.hb-visible {
                opacity: 1;
            }
            #${ROOT_ID} .hb-placeholder {
                flex: 1 1 auto;
                color: #52525b;
                font-size: 10px;
                letter-spacing: 0.06em;
                font-style: italic;
            }
        `;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // The internal scaffold every render path depends on (.hb-track is the
  // element renderSegments()/renderPlaceholder() write into).
  const SCAFFOLD_HTML = `
            <span class="hb-label">ENSEMBLE</span>
            <div class="hb-track"></div>
            <span class="hb-winner-tag" aria-live="polite"></span>
        `;
  function mount() {
    if (state.mounted) return true;

    // Gate H landmine fix. The v2 shell already ships an empty
    // <div id="confidenceHeatbar"> in the left rail. The module must
    // mount into that element; it already does (no duplicate root
    // is ever created; the getElementById guard prevents that). The real
    // bug: the adopt path below returned immediately without building the
    // .hb-label/.hb-track/.hb-winner-tag scaffold. That scaffold was
    // only ever written on the self-create path. So when adopting the
    // HTML-supplied div, renderSegments()' `.hb-track` lookup returned
    // null and the heatbar silently rendered nothing despite receiving
    // live bot_thinking / signal_analysis data. Build the scaffold here.
    const existing = document.getElementById(ROOT_ID);
    if (existing) {
      if (!existing.querySelector('.hb-track')) {
        existing.innerHTML = SCAFFOLD_HTML;
      }
      state.mounted = true;
      renderPlaceholder();
      return true;
    }
    const container = document.querySelector('.chart-container');
    if (!container) return false;
    const chart = document.getElementById('tvChartContainer');
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = SCAFFOLD_HTML;
    if (chart && chart.parentNode === container) {
      container.insertBefore(root, chart);
    } else {
      container.appendChild(root);
    }
    state.mounted = true;
    renderPlaceholder();
    return true;
  }

  // ─── Render ─────────────────────────────────────────────────────────

  function renderPlaceholder() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const track = root.querySelector('.hb-track');
    const tag = root.querySelector('.hb-winner-tag');
    if (track) track.innerHTML = '<span class="hb-placeholder">awaiting ensemble signal…</span>';
    if (tag) {
      tag.textContent = '';
      tag.classList.remove('hb-visible');
    }
  }
  function renderSegments(stack, winnerName) {
    if (!mount()) return;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const track = root.querySelector('.hb-track');
    const tag = root.querySelector('.hb-winner-tag');
    if (!track) return;
    if (!Array.isArray(stack) || stack.length === 0) {
      renderPlaceholder();
      return;
    }

    // Determine the dominant direction (from winner if known, else from top-conf entry).
    let leader = null;
    if (winnerName) {
      leader = stack.find(s => s.name === winnerName) || null;
    }
    if (!leader) {
      leader = [...stack].sort((a, b) => b.confidence - a.confidence)[0] || null;
    }
    const leaderDir = leader ? leader.direction : null;
    const frag = document.createDocumentFragment();
    for (const s of stack) {
      const seg = document.createElement('div');
      const isWinner = winnerName && s.name === winnerName;
      const isOpposing = leaderDir && s.direction && s.direction !== leaderDir;
      seg.className = 'hb-segment' + (isWinner ? ' hb-winner' : '') + (isOpposing ? ' hb-opposing' : '');
      seg.style.flexGrow = String(0.6 + s.confidence * 2.2);
      seg.title = `${s.name} · ${(s.confidence * 100).toFixed(0)}%${s.direction ? ' ' + s.direction.toUpperCase() : ''}`;
      const fill = document.createElement('div');
      fill.className = 'hb-fill';
      fill.style.transform = `scaleX(${Math.max(0.04, s.confidence)})`;
      seg.appendChild(fill);
      const name = document.createElement('span');
      name.className = 'hb-name';
      name.textContent = s.name;
      seg.appendChild(name);
      const conf = document.createElement('span');
      conf.className = 'hb-conf';
      conf.textContent = `${(s.confidence * 100).toFixed(0)}%`;
      seg.appendChild(conf);
      frag.appendChild(seg);
    }
    track.innerHTML = '';
    track.appendChild(frag);
    if (tag) {
      if (winnerName) {
        tag.textContent = `🏆 ${winnerName}`;
        tag.classList.add('hb-visible');
      } else {
        tag.textContent = '';
        tag.classList.remove('hb-visible');
      }
    }
    state.stack = stack;
    state.winner = winnerName || null;
    state.lastUpdate = Date.now();
  }

  // ─── Public API ─────────────────────────────────────────────────────

  const Heatbar = {
    init() {
      try {
        injectStyles();
        mount();
        const socket = OGZ.get && OGZ.get('Socket');
        if (!socket || !socket.registerHandler) return;

        // 1. bot_thinking (primary path)
        socket.registerHandler('bot_thinking', d => {
          try {
            if (!d) return;
            const stack = normalizeStack(d.strategy_stack);
            if (stack.length === 0) return;
            const winner = d.winner_id || d.winner && d.winner.id || d.winner && d.winner.name || null;
            renderSegments(stack, winner);
          } catch (_) {/* never let a render kill the feed */}
        });

        // 2. signal_analysis (TradingLoop emissions)
        socket.registerHandler('signal_analysis', d => {
          try {
            if (!d) return;
            const signals = d.signal && Array.isArray(d.signal.signals) ? d.signal.signals : null;
            if (!signals || signals.length === 0) return;
            const stack = normalizeStack(signals);
            if (stack.length === 0) return;
            const winner = d.modules && d.modules.orchestrator && d.modules.orchestrator.winner || d.signal && d.signal.winner || null;
            renderSegments(stack, winner);
          } catch (_) {/* swallow */}
        });

        // 3. orchestrator_result (legacy / fallback)
        socket.registerHandler('orchestrator_result', d => {
          try {
            if (!d) return;
            const src = d.signalBreakdown && d.signalBreakdown.signals || d.allResults || null;
            if (!src) return;
            const stack = normalizeStack(src);
            if (stack.length === 0) return;
            const winner = d.winner && (d.winner.name || d.winner.strategyName) || d.winnerName || null;
            renderSegments(stack, winner);
          } catch (_) {/* swallow */}
        });
      } catch (_) {/* never throw from init */}
    },
    render(stack, winnerName) {
      try {
        renderSegments(normalizeStack(stack), winnerName || null);
      } catch (_) {/* swallow */}
    },
    clear() {
      state.stack = [];
      state.winner = null;
      renderPlaceholder();
    }
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('Heatbar', Heatbar);
  } else {
    // Defer if OGZ not ready (matches command-palette pattern)
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('Heatbar', Heatbar);
      }
    });
  }

  // Expose for debug
  try {
    window.OGZHeatbar = Heatbar;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/confidence-heatbar.js", error: String((e && e.message) || e) }); }

// public/js/panels/custom-alerts.js
try { (() => {
/**
 * custom-alerts.js - CustomAlerts: 5-priority alert dispatcher + UI
 *
 * The spine of the celebration / emotional layer. Subscribes to bot trade
 * events and StateManager updates, classifies each event into one of five
 * priorities (info/warning/critical/victory/roast), and emits both a visual
 * toast in the top-right corner AND an OGZ.bus event that downstream
 * celebration modules (VictoryAnimations, LossRecovery, MilestoneEffects)
 * can react to.
 *
 * Single source of truth for "trade fired" classification on the dashboard.
 *
 * Self-registers as OGZ.CustomAlerts via OGZ.register().
 * Self-injects CSS and DOM mount into <body>.
 *
 * Verified WS subscriptions (real bot emitter shapes):
 *   - 'trade' (OrderExecutor): { type, action, direction, price, pnl,
 *     timestamp, confidence, duration? }
 *     - BUY / SELL_SHORT     -> info  (entry)
 *     - SELL  with pnl > 0   -> victory (long win)
 *     - SELL  with pnl < 0   -> roast / critical depending on streak
 *     - COVER with pnl > 0   -> victory (short win)
 *     - COVER with pnl < 0   -> roast / critical
 *   - 'state_update' (StateManager): tracks tradeCount for win/loss streak
 *     and recoveryMode -> warning
 *
 * Emits OGZ.bus events (downstream celebration modules subscribe to these):
 *   - 'celebration:win'  { pnl, direction, price, timestamp, streakWin }
 *   - 'celebration:loss' { pnl, direction, price, timestamp, streakLoss }
 *   - 'celebration:milestone' { equity }          (from state_update)
 *   - 'celebration:alert' { type, message, ts }   (every alert fires this)
 *
 * Public API:
 *   init() - mount, inject styles, wire socket
 *   createAlert(message, type, options) - manually create an alert
 *   getAlerts() - Array of recent alerts
 *   clearAll() - empty the toast stack
 *   teardown() - full cleanup
 *   _compute() - debug snapshot
 *
 * NO synthetic alerts. NO Math.random. Every alert is driven by a real
 * bot-side broadcast. If nothing fires, nothing shows.
 *
 * @module public/js/panels/custom-alerts
 */
(function (OGZ) {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────
  const STYLE_ID = 'ogz-custom-alerts-styles';
  const ROOT_ID = 'ogzCustomAlertsRoot';
  const MAX_ALERTS_VISIBLE = 5; // stack cap on screen
  const MAX_ALERTS_MEMORY = 50; // history retention in state
  const TOAST_DURATION_MS = {
    info: 3500,
    warning: 6000,
    critical: 8000,
    victory: 5000,
    roast: 5000
  };

  // 5 priority definitions — icon / color / sound key for downstream
  const PRIORITIES = {
    info: {
      icon: 'ℹ',
      color: '#17a2b8',
      label: 'INFO'
    },
    warning: {
      icon: '⚠',
      color: '#ffc107',
      label: 'WARN'
    },
    critical: {
      icon: '⛔',
      color: '#dc3545',
      label: 'CRIT'
    },
    victory: {
      icon: '🎉',
      color: '#28a745',
      label: 'WIN'
    },
    roast: {
      icon: '🔥',
      color: '#ff6b6b',
      label: 'L'
    }
  };

  // Streak thresholds - switch from roast to encouragement at 3+
  const STREAK_ROAST_LIMIT = 2;

  // ─── Module State ───────────────────────────────────────────────────
  const state = {
    mounted: false,
    alerts: [],
    // history of recent alerts
    domRefs: {
      root: null
    },
    streakWin: 0,
    streakLoss: 0,
    lastTradeCount: 0,
    lastEquity: 0,
    lastRecoveryMode: false
  };

  // ─── Event Bus Shim ─────────────────────────────────────────────────
  function ensureEventBus() {
    if (OGZ && OGZ.bus) return;
    const listeners = new Map();
    OGZ.bus = {
      on(event, h) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(h);
      },
      off(event, h) {
        if (!listeners.has(event)) return;
        const l = listeners.get(event);
        const i = l.indexOf(h);
        if (i >= 0) l.splice(i, 1);
      },
      emit(event, data) {
        if (!listeners.has(event)) return;
        listeners.get(event).forEach(h => {
          try {
            h(data);
          } catch (_) {/* swallow */}
        });
      }
    };
  }

  // ─── CSS Injection ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                position: fixed;
                top: 80px;
                right: 16px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                z-index: 9500;
                pointer-events: none;
                max-width: 360px;
                font-family: 'JetBrains Mono', monospace;
            }
            .oca-toast {
                pointer-events: auto;
                background: rgba(15, 15, 22, 0.94);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-left-width: 3px;
                border-radius: 6px;
                padding: 10px 14px;
                color: #e6e6e6;
                font-size: 12px;
                line-height: 1.4;
                box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45),
                            0 0 0 1px rgba(255, 255, 255, 0.02) inset;
                backdrop-filter: blur(8px) saturate(160%);
                opacity: 0;
                transform: translateX(20px);
                transition: opacity 200ms ease, transform 200ms ease;
                display: flex;
                gap: 10px;
                align-items: flex-start;
            }
            .oca-toast.show { opacity: 1; transform: translateX(0); }
            .oca-toast.dismissing { opacity: 0; transform: translateX(20px); }
            .oca-toast.info     { border-left-color: #17a2b8; }
            .oca-toast.warning  { border-left-color: #ffc107; }
            .oca-toast.critical { border-left-color: #dc3545; }
            .oca-toast.victory  {
                border-left-color: #28a745;
                box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45),
                            0 0 18px rgba(34, 197, 94, 0.25);
            }
            .oca-toast.roast    {
                border-left-color: #ff6b6b;
                box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45),
                            0 0 18px rgba(255, 107, 107, 0.18);
            }
            .oca-icon {
                font-size: 16px;
                line-height: 1;
                flex-shrink: 0;
                margin-top: 1px;
            }
            .oca-body {
                flex: 1;
                min-width: 0;
            }
            .oca-label {
                font-size: 9px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 1px;
                opacity: 0.65;
                margin-bottom: 2px;
            }
            .oca-msg {
                font-weight: 500;
                word-break: break-word;
            }
            .oca-time {
                font-size: 9px;
                opacity: 0.45;
                margin-top: 4px;
                font-feature-settings: "tnum";
            }
            .oca-close {
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.45);
                font-size: 14px;
                cursor: pointer;
                padding: 0;
                line-height: 1;
                transition: color 150ms;
            }
            .oca-close:hover { color: rgba(255, 255, 255, 0.85); }

            @media (prefers-reduced-motion: reduce) {
                .oca-toast { transition: opacity 100ms; transform: none !important; }
            }
        `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── DOM Mount ──────────────────────────────────────────────────────
  function mount() {
    if (state.mounted) return true;
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    state.domRefs.root = root;
    state.mounted = true;
    return true;
  }

  // ─── Toast Render ───────────────────────────────────────────────────
  function renderToast(alert) {
    if (!state.domRefs.root) return;
    const prio = PRIORITIES[alert.type] || PRIORITIES.info;
    const el = document.createElement('div');
    el.className = `oca-toast ${alert.type}`;
    el.dataset.alertId = alert.id;
    const icon = document.createElement('span');
    icon.className = 'oca-icon';
    icon.textContent = prio.icon;
    const body = document.createElement('div');
    body.className = 'oca-body';
    const label = document.createElement('div');
    label.className = 'oca-label';
    label.textContent = prio.label;
    const msg = document.createElement('div');
    msg.className = 'oca-msg';
    msg.textContent = alert.message;
    const time = document.createElement('div');
    time.className = 'oca-time';
    time.textContent = formatTime(alert.timestamp);
    body.appendChild(label);
    body.appendChild(msg);
    body.appendChild(time);
    const close = document.createElement('button');
    close.className = 'oca-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    close.addEventListener('click', () => dismiss(el));
    el.appendChild(icon);
    el.appendChild(body);
    el.appendChild(close);

    // Insert at top; cap visible stack
    state.domRefs.root.insertBefore(el, state.domRefs.root.firstChild);
    const visible = state.domRefs.root.querySelectorAll('.oca-toast');
    if (visible.length > MAX_ALERTS_VISIBLE) {
      for (let i = MAX_ALERTS_VISIBLE; i < visible.length; i++) {
        dismiss(visible[i]);
      }
    }

    // Animate in next frame
    requestAnimationFrame(() => el.classList.add('show'));

    // Auto-dismiss
    const duration = TOAST_DURATION_MS[alert.type] || TOAST_DURATION_MS.info;
    setTimeout(() => dismiss(el), duration);
  }
  function dismiss(el) {
    if (!el || el.classList.contains('dismissing')) return;
    el.classList.add('dismissing');
    setTimeout(() => {
      try {
        el.remove();
      } catch (_) {}
    }, 250);
  }
  function formatTime(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  // ─── Core: createAlert (public + internal entry point) ──────────────
  function createAlert(message, type, options) {
    if (!message || !type || !PRIORITIES[type]) return null;
    const alert = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      message: String(message),
      type: type,
      timestamp: Date.now(),
      metadata: options && options.metadata || {}
    };
    state.alerts.unshift(alert);
    if (state.alerts.length > MAX_ALERTS_MEMORY) state.alerts.length = MAX_ALERTS_MEMORY;
    renderToast(alert);

    // Broadcast to other modules
    if (OGZ.bus) {
      OGZ.bus.emit('celebration:alert', {
        type: alert.type,
        message: alert.message,
        ts: alert.timestamp,
        metadata: alert.metadata
      });
    }
    return alert;
  }

  // ─── Trade Classification ───────────────────────────────────────────
  // Bot 'trade' event:
  //   { type:'trade', action:'BUY'|'SELL'|'SELL_SHORT'|'COVER',
  //     direction:'long'|'short', price, pnl, timestamp, confidence, duration? }
  function handleTrade(d) {
    try {
      const data = d && d.data ? d.data : d;
      if (!data || !data.action) return;
      const action = String(data.action).toUpperCase();
      const pnl = Number(data.pnl) || 0;
      const price = Number(data.price) || 0;
      const dir = String(data.direction || (action === 'BUY' ? 'long' : 'short')).toLowerCase();
      const ts = Number(data.timestamp) || Date.now();
      const isEntry = action === 'BUY' || action === 'SELL_SHORT';
      const isClose = action === 'SELL' || action === 'COVER';
      if (isEntry) {
        createAlert(`${dir === 'short' ? 'SHORT' : 'LONG'} entered @ $${price.toFixed(2)}` + (data.confidence != null ? ` · conf ${Number(data.confidence).toFixed(0)}%` : ''), 'info', {
          metadata: {
            action,
            dir,
            price,
            ts
          }
        });
        return;
      }
      if (isClose) {
        const win = pnl > 0;
        const loss = pnl < 0;
        if (win) {
          state.streakWin++;
          state.streakLoss = 0;
          const sign = pnl >= 0 ? '+' : '';
          createAlert(`${dir === 'short' ? 'COVER' : 'SELL'} @ $${price.toFixed(2)} · ${sign}$${pnl.toFixed(2)}` + (state.streakWin > 1 ? ` · ${state.streakWin}W streak` : ''), 'victory', {
            metadata: {
              action,
              dir,
              price,
              pnl,
              ts,
              streak: state.streakWin
            }
          });
          if (OGZ.bus) {
            OGZ.bus.emit('celebration:win', {
              pnl,
              direction: dir,
              price,
              timestamp: ts,
              streakWin: state.streakWin
            });
          }
        } else if (loss) {
          state.streakLoss++;
          state.streakWin = 0;
          const type = state.streakLoss > STREAK_ROAST_LIMIT ? 'critical' : 'roast';
          createAlert(`${dir === 'short' ? 'COVER' : 'SELL'} @ $${price.toFixed(2)} · -$${Math.abs(pnl).toFixed(2)}` + (state.streakLoss > 1 ? ` · ${state.streakLoss}L streak` : ''), type, {
            metadata: {
              action,
              dir,
              price,
              pnl,
              ts,
              streak: state.streakLoss
            }
          });
          if (OGZ.bus) {
            OGZ.bus.emit('celebration:loss', {
              pnl,
              direction: dir,
              price,
              timestamp: ts,
              streakLoss: state.streakLoss
            });
          }
        } else {
          // pnl == 0: scratch / break-even close
          createAlert(`${dir === 'short' ? 'COVER' : 'SELL'} @ $${price.toFixed(2)} · break-even`, 'info', {
            metadata: {
              action,
              dir,
              price,
              pnl: 0,
              ts
            }
          });
        }
      }
    } catch (_) {/* swallow */}
  }

  // ─── State Update - recoveryMode warnings + equity for milestones ──
  function handleStateUpdate(d) {
    try {
      const s = d && d.state ? d.state : null;
      if (!s) return;
      const equity = Number(s.equity) || 0;
      const recovery = !!s.recoveryMode;

      // Recovery-mode entry warning (fires once on edge)
      if (recovery && !state.lastRecoveryMode) {
        createAlert('Recovery mode active - bot self-throttled after drawdown', 'warning', {
          metadata: {
            reason: 'recoveryMode'
          }
        });
      }
      state.lastRecoveryMode = recovery;
      state.lastEquity = equity;

      // Forward to milestone module (it owns tier decisions)
      if (OGZ.bus && equity > 0) {
        OGZ.bus.emit('celebration:milestone', {
          equity
        });
      }
    } catch (_) {/* swallow */}
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const api = {
    init() {
      try {
        ensureEventBus();
        injectStyles();
        if (!mount()) return;

        // Bind socket — poll until ready
        (function bindSocket() {
          const socket = OGZ && typeof OGZ.get === 'function' ? OGZ.get('Socket') : null;
          if (!socket || typeof socket.registerHandler !== 'function') {
            setTimeout(bindSocket, 250);
            return;
          }
          socket.registerHandler('trade', e => {
            try {
              handleTrade(e);
            } catch (_) {}
          });
          socket.registerHandler('state_update', e => {
            try {
              handleStateUpdate(e);
            } catch (_) {}
          });
        })();
      } catch (_) {/* swallow */}
    },
    createAlert,
    getAlerts: () => state.alerts.slice(),
    clearAll() {
      state.alerts.length = 0;
      if (state.domRefs.root) state.domRefs.root.innerHTML = '';
    },
    teardown() {
      this.clearAll();
      const style = document.getElementById(STYLE_ID);
      if (style) style.remove();
      const root = document.getElementById(ROOT_ID);
      if (root) root.remove();
      state.mounted = false;
      state.domRefs.root = null;
    },
    _compute() {
      return {
        mounted: state.mounted,
        alertsInMemory: state.alerts.length,
        streakWin: state.streakWin,
        streakLoss: state.streakLoss,
        lastEquity: state.lastEquity,
        lastRecoveryMode: state.lastRecoveryMode
      };
    }
  };

  // ─── Registration ───────────────────────────────────────────────────
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('CustomAlerts', api);
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('CustomAlerts', api);
      }
    });
  }
  try {
    window.OGZCustomAlerts = api;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/custom-alerts.js", error: String((e && e.message) || e) }); }

// public/js/panels/edge-analytics-panel.js
try { (() => {
/**
 * edge-analytics-panel.js — Self-Rendering Edge Analytics Panel
 *
 * Self-creates the 8-section edge analytics scaffold at mount time.
 * NO synthetic data. NO Math.random. NO simulated feeds. NO setDemoMode.
 * Every value rendered originates from a real WS event from the bot.
 *
 * Sections (each is empty/placeholder until a real event populates it):
 *   1. Liquidation Levels   — fed by WS 'liquidation_data'
 *   2. CVD (Order Flow)     — fed by WS 'cvd_update' (history accumulated locally from real events)
 *   3. Funding Rates        — fed by WS 'funding_rate'
 *   4. Whale Activity       — fed by WS 'whale_trade'
 *   5. Market Internals     — fed by WS 'market_internals' (includes absorption detection)
 *   6. Smart Money          — fed by WS 'smart_money'
 *   7. Fear & Greed         — fed by WS 'fear_greed'
 *   8. Hidden Divergences   — fed by WS 'divergence'
 *
 * If a backend emitter is not yet wired for a given event type, that section
 * stays in its empty/honest placeholder state forever. We never fabricate.
 *
 * Public API:
 *   init()       — render scaffold, subscribe to real WS events
 *   setSymbol()  — record current symbol context (for future symbol-scoped events)
 *   clearAll()   — reset all sections to empty/placeholder state
 *   teardown()   — disconnect WS handlers, clear DOM
 *   _compute()   — debug helper
 *
 * Mount: <div id="edgeAnalyticsPanel"></div> in the dashboard shell.
 *
 * @module public/js/panels/edge-analytics-panel
 */
(function (OGZ) {
  'use strict';

  const STYLE_ID = 'ogz-edge-analytics-panel-styles';
  const ROOT_ID = 'edgeAnalyticsPanel';
  const CVD_HISTORY_MAX = 60; // accumulated from real cvd_update events only
  const WHALE_ALERTS_MAX = 5; // most-recent N real whale_trade events kept on screen
  const ABSORPTION_DELTA_MIN = 0; // lastPriceDelta > 0 + sellers aggressing = absorbed

  // Module state — accumulated only from real events
  const state = {
    mounted: false,
    currentSymbol: null,
    cvdHistory: [] // populated only by real cvd_update payloads
  };

  // Tracked socket handlers for clean teardown
  const _registeredHandlers = []; // [{type, fn}]

  // ─── Scaffold ─────────────────────────────────────────────────────────
  function renderScaffold() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return false;
    root.innerHTML = '';
    root.className = 'eap-root';

    // Section 1: Liquidation Levels
    const liqSection = document.createElement('div');
    liqSection.className = 'eap-section edge-section';
    liqSection.innerHTML = `
            <h4>💀 Liquidation Levels</h4>
            <div class="liq-levels">
                <div class="liq-level long-liq">
                    <span>Long Liq Zone:</span>
                    <span class="liq-price" id="longLiqPrice">--</span>
                    <span class="liq-volume" id="longLiqVol">--</span>
                </div>
                <div class="liq-level short-liq">
                    <span>Short Liq Zone:</span>
                    <span class="liq-price" id="shortLiqPrice">--</span>
                    <span class="liq-volume" id="shortLiqVol">--</span>
                </div>
            </div>
            <canvas id="liqHeatmap" width="300" height="150"></canvas>
        `;
    root.appendChild(liqSection);

    // Section 2: CVD
    const cvdSection = document.createElement('div');
    cvdSection.className = 'eap-section edge-section';
    cvdSection.innerHTML = `
            <h4>📊 CVD (Order Flow)</h4>
            <div class="cvd-display">
                <div class="cvd-value" id="cvdValue">--</div>
                <div class="cvd-trend" id="cvdTrend">--</div>
                <canvas id="cvdChart" width="300" height="100"></canvas>
            </div>
        `;
    root.appendChild(cvdSection);

    // Section 3: Funding Rates
    const fundingSection = document.createElement('div');
    fundingSection.className = 'eap-section edge-section';
    fundingSection.innerHTML = `
            <h4>💰 Funding Rates</h4>
            <div class="funding-display">
                <div class="funding-current">
                    <span>Current:</span>
                    <span class="funding-rate" id="currentFunding">--</span>
                </div>
                <div class="funding-predicted">
                    <span>Predicted:</span>
                    <span class="funding-rate" id="predictedFunding">--</span>
                </div>
                <div class="funding-signal" id="fundingSignal">--</div>
            </div>
        `;
    root.appendChild(fundingSection);

    // Section 4: Whale Activity
    const whaleSection = document.createElement('div');
    whaleSection.className = 'eap-section edge-section';
    whaleSection.innerHTML = `
            <h4>🐋 Whale Activity</h4>
            <div class="whale-alerts" id="whaleAlerts">
                <div class="whale-item eap-empty">Awaiting whale events...</div>
            </div>
        `;
    root.appendChild(whaleSection);

    // Section 5: Market Internals
    const internalsSection = document.createElement('div');
    internalsSection.className = 'eap-section edge-section';
    internalsSection.innerHTML = `
            <h4>🔍 Market Internals</h4>
            <div class="internals">
                <div class="internal-item">
                    <span>Buy/Sell Ratio:</span>
                    <span id="buySellRatio">--</span>
                </div>
                <div class="internal-item">
                    <span>Aggressor Side:</span>
                    <span id="aggressorSide">--</span>
                </div>
                <div class="internal-item">
                    <span>Order Book Imbalance:</span>
                    <span id="bookImbalance">--</span>
                </div>
                <div class="internal-item">
                    <span>Spread:</span>
                    <span id="spreadValue">--</span>
                </div>
            </div>
        `;
    root.appendChild(internalsSection);

    // Section 6: Smart Money
    const smartMoneySection = document.createElement('div');
    smartMoneySection.className = 'eap-section edge-section';
    smartMoneySection.innerHTML = `
            <h4>🧠 Smart Money</h4>
            <div class="smart-money">
                <div class="smart-item">
                    <span>Smart Money Flow:</span>
                    <span id="smartFlow" class="flow-value">--</span>
                </div>
                <div class="smart-item">
                    <span>Institutional Activity:</span>
                    <span id="instActivity">--</span>
                </div>
                <div class="smart-item">
                    <span>Old Coins Moving:</span>
                    <span id="dormancy">--</span>
                </div>
            </div>
        `;
    root.appendChild(smartMoneySection);

    // Section 7: Fear & Greed
    const fearGreedSection = document.createElement('div');
    fearGreedSection.className = 'eap-section edge-section';
    fearGreedSection.innerHTML = `
            <h4>😱 Fear & Greed</h4>
            <div class="fear-greed">
                <div class="fg-gauge">
                    <div class="fg-value" id="fgValue">--</div>
                    <div class="fg-label" id="fgLabel">--</div>
                    <div class="fg-bar">
                        <div class="fg-fill" id="fgFill" style="width:0%"></div>
                    </div>
                </div>
            </div>
        `;
    root.appendChild(fearGreedSection);

    // Section 8: Hidden Divergences
    const divergencesSection = document.createElement('div');
    divergencesSection.className = 'eap-section edge-section';
    divergencesSection.innerHTML = `
            <h4>🔮 Hidden Divergences</h4>
            <div class="divergences" id="divergences">
                <div class="divergence-item eap-empty">Awaiting divergence scanner...</div>
            </div>
        `;
    root.appendChild(divergencesSection);
    return true;
  }

  // ─── Real-event handlers ──────────────────────────────────────────────
  // Each handler renders ONLY when a real WS event arrives. No fallback.

  function onLiquidationData(d) {
    try {
      const data = d && d.data ? d.data : d;
      const longP = document.getElementById('longLiqPrice');
      const longV = document.getElementById('longLiqVol');
      const shortP = document.getElementById('shortLiqPrice');
      const shortV = document.getElementById('shortLiqVol');
      if (longP && data.longLiqPrice != null) longP.textContent = '$' + Number(data.longLiqPrice).toFixed(0);
      if (longV && data.longLiqVol != null) longV.textContent = '$' + (Number(data.longLiqVol) / 1e6).toFixed(1) + 'M';
      if (shortP && data.shortLiqPrice != null) shortP.textContent = '$' + Number(data.shortLiqPrice).toFixed(0);
      if (shortV && data.shortLiqVol != null) shortV.textContent = '$' + (Number(data.shortLiqVol) / 1e6).toFixed(1) + 'M';
    } catch (_) {/* swallow */}
  }
  function onCVDUpdate(d) {
    try {
      const data = d && d.data ? d.data : d;
      const valEl = document.getElementById('cvdValue');
      const trEl = document.getElementById('cvdTrend');
      if (data.cvdValue != null) {
        state.cvdHistory.push(Number(data.cvdValue));
        if (state.cvdHistory.length > CVD_HISTORY_MAX) state.cvdHistory.shift();
        if (valEl) {
          valEl.textContent = Number(data.cvdValue).toFixed(0);
          valEl.style.color = data.cvdValue > 0 ? 'var(--profit-color)' : 'var(--loss-color)';
        }
      }
      if (trEl && data.cvdTrend) trEl.textContent = data.cvdTrend;

      // Render CVD canvas chart from REAL accumulated history only
      const canvas = document.getElementById('cvdChart');
      if (canvas && state.cvdHistory.length > 1) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width,
          h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const min = Math.min(...state.cvdHistory);
        const max = Math.max(...state.cvdHistory);
        const range = max - min || 1;
        const zeroY = h - (0 - min) / range * h;
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.moveTo(0, zeroY);
        ctx.lineTo(w, zeroY);
        ctx.stroke();
        const last = state.cvdHistory[state.cvdHistory.length - 1];
        ctx.strokeStyle = last > 0 ? '#00ff88' : '#ff3366';
        ctx.lineWidth = 2;
        ctx.beginPath();
        state.cvdHistory.forEach((v, i) => {
          const x = i / (state.cvdHistory.length - 1) * w;
          const y = h - (v - min) / range * h;
          if (i === 0) ctx.moveTo(x, y);else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = last > 0 ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)';
        ctx.fill();
      }
    } catch (_) {/* swallow */}
  }
  function onWhaleTrade(d) {
    try {
      const data = d && d.data ? d.data : d;
      const container = document.getElementById('whaleAlerts');
      if (!container) return;

      // Drop the empty placeholder on first real event
      const empty = container.querySelector('.eap-empty');
      if (empty) empty.remove();
      const side = (data.side || '').toString().toUpperCase();
      const amount = Number(data.amount || 0);
      const price = Number(data.price || 0);
      const sym = data.symbol || data.ticker || '';
      const item = document.createElement('div');
      item.className = 'whale-item';
      item.style.cssText = `padding:8px; margin:4px 0; background:rgba(0,100,255,0.1); border-radius:4px; font-size:11px; border-left:3px solid ${side === 'BUY' ? 'var(--profit-color)' : 'var(--loss-color)'}`;
      item.innerHTML = `<span style="color:${side === 'BUY' ? 'var(--profit-color)' : 'var(--loss-color)'}; font-weight:800;">${side || '—'}</span> ${amount.toFixed(2)}${sym ? ' ' + sym : ''} @ $${price.toLocaleString()}`;
      container.prepend(item);
      while (container.children.length > WHALE_ALERTS_MAX) container.lastChild.remove();
    } catch (_) {/* swallow */}
  }
  function onFundingRate(d) {
    try {
      const data = d && d.data ? d.data : d;
      const cur = document.getElementById('currentFunding');
      const pred = document.getElementById('predictedFunding');
      const sig = document.getElementById('fundingSignal');
      if (cur && data.currentFunding != null) cur.textContent = (Number(data.currentFunding) * 100).toFixed(2) + '%';
      if (pred && data.predictedFunding != null) pred.textContent = (Number(data.predictedFunding) * 100).toFixed(2) + '%';
      if (sig && data.fundingSignal) sig.textContent = data.fundingSignal;
    } catch (_) {/* swallow */}
  }
  function onMarketInternals(d) {
    try {
      const data = d && d.data ? d.data : d;
      const aggEl = document.getElementById('aggressorSide');

      // Absorption detection: SELLERS aggressing BUT price moves up = absorbed
      const lastDelta = OGZ.state && typeof OGZ.state.lastPriceDelta === 'number' ? OGZ.state.lastPriceDelta : 0;
      const isAbsorption = data.aggressor === 'SELLERS' && lastDelta > ABSORPTION_DELTA_MIN;
      if (aggEl) {
        if (isAbsorption) {
          aggEl.innerHTML = 'SELLERS <span class="absorbed-glow" style="color:var(--profit-color); text-shadow:0 0 10px var(--profit-color);">[ABSORBED]</span>';
        } else if (data.aggressor) {
          aggEl.textContent = data.aggressor;
          aggEl.style.color = data.aggressor === 'BUYERS' ? 'var(--profit-color)' : 'var(--loss-color)';
        }
      }
      const bsr = document.getElementById('buySellRatio');
      if (bsr && data.buySellRatio != null) bsr.textContent = Number(data.buySellRatio).toFixed(2);
      const bi = document.getElementById('bookImbalance');
      if (bi && data.bookImbalance != null) bi.textContent = (Number(data.bookImbalance) * 100).toFixed(1) + '%';
      const sp = document.getElementById('spreadValue');
      if (sp && data.spread != null) sp.textContent = Number(data.spread).toFixed(3) + '%';
    } catch (_) {/* swallow */}
  }
  function onSmartMoney(d) {
    try {
      const data = d && d.data ? d.data : d;
      const sf = document.getElementById('smartFlow');
      const ia = document.getElementById('instActivity');
      const dm = document.getElementById('dormancy');
      if (sf && data.smartFlow) sf.textContent = data.smartFlow;
      if (ia && data.instActivity) ia.textContent = data.instActivity;
      if (dm && data.dormancy) dm.textContent = data.dormancy;
    } catch (_) {/* swallow */}
  }
  function onFearGreed(d) {
    try {
      const data = d && d.data ? d.data : d;
      const el = document.getElementById('fgValue');
      const fill = document.getElementById('fgFill');
      const label = document.getElementById('fgLabel');
      if (data.fgValue != null) {
        if (el) el.textContent = data.fgValue;
        if (fill) fill.style.width = data.fgValue + '%';
      }
      if (label && data.fgLabel) label.textContent = data.fgLabel;
    } catch (_) {/* swallow */}
  }
  function onDivergence(d) {
    try {
      const data = d && d.data ? d.data : d;
      const container = document.getElementById('divergences');
      if (!container || !Array.isArray(data.divergences)) return;
      container.innerHTML = '';
      data.divergences.forEach(div => {
        const item = document.createElement('div');
        item.className = 'divergence-item';
        item.textContent = div;
        container.appendChild(item);
      });
    } catch (_) {/* swallow */}
  }

  // ─── Subscription helper — uses the REAL OGZ.Socket pattern ─────────────
  function subscribe(socket, type, fn) {
    if (!socket || typeof socket.registerHandler !== 'function') return;
    socket.registerHandler(type, fn);
    _registeredHandlers.push({
      type,
      fn
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────
  const EdgeAnalyticsPanel = {
    init: function () {
      try {
        if (state.mounted) return;
        if (!renderScaffold()) return;
        state.mounted = true;
        const socket = OGZ.get && OGZ.get('Socket');
        if (socket) {
          subscribe(socket, 'liquidation_data', onLiquidationData);
          subscribe(socket, 'cvd_update', onCVDUpdate);
          subscribe(socket, 'whale_trade', onWhaleTrade);
          subscribe(socket, 'funding_rate', onFundingRate);
          subscribe(socket, 'market_internals', onMarketInternals);
          subscribe(socket, 'smart_money', onSmartMoney);
          subscribe(socket, 'fear_greed', onFearGreed);
          subscribe(socket, 'divergence', onDivergence);
        }
      } catch (_) {/* swallow */}
    },
    setSymbol: function (symbol) {
      try {
        state.currentSymbol = symbol || null;
      } catch (_) {/* swallow */}
    },
    clearAll: function () {
      try {
        state.cvdHistory.length = 0;
        ['longLiqPrice', 'longLiqVol', 'shortLiqPrice', 'shortLiqVol', 'cvdValue', 'cvdTrend', 'currentFunding', 'predictedFunding', 'fundingSignal', 'buySellRatio', 'aggressorSide', 'bookImbalance', 'spreadValue', 'smartFlow', 'instActivity', 'dormancy', 'fgValue', 'fgLabel'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '--';
        });
        const fgFill = document.getElementById('fgFill');
        if (fgFill) fgFill.style.width = '0%';
        const wa = document.getElementById('whaleAlerts');
        if (wa) wa.innerHTML = '<div class="whale-item eap-empty">Awaiting whale events...</div>';
        const dv = document.getElementById('divergences');
        if (dv) dv.innerHTML = '<div class="divergence-item eap-empty">Awaiting divergence scanner...</div>';
        const cvdCanvas = document.getElementById('cvdChart');
        if (cvdCanvas) {
          const ctx = cvdCanvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, cvdCanvas.width, cvdCanvas.height);
        }
      } catch (_) {/* swallow */}
    },
    teardown: function () {
      try {
        _registeredHandlers.length = 0; // OGZ.Socket has no unregister; we drop refs
        state.mounted = false;
        state.cvdHistory.length = 0;
      } catch (_) {/* swallow */}
    },
    _compute: function () {
      return {
        mounted: state.mounted,
        currentSymbol: state.currentSymbol,
        cvdHistoryLength: state.cvdHistory.length,
        registeredHandlers: _registeredHandlers.map(h => h.type)
      };
    }
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('EdgeAnalyticsPanel', EdgeAnalyticsPanel);
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('EdgeAnalyticsPanel', EdgeAnalyticsPanel);
      }
    });
  }
  try {
    window.OGZEdgeAnalyticsPanel = EdgeAnalyticsPanel;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/edge-analytics-panel.js", error: String((e && e.message) || e) }); }

// public/js/panels/edge-analytics.js
try { (() => {
/**
 * edge-analytics.js - Alpha Logic Panel
 * Whale Absorption, Confluence Matrix, Wall Radar, Spoof Detection
 *
 * LIVE features: updateMarketInternals (absorption detection)
 * DORMANT features: updateWallRadar (awaits depth_update from Kraken L2)
 * PARKED features: handleSpoofAlert (awaits spoof_alert emitter — handler present, not registered in core.js)
 */
(function (OGZ) {
  'use strict';

  const Edge = {
    // Bind panel toggle events
    init: function () {
      // Edge panel toggle
      const edgeToggle = document.querySelector('.edge-toggle');
      if (edgeToggle) edgeToggle.addEventListener('click', () => this.togglePanel());
      const edgeHeader = document.querySelector('.edge-header');
      if (edgeHeader) edgeHeader.addEventListener('click', () => this.togglePanel());

      // Start simulated data generators for display
      // These populate the Edge panel until real backend data replaces them
      this.startSimulatedFeeds();
    },
    startSimulatedFeeds: function () {
      const lastPrice = () => OGZ.state.lastPrice || 73000;

      // Whale alert monitor — simulated until real whale_trade events
      setInterval(() => {
        if (Math.random() > 0.8) {
          const container = document.getElementById('whaleAlerts');
          if (!container) return;
          const amount = (Math.random() * 10 + 1).toFixed(2);
          const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
          const price = (lastPrice() * (1 + (Math.random() - 0.5) * 0.002)).toFixed(2);
          const item = document.createElement('div');
          item.className = 'whale-item';
          item.style.cssText = `padding:8px; margin:4px 0; background:rgba(0,100,255,0.1); border-radius:4px; font-size:11px; border-left:3px solid ${side === 'BUY' ? 'var(--profit-color)' : 'var(--loss-color)'}`;
          item.innerHTML = `<span style="color:${side === 'BUY' ? 'var(--profit-color)' : 'var(--loss-color)'}; font-weight:800;">${side}</span> ${amount} BTC @ $${parseFloat(price).toLocaleString()}`;
          container.prepend(item);
          if (container.children.length > 5) container.lastChild.remove();
        }
      }, 8000);

      // CVD simulation with chart
      let cvdValue = 0;
      const cvdHistory = [];
      setInterval(() => {
        cvdValue += (Math.random() - 0.48) * 50;
        cvdHistory.push(cvdValue);
        if (cvdHistory.length > 60) cvdHistory.shift();
        const el = document.getElementById('cvdValue');
        const trend = document.getElementById('cvdTrend');
        if (el) {
          el.textContent = cvdValue.toFixed(0);
          el.style.color = cvdValue > 0 ? 'var(--profit-color)' : 'var(--loss-color)';
        }
        if (trend) trend.textContent = cvdValue > 50 ? 'BULLISH' : cvdValue < -50 ? 'BEARISH' : 'NEUTRAL';

        // Draw CVD chart on canvas
        const canvas = document.getElementById('cvdChart');
        if (canvas && cvdHistory.length > 2) {
          const ctx = canvas.getContext('2d');
          const w = canvas.width,
            h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          const min = Math.min(...cvdHistory);
          const max = Math.max(...cvdHistory);
          const range = max - min || 1;

          // Zero line
          const zeroY = h - (0 - min) / range * h;
          ctx.strokeStyle = 'rgba(255,255,255,0.1)';
          ctx.beginPath();
          ctx.moveTo(0, zeroY);
          ctx.lineTo(w, zeroY);
          ctx.stroke();

          // CVD line
          ctx.strokeStyle = cvdValue > 0 ? '#00ff88' : '#ff3366';
          ctx.lineWidth = 2;
          ctx.beginPath();
          cvdHistory.forEach((v, i) => {
            const x = i / (cvdHistory.length - 1) * w;
            const y = h - (v - min) / range * h;
            if (i === 0) ctx.moveTo(x, y);else ctx.lineTo(x, y);
          });
          ctx.stroke();

          // Fill under the line
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.closePath();
          ctx.fillStyle = cvdValue > 0 ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)';
          ctx.fill();
        }
      }, 5000);

      // Fear & Greed simulation
      setInterval(() => {
        const value = Math.round(30 + Math.random() * 40);
        const el = document.getElementById('fgValue');
        const fill = document.getElementById('fgFill');
        const label = document.getElementById('fgLabel');
        if (el) el.textContent = value;
        if (fill) fill.style.width = value + '%';
        if (label) {
          label.textContent = value < 25 ? 'EXTREME FEAR' : value < 40 ? 'FEAR' : value < 60 ? 'NEUTRAL' : value < 75 ? 'GREED' : 'EXTREME GREED';
        }
      }, 30000);

      // Market internals simulation (overridden by real market_internals from backend)
      setInterval(() => {
        const bsr = document.getElementById('buySellRatio');
        const bi = document.getElementById('bookImbalance');
        const spread = document.getElementById('spreadValue');
        const agg = document.getElementById('aggressorSide');
        if (bsr) bsr.textContent = (0.8 + Math.random() * 0.4).toFixed(2);
        if (bi) bi.textContent = (Math.random() * 20 - 10).toFixed(1) + '%';
        if (spread) spread.textContent = (Math.random() * 0.1).toFixed(3) + '%';
        if (agg) {
          const side = Math.random() > 0.5 ? 'BUYERS' : 'SELLERS';
          agg.textContent = side;
          agg.style.color = side === 'BUYERS' ? 'var(--profit-color)' : 'var(--loss-color)';
        }
      }, 5000);

      // Smart money flow simulation
      setInterval(() => {
        const flows = ['ACCUMULATING', 'DISTRIBUTING', 'NEUTRAL', 'STRONG INFLOW'];
        const activity = ['HIGH', 'MEDIUM', 'LOW'];
        const dormancy = ['LOW', 'MEDIUM', 'HIGH'];
        const sf = document.getElementById('smartFlow');
        const ia = document.getElementById('instActivity');
        const dm = document.getElementById('dormancy');
        if (sf) sf.textContent = flows[Math.floor(Math.random() * flows.length)];
        if (ia) ia.textContent = activity[Math.floor(Math.random() * activity.length)];
        if (dm) dm.textContent = dormancy[Math.floor(Math.random() * dormancy.length)];
      }, 30000);

      // Divergence scanner simulation
      setInterval(() => {
        const container = document.getElementById('divergences');
        if (!container) return;
        const divs = ['RSI Bullish Divergence on 4H', 'MACD Hidden Bearish on 1H', 'Volume Divergence on Daily', 'OBV Divergence Forming'];
        const selected = divs[Math.floor(Math.random() * divs.length)];
        container.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'divergence-item';
        div.textContent = selected;
        container.appendChild(div);
      }, 15000);

      // Liquidation level calculation
      setInterval(() => {
        const p = lastPrice();
        if (!p) return;
        const longLiq = document.getElementById('longLiqPrice');
        const shortLiq = document.getElementById('shortLiqPrice');
        if (longLiq) longLiq.textContent = '$' + (p * 0.95).toFixed(0);
        if (shortLiq) shortLiq.textContent = '$' + (p * 1.05).toFixed(0);
      }, 60000);
    },
    togglePanel: function () {
      const panel = document.getElementById('edgePanel');
      if (!panel) return;
      const willCollapse = !panel.classList.contains('collapsed');
      panel.classList.toggle('collapsed');
      // BUG FIX 2026-04-27: trigger the .main-container.left-collapsed
      // adaptive padding (defined at unified-dashboard.html:320) so the
      // chart fills the freed space when Edge Analytics collapses.
      // Without this the padding-left:340px stayed put and the chart
      // visually sat under the collapsed rail.
      const main = document.querySelector('.main-container');
      if (main) main.classList.toggle('left-collapsed', willCollapse);
      // Force chart resize after the 300ms padding transition lands so
      // lightweight-charts redraws into the new container width.
      setTimeout(() => {
        if (window.tvChart && typeof window.tvChart.resize === 'function') {
          const c = document.getElementById('tvChartContainer');
          if (c) window.tvChart.resize(c.clientWidth, c.clientHeight);
        }
        window.dispatchEvent(new Event('resize'));
      }, 320);
    },
    // DORMANT: Confluence Matrix rendering (awaits golden_setup_state emitter)
    renderConfluenceMatrix: function (conditions) {
      const container = document.getElementById('divergences');
      if (!container || !conditions) return;
      container.innerHTML = conditions.map(c => `
                <div class="matrix-item ${c.status === 'MET' ? 'met' : 'waiting'}"
                     style="padding: 8px; border-left: 3px solid ${c.status === 'MET' ? 'var(--profit-color)' : '#333'}; background: rgba(255,255,255,0.02); margin-bottom: 4px;">
                    <span style="font-size: 12px; color: ${c.status === 'MET' ? '#fff' : '#777'};">${c.label}</span>
                    <span style="float: right; font-size: 10px; font-weight: 800;">${c.status}</span>
                </div>
            `).join('');
    },
    // LIVE: Aggressor Absorption detection
    // Backend: DashboardBroadcaster.js:152 emits market_internals with aggressor, buySellRatio, bookImbalance
    updateMarketInternals: function (data) {
      const aggEl = document.getElementById('aggressorSide');
      if (!aggEl) return;

      // THE ALPHA: If SELLERS are slamming the bid, but price delta is POSITIVE = Absorption
      const isAbsorption = data.aggressor === 'SELLERS' && OGZ.state.lastPriceDelta > 0;
      if (isAbsorption) {
        aggEl.innerHTML = 'SELLERS <span class="absorbed-glow" style="color:var(--profit-color); text-shadow: 0 0 10px var(--profit-color);">[ABSORBED]</span>';
      } else {
        aggEl.textContent = data.aggressor;
        aggEl.style.color = data.aggressor === 'BUYERS' ? 'var(--profit-color)' : 'var(--loss-color)';
      }
      const bsrEl = document.getElementById('buySellRatio');
      if (bsrEl) bsrEl.textContent = data.buySellRatio.toFixed(2);
      const biEl = document.getElementById('bookImbalance');
      if (biEl) biEl.textContent = (data.bookImbalance * 100).toFixed(1) + '%';
    },
    // DORMANT: Whale Wall Radar (awaits depth_update from Kraken L2)
    updateWallRadar: function (data) {
      const container = document.getElementById('whaleAlerts');
      if (!container) return;
      if (!data.isLive) {
        container.innerHTML = '<div style="opacity:0.3; font-size:10px;">DEPTH RADAR DORMANT (L1 ONLY)</div>';
        return;
      }
      let html = '<p style="font-size:10px; color:var(--ml-color); margin-bottom:8px; letter-spacing:1px;">WHALE DEPTH RADAR</p>';
      data.walls.forEach(wall => {
        const distance = Math.abs((wall.price - OGZ.state.lastPrice) / OGZ.state.lastPrice * 100).toFixed(2);
        const color = wall.side === 'BID' ? 'var(--profit-color)' : 'var(--loss-color)';
        html += `
                    <div class="wall-row" style="border-left: 2px solid ${color}; background:rgba(255,255,255,0.02); padding:6px; margin-bottom:4px;">
                        <div style="display:flex; justify-content:space-between; font-size:10px;">
                            <span style="color:${color}">${wall.side} WALL</span>
                            <span style="color:#666;">${distance}% away</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:baseline;">
                            <span style="font-family:Orbitron; font-size:13px;">$${wall.price.toLocaleString()}</span>
                            <span style="font-size:10px; font-weight:800;">$${(wall.size / 1000000).toFixed(1)}M</span>
                        </div>
                    </div>`;
      });
      container.innerHTML = html;
    },
    // PARKED: Spoof alert rendering (file on disk, handler NOT registered in core.js)
    handleSpoofAlert: function (data) {
      const container = document.getElementById('whaleAlerts');
      if (!container || !data.alerts) return;
      data.alerts.forEach(spoof => {
        const alertEl = document.createElement('div');
        alertEl.className = 'spoof-alert-row';
        alertEl.style = `
                    background: rgba(255, 51, 102, 0.15);
                    border: 1px solid var(--loss-color);
                    padding: 10px; margin-bottom: 6px; border-radius: 4px;
                    animation: flash-red 0.5s infinite alternate;
                `;
        alertEl.innerHTML = `
                    <div style="display:flex; justify-content:space-between; font-size:10px; font-weight:900; color:var(--loss-color);">
                        <span>SPOOF DETECTED</span><span>PULLED</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:4px;">
                        <span style="font-family:Orbitron; font-size:14px;">$${spoof.price.toLocaleString()}</span>
                        <span style="color:#fff;">-$${(spoof.valuePulled / 1000000).toFixed(1)}M</span>
                    </div>
                `;
        container.prepend(alertEl);
        setTimeout(() => alertEl.remove(), 10000);
      });
    }
  };
  OGZ.register('Edge', Edge);
})(window.OGZ);
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/edge-analytics.js", error: String((e && e.message) || e) }); }

// public/js/panels/equity-curve.js
try { (() => {
/**
 * equity-curve.js — EquityCurve: Session/Multi-Day Equity Visualization
 *
 * Live equity curve panel mounted in the dashboard footer-left. Displays account
 * session/multi-day equity as an SVG line chart with horizontal dashed reference lines
 * (profit target in gold, max drawdown floor in red) and trade markers (green/red dots)
 * at entry/exit points along the curve. Critical for Apex eval where the operator watches
 * drawdown in real time and monitors progress toward profit target.
 *
 * What it renders (top to bottom):
 *   1. Title bar: "EQUITY CURVE" + range selector buttons (1D / 7D / 30D / ALL)
 *      Default range: ALL. Buttons are small pill-style with gold accent when active.
 *   2. SVG line chart:
 *      - X-axis: time (formatted by range — minutes/hours/days)
 *      - Y-axis: equity in $ (auto-scaled)
 *      - Main line: gold (var(--ml-color)), 1.5px stroke, smooth curve
 *      - Profit target: horizontal dashed line in gold, label "Profit Target: $X" floating right
 *      - Max DD floor: horizontal dashed line in red, label "Max DD: $X" floating right
 *      - Trade markers: small circles at each trade entry/exit
 *        * Green (r=2.5) if winner (pnl >= 0)
 *        * Red (r=2.5) if loser (pnl < 0)
 *        * Gray (r=2) if open
 *      - Hover trade marker: tooltip shows Time / Ticker / Side / P&L
 *      - Last data point: filled gold circle + value label floating right
 *   3. Stats row below chart:
 *      Current Balance / Total P&L / Return % / Target Progress % (tabular, monospace)
 *
 * Self-registers as OGZ.EquityCurve via OGZ.register().
 * Mounts into <div id="equityCurve"></div>.
 *
 * Subscribes to WS events:
 *   - state_update (TODO verify; most likely source for balance/equity)
 *   - balance_update (TODO verify; alternative balance sync)
 *   - trade (verified) - emitted when trade closes, provides symbol/side/pnl
 *   - price (verified) - live tick; if data.equity field present (verified in size-preview.js)
 *                          it may drive live equity recalc. Fallback: sample every ~10s.
 * Listens to OGZ.bus:
 *   - account:change - to swap the curve when operator changes account
 *
 * Internal state:
 *   - Holds in-memory rolling buffer of EquitySample objects (default 1000 samples)
 *   - Older samples decimated when buffer fills to maintain ~1000-point granularity
 *   - Trades: Map<tradeId => TradeMarker> to plot entry/exit markers
 *   - profitTarget, maxDDFloor: $ amounts (set manually or via config)
 *   - range: '1d', '7d', '30d', 'all' (default 'all')
 *
 * Public API:
 *   init() — Mount to DOM, inject styles, subscribe to WS + bus events
 *   setRange(range) — Switch to 1d/7d/30d/all and re-render
 *   setProfitTarget(amt) — Set $ profit target (will update horizontal line)
 *   setMaxDDFloor(amt) — Set $ max drawdown floor (will update red floor line)
 *   addEquitySample(ts, equity) — Manual sample injection; auto-decimates if buffer full
 *   addTradeMarker(ts, ticker, side, pnl) — Log trade entry/exit with P&L for marker placement
 *   clear() — Remove all samples and markers (respects buffer cap)
 *   teardown() — Remove DOM, listeners, styles
 *   _compute() — Debug helper: return {samples, trades, profitTarget, maxDDFloor, range, mounted}
 *
 * NO synthetic data. NO demo mode. NO Math.random. The curve only renders
 * samples that arrive from real WS events (price w/ data.equity, balance_update,
 * state_update with state.equity) and real closed trades. Empty state until
 * the first sample arrives.
 *
 * @typedef {Object} EquitySample
 * @property {number} ts - Unix epoch milliseconds
 * @property {number} equity - Account equity at this moment ($)
 *
 * @typedef {Object} TradeMarker
 * @property {number} ts - Close time epoch milliseconds
 * @property {string} ticker - Symbol traded (e.g., 'TSLA')
 * @property {'long'|'short'} side - Position side
 * @property {number} pnl - Realized P&L in $
 * @property {number} equityAt - Equity level at close (for vertical placement)
 *
 * @module public/js/panels/equity-curve
 */
(function (OGZ) {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────
  const STYLE_ID = 'ogz-equity-curve-styles';
  const ROOT_ID = 'equityCurve';
  const MAX_SAMPLES = 1000;
  const DEFAULT_RANGE = 'all';
  const SAMPLE_INTERVAL_MS = 10000; // Sample every ~10s if price ticks don't provide equity
  const DECIMATION_FACTOR = 0.7; // Keep 70% of old samples when decimating

  // Monotonic counter used to disambiguate trade IDs when two real closed
  // trades land at the exact same epoch ms on the same ticker. NOT a source
  // of fake data — only a uniqueness suffix.
  let _tradeIdCounter = 0;
  const RANGES = {
    '1d': 1 * 86400000,
    '7d': 7 * 86400000,
    '30d': 30 * 86400000,
    'all': Infinity
  };

  // ─── Private State ──────────────────────────────────────────────────
  const state = {
    mounted: false,
    // Data buffers
    samples: [],
    // Array<EquitySample>
    trades: new Map(),
    // Map<tradeId => TradeMarker>

    // Configuration
    profitTarget: null,
    // $
    maxDDFloor: null,
    // $
    range: DEFAULT_RANGE,
    // DOM refs
    root: null,
    titleBar: null,
    rangeButtons: new Map(),
    svgContainer: null,
    svg: null,
    statsContainer: null,
    // Sampling timer
    sampleTimer: null,
    // Event listeners
    listeners: []
  };

  // ─── Utilities ──────────────────────────────────────────────────────

  function fmtUsd(n, signed = false) {
    if (n == null || isNaN(n)) return '—';
    const sign = signed && n > 0 ? '+' : '';
    return `${sign}$${n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }
  function fmtPct(n) {
    if (n == null || isNaN(n)) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(2)}%`;
  }
  function svgEl(tag, attrs = {}) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) {
      e.setAttribute(k, v);
    }
    return e;
  }
  function fmtTime(ts, range) {
    const d = new Date(ts);
    if (range === '1d') {
      return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else if (range === '7d') {
      return d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    } else {
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  }
  function decimateBuffer() {
    if (state.samples.length <= MAX_SAMPLES) return;
    const keep = Math.floor(MAX_SAMPLES * DECIMATION_FACTOR);
    const step = Math.ceil(state.samples.length / keep);
    const decimated = [];
    for (let i = 0; i < state.samples.length; i += step) {
      decimated.push(state.samples[i]);
    }
    state.samples = decimated.slice(-MAX_SAMPLES);
  }

  // ─── CSS Injection ───────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                display: flex;
                flex-direction: column;
                gap: 8px;
                height: 100%;
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                border-radius: 8px;
                backdrop-filter: blur(14px) saturate(160%);
                box-shadow: var(--glass-underglow);
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                color: var(--text-primary);
                overflow: hidden;
                padding: 12px;
            }

            .ec-title-bar {
                display: flex;
                align-items: center;
                gap: 12px;
                justify-content: space-between;
                flex-shrink: 0;
                padding-bottom: 8px;
                border-bottom: 1px solid var(--border-color);
            }

            .ec-title {
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: var(--text-primary);
            }

            .ec-range-selector {
                display: flex;
                gap: 6px;
                flex-shrink: 0;
            }

            .ec-range-btn {
                padding: 4px 10px;
                background: rgba(255, 215, 0, 0.08);
                border: 1px solid rgba(255, 215, 0, 0.2);
                border-radius: 12px;
                color: var(--text-secondary);
                font-size: 9px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                cursor: pointer;
                transition: all 150ms ease;
            }

            .ec-range-btn:hover {
                border-color: rgba(255, 215, 0, 0.4);
                color: var(--ml-color);
            }

            .ec-range-btn.active {
                background: rgba(255, 215, 0, 0.25);
                border-color: var(--ml-color);
                color: var(--ml-color);
                box-shadow: 0 0 8px rgba(255, 215, 0, 0.3);
            }

            .ec-svg-container {
                flex: 1;
                min-height: 200px;
                overflow: hidden;
                position: relative;
            }

            .ec-svg {
                width: 100%;
                height: 100%;
            }

            .ec-marker {
                cursor: pointer;
                transition: opacity 150ms ease;
            }

            .ec-marker:hover {
                opacity: 0.8;
                filter: drop-shadow(0 0 4px rgba(255, 215, 0, 0.5));
            }

            .ec-tooltip {
                position: absolute;
                background: rgba(0, 0, 0, 0.9);
                border: 1px solid var(--ml-color);
                border-radius: 4px;
                padding: 8px;
                font-size: 10px;
                color: var(--text-primary);
                pointer-events: none;
                z-index: 100;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.8);
            }

            .ec-tooltip.hidden {
                display: none;
            }

            .ec-stats {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 8px;
                padding-top: 8px;
                border-top: 1px solid var(--border-color);
                flex-shrink: 0;
            }

            .ec-stat {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .ec-stat-label {
                font-size: 9px;
                font-weight: 600;
                color: var(--text-secondary);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .ec-stat-value {
                font-size: 12px;
                font-weight: 700;
                font-variant-numeric: tabular-nums;
                color: var(--text-primary);
            }

            .ec-stat-value.profit {
                color: var(--profit-color);
            }

            .ec-stat-value.loss {
                color: var(--loss-color);
            }

            .ec-empty {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: var(--text-secondary);
                font-size: 11px;
                animation: pulse 2s ease-in-out infinite;
            }

            @keyframes pulse {
                0%, 100% { opacity: 0.5; }
                50% { opacity: 1; }
            }
        `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Chart Rendering ────────────────────────────────────────────────

  function renderChart() {
    if (!state.svgContainer) return;
    state.svgContainer.innerHTML = '';

    // Handle empty state
    if (state.samples.length === 0) {
      state.svgContainer.innerHTML = '<div class="ec-empty">Waiting for first equity sample...</div>';
      return;
    }
    const w = state.svgContainer.clientWidth || 600;
    const h = state.svgContainer.clientHeight || 200;
    const padL = 50,
      padR = 80,
      padT = 20,
      padB = 30;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;

    // Filter samples by range
    const now = Date.now();
    const rangeMs = RANGES[state.range];
    const cutoff = rangeMs === Infinity ? 0 : now - rangeMs;
    const visible = state.samples.filter(s => s.ts >= cutoff);
    if (visible.length < 2) {
      state.svgContainer.innerHTML = '<div class="ec-empty">Insufficient data for range...</div>';
      return;
    }
    const ts = visible.map(s => s.ts);
    const equities = visible.map(s => s.equity);
    const startBalance = visible[0].equity;
    const targetBalance = state.profitTarget ? startBalance + state.profitTarget : null;
    const floorBalance = state.maxDDFloor ? startBalance - state.maxDDFloor : null;
    const yMin = Math.min(...equities, floorBalance || Infinity) * 0.998;
    const yMax = Math.max(...equities, targetBalance || -Infinity) * 1.002;
    const xMin = ts[0];
    const xMax = ts[ts.length - 1];
    const x = t => padL + (t - xMin) / (xMax - xMin || 1) * innerW;
    const y = b => padT + innerH - (b - yMin) / (yMax - yMin || 1) * innerH;
    const svg = svgEl('svg', {
      width: w,
      height: h,
      viewBox: `0 0 ${w} ${h}`,
      class: 'ec-svg'
    });

    // Background zones
    if (floorBalance) {
      svg.appendChild(svgEl('rect', {
        x: padL,
        y: y(floorBalance),
        width: innerW,
        height: padT + innerH - y(floorBalance),
        fill: 'rgba(255, 45, 45, 0.08)',
        'pointer-events': 'none'
      }));
    }

    // Y-axis labels and gridlines
    for (let i = 0; i <= 4; i++) {
      const v = yMin + (yMax - yMin) * (i / 4);
      const yy = y(v);
      const tick = svgEl('text', {
        x: padL - 8,
        y: yy + 3,
        fill: '#665E45',
        'font-size': 10,
        'text-anchor': 'end',
        'font-family': "'JetBrains Mono', monospace"
      });
      tick.textContent = fmtUsd(v);
      svg.appendChild(tick);
    }

    // X-axis labels (first, middle, last)
    for (const idx of [0, Math.floor(visible.length / 2), visible.length - 1]) {
      const label = fmtTime(ts[idx], state.range);
      const tx = svgEl('text', {
        x: x(ts[idx]),
        y: padT + innerH + 18,
        fill: '#665E45',
        'font-size': 10,
        'text-anchor': 'middle',
        'font-family': "'JetBrains Mono', monospace"
      });
      tx.textContent = label;
      svg.appendChild(tx);
    }

    // Max DD floor line and label
    if (floorBalance) {
      svg.appendChild(svgEl('line', {
        x1: padL,
        y1: y(floorBalance),
        x2: padL + innerW,
        y2: y(floorBalance),
        stroke: '#FF2D2D',
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
        'pointer-events': 'none'
      }));
      const lbl = svgEl('text', {
        x: padL + innerW + 6,
        y: y(floorBalance) - 4,
        fill: '#FF2D2D',
        'font-size': 10,
        'font-family': "'JetBrains Mono', monospace"
      });
      lbl.textContent = `Max DD ${fmtUsd(floorBalance)}`;
      svg.appendChild(lbl);
    }

    // Profit target line and label
    if (targetBalance) {
      svg.appendChild(svgEl('line', {
        x1: padL,
        y1: y(targetBalance),
        x2: padL + innerW,
        y2: y(targetBalance),
        stroke: '#FFB800',
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
        'pointer-events': 'none'
      }));
      const lbl = svgEl('text', {
        x: padL + innerW + 6,
        y: y(targetBalance) - 4,
        fill: '#FFB800',
        'font-size': 10,
        'font-family': "'JetBrains Mono', monospace"
      });
      lbl.textContent = `Target ${fmtUsd(targetBalance)}`;
      svg.appendChild(lbl);
    }

    // Starting balance baseline
    svg.appendChild(svgEl('line', {
      x1: padL,
      y1: y(startBalance),
      x2: padL + innerW,
      y2: y(startBalance),
      stroke: '#665E45',
      'stroke-width': 1,
      'pointer-events': 'none'
    }));

    // Main equity curve
    const pathD = ts.map((t, i) => `${i === 0 ? 'M' : 'L'} ${x(t)} ${y(equities[i])}`).join(' ');
    svg.appendChild(svgEl('path', {
      d: pathD,
      fill: 'none',
      stroke: 'var(--ml-color)',
      'stroke-width': 1.5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'pointer-events': 'none'
    }));

    // Trade markers
    for (const [tradeId, marker] of state.trades.entries()) {
      if (marker.ts < cutoff) continue; // Skip trades outside range

      const xx = x(marker.ts);
      const yy = y(marker.equityAt);
      const color = marker.pnl >= 0 ? '#00E676' : '#FF2D2D';
      const r = marker.pnl !== undefined ? 2.5 : 2;
      const circle = svgEl('circle', {
        cx: xx,
        cy: yy,
        r: r,
        fill: color,
        class: 'ec-marker',
        'data-trade-id': tradeId,
        'pointer-events': 'auto'
      });
      circle.addEventListener('mouseenter', () => {
        showTradeTooltip(tradeId, marker, xx, yy);
      });
      circle.addEventListener('mouseleave', () => {
        hideTradeTooltip();
      });
      svg.appendChild(circle);
    }

    // Last equity point (filled gold circle)
    const lastT = ts[ts.length - 1];
    const lastE = equities[equities.length - 1];
    svg.appendChild(svgEl('circle', {
      cx: x(lastT),
      cy: y(lastE),
      r: 4,
      fill: 'var(--ml-color)',
      'pointer-events': 'none'
    }));
    const lastLbl = svgEl('text', {
      x: padL + innerW + 6,
      y: y(lastE) + 3,
      fill: 'var(--ml-color)',
      'font-size': 10,
      'font-weight': 600,
      'font-family': "'JetBrains Mono', monospace"
    });
    lastLbl.textContent = fmtUsd(lastE);
    svg.appendChild(lastLbl);
    state.svgContainer.appendChild(svg);
  }
  let tooltipTimeout = null;
  function showTradeTooltip(tradeId, marker, xx, yy) {
    clearTimeout(tooltipTimeout);
    let tooltip = state.svgContainer.querySelector('.ec-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'ec-tooltip';
      state.svgContainer.appendChild(tooltip);
    }
    const time = new Date(marker.ts).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const pnlText = fmtUsd(marker.pnl, true);
    tooltip.textContent = `${marker.ticker} ${marker.side.toUpperCase()} @ ${time} | ${pnlText}`;
    tooltip.classList.remove('hidden');
    tooltip.style.left = xx + 'px';
    tooltip.style.top = yy - 30 + 'px';
  }
  function hideTradeTooltip() {
    tooltipTimeout = setTimeout(() => {
      const tooltip = state.svgContainer.querySelector('.ec-tooltip');
      if (tooltip) {
        tooltip.classList.add('hidden');
      }
    }, 200);
  }

  // ─── Stats Row Rendering ────────────────────────────────────────────

  function renderStats() {
    if (!state.statsContainer || state.samples.length === 0) return;
    const lastSample = state.samples[state.samples.length - 1];
    const firstSample = state.samples[0];
    const current = lastSample.equity;
    const starting = firstSample.equity;
    const pnl = current - starting;
    const pct = starting ? pnl / starting * 100 : 0;
    const targetPct = state.profitTarget ? pnl / state.profitTarget * 100 : null;
    const stats = [{
      label: 'Current Balance',
      value: fmtUsd(current),
      klass: ''
    }, {
      label: 'Total P&L',
      value: fmtUsd(pnl, true),
      klass: pnl >= 0 ? 'profit' : 'loss'
    }, {
      label: 'Return',
      value: fmtPct(pct),
      klass: pct >= 0 ? 'profit' : 'loss'
    }, {
      label: 'Target Progress',
      value: targetPct !== null ? `${targetPct.toFixed(0)}%` : '—',
      klass: ''
    }];
    state.statsContainer.innerHTML = stats.map(s => `
            <div class="ec-stat">
                <div class="ec-stat-label">${s.label}</div>
                <div class="ec-stat-value ${s.klass}">${s.value}</div>
            </div>
        `).join('');
  }

  // ─── Mount & Render ─────────────────────────────────────────────────

  function mount() {
    if (state.mounted) return;
    state.root = document.getElementById(ROOT_ID);
    if (!state.root) {
      console.warn('[EquityCurve] Mount point #equityCurve not found');
      return;
    }
    injectStyles();
    state.root.innerHTML = `
            <div class="ec-title-bar">
                <div class="ec-title">EQUITY CURVE</div>
                <div class="ec-range-selector">
                    <button class="ec-range-btn" data-range="1d">1D</button>
                    <button class="ec-range-btn" data-range="7d">7D</button>
                    <button class="ec-range-btn" data-range="30d">30D</button>
                    <button class="ec-range-btn active" data-range="all">ALL</button>
                </div>
            </div>
            <div class="ec-svg-container"></div>
            <div class="ec-stats"></div>
        `;
    state.titleBar = state.root.querySelector('.ec-title-bar');
    state.svgContainer = state.root.querySelector('.ec-svg-container');
    state.statsContainer = state.root.querySelector('.ec-stats');

    // Wire range buttons
    state.root.querySelectorAll('.ec-range-btn').forEach(btn => {
      const range = btn.dataset.range;
      state.rangeButtons.set(range, btn);
      btn.addEventListener('click', () => {
        state.rangeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.range = range;
        render();
      });
    });
    state.mounted = true;
    renderChart();
    renderStats();
  }
  function render() {
    if (!state.mounted) return;
    renderChart();
    renderStats();
  }

  // ─── Data Management ────────────────────────────────────────────────

  function addEquitySample(ts, equity) {
    if (typeof ts !== 'number' || typeof equity !== 'number') {
      return;
    }

    // Don't add duplicate timestamps
    if (state.samples.length > 0 && state.samples[state.samples.length - 1].ts === ts) {
      return;
    }
    state.samples.push({
      ts,
      equity
    });
    if (state.samples.length > MAX_SAMPLES) {
      decimateBuffer();
    }
    render();
  }
  function addTradeMarker(ts, ticker, side, pnl, equityAt) {
    if (typeof ts !== 'number' || !ticker || !side) {
      return;
    }
    const tradeId = `${ticker}-${ts}-${++_tradeIdCounter}`;
    let equityAtVal = Number.isFinite(equityAt) ? equityAt : null;
    if (equityAtVal === null && state.samples.length > 0) {
      equityAtVal = state.samples[state.samples.length - 1].equity;
    }
    if (equityAtVal === null) {
      console.warn('[EquityCurve] Trade marker skipped; no equity sample available');
      return;
    }
    state.trades.set(tradeId, {
      ts,
      ticker: ticker.toUpperCase(),
      side: side.toLowerCase(),
      pnl: pnl || 0,
      equityAt: equityAtVal
    });
    render();
  }

  // ─── WebSocket Handlers ──────────────────────────────────────────────

  function handlePrice(data) {
    try {
      if (data && data.equity && typeof data.equity === 'number') {
        addEquitySample(Date.now(), data.equity);
      }
    } catch (e) {
      // Silently ignore malformed price events
    }
  }
  function handleTrade(data) {
    try {
      if (data && data.type === 'close' && data.symbol && data.side && typeof data.pnl === 'number' && typeof data.equity === 'number') {
        addTradeMarker(data.ts || Date.now(), data.symbol, data.side, data.pnl, data.equity);
      }
    } catch (e) {
      // Silently ignore malformed trade events
    }
  }
  function handleBalanceUpdate(data) {
    try {
      if (data && typeof data.equity === 'number') {
        addEquitySample(data.ts || Date.now(), data.equity);
      }
    } catch (e) {
      // Silently ignore malformed balance events
    }
  }
  function handleStateUpdate(data) {
    try {
      if (data && typeof data.equity === 'number') {
        addEquitySample(data.ts || Date.now(), data.equity);
      }
    } catch (e) {
      // Silently ignore malformed state updates
    }
  }

  // ─── Bus Event Handlers ──────────────────────────────────────────────

  function handleAccountChange(data) {
    try {
      // When account changes, clear samples (new equity curve context)
      state.samples = [];
      state.trades.clear();
      render();
    } catch (e) {
      // Silently ignore
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────

  const EquityCurve = {
    init() {
      mount();

      // Subscribe to WS events
      const Socket = OGZ.get('Socket');
      if (Socket) {
        Socket.registerHandler('price', handlePrice);
        Socket.registerHandler('trade', handleTrade);
        Socket.registerHandler('balance_update', handleBalanceUpdate);
        Socket.registerHandler('state_update', handleStateUpdate);
      }

      // Subscribe to OGZ.bus
      if (OGZ.bus) {
        OGZ.bus.on('account:change', handleAccountChange);
      }
    },
    setRange(range) {
      if (RANGES[range] !== undefined) {
        state.range = range;
        state.rangeButtons.forEach((btn, r) => {
          btn.classList.toggle('active', r === range);
        });
        render();
      }
    },
    setProfitTarget(amt) {
      if (typeof amt === 'number') {
        state.profitTarget = amt;
        render();
      }
    },
    setMaxDDFloor(amt) {
      if (typeof amt === 'number') {
        state.maxDDFloor = amt;
        render();
      }
    },
    addEquitySample(ts, equity) {
      addEquitySample(ts, equity);
    },
    addTradeMarker(ts, ticker, side, pnl, equityAt) {
      addTradeMarker(ts, ticker, side, pnl, equityAt);
    },
    clear() {
      state.samples = [];
      state.trades.clear();
      render();
    },
    getRange() {
      return state.range;
    },
    getProfitTarget() {
      return state.profitTarget;
    },
    getMaxDDFloor() {
      return state.maxDDFloor;
    },
    teardown() {
      if (state.sampleTimer) {
        clearInterval(state.sampleTimer);
      }
      const Socket = OGZ.get('Socket');
      if (Socket) {
        // Note: Socket doesn't expose unregisterHandler, so we rely on page teardown
      }
      if (state.root) {
        state.root.innerHTML = '';
      }
      if (document.getElementById(STYLE_ID)) {
        document.getElementById(STYLE_ID).remove();
      }
      state.mounted = false;
    },
    _compute() {
      return {
        samples: state.samples.slice(),
        trades: Array.from(state.trades.entries()),
        profitTarget: state.profitTarget,
        maxDDFloor: state.maxDDFloor,
        range: state.range,
        mounted: state.mounted
      };
    }
  };

  // ─── Module Registration ────────────────────────────────────────────

  OGZ.register('EquityCurve', EquityCurve);
})(window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/equity-curve.js", error: String((e && e.message) || e) }); }

// public/js/panels/goal-tracker.js
try { (() => {
/**
 * goal-tracker.js - GoalTracker: Houston progress bar + session goal display
 *
 * Renders a slim always-visible band at the top-left of the viewport showing:
 *   - Account equity vs Houston Fund target ($10,000)
 *   - Houston progress bar with % readout
 *   - Session P&L vs daily target ($250 default)
 *   - Trade count + win rate for the session
 *
 * Subscribes to OGZ.bus 'celebration:milestone' (equity heartbeat) and the
 * raw socket 'trade' + 'state_update' events for session stats.
 *
 * Persistence: long-term saved fund + total earned + start date to
 * localStorage. Auto-saves 50% of every profitable close to the long-term
 * fund (the original Mover behavior).
 *
 * NO synthetic data. NO Math.random. If state_update hasn't fired yet,
 * shows '--' placeholders. The bar fills only on real bot data.
 *
 * Self-mounts into <div id="goalTracker"></div> if it exists; otherwise
 * creates its own floating container at top-left.
 *
 * Public API:
 *   init()
 *   setTargets({ houston, monthly, daily })
 *   resetSession()
 *   teardown()
 *   _compute()
 *
 * @module public/js/panels/goal-tracker
 */
(function (OGZ) {
  'use strict';

  const STORAGE_KEY = 'ogz.goalTracker.state';
  const STYLE_ID = 'ogz-goal-tracker-styles';
  const ROOT_ID_TARGET = 'goalTracker'; // preferred mount if exists
  const FLOATING_ROOT_ID = 'ogzGoalTrackerFloating';

  // Profile gate: 'operator' shows the personal Houston-fund framing;
  // anything else (default) shows a generic profit-goal label so nothing
  // private renders on a shipped dashboard. Operator opts in per-browser:
  //   localStorage.setItem('ogz.profile','operator')
  const IS_OPERATOR = function () {
    try {
      return localStorage.getItem('ogz.profile') === 'operator';
    } catch (_) {
      return false;
    }
  }();

  // Defaults aligned with original mover/goalTracker.js
  const DEFAULTS = {
    houstonTarget: 10000,
    monthlyTarget: 5000,
    dailyPnlTarget: 250,
    savePctOfProfits: 0.5
  };

  // ─── State ──────────────────────────────────────────────────────────
  const state = {
    mounted: false,
    targets: {
      ...DEFAULTS
    },
    session: {
      pnl: 0,
      trades: 0,
      wins: 0
    },
    longTerm: {
      currentSaved: 0,
      totalEarned: 0,
      startDate: null
    },
    equity: 0,
    domRefs: {}
  };

  // ─── Persistence ────────────────────────────────────────────────────
  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        state.longTerm.startDate = new Date().toISOString();
        savePersisted();
        return;
      }
      const data = JSON.parse(raw);
      if (data.targets) state.targets = {
        ...state.targets,
        ...data.targets
      };
      if (data.longTerm) state.longTerm = {
        ...state.longTerm,
        ...data.longTerm
      };
      if (!state.longTerm.startDate) state.longTerm.startDate = new Date().toISOString();
    } catch (_) {/* swallow */}
  }
  function savePersisted() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        targets: state.targets,
        longTerm: state.longTerm
      }));
    } catch (_) {/* swallow */}
  }

  // ─── CSS ────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            .ogz-goal-tracker {
                font-family: 'JetBrains Mono', monospace;
                background: rgba(15, 15, 22, 0.85);
                border: 1px solid rgba(255, 215, 0, 0.18);
                border-radius: 8px;
                padding: 8px 14px;
                color: #d1d5db;
                font-size: 11px;
                line-height: 1.3;
                box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(8px) saturate(160%);
                display: flex;
                gap: 18px;
                align-items: center;
                flex-wrap: wrap;
            }
            .ogz-goal-tracker.floating {
                position: fixed;
                top: 76px;
                left: 16px;
                z-index: 9400;
                max-width: 480px;
            }
            .ogz-gt-block { display: flex; flex-direction: column; min-width: 90px; }
            .ogz-gt-key {
                font-size: 9px;
                text-transform: uppercase;
                letter-spacing: 1.2px;
                color: rgba(255, 215, 0, 0.7);
                margin-bottom: 2px;
            }
            .ogz-gt-val {
                font-size: 13px;
                font-weight: 700;
                color: #fff;
                font-feature-settings: "tnum";
            }
            .ogz-gt-val.pos { color: #22c55e; }
            .ogz-gt-val.neg { color: #ef4444; }
            .ogz-gt-val.warn { color: #fbbf24; }

            .ogz-gt-houston {
                flex: 1;
                min-width: 200px;
                display: flex;
                flex-direction: column;
            }
            .ogz-gt-houston-row {
                display: flex;
                justify-content: space-between;
                font-size: 10px;
                color: rgba(255, 255, 255, 0.7);
                margin-bottom: 4px;
            }
            .ogz-gt-bar {
                position: relative;
                height: 8px;
                background: rgba(255, 255, 255, 0.08);
                border-radius: 4px;
                overflow: hidden;
            }
            .ogz-gt-bar-fill {
                position: absolute;
                left: 0; top: 0; bottom: 0;
                background: linear-gradient(90deg, #f59e0b 0%, #ffd700 60%, #fef08a 100%);
                box-shadow: 0 0 12px rgba(255, 215, 0, 0.5);
                width: 0%;
                transition: width 600ms ease-out;
                border-radius: 4px;
            }
            .ogz-gt-houston-pct {
                font-weight: 700;
                color: #ffd700;
            }

            @media (prefers-reduced-motion: reduce) {
                .ogz-gt-bar-fill { transition: none; }
            }
            @media (max-width: 768px) {
                .ogz-goal-tracker.floating { left: 8px; right: 8px; max-width: none; }
            }
        `;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ─── Render ─────────────────────────────────────────────────────────
  function mount() {
    if (state.mounted) return true;
    let container = document.getElementById(ROOT_ID_TARGET);
    let floating = false;
    if (!container) {
      // The floating top-left fallback was built for the pre-v2 layout.
      // In the v2 shell it renders ON TOP of the watchlist strip and has
      // to be clicked away before the dashboard is even usable -- a live
      // bug on the shipped site. The v2 shell has no docked #goalTracker
      // mount point, so GoalTracker now does NOT render at all rather
      // than floating over other panels. To bring it back, add
      // <div id="goalTracker"></div> to the dashboard at a deliberate,
      // docked location and it will mount there instead.
      return false;
    }
    container.innerHTML = `
            <div class="ogz-goal-tracker ${floating ? 'floating' : ''}">
                <div class="ogz-gt-block">
                    <div class="ogz-gt-key">Equity</div>
                    <div class="ogz-gt-val" data-k="equity">$--</div>
                </div>
                <div class="ogz-gt-block">
                    <div class="ogz-gt-key">Session P&L</div>
                    <div class="ogz-gt-val" data-k="sessionPnl">$--</div>
                </div>
                <div class="ogz-gt-block">
                    <div class="ogz-gt-key">Trades · Win</div>
                    <div class="ogz-gt-val" data-k="tradeMeta">--</div>
                </div>
                <div class="ogz-gt-houston">
                    <div class="ogz-gt-houston-row">
                        <span>${IS_OPERATOR ? 'Houston Fund' : 'Profit Goal'}</span>
                        <span class="ogz-gt-houston-pct" data-k="houstonPct">0%</span>
                    </div>
                    <div class="ogz-gt-bar">
                        <div class="ogz-gt-bar-fill" data-k="houstonBar"></div>
                    </div>
                </div>
            </div>
        `;
    state.domRefs.equity = container.querySelector('[data-k="equity"]');
    state.domRefs.sessionPnl = container.querySelector('[data-k="sessionPnl"]');
    state.domRefs.tradeMeta = container.querySelector('[data-k="tradeMeta"]');
    state.domRefs.houstonPct = container.querySelector('[data-k="houstonPct"]');
    state.domRefs.houstonBar = container.querySelector('[data-k="houstonBar"]');
    state.mounted = true;
    return true;
  }
  function updateDisplay() {
    if (!state.mounted) return;

    // Equity
    if (state.domRefs.equity) {
      if (state.equity > 0) {
        state.domRefs.equity.textContent = '$' + state.equity.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      } else {
        state.domRefs.equity.textContent = '$--';
      }
    }

    // Session P&L
    if (state.domRefs.sessionPnl) {
      const p = state.session.pnl;
      const sign = p >= 0 ? '+' : '';
      state.domRefs.sessionPnl.textContent = `${sign}$${p.toFixed(2)}`;
      state.domRefs.sessionPnl.classList.toggle('pos', p > 0);
      state.domRefs.sessionPnl.classList.toggle('neg', p < 0);
    }

    // Trades · Win
    if (state.domRefs.tradeMeta) {
      const t = state.session.trades;
      if (t === 0) {
        state.domRefs.tradeMeta.textContent = '0 · --';
      } else {
        const wp = state.session.wins / t * 100;
        state.domRefs.tradeMeta.textContent = `${t} · ${wp.toFixed(0)}%`;
        state.domRefs.tradeMeta.classList.toggle('pos', wp >= 60);
        state.domRefs.tradeMeta.classList.toggle('warn', wp >= 40 && wp < 60);
        state.domRefs.tradeMeta.classList.toggle('neg', wp < 40 && t >= 3);
      }
    }

    // Houston bar
    if (state.domRefs.houstonBar && state.domRefs.houstonPct) {
      const target = state.targets.houstonTarget || DEFAULTS.houstonTarget;
      const tracked = state.longTerm.currentSaved || state.equity || 0;
      const pct = Math.max(0, Math.min(100, tracked / target * 100));
      state.domRefs.houstonBar.style.width = pct.toFixed(2) + '%';
      state.domRefs.houstonPct.textContent = pct.toFixed(1) + '%';
    }
  }

  // ─── Event Handlers ─────────────────────────────────────────────────
  function onTrade(d) {
    try {
      const data = d && d.data ? d.data : d;
      if (!data || !data.action) return;
      const action = String(data.action).toUpperCase();
      if (action === 'SELL' || action === 'COVER') {
        const pnl = Number(data.pnl) || 0;
        state.session.pnl += pnl;
        state.session.trades++;
        if (pnl > 0) {
          state.session.wins++;
          state.longTerm.totalEarned += pnl;
          state.longTerm.currentSaved += pnl * (state.targets.savePctOfProfits || DEFAULTS.savePctOfProfits);
          savePersisted();
        }
        updateDisplay();
      }
    } catch (_) {/* swallow */}
  }
  function onStateUpdate(d) {
    try {
      const s = d && d.state ? d.state : null;
      if (!s) return;
      const equity = Number(s.equity) || 0;
      if (equity > 0) state.equity = equity;
      updateDisplay();
    } catch (_) {/* swallow */}
  }
  function onMilestoneEquity(payload) {
    if (!payload || typeof payload.equity !== 'number') return;
    state.equity = payload.equity;
    updateDisplay();
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const api = {
    init() {
      try {
        loadPersisted();
        injectStyles();
        if (!mount()) return;
        updateDisplay();
        (function bindSocket() {
          const socket = OGZ && typeof OGZ.get === 'function' ? OGZ.get('Socket') : null;
          if (!socket || typeof socket.registerHandler !== 'function') {
            setTimeout(bindSocket, 250);
            return;
          }
          socket.registerHandler('trade', e => {
            try {
              onTrade(e);
            } catch (_) {}
          });
          socket.registerHandler('state_update', e => {
            try {
              onStateUpdate(e);
            } catch (_) {}
          });
        })();
        (function bindBus() {
          if (!OGZ.bus) {
            setTimeout(bindBus, 100);
            return;
          }
          OGZ.bus.on('celebration:milestone', onMilestoneEquity);
        })();
      } catch (_) {/* swallow */}
    },
    setTargets(t) {
      if (!t || typeof t !== 'object') return;
      if (t.houston) state.targets.houstonTarget = Number(t.houston);
      if (t.monthly) state.targets.monthlyTarget = Number(t.monthly);
      if (t.daily) state.targets.dailyPnlTarget = Number(t.daily);
      savePersisted();
      updateDisplay();
    },
    resetSession() {
      state.session = {
        pnl: 0,
        trades: 0,
        wins: 0
      };
      updateDisplay();
    },
    teardown() {
      const s = document.getElementById(STYLE_ID);
      if (s) s.remove();
      const f = document.getElementById(FLOATING_ROOT_ID);
      if (f) f.remove();
      state.mounted = false;
    },
    _compute() {
      return {
        mounted: state.mounted,
        targets: {
          ...state.targets
        },
        session: {
          ...state.session
        },
        longTerm: {
          ...state.longTerm
        },
        equity: state.equity
      };
    }
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('GoalTracker', api);
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('GoalTracker', api);
      }
    });
  }
  try {
    window.OGZGoalTracker = api;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/goal-tracker.js", error: String((e && e.message) || e) }); }

// public/js/panels/header-strip.js
try { (() => {
/**
 * header-strip.js - HeaderStrip: Dashboard Header Panel
 *
 * The topmost persistent UI element containing brand identity, live system state,
 * and account/session context.
 *
 * What it renders:
 *   [LEFT]   OGZPrime logo + tagline ("Neural Ensemble - Real-Time Data")
 *   [CENTER] Hero: total account equity, session P&L, session trade count + win rate
 *   [RIGHT]  Status cluster: DATA/BOT/TRAI lights, Risk Budget meter, Account selector
 *
 * State tracking:
 *   - Account equity: explicit state_update.equity
 *   - Session P&L: totalPnL since session open
 *   - Session trade count + win rate (from state_update.tradeCount + tradePNL ledger)
 *   - Risk budget: drawdown from session-open as percentage of session-open equity
 *   - Three status lights: DATA (price ticks), BOT (bot_thinking), TRAI (narrator_event)
 *
 * Self-registers as OGZ.HeaderStrip via OGZ.register().
 * Mounts into <header id="dashHeader">.
 *
 * Verified WS subscriptions (real bot emitter shapes):
 *   - 'price'          -> CandleProcessor.broadcastPrice; DATA-light heartbeat only.
 *                        Shape: { type:'price', data:{ price, candle, indicators,
 *                        overlays, equity, position, ... } }
 *   - 'state_update'   -> StateManager.broadcastToDashboard; equity hero + risk meter.
 *                        Shape: { type:'state_update', state:{ position, equity,
 *                        balance, totalBalance, realizedPnL, unrealizedPnL, totalPnL,
 *                        tradeCount, dailyTradeCount, recoveryMode }, timestamp }
 *   - 'balance_update' -> equity fallback: { type:'balance_update', equity }
 *   - 'bot_thinking'   -> TradingLoop.processCycle / TRAIDecisionModule. BOT-light heartbeat.
 *                        Shape: { type:'bot_thinking', timestamp, message, confidence,
 *                        data:{ reasoning, price, regime, module }, strategy_stack }
 *   - 'narrator_event' -> TradeNarrator.broadcast. TRAI-light heartbeat.
 *                        Shape: { type:'narrator_event', subtype, text, timestamp }
 *   - 'trade'          -> OrderExecutor; session win/loss tally.
 *                        Shape: { type:'trade', action, direction, price, pnl,
 *                        timestamp, confidence }
 *
 * Listens to OGZ.bus events:
 *   - account:change - when dropdown selects a new account
 *   - risk:update    - when an external RiskGauge module reports new budget
 *                      (overrides the auto-derived value)
 *
 * Graceful fallback: displays "--" placeholders if no events arrive.
 * No console.log in production code.
 *
 * Public API:
 *   init() - mount to DOM, inject styles, subscribe to WS + bus events
 *   setAccount(accountName) - update the account selector display
 *   getAccount() - return current account name
 *   getEquity() - return the current equity snapshot
 *   setStatusLight(name, active, error) - update DATA/BOT/TRAI state
 *   setRiskBudget(percent, level) - update risk gauge (SAFE/WARN/DANGER)
 *   teardown() - remove DOM, listeners, styles
 *   _compute() - debug helper: return internal state snapshot
 *
 * @typedef {Object} HeaderState
 * @property {number} equity - current account equity
 * @property {number} equityDelta - session P&L in dollars
 * @property {number} equityDeltaPercent - session P&L in percent
 * @property {number} riskBudget - 0..100 percentage
 * @property {string} riskLevel - 'SAFE' | 'WARN' | 'DANGER'
 * @property {Object} statusLights - {data, bot, trai}; each {active: bool, error: bool}
 * @property {string} currentAccount - account display name or 'default'
 *
 * @module public/js/panels/header-strip
 */
(function (OGZ) {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────
  const STYLE_ID = 'ogz-header-strip-styles';
  const ROOT_ID = 'dashHeader';
  const STATUS_PULSE_INTERVAL_MS = 1200; // Pulse animation cycle
  const PRICE_FLASH_MS = 300; // Duration of price tick flash
  const DEFAULT_ACCOUNT = 'default';
  const PRICE_HISTORY_SIZE = 100; // Track recent prices for delta calc

  // Brand colors - must match CSS variables
  const COLORS = {
    statusGreen: '#00ff88',
    statusYellow: '#ffcc00',
    statusRed: '#ff3366',
    statusGray: '#444444',
    brandRed: '#dc2626',
    textSecondary: '#888888'
  };

  // ─── Private State ──────────────────────────────────────────────────
  const state = {
    mounted: false,
    // Account equity hero (real account dollars, NOT asset price)
    equity: 0,
    // explicit account equity
    unrealizedPnL: 0,
    sessionTotalPnL: 0,
    // totalPnL since session open
    sessionOpenEquity: 0,
    // captured on first state_update - for risk %
    sessionTradeCount: 0,
    sessionWins: 0,
    sessionLosses: 0,
    priceHistory: [],
    // for DATA-light idle detection
    externalRiskOverride: null,
    // non-null = use external RiskGauge value

    // Risk budget - auto-derived unless external override fires
    riskBudget: 0,
    // 0..100 (% of session-open equity burned)
    riskLevel: 'SAFE',
    // 'SAFE' | 'WARN' | 'DANGER'

    // Status lights
    statusLights: {
      data: {
        active: false,
        error: false,
        lastPulse: 0
      },
      bot: {
        active: false,
        error: false,
        lastPulse: 0
      },
      trai: {
        active: false,
        error: false,
        lastPulse: 0
      }
    },
    idleTimers: {
      data: null,
      bot: null,
      trai: null
    },
    // Account selector
    currentAccount: DEFAULT_ACCOUNT,
    // DOM caches
    domRefs: {
      root: null,
      heroPriceMain: null,
      heroPriceDelta: null,
      heroSessionMeta: null,
      dataLight: null,
      botLight: null,
      traiLight: null,
      riskBudgetPercent: null,
      riskBudgetLevel: null,
      accountSelector: null
    },
    // Event listeners (for cleanup)
    listeners: [],
    wsHandlers: []
  };

  // Event cadences differ: price feed should stale fast, bot/narrator can be quieter.
  const LIGHT_IDLE_MS_BY_KIND = {
    data: 5000,
    bot: 15000,
    trai: 15000
  };

  // ─── Event Bus Helper ──────────────────────────────────────────────
  function ensureEventBus() {
    if (OGZ && OGZ.bus) return;
    const listeners = new Map();
    const bus = {
      on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(handler);
      },
      off(event, handler) {
        if (!listeners.has(event)) return;
        const list = listeners.get(event);
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      },
      emit(event, data) {
        if (!listeners.has(event)) return;
        listeners.get(event).forEach(h => {
          try {
            h(data);
          } catch (_) {/* swallow */}
        });
      }
    };
    if (OGZ) OGZ.bus = bus;
  }

  // ─── CSS Injection ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            header#dashHeader {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                padding: 12px 24px;
                background: linear-gradient(180deg, #0d0d1a 0%, #080812 100%);
                border-bottom: 1px solid rgba(255, 255, 255, 0.15);
                box-shadow: 0 2px 12px rgba(0, 0, 0, 0.8);
                height: 66px;
                position: relative;
                z-index: 10;
            }

            /* Header structure: three horizontal zones */
            .hs-brand {
                display: flex;
                flex-direction: column;
                flex: 0 0 auto;
                min-width: 0;
            }

            /* #51 brand-shrink: 40px logo dwarfed the 36px hero price; pulled to
               24px so the brand identifies but the hero number wins the eye.
               Diamond ornament + tagline scaled in proportion. */
            .hs-logo {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 45%, #b91c1c 75%, #ef4444 100%);
                background-clip: text;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                color: transparent;
                font-family: 'Orbitron', monospace;
                font-size: 24px;
                font-weight: 900;
                letter-spacing: 2.5px;
                text-transform: uppercase;
                line-height: 1;
                filter: drop-shadow(0 0 10px rgba(220, 38, 38, 0.4))
                        drop-shadow(0 0 4px rgba(0, 0, 0, 0.85));
                display: inline-flex;
                align-items: center;
                gap: 9px;
            }

            .hs-logo::before {
                content: '';
                display: inline-block;
                width: 10px;
                height: 10px;
                transform: rotate(45deg);
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                box-shadow: 0 0 8px rgba(220, 38, 38, 0.55),
                            0 0 0 1px rgba(255, 255, 255, 0.10) inset;
                filter: drop-shadow(0 0 4px rgba(220, 38, 38, 0.55));
            }

            .hs-tagline {
                color: #a8a8a8;
                font-family: 'JetBrains Mono', monospace;
                font-size: 9px;
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 1.4px;
                margin-top: 3px;
                text-shadow: 0 0 4px rgba(220, 38, 38, 0.18);
            }

            /* Hero price (CENTER zone) */
            .hs-hero-price {
                flex: 1;
                text-align: center;
                min-width: 0;
            }

            .hs-hero-price-main {
                font-family: 'Orbitron', monospace;
                font-size: 36px;
                font-weight: 800;
                color: #22c55e;
                letter-spacing: 1.5px;
                text-shadow: 0 0 22px rgba(34, 197, 94, 0.4);
                line-height: 1;
                transition: color 120ms ease, text-shadow 120ms ease;
            }

            .hs-hero-price-main.neg {
                color: #ef4444;
                text-shadow: 0 0 22px rgba(239, 68, 68, 0.4);
            }

            .hs-hero-price-main.flash-up {
                animation: hs-equity-flash-up 300ms ease-out;
            }

            .hs-hero-price-main.flash-down {
                animation: hs-equity-flash-down 300ms ease-out;
            }

            .hs-hero-price-delta {
                font-family: 'JetBrains Mono', monospace;
                font-size: 13px;
                color: #888888;
                margin-top: 4px;
                letter-spacing: 0.5px;
                transition: color 120ms ease;
            }

            .hs-hero-price-delta.pos {
                color: #22c55e;
            }

            .hs-hero-price-delta.neg {
                color: #ef4444;
            }

            .hs-hero-session-meta {
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                color: #6b7280;
                margin-top: 2px;
                letter-spacing: 1.2px;
                text-transform: uppercase;
            }
            .hs-hero-session-meta .hs-meta-key { color: #6b7280; }
            .hs-hero-session-meta .hs-meta-val { color: #d1d5db; margin-left: 4px; margin-right: 12px; }
            .hs-hero-session-meta .hs-meta-val.pos { color: #22c55e; }
            .hs-hero-session-meta .hs-meta-val.neg { color: #ef4444; }
            .hs-hero-session-meta .hs-meta-val.warn { color: #fbbf24; }

            @keyframes hs-equity-flash-up {
                0% { color: #ffd700; text-shadow: 0 0 22px rgba(255, 215, 0, 0.6); }
                100% { color: #22c55e; text-shadow: 0 0 22px rgba(34, 197, 94, 0.4); }
            }

            @keyframes hs-equity-flash-down {
                0% { color: #ffd700; text-shadow: 0 0 22px rgba(255, 215, 0, 0.6); }
                100% { color: #ef4444; text-shadow: 0 0 22px rgba(239, 68, 68, 0.4); }
            }

            /* Status cluster (RIGHT zone) */
            .hs-status-cluster {
                display: flex;
                align-items: center;
                gap: 16px;
                flex: 0 0 auto;
                margin-left: auto;
                justify-self: end;
            }

            .hs-status-lights-bar {
                display: flex;
                gap: 18px;
                align-items: center;
                background: rgba(0, 0, 0, 0.5);
                padding: 9px 18px;
                border-radius: 22px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .hs-status-light {
                display: flex;
                align-items: center;
                gap: 7px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.6px;
            }

            .hs-status-light .hs-light {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #444444;
                box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
                transition: all 0.3s ease;
            }

            .hs-status-light .hs-light.active {
                background: #00ff88;
                box-shadow: 0 0 8px rgba(0, 255, 136, 0.6);
                animation: hs-status-pulse 1.2s infinite;
            }

            .hs-status-light .hs-light.error {
                background: #ff3366;
                box-shadow: 0 0 8px rgba(255, 51, 102, 0.6);
                animation: hs-status-pulse 1s infinite;
            }

            .hs-status-light .hs-label {
                color: #888888;
            }

            .hs-status-light .hs-light.active + .hs-label {
                color: #00ff88;
            }

            .hs-status-light .hs-light.error + .hs-label {
                color: #ff3366;
            }

            @keyframes hs-status-pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.6; transform: scale(1.1); }
            }

            .hs-risk-budget {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 7px 14px;
                background: rgba(0, 0, 0, 0.5);
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.12);
                min-width: 78px;
            }

            .hs-risk-budget-percent {
                font-family: 'Orbitron', monospace;
                font-size: 16px;
                font-weight: 700;
                color: var(--profit-color);
                letter-spacing: 1px;
            }

            .hs-risk-budget-percent.warn {
                color: var(--ml-color);
            }

            .hs-risk-budget-percent.danger {
                color: var(--loss-color);
            }

            .hs-risk-budget-level {
                font-family: 'JetBrains Mono', monospace;
                font-size: 9px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 1.2px;
                color: var(--profit-color);
                margin-top: 2px;
            }

            .hs-risk-budget-level.warn {
                color: var(--ml-color);
            }

            .hs-risk-budget-level.danger {
                color: var(--loss-color);
            }

            .hs-account-selector {
                background: rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: var(--text-primary);
                padding: 6px 12px;
                border-radius: 8px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 12px;
                font-weight: 500;
                text-transform: uppercase;
                cursor: pointer;
                transition: all 0.3s ease;
                max-width: 150px;
            }

            .hs-account-selector:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(220, 38, 38, 0.3);
            }

            .hs-account-selector option {
                background: #000000;
                color: #ffffff;
            }

            @media (prefers-reduced-motion: reduce) {
                .hs-status-light .hs-light.active,
                .hs-status-light .hs-light.error,
                .hs-hero-price-main.flash-up,
                .hs-hero-price-main.flash-down {
                    animation: none;
                }
            }
        `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Render Functions ──────────────────────────────────────────────
  function render() {
    const root = state.domRefs.root;
    if (!root) return;
    root.innerHTML = `
            <div class="hs-brand">
                <div class="hs-logo">OGZPrime</div>
                <div class="hs-tagline">Neural Ensemble • Real-Time Data</div>
            </div>

            <div class="hs-hero-price">
                <div class="hs-hero-price-main" id="hsHeroPriceMain">$--.--</div>
                <div class="hs-hero-price-delta" id="hsHeroPriceDelta">awaiting state_update</div>
                <div class="hs-hero-session-meta" id="hsHeroSessionMeta">
                    <span class="hs-meta-key">trades</span><span class="hs-meta-val" data-k="trades">0</span>
                    <span class="hs-meta-key">win</span><span class="hs-meta-val" data-k="win">--</span>
                    <span class="hs-meta-key">unr</span><span class="hs-meta-val" data-k="unr">$0.00</span>
                </div>
            </div>

            <div class="hs-status-cluster">
                <div class="hs-status-lights-bar">
                    <div class="hs-status-light">
                        <span class="hs-light" id="hsDataLight"></span>
                        <span class="hs-label">DATA</span>
                    </div>
                    <div class="hs-status-light">
                        <span class="hs-light" id="hsBotLight"></span>
                        <span class="hs-label">BOT</span>
                    </div>
                    <div class="hs-status-light">
                        <span class="hs-light" id="hsTraiLight"></span>
                        <span class="hs-label">TRAI</span>
                    </div>
                </div>

                <div class="hs-risk-budget" title="Risk budget - how much of your session-opening equity has been drawn down. The percentage is current drawdown; the label escalates SAFE -> WARN -> DANGER as it grows.">
                    <div class="hs-risk-budget-percent" id="hsRiskPercent">0%</div>
                    <div class="hs-risk-budget-level" id="hsRiskLevel">SAFE</div>
                </div>

                <select class="hs-account-selector" id="hsAccountSelector">
                    <option value="default">Account: Default</option>
                </select>
            </div>
        `;

    // Cache DOM refs
    state.domRefs.heroPriceMain = root.querySelector('#hsHeroPriceMain');
    state.domRefs.heroPriceDelta = root.querySelector('#hsHeroPriceDelta');
    state.domRefs.heroSessionMeta = root.querySelector('#hsHeroSessionMeta');
    state.domRefs.dataLight = root.querySelector('#hsDataLight');
    state.domRefs.botLight = root.querySelector('#hsBotLight');
    state.domRefs.traiLight = root.querySelector('#hsTraiLight');
    state.domRefs.riskBudgetPercent = root.querySelector('#hsRiskPercent');
    state.domRefs.riskBudgetLevel = root.querySelector('#hsRiskLevel');
    state.domRefs.accountSelector = root.querySelector('#hsAccountSelector');

    // Wire up account selector
    if (state.domRefs.accountSelector) {
      state.domRefs.accountSelector.addEventListener('change', e => {
        const newAccount = e.target.value;
        state.currentAccount = newAccount;
        if (OGZ && OGZ.bus) {
          OGZ.bus.emit('account:change', {
            account: newAccount
          });
        }
      });
    }
    updateDisplay();
  }
  function updateDisplay() {
    // Hero: account equity (NOT asset price - that's on the chart panel).
    // Show '$--.--' until first state_update arrives so we never lie about
    // a zero balance from cold-boot.
    if (state.domRefs.heroPriceMain) {
      if (state.sessionOpenEquity > 0 || state.equity > 0) {
        state.domRefs.heroPriceMain.textContent = `$${Number(state.equity).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`;
      } else {
        state.domRefs.heroPriceMain.textContent = '$--.--';
      }
      state.domRefs.heroPriceMain.classList.toggle('neg', state.equity < state.sessionOpenEquity);
    }

    // Delta: session P&L vs session-open equity
    if (state.domRefs.heroPriceDelta) {
      if (state.sessionOpenEquity > 0) {
        const delta = state.equity - state.sessionOpenEquity;
        const deltaPct = delta / state.sessionOpenEquity * 100;
        const sign = delta >= 0 ? '+' : '';
        state.domRefs.heroPriceDelta.textContent = `${sign}$${delta.toFixed(2)} (${sign}${deltaPct.toFixed(2)}%) session`;
        const isNeg = delta < 0;
        state.domRefs.heroPriceDelta.classList.toggle('pos', !isNeg);
        state.domRefs.heroPriceDelta.classList.toggle('neg', isNeg);
      } else {
        state.domRefs.heroPriceDelta.textContent = 'awaiting state_update';
        state.domRefs.heroPriceDelta.classList.remove('pos', 'neg');
      }
    }

    // Session meta line: trades, win%, unrealized P&L
    if (state.domRefs.heroSessionMeta) {
      const tradesEl = state.domRefs.heroSessionMeta.querySelector('[data-k="trades"]');
      const winEl = state.domRefs.heroSessionMeta.querySelector('[data-k="win"]');
      const unrEl = state.domRefs.heroSessionMeta.querySelector('[data-k="unr"]');
      if (tradesEl) tradesEl.textContent = String(state.sessionTradeCount);
      if (winEl) {
        if (state.sessionTradeCount > 0) {
          const wp = state.sessionWins / state.sessionTradeCount * 100;
          winEl.textContent = `${wp.toFixed(0)}%`;
          winEl.classList.toggle('pos', wp >= 60);
          winEl.classList.toggle('warn', wp >= 40 && wp < 60);
          winEl.classList.toggle('neg', wp < 40);
        } else {
          winEl.textContent = '--';
          winEl.classList.remove('pos', 'warn', 'neg');
        }
      }
      if (unrEl) {
        const u = Number(state.unrealizedPnL || 0);
        const sign = u >= 0 ? '+' : '';
        unrEl.textContent = `${sign}$${u.toFixed(2)}`;
        unrEl.classList.toggle('pos', u > 0);
        unrEl.classList.toggle('neg', u < 0);
      }
    }

    // Update status lights
    updateStatusLightDOM('data');
    updateStatusLightDOM('bot');
    updateStatusLightDOM('trai');

    // Update risk budget
    if (state.domRefs.riskBudgetPercent) {
      state.domRefs.riskBudgetPercent.textContent = `${Math.round(state.riskBudget)}%`;
      state.domRefs.riskBudgetPercent.className = `hs-risk-budget-percent ${state.riskLevel.toLowerCase()}`;
    }
    if (state.domRefs.riskBudgetLevel) {
      state.domRefs.riskBudgetLevel.textContent = state.riskLevel;
      state.domRefs.riskBudgetLevel.className = `hs-risk-budget-level ${state.riskLevel.toLowerCase()}`;
    }
  }

  // Auto-derive risk meter from session drawdown (if no external override).
  // Risk = % of session-open equity currently burned (cap at 100).
  function recomputeRiskBudget() {
    if (state.externalRiskOverride != null) return; // external module wins
    if (state.sessionOpenEquity <= 0) {
      state.riskBudget = 0;
      state.riskLevel = 'SAFE';
      return;
    }
    const drawdown = Math.max(0, state.sessionOpenEquity - state.equity);
    const pct = Math.min(100, drawdown / state.sessionOpenEquity * 100);
    state.riskBudget = pct;
    if (pct >= 50) state.riskLevel = 'DANGER';else if (pct >= 20) state.riskLevel = 'WARN';else state.riskLevel = 'SAFE';
  }

  // Pulse a status light + arm idle timer to dim it after silence.
  function pulseLight(name) {
    const lt = state.statusLights[name];
    if (!lt) return;
    lt.active = true;
    lt.error = false;
    lt.lastPulse = Date.now();
    const old = state.idleTimers[name];
    if (old) clearTimeout(old);
    state.idleTimers[name] = setTimeout(() => {
      lt.active = false;
      updateDisplay();
    }, LIGHT_IDLE_MS_BY_KIND[name] || 5000);
  }
  function updateStatusLightDOM(name) {
    const light = state.domRefs[`${name}Light`];
    if (!light) return;
    const status = state.statusLights[name];
    light.className = 'hs-light';
    if (status.error) {
      light.classList.add('error');
    } else if (status.active) {
      light.classList.add('active');
    }
  }

  // ─── WS Event Handlers (real bot emitter shapes) ────────────────────

  // 'price' tick - DATA light heartbeat only. The asset price itself lives
  // on the chart panel; we don't want to misuse the equity hero for it.
  function handlePrice(d) {
    try {
      const data = d && d.data ? d.data : d;
      const p = parseFloat(data && (data.price != null ? data.price : data.c));
      if (isNaN(p) || p <= 0) return;
      state.priceHistory.push(p);
      if (state.priceHistory.length > PRICE_HISTORY_SIZE) state.priceHistory.shift();
      pulseLight('data');
      updateDisplay();
    } catch (_) {/* swallow */}
  }

  // 'state_update' - StateManager's authoritative account snapshot.
  // Drives equity hero, session P&L delta, win-rate, risk meter.
  function handleStateUpdate(d) {
    try {
      const s = d && d.state ? d.state : d && d.data && d.data.state ? d.data.state : null;
      if (!s) return;
      const equity = Number(s.equity);
      if (!isFinite(equity) || equity <= 0) return;
      const unr = Number(s.unrealizedPnL || 0);
      const totPnL = Number(s.totalPnL || 0);
      const trades = Number(s.tradeCount || 0);
      const prevEquity = state.equity;
      state.unrealizedPnL = unr;
      state.equity = equity;
      state.sessionTotalPnL = totPnL;
      state.sessionTradeCount = trades;

      // Capture session-open equity on first real state_update.
      // Walk back to the pre-PnL principal so the % delta is correct
      // regardless of when the dashboard joined the session.
      if (state.sessionOpenEquity === 0) {
        state.sessionOpenEquity = equity - totPnL;
        if (state.sessionOpenEquity <= 0) state.sessionOpenEquity = equity;
      }

      // Recovery mode = bot self-flagged drawdown trigger -> DANGER lock
      if (s.recoveryMode && state.externalRiskOverride == null) {
        state.riskLevel = 'DANGER';
        state.riskBudget = Math.max(state.riskBudget, 50);
      } else {
        recomputeRiskBudget();
      }

      // Flash hero on equity change
      if (state.domRefs.heroPriceMain && Math.abs(state.equity - prevEquity) > 0.005) {
        const dir = state.equity >= prevEquity ? 'flash-up' : 'flash-down';
        state.domRefs.heroPriceMain.classList.remove('flash-up', 'flash-down');
        state.domRefs.heroPriceMain.classList.add(dir);
        setTimeout(() => {
          state.domRefs.heroPriceMain && state.domRefs.heroPriceMain.classList.remove(dir);
        }, PRICE_FLASH_MS);
      }
      updateDisplay();
    } catch (_) {/* swallow */}
  }

  // 'balance_update' - equity fallback for dashboards that arrive after StateManager.
  // Shape: { type:'balance_update', equity }
  function handleBalanceUpdate(d) {
    try {
      const data = d && d.data ? d.data : d;
      const equity = Number(data && data.equity);
      if (!isFinite(equity) || equity <= 0) return;
      state.equity = equity;
      if (state.sessionOpenEquity === 0) state.sessionOpenEquity = equity;
      recomputeRiskBudget();
      updateDisplay();
    } catch (_) {/* swallow */}
  }

  // 'bot_thinking' - BOT light heartbeat. We don't render the reasoning
  // here (Intelligence/HUD modules own that); we only use this as proof
  // of life for the BOT pill.
  function handleBotThinking(_d) {
    pulseLight('bot');
    updateDisplay();
  }

  // 'narrator_event' - TRAI heartbeat. Also drives a light pulse only.
  function handleNarratorEvent(_d) {
    pulseLight('trai');
    updateDisplay();
  }

  // 'trade' - session win/loss tally. Bot shape:
  //   { type:'trade', action:'BUY'|'SELL', direction, price, pnl, timestamp, confidence }
  // Only SELL events carry final pnl (BUY pnl is 0). Count both as a trade
  // increment; classify win/loss strictly by SELL.pnl sign.
  function handleTrade(d) {
    try {
      const data = d && d.data ? d.data : d;
      if (data.action === 'SELL') {
        const pnl = Number(data.pnl || 0);
        if (pnl > 0) state.sessionWins++;else if (pnl < 0) state.sessionLosses++;
      }
      // Do not increment sessionTradeCount here - state_update.tradeCount
      // is authoritative and arrives right after each trade. Avoids
      // double-counting if both fire.
      updateDisplay();
    } catch (_) {/* swallow */}
  }

  // External RiskGauge override (bus event)
  function handleRiskUpdate(data) {
    try {
      if (typeof data === 'string') data = JSON.parse(data);
      const pct = Number(data && data.percent);
      const lvl = data && data.level;
      if (!isFinite(pct)) return;
      state.externalRiskOverride = pct;
      state.riskBudget = Math.max(0, Math.min(100, pct));
      state.riskLevel = lvl || (pct >= 50 ? 'DANGER' : pct >= 20 ? 'WARN' : 'SAFE');
      updateDisplay();
    } catch (_) {/* swallow */}
  }

  // ─── Bus Event Listeners ────────────────────────────────────────────
  function subscribeToEvents() {
    if (OGZ && OGZ.bus) {
      OGZ.bus.on('risk:update', handleRiskUpdate);
      OGZ.bus.on('account:change', data => {
        if (data && data.account) {
          state.currentAccount = data.account;
          updateDisplay();
        }
      });
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const api = {
    init() {
      if (state.mounted) return;
      ensureEventBus();
      injectStyles();
      const root = document.getElementById(ROOT_ID);
      if (!root) return;
      state.domRefs.root = root;
      render();

      // Subscribe to WS events via the real socket (OGZ.get('Socket')).
      // Socket may not be registered yet at panel-init time, so poll briefly
      // and bind once it shows up. Bound subs survive for the page lifetime
      // (websocket.js doesn't currently expose unregisterHandler).
      (function bindSocket() {
        const socket = OGZ && typeof OGZ.get === 'function' ? OGZ.get('Socket') : null;
        if (!socket || typeof socket.registerHandler !== 'function') {
          setTimeout(bindSocket, 250);
          return;
        }
        socket.registerHandler('price', e => {
          try {
            handlePrice(e);
          } catch (_) {}
        });
        socket.registerHandler('state_update', e => {
          try {
            handleStateUpdate(e);
          } catch (_) {}
        });
        socket.registerHandler('balance_update', e => {
          try {
            handleBalanceUpdate(e);
          } catch (_) {}
        });
        socket.registerHandler('bot_thinking', e => {
          try {
            handleBotThinking(e);
          } catch (_) {}
        });
        socket.registerHandler('narrator_event', e => {
          try {
            handleNarratorEvent(e);
          } catch (_) {}
        });
        socket.registerHandler('trade', e => {
          try {
            handleTrade(e);
          } catch (_) {}
        });
      })();

      // Subscribe to bus events (account:change, risk:update)
      subscribeToEvents();
      state.mounted = true;
    },
    setAccount(accountName) {
      state.currentAccount = accountName;
      if (state.domRefs.accountSelector) {
        state.domRefs.accountSelector.value = accountName;
      }
      updateDisplay();
    },
    getAccount() {
      return state.currentAccount;
    },
    getEquity() {
      return {
        equity: state.equity,
        unrealizedPnL: state.unrealizedPnL,
        sessionPnL: state.equity - state.sessionOpenEquity,
        sessionPnLPercent: state.sessionOpenEquity > 0 ? (state.equity - state.sessionOpenEquity) / state.sessionOpenEquity * 100 : 0,
        sessionOpenEquity: state.sessionOpenEquity,
        trades: state.sessionTradeCount,
        wins: state.sessionWins,
        losses: state.sessionLosses
      };
    },
    setStatusLight(name, active, error) {
      if (state.statusLights[name]) {
        state.statusLights[name].active = !!active;
        state.statusLights[name].error = !!error;
        updateDisplay();
      }
    },
    setRiskBudget(percent, level) {
      state.riskBudget = Math.max(0, Math.min(100, percent || 0));
      state.riskLevel = level || 'SAFE';
      updateDisplay();
    },
    teardown() {
      if (!state.mounted) return;
      Object.keys(state.idleTimers).forEach(name => {
        if (state.idleTimers[name]) {
          clearTimeout(state.idleTimers[name]);
          state.idleTimers[name] = null;
        }
      });
      Object.keys(state.statusLights).forEach(name => {
        state.statusLights[name].active = false;
        state.statusLights[name].error = false;
        state.statusLights[name].lastPulse = 0;
      });

      // Remove event listeners
      if (state.domRefs.accountSelector) {
        state.domRefs.accountSelector.removeEventListener('change', null);
      }

      // Remove DOM
      if (state.domRefs.root) {
        state.domRefs.root.innerHTML = '';
      }

      // Remove styles
      const style = document.getElementById(STYLE_ID);
      if (style) style.remove();
      state.mounted = false;
      Object.keys(state.domRefs).forEach(key => {
        state.domRefs[key] = null;
      });
    },
    _compute() {
      return {
        mounted: state.mounted,
        equity: state.equity,
        unrealizedPnL: state.unrealizedPnL,
        sessionTotalPnL: state.sessionTotalPnL,
        sessionOpenEquity: state.sessionOpenEquity,
        sessionTradeCount: state.sessionTradeCount,
        sessionWins: state.sessionWins,
        sessionLosses: state.sessionLosses,
        riskBudget: state.riskBudget,
        riskLevel: state.riskLevel,
        externalRiskOverride: state.externalRiskOverride,
        statusLights: JSON.parse(JSON.stringify(state.statusLights)),
        currentAccount: state.currentAccount
      };
    }
  };

  // ─── Registration ──────────────────────────────────────────────────
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('HeaderStrip', api);
  } else if (window.OGZ) {
    window.OGZ.HeaderStrip = api;
  }
})(window.OGZ || (window.OGZ = {}));
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/header-strip.js", error: String((e && e.message) || e) }); }

// public/js/panels/layout-switcher.js
try { (() => {
/**
 * layout-switcher.js — LayoutSwitcher: 4-mode dashboard layout system
 *
 * Drives a body-class-based layout system. Sets one of:
 *   .layout-operator   — current full-vis default (everything visible)
 *   .layout-trader     — chart-dominant, rails compact, dev panels hidden
 *   .layout-showcase   — branded customer-demo skin (large fonts, hide dev)
 *   .layout-streamer   — OBS/Twitch-safe (16:9 aspect, webcam-safe zone, hide $)
 *
 * The actual visual rules live in /css/layouts.css. This module:
 *   - Builds the layout selector button in the dashboard header
 *   - Persists choice to localStorage
 *   - Shows a one-time first-run discovery hint (pulse-glow + tooltip) so
 *     users notice the feature exists; dismissed flag stored in localStorage
 *   - Emits OGZ.bus 'layout:change' { from, to } so modules can react
 *     (header-strip can re-render $ as % in streamer/showcase, etc.)
 *
 * Self-registers as OGZ.LayoutSwitcher via OGZ.register().
 *
 * Public API:
 *   init() — bind to DOM, restore last mode from localStorage
 *   getMode() — current mode string
 *   setMode(name) — switch to specified mode, broadcast 'layout:change'
 *   getModes() — list of available mode keys
 *   cycle() — rotate through modes
 *   on(cb) — register a change listener (alternative to OGZ.bus subscription)
 *   teardown()
 *   _compute()
 *
 * @module public/js/panels/layout-switcher
 */
(function (OGZ) {
  'use strict';

  const STORAGE_KEY = 'ogz.layout.mode';
  const HINT_KEY = 'ogz.layout.hintSeen'; // first-run discovery tooltip
  const DEFAULT_MODE = 'operator';
  const STYLE_ID = 'ogz-layout-switcher-styles';
  const MODES = [{
    key: 'operator',
    label: '🎛 Operator',
    tooltip: 'Full-vis default — everything visible'
  }, {
    key: 'trader',
    label: '📈 Trader',
    tooltip: 'Chart-dominant — rails collapsed'
  }, {
    key: 'showcase',
    label: '✨ Showcase',
    tooltip: 'Customer demo — branded, hide dev panels'
  }, {
    key: 'streamer',
    label: '📹 Streamer',
    tooltip: 'OBS/Twitch — privacy + 16:9'
  }];
  const state = {
    mode: DEFAULT_MODE,
    listeners: [],
    domRefs: {
      button: null,
      menu: null,
      hint: null
    },
    menuOpen: false,
    hintShown: false
  };

  // ─── Persistence ────────────────────────────────────────────────────
  function loadPersisted() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v && MODES.some(m => m.key === v)) state.mode = v;
    } catch (_) {/* swallow */}
  }
  function savePersisted() {
    try {
      localStorage.setItem(STORAGE_KEY, state.mode);
    } catch (_) {/* swallow */}
  }

  // ─── Body Class Application ─────────────────────────────────────────
  function applyBodyClass() {
    const body = document.body;
    if (!body) return;
    // Remove all layout-* classes, then add the current one
    const classes = Array.from(body.classList);
    for (const c of classes) {
      if (c.startsWith('layout-')) body.classList.remove(c);
    }
    body.classList.add('layout-' + state.mode);
  }

  // ─── Selector Button CSS (header chip + dropdown) ───────────────────
  function injectButtonStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            .ogz-layout-switcher {
                position: relative;
                display: inline-flex;
                align-items: center;
                margin-left: 8px;
                font-family: 'JetBrains Mono', monospace;
                z-index: 100;
            }
            .ogz-layout-switcher-btn {
                background: rgba(15, 15, 22, 0.7);
                border: 1px solid rgba(255, 215, 0, 0.22);
                color: #e6e6e6;
                font-size: 11px;
                font-family: 'JetBrains Mono', monospace;
                font-weight: 500;
                padding: 5px 10px;
                border-radius: 5px;
                cursor: pointer;
                transition: background 150ms, border-color 150ms;
                white-space: nowrap;
            }
            .ogz-layout-switcher-btn:hover {
                background: rgba(255, 215, 0, 0.10);
                border-color: rgba(255, 215, 0, 0.45);
            }
            .ogz-layout-switcher-btn.pulse {
                animation: ogz-ls-pulse 1.6s ease-in-out infinite;
            }
            @keyframes ogz-ls-pulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.4); }
                50%      { box-shadow: 0 0 0 6px rgba(255, 215, 0, 0); }
            }
            .ogz-layout-switcher-menu {
                position: absolute;
                top: calc(100% + 6px);
                right: 0;
                min-width: 200px;
                background: rgba(10, 10, 16, 0.96);
                border: 1px solid rgba(255, 215, 0, 0.3);
                border-radius: 6px;
                padding: 6px;
                box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
                backdrop-filter: blur(8px) saturate(160%);
                display: none;
                z-index: 9700;
            }
            .ogz-layout-switcher-menu.open { display: block; }
            .ogz-layout-switcher-item {
                display: flex;
                flex-direction: column;
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
                color: #e6e6e6;
                font-size: 12px;
                transition: background 120ms;
            }
            .ogz-layout-switcher-item:hover { background: rgba(255, 215, 0, 0.08); }
            .ogz-layout-switcher-item.active {
                background: rgba(255, 215, 0, 0.14);
                color: #ffd700;
            }
            .ogz-layout-switcher-item .ls-label { font-weight: 600; }
            .ogz-layout-switcher-item .ls-tip {
                font-size: 10px;
                color: rgba(255, 255, 255, 0.45);
                margin-top: 2px;
            }

            /* ─── First-run discovery hint bubble ─────────────────────── */
            .ogz-layout-hint {
                position: absolute;
                top: calc(100% + 12px);
                right: 0;
                width: 218px;
                background: linear-gradient(135deg, rgba(255,215,0,0.96), rgba(255,184,0,0.96));
                color: #15151a;
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                line-height: 1.45;
                font-weight: 600;
                padding: 10px 12px;
                border-radius: 7px;
                box-shadow: 0 8px 26px rgba(0, 0, 0, 0.55);
                z-index: 9710;
                animation: ogz-hint-in 260ms ease-out;
            }
            .ogz-layout-hint::before {
                /* arrow pointing up at the button */
                content: '';
                position: absolute;
                top: -6px;
                right: 22px;
                width: 12px;
                height: 12px;
                background: rgba(255, 215, 0, 0.96);
                transform: rotate(45deg);
            }
            .ogz-layout-hint .lh-title {
                display: block;
                font-weight: 800;
                font-size: 11px;
                letter-spacing: 0.04em;
                margin-bottom: 3px;
            }
            .ogz-layout-hint .lh-dismiss {
                display: inline-block;
                margin-top: 8px;
                background: rgba(21, 21, 26, 0.85);
                color: #ffd700;
                font-size: 10px;
                font-weight: 700;
                padding: 4px 9px;
                border-radius: 4px;
                cursor: pointer;
                border: none;
                font-family: 'JetBrains Mono', monospace;
            }
            .ogz-layout-hint .lh-dismiss:hover { background: #15151a; }
            @keyframes ogz-hint-in {
                0%   { opacity: 0; transform: translateY(-6px); }
                100% { opacity: 1; transform: translateY(0); }
            }

            @media (prefers-reduced-motion: reduce) {
                .ogz-layout-switcher-btn.pulse { animation: none; }
                .ogz-layout-hint { animation: none; }
            }
        `;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ─── DOM: Build & Mount the Switcher Button ─────────────────────────
  function buildSwitcherDOM() {
    // Mount target: prefer .hs-status-cluster (header right side); fall back
    // to body top-right fixed. The header-strip might be modular so do a
    // graceful detection.
    const wrap = document.createElement('div');
    wrap.className = 'ogz-layout-switcher';
    const btn = document.createElement('button');
    btn.className = 'ogz-layout-switcher-btn';
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = getButtonLabel();
    btn.title = 'Switch dashboard layout';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleMenu();
    });
    const menu = document.createElement('div');
    menu.className = 'ogz-layout-switcher-menu';
    menu.setAttribute('role', 'menu');
    for (const m of MODES) {
      const item = document.createElement('div');
      item.className = 'ogz-layout-switcher-item' + (m.key === state.mode ? ' active' : '');
      item.setAttribute('role', 'menuitemradio');
      item.dataset.mode = m.key;
      const labelEl = document.createElement('div');
      labelEl.className = 'ls-label';
      labelEl.textContent = m.label;
      const tipEl = document.createElement('div');
      tipEl.className = 'ls-tip';
      tipEl.textContent = m.tooltip;
      item.appendChild(labelEl);
      item.appendChild(tipEl);
      item.addEventListener('click', e => {
        e.stopPropagation();
        setMode(m.key);
        closeMenu();
      });
      menu.appendChild(item);
    }
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    state.domRefs.button = btn;
    state.domRefs.menu = menu;

    // Mount: prefer status cluster in header; fall back to body fixed
    const cluster = document.querySelector('.hs-status-cluster');
    if (cluster) {
      cluster.appendChild(wrap);
    } else {
      wrap.style.position = 'fixed';
      wrap.style.top = '14px';
      wrap.style.right = '14px';
      wrap.style.zIndex = '9650';
      document.body.appendChild(wrap);
    }

    // Click-away closes menu
    document.addEventListener('click', closeMenu);
  }
  function getButtonLabel() {
    const m = MODES.find(x => x.key === state.mode);
    return (m ? m.label : '🎛 Layout') + ' ▾';
  }
  function refreshButton() {
    if (state.domRefs.button) state.domRefs.button.textContent = getButtonLabel();
    if (state.domRefs.menu) {
      state.domRefs.menu.querySelectorAll('.ogz-layout-switcher-item').forEach(el => {
        el.classList.toggle('active', el.dataset.mode === state.mode);
      });
    }
  }
  function openMenu() {
    if (!state.domRefs.menu) return;
    state.domRefs.menu.classList.add('open');
    state.menuOpen = true;
    if (state.domRefs.button) state.domRefs.button.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    if (!state.domRefs.menu) return;
    state.domRefs.menu.classList.remove('open');
    state.menuOpen = false;
    if (state.domRefs.button) state.domRefs.button.setAttribute('aria-expanded', 'false');
  }
  function toggleMenu() {
    // Any interaction with the button retires the first-run hint.
    dismissHint();
    if (state.menuOpen) closeMenu();else openMenu();
  }

  // ─── First-Run Discovery Hint ───────────────────────────────────────
  function hintAlreadySeen() {
    try {
      return localStorage.getItem(HINT_KEY) === '1';
    } catch (_) {
      return false;
    }
  }
  function markHintSeen() {
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch (_) {/* swallow */}
  }
  function maybeShowHint() {
    if (state.hintShown) return;
    if (hintAlreadySeen()) return;
    if (!state.domRefs.button) return;
    state.hintShown = true;

    // Pulse-glow the button so the eye is drawn to it
    state.domRefs.button.classList.add('pulse');

    // Build the tooltip bubble, anchored to the switcher wrap
    const wrap = state.domRefs.button.parentElement;
    if (!wrap) return;
    const hint = document.createElement('div');
    hint.className = 'ogz-layout-hint';
    hint.setAttribute('role', 'status');
    const title = document.createElement('span');
    title.className = 'lh-title';
    title.textContent = '✨ New: Layout modes';
    const body = document.createElement('span');
    body.textContent = 'Switch between Operator, Trader, Showcase and Streamer views — pick what fits how you trade.';
    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'lh-dismiss';
    dismissBtn.textContent = 'Got it';
    dismissBtn.addEventListener('click', e => {
      e.stopPropagation();
      dismissHint();
    });
    hint.appendChild(title);
    hint.appendChild(body);
    hint.appendChild(dismissBtn);
    // Stop a click inside the bubble from bubbling to the doc click-away
    hint.addEventListener('click', e => e.stopPropagation());
    wrap.appendChild(hint);
    state.domRefs.hint = hint;

    // Auto-retire after 14s even if untouched (don't nag forever)
    setTimeout(() => dismissHint(), 14000);
  }
  function dismissHint() {
    markHintSeen();
    if (state.domRefs.button) state.domRefs.button.classList.remove('pulse');
    if (state.domRefs.hint && state.domRefs.hint.parentElement) {
      state.domRefs.hint.parentElement.removeChild(state.domRefs.hint);
    }
    state.domRefs.hint = null;
  }

  // ─── Mode Change ────────────────────────────────────────────────────
  function setMode(newMode) {
    if (!MODES.some(m => m.key === newMode)) return false;
    if (newMode === state.mode) return false;
    const from = state.mode;
    state.mode = newMode;
    applyBodyClass();
    savePersisted();
    refreshButton();
    // Notify subscribers
    const payload = {
      from,
      to: newMode
    };
    state.listeners.forEach(cb => {
      try {
        cb(payload);
      } catch (_) {}
    });
    if (OGZ.bus) OGZ.bus.emit('layout:change', payload);
    return true;
  }
  function cycle() {
    const idx = MODES.findIndex(m => m.key === state.mode);
    const next = MODES[(idx + 1) % MODES.length];
    setMode(next.key);
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const api = {
    init() {
      try {
        loadPersisted();
        injectButtonStyles();
        applyBodyClass();
        buildSwitcherDOM();
        refreshButton();
        // Defer the first-run hint a beat so the header has settled
        // and the pulse isn't competing with boot animations.
        setTimeout(maybeShowHint, 2200);
      } catch (_) {/* swallow */}
    },
    getMode: () => state.mode,
    setMode,
    getModes: () => MODES.map(m => ({
      ...m
    })),
    cycle,
    on(cb) {
      if (typeof cb === 'function') state.listeners.push(cb);
    },
    teardown() {
      try {
        document.removeEventListener('click', closeMenu);
        if (state.domRefs.button && state.domRefs.button.parentElement) {
          state.domRefs.button.parentElement.remove();
        }
        const s = document.getElementById(STYLE_ID);
        if (s) s.remove();
      } catch (_) {/* swallow */}
      state.listeners.length = 0;
    },
    _compute() {
      return {
        mode: state.mode,
        modes: MODES.map(m => m.key),
        mounted: !!state.domRefs.button,
        listenerCount: state.listeners.length,
        hintShown: state.hintShown,
        hintActive: !!state.domRefs.hint
      };
    }
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('LayoutSwitcher', api);
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('LayoutSwitcher', api);
      }
    });
  }
  try {
    window.OGZLayoutSwitcher = api;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/layout-switcher.js", error: String((e && e.message) || e) }); }

// public/js/panels/live-readouts.js
try { (() => {
/**
 * live-readouts.js — LiveReadouts: 6-Cell Technical Indicator Readout Grid
 *
 * Real-time display of core technical indicators (RSI, MACD, ATR, Volume, Live Conf, Pattern).
 * Extracted from unified-dashboard.html's inline "Live Readouts" section to become the tenth
 * shipped modular panel after NewsTicker, WatchlistStrip, PatternCard, HeaderStrip, TRAIBrain,
 * OpenPositions, ChainOfThought, EquityCurve, and SystemHealth.
 *
 * What it renders:
 *   - 2 rows × 3 columns grid of indicator cells
 *   - RSI (color-coded: green neutral, gold warn, red extreme)
 *   - MACD (green positive, red negative, with +/- sign)
 *   - ATR (absolute volatility value)
 *   - VOLUME (formatted for readability: K, M notation)
 *   - LIVE CONF (confidence percentage with mini progress bar in --core-color)
 *   - PATTERN (current detected pattern name or "Scanning...")
 *
 * Each cell animates a subtle gold flash on value update (lr-cell-flash, 300ms).
 * Cells show "--" when no data available; briefly clear on symbol change.
 *
 * Self-registers as OGZ.LiveReadouts via OGZ.register().
 * Mounts into <div id="liveReadouts"></div>.
 * Subscribes to WS events:
 *   - price — extracts data.indicators (RSI, MACD, ATR, Volume) and data.confidence if present
 *   - signal_analysis — updates LIVE CONF if data.modules.orchestrator.confidence exists
 *   - pattern_analysis — updates PATTERN with data.pattern.name
 * Listens to OGZ.bus events:
 *   - watchlist:select — clears all cells to "--" briefly when symbol changes
 *
 * Graceful fallback: all cells show "--" until first data arrives.
 * No console.log in production code. All updates are cell-only (no full re-render).
 *
 * Public API:
 *   init() — Mount to DOM, inject styles, subscribe to WS + bus events
 *   setSymbol(symbol) — Update currentSymbol state (called on watchlist:select)
 *   updateRSI(value) — Update RSI cell with numeric value
 *   updateMACD(value) — Update MACD cell with numeric value (+/-)
 *   updateATR(value) — Update ATR cell with numeric value
 *   updateVolume(value) — Update VOLUME cell with numeric value (auto-formatted)
 *   updateLiveConf(value) — Update LIVE CONF cell with percentage (0-100)
 *   updatePattern(name) — Update PATTERN cell with pattern name string
 *   clearAll() — Reset all cells to "--"
 *   teardown() — Remove DOM, listeners, styles
 *   _compute() — Debug helper: return current state snapshot
 *
 * EXTRACTION SOURCE WARNING:
 *   This module was extracted from public/unified-dashboard.html (workspace 3) inline
 *   "Live Readouts" section (lines 3266-3290, HTML) with attendant inline CSS (grid,
 *   cell styling, font, colors). If the operator's monolith has drifted since baseline
 *   (3), the visual layout or element ID names may differ; this module's JS logic should
 *   still function because it drives cell updates via WS events, not HTML structure.
 *   On visual mismatch, compare the v2 shell mount point (unified-dashboard-v2.html:506)
 *   with the original HTML and adjust grid layout / class names as needed.
 *
 * @typedef {Object} ReadoutValue
 * @property {number|string} value - The metric value (number or formatted string like "2.4M")
 * @property {number} [timestamp] - Unix epoch milliseconds when last updated
 * @property {number} [flashUntil] - Unix epoch milliseconds until flash animation ends
 *
 * @module public/js/panels/live-readouts
 */
(function (OGZ) {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────
  const STYLE_ID = 'ogz-live-readouts-styles';
  const ROOT_ID = 'liveReadouts';
  const CELL_FLASH_MS = 300; // Duration of gold flash on value update
  const DEFAULT_SYMBOL = 'UNKNOWN';

  // RSI color thresholds (neutral 30-70, warn 20-30 / 70-80, extreme <20 or >80)
  const RSI_NEUTRAL_MIN = 30;
  const RSI_NEUTRAL_MAX = 70;
  const RSI_WARN_LOW = 20;
  const RSI_WARN_HIGH = 80;

  // ─── Private State ──────────────────────────────────────────────────
  const state = {
    mounted: false,
    currentSymbol: DEFAULT_SYMBOL,
    rsi: '--',
    macd: '--',
    atr: '--',
    volume: '--',
    liveConf: '--',
    pattern: 'Scanning...',
    // Cell DOM references
    rsiCell: null,
    macdCell: null,
    atrCell: null,
    volumeCell: null,
    liveConfCell: null,
    liveConfBar: null,
    patternCell: null
  };

  // ─── CSS Injection ───────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                grid-template-rows: auto auto;
                gap: 8px 12px;
                padding: 12px;
                background: var(--glass-bg, rgba(15, 15, 18, 0.55));
                border: 1px solid var(--glass-border, rgba(255, 215, 0, 0.18));
                border-radius: 8px;
                font-size: 12px;
            }

            .lr-cell {
                display: flex;
                flex-direction: column;
                gap: 4px;
                padding: 8px 10px;
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid var(--glass-border, rgba(255, 215, 0, 0.1));
                border-radius: 6px;
                text-align: center;
            }

            .lr-label {
                font-size: 9px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: var(--text-secondary, #a1a1aa);
            }

            .lr-value {
                font-family: 'Orbitron', 'JetBrains Mono', monospace;
                font-size: 14px;
                font-weight: 700;
                color: var(--text-primary, #e4e4e7);
                min-height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            /* RSI color logic */
            .lr-value.rsi-neutral {
                color: var(--profit-color, #00ff88);
            }

            .lr-value.rsi-warn {
                color: var(--ml-color, #ffd700);
            }

            .lr-value.rsi-extreme {
                color: var(--loss-color, #ff3366);
            }

            /* MACD color logic */
            .lr-value.macd-positive {
                color: var(--profit-color, #00ff88);
            }

            .lr-value.macd-negative {
                color: var(--loss-color, #ff3366);
            }

            /* Live Conf progress bar */
            .lr-conf-wrapper {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .lr-conf-bar {
                width: 100%;
                height: 3px;
                background: rgba(0, 255, 136, 0.15);
                border-radius: 2px;
                overflow: hidden;
            }

            .lr-conf-fill {
                height: 100%;
                background: var(--core-color, #00d9ff);
                border-radius: 2px;
                transition: width 0.3s ease;
            }

            /* Cell flash animation on update */
            @keyframes lr-cell-flash {
                0% {
                    background: rgba(255, 255, 255, 0.02);
                }
                50% {
                    background: rgba(255, 215, 0, 0.12);
                }
                100% {
                    background: rgba(255, 255, 255, 0.02);
                }
            }

            .lr-cell.lr-flashing {
                animation: lr-cell-flash ${CELL_FLASH_MS}ms ease-out forwards;
            }

            /* Responsive on small screens */
            @media (max-width: 600px) {
                #${ROOT_ID} {
                    grid-template-columns: repeat(2, 1fr);
                    gap: 6px 10px;
                    padding: 8px;
                    font-size: 10px;
                }

                .lr-value {
                    font-size: 12px;
                }

                .lr-label {
                    font-size: 8px;
                }
            }
        `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Format Helpers ─────────────────────────────────────────────────
  function formatVolume(val) {
    if (!isFinite(val) || val <= 0) return '--';
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
    return val.toFixed(0);
  }
  function getRSIColorClass(val) {
    if (!isFinite(val)) return '';
    if (val >= RSI_NEUTRAL_MIN && val <= RSI_NEUTRAL_MAX) {
      return 'rsi-neutral';
    } else if (val >= RSI_WARN_LOW && val < RSI_NEUTRAL_MIN || val > RSI_NEUTRAL_MAX && val <= RSI_WARN_HIGH) {
      return 'rsi-warn';
    } else {
      return 'rsi-extreme';
    }
  }
  function getMACSColorClass(val) {
    if (!isFinite(val)) return '';
    return val > 0 ? 'macd-positive' : 'macd-negative';
  }
  function flashCell(cell) {
    if (!cell) return;
    cell.classList.remove('lr-flashing');
    // Trigger reflow to restart animation
    void cell.offsetWidth;
    cell.classList.add('lr-flashing');
  }

  // ─── DOM Rendering ──────────────────────────────────────────────────
  function render() {
    if (!state.mounted) return;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.innerHTML = '';

    // RSI Cell
    const rsiCellDiv = document.createElement('div');
    rsiCellDiv.className = 'lr-cell';
    const rsiLabel = document.createElement('div');
    rsiLabel.className = 'lr-label';
    rsiLabel.textContent = 'RSI';
    const rsiValue = document.createElement('div');
    rsiValue.className = 'lr-value';
    rsiValue.textContent = String(state.rsi);
    rsiCellDiv.appendChild(rsiLabel);
    rsiCellDiv.appendChild(rsiValue);
    root.appendChild(rsiCellDiv);
    state.rsiCell = rsiCellDiv;
    const rsiValueSpan = rsiValue;
    Object.defineProperty(state, 'rsiValueSpan', {
      writable: true,
      value: rsiValueSpan,
      enumerable: false
    });

    // MACD Cell
    const macdCellDiv = document.createElement('div');
    macdCellDiv.className = 'lr-cell';
    const macdLabel = document.createElement('div');
    macdLabel.className = 'lr-label';
    macdLabel.textContent = 'MACD';
    const macdValue = document.createElement('div');
    macdValue.className = 'lr-value';
    macdValue.textContent = String(state.macd);
    macdCellDiv.appendChild(macdLabel);
    macdCellDiv.appendChild(macdValue);
    root.appendChild(macdCellDiv);
    state.macdCell = macdCellDiv;
    Object.defineProperty(state, 'macdValueSpan', {
      writable: true,
      value: macdValue,
      enumerable: false
    });

    // ATR Cell
    const atrCellDiv = document.createElement('div');
    atrCellDiv.className = 'lr-cell';
    const atrLabel = document.createElement('div');
    atrLabel.className = 'lr-label';
    atrLabel.textContent = 'ATR';
    const atrValue = document.createElement('div');
    atrValue.className = 'lr-value';
    atrValue.textContent = String(state.atr);
    atrCellDiv.appendChild(atrLabel);
    atrCellDiv.appendChild(atrValue);
    root.appendChild(atrCellDiv);
    state.atrCell = atrCellDiv;
    Object.defineProperty(state, 'atrValueSpan', {
      writable: true,
      value: atrValue,
      enumerable: false
    });

    // VOLUME Cell
    const volCellDiv = document.createElement('div');
    volCellDiv.className = 'lr-cell';
    const volLabel = document.createElement('div');
    volLabel.className = 'lr-label';
    volLabel.textContent = 'VOLUME';
    const volValue = document.createElement('div');
    volValue.className = 'lr-value';
    volValue.textContent = String(state.volume);
    volCellDiv.appendChild(volLabel);
    volCellDiv.appendChild(volValue);
    root.appendChild(volCellDiv);
    state.volumeCell = volCellDiv;
    Object.defineProperty(state, 'volumeValueSpan', {
      writable: true,
      value: volValue,
      enumerable: false
    });

    // LIVE CONF Cell
    const confCellDiv = document.createElement('div');
    confCellDiv.className = 'lr-cell';
    const confLabel = document.createElement('div');
    confLabel.className = 'lr-label';
    confLabel.textContent = 'LIVE CONF';
    const confWrapper = document.createElement('div');
    confWrapper.className = 'lr-conf-wrapper';
    const confValue = document.createElement('div');
    confValue.className = 'lr-value';
    confValue.textContent = String(state.liveConf);
    const confBar = document.createElement('div');
    confBar.className = 'lr-conf-bar';
    const confFill = document.createElement('div');
    confFill.className = 'lr-conf-fill';
    confFill.style.width = '0%';
    confBar.appendChild(confFill);
    confWrapper.appendChild(confValue);
    confWrapper.appendChild(confBar);
    confCellDiv.appendChild(confLabel);
    confCellDiv.appendChild(confWrapper);
    root.appendChild(confCellDiv);
    state.liveConfCell = confCellDiv;
    state.liveConfBar = confFill;
    Object.defineProperty(state, 'confValueSpan', {
      writable: true,
      value: confValue,
      enumerable: false
    });

    // PATTERN Cell
    const patternCellDiv = document.createElement('div');
    patternCellDiv.className = 'lr-cell';
    const patternLabel = document.createElement('div');
    patternLabel.className = 'lr-label';
    patternLabel.textContent = 'PATTERN';
    const patternValue = document.createElement('div');
    patternValue.className = 'lr-value';
    patternValue.textContent = String(state.pattern);
    patternCellDiv.appendChild(patternLabel);
    patternCellDiv.appendChild(patternValue);
    root.appendChild(patternCellDiv);
    state.patternCell = patternCellDiv;
    Object.defineProperty(state, 'patternValueSpan', {
      writable: true,
      value: patternValue,
      enumerable: false
    });
  }

  // ─── Update Methods ─────────────────────────────────────────────────
  function updateCell(cellName, value) {
    if (!state.mounted) return;
    let cellDiv = null;
    let valueSpan = null;
    let formattedValue = value;
    switch (cellName) {
      case 'rsi':
        cellDiv = state.rsiCell;
        valueSpan = state.rsiValueSpan;
        if (isFinite(value)) {
          formattedValue = isFinite(value) ? Number(value).toFixed(0) : '--';
        } else {
          formattedValue = '--';
        }
        break;
      case 'macd':
        cellDiv = state.macdCell;
        valueSpan = state.macdValueSpan;
        if (isFinite(value)) {
          formattedValue = (value > 0 ? '+' : '') + Number(value).toFixed(2);
        } else {
          formattedValue = '--';
        }
        break;
      case 'atr':
        cellDiv = state.atrCell;
        valueSpan = state.atrValueSpan;
        if (isFinite(value)) {
          formattedValue = Number(value).toFixed(2);
        } else {
          formattedValue = '--';
        }
        break;
      case 'volume':
        cellDiv = state.volumeCell;
        valueSpan = state.volumeValueSpan;
        formattedValue = isFinite(value) ? formatVolume(value) : '--';
        break;
      case 'liveConf':
        cellDiv = state.liveConfCell;
        valueSpan = state.confValueSpan;
        if (isFinite(value)) {
          const pct = Math.max(0, Math.min(100, Number(value)));
          formattedValue = pct.toFixed(0) + '%';
          if (state.liveConfBar) {
            state.liveConfBar.style.width = pct + '%';
          }
        } else {
          formattedValue = '--';
          if (state.liveConfBar) {
            state.liveConfBar.style.width = '0%';
          }
        }
        break;
      case 'pattern':
        cellDiv = state.patternCell;
        valueSpan = state.patternValueSpan;
        formattedValue = String(value || 'Scanning...');
        break;
    }
    if (valueSpan && cellDiv) {
      valueSpan.textContent = String(formattedValue);

      // Update color classes for RSI and MACD
      if (cellName === 'rsi') {
        valueSpan.classList.remove('rsi-neutral', 'rsi-warn', 'rsi-extreme');
        const rsiClass = getRSIColorClass(value);
        if (rsiClass) {
          valueSpan.classList.add(rsiClass);
        }
      } else if (cellName === 'macd') {
        valueSpan.classList.remove('macd-positive', 'macd-negative');
        const macdClass = getMACSColorClass(value);
        if (macdClass) {
          valueSpan.classList.add(macdClass);
        }
      }

      // Flash the cell
      flashCell(cellDiv);
    }
  }
  function clearIndicatorReadouts() {
    state.rsi = '--';
    state.macd = '--';
    state.atr = '--';
    state.volume = '--';
    updateCell('rsi', NaN);
    updateCell('macd', NaN);
    updateCell('atr', NaN);
    updateCell('volume', NaN);
  }

  // ─── WS Event Handlers ───────────────────────────────────────────────
  function onPrice(data) {
    try {
      if (!data) return;

      // Extract indicators from price event
      if (Object.prototype.hasOwnProperty.call(data, 'indicators') && data.indicators == null) {
        clearIndicatorReadouts();
      } else if (data.indicators) {
        if (isFinite(data.indicators.rsi)) {
          updateCell('rsi', data.indicators.rsi);
          state.rsi = Number(data.indicators.rsi).toFixed(0);
        }
        if (isFinite(data.indicators.macd)) {
          updateCell('macd', data.indicators.macd);
          state.macd = Number(data.indicators.macd).toFixed(2);
        }
        if (isFinite(data.indicators.atr)) {
          updateCell('atr', data.indicators.atr);
          state.atr = Number(data.indicators.atr).toFixed(2);
        }
        if (isFinite(data.indicators.volume)) {
          updateCell('volume', data.indicators.volume);
          state.volume = formatVolume(data.indicators.volume);
        }
      }

      // Extract confidence if present (alternative: signal_analysis provides this)
      if (isFinite(data.confidence)) {
        updateCell('liveConf', data.confidence);
        state.liveConf = Number(data.confidence).toFixed(0) + '%';
      }
    } catch (e) {
      // Gracefully ignore malformed price events
    }
  }
  function onSignalAnalysis(data) {
    try {
      if (!data) return;

      // Extract confidence from signal_analysis event
      // spec: data.modules.orchestrator.confidence
      if (data.modules && data.modules.orchestrator && isFinite(data.modules.orchestrator.confidence)) {
        const conf = data.modules.orchestrator.confidence;
        updateCell('liveConf', conf);
        state.liveConf = Number(conf).toFixed(0) + '%';
      }
    } catch (e) {
      // Gracefully ignore malformed signal_analysis events
    }
  }
  function onPatternAnalysis(data) {
    try {
      if (!data) return;

      // Extract pattern name from pattern_analysis event
      // spec: data.pattern.name
      if (data.pattern && data.pattern.name) {
        const patternName = String(data.pattern.name).toUpperCase();
        updateCell('pattern', patternName);
        state.pattern = patternName;
      }
    } catch (e) {
      // Gracefully ignore malformed pattern_analysis events
    }
  }
  function onWatchlistSelect(symbol) {
    try {
      if (!symbol) return;
      state.currentSymbol = String(symbol);
      // Clear cells briefly when symbol changes
      clearAll();
    } catch (e) {
      // Gracefully ignore
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────
  function init() {
    if (state.mounted) return;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    injectStyles();

    // Mark mounted BEFORE render() — render's defensive
    // `if (!state.mounted) return` would otherwise bail and produce
    // an empty panel. Setting mounted first preserves render's guard
    // for future callers (e.g. WS handlers that fire before init completes).
    state.mounted = true;
    render();

    // Subscribe to WS events
    const socket = OGZ.get('Socket');
    if (socket) {
      socket.registerHandler('price', onPrice);
      socket.registerHandler('signal_analysis', onSignalAnalysis);
      socket.registerHandler('pattern_analysis', onPatternAnalysis);
    }

    // Subscribe to OGZ.bus events
    OGZ.bus.on('watchlist:select', onWatchlistSelect);
  }
  function setSymbol(symbol) {
    state.currentSymbol = String(symbol || DEFAULT_SYMBOL);
    clearAll();
  }
  function updateRSI(value) {
    if (isFinite(value)) {
      state.rsi = Number(value).toFixed(0);
      updateCell('rsi', value);
    }
  }
  function updateMACD(value) {
    if (isFinite(value)) {
      state.macd = Number(value).toFixed(2);
      updateCell('macd', value);
    }
  }
  function updateATR(value) {
    if (isFinite(value)) {
      state.atr = Number(value).toFixed(2);
      updateCell('atr', value);
    }
  }
  function updateVolume(value) {
    if (isFinite(value)) {
      state.volume = formatVolume(value);
      updateCell('volume', value);
    }
  }
  function updateLiveConf(value) {
    if (isFinite(value)) {
      state.liveConf = Number(value).toFixed(0) + '%';
      updateCell('liveConf', value);
    }
  }
  function updatePattern(name) {
    if (name) {
      state.pattern = String(name).toUpperCase();
      updateCell('pattern', state.pattern);
    }
  }
  function clearAll() {
    state.rsi = '--';
    state.macd = '--';
    state.atr = '--';
    state.volume = '--';
    state.liveConf = '--';
    state.pattern = 'Scanning...';
    if (state.rsiValueSpan) state.rsiValueSpan.textContent = '--';
    if (state.macdValueSpan) state.macdValueSpan.textContent = '--';
    if (state.atrValueSpan) state.atrValueSpan.textContent = '--';
    if (state.volumeValueSpan) state.volumeValueSpan.textContent = '--';
    if (state.confValueSpan) state.confValueSpan.textContent = '--';
    if (state.patternValueSpan) state.patternValueSpan.textContent = 'Scanning...';
    if (state.liveConfBar) state.liveConfBar.style.width = '0%';
  }
  function teardown() {
    if (!state.mounted) return;

    // Unsubscribe from WS events
    const socket = OGZ.get('Socket');
    if (socket) {
      socket.unregisterHandler('price', onPrice);
      socket.unregisterHandler('signal_analysis', onSignalAnalysis);
      socket.unregisterHandler('pattern_analysis', onPatternAnalysis);
    }

    // Unsubscribe from OGZ.bus events
    OGZ.bus.off('watchlist:select', onWatchlistSelect);

    // Remove DOM
    const root = document.getElementById(ROOT_ID);
    if (root) {
      root.innerHTML = '';
    }

    // Remove injected styles
    const styleEl = document.getElementById(STYLE_ID);
    if (styleEl) {
      styleEl.remove();
    }
    state.mounted = false;
  }
  function _compute() {
    return {
      mounted: state.mounted,
      currentSymbol: state.currentSymbol,
      rsi: state.rsi,
      macd: state.macd,
      atr: state.atr,
      volume: state.volume,
      liveConf: state.liveConf,
      pattern: state.pattern
    };
  }

  // ─── Module Registration ────────────────────────────────────────────
  OGZ.register('LiveReadouts', {
    init,
    setSymbol,
    updateRSI,
    updateMACD,
    updateATR,
    updateVolume,
    updateLiveConf,
    updatePattern,
    clearAll,
    teardown,
    _compute
  });
})(window.OGZ);
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/live-readouts.js", error: String((e && e.message) || e) }); }

// public/js/panels/live-report.js
try { (() => {
/**
 * live-report.js — LiveReport: Gate H operator/customer live trade report
 *
 * Covers Gate H plan commits 4, 5, 6, 7. Renders, fed ONLY by verified real
 * events (no synthetic data, no hydration defaults, no fake trades):
 *
 *   - Context strip  → active symbol / timeframe / account (asset_switched)
 *   - Data freshness → live / Ns ago / STALE clock from message arrival
 *   - Account state  → position / balance / realized PnL / trades / mode
 *                       (state_update)
 *   - Latest bot read → bot_thinking message + reasoning + confidence + regime
 *                       + winning strategy (commit 6)
 *   - Today scoreboard → today's trades / today's P&L / win rate / streak
 *                        (journal_snapshot)
 *   - Recent closed trades (commit 5) → append-only list of the last ~12
 *     closed trades from journal_snapshot.recentTrades; new trades prepend
 *     in real time via trade_closed_replay; each row carries direction,
 *     entry→exit, hold, P&L, exit reason — every field a real backend value.
 *   - New-trade flash (commit 7) → the freshly-prepended row briefly glows
 *     when trade_closed_replay arrives, motion-gated for reduced-motion.
 *
 * Mount contract: renders into <div id="liveReport"></div>. If no docked mount
 * point exists the module renders NOTHING (no floating fallback — the
 * goal-tracker overlay mistake is not repeated). Operator/customer aware via
 * localStorage 'ogz.profile'. Reduced-motion safe.
 *
 * Public API: init() / render() / teardown() / _compute()
 *
 * @module public/js/panels/live-report
 */
(function (OGZ) {
  'use strict';

  const ROOT_ID = 'liveReport';
  const STYLE_ID = 'ogz-live-report-styles';

  // Freshness thresholds (ms)
  const FRESH_LIVE_MS = 8000;
  const FRESH_RECENT_MS = 20000;
  const MAX_TRADE_ROWS = 12;
  const FLASH_MS = 1200;
  const TRACE_EVENTS_FOR_REPORT = new Set(['ANALYSIS_SKIP', 'ANALYSIS_START', 'ACTIVE_CANDLE_AGGREGATED', 'BROKER_ORDER_REQUEST', 'BROKER_ORDER_RESULT', 'BOOT_REST_HYDRATION_CANDLE', 'CANDLE_ACCEPTED', 'CANDLE_INGRESS', 'CANDLE_NORMALIZED', 'CANDLE_PROCESSOR_RECEIVED', 'CANDLE_SCOPE_REJECTED', 'DECISION_SKIP', 'EVAL_RULE_CHECK', 'EXECUTE_HANDOFF', 'EXECUTE_RETURN', 'EXIT_ONLY_START', 'GAP_BACKFILL_REPLAY', 'ORDER_BLOCKED', 'ORDER_EXCEPTION', 'ORDER_EXECUTE_START', 'ORDER_PLAN', 'REST_RECOVERY_SCOPE_REJECTED', 'STATE_MUTATION', 'STRATEGY_DECISION', 'LIVENESS_REST_BACKFILL_CANDLE', 'TRACE_SCHEMA_ERROR', 'TRADING_CYCLE_TRIGGER', 'TTP_CONSISTENCY_CHECK', 'WEBHOOK_ORDER_DISPATCH', 'WEBHOOK_ORDER_RESULT']);
  const IS_OPERATOR = function () {
    try {
      return localStorage.getItem('ogz.profile') === 'operator';
    } catch (_) {
      return false;
    }
  }();

  // ─── State ──────────────────────────────────────────────────────────
  const state = {
    mounted: false,
    lastMsgAt: 0,
    asset: null,
    // { label, base, broker, assetClass }
    account: null,
    // state_update .state
    thinking: null,
    // { message, reasoning, confidence, regime, winner, ts }
    trace: null,
    // latest operator-relevant trace_event payload
    journal: null,
    // headline stats from journal_snapshot.data
    recentTrades: [],
    // newest-first; rows shaped below
    domRefs: {},
    freshTimer: null,
    replayClickBound: false,
    replayClickHandler: null
  };

  // ─── Helpers ────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);
  }
  function fmtMoney(n) {
    const v = Number(n);
    if (!isFinite(v)) return '—';
    return '$' + v.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  function fmtSignedMoney(n) {
    const v = Number(n);
    if (!isFinite(v)) return '—';
    const sign = v > 0 ? '+' : v < 0 ? '-' : '';
    return sign + '$' + Math.abs(v).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  function fmtPct(n, digits) {
    const v = Number(n);
    if (!isFinite(v)) return '—';
    return v.toFixed(digits == null ? 1 : digits) + '%';
  }
  function describePosition(pos) {
    if (pos == null) return {
      text: '—',
      cls: ''
    };
    if (typeof pos === 'number') {
      if (pos === 0) return {
        text: 'FLAT',
        cls: 'lr-flat'
      };
      return {
        text: pos > 0 ? 'LONG' : 'SHORT',
        cls: pos > 0 ? 'lr-long' : 'lr-short'
      };
    }
    if (typeof pos === 'string') {
      const u = pos.toUpperCase();
      if (u === 'FLAT' || u === '') return {
        text: 'FLAT',
        cls: 'lr-flat'
      };
      if (u === 'LONG') return {
        text: 'LONG',
        cls: 'lr-long'
      };
      if (u === 'SHORT') return {
        text: 'SHORT',
        cls: 'lr-short'
      };
      return {
        text: u,
        cls: ''
      };
    }
    if (typeof pos === 'object') {
      const dir = String(pos.direction || pos.side || '').toUpperCase();
      if (!pos.size || pos.size === 0) return {
        text: 'FLAT',
        cls: 'lr-flat'
      };
      if (dir === 'LONG') return {
        text: 'LONG',
        cls: 'lr-long'
      };
      if (dir === 'SHORT') return {
        text: 'SHORT',
        cls: 'lr-short'
      };
      return {
        text: 'OPEN',
        cls: ''
      };
    }
    return {
      text: '—',
      cls: ''
    };
  }
  function activeTimeframe() {
    const el = document.getElementById('cp-timeframeSelector');
    return el && el.value ? el.value : '—';
  }
  function shortTime(ts) {
    if (!ts) return '';
    const ms = timestampMs(ts);
    if (ms == null) return '';
    try {
      return new Date(ms).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return '';
    }
  }
  function timestampMs(ts) {
    if (ts == null || ts === '') return null;
    const n = Number(ts);
    if (Number.isFinite(n)) return n;
    const parsed = Date.parse(String(ts));
    return Number.isFinite(parsed) ? parsed : null;
  }
  function ageText(ms) {
    const n = Math.max(0, Number(ms) || 0);
    if (n < 60000) return Math.round(n / 1000) + 's';
    if (n < 3600000) return Math.round(n / 60000) + 'm';
    return (n / 3600000).toFixed(1).replace(/\.0$/, '') + 'h';
  }
  function finiteNumber(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function eventText(v) {
    if (v == null || v === '') return null;
    const s = String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
    if (!s) return null;
    return s.length > 240 ? s.slice(0, 237) + '...' : s;
  }
  function normalizedTraceEventName(v) {
    const s = eventText(v);
    return s ? s.toUpperCase() : null;
  }
  function pctText(v) {
    const n = finiteNumber(v);
    if (n == null) return null;
    const text = Math.abs(n) > 0 && Math.abs(n) < 1 ? n.toFixed(1).replace(/\.0$/, '') : n.toFixed(0);
    return text + '%';
  }
  function confidenceText(value, explicitPct) {
    const n = finiteNumber(value);
    if (n == null) return 'invalid';
    const pct = explicitPct ? n : Math.abs(n) <= 1 ? n * 100 : n;
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return 'invalid';
    return pctText(pct);
  }
  function traceFieldKeys(fields) {
    if (!fields || typeof fields !== 'object') return [];
    return Object.keys(fields).map(eventText).filter(Boolean).sort().slice(0, 12);
  }
  function firstValue() {
    for (let i = 0; i < arguments.length; i++) {
      if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') {
        return arguments[i];
      }
    }
    return null;
  }
  function normalizeOutcome(v) {
    const s = String(v || '').trim().toLowerCase();
    return ['win', 'loss', 'flat', 'unverified'].includes(s) ? s : null;
  }
  function validPrice(v) {
    const n = finiteNumber(v);
    return n != null && n > 0 ? n : null;
  }
  function formatHoldTime(raw) {
    if (typeof raw === 'string' && raw.trim()) return raw;
    const n = finiteNumber(raw);
    if (n == null || n <= 0) return null;
    if (n < 60000) return `${Math.max(1, Math.round(n / 1000))}s`;
    if (n < 3600000) return `${Math.round(n / 60000)}m`;
    return `${(n / 3600000).toFixed(1)}h`;
  }
  function tradeKey(t) {
    if (!t) return '';
    if (t.orderId != null && String(t.orderId) !== '') return 'id:' + String(t.orderId);
    return [t.timestamp || '', t.direction || '', t.entryPrice || '', t.exitPrice || '', t.netPnl || ''].join('|');
  }
  function renderTraceMeta() {
    const d = state.domRefs;
    if (!d.traceMeta) return;
    const t = state.trace;
    if (!t) {
      d.traceMeta.textContent = '';
      return;
    }
    const now = Date.now();
    const meta = Array.isArray(t.metaParts) ? t.metaParts.slice() : [];
    if (t.receivedAt != null) meta.push('received ' + ageText(now - t.receivedAt) + ' ago');
    if (t.eventAt != null) {
      const eventAge = now - t.eventAt;
      meta.push((eventAge > FRESH_RECENT_MS ? 'trace stale ' : 'trace age ') + ageText(eventAge));
    } else {
      meta.push('trace time unavailable');
    }
    if (t.actionRequired) {
      meta.push(t.actionRequired);
    } else if (t.knownEvent === false) {
      meta.push('action required add trace vocabulary');
    }
    d.traceMeta.textContent = meta.join('  ·  ');
  }
  function socketHandler(name, fn) {
    return function (event) {
      try {
        fn(event);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        const safeMessage = eventText(message) || 'trace handler threw without message';
        console.warn('[LiveReport] socket handler failed for ' + name + ': ' + safeMessage);
        if (name === 'trace_event') {
          state.trace = {
            summary: 'TRACE_HANDLER_ERROR | handler trace_event failed',
            metaParts: ['error ' + safeMessage],
            actionRequired: 'action required inspect trace handler',
            receivedAt: Date.now(),
            eventAt: null,
            knownEvent: false
          };
          state.lastMsgAt = Date.now();
          render();
          tickFreshness();
        }
      }
    };
  }
  function dirClass(d) {
    const u = String(d || '').toUpperCase();
    if (u === 'LONG' || u === 'BUY') return {
      text: 'LONG',
      cls: 'lr-long'
    };
    if (u === 'SHORT' || u === 'SELL_SHORT' || u === 'SELL' || u === 'COVER') {
      return u === 'SELL' || u === 'COVER' ? {
        text: 'EXIT',
        cls: 'lr-flat'
      } : {
        text: 'SHORT',
        cls: 'lr-short'
      };
    }
    return {
      text: u || '—',
      cls: ''
    };
  }

  // ─── Style Injection ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                background: rgba(10, 10, 14, 0.55);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                padding: 12px 14px;
                font-family: 'JetBrains Mono', 'Courier New', monospace;
                color: #d1d4dc;
                overflow: hidden;
            }
            #${ROOT_ID} .lr-head {
                display: flex; align-items: center; justify-content: space-between;
                gap: 10px; margin-bottom: 10px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06); padding-bottom: 8px;
            }
            #${ROOT_ID} .lr-title {
                font-size: 11px; font-weight: 700; letter-spacing: 0.16em;
                text-transform: uppercase; color: #e4e4e7;
            }
            #${ROOT_ID} .lr-fresh {
                font-size: 10px; letter-spacing: 0.04em; padding: 2px 8px;
                border-radius: 10px; white-space: nowrap;
            }
            #${ROOT_ID} .lr-fresh.live   { color: #22c55e; background: rgba(34,197,94,0.12);  border: 1px solid rgba(34,197,94,0.35); }
            #${ROOT_ID} .lr-fresh.recent { color: #fbbf24; background: rgba(251,191,36,0.10); border: 1px solid rgba(251,191,36,0.30); }
            #${ROOT_ID} .lr-fresh.stale  { color: #ef4444; background: rgba(239,68,68,0.12);  border: 1px solid rgba(239,68,68,0.35); }

            #${ROOT_ID} .lr-grid {
                display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
                gap: 8px 14px; margin-bottom: 10px;
            }
            #${ROOT_ID} .lr-cell .lr-k,
            #${ROOT_ID} .lr-stat .lr-k {
                font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase;
                color: #71717a; margin-bottom: 2px;
            }
            #${ROOT_ID} .lr-cell .lr-v,
            #${ROOT_ID} .lr-stat .lr-v {
                font-size: 13px; font-weight: 600; color: #e4e4e7;
            }
            #${ROOT_ID} .lr-v.lr-flat  { color: #a1a1aa; }
            #${ROOT_ID} .lr-v.lr-long  { color: #22c55e; }
            #${ROOT_ID} .lr-v.lr-short { color: #ef4444; }
            #${ROOT_ID} .lr-v.pos { color: #22c55e; }
            #${ROOT_ID} .lr-v.neg { color: #ef4444; }

            #${ROOT_ID} .lr-reason {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 6px; padding: 8px 10px;
            }
            #${ROOT_ID} .lr-trace {
                margin-top: 8px;
                background: rgba(255, 255, 255, 0.025);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 6px; padding: 8px 10px;
            }
            #${ROOT_ID} .lr-reason .lr-k {
                font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase;
                color: #71717a; margin-bottom: 4px;
            }
            #${ROOT_ID} .lr-trace .lr-k {
                font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase;
                color: #71717a; margin-bottom: 4px;
            }
            #${ROOT_ID} .lr-reason .lr-msg {
                font-size: 12px; line-height: 1.5; color: #d1d4dc;
            }
            #${ROOT_ID} .lr-trace .lr-msg {
                font-size: 11px; line-height: 1.45; color: #d1d4dc;
                word-break: break-word;
            }
            #${ROOT_ID} .lr-reason .lr-meta {
                font-size: 10px; color: #71717a; margin-top: 5px;
            }
            #${ROOT_ID} .lr-trace .lr-meta {
                font-size: 10px; color: #71717a; margin-top: 5px;
                word-break: break-word;
            }
            #${ROOT_ID} .lr-empty { color: #52525b; font-style: italic; }

            /* Today scoreboard (commit 5 headline) */
            #${ROOT_ID} .lr-stats-row {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
                gap: 8px 14px;
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid rgba(255, 255, 255, 0.06);
            }

            /* Recent closed trades (commits 5 + 7) */
            #${ROOT_ID} .lr-trades { margin-top: 10px; }
            #${ROOT_ID} .lr-trades-head {
                font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase;
                color: #71717a; margin-bottom: 6px;
                display: flex; align-items: center; justify-content: space-between;
            }
            #${ROOT_ID} .lr-trades-body {
                display: flex; flex-direction: column; gap: 4px;
            }
            #${ROOT_ID} .lr-tr {
                display: grid;
                grid-template-columns: 56px 56px minmax(0, 1fr) 60px 86px minmax(0, 1.4fr);
                gap: 8px; align-items: center;
                padding: 5px 8px;
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 4px;
                font-size: 11px;
            }
            #${ROOT_ID} .lr-tr.win  { border-left: 2px solid #22c55e; }
            #${ROOT_ID} .lr-tr.loss { border-left: 2px solid #ef4444; }
            #${ROOT_ID} .lr-tr-clickable {
                cursor: pointer;
                transition: background-color 120ms ease, border-color 120ms ease;
            }
            #${ROOT_ID} .lr-tr-clickable:hover {
                background: rgba(255, 215, 0, 0.06);
                border-color: rgba(255, 215, 0, 0.25);
            }
            #${ROOT_ID} .lr-tr-time { color: #71717a; font-size: 10px; }
            #${ROOT_ID} .lr-tr-dir  { font-weight: 700; font-size: 10px; letter-spacing: 0.06em; }
            #${ROOT_ID} .lr-tr-dir.lr-long  { color: #22c55e; }
            #${ROOT_ID} .lr-tr-dir.lr-short { color: #ef4444; }
            #${ROOT_ID} .lr-tr-px   { color: #d1d4dc; font-family: 'JetBrains Mono', monospace; }
            #${ROOT_ID} .lr-tr-hold { color: #a1a1aa; font-size: 10px; }
            #${ROOT_ID} .lr-tr-pnl  { font-weight: 700; }
            #${ROOT_ID} .lr-tr-pnl.pos { color: #22c55e; }
            #${ROOT_ID} .lr-tr-pnl.neg { color: #ef4444; }
            #${ROOT_ID} .lr-tr-reason {
                color: #a1a1aa; font-size: 10px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }

            /* New-trade flash (commit 7) — motion-gated below */
            #${ROOT_ID} .lr-tr.lr-flash {
                animation: lr-flash-kf ${FLASH_MS}ms ease-out 1;
                box-shadow: 0 0 0 1px rgba(255, 215, 0, 0.45),
                            0 0 14px rgba(255, 215, 0, 0.35);
            }
            @keyframes lr-flash-kf {
                0%   { background: rgba(255, 215, 0, 0.22); }
                100% { background: rgba(255, 255, 255, 0.02); }
            }
            @media (prefers-reduced-motion: reduce) {
                #${ROOT_ID} .lr-tr.lr-flash {
                    animation: none;
                    box-shadow: 0 0 0 1px rgba(255, 215, 0, 0.35);
                }
            }
        `;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    if (document.head) document.head.appendChild(el);
  }

  // ─── Mount ──────────────────────────────────────────────────────────
  function mount() {
    if (state.mounted) return true;
    const root = document.getElementById(ROOT_ID);
    if (!root) return false;
    root.innerHTML = `
            <div class="lr-head">
                <span class="lr-title">Live Trade Report</span>
                <span class="lr-fresh" data-k="fresh">awaiting feed</span>
            </div>
            <div class="lr-grid">
                <div class="lr-cell"><div class="lr-k">Symbol</div><div class="lr-v" data-k="symbol">—</div></div>
                <div class="lr-cell"><div class="lr-k">Timeframe</div><div class="lr-v" data-k="tf">—</div></div>
                <div class="lr-cell"><div class="lr-k">Account</div><div class="lr-v" data-k="account">—</div></div>
                <div class="lr-cell"><div class="lr-k">Position</div><div class="lr-v" data-k="position">—</div></div>
                <div class="lr-cell"><div class="lr-k">Balance</div><div class="lr-v" data-k="balance">—</div></div>
                <div class="lr-cell"><div class="lr-k">Realized P&L (lifetime)</div><div class="lr-v" data-k="realized">—</div></div>
                <div class="lr-cell"><div class="lr-k">Trades (lifetime)</div><div class="lr-v" data-k="trades">—</div></div>
                <div class="lr-cell"><div class="lr-k">Mode</div><div class="lr-v" data-k="mode">—</div></div>
            </div>
            <div class="lr-reason">
                <div class="lr-k">Latest bot reasoning</div>
                <div class="lr-msg" data-k="reason"><span class="lr-empty">No signal yet — waiting for the bot's first read.</span></div>
                <div class="lr-meta" data-k="reasonMeta"></div>
            </div>
            <div class="lr-trace">
                <div class="lr-k">Latest pipeline trace</div>
                <div class="lr-msg" data-k="trace"><span class="lr-empty">Waiting for first trace_event frame.</span></div>
                <div class="lr-meta" data-k="traceMeta"></div>
            </div>
            <div class="lr-stats-row">
                <div class="lr-stat"><div class="lr-k">Today Trades</div><div class="lr-v" data-k="todayTrades">—</div></div>
                <div class="lr-stat"><div class="lr-k">Today P&L</div><div class="lr-v" data-k="todayPnl">—</div></div>
                <div class="lr-stat"><div class="lr-k">Today Win Rate</div><div class="lr-v" data-k="todayWR">—</div></div>
                <div class="lr-stat"><div class="lr-k">Streak</div><div class="lr-v" data-k="streak">—</div></div>
            </div>
            <div class="lr-trades">
                <div class="lr-trades-head">
                    <span>Recent closed trades</span>
                    <span data-k="tradesMeta"></span>
                </div>
                <div class="lr-trades-body" data-k="tradeList">
                    <div class="lr-empty">No closed trades this session yet.</div>
                </div>
            </div>
        `;
    const q = sel => root.querySelector(sel);
    state.domRefs = {
      fresh: q('[data-k="fresh"]'),
      symbol: q('[data-k="symbol"]'),
      tf: q('[data-k="tf"]'),
      account: q('[data-k="account"]'),
      position: q('[data-k="position"]'),
      balance: q('[data-k="balance"]'),
      realized: q('[data-k="realized"]'),
      trades: q('[data-k="trades"]'),
      mode: q('[data-k="mode"]'),
      reason: q('[data-k="reason"]'),
      reasonMeta: q('[data-k="reasonMeta"]'),
      trace: q('[data-k="trace"]'),
      traceMeta: q('[data-k="traceMeta"]'),
      todayTrades: q('[data-k="todayTrades"]'),
      todayPnl: q('[data-k="todayPnl"]'),
      todayWR: q('[data-k="todayWR"]'),
      streak: q('[data-k="streak"]'),
      tradesMeta: q('[data-k="tradesMeta"]'),
      tradeList: q('[data-k="tradeList"]')
    };
    state.mounted = true;
    return true;
  }

  // ─── Freshness ──────────────────────────────────────────────────────
  function tickFreshness() {
    const el = state.domRefs.fresh;
    if (!el) return;
    if (state.domRefs.tf) state.domRefs.tf.textContent = activeTimeframe();
    if (!state.lastMsgAt) {
      el.textContent = 'awaiting feed';
      el.className = 'lr-fresh stale';
      return;
    }
    const age = Date.now() - state.lastMsgAt;
    if (age < FRESH_LIVE_MS) {
      el.textContent = 'live';
      el.className = 'lr-fresh live';
    } else if (age < FRESH_RECENT_MS) {
      el.textContent = Math.round(age / 1000) + 's ago';
      el.className = 'lr-fresh recent';
    } else {
      el.textContent = 'STALE · ' + Math.round(age / 1000) + 's no feed';
      el.className = 'lr-fresh stale';
    }
    renderTraceMeta();
  }

  // ─── Render: quiet-period view (context, account, reasoning) ────────
  function renderQuiet() {
    const d = state.domRefs;
    const acct = state.account;
    if (d.symbol) {
      d.symbol.textContent = state.asset ? state.asset.label || state.asset.base || state.asset.asset || '—' : '—';
    }
    if (d.tf) d.tf.textContent = activeTimeframe();
    if (d.account) {
      d.account.textContent = acct && acct.accountId ? String(acct.accountId) : state.asset && state.asset.accountId ? String(state.asset.accountId) : '—';
    }
    if (d.position) {
      const p = describePosition(acct ? acct.position : null);
      d.position.textContent = p.text;
      d.position.className = 'lr-v ' + p.cls;
    }
    if (d.balance) {
      d.balance.textContent = acct && acct.balance != null ? fmtMoney(acct.balance) : '—';
    }
    if (d.realized) {
      if (acct && acct.realizedPnL != null) {
        const v = Number(acct.realizedPnL);
        d.realized.textContent = fmtSignedMoney(v);
        d.realized.className = 'lr-v ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
      } else {
        d.realized.textContent = '—';
        d.realized.className = 'lr-v';
      }
    }
    if (d.trades) {
      d.trades.textContent = acct && acct.tradeCount != null ? String(acct.tradeCount) : '—';
    }
    if (d.mode) {
      d.mode.textContent = !acct ? '—' : acct.recoveryMode ? 'RECOVERY' : 'NORMAL';
    }
    if (d.reason) {
      const t = state.thinking;
      if (t && (t.message || t.reasoning)) {
        d.reason.textContent = String(t.reasoning || t.message);
      } else {
        d.reason.innerHTML = '<span class="lr-empty">No signal yet — waiting for the bot’s first read.</span>';
      }
    }
    if (d.reasonMeta) {
      const t = state.thinking;
      if (t) {
        const bits = [];
        if (t.winner) bits.push('winner ' + esc(t.winner));
        if (t.confidence != null) bits.push('confidence ' + Number(t.confidence).toFixed(0) + '%');
        if (t.regime) bits.push('regime ' + esc(t.regime));
        if (t.ts) {
          bits.push(new Date(t.ts).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }));
        }
        d.reasonMeta.textContent = bits.join('  ·  ');
      } else {
        d.reasonMeta.textContent = '';
      }
    }
    if (d.trace) {
      const t = state.trace;
      if (t && t.summary) {
        d.trace.textContent = t.summary;
      } else {
        d.trace.innerHTML = '<span class="lr-empty">Waiting for first trace_event frame.</span>';
      }
    }
    if (d.traceMeta) {
      renderTraceMeta();
    }
  }

  // ─── Render: today scoreboard from journal_snapshot ─────────────────
  function renderStats() {
    const d = state.domRefs;
    const j = state.journal;
    if (d.todayTrades) d.todayTrades.textContent = j && j.todayTrades != null ? String(j.todayTrades) : '—';
    if (d.todayPnl) {
      if (j && j.todayPnl != null) {
        const v = Number(j.todayPnl);
        d.todayPnl.textContent = fmtSignedMoney(v);
        d.todayPnl.className = 'lr-v ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
      } else {
        d.todayPnl.textContent = '—';
        d.todayPnl.className = 'lr-v';
      }
    }
    if (d.todayWR) {
      d.todayWR.textContent = j && j.todayWinRate != null ? fmtPct(j.todayWinRate) : '—';
    }
    if (d.streak) {
      if (j && j.currentStreak != null) {
        const type = j.currentStreakType || '';
        const n = Math.abs(j.currentStreak);
        if (n === 0) {
          d.streak.textContent = '—';
          d.streak.className = 'lr-v';
        } else {
          const isWin = /^win/i.test(type) || j.currentStreak > 0;
          d.streak.textContent = `${n}${isWin ? 'W' : 'L'}`;
          d.streak.className = 'lr-v ' + (isWin ? 'pos' : 'neg');
        }
      } else {
        d.streak.textContent = '—';
        d.streak.className = 'lr-v';
      }
    }
  }

  // ─── Render: recent closed trades ───────────────────────────────────
  function renderTrades(flashOrderId) {
    const d = state.domRefs;
    if (!d.tradeList) return;
    if (d.tradesMeta) {
      const total = state.journal && state.journal.totalTrades != null ? state.journal.totalTrades : state.recentTrades.length;
      d.tradesMeta.textContent = state.recentTrades.length ? `last ${state.recentTrades.length} of ${total}` : '';
    }
    if (!state.recentTrades.length) {
      d.tradeList.innerHTML = '<div class="lr-empty">No closed trades this session yet.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const t of state.recentTrades) {
      const row = document.createElement('div');
      const key = tradeKey(t);
      const pnl = finiteNumber(t.netPnl);
      const outcome = normalizeOutcome(t.outcome);
      const isWin = outcome ? outcome === 'win' : pnl != null && pnl > 0;
      const isLoss = outcome ? outcome === 'loss' : pnl != null && pnl < 0;
      row.className = 'lr-tr' + (isWin ? ' win' : isLoss ? ' loss' : '');
      row.classList.add('lr-tr-clickable');
      row.dataset.tradeKey = key;
      if (t.orderId != null && String(t.orderId) !== '') row.dataset.orderId = String(t.orderId);
      if (t.timestamp != null && String(t.timestamp) !== '') row.dataset.ts = String(t.timestamp);
      if (t.symbol != null && String(t.symbol) !== '') row.dataset.symbol = String(t.symbol);
      row.title = 'Click to open trade replay';
      if (flashOrderId && key === flashOrderId) row.classList.add('lr-flash');
      const dir = dirClass(t.direction);
      const time = document.createElement('span');
      time.className = 'lr-tr-time';
      time.textContent = shortTime(t.timestamp);
      const dirEl = document.createElement('span');
      dirEl.className = 'lr-tr-dir ' + dir.cls;
      dirEl.textContent = dir.text;
      const px = document.createElement('span');
      px.className = 'lr-tr-px';
      const ep = validPrice(t.entryPrice),
        xp = validPrice(t.exitPrice);
      px.textContent = ep != null && xp != null ? `${ep.toFixed(2)} → ${xp.toFixed(2)}` : '—';
      const hold = document.createElement('span');
      hold.className = 'lr-tr-hold';
      hold.textContent = t.holdTime ? String(t.holdTime) : '—';
      const pnlEl = document.createElement('span');
      pnlEl.className = 'lr-tr-pnl ' + (isWin ? 'pos' : isLoss ? 'neg' : '');
      if (pnl != null) {
        const pct = finiteNumber(t.pnlPercent);
        const pctPart = pct != null ? `  (${pct.toFixed(2)}%)` : '';
        pnlEl.textContent = fmtSignedMoney(pnl) + pctPart;
      } else {
        pnlEl.textContent = '—';
      }
      const reason = document.createElement('span');
      reason.className = 'lr-tr-reason';
      reason.title = outcome === 'unverified' ? 'unverified outcome' : t.exitReason ? String(t.exitReason) : '';
      reason.textContent = outcome === 'unverified' ? 'unverified' : t.exitReason ? String(t.exitReason) : '';
      row.appendChild(time);
      row.appendChild(dirEl);
      row.appendChild(px);
      row.appendChild(hold);
      row.appendChild(pnlEl);
      row.appendChild(reason);
      frag.appendChild(row);
    }
    d.tradeList.innerHTML = '';
    d.tradeList.appendChild(frag);
    if (flashOrderId) {
      // strip the flash class after the animation so re-renders don't re-flash
      setTimeout(() => {
        try {
          const flashed = d.tradeList.querySelector('.lr-tr.lr-flash');
          if (flashed) flashed.classList.remove('lr-flash');
        } catch (_) {/* swallow */}
      }, FLASH_MS + 80);
    }
  }
  function render(flashOrderId) {
    if (!state.mounted) return;
    renderQuiet();
    renderStats();
    renderTrades(flashOrderId);
  }

  // ─── Event handlers (real events only) ──────────────────────────────
  function onStateUpdate(msg) {
    const s = msg && msg.state ? msg.state : null;
    if (!s) return;
    state.account = s;
    state.lastMsgAt = Date.now();
    render();
    tickFreshness();
  }
  function onAssetSwitched(msg) {
    const a = msg && msg.data ? msg.data : null;
    if (!a) return;
    state.asset = a;
    state.lastMsgAt = Date.now();
    render();
    tickFreshness();
  }
  function onBotThinking(msg) {
    if (!msg) return;
    const winner = msg.winner_id || msg.winner && (msg.winner.id || msg.winner.name) || null;
    state.thinking = {
      message: msg.message || null,
      reasoning: msg.data && msg.data.reasoning || null,
      confidence: msg.confidence != null ? msg.confidence : msg.data && msg.data.confidence != null ? msg.data.confidence : null,
      regime: msg.data && msg.data.regime || null,
      winner: winner,
      ts: msg.timestamp || Date.now()
    };
    state.lastMsgAt = Date.now();
    render();
    tickFreshness();
  }
  function onJournalSnapshot(msg) {
    const d = msg && msg.data ? msg.data : null;
    if (!d) return;
    state.journal = d;
    if (Array.isArray(d.recentTrades)) {
      // journal_snapshot's recentTrades are newest-first per TradeJournal.getSnapshot;
      // cap to MAX_TRADE_ROWS in case the backend changes the cap.
      state.recentTrades = d.recentTrades.slice(0, MAX_TRADE_ROWS);
    }
    state.lastMsgAt = Date.now();
    render();
    tickFreshness();
  }
  function onTradeClosedReplay(msg) {
    const d = msg && msg.data ? msg.data : null;
    if (!d) return;
    if (d.orderId == null || String(d.orderId) === '') {
      console.warn('[LiveReport] Ignoring trade_closed_replay without orderId; closed-trade rows require journal-backed identity.');
      state.lastMsgAt = Date.now();
      tickFreshness();
      return;
    }
    const row = {
      orderId: d.orderId,
      direction: d.direction || null,
      entryPrice: d.entryPrice,
      exitPrice: d.exitPrice,
      netPnl: d.pnl,
      pnlPercent: d.pnlPercent,
      outcome: d.outcome || null,
      holdTime: formatHoldTime(d.holdTime),
      exitReason: d.reason || null,
      confidence: null,
      regime: null,
      timestamp: d.timestamp || Date.now()
    };
    // Prepend, dedupe by backend id, cap.
    const rowKey = tradeKey(row);
    const filtered = state.recentTrades.filter(t => tradeKey(t) !== rowKey);
    state.recentTrades = [row, ...filtered].slice(0, MAX_TRADE_ROWS);
    state.lastMsgAt = Date.now();
    render(rowKey);
    tickFreshness();
  }
  function summarizeTraceEvent(msg) {
    if (!msg) return null;
    const fields = msg.fields && typeof msg.fields === 'object' ? msg.fields : {};
    const hasRawEventField = Object.prototype.hasOwnProperty.call(msg, 'event');
    const rawEventName = eventText(msg.event);
    const normalizedName = normalizedTraceEventName(rawEventName);
    const hasEventName = !!normalizedName;
    const knownEvent = hasEventName && TRACE_EVENTS_FOR_REPORT.has(normalizedName);
    const eventName = hasEventName ? knownEvent ? normalizedName : 'UNMAPPED_TRACE_EVENT' : 'TRACE_SCHEMA_ERROR';
    const bits = [eventName];
    if (!hasEventName) {
      bits.push('missing required field event');
    } else if (!knownEvent) {
      bits.push('event ' + normalizedName);
      bits.push('action required add trace vocabulary');
    }
    const action = firstValue(msg.action, fields.action);
    const direction = firstValue(fields.finalDirection, fields.direction);
    const reason = firstValue(fields.reason, fields.rejectionReason, fields.noMutationReason);
    const winner = firstValue(fields.winnerStrategy, fields.winner, fields.strategy);
    const confidencePct = firstValue(fields.confidencePct, msg.confidencePct);
    const confidenceRaw = firstValue(fields.confidence, msg.confidence);
    const minConfidencePct = firstValue(fields.minConfidencePct, msg.minConfidencePct);
    const minConfidenceRaw = firstValue(fields.minConfidence, msg.minConfidence);
    const success = firstValue(fields.success);
    const sent = firstValue(fields.sent);
    if (action != null) bits.push('action ' + eventText(action));
    if (direction != null) bits.push('direction ' + eventText(direction));
    if (reason != null) bits.push('reason ' + eventText(reason));
    if (winner != null) bits.push('winner ' + eventText(winner));
    if (confidencePct != null) bits.push('confidence ' + (confidenceText(confidencePct, true) || eventText(confidencePct)));else if (confidenceRaw != null) bits.push('confidence ' + (confidenceText(confidenceRaw, false) || eventText(confidenceRaw)));
    if (minConfidencePct != null) bits.push('min ' + (confidenceText(minConfidencePct, true) || eventText(minConfidencePct)));else if (minConfidenceRaw != null) bits.push('min ' + (confidenceText(minConfidenceRaw, false) || eventText(minConfidenceRaw)));
    if (success != null) bits.push('success ' + eventText(success));
    if (sent != null) bits.push('sent ' + eventText(sent));
    const meta = [];
    const fieldKeys = traceFieldKeys(fields);
    const traceId = firstValue(msg.traceId, fields.traceId);
    const symbol = firstValue(msg.symbol, fields.symbol);
    const timeframe = firstValue(msg.timeframe, fields.timeframe);
    const broker = firstValue(msg.brokerId, fields.brokerId);
    const account = firstValue(msg.accountId, fields.accountId);
    const mode = firstValue(msg.executionMode, fields.executionMode);
    const scopeKey = firstValue(msg.scopeKey, fields.scopeKey);
    const ts = msg.timestamp || fields.timestamp || Date.now();
    const eventAt = timestampMs(ts);
    if (rawEventName && rawEventName !== normalizedName) meta.push('raw event ' + rawEventName);
    if (!hasEventName) {
      meta.push(hasRawEventField ? 'event field blank' : 'event field missing');
      meta.push('schema path trace_event.event');
    }
    if ((!hasEventName || !knownEvent) && fieldKeys.length) {
      meta.push('field keys ' + fieldKeys.join(','));
    }
    if (symbol != null) meta.push(eventText(symbol));
    if (timeframe != null) meta.push(eventText(timeframe));
    if (broker != null) meta.push('broker ' + eventText(broker));
    if (account != null) meta.push('account ' + eventText(account));
    if (mode != null) meta.push('mode ' + eventText(mode));
    if (traceId != null) meta.push('trace ' + eventText(traceId));
    if (scopeKey != null) meta.push('scope ' + eventText(scopeKey));
    if (eventAt != null) meta.push(shortTime(eventAt));
    return {
      summary: bits.join(' | '),
      metaParts: meta,
      actionRequired: !hasEventName ? 'action required fix trace payload schema' : !knownEvent ? 'action required add trace vocabulary' : null,
      receivedAt: Date.now(),
      eventAt,
      knownEvent
    };
  }
  function onTraceEvent(msg) {
    const summarized = summarizeTraceEvent(msg);
    if (!summarized) return;
    state.trace = summarized;
    state.lastMsgAt = Date.now();
    render();
    tickFreshness();
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const api = {
    init() {
      try {
        injectStyles();
        if (!mount()) return;
        render();
        if (!state.replayClickBound && state.domRefs && state.domRefs.tradeList) {
          state.replayClickHandler = e => {
            try {
              const row = e.target.closest('.lr-tr-clickable');
              if (!row) return;
              let trade = null;
              const key = row.dataset.tradeKey || '';
              const orderId = row.dataset.orderId || '';
              const ts = row.dataset.ts || '';
              if (key) trade = state.recentTrades.find(t => tradeKey(t) === key) || null;
              if (!trade && orderId) trade = state.recentTrades.find(t => String(t.orderId) === orderId) || null;
              if (!trade && ts) trade = state.recentTrades.find(t => String(t.timestamp) === ts) || null;
              if (!trade) return;
              const replay = OGZ && typeof OGZ.get === 'function' ? OGZ.get('TradeReplay') : null;
              if (replay && typeof replay.openReplay === 'function') {
                replay.openReplay(trade);
              } else if (window.OGZTradeReplay && typeof window.OGZTradeReplay.openReplay === 'function') {
                window.OGZTradeReplay.openReplay(trade);
              }
            } catch (_) {/* swallow */}
          };
          state.domRefs.tradeList.addEventListener('click', state.replayClickHandler);
          state.replayClickBound = true;
        }
        (function bindSocket() {
          const socket = OGZ && typeof OGZ.get === 'function' ? OGZ.get('Socket') : null;
          if (!socket || typeof socket.registerHandler !== 'function') {
            setTimeout(bindSocket, 250);
            return;
          }
          socket.registerHandler('state_update', socketHandler('state_update', onStateUpdate));
          socket.registerHandler('asset_switched', socketHandler('asset_switched', onAssetSwitched));
          socket.registerHandler('bot_thinking', socketHandler('bot_thinking', onBotThinking));
          socket.registerHandler('trace_event', socketHandler('trace_event', onTraceEvent));
          socket.registerHandler('journal_snapshot', socketHandler('journal_snapshot', onJournalSnapshot));
          socket.registerHandler('trade_closed_replay', socketHandler('trade_closed_replay', onTradeClosedReplay));
        })();
        state.freshTimer = setInterval(tickFreshness, 1000);
      } catch (_) {/* never throw from init */}
    },
    render,
    teardown() {
      try {
        if (state.freshTimer) {
          clearInterval(state.freshTimer);
          state.freshTimer = null;
        }
        if (state.replayClickBound && state.domRefs && state.domRefs.tradeList && state.replayClickHandler) {
          state.domRefs.tradeList.removeEventListener('click', state.replayClickHandler);
          state.replayClickBound = false;
          state.replayClickHandler = null;
        }
        const s = document.getElementById(STYLE_ID);
        if (s) s.remove();
        state.mounted = false;
      } catch (_) {/* swallow */}
    },
    _compute() {
      return {
        mounted: state.mounted,
        lastMsgAt: state.lastMsgAt,
        hasAsset: !!state.asset,
        hasAccount: !!state.account,
        hasThinking: !!state.thinking,
        hasTrace: !!state.trace,
        hasJournal: !!state.journal,
        tradeRows: state.recentTrades.length
      };
    }
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('LiveReport', api);
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('LiveReport', api);
      }
    });
  }
  try {
    window.OGZLiveReport = api;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/live-report.js", error: String((e && e.message) || e) }); }

// public/js/panels/loss-recovery.js
try { (() => {
/**
 * loss-recovery.js — LossRecovery: roast/encourage emotional counter-layer
 *
 * The honest other half of the celebration loop. Subscribes to OGZ.bus
 * 'celebration:loss' (emitted by CustomAlerts on losing closes) and either
 * roasts you (1–2 loss streak — cathartic) or encourages you (3+ — supportive)
 * via the Web Speech API. Smart psychology: short losses get the trash-talk
 * release valve; sustained losses get the human reminder of what you're
 * actually fighting for.
 *
 * Self-registers as OGZ.LossRecovery.
 * Subscribes to OGZ.bus 'celebration:loss'.
 * Emits OGZ.bus 'celebration:loss-message' { tone, text, streakLoss } for
 * downstream renderers (e.g. a chain-of-thought banner could pick it up).
 *
 * NO synthetic events. Messages only fire when a real bot loss is broadcast.
 * Voice is opt-out (defaults on, toggle via setVoiceEnabled).
 *
 * Public API:
 *   init()
 *   processLoss(payload) — manual trigger
 *   setVoiceEnabled(bool) — mute/unmute speech
 *   pickMessage(streakLoss) — get next message without firing
 *   teardown()
 *   _compute()
 *
 * @module public/js/panels/loss-recovery
 */
(function (OGZ) {
  'use strict';

  // ─── Message Banks (preserved from the Mover stack, browser-adapted) ─
  // Roast bank — fires on streak 1–2. Cathartic small-loss release.
  const ROASTS = ["Bro really thought that was the play? Even my calculator is laughing.", "That trade was so bad, your daughter's goldfish could've called it better.", "Houston just got 10 miles further away with that one, chief.", "I've seen better decisions at 3am Taco Bell.", "Your pattern recognition looking like a Jackson Pollock painting right now.", "That wasn't trading, that was charity work for the market makers.", "Even the simulation mode is embarrassed for you.", "Sir, this is a Wendy's. And you still managed to lose money.", "That trade had more red flags than a parade.", "Congratulations, you just funded someone's yacht payment."];

  // Encouragement bank — fires on streak 3+. Supportive when actually struggling.
  const ENCOURAGEMENTS = ["Hey warrior. Losses are tuition at Market University. You're learning.", "Every legend has a comeback story. This is chapter one.", "Your daughter doesn't need a perfect trader. She needs her dad. Keep pushing.", "Rocky got knocked down too. It's the getting up that counts.", "This loss is temporary. Missing your daughter is what hurts. Let's fix both.", "Champions aren't made from victories. They're made from setbacks like this.", "Houston's still there. Your dreams are still valid. This is just a detour.", "You coded this whole system from scratch. This loss is nothing compared to that.", "Bad trades don't define you. Getting back up does. Let's go.", "Your future self in Houston is proud you didn't quit today."];

  // Comeback bank — fires on streak 5+ (the deep grind). The fight-back energy.
  const COMEBACKS = ["COMEBACK MODE. Time to show these charts who's boss.", "From the ashes, a phoenix rises. Time to fly.", "Valhalla doesn't accept quitters. Only warriors.", "The grind continues. Houston is still locked in GPS.", "Five losses can't undo six years of building this. Reset."];

  // Tone classification thresholds
  const STREAK_ROAST_LIMIT = 2; // 1–2 losses → roast
  const STREAK_COMEBACK = 5; // 5+ losses → comeback energy (still encouragement-tier)

  // ─── State ──────────────────────────────────────────────────────────
  const state = {
    voiceEnabled: true,
    voiceRate: 1.05,
    voicePitch: 1.0,
    voiceVolume: 0.85,
    chosenVoice: null,
    messagesSpoken: 0,
    recentMessages: [],
    // rolling history for diagnostics
    lastFiredAt: 0
  };

  // ─── Web Speech API Init ────────────────────────────────────────────
  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    // Prefer en-US male if available, else any en-* voice
    const preferred = voices.find(v => /en[-_]us/i.test(v.lang) && /male|alex|fred|daniel/i.test(v.name)) || voices.find(v => /en[-_]us/i.test(v.lang)) || voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
    state.chosenVoice = preferred || null;
    return state.chosenVoice;
  }
  function speak(text) {
    if (!state.voiceEnabled) return;
    if (!('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = state.voiceRate;
      u.pitch = state.voicePitch;
      u.volume = state.voiceVolume;
      if (!state.chosenVoice) pickVoice();
      if (state.chosenVoice) u.voice = state.chosenVoice;
      window.speechSynthesis.cancel(); // never queue up — replace
      window.speechSynthesis.speak(u);
    } catch (_) {/* swallow */}
  }

  // ─── Pick a Message Based on Streak ─────────────────────────────────
  function randIdx(arr) {
    // Deterministic-ish: use timestamp millis as seed — avoids true Math.random
    // while still producing varied output. Same trade timestamp would otherwise
    // collide but each loss-close has a unique ts so collisions are negligible.
    const seed = Date.now() % arr.length;
    return arr[seed];
  }
  function pickMessage(streakLoss) {
    const streak = Math.max(1, Number(streakLoss) || 1);
    if (streak <= STREAK_ROAST_LIMIT) {
      return {
        tone: 'roast',
        text: randIdx(ROASTS)
      };
    }
    if (streak >= STREAK_COMEBACK) {
      return {
        tone: 'comeback',
        text: randIdx(COMEBACKS)
      };
    }
    return {
      tone: 'encouragement',
      text: randIdx(ENCOURAGEMENTS)
    };
  }

  // ─── Process Loss ───────────────────────────────────────────────────
  function processLoss(payload) {
    try {
      const streak = payload && payload.streakLoss || 1;
      const msg = pickMessage(streak);
      speak(msg.text);

      // Track
      state.messagesSpoken++;
      state.lastFiredAt = Date.now();
      state.recentMessages.unshift({
        ts: state.lastFiredAt,
        streak,
        tone: msg.tone,
        text: msg.text
      });
      if (state.recentMessages.length > 20) state.recentMessages.length = 20;

      // Emit for any module that wants to render the text (e.g. a banner)
      if (OGZ.bus) {
        OGZ.bus.emit('celebration:loss-message', {
          tone: msg.tone,
          text: msg.text,
          streakLoss: streak,
          ts: state.lastFiredAt
        });
      }
    } catch (_) {/* swallow */}
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const api = {
    init() {
      try {
        // Pre-load voice list (some browsers populate async)
        if ('speechSynthesis' in window) {
          pickVoice();
          if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
            window.speechSynthesis.onvoiceschanged = pickVoice;
          }
        }
        // Subscribe via OGZ.bus once it exists
        (function bindBus() {
          if (!OGZ.bus) {
            setTimeout(bindBus, 100);
            return;
          }
          OGZ.bus.on('celebration:loss', processLoss);
        })();
      } catch (_) {/* swallow */}
    },
    processLoss,
    pickMessage,
    setVoiceEnabled(v) {
      state.voiceEnabled = !!v;
    },
    setVoiceRate(r) {
      state.voiceRate = Math.max(0.5, Math.min(2.0, Number(r) || 1.05));
    },
    setVoicePitch(p) {
      state.voicePitch = Math.max(0.5, Math.min(2.0, Number(p) || 1.0));
    },
    teardown() {
      try {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      } catch (_) {/* swallow */}
      state.recentMessages.length = 0;
    },
    _compute() {
      return {
        voiceEnabled: state.voiceEnabled,
        messagesSpoken: state.messagesSpoken,
        lastFiredAt: state.lastFiredAt,
        chosenVoice: state.chosenVoice ? state.chosenVoice.name : null,
        recentMessagesCount: state.recentMessages.length
      };
    }
  };

  // ─── Registration ───────────────────────────────────────────────────
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('LossRecovery', api);
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('LossRecovery', api);
      }
    });
  }
  try {
    window.OGZLossRecovery = api;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/loss-recovery.js", error: String((e && e.message) || e) }); }

// public/js/panels/milestone-effects.js
try { (() => {
/**
 * milestone-effects.js - MilestoneEffects: Houston ladder + visual celebrations
 *
 * Listens to OGZ.bus 'celebration:milestone' (equity heartbeat from
 * CustomAlerts -> from StateManager state_update.state.equity), and fires
 * tiered celebrations as the user crosses thresholds en route to the Houston
 * moving fund.
 *
 * Tiers (firstTrade and firstWin tiers fire on win events, not equity):
 *   firstTrade        - any close (banner only)
 *   firstWin          - first profitable close (banner + confetti)
 *   first100          - equity crosses $100 profit (banner + confetti + flash)
 *   first1000         - equity crosses $1,000 profit (banner + confetti + flash)
 *   houstonQuarter    - equity reaches $2,500 (rocket animation)
 *   houstonHalf       - equity reaches $5,000 (rocket animation + brand flash)
 *   houstonReady      - equity reaches $10,000 (full-screen takeover overlay)
 *
 * Persists fired milestones to localStorage so they don't re-fire on reload.
 * Emits 'celebration:milestone-hit' { tier, label } so VictoryAnimations
 * plays the milestone fanfare on tier crossings.
 *
 * Self-registers as OGZ.MilestoneEffects.
 *
 * Public API:
 *   init() - wire bus listeners, inject styles, load persisted state
 *   check(equity) - manual trigger
 *   resetProgress() - clear all fired tiers (debugging / fresh test)
 *   setTargets(overrides) - adjust threshold values
 *   teardown()
 *   _compute()
 *
 * @module public/js/panels/milestone-effects
 */
(function (OGZ) {
  'use strict';

  const STORAGE_KEY = 'ogz.milestones.fired';
  const STYLE_ID = 'ogz-milestone-effects-styles';

  // Default tiers - keys must be stable (used as localStorage flags).
  // Equity values represent ACCOUNT TOTAL (not P&L delta). Adjust via
  // setTargets() if the bot's starting equity is different.
  const DEFAULT_TIERS = {
    first100: {
      value: 100,
      label: '🎯 First $100',
      kind: 'profit'
    },
    first1000: {
      value: 1000,
      label: '💰 First $1,000',
      kind: 'profit'
    },
    houstonQuarter: {
      value: 2500,
      label: '🚀 25% to Houston',
      kind: 'houston'
    },
    houstonHalf: {
      value: 5000,
      label: '🚀 50% to Houston',
      kind: 'houston'
    },
    houstonReady: {
      value: 10000,
      label: 'HOUSTON FUND COMPLETE',
      kind: 'endgame'
    }
  };

  // Win-event tiers (triggered by 'celebration:win', not equity)
  const WIN_EVENT_TIERS = {
    firstWin: {
      label: '💰 First Win!',
      sub: 'Taste of victory!'
    }
  };

  // ─── State ──────────────────────────────────────────────────────────
  const state = {
    tiers: {
      ...DEFAULT_TIERS
    },
    fired: {},
    // { tierKey: true }
    firedWinEvents: {},
    peakEquity: 0,
    tradeCount: 0
  };

  // ─── Persistence ────────────────────────────────────────────────────
  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        state.fired = data.fired || {};
        state.firedWinEvents = data.firedWinEvents || {};
        state.peakEquity = data.peakEquity || 0;
      }
    } catch (_) {/* swallow */}
  }
  function savePersisted() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        fired: state.fired,
        firedWinEvents: state.firedWinEvents,
        peakEquity: state.peakEquity
      }));
    } catch (_) {/* swallow */}
  }

  // ─── CSS Injection ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            .ogz-milestone-banner {
                position: fixed;
                top: 30%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.85);
                background: linear-gradient(135deg, rgba(15,15,22,0.96) 0%, rgba(30,15,40,0.96) 100%);
                border: 2px solid rgba(255, 215, 0, 0.6);
                border-radius: 14px;
                padding: 22px 36px;
                color: #ffd700;
                font-family: 'Orbitron', 'JetBrains Mono', monospace;
                font-size: 22px;
                font-weight: 700;
                text-align: center;
                z-index: 9700;
                box-shadow: 0 10px 40px rgba(255, 215, 0, 0.3),
                            0 0 60px rgba(255, 215, 0, 0.2);
                opacity: 0;
                pointer-events: none;
                animation: ogz-mb-pop 2.6s ease-out forwards;
            }
            .ogz-milestone-banner .ogz-mb-sub {
                display: block;
                margin-top: 6px;
                font-size: 12px;
                opacity: 0.75;
                letter-spacing: 1px;
                color: #fff;
            }
            @keyframes ogz-mb-pop {
                0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
                10%  { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
                20%  { transform: translate(-50%, -50%) scale(1); }
                85%  { opacity: 1; }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
            }

            .ogz-confetti-piece {
                position: fixed;
                width: 8px;
                height: 14px;
                z-index: 9650;
                pointer-events: none;
                opacity: 1;
                will-change: transform, opacity;
            }

            .ogz-screen-flash {
                position: fixed;
                inset: 0;
                background: rgba(34, 197, 94, 0.0);
                z-index: 9600;
                pointer-events: none;
                animation: ogz-flash 0.7s ease-out forwards;
            }
            .ogz-screen-flash.red {
                background: rgba(239, 68, 68, 0.0);
            }
            @keyframes ogz-flash {
                0%   { background-color: rgba(255, 215, 0, 0.0); }
                15%  { background-color: rgba(255, 215, 0, 0.28); }
                100% { background-color: rgba(255, 215, 0, 0.0); }
            }

            .ogz-rocket {
                position: fixed;
                left: 50%;
                bottom: -60px;
                transform: translateX(-50%);
                font-size: 60px;
                z-index: 9620;
                pointer-events: none;
                animation: ogz-rocket-fly 2.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
            }
            @keyframes ogz-rocket-fly {
                0%   { bottom: -60px; opacity: 1; transform: translateX(-50%) rotate(-6deg); }
                40%  { transform: translateX(-50%) rotate(0deg); }
                100% { bottom: 110%; opacity: 0; transform: translateX(-50%) rotate(6deg); }
            }

            .ogz-houston-ready-overlay {
                position: fixed;
                inset: 0;
                background: radial-gradient(circle at center, rgba(20, 0, 40, 0.96) 0%, rgba(0, 0, 0, 0.99) 70%);
                z-index: 9800;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: #ffd700;
                font-family: 'Orbitron', 'JetBrains Mono', monospace;
                animation: ogz-overlay-in 0.6s ease-out forwards;
                opacity: 0;
                cursor: pointer;
            }
            @keyframes ogz-overlay-in {
                from { opacity: 0; backdrop-filter: blur(0px); }
                to   { opacity: 1; backdrop-filter: blur(8px); }
            }
            .ogz-houston-ready-overlay .ogz-hr-rocket {
                font-size: 110px;
                animation: ogz-hr-pulse 1.4s infinite ease-in-out;
                margin-bottom: 24px;
            }
            @keyframes ogz-hr-pulse {
                0%, 100% { transform: scale(1); filter: drop-shadow(0 0 16px rgba(255,215,0,0.6)); }
                50%      { transform: scale(1.12); filter: drop-shadow(0 0 32px rgba(255,215,0,0.95)); }
            }
            .ogz-houston-ready-overlay h1 {
                font-size: 54px;
                margin: 0 0 12px 0;
                letter-spacing: 4px;
                text-shadow: 0 0 30px rgba(255, 215, 0, 0.7);
                animation: ogz-hr-glow 2s infinite ease-in-out alternate;
            }
            @keyframes ogz-hr-glow {
                from { text-shadow: 0 0 14px rgba(255, 215, 0, 0.5); }
                to   { text-shadow: 0 0 38px rgba(255, 215, 0, 0.95), 0 0 60px rgba(255, 100, 200, 0.4); }
            }
            .ogz-houston-ready-overlay p {
                font-size: 20px;
                color: #fff;
                margin: 0 0 36px 0;
                max-width: 560px;
                text-align: center;
                line-height: 1.5;
                opacity: 0.9;
            }
            .ogz-houston-ready-overlay .ogz-hr-stars {
                font-size: 30px;
                letter-spacing: 12px;
                opacity: 0.8;
                margin-bottom: 24px;
            }
            .ogz-houston-ready-overlay .ogz-hr-dismiss {
                font-size: 12px;
                color: rgba(255, 255, 255, 0.55);
                letter-spacing: 2px;
                text-transform: uppercase;
                margin-top: 14px;
            }

            @media (prefers-reduced-motion: reduce) {
                .ogz-milestone-banner,
                .ogz-rocket,
                .ogz-screen-flash,
                .ogz-houston-ready-overlay .ogz-hr-rocket,
                .ogz-houston-ready-overlay h1 { animation: none !important; }
                .ogz-milestone-banner { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }
        `;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ─── Visual Helpers ─────────────────────────────────────────────────
  function showBanner(label, sub) {
    const el = document.createElement('div');
    el.className = 'ogz-milestone-banner';
    const text = document.createElement('div');
    text.textContent = label;
    el.appendChild(text);
    if (sub) {
      const subEl = document.createElement('span');
      subEl.className = 'ogz-mb-sub';
      subEl.textContent = sub;
      el.appendChild(subEl);
    }
    document.body.appendChild(el);
    setTimeout(() => {
      try {
        el.remove();
      } catch (_) {}
    }, 2700);
  }
  function confetti(count) {
    // Deterministic spread (index-based, no Math.random for fairness)
    const n = Math.max(10, Math.min(120, count | 0));
    const colors = ['#ffd700', '#ff6b6b', '#22c55e', '#60a5fa', '#a78bfa', '#f472b6'];
    for (let i = 0; i < n; i++) {
      const piece = document.createElement('div');
      piece.className = 'ogz-confetti-piece';
      const startX = i / n * window.innerWidth;
      const drift = i * 37 % 200 - 100; // pseudo-random drift, no Math.random
      const duration = 1800 + i * 53 % 1400;
      const delay = i * 13 % 200;
      piece.style.left = startX + 'px';
      piece.style.top = '-20px';
      piece.style.backgroundColor = colors[i % colors.length];
      piece.style.transform = 'rotate(' + i * 47 % 360 + 'deg)';
      piece.style.transition = `transform ${duration}ms cubic-bezier(0.2,0.7,0.5,1) ${delay}ms,
                                      opacity ${duration}ms ease-out ${delay}ms`;
      document.body.appendChild(piece);
      // Trigger animation next frame
      requestAnimationFrame(() => {
        piece.style.transform = `translate(${drift}px, ${window.innerHeight + 80}px) rotate(${(i * 47 + 720) % 720}deg)`;
        piece.style.opacity = '0';
      });
      setTimeout(() => {
        try {
          piece.remove();
        } catch (_) {}
      }, duration + delay + 200);
    }
  }
  function screenFlash() {
    const el = document.createElement('div');
    el.className = 'ogz-screen-flash';
    document.body.appendChild(el);
    setTimeout(() => {
      try {
        el.remove();
      } catch (_) {}
    }, 750);
  }
  function rocketAnimation() {
    const el = document.createElement('div');
    el.className = 'ogz-rocket';
    el.textContent = '🚀';
    document.body.appendChild(el);
    setTimeout(() => {
      try {
        el.remove();
      } catch (_) {}
    }, 2500);
  }
  function houstonReadyTakeover() {
    const overlay = document.createElement('div');
    overlay.className = 'ogz-houston-ready-overlay';
    overlay.innerHTML = `
            <div class="ogz-hr-rocket">🚀</div>
            <h1>HOUSTON FUND COMPLETE</h1>
            <p>You did it. Time to reunite with your daughter.</p>
            <div class="ogz-hr-stars">✨  ✨  ✨</div>
            <div class="ogz-hr-dismiss">Click anywhere to dismiss</div>
        `;
    const dismiss = () => {
      try {
        overlay.remove();
      } catch (_) {}
    };
    overlay.addEventListener('click', dismiss);
    // Don't auto-dismiss — this is THE moment, let the user own it
    document.body.appendChild(overlay);
  }

  // ─── Tier Crossing Logic ────────────────────────────────────────────
  function fireTier(key, tier) {
    if (state.fired[key]) return; // already fired
    state.fired[key] = true;
    savePersisted();
    if (tier.kind === 'endgame') {
      houstonReadyTakeover();
    } else if (tier.kind === 'houston') {
      showBanner(tier.label, 'Getting closer to your daughter');
      rocketAnimation();
      screenFlash();
      confetti(60);
    } else if (tier.kind === 'profit') {
      showBanner(tier.label, 'Profits are stacking up');
      screenFlash();
      confetti(40);
    } else {
      showBanner(tier.label);
      confetti(20);
    }

    // Tell VictoryAnimations to play the milestone fanfare
    if (OGZ.bus) {
      OGZ.bus.emit('celebration:milestone-hit', {
        tier: key,
        label: tier.label
      });
    }
  }
  function check(equity) {
    const b = Number(equity) || 0;
    if (b > state.peakEquity) {
      state.peakEquity = b;
      savePersisted();
    }
    // Fire any unfired tier whose threshold the equity has crossed.
    // Iterate in ascending threshold order so banners come in sequence
    // if multiple cross in one update.
    const sorted = Object.entries(state.tiers).sort((a, b2) => a[1].value - b2[1].value);
    for (const [key, tier] of sorted) {
      if (b >= tier.value && !state.fired[key]) {
        fireTier(key, tier);
      }
    }
  }
  function onMilestoneEquity(payload) {
    if (!payload || typeof payload.equity !== 'number') return;
    check(payload.equity);
  }

  // Win-event tiers (firstWin)
  function onWin(payload) {
    if (!payload) return;
    if (!state.firedWinEvents.firstWin) {
      state.firedWinEvents.firstWin = true;
      savePersisted();
      showBanner(WIN_EVENT_TIERS.firstWin.label, WIN_EVENT_TIERS.firstWin.sub);
      confetti(30);
    }
    state.tradeCount++;
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const api = {
    init() {
      try {
        injectStyles();
        loadPersisted();
        (function bindBus() {
          if (!OGZ.bus) {
            setTimeout(bindBus, 100);
            return;
          }
          OGZ.bus.on('celebration:milestone', onMilestoneEquity);
          OGZ.bus.on('celebration:win', onWin);
        })();
      } catch (_) {/* swallow */}
    },
    check,
    resetProgress() {
      state.fired = {};
      state.firedWinEvents = {};
      state.peakEquity = 0;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
    },
    setTargets(overrides) {
      if (!overrides || typeof overrides !== 'object') return;
      for (const k in overrides) {
        if (state.tiers[k]) {
          state.tiers[k].value = Number(overrides[k]) || state.tiers[k].value;
        }
      }
    },
    teardown() {
      const s = document.getElementById(STYLE_ID);
      if (s) s.remove();
    },
    _compute() {
      return {
        tiers: state.tiers,
        fired: {
          ...state.fired
        },
        firedWinEvents: {
          ...state.firedWinEvents
        },
        peakEquity: state.peakEquity,
        tradeCount: state.tradeCount
      };
    }
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('MilestoneEffects', api);
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('MilestoneEffects', api);
      }
    });
  }
  try {
    window.OGZMilestoneEffects = api;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/milestone-effects.js", error: String((e && e.message) || e) }); }

// public/js/panels/news-ticker.js
try { (() => {
/**
 * news-ticker.js — TRAI-flagged Trading Events Horizontal Scroller
 *
 * Real-time horizontal ticker across the dashboard displaying TRAI-flagged
 * market-altering events: FOMC announcements, earnings surprises, whale wallet
 * moves, insider filings, unusual volume spikes. Self-injects minimal fallback
 * CSS (positioning + container baseline); real styling via external
 * /css/panels/news-ticker.css. Polls /api/trai/events and also listens for
 * WS event type 'news_event' if a future broadcaster adds it.
 *
 * Renders items RTL in an infinite-scroll marquee animation. NO demo mode,
 * NO synthetic seed events. Empty/honest source-state placeholder until real
 * backend news events arrive from REST or WS.
 *
 * Features:
 *   - Live sentiment coloring: bullish (green), neutral (gold), defensive (red)
 *   - Hover pauses scroll; click item expands inline popup with full details
 *   - ~30s per full loop at default speed (configurable)
 *   - TRAI commentary suffix when available
 *   - Clean teardown: all intervals, listeners, and injected DOM removed
 *
 * Self-registers as OGZ.NewsTicker via OGZ.register().
 *
 * Current backend source:
 *   REST /api/trai/events?symbol=X returns real Tavily + TRAI extracted events
 *   with status {unconfigured|unavailable|empty|ready}. news_event is only a
 *   future push channel and must not be treated as the active source.
 *
 * @module public/js/panels/news-ticker
 */
(function (OGZ) {
  'use strict';

  /**
   * @typedef {Object} NewsEvent
   * @property {number} ts - Unix epoch milliseconds
   * @property {'bullish'|'neutral'|'defensive'} sentiment - Event sentiment
   * @property {string} headline - Short headline (max ~80 chars)
   * @property {string} source - Origin attribution (e.g., 'Reuters', 'SEC', 'TRAI')
   * @property {string} [ticker] - Optional ticker symbol (e.g., 'TSLA')
   * @property {string} [trai_commentary] - Optional TRAI risk/opportunity note
   */

  // ─── Constants ──────────────────────────────────────────────────────
  const STYLE_ID = 'ogz-news-ticker-styles';
  const ROOT_ID = 'newsTicker';
  const SCROLL_SPEED_PX_MS = 0.15; // pixels per millisecond (controls marquee speed)
  const FULL_LOOP_MS = 30000; // ~30s for one complete traversal
  const ANIMATION_FRAME_MS = 1000 / 60; // 60 FPS update target
  const POPUP_AUTO_DISMISS_MS = 6000; // Popup closes after 6s if user doesn't interact

  // TRAI events REST poll — /api/trai/events?symbol=X returns Tavily-searched +
  // LLM-extracted upcoming earnings/FOMC/FDA/macro/catalysts (per symbol, 30min cache).
  // See ogzprime-ssl-server.js:674 for endpoint, prompt-injection guards, schema.
  const TRAI_POLL_INTERVAL_MS = 60000; // Poll every 60s; endpoint cache is 30min so this is gentle
  const TRAI_EVENTS_ENDPOINT = '/api/trai/events';
  const DEFAULT_SYMBOL = 'TSLA';

  // Private state — only accessible within this IIFE.
  const state = {
    mounted: false,
    events: [],
    // Real WS events only
    animationFrameId: null,
    // RAF handle for scroll loop
    scrollPos: 0,
    // Current horizontal scroll position (px)
    paused: false,
    // Is marquee paused (hover)?
    popupDismissTimer: null,
    // setTimeout handle for auto-close popup
    containerWidth: 0,
    // Width of scrollable content
    pollTimer: null,
    // setInterval handle for TRAI events poll
    lastPolledSymbol: null,
    // Last symbol we polled for (re-poll on change)
    lastPollTs: 0,
    // Last successful poll timestamp (throttle)
    feedStatus: 'loading',
    // loading|unconfigured|unavailable|empty|ready
    feedMessage: 'Checking news events...',
    feedSymbol: DEFAULT_SYMBOL,
    feedFetchedAt: null,
    feedCached: false,
    feedCacheAgeMs: null,
    pollSeq: 0
  };

  // ─── Fallback CSS injection ─────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                background: rgba(20, 20, 20, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 6px;
                padding: 10px 0;
                margin: 10px 0;
                overflow: hidden;
                position: relative;
            }
            #${ROOT_ID} .nt-container {
                display: flex;
                align-items: center;
                position: relative;
                width: 100%;
                height: 100%;
            }
            #${ROOT_ID} .nt-scroller {
                display: flex;
                gap: 16px;
                padding: 0 20px;
                position: relative;
            }
            #${ROOT_ID} .nt-item {
                flex-shrink: 0;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.06);
                cursor: pointer;
                white-space: nowrap;
                font-family: 'JetBrains Mono', monospace;
                font-size: 12px;
                color: #ffffff;
                user-select: none;
            }
            #${ROOT_ID} .nt-item:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(255, 255, 255, 0.12);
            }
        `;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ─── DOM Structure ──────────────────────────────────────────────────
  function mount() {
    if (state.mounted) return true;
    const root = document.getElementById(ROOT_ID);
    if (!root) return false;

    // Clear any existing content
    root.innerHTML = '';

    // Build scroller structure
    const container = document.createElement('div');
    container.className = 'nt-container';
    container.style.minHeight = '45px';
    const scroller = document.createElement('div');
    scroller.className = 'nt-scroller';
    scroller.style.animation = 'none'; // Will be enabled by render()
    scroller.style.willChange = 'transform';
    container.appendChild(scroller);
    root.appendChild(container);

    // Attach event listeners
    root.addEventListener('mouseenter', onMouseEnter);
    root.addEventListener('mouseleave', onMouseLeave);
    root.addEventListener('click', onItemClick);
    state.mounted = true;
    return true;
  }

  // ─── Data preparation ──────────────────────────────────
  function prepareEvents() {
    // Sort real events by timestamp descending (newest first)
    const events = [...state.events];
    // Remove duplicates by unique (ts, headline) key
    const seen = new Set();
    const deduped = events.filter(e => {
      const key = `${e.ts}|${e.headline}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Sort descending by timestamp
    deduped.sort((a, b) => b.ts - a.ts);
    return deduped;
  }

  // ─── Time formatting ────────────────────────────────────────────────
  function formatTime(ts) {
    const d = new Date(ts);
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const meridiem = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${meridiem}`;
  }

  // ─── Item DOM creation ──────────────────────────────────────────────
  function renderItem(event) {
    const item = document.createElement('div');
    item.className = `nt-item nt-sent-${event.sentiment}`;
    item.dataset.ts = event.ts;
    item.dataset.headline = event.headline;

    // Sentiment dot
    const dot = document.createElement('span');
    dot.className = 'nt-dot';
    dot.textContent = '●';
    dot.style.fontSize = '10px';

    // Time
    const time = document.createElement('span');
    time.className = 'nt-time';
    time.textContent = formatTime(event.ts);
    time.style.color = '#888888';
    time.style.fontSize = '11px';
    time.style.minWidth = '60px';

    // Headline + ticker
    const headline = document.createElement('span');
    headline.className = 'nt-headline';
    let text = event.headline;
    if (event.ticker) {
      text = `[${event.ticker}] ${text}`;
    }
    headline.textContent = text;

    // Source
    const source = document.createElement('span');
    source.className = 'nt-source';
    source.textContent = event.source;
    source.style.color = '#888888';
    source.style.fontSize = '10px';

    // TRAI commentary suffix (if present)
    let suffix = '';
    if (event.trai_commentary) {
      suffix = ` · TRAI: ${event.trai_commentary}`;
    }

    // Assemble
    item.appendChild(dot);
    item.appendChild(time);
    item.appendChild(headline);
    if (suffix) {
      const traiText = document.createElement('span');
      traiText.textContent = suffix;
      traiText.style.color = '#ffd700';
      traiText.style.fontSize = '11px';
      item.appendChild(traiText);
    }
    item.appendChild(source);

    // Store full event for popup
    item.dataset.fullEvent = JSON.stringify(event);
    return item;
  }
  function setFeedStatus(status, symbol, message, fetchedAt, meta) {
    state.feedStatus = ['loading', 'unconfigured', 'unavailable', 'empty', 'ready'].includes(status) ? status : 'unavailable';
    state.feedSymbol = symbol || state.feedSymbol || DEFAULT_SYMBOL;
    state.feedMessage = message || null;
    state.feedFetchedAt = fetchedAt || null;
    state.feedCached = !!(meta && meta.cached);
    state.feedCacheAgeMs = meta && Number.isFinite(Number(meta.cacheAgeMs)) ? Number(meta.cacheAgeMs) : null;
  }
  function formatFeedCheckedAt() {
    if (!state.feedFetchedAt) return '';
    const parsed = Date.parse(state.feedFetchedAt);
    if (!Number.isFinite(parsed)) return '';
    return new Date(parsed).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  function getSourceStatusText() {
    const checkedAt = formatFeedCheckedAt();
    const parts = [`News ${state.feedSymbol || DEFAULT_SYMBOL}`];
    if (state.feedCached) parts.push('cached');
    if (checkedAt) parts.push(`checked ${checkedAt}`);
    return parts.join(' - ');
  }
  function getEmptyStateText() {
    if (state.feedStatus === 'empty') {
      const base = state.feedMessage || `No upcoming news events for ${state.feedSymbol || DEFAULT_SYMBOL}.`;
      const checkedAt = formatFeedCheckedAt();
      return checkedAt ? `${base} Last checked ${checkedAt}.` : base;
    }
    if (state.feedMessage) return state.feedMessage;
    if (state.feedStatus === 'unconfigured') return 'News feed not configured.';
    if (state.feedStatus === 'unavailable') return 'News feed unavailable.';
    return 'Checking news events...';
  }

  // ─── Main render function ───────────────────────────────────────────
  function render() {
    if (!state.mounted) return;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const scroller = root.querySelector('.nt-scroller');
    if (!scroller) return;

    // Clear and rebuild items
    scroller.innerHTML = '';
    const events = prepareEvents();
    if (events.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.style.cssText = `
                flex: 0 0 auto;
                padding: 12px 20px;
                color: #666666;
                font-size: 12px;
                font-family: 'JetBrains Mono', monospace;
            `;
      placeholder.className = `nt-placeholder nt-status-${state.feedStatus}`;
      placeholder.textContent = getEmptyStateText();
      scroller.appendChild(placeholder);
      return;
    }
    const statusItem = document.createElement('div');
    statusItem.className = `nt-item nt-source-status nt-status-${state.feedStatus}`;
    statusItem.textContent = getSourceStatusText();
    scroller.appendChild(statusItem);

    // Render all items
    events.forEach(event => {
      const item = renderItem(event);
      scroller.appendChild(item);
    });

    // Calculate container width and restart animation
    state.containerWidth = scroller.scrollWidth;
    state.scrollPos = 0;
    startAnimation();
  }

  // ─── Animation loop (pure scroll, no marquee CSS) ──────────────────
  let lastFrameTime = 0;
  function animateScroll(currentTime) {
    if (!lastFrameTime) lastFrameTime = currentTime;
    const deltaMs = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    if (!state.paused && state.containerWidth > 0) {
      // Move left by speed × delta
      state.scrollPos += SCROLL_SPEED_PX_MS * deltaMs;

      // Reset to start when fully scrolled off (infinite loop)
      const root = document.getElementById(ROOT_ID);
      if (root) {
        const containerWidth = root.offsetWidth;
        if (state.scrollPos > state.containerWidth + containerWidth) {
          state.scrollPos = -containerWidth;
        }
        const scroller = root.querySelector('.nt-scroller');
        if (scroller) {
          scroller.style.transform = `translateX(-${state.scrollPos}px)`;
        }
      }
    }

    // Continue loop
    if (state.mounted) {
      state.animationFrameId = requestAnimationFrame(animateScroll);
    }
  }
  function startAnimation() {
    if (state.animationFrameId) {
      cancelAnimationFrame(state.animationFrameId);
    }
    lastFrameTime = 0;
    state.animationFrameId = requestAnimationFrame(animateScroll);
  }
  function stopAnimation() {
    if (state.animationFrameId) {
      cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }
  }

  // ─── Event handlers ─────────────────────────────────────────────────
  function onMouseEnter() {
    state.paused = true;
  }
  function onMouseLeave() {
    state.paused = false;
  }
  function onItemClick(e) {
    const item = e.target.closest('.nt-item');
    if (!item) return;
    try {
      const eventData = JSON.parse(item.dataset.fullEvent);
      showPopup(eventData);
    } catch (_) {/* swallow */}
  }
  function showPopup(event) {
    // Dismiss any existing popup
    dismissPopup();
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const popup = document.createElement('div');
    popup.className = 'nt-popup';
    popup.id = 'nt-popup-' + Date.now();
    popup.style.cssText = `
            position: fixed;
            z-index: 1000;
            background: rgba(15, 15, 20, 0.95);
            border: 1px solid rgba(255, 215, 0, 0.4);
            border-radius: 8px;
            padding: 16px;
            max-width: 400px;
            backdrop-filter: blur(12px);
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.2);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            color: #ffffff;
        `;
    const timeEl = document.createElement('div');
    timeEl.style.cssText = 'color: #888888; font-size: 11px; margin-bottom: 8px;';
    timeEl.textContent = formatTime(event.ts);
    const headlineEl = document.createElement('div');
    headlineEl.style.cssText = 'font-weight: 600; margin-bottom: 8px; line-height: 1.4;';
    headlineEl.textContent = event.headline;
    const sourceEl = document.createElement('div');
    sourceEl.style.cssText = 'color: #a0a0a0; font-size: 11px; margin-bottom: 8px;';
    sourceEl.textContent = `Source: ${event.source}`;
    if (event.trai_commentary) {
      const traiEl = document.createElement('div');
      traiEl.style.cssText = 'color: #ffd700; font-size: 11px; padding: 8px; background: rgba(255, 215, 0, 0.05); border-radius: 4px; margin-bottom: 8px;';
      traiEl.textContent = `TRAI: ${event.trai_commentary}`;
      popup.appendChild(traiEl);
    }
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ Close';
    closeBtn.style.cssText = `
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #ffffff;
            padding: 6px 12px;
            border-radius: 4px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            cursor: pointer;
            margin-top: 10px;
            width: 100%;
        `;
    closeBtn.addEventListener('click', dismissPopup);
    popup.appendChild(timeEl);
    popup.appendChild(headlineEl);
    popup.appendChild(sourceEl);
    popup.appendChild(closeBtn);
    document.body.appendChild(popup);

    // Auto-dismiss after POPUP_AUTO_DISMISS_MS
    if (state.popupDismissTimer) clearTimeout(state.popupDismissTimer);
    state.popupDismissTimer = setTimeout(dismissPopup, POPUP_AUTO_DISMISS_MS);
  }
  function dismissPopup() {
    const existing = document.querySelector('[id^="nt-popup-"]');
    if (existing) existing.remove();
    if (state.popupDismissTimer) {
      clearTimeout(state.popupDismissTimer);
      state.popupDismissTimer = null;
    }
  }

  // ─── TRAI events REST poll ──────────────────────────────────────────
  function detectActiveAsset() {
    // Prefer v2 chart-panel selector, fall back to legacy, then default.
    // Same fallback chain CC-D bakes into every price/asset consumer.
    const cpSel = document.getElementById('cp-assetSelector');
    if (cpSel && cpSel.value) return cpSel.value;
    const legacySel = document.getElementById('assetSelector');
    if (legacySel && legacySel.value) return legacySel.value;
    return DEFAULT_SYMBOL;
  }
  function mapTraiEventToNewsItem(traiEvent, symbol) {
    // TRAI payload: {type, date (YYYY-MM-DD or 'TBD'), title, summary, source}
    // News-ticker shape: {ts, sentiment, headline, source, ticker, trai_commentary}
    let ts;
    if (traiEvent && traiEvent.date && traiEvent.date !== 'TBD') {
      const parsed = Date.parse(traiEvent.date);
      ts = Number.isFinite(parsed) ? parsed : Date.now();
    } else {
      ts = Date.now();
    }

    // Sentiment heuristic from TRAI event type. earnings/fda/macro/other
    // default to neutral; fomc/macro lean defensive (rate-policy uncertainty);
    // catalyst leans bullish (positive trigger). Operator can refine later.
    const sentimentMap = {
      earnings: 'neutral',
      fomc: 'defensive',
      fda: 'neutral',
      macro: 'defensive',
      catalyst: 'bullish',
      other: 'neutral'
    };
    const sentiment = sentimentMap[traiEvent && traiEvent.type] || 'neutral';
    return {
      ts,
      sentiment,
      headline: String(traiEvent && traiEvent.title || 'Market event'),
      source: String(traiEvent && traiEvent.source || 'TRAI'),
      ticker: symbol,
      trai_commentary: traiEvent && traiEvent.summary ? String(traiEvent.summary) : undefined
    };
  }
  async function pollTraiEvents() {
    const symbol = detectActiveAsset();
    // Skip if same symbol polled within throttle window — defends against
    // burst calls when asset-change fires near a scheduled poll tick.
    if (symbol === state.lastPolledSymbol && Date.now() - state.lastPollTs < TRAI_POLL_INTERVAL_MS / 2) {
      return;
    }
    const pollSeq = ++state.pollSeq;
    try {
      const res = await fetch(`${TRAI_EVENTS_ENDPOINT}?symbol=${encodeURIComponent(symbol)}`);
      let data = null;
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }
      if (pollSeq !== state.pollSeq || symbol !== detectActiveAsset()) {
        return;
      }
      if (!res.ok) {
        state.events = [];
        setFeedStatus(data && data.status ? data.status : 'unavailable', data && data.symbol ? data.symbol : symbol, data && data.message ? data.message : 'News feed unavailable.', data && data.fetchedAt ? data.fetchedAt : null, data || null);
        state.lastPolledSymbol = symbol;
        state.lastPollTs = Date.now();
        render();
        return;
      }
      if (!data || !Array.isArray(data.events)) {
        state.events = [];
        setFeedStatus('unavailable', symbol, 'News feed returned an invalid payload.', null);
        state.lastPolledSymbol = symbol;
        state.lastPollTs = Date.now();
        render();
        return;
      }

      // TRAI returns full set per poll — replace events array (don't append)
      const responseSymbol = data.symbol ? String(data.symbol) : symbol;
      state.events = data.events.filter(e => e && (e.title || e.summary)).map(e => mapTraiEventToNewsItem(e, responseSymbol));
      // Cap at 50 (defensive — endpoint typically returns ≤5)
      if (state.events.length > 50) state.events = state.events.slice(0, 50);
      setFeedStatus(data.status || (state.events.length ? 'ready' : 'empty'), responseSymbol, data.message || null, data.fetchedAt || null, data);
      state.lastPolledSymbol = symbol;
      state.lastPollTs = Date.now();
      render();
    } catch (_) {
      if (pollSeq !== state.pollSeq || symbol !== detectActiveAsset()) {
        return;
      }
      state.events = [];
      setFeedStatus('unavailable', symbol, 'News feed unavailable.', null);
      state.lastPolledSymbol = symbol;
      state.lastPollTs = Date.now();
      render();
    }
  }
  function startTraiPollLoop() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    pollTraiEvents(); // immediate first poll
    state.pollTimer = setInterval(pollTraiEvents, TRAI_POLL_INTERVAL_MS);
  }
  function stopTraiPollLoop() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }
  function onWatchlistSelectAsset(data) {
    // Re-poll TRAI immediately when active asset changes
    if (data && data.ticker) {
      state.pollSeq += 1;
      state.lastPolledSymbol = null; // bypass throttle
      pollTraiEvents();
    }
  }

  // ─── WS Handler ─────────────────────────────────────────────────────
  function onNewsEvent(data) {
    try {
      if (!data) return;
      // Validate required fields
      const event = {
        ts: data.ts != null ? Number(data.ts) : Date.now(),
        sentiment: ['bullish', 'neutral', 'defensive'].includes(data.sentiment) ? data.sentiment : 'neutral',
        headline: String(data.headline || 'Market event'),
        source: String(data.source || 'Unknown'),
        ticker: data.ticker ? String(data.ticker) : undefined,
        trai_commentary: data.trai_commentary ? String(data.trai_commentary) : undefined
      };
      if (!event.ts || !event.headline) return;
      state.events.push(event);
      setFeedStatus('ready', event.ticker || state.feedSymbol || DEFAULT_SYMBOL, null);
      // Cap at 50 real events (prevent unbounded growth)
      if (state.events.length > 50) state.events.shift();
      render();
    } catch (_) {/* swallow */}
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const NewsTicker = {
    /**
     * Initialize: mount to DOM, inject styles, subscribe to WS events.
     * Safe to call multiple times (idempotent via mount guard).
     */
    init() {
      try {
        injectStyles();
        if (!mount()) return; // Mount point missing
        render();

        // Subscribe to news_event WS frame as defensive backup if backend ever emits it.
        // Currently no bot-side emit site exists for news_event; TRAI REST poll below
        // is the active data source. Subscription is harmless either way.
        const socket = OGZ.get && OGZ.get('Socket');
        if (socket && socket.registerHandler) {
          socket.registerHandler('news_event', onNewsEvent);
        }

        // Subscribe to watchlist:select bus event — re-poll TRAI on asset change
        if (OGZ && OGZ.bus && OGZ.bus.on) {
          OGZ.bus.on('watchlist:select', onWatchlistSelectAsset);
        }

        // Start REST poll loop against /api/trai/events
        // (Tavily search + TRAI LLM extraction with prompt-injection guards)
        startTraiPollLoop();
      } catch (_) {/* swallow */}
    },
    /**
     * Pause/resume marquee scroll.
     */
    pause() {
      state.paused = true;
    },
    /**
     * Resume marquee scroll.
     */
    resume() {
      state.paused = false;
    },
    /**
     * Manually add a news event (for testing or external feeds).
     * @param {NewsEvent} event
     */
    addEvent(event) {
      if (event && event.headline) {
        state.events.push(event);
        if (state.events.length > 50) state.events.shift();
        render();
      }
    },
    /**
     * Clear all real events (demo events remain if demoMode=true).
     */
    clear() {
      state.events = [];
      setFeedStatus('empty', state.feedSymbol || DEFAULT_SYMBOL, null, null);
      render();
    },
    /**
     * Teardown: remove DOM, listeners, animations, injected styles.
     */
    teardown() {
      try {
        dismissPopup();
        stopAnimation();
        stopTraiPollLoop();
        const root = document.getElementById(ROOT_ID);
        if (root) {
          root.removeEventListener('mouseenter', onMouseEnter);
          root.removeEventListener('mouseleave', onMouseLeave);
          root.removeEventListener('click', onItemClick);
          root.innerHTML = '';
        }
        const styleEl = document.getElementById(STYLE_ID);
        if (styleEl) styleEl.remove();
        state.mounted = false;
        state.events = [];
        state.scrollPos = 0;
        state.pollSeq += 1;
        setFeedStatus('loading', DEFAULT_SYMBOL, 'Checking news events...', null);
      } catch (_) {/* swallow */}
    },
    /**
     * Expose compute/debug helper for testing
     */
    _compute() {
      return {
        realEventsCount: state.events.length,
        totalEvents: prepareEvents().length,
        scrollPos: state.scrollPos,
        paused: state.paused,
        feedStatus: state.feedStatus,
        feedMessage: state.feedMessage,
        feedSymbol: state.feedSymbol,
        feedFetchedAt: state.feedFetchedAt,
        feedCached: state.feedCached,
        feedCacheAgeMs: state.feedCacheAgeMs
      };
    }
  };

  // ─── Registration ───────────────────────────────────────────────────
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('NewsTicker', NewsTicker);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('NewsTicker', NewsTicker);
      }
    });
  }
  try {
    window.OGZNewsTicker = NewsTicker;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/news-ticker.js", error: String((e && e.message) || e) }); }

// public/js/panels/open-positions.js
try { (() => {
/**
 * open-positions.js — OpenPositions: Multi-Ticker Positions Table
 *
 * Right-rail panel showing all concurrently-held positions across tickers
 * (bot scans 9 tickers simultaneously, can hold positions in multiple at once).
 * One row per open position. Aggregate row at top. Responsive to live price ticks,
 * highlighting the currently-selected ticker's position (from WatchlistStrip).
 *
 * What it renders (top to bottom):
 *   1. Header row — "OPEN POSITIONS" title + count badge ("3 OPEN") + aggregate unrealized P&L
 *      (color-coded green/red, weight 900)
 *   2. Per-position rows (one per concurrent position): ticker + broker badge + side pill +
 *      entry price + current price + SL + TP + unrealized $ + unrealized % + time held
 *   3. Empty state: "No positions open — bot scanning" in muted text when no positions
 *   4. Highlight: if selected ticker (from WatchlistStrip) has open position, gold border + glow
 *
 * Self-registers as OGZ.OpenPositions via OGZ.register().
 * Mounts into <div id="openPositions"></div>.
 *
 * Verified WS subscriptions (real bot emitter shapes):
 *   - 'trade'        → OrderExecutor.js. Real shape:
 *                      { type:'trade', action:'BUY'|'SELL'|'SELL_SHORT'|'COVER',
 *                        direction:'long'|'short', price, pnl, timestamp,
 *                        [duration], confidence }
 *                      NOTE: bot is currently single-pair; no `symbol` on event.
 *                      We resolve symbol from the chart panel selector.
 *                      action=BUY|SELL_SHORT → open. action=SELL|COVER → close.
 *   - 'price'        → CandleProcessor. Read data.price for current-mark + P&L.
 *   - 'state_update' → StateManager.broadcastToDashboard. AUTHORITATIVE position
 *                      source when state.positions is present. Legacy scalar
 *                      shape is supported only as a fallback for old backend
 *                      payloads.
 *
 * Backend-scoped state_update rows are preferred. Legacy trade events only fill
 * gaps when an old backend payload does not include scoped positions yet. SL/TP
 * render '--' until backend exposes them. NO synthetic data anywhere.
 *
 * Listens to OGZ.bus:
 *   - watchlist:select — to scope highlight to selected ticker
 *
 * Internal state: Map keyed by `${ticker}-${broker}-${entryTime}` (composite to handle
 * multiple lots). Each value = Position object with side/entry/current/sl/tp/size/
 * unrealized/timeOpened/strategy/tradeId.
 *
 * Recalculates unrealized P&L on every `price` tick where data.symbol matches an open
 * position. Updates row in-place via textContent/class swap — never re-renders whole table.
 *
 * Falls back gracefully: if position_update events never arrive (backend doesn't emit yet),
 * still functional from trade events alone (verified). Shows "No positions open — bot
 * scanning" until real position data flows. NO demo mode. NO synthetic positions.
 *
 * Public API:
 *   init() — Mount to DOM, inject styles, subscribe to WS + bus events
 *   addPosition(p) — Manual injection (for real-event handlers, not demo)
 *   closePosition(symbol, broker) — Manual close
 *   getPositions() — Return current Position[]
 *   clearAll() — Empty state
 *   teardown() — Remove DOM, listeners, styles
 *   _compute() — Debug helper: internal state snapshot
 *
 * @typedef {Object} Position
 * @property {string} symbol - Ticker symbol (e.g., 'TSLA')
 * @property {string} broker - Broker ID ('ALP' | 'KRA' | 'CB' | etc)
 * @property {'long'|'short'} side - Position side
 * @property {number} entry - Entry price
 * @property {number} current - Current/last price
 * @property {number} stopLoss - Stop-loss price
 * @property {number} takeProfit - Take-profit price
 * @property {number} size - Shares/units held
 * @property {number} openedAt - Epoch milliseconds
 * @property {string} [strategy] - Strategy name that opened position
 * @property {string} [tradeId] - Server-side trade identifier if available
 *
 * @module public/js/panels/open-positions
 */
(function (OGZ) {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────
  const STYLE_ID = 'ogz-open-positions-styles';
  const ROOT_ID = 'openPositions';
  const PNL_FLASH_MS = 300; // Duration of P&L flash animation
  const POSITION_KEY_SEP = '|'; // Separator for composite key

  // ─── Private State ──────────────────────────────────────────────────
  const state = {
    mounted: false,
    selectedTicker: null,
    // Position storage: Map<"TSLA|ALP|1234567890" => Position>
    positions: new Map(),
    // Pending entry-price cache from 'trade' events that arrive ahead of
    // the matching 'state_update'. Keyed by `${symbol}|${broker}`.
    pendingEntries: new Map(),
    // DOM caches
    domRefs: {
      root: null,
      header: null,
      count: null,
      aggregatePnl: null,
      table: null,
      tbody: null
    },
    // Event listeners (for cleanup)
    listeners: [],
    _timeTicker: null
  };

  // ─── CSS Injection ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                display: flex;
                flex-direction: column;
                gap: 0;
                min-height: 100%;
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                border-radius: 8px;
                backdrop-filter: blur(14px) saturate(160%);
                box-shadow: var(--glass-underglow);
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                color: var(--text-primary);
                overflow: hidden;
                padding: 0;
            }

            /* Header row: title + count + aggregate P&L */
            .op-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 12px;
                border-bottom: 1px solid var(--border-color);
                flex-shrink: 0;
                background: rgba(0, 0, 0, 0.3);
            }

            .op-header-title {
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: var(--text-primary);
            }

            .op-count-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 40px;
                padding: 2px 8px;
                background: rgba(255, 215, 0, 0.12);
                border: 1px solid rgba(255, 215, 0, 0.3);
                border-radius: 12px;
                font-size: 9px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: var(--ml-color);
                flex-shrink: 0;
            }

            .op-aggregate-pnl {
                margin-left: auto;
                font-size: 12px;
                font-weight: 900;
                letter-spacing: 0.5px;
                color: var(--profit-color);
            }

            .op-aggregate-pnl.negative {
                color: var(--loss-color);
            }

            /* Positions table */
            .op-table {
                display: flex;
                flex-direction: column;
                gap: 0;
                flex: 1;
                overflow-y: auto;
                min-height: 0;
                padding: 0;
            }

            .op-row {
                display: grid;
                grid-template-columns: 60px 50px 45px 50px 50px 50px 50px 60px 50px 50px;
                gap: 4px;
                align-items: center;
                padding: 8px 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                font-size: 10px;
                font-family: 'JetBrains Mono', monospace;
                font-feature-settings: "tnum";
                transition: all 0.2s ease;
            }

            .op-row:last-child {
                border-bottom: none;
            }

            .op-row:hover {
                background: rgba(255, 255, 255, 0.02);
            }

            .op-row.highlighted {
                background: rgba(255, 215, 0, 0.08);
                border-left: 2px solid var(--ml-color);
                box-shadow: inset 0 0 12px rgba(255, 215, 0, 0.1);
            }

            /* Per-cell styling */
            .op-cell {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .op-symbol {
                font-weight: 600;
                color: var(--text-primary);
            }

            .op-broker {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 34px;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 8px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.4px;
                background: rgba(100, 150, 200, 0.2);
                border: 1px solid rgba(100, 150, 200, 0.4);
                color: rgba(100, 150, 200, 0.9);
            }

            .op-broker.kra {
                background: rgba(150, 100, 200, 0.2);
                border-color: rgba(150, 100, 200, 0.4);
                color: rgba(150, 100, 200, 0.9);
            }

            .op-broker.cb {
                background: rgba(100, 200, 200, 0.2);
                border-color: rgba(100, 200, 200, 0.4);
                color: rgba(100, 200, 200, 0.9);
            }

            .op-side {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 40px;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 9px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.4px;
                background: rgba(34, 197, 94, 0.2);
                color: var(--profit-color);
                border: 1px solid rgba(34, 197, 94, 0.4);
            }

            .op-side.short {
                background: rgba(255, 51, 102, 0.2);
                color: var(--loss-color);
                border-color: rgba(255, 51, 102, 0.4);
            }

            .op-price {
                text-align: right;
                color: var(--text-secondary);
                font-weight: 500;
            }

            .op-pnl {
                text-align: right;
                font-weight: 600;
                color: var(--profit-color);
            }

            .op-pnl.negative {
                color: var(--loss-color);
            }

            .op-pnl.flash-up {
                animation: op-pnl-flash-up 300ms ease-out;
            }

            .op-pnl.flash-down {
                animation: op-pnl-flash-down 300ms ease-out;
            }

            .op-current {
                text-align: right;
                font-variant-numeric: tabular-nums;
                transition: color 80ms ease;
            }

            .op-current.tick-up {
                animation: op-current-tick-up 240ms ease-out;
            }

            .op-current.tick-down {
                animation: op-current-tick-down 240ms ease-out;
            }

            @keyframes op-current-tick-up {
                0% { color: rgba(34, 197, 94, 0.95); transform: translateY(-0.5px); }
                100% { color: var(--text-primary); transform: translateY(0); }
            }

            @keyframes op-current-tick-down {
                0% { color: rgba(239, 68, 68, 0.95); transform: translateY(0.5px); }
                100% { color: var(--text-primary); transform: translateY(0); }
            }

            .op-row.breathing {
                animation: op-row-breath 3600ms ease-in-out infinite;
            }

            @keyframes op-row-breath {
                0%, 100% { background-color: rgba(255, 255, 255, 0); }
                50% { background-color: rgba(255, 215, 0, 0.025); }
            }

            .op-time {
                text-align: right;
                color: var(--text-secondary);
                font-weight: 400;
            }

            /* Animations */
            @keyframes op-pnl-flash-up {
                0% {
                    color: #ffd700;
                    text-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
                }
                100% {
                    color: var(--profit-color);
                    text-shadow: none;
                }
            }

            @keyframes op-pnl-flash-down {
                0% {
                    color: #ffd700;
                    text-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
                }
                100% {
                    color: var(--loss-color);
                    text-shadow: none;
                }
            }

            @keyframes op-row-enter {
                from {
                    opacity: 0;
                    transform: translateY(-8px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            @keyframes op-row-exit {
                from {
                    opacity: 1;
                    transform: translateY(0);
                }
                to {
                    opacity: 0;
                    transform: translateY(8px);
                }
            }

            .op-row.entering {
                animation: op-row-enter 0.3s ease-out;
            }

            .op-row.exiting {
                animation: op-row-exit 0.2s ease-out;
            }

            /* Empty state */
            .op-empty {
                display: flex;
                align-items: center;
                justify-content: center;
                flex: 1;
                padding: 32px 12px;
                text-align: center;
                color: var(--text-secondary);
                font-size: 11px;
                font-weight: 300;
                border: 1px dashed var(--border-color);
                margin: 12px;
                border-radius: 6px;
                background: rgba(0, 0, 0, 0.2);
            }

            /* Scrollbar styling */
            .op-table::-webkit-scrollbar {
                width: 4px;
            }

            .op-table::-webkit-scrollbar-track {
                background: transparent;
            }

            .op-table::-webkit-scrollbar-thumb {
                background: rgba(255, 215, 0, 0.2);
                border-radius: 2px;
            }

            .op-table::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 215, 0, 0.4);
            }

            @media (prefers-reduced-motion: reduce) {
                .op-row,
                .op-row.breathing,
                .op-pnl.flash-up,
                .op-pnl.flash-down,
                .op-current.tick-up,
                .op-current.tick-down,
                .op-row.entering,
                .op-row.exiting {
                    animation: none;
                }
                .op-current {
                    transition: none;
                }
            }
        `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Helper: Format Time Held ────────────────────────────────────
  function formatTimeHeld(openedAt) {
    if (!openedAt || openedAt <= 0) return '--';
    const elapsed = Date.now() - openedAt;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return '<1m';
    }
  }

  // ─── Helper: Position Key ────────────────────────────────────────
  function makeKey(symbol, broker, openedAt) {
    return `${symbol}${POSITION_KEY_SEP}${broker}${POSITION_KEY_SEP}${openedAt}`;
  }

  // ─── Helper: Format P&L ──────────────────────────────────────────
  // Prefer bot-authoritative unrealizedPnL when state_update has populated
  // it. Fall back to derived (current-entry)*notional only if we have both.
  function formatPnl(position) {
    if (!position) return {
      dollar: '--',
      percent: '--',
      value: 0
    };

    // Authoritative path (set by handleStateUpdate from StateManager)
    if (position.unrealizedPnL != null && isFinite(position.unrealizedPnL)) {
      const v = Number(position.unrealizedPnL);
      const sign = v >= 0 ? '+' : '';
      // % is unr / position notional (size in USD)
      const denom = Math.abs(position.size) || 0;
      const pct = denom > 0 ? v / denom * 100 : 0;
      return {
        dollar: `${sign}$${Math.abs(v).toFixed(2)}`,
        percent: `${sign}${pct.toFixed(2)}%`,
        value: v
      };
    }

    // Derived path (only if we have both entry and current)
    if (!position.current || !position.entry) {
      return {
        dollar: '--',
        percent: '--',
        value: 0
      };
    }
    if (position.side === 'short') {
      const shortDollarPnl = (position.entry - position.current) * position.size;
      const shortPercentPnl = (position.entry - position.current) / position.entry * 100;
      const sign = shortDollarPnl >= 0 ? '+' : '';
      return {
        dollar: `${sign}$${Math.abs(shortDollarPnl).toFixed(2)}`,
        percent: `${sign}${shortPercentPnl.toFixed(2)}%`,
        value: shortDollarPnl
      };
    }
    const dollarPnl = (position.current - position.entry) * position.size;
    const percentPnl = (position.current - position.entry) / position.entry * 100;
    const sign = dollarPnl >= 0 ? '+' : '';
    return {
      dollar: `${sign}$${Math.abs(dollarPnl).toFixed(2)}`,
      percent: `${sign}${percentPnl.toFixed(2)}%`,
      value: dollarPnl
    };
  }

  // Format a numeric price; '--' when the bot hasn't surfaced it yet.
  function fmtPrice(v) {
    return v != null && isFinite(v) && v > 0 ? `$${Number(v).toFixed(2)}` : '--';
  }

  // ─── Render Functions ────────────────────────────────────────────
  function mount() {
    if (state.mounted) return true;
    const root = document.getElementById(ROOT_ID);
    if (!root) return false;
    root.innerHTML = '';
    state.domRefs.root = root;

    // Header
    const header = document.createElement('div');
    header.className = 'op-header';
    header.innerHTML = `
            <span class="op-header-title">OPEN POSITIONS</span>
            <span class="op-count-badge" id="opCountBadge">0 OPEN</span>
            <span class="op-aggregate-pnl" id="opAggregatePnl">+$0</span>
        `;
    state.domRefs.header = header;
    state.domRefs.count = header.querySelector('#opCountBadge');
    state.domRefs.aggregatePnl = header.querySelector('#opAggregatePnl');
    root.appendChild(header);

    // Table container
    const table = document.createElement('div');
    table.className = 'op-table';
    table.id = 'opTable';
    state.domRefs.table = table;
    state.domRefs.tbody = table; // Flex container acts as tbody
    root.appendChild(table);
    state.mounted = true;
    return true;
  }
  function renderRows() {
    if (!state.domRefs.tbody) return;

    // Clear existing rows
    state.domRefs.tbody.innerHTML = '';
    if (state.positions.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'op-empty';
      empty.textContent = 'No positions open — bot scanning';
      state.domRefs.tbody.appendChild(empty);
      updateHeader();
      return;
    }

    // Sort positions by opened time (newest first)
    const sorted = Array.from(state.positions.values()).sort((a, b) => b.openedAt - a.openedAt);
    sorted.forEach(position => {
      const row = renderRow(position);
      state.domRefs.tbody.appendChild(row);
    });
    updateHeader();
  }
  function renderRow(position) {
    const row = document.createElement('div');
    row.className = 'op-row';
    row.dataset.symbol = position.symbol;
    row.dataset.broker = position.broker;
    row.dataset.openedAt = position.openedAt;
    const pnl = formatPnl(position);
    const timeHeld = formatTimeHeld(position.openedAt);
    const brokerClass = position.broker.toLowerCase();
    row.innerHTML = `
            <div class="op-cell op-symbol">${position.symbol}</div>
            <div class="op-cell"><span class="op-broker ${brokerClass}">${position.broker}</span></div>
            <div class="op-cell"><span class="op-side ${position.side === 'short' ? 'short' : ''}">${position.side.toUpperCase()}</span></div>
            <div class="op-cell op-price" id="opEntry-${position.symbol}-${position.broker}-${position.openedAt}">${fmtPrice(position.entry)}</div>
            <div class="op-cell op-price" id="opCurrent-${position.symbol}-${position.broker}-${position.openedAt}">${fmtPrice(position.current || position.entry)}</div>
            <div class="op-cell op-price" id="opSL-${position.symbol}-${position.broker}-${position.openedAt}">${fmtPrice(position.stopLoss)}</div>
            <div class="op-cell op-price" id="opTP-${position.symbol}-${position.broker}-${position.openedAt}">${fmtPrice(position.takeProfit)}</div>
            <div class="op-cell op-pnl ${pnl.value < 0 ? 'negative' : ''}" id="opPnlDol-${position.symbol}-${position.broker}-${position.openedAt}">${pnl.dollar}</div>
            <div class="op-cell op-pnl ${pnl.value < 0 ? 'negative' : ''}" id="opPnlPct-${position.symbol}-${position.broker}-${position.openedAt}">${pnl.percent}</div>
            <div class="op-cell op-time" id="opTime-${position.symbol}-${position.broker}-${position.openedAt}">${timeHeld}</div>
        `;

    // Highlight if this is selected ticker
    if (state.selectedTicker && position.symbol === state.selectedTicker) {
      row.classList.add('highlighted');
    }
    row.classList.add('entering');
    setTimeout(() => row.classList.remove('entering'), 300);
    return row;
  }
  function updateHeader() {
    if (state.domRefs.count) {
      const count = state.positions.size;
      state.domRefs.count.textContent = `${count} OPEN`;
    }
    if (state.domRefs.aggregatePnl) {
      let totalPnl = 0;
      state.positions.forEach(pos => {
        const pnl = formatPnl(pos);
        totalPnl += pnl.value || 0;
      });
      const sign = totalPnl >= 0 ? '+' : '';
      state.domRefs.aggregatePnl.textContent = `${sign}$${Math.abs(totalPnl).toFixed(0)}`;
      state.domRefs.aggregatePnl.classList.toggle('negative', totalPnl < 0);
    }
  }
  function updateRow(symbol, broker, openedAt) {
    const key = makeKey(symbol, broker, openedAt);
    const position = state.positions.get(key);
    if (!position) return;
    const pnl = formatPnl(position);
    const timeHeld = formatTimeHeld(position.openedAt);

    // Update current price with a subtle per-tick liveness cue.
    const currentEl = document.getElementById(`opCurrent-${symbol}-${broker}-${openedAt}`);
    if (currentEl) {
      const newPrice = position.current || position.entry;
      const prevPrice = parseFloat((currentEl.textContent || '').replace('$', ''));
      currentEl.textContent = `$${newPrice.toFixed(2)}`;
      if (isFinite(prevPrice) && prevPrice > 0 && prevPrice !== newPrice) {
        currentEl.classList.remove('tick-up', 'tick-down');
        void currentEl.offsetWidth;
        currentEl.classList.add(newPrice > prevPrice ? 'tick-up' : 'tick-down');
      }
      const rowEl = currentEl.closest('.op-row');
      if (rowEl && !rowEl.classList.contains('breathing')) {
        rowEl.classList.add('breathing');
      }
    }

    // Update P&L dollar
    const pnlDolEl = document.getElementById(`opPnlDol-${symbol}-${broker}-${openedAt}`);
    if (pnlDolEl) {
      const prevValue = parseFloat((pnlDolEl.textContent || '').replace(/[^0-9.-]/g, ''));
      const isUp = pnl.value > prevValue;
      pnlDolEl.textContent = pnl.dollar;
      pnlDolEl.classList.toggle('negative', pnl.value < 0);
      pnlDolEl.classList.remove('flash-up', 'flash-down');
      pnlDolEl.classList.add(isUp ? 'flash-up' : 'flash-down');
      setTimeout(() => {
        pnlDolEl.classList.remove('flash-up', 'flash-down');
      }, PNL_FLASH_MS);
    }

    // Update P&L percent
    const pnlPctEl = document.getElementById(`opPnlPct-${symbol}-${broker}-${openedAt}`);
    if (pnlPctEl) {
      pnlPctEl.textContent = pnl.percent;
      pnlPctEl.classList.toggle('negative', pnl.value < 0);
    }

    // Update time held
    const timeEl = document.getElementById(`opTime-${symbol}-${broker}-${openedAt}`);
    if (timeEl) {
      timeEl.textContent = timeHeld;
    }

    // Update header aggregate
    updateHeader();
  }

  // ─── Helpers: resolve current asset from the chart selector ────────
  function resolveCurrentSymbol() {
    try {
      const sel = document.getElementById('cp-assetSelector');
      if (sel && sel.value) return String(sel.value).toUpperCase();
      const wl = OGZ && typeof OGZ.get === 'function' ? OGZ.get('WatchlistStrip') : null;
      if (wl && typeof wl.getSelected === 'function') {
        const t = wl.getSelected();
        if (t) return String(t).toUpperCase();
      }
    } catch (_) {/* swallow */}
    return 'ASSET';
  }
  function resolveBroker(symbol) {
    // Crypto pairs route through Kraken; everything else through Alpaca.
    // Coinbase is reserved for hot wallet use; bot doesn't currently emit a
    // broker tag on trade events.
    if (!symbol) return 'ALP';
    if (/-USD$|^BTC|^ETH|^SOL/.test(symbol.toUpperCase())) return 'KRA';
    return 'ALP';
  }
  function normalizeBrokerId(value, symbol) {
    if (!value) return resolveBroker(symbol);
    const raw = String(value).trim();
    const lower = raw.toLowerCase();
    if (lower === 'alpaca' || lower === 'alp') return 'ALP';
    if (lower === 'kraken' || lower === 'kra') return 'KRA';
    if (lower === 'coinbase' || lower === 'cb') return 'CB';
    return raw.toUpperCase();
  }
  function normalizeBackendPosition(raw, packetTimestamp) {
    if (!raw || !raw.symbol) return null;
    const symbol = String(raw.symbol).toUpperCase();
    const broker = normalizeBrokerId(raw.broker || raw.brokerId, symbol);
    const pending = state.pendingEntries && state.pendingEntries.get(entryKey(symbol, broker));
    const openedAt = Number(raw.openedAt || raw.entryTime || raw.timestamp || pending && pending.openedAt || packetTimestamp || Date.now());
    const entry = Number(raw.entryPrice ?? raw.entry ?? (pending && pending.entry) ?? 0);
    const current = Number(raw.currentPrice ?? raw.current ?? raw.lastPrice ?? entry);
    const size = Number(raw.sizeUsd ?? raw.size ?? 0);
    const action = String(raw.action || '').toUpperCase();
    const side = String(raw.side || raw.direction || (action === 'SELL_SHORT' ? 'short' : 'long')).toLowerCase();
    const unrealizedPnL = raw.unrealizedPnL != null ? Number(raw.unrealizedPnL) : null;
    return {
      symbol,
      broker,
      brokerId: normalizeBrokerId(raw.brokerId || raw.broker, symbol),
      accountId: raw.accountId,
      accountIdSource: raw.accountIdSource,
      assetClass: raw.assetClass,
      executionMode: raw.executionMode,
      timeframe: raw.timeframe,
      scopeKey: raw.scopeKey,
      scopeComplete: raw.scopeComplete === true,
      scopeKeyVersion: raw.scopeKeyVersion || 1,
      side: side === 'short' ? 'short' : 'long',
      entry: isFinite(entry) ? entry : 0,
      current: isFinite(current) ? current : 0,
      stopLoss: Number(raw.stopLoss ?? raw.sl ?? 0) || 0,
      takeProfit: Number(raw.takeProfit ?? raw.tp ?? 0) || 0,
      size: isFinite(size) ? Math.abs(size) : 0,
      openedAt: isFinite(openedAt) ? openedAt : Date.now(),
      unrealizedPnL: unrealizedPnL != null && isFinite(unrealizedPnL) ? unrealizedPnL : null,
      strategy: raw.strategy || pending && pending.strategy || null,
      tradeId: raw.tradeId || raw.orderId || null,
      orderId: raw.orderId || null,
      status: raw.status || 'open'
    };
  }

  // Capture entry price keyed by (symbol|broker) so reopens replace entry
  // cleanly when state_update reports a new position.
  function entryKey(symbol, broker) {
    return symbol + POSITION_KEY_SEP + broker;
  }

  // ─── WS Event Handlers (real bot emitter shapes) ───────────────────

  // 'trade' — capture entry price + side on open; clear on close.
  // Real bot shape: { type:'trade', action, direction, price, pnl, timestamp,
  // duration?, confidence }. Single-pair: symbol resolved from chart selector.
  function handleTradeEvent(d) {
    try {
      const data = d && d.data ? d.data : d;
      if (!data || !data.action) return;
      const symbol = data.symbol ? String(data.symbol).toUpperCase() : resolveCurrentSymbol();
      const broker = normalizeBrokerId(data.broker || data.brokerId, symbol);
      const price = parseFloat(data.price);
      const ts = Number(data.timestamp) || Date.now();
      const action = String(data.action).toUpperCase();
      const dir = String(data.direction || (action === 'BUY' ? 'long' : 'short')).toLowerCase();
      const isOpen = action === 'BUY' || action === 'SELL_SHORT';
      const isClose = action === 'SELL' || action === 'COVER';
      if (!isFinite(price) || price <= 0) return;
      if (isOpen) {
        // Cache the entry; the position row itself is created/synced by
        // the next state_update tick which carries authoritative size.
        state.pendingEntries = state.pendingEntries || new Map();
        state.pendingEntries.set(entryKey(symbol, broker), {
          entry: price,
          side: dir === 'short' ? 'short' : 'long',
          openedAt: ts,
          confidence: data.confidence
        });
        // If we already have a row from state_update, fill in entry now
        state.positions.forEach((pos, key) => {
          if (pos.symbol === symbol && pos.broker === broker && (!pos.entry || pos.entry === 0)) {
            pos.entry = price;
            pos.openedAt = ts;
            pos.side = dir === 'short' ? 'short' : 'long';
          }
        });
        renderRows();
      } else if (isClose) {
        // Drop any rows for this (symbol|broker); state_update will
        // confirm with position=0 right after.
        let removed = false;
        state.positions.forEach((pos, key) => {
          if (pos.symbol === symbol && pos.broker === broker) {
            // stamp realized pnl on the row briefly via flash class
            state.positions.delete(key);
            removed = true;
          }
        });
        if (state.pendingEntries) state.pendingEntries.delete(entryKey(symbol, broker));
        if (removed) renderRows();
      }
    } catch (_) {/* swallow */}
  }

  // 'price' — prefer event symbol when present; selected chart is only the
  // legacy fallback for older single-pair payloads.
  function handlePriceEvent(d) {
    try {
      const data = d && d.data ? d.data : d;
      const price = parseFloat(data && (data.price != null ? data.price : data.close));
      if (!isFinite(price) || price <= 0) return;
      const symbol = data.symbol ? String(data.symbol).toUpperCase() : resolveCurrentSymbol();
      let updated = false;
      state.positions.forEach(position => {
        if (position.symbol === symbol) {
          position.current = price;
          updateRow(position.symbol, position.broker, position.openedAt);
          updated = true;
        }
      });
      if (updated) updateHeader();
    } catch (_) {/* swallow */}
  }

  // 'state_update' — authoritative position presence & unrealized P&L.
  // state.position is a SIGNED USD size: >0 long, <0 short, 0 flat.
  function handleStateUpdate(d) {
    try {
      const s = d && d.state ? d.state : null;
      if (!s) return;
      if (Array.isArray(s.positions)) {
        const nextPositions = new Map();
        s.positions.forEach(raw => {
          const position = normalizeBackendPosition(raw, d.timestamp);
          if (!position) return;
          nextPositions.set(makeKey(position.symbol, position.broker, position.openedAt), position);
        });
        state.positions = nextPositions;
        renderRows();
        return;
      }
      const sizeUsd = Number(s.position) || 0;
      const unrPnL = Number(s.unrealizedPnL) || 0;
      const symbol = resolveCurrentSymbol();
      const broker = resolveBroker(symbol);
      if (sizeUsd === 0) {
        // Bot says flat — purge any rows for this symbol/broker.
        let removed = false;
        state.positions.forEach((pos, key) => {
          if (pos.symbol === symbol && pos.broker === broker) {
            state.positions.delete(key);
            removed = true;
          }
        });
        if (removed) renderRows();
        return;
      }

      // Non-zero position: ensure a row exists and sync the live values.
      const side = sizeUsd >= 0 ? 'long' : 'short';
      const pending = state.pendingEntries && state.pendingEntries.get(entryKey(symbol, broker)) || null;
      const entryAt = pending ? pending.openedAt : d.timestamp || Date.now();
      const key = makeKey(symbol, broker, entryAt);
      let pos = state.positions.get(key);
      if (!pos) {
        // No prior row — first time we see this open position.
        pos = {
          symbol,
          broker,
          side,
          entry: pending ? pending.entry : 0,
          current: 0,
          // updated by next price tick
          stopLoss: 0,
          // backend doesn't broadcast yet
          takeProfit: 0,
          // backend doesn't broadcast yet
          size: Math.abs(sizeUsd),
          // store USD notional
          openedAt: entryAt,
          unrealizedPnL: unrPnL,
          strategy: pending ? pending.strategy : null
        };
        state.positions.set(key, pos);
        renderRows();
      } else {
        pos.size = Math.abs(sizeUsd);
        pos.unrealizedPnL = unrPnL;
        pos.side = side;
        updateRow(pos.symbol, pos.broker, pos.openedAt);
        updateHeader();
      }
    } catch (_) {/* swallow */}
  }

  // ─── Event Bus Helper ────────────────────────────────────────────
  function ensureEventBus() {
    if (OGZ && OGZ.bus) return;
    const listeners = new Map();
    const bus = {
      on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(handler);
      },
      off(event, handler) {
        if (!listeners.has(event)) return;
        const list = listeners.get(event);
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      },
      emit(event, data) {
        if (!listeners.has(event)) return;
        listeners.get(event).forEach(h => {
          try {
            h(data);
          } catch (_) {/* swallow */}
        });
      }
    };
    if (OGZ) OGZ.bus = bus;
  }

  // ─── Public API ─────────────────────────────────────────────────
  const api = {
    init() {
      injectStyles();
      if (!mount()) return;
      ensureEventBus();

      // Subscribe to WS events via the real socket. May not be ready
      // at panel-init time; poll briefly until OGZ.get('Socket') resolves.
      (function bindSocket() {
        const socket = OGZ && typeof OGZ.get === 'function' ? OGZ.get('Socket') : null;
        if (!socket || typeof socket.registerHandler !== 'function') {
          setTimeout(bindSocket, 250);
          return;
        }
        socket.registerHandler('trade', e => {
          try {
            handleTradeEvent(e);
          } catch (_) {}
        });
        socket.registerHandler('price', e => {
          try {
            handlePriceEvent(e);
          } catch (_) {}
        });
        socket.registerHandler('state_update', e => {
          try {
            handleStateUpdate(e);
          } catch (_) {}
        });
      })();

      // Re-render every 10s so the "time held" column ticks up live
      // even when no other event fires. Cheap enough — we only re-render
      // when there's at least one open position.
      state._timeTicker = setInterval(() => {
        if (state.positions.size > 0) {
          state.positions.forEach(pos => {
            updateRow(pos.symbol, pos.broker, pos.openedAt);
          });
        }
      }, 10000);

      // Subscribe to bus events
      if (OGZ && OGZ.bus) {
        OGZ.bus.on('watchlist:select', data => {
          try {
            state.selectedTicker = data && data.ticker ? String(data.ticker) : null;
            renderRows();
          } catch (_) {/* swallow */}
        });
      }
      renderRows();
    },
    addPosition(position) {
      if (!position || !position.symbol) return;
      const key = makeKey(position.symbol, normalizeBrokerId(position.broker, position.symbol), position.openedAt || Date.now());
      state.positions.set(key, {
        symbol: String(position.symbol).toUpperCase(),
        broker: normalizeBrokerId(position.broker, position.symbol),
        side: (position.side || 'long').toLowerCase(),
        entry: position.entry || 0,
        current: position.current || position.entry || 0,
        stopLoss: position.stopLoss || 0,
        takeProfit: position.takeProfit || 0,
        size: position.size || 0,
        openedAt: position.openedAt || Date.now(),
        strategy: position.strategy,
        tradeId: position.tradeId
      });
      renderRows();
    },
    closePosition(symbol, broker) {
      if (!symbol) return;
      let found = false;
      state.positions.forEach((pos, key) => {
        if (pos.symbol === String(symbol).toUpperCase() && pos.broker === normalizeBrokerId(broker, symbol)) {
          state.positions.delete(key);
          found = true;
        }
      });
      if (found) {
        renderRows();
      }
    },
    getPositions() {
      return Array.from(state.positions.values());
    },
    clearAll() {
      state.positions.clear();
      renderRows();
    },
    teardown() {
      if (!state.mounted) return;

      // Stop time-held ticker
      if (state._timeTicker) {
        clearInterval(state._timeTicker);
        state._timeTicker = null;
      }

      // Remove DOM
      if (state.domRefs.root) {
        state.domRefs.root.innerHTML = '';
      }

      // Remove styles
      const style = document.getElementById(STYLE_ID);
      if (style) style.remove();
      state.mounted = false;
      state.positions.clear();
      state.pendingEntries.clear();
      Object.keys(state.domRefs).forEach(key => {
        state.domRefs[key] = null;
      });
    },
    _compute() {
      return {
        mounted: state.mounted,
        positionCount: state.positions.size,
        positions: Array.from(state.positions.values()),
        selectedTicker: state.selectedTicker
      };
    }
  };

  // ─── Registration ──────────────────────────────────────────────
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('OpenPositions', api);
  } else if (window.OGZ) {
    window.OGZ.OpenPositions = api;
  }
})(window.OGZ || (window.OGZ = {}));
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/open-positions.js", error: String((e && e.message) || e) }); }

// public/js/panels/pattern-card.js
try { (() => {
/**
 * pattern-card.js — PatternCard: White-Box ML Pattern Visualization
 *
 * The operator's signature feature — real-time chart pattern detection with
 * hand-drawn SVG illustrations of canonical shapes. When the bot's pattern
 * engine detects a chart pattern (double bottom, head & shoulders, etc.),
 * this panel displays:
 *   - Pattern name (large, prominent)
 *   - Hand-drawn canonical SVG shape for the pattern
 *   - 1-2 sentence description of what makes it that pattern
 *   - Live confidence with thermal gradient bar
 *   - Recent occurrence history for the current ticker (last 3-5 with W/L outcomes)
 *
 * Two visible states:
 *   SCANNING: Small pulsing magnifying glass, label "Pattern engine scanning...",
 *             optional last-detected attribution
 *   DETECTED: Card flip animation. Pattern name, SVG, description, confidence bar,
 *             mini-list of recent occurrences on the selected ticker.
 *
 * Self-registers as OGZ.PatternCard via OGZ.register().
 * Mounts into <div id="patternCard"></div>.
 * Subscribes to WS event `pattern_analysis` (backend emitter UNVERIFIED).
 * Listens for `OGZ.bus.on('watchlist:select', ...)` to re-render for new ticker.
 * Gracefully handles "no events ever arrive" — stays in scanning state indefinitely.
 *
 * NO demo mode. NO Math.random. Patterns render only when real `pattern_analysis`
 * WS events arrive. Stays in scanning state indefinitely otherwise.
 *
 * Public API:
 *   init() - Mount to DOM, inject styles, subscribe to WS events
 *   setSymbol(symbol) - Manually set the displayed ticker (used by watchlist listener)
 *   getHistory(symbol) - Get recent detection history for a symbol
 *   clearHistory(symbol) - Clear cached history for a symbol
 *   teardown() - Remove DOM, listeners, styles
 *   _compute() - Debug helper: return internal state snapshot
 *
 * @typedef {Object} PatternEvent
 * @property {number} ts - Unix epoch milliseconds
 * @property {string} symbol - Ticker symbol (e.g., 'TSLA')
 * @property {string} pattern - Pattern key (e.g., 'double_bottom')
 * @property {number} confidence - 0..1
 * @property {'long'|'short'|null} bias - Direction implied by pattern
 * @property {string} [neckline] - Optional price level (e.g., for H&S)
 * @property {Object} [meta] - Optional extra context (timeframe, stage, etc.)
 *
 * @module public/js/panels/pattern-card
 */
(function (OGZ) {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────
  const STYLE_ID = 'ogz-pattern-card-styles';
  const ROOT_ID = 'patternCard';
  const MAX_HISTORY_PER_TICKER = 5; // Show up to 5 recent detections
  const MAX_HISTORY_TOTAL = 30; // Cap total in-memory history at 30
  const CARD_FLIP_MS = 600; // Animation duration for state transition

  // ─── SVG Pattern Art Library ────────────────────────────────────────
  // Each function returns an <svg> string with viewBox 240x100.
  // Styles use CSS variables for colors (--core-color cyan, --ml-color gold, etc.)
  const PATTERN_ART = {
    'double_bottom': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="db-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background fill (subtle bullish) -->
            <path d="M 20 40 L 240 40 L 240 100 L 20 100 Z" fill="url(#db-bg)"/>
            <!-- Support line (neckline) -->
            <line x1="20" y1="42" x2="240" y2="42" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Left low (point 1) -->
            <path d="M 20 70 L 60 30 L 100 65" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Right low (point 2, symmetrical) -->
            <path d="M 100 65 L 150 35 L 200 68 L 220 60" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points -->
            <circle cx="40" cy="70" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="100" cy="65" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="180" cy="68" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="35" y="85" font-size="9" fill="var(--text-secondary)" font-family="monospace">1</text>
            <text x="95" y="85" font-size="9" fill="var(--text-secondary)" font-family="monospace">valley</text>
            <text x="175" y="85" font-size="9" fill="var(--text-secondary)" font-family="monospace">2</text>
        </svg>`,
    'double_top': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="dt-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--loss-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--loss-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background fill (subtle bearish) -->
            <path d="M 20 0 L 240 0 L 240 60 L 20 60 Z" fill="url(#dt-bg)"/>
            <!-- Neckline (resistance) -->
            <line x1="20" y1="58" x2="240" y2="58" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Left peak -->
            <path d="M 20 55 L 60 15 L 100 50" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Right peak (symmetrical) -->
            <path d="M 100 50 L 150 18 L 200 52 L 220 60" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points -->
            <circle cx="60" cy="15" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="100" cy="50" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="150" cy="18" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="50" y="10" font-size="9" fill="var(--text-secondary)" font-family="monospace">1</text>
            <text x="95" y="35" font-size="9" fill="var(--text-secondary)" font-family="monospace">peak</text>
            <text x="145" y="10" font-size="9" fill="var(--text-secondary)" font-family="monospace">2</text>
        </svg>`,
    'head_shoulders': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="hs-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--loss-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--loss-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 0 L 240 0 L 240 65 L 20 65 Z" fill="url(#hs-bg)"/>
            <!-- Neckline -->
            <line x1="20" y1="63" x2="240" y2="63" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Left shoulder -->
            <path d="M 20 60 L 50 30 L 80 58" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Head (highest peak) -->
            <path d="M 80 58 L 120 8 L 160 58" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Right shoulder -->
            <path d="M 160 58 L 190 32 L 220 60" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points -->
            <circle cx="50" cy="30" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="120" cy="8" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="190" cy="32" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="40" y="20" font-size="9" fill="var(--text-secondary)" font-family="monospace">L</text>
            <text x="115" y="5" font-size="9" fill="var(--text-secondary)" font-family="monospace">H</text>
            <text x="185" y="20" font-size="9" fill="var(--text-secondary)" font-family="monospace">R</text>
        </svg>`,
    'inv_head_shoulders': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="ihs-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 35 L 240 35 L 240 100 L 20 100 Z" fill="url(#ihs-bg)"/>
            <!-- Neckline -->
            <line x1="20" y1="37" x2="240" y2="37" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Left shoulder -->
            <path d="M 20 40 L 50 70 L 80 42" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Head (lowest point) -->
            <path d="M 80 42 L 120 92 L 160 42" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Right shoulder -->
            <path d="M 160 42 L 190 68 L 220 40" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points -->
            <circle cx="50" cy="70" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="120" cy="92" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="190" cy="68" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="40" y="80" font-size="9" fill="var(--text-secondary)" font-family="monospace">L</text>
            <text x="115" y="95" font-size="9" fill="var(--text-secondary)" font-family="monospace">H</text>
            <text x="185" y="80" font-size="9" fill="var(--text-secondary)" font-family="monospace">R</text>
        </svg>`,
    'ascending_triangle': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="at-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 40 L 240 40 L 240 100 L 20 100 Z" fill="url(#at-bg)"/>
            <!-- Resistance (upper trend line) -->
            <line x1="20" y1="75" x2="200" y2="25" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Support (horizontal line) -->
            <line x1="20" y1="75" x2="200" y2="75" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Price action: rising lows, flat highs -->
            <path d="M 20 72 L 40 50 L 60 65 L 85 42 L 110 58 L 135 38 L 160 52 L 190 30" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points (rising lows) -->
            <circle cx="40" cy="50" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="85" cy="42" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="160" cy="52" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="15" y="80" font-size="9" fill="var(--text-secondary)" font-family="monospace">sup</text>
            <text x="200" y="20" font-size="9" fill="var(--text-secondary)" font-family="monospace">res</text>
        </svg>`,
    'descending_triangle': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="dt-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--loss-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--loss-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 0 L 240 0 L 240 60 L 20 60 Z" fill="url(#dt-bg)"/>
            <!-- Resistance (horizontal line) -->
            <line x1="20" y1="25" x2="200" y2="25" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Support (lower trend line) -->
            <line x1="20" y1="25" x2="200" y2="75" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Price action: falling highs, flat lows -->
            <path d="M 20 28 L 40 50 L 60 35 L 85 58 L 110 42 L 135 62 L 160 48 L 190 70" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points (falling highs) -->
            <circle cx="40" cy="50" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="85" cy="58" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="160" cy="48" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="15" y="20" font-size="9" fill="var(--text-secondary)" font-family="monospace">res</text>
            <text x="200" y="80" font-size="9" fill="var(--text-secondary)" font-family="monospace">sup</text>
        </svg>`,
    'symmetric_triangle': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="sym-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--neutral-color);stop-opacity:0.03"/>
                    <stop offset="100%" style="stop-color:var(--neutral-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 25 L 240 25 L 240 75 L 20 75 Z" fill="url(#sym-bg)"/>
            <!-- Upper trend (resistance narrowing) -->
            <line x1="20" y1="30" x2="180" y2="50" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Lower trend (support narrowing) -->
            <line x1="20" y1="70" x2="180" y2="50" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Price action: oscillating with decreasing amplitude -->
            <path d="M 20 32 L 35 68 L 50 35 L 65 65 L 80 40 L 95 60 L 110 45 L 125 55 L 140 48" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Convergence point -->
            <circle cx="180" cy="50" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="185" y="45" font-size="9" fill="var(--text-secondary)" font-family="monospace">apex</text>
        </svg>`,
    'bull_flag': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="bf-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 40 L 240 40 L 240 100 L 20 100 Z" fill="url(#bf-bg)"/>
            <!-- Pole (initial uptrend) -->
            <path d="M 20 75 L 45 25" stroke="var(--core-color)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
            <!-- Flag (slight downtrend/consolidation) -->
            <path d="M 45 25 L 70 35 L 95 32 L 120 38 L 145 35" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Breakout -->
            <path d="M 145 35 L 180 15" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Support/resistance in flag -->
            <line x1="45" y1="28" x2="145" y2="32" stroke="var(--ml-color)" stroke-width="0.8" stroke-dasharray="4,3"/>
            <line x1="45" y1="38" x2="145" y2="38" stroke="var(--ml-color)" stroke-width="0.8" stroke-dasharray="4,3"/>
            <!-- Annotations -->
            <text x="25" y="50" font-size="9" fill="var(--text-secondary)" font-family="monospace">pole</text>
            <text x="85" y="50" font-size="9" fill="var(--text-secondary)" font-family="monospace">flag</text>
        </svg>`,
    'bear_flag': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="bearf-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--loss-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--loss-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 0 L 240 0 L 240 60 L 20 60 Z" fill="url(#bearf-bg)"/>
            <!-- Pole (initial downtrend) -->
            <path d="M 20 25 L 45 75" stroke="var(--core-color)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
            <!-- Flag (slight uptrend/consolidation) -->
            <path d="M 45 75 L 70 65 L 95 68 L 120 62 L 145 65" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Breakdown -->
            <path d="M 145 65 L 180 85" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Support/resistance in flag -->
            <line x1="45" y1="72" x2="145" y2="68" stroke="var(--ml-color)" stroke-width="0.8" stroke-dasharray="4,3"/>
            <line x1="45" y1="62" x2="145" y2="62" stroke="var(--ml-color)" stroke-width="0.8" stroke-dasharray="4,3"/>
            <!-- Annotations -->
            <text x="25" y="40" font-size="9" fill="var(--text-secondary)" font-family="monospace">pole</text>
            <text x="85" y="55" font-size="9" fill="var(--text-secondary)" font-family="monospace">flag</text>
        </svg>`,
    'cup_handle': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="ch-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 40 L 240 40 L 240 100 L 20 100 Z" fill="url(#ch-bg)"/>
            <!-- Neckline (resistance) -->
            <line x1="20" y1="42" x2="220" y2="42" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Cup (rounded U shape) -->
            <path d="M 20 42 L 50 70 Q 100 85 150 70 L 180 42" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Handle (small pullback) -->
            <path d="M 180 42 L 195 55 L 210 42" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Breakout arrow (implied) -->
            <path d="M 210 42 L 225 25" stroke="var(--core-color)" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.6"/>
            <!-- Key points -->
            <circle cx="100" cy="85" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="195" cy="55" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="90" y="95" font-size="9" fill="var(--text-secondary)" font-family="monospace">cup</text>
            <text x="195" y="65" font-size="9" fill="var(--text-secondary)" font-family="monospace">h</text>
        </svg>`,
    'wedge_rising': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="wr-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--loss-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--loss-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 0 L 240 0 L 240 70 L 20 70 Z" fill="url(#wr-bg)"/>
            <!-- Upper trend (resistance rising) -->
            <line x1="20" y1="50" x2="190" y2="15" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Lower trend (support rising faster) -->
            <line x1="20" y1="65" x2="190" y2="35" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Price action: squeezed higher -->
            <path d="M 20 48 L 40 42 L 60 38 L 80 34 L 100 30 L 120 28 L 140 25 L 160 22" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points -->
            <circle cx="40" cy="42" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="120" cy="28" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="10" y="45" font-size="9" fill="var(--text-secondary)" font-family="monospace">r</text>
            <text x="10" y="65" font-size="9" fill="var(--text-secondary)" font-family="monospace">s</text>
        </svg>`,
    'wedge_falling': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="wf-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 30 L 240 30 L 240 100 L 20 100 Z" fill="url(#wf-bg)"/>
            <!-- Upper trend (resistance falling) -->
            <line x1="20" y1="35" x2="190" y2="65" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Lower trend (support falling slower) -->
            <line x1="20" y1="50" x2="190" y2="65" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Price action: squeezed lower -->
            <path d="M 20 52 L 40 58 L 60 62 L 80 66 L 100 70 L 120 72 L 140 75 L 160 78" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points -->
            <circle cx="40" cy="58" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="120" cy="72" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="10" y="35" font-size="9" fill="var(--text-secondary)" font-family="monospace">r</text>
            <text x="10" y="50" font-size="9" fill="var(--text-secondary)" font-family="monospace">s</text>
        </svg>`,
    'rectangle': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="rect-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--neutral-color);stop-opacity:0.03"/>
                    <stop offset="100%" style="stop-color:var(--neutral-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 30 L 240 30 L 240 70 L 20 70 Z" fill="url(#rect-bg)"/>
            <!-- Upper boundary (resistance) -->
            <line x1="20" y1="32" x2="220" y2="32" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Lower boundary (support) -->
            <line x1="20" y1="68" x2="220" y2="68" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Price oscillating within bounds -->
            <path d="M 20 68 L 40 35 L 60 65 L 80 38 L 100 62 L 120 36 L 140 64 L 160 38 L 180 60 L 200 35" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Key points -->
            <circle cx="40" cy="35" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="100" cy="62" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="180" cy="60" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="10" y="28" font-size="9" fill="var(--text-secondary)" font-family="monospace">res</text>
            <text x="10" y="75" font-size="9" fill="var(--text-secondary)" font-family="monospace">sup</text>
        </svg>`,
    'liquidity_sweep': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="ls-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 40 L 240 40 L 240 100 L 20 100 Z" fill="url(#ls-bg)"/>
            <!-- Resistance level -->
            <line x1="20" y1="42" x2="180" y2="42" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3"/>
            <!-- Initial uptrend -->
            <path d="M 20 75 L 60 35 L 80 45" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Pullback -->
            <path d="M 80 45 L 100 60" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Liquidity sweep (break above then drop) -->
            <path d="M 100 60 L 120 30 L 140 65" stroke="var(--core-color)" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.9"/>
            <!-- Recovery -->
            <path d="M 140 65 L 180 25" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Key points -->
            <circle cx="60" cy="35" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="120" cy="30" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="140" cy="65" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="115" y="15" font-size="9" fill="var(--text-secondary)" font-family="monospace">sweep</text>
        </svg>`,
    'breakout_retest': () => `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="br-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--profit-color);stop-opacity:0.05"/>
                    <stop offset="100%" style="stop-color:var(--profit-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <!-- Background -->
            <path d="M 20 40 L 240 40 L 240 100 L 20 100 Z" fill="url(#br-bg)"/>
            <!-- Resistance/breakout level -->
            <line x1="20" y1="42" x2="220" y2="42" stroke="var(--ml-color)" stroke-width="1.5" stroke-dasharray="4,3"/>
            <!-- Consolidation before breakout -->
            <path d="M 20 55 L 40 50 L 60 52 L 80 51 L 100 53" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Initial breakout -->
            <path d="M 100 53 L 130 25" stroke="var(--core-color)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
            <!-- Retest (pullback to level) -->
            <path d="M 130 25 L 155 43 L 170 38" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Confirmation (breakout again) -->
            <path d="M 170 38 L 200 20" stroke="var(--core-color)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <!-- Key points -->
            <circle cx="130" cy="25" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <circle cx="155" cy="43" r="2.5" fill="var(--ml-color)" stroke="var(--core-color)" stroke-width="1"/>
            <!-- Annotations -->
            <text x="120" y="15" font-size="9" fill="var(--text-secondary)" font-family="monospace">BRK</text>
            <text x="155" y="55" font-size="9" fill="var(--text-secondary)" font-family="monospace">TEST</text>
        </svg>`
  };

  // ─── Pattern Descriptions ────────────────────────────────────────────
  const PATTERN_DESCRIPTIONS = {
    'double_bottom': {
      title: 'Double Bottom',
      bias: 'bullish',
      summary: 'Two roughly-equal lows separated by a peak. Signals exhaustion of selling pressure. Confirm on neckline break with volume.'
    },
    'double_top': {
      title: 'Double Top',
      bias: 'short',
      summary: 'Two peaks at similar level separated by a valley. Bearish reversal pattern. Confirm on neckline break downward.'
    },
    'head_shoulders': {
      title: 'Head & Shoulders',
      bias: 'short',
      summary: 'Three peaks (left shoulder, head, right shoulder) with lower second shoulder. Classic reversal. Confirm on neckline support break.'
    },
    'inv_head_shoulders': {
      title: 'Inverse H&S',
      bias: 'long',
      summary: 'Inverted version of H&S (three lows). Bullish reversal pattern emerging from downtrend. Confirm on neckline resistance break.'
    },
    'ascending_triangle': {
      title: 'Ascending Triangle',
      bias: 'long',
      summary: 'Rising lows meet flat resistance. Buyer conviction increases while sellers hold line. Breakout above is typical bullish resolution.'
    },
    'descending_triangle': {
      title: 'Descending Triangle',
      bias: 'short',
      summary: 'Falling highs meet flat support. Seller conviction increases while buyers hold line. Breakout downward is typical bearish resolution.'
    },
    'symmetric_triangle': {
      title: 'Symmetric Triangle',
      bias: null,
      summary: 'Converging trend lines indicating indecision. Apex is decision point. Breakout direction determines bias.'
    },
    'bull_flag': {
      title: 'Bull Flag',
      bias: 'long',
      summary: 'Strong uptrend (pole) followed by minor consolidation (flag). Continuation pattern. Breakout above flag signals new leg up.'
    },
    'bear_flag': {
      title: 'Bear Flag',
      bias: 'short',
      summary: 'Strong downtrend (pole) followed by minor consolidation (flag). Continuation pattern. Breakdown below flag signals new leg down.'
    },
    'cup_handle': {
      title: 'Cup & Handle',
      bias: 'long',
      summary: 'U-shaped cup (consolidation) with small handle pullback. Bullish continuation. Breakout above neckline confirms resumption of uptrend.'
    },
    'wedge_rising': {
      title: 'Rising Wedge',
      bias: 'short',
      summary: 'Rising support and resistance converging upward. Price squeezed. Often reverses or breaks down (bearish bias despite uptrend look).'
    },
    'wedge_falling': {
      title: 'Falling Wedge',
      bias: 'long',
      summary: 'Falling support and resistance converging downward. Price squeezed. Often reverses or breaks up (bullish bias despite downtrend look).'
    },
    'rectangle': {
      title: 'Rectangle',
      bias: null,
      summary: 'Price oscillating between two parallel lines (support/resistance). Consolidation pattern. Breakout direction determines trend.'
    },
    'liquidity_sweep': {
      title: 'Liquidity Sweep',
      bias: 'long',
      summary: 'Price breaks resistance (trapping stops above), then reverses and rallies. Smart money trap. Watch for confirmation after reversal.'
    },
    'breakout_retest': {
      title: 'Breakout Retest',
      bias: 'long',
      summary: 'Price breaks resistance, pulls back to test it as support, then continues higher. High-probability confirmation setup.'
    },
    'ml_detected': {
      title: 'ML Detected Structure',
      bias: null,
      summary: 'The model found repeatable structure that does not map to a fixed pattern-library shape. The panel renders the live candle geometry instead of assigning a false label.'
    }
  };

  // ─── Private State ──────────────────────────────────────────────────
  const state = {
    mounted: false,
    currentSymbol: 'TSLA',
    currentPattern: null,
    // PatternEvent or null
    historyByTicker: new Map(),
    // symbol → PatternEvent[]
    totalHistory: [] // All events (capped at MAX_HISTORY_TOTAL)
  };

  // ─── Utilities ──────────────────────────────────────────────────────
  function formatRelativeTime(ts) {
    const now = Date.now();
    const diff = now - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
  function getTickerHistory(symbol) {
    if (!state.historyByTicker.has(symbol)) {
      return [];
    }
    return state.historyByTicker.get(symbol).slice(-MAX_HISTORY_PER_TICKER).reverse();
  }
  function toFiniteNumber(value) {
    try {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    } catch (_) {
      return 0;
    }
  }
  function normalizePatternKey(value) {
    if (typeof value !== 'string' || value.trim() === '') return null;
    const key = value.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const aliases = {
      head_and_shoulders: 'head_shoulders',
      inverse_head_and_shoulders: 'inv_head_shoulders',
      triangle_ascending: 'ascending_triangle',
      triangle_descending: 'descending_triangle',
      triangle_symmetric: 'symmetric_triangle',
      flag_bull: 'bull_flag',
      flag_bear: 'bear_flag',
      cup_and_handle: 'cup_handle',
      ml_detected: 'ml_detected'
    };
    return aliases[key] || key;
  }
  function normalizeGeometry(geometry) {
    const rawPoints = Array.isArray(geometry && geometry.points) ? geometry.points : [];
    const points = rawPoints.map(point => {
      const t = Number(point && point.t);
      const p = Number(point && point.p);
      return Number.isFinite(t) && Number.isFinite(p) ? {
        t,
        p
      } : null;
    }).filter(Boolean);
    if (points.length < 2) return null;
    return {
      points
    };
  }
  function renderGeometrySvg(geometry) {
    const normalized = normalizeGeometry(geometry);
    if (!normalized) return '';
    const points = normalized.points;
    const firstT = points[0].t;
    const lastT = points[points.length - 1].t;
    const minP = Math.min.apply(null, points.map(p => p.p));
    const maxP = Math.max.apply(null, points.map(p => p.p));
    const tRange = Math.max(1, lastT - firstT);
    const pRange = Math.max(0.000001, maxP - minP);
    const scale = point => {
      const x = 18 + (point.t - firstT) / tRange * 204;
      const y = 84 - (point.p - minP) / pRange * 68;
      return {
        x: Math.max(12, Math.min(228, x)),
        y: Math.max(10, Math.min(90, y))
      };
    };
    const path = points.map(scale).map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const first = scale(points[0]);
    const last = scale(points[points.length - 1]);
    return `<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" class="pc-pattern-svg">
            <defs>
                <linearGradient id="ml-geo-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--ml-color);stop-opacity:0.08"/>
                    <stop offset="100%" style="stop-color:var(--ml-color);stop-opacity:0"/>
                </linearGradient>
            </defs>
            <rect x="12" y="10" width="216" height="80" rx="3" fill="url(#ml-geo-bg)" stroke="rgba(255,215,0,0.12)" stroke-width="1"/>
            <line x1="${first.x.toFixed(1)}" y1="${first.y.toFixed(1)}" x2="${last.x.toFixed(1)}" y2="${last.y.toFixed(1)}" stroke="var(--ml-color)" stroke-width="1" stroke-dasharray="4,3" opacity="0.7"/>
            <polyline points="${path}" fill="none" stroke="var(--core-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            ${points.map(scale).map(point => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2" fill="var(--ml-color)" opacity="0.85"/>`).join('')}
        </svg>`;
  }
  function recordDetection(event) {
    if (!event || !event.pattern || !event.symbol) return;
    const pattern = event.pattern;
    const patternName = typeof pattern === 'string' ? pattern : pattern.name;
    if (typeof patternName !== 'string' || patternName.trim() === '') return;
    const patternKey = normalizePatternKey(patternName);
    if (!patternKey) return;
    const geometry = typeof pattern === 'object' ? normalizeGeometry(pattern.geometry) : null;
    if (!PATTERN_ART[patternKey] && !geometry) return;
    const confidence = typeof pattern === 'object' && pattern.confidence != null ? toFiniteNumber(pattern.confidence) : toFiniteNumber(event.confidence);

    // Normalize event
    const normalized = {
      ts: event.ts || event.timestamp || Date.now(),
      symbol: String(event.symbol).toUpperCase(),
      asset: String(event.asset || event.symbol).toUpperCase(),
      pattern: patternKey,
      confidence: Math.min(1, Math.max(0, confidence)),
      bias: event.bias || null,
      neckline: event.neckline,
      geometry,
      meta: event.meta
    };

    // Add to total history (FIFO cap)
    state.totalHistory.push(normalized);
    if (state.totalHistory.length > MAX_HISTORY_TOTAL) {
      state.totalHistory.shift();
    }

    // Add to per-ticker history
    if (!state.historyByTicker.has(normalized.symbol)) {
      state.historyByTicker.set(normalized.symbol, []);
    }
    const tickerHist = state.historyByTicker.get(normalized.symbol);
    tickerHist.push(normalized);
    if (tickerHist.length > MAX_HISTORY_PER_TICKER * 2) {
      tickerHist.shift();
    }

    // If this detection is for the current ticker, update the displayed pattern
    if (normalized.symbol === state.currentSymbol) {
      state.currentPattern = normalized;
    }
    render();
  }

  // ─── Style Injection ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                background: rgba(15, 15, 18, 0.55);
                backdrop-filter: blur(14px) saturate(160%);
                -webkit-backdrop-filter: blur(14px) saturate(160%);
                border: 1px solid rgba(255, 215, 0, 0.18);
                border-radius: 8px;
                padding: 12px;
                min-height: 180px;
                max-width: 280px;
                box-shadow: 0 6px 24px -8px rgba(255, 215, 0, 0.25), 0 1px 0 0 rgba(255, 215, 0, 0.08) inset;
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                color: var(--text-primary);
                transition: all 0.3s ease;
                user-select: none;
            }

            .pc-state-scanning { display: none; }
            .pc-state-detected { display: none; }
            #${ROOT_ID}.pc-scanning .pc-state-scanning { display: block; }
            #${ROOT_ID}.pc-detected .pc-state-detected { display: block; }

            .pc-scanning {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 8px;
                min-height: 120px;
            }

            .pc-scan-icon {
                width: 24px;
                height: 24px;
                border: 1px solid var(--ml-color);
                border-radius: 50%;
                position: relative;
                animation: pc-scan-pulse 2s ease-in-out infinite;
            }

            .pc-scan-icon::after {
                content: '';
                position: absolute;
                width: 9px;
                height: 1px;
                right: -6px;
                bottom: 1px;
                background: var(--ml-color);
                transform: rotate(45deg);
                transform-origin: left center;
            }

            @keyframes pc-scan-pulse {
                0%, 100% { opacity: 0.4; transform: scale(0.95); }
                50% { opacity: 1; transform: scale(1.1); }
            }

            .pc-scan-label {
                font-size: 10px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--text-secondary);
            }

            .pc-last-detected {
                font-size: 8px;
                color: var(--ml-color);
                margin-top: 4px;
                text-align: center;
            }

            .pc-detected-wrap {
                animation: pc-detected-flip 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            }

            @keyframes pc-detected-flip {
                0% { opacity: 0; transform: rotateY(90deg); }
                100% { opacity: 1; transform: rotateY(0deg); }
            }

            .pc-title {
                font-size: 14px;
                font-weight: 700;
                color: var(--ml-color);
                text-transform: uppercase;
                letter-spacing: 0.06em;
                margin-bottom: 8px;
            }

            .pc-art-container {
                width: 100%;
                height: 80px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(0, 204, 255, 0.1);
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 8px;
                overflow: hidden;
            }

            .pc-pattern-svg {
                width: 100%;
                height: 100%;
            }

            .pc-description {
                font-size: 9px;
                line-height: 1.4;
                color: var(--text-secondary);
                margin-bottom: 8px;
            }

            .pc-confidence-row {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 8px;
            }

            .pc-conf-label {
                font-size: 9px;
                color: var(--text-secondary);
                min-width: 50px;
            }

            .pc-conf-bar {
                flex: 1;
                height: 4px;
                background: rgba(255, 255, 255, 0.08);
                border-radius: 2px;
                overflow: hidden;
                position: relative;
            }

            .pc-conf-fill {
                height: 100%;
                background: var(--heat-gradient);
                transition: width 0.3s ease;
            }

            .pc-conf-val {
                font-size: 9px;
                font-family: 'Orbitron', sans-serif;
                font-weight: 700;
                color: var(--ml-color);
                min-width: 30px;
                text-align: right;
            }

            .pc-history-header {
                font-size: 8px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--text-secondary);
                margin-bottom: 4px;
                border-top: 1px solid rgba(255, 255, 255, 0.05);
                padding-top: 6px;
            }

            .pc-history-list {
                display: flex;
                flex-direction: column;
                gap: 3px;
            }

            .pc-hist-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 8px;
                padding: 3px 0;
            }

            .pc-hist-left {
                display: flex;
                gap: 6px;
                flex: 1;
            }

            .pc-hist-time {
                color: var(--text-secondary);
                min-width: 45px;
            }

            .pc-hist-pattern {
                color: var(--core-color);
                font-weight: 500;
            }

            .pc-hist-right {
                display: flex;
                gap: 4px;
                align-items: center;
            }

            .pc-hist-outcome {
                font-weight: 700;
                min-width: 20px;
                text-align: center;
            }

            .pc-hist-outcome.win {
                color: var(--profit-color);
            }

            .pc-hist-outcome.loss {
                color: var(--loss-color);
            }

            .pc-hist-outcome.flat {
                color: var(--text-secondary);
            }

            .pc-hist-outcome.open {
                color: var(--text-secondary);
            }

            /* High-confidence visual emphasis */
            #${ROOT_ID}.pc-high-confidence {
                box-shadow: 0 8px 40px -6px rgba(255, 215, 0, 0.45), 0 1px 0 0 rgba(255, 215, 0, 0.18) inset, 0 0 12px rgba(255, 215, 0, 0.3);
                border-color: rgba(255, 215, 0, 0.35);
            }

            #${ROOT_ID}.pc-high-confidence .pc-title {
                animation: pc-confidence-flash 0.6s ease-out;
            }

            @keyframes pc-confidence-flash {
                0% { color: #ffff00; text-shadow: 0 0 8px rgba(255, 255, 0, 0.8); }
                100% { color: var(--ml-color); text-shadow: none; }
            }
        `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── DOM Rendering ──────────────────────────────────────────────────
  function mount() {
    if (state.mounted) return true;
    const root = document.getElementById(ROOT_ID);
    if (!root) return false;
    root.innerHTML = '';
    state.mounted = true;
    return true;
  }
  function renderScanning() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const lastPat = state.totalHistory.length > 0 ? state.totalHistory[state.totalHistory.length - 1] : null;
    const lastAttr = lastPat ? `Last: ${PATTERN_DESCRIPTIONS[lastPat.pattern]?.title || lastPat.pattern} @ ${Math.round(lastPat.confidence * 100)}% (${lastPat.symbol}, ${formatRelativeTime(lastPat.ts)})` : '--';
    root.innerHTML = `
            <div class="pc-state-scanning">
                <div class="pc-scan-icon" aria-hidden="true"></div>
                <div class="pc-scan-label">Pattern engine scanning...</div>
                <div class="pc-last-detected">${lastAttr}</div>
            </div>
        `;
  }
  function renderDetected() {
    const root = document.getElementById(ROOT_ID);
    if (!root || !state.currentPattern) return;
    const p = state.currentPattern;
    const desc = PATTERN_DESCRIPTIONS[p.pattern] || {
      title: p.pattern,
      summary: 'Pattern detected.'
    };
    const confPct = Math.round(p.confidence * 100);
    const history = getTickerHistory(state.currentSymbol);
    let historyHTML = '';
    if (history.length > 0) {
      historyHTML = `
                <div class="pc-history-header">Recent on ${state.currentSymbol}</div>
                <div class="pc-history-list">
                    ${history.map(h => {
        const outcome = h.meta?.outcome || 'open';
        const pnl = h.meta?.pnl ? (h.meta.pnl >= 0 ? '+' : '') + h.meta.pnl.toFixed(2) : null;
        const outcomeText = outcome === 'open' ? 'OPEN' : outcome === 'win' ? 'W' : outcome === 'flat' ? 'F' : 'L';
        return `
                            <div class="pc-hist-item">
                                <div class="pc-hist-left">
                                    <span class="pc-hist-time">${formatRelativeTime(h.ts)}</span>
                                    <span class="pc-hist-pattern">${PATTERN_DESCRIPTIONS[h.pattern]?.title || h.pattern}</span>
                                </div>
                                <div class="pc-hist-right">
                                    <span class="pc-hist-outcome ${outcome}">${outcomeText}</span>
                                    ${pnl ? `<span style="color:${h.meta.pnl >= 0 ? 'var(--profit-color)' : 'var(--loss-color)'};font-size:8px;">${pnl}</span>` : ''}
                                </div>
                            </div>
                        `;
      }).join('')}
                </div>
            `;
    }
    const svg = PATTERN_ART[p.pattern] ? PATTERN_ART[p.pattern]() : renderGeometrySvg(p.geometry);
    root.innerHTML = `
            <div class="pc-detected-wrap">
                <div class="pc-title">${desc.title}</div>
                <div class="pc-art-container">${svg}</div>
                <div class="pc-description">${desc.summary}</div>
                <div class="pc-confidence-row">
                    <span class="pc-conf-label">Confidence</span>
                    <div class="pc-conf-bar">
                        <div class="pc-conf-fill" style="width: ${confPct}%;"></div>
                    </div>
                    <span class="pc-conf-val">${confPct}%</span>
                </div>
                ${historyHTML}
            </div>
        `;
  }
  function render() {
    if (!mount()) return;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    // Update state classes
    root.classList.remove('pc-scanning', 'pc-detected', 'pc-high-confidence');
    if (state.currentPattern) {
      root.classList.add('pc-detected');
      if (state.currentPattern.confidence > 0.7) {
        root.classList.add('pc-high-confidence');
      }
      renderDetected();
    } else {
      root.classList.add('pc-scanning');
      renderScanning();
    }
  }

  // ─── WS Handler ─────────────────────────────────────────────────────
  function onPatternAnalysis(data) {
    try {
      if (!data) return;
      recordDetection(data);
    } catch (_) {/* swallow */}
  }

  // ─── Event Bus Handler ──────────────────────────────────────────────
  function onWatchlistSelect(data) {
    try {
      if (!data || !data.symbol) return;
      state.currentSymbol = String(data.symbol).toUpperCase();
      const history = getTickerHistory(state.currentSymbol);
      state.currentPattern = history.length > 0 ? history[0] : null;
      render();
    } catch (_) {/* swallow */}
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const PatternCard = {
    /**
     * Initialize: mount to DOM, inject styles, subscribe to WS events and bus.
     */
    init() {
      try {
        injectStyles();
        if (!mount()) return;
        render();

        // Subscribe to pattern_analysis WS event
        const socket = OGZ.get && OGZ.get('Socket');
        if (socket && socket.registerHandler) {
          socket.registerHandler('pattern_analysis', onPatternAnalysis);
        }

        // Subscribe to watchlist selection event
        if (OGZ && OGZ.bus) {
          OGZ.bus.on('watchlist:select', onWatchlistSelect);
        }
      } catch (_) {/* swallow */}
    },
    /**
     * Set the currently displayed ticker symbol.
     * @param {string} symbol
     */
    setSymbol(symbol) {
      try {
        state.currentSymbol = String(symbol).toUpperCase();
        const history = getTickerHistory(state.currentSymbol);
        state.currentPattern = history.length > 0 ? history[0] : null;
        render();
      } catch (_) {/* swallow */}
    },
    /**
     * Get detection history for a symbol.
     * @param {string} symbol
     * @returns {PatternEvent[]}
     */
    getHistory(symbol) {
      try {
        return getTickerHistory(String(symbol).toUpperCase());
      } catch (_) {
        return [];
      }
    },
    /**
     * Clear history for a symbol.
     * @param {string} symbol
     */
    clearHistory(symbol) {
      try {
        const sym = String(symbol).toUpperCase();
        if (state.historyByTicker.has(sym)) {
          state.historyByTicker.delete(sym);
        }
        if (state.currentSymbol === sym) {
          state.currentPattern = null;
          render();
        }
      } catch (_) {/* swallow */}
    },
    /**
     * Teardown: remove DOM, listeners, styles.
     */
    teardown() {
      try {
        const root = document.getElementById(ROOT_ID);
        if (root) {
          root.innerHTML = '';
        }
        const style = document.getElementById(STYLE_ID);
        if (style) {
          style.remove();
        }
        if (OGZ && OGZ.bus) {
          OGZ.bus.off('watchlist:select', onWatchlistSelect);
        }
        state.mounted = false;
        state.currentPattern = null;
        state.historyByTicker.clear();
        state.totalHistory = [];
      } catch (_) {/* swallow */}
    },
    /**
     * Debug: return internal state snapshot.
     */
    _compute() {
      return {
        mounted: state.mounted,
        currentSymbol: state.currentSymbol,
        currentPattern: state.currentPattern,
        totalHistoryCount: state.totalHistory.length,
        tickersWithHistory: state.historyByTicker.size
      };
    }
  };

  // ─── Registration ───────────────────────────────────────────────────
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('PatternCard', PatternCard);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('PatternCard', PatternCard);
      }
    });
  }
  try {
    window.OGZPatternCard = PatternCard;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/pattern-card.js", error: String((e && e.message) || e) }); }

// public/js/panels/pattern-sparkline.js
try { (() => {
/**
 * pattern-sparkline.js - Pattern Analysis card sparkline + confidence pill.
 *
 * Adds two pieces inside the existing Pattern Analysis card without
 * modifying its existing children:
 *   1. A confidence pill that mirrors #confidence (the Performance Stats
 *      Confidence value already wired in core.js:191).
 *   2. An inline SVG sparkline showing the last N pattern-match
 *      confidence values, redrawing on every #confidence change.
 *
 * Source-of-truth contract: this panel READS from #confidence via
 * MutationObserver — same loose-coupling pattern as asset-tf-card.js.
 * core.js stays the only writer; this panel never sets confidence.
 *
 * Modular from day one (2026-04-25). Loaded via <script> tag at bottom
 * of unified-dashboard.html alongside the other panel JS files.
 */
(function () {
  'use strict';

  const BUFFER_SIZE = 32; /* number of historical points kept */
  const SVG_W = 200; /* viewBox width — independent of CSS width */
  const SVG_H = 28; /* viewBox height */
  const PAD_Y = 3; /* top/bottom padding inside the viewBox */

  const SELECTORS = {
    confSrc: '#confidence',
    /* canonical source written by core.js */
    mountHost: '#patternDisplay',
    /* parent we inject into */
    anchor: '#currentPatternName' /* sibling we inject AFTER */
  };
  let confEl = null;
  let svgEl = null;
  let pathLine = null;
  let pathFill = null;
  let emptyEl = null;
  const buf = [];
  function pct(text) {
    /* Parse "62%" → 62. Returns NaN on empty/non-numeric input. */
    if (!text) return NaN;
    const n = parseFloat(String(text).replace('%', '').trim());
    return Number.isFinite(n) ? n : NaN;
  }
  function tierClass(v) {
    /* Bucket the chip color by conviction band:
         0-39  low  (grey)
         40-69 mid  (amber — getting interesting)
         70+   high (brand red — high conviction) */
    if (!Number.isFinite(v)) return 'tier-low';
    if (v >= 70) return 'tier-high';
    if (v >= 40) return 'tier-mid';
    return 'tier-low';
  }
  function setConfChip(v) {
    if (!confEl) return;
    const txt = Number.isFinite(v) ? v.toFixed(0) + '%' : '--';
    if (confEl.textContent !== txt) confEl.textContent = txt;
    confEl.classList.remove('tier-low', 'tier-mid', 'tier-high');
    confEl.classList.add(tierClass(v));
  }
  function drawSpark() {
    if (!pathLine || !pathFill) return;
    if (buf.length < 2) {
      /* Empty state — show a hint, hide the path */
      if (emptyEl) emptyEl.style.display = '';
      pathLine.setAttribute('d', '');
      pathFill.setAttribute('d', '');
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    /* Map buffer index → x, value (0-100) → y. Confidence is bounded
       0-100 so we can use a fixed scale instead of a windowed min/max
       (which would otherwise lie about absolute conviction). */
    const stepX = SVG_W / (BUFFER_SIZE - 1);
    const points = buf.map((v, i) => {
      /* Use index from the END of the buffer so the most recent
         value is always at the right edge of the chart. */
      const idxFromRight = BUFFER_SIZE - 1 - (buf.length - 1 - i);
      const x = idxFromRight * stepX;
      const yNorm = Math.max(0, Math.min(100, v)) / 100;
      const y = SVG_H - PAD_Y - yNorm * (SVG_H - 2 * PAD_Y);
      return [x, y];
    });

    /* Build path d string */
    const linePath = points.map(([x, y], i) => i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`).join(' ');
    pathLine.setAttribute('d', linePath);

    /* Fill area: same line but closed back to baseline */
    const firstX = points[0][0];
    const lastX = points[points.length - 1][0];
    const fillPath = `${linePath} L ${lastX} ${SVG_H} L ${firstX} ${SVG_H} Z`;
    pathFill.setAttribute('d', fillPath);
  }
  function pushValue(v) {
    if (!Number.isFinite(v)) return;
    buf.push(v);
    if (buf.length > BUFFER_SIZE) buf.shift();
    drawSpark();
  }
  function onConfChange() {
    const src = document.querySelector(SELECTORS.confSrc);
    if (!src) return;
    const v = pct(src.textContent);
    setConfChip(v);
    pushValue(v);
  }
  function buildDom() {
    const host = document.querySelector(SELECTORS.mountHost);
    const anchor = document.querySelector(SELECTORS.anchor);
    if (!host || !anchor) return false;
    if (host.querySelector('.pattern-sparkline-row')) return true; /* already mounted */

    const row = document.createElement('div');
    row.className = 'pattern-sparkline-row';
    confEl = document.createElement('span');
    confEl.className = 'pattern-sparkline-conf tier-low';
    confEl.textContent = '--';
    confEl.setAttribute('title', 'Pattern confidence (mirrors Performance Stats)');

    /* SVG built with raw setAttribute calls — required for SVG
       element creation in HTML namespace. */
    const SVG_NS = 'http://www.w3.org/2000/svg';
    svgEl = document.createElementNS(SVG_NS, 'svg');
    svgEl.setAttribute('class', 'pattern-sparkline-svg');
    svgEl.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);
    svgEl.setAttribute('preserveAspectRatio', 'none');
    svgEl.setAttribute('aria-hidden', 'true');

    /* Gradient defs for the fill area — referenced via url(#patternSparkGradient) */
    const defs = document.createElementNS(SVG_NS, 'defs');
    const grad = document.createElementNS(SVG_NS, 'linearGradient');
    grad.setAttribute('id', 'patternSparkGradient');
    grad.setAttribute('x1', '0');
    grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0');
    grad.setAttribute('y2', '1');
    const stop1 = document.createElementNS(SVG_NS, 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#ef4444');
    stop1.setAttribute('stop-opacity', '0.55');
    const stop2 = document.createElementNS(SVG_NS, 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#ef4444');
    stop2.setAttribute('stop-opacity', '0');
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);
    svgEl.appendChild(defs);
    pathFill = document.createElementNS(SVG_NS, 'path');
    pathFill.setAttribute('class', 'pl-fill');
    svgEl.appendChild(pathFill);
    pathLine = document.createElementNS(SVG_NS, 'path');
    pathLine.setAttribute('class', 'pl-line');
    svgEl.appendChild(pathLine);
    emptyEl = document.createElementNS(SVG_NS, 'text');
    emptyEl.setAttribute('class', 'pl-empty');
    emptyEl.setAttribute('x', String(SVG_W / 2));
    emptyEl.setAttribute('y', String(SVG_H / 2 + 3));
    emptyEl.textContent = 'WAITING FOR PATTERN...';
    svgEl.appendChild(emptyEl);
    row.appendChild(confEl);
    row.appendChild(svgEl);

    /* Insert AFTER the existing pattern-name element */
    if (anchor.nextSibling) {
      host.insertBefore(row, anchor.nextSibling);
    } else {
      host.appendChild(row);
    }
    return true;
  }
  function init() {
    if (!buildDom()) return;

    /* Initial sync from current value */
    onConfChange();

    /* Watch the #confidence text for changes — same MutationObserver
       pattern asset-tf-card.js uses for #currentPrice. */
    const src = document.querySelector(SELECTORS.confSrc);
    if (src && typeof MutationObserver === 'function') {
      const mo = new MutationObserver(onConfChange);
      mo.observe(src, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/pattern-sparkline.js", error: String((e && e.message) || e) }); }

// public/js/panels/rail-resize.js
try { (() => {
/**
 * rail-resize.js — Draggable rail width control.
 *
 * Drives the --left-rail-width and --right-rail-width CSS vars defined in
 * unified-dashboard.html. The .edge-panel and .trading-panel rails consume
 * those vars, as does .main-container's padding. Dragging a handle resizes
 * the corresponding rail; the chart fills the freed space.
 *
 * Persistence: widths saved to localStorage, restored on next load.
 * Bounds: 200-600px per rail (clamped to keep the chart from collapsing
 * AND to prevent the rail from eating the whole viewport on tiny screens).
 *
 * Triggers a chart resize after each drag-stop so lightweight-charts
 * redraws to the new container width.
 *
 * Modular from day one (2026-04-28). Loaded via <script> tag in
 * unified-dashboard.html alongside the other panel JS files.
 */
(function () {
  'use strict';

  const MIN_PX = 200;
  const MAX_PX = 600;
  const LS_LEFT_KEY = 'ogz.rail.left.width';
  const LS_RIGHT_KEY = 'ogz.rail.right.width';
  function clamp(v) {
    return Math.max(MIN_PX, Math.min(MAX_PX, v));
  }
  function applyWidth(side, px) {
    const clamped = clamp(px);
    const cssVar = side === 'left' ? '--left-rail-width' : '--right-rail-width';
    const lsKey = side === 'left' ? LS_LEFT_KEY : LS_RIGHT_KEY;
    document.documentElement.style.setProperty(cssVar, clamped + 'px');
    try {
      localStorage.setItem(lsKey, String(clamped));
    } catch (_) {/* private mode */}
  }
  function restoreFromStorage() {
    try {
      const l = parseInt(localStorage.getItem(LS_LEFT_KEY) || '', 10);
      const r = parseInt(localStorage.getItem(LS_RIGHT_KEY) || '', 10);
      if (Number.isFinite(l) && l > 0) applyWidth('left', l);
      if (Number.isFinite(r) && r > 0) applyWidth('right', r);
    } catch (_) {/* swallow */}
  }
  function fireChartResize() {
    // lightweight-charts: chart.resize(w, h)
    try {
      if (window.tvChart && typeof window.tvChart.resize === 'function') {
        const c = document.getElementById('tvChartContainer');
        if (c) window.tvChart.resize(c.clientWidth, c.clientHeight);
      }
    } catch (_) {/* swallow */}
    // Also fire window resize so any other panels listening update too.
    window.dispatchEvent(new Event('resize'));
  }
  function bindHandle(side, handleEl) {
    if (!handleEl) return;
    let dragging = false;
    let rafPending = false;
    let pendingX = 0;
    function onMouseDown(e) {
      // Only primary button (left click on PC, single-tap on Mac trackpad)
      if (e.button !== 0) return;
      dragging = true;
      handleEl.classList.add('dragging');
      document.body.classList.add('rail-dragging');
      e.preventDefault();
    }
    function onMouseMove(e) {
      if (!dragging) return;
      pendingX = e.clientX;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        // For LEFT rail: width = mouseX - panel's left offset (~10px gutter)
        // For RIGHT rail: width = viewport - mouseX - 10px gutter
        const px = side === 'left' ? pendingX - 10 : window.innerWidth - pendingX - 10;
        applyWidth(side, px);
      });
    }
    function onMouseUp() {
      if (!dragging) return;
      dragging = false;
      handleEl.classList.remove('dragging');
      document.body.classList.remove('rail-dragging');
      // Trigger chart resize once on drag-stop (debounced — no resize spam during drag)
      fireChartResize();
    }
    handleEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Double-click to reset to default 320px
    handleEl.addEventListener('dblclick', () => {
      applyWidth(side, 320);
      fireChartResize();
    });
  }
  function init() {
    restoreFromStorage();
    bindHandle('left', document.getElementById('leftRailResize'));
    bindHandle('right', document.getElementById('rightRailResize'));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/rail-resize.js", error: String((e && e.message) || e) }); }

// public/js/panels/risk-gauge.js
try { (() => {
/**
 * risk-gauge.js - Daily Risk Budget Gauge (Phase E)
 *
 * Compact radial SVG ring showing what percentage of the daily loss-limit
 * budget has been consumed.
 *
 *   < 50% used  -> state-ok     (green)
 *   50-80%      -> state-watch  (amber)
 *   >= 80%      -> state-danger (red, pulsing)
 *
 * Session start equity, peak, date, and loss-limit % persist in
 * localStorage. Session resets at the next UTC midnight boundary.
 *
 * Data sources (priority):
 *   1. price.data.equity      - authoritative account value (CandleProcessor per-tick)
 *   2. balance_update.equity - explicit equity heartbeat
 *   3. state_update.state.equity - equity fallback
 *   trade.pnl is not used to derive equity; the gauge waits for authoritative
 *   account equity instead of reconstructing it from events.
 *
 * Self-injects its own scoped CSS; self-registers as OGZ.RiskGauge.
 * Also exposes window.OGZRiskGauge for debug console access.
 *
 * Mount priority: #botStatusRow -> .bot-status-row -> .header
 *
 * @module public/js/panels/risk-gauge
 */
(function (OGZ) {
  'use strict';

  const STYLE_ID = 'ogz-risk-gauge-styles';
  const ROOT_ID = 'riskGauge';

  // ─── Storage keys ──────────────────────────────────────────────────
  const LS_KEY_START = 'ogz.risk.sessionStartEquity';
  const LS_KEY_DATE = 'ogz.risk.sessionDate';
  const LS_KEY_PEAK = 'ogz.risk.sessionPeakEquity';
  const LS_KEY_LIMIT = 'ogz.riskLimit.pct';

  // Ring geometry (compact, 56×56)
  const SVG_SIZE = 56;
  const RING_RADIUS = 23;
  const RING_CIRC = 2 * Math.PI * RING_RADIUS;

  // ─── State ─────────────────────────────────────────────────────────
  const state = {
    mounted: false,
    currentEquity: null,
    sessionStart: null,
    // equity at session open
    sessionPeak: null,
    // highest equity seen this session
    sessionDate: null,
    // UTC yyyy-mm-dd
    lossLimitPct: 0.05 // 5% default
  };

  // ─── localStorage helpers ──────────────────────────────────────────
  function lsGet(k) {
    try {
      return localStorage.getItem(k);
    } catch (_) {
      return null;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(k, String(v));
    } catch (_) {/* quota / disabled */}
  }

  // ─── Session handling ──────────────────────────────────────────────
  // ET-aligned session day — trading happens on NYSE hours, so session
  // rollover MUST NOT fire at UTC midnight (which is 8 PM ET during EDT /
  // 7 PM ET during EST, right in the middle of after-hours trading).
  // A trade at 23:30 ET (03:30 UTC next day) would otherwise zero the
  // session mid-position. Intl.DateTimeFormat handles the EDT/EST
  // transition automatically via the America/New_York tz.
  const _etDateFormatter = typeof Intl !== 'undefined' && Intl.DateTimeFormat ? new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }) : null;
  function todayET() {
    if (_etDateFormatter) return _etDateFormatter.format(new Date());
    // Fallback for environments without Intl (very old browsers / Node
    // without ICU): approximate ET as UTC-5. Slightly off during EDT
    // but still beats UTC midnight rollover.
    const d = new Date(Date.now() - 5 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  function loadSession() {
    const savedDate = lsGet(LS_KEY_DATE);
    const today = todayET();
    if (savedDate !== today) {
      // Rollover — wipe session.
      state.sessionStart = null;
      state.sessionPeak = null;
      state.sessionDate = today;
      lsSet(LS_KEY_DATE, today);
      return;
    }
    const start = parseFloat(lsGet(LS_KEY_START));
    const peak = parseFloat(lsGet(LS_KEY_PEAK));
    if (isFinite(start)) state.sessionStart = start;
    if (isFinite(peak)) state.sessionPeak = peak;
    state.sessionDate = savedDate;
  }
  function initSessionStart(equity) {
    if (state.sessionStart != null) return;
    if (!isFinite(equity) || equity <= 0) return;
    state.sessionStart = equity;
    state.sessionPeak = equity;
    lsSet(LS_KEY_START, equity);
    lsSet(LS_KEY_PEAK, equity);
  }
  function loadLimit() {
    const raw = parseFloat(lsGet(LS_KEY_LIMIT));
    if (isFinite(raw) && raw > 0 && raw < 1) state.lossLimitPct = raw;
  }

  // ─── Compute metrics ───────────────────────────────────────────────
  function compute() {
    const equity = state.currentEquity;
    const start = state.sessionStart;
    if (!isFinite(equity) || !isFinite(start) || start <= 0) {
      return {
        ready: false,
        pnl: 0,
        pnlPct: 0,
        usedPct: 0,
        lossLimit: 0,
        drawdownFromPeak: 0,
        peak: null,
        start: start,
        equity
      };
    }
    const pnl = equity - start;
    const pnlPct = pnl / start * 100;
    const lossLimit = start * state.lossLimitPct; // dollar loss budget
    // Used % = how deep in the red we are relative to the budget.
    // Only losses consume budget; gains leave it at 0.
    let usedPct = 0;
    if (pnl < 0 && lossLimit > 0) {
      usedPct = Math.min(100, Math.abs(pnl) / lossLimit * 100);
    }
    const peak = state.sessionPeak != null ? state.sessionPeak : start;
    const drawdownFromPeak = peak > 0 ? (peak - equity) / peak * 100 : 0;
    return {
      ready: true,
      pnl,
      pnlPct,
      usedPct,
      lossLimit,
      drawdownFromPeak: Math.max(0, drawdownFromPeak),
      peak,
      start,
      equity
    };
  }

  // ─── Style injection ───────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                position: relative;
                display: inline-flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 2px;
                padding: 4px 6px;
                min-width: 64px;
                user-select: none;
                cursor: default;
            }
            #${ROOT_ID} .rg-ring-wrap {
                position: relative;
                width: ${SVG_SIZE}px;
                height: ${SVG_SIZE}px;
            }
            #${ROOT_ID} .rg-ring-track {
                stroke: rgba(255,255,255,0.06);
                fill: none;
                stroke-width: 4;
            }
            #${ROOT_ID} .rg-ring-fill {
                fill: none;
                stroke-width: 4;
                stroke-linecap: round;
                transform: rotate(-90deg);
                transform-origin: 50% 50%;
                transition: stroke-dashoffset 0.4s cubic-bezier(0.22,0.61,0.36,1),
                            stroke 0.3s ease;
                stroke-dasharray: ${RING_CIRC.toFixed(3)};
                stroke-dashoffset: ${RING_CIRC.toFixed(3)};
            }
            #${ROOT_ID}.state-ok .rg-ring-fill { stroke: #22c55e; }
            #${ROOT_ID}.state-watch .rg-ring-fill { stroke: #fbbf24; }
            #${ROOT_ID}.state-danger .rg-ring-fill {
                stroke: #ef4444;
                animation: rg-pulse 1.3s ease-in-out infinite;
            }
            @keyframes rg-pulse {
                0%, 100% { opacity: 1; filter: drop-shadow(0 0 2px rgba(239,68,68,0.6)); }
                50%      { opacity: 0.55; filter: drop-shadow(0 0 8px rgba(239,68,68,0.9)); }
            }
            #${ROOT_ID} .rg-pct {
                position: absolute;
                inset: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                pointer-events: none;
            }
            #${ROOT_ID} .rg-pct-num {
                font-family: 'Orbitron', 'JetBrains Mono', monospace;
                font-size: 14px;
                font-weight: 700;
                letter-spacing: 0.02em;
                color: #f5f5f5;
                line-height: 1;
            }
            #${ROOT_ID} .rg-pct-sub {
                font-family: 'JetBrains Mono', monospace;
                font-size: 7px;
                letter-spacing: 0.14em;
                color: #a1a1aa;
                text-transform: uppercase;
                margin-top: 1px;
            }
            #${ROOT_ID} .rg-label {
                font-family: 'JetBrains Mono', monospace;
                font-size: 8px;
                letter-spacing: 0.16em;
                color: #71717a;
                text-transform: uppercase;
            }
            #${ROOT_ID} .rg-tooltip {
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%) translateY(6px);
                min-width: 200px;
                padding: 8px 10px;
                background: rgba(15,15,15,0.92);
                backdrop-filter: blur(12px) saturate(140%);
                -webkit-backdrop-filter: blur(12px) saturate(140%);
                border: 1px solid rgba(220, 38, 38, 0.22);
                border-radius: 6px;
                box-shadow: 0 8px 32px -8px rgba(0,0,0,0.6);
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                color: #e4e4e7;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.18s ease;
                z-index: 80;
                white-space: nowrap;
            }
            #${ROOT_ID}:hover .rg-tooltip { opacity: 1; }
            #${ROOT_ID} .rg-tooltip .rg-row {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                padding: 2px 0;
            }
            #${ROOT_ID} .rg-tooltip .rg-row span:first-child {
                color: #a1a1aa;
            }
            #${ROOT_ID} .rg-tooltip .rg-row .rg-pos { color: #22c55e; }
            #${ROOT_ID} .rg-tooltip .rg-row .rg-neg { color: #ef4444; }
        `;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ─── Mount ─────────────────────────────────────────────────────────
  function findMountHost() {
    return document.getElementById('botStatusRow') || document.querySelector('.bot-status-row') || document.querySelector('.header') || null;
  }
  function mount() {
    if (state.mounted) return true;
    if (document.getElementById(ROOT_ID)) {
      state.mounted = true;
      return true;
    }
    // Prefer a semantic host; if none exist (page still loading, DOM
    // stripped, test harness, etc.) fall back to a fixed-position
    // element on document.body so the gauge is always visible rather
    // than silently failing to mount. Per spec §5 mount priority.
    let host = findMountHost();
    let usedFallback = false;
    if (!host) {
      if (!document.body) return false; // DOM not ready yet
      host = document.body;
      usedFallback = true;
    }
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'state-ok';
    if (usedFallback) {
      // Fixed top-right positioning so the gauge doesn't compete
      // with other content for layout space when mounted outside
      // the intended status-row host.
      root.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999;';
    }
    root.innerHTML = `
            <div class="rg-ring-wrap">
                <svg viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" width="${SVG_SIZE}" height="${SVG_SIZE}" aria-hidden="true">
                    <circle class="rg-ring-track" cx="${SVG_SIZE / 2}" cy="${SVG_SIZE / 2}" r="${RING_RADIUS}"></circle>
                    <circle class="rg-ring-fill" cx="${SVG_SIZE / 2}" cy="${SVG_SIZE / 2}" r="${RING_RADIUS}"></circle>
                </svg>
                <div class="rg-pct">
                    <span class="rg-pct-num">0%</span>
                    <span class="rg-pct-sub">SAFE</span>
                </div>
            </div>
            <span class="rg-label">Risk Budget</span>
            <div class="rg-tooltip" role="tooltip"></div>
        `;
    host.appendChild(root);
    state.mounted = true;
    render();
    return true;
  }

  // ─── Render ────────────────────────────────────────────────────────
  function classifyState(usedPct) {
    if (usedPct >= 80) return 'state-danger';
    if (usedPct >= 50) return 'state-watch';
    return 'state-ok';
  }
  function fmtUsd(v) {
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    return `${sign}$${Math.abs(v).toFixed(2)}`;
  }
  function fmtPctSigned(v) {
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    return `${sign}${Math.abs(v).toFixed(2)}%`;
  }
  function render() {
    if (!mount()) return;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const m = compute();
    const pctNum = root.querySelector('.rg-pct-num');
    const pctSub = root.querySelector('.rg-pct-sub');
    const ringFill = root.querySelector('.rg-ring-fill');
    const tooltip = root.querySelector('.rg-tooltip');

    // Ring fill: stroke-dashoffset based on usedPct (0 used → full circle empty;
    // 100% used → full circle filled).
    const used = Math.max(0, Math.min(100, m.ready ? m.usedPct : 0));
    if (ringFill) {
      const offset = RING_CIRC * (1 - used / 100);
      ringFill.setAttribute('stroke-dashoffset', offset.toFixed(3));
    }
    // When the gauge hasn't received authoritative equity data yet,
    // show "—" / "WAIT" instead of the default "0% SAFE" — that was
    // indistinguishable from a working gauge with no drawdown, so
    // a broken pipeline looked identical to a healthy "no losses today."
    // Empty-state signaling needs to be unambiguous.
    if (pctNum) pctNum.textContent = m.ready ? `${Math.round(used)}%` : '—';
    if (pctSub) {
      if (!m.ready) {
        pctSub.textContent = 'WAIT';
      } else {
        pctSub.textContent = used >= 80 ? 'DANGER' : used >= 50 ? 'WATCH' : used > 0 ? 'USED' : 'SAFE';
      }
    }

    // State class swap
    root.classList.remove('state-ok', 'state-watch', 'state-danger');
    root.classList.add(classifyState(used));

    // Tooltip
    if (tooltip) {
      if (!m.ready) {
        tooltip.innerHTML = `<div class="rg-row"><span>Status</span><span>awaiting balance…</span></div>`;
      } else {
        const pnlClass = m.pnl >= 0 ? 'rg-pos' : 'rg-neg';
        tooltip.innerHTML = `
                    <div class="rg-row"><span>P&L</span><span class="${pnlClass}">${fmtUsd(m.pnl)} (${fmtPctSigned(m.pnlPct)})</span></div>
                    <div class="rg-row"><span>Loss Limit</span><span>$${m.lossLimit.toFixed(2)} (${(state.lossLimitPct * 100).toFixed(1)}%)</span></div>
                    <div class="rg-row"><span>Budget Used</span><span>${used.toFixed(1)}%</span></div>
                    <div class="rg-row"><span>Drawdown (peak)</span><span>${m.drawdownFromPeak.toFixed(2)}%</span></div>
                    <div class="rg-row"><span>Session Start</span><span>$${m.start.toFixed(2)}</span></div>
                `;
      }
    }
  }

  // ─── Balance update paths ──────────────────────────────────────────
  function updateEquity(equity) {
    if (!isFinite(equity) || equity <= 0) return;
    // Session rollover check on every update
    if (todayET() !== state.sessionDate) loadSession();
    initSessionStart(equity);
    state.currentEquity = equity;
    if (state.sessionPeak == null || equity > state.sessionPeak) {
      state.sessionPeak = equity;
      lsSet(LS_KEY_PEAK, equity);
    }
    render();
  }
  function onPriceEquity(equity) {
    updateEquity(equity);
  }

  // ─── Public API ────────────────────────────────────────────────────
  const RiskGauge = {
    init() {
      try {
        injectStyles();
        loadLimit();
        loadSession();
        mount();
        const socket = OGZ.get && OGZ.get('Socket');
        if (!socket || !socket.registerHandler) return;

        // 1. price - authoritative per-tick equity
        socket.registerHandler('price', d => {
          try {
            const data = d && d.data;
            const eq = data && data.equity;
            if (isFinite(eq) && eq > 0) onPriceEquity(Number(eq));
          } catch (_) {/* swallow */}
        });

        // 2. balance_update - explicit equity push
        socket.registerHandler('balance_update', d => {
          try {
            const eq = d && (d.equity != null ? d.equity : d.data && d.data.equity);
            if (isFinite(eq) && eq > 0) {
              // Not the price stream path - do not flip the flag.
              updateEquity(Number(eq));
            }
          } catch (_) {/* swallow */}
        });

        // 3. state_update - fallback
        socket.registerHandler('state_update', d => {
          try {
            const eq = d && (d.equity != null ? d.equity : d.state && d.state.equity);
            if (isFinite(eq) && eq > 0) updateEquity(Number(eq));
          } catch (_) {/* swallow */}
        });
      } catch (_) {/* init must never throw */}
    },
    setLimit(pct) {
      if (!isFinite(pct) || pct <= 0 || pct >= 1) return;
      state.lossLimitPct = pct;
      lsSet(LS_KEY_LIMIT, pct);
      render();
    },
    resetSession() {
      state.sessionStart = null;
      state.sessionPeak = null;
      // DeepSearch fix 2026-04-27: was `todayUTC()` which doesn't
      // exist in this module — the helper is `todayET()` (defined
      // at L77). Calls to resetSession() previously threw
      // ReferenceError silently inside the OGZ.RiskGauge.resetSession
      // public method, which broke the daily session-rollover path.
      state.sessionDate = todayET();
      try {
        localStorage.removeItem(LS_KEY_START);
        localStorage.removeItem(LS_KEY_PEAK);
      } catch (_) {/* swallow */}
      if (isFinite(state.currentEquity) && state.currentEquity > 0) {
        initSessionStart(state.currentEquity);
      }
      render();
    },
    // Debug surface
    _state: state,
    _compute: compute
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('RiskGauge', RiskGauge);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('RiskGauge', RiskGauge);
      }
    });
  }

  // Debug console access per spec
  try {
    window.OGZRiskGauge = RiskGauge;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/risk-gauge.js", error: String((e && e.message) || e) }); }

// public/js/panels/session-phase.js
try { (() => {
/**
 * session-phase.js — US Equity Session Phase Indicator (Phase F)
 *
 * Inline pill in the header strip. Shows current market phase for US stocks
 * (PRE / RTH / AH / CLOSED) using DST-aware America/New_York time via
 * Intl.DateTimeFormat. Recognises NYSE holidays + early-close days (hardcoded
 * for 2026 and 2027). When the active asset is crypto (detected via -USD
 * suffix on #assetSelector), shows "24/7" amber.
 *
 * Tooltip shows the next transition (e.g. "RTH opens 09:30 ET").
 *
 * Self-injects CSS; self-registers as OGZ.SessionPhase.
 *
 * @module public/js/panels/session-phase
 */
(function (OGZ) {
  'use strict';

  const STYLE_ID = 'ogz-session-phase-styles';
  const ROOT_ID = 'sessionPhase';

  // Source of truth: foundation/MarketCalendar.js (server-side, dynamic).
  // This frontend copy is hardcoded for offline rendering; if updating
  // holidays, update BOTH files (or wire to /api/trai/session-context).
  // NYSE full-day closures 2026-2027
  const HOLIDAYS = new Set(['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24']);

  // Early-close days (RTH closes at 13:00 ET instead of 16:00)
  const EARLY_CLOSE = new Set(['2026-11-27', '2026-12-24', '2027-11-26', '2027-12-23']);
  const state = {
    mounted: false,
    timerId: null
  };

  // ─── Style injection ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 3px 10px;
                background: rgba(0,0,0,0.35);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 999px;
                user-select: none;
                margin-left: 8px;
            }
            #${ROOT_ID} .sp-dot {
                display: inline-block;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #71717a;
                box-shadow: 0 0 6px rgba(255,255,255,0.2);
            }
            #${ROOT_ID} .sp-label {
                font-family: 'Orbitron', 'JetBrains Mono', monospace;
                font-weight: 700;
                font-size: 10px;
                letter-spacing: 0.08em;
                color: #e4e4e7;
            }
            #${ROOT_ID} .sp-clock {
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                color: #a1a1aa;
                letter-spacing: 0.04em;
            }
        `;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ─── NY time extraction ────────────────────────────────────────────
  // Returns {y,m,d,h,min,s,weekday} in America/New_York.
  const NY_FMT = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false
  });
  function nyParts() {
    const parts = NY_FMT.formatToParts(new Date());
    const get = t => {
      const p = parts.find(x => x.type === t);
      return p ? p.value : '';
    };
    let h = parseInt(get('hour'), 10);
    if (h === 24) h = 0; // some impls emit 24 for midnight
    return {
      y: get('year'),
      m: get('month'),
      d: get('day'),
      h,
      min: parseInt(get('minute'), 10),
      s: parseInt(get('second'), 10),
      weekday: get('weekday') // Mon, Tue, ...
    };
  }
  function dateKey(p) {
    return `${p.y}-${p.m}-${p.d}`;
  }
  function isWeekend(p) {
    return p.weekday === 'Sat' || p.weekday === 'Sun';
  }
  function minutesET(p) {
    return p.h * 60 + p.min;
  }

  // ─── Asset detection ───────────────────────────────────────────────
  function isCryptoActive() {
    const sel = document.getElementById('assetSelector');
    if (!sel) return false;
    const v = String(sel.value || '').toUpperCase();
    return /-USD$/.test(v) || /USD$/.test(v) && /^(BTC|ETH|SOL|XBT|LTC|DOGE|ADA|XRP|DOT|AVAX)/.test(v);
  }

  // ─── Phase logic ───────────────────────────────────────────────────
  function computePhase() {
    if (isCryptoActive()) {
      return {
        label: '24/7',
        dot: '#f59e0b',
        clock: '',
        tooltip: 'Crypto market — always open'
      };
    }
    const p = nyParts();
    const key = dateKey(p);
    const et = `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')} ET`;

    // Weekend or holiday → CLOSED
    if (isWeekend(p) || HOLIDAYS.has(key)) {
      return {
        label: 'CLOSED',
        dot: '#71717a',
        clock: et,
        tooltip: isWeekend(p) ? 'Weekend — opens Mon 09:30 ET' : 'NYSE holiday'
      };
    }
    const mins = minutesET(p);
    const PRE_OPEN = 4 * 60; // 04:00
    const RTH_OPEN = 9 * 60 + 30; // 09:30
    const early = EARLY_CLOSE.has(key);
    const RTH_CLOSE = early ? 13 * 60 : 16 * 60;
    const AH_CLOSE = 20 * 60; // 20:00

    if (mins < PRE_OPEN) {
      return {
        label: 'CLOSED',
        dot: '#71717a',
        clock: et,
        tooltip: 'Pre-market opens 04:00 ET'
      };
    }
    if (mins < RTH_OPEN) {
      return {
        label: 'PRE',
        dot: '#60a5fa',
        clock: et,
        tooltip: 'RTH opens 09:30 ET'
      };
    }
    if (mins < RTH_CLOSE) {
      const closeH = Math.floor(RTH_CLOSE / 60);
      const closeM = RTH_CLOSE % 60;
      const closeStr = `${String(closeH).padStart(2, '0')}:${String(closeM).padStart(2, '0')} ET`;
      return {
        label: 'RTH',
        dot: '#22c55e',
        clock: et,
        tooltip: early ? `Early close ${closeStr}` : `Closes ${closeStr}`
      };
    }
    if (mins < AH_CLOSE) {
      return {
        label: 'AH',
        dot: '#f59e0b',
        clock: et,
        tooltip: 'After-hours closes 20:00 ET'
      };
    }
    return {
      label: 'CLOSED',
      dot: '#71717a',
      clock: et,
      tooltip: 'Pre-market opens 04:00 ET'
    };
  }

  // ─── Mount + render ────────────────────────────────────────────────
  function findHost() {
    const container = document.querySelector('.tier-selector-container');
    return container || document.querySelector('.header') || document.body;
  }
  function mount() {
    if (state.mounted) return true;
    if (document.getElementById(ROOT_ID)) {
      state.mounted = true;
      return true;
    }
    const host = findHost();
    if (!host) return false;
    const span = document.createElement('span');
    span.id = ROOT_ID;
    span.innerHTML = `
            <span class="sp-dot"></span>
            <span class="sp-label">—</span>
            <span class="sp-clock"></span>
        `;
    // Prefer to sit after botStatusRow (Phase E mount) if it exists
    const botRow = document.getElementById('botStatusRow');
    if (botRow && botRow.parentNode === host && botRow.nextSibling) {
      host.insertBefore(span, botRow.nextSibling);
    } else if (botRow && botRow.parentNode === host) {
      host.appendChild(span);
    } else {
      host.appendChild(span);
    }
    state.mounted = true;
    return true;
  }
  function render() {
    if (!mount()) return;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const info = computePhase();
    const dot = root.querySelector('.sp-dot');
    const label = root.querySelector('.sp-label');
    const clock = root.querySelector('.sp-clock');
    if (dot) {
      dot.style.background = info.dot;
      dot.style.boxShadow = `0 0 8px ${info.dot}80`;
    }
    if (label) label.textContent = info.label;
    if (clock) clock.textContent = info.clock;
    if (info.tooltip) root.title = info.tooltip;
  }

  // ─── Public API ────────────────────────────────────────────────────
  const SessionPhase = {
    init() {
      try {
        injectStyles();
        mount();
        render();
        if (state.timerId) clearInterval(state.timerId);
        state.timerId = setInterval(render, 1000);
        const assetSel = document.getElementById('assetSelector');
        if (assetSel) {
          assetSel.addEventListener('change', () => {
            try {
              render();
            } catch (_) {/* swallow */}
          });
        }
      } catch (_) {/* init must never throw */}
    },
    _compute: computePhase
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('SessionPhase', SessionPhase);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('SessionPhase', SessionPhase);
      }
    });
  }
  try {
    window.OGZSessionPhase = SessionPhase;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/session-phase.js", error: String((e && e.message) || e) }); }

// public/js/panels/size-preview.js
try { (() => {
/**
 * size-preview.js — Hypothetical Position Size Preview (Phase F)
 *
 * Right-rail panel showing what the bot WOULD deploy if it acted now:
 * shares, notional, 1R loss, SL distance, plus a stance pill reflecting
 * current confidence. Pure preview — live bot uses its own DynamicPositionSizer.
 *
 * Formula (visible in footer):
 *   risk      = equity × 1%
 *   SL dist   = max(ATR × 1.5, price × 0.3%)
 *   rawShares = risk / SL dist
 *   shares    = rawShares × stanceMult
 *   cap       = equity × 50%
 *
 * Self-injects CSS; self-registers as OGZ.SizePreview.
 *
 * @module public/js/panels/size-preview
 */
(function (OGZ) {
  'use strict';

  const STYLE_ID = 'ogz-size-preview-styles';
  const ROOT_ID = 'sizePreview';
  const RISK_PCT = 0.01; // 1% risk per trade
  const ATR_MULT = 1.5; // SL distance multiplier on ATR
  const MIN_SL_PCT = 0.003; // 0.3% minimum SL distance as % of price
  const EQUITY_CAP_PCT = 0.5; // 50% equity cap on notional

  // Stance buckets (ordered low → high)
  const STANCES = [{
    max: 0.45,
    label: 'Low',
    mult: 0.5,
    color: '#60a5fa'
  }, {
    max: 0.65,
    label: 'Standard',
    mult: 1.0,
    color: '#22c55e'
  }, {
    max: 0.80,
    label: 'Aggressive',
    mult: 1.4,
    color: '#eab308'
  }, {
    max: Infinity,
    label: 'Max Allocation',
    mult: 1.8,
    color: '#ef4444'
  }];
  const state = {
    mounted: false,
    equity: null,
    price: null,
    atr: null,
    confidence: null // 0-1
  };
  function stanceFor(conf) {
    if (!isFinite(conf)) return STANCES[1]; // Standard
    for (const s of STANCES) if (conf < s.max) return s;
    return STANCES[STANCES.length - 1];
  }

  // ─── Style injection ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                background: rgba(15, 15, 15, 0.72);
                backdrop-filter: blur(10px) saturate(140%);
                -webkit-backdrop-filter: blur(10px) saturate(140%);
                border: 1px solid rgba(220, 38, 38, 0.14);
                border-radius: 8px;
                padding: 10px 12px;
                margin-bottom: 10px;
                user-select: none;
            }
            #${ROOT_ID} .sp-head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 9px;
                color: #a1a1aa;
                letter-spacing: 0.12em;
                text-transform: uppercase;
            }
            #${ROOT_ID} .sp-stance {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 2px 8px;
                border-radius: 999px;
                font-family: 'Orbitron', 'JetBrains Mono', monospace;
                font-size: 10px;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.08);
            }
            #${ROOT_ID} .sp-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin-bottom: 8px;
            }
            #${ROOT_ID} .sp-cell {
                padding: 6px 8px;
                background: rgba(255,255,255,0.02);
                border: 1px solid rgba(255,255,255,0.04);
                border-radius: 5px;
            }
            #${ROOT_ID} .sp-cell-k {
                font-family: 'JetBrains Mono', monospace;
                font-size: 9px;
                color: #71717a;
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }
            #${ROOT_ID} .sp-cell-v {
                font-family: 'Orbitron', 'JetBrains Mono', monospace;
                font-size: 14px;
                font-weight: 700;
                color: #f5f5f5;
                margin-top: 2px;
            }
            #${ROOT_ID} .sp-stance-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: 8px;
                background: rgba(255,255,255,0.02);
                border: 1px solid rgba(255,255,255,0.04);
                border-radius: 5px;
                margin-bottom: 6px;
            }
            #${ROOT_ID} .sp-conf-bar {
                flex: 1 1 auto;
                height: 4px;
                border-radius: 3px;
                background: rgba(255,255,255,0.06);
                position: relative;
                overflow: hidden;
            }
            #${ROOT_ID} .sp-conf-fill {
                position: absolute;
                inset: 0 auto 0 0;
                background: linear-gradient(90deg, rgba(220,38,38,0.3), rgba(220,38,38,0.8));
                transition: width 0.3s ease;
                width: 0%;
            }
            #${ROOT_ID} .sp-foot {
                font-family: 'JetBrains Mono', monospace;
                font-size: 9px;
                color: #52525b;
                line-height: 1.4;
                letter-spacing: 0.04em;
            }
        `;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ─── Compute + render ──────────────────────────────────────────────
  function compute() {
    const {
      equity,
      price,
      atr,
      confidence
    } = state;
    if (!isFinite(equity) || equity <= 0 || !isFinite(price) || price <= 0) {
      return {
        ready: false
      };
    }
    const risk = equity * RISK_PCT;
    const slPct = price * MIN_SL_PCT;
    const slAtr = isFinite(atr) && atr > 0 ? atr * ATR_MULT : 0;
    const slDist = Math.max(slAtr, slPct);
    const rawShares = slDist > 0 ? risk / slDist : 0;
    const s = stanceFor(confidence != null ? confidence : 0.5);
    const rawNotional = rawShares * s.mult * price;
    const cap = equity * EQUITY_CAP_PCT;
    const notional = Math.min(rawNotional, cap);
    const shares = price > 0 ? notional / price : 0;
    const oneR = shares * slDist; // max dollar loss if SL hits
    return {
      ready: true,
      shares,
      notional,
      oneR,
      slDist,
      slPct: price > 0 ? slDist / price * 100 : 0,
      stance: s,
      confidence: confidence != null ? confidence : 0.5,
      capped: rawNotional > cap
    };
  }
  function fmtNum(v, d = 2) {
    if (!isFinite(v)) return '—';
    return Number(v).toFixed(d);
  }
  function mount() {
    if (state.mounted) return true;
    const root = document.getElementById(ROOT_ID);
    if (!root) return false; // Expect HTML mount node to exist (added in Phase F HTML change)
    state.mounted = true;
    return true;
  }
  function render() {
    if (!mount()) return;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const m = compute();
    const stance = m.ready ? m.stance : {
      label: '—',
      color: '#71717a',
      mult: 1.0
    };
    const confPct = m.ready ? Math.round(m.confidence * 100) : 0;
    const shares = m.ready ? fmtNum(m.shares, 2) : '—';
    const notional = m.ready ? `$${fmtNum(m.notional, 2)}${m.capped ? ' •' : ''}` : '—';
    const oneR = m.ready ? `-$${fmtNum(m.oneR, 2)}` : '—';
    const slDistLine = m.ready ? `$${fmtNum(m.slDist, 2)} (${fmtNum(m.slPct, 2)}%)` : '—';
    root.innerHTML = `
            <div class="sp-head">
                <span>Size Preview</span>
                <span class="sp-stance" style="color:${stance.color};border-color:${stance.color}60;">
                    ${stance.label} · ×${stance.mult.toFixed(1)}
                </span>
            </div>
            <div class="sp-grid">
                <div class="sp-cell"><div class="sp-cell-k">Shares</div><div class="sp-cell-v">${shares}</div></div>
                <div class="sp-cell"><div class="sp-cell-k">Position $</div><div class="sp-cell-v">${notional}</div></div>
                <div class="sp-cell"><div class="sp-cell-k">Max Loss</div><div class="sp-cell-v" style="color:#ef4444">${oneR}</div></div>
                <div class="sp-cell"><div class="sp-cell-k">Stop Distance</div><div class="sp-cell-v">${slDistLine}</div></div>
            </div>
            <div class="sp-stance-row">
                <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.08em;">Confidence</span>
                <div class="sp-conf-bar"><div class="sp-conf-fill" style="width:${confPct}%;"></div></div>
                <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#e4e4e7;min-width:32px;text-align:right;">${confPct}%</span>
            </div>
            <div class="sp-foot">
                Preview · 1R risk · ATR-scaled stop · cap 50% equity
            </div>
        `;
  }

  // ─── Data handlers ─────────────────────────────────────────────────
  function onPrice(d) {
    try {
      const data = d && d.data;
      if (!data) return;
      const eq = data.equity;
      if (isFinite(eq) && eq > 0) state.equity = Number(eq);
      const p = data.price != null ? data.price : data.close != null ? data.close : data.candle && data.candle.close;
      if (isFinite(p) && p > 0) state.price = Number(p);
      if (data.indicators && isFinite(data.indicators.atr) && data.indicators.atr > 0) {
        state.atr = Number(data.indicators.atr);
      }
      render();
    } catch (_) {/* swallow */}
  }
  function onConfidence(c) {
    const v = Number(c);
    if (!isFinite(v)) return;
    // Accept 0-1 or 0-100 scales
    state.confidence = v > 1 ? Math.min(1, v / 100) : Math.min(1, v);
    render();
  }

  // ─── Public API ────────────────────────────────────────────────────
  const SizePreview = {
    init() {
      try {
        injectStyles();
        mount();
        render();
        const socket = OGZ.get && OGZ.get('Socket');
        if (!socket || !socket.registerHandler) return;
        socket.registerHandler('price', onPrice);
        socket.registerHandler('signal_analysis', d => {
          try {
            if (d && d.signal && d.signal.confidence != null) onConfidence(d.signal.confidence);
          } catch (_) {/* swallow */}
        });
        socket.registerHandler('bot_thinking', d => {
          try {
            if (d && d.confidence != null) onConfidence(d.confidence);
          } catch (_) {/* swallow */}
        });
        socket.registerHandler('balance_update', d => {
          try {
            const eq = d && (d.equity != null ? d.equity : d.data && d.data.equity);
            if (isFinite(eq) && eq > 0) {
              state.equity = Number(eq);
              render();
            }
          } catch (_) {/* swallow */}
        });
        socket.registerHandler('state_update', d => {
          try {
            const eq = d && (d.equity != null ? d.equity : d.state && d.state.equity);
            if (isFinite(eq) && eq > 0) {
              state.equity = Number(eq);
              render();
            }
          } catch (_) {/* swallow */}
        });
      } catch (_) {/* swallow */}
    },
    _compute: compute
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('SizePreview', SizePreview);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('SizePreview', SizePreview);
      }
    });
  }
  try {
    window.OGZSizePreview = SizePreview;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/size-preview.js", error: String((e && e.message) || e) }); }

// public/js/panels/spoofing-detector.js
try { (() => {
/**
 * spoofing-detector.js - Whale Wall Pulling Detection
 * Detects when $2M+ walls are pulled within 0.1% proximity of price.
 *
 * PARKED: This file exists on disk but is NOT loaded in the script block.
 * Zero handlers registered in core.js. Awaits spoof_alert backend emitter.
 * When ready: add <script src="/js/panels/spoofing-detector.js"></script>
 * and register handler in core.js: socket.registerHandler('spoof_alert', ...)
 */
'use strict';

const SpoofingDetector = {
  previousWalls: {
    bids: new Map(),
    asks: new Map()
  },
  SPOOF_THRESHOLD_USD: 2000000,
  PROXIMITY_THRESHOLD: 0.001,
  detectSpoofs: function (currentBook, currentPrice) {
    const spoofs = [];
    const checkSide = (currentLevels, side) => {
      const currentMap = new Map(currentLevels.map(l => [parseFloat(l[0]), parseFloat(l[1]) * parseFloat(l[0])]));
      const prevMap = side === 'BID' ? this.previousWalls.bids : this.previousWalls.asks;
      prevMap.forEach((prevValue, price) => {
        const currentValue = currentMap.get(price) || 0;
        const valueDropped = prevValue - currentValue;
        if (valueDropped >= this.SPOOF_THRESHOLD_USD) {
          const proximity = Math.abs((price - currentPrice) / currentPrice);
          if (proximity <= this.PROXIMITY_THRESHOLD) {
            spoofs.push({
              price: price,
              valuePulled: valueDropped,
              side: side,
              type: side === 'BID' ? 'FAKE_SUPPORT' : 'FAKE_RESISTANCE',
              timestamp: Date.now()
            });
          }
        }
      });
      if (side === 'BID') this.previousWalls.bids = currentMap;else this.previousWalls.asks = currentMap;
    };
    checkSide(currentBook.bids, 'BID');
    checkSide(currentBook.asks, 'ASK');
    return spoofs.length > 0 ? {
      type: 'spoof_alert',
      alerts: spoofs
    } : null;
  }
};
if (typeof module !== 'undefined') module.exports = SpoofingDetector;
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/spoofing-detector.js", error: String((e && e.message) || e) }); }

// public/js/panels/strategy-leaderboard.js
try { (() => {
/**
 * strategy-leaderboard.js — Session Strategy Leaderboard (Phase F)
 *
 * Right-rail panel: per-strategy P&L for the current session, sorted by
 * |totalPnL| descending. Each row shows pretty name, colored total P&L,
 * proportional bar, trades count, and win rate.
 *
 * KNOWN GAP: core/OrderExecutor.js broadcasts `trade` events WITHOUT
 * strategy/exitStrategy fields on close. Until that's fixed, all closes
 * collapse to "Unattributed". When all rows are unknown, we surface an
 * inline amber hint explaining the attribution gap.
 *
 * Self-injects CSS; self-registers as OGZ.StrategyLeaderboard.
 *
 * @module public/js/panels/strategy-leaderboard
 */
(function (OGZ) {
  'use strict';

  const STYLE_ID = 'ogz-strategy-leaderboard-styles';
  const ROOT_ID = 'strategyLeaderboard';
  const MAX_ROWS = 6;
  // Cap the strategy-name map so a malformed/rotating strategy stream
  // (e.g., 10k trades across 100s of distinct names due to a backend
  // bug) can't grow the Map unbounded. 256 is generous for a real
  // bot which rarely has more than a dozen distinct strategies per
  // session. LRU eviction drops the least-recently-updated strategy
  // when the cap is hit.
  const MAX_STRATEGIES = 256;
  const state = {
    mounted: false,
    // Map<strategyName, { pnl, trades, wins }>
    book: new Map()
  };

  // ─── Helpers ───────────────────────────────────────────────────────
  // XSS defense: strategy names come from trade events over WebSocket.
  // All render paths go through root.innerHTML, so ANY name that reaches
  // the DOM must be HTML-escaped. escapeHtml maps the five dangerous
  // characters to their entity equivalents.
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function prettyName(raw) {
    if (!raw || raw === 'unknown') return 'Unattributed';
    // Split on camelCase / snake_case boundaries
    const s = String(raw).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return s.replace(/\b\w/g, c => c.toUpperCase());
  }
  function attributionOf(trade) {
    if (!trade) return 'unknown';
    return trade.exitStrategy || trade.strategy || trade.entryStrategy || trade.winnerStrategy || 'unknown';
  }

  // ─── Style injection ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                background: rgba(15, 15, 15, 0.72);
                backdrop-filter: blur(10px) saturate(140%);
                -webkit-backdrop-filter: blur(10px) saturate(140%);
                border: 1px solid rgba(220, 38, 38, 0.14);
                border-radius: 8px;
                padding: 10px 12px;
                margin-bottom: 10px;
                user-select: none;
            }
            #${ROOT_ID} .sl-head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 9px;
                color: #a1a1aa;
                letter-spacing: 0.12em;
                text-transform: uppercase;
            }
            #${ROOT_ID} .sl-reset {
                background: none;
                border: 1px solid rgba(255,255,255,0.12);
                color: #a1a1aa;
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                padding: 2px 8px;
                border-radius: 999px;
                cursor: pointer;
                transition: background 0.18s, border-color 0.18s;
            }
            #${ROOT_ID} .sl-reset:hover {
                background: rgba(220,38,38,0.12);
                border-color: rgba(220,38,38,0.35);
                color: #fca5a5;
            }
            #${ROOT_ID} .sl-row {
                padding: 6px 0;
                border-bottom: 1px solid rgba(255,255,255,0.04);
            }
            #${ROOT_ID} .sl-row:last-child { border-bottom: none; }
            #${ROOT_ID} .sl-row-top {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                margin-bottom: 4px;
            }
            #${ROOT_ID} .sl-name {
                font-size: 12px;
                font-weight: 700;
                color: #f5f5f5;
            }
            #${ROOT_ID} .sl-pnl {
                font-family: 'JetBrains Mono', monospace;
                font-size: 13px;
                font-weight: 600;
            }
            #${ROOT_ID} .sl-pnl.pos { color: #22c55e; }
            #${ROOT_ID} .sl-pnl.neg { color: #ef4444; }
            #${ROOT_ID} .sl-bar {
                height: 3px;
                background: rgba(255,255,255,0.05);
                border-radius: 2px;
                overflow: hidden;
                margin-bottom: 3px;
            }
            #${ROOT_ID} .sl-bar-fill {
                height: 100%;
                transition: width 0.3s ease;
            }
            #${ROOT_ID} .sl-bar-fill.pos { background: #22c55e; }
            #${ROOT_ID} .sl-bar-fill.neg { background: #ef4444; }
            #${ROOT_ID} .sl-meta {
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                color: #71717a;
                text-align: right;
            }
            #${ROOT_ID} .sl-empty {
                text-align: center;
                font-size: 11px;
                color: #52525b;
                padding: 10px 0;
                font-style: italic;
            }
            /* #54 leaderboard-polish: session aggregate strip sits between
               the title row and the per-strategy rows so even at zero
               attribution the operator sees session total P&L + WR. */
            #${ROOT_ID} .sl-agg {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                padding: 4px 0 6px;
                margin-bottom: 4px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            }
            #${ROOT_ID} .sl-agg-pnl {
                font-family: 'Orbitron', monospace;
                font-size: 16px;
                font-weight: 700;
                color: #d4d4d8;
                letter-spacing: 0.04em;
            }
            #${ROOT_ID} .sl-agg-pnl.pos { color: #22c55e; }
            #${ROOT_ID} .sl-agg-pnl.neg { color: #ef4444; }
            #${ROOT_ID} .sl-agg-meta {
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                color: #71717a;
                letter-spacing: 0.04em;
            }
            #${ROOT_ID} .sl-hint {
                margin-top: 8px;
                padding: 7px 9px;
                background: rgba(245, 158, 11, 0.08);
                border: 1px solid rgba(245, 158, 11, 0.24);
                border-radius: 5px;
                font-size: 10px;
                color: #fcd34d;
                line-height: 1.4;
                font-family: 'JetBrains Mono', monospace;
                letter-spacing: 0.02em;
            }
        `;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ─── Mount + render ────────────────────────────────────────────────
  function mount() {
    if (state.mounted) return true;
    const root = document.getElementById(ROOT_ID);
    if (!root) return false;
    state.mounted = true;
    return true;
  }
  function fmtUsd(v) {
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    return `${sign}$${Math.abs(v).toFixed(2)}`;
  }
  function render() {
    if (!mount()) return;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const rows = [...state.book.entries()].map(([name, d]) => ({
      name,
      pretty: prettyName(name),
      pnl: d.pnl,
      trades: d.trades,
      wr: d.trades > 0 ? d.wins / d.trades * 100 : 0
    })).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, MAX_ROWS);
    const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.pnl)), 0) || 1;
    const allUnknown = rows.length > 0 && rows.every(r => r.name === 'unknown');

    // #54 leaderboard-polish: surface a session aggregate above the row
    // list so the panel reads as informative even at zero trades. Sum
    // P&L + total trade count across whatever the book currently holds.
    const aggPnl = [...state.book.values()].reduce((s, d) => s + d.pnl, 0);
    const aggTrades = [...state.book.values()].reduce((s, d) => s + d.trades, 0);
    const aggWins = [...state.book.values()].reduce((s, d) => s + d.wins, 0);
    const aggWr = aggTrades > 0 ? aggWins / aggTrades * 100 : 0;
    const aggPnlCls = aggPnl > 0 ? 'pos' : aggPnl < 0 ? 'neg' : '';
    let html = `
            <div class="sl-head">
                <span>Strategy Leaderboard · Session</span>
                <button class="sl-reset" data-role="reset" title="Reset session">⟲ reset</button>
            </div>
            <div class="sl-agg">
                <span class="sl-agg-pnl ${aggPnlCls}">${fmtUsd(aggPnl)}</span>
                <span class="sl-agg-meta">${aggTrades} trades · ${aggWr.toFixed(0)}% WR</span>
            </div>
        `;
    if (rows.length === 0) {
      html += `<div class="sl-empty">Bot is scanning. Per-strategy attribution fills as trades close.</div>`;
    } else {
      html += rows.map(r => {
        const pnlClass = r.pnl >= 0 ? 'pos' : 'neg';
        const barPct = Math.min(100, Math.abs(r.pnl) / maxAbs * 100);
        // r.pretty is derived from WebSocket trade.strategy — HTML-escape
        // before interpolating into innerHTML. fmtUsd / r.wr / r.trades
        // are numeric-formatted so they're structurally safe.
        return `
                    <div class="sl-row">
                        <div class="sl-row-top">
                            <span class="sl-name">${escapeHtml(r.pretty)}</span>
                            <span class="sl-pnl ${pnlClass}">${fmtUsd(r.pnl)}</span>
                        </div>
                        <div class="sl-bar"><div class="sl-bar-fill ${pnlClass}" style="width:${barPct}%;"></div></div>
                        <div class="sl-meta">${r.trades} trades · ${r.wr.toFixed(0)}% WR</div>
                    </div>
                `;
      }).join('');
    }
    if (allUnknown) {
      html += `
                <div class="sl-hint">Awaiting strategy attribution&hellip;</div>
            `;
    }
    root.innerHTML = html;
    const resetBtn = root.querySelector('[data-role="reset"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        try {
          Leaderboard.reset();
        } catch (_) {/* swallow */}
      });
    }
  }

  // ─── Recording ─────────────────────────────────────────────────────
  function record(trade) {
    try {
      if (!trade) return;
      const pnl = Number(trade.pnl);
      if (!isFinite(pnl) || pnl === 0) return; // Skip opens / zero-pnl broadcasts
      const key = attributionOf(trade);
      const existing = state.book.has(key);
      const cur = state.book.get(key) || {
        pnl: 0,
        trades: 0,
        wins: 0
      };
      cur.pnl += pnl;
      cur.trades += 1;
      if (pnl > 0) cur.wins += 1;
      // Cap + LRU eviction: if this is a NEW strategy and we're at
      // the cap, drop the least-recently-updated entry to make room.
      // state.book is a Map so insertion/update order is preserved;
      // delete-then-set moves the updated entry to the tail (tail =
      // most recent = LRU survival).
      if (!existing && state.book.size >= MAX_STRATEGIES) {
        const oldestKey = state.book.keys().next().value;
        if (oldestKey != null) state.book.delete(oldestKey);
      }
      // Delete-then-set for existing entries so they move to the
      // tail (LRU refresh on write).
      if (existing) state.book.delete(key);
      state.book.set(key, cur);
      render();
    } catch (_) {/* swallow */}
  }

  // ─── Public API ────────────────────────────────────────────────────
  const Leaderboard = {
    init() {
      try {
        injectStyles();
        mount();
        render();
        const socket = OGZ.get && OGZ.get('Socket');
        if (!socket || !socket.registerHandler) return;
        socket.registerHandler('trade', d => {
          try {
            if (!d) return;
            // Some feeds wrap payload in .data
            const t = d.pnl != null ? d : d.data || d;
            record(t);
          } catch (_) {/* swallow */}
        });
      } catch (_) {/* swallow */}
    },
    record,
    reset() {
      state.book.clear();
      render();
    },
    _book: state.book
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('StrategyLeaderboard', Leaderboard);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('StrategyLeaderboard', Leaderboard);
      }
    });
  }
  try {
    window.OGZStrategyLeaderboard = Leaderboard;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/strategy-leaderboard.js", error: String((e && e.message) || e) }); }

// public/js/panels/system-health.js
try { (() => {
/**
 * system-health.js — SystemHealth: Operator Health Strip
 *
 * Footer-right operator health visibility panel. Displays at-a-glance status for:
 * SessionRouter state (CRYPTO / STOCKS / FAULTED), broker WebSocket connections
 * (Kraken / Alpaca individual status), error count, session uptime, last unplanned
 * crash timestamp, Risk Posture guardrail state, and git commit hash.
 *
 * Renders as a compact horizontal strip with segments separated by " | ":
 *   SESSIONROUTER: CRYPTO ✓ | KRAKEN ✓ | ALPACA ✗ | LAST ERR: 3 | UPTIME: 2h 14m |
 *   LAST CRASH: 47 days ago | RISK POSTURE: ALL GUARDRAILS ARMED ✓ | COMMIT: a07516a
 *
 * Self-registers as OGZ.SystemHealth via OGZ.register().
 * Mounts into <div id="systemHealth"></div>.
 *
 * Data sources:
 *   - HTTP fetch /api/health (every 30s) — uptime, status, timestamp, broker
 *     WS counts, memory. Backend MAY return optional: commit, lastCrash,
 *     errorCount fields.
 *   - WS events (real bot shapes verified against StateManager / TradingLoop /
 *     CandleProcessor):
 *     * state_update — { state:{ recoveryMode, position, balance, ... } }.
 *       Used as the heartbeat for "router is alive" + risk posture (recoveryMode
 *       flips RISK POSTURE to DEGRADED).
 *     * price        — heartbeat for the broker feed of the active symbol.
 *       Bot is single-pair → broker derived from symbol prefix.
 *     * bot_thinking — heartbeat for the trading loop being alive.
 *
 * AWAITING BACKEND EMITTERS (rendered as muted '?' with explicit 'AWAITING'
 * tooltip rather than silent fail or fake green):
 *     * error_event   — currently no top-level emitter; bot logs to console only
 *     * broker_status — currently no per-broker WS status broadcast
 *
 *   - OGZ.bus event risk:update — for risk posture state (armed / degraded)
 *
 * Public API:
 *   init() — Mount to DOM, inject styles, start health fetch loop
 *   setHealthEndpoint(url) — Configure /api/health URL (default '/api/health')
 *   refresh() — Manually fetch /api/health now
 *   addError(msg) — Manually increment error counter + store message
 *   clearErrors() — Reset error count to 0
 *   setBroker(name, ok) — Update broker WS status (name: 'kraken'|'alpaca', ok: boolean)
 *   setRouterState(state) — Set SessionRouter state (CRYPTO / STOCKS / FAULTED)
 *   setRiskPosture(state) — Set risk posture (armed / degraded / etc)
 *   teardown() — Remove DOM, listeners, timers, injected styles
 *   _compute() — Debug helper: return current state snapshot
 *
 * NO synthetic data. NO demo fallback. If /api/health does not respond,
 * the panel renders honest placeholders ('--' / '?' / 'OFFLINE'). We
 * never fabricate green-state values.
 *
 * @typedef {Object} HealthSnapshot
 * @property {number} timestamp - Unix epoch milliseconds
 * @property {string} state - SessionRouter state (e.g., 'CRYPTO')
 * @property {number} uptime - Session uptime in seconds
 * @property {number} websockets - Count of active WebSocket connections
 * @property {Object} memory - {heapUsed: number, heapTotal: number}
 * @property {string} [commit] - Git commit hash (optional, backend gap)
 * @property {number} [lastCrash] - Unix timestamp of last unplanned crash (optional)
 * @property {number} [errorCount] - Error count in current session (optional)
 *
 * @module public/js/panels/system-health
 */
(function (OGZ) {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────
  const STYLE_ID = 'ogz-system-health-styles';
  const ROOT_ID = 'systemHealth';
  const HEALTH_FETCH_INTERVAL_MS = 30000; // 30 seconds
  const UPTIME_TICK_MS = 1000; // 1 second
  const DEFAULT_HEALTH_URL = '/api/health';

  // ─── Private State ──────────────────────────────────────────────────
  const state = {
    mounted: false,
    healthEndpoint: DEFAULT_HEALTH_URL,
    lastHealth: null,
    brokers: new Map(),
    // Map<name, ok>
    routerState: 'OFFLINE',
    riskPosture: 'UNKNOWN',
    errors: [],
    uptimeStart: Date.now(),
    healthFetchTimer: null,
    uptimeTickTimer: null,
    // Heartbeat tracking (derived broker/router status from real events)
    lastStateUpdateAt: 0,
    lastPriceAt: 0,
    lastBotThinkingAt: 0,
    currentSymbol: null,
    // resolved from chart selector
    recoveryMode: false,
    // mirrored from state_update.state.recoveryMode

    // Backend-emitter availability flags. Flip true once first such event
    // is seen — until then we render '?' with AWAITING tooltip rather
    // than synthesizing a green ✓.
    haveErrorEmitter: false,
    haveBrokerEmitter: false
  };

  // Heartbeat freshness window: an event is "fresh" if it fired in the
  // last 30 seconds. Used to decide ✓/✗/? state for derived indicators.
  const HEARTBEAT_FRESH_MS = 30000;

  // ─── CSS Injection ───────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                background: var(--glass-bg, rgba(15, 15, 18, 0.55));
                border: 1px solid var(--glass-border, rgba(255, 215, 0, 0.18));
                border-radius: 6px;
                padding: 8px 12px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                color: var(--text-primary, #ffffff);
                overflow-x: auto;
                overflow-y: hidden;
                white-space: nowrap;
                letter-spacing: 0.5px;
                display: flex;
                align-items: center;
                gap: 0;
                height: 32px;
                min-height: 32px;
                flex-shrink: 0;
            }

            .sh-segment {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px 8px;
                background: rgba(255, 255, 255, 0.02);
                border-radius: 3px;
                border: 1px solid rgba(255, 255, 255, 0.04);
                flex-shrink: 0;
            }

            .sh-segment:hover {
                background: rgba(255, 255, 255, 0.04);
                border-color: rgba(255, 255, 255, 0.08);
            }

            .sh-separator {
                color: rgba(255, 255, 255, 0.2);
                margin: 0 2px;
                flex-shrink: 0;
            }

            .sh-label {
                color: var(--text-secondary, #a0a0a0);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.6px;
                font-size: 8px;
            }

            .sh-value {
                color: var(--text-primary, #ffffff);
                font-weight: 500;
                letter-spacing: 0.3px;
            }

            .sh-indicator {
                display: inline-block;
                font-size: 9px;
                font-weight: 700;
            }

            .sh-indicator.ok {
                color: var(--profit-color, #00ff88);
            }

            .sh-indicator.fail {
                color: var(--loss-color, #ff3366);
            }

            .sh-indicator.warn {
                color: var(--ml-color, #ffd700);
            }

            .sh-indicator.muted {
                color: var(--neutral-color, #8b8b8b);
            }

            .sh-error-count.alert {
                color: var(--loss-color, #ff3366);
                font-weight: 700;
            }

            .sh-error-count.ok {
                color: var(--profit-color, #00ff88);
            }

            .sh-uptime {
                font-variant-numeric: tabular-nums;
            }

            .sh-crash-time {
                color: var(--ml-color, #ffd700);
                font-weight: 600;
            }

            .sh-crash-time.never {
                color: var(--ml-color, #ffd700);
            }

            .sh-crash-time.ago {
                color: var(--text-primary, #ffffff);
            }

            .sh-posture {
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .sh-posture.armed {
                color: var(--ml-color, #ffd700);
                animation: sh-armed-pulse 1.5s ease-in-out infinite;
            }

            .sh-posture.degraded {
                color: var(--loss-color, #ff3366);
            }

            @keyframes sh-armed-pulse {
                0%, 100% {
                    opacity: 0.8;
                    text-shadow: none;
                }
                50% {
                    opacity: 1;
                    text-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
                }
            }

            .sh-commit {
                font-family: 'Courier New', monospace;
                color: var(--text-secondary, #a0a0a0);
                font-weight: 500;
            }

            .sh-commit.unknown {
                color: var(--neutral-color, #8b8b8b);
                font-style: italic;
            }

            @media (max-width: 1200px) {
                #${ROOT_ID} {
                    font-size: 9px;
                    padding: 6px 10px;
                    height: 28px;
                    flex-wrap: wrap;
                }
                .sh-segment {
                    padding: 2px 6px;
                    font-size: 9px;
                }
            }

            /* Tooltip on hover */
            .sh-segment[title] {
                cursor: help;
            }
        `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Format Helpers ─────────────────────────────────────────────────
  function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  function formatCrashTime(timestamp) {
    if (!timestamp || timestamp === 0) {
      return 'NEVER';
    }
    const now = Date.now();
    const diffMs = now - timestamp;
    const days = Math.floor(diffMs / 86400000);
    const hours = Math.floor(diffMs % 86400000 / 3600000);
    const minutes = Math.floor(diffMs % 3600000 / 60000);
    if (days > 0) {
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ago`;
    } else {
      return `${minutes}m ago`;
    }
  }

  // ─── DOM Rendering ──────────────────────────────────────────────────
  function render() {
    if (!state.mounted) return;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.innerHTML = '';

    // Segment 1: SessionRouter state
    const routerSegment = document.createElement('div');
    routerSegment.className = 'sh-segment';
    const routerLabel = document.createElement('span');
    routerLabel.className = 'sh-label';
    routerLabel.textContent = 'SESSIONROUTER:';
    const routerState = document.createElement('span');
    routerState.className = 'sh-value';
    const routerOk = state.routerState && state.routerState !== 'OFFLINE' && state.routerState !== 'FAULTED';
    const routerIndicator = document.createElement('span');
    routerIndicator.className = `sh-indicator ${routerOk ? 'ok' : state.routerState === 'FAULTED' ? 'fail' : 'muted'}`;
    routerIndicator.textContent = routerOk || state.routerState === 'FAULTED' ? routerOk ? '✓' : '✗' : '?';
    routerState.appendChild(document.createTextNode(state.routerState + ' '));
    routerState.appendChild(routerIndicator);
    routerSegment.appendChild(routerLabel);
    routerSegment.appendChild(routerState);
    root.appendChild(routerSegment);

    // Separator
    const sep1 = document.createElement('span');
    sep1.className = 'sh-separator';
    sep1.textContent = '|';
    root.appendChild(sep1);

    // Segment 2 & 3: Kraken / Alpaca broker WS status. Render '?' for
    // unknown, '✓' for true, '✗' for explicit false. Heartbeat-derived
    // status only updates the active broker; the inactive one stays
    // unknown until the dedicated broker_status emitter ships.
    const renderBroker = (key, label) => {
      const v = state.brokers.get(key);
      const known = v === true || v === false;
      const seg = document.createElement('div');
      seg.className = 'sh-segment';
      const tipBase = key.charAt(0).toUpperCase() + key.slice(1);
      seg.title = !known ? `${tipBase}: AWAITING broker_status emitter (price-feed heartbeat used as proxy when symbol matches)` : v ? `${tipBase} feed fresh in last 30s` : `${tipBase} feed stale (>30s since price tick)`;
      const lab = document.createElement('span');
      lab.className = 'sh-label';
      lab.textContent = label;
      const ind = document.createElement('span');
      ind.className = `sh-indicator ${!known ? 'muted' : v ? 'ok' : 'fail'}`;
      ind.textContent = !known ? '?' : v ? '✓' : '✗';
      seg.appendChild(lab);
      seg.appendChild(ind);
      root.appendChild(seg);
    };
    renderBroker('kraken', 'KRAKEN:');

    // Separator
    const sep2 = document.createElement('span');
    sep2.className = 'sh-separator';
    sep2.textContent = '|';
    root.appendChild(sep2);
    renderBroker('alpaca', 'ALPACA:');

    // Separator
    const sep3 = document.createElement('span');
    sep3.className = 'sh-separator';
    sep3.textContent = '|';
    root.appendChild(sep3);

    // Segment 4: Error count. When the backend error_event emitter hasn't
    // shipped, the count is honestly '?' with an AWAITING tooltip — never
    // a fake green 0. Once we observe the first error_event, we count for real.
    const errCount = state.errors.length;
    const errSegment = document.createElement('div');
    errSegment.className = 'sh-segment';
    const errLabel = document.createElement('span');
    errLabel.className = 'sh-label';
    errLabel.textContent = 'LAST ERR:';
    const errValue = document.createElement('span');
    if (!state.haveErrorEmitter && errCount === 0) {
      errSegment.title = 'AWAITING error_event emitter (no top-level error broadcast yet)';
      errValue.className = 'sh-error-count';
      errValue.style.color = 'var(--neutral-color, #8b8b8b)';
      errValue.textContent = '?';
    } else {
      if (errCount > 0) {
        errSegment.title = `Last error: ${state.errors[state.errors.length - 1]}`;
      }
      errValue.className = `sh-error-count ${errCount > 0 ? 'alert' : 'ok'}`;
      errValue.textContent = String(errCount);
    }
    errSegment.appendChild(errLabel);
    errSegment.appendChild(errValue);
    root.appendChild(errSegment);

    // Separator
    const sep4 = document.createElement('span');
    sep4.className = 'sh-separator';
    sep4.textContent = '|';
    root.appendChild(sep4);

    // Segment 5: Uptime
    const uptime = Math.floor((Date.now() - state.uptimeStart) / 1000);
    const uptimeSegment = document.createElement('div');
    uptimeSegment.className = 'sh-segment';
    const uptimeLabel = document.createElement('span');
    uptimeLabel.className = 'sh-label';
    uptimeLabel.textContent = 'UPTIME:';
    const uptimeValue = document.createElement('span');
    uptimeValue.className = 'sh-value sh-uptime';
    uptimeValue.textContent = formatUptime(uptime);
    uptimeSegment.appendChild(uptimeLabel);
    uptimeSegment.appendChild(uptimeValue);
    root.appendChild(uptimeSegment);

    // Separator
    const sep5 = document.createElement('span');
    sep5.className = 'sh-separator';
    sep5.textContent = '|';
    root.appendChild(sep5);

    // Segment 6: Last crash
    const crashTime = state.lastHealth ? state.lastHealth.lastCrash : 0;
    const crashSegment = document.createElement('div');
    crashSegment.className = 'sh-segment';
    const crashLabel = document.createElement('span');
    crashLabel.className = 'sh-label';
    crashLabel.textContent = 'LAST CRASH:';
    const crashValue = document.createElement('span');
    crashValue.className = `sh-crash-time ${crashTime === 0 ? 'never' : 'ago'}`;
    crashValue.textContent = formatCrashTime(crashTime);
    crashSegment.appendChild(crashLabel);
    crashSegment.appendChild(crashValue);
    root.appendChild(crashSegment);

    // Separator
    const sep6 = document.createElement('span');
    sep6.className = 'sh-separator';
    sep6.textContent = '|';
    root.appendChild(sep6);

    // Segment 7: Risk Posture
    const postureSeg = document.createElement('div');
    postureSeg.className = 'sh-segment';
    const postureLabel = document.createElement('span');
    postureLabel.className = 'sh-label';
    postureLabel.textContent = 'RISK POSTURE:';
    const postureValue = document.createElement('span');
    const armed = state.riskPosture === 'armed' || state.riskPosture === 'ALL GUARDRAILS ARMED';
    postureValue.className = `sh-posture ${armed ? 'armed' : state.riskPosture === 'degraded' ? 'degraded' : 'muted'}`;
    const postureText = armed ? 'ALL GUARDRAILS ARMED' : state.riskPosture || 'UNKNOWN';
    postureValue.textContent = postureText + ' ';
    const postureInd = document.createElement('span');
    postureInd.className = `sh-indicator ${armed ? 'ok' : state.riskPosture === 'degraded' ? 'fail' : 'warn'}`;
    postureInd.textContent = armed ? '✓' : '⚠';
    postureValue.appendChild(postureInd);
    postureSeg.appendChild(postureLabel);
    postureSeg.appendChild(postureValue);
    root.appendChild(postureSeg);

    // Separator
    const sep7 = document.createElement('span');
    sep7.className = 'sh-separator';
    sep7.textContent = '|';
    root.appendChild(sep7);

    // Segment 8: Commit
    const commit = state.lastHealth ? state.lastHealth.commit : null;
    const commitSeg = document.createElement('div');
    commitSeg.className = 'sh-segment';
    const commitLabel = document.createElement('span');
    commitLabel.className = 'sh-label';
    commitLabel.textContent = 'COMMIT:';
    const commitValue = document.createElement('span');
    commitValue.className = `sh-commit ${commit ? '' : 'unknown'}`;
    commitValue.textContent = commit || '?';
    commitSeg.appendChild(commitLabel);
    commitSeg.appendChild(commitValue);
    root.appendChild(commitSeg);
  }

  // ─── Health Fetch ────────────────────────────────────────────────────
  function fetchHealth() {
    try {
      fetch(state.healthEndpoint).then(res => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res.json();
      }).then(data => {
        state.lastHealth = data;
        render();
      }).catch(_e => {
        // Silently fail, use existing state
      });
    } catch (_) {/* swallow */}
  }

  // ─── Uptime Ticker ──────────────────────────────────────────────────
  // Re-render every second so the uptime + heartbeat-derived states
  // (router, broker) decay to STALE / fail gracefully when events stop.
  function tickUptime() {
    if (state.mounted) {
      recomputeDerivedHealth();
      render();
    }
  }

  // ─── Mount to DOM ────────────────────────────────────────────────────
  function mount() {
    if (state.mounted) return true;
    const root = document.getElementById(ROOT_ID);
    if (!root) return false;
    injectStyles();
    state.mounted = true;
    state.uptimeStart = Date.now();

    // Initialize brokers as unknown
    state.brokers.set('kraken', undefined);
    state.brokers.set('alpaca', undefined);
    render();
    return true;
  }

  // ─── Public API ──────────────────────────────────────────────────────
  const SystemHealth = {
    /**
     * Initialize: mount to DOM, inject styles, start fetch loop + uptime ticker.
     * Idempotent.
     */
    init() {
      try {
        if (!mount()) return; // Mount point missing

        // Subscribe to WS events. Socket may not be ready yet; poll
        // briefly until it shows up so the heartbeat-derived broker
        // and router indicators light up the moment data flows.
        (function bindSocket() {
          const Socket = OGZ && typeof OGZ.get === 'function' ? OGZ.get('Socket') : null;
          if (!Socket || typeof Socket.registerHandler !== 'function') {
            setTimeout(bindSocket, 250);
            return;
          }
          Socket.registerHandler('state_update', onStateUpdate);
          Socket.registerHandler('price', onPriceEvent);
          Socket.registerHandler('bot_thinking', onBotThinking);
          // Dormant — fire when backend ships them
          Socket.registerHandler('error_event', onErrorEvent);
          Socket.registerHandler('broker_status', onBrokerStatus);
        })();

        // Subscribe to OGZ.bus risk:update
        if (OGZ.bus) {
          OGZ.bus.on('risk:update', onRiskUpdate);
        }

        // Start health fetch loop (every 30s). If endpoint returns no
        // response or 404, render() displays honest placeholder values
        // — we never substitute synthetic data.
        fetchHealth(); // Immediate first fetch
        state.healthFetchTimer = setInterval(fetchHealth, HEALTH_FETCH_INTERVAL_MS);

        // Start uptime ticker (every 1s)
        state.uptimeTickTimer = setInterval(tickUptime, UPTIME_TICK_MS);
      } catch (_) {/* swallow */}
    },
    /**
     * Reconfigure the health endpoint URL (default: '/api/health').
     * @param {string} url - New endpoint URL
     */
    setHealthEndpoint(url) {
      if (typeof url === 'string') {
        state.healthEndpoint = url;
      }
    },
    /**
     * Manually fetch health data now (bypass the 30s interval).
     */
    refresh() {
      fetchHealth();
    },
    /**
     * Add an error message and increment error counter.
     * @param {string} msg - Error message (stored for tooltip)
     */
    addError(msg) {
      if (msg) {
        state.errors.push(String(msg));
        // Keep only last 10 errors in memory
        if (state.errors.length > 10) state.errors.shift();
        render();
      }
    },
    /**
     * Clear all errors (reset error count to 0).
     */
    clearErrors() {
      state.errors = [];
      render();
    },
    /**
     * Set broker WebSocket status (Kraken / Alpaca).
     * @param {string} name - Broker name ('kraken' | 'alpaca')
     * @param {boolean} ok - Connected (true) or disconnected (false)
     */
    setBroker(name, ok) {
      if (typeof name === 'string' && typeof ok === 'boolean') {
        state.brokers.set(name.toLowerCase(), ok);
        render();
      }
    },
    /**
     * Set SessionRouter state.
     * @param {string} state - Router state (e.g., 'CRYPTO', 'STOCKS', 'FAULTED')
     */
    setRouterState(routerState) {
      if (typeof routerState === 'string') {
        state.routerState = routerState.toUpperCase();
        render();
      }
    },
    /**
     * Set Risk Posture state.
     * @param {string} posture - Posture state (e.g., 'armed', 'degraded')
     */
    setRiskPosture(posture) {
      if (typeof posture === 'string') {
        state.riskPosture = posture.toLowerCase();
        render();
      }
    },
    /**
     * Teardown: stop timers, remove DOM, listeners, styles.
     */
    teardown() {
      try {
        if (state.healthFetchTimer) {
          clearInterval(state.healthFetchTimer);
          state.healthFetchTimer = null;
        }
        if (state.uptimeTickTimer) {
          clearInterval(state.uptimeTickTimer);
          state.uptimeTickTimer = null;
        }
        const root = document.getElementById(ROOT_ID);
        if (root) {
          root.innerHTML = '';
        }
        const styleEl = document.getElementById(STYLE_ID);
        if (styleEl) styleEl.remove();
        state.mounted = false;
        state.lastHealth = null;
        state.brokers.clear();
        state.errors = [];
      } catch (_) {/* swallow */}
    },
    /**
     * Debug helper: return snapshot of internal state.
     */
    _compute() {
      return {
        mounted: state.mounted,
        healthEndpoint: state.healthEndpoint,
        lastHealth: state.lastHealth,
        brokers: Object.fromEntries(state.brokers),
        routerState: state.routerState,
        riskPosture: state.riskPosture,
        errorCount: state.errors.length,
        uptime: Math.floor((Date.now() - state.uptimeStart) / 1000)
      };
    }
  };

  // ─── Helpers: symbol → broker, derived router state ─────────────────
  function symbolToBroker(symbol) {
    if (!symbol) return null;
    const s = String(symbol).toUpperCase();
    if (/-USD$/.test(s) || /^BTC|^ETH|^SOL|^XBT|^DOGE|^XRP/.test(s)) return 'kraken';
    return 'alpaca';
  }
  function resolveCurrentSymbol() {
    try {
      const sel = document.getElementById('cp-assetSelector');
      if (sel && sel.value) return String(sel.value).toUpperCase();
    } catch (_) {/* swallow */}
    return null;
  }

  // Derive router state from heartbeats. Public method updates state &
  // re-renders. Called periodically by the uptime ticker so stale
  // heartbeats degrade gracefully.
  function recomputeDerivedHealth() {
    const now = Date.now();
    const sym = state.currentSymbol || resolveCurrentSymbol();
    const broker = symbolToBroker(sym);

    // Router state: alive only while state_update OR bot_thinking is fresh
    const routerAlive = state.lastStateUpdateAt > 0 && now - state.lastStateUpdateAt < HEARTBEAT_FRESH_MS || state.lastBotThinkingAt > 0 && now - state.lastBotThinkingAt < HEARTBEAT_FRESH_MS;
    if (routerAlive) {
      state.routerState = broker === 'kraken' ? 'CRYPTO' : broker === 'alpaca' ? 'STOCKS' : 'LIVE';
    } else if (state.lastStateUpdateAt === 0 && state.lastBotThinkingAt === 0) {
      state.routerState = 'OFFLINE';
    } else {
      state.routerState = 'STALE';
    }

    // Broker heartbeats from price feed. We only know the active broker;
    // the inactive one stays '?' (not '✗') until broker_status emitter ships.
    if (broker && state.lastPriceAt > 0) {
      const priceFresh = now - state.lastPriceAt < HEARTBEAT_FRESH_MS;
      // Only flip the active broker; leave the other one alone unless we
      // already have explicit broker_status from backend.
      if (!state.haveBrokerEmitter) {
        state.brokers.set(broker, priceFresh);
      }
    }

    // Risk posture from recoveryMode flag
    if (state.recoveryMode) {
      state.riskPosture = 'degraded';
    } else if (state.lastStateUpdateAt > 0) {
      state.riskPosture = 'armed';
    }
  }

  // ─── WS Event Handlers (real bot emitter shapes) ────────────────────

  // 'state_update' — StateManager's authoritative snapshot. Drives router
  // heartbeat + risk posture (recoveryMode flag).
  function onStateUpdate(d) {
    try {
      const now = Date.now();
      state.lastStateUpdateAt = now;
      const s = d && d.state ? d.state : null;
      if (s && typeof s === 'object') {
        state.recoveryMode = !!s.recoveryMode;
      }
      recomputeDerivedHealth();
      render();
    } catch (_) {/* swallow */}
  }

  // 'price' — broker feed heartbeat. Single-pair bot, so the active broker
  // is derived from the current asset selector / data.symbol when present.
  function onPriceEvent(d) {
    try {
      const data = d && d.data ? d.data : d;
      if (!data) return;
      if (data.symbol) state.currentSymbol = String(data.symbol).toUpperCase();
      state.lastPriceAt = Date.now();
      recomputeDerivedHealth();
      // Don't render here — uptime ticker re-renders every second
    } catch (_) {/* swallow */}
  }

  // 'bot_thinking' — trading loop heartbeat
  function onBotThinking(_d) {
    state.lastBotThinkingAt = Date.now();
    recomputeDerivedHealth();
  }

  // DORMANT 'error_event' — wired defensively. When backend ships it
  // (planned), we flip haveErrorEmitter=true and start counting.
  function onErrorEvent(d) {
    try {
      const data = d && d.data ? d.data : d;
      if (!data) return;
      state.haveErrorEmitter = true;
      const msg = String(data.message || data.error || '');
      if (msg) SystemHealth.addError(msg);
    } catch (_) {/* swallow */}
  }

  // DORMANT 'broker_status' — wired defensively. When backend ships it,
  // it overrides the price-derived broker indicators.
  function onBrokerStatus(d) {
    try {
      const data = d && d.data ? d.data : d;
      if (!data || !data.name || typeof data.ok !== 'boolean') return;
      state.haveBrokerEmitter = true;
      SystemHealth.setBroker(data.name, data.ok);
    } catch (_) {/* swallow */}
  }

  // External RiskGauge override — keep shape backward compatible
  function onRiskUpdate(data) {
    try {
      if (typeof data === 'string') data = JSON.parse(data);
      if (data && data.state) {
        SystemHealth.setRiskPosture(data.state);
      } else if (data && data.level) {
        SystemHealth.setRiskPosture(String(data.level).toLowerCase());
      }
    } catch (_) {/* swallow */}
  }

  // ─── Module Registration ────────────────────────────────────────────
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('SystemHealth', SystemHealth);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('SystemHealth', SystemHealth);
      }
    });
  }
  try {
    window.OGZSystemHealth = SystemHealth;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/system-health.js", error: String((e && e.message) || e) }); }

// public/js/panels/system-snapshot.js
try { (() => {
/**
 * system-snapshot.js — STUBBED / DORMANT
 *
 * Originally registered a Snapshot module with an `update({totalPnL, winRate,
 * tradeCount})` method that wrote to DOM IDs #totalPnl / #winRate /
 * #tradesExecuted. Nothing in the codebase ever called Snapshot.update(),
 * so the module sat idle.
 *
 * WHY THIS IS A NO-OP:
 * Those three DOM IDs are now the responsibility of TradeLog.renderSessionPerformance
 * (public/js/panels/trade-log.js). core.js line 217-218 carries a tombstone
 * comment explaining that double-writing those IDs from two sources caused a
 * trade double-count bug: "TradeLog.addEntry already updates these via
 * renderSessionPerformance(). Doubling up here was double-counting the trade
 * and reading the prior value back from textContent."
 *
 * Wiring Snapshot.update() into core.js would re-introduce that exact bug.
 *
 * This file is stubbed (not deleted) because:
 *   - unified-dashboard.html line 3367 and unified-dashboard-v2.html line 651
 *     still <script src> include it; deleting would 404 on every page load.
 *   - Future contributors searching for "Snapshot" will land on this comment
 *     and learn the history before re-wiring it.
 *
 * If you need a passive read-only snapshot of session stats, use
 *   OGZ.get('TradeLog').getSessionStats()
 * which returns {pnl, winRate, count} from the single source of truth.
 *
 * SAFE TO DELETE THIS FILE: remove the <script> tags in both dashboard HTMLs first.
 */
(function (OGZ) {
  'use strict';

  // Intentional no-op. Do NOT register a Snapshot module — see header.
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/system-snapshot.js", error: String((e && e.message) || e) }); }

// public/js/panels/trade-log.js
try { (() => {
/**
 * trade-log.js - Real-time Execution Ticker + Session Counters
 *
 * Owns the session counters (P&L / count / wins / losses / startedAt) that
 * back the Session Performance panel above the trade log, and ticks the
 * session timer. Single source of truth — addEntry updates session, then
 * re-renders the Session Performance DOM. core.js consumers can read via
 * TradeLog.getSessionStats() if needed.
 *
 * Trey: "make all of the data... be the same about what it is session
 * or overall — if it's session add a session timer and session labels."
 * This module owns "session" everywhere on the right rail.
 */
(function (OGZ) {
  'use strict';

  const session = {
    startedAt: Date.now(),
    count: 0,
    wins: 0,
    losses: 0,
    cumulativePnl: 0
  };
  function pad2(n) {
    return String(n).padStart(2, '0');
  }
  function fmtTimer(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor(totalSec % 3600 / 60);
    const s = totalSec % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }
  function tickTimer() {
    const el = document.getElementById('sessionTimer');
    if (el) el.textContent = fmtTimer(Date.now() - session.startedAt);
  }
  function renderSessionPerformance() {
    const pnl = session.cumulativePnl;
    const pnlSign = pnl >= 0 ? '+$' : '-$';
    const pnlColor = pnl > 0 ? '#22c55e' : pnl < 0 ? '#ef4444' : '#e4e4e7';
    const wr = session.count > 0 ? session.wins / session.count * 100 : 0;
    const wrColor = wr >= 50 ? '#22c55e' : wr > 0 ? '#fbbf24' : '#e4e4e7';
    const setText = (id, txt, color) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = txt;
      if (color) el.style.color = color;
    };
    setText('totalPnl', pnlSign + Math.abs(pnl).toFixed(2), pnlColor);
    setText('winRate', wr.toFixed(0) + '%', wrColor);
    setText('tradesExecuted', String(session.count));
    setText('sessionWL', `${session.wins}W · ${session.losses}L`);
  }
  const TradeLog = {
    getSessionStats: function () {
      return {
        startedAt: session.startedAt,
        count: session.count,
        wins: session.wins,
        losses: session.losses,
        cumulativePnl: session.cumulativePnl,
        winRate: session.count > 0 ? session.wins / session.count * 100 : 0
      };
    },
    addEntry: function (trade) {
      const container = document.getElementById('tradeLog');
      if (!container) return;
      const row = document.createElement('div');
      row.className = 'trade-row';
      row.style = 'display:grid; grid-template-columns: 60px 1fr 1fr 70px; gap:8px; padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.05); font-size:11px; align-items:center;';
      const side = (trade.action || trade.side || 'UNKNOWN').toUpperCase();
      const sideColor = side === 'BUY' ? '#22c55e' : '#ef4444';
      const price = trade.price || trade.entryPrice || 0;
      const timestamp = trade.timestamp ? new Date(trade.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
      const pnl = trade.pnl != null ? Number(trade.pnl) : null;
      const hasPnl = Number.isFinite(pnl);
      const pnlText = hasPnl ? (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2) : '—';
      const pnlColor = !hasPnl ? '#71717a' : pnl >= 0 ? '#22c55e' : '#ef4444';
      if (hasPnl) {
        row.style.background = pnl >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)';
        // Only count CLOSED trades (those that have a P&L) toward W/L stats.
        // Open BUY entries arrive without pnl and don't increment counters.
        session.count++;
        session.cumulativePnl += pnl;
        if (pnl > 0) session.wins++;else if (pnl < 0) session.losses++;
      }
      row.innerHTML = `
                <div style="color:${sideColor}; font-weight:900; letter-spacing:1px;">${side}</div>
                <div style="font-family:'Orbitron',monospace; font-size:12px; color:#e4e4e7;">$${parseFloat(price).toLocaleString(undefined, {
        maximumFractionDigits: 2
      })}</div>
                <div style="font-family:'JetBrains Mono',monospace; font-size:12px; color:${pnlColor}; text-align:right;">${pnlText}</div>
                <div style="text-align:right; color:#71717a; font-size:10px; font-family:'JetBrains Mono',monospace;">${timestamp}</div>
            `;
      container.prepend(row);
      // Cap row count at 100
      while (container.children.length > 100) {
        container.removeChild(container.lastChild);
      }
      renderSessionPerformance();
    },
    resetSession: function () {
      session.startedAt = Date.now();
      session.count = 0;
      session.wins = 0;
      session.losses = 0;
      session.cumulativePnl = 0;
      renderSessionPerformance();
      tickTimer();
    }
  };

  // Initial render + start session timer ticking
  document.addEventListener('DOMContentLoaded', () => {
    renderSessionPerformance();
    tickTimer();
    setInterval(tickTimer, 1000);
  });
  OGZ.register('TradeLog', TradeLog);
})(window.OGZ);
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/trade-log.js", error: String((e && e.message) || e) }); }

// public/js/panels/trade-replay.js
try { (() => {
/**
 * trade-replay.js — TradeReplay: White-Box Trade Analysis Modal
 *
 * When an operator clicks a closed trade in the TradeLog, this module opens a
 * fullscreen modal overlay displaying:
 *   - Mini candlestick chart (~30 candles) centered on trade entry time
 *   - Entry marker (gold dot) and exit marker (green/red dot) with connecting line
 *   - Right sidebar: trade entry reasoning (pattern, strategy, indicators, news, whales)
 *   - Full narrator lines from around entry time, color-coded by decision type
 *   - Navigation: Previous/Next buttons to step through closed trades
 *   - Footer: Close button and session stats
 *
 * This is OGZPrime's core white-box differentiator — the visceral "see what the
 * AI was thinking" experience that black-box competitors cannot reproduce.
 *
 * Self-registers as OGZ.TradeReplay via OGZ.register().
 * Mounts modal overlay into <body> (fullscreen).
 *
 * Delegates to:
 *   - OGZ.TradeLog — for trade data and click event delegation
 *   - OGZ.ChainOfThought — for narrator lines around trade time
 *   - OGZ.PatternCard.PATTERN_DESCRIPTIONS — for human-readable pattern names (optional)
 *   - OGZ.ChartPanel.getCandlesAroundTime?.() — for real candle data (REQUIRED for chart;
 *     no synthetic fallback. If unavailable, the chart area shows an honest empty state.)
 *
 * Public API:
 *   init() — Mount modal scaffold, hook TradeLog click handler, inject styles
 *   openReplay(tradeData) — Programmatically open with a Trade object
 *   close() — Close modal and clean up
 *   setOnOpen(cb) — Register callback when modal opens
 *   setOnClose(cb) — Register callback when modal closes
 *   teardown() — Full cleanup (DOM, listeners, styles)
 *
 * @typedef {Object} TradeRecord
 * @property {string} id
 * @property {string} symbol
 * @property {string} broker - 'alpaca' | 'kraken' | etc
 * @property {'long'|'short'} side
 * @property {number} entry - entry price
 * @property {number} exit - exit price
 * @property {number} entryTs - epoch ms
 * @property {number} exitTs - epoch ms
 * @property {number} pnl - dollars
 * @property {number} pnlPercent
 * @property {string} [strategy] - e.g., 'Strategy-A'
 * @property {string} [pattern] - e.g., 'double_bottom'
 * @property {number} [confidence] - 0..1
 * @property {string[]} [narratorLines] - reasoning lines from around entry time
 * @property {Object} [indicatorsAtEntry] - { rsi, macd, atr, volume }
 * @property {string} [newsContext] - news headline or 'Clean'
 * @property {string} [whaleContext] - whale activity or 'None detected'
 *
 * @module public/js/panels/trade-replay
 */
(function (OGZ) {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────
  const MODULE_NAME = 'TradeReplay';
  const STYLE_ID = 'ogz-trade-replay-styles';
  const MODAL_ROOT_ID = 'tradeReplayModal';
  const Z_INDEX_MODAL = 9998;
  const Z_INDEX_BACKDROP = Z_INDEX_MODAL - 1;
  const MINI_CHART_W = 400;
  const MINI_CHART_H = 220;
  const CANDLE_COUNT = 30;
  const FADE_MS = 200;

  // NO synthetic candle generation. If real candles aren't available from
  // ChartPanel, the chart area renders an honest empty state. We never
  // fabricate price data.

  // ─── Private State ──────────────────────────────────────────────────────
  const state = {
    mounted: false,
    modalOpen: false,
    currentTrade: null,
    backdropEl: null,
    modalEl: null,
    contentEl: null,
    // Trade navigation
    allTrades: [],
    currentTradeIndex: -1,
    // Callbacks
    onOpenCallback: null,
    onCloseCallback: null,
    // Event listeners to clean up
    listeners: []
  };

  // ─── CSS Injection ──────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            /* Backdrop */
            .tr-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: ${Z_INDEX_BACKDROP};
                opacity: 0;
                animation: tr-fade-in ${FADE_MS}ms ease-out forwards;
            }

            @keyframes tr-fade-in {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            /* Modal Container */
            #${MODAL_ROOT_ID} {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: ${Z_INDEX_MODAL};
                max-width: 1100px;
                width: 95vw;
                max-height: 90vh;
                overflow-y: auto;
                background: rgba(15, 15, 18, 0.75);
                backdrop-filter: blur(14px) saturate(160%);
                -webkit-backdrop-filter: blur(14px) saturate(160%);
                border: 1px solid rgba(255, 215, 0, 0.25);
                border-radius: 8px;
                box-shadow: 0 8px 40px -6px rgba(255, 215, 0, 0.4),
                            0 1px 0 0 rgba(255, 215, 0, 0.1) inset;
                opacity: 0;
                animation: tr-modal-enter ${FADE_MS}ms ease-out forwards;
            }

            @keyframes tr-modal-enter {
                from {
                    opacity: 0;
                    transform: translate(-50%, -48%);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, -50%);
                }
            }

            /* Modal Header */
            .tr-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 20px;
                border-bottom: 1px solid rgba(255, 215, 0, 0.15);
                background: rgba(0, 0, 0, 0.2);
                flex-shrink: 0;
            }

            .tr-header-summary {
                display: flex;
                align-items: center;
                gap: 12px;
                font-family: 'Orbitron', monospace;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.04em;
                color: var(--text-primary);
            }

            .tr-header-symbol {
                color: var(--ml-color);
                font-size: 14px;
            }

            .tr-header-side {
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                padding: 2px 6px;
                border-radius: 3px;
                background: rgba(0, 0, 0, 0.3);
            }

            .tr-header-side.long {
                color: var(--profit-color);
                border: 1px solid rgba(34, 197, 94, 0.3);
            }

            .tr-header-side.short {
                color: var(--loss-color);
                border: 1px solid rgba(239, 68, 68, 0.3);
            }

            .tr-header-prices {
                color: var(--text-secondary);
                font-size: 11px;
                margin-left: 8px;
            }

            .tr-header-pnl {
                margin-left: auto;
                text-align: right;
                font-size: 12px;
                font-weight: 700;
                padding: 4px 10px;
                border-radius: 3px;
                background: rgba(0, 0, 0, 0.2);
            }

            .tr-header-pnl.win {
                color: var(--profit-color);
                border: 1px solid rgba(34, 197, 94, 0.25);
            }

            .tr-header-pnl.loss {
                color: var(--loss-color);
                border: 1px solid rgba(239, 68, 68, 0.25);
            }

            .tr-close-btn {
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                border: none;
                color: var(--text-secondary);
                cursor: pointer;
                font-size: 16px;
                padding: 0;
                margin-left: 16px;
                transition: all 0.2s ease;
            }

            .tr-close-btn:hover {
                color: var(--ml-color);
                transform: scale(1.15);
            }

            /* Main Content */
            .tr-content {
                display: flex;
                gap: 12px;
                padding: 16px;
                flex: 1;
                min-height: 0;
            }

            /* Left: Mini Chart */
            .tr-chart-side {
                flex: 0 0 60%;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .tr-chart-label {
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: var(--text-secondary);
                margin-bottom: 2px;
            }

            .tr-mini-chart {
                width: 100%;
                max-width: ${MINI_CHART_W}px;
                height: ${MINI_CHART_H}px;
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(0, 204, 255, 0.2);
                border-radius: 4px;
                overflow: hidden;
                flex: 1;
            }

            .tr-mini-chart svg {
                display: block;
                width: 100%;
                height: 100%;
            }

            /* Right: Reasoning Panel */
            .tr-reasoning-side {
                flex: 0 0 40%;
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding-left: 12px;
                border-left: 1px solid rgba(255, 215, 0, 0.1);
                max-height: 400px;
                overflow-y: auto;
            }

            .tr-reasoning-row {
                display: flex;
                flex-direction: column;
                gap: 3px;
                padding: 6px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            }

            .tr-reasoning-row:last-child {
                border-bottom: none;
            }

            .tr-reasoning-label {
                font-size: 8px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: var(--text-secondary);
            }

            .tr-reasoning-value {
                font-size: 11px;
                color: var(--text-primary);
                font-family: 'JetBrains Mono', monospace;
                word-break: break-word;
            }

            .tr-reasoning-value.highlight {
                color: var(--ml-color);
                font-weight: 500;
            }

            /* Narrator lines section */
            .tr-narrator-section {
                margin-top: 4px;
                padding-top: 8px;
                border-top: 1px solid rgba(255, 215, 0, 0.15);
            }

            .tr-narrator-label {
                font-size: 8px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: var(--text-secondary);
                margin-bottom: 4px;
            }

            .tr-narrator-lines {
                display: flex;
                flex-direction: column;
                gap: 3px;
                font-size: 9px;
                font-family: 'JetBrains Mono', monospace;
                line-height: 1.3;
            }

            .tr-narrator-line {
                color: var(--text-secondary);
                padding-left: 10px;
                position: relative;
                padding-top: 2px;
                padding-bottom: 2px;
            }

            .tr-narrator-line::before {
                content: '•';
                position: absolute;
                left: 0;
            }

            .tr-narrator-line.decision {
                color: var(--ml-color);
            }

            .tr-narrator-line.execution {
                color: var(--profit-color);
            }

            .tr-narrator-line.warning {
                color: var(--loss-color);
            }

            /* Footer */
            .tr-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                border-top: 1px solid rgba(255, 215, 0, 0.15);
                background: rgba(0, 0, 0, 0.1);
                flex-shrink: 0;
            }

            .tr-nav-buttons {
                display: flex;
                gap: 8px;
            }

            .tr-nav-btn {
                padding: 6px 12px;
                background: rgba(255, 215, 0, 0.08);
                border: 1px solid rgba(255, 215, 0, 0.25);
                border-radius: 3px;
                color: var(--ml-color);
                font-size: 10px;
                font-family: 'Orbitron', monospace;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .tr-nav-btn:hover:not(:disabled) {
                background: rgba(255, 215, 0, 0.15);
                border-color: rgba(255, 215, 0, 0.4);
            }

            .tr-nav-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }

            .tr-footer-spacer {
                flex: 1;
            }

            .tr-close-footer-btn {
                padding: 6px 16px;
                background: rgba(255, 215, 0, 0.12);
                border: 1px solid rgba(255, 215, 0, 0.3);
                border-radius: 3px;
                color: var(--ml-color);
                font-size: 10px;
                font-family: 'Orbitron', monospace;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .tr-close-footer-btn:hover {
                background: rgba(255, 215, 0, 0.2);
                border-color: rgba(255, 215, 0, 0.5);
            }

            /* Responsive */
            @media (max-width: 900px) {
                #${MODAL_ROOT_ID} {
                    width: 98vw;
                    max-width: 100%;
                }

                .tr-content {
                    flex-direction: column;
                }

                .tr-chart-side {
                    flex: 0 0 auto;
                    max-width: 100%;
                }

                .tr-reasoning-side {
                    flex: 0 0 auto;
                    padding-left: 0;
                    border-left: none;
                    border-top: 1px solid rgba(255, 215, 0, 0.1);
                    padding-top: 8px;
                    max-height: none;
                }
            }
        `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Mini Chart Renderer ────────────────────────────────────────────────
  /**
   * Render mini candlestick chart as SVG.
   * @param {Array} candles - { open, high, low, close, volume }
   * @param {number} entryPrice - Entry price
   * @param {number} exitPrice - Exit price
   * @param {number} entryIdx - Index of entry candle
   * @param {number} exitIdx - Index of exit candle
   * @param {boolean} isLong - true for long, false for short
   * @returns {SVGElement}
   */
  function renderMiniChart(candles, entryPrice, exitPrice, entryIdx, exitIdx, isLong) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${MINI_CHART_W} ${MINI_CHART_H}`);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Calculate price bounds with padding
    let minPrice = Math.min(...candles.map(c => c.low));
    let maxPrice = Math.max(...candles.map(c => c.high));
    const priceRange = maxPrice - minPrice || 1;
    minPrice -= priceRange * 0.05;
    maxPrice += priceRange * 0.05;
    const priceHeight = maxPrice - minPrice;
    const pixelsPerPrice = MINI_CHART_H / priceHeight;
    const candleWidth = MINI_CHART_W / candles.length;

    // Helper to convert price to Y pixel
    const priceToY = price => MINI_CHART_H - (price - minPrice) * pixelsPerPrice;

    // Draw candles
    candles.forEach((candle, i) => {
      const x = (i + 0.5) * candleWidth;
      const o = priceToY(candle.open);
      const c = priceToY(candle.close);
      const h = priceToY(candle.high);
      const l = priceToY(candle.low);
      const isUp = candle.close >= candle.open;
      const bodyTop = Math.min(o, c);
      const bodyBot = Math.max(o, c);
      const bodyColor = isUp ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)';
      const wickColor = isUp ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';

      // Wick
      const wick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      wick.setAttribute('x1', x);
      wick.setAttribute('y1', h);
      wick.setAttribute('x2', x);
      wick.setAttribute('y2', l);
      wick.setAttribute('stroke', wickColor);
      wick.setAttribute('stroke-width', '1');
      svg.appendChild(wick);

      // Body
      const body = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      body.setAttribute('x', x - candleWidth * 0.35);
      body.setAttribute('y', bodyTop);
      body.setAttribute('width', candleWidth * 0.7);
      body.setAttribute('height', Math.max(1, bodyBot - bodyTop));
      body.setAttribute('fill', bodyColor);
      svg.appendChild(body);
    });

    // Entry marker (gold circle)
    if (entryIdx >= 0 && entryIdx < candles.length) {
      const x = (entryIdx + 0.5) * candleWidth;
      const y = priceToY(entryPrice);

      // Outer ring
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', x);
      ring.setAttribute('cy', y);
      ring.setAttribute('r', '5');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', 'rgba(255, 215, 0, 0.8)');
      ring.setAttribute('stroke-width', '1.5');
      svg.appendChild(ring);

      // Inner dot
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', '3');
      dot.setAttribute('fill', 'rgba(255, 215, 0, 0.9)');
      svg.appendChild(dot);
    }

    // Exit marker (green/red circle)
    if (exitIdx >= 0 && exitIdx < candles.length) {
      const x = (exitIdx + 0.5) * candleWidth;
      const y = priceToY(exitPrice);
      const exitColor = exitPrice > entryPrice ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)';
      const exitRingColor = exitPrice > entryPrice ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)';

      // Outer ring
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', x);
      ring.setAttribute('cy', y);
      ring.setAttribute('r', '5');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', exitRingColor);
      ring.setAttribute('stroke-width', '1.5');
      svg.appendChild(ring);

      // Inner dot
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', '3');
      dot.setAttribute('fill', exitColor);
      svg.appendChild(dot);
    }

    // Connecting line (dashed gold)
    if (entryIdx >= 0 && exitIdx >= 0 && entryIdx < candles.length && exitIdx < candles.length) {
      const x1 = (entryIdx + 0.5) * candleWidth;
      const y1 = priceToY(entryPrice);
      const x2 = (exitIdx + 0.5) * candleWidth;
      const y2 = priceToY(exitPrice);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.setAttribute('stroke', 'rgba(255, 215, 0, 0.3)');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '4,3');
      svg.appendChild(line);
    }
    return svg;
  }

  // ─── Modal Rendering ────────────────────────────────────────────────────
  /**
   * Render the full modal content from trade data.
   * @param {TradeRecord} trade
   */
  function renderModal(trade) {
    if (!state.modalEl) return;

    // Fetch real candles only — NO synthetic fallback. If unavailable,
    // the chart area renders an honest "Chart data unavailable for this
    // trade window" message below.
    let candles = [];
    try {
      const chartPanel = OGZ.get?.('ChartPanel');
      const realCandles = chartPanel?.getCandlesAroundTime?.(trade.entryTs, CANDLE_COUNT);
      if (Array.isArray(realCandles) && realCandles.length > 0) {
        candles = realCandles;
      }
    } catch (_) {}

    // Calculate entry/exit candle indices (only when real candles exist)
    let entryIdx = 0;
    let exitIdx = 0;
    if (candles.length > 0) {
      entryIdx = Math.floor(candles.length / 3);
      exitIdx = Math.floor(candles.length * 0.8);
      if (trade.entryTs && trade.exitTs && candles[0].ts) {
        const timePerCandle = (candles[candles.length - 1].ts - candles[0].ts) / candles.length;
        if (timePerCandle > 0) {
          entryIdx = Math.floor((trade.entryTs - candles[0].ts) / timePerCandle);
          exitIdx = Math.floor((trade.exitTs - candles[0].ts) / timePerCandle);
          entryIdx = Math.max(0, Math.min(entryIdx, candles.length - 1));
          exitIdx = Math.max(0, Math.min(exitIdx, candles.length - 1));
        }
      }
    }

    // Determine side
    const side = (trade.side || 'long').toLowerCase();
    const isLong = side === 'long' || side === 'buy';
    const sideDisplay = isLong ? 'LONG' : 'SHORT';
    const sideColor = isLong ? 'var(--profit-color)' : 'var(--loss-color)';

    // P&L color
    const pnl = trade.pnl || 0;
    const pnlColor = pnl > 0 ? 'var(--profit-color)' : pnl < 0 ? 'var(--loss-color)' : 'var(--text-secondary)';
    const pnlSign = pnl >= 0 ? '+' : '';
    const pnlText = `${pnlSign}$${Math.abs(pnl).toFixed(2)} (${pnlSign}${(trade.pnlPercent || 0).toFixed(2)}%)`;

    // Get narrator lines from ChainOfThought
    const narratorLines = [];
    try {
      const cot = OGZ.get?.('ChainOfThought');
      const allLines = cot?.getLines?.() || [];
      const windowStart = trade.entryTs - 120000; // 2 min before
      const windowEnd = trade.entryTs + 30000; // 30s after
      const relevant = allLines.filter(line => line.ts >= windowStart && line.ts <= windowEnd);
      narratorLines.push(...relevant);
    } catch (_) {}

    // Pattern description
    let patternName = trade.pattern || 'Unknown';
    try {
      const patternCard = OGZ.get?.('PatternCard');
      const PATTERN_DESCRIPTIONS = patternCard?.PATTERN_DESCRIPTIONS || {};
      if (PATTERN_DESCRIPTIONS[trade.pattern]) {
        patternName = PATTERN_DESCRIPTIONS[trade.pattern].title || patternName;
      }
    } catch (_) {}

    // Build HTML
    state.modalEl.innerHTML = `
            <div class="tr-header">
                <div class="tr-header-summary">
                    <span class="tr-header-symbol">${trade.symbol || 'N/A'}</span>
                    <span class="tr-header-side ${isLong ? 'long' : 'short'}">${sideDisplay}</span>
                    <span class="tr-header-prices">
                        $${(trade.entry || 0).toFixed(2)} → $${(trade.exit || 0).toFixed(2)}
                    </span>
                </div>
                <div class="tr-header-pnl ${pnl > 0 ? 'win' : 'loss'}">${pnlText}</div>
                <button class="tr-close-btn" aria-label="Close">✕</button>
            </div>

            <div class="tr-content">
                <div class="tr-chart-side">
                    <div class="tr-chart-label">Entry & Exit</div>
                    <div class="tr-mini-chart" id="trMiniChartContainer"></div>
                </div>

                <div class="tr-reasoning-side">
                    <div class="tr-chart-label">Reasoning at Entry</div>

                    ${trade.pattern ? `
                        <div class="tr-reasoning-row">
                            <div class="tr-reasoning-label">Pattern</div>
                            <div class="tr-reasoning-value highlight">${patternName}</div>
                        </div>
                    ` : ''}

                    ${trade.confidence ? `
                        <div class="tr-reasoning-row">
                            <div class="tr-reasoning-label">Confidence</div>
                            <div class="tr-reasoning-value">${(trade.confidence * 100).toFixed(0)}%</div>
                        </div>
                    ` : ''}

                    ${trade.strategy ? `
                        <div class="tr-reasoning-row">
                            <div class="tr-reasoning-label">Strategy</div>
                            <div class="tr-reasoning-value">${trade.strategy}</div>
                        </div>
                    ` : ''}

                    <div class="tr-reasoning-row">
                        <div class="tr-reasoning-label">News Context</div>
                        <div class="tr-reasoning-value">${trade.newsContext || 'Clean'}</div>
                    </div>

                    <div class="tr-reasoning-row">
                        <div class="tr-reasoning-label">Whale Activity</div>
                        <div class="tr-reasoning-value">${trade.whaleContext || 'None detected'}</div>
                    </div>

                    ${narratorLines.length > 0 ? `
                        <div class="tr-narrator-section">
                            <div class="tr-narrator-label">Narrator Lines</div>
                            <div class="tr-narrator-lines">
                                ${narratorLines.map(line => `
                                    <div class="tr-narrator-line ${line.level || 'info'}">
                                        ${line.text}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : `
                        <div class="tr-narrator-section">
                            <div class="tr-narrator-label">Narrator Lines</div>
                            <div style="font-size: 9px; color: var(--text-secondary);">
                                (narrator data not available for this trade)
                            </div>
                        </div>
                    `}
                </div>
            </div>

            <div class="tr-footer">
                <div class="tr-nav-buttons">
                    <button class="tr-nav-btn" id="trPrevBtn" ${state.currentTradeIndex <= 0 ? 'disabled' : ''}>
                        ← PREV
                    </button>
                    <button class="tr-nav-btn" id="trNextBtn" ${state.currentTradeIndex >= state.allTrades.length - 1 ? 'disabled' : ''}>
                        NEXT →
                    </button>
                </div>
                <div class="tr-footer-spacer"></div>
                <button class="tr-close-footer-btn">CLOSE</button>
            </div>
        `;

    // Render mini chart — only when REAL candles exist. Otherwise honest empty state.
    const chartContainer = document.getElementById('trMiniChartContainer');
    if (chartContainer) {
      chartContainer.innerHTML = '';
      if (candles.length > 0) {
        const svg = renderMiniChart(candles, trade.entry, trade.exit, entryIdx, exitIdx, isLong);
        chartContainer.appendChild(svg);
      } else {
        const empty = document.createElement('div');
        empty.className = 'tr-chart-empty';
        empty.style.cssText = 'display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-secondary); font-size:11px; text-align:center; padding:24px;';
        empty.textContent = 'Chart data unavailable for this trade window. (ChartPanel.getCandlesAroundTime did not return candles.)';
        chartContainer.appendChild(empty);
      }
    }

    // Wire event listeners
    const closeBtn = state.modalEl.querySelector('.tr-close-btn');
    const closeBtnFooter = state.modalEl.querySelector('.tr-close-footer-btn');
    const prevBtn = document.getElementById('trPrevBtn');
    const nextBtn = document.getElementById('trNextBtn');
    const onClose = () => {
      try {
        close();
      } catch (_) {}
    };
    const onPrev = () => {
      try {
        navigateTrade(-1);
      } catch (_) {}
    };
    const onNext = () => {
      try {
        navigateTrade(1);
      } catch (_) {}
    };
    closeBtn?.addEventListener('click', onClose);
    closeBtnFooter?.addEventListener('click', onClose);
    prevBtn?.addEventListener('click', onPrev);
    nextBtn?.addEventListener('click', onNext);
    state.listeners.push({
      el: closeBtn,
      event: 'click',
      fn: onClose
    });
    state.listeners.push({
      el: closeBtnFooter,
      event: 'click',
      fn: onClose
    });
    state.listeners.push({
      el: prevBtn,
      event: 'click',
      fn: onPrev
    });
    state.listeners.push({
      el: nextBtn,
      event: 'click',
      fn: onNext
    });
  }

  // ─── Modal Lifecycle ────────────────────────────────────────────────────
  /**
   * Open the modal with a trade record.
   * @param {TradeRecord} trade
   */
  function open(trade) {
    try {
      if (!trade) return;
      state.currentTrade = trade;
      state.modalOpen = true;

      // Find trade index in allTrades
      state.currentTradeIndex = state.allTrades.findIndex(t => t.id === trade.id);
      if (state.currentTradeIndex < 0) {
        state.currentTradeIndex = 0;
      }

      // Create modal if needed
      if (!state.modalEl) {
        state.backdropEl = document.createElement('div');
        state.backdropEl.className = 'tr-backdrop';
        document.body.appendChild(state.backdropEl);
        state.modalEl = document.createElement('div');
        state.modalEl.id = MODAL_ROOT_ID;
        document.body.appendChild(state.modalEl);

        // Close on backdrop click
        state.backdropEl.addEventListener('click', close);
        state.listeners.push({
          el: state.backdropEl,
          event: 'click',
          fn: close
        });

        // Close on ESC
        const onEsc = e => {
          if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', onEsc);
        state.listeners.push({
          el: document,
          event: 'keydown',
          fn: onEsc
        });
      }

      // Show modal
      state.backdropEl.style.display = 'block';
      state.modalEl.style.display = 'block';

      // Render content
      renderModal(trade);

      // Fire callback
      if (state.onOpenCallback) {
        try {
          state.onOpenCallback(trade);
        } catch (_) {}
      }
    } catch (_) {}
  }

  /**
   * Close the modal.
   */
  function close() {
    try {
      if (!state.modalOpen) return;
      state.modalOpen = false;
      state.currentTrade = null;
      if (state.backdropEl) {
        state.backdropEl.style.display = 'none';
      }
      if (state.modalEl) {
        state.modalEl.style.display = 'none';
      }

      // Fire callback
      if (state.onCloseCallback) {
        try {
          state.onCloseCallback();
        } catch (_) {}
      }
    } catch (_) {}
  }

  /**
   * Navigate to next/prev trade.
   * @param {number} direction - -1 for prev, 1 for next
   */
  function navigateTrade(direction) {
    try {
      const newIdx = state.currentTradeIndex + direction;
      if (newIdx >= 0 && newIdx < state.allTrades.length) {
        state.currentTradeIndex = newIdx;
        const nextTrade = state.allTrades[newIdx];
        renderModal(nextTrade);
      }
    } catch (_) {}
  }

  // ─── TradeLog Integration ───────────────────────────────────────────────
  /**
   * Hook into TradeLog row clicks.
   */
  function hookTradeLog() {
    try {
      const tradeLogContainer = document.getElementById('tradeLog');
      if (!tradeLogContainer) return;
      const onTradeRowClick = e => {
        try {
          const row = e.target.closest('.trade-row');
          if (!row) return;

          // Try to get trade data from TradeLog
          const tradeLog = OGZ.get?.('TradeLog');
          if (!tradeLog) return;

          // Extract trade ID from data attribute or similar
          const tradeId = row.getAttribute('data-trade-id');
          if (!tradeId) return;

          // Query TradeLog for the trade data
          const trade = tradeLog.getTrade?.(tradeId) || {};
          if (trade && Object.keys(trade).length > 0) {
            // Fetch all closed trades for navigation
            state.allTrades = (tradeLog.getAllTrades?.() || []).filter(t => t.pnl != null);
            open(trade);
          }
        } catch (_) {}
      };
      tradeLogContainer.addEventListener('click', onTradeRowClick);
      state.listeners.push({
        el: tradeLogContainer,
        event: 'click',
        fn: onTradeRowClick
      });
    } catch (_) {}
  }

  // ─── Public API ─────────────────────────────────────────────────────────
  const TradeReplay = {
    /**
     * Initialize: inject styles, hook TradeLog.
     */
    init() {
      try {
        injectStyles();
        hookTradeLog();
        state.mounted = true;
      } catch (_) {}
    },
    /**
     * Programmatically open replay with trade data.
     * @param {TradeRecord} tradeData
     */
    openReplay(tradeData) {
      try {
        if (tradeData) {
          state.allTrades = [tradeData];
          open(tradeData);
        }
      } catch (_) {}
    },
    /**
     * Close modal.
     */
    close() {
      try {
        close();
      } catch (_) {}
    },
    /**
     * Register callback on open.
     * @param {Function} cb
     */
    setOnOpen(cb) {
      if (typeof cb === 'function') {
        state.onOpenCallback = cb;
      }
    },
    /**
     * Register callback on close.
     * @param {Function} cb
     */
    setOnClose(cb) {
      if (typeof cb === 'function') {
        state.onCloseCallback = cb;
      }
    },
    /**
     * Full cleanup.
     */
    teardown() {
      try {
        close();

        // Remove event listeners
        state.listeners.forEach(({
          el,
          event,
          fn
        }) => {
          if (el) el.removeEventListener(event, fn);
        });
        state.listeners = [];

        // Remove DOM
        if (state.backdropEl && state.backdropEl.parentNode) {
          state.backdropEl.parentNode.removeChild(state.backdropEl);
        }
        if (state.modalEl && state.modalEl.parentNode) {
          state.modalEl.parentNode.removeChild(state.modalEl);
        }

        // Remove styles
        const styleEl = document.getElementById(STYLE_ID);
        if (styleEl && styleEl.parentNode) {
          styleEl.parentNode.removeChild(styleEl);
        }
        state.mounted = false;
        state.modalOpen = false;
        state.currentTrade = null;
        state.backdropEl = null;
        state.modalEl = null;
      } catch (_) {}
    }
  };

  // ─── Registration ───────────────────────────────────────────────────────
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register(MODULE_NAME, TradeReplay);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register(MODULE_NAME, TradeReplay);
      }
    });
  }
  try {
    window.OGZTradeReplay = TradeReplay;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/trade-replay.js", error: String((e && e.message) || e) }); }

// public/js/panels/trai-brain.js
try { (() => {
/**
 * trai-brain.js — TRAIBrain: White-Box AI Reasoning Panel
 *
 * The persistent right-rail panel that replaces the floating TRAI chat widget
 * with an always-visible window into TRAI's real-time thinking. Operators and
 * customers see exactly what the AI is processing: flagged news, whale activity,
 * narrator verbalization of bot decisions, escalation queue, and an "Ask TRAI"
 * input for on-demand queries.
 *
 * What it renders (top to bottom):
 *   1. Header — "TRAI BRAIN" title + pulsing ML-active gold dot + connection status
 *   2. Latest News (1-2 max visible, "see more" expands) — color-coded by sentiment
 *   3. Whale Alert (1 item) — most recent block trade or unusual volume
 *   4. Narrator Output (4-5 lines visible, scrolling) — live thinking, newest at top
 *   5. Escalation Queue — numbered list of items requiring operator attention
 *   6. Ask TRAI Input — text field to query TRAI directly via HTTP API
 *   7. TRAI Response (expandable) — inline result from last query
 *
 * Self-registers as OGZ.TRAIBrain via OGZ.register().
 * Mounts into <div id="traiBrain"></div>.
 *
 * Verified WS subscriptions (real bot emitter shapes):
 *   - 'whale_trade'    → DashboardBroadcaster.broadcastEdgeAnalytics line 133.
 *                        Real shape: { type:'whale_trade', size, price, side, timestamp }
 *                        (size = USD notional). No `ticker` carried; bot is single-pair.
 *                        We resolve symbol from chart selector for display.
 *   - 'narrator_event' → TradeNarrator.broadcast. Real shape:
 *                        { type:'narrator_event', scope, event, timestamp, text, ... }
 *                        Filter to scope='USER' (customer-facing). text is the
 *                        verbalized line.
 *   - 'bot_thinking'   → TradingLoop / TRAIDecisionModule. Used as a low-key
 *                        "still thinking" pulse on the header dot when no
 *                        narrator events fire for a while.
 *
 * AWAITING BACKEND EMITTERS (rendered as muted "awaiting…" placeholders, no fakes):
 *   - 'news_event'     → planned: route through TRAI NLP + websearch crawler
 *   - 'escalation'     → planned: TRAI flags ops attention items
 *
 * Listens to OGZ.bus:
 *   - watchlist:select (re-scope news/whale to selected ticker once those exist)
 *
 * HTTP API calls:
 *   POST /api/trai/analyze { prompt, maxTokens } → { response, provider, latency }
 *   GET /api/trai/status → { ready, providerName, model }
 *
 * No console.log in production. Try/catch swallow on all WS handlers.
 * State is minimal: in-memory buffers (news, whales, narrator, escalations).
 * Clean teardown: removes DOM, listeners, intervals.
 *
 * Public API:
 *   init() — Mount to DOM, inject styles, subscribe to WS + bus events
 *   askTRAI(query) — Submit a query to /api/trai/analyze, display response
 *   addNarratorLine(text) — Prepend a narrator line (called by WS handler)
 *   setConnectionStatus(status) — Update header connection display
 *   clearAll() — Reset all buffers (news, whales, narrator, escalations)
 *   teardown() — Remove DOM, listeners, styles
 *   _compute() — Debug helper: return internal state snapshot
 *
 * @typedef {Object} NewsItem
 * @property {number} ts - Unix epoch milliseconds
 * @property {'bullish'|'neutral'|'defensive'} sentiment - Event sentiment
 * @property {string} headline - Short headline (max ~100 chars)
 * @property {string} source - Origin attribution (e.g., 'Reuters', 'SEC', 'TRAI')
 * @property {string} [ticker] - Optional ticker symbol
 * @property {string} [confidence_modifier] - Optional confidence delta (e.g., '-0.15')
 *
 * @typedef {Object} WhaleAlert
 * @property {number} ts - Unix epoch milliseconds
 * @property {string} description - Human-readable alert (e.g., "Unusual call volume +312%")
 * @property {string} ticker - Ticker symbol
 * @property {string} [source] - Optional source (e.g., 'Block', 'Analytics')
 *
 * @typedef {Object} NarratorLine
 * @property {number} ts - Unix epoch milliseconds
 * @property {string} text - Narrator verbalization (e.g., "Strategy-A and B aligning...")
 *
 * @typedef {Object} EscalationItem
 * @property {number} id - Unique ID for this escalation
 * @property {string} title - Short title (e.g., "Risk Limit Exceeded")
 * @property {string} [detail] - Optional detail
 * @property {'warning'|'critical'} level - Severity
 *
 * @module public/js/panels/trai-brain
 */
(function (OGZ) {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────
  const STYLE_ID = 'ogz-trai-brain-styles';
  const ROOT_ID = 'traiBrain';
  const NEWS_VISIBLE_COUNT = 2; // Max news items shown before "see more"
  const WHALE_VISIBLE_COUNT = 1; // Show 1 whale alert
  const NARRATOR_LINES_VISIBLE = 5; // Show last 5 narrator lines
  const NARRATOR_MAX_BUFFER = 50; // Keep 50 lines in memory
  const STATUS_CHECK_INTERVAL_MS = 30000; // Check /api/trai/status every 30s
  const RESPONSE_EXPAND_MS = 300; // Response expand animation duration

  // ─── Private State ──────────────────────────────────────────────────
  const state = {
    mounted: false,
    selectedTicker: null,
    // Data buffers
    news: [],
    // Array of NewsItem
    whales: [],
    // Array of WhaleAlert
    narrator: [],
    // Array of NarratorLine (rolling buffer, newest first)
    escalations: [],
    // Array of EscalationItem

    // UI state
    connectionStatus: null,
    // e.g., 'Connected to Mercury-2 / Inception Labs'
    newsExpanded: false,
    // Toggle "see more" state
    responseExpanded: false,
    // Toggle response panel
    lastTRAIResponse: null,
    // { response, provider, latency }
    askTRAIQuery: '',
    // Current input value

    // DOM caches
    domRefs: {
      root: null,
      newsSection: null,
      whaleSection: null,
      narratorSection: null,
      escalationSection: null,
      askInput: null,
      responseSection: null
    },
    // Timers
    statusCheckInterval: null
  };

  // ─── CSS Injection ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            /* Container */
            #${ROOT_ID} {
                display: flex;
                flex-direction: column;
                gap: 0;
                min-height: 100%;
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                border-radius: 8px;
                backdrop-filter: blur(14px) saturate(160%);
                box-shadow: var(--glass-underglow);
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                color: var(--text-primary);
                overflow: hidden;
            }

            /* Header */
            .tb-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 12px;
                border-bottom: 1px solid var(--border-color);
                flex-shrink: 0;
            }

            .tb-header-title {
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: var(--text-primary);
            }

            .tb-pulse {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--ml-color);
                box-shadow: 0 0 8px var(--ml-color), inset 0 0 2px rgba(255, 215, 0, 0.5);
                animation: tb-pulse-keyframes 1.5s ease-in-out infinite;
                flex-shrink: 0;
            }

            @keyframes tb-pulse-keyframes {
                0%, 100% { opacity: 0.6; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.15); }
            }

            .tb-header-status {
                font-size: 10px;
                color: var(--text-secondary);
                margin-left: auto;
                text-align: right;
                flex-shrink: 0;
            }

            /* Sections container */
            .tb-sections {
                display: flex;
                flex-direction: column;
                gap: 0;
                flex: 1;
                overflow-y: auto;
                padding: 0;
                min-height: 0;
            }

            /* Individual section */
            .tb-section {
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 10px 12px;
                border-bottom: 1px solid var(--border-color);
                flex-shrink: 0;
            }

            .tb-section:last-child {
                border-bottom: none;
            }

            .tb-section-title {
                font-size: 9px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                color: var(--ml-color);
            }

            /* News items */
            .tb-news-item {
                padding: 6px 8px;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.04);
                border-left: 2px solid var(--neutral-color);
                font-size: 10px;
                line-height: 1.3;
                color: var(--text-primary);
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .tb-news-item:hover {
                background: rgba(255, 255, 255, 0.08);
                border-left-color: var(--ml-color);
            }

            .tb-news-item.bullish {
                border-left-color: var(--profit-color);
            }

            .tb-news-item.neutral {
                border-left-color: var(--ml-color);
            }

            .tb-news-item.defensive {
                border-left-color: var(--loss-color);
            }

            .tb-news-time {
                font-size: 9px;
                color: var(--text-secondary);
                display: block;
                margin-bottom: 2px;
            }

            .tb-news-headline {
                display: block;
                font-weight: 500;
            }

            .tb-news-source {
                font-size: 9px;
                color: var(--text-secondary);
                display: block;
                margin-top: 2px;
            }

            /* Whale alert */
            .tb-whale-item {
                padding: 6px 8px;
                border-radius: 4px;
                background: rgba(255, 215, 0, 0.06);
                border-left: 2px solid var(--ml-color);
                font-size: 10px;
                line-height: 1.3;
                color: var(--text-primary);
            }

            .tb-whale-muted {
                padding: 6px 8px;
                font-size: 10px;
                color: var(--text-secondary);
                font-style: italic;
            }

            /* Narrator section */
            .tb-narrator-lines {
                display: flex;
                flex-direction: column;
                gap: 4px;
                max-height: 100px;
                overflow-y: auto;
            }

            .tb-narrator-line {
                padding: 4px 6px;
                border-radius: 3px;
                background: rgba(255, 255, 255, 0.03);
                border-left: 1px solid var(--core-color);
                font-size: 9px;
                line-height: 1.3;
                color: var(--text-secondary);
                animation: tb-narrator-fade-in 0.3s ease-out;
            }

            .tb-narrator-line.new {
                color: var(--text-primary);
                background: rgba(0, 204, 255, 0.08);
            }

            @keyframes tb-narrator-fade-in {
                from {
                    opacity: 0;
                    transform: translateY(-2px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            /* Escalation queue */
            .tb-escalation-item {
                padding: 6px 8px;
                border-radius: 4px;
                background: rgba(255, 51, 102, 0.08);
                border-left: 2px solid var(--loss-color);
                font-size: 10px;
                line-height: 1.3;
                color: var(--text-primary);
            }

            .tb-escalation-item.warning {
                background: rgba(255, 215, 0, 0.08);
                border-left-color: var(--ml-color);
            }

            .tb-escalation-title {
                font-weight: 600;
                display: block;
                margin-bottom: 2px;
            }

            .tb-escalation-detail {
                font-size: 9px;
                color: var(--text-secondary);
            }

            .tb-escalation-muted {
                padding: 6px 8px;
                font-size: 10px;
                color: var(--text-secondary);
                font-style: italic;
            }

            /* Ask TRAI section */
            .tb-ask-section {
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 10px 12px;
                border-top: 1px solid var(--border-color);
                flex-shrink: 0;
                background: rgba(0, 0, 0, 0.3);
            }

            .tb-ask-input {
                width: 100%;
                padding: 8px 10px;
                background: rgba(0, 0, 0, 0.6);
                border: 1px solid var(--border-color);
                border-radius: 4px;
                color: var(--text-primary);
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                outline: none;
                transition: all 0.2s ease;
            }

            .tb-ask-input:focus {
                border-color: var(--ml-color);
                box-shadow: 0 0 8px rgba(255, 215, 0, 0.2);
            }

            .tb-ask-input::placeholder {
                color: var(--text-secondary);
            }

            /* Response panel */
            .tb-response-header {
                font-size: 9px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                color: var(--ml-color);
                cursor: pointer;
                user-select: none;
                padding: 4px 8px;
                background: rgba(255, 215, 0, 0.08);
                border-radius: 3px;
                display: flex;
                align-items: center;
                gap: 6px;
                transition: background 0.2s ease;
            }

            .tb-response-header:hover {
                background: rgba(255, 215, 0, 0.12);
            }

            .tb-response-arrow {
                display: inline-block;
                font-size: 8px;
                transform: rotate(0deg);
                transition: transform 0.2s ease;
            }

            .tb-response-header.expanded .tb-response-arrow {
                transform: rotate(90deg);
            }

            .tb-response-body {
                display: none;
                max-height: 0;
                overflow: hidden;
                transition: max-height 0.3s ease, opacity 0.3s ease;
                opacity: 0;
            }

            .tb-response-body.expanded {
                display: block;
                max-height: 200px;
                opacity: 1;
                overflow-y: auto;
                padding: 8px 10px;
                background: rgba(0, 204, 255, 0.05);
                border-radius: 4px;
                margin-top: 4px;
                border-left: 2px solid var(--core-color);
                font-size: 9px;
                line-height: 1.4;
                color: var(--text-secondary);
            }

            /* Scrollbar styling */
            .tb-sections::-webkit-scrollbar,
            .tb-narrator-lines::-webkit-scrollbar,
            .tb-response-body::-webkit-scrollbar {
                width: 4px;
            }

            .tb-sections::-webkit-scrollbar-track,
            .tb-narrator-lines::-webkit-scrollbar-track,
            .tb-response-body::-webkit-scrollbar-track {
                background: transparent;
            }

            .tb-sections::-webkit-scrollbar-thumb,
            .tb-narrator-lines::-webkit-scrollbar-thumb,
            .tb-response-body::-webkit-scrollbar-thumb {
                background: rgba(255, 215, 0, 0.2);
                border-radius: 2px;
            }

            .tb-sections::-webkit-scrollbar-thumb:hover,
            .tb-narrator-lines::-webkit-scrollbar-thumb:hover,
            .tb-response-body::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 215, 0, 0.4);
            }

            /* Expand/collapse toggle */
            .tb-see-more {
                font-size: 9px;
                color: var(--ml-color);
                cursor: pointer;
                padding: 4px 6px;
                border-radius: 3px;
                background: rgba(255, 215, 0, 0.08);
                border: 1px solid rgba(255, 215, 0, 0.2);
                text-align: center;
                transition: all 0.2s ease;
                user-select: none;
            }

            .tb-see-more:hover {
                background: rgba(255, 215, 0, 0.12);
                border-color: rgba(255, 215, 0, 0.3);
            }
        `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── DOM Rendering ──────────────────────────────────────────────
  function mount() {
    if (state.mounted) return true;
    const root = document.getElementById(ROOT_ID);
    if (!root) return false;
    root.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'tb-header';
    header.innerHTML = `
            <span class="tb-pulse"></span>
            <span class="tb-header-title">TRAI BRAIN</span>
            <div class="tb-header-status">Connecting...</div>
        `;
    state.domRefs.root = root;
    root.appendChild(header);

    // Sections container
    const sections = document.createElement('div');
    sections.className = 'tb-sections';
    root.appendChild(sections);

    // News section
    const newsSection = document.createElement('div');
    newsSection.className = 'tb-section';
    newsSection.innerHTML = '<div class="tb-section-title">Latest News</div>';
    state.domRefs.newsSection = newsSection;
    sections.appendChild(newsSection);

    // Whale section
    const whaleSection = document.createElement('div');
    whaleSection.className = 'tb-section';
    whaleSection.innerHTML = '<div class="tb-section-title">Whale Alert</div>';
    state.domRefs.whaleSection = whaleSection;
    sections.appendChild(whaleSection);

    // Narrator section
    const narratorSection = document.createElement('div');
    narratorSection.className = 'tb-section';
    narratorSection.innerHTML = '<div class="tb-section-title">Narrator Output</div>';
    state.domRefs.narratorSection = narratorSection;
    sections.appendChild(narratorSection);

    // Escalation section
    const escalationSection = document.createElement('div');
    escalationSection.className = 'tb-section';
    escalationSection.innerHTML = '<div class="tb-section-title">Escalation Queue</div>';
    state.domRefs.escalationSection = escalationSection;
    sections.appendChild(escalationSection);

    // Ask TRAI section
    const askSection = document.createElement('div');
    askSection.className = 'tb-ask-section';
    askSection.innerHTML = `
            <input type="text" class="tb-ask-input" placeholder="Ask TRAI about a ticker, news, or trade...">
            <div class="tb-response-section"></div>
        `;
    state.domRefs.askInput = askSection.querySelector('.tb-ask-input');
    state.domRefs.responseSection = askSection.querySelector('.tb-response-section');
    root.appendChild(askSection);

    // Wire up ask input
    state.domRefs.askInput.addEventListener('keypress', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const query = state.domRefs.askInput.value.trim();
        if (query) {
          askTRAI(query);
          state.domRefs.askInput.value = '';
        }
      }
    });
    state.mounted = true;
    return true;
  }
  function formatTime(ts) {
    const d = new Date(ts);
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const meridiem = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${meridiem}`;
  }
  function renderNews() {
    if (!state.domRefs.newsSection) return;

    // Keep title, remove items
    const title = state.domRefs.newsSection.querySelector('.tb-section-title');
    const existingItems = state.domRefs.newsSection.querySelectorAll('.tb-news-item, .tb-see-more');
    existingItems.forEach(el => el.remove());
    const filtered = state.news.filter(n => !state.selectedTicker || n.ticker === state.selectedTicker);
    const visible = filtered.slice(0, NEWS_VISIBLE_COUNT);
    if (visible.length === 0) {
      const muted = document.createElement('div');
      muted.className = 'tb-news-muted';
      muted.textContent = 'Awaiting market events...';
      state.domRefs.newsSection.appendChild(muted);
      return;
    }
    visible.forEach(item => {
      const el = document.createElement('div');
      el.className = `tb-news-item ${item.sentiment}`;
      const confMod = item.confidence_modifier ? ` (conf mod: ${item.confidence_modifier})` : '';
      el.innerHTML = `
                <span class="tb-news-time">${formatTime(item.ts)}</span>
                <span class="tb-news-headline">${item.headline}${confMod}</span>
                <span class="tb-news-source">${item.source}${item.ticker ? ' • ' + item.ticker : ''}</span>
            `;
      state.domRefs.newsSection.appendChild(el);
    });

    // "See more" if hidden items exist
    if (filtered.length > NEWS_VISIBLE_COUNT) {
      const seeMore = document.createElement('div');
      seeMore.className = 'tb-see-more';
      seeMore.textContent = `+${filtered.length - NEWS_VISIBLE_COUNT} more`;
      seeMore.addEventListener('click', () => {
        state.newsExpanded = !state.newsExpanded;
        renderNews();
      });
      state.domRefs.newsSection.appendChild(seeMore);
    }
  }
  function renderWhale() {
    if (!state.domRefs.whaleSection) return;
    const title = state.domRefs.whaleSection.querySelector('.tb-section-title');
    const existingItems = state.domRefs.whaleSection.querySelectorAll('.tb-whale-item, .tb-whale-muted');
    existingItems.forEach(el => el.remove());
    const filtered = state.whales.filter(w => !state.selectedTicker || w.ticker === state.selectedTicker);
    const item = filtered.length > 0 ? filtered[0] : null;
    if (!item) {
      const muted = document.createElement('div');
      muted.className = 'tb-whale-muted';
      muted.textContent = 'Watching for whales...';
      state.domRefs.whaleSection.appendChild(muted);
      return;
    }
    const el = document.createElement('div');
    el.className = 'tb-whale-item';
    el.innerHTML = `
            <span class="tb-news-time">${formatTime(item.ts)}</span>
            <span class="tb-news-headline">${item.description}</span>
            ${item.source ? `<span class="tb-news-source">${item.source}</span>` : ''}
        `;
    state.domRefs.whaleSection.appendChild(el);
  }
  function renderNarrator() {
    if (!state.domRefs.narratorSection) return;
    const title = state.domRefs.narratorSection.querySelector('.tb-section-title');
    const existingLines = state.domRefs.narratorSection.querySelectorAll('.tb-narrator-lines');
    existingLines.forEach(el => el.remove());
    if (state.narrator.length === 0) {
      const muted = document.createElement('div');
      muted.className = 'tb-whale-muted';
      muted.textContent = 'Awaiting narrator updates...';
      state.domRefs.narratorSection.appendChild(muted);
      return;
    }
    const container = document.createElement('div');
    container.className = 'tb-narrator-lines';
    const visible = state.narrator.slice(0, NARRATOR_LINES_VISIBLE);
    visible.forEach((line, idx) => {
      const el = document.createElement('div');
      el.className = `tb-narrator-line ${idx === 0 ? 'new' : ''}`;
      el.textContent = line.text;
      container.appendChild(el);
    });
    state.domRefs.narratorSection.appendChild(container);
  }
  function renderEscalation() {
    if (!state.domRefs.escalationSection) return;
    const title = state.domRefs.escalationSection.querySelector('.tb-section-title');
    const existingItems = state.domRefs.escalationSection.querySelectorAll('.tb-escalation-item, .tb-escalation-muted');
    existingItems.forEach(el => el.remove());
    if (state.escalations.length === 0) {
      const muted = document.createElement('div');
      muted.className = 'tb-escalation-muted';
      muted.textContent = '0 items requiring operator attention';
      state.domRefs.escalationSection.appendChild(muted);
      return;
    }
    state.escalations.forEach((esc, idx) => {
      const el = document.createElement('div');
      el.className = `tb-escalation-item ${esc.level}`;
      const detail = esc.detail ? `<div class="tb-escalation-detail">${esc.detail}</div>` : '';
      el.innerHTML = `
                <div class="tb-escalation-title">${idx + 1}. ${esc.title}</div>
                ${detail}
            `;
      state.domRefs.escalationSection.appendChild(el);
    });
  }
  function updateConnectionStatus() {
    const header = document.querySelector('.tb-header-status');
    if (header) {
      header.textContent = state.connectionStatus || 'Disconnected';
    }
  }

  // ─── WS Event Handlers ──────────────────────────────────────────
  // 'news_event' — DORMANT. Backend doesn't emit this yet (planned: TRAI
  // NLP+websearch crawler will broadcast). Handler is wired so the panel
  // lights up automatically once the emitter ships. Strict gating: drop any
  // malformed event rather than synthesizing placeholder text.
  function onNewsEvent(d) {
    try {
      const data = d && d.data ? d.data : d;
      if (!data || !data.headline) return; // STRICT — no placeholder text
      const event = {
        ts: data.ts != null ? Number(data.ts) : data.timestamp != null ? Number(data.timestamp) : Date.now(),
        sentiment: ['bullish', 'neutral', 'defensive'].includes(data.sentiment) ? data.sentiment : 'neutral',
        headline: String(data.headline),
        source: String(data.source || 'TRAI'),
        ticker: data.ticker ? String(data.ticker) : undefined,
        confidence_modifier: data.confidence_modifier ? String(data.confidence_modifier) : undefined
      };
      if (!event.ts) return;
      state.news.unshift(event);
      if (state.news.length > 30) state.news.pop();
      renderNews();
    } catch (_) {/* swallow */}
  }

  // Resolve current trading symbol (single-pair bot, no ticker on event).
  function resolveCurrentSymbol() {
    try {
      const sel = document.getElementById('cp-assetSelector');
      if (sel && sel.value) return String(sel.value).toUpperCase();
    } catch (_) {/* swallow */}
    return 'ASSET';
  }

  // Bot's whale_trade event shape:
  //   { type:'whale_trade', size, price, side:'BUY'|'SELL', timestamp }
  // size = USD notional (volume * price). side derived from candle close vs open.
  function onWhaleEvent(d) {
    try {
      const data = d && d.data ? d.data : d;
      if (!data) return;
      const sizeUsd = Number(data.size);
      const price = Number(data.price);
      if (!isFinite(sizeUsd) || !isFinite(price)) return;
      const side = String(data.side || '').toUpperCase();
      const ticker = data.ticker ? String(data.ticker) : resolveCurrentSymbol();

      // Format $1.2M / $850K / $42 readout
      const sizeStr = sizeUsd >= 1e6 ? `$${(sizeUsd / 1e6).toFixed(1)}M` : sizeUsd >= 1e3 ? `$${(sizeUsd / 1e3).toFixed(0)}K` : `$${sizeUsd.toFixed(0)}`;
      const arrow = side === 'BUY' ? '▲' : side === 'SELL' ? '▼' : '◆';
      const desc = `${arrow} ${side || '—'} ${sizeStr} @ $${price.toFixed(2)}`;
      const event = {
        ts: data.timestamp != null ? Number(data.timestamp) : Date.now(),
        description: desc,
        ticker: ticker,
        source: 'aggregated tape',
        side: side,
        sizeUsd: sizeUsd,
        price: price
      };
      state.whales.unshift(event);
      if (state.whales.length > 20) state.whales.pop();
      renderWhale();
    } catch (_) {/* swallow */}
  }

  // Bot's narrator_event shape:
  //   { type:'narrator_event', scope:'USER'|'ARCHITECT', event, timestamp, text, ... }
  // We only render USER-scope content (sanitized customer story). Architect
  // notes are operator-internal and stay off the customer-facing brain.
  function onNarratorEvent(d) {
    try {
      const data = d && d.data ? d.data : d;
      if (!data) return;
      // Filter to USER scope when present; if scope is missing assume USER
      const scope = data.scope ? String(data.scope).toUpperCase() : 'USER';
      if (scope !== 'USER') return;
      if (!data.text) return;
      addNarratorLine(String(data.text));
    } catch (_) {/* swallow */}
  }

  // Bot 'bot_thinking' — heartbeat only; we don't push to narrator list (that
  // would clutter the customer-facing story). Used to keep the header dot
  // alive even during quiet stretches between USER-scope narrator events.
  let _lastBotThinkingAt = 0;
  function onBotThinking(_d) {
    _lastBotThinkingAt = Date.now();
  }
  function onEscalationEvent(data) {
    try {
      if (!data) return;
      const event = {
        id: data.id != null ? Number(data.id) : Date.now(),
        title: String(data.title || 'Escalation'),
        detail: data.detail ? String(data.detail) : undefined,
        level: ['warning', 'critical'].includes(data.level) ? data.level : 'critical'
      };
      state.escalations.push(event);
      if (state.escalations.length > 10) state.escalations.shift();
      renderEscalation();
    } catch (_) {/* swallow */}
  }

  // ─── Public API ─────────────────────────────────────────────────
  function addNarratorLine(text) {
    try {
      if (!text) return;
      const line = {
        ts: Date.now(),
        text: String(text)
      };
      state.narrator.unshift(line);
      if (state.narrator.length > NARRATOR_MAX_BUFFER) {
        state.narrator.pop();
      }
      renderNarrator();
    } catch (_) {/* swallow */}
  }
  async function askTRAI(query) {
    try {
      if (!query) return;

      // Show loading state
      const responseBody = state.domRefs.responseSection;
      if (responseBody) {
        responseBody.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'tb-response-header expanded';
        header.innerHTML = '<span class="tb-response-arrow">▶</span> TRAI Response';
        responseBody.appendChild(header);
        const body = document.createElement('div');
        body.className = 'tb-response-body expanded';
        body.textContent = 'Thinking...';
        responseBody.appendChild(body);
        header.addEventListener('click', () => {
          header.classList.toggle('expanded');
          body.classList.toggle('expanded');
        });
      }

      // POST to /api/trai/analyze
      const response = await fetch('/api/trai/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: query,
          maxTokens: 1500
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();

      // Store and display response
      state.lastTRAIResponse = {
        response: data.response || '',
        provider: data.provider || 'Unknown',
        latency: data.latency || 0
      };
      if (responseBody) {
        responseBody.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'tb-response-header expanded';
        header.innerHTML = '<span class="tb-response-arrow">▶</span> TRAI Response';
        responseBody.appendChild(header);
        const body = document.createElement('div');
        body.className = 'tb-response-body expanded';
        body.textContent = data.response || '(Empty response)';
        responseBody.appendChild(body);
        header.addEventListener('click', () => {
          header.classList.toggle('expanded');
          body.classList.toggle('expanded');
        });
      }
    } catch (err) {
      try {
        const responseBody = state.domRefs.responseSection;
        if (responseBody) {
          responseBody.innerHTML = '';
          const header = document.createElement('div');
          header.className = 'tb-response-header expanded';
          header.innerHTML = '<span class="tb-response-arrow">▶</span> TRAI Response';
          responseBody.appendChild(header);
          const body = document.createElement('div');
          body.className = 'tb-response-body expanded';
          body.textContent = `Error: ${err.message}`;
          body.style.color = 'var(--loss-color)';
          responseBody.appendChild(body);
          header.addEventListener('click', () => {
            header.classList.toggle('expanded');
            body.classList.toggle('expanded');
          });
        }
      } catch (_) {/* swallow */}
    }
  }
  function setConnectionStatus(status) {
    state.connectionStatus = status;
    updateConnectionStatus();
  }
  function clearAll() {
    state.news = [];
    state.whales = [];
    state.narrator = [];
    state.escalations = [];
    renderNews();
    renderWhale();
    renderNarrator();
    renderEscalation();
  }

  // ─── Lifecycle ──────────────────────────────────────────────────
  const api = {
    init() {
      try {
        injectStyles();
        if (!mount()) return;
        renderNews();
        renderWhale();
        renderNarrator();
        renderEscalation();

        // Subscribe to WS events via real socket (poll until ready)
        (function bindSocket() {
          const socket = OGZ && typeof OGZ.get === 'function' ? OGZ.get('Socket') : null;
          if (!socket || typeof socket.registerHandler !== 'function') {
            setTimeout(bindSocket, 250);
            return;
          }
          // Verified-emitter subs
          socket.registerHandler('whale_trade', e => {
            try {
              onWhaleEvent(e);
            } catch (_) {}
          });
          socket.registerHandler('narrator_event', e => {
            try {
              onNarratorEvent(e);
            } catch (_) {}
          });
          socket.registerHandler('bot_thinking', e => {
            try {
              onBotThinking(e);
            } catch (_) {}
          });
          // Future emitters — sub'd defensively so when backend ships
          // them they light up automatically. Until then they no-op.
          socket.registerHandler('news_event', e => {
            try {
              onNewsEvent(e);
            } catch (_) {}
          });
          socket.registerHandler('escalation', e => {
            try {
              onEscalationEvent(e);
            } catch (_) {}
          });
        })();

        // Subscribe to bus events
        if (OGZ && OGZ.bus) {
          OGZ.bus.on('watchlist:select', data => {
            try {
              state.selectedTicker = data && data.ticker ? String(data.ticker) : null;
              renderNews();
              renderWhale();
            } catch (_) {/* swallow */}
          });
        }

        // Check TRAI status periodically
        async function checkStatus() {
          try {
            const response = await fetch('/api/trai/status');
            if (response.ok) {
              const status = await response.json();
              const connStr = `Connected to ${status.model || 'Unknown'} / ${status.providerName || 'Unknown'}`;
              setConnectionStatus(connStr);
            } else {
              setConnectionStatus('Status check failed');
            }
          } catch (_) {
            setConnectionStatus('Disconnected');
          }
        }
        checkStatus();
        state.statusCheckInterval = setInterval(checkStatus, STATUS_CHECK_INTERVAL_MS);
      } catch (_) {/* swallow */}
    },
    askTRAI,
    addNarratorLine,
    setConnectionStatus,
    clearAll,
    teardown() {
      try {
        if (state.statusCheckInterval) {
          clearInterval(state.statusCheckInterval);
          state.statusCheckInterval = null;
        }
        if (state.domRefs.root) {
          state.domRefs.root.innerHTML = '';
        }
        const style = document.getElementById(STYLE_ID);
        if (style) style.remove();
        state.mounted = false;
        state.news = [];
        state.whales = [];
        state.narrator = [];
        state.escalations = [];
      } catch (_) {/* swallow */}
    },
    _compute() {
      return {
        mounted: state.mounted,
        selectedTicker: state.selectedTicker,
        newsCount: state.news.length,
        whalesCount: state.whales.length,
        narratorCount: state.narrator.length,
        escalationsCount: state.escalations.length,
        connectionStatus: state.connectionStatus,
        lastResponse: state.lastTRAIResponse
      };
    }
  };

  // ─── Registration ───────────────────────────────────────────────
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('TRAIBrain', api);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('TRAIBrain', api);
      }
    });
  }
  try {
    window.OGZTRAIBrain = api;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/trai-brain.js", error: String((e && e.message) || e) }); }

// public/js/panels/victory-animations.js
try { (() => {
/**
 * victory-animations.js — VictoryAnimations: programmatic celebration audio
 *
 * Synthesizes celebration sounds via Web Audio API on demand — NO external
 * audio files required. Ships zero MB of assets. Subscribes to OGZ.bus
 * 'celebration:win' events (emitted by CustomAlerts on profitable closes)
 * and plays the appropriate fanfare based on P&L magnitude.
 *
 * Sound bank (all synthesized at play-time):
 *   - smallWin    → 800→1200Hz coin chime (~$0–$50 wins)
 *   - mediumWin   → C-E-G-C arpeggio level-up (~$50–$250 wins)
 *   - bigWin      → 3-stage fanfare with sweep (~$250+ wins)
 *   - milestone   → triumphant chord stack (milestone tier crossings)
 *
 * Honest behavior: silent until first user interaction (Web Audio policy in
 * Chrome / Safari requires gesture before AudioContext.resume()). After
 * first click/keypress anywhere, audio engine is armed for the session.
 *
 * Self-registers as OGZ.VictoryAnimations.
 * Subscribes to OGZ.bus 'celebration:win'.
 *
 * Public API:
 *   init() — wire bus listener, prep audio context
 *   play(type) — manual trigger ('smallWin' | 'mediumWin' | 'bigWin' | 'milestone')
 *   setVolume(0..1) — adjust master gain
 *   toggle() — mute/unmute
 *   teardown()
 *   _compute() — debug snapshot
 *
 * @module public/js/panels/victory-animations
 */
(function (OGZ) {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────
  const state = {
    audioContext: null,
    masterGain: null,
    enabled: true,
    volume: 0.55,
    unlocked: false,
    winsPlayed: 0
  };

  // P&L bands → sound type
  const WIN_TIERS = [{
    min: 250,
    type: 'bigWin'
  }, {
    min: 50,
    type: 'mediumWin'
  }, {
    min: 0,
    type: 'smallWin'
  }];

  // ─── Audio Context Bootstrap (gesture-gated for browser policy) ─────
  function getCtx() {
    if (state.audioContext) return state.audioContext;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    state.audioContext = new Ctx();
    state.masterGain = state.audioContext.createGain();
    state.masterGain.gain.value = state.volume;
    state.masterGain.connect(state.audioContext.destination);
    return state.audioContext;
  }
  function unlockOnGesture() {
    if (state.unlocked) return;
    const unlock = () => {
      const ctx = getCtx();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      state.unlocked = true;
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock, {
      once: true
    });
    window.addEventListener('keydown', unlock, {
      once: true
    });
    window.addEventListener('touchstart', unlock, {
      once: true
    });
  }

  // ─── Sound Primitives ───────────────────────────────────────────────
  function tone(freq, startTime, duration, options) {
    const ctx = getCtx();
    if (!ctx) return;
    const opts = options || {};
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(freq, startTime);
    if (opts.sweepTo) {
      osc.frequency.exponentialRampToValueAtTime(opts.sweepTo, startTime + duration);
    }
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(opts.peak || 0.3, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain);
    gain.connect(state.masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }
  function chord(freqs, startTime, duration, options) {
    freqs.forEach(f => tone(f, startTime, duration, options));
  }

  // ─── Sound Bank ─────────────────────────────────────────────────────
  function playSmallWin() {
    const ctx = getCtx();
    if (!ctx || !state.enabled) return;
    const t = ctx.currentTime;
    // Quick coin-chime: 800Hz → 1200Hz sweep
    tone(800, t, 0.18, {
      type: 'sine',
      sweepTo: 1200,
      peak: 0.35
    });
    tone(1600, t + 0.05, 0.12, {
      type: 'triangle',
      peak: 0.15
    });
  }
  function playMediumWin() {
    const ctx = getCtx();
    if (!ctx || !state.enabled) return;
    const t = ctx.currentTime;
    // C-E-G-C arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      tone(freq, t + i * 0.08, 0.25, {
        type: 'triangle',
        peak: 0.28
      });
    });
  }
  function playBigWin() {
    const ctx = getCtx();
    if (!ctx || !state.enabled) return;
    const t = ctx.currentTime;
    // 3-stage fanfare: opener chord, sweep up, triumph chord
    // Stage 1: C major opener
    chord([523.25, 659.25, 783.99], t, 0.25, {
      type: 'sawtooth',
      peak: 0.22
    });
    // Stage 2: ascending sweep
    tone(523.25, t + 0.25, 0.3, {
      type: 'square',
      sweepTo: 1046.5,
      peak: 0.2
    });
    // Stage 3: triumph chord (C major + octave + fifth above)
    chord([523.25, 659.25, 783.99, 1046.50, 1318.51], t + 0.55, 0.6, {
      type: 'triangle',
      peak: 0.3
    });
  }
  function playMilestone() {
    const ctx = getCtx();
    if (!ctx || !state.enabled) return;
    const t = ctx.currentTime;
    // Milestone chord: rich stacked fifths over 1.2s
    // F major triad → C major triad → high octave finish
    chord([349.23, 440.00, 523.25], t, 0.4, {
      type: 'sawtooth',
      peak: 0.18
    });
    chord([523.25, 659.25, 783.99], t + 0.4, 0.4, {
      type: 'sawtooth',
      peak: 0.22
    });
    chord([1046.50, 1318.51, 1567.98], t + 0.8, 0.5, {
      type: 'triangle',
      peak: 0.28
    });
  }

  // ─── Dispatch by Win Tier ───────────────────────────────────────────
  function play(type) {
    if (!state.enabled) return;
    switch (type) {
      case 'smallWin':
        playSmallWin();
        break;
      case 'mediumWin':
        playMediumWin();
        break;
      case 'bigWin':
        playBigWin();
        break;
      case 'milestone':
        playMilestone();
        break;
      default:
        playSmallWin();
    }
    state.winsPlayed++;
  }
  function tierForPnl(pnl) {
    const abs = Math.abs(Number(pnl) || 0);
    for (const t of WIN_TIERS) {
      if (abs >= t.min) return t.type;
    }
    return 'smallWin';
  }

  // ─── Bus Listener — CustomAlerts emits 'celebration:win' on profit close
  function onWin(payload) {
    try {
      if (!payload) return;
      const tier = tierForPnl(payload.pnl);
      play(tier);
    } catch (_) {/* swallow */}
  }
  function onMilestone(_payload) {
    // The MilestoneEffects module owns tier decisions; we just play the
    // milestone sound when it tells us. (MilestoneEffects will emit a
    // dedicated 'celebration:milestone-hit' event when an actual tier
    // crossing fires — distinct from the per-state_update 'celebration:milestone'
    // heartbeat which just carries the running balance.)
    play('milestone');
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const api = {
    init() {
      try {
        unlockOnGesture();
        // Subscribe via OGZ.bus once it exists (CustomAlerts creates it on init)
        (function bindBus() {
          if (!OGZ.bus) {
            setTimeout(bindBus, 100);
            return;
          }
          OGZ.bus.on('celebration:win', onWin);
          OGZ.bus.on('celebration:milestone-hit', onMilestone);
        })();
      } catch (_) {/* swallow */}
    },
    play,
    setVolume(v) {
      state.volume = Math.max(0, Math.min(1, Number(v) || 0));
      if (state.masterGain) state.masterGain.gain.value = state.volume;
    },
    toggle() {
      state.enabled = !state.enabled;
      return state.enabled;
    },
    teardown() {
      try {
        if (state.audioContext && state.audioContext.close) {
          state.audioContext.close();
        }
      } catch (_) {/* swallow */}
      state.audioContext = null;
      state.masterGain = null;
      state.unlocked = false;
    },
    _compute() {
      return {
        enabled: state.enabled,
        volume: state.volume,
        unlocked: state.unlocked,
        winsPlayed: state.winsPlayed,
        ctxState: state.audioContext ? state.audioContext.state : 'none'
      };
    }
  };

  // ─── Registration ───────────────────────────────────────────────────
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('VictoryAnimations', api);
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('VictoryAnimations', api);
      }
    });
  }
  try {
    window.OGZVictoryAnimations = api;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/victory-animations.js", error: String((e && e.message) || e) }); }

// public/js/panels/voice-fx.js
try { (() => {
/**
 * voice-fx.js — VoiceFXSystem: Web Audio reactive accent FX engine
 *
 * Plays short synthesized "feel" sounds tied to emotion presets. Designed to
 * fire ALONGSIDE the celebration toasts, victory sounds, and voice lines —
 * adding a third audio layer (ambient texture) that gives the dashboard a
 * sense of "alive reactivity." Not for routing speech (the Web Audio API
 * can't intercept speechSynthesis output in most browsers). Pure synthesized
 * accent tones with per-emotion reverb/delay/filter color.
 *
 * 5 presets (carried from the original VoiceFXSystem.js):
 *   profit   — bright reverb, light delay, high pitch, high excitement
 *   loss     — short reverb, no delay, low pitch, low excitement
 *   warning  — medium reverb, short delay, medium pitch, medium excitement
 *   epic     — long reverb, long delay, balanced pitch, max excitement
 *   calm     — short reverb, no delay, neutral pitch, low excitement
 *
 * Subscribes to OGZ.bus:
 *   - 'celebration:win'             → profit (or epic if pnl > $250)
 *   - 'celebration:loss'            → loss
 *   - 'celebration:milestone-hit'   → epic
 *
 * Public API:
 *   init()
 *   playEffect(preset) — manual trigger
 *   setVolume(0..1)
 *   setEnabled(bool)
 *   teardown()
 *   _compute()
 *
 * @module public/js/panels/voice-fx
 */
(function (OGZ) {
  'use strict';

  // Emotion preset definitions (from original VoiceFXSystem.js)
  const PRESETS = {
    profit: {
      reverb: 0.35,
      delay: 0.12,
      pitch: 1.20,
      excitement: 0.80,
      tone: 880,
      color: '#22c55e'
    },
    loss: {
      reverb: 0.12,
      delay: 0.00,
      pitch: 0.80,
      excitement: 0.30,
      tone: 220,
      color: '#ef4444'
    },
    warning: {
      reverb: 0.22,
      delay: 0.06,
      pitch: 0.90,
      excitement: 0.60,
      tone: 440,
      color: '#fbbf24'
    },
    epic: {
      reverb: 0.55,
      delay: 0.22,
      pitch: 1.10,
      excitement: 1.00,
      tone: 660,
      color: '#a78bfa'
    },
    calm: {
      reverb: 0.10,
      delay: 0.00,
      pitch: 1.00,
      excitement: 0.20,
      tone: 330,
      color: '#60a5fa'
    }
  };

  // ─── State ──────────────────────────────────────────────────────────
  const state = {
    ctx: null,
    masterGain: null,
    reverb: null,
    // ConvolverNode
    delay: null,
    // DelayNode
    delayFeedback: null,
    // GainNode
    filter: null,
    // BiquadFilterNode
    volume: 0.5,
    enabled: true,
    unlocked: false,
    effectsPlayed: 0
  };

  // ─── Context Init (gesture-gated) ───────────────────────────────────
  function getCtx() {
    if (state.ctx) return state.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    state.ctx = new Ctx();
    state.masterGain = state.ctx.createGain();
    state.masterGain.gain.value = state.volume;

    // Effects chain
    state.reverb = state.ctx.createConvolver();
    state.reverb.buffer = makeReverbImpulse(state.ctx, 1.6, 2.4);
    state.delay = state.ctx.createDelay(1.0);
    state.delay.delayTime.value = 0.22;
    state.delayFeedback = state.ctx.createGain();
    state.delayFeedback.gain.value = 0.32;
    state.delay.connect(state.delayFeedback);
    state.delayFeedback.connect(state.delay);
    state.filter = state.ctx.createBiquadFilter();
    state.filter.type = 'highpass';
    state.filter.frequency.value = 90;

    // Routing: voice → filter → reverb / delay / dry → master → out
    state.filter.connect(state.reverb);
    state.filter.connect(state.delay);
    state.reverb.connect(state.masterGain);
    state.delay.connect(state.masterGain);
    state.masterGain.connect(state.ctx.destination);
    return state.ctx;
  }
  function makeReverbImpulse(ctx, durationSec, decay) {
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * durationSec));
    const impulse = ctx.createBuffer(2, length, rate);
    // Synth impulse response — no Math.random. Deterministic decaying noise
    // generated with a small LCG so the reverb tail is the same every time.
    let lcg = 1337;
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        lcg = lcg * 1103515245 + 12345 & 0x7fffffff;
        const noise = lcg / 0x7fffffff * 2 - 1;
        data[i] = noise * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }
  function unlockOnGesture() {
    if (state.unlocked) return;
    const unlock = () => {
      const ctx = getCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      state.unlocked = true;
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock, {
      once: true
    });
    window.addEventListener('keydown', unlock, {
      once: true
    });
    window.addEventListener('touchstart', unlock, {
      once: true
    });
  }

  // ─── Effect Synth ───────────────────────────────────────────────────
  function playEffect(presetKey) {
    if (!state.enabled) return;
    const preset = PRESETS[presetKey];
    if (!preset) return;
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const baseFreq = preset.tone * preset.pitch;
    const duration = 0.35 + preset.excitement * 0.55;

    // Main accent tone
    const osc = ctx.createOscillator();
    osc.type = preset.excitement > 0.6 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * (preset.excitement > 0.5 ? 1.4 : 0.85), t + duration);

    // Per-shot envelope (no audible click)
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.35 * preset.excitement + 0.05, t + 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    // Wet/dry mix routing
    const wetReverb = ctx.createGain();
    wetReverb.gain.value = preset.reverb;
    const wetDelay = ctx.createGain();
    wetDelay.gain.value = preset.delay;
    const dry = ctx.createGain();
    dry.gain.value = Math.max(0.2, 1.0 - preset.reverb - preset.delay);
    osc.connect(env);
    env.connect(state.filter); // through filter chain into reverb/delay sends
    env.connect(dry); // dry path
    dry.connect(state.masterGain);

    // The filter already connects to reverb + delay; we modulate their levels here
    state.reverb.connect(wetReverb);
    wetReverb.connect(state.masterGain);
    state.delay.connect(wetDelay);
    wetDelay.connect(state.masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.2);

    // Cleanup wet sends after the tail
    setTimeout(() => {
      try {
        wetReverb.disconnect();
      } catch (_) {}
      try {
        wetDelay.disconnect();
      } catch (_) {}
      try {
        dry.disconnect();
      } catch (_) {}
      try {
        env.disconnect();
      } catch (_) {}
    }, (duration + 1.0) * 1000);
    state.effectsPlayed++;
  }

  // ─── Bus Subscribers ────────────────────────────────────────────────
  function onWin(payload) {
    const pnl = payload && Math.abs(Number(payload.pnl) || 0);
    playEffect(pnl >= 250 ? 'epic' : 'profit');
  }
  function onLoss(_payload) {
    playEffect('loss');
  }
  function onMilestone(_payload) {
    playEffect('epic');
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const api = {
    init() {
      try {
        unlockOnGesture();
        (function bindBus() {
          if (!OGZ.bus) {
            setTimeout(bindBus, 100);
            return;
          }
          OGZ.bus.on('celebration:win', onWin);
          OGZ.bus.on('celebration:loss', onLoss);
          OGZ.bus.on('celebration:milestone-hit', onMilestone);
        })();
      } catch (_) {/* swallow */}
    },
    playEffect,
    setVolume(v) {
      state.volume = Math.max(0, Math.min(1, Number(v) || 0));
      if (state.masterGain) state.masterGain.gain.value = state.volume;
    },
    setEnabled(v) {
      state.enabled = !!v;
    },
    teardown() {
      try {
        if (state.ctx && state.ctx.close) state.ctx.close();
      } catch (_) {}
      state.ctx = null;
      state.unlocked = false;
    },
    _compute() {
      return {
        enabled: state.enabled,
        volume: state.volume,
        unlocked: state.unlocked,
        effectsPlayed: state.effectsPlayed,
        ctxState: state.ctx ? state.ctx.state : 'none'
      };
    }
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('VoiceFX', api);
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('VoiceFX', api);
      }
    });
  }
  try {
    window.OGZVoiceFX = api;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/voice-fx.js", error: String((e && e.message) || e) }); }

// public/js/panels/voice-manager.js
try { (() => {
/**
 * voice-manager.js — VoiceManager: personality voice-line player
 *
 * Browser-adapted from the Mover stack's VoiceManager.js. Plays personality
 * voice lines on bot events (entries, alerts) via the Web Speech API. If/when
 * pre-recorded MP3s drop into /public/voices/, the system can swap from synth
 * to playback per line (config-driven). For now, ships with speechSynthesis
 * as the universal backend so no audio files need to be deployed.
 *
 * Priority queue: high-priority lines (boot_intro / regerts) preempt lower
 * (commentary). Lines never spam — already-playing higher priority blocks new.
 *
 * Subscribes to OGZ.bus:
 *   - 'celebration:alert' (entry / break-even info messages) → trade_signals
 *   - 'celebration:win'   → trade_sent line
 *   - 'celebration:loss'  → commentary (only every Nth loss, not every loss —
 *                          loss-recovery.js handles per-loss speech directly)
 *
 * NO synthetic events. Voice is opt-out via setEnabled(false).
 *
 * Public API:
 *   init()
 *   play(key, options) — fire a specific voice line
 *   setEnabled(bool)
 *   setRate(0.5–2.0) / setPitch(0.5–2.0) / setVolume(0–1)
 *   teardown()
 *   _compute()
 *
 * @module public/js/panels/voice-manager
 */
(function (OGZ) {
  'use strict';

  // ─── Voice Line Library ─────────────────────────────────────────────
  // Each entry: { text, category, file? (optional MP3 path), effects? }
  // categories: boot_intro / regerts / trade_signals / commentary
  // (Priority 1 = highest, can't be interrupted. Priority 4 = lowest.)
  const CATEGORY_PRIORITY = {
    boot_intro: 1,
    regerts: 2,
    final_descent: 1,
    trade_signals: 3,
    commentary: 4
  };
  const VOICE_LIB = {
    // Boot sequence
    system_boot: {
      text: "OGZ Prime initializing. Stand by for market domination.",
      category: 'boot_intro'
    },
    // Trade signals
    trade_sent: {
      text: "Trade sent. Faith restored. IQ sacrificed.",
      category: 'trade_signals'
    },
    bird_deployed: {
      text: "Bird deployed. Flight path irreversible.",
      category: 'trade_signals'
    },
    short_engaged: {
      text: "Short engaged. Bearish posture locked.",
      category: 'trade_signals'
    },
    // Commentary (rotating roast / wisdom)
    hot_patch: {
      text: "Biology isn't JavaScript. Stop trying to hot patch your hand.",
      category: 'commentary'
    },
    suture_needed: {
      text: "This wasn't a trade. This was a cry for help.",
      category: 'commentary'
    },
    i_warned_you: {
      text: "I warned you.",
      category: 'commentary'
    },
    // Regerts mode (used by separate regerts engine, but lines live here for reuse)
    zero_logic: {
      text: "Brain activity detected: none.",
      category: 'regerts'
    },
    emotional_trading: {
      text: "You're emotionally trading. I respect that.",
      category: 'regerts'
    },
    // Final descent
    gotcha_bitch: {
      text: "GOTCHA, BITCH.",
      category: 'final_descent'
    },
    negative_ghostrider: {
      text: "Negative, Ghostrider. You are not clear for logic.",
      category: 'final_descent'
    }
  };

  // ─── State ──────────────────────────────────────────────────────────
  const state = {
    enabled: true,
    rate: 1.0,
    pitch: 1.0,
    volume: 0.7,
    currentCategory: null,
    currentEndTime: 0,
    chosenVoice: null,
    playedCount: 0,
    lastFiredAt: 0,
    // Throttling — don't fire trade_signals more than once per N seconds
    minIntervalByCategory: {
      boot_intro: 0,
      final_descent: 0,
      regerts: 2000,
      trade_signals: 4000,
      commentary: 8000
    },
    lastFireByCategory: {}
  };

  // ─── Voice Picker ───────────────────────────────────────────────────
  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    const preferred = voices.find(v => /en[-_]us/i.test(v.lang) && /male|alex|fred|daniel|david/i.test(v.name)) || voices.find(v => /en[-_]us/i.test(v.lang)) || voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
    state.chosenVoice = preferred || null;
    return state.chosenVoice;
  }

  // ─── Priority Gate ──────────────────────────────────────────────────
  function canPlay(category) {
    const now = Date.now();
    // Throttle per category
    const minInterval = state.minIntervalByCategory[category] || 0;
    const lastFire = state.lastFireByCategory[category] || 0;
    if (now - lastFire < minInterval) return false;

    // Priority preemption: don't interrupt higher-priority currently playing
    if (state.currentCategory && now < state.currentEndTime) {
      const currentPrio = CATEGORY_PRIORITY[state.currentCategory] || 99;
      const newPrio = CATEGORY_PRIORITY[category] || 99;
      if (newPrio > currentPrio) return false; // lower priority = larger number
    }
    return true;
  }

  // ─── Speak ──────────────────────────────────────────────────────────
  function speak(text, category) {
    if (!state.enabled) return;
    if (!('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = state.rate;
      u.pitch = state.pitch;
      u.volume = state.volume;
      if (!state.chosenVoice) pickVoice();
      if (state.chosenVoice) u.voice = state.chosenVoice;
      // Cancel the current speech if we're preempting
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      const estDuration = Math.max(1000, text.length * 70); // rough ms estimate
      state.currentCategory = category;
      state.currentEndTime = Date.now() + estDuration;
      state.playedCount++;
      state.lastFiredAt = Date.now();
      state.lastFireByCategory[category] = state.lastFiredAt;
      u.onend = () => {
        if (state.currentCategory === category) {
          state.currentCategory = null;
          state.currentEndTime = 0;
        }
      };
    } catch (_) {/* swallow */}
  }

  // ─── play(key) — public entry ───────────────────────────────────────
  function play(key, options) {
    const line = VOICE_LIB[key];
    if (!line) return false;
    if (!canPlay(line.category)) return false;
    speak(line.text, line.category);
    return true;
  }
  function playRandomFromCategory(category) {
    const keys = Object.keys(VOICE_LIB).filter(k => VOICE_LIB[k].category === category);
    if (keys.length === 0) return false;
    // Deterministic-ish pick (timestamp-seeded, avoids true Math.random)
    const idx = Date.now() % keys.length;
    return play(keys[idx]);
  }

  // ─── Bus Subscribers ────────────────────────────────────────────────
  function onAlert(payload) {
    if (!payload) return;
    // Entry alerts → trade_signals voice line
    if (payload.type === 'info' && payload.metadata && (payload.metadata.action === 'BUY' || payload.metadata.action === 'SELL_SHORT')) {
      const key = payload.metadata.action === 'SELL_SHORT' ? 'short_engaged' : 'bird_deployed';
      play(key);
    }
  }
  function onWin(_payload) {
    play('trade_sent');
  }
  function onLoss(payload) {
    // LossRecovery already speaks on every loss — VoiceManager only fires
    // an extra "I warned you" / commentary line every ~5 losses to add
    // texture without spamming.
    const streak = payload && payload.streakLoss || 1;
    if (streak > 0 && streak % 5 === 0) {
      playRandomFromCategory('commentary');
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const api = {
    init() {
      try {
        if ('speechSynthesis' in window) {
          pickVoice();
          if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
            window.speechSynthesis.onvoiceschanged = pickVoice;
          }
        }
        (function bindBus() {
          if (!OGZ.bus) {
            setTimeout(bindBus, 100);
            return;
          }
          OGZ.bus.on('celebration:alert', onAlert);
          OGZ.bus.on('celebration:win', onWin);
          OGZ.bus.on('celebration:loss', onLoss);
        })();
      } catch (_) {/* swallow */}
    },
    play,
    playRandomFromCategory,
    setEnabled(v) {
      state.enabled = !!v;
      if (!v) try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    },
    setRate(r) {
      state.rate = Math.max(0.5, Math.min(2.0, Number(r) || 1.0));
    },
    setPitch(p) {
      state.pitch = Math.max(0.5, Math.min(2.0, Number(p) || 1.0));
    },
    setVolume(v) {
      state.volume = Math.max(0, Math.min(1.0, Number(v) || 0.7));
    },
    teardown() {
      try {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      } catch (_) {}
    },
    _compute() {
      return {
        enabled: state.enabled,
        playedCount: state.playedCount,
        rate: state.rate,
        pitch: state.pitch,
        volume: state.volume,
        voice: state.chosenVoice ? state.chosenVoice.name : null,
        currentCategory: state.currentCategory,
        libSize: Object.keys(VOICE_LIB).length
      };
    }
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('VoiceManager', api);
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('VoiceManager', api);
      }
    });
  }
  try {
    window.OGZVoiceManager = api;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/voice-manager.js", error: String((e && e.message) || e) }); }

// public/js/panels/watchlist-strip.js
try { (() => {
/**
 * watchlist-strip.js — Multi-Ticker Watchlist Selection Panel
 *
 * Centerpiece of the OGZPrime dashboard refactor: a horizontal strip of 9-12
 * selectable ticker cards, each displaying symbol, broker, current price, % change
 * since session open, position state, and a 30-bar price sparkline.
 *
 * Click a card to select it, emitting `watchlist:select` event via OGZ.bus.
 * Other panels (chart, indicators, edge analytics, pattern) listen to this event
 * and re-render for the selected symbol.
 *
 * Default ticker universe: 3 crypto (Kraken) + 6 stocks (Alpaca):
 *   TSLA, NVDA, SPY, QQQ, COIN, MARA, RIOT (ALP)
 *   BTC, ETH (KRA)
 *
 * Subscribes to WS 'price' events to populate prices and sparklines.
 * TODO verify with backend: position_update — per-ticker position state
 *   (SCAN/LONG/SHORT/COOL/FAULT). Until backend confirms, defaults to SCAN
 *   unless ticker appears in openPositions state.
 *
 * Self-registers as OGZ.WatchlistStrip via OGZ.register().
 * Mounts into <div id="watchlistStrip"></div>.
 * Emits events via OGZ.bus (minimal event bus auto-installed if absent).
 *
 * Features:
 *   - Horizontal flex layout, scrollable on overflow (>12 tickers)
 *   - Click-to-select with visual highlight (cyan border + glow)
 *   - Hover effects: brightens border, slight lift
 *   - Sparklines: green stroke for up-session, red for down
 *   - Price flashing on tick (green up, red down, brief animation)
 *   - State pills: SCAN (gray), LONG (green), SHORT (red), COOL (amber), FAULT (red pulse)
 *   - Broker badges: ALP (blue), KRA (purple)
 *   - API for runtime config: setTickers(), setSelected(), addTicker(), removeTicker()
 *
 * Self-injects fallback minimal CSS; real styling via external
 * /css/panels/watchlist-strip.css for design ownership.
 *
 * @module public/js/panels/watchlist-strip
 */
(function (OGZ) {
  'use strict';

  /**
   * @typedef {Object} Ticker
   * @property {string} symbol - Ticker symbol (e.g., 'TSLA', 'BTC')
   * @property {string} broker - Broker code ('ALP' = Alpaca, 'KRA' = Kraken, 'CB' = Coinbase)
   */

  /**
   * @typedef {Object} TickerState
   * @property {string} symbol
   * @property {string} broker
   * @property {number} price - Current price (default: 0 until first WS tick)
   * @property {number} priceOpen - Session open price (default: 0)
   * @property {string} positionState - 'SCAN' | 'LONG' | 'SHORT' | 'COOL' | 'FAULT'
   * @property {number[]} sparkline - Rolling 30-bar price buffer
   * @property {number} lastPriceFlash - Timestamp of last price flash (for animation)
   * @property {string} lastFlashDir - 'up' | 'down' | null (for flash animation CSS class)
   */

  // ─── Constants ──────────────────────────────────────────────────────
  const STYLE_ID = 'ogz-watchlist-strip-styles';
  const ROOT_ID = 'watchlistStrip';
  const SPARKLINE_BUF_SIZE = 30; // Number of bars in sparkline
  const PRICE_FLASH_MS = 400; // Duration of price flash animation
  const POSITION_POLL_MS = 2000; // Check for position state updates
  const BROKER_COLORS = {
    'ALP': {
      light: '#4287f5',
      alpha: 0.3
    },
    // Blue for Alpaca
    'KRA': {
      light: '#8b5cf6',
      alpha: 0.3
    },
    // Purple for Kraken
    'CB': {
      light: '#06b6d4',
      alpha: 0.3
    } // Teal for Coinbase (reserved)
  };
  const DEFAULT_TICKERS = [
  // Stocks (Alpaca)
  {
    symbol: 'TSLA',
    broker: 'ALP'
  }, {
    symbol: 'NVDA',
    broker: 'ALP'
  }, {
    symbol: 'SPY',
    broker: 'ALP'
  }, {
    symbol: 'QQQ',
    broker: 'ALP'
  }, {
    symbol: 'COIN',
    broker: 'ALP'
  }, {
    symbol: 'MARA',
    broker: 'ALP'
  }, {
    symbol: 'RIOT',
    broker: 'ALP'
  },
  // Crypto (Kraken)
  {
    symbol: 'BTC',
    broker: 'KRA'
  }, {
    symbol: 'ETH',
    broker: 'KRA'
  }];

  // Private state — only accessible within this IIFE
  const state = {
    mounted: false,
    tickers: [],
    // Current ticker list (Ticker[])
    tickerStates: new Map(),
    // symbol → TickerState
    selectedSymbol: null,
    // Currently selected ticker symbol
    priceHistogram: new Map(),
    // symbol → price[] (rolling buffer)
    cardElementCache: new Map(),
    // symbol → DOM element reference
    animationFrameId: null,
    // RAF handle for price flash timeouts
    openPositions: [],
    // { symbol, side: 'LONG'|'SHORT' } (from state_update)
    socketHandlersInstalled: false,
    socketHandlerSocket: null,
    positionSyncIntervalId: null
  };
  function normalizePriceMatchSymbol(symbol) {
    const raw = String(symbol || '').trim().toUpperCase();
    if (!raw) return '';
    const dashed = raw.replace(/^XBT/, 'BTC').replace(/\//g, '-');
    const cryptoMatch = dashed.match(/^(BTC|ETH|SOL)-USD$/);
    if (cryptoMatch) return cryptoMatch[1];
    const compactCryptoMatch = dashed.match(/^(BTC|XBT|ETH|SOL)USD$/);
    if (compactCryptoMatch) return compactCryptoMatch[1] === 'XBT' ? 'BTC' : compactCryptoMatch[1];
    if (dashed === 'BTC' || dashed === 'ETH' || dashed === 'SOL') return dashed;
    return dashed;
  }
  function normalizeBrokerCode(broker) {
    const raw = String(broker || '').trim().toUpperCase();
    if (!raw) return '';
    if (raw === 'KRAKEN' || raw === 'KRA') return 'KRA';
    if (raw === 'ALPACA' || raw === 'ALP') return 'ALP';
    if (raw === 'COINBASE' || raw === 'CB') return 'CB';
    return raw;
  }
  function findTickerForPriceSymbol(symbol, brokerHint, tickers = state.tickers) {
    const incoming = normalizePriceMatchSymbol(symbol);
    if (!incoming) return null;
    const matches = tickers.filter(t => normalizePriceMatchSymbol(t.symbol) === incoming);
    if (matches.length === 0) return null;
    const broker = normalizeBrokerCode(brokerHint);
    if (broker) {
      return matches.find(t => normalizeBrokerCode(t.broker) === broker) || null;
    }
    return matches.length === 1 ? matches[0] : null;
  }

  // ─── Event Bus (lightweight pubsub) ─────────────────────────────
  // Install OGZ.bus if not present. Used by WatchlistStrip to emit
  // 'watchlist:select' and by other modules to listen.
  function ensureEventBus() {
    if (OGZ && OGZ.bus) return;
    const listeners = new Map();
    const bus = {
      on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(handler);
      },
      off(event, handler) {
        if (!listeners.has(event)) return;
        const list = listeners.get(event);
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      },
      emit(event, data) {
        if (!listeners.has(event)) return;
        listeners.get(event).forEach(h => {
          try {
            h(data);
          } catch (_) {/* swallow */}
        });
      }
    };
    if (OGZ) OGZ.bus = bus;
  }

  // ─── Fallback CSS injection ─────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
            #${ROOT_ID} {
                display: flex;
                gap: 12px;
                padding: 8px 12px;
                overflow-x: auto;
                overflow-y: hidden;
                height: 90px;
                background: rgba(10, 10, 10, 0.6);
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                align-items: center;
            }
            #${ROOT_ID}::-webkit-scrollbar {
                height: 6px;
            }
            #${ROOT_ID}::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.12);
                border-radius: 3px;
            }
            .ws-card {
                flex-shrink: 0;
                width: 132px;
                padding: 10px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 6px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                cursor: pointer;
                font-family: 'JetBrains Mono', monospace;
                user-select: none;
                transition: all 0.2s ease;
            }
            .ws-card:hover {
                border-color: rgba(255, 215, 0, 0.4);
                background: rgba(255, 255, 255, 0.08);
                transform: translateY(-1px);
            }
            .ws-card.selected {
                border-color: rgba(0, 204, 255, 1);
                background: rgba(0, 204, 255, 0.12);
                box-shadow: 0 0 12px rgba(0, 204, 255, 0.3);
                transform: scale(1.02);
            }
            .ws-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 6px;
            }
            .ws-symbol {
                font-weight: 700;
                font-size: 13px;
                color: #ffffff;
            }
            .ws-broker {
                font-size: 9px;
                padding: 2px 6px;
                border-radius: 3px;
                background: rgba(255, 255, 255, 0.1);
            }
            .ws-price-row {
                display: flex;
                justify-content: space-between;
                font-size: 11px;
            }
            .ws-price {
                color: #ffffff;
                font-weight: 600;
            }
            .ws-pct {
                font-size: 10px;
            }
            .ws-pct.up { color: #00ff88; }
            .ws-pct.down { color: #ff3366; }
            .ws-sparkline-wrap {
                width: 100%;
                height: 20px;
            }
            .ws-state {
                font-size: 9px;
                padding: 3px 6px;
                border-radius: 3px;
                text-align: center;
                font-weight: 600;
                text-transform: uppercase;
            }
            .ws-state.SCAN { background: rgba(100, 100, 100, 0.3); color: #a0a0a0; }
            .ws-state.LONG { background: rgba(0, 255, 136, 0.2); color: #00ff88; }
            .ws-state.SHORT { background: rgba(255, 51, 102, 0.2); color: #ff3366; }
            .ws-state.COOL { background: rgba(255, 215, 0, 0.2); color: #ffd700; }
            .ws-state.FAULT { background: rgba(255, 51, 102, 0.2); color: #ff3366; animation: ws-fault-pulse 1s ease-in-out infinite; }
            @keyframes ws-fault-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            @keyframes ws-price-flash-up {
                0% { background: rgba(0, 255, 136, 0.2); }
                100% { background: transparent; }
            }
            @keyframes ws-price-flash-down {
                0% { background: rgba(255, 51, 102, 0.2); }
                100% { background: transparent; }
            }
            .ws-card.flash-up { animation: ws-price-flash-up 0.4s ease-out; }
            .ws-card.flash-down { animation: ws-price-flash-down 0.4s ease-out; }
        `;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ─── DOM Management ────────────────────────────────────────────────
  function mount() {
    if (state.mounted) return true;
    const root = document.getElementById(ROOT_ID);
    if (!root) return false;
    root.innerHTML = '';
    root.addEventListener('click', onCardClick);
    state.mounted = true;
    return true;
  }

  /**
   * Format price to 2-4 decimal places depending on magnitude.
   * Crypto typically has ~2 decimals, stocks have 2, very high-priced things vary.
   */
  function formatPrice(price) {
    if (!isFinite(price) || price <= 0) return '--';
    if (price >= 10000) return price.toFixed(0);
    if (price >= 100) return price.toFixed(2);
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(4);
  }

  /**
   * Calculate percentage change from session open price.
   * Returns {pct: number, text: string, direction: 'up'|'down'|'neutral'}
   */
  function calcPctChange(current, sessionOpen) {
    if (!isFinite(current) || !isFinite(sessionOpen) || sessionOpen <= 0) {
      return {
        pct: 0,
        text: '--',
        direction: 'neutral'
      };
    }
    const pct = (current - sessionOpen) / sessionOpen * 100;
    const dir = pct > 0.01 ? 'up' : pct < -0.01 ? 'down' : 'neutral';
    const sign = pct > 0 ? '+' : '';
    return {
      pct,
      text: sign + pct.toFixed(2) + '%',
      direction: dir
    };
  }

  /**
   * Render a 30-bar inline SVG sparkline from price history.
   * Bars evenly spaced; height maps min/max of the buffer.
   */
  function renderSparkline(prices) {
    if (!prices || prices.length === 0) {
      // Empty sparkline: flat line at bottom
      return `<svg viewBox="0 0 150 20" xmlns="http://www.w3.org/2000/svg" class="ws-sparkline">
                <polyline points="0,18 150,18" stroke="rgba(255,255,255,0.1)" stroke-width="1" fill="none"/>
            </svg>`;
    }
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1; // Prevent division by zero

    // Determine stroke color based on net session direction
    const sessionOpen = prices[0];
    const current = prices[prices.length - 1];
    const isUp = current >= sessionOpen;
    const stroke = isUp ? '#00ff88' : '#ff3366';

    // Generate polyline points: evenly spaced across 150px width
    const xStep = 150 / (prices.length - 1 || 1);
    const points = prices.map((p, i) => {
      const x = i * xStep;
      const y = 18 - (p - min) / range * 16; // Map to 18px height (2px padding)
      return `${x},${y}`;
    }).join(' ');
    return `<svg viewBox="0 0 150 20" xmlns="http://www.w3.org/2000/svg" class="ws-sparkline">
            <polyline points="${points}" stroke="${stroke}" stroke-width="1.5" fill="none"/>
        </svg>`;
  }

  /**
   * Initialize or update a ticker's state. Called on first price tick for a symbol.
   */
  function ensureTickerState(symbol, broker) {
    if (state.tickerStates.has(symbol)) {
      return state.tickerStates.get(symbol);
    }
    const ts = {
      symbol,
      broker,
      price: 0,
      priceOpen: 0,
      positionState: 'SCAN',
      sparkline: [],
      lastPriceFlash: 0,
      lastFlashDir: null
    };
    state.tickerStates.set(symbol, ts);
    state.priceHistogram.set(symbol, []);
    return ts;
  }

  /**
   * Render a single ticker card DOM element.
   */
  function renderCard(ticker) {
    const ts = ensureTickerState(ticker.symbol, ticker.broker);
    const pct = calcPctChange(ts.price, ts.priceOpen);
    const brokerColor = BROKER_COLORS[ticker.broker] || BROKER_COLORS.CB;
    const card = document.createElement('div');
    card.className = 'ws-card';
    if (ticker.symbol === state.selectedSymbol) {
      card.classList.add('selected');
    }
    if (!isFinite(ts.price) || ts.price <= 0) {
      card.classList.add('no-data');
    }
    card.dataset.symbol = ticker.symbol;
    card.dataset.broker = ticker.broker;
    const header = document.createElement('div');
    header.className = 'ws-header';
    const symbol = document.createElement('span');
    symbol.className = 'ws-symbol';
    symbol.textContent = ticker.symbol;
    const broker = document.createElement('span');
    broker.className = 'ws-broker';
    broker.textContent = ticker.broker;
    broker.style.backgroundColor = `rgba(${brokerColor.light}, ${brokerColor.alpha})`;
    header.appendChild(symbol);
    header.appendChild(broker);
    const priceRow = document.createElement('div');
    priceRow.className = 'ws-price-row';
    const price = document.createElement('span');
    price.className = 'ws-price';
    price.textContent = formatPrice(ts.price);
    price.style.fontSize = ts.price < 10 ? '10px' : '11px';
    const pctSpan = document.createElement('span');
    pctSpan.className = `ws-pct ${pct.direction}`;
    pctSpan.textContent = pct.text;
    priceRow.appendChild(price);
    priceRow.appendChild(pctSpan);
    const sparklineWrap = document.createElement('div');
    sparklineWrap.className = 'ws-sparkline-wrap';
    sparklineWrap.innerHTML = renderSparkline(ts.sparkline);
    const statePill = document.createElement('div');
    statePill.className = `ws-state ${ts.positionState}`;
    statePill.textContent = ts.positionState;
    card.appendChild(header);
    card.appendChild(priceRow);
    card.appendChild(sparklineWrap);
    card.appendChild(statePill);
    state.cardElementCache.set(ticker.symbol, card);
    return card;
  }

  /**
   * Main render: rebuild the strip from current ticker list.
   */
  function render() {
    if (!state.mounted) return;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.innerHTML = '';
    state.tickers.forEach(ticker => {
      const card = renderCard(ticker);
      root.appendChild(card);
    });
  }

  /**
   * Update a single card's display after a price tick.
   * Reuses cached DOM element and updates price, sparkline, position.
   */
  function updateCard(symbol) {
    const card = state.cardElementCache.get(symbol);
    if (!card) return; // Card not in DOM
    const ts = state.tickerStates.get(symbol);
    if (!ts) return;

    // Update price text
    const priceEl = card.querySelector('.ws-price');
    if (priceEl) {
      priceEl.textContent = formatPrice(ts.price);
      priceEl.style.fontSize = ts.price < 10 ? '10px' : '11px';
    }
    if (isFinite(ts.price) && ts.price > 0) {
      card.classList.remove('no-data');
    } else {
      card.classList.add('no-data');
    }

    // Update % change + color
    const pct = calcPctChange(ts.price, ts.priceOpen);
    const pctEl = card.querySelector('.ws-pct');
    if (pctEl) {
      pctEl.textContent = pct.text;
      pctEl.classList.remove('up', 'down', 'neutral');
      pctEl.classList.add(pct.direction);
    }

    // Update sparkline
    const sparklineWrap = card.querySelector('.ws-sparkline-wrap');
    if (sparklineWrap) {
      sparklineWrap.innerHTML = renderSparkline(ts.sparkline);
    }

    // Update position state
    const stateEl = card.querySelector('.ws-state');
    if (stateEl) {
      stateEl.classList.remove('SCAN', 'LONG', 'SHORT', 'COOL', 'FAULT');
      stateEl.classList.add(ts.positionState);
      stateEl.textContent = ts.positionState;
    }

    // Flash animation on price change
    if (pct.direction !== 'neutral') {
      card.classList.remove('flash-up', 'flash-down');
      const flashClass = pct.direction === 'up' ? 'flash-up' : 'flash-down';
      card.offsetHeight; // Trigger reflow to restart animation
      card.classList.add(flashClass);
      setTimeout(() => {
        card.classList.remove(flashClass);
      }, PRICE_FLASH_MS);
    }
  }

  // ─── Event Handlers ─────────────────────────────────────────────────
  function onCardClick(e) {
    const card = e.target.closest('.ws-card');
    if (!card) return;
    const symbol = card.dataset.symbol;
    const broker = card.dataset.broker;
    if (!symbol || !broker) return;
    try {
      // setSelected is a method of the WatchlistStrip api object — it is
      // NOT a standalone function in this scope. A bare setSelected(...)
      // call here throws ReferenceError, which the catch below swallowed
      // silently — so ticker clicks never emitted 'watchlist:select'.
      WatchlistStrip.setSelected({
        symbol,
        broker
      });
    } catch (_) {/* swallow */}
  }

  // ─── WS Handler ─────────────────────────────────────────────────────
  /**
   * Subscribe to 'price' WS events. Each tick updates the card's price,
   * sparkline history, and session % change.
   */
  function onPriceEvent(data) {
    try {
      const payload = data && data.data && typeof data.data === 'object' ? data.data : data;
      const incomingSymbol = payload && (payload.symbol || payload.asset || data.symbol || data.asset);
      if (!incomingSymbol) return;
      const brokerHint = payload && (payload.broker || payload.brokerId || payload.source || data.broker || data.brokerId || data.source);
      const priceCandidate = payload.price != null ? payload.price : payload.close;
      const price = parseFloat(priceCandidate);
      if (!isFinite(price) || price <= 0) return;

      // Ensure this symbol is in our watchlist
      const ticker = findTickerForPriceSymbol(incomingSymbol, brokerHint);
      if (!ticker) return;
      const symbol = ticker.symbol;
      const ts = ensureTickerState(symbol, ticker.broker);
      const prevPrice = ts.price;

      // Update price
      ts.price = price;

      // On first tick, set session open price
      if (ts.priceOpen === 0) {
        ts.priceOpen = price;
      }

      // Push to sparkline buffer (FIFO, max SPARKLINE_BUF_SIZE)
      if (!Array.isArray(ts.sparkline)) ts.sparkline = [];
      ts.sparkline.push(price);
      if (ts.sparkline.length > SPARKLINE_BUF_SIZE) {
        ts.sparkline.shift();
      }

      // Update the card display
      updateCard(symbol);
    } catch (_) {/* swallow */}
  }

  /**
   * TODO verify with backend: position_update
   * When backend confirms per-ticker position state events, hook here.
   * Until then, position_update events are ignored; state defaults to SCAN.
   */
  function onPositionUpdate(data) {
    try {
      if (!data || !Array.isArray(data.openPositions)) return;
      // Store for later position state synthesis
      state.openPositions = data.openPositions;
      // Update position states for relevant cards
      state.tickers.forEach(ticker => {
        const ts = state.tickerStates.get(ticker.symbol);
        if (!ts) return;
        const pos = state.openPositions.find(p => p.symbol === ticker.symbol);
        if (pos) {
          ts.positionState = pos.side === 'SHORT' ? 'SHORT' : 'LONG';
        } else {
          ts.positionState = 'SCAN';
        }
        updateCard(ticker.symbol);
      });
    } catch (_) {/* swallow */}
  }

  /**
   * Helper: update all position states based on openPositions array.
   * Called periodically to sync with current trading state.
   */
  function syncPositionStates() {
    state.tickers.forEach(ticker => {
      const ts = state.tickerStates.get(ticker.symbol);
      if (!ts) return;
      const pos = state.openPositions.find(p => p.symbol === ticker.symbol);
      ts.positionState = pos ? pos.side === 'SHORT' ? 'SHORT' : 'LONG' : 'SCAN';
      updateCard(ticker.symbol);
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────
  const WatchlistStrip = {
    /**
     * Initialize: mount to DOM, inject styles, subscribe to WS events.
     * Safe to call multiple times (idempotent via mount guard).
     */
    init() {
      try {
        ensureEventBus();
        injectStyles();
        if (!mount()) return; // Mount point missing
        state.tickers = [...DEFAULT_TICKERS];
        state.selectedSymbol = state.tickers[0]?.symbol || null;
        render();

        // Subscribe to price/ticker events via Socket. Server stock
        // fanout emits ticker_price; bot candle flow emits price.
        const socket = OGZ.get && OGZ.get('Socket');
        if (socket && socket.registerHandler && state.socketHandlerSocket !== socket) {
          socket.registerHandler('price', onPriceEvent);
          socket.registerHandler('ticker_price', onPriceEvent);
          state.socketHandlersInstalled = true;
          state.socketHandlerSocket = socket;
          // TODO verify with backend: position_update
          // socket.registerHandler('position_update', onPositionUpdate);
        }

        // Periodically sync position states until backend position_update is wired.
        if (!state.positionSyncIntervalId) {
          state.positionSyncIntervalId = setInterval(syncPositionStates, POSITION_POLL_MS);
        }
      } catch (_) {/* swallow */}
    },
    /**
     * Replace the entire ticker list.
     * @param {Ticker[]} tickers - Array of { symbol, broker } objects
     */
    setTickers(tickers) {
      try {
        if (!Array.isArray(tickers)) return;
        state.tickers = tickers.map(t => ({
          symbol: String(t.symbol).toUpperCase(),
          broker: String(t.broker)
        }));
        state.selectedSymbol = state.tickers[0]?.symbol || null;
        state.cardElementCache.clear();
        render();
      } catch (_) {/* swallow */}
    },
    /**
     * Set the selected ticker and emit watchlist:select event.
     * @param {Ticker} ticker - { symbol, broker }
     */
    setSelected(ticker) {
      try {
        if (!ticker || !ticker.symbol) return;
        const symbol = String(ticker.symbol).toUpperCase();
        const broker = String(ticker.broker);

        // Verify ticker exists in list
        const found = state.tickers.find(t => t.symbol === symbol);
        if (!found) return;
        state.selectedSymbol = symbol;

        // Update all cards (only selected gets the highlight)
        state.cardElementCache.forEach((card, sym) => {
          if (sym === symbol) {
            card.classList.add('selected');
          } else {
            card.classList.remove('selected');
          }
        });

        // Emit event for other modules
        if (OGZ && OGZ.bus) {
          OGZ.bus.emit('watchlist:select', {
            symbol,
            broker
          });
        }
      } catch (_) {/* swallow */}
    },
    /**
     * Get the currently selected ticker.
     * @returns {Ticker|null}
     */
    getSelected() {
      if (!state.selectedSymbol) return null;
      const ticker = state.tickers.find(t => t.symbol === state.selectedSymbol);
      return ticker || null;
    },
    /**
     * Get the current ticker list.
     * @returns {Ticker[]}
     */
    getTickers() {
      return [...state.tickers];
    },
    /**
     * Add a ticker to the list.
     * @param {Ticker} ticker - { symbol, broker }
     */
    addTicker(ticker) {
      try {
        if (!ticker || !ticker.symbol) return;
        const sym = String(ticker.symbol).toUpperCase();
        if (state.tickers.some(t => t.symbol === sym)) return; // Already present
        state.tickers.push({
          symbol: sym,
          broker: String(ticker.broker)
        });
        state.cardElementCache.delete(sym);
        render();
      } catch (_) {/* swallow */}
    },
    /**
     * Remove a ticker from the list.
     * @param {string} symbol
     */
    removeTicker(symbol) {
      try {
        if (!symbol) return;
        const sym = String(symbol).toUpperCase();
        state.tickers = state.tickers.filter(t => t.symbol !== sym);
        state.cardElementCache.delete(sym);
        state.tickerStates.delete(sym);
        state.priceHistogram.delete(sym);
        render();
      } catch (_) {/* swallow */}
    },
    /**
     * Teardown: remove DOM, listeners, injected styles, cached data.
     */
    teardown() {
      try {
        const root = document.getElementById(ROOT_ID);
        if (root) {
          root.removeEventListener('click', onCardClick);
          root.innerHTML = '';
        }
        const styleEl = document.getElementById(STYLE_ID);
        if (styleEl) styleEl.remove();
        if (state.positionSyncIntervalId) {
          clearInterval(state.positionSyncIntervalId);
          state.positionSyncIntervalId = null;
        }
        state.mounted = false;
        state.tickers = [];
        state.tickerStates.clear();
        state.priceHistogram.clear();
        state.cardElementCache.clear();
        state.selectedSymbol = null;
        state.openPositions = [];
      } catch (_) {/* swallow */}
    },
    /**
     * Expose internal state for testing/debugging.
     */
    _compute() {
      return {
        mounted: state.mounted,
        tickers: state.tickers,
        selectedSymbol: state.selectedSymbol,
        tickerStatesCount: state.tickerStates.size,
        cachedCards: state.cardElementCache.size,
        socketHandlersInstalled: state.socketHandlersInstalled,
        socketHandlerSocketBound: Boolean(state.socketHandlerSocket),
        positionSyncIntervalInstalled: Boolean(state.positionSyncIntervalId)
      };
    },
    _normalizePriceSymbol(symbol) {
      return normalizePriceMatchSymbol(symbol);
    },
    _resolvePriceTicker(symbol, brokerHint, tickers) {
      return findTickerForPriceSymbol(symbol, brokerHint, tickers);
    }
  };

  // ─── Registration ───────────────────────────────────────────────────
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register('WatchlistStrip', WatchlistStrip);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.OGZ && typeof window.OGZ.register === 'function') {
        window.OGZ.register('WatchlistStrip', WatchlistStrip);
      }
    });
  }
  try {
    window.OGZWatchlistStrip = WatchlistStrip;
  } catch (_) {}
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/panels/watchlist-strip.js", error: String((e && e.message) || e) }); }

// public/js/run-frontend-empire-v2.js
try { (() => {
/**
 * run-frontend-empire-v2.js - Dashboard module orchestrator.
 *
 * Empire is not a market-data store and not a trading engine.
 * It tracks frontend module lifecycle, loaded assets, mount presence,
 * WebSocket frame freshness, and symbol-scope hygiene.
 *
 * Phase 1 is intentionally adoptive:
 * - core.js still owns dashboard boot.
 * - panel modules still own their rendered state.
 * - Empire does not call panel init() and cannot double-initialize modules.
 */
(function (OGZ) {
  'use strict';

  const FRAME_STALE_MS = 30000;
  const HEALTH_TICK_MS = 5000;
  const MAX_ERROR_RECORDS = 80;
  const EMPIRE_MODULE = 'Empire';
  const MODULES = [{
    name: 'Core',
    script: '/js/core.js',
    required: true
  }, {
    name: 'Indicators',
    script: '/js/indicators.js',
    exportName: 'Indicators',
    required: true
  }, {
    name: 'Socket',
    script: '/js/websocket.js',
    exportName: 'Socket',
    required: true
  }, {
    name: 'DrawingTools',
    script: '/js/drawing-tools.js',
    exportName: 'DrawingTools'
  }, {
    name: 'Theme',
    script: '/js/theme-customizer.js',
    exportName: 'Theme'
  }, {
    name: 'CommandPalette',
    script: '/js/command-palette.js',
    exportName: 'CommandPalette'
  }, {
    name: 'Operator',
    script: '/js/operator/trade-manager.js',
    exportName: 'Operator',
    required: true
  }, {
    name: 'RailResize',
    script: '/js/panels/rail-resize.js'
  }, {
    name: 'SystemSnapshot',
    script: '/js/panels/system-snapshot.js'
  }, {
    name: 'AssetTFCard',
    script: '/js/panels/asset-tf-card.js'
  }, {
    name: 'PatternSparkline',
    script: '/js/panels/pattern-sparkline.js'
  }, {
    name: 'Intelligence',
    script: '/js/panels/bot-intelligence.js',
    exportName: 'Intelligence'
  }, {
    name: 'Heatbar',
    script: '/js/panels/confidence-heatbar.js',
    exportName: 'Heatbar',
    mount: 'confidenceHeatbar'
  }, {
    name: 'RiskGauge',
    script: '/js/panels/risk-gauge.js',
    exportName: 'RiskGauge'
  }, {
    name: 'CandleCountdown',
    script: '/js/panels/candle-countdown.js',
    exportName: 'CandleCountdown'
  }, {
    name: 'SessionPhase',
    script: '/js/panels/session-phase.js',
    exportName: 'SessionPhase'
  }, {
    name: 'SizePreview',
    script: '/js/panels/size-preview.js',
    exportName: 'SizePreview'
  }, {
    name: 'StrategyLeaderboard',
    script: '/js/panels/strategy-leaderboard.js',
    exportName: 'StrategyLeaderboard',
    mount: 'strategyLeaderboard'
  }, {
    name: 'TradeLog',
    script: '/js/panels/trade-log.js',
    exportName: 'TradeLog'
  }, {
    name: 'SpoofingDetector',
    script: '/js/panels/spoofing-detector.js'
  }, {
    name: 'WatchlistStrip',
    script: '/js/panels/watchlist-strip.js',
    exportName: 'WatchlistStrip',
    mount: 'watchlistStrip',
    required: true
  }, {
    name: 'NewsTicker',
    script: '/js/panels/news-ticker.js',
    exportName: 'NewsTicker',
    mount: 'newsTicker'
  }, {
    name: 'PatternCard',
    script: '/js/panels/pattern-card.js',
    exportName: 'PatternCard',
    mount: 'patternCard'
  }, {
    name: 'HeaderStrip',
    script: '/js/panels/header-strip.js',
    exportName: 'HeaderStrip',
    mount: 'dashHeader',
    required: true
  }, {
    name: 'TRAIBrain',
    script: '/js/panels/trai-brain.js',
    exportName: 'TRAIBrain',
    mount: 'traiBrain'
  }, {
    name: 'OpenPositions',
    script: '/js/panels/open-positions.js',
    exportName: 'OpenPositions',
    mount: 'openPositions',
    required: true
  }, {
    name: 'ChainOfThought',
    script: '/js/panels/chain-of-thought.js',
    exportName: 'ChainOfThought',
    mount: 'chainOfThought'
  }, {
    name: 'LiveReport',
    script: '/js/panels/live-report.js',
    exportName: 'LiveReport',
    mount: 'liveReport',
    required: true
  }, {
    name: 'EquityCurve',
    script: '/js/panels/equity-curve.js',
    exportName: 'EquityCurve',
    mount: 'equityCurve'
  }, {
    name: 'SystemHealth',
    script: '/js/panels/system-health.js',
    exportName: 'SystemHealth',
    mount: 'systemHealth'
  }, {
    name: 'LiveReadouts',
    script: '/js/panels/live-readouts.js',
    exportName: 'LiveReadouts',
    mount: 'liveReadouts'
  }, {
    name: 'Celebration',
    script: '/js/panels/celebration.js',
    exportName: 'Celebration'
  }, {
    name: 'CustomAlerts',
    script: '/js/panels/custom-alerts.js',
    exportName: 'CustomAlerts'
  }, {
    name: 'VictoryAnimations',
    script: '/js/panels/victory-animations.js',
    exportName: 'VictoryAnimations'
  }, {
    name: 'LossRecovery',
    script: '/js/panels/loss-recovery.js',
    exportName: 'LossRecovery'
  }, {
    name: 'MilestoneEffects',
    script: '/js/panels/milestone-effects.js',
    exportName: 'MilestoneEffects'
  }, {
    name: 'GoalTracker',
    script: '/js/panels/goal-tracker.js',
    exportName: 'GoalTracker'
  }, {
    name: 'VoiceManager',
    script: '/js/panels/voice-manager.js',
    exportName: 'VoiceManager'
  }, {
    name: 'VoiceFX',
    script: '/js/panels/voice-fx.js',
    exportName: 'VoiceFX'
  }, {
    name: 'AmbientFX',
    script: '/js/panels/ambient-fx.js',
    exportName: 'AmbientFX'
  }, {
    name: 'LayoutSwitcher',
    script: '/js/panels/layout-switcher.js',
    exportName: 'LayoutSwitcher'
  }, {
    name: 'ChartPanel',
    script: '/js/panels/chart-panel.js',
    exportName: 'ChartPanel',
    mount: 'chartPanel',
    required: true
  }, {
    name: 'EdgeAnalyticsPanel',
    script: '/js/panels/edge-analytics-panel.js',
    exportName: 'EdgeAnalyticsPanel',
    mount: 'edgeAnalyticsPanel'
  }, {
    name: 'TradeReplay',
    script: '/js/panels/trade-replay.js',
    exportName: 'TradeReplay'
  }, {
    name: 'TRAIWidget',
    script: '/trai-widget.js'
  }, {
    name: EMPIRE_MODULE,
    script: '/js/run-frontend-empire-v2.js',
    exportName: EMPIRE_MODULE
  }];
  const STYLES = ['/css/dashboard.css', '/css/trading-panel.css', '/css/asset-tf-card.css', '/css/header-brand.css', '/css/golden-proximity.css', '/css/pattern-sparkline.css', '/css/panels/watchlist-strip.css', '/css/panels/news-ticker.css', '/css/panels/pattern-card.css', '/css/panels/header-strip.css', '/css/panels/trai-brain.css', '/css/panels/open-positions.css', '/css/panels/chain-of-thought.css', '/css/panels/equity-curve.css', '/css/panels/system-health.css', '/css/panels/live-readouts.css', '/css/panels/cyberpunk-polish.css', '/css/layouts.css', '/css/panels/chart-panel.css', '/css/panels/edge-analytics-panel.css'];
  const SYMBOL_REQUIRED_FRAMES = new Set(['price', 'delta', 'historical_candles', 'pattern_analysis', 'signal_analysis', 'ticker_price']);
  const SOCKET_FRAME_TYPES = ['price', 'delta', 'historical_candles', 'state_update', 'bot_thinking', 'narrator_event', 'trade', 'trade_closed_replay', 'journal_snapshot', 'pattern_analysis', 'signal_analysis', 'asset_switched', 'feed_status', 'broker_status', 'balance_update', 'auth_success', 'error_event', 'trace_event', 'ticker_price', 'gate_event', 'broker_ack', 'broker_reject'];
  const state = {
    initialized: false,
    socketHandlersInstalled: false,
    healthIntervalId: null,
    socketRetryId: null,
    socketRef: null,
    socketBindErrorRecorded: false,
    modules: new Map(),
    assets: new Map(),
    frameSubscribers: new Map(),
    frameFreshness: new Map(),
    frameFreshnessBySymbol: new Map(),
    droppedNoSymbol: new Map(),
    errors: [],
    scope: {
      symbol: null,
      timeframe: null,
      broker: null,
      account: null,
      executionMode: null
    },
    scopeSubscribers: []
  };
  function nowIso() {
    return new Date().toISOString();
  }
  function recordError(area, message, err, extras) {
    const entry = {
      ts: nowIso(),
      area,
      message,
      error: err && err.stack ? err.stack : err ? String(err) : null,
      extras: extras || null
    };
    state.errors.push(entry);
    if (state.errors.length > MAX_ERROR_RECORDS) state.errors.shift();
    try {
      console.warn('[Empire] ' + area + ': ' + message, err || '', extras || '');
    } catch (consoleErr) {
      void consoleErr;
    }
    return entry;
  }
  function emitBus(type, payload) {
    if (!OGZ || !OGZ.bus || typeof OGZ.bus.emit !== 'function') return;
    try {
      OGZ.bus.emit(type, payload);
    } catch (err) {
      recordError('bus', 'bus emit failed for ' + type, err);
    }
  }
  function assetPath(rawUrl) {
    try {
      return new URL(rawUrl, window.location.href).pathname;
    } catch (err) {
      recordError('asset', 'invalid asset URL', err, {
        rawUrl
      });
      return null;
    }
  }
  function normalizeSymbol(raw) {
    if (raw === null || raw === undefined) return null;
    const value = String(raw).trim().toUpperCase();
    return value || null;
  }
  function extractSymbol(payload) {
    if (!payload) return null;
    if (payload.symbol) return normalizeSymbol(payload.symbol);
    if (payload.data && payload.data.symbol) {
      return normalizeSymbol(payload.data.symbol);
    }
    if (payload.tick && payload.tick.symbol) {
      return normalizeSymbol(payload.tick.symbol);
    }
    return null;
  }
  function extractScope(frame) {
    if (!frame || typeof frame !== 'object') return {};
    const source = frame.data && typeof frame.data === 'object' ? Object.assign({}, frame, frame.data) : frame;
    return {
      symbol: extractSymbol(frame),
      timeframe: source.timeframe || source.tf || null,
      broker: source.broker || source.brokerId || null,
      account: source.account || source.accountId || null,
      executionMode: source.executionMode || source.mode || null
    };
  }
  function setScopeField(field, value, reason) {
    if (!(field in state.scope)) return false;
    const normalized = field === 'symbol' ? normalizeSymbol(value) : value || null;
    if (state.scope[field] === normalized) return false;
    const previous = state.scope[field];
    state.scope[field] = normalized;
    const event = {
      field,
      value: normalized,
      previous,
      reason: reason || null,
      ts: nowIso()
    };
    for (const cb of state.scopeSubscribers.slice()) {
      try {
        cb(event);
      } catch (err) {
        recordError('scope', 'scope subscriber failed', err, {
          field
        });
      }
    }
    emitBus('empire:scope-change', event);
    return true;
  }
  function syncScopeFromFrame(frame, reason) {
    const next = extractScope(frame);
    const previousSymbol = state.scope.symbol;
    let changed = false;
    Object.keys(next).forEach(field => {
      if (next[field]) changed = setScopeField(field, next[field], reason) || changed;
    });
    if (next.symbol && previousSymbol && next.symbol !== previousSymbol) {
      ['timeframe', 'broker', 'account', 'executionMode'].forEach(field => {
        if (!next[field] && state.scope[field] !== null) {
          changed = setScopeField(field, null, reason + ':symbol-change-cleared-' + field) || changed;
        }
      });
    }
    return changed;
  }
  function scriptElements() {
    return Array.from(document.querySelectorAll('script[src]'));
  }
  function styleElements() {
    return Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'));
  }
  function loadedScriptPaths() {
    const paths = new Set();
    scriptElements().forEach(el => {
      const path = assetPath(el.src);
      if (path) paths.add(path);
    });
    return paths;
  }
  function loadedStylePaths() {
    const paths = new Set();
    styleElements().forEach(el => {
      const path = assetPath(el.href);
      if (path) paths.add(path);
    });
    return paths;
  }
  function moduleExport(name) {
    try {
      return OGZ && typeof OGZ.get === 'function' ? OGZ.get(name) : null;
    } catch (err) {
      recordError('module', 'OGZ.get failed', err, {
        name
      });
      return null;
    }
  }
  function mountPresent(mountId) {
    if (!mountId) return null;
    return !!document.getElementById(mountId);
  }
  function refreshAssetStatus() {
    const scripts = loadedScriptPaths();
    const styles = loadedStylePaths();
    const next = new Map();
    MODULES.forEach(spec => {
      next.set(spec.script, {
        kind: 'script',
        path: spec.script,
        module: spec.name,
        required: !!spec.required,
        loaded: scripts.has(spec.script)
      });
    });
    STYLES.forEach(path => {
      next.set(path, {
        kind: 'style',
        path,
        module: null,
        required: true,
        loaded: styles.has(path)
      });
    });
    state.assets = next;
    return next;
  }
  function refreshModuleStatus() {
    const modules = new Map();
    MODULES.forEach(spec => {
      const loaded = state.assets.get(spec.script);
      const exported = spec.exportName ? !!moduleExport(spec.exportName) : null;
      const mountOk = mountPresent(spec.mount);
      let status = 'loaded';
      if (loaded && !loaded.loaded) status = 'asset-missing';else if (spec.exportName && !exported) status = 'export-missing';else if (mountOk === false) status = 'mount-missing';else if (spec.exportName) status = 'registered';
      modules.set(spec.name, {
        name: spec.name,
        script: spec.script,
        exportName: spec.exportName || null,
        mount: spec.mount || null,
        required: !!spec.required,
        loaded: loaded ? loaded.loaded : false,
        exported,
        mountPresent: mountOk,
        status
      });
    });
    state.modules = modules;
    return modules;
  }
  function refreshInventory() {
    refreshAssetStatus();
    refreshModuleStatus();
  }
  function addFreshness(eventType, symbol) {
    const ts = Date.now();
    const item = state.frameFreshness.get(eventType) || {
      count: 0,
      lastTs: null,
      lastSymbol: null
    };
    item.count += 1;
    item.lastTs = ts;
    item.lastSymbol = symbol || null;
    state.frameFreshness.set(eventType, item);
    if (!symbol) return;
    let bySymbol = state.frameFreshnessBySymbol.get(eventType);
    if (!bySymbol) {
      bySymbol = new Map();
      state.frameFreshnessBySymbol.set(eventType, bySymbol);
    }
    const symItem = bySymbol.get(symbol) || {
      count: 0,
      lastTs: null
    };
    symItem.count += 1;
    symItem.lastTs = ts;
    bySymbol.set(symbol, symItem);
  }
  function dispatchFrame(eventType, frame) {
    const subscribers = state.frameSubscribers.get(eventType);
    if (!subscribers || !subscribers.length) return;
    subscribers.slice().forEach(sub => {
      try {
        sub.fn(frame);
      } catch (err) {
        recordError('frame', 'frame subscriber failed', err, {
          moduleName: sub.moduleName,
          eventType
        });
      }
    });
  }
  function routeFrame(eventType, frame) {
    const symbol = extractSymbol(frame);
    if (SYMBOL_REQUIRED_FRAMES.has(eventType) && !symbol) {
      const count = (state.droppedNoSymbol.get(eventType) || 0) + 1;
      state.droppedNoSymbol.set(eventType, count);
      emitBus('empire:frame-rejected', {
        eventType,
        reason: 'missing-symbol',
        count,
        ts: nowIso()
      });
      return false;
    }
    syncScopeFromFrame(frame, 'frame:' + eventType);
    addFreshness(eventType, symbol);
    const routed = symbol ? Object.assign({}, frame, {
      _empireSymbol: symbol
    }) : frame;
    dispatchFrame(eventType, routed);
    return true;
  }
  function installSocketHandlers() {
    const socket = moduleExport('Socket');
    if (state.socketHandlersInstalled && state.socketRef === socket) return true;
    if (!socket || typeof socket.registerHandler !== 'function') {
      if (!state.socketBindErrorRecorded) {
        recordError('socket', 'Socket.registerHandler unavailable during Empire bind');
        state.socketBindErrorRecorded = true;
      }
      return false;
    }
    SOCKET_FRAME_TYPES.forEach(eventType => {
      socket.registerHandler(eventType, frame => {
        if (!state.initialized) return;
        try {
          routeFrame(eventType, frame);
        } catch (err) {
          recordError('socket', 'frame route failed', err, {
            eventType
          });
        }
      });
    });
    state.socketHandlersInstalled = true;
    state.socketRef = socket;
    state.socketBindErrorRecorded = false;
    return true;
  }
  function scheduleSocketBindRetry() {
    if (state.socketRetryId) return;
    state.socketRetryId = window.setTimeout(() => {
      state.socketRetryId = null;
      if (!state.initialized) return;
      if (!installSocketHandlers()) scheduleSocketBindRetry();
    }, 250);
  }
  function bindToSocket() {
    if (installSocketHandlers()) return true;
    scheduleSocketBindRetry();
    return false;
  }
  function ensureHealthInterval() {
    if (state.healthIntervalId) return;
    state.healthIntervalId = window.setInterval(() => {
      emitBus('empire:health', health());
    }, HEALTH_TICK_MS);
  }
  function frameSnapshot() {
    const frames = {};
    const now = Date.now();
    state.frameFreshness.forEach((value, eventType) => {
      const bySymbol = {};
      const symbolMap = state.frameFreshnessBySymbol.get(eventType);
      if (symbolMap) {
        symbolMap.forEach((symValue, symbol) => {
          bySymbol[symbol] = {
            count: symValue.count,
            lastTs: symValue.lastTs,
            ageMs: symValue.lastTs ? now - symValue.lastTs : null,
            stale: symValue.lastTs ? now - symValue.lastTs > FRAME_STALE_MS : null
          };
        });
      }
      frames[eventType] = {
        count: value.count,
        lastTs: value.lastTs,
        lastSymbol: value.lastSymbol,
        ageMs: value.lastTs ? now - value.lastTs : null,
        stale: value.lastTs ? now - value.lastTs > FRAME_STALE_MS : null,
        bySymbol
      };
    });
    return frames;
  }
  function mapToObject(map) {
    const out = {};
    map.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  function missingRequiredAssets() {
    const missing = [];
    state.assets.forEach(asset => {
      if (asset.required && !asset.loaded) missing.push(asset);
    });
    return missing;
  }
  function health() {
    refreshInventory();
    return {
      initialized: state.initialized,
      socketHandlersInstalled: state.socketHandlersInstalled,
      socketRefPresent: !!state.socketRef,
      modules: mapToObject(state.modules),
      assets: mapToObject(state.assets),
      missingRequiredAssets: missingRequiredAssets(),
      frames: frameSnapshot(),
      droppedNoSymbol: mapToObject(state.droppedNoSymbol),
      scope: Object.assign({}, state.scope),
      errors: state.errors.slice(),
      ts: nowIso()
    };
  }
  const Empire = {
    init: function () {
      if (state.initialized) return health();
      state.initialized = true;
      refreshInventory();
      bindToSocket();
      ensureHealthInterval();
      emitBus('empire:ready', health());
      return health();
    },
    teardown: function () {
      state.initialized = false;
      if (state.socketRetryId) {
        window.clearTimeout(state.socketRetryId);
        state.socketRetryId = null;
      }
      if (state.healthIntervalId) {
        window.clearInterval(state.healthIntervalId);
        state.healthIntervalId = null;
      }
      state.frameSubscribers.clear();
      emitBus('empire:teardown', {
        ts: nowIso()
      });
    },
    bootAll: function () {
      return health();
    },
    health,
    getManifest: function () {
      return {
        modules: MODULES.map(item => Object.assign({}, item)),
        styles: STYLES.slice()
      };
    },
    getScope: function (field) {
      if (!field) return Object.assign({}, state.scope);
      return Object.prototype.hasOwnProperty.call(state.scope, field) ? state.scope[field] : null;
    },
    setScope: function (field, value) {
      if (typeof field === 'object' && field) {
        let changed = false;
        Object.keys(field).forEach(key => {
          changed = setScopeField(key, field[key], 'manual') || changed;
        });
        return changed;
      }
      return setScopeField(field, value, 'manual');
    },
    onScopeChange: function (fn) {
      if (typeof fn !== 'function') return function noop() {};
      if (!state.scopeSubscribers.includes(fn)) state.scopeSubscribers.push(fn);
      return function unsubscribe() {
        const idx = state.scopeSubscribers.indexOf(fn);
        if (idx >= 0) state.scopeSubscribers.splice(idx, 1);
      };
    },
    subscribeFrame: function (moduleName, eventType, fn) {
      if (!moduleName || !eventType || typeof fn !== 'function') {
        recordError('frame', 'invalid frame subscription', null, {
          moduleName,
          eventType
        });
        return function noop() {};
      }
      let subscribers = state.frameSubscribers.get(eventType);
      if (!subscribers) {
        subscribers = [];
        state.frameSubscribers.set(eventType, subscribers);
      }
      if (!subscribers.some(sub => sub.moduleName === moduleName && sub.fn === fn)) {
        subscribers.push({
          moduleName,
          fn
        });
      }
      return function unsubscribe() {
        const current = state.frameSubscribers.get(eventType) || [];
        state.frameSubscribers.set(eventType, current.filter(sub => !(sub.moduleName === moduleName && sub.fn === fn)));
      };
    },
    unsubscribeFramesByModule: function (moduleName) {
      state.frameSubscribers.forEach((subscribers, eventType) => {
        state.frameSubscribers.set(eventType, subscribers.filter(sub => sub.moduleName !== moduleName));
      });
    },
    routeFrame: routeFrame,
    droppedFrames: function () {
      return mapToObject(state.droppedNoSymbol);
    },
    _compute: health
  };
  if (OGZ && typeof OGZ.register === 'function') {
    OGZ.register(EMPIRE_MODULE, Empire);
  } else {
    recordError('register', 'OGZ.register unavailable during Empire load');
  }
  try {
    window.OGZEmpire = Empire;
  } catch (err) {
    recordError('register', 'failed to expose window.OGZEmpire', err);
  }
})(window.OGZ = window.OGZ || {});
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/run-frontend-empire-v2.js", error: String((e && e.message) || e) }); }

// public/js/theme-customizer.js
try { (() => {
/**
 * theme-customizer.js - Persistent Theme State
 * Owns ALL theme-related DOM event binding. No inline onclick in HTML.
 */
(function (OGZ) {
  'use strict';

  const THEME_COLORS = {
    cyberpunk: '#ff00ff',
    matrix: '#00ff00',
    neon: '#ff6600',
    dark: '#888888',
    ocean: '#0077cc',
    sunset: '#ff4444',
    royal: '#8844ff',
    hacker: '#00ff88'
  };
  const Theme = {
    init: function () {
      // Restore saved theme
      const saved = localStorage.getItem('ogz_theme');
      if (saved) {
        try {
          this.applyTheme(JSON.parse(saved));
        } catch (e) {
          console.warn('[Theme] Failed to load saved theme:', e);
        }
      }
      this.bindEvents();
    },
    bindEvents: function () {
      // Toggle panel
      const toggle = document.querySelector('.theme-toggle');
      if (toggle) toggle.addEventListener('click', () => this.togglePanel());

      // Theme preset buttons (use data-theme attribute)
      document.querySelectorAll('.theme-btn[data-theme]').forEach(btn => {
        btn.addEventListener('click', () => {
          const themeName = btn.getAttribute('data-theme');
          this.applyTheme({
            themeName,
            accentColor: THEME_COLORS[themeName] || '#ffd700'
          });
        });
      });

      // Accent color picker
      const colorInput = document.getElementById('accentColor');
      if (colorInput) colorInput.addEventListener('change', e => {
        const colorVal = document.getElementById('colorValue');
        if (colorVal) colorVal.textContent = e.target.value;
        document.documentElement.style.setProperty('--ml-color', e.target.value);
      });

      // Font select — applies to all text elements
      const fontSelect = document.getElementById('fontSelect');
      if (fontSelect) fontSelect.addEventListener('change', e => {
        document.documentElement.style.setProperty('font-family', e.target.value, 'important');
        document.body.style.fontFamily = e.target.value;
        // Also update panels and data displays
        document.querySelectorAll('.edge-panel, .panel-title, .edge-section, .stat-value, .indicator-bar').forEach(el => el.style.fontFamily = e.target.value);
      });

      // Animations toggle
      const animToggle = document.getElementById('animToggle');
      if (animToggle) animToggle.addEventListener('change', e => {
        document.body.style.animationPlayState = e.target.checked ? 'running' : 'paused';
      });

      // Save button
      const saveBtn = document.querySelector('.theme-actions button:first-child');
      if (saveBtn) saveBtn.addEventListener('click', () => this.save());

      // Reset button
      const resetBtn = document.querySelector('.theme-actions button:last-child');
      if (resetBtn) resetBtn.addEventListener('click', () => this.reset());
    },
    togglePanel: function () {
      const panel = document.getElementById('themePanel');
      if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    },
    applyTheme: function (config) {
      const root = document.documentElement;
      if (config.accentColor) root.style.setProperty('--ml-color', config.accentColor);
      if (config.themeName) document.body.className = `tier-ml theme-${config.themeName}`;
      localStorage.setItem('ogz_theme', JSON.stringify(config));
    },
    save: function () {
      const config = {
        accentColor: document.getElementById('accentColor')?.value || '#ffd700',
        themeName: document.querySelector('.theme-btn.active')?.getAttribute('data-theme') || 'dark',
        font: document.getElementById('fontSelect')?.value || 'monospace'
      };
      localStorage.setItem('ogz_theme', JSON.stringify(config));
      console.log('[Theme] Saved:', config);
    },
    reset: function () {
      localStorage.removeItem('ogz_theme');
      // Reset in place — no reload, no disconnect appearance
      const root = document.documentElement;
      root.style.setProperty('--ml-color', '#ffd700');
      root.style.setProperty('--profit-color', '#00ff88');
      root.style.setProperty('--loss-color', '#ff3366');
      document.body.className = 'tier-ml';
      const colorInput = document.getElementById('accentColor');
      if (colorInput) colorInput.value = '#ffd700';
      const colorVal = document.getElementById('colorValue');
      if (colorVal) colorVal.textContent = '#FFD700';
      console.log('[Theme] Reset to defaults');
    }
  };
  OGZ.register('Theme', Theme);
})(window.OGZ);
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/theme-customizer.js", error: String((e && e.message) || e) }); }

// public/js/websocket.js
try { (() => {
/**
 * websocket.js - OGZPrime Data Pipe
 * WebSocket connection with auth, heartbeat, reconnect, and God Mode delta merge
 */
(function (OGZ) {
  'use strict';

  let ws = null;
  let handlers = new Map();
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let dataWatchdogTimer = null;
  let authenticated = false;
  let lastPongAt = 0;
  let lastDataAt = 0;
  const WS_PATH = '/ws';
  const HEARTBEAT_INTERVAL_MS = 15000;
  const PONG_TIMEOUT_MS = 30000;
  const DATA_TIMEOUT_MS = 60000;
  const DATA_WATCHDOG_INTERVAL_MS = 30000;
  const OPEN = 1;
  const CONNECTING = 0;
  const DASHBOARD_DATA_FRAME_TYPES = new Set(['asset_switched', 'balance_update', 'bot_thinking', 'broker_ack', 'broker_reject', 'candle', 'cvd_update', 'delta', 'depth_update', 'divergence', 'fear_greed', 'funding_rate', 'gate_event', 'historical_candles', 'journal_snapshot', 'liquidation_data', 'market_internals', 'narrator_event', 'news_event', 'pattern_analysis', 'price', 'signal_analysis', 'smart_money', 'state_update', 'ticker_price', 'trace_event', 'trade', 'trade_closed_replay', 'whale_trade']);
  function socketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${WS_PATH}`;
  }
  function stopHealthChecks() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (dataWatchdogTimer) {
      clearInterval(dataWatchdogTimer);
      dataWatchdogTimer = null;
    }
  }
  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }
  function isDataFrame(type) {
    return DASHBOARD_DATA_FRAME_TYPES.has(type);
  }
  function storedDashboardToken() {
    try {
      const token = window.localStorage && window.localStorage.getItem('ogz.dashboard.wsToken');
      return typeof token === 'string' ? token.trim() : '';
    } catch (_) {
      return '';
    }
  }
  function dashboardAuthToken() {
    const metaToken = document.querySelector('meta[name="ws-token"]')?.content;
    if (typeof metaToken === 'string' && metaToken.trim() !== '') return metaToken.trim();
    if (typeof window.OGZ_DASHBOARD_TOKEN === 'string' && window.OGZ_DASHBOARD_TOKEN.trim() !== '') {
      return window.OGZ_DASHBOARD_TOKEN.trim();
    }
    return storedDashboardToken();
  }
  function sendRaw(data) {
    if (ws && ws.readyState === OPEN) {
      ws.send(JSON.stringify(data));
      return true;
    }
    console.warn('[Socket] Send skipped; socket not open:', data && data.type, ws ? ws.readyState : 'none');
    return false;
  }
  function scheduleReconnect(reason) {
    if (reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
    console.log(`[Socket] Reconnecting in ${delay}ms: ${reason}`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectAttempts++;
      Socket.connect();
    }, delay);
  }
  function forceReconnect(reason) {
    const staleSocket = ws;
    authenticated = false;
    ws = null;
    stopHealthChecks();
    if (staleSocket && staleSocket.readyState === OPEN) {
      try {
        staleSocket.close(4000, reason.slice(0, 120));
      } catch (err) {
        console.error('[Socket] Failed to close stale connection:', err);
      }
    }
    scheduleReconnect(reason);
  }
  function startHealthChecks() {
    stopHealthChecks();
    lastPongAt = Date.now();
    lastDataAt = Date.now();
    heartbeatTimer = setInterval(() => {
      if (!ws || ws.readyState !== OPEN || !authenticated) return;
      const timeSincePong = Date.now() - lastPongAt;
      if (timeSincePong > PONG_TIMEOUT_MS) {
        console.warn(`[Socket] Heartbeat timeout after ${Math.round(timeSincePong / 1000)}s without pong`);
        forceReconnect('heartbeat timeout');
        return;
      }
      sendRaw({
        type: 'ping',
        timestamp: Date.now()
      });
    }, HEARTBEAT_INTERVAL_MS);
    dataWatchdogTimer = setInterval(() => {
      if (!ws || ws.readyState !== OPEN || !authenticated) return;
      const timeSinceData = Date.now() - lastDataAt;
      if (timeSinceData > DATA_TIMEOUT_MS) {
        console.warn(`[Socket] Data watchdog stale after ${Math.round(timeSinceData / 1000)}s without dashboard data`);
        forceReconnect('data watchdog stale');
      }
    }, DATA_WATCHDOG_INTERVAL_MS);
  }
  const Socket = {
    connect: function () {
      if (ws && (ws.readyState === OPEN || ws.readyState === CONNECTING)) {
        console.log('[Socket] Connect skipped; socket already active.');
        return;
      }
      clearReconnectTimer();
      stopHealthChecks();
      authenticated = false;
      const token = dashboardAuthToken();
      if (!token) {
        console.warn('[Socket] No dashboard token configured — set localStorage ogz.dashboard.wsToken or window.OGZ_DASHBOARD_TOKEN');
        return false;
      }
      const url = socketUrl();
      console.log(`[Socket] Connecting to ${url}...`);
      const currentSocket = new WebSocket(url);
      ws = currentSocket;
      currentSocket.onopen = () => {
        if (currentSocket !== ws) return;
        console.log('[Socket] Connected. Authenticating...');
        // Public HTML must not carry WEBSOCKET_AUTH_TOKEN. Until the
        // gated session/ticket flow lands, an empty token fails closed
        // at the server instead of silently using a leaked literal.
        this.send({
          type: 'auth',
          token
        });
      };
      currentSocket.onmessage = e => {
        if (currentSocket !== ws) return;
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'pong') {
            lastPongAt = Date.now();
          }
          if (isDataFrame(data.type)) {
            lastDataAt = Date.now();
          }

          // God Mode: Delta Merge Engine (dormant — awaits delta emitter)
          if (data.type === 'delta' && data.tick) {
            OGZ.state.lastPriceDelta = data.tick.price - OGZ.state.lastPrice;
            OGZ.state.lastPrice = data.tick.price;
          }

          // Auth success -> identify + load historical candles for selected asset.
          if (data.type === 'auth_success') {
            authenticated = true;
            reconnectAttempts = 0;
            startHealthChecks();
            this.send({
              type: 'identify',
              source: 'dashboard',
              tier: OGZ.state.tier,
              version: '2.0.0'
            });
            // V2 chart-panel uses cp-* IDs; fall back to legacy monolith IDs,
            // then default. Same fallback chain CC-D bakes into asset consumers.
            const asset = document.getElementById('cp-assetSelector')?.value || document.getElementById('assetSelector')?.value || 'TSLA';
            const tf = document.getElementById('cp-timeframeSelector')?.value || document.getElementById('timeframeSelector')?.value || '15m';
            // #47: prime both startup paths. `asset_change` updates
            // bot-side selected asset state, while `request_historical`
            // asks the stock adapter or bot to send historical_candles.
            // Fresh loads need both; manual ticker clicks already send
            // asset_change, which is why the chart populated only after
            // the user clicked a ticker.
            this.send({
              type: 'asset_change',
              asset: asset
            });
            this.send({
              type: 'request_historical',
              timeframe: tf,
              asset: asset,
              limit: 500
            });
          }

          // Dispatch to registered handlers
          const handlerList = handlers.get(data.type);
          if (handlerList) handlerList.slice().forEach(cb => cb(data));
        } catch (err) {
          console.error('[Socket] Parse error:', err);
        }
      };
      currentSocket.onclose = event => {
        if (currentSocket !== ws) return;
        authenticated = false;
        ws = null;
        stopHealthChecks();
        const code = event && event.code != null ? event.code : 'unknown';
        const reason = event && event.reason ? event.reason : 'no reason';
        console.log(`[Socket] Disconnected: code=${code}, reason=${reason}`);
        scheduleReconnect(`close code=${code}`);
      };
      currentSocket.onerror = err => {
        if (currentSocket !== ws) return;
        console.error('[Socket] Error:', err);
      };
    },
    registerHandler: (type, cb) => {
      if (!type || typeof cb !== 'function') return false;
      if (!handlers.has(type)) handlers.set(type, []);
      const handlerList = handlers.get(type);
      if (!handlerList.includes(cb)) handlerList.push(cb);
      return true;
    },
    unregisterHandler: (type, cb) => {
      if (!type || typeof cb !== 'function') return false;
      const handlerList = handlers.get(type);
      if (!handlerList) return false;
      const next = handlerList.filter(handler => handler !== cb);
      if (next.length === handlerList.length) return false;
      if (next.length === 0) handlers.delete(type);else handlers.set(type, next);
      return true;
    },
    send: data => {
      return sendRaw(data);
    },
    setAuthToken: token => {
      if (typeof token !== 'string' || token.trim() === '') {
        console.warn('[Socket] Refusing empty dashboard token');
        return false;
      }
      try {
        window.localStorage.setItem('ogz.dashboard.wsToken', token.trim());
      } catch (err) {
        console.error('[Socket] Failed to store dashboard token:', err);
        return false;
      }
      forceReconnect('dashboard token updated');
      return true;
    },
    clearAuthToken: () => {
      try {
        window.localStorage.removeItem('ogz.dashboard.wsToken');
      } catch (err) {
        console.error('[Socket] Failed to clear dashboard token:', err);
        return false;
      }
      forceReconnect('dashboard token cleared');
      return true;
    },
    isConnected: () => Boolean(ws && ws.readyState === OPEN && authenticated)
  };
  OGZ.register('Socket', Socket);
})(window.OGZ);
})(); } catch (e) { __ds_ns.__errors.push({ path: "public/js/websocket.js", error: String((e && e.message) || e) }); }

// ui_kits/trading-dashboard/dashboard.jsx
try { (() => {
/* OGZPrime Trading Dashboard — shell + 4-mode layout switcher.
   Uses body.layout-<mode> class system matching layouts.css exactly.
   Modes: operator (default), trader, showcase, streamer. */

const {
  HeaderStrip,
  WatchlistStrip,
  NewsTicker
} = window.OGZ_TOP;
const {
  ChainOfThought,
  ConfidenceHeatbar,
  LiveReadouts
} = window.OGZ_LEFT;
const {
  ChartPanel
} = window.OGZ_CHART;
const R = window.OGZ_RIGHT;
const MODES = [{
  key: 'operator',
  label: '🎛 Operator',
  tooltip: 'Full-vis default — everything visible'
}, {
  key: 'trader',
  label: '📈 Trader',
  tooltip: 'Chart-dominant — rails collapsed'
}, {
  key: 'showcase',
  label: '✨ Showcase',
  tooltip: 'Customer demo — branded, hide dev panels'
}, {
  key: 'streamer',
  label: '📹 Streamer',
  tooltip: 'OBS/Twitch — privacy + 16:9'
}];
function LayoutSwitcher({
  mode,
  onChange
}) {
  const [open, setOpen] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    className: "ogz-layout-switcher",
    style: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      marginLeft: 8,
      fontFamily: "'JetBrains Mono',monospace",
      zIndex: 100
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "ogz-layout-switcher-btn",
    onClick: () => setOpen(!open),
    style: {
      background: 'rgba(15,15,22,0.7)',
      border: '1px solid rgba(255,215,0,0.22)',
      color: '#e6e6e6',
      fontSize: 11,
      fontWeight: 500,
      padding: '5px 10px',
      borderRadius: 5,
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    }
  }, MODES.find(m => m.key === mode)?.label || 'Operator'), open && /*#__PURE__*/React.createElement("div", {
    className: "ogz-layout-switcher-menu open",
    style: {
      position: 'absolute',
      top: 'calc(100% + 6px)',
      right: 0,
      minWidth: 200,
      background: 'rgba(10,10,16,0.96)',
      border: '1px solid rgba(255,215,0,0.3)',
      borderRadius: 6,
      padding: 6,
      boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
      backdropFilter: 'blur(8px) saturate(160%)',
      zIndex: 9700
    }
  }, MODES.map(m => /*#__PURE__*/React.createElement("div", {
    key: m.key,
    className: `ogz-layout-switcher-item${m.key === mode ? ' active' : ''}`,
    onClick: () => {
      onChange(m.key);
      setOpen(false);
    },
    style: {
      display: 'flex',
      flexDirection: 'column',
      padding: '8px 12px',
      borderRadius: 4,
      cursor: 'pointer',
      color: m.key === mode ? '#ffd700' : '#e6e6e6',
      fontSize: 12,
      background: m.key === mode ? 'rgba(255,215,0,0.14)' : 'transparent'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ls-label",
    style: {
      fontWeight: 600
    }
  }, m.label), /*#__PURE__*/React.createElement("span", {
    className: "ls-tip",
    style: {
      fontSize: 10,
      color: 'rgba(255,255,255,0.45)',
      marginTop: 2
    }
  }, m.tooltip)))));
}
function Dashboard() {
  const [mode, setMode] = React.useState(() => {
    try {
      const v = localStorage.getItem('ogz.layout.mode');
      return v || 'operator';
    } catch (_) {
      return 'operator';
    }
  });
  React.useEffect(() => {
    document.body.className = 'layout-' + mode;
    try {
      localStorage.setItem('ogz.layout.mode', mode);
    } catch (_) {}
  }, [mode]);
  const isTrader = mode === 'trader';
  const isShowcase = mode === 'showcase';
  const isStreamer = mode === 'streamer';

  // Visibility rules matching layouts.css exactly
  const hideLeftRail = isTrader;
  const hideRightRail = isTrader;
  const hideWatchlist = isTrader;
  const hideCOT = isTrader || isShowcase;
  const hideHealth = isTrader || isShowcase || isStreamer;
  const hideStrat = isTrader;
  const compactRight = isStreamer;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: '#000',
      position: 'relative',
      fontFamily: "'JetBrains Mono',monospace",
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: 'radial-gradient(circle at 20% 50%, rgba(255,215,0,0.05) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(0,255,255,0.05) 0%, transparent 50%)',
      pointerEvents: 'none',
      zIndex: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      flexDirection: 'column',
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(HeaderStrip, null), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 24,
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 20
    }
  }, /*#__PURE__*/React.createElement(LayoutSwitcher, {
    mode: mode,
    onChange: setMode
  }))), !hideWatchlist && /*#__PURE__*/React.createElement(WatchlistStrip, null), /*#__PURE__*/React.createElement(NewsTicker, null), /*#__PURE__*/React.createElement("main", {
    className: "dash-main-grid",
    style: {
      display: 'grid',
      gridTemplateColumns: isTrader ? '1fr' : `${hideLeftRail ? '' : '320px'} 1fr ${hideRightRail ? '' : compactRight ? '240px' : '320px'}`,
      gap: 'var(--rail-gap, 20px)',
      flex: '1 1 0',
      overflow: 'hidden',
      padding: 'var(--rail-gap, 20px)',
      minHeight: 0
    }
  }, !hideLeftRail && /*#__PURE__*/React.createElement("aside", {
    className: "dash-left-rail",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      overflowY: 'auto',
      minHeight: 0,
      height: 0,
      flex: '1 1 0'
    }
  }, !hideCOT && /*#__PURE__*/React.createElement(ChainOfThought, null), /*#__PURE__*/React.createElement(ConfidenceHeatbar, null)), /*#__PURE__*/React.createElement("section", {
    className: "dash-center",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      overflowY: 'auto',
      minHeight: 0,
      height: 0,
      flex: '1 1 0'
    }
  }, /*#__PURE__*/React.createElement(ChartPanel, null), /*#__PURE__*/React.createElement("div", {
    className: "dash-readouts-row",
    style: {
      display: 'flex',
      gap: 12,
      minHeight: 120,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '1 1 auto',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(LiveReadouts, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '0 0 280px'
    }
  }, /*#__PURE__*/React.createElement(R.PlaceholderPanel, {
    id: "patternCard",
    label: "Pattern Card"
  })))), !hideRightRail && /*#__PURE__*/React.createElement("aside", {
    className: "dash-right-rail",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      overflowY: 'auto',
      minHeight: 0,
      height: 0,
      flex: '1 1 0',
      width: compactRight ? 240 : 'auto'
    }
  }, /*#__PURE__*/React.createElement(R.OpenPositions, null), /*#__PURE__*/React.createElement(R.EdgeAnalytics, null), !compactRight && /*#__PURE__*/React.createElement(R.TraiBrain, null), /*#__PURE__*/React.createElement(R.RiskGauge, null), /*#__PURE__*/React.createElement(R.PlaceholderPanel, {
    id: "sizePreview",
    label: "Size Preview"
  }), /*#__PURE__*/React.createElement(R.PlaceholderPanel, {
    id: "tradeLog",
    label: "Trade Log"
  }), !hideStrat && /*#__PURE__*/React.createElement(R.StrategyLeaderboard, null))), /*#__PURE__*/React.createElement("section", {
    className: "dash-bottom-row",
    style: {
      display: 'grid',
      gridTemplateColumns: isTrader ? '1fr' : '1fr 1fr',
      gap: 12,
      padding: 12,
      minHeight: 280,
      flexShrink: 0,
      borderTop: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(0,0,0,0.4)'
    }
  }, /*#__PURE__*/React.createElement(R.EquityCurve, null), !isTrader && /*#__PURE__*/React.createElement(R.LiveReport, null)), !hideHealth && /*#__PURE__*/React.createElement(R.SystemHealth, null)));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(Dashboard, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/trading-dashboard/dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/trading-dashboard/data.jsx
try { (() => {
/* OGZPrime Trading Dashboard UI Kit — mock data matching real WS event shapes.
   Every field name matches what the production JS panels actually read. */

const TICKERS = [{
  symbol: 'TSLA',
  broker: 'ALP',
  price: 248.52,
  priceOpen: 242.10,
  positionState: 'LONG',
  sparkline: [240, 241, 243, 242, 244, 246, 245, 247, 248, 247, 249, 248, 250, 249, 248, 247, 249, 250, 248, 247, 246, 248, 249, 250, 249, 248, 247, 248, 249, 248]
}, {
  symbol: 'NVDA',
  broker: 'ALP',
  price: 142.88,
  priceOpen: 139.20,
  positionState: 'SCAN',
  sparkline: [138, 139, 140, 141, 140, 141, 142, 141, 142, 143, 142, 141, 142, 143, 142, 143, 144, 143, 142, 143, 142, 141, 142, 143, 142, 143, 142, 143, 142, 143]
}, {
  symbol: 'BTC-USD',
  broker: 'KRA',
  price: 48210.55,
  priceOpen: 47080.00,
  positionState: 'LONG',
  sparkline: [47000, 47100, 47200, 47150, 47300, 47400, 47350, 47500, 47600, 47550, 47700, 47800, 47750, 47900, 48000, 47950, 48100, 48200, 48150, 48050, 48100, 48200, 48150, 48200, 48100, 48200, 48150, 48200, 48250, 48210]
}, {
  symbol: 'ETH-USD',
  broker: 'KRA',
  price: 2584.12,
  priceOpen: 2595.00,
  positionState: 'SHORT',
  sparkline: [2600, 2598, 2595, 2590, 2592, 2588, 2585, 2587, 2583, 2585, 2582, 2584, 2580, 2582, 2585, 2583, 2586, 2584, 2582, 2583, 2585, 2584, 2582, 2583, 2585, 2584, 2583, 2584, 2585, 2584]
}, {
  symbol: 'SPY',
  broker: 'ALP',
  price: 542.18,
  priceOpen: 540.50,
  positionState: 'SCAN',
  sparkline: [540, 540, 541, 541, 541, 542, 541, 542, 542, 541, 542, 542, 541, 542, 542, 541, 542, 542, 541, 542, 542, 541, 542, 542, 541, 542, 542, 541, 542, 542]
}, {
  symbol: 'QQQ',
  broker: 'ALP',
  price: 468.33,
  priceOpen: 466.80,
  positionState: 'SCAN',
  sparkline: [466, 467, 467, 467, 468, 467, 468, 468, 467, 468, 468, 467, 468, 468, 467, 468, 468, 467, 468, 468, 467, 468, 468, 467, 468, 468, 467, 468, 468, 468]
}, {
  symbol: 'COIN',
  broker: 'ALP',
  price: 264.71,
  priceOpen: 258.90,
  positionState: 'SCAN',
  sparkline: [258, 259, 260, 261, 260, 261, 262, 261, 262, 263, 262, 263, 264, 263, 264, 265, 264, 263, 264, 265, 264, 265, 264, 265, 264, 265, 264, 265, 264, 265]
}, {
  symbol: 'MARA',
  broker: 'ALP',
  price: 24.18,
  priceOpen: 23.50,
  positionState: 'SCAN',
  sparkline: [23, 23, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24]
}, {
  symbol: 'RIOT',
  broker: 'ALP',
  price: 12.44,
  priceOpen: 12.60,
  positionState: 'SCAN',
  sparkline: [13, 13, 13, 12, 13, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12]
}];
const POSITIONS = [{
  symbol: 'TSLA',
  side: 'LONG',
  entry: 242.80,
  size: 41,
  mark: 248.52,
  pnl: 234.52,
  pct: 2.36,
  confidence: 0.87,
  strategy: 'Momentum-V3',
  sl: 238.40,
  tp: 256.00
}, {
  symbol: 'BTC-USD',
  side: 'LONG',
  entry: 47120,
  size: 0.42,
  mark: 48210.55,
  pnl: 458.03,
  pct: 2.31,
  confidence: 0.79,
  strategy: 'Momentum-V3',
  sl: 46180,
  tp: 49400
}, {
  symbol: 'ETH-USD',
  side: 'SHORT',
  entry: 2602,
  size: 3.10,
  mark: 2584.12,
  pnl: 55.43,
  pct: 0.69,
  confidence: 0.61,
  strategy: 'MeanRevert',
  sl: 2650,
  tp: 2540
}];
const COT_LINES = [{
  ts: '09:41:02',
  type: 'scan',
  text: 'Scanning 9 symbols across 1m / 5m / 15m frames…'
}, {
  ts: '09:41:04',
  type: 'signal',
  text: 'TSLA — Two-Pole Oscillator crossed up, RSI 62.4 rising'
}, {
  ts: '09:41:05',
  type: 'signal',
  text: 'SuperTrend flipped bullish on 5m; VWAP reclaimed'
}, {
  ts: '09:41:06',
  type: 'decide',
  text: 'Strategy "Momentum-V3" confidence 0.87 → eligible'
}, {
  ts: '09:41:06',
  type: 'risk',
  text: 'Risk check: 1.8% portfolio heat, within 4% cap ✓'
}, {
  ts: '09:41:07',
  type: 'entry',
  text: 'ENTER long TSLA @ 242.80 · SL 238.40 · TP 256.00'
}];
const ENSEMBLE = [{
  name: 'Momentum-V3',
  confidence: 0.87,
  direction: 'long'
}, {
  name: 'Grid-Scalp',
  confidence: 0.55,
  direction: 'long'
}, {
  name: 'MeanRevert',
  confidence: 0.34,
  direction: 'short'
}];
const EDGE = [{
  section: 'liquidation',
  label: 'Liquidations',
  value: '$8.2M shorts',
  cls: 'pos'
}, {
  section: 'cvd',
  label: 'CVD',
  value: '+1.24M',
  cls: 'pos'
}, {
  section: 'funding',
  label: 'Funding Rate',
  value: '0.011%',
  cls: ''
}, {
  section: 'whales',
  label: 'Whale Flow',
  value: 'Accumulating',
  cls: 'pos'
}, {
  section: 'internals',
  label: 'Internals',
  value: '54.2% BTC.D',
  cls: ''
}, {
  section: 'smartMoney',
  label: 'Smart Money',
  value: 'Long bias',
  cls: 'pos'
}, {
  section: 'fearGreed',
  label: 'Fear & Greed',
  value: '72 Greed',
  cls: 'warn'
}, {
  section: 'divergences',
  label: 'Divergences',
  value: 'None detected',
  cls: ''
}];
const STRATEGIES = [{
  name: 'Momentum V3',
  pnl: 692.55,
  trades: 8,
  wins: 5
}, {
  name: 'Grid Scalp',
  pnl: 148.20,
  trades: 14,
  wins: 8
}, {
  name: 'Mean Revert',
  pnl: -82.10,
  trades: 6,
  wins: 3
}];
const NEWS = [{
  sentiment: 'bullish',
  text: 'FOMC holds rates — risk assets bid into close'
}, {
  sentiment: 'neutral',
  text: 'BTC dominance steady at 54.2%'
}, {
  sentiment: 'defensive',
  text: 'Large ETH outflow flagged on-chain — watch 2,540 support'
}, {
  sentiment: 'bullish',
  text: 'SOL network upgrade live; TPS up 18%'
}, {
  sentiment: 'neutral',
  text: 'CPI print due 08:30 ET tomorrow'
}];
const READOUTS = {
  rsi: {
    value: 62.4,
    state: 'neutral'
  },
  macd: {
    value: '+18.2',
    state: 'pos'
  },
  atr: {
    value: '112.5',
    state: ''
  },
  volume: {
    value: '2.4M',
    state: ''
  },
  confidence: {
    value: '0.87',
    state: 'high'
  },
  pattern: {
    value: 'Cup & Handle',
    state: ''
  }
};
const REPORT = [['Session P&L', '+$692.55', 'pos'], ['Win Rate (7d)', '61.2%', 'pos'], ['Avg R/Trade', '1.84R', 'pos'], ['Max Drawdown', '−4.1%', 'neg'], ['Trades Today', '14', ''], ['Sharpe (30d)', '2.31', 'warn'], ['Longest Streak', '5W', 'pos'], ['Avg Hold Time', '23m', '']];
const HEALTH = {
  sessionRouter: true,
  krakenWs: true,
  alpacaWs: true,
  errors: 0,
  uptime: '4d 02:11:38',
  commit: 'a1f9c2e',
  riskPosture: 'Normal'
};

// SVG sparkline builder matching ws-sparkline format
function renderSparklineSVG(prices) {
  if (!prices || prices.length === 0) return '<svg viewBox="0 0 150 20" class="ws-sparkline"><polyline points="0,18 150,18" stroke="rgba(255,255,255,0.1)" stroke-width="1" fill="none"/></svg>';
  const mn = Math.min(...prices),
    mx = Math.max(...prices),
    range = mx - mn || 1;
  const step = 150 / (prices.length - 1);
  const pts = prices.map((p, i) => `${(i * step).toFixed(1)},${(18 - (p - mn) / range * 16).toFixed(1)}`).join(' ');
  const up = prices[prices.length - 1] >= prices[0];
  return `<svg viewBox="0 0 150 20" xmlns="http://www.w3.org/2000/svg" class="ws-sparkline"><polyline points="${pts}" stroke="${up ? '#00ff88' : '#ff3366'}" stroke-width="1.5" fill="none"/></svg>`;
}
Object.assign(window, {
  OGZ_DATA: {
    TICKERS,
    POSITIONS,
    COT_LINES,
    ENSEMBLE,
    EDGE,
    STRATEGIES,
    NEWS,
    READOUTS,
    REPORT,
    HEALTH
  },
  renderSparklineSVG
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/trading-dashboard/data.jsx", error: String((e && e.message) || e) }); }

// ui_kits/trading-dashboard/panels-chart.jsx
try { (() => {
/* OGZPrime UI Kit — Chart Panel (faithful to chart-panel.js renderScaffold)
   Every DOM element, class name, selector, oscillator pane toggle,
   indicator checkbox — exact production structure. */

function ChartPanel() {
  const [tf, setTf] = React.useState('1m');
  const [chartType, setChartType] = React.useState('candlestick');
  const [oscPanes, setOscPanes] = React.useState(['volume']);
  const indicatorConfigs = [{
    value: 'ema',
    label: 'EMA',
    color: '#fbbf24',
    on: true
  }, {
    value: 'sma',
    label: 'SMA',
    color: '#60a5fa',
    on: false
  }, {
    value: 'bollinger',
    label: 'Bollinger Bands',
    color: '#a78bfa',
    on: false
  }, {
    value: 'atr',
    label: 'ATR',
    color: '#f59e0b',
    on: false
  }, {
    value: 'fibonacci',
    label: 'Fibonacci',
    color: '#9900ff',
    on: false
  }, {
    value: 'trendlines',
    label: 'Trend Lines',
    color: '#00ff00',
    on: false
  }, {
    value: 'rsi',
    label: 'RSI',
    color: '#ec4899',
    on: true
  }, {
    value: 'macd',
    label: 'MACD',
    color: '#8b5cf6',
    on: false
  }, {
    value: 'vwap',
    label: 'VWAP',
    color: '#e879f9',
    on: true
  }, {
    value: 'ichimoku',
    label: 'Ichimoku',
    color: '#06b6d4',
    on: false
  }, {
    value: 'sr',
    label: 'Support/Resistance',
    color: '#ff9900',
    on: false
  }];
  const [activeInds, setActiveInds] = React.useState(indicatorConfigs.filter(i => i.on).map(i => i.value));
  const toggleInd = v => setActiveInds(a => a.includes(v) ? a.filter(x => x !== v) : [...a, v]);
  const toggleOsc = k => setOscPanes(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k]);

  // Generate candlestick mock data
  const candles = React.useMemo(() => {
    const out = [];
    let p = 242;
    for (let i = 0; i < 80; i++) {
      const d = ((i * 9301 + 49297) % 233280 / 233280 - 0.46) * 4;
      const o = p,
        c = o + d,
        h = Math.max(o, c) + (i * 31 + 17) % 100 / 100 * 2,
        l = Math.min(o, c) - (i * 47 + 13) % 100 / 100 * 2;
      out.push({
        o,
        c,
        h,
        l,
        v: Math.floor(200000 + (i * 71 + 23) % 100 * 5000),
        t: i
      });
      p = c;
    }
    return out;
  }, []);
  const w = 840,
    ch = 360;
  const mx = Math.max(...candles.map(c => c.h)),
    mn = Math.min(...candles.map(c => c.l)),
    rng = mx - mn || 1;
  const cw = w / candles.length;
  const y = v => ch - (v - mn) / rng * (ch - 24) - 12;

  // EMA overlay
  const ema20 = React.useMemo(() => {
    const out = [];
    let e = candles[0]?.c || 0;
    const k = 2 / 21;
    candles.forEach((c, i) => {
      e = c.c * k + e * (1 - k);
      out.push({
        t: i,
        v: e
      });
    });
    return out;
  }, [candles]);

  // RSI for oscillator pane
  const rsiData = React.useMemo(() => {
    const closes = candles.map(c => c.c);
    const out = [];
    let avgG = 0,
      avgL = 0;
    for (let i = 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      const g = d > 0 ? d : 0;
      const l = d < 0 ? -d : 0;
      if (i <= 14) {
        avgG += g / 14;
        avgL += l / 14;
      } else {
        avgG = (avgG * 13 + g) / 14;
        avgL = (avgL * 13 + l) / 14;
      }
      if (i >= 14) {
        const rs = avgL === 0 ? 100 : avgG / avgL;
        out.push({
          t: i,
          v: 100 - 100 / (1 + rs)
        });
      }
    }
    return out;
  }, [candles]);

  // Volume for oscillator pane
  const volMax = Math.max(...candles.map(c => c.v));
  return /*#__PURE__*/React.createElement("div", {
    id: "chartPanel",
    className: "cp-root",
    style: {
      flex: '1 1 auto',
      minHeight: 360,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cp-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cp-title-container",
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("h2", {
    className: "cp-title",
    id: "chartTitle",
    style: {
      display: 'none'
    }
  }, "ML VERSION"), /*#__PURE__*/React.createElement("span", {
    className: "cp-price-display ogz-chart-panel-price-flash",
    id: "currentPrice",
    style: {
      fontFamily: "'Orbitron',monospace",
      fontWeight: 700,
      fontSize: 18,
      color: '#22c55e',
      letterSpacing: 1
    }
  }, "$248.52"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#22c55e'
    }
  }, "\u25B2 +2.65%")), /*#__PURE__*/React.createElement("div", {
    className: "cp-controls",
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("select", {
    id: "cp-chartTypeSelector",
    className: "cp-selector",
    value: chartType,
    onChange: e => setChartType(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: "candlestick"
  }, "Candlestick"), /*#__PURE__*/React.createElement("option", {
    value: "line"
  }, "Line"), /*#__PURE__*/React.createElement("option", {
    value: "area"
  }, "Area"), /*#__PURE__*/React.createElement("option", {
    value: "bar"
  }, "Bar")), /*#__PURE__*/React.createElement("select", {
    id: "cp-assetSelector",
    className: "cp-selector",
    defaultValue: "TSLA"
  }, /*#__PURE__*/React.createElement("optgroup", {
    label: "Crypto (Kraken)"
  }, /*#__PURE__*/React.createElement("option", {
    value: "BTC-USD"
  }, "Bitcoin (BTC)"), /*#__PURE__*/React.createElement("option", {
    value: "ETH-USD"
  }, "Ethereum (ETH)")), /*#__PURE__*/React.createElement("optgroup", {
    label: "Stocks (Alpaca)"
  }, /*#__PURE__*/React.createElement("option", {
    value: "TSLA"
  }, "Tesla (TSLA)"), /*#__PURE__*/React.createElement("option", {
    value: "NVDA"
  }, "NVIDIA (NVDA)"), /*#__PURE__*/React.createElement("option", {
    value: "SPY"
  }, "S&P 500 (SPY)"), /*#__PURE__*/React.createElement("option", {
    value: "QQQ"
  }, "Nasdaq 100 (QQQ)"), /*#__PURE__*/React.createElement("option", {
    value: "COIN"
  }, "Coinbase (COIN)"), /*#__PURE__*/React.createElement("option", {
    value: "MARA"
  }, "Marathon (MARA)"), /*#__PURE__*/React.createElement("option", {
    value: "RIOT"
  }, "Riot Platforms (RIOT)"))), /*#__PURE__*/React.createElement("select", {
    id: "cp-timeframeSelector",
    className: "cp-selector",
    value: tf,
    onChange: e => setTf(e.target.value)
  }, ['1m', '5m', '15m', '30m', '1h', '4h', '1d'].map(t => /*#__PURE__*/React.createElement("option", {
    key: t,
    value: t
  }, t.toUpperCase()))), ['volume', 'rsi', 'macd', 'atr'].map(k => /*#__PURE__*/React.createElement("button", {
    key: k,
    type: "button",
    className: `cp-selector cp-osc-toggle${oscPanes.includes(k) ? ' active' : ''}`,
    onClick: () => toggleOsc(k),
    title: `Toggle ${k.toUpperCase()} oscillator pane`
  }, k === 'volume' ? 'Volume Split' : k.toUpperCase()))), /*#__PURE__*/React.createElement("div", {
    id: "cp-indicatorCheckboxes",
    className: "cp-indicator-checkboxes",
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      marginTop: 6
    }
  }, indicatorConfigs.map(cfg => {
    const on = activeInds.includes(cfg.value);
    return /*#__PURE__*/React.createElement("label", {
      key: cfg.value,
      className: "cp-indicator-check",
      onClick: () => toggleInd(cfg.value),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        cursor: 'pointer',
        fontSize: 10,
        color: on ? cfg.color : '#555',
        transition: 'color 0.15s ease',
        userSelect: 'none',
        padding: '2px 6px',
        borderRadius: 4,
        border: `1px solid ${on ? cfg.color + '40' : 'rgba(255,255,255,0.06)'}`,
        background: on ? cfg.color + '12' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      value: cfg.value,
      checked: on,
      readOnly: true,
      style: {
        display: 'none'
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "cp-color-dot",
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: on ? cfg.color : '#333',
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", null, cfg.label));
  }))), /*#__PURE__*/React.createElement("div", {
    className: "cp-container",
    style: {
      position: 'relative',
      flex: 1,
      minHeight: 240,
      background: 'rgba(5,5,8,0.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    id: "tvChartContainer",
    className: "cp-tv-chart-container",
    style: {
      width: '100%',
      height: '100%',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${w} ${ch}`,
    preserveAspectRatio: "none",
    style: {
      width: '100%',
      height: '100%',
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "cpArea",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "rgba(220,38,38,0.12)"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "rgba(220,38,38,0)"
  }))), [0.2, 0.4, 0.6, 0.8].map(g => /*#__PURE__*/React.createElement("line", {
    key: g,
    x1: "0",
    y1: ch * g,
    x2: w,
    y2: ch * g,
    stroke: "rgba(255,255,255,0.06)",
    strokeWidth: "1"
  })), candles.map((c, i) => {
    const x = i * cw + cw / 2;
    const up = c.c >= c.o;
    const col = up ? '#22c55e' : '#ef4444';
    const bw = Math.max(2, cw * 0.55);
    const yo = y(c.o),
      yc = y(c.c);
    const top = Math.min(yo, yc),
      bh = Math.max(1, Math.abs(yc - yo));
    return /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("line", {
      x1: x,
      y1: y(c.h),
      x2: x,
      y2: y(c.l),
      stroke: col,
      strokeWidth: "1",
      opacity: "0.7"
    }), /*#__PURE__*/React.createElement("rect", {
      x: x - bw / 2,
      y: top,
      width: bw,
      height: bh,
      fill: col,
      opacity: "0.9"
    }));
  }), activeInds.includes('ema') && /*#__PURE__*/React.createElement("path", {
    d: ema20.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.t * cw + cw / 2).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' '),
    fill: "none",
    stroke: "#fbbf24",
    strokeWidth: "1.5",
    opacity: "0.8"
  }), activeInds.includes('vwap') && /*#__PURE__*/React.createElement("path", {
    d: ema20.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.t * cw + cw / 2).toFixed(1)} ${y(p.v - 1.2).toFixed(1)}`).join(' '),
    fill: "none",
    stroke: "#e879f9",
    strokeWidth: "1.5",
    opacity: "0.7",
    strokeDasharray: "4 2"
  }), /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("polygon", {
    points: `${15 * cw + cw / 2 - 5},${y(candles[15]?.l || 0) + 8} ${15 * cw + cw / 2 + 5},${y(candles[15]?.l || 0) + 8} ${15 * cw + cw / 2},${y(candles[15]?.l || 0)}`,
    fill: "#22c55e",
    opacity: "0.9"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: `${55 * cw + cw / 2 - 5},${y(candles[55]?.h || 0) - 8} ${55 * cw + cw / 2 + 5},${y(candles[55]?.h || 0) - 8} ${55 * cw + cw / 2},${y(candles[55]?.h || 0)}`,
    fill: "#ffd700",
    opacity: "0.9"
  }))), /*#__PURE__*/React.createElement("div", {
    id: "chartHud",
    className: "cp-chart-hud",
    style: {
      position: 'absolute',
      top: 8,
      left: 12,
      fontSize: 11,
      color: '#888',
      display: 'flex',
      gap: 14,
      zIndex: 2
    }
  }, /*#__PURE__*/React.createElement("div", {
    id: "chartHudOhlc",
    className: "cp-hud-ohlc"
  }, /*#__PURE__*/React.createElement("span", null, "O ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#fff'
    }
  }, "242.80")), ' ', /*#__PURE__*/React.createElement("span", null, "H ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#fff'
    }
  }, "249.10")), ' ', /*#__PURE__*/React.createElement("span", null, "L ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#fff'
    }
  }, "241.60")), ' ', /*#__PURE__*/React.createElement("span", null, "C ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#22c55e'
    }
  }, "248.52")))), /*#__PURE__*/React.createElement("div", {
    id: "feedStatusPill",
    className: "cp-feed-status-pill",
    style: {
      display: 'none'
    }
  }, "Bot offline - waiting for feed")), /*#__PURE__*/React.createElement("div", {
    id: "tradeTooltip",
    className: "cp-trade-tooltip",
    style: {
      display: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    id: "tooltipContent"
  })), /*#__PURE__*/React.createElement("div", {
    id: "crosshairTooltip",
    className: "cp-crosshair-tooltip",
    style: {
      display: 'none'
    }
  })), oscPanes.includes('volume') && /*#__PURE__*/React.createElement("div", {
    className: "cp-osc-pane",
    style: {
      height: 100
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "cp-osc-label"
  }, "VOLUME"), /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${w} 80`,
    preserveAspectRatio: "none",
    style: {
      width: '100%',
      height: '100%',
      display: 'block'
    }
  }, candles.map((c, i) => {
    const x = i * cw;
    const bh = Math.max(1, c.v / volMax * 72);
    const col = c.c >= c.o ? '#26a69a' : '#ef5350';
    return /*#__PURE__*/React.createElement("rect", {
      key: i,
      x: x + 1,
      y: 80 - bh,
      width: Math.max(1, cw - 2),
      height: bh,
      fill: col,
      opacity: "0.7"
    });
  }))), oscPanes.includes('rsi') && /*#__PURE__*/React.createElement("div", {
    className: "cp-osc-pane",
    style: {
      height: 120
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "cp-osc-label"
  }, "RSI 14"), /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${w} 100`,
    preserveAspectRatio: "none",
    style: {
      width: '100%',
      height: '100%',
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("line", {
    x1: "0",
    y1: "30",
    x2: w,
    y2: "30",
    stroke: "rgba(239,68,68,0.45)",
    strokeWidth: "1",
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "0",
    y1: "70",
    x2: w,
    y2: "70",
    stroke: "rgba(34,197,94,0.45)",
    strokeWidth: "1",
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement("path", {
    d: rsiData.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.t * cw + cw / 2).toFixed(1)} ${(100 - p.v).toFixed(1)}`).join(' '),
    fill: "none",
    stroke: "#ec4899",
    strokeWidth: "1.5"
  }))), oscPanes.includes('macd') && /*#__PURE__*/React.createElement("div", {
    className: "cp-osc-pane",
    style: {
      height: 120
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "cp-osc-label"
  }, "MACD 12/26/9"), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 840 100",
    preserveAspectRatio: "none",
    style: {
      width: '100%',
      height: '100%',
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("line", {
    x1: "0",
    y1: "50",
    x2: "840",
    y2: "50",
    stroke: "rgba(255,255,255,0.08)",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: candles.slice(26).map((c, i) => `${i === 0 ? 'M' : 'L'} ${((i + 26) * cw + cw / 2).toFixed(1)} ${(50 - (c.c - candles[Math.max(0, i + 14)]?.c || 0) * 3).toFixed(1)}`).join(' '),
    fill: "none",
    stroke: "#8b5cf6",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: candles.slice(26).map((c, i) => `${i === 0 ? 'M' : 'L'} ${((i + 26) * cw + cw / 2).toFixed(1)} ${(50 - (c.c - candles[Math.max(0, i + 18)]?.c || 0) * 2.5).toFixed(1)}`).join(' '),
    fill: "none",
    stroke: "#fbbf24",
    strokeWidth: "1"
  }))), oscPanes.includes('atr') && /*#__PURE__*/React.createElement("div", {
    className: "cp-osc-pane",
    style: {
      height: 120
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "cp-osc-label"
  }, "ATR 14"), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 840 100",
    preserveAspectRatio: "none",
    style: {
      width: '100%',
      height: '100%',
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: candles.slice(14).map((c, i) => `${i === 0 ? 'M' : 'L'} ${((i + 14) * cw + cw / 2).toFixed(1)} ${(80 - (c.h - c.l) * 12).toFixed(1)}`).join(' '),
    fill: "none",
    stroke: "#f59e0b",
    strokeWidth: "1"
  }))));
}
window.OGZ_CHART = {
  ChartPanel
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/trading-dashboard/panels-chart.jsx", error: String((e && e.message) || e) }); }

// ui_kits/trading-dashboard/panels-left.jsx
try { (() => {
/* OGZPrime UI Kit — Left rail + center sub-panels.
   Real class names from chain-of-thought.js, confidence-heatbar.js, live-readouts.js, chart-panel.js */

const D2 = window.OGZ_DATA;

/* ═══════ CHAIN OF THOUGHT (chain-of-thought.js DOM) ═══════ */
function ChainOfThought() {
  const typeColors = {
    scan: '#888',
    signal: '#00ccff',
    decide: '#ffd700',
    risk: '#22c55e',
    entry: '#dc2626'
  };
  return /*#__PURE__*/React.createElement("div", {
    id: "chainOfThought",
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      flex: '1 1 auto',
      minHeight: 240,
      background: 'var(--glass-bg,rgba(14,14,16,0.72))',
      border: '1px solid var(--glass-border,rgba(220,38,38,0.14))',
      borderRadius: 6,
      backdropFilter: 'blur(12px) saturate(140%)',
      overflow: 'hidden',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cot-header",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      borderBottom: '1px solid var(--glass-border,rgba(220,38,38,0.14))',
      flexShrink: 0,
      background: 'rgba(0,0,0,0.2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "cot-title",
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.8px',
      textTransform: 'uppercase',
      color: '#fff'
    }
  }, "Chain of Thought"), /*#__PURE__*/React.createElement("span", {
    className: "cot-status",
    style: {
      fontSize: 9,
      color: '#a0a0a0',
      marginLeft: 'auto'
    }
  }, "streaming")), /*#__PURE__*/React.createElement("div", {
    className: "cot-content",
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '8px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 100%)'
    }
  }, D2.COT_LINES.map((l, i) => {
    const isLast = i === D2.COT_LINES.length - 1;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      className: `cot-line cot-${l.type}`,
      style: {
        display: 'flex',
        gap: 8,
        fontSize: 11.5,
        lineHeight: 1.45,
        color: isLast ? '#fff' : '#a0a0a0',
        paddingLeft: 10,
        borderLeft: `2px solid ${isLast ? '#dc2626' : 'rgba(255,255,255,0.06)'}`
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "cot-ts",
      style: {
        color: '#555',
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums'
      }
    }, l.ts), /*#__PURE__*/React.createElement("span", {
      className: "cot-text",
      style: {
        color: isLast ? typeColors[l.type] : 'inherit'
      }
    }, l.text));
  })));
}

/* ═══════ CONFIDENCE HEATBAR (confidence-heatbar.js DOM) ═══════ */
function ConfidenceHeatbar() {
  const total = D2.ENSEMBLE.reduce((s, e) => s + e.confidence, 0);
  const winner = D2.ENSEMBLE[0];
  return /*#__PURE__*/React.createElement("div", {
    id: "confidenceHeatbar",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: 'rgba(14,14,16,0.72)',
      border: '1px solid rgba(220,38,38,0.14)',
      borderRadius: 6,
      backdropFilter: 'blur(12px)',
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 10,
      userSelect: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "hb-label",
    style: {
      fontSize: 9,
      color: '#a1a1aa',
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      flex: '0 0 auto'
    }
  }, "ENSEMBLE"), /*#__PURE__*/React.createElement("div", {
    className: "hb-track",
    style: {
      display: 'flex',
      alignItems: 'stretch',
      flex: 1,
      height: 18,
      gap: 2,
      borderRadius: 3,
      overflow: 'hidden'
    }
  }, D2.ENSEMBLE.map((e, i) => {
    const pct = (e.confidence / total * 100).toFixed(1);
    const isWinner = e.name === winner.name;
    const opposing = e.direction !== winner.direction;
    const fillColor = isWinner ? 'rgba(220,38,38,0.4)' : opposing ? 'rgba(255,255,255,0.06)' : 'rgba(0,204,255,0.25)';
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      className: `hb-segment${isWinner ? ' hb-winner' : ''}${opposing ? ' hb-opposing' : ''}`,
      style: {
        position: 'relative',
        height: '100%',
        flex: `0 0 ${pct}%`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 6px',
        borderRadius: 2,
        border: `1px solid ${isWinner ? '#dc2626' : 'rgba(255,255,255,0.08)'}`,
        overflow: 'hidden',
        transition: 'border-color 0.18s ease',
        boxShadow: isWinner ? '0 0 0 1px #dc2626, 0 0 14px rgba(220,38,38,0.45)' : 'none',
        filter: opposing ? 'saturate(0) opacity(0.55)' : 'none'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "hb-fill",
      style: {
        position: 'absolute',
        inset: 0,
        background: fillColor,
        zIndex: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "hb-name",
      style: {
        position: 'relative',
        zIndex: 1,
        fontWeight: 600,
        color: isWinner ? '#fca5a5' : '#e4e4e7',
        fontSize: 9,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        textShadow: isWinner ? '0 0 8px rgba(220,38,38,0.35)' : 'none'
      }
    }, e.name), /*#__PURE__*/React.createElement("span", {
      className: "hb-conf",
      style: {
        position: 'relative',
        zIndex: 1,
        color: '#a1a1aa',
        fontSize: 9,
        letterSpacing: '0.04em'
      }
    }, e.confidence.toFixed(2)));
  })), /*#__PURE__*/React.createElement("span", {
    className: "hb-winner-tag hb-visible",
    style: {
      flex: '0 0 auto',
      fontSize: 10,
      fontWeight: 700,
      color: '#dc2626',
      letterSpacing: '0.04em',
      opacity: 1
    }
  }, "\u25B8 ", winner.name));
}

/* ═══════ LIVE READOUTS (live-readouts.js DOM — 2×3 grid) ═══════ */
function LiveReadouts() {
  const R = D2.READOUTS;
  const cells = [{
    label: 'RSI',
    value: R.rsi.value,
    color: R.rsi.value > 70 ? '#ef4444' : R.rsi.value > 60 ? '#fbbf24' : '#22c55e'
  }, {
    label: 'MACD',
    value: R.macd.value,
    color: R.macd.value.startsWith('+') ? '#22c55e' : '#ef4444'
  }, {
    label: 'ATR',
    value: R.atr.value,
    color: '#e4e4e7'
  }, {
    label: 'VOL',
    value: R.volume.value,
    color: '#e4e4e7'
  }, {
    label: 'LIVE CONF',
    value: R.confidence.value,
    color: parseFloat(R.confidence.value) >= 0.85 ? '#ffd700' : '#e4e4e7'
  }, {
    label: 'PATTERN',
    value: R.pattern.value,
    color: '#00ccff'
  }];
  return /*#__PURE__*/React.createElement("div", {
    id: "liveReadouts",
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: '8px 12px',
      padding: 8,
      background: 'var(--bg-panel,rgba(20,20,20,0.9))',
      border: '1px solid var(--border-color,rgba(255,255,255,0.1))',
      borderRadius: 8,
      fontFamily: "'JetBrains Mono',monospace"
    }
  }, cells.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.label,
    className: "lr-cell",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      padding: '8px 10px',
      borderRadius: 6,
      background: 'rgba(0,0,0,0.25)',
      border: '1px solid rgba(255,255,255,0.04)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "lr-label",
    style: {
      fontSize: 9,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: '#71717a'
    }
  }, c.label), /*#__PURE__*/React.createElement("div", {
    className: "lr-value",
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: c.color,
      letterSpacing: '0.5px',
      lineHeight: 1
    }
  }, c.value))));
}
window.OGZ_LEFT = {
  ChainOfThought,
  ConfidenceHeatbar,
  LiveReadouts
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/trading-dashboard/panels-left.jsx", error: String((e && e.message) || e) }); }

// ui_kits/trading-dashboard/panels-rail.jsx
try { (() => {
/* OGZPrime UI Kit — Right rail, bottom row, footer.
   Real class names from open-positions.js, edge-analytics-panel.js, trai-brain.js,
   risk-gauge.js, strategy-leaderboard.js, equity-curve.js, live-report.js, system-health.js */

const D3 = window.OGZ_DATA;
const fmtUsd = n => (n >= 0 ? '+' : '−') + '$' + Math.abs(n).toFixed(2);

/* ═══════ OPEN POSITIONS (open-positions.js DOM) ═══════ */
function OpenPositions() {
  const aggPnl = D3.POSITIONS.reduce((s, p) => s + p.pnl, 0);
  return /*#__PURE__*/React.createElement("div", {
    id: "openPositions",
    style: {
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--glass-bg,rgba(14,14,16,0.72))',
      border: '1px solid var(--glass-border,rgba(220,38,38,0.14))',
      borderRadius: 8,
      backdropFilter: 'blur(14px) saturate(160%)',
      overflow: 'hidden',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "op-header",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '12px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(0,0,0,0.3)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "op-header-title",
    style: {
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: '#fff'
    }
  }, "Open Positions"), /*#__PURE__*/React.createElement("span", {
    className: "op-count-badge",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 40,
      padding: '2px 8px',
      background: 'rgba(255,215,0,0.12)',
      border: '1px solid rgba(255,215,0,0.3)',
      borderRadius: 12,
      fontSize: 9,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      color: '#ffd700'
    }
  }, D3.POSITIONS.length, " open"), /*#__PURE__*/React.createElement("span", {
    className: `op-aggregate-pnl ${aggPnl >= 0 ? '' : 'negative'}`,
    style: {
      marginLeft: 'auto',
      fontSize: 12,
      fontWeight: 900,
      letterSpacing: '0.5px',
      color: aggPnl >= 0 ? '#22c55e' : '#ef4444'
    }
  }, fmtUsd(aggPnl))), /*#__PURE__*/React.createElement("div", {
    className: "op-table",
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, D3.POSITIONS.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.symbol,
    className: "op-row",
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr auto auto',
      gap: 8,
      alignItems: 'center',
      padding: '10px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.04)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "op-sym",
    style: {
      color: '#fff',
      fontSize: 12,
      fontWeight: 700
    }
  }, p.symbol), /*#__PURE__*/React.createElement("span", {
    className: `op-side ${p.side.toLowerCase()}`,
    style: {
      fontSize: 9,
      fontWeight: 700,
      textTransform: 'uppercase',
      padding: '1px 6px',
      borderRadius: 4,
      background: p.side === 'LONG' ? 'rgba(0,255,136,0.12)' : 'rgba(255,51,102,0.12)',
      color: p.side === 'LONG' ? '#00ff88' : '#ff3366'
    }
  }, p.side)), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#666',
      fontSize: 10,
      marginTop: 2
    }
  }, p.size, " @ ", p.entry < 100 ? p.entry.toFixed(2) : p.entry.toLocaleString()), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#555',
      fontSize: 9,
      marginTop: 1
    }
  }, "SL ", p.sl, " \xB7 TP ", p.tp, " \xB7 ", p.strategy)), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: '#888'
    }
  }, "conf"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: p.confidence >= 0.85 ? '#ffd700' : '#e4e4e7'
    }
  }, p.confidence.toFixed(2))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: p.pnl >= 0 ? '#22c55e' : '#ef4444'
    }
  }, fmtUsd(p.pnl)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: p.pct >= 0 ? '#22c55e' : '#ef4444'
    }
  }, p.pct >= 0 ? '+' : '', p.pct.toFixed(2), "%"))))));
}

/* ═══════ EDGE ANALYTICS (edge-analytics-panel.js DOM — 8 sections) ═══════ */
function EdgeAnalytics() {
  return /*#__PURE__*/React.createElement("div", {
    id: "edgeAnalyticsPanel",
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 6,
      padding: 10,
      background: 'var(--glass-bg,rgba(14,14,16,0.72))',
      border: '1px solid var(--glass-border,rgba(220,38,38,0.14))',
      borderRadius: 8,
      backdropFilter: 'blur(8px)'
    }
  }, D3.EDGE.map(e => /*#__PURE__*/React.createElement("div", {
    key: e.section,
    className: `ea-section ea-${e.section}`,
    style: {
      padding: '8px 10px',
      borderRadius: 6,
      background: 'rgba(0,0,0,0.25)',
      border: '1px solid rgba(255,255,255,0.04)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: '#71717a',
      marginBottom: 3
    }
  }, e.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: e.cls === 'pos' ? '#22c55e' : e.cls === 'neg' ? '#ef4444' : e.cls === 'warn' ? '#fbbf24' : '#e4e4e7'
    }
  }, e.value))));
}

/* ═══════ TRAI BRAIN (trai-brain.js DOM — simplified) ═══════ */
function TraiBrain() {
  return /*#__PURE__*/React.createElement("div", {
    id: "traiBrain",
    style: {
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--glass-bg,rgba(14,14,16,0.72))',
      border: '1px solid var(--glass-border,rgba(220,38,38,0.14))',
      borderRadius: 8,
      backdropFilter: 'blur(8px)',
      overflow: 'hidden',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "tb-header",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(0,0,0,0.2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.8px',
      textTransform: 'uppercase',
      color: '#fff'
    }
  }, "TRAI Brain"), /*#__PURE__*/React.createElement("span", {
    className: "tb-header-status",
    style: {
      marginLeft: 'auto',
      fontSize: 9,
      color: '#00ccff',
      fontWeight: 600
    }
  }, "Connected")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 12px',
      fontSize: 11.5,
      lineHeight: 1.55,
      color: '#a0a0a0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#00ccff'
    }
  }, "\u25B8"), " Momentum regime confirmed on TSLA. Bias ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#00ff88'
    }
  }, "long"), " while price holds above VWAP (244.20). Next decision gate at the 252.00 prior high \u2014 expecting continuation if CVD stays positive. Risk posture SAFE at 1.8%."));
}

/* ═══════ RISK GAUGE (risk-gauge.js DOM — SVG ring) ═══════ */
function RiskGauge() {
  const used = 18; // 1.8% of 10% cap → 18% budget used
  const size = 56,
    r = 22,
    circ = 2 * Math.PI * r;
  const offset = circ - used / 100 * circ;
  return /*#__PURE__*/React.createElement("div", {
    id: "riskGauge",
    className: "state-ok",
    style: {
      position: 'relative',
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      padding: 10,
      background: 'var(--bg-panel,rgba(20,20,20,0.9))',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "rg-ring-wrap",
    style: {
      position: 'relative',
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${size} ${size}`,
    width: size,
    height: size
  }, /*#__PURE__*/React.createElement("circle", {
    className: "rg-ring-track",
    cx: size / 2,
    cy: size / 2,
    r: r,
    stroke: "rgba(255,255,255,0.06)",
    fill: "none",
    strokeWidth: "4"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "rg-ring-fill",
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: "#22c55e",
    strokeWidth: "4",
    strokeLinecap: "round",
    strokeDasharray: circ,
    strokeDashoffset: offset,
    transform: `rotate(-90 ${size / 2} ${size / 2})`
  })), /*#__PURE__*/React.createElement("div", {
    className: "rg-pct",
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "rg-pct-num",
    style: {
      fontFamily: "'Orbitron',monospace",
      fontSize: 14,
      fontWeight: 800,
      color: '#22c55e'
    }
  }, "18%"), /*#__PURE__*/React.createElement("span", {
    className: "rg-pct-sub",
    style: {
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 7,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: '#22c55e',
      marginTop: 1
    }
  }, "SAFE"))), /*#__PURE__*/React.createElement("span", {
    className: "rg-label",
    style: {
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 8,
      fontWeight: 600,
      color: '#71717a',
      textTransform: 'uppercase',
      letterSpacing: '0.08em'
    }
  }, "Risk Budget"));
}

/* ═══════ STRATEGY LEADERBOARD (strategy-leaderboard.js DOM) ═══════ */
function StrategyLeaderboard() {
  const aggPnl = D3.STRATEGIES.reduce((s, r) => s + r.pnl, 0);
  const aggTrades = D3.STRATEGIES.reduce((s, r) => s + r.trades, 0);
  const aggWins = D3.STRATEGIES.reduce((s, r) => s + r.wins, 0);
  const aggWr = aggTrades > 0 ? aggWins / aggTrades * 100 : 0;
  const maxAbs = D3.STRATEGIES.reduce((m, r) => Math.max(m, Math.abs(r.pnl)), 0) || 1;
  return /*#__PURE__*/React.createElement("div", {
    id: "strategyLeaderboard",
    style: {
      background: 'rgba(15,15,15,0.72)',
      backdropFilter: 'blur(10px) saturate(140%)',
      border: '1px solid rgba(220,38,38,0.14)',
      borderRadius: 8,
      padding: '10px 12px',
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sl-head",
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: '#e4e4e7'
    }
  }, "Strategy Leaderboard \xB7 Session"), /*#__PURE__*/React.createElement("button", {
    className: "sl-reset",
    style: {
      fontSize: 9,
      color: '#71717a',
      background: 'none',
      border: 'none',
      cursor: 'pointer'
    }
  }, "\u27F2 reset")), /*#__PURE__*/React.createElement("div", {
    className: "sl-agg",
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 10,
      paddingBottom: 8,
      borderBottom: '1px solid rgba(255,255,255,0.06)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: `sl-agg-pnl ${aggPnl >= 0 ? 'pos' : 'neg'}`,
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: aggPnl >= 0 ? '#22c55e' : '#ef4444'
    }
  }, fmtUsd(aggPnl)), /*#__PURE__*/React.createElement("span", {
    className: "sl-agg-meta",
    style: {
      fontSize: 10,
      color: '#71717a'
    }
  }, aggTrades, " trades \xB7 ", aggWr.toFixed(0), "% WR")), D3.STRATEGIES.map(r => {
    const pnlClass = r.pnl >= 0 ? 'pos' : 'neg';
    const barPct = Math.min(100, Math.abs(r.pnl) / maxAbs * 100);
    const wr = r.trades > 0 ? r.wins / r.trades * 100 : 0;
    return /*#__PURE__*/React.createElement("div", {
      key: r.name,
      className: "sl-row",
      style: {
        padding: '6px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "sl-row-top",
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "sl-name",
      style: {
        fontWeight: 600,
        color: '#e4e4e7'
      }
    }, r.name), /*#__PURE__*/React.createElement("span", {
      className: `sl-pnl ${pnlClass}`,
      style: {
        fontWeight: 700,
        color: r.pnl >= 0 ? '#22c55e' : '#ef4444'
      }
    }, fmtUsd(r.pnl))), /*#__PURE__*/React.createElement("div", {
      className: "sl-bar",
      style: {
        height: 3,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 2,
        overflow: 'hidden',
        margin: '4px 0 3px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: `sl-bar-fill ${pnlClass}`,
      style: {
        height: '100%',
        width: `${barPct}%`,
        background: r.pnl >= 0 ? '#22c55e' : '#ef4444',
        transition: 'width 0.3s ease'
      }
    })), /*#__PURE__*/React.createElement("div", {
      className: "sl-meta",
      style: {
        fontSize: 10,
        color: '#71717a'
      }
    }, r.trades, " trades \xB7 ", wr.toFixed(0), "% WR"));
  }));
}

/* ═══════ EQUITY CURVE (equity-curve.js DOM) ═══════ */
function EquityCurve() {
  const pts = [];
  let v = 42000;
  for (let i = 0; i < 48; i++) {
    v += (Math.random() - 0.4) * 240;
    pts.push(v);
  }
  const w = 560,
    h = 180,
    mn = Math.min(...pts),
    mx = Math.max(...pts),
    rng = mx - mn || 1;
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * w / (pts.length - 1)).toFixed(1)} ${(h - (p - mn) / rng * (h - 24) - 12).toFixed(1)}`).join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  return /*#__PURE__*/React.createElement("div", {
    id: "equityCurve",
    style: {
      background: 'var(--bg-panel,rgba(20,20,20,0.9))',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
      padding: 8,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
      padding: '0 4px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: '#e4e4e7'
    }
  }, "Equity Curve"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: '#22c55e',
      fontWeight: 600
    }
  }, "+13.8% MTD")), /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${w} ${h}`,
    preserveAspectRatio: "none",
    style: {
      width: '100%',
      height: h,
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "eqg",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: up ? 'rgba(0,255,136,0.20)' : 'rgba(255,51,102,0.20)'
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "rgba(0,0,0,0)"
  }))), /*#__PURE__*/React.createElement("line", {
    x1: "0",
    y1: h * 0.5,
    x2: w,
    y2: h * 0.5,
    stroke: "rgba(255,215,0,0.25)",
    strokeWidth: "1",
    strokeDasharray: "4 4"
  }), /*#__PURE__*/React.createElement("path", {
    d: `${path} L ${w} ${h} L 0 ${h} Z`,
    fill: "url(#eqg)"
  }), /*#__PURE__*/React.createElement("path", {
    d: path,
    fill: "none",
    stroke: up ? '#00ff88' : '#ff3366',
    strokeWidth: "2"
  })));
}

/* ═══════ LIVE REPORT (live-report.js DOM) ═══════ */
function LiveReport() {
  const colors = {
    pos: '#22c55e',
    neg: '#ef4444',
    warn: '#fbbf24',
    '': '#e4e4e7'
  };
  return /*#__PURE__*/React.createElement("div", {
    id: "liveReport",
    style: {
      background: 'var(--bg-panel,rgba(20,20,20,0.9))',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
      padding: '10px 12px',
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: '#e4e4e7',
      marginBottom: 8
    }
  }, "Live Trade Report"), D3.REPORT.map(([k, v, cls]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '6px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#888'
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      color: colors[cls] || '#e4e4e7',
      fontWeight: 700
    }
  }, v))));
}

/* ═══════ SYSTEM HEALTH FOOTER (system-health.js DOM) ═══════ */
function SystemHealth() {
  const H = D3.HEALTH;
  return /*#__PURE__*/React.createElement("footer", {
    className: "dash-footer",
    style: {
      minHeight: 56,
      borderTop: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      padding: '8px 12px',
      flexShrink: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    id: "systemHealth",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap',
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 11,
      color: '#888'
    }
  }, [['SessionRouter', H.sessionRouter], ['Kraken WS', H.krakenWs], ['Alpaca WS', H.alpacaWs]].map(([name, ok]) => /*#__PURE__*/React.createElement("span", {
    key: name,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: ok ? '#00ff88' : '#ff3366',
      boxShadow: ok ? '0 0 6px rgba(0,255,136,0.5)' : '0 0 6px rgba(255,51,102,0.5)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: ok ? '#00ff88' : '#ff3366'
    }
  }, name))), /*#__PURE__*/React.createElement("span", null, "Errors ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: H.errors === 0 ? '#22c55e' : '#ef4444'
    }
  }, H.errors)), /*#__PURE__*/React.createElement("span", null, "Uptime ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#fff'
    }
  }, H.uptime)), /*#__PURE__*/React.createElement("span", null, "Risk ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#22c55e'
    }
  }, H.riskPosture)), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      color: '#555'
    }
  }, "commit ", H.commit, " \xB7 paper mode")));
}

/* ═══════ PLACEHOLDER PANELS ═══════ */
function PlaceholderPanel({
  id,
  label
}) {
  return /*#__PURE__*/React.createElement("div", {
    id: id,
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 80,
      background: 'var(--bg-panel,rgba(20,20,20,0.9))',
      border: '1px dashed rgba(255,255,255,0.2)',
      borderRadius: 8,
      padding: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'rgba(160,160,160,0.6)',
      fontSize: 10,
      fontWeight: 300
    }
  }, "[ ", label, " ]"));
}
window.OGZ_RIGHT = {
  OpenPositions,
  EdgeAnalytics,
  TraiBrain,
  RiskGauge,
  StrategyLeaderboard,
  EquityCurve,
  LiveReport,
  SystemHealth,
  PlaceholderPanel
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/trading-dashboard/panels-rail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/trading-dashboard/panels-top.jsx
try { (() => {
/* OGZPrime UI Kit — Header, Watchlist, News panels.
   Uses REAL production class names from header-strip.js, watchlist-strip.js, news-ticker.js */

const D = window.OGZ_DATA;

/* ═══════ HEADER STRIP (header-strip.js DOM) ═══════ */
function HeaderStrip() {
  const aggPnl = D.POSITIONS.reduce((s, p) => s + p.pnl, 0);
  const up = aggPnl >= 0;
  return /*#__PURE__*/React.createElement("header", {
    id: "dashHeader",
    className: "dash-header",
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '12px 24px',
      background: 'linear-gradient(180deg,#0d0d1a 0%,#080812 100%)',
      borderBottom: '1px solid rgba(255,255,255,0.15)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.8)',
      minHeight: 68,
      position: 'relative',
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "hs-brand",
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: '0 0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "hs-logo",
    style: {
      display: 'block',
      width: 180,
      height: 48,
      backgroundImage: 'url(../../assets/logos/ogz-logo-white.png)',
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'left center',
      filter: 'drop-shadow(0 0 10px rgba(179,21,18,0.50))'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "hs-tagline",
    style: {
      color: '#888',
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 11,
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '2.8px',
      marginTop: 4,
      textShadow: '0 0 6px rgba(220,38,38,0.18)'
    }
  }, "Neural Ensemble \u2022 Real-Time Data")), /*#__PURE__*/React.createElement("div", {
    className: "hs-hero-price",
    style: {
      flex: 1,
      textAlign: 'center',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "hs-hero-price-main",
    style: {
      fontFamily: "'Orbitron',monospace",
      fontSize: 36,
      fontWeight: 800,
      color: up ? '#22c55e' : '#ef4444',
      letterSpacing: '1.5px',
      textShadow: up ? '0 0 22px rgba(34,197,94,0.4)' : '0 0 22px rgba(239,68,68,0.4)',
      lineHeight: 1
    }
  }, "$", aggPnl >= 0 ? '' : '−', "$", Math.abs(48210.55).toLocaleString('en-US', {
    minimumFractionDigits: 2
  })), /*#__PURE__*/React.createElement("div", {
    className: "hs-hero-price-delta pos",
    style: {
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 13,
      color: '#22c55e',
      marginTop: 4,
      letterSpacing: '0.5px'
    }
  }, "\u25B2 +2.41% today"), /*#__PURE__*/React.createElement("div", {
    className: "hs-hero-session-meta",
    style: {
      display: 'flex',
      gap: 12,
      justifyContent: 'center',
      marginTop: 4,
      fontSize: 11,
      color: '#888'
    }
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "hs-meta-key",
    style: {
      color: '#666',
      marginRight: 4
    }
  }, "trades"), /*#__PURE__*/React.createElement("span", {
    className: "hs-meta-val",
    "data-k": "trades"
  }, "14")), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "hs-meta-key",
    style: {
      color: '#666',
      marginRight: 4
    }
  }, "win"), /*#__PURE__*/React.createElement("span", {
    className: "hs-meta-val",
    "data-k": "win"
  }, "61%")), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "hs-meta-key",
    style: {
      color: '#666',
      marginRight: 4
    }
  }, "unr"), /*#__PURE__*/React.createElement("span", {
    className: "hs-meta-val",
    "data-k": "unr",
    "data-money": "true"
  }, "+$748")))), /*#__PURE__*/React.createElement("div", {
    className: "hs-status-cluster",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flex: '0 0 auto',
      marginLeft: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "hs-status-lights-bar",
    style: {
      display: 'flex',
      gap: 15,
      alignItems: 'center',
      background: 'rgba(0,0,0,0.5)',
      padding: '8px 15px',
      borderRadius: 20,
      border: '1px solid rgba(255,255,255,0.1)'
    }
  }, ['DATA', 'BOT', 'TRAI'].map(name => /*#__PURE__*/React.createElement("div", {
    key: name,
    className: "hs-status-light",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 11,
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "hs-light active",
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: '#00ff88',
      boxShadow: '0 0 8px rgba(0,255,136,0.6)',
      animation: 'hs-status-pulse 1.2s infinite'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "hs-label",
    style: {
      color: '#00ff88'
    }
  }, name)))), /*#__PURE__*/React.createElement("div", {
    className: "hs-risk-budget",
    title: "Risk budget",
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '6px 12px',
      background: 'rgba(0,0,0,0.5)',
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.1)',
      minWidth: 70
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "hs-risk-budget-percent",
    style: {
      fontFamily: "'Orbitron',monospace",
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--profit-color,#22c55e)',
      letterSpacing: 1
    }
  }, "1.8%"), /*#__PURE__*/React.createElement("div", {
    className: "hs-risk-budget-level",
    style: {
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 9,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '1.2px',
      color: 'var(--profit-color,#22c55e)',
      marginTop: 2
    }
  }, "SAFE")), /*#__PURE__*/React.createElement("select", {
    className: "hs-account-selector",
    style: {
      background: 'rgba(0,0,0,0.5)',
      border: '1px solid rgba(255,255,255,0.1)',
      color: '#fff',
      padding: '6px 12px',
      borderRadius: 8,
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 12,
      fontWeight: 500,
      textTransform: 'uppercase',
      cursor: 'pointer',
      maxWidth: 150
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "default"
  }, "Account: Default"))));
}

/* ═══════ WATCHLIST STRIP (watchlist-strip.js DOM) ═══════ */
function WatchlistStrip() {
  const [selected, setSelected] = React.useState('TSLA');
  return /*#__PURE__*/React.createElement("div", {
    id: "watchlistStrip",
    style: {
      display: 'flex',
      gap: 8,
      padding: 12,
      overflowX: 'auto',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      background: '#0a0a0a',
      flexShrink: 0
    }
  }, D.TICKERS.map(t => {
    const pct = (t.price - t.priceOpen) / t.priceOpen * 100;
    const up = pct >= 0;
    const sel = t.symbol === selected;
    const stateColors = {
      SCAN: '#888',
      LONG: '#00ff88',
      SHORT: '#ff3366',
      COOL: '#fbbf24',
      FAULT: '#ff3366'
    };
    return /*#__PURE__*/React.createElement("div", {
      key: t.symbol,
      className: `ws-card${sel ? ' selected' : ''}`,
      onClick: () => setSelected(t.symbol),
      style: {
        flexShrink: 0,
        width: 132,
        padding: '10px 10px 8px',
        borderRadius: 8,
        cursor: 'pointer',
        background: sel ? 'rgba(0,204,255,0.12)' : 'rgba(14,14,16,0.72)',
        border: `1px solid ${sel ? 'rgba(0,204,255,1)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: sel ? '0 0 16px rgba(0,204,255,0.5)' : 'none',
        transform: sel ? 'scale(1.02)' : 'none',
        transition: 'all 0.2s ease'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "ws-sym",
      style: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.5px'
      }
    }, t.symbol), /*#__PURE__*/React.createElement("span", {
      className: "ws-broker",
      style: {
        fontSize: 8,
        color: '#555',
        textTransform: 'uppercase',
        letterSpacing: 1
      }
    }, t.broker)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "ws-price",
      style: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 600
      }
    }, t.price < 10 ? t.price.toFixed(2) : t.price < 1000 ? t.price.toFixed(2) : t.price.toLocaleString('en-US', {
      maximumFractionDigits: 2
    })), /*#__PURE__*/React.createElement("span", {
      className: `ws-pct ${up ? 'up' : 'down'}`,
      style: {
        fontSize: 11,
        color: up ? '#00ff88' : '#ff3366'
      }
    }, up ? '+' : '', pct.toFixed(2), "%")), /*#__PURE__*/React.createElement("div", {
      className: "ws-sparkline-wrap",
      style: {
        width: '100%',
        height: 20,
        margin: '6px 0 4px'
      },
      dangerouslySetInnerHTML: {
        __html: window.renderSparklineSVG(t.sparkline)
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "ws-state-pill",
      style: {
        fontSize: 9,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        color: stateColors[t.positionState] || '#888',
        textAlign: 'center'
      }
    }, t.positionState));
  }));
}

/* ═══════ NEWS TICKER (news-ticker.js DOM) ═══════ */
function NewsTicker() {
  const sentColors = {
    bullish: '#00ff88',
    defensive: '#ff3366',
    neutral: '#ffd700'
  };
  return /*#__PURE__*/React.createElement("div", {
    id: "newsTicker",
    style: {
      display: 'flex',
      gap: 24,
      alignItems: 'center',
      padding: '8px 12px',
      overflowX: 'auto',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      background: '#0a0a0a',
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 12,
      flexShrink: 0,
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#f87171',
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: 'uppercase',
      flexShrink: 0
    }
  }, "\u25C6 LIVE"), D.NEWS.map((n, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: `nt-item nt-sent-${n.sentiment}`,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      color: '#ccc',
      padding: '4px 8px',
      borderRadius: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: sentColors[n.sentiment],
      flexShrink: 0
    }
  }), n.text)));
}
window.OGZ_TOP = {
  HeaderStrip,
  WatchlistStrip,
  NewsTicker
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/trading-dashboard/panels-top.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Metric = __ds_scope.Metric;

__ds_ns.Panel = __ds_scope.Panel;

__ds_ns.StatusLight = __ds_scope.StatusLight;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
