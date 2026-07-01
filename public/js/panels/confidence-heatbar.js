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
        stack: [],           // [{ name, confidence, direction }]
        winner: null,        // winner strategy name
        lastUpdate: 0,
    };

    // ─── Helpers ────────────────────────────────────────────────────────

    // Normalize confidence: incoming values may be 0-1 OR 0-100.
    function normConf(c) {
        const n = Number(c);
        if (!isFinite(n) || n <= 0) return 0;
        return n > 1 ? Math.min(1, n / 100) : Math.min(1, n);
    }

    function directionOf(sig) {
        const d = (sig && sig.direction) ? String(sig.direction).toLowerCase() : '';
        if (d === 'buy' || d === 'long' || d === 'up') return 'buy';
        if (d === 'sell' || d === 'short' || d === 'down') return 'sell';
        return null;
    }

    // Read incoming strategy list from any of the 3 supported message shapes.
    function normalizeStack(input) {
        if (!Array.isArray(input)) return [];
        return input
            .map(s => {
                if (!s) return null;
                const name = s.name || s.strategyName || s.id || s.label;
                if (!name) return null;
                return {
                    name: String(name),
                    confidence: normConf(s.confidence),
                    direction: directionOf(s),
                };
            })
            .filter(Boolean);
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

        // The v2 shell ships an empty <div id="confidenceHeatbar"> in the
        // top strategy band. The module adopts that element instead of
        // creating a duplicate root. Build the scaffold on adoption so
        // renderSegments() always has the .hb-track/.hb-winner-tag nodes it
        // needs when live bot_thinking / signal_analysis data arrives.
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
        if (tag) { tag.textContent = ''; tag.classList.remove('hb-visible'); }
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
            seg.className = 'hb-segment'
                + (isWinner ? ' hb-winner' : '')
                + (isOpposing ? ' hb-opposing' : '');
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
                socket.registerHandler('bot_thinking', (d) => {
                    try {
                        if (!d) return;
                        const stack = normalizeStack(d.strategy_stack);
                        if (stack.length === 0) return;
                        const winner = d.winner_id
                            || (d.winner && d.winner.id)
                            || (d.winner && d.winner.name)
                            || null;
                        renderSegments(stack, winner);
                    } catch (_) { /* never let a render kill the feed */ }
                });

                // 2. signal_analysis (TradingLoop emissions)
                socket.registerHandler('signal_analysis', (d) => {
                    try {
                        if (!d) return;
                        const signals = d.signal && Array.isArray(d.signal.signals) ? d.signal.signals : null;
                        if (!signals || signals.length === 0) return;
                        const stack = normalizeStack(signals);
                        if (stack.length === 0) return;
                        const winner = (d.modules && d.modules.orchestrator && d.modules.orchestrator.winner)
                            || (d.signal && d.signal.winner)
                            || null;
                        renderSegments(stack, winner);
                    } catch (_) { /* swallow */ }
                });

                // 3. orchestrator_result (legacy / fallback)
                socket.registerHandler('orchestrator_result', (d) => {
                    try {
                        if (!d) return;
                        const src = (d.signalBreakdown && d.signalBreakdown.signals)
                            || d.allResults
                            || null;
                        if (!src) return;
                        const stack = normalizeStack(src);
                        if (stack.length === 0) return;
                        const winner = (d.winner && (d.winner.name || d.winner.strategyName))
                            || d.winnerName
                            || null;
                        renderSegments(stack, winner);
                    } catch (_) { /* swallow */ }
                });
            } catch (_) { /* never throw from init */ }
        },

        render(stack, winnerName) {
            try {
                renderSegments(normalizeStack(stack), winnerName || null);
            } catch (_) { /* swallow */ }
        },

        clear() {
            state.stack = [];
            state.winner = null;
            renderPlaceholder();
        },
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
    try { window.OGZHeatbar = Heatbar; } catch (_) {}
})(window.OGZ = window.OGZ || {});
