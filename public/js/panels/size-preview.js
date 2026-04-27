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

    const RISK_PCT = 0.01;         // 1% risk per trade
    const ATR_MULT = 1.5;          // SL distance multiplier on ATR
    const MIN_SL_PCT = 0.003;      // 0.3% minimum SL distance as % of price
    const EQUITY_CAP_PCT = 0.5;    // 50% equity cap on notional

    // Stance buckets (ordered low → high)
    const STANCES = [
        { max: 0.45, label: 'Low',            mult: 0.5, color: '#60a5fa' },
        { max: 0.65, label: 'Standard',       mult: 1.0, color: '#22c55e' },
        { max: 0.80, label: 'Aggressive',     mult: 1.4, color: '#eab308' },
        { max: Infinity, label: 'Max Allocation', mult: 1.8, color: '#ef4444' },
    ];

    const state = {
        mounted: false,
        equity: null,
        price: null,
        atr: null,
        confidence: null,   // 0-1
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
        const { equity, price, atr, confidence } = state;
        if (!isFinite(equity) || equity <= 0 || !isFinite(price) || price <= 0) {
            return { ready: false };
        }
        const risk = equity * RISK_PCT;
        const slPct = price * MIN_SL_PCT;
        const slAtr = isFinite(atr) && atr > 0 ? atr * ATR_MULT : 0;
        const slDist = Math.max(slAtr, slPct);
        const rawShares = slDist > 0 ? (risk / slDist) : 0;
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
            slPct: price > 0 ? (slDist / price) * 100 : 0,
            stance: s,
            confidence: confidence != null ? confidence : 0.5,
            capped: rawNotional > cap,
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

        const stance = m.ready ? m.stance : { label: '—', color: '#71717a', mult: 1.0 };
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
            // BUG FIX 2026-04-27: backend renamed 'balance' → 'equity' on price
            // payload (CandleProcessor:430). Prefer equity, fall back to balance.
            const eq = data.equity != null ? data.equity : data.balance;
            if (isFinite(eq) && eq > 0) state.equity = Number(eq);
            const p = data.price != null ? data.price
                   : data.close != null ? data.close
                   : (data.candle && data.candle.close);
            if (isFinite(p) && p > 0) state.price = Number(p);
            if (data.indicators && isFinite(data.indicators.atr) && data.indicators.atr > 0) {
                state.atr = Number(data.indicators.atr);
            }
            render();
        } catch (_) { /* swallow */ }
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
                socket.registerHandler('signal_analysis', (d) => {
                    try {
                        if (d && d.signal && d.signal.confidence != null) onConfidence(d.signal.confidence);
                    } catch (_) { /* swallow */ }
                });
                socket.registerHandler('bot_thinking', (d) => {
                    try {
                        if (d && d.confidence != null) onConfidence(d.confidence);
                    } catch (_) { /* swallow */ }
                });
                socket.registerHandler('balance_update', (d) => {
                    try {
                        const b = d && (d.balance != null ? d.balance : (d.data && d.data.balance));
                        if (isFinite(b) && b > 0) { state.equity = Number(b); render(); }
                    } catch (_) { /* swallow */ }
                });
                socket.registerHandler('state_update', (d) => {
                    try {
                        const b = d && d.state && d.state.balance;
                        if (isFinite(b) && b > 0) { state.equity = Number(b); render(); }
                    } catch (_) { /* swallow */ }
                });
            } catch (_) { /* swallow */ }
        },
        _compute: compute,
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

    try { window.OGZSizePreview = SizePreview; } catch (_) {}
})(window.OGZ = window.OGZ || {});
