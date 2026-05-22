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
    const HINT_KEY = 'ogz.layout.hintSeen';   // first-run discovery tooltip
    const DEFAULT_MODE = 'operator';
    const STYLE_ID = 'ogz-layout-switcher-styles';

    const MODES = [
        { key: 'operator', label: '🎛 Operator', tooltip: 'Full-vis default — everything visible' },
        { key: 'trader',   label: '📈 Trader',   tooltip: 'Chart-dominant — rails collapsed' },
        { key: 'showcase', label: '✨ Showcase', tooltip: 'Customer demo — branded, hide dev panels' },
        { key: 'streamer', label: '📹 Streamer', tooltip: 'OBS/Twitch — privacy + 16:9' }
    ];

    const state = {
        mode: DEFAULT_MODE,
        listeners: [],
        domRefs: { button: null, menu: null, hint: null },
        menuOpen: false,
        hintShown: false
    };

    // ─── Persistence ────────────────────────────────────────────────────
    function loadPersisted() {
        try {
            const v = localStorage.getItem(STORAGE_KEY);
            if (v && MODES.some(m => m.key === v)) state.mode = v;
        } catch (_) { /* swallow */ }
    }
    function savePersisted() {
        try { localStorage.setItem(STORAGE_KEY, state.mode); } catch (_) { /* swallow */ }
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
        btn.addEventListener('click', (e) => {
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
            item.addEventListener('click', (e) => {
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
        if (state.menuOpen) closeMenu(); else openMenu();
    }

    // ─── First-Run Discovery Hint ───────────────────────────────────────
    function hintAlreadySeen() {
        try { return localStorage.getItem(HINT_KEY) === '1'; }
        catch (_) { return false; }
    }
    function markHintSeen() {
        try { localStorage.setItem(HINT_KEY, '1'); } catch (_) { /* swallow */ }
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
        dismissBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dismissHint();
        });

        hint.appendChild(title);
        hint.appendChild(body);
        hint.appendChild(dismissBtn);
        // Stop a click inside the bubble from bubbling to the doc click-away
        hint.addEventListener('click', (e) => e.stopPropagation());

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
        const payload = { from, to: newMode };
        state.listeners.forEach(cb => { try { cb(payload); } catch (_) {} });
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
            } catch (_) { /* swallow */ }
        },
        getMode: () => state.mode,
        setMode,
        getModes: () => MODES.map(m => ({ ...m })),
        cycle,
        on(cb) { if (typeof cb === 'function') state.listeners.push(cb); },
        teardown() {
            try {
                document.removeEventListener('click', closeMenu);
                if (state.domRefs.button && state.domRefs.button.parentElement) {
                    state.domRefs.button.parentElement.remove();
                }
                const s = document.getElementById(STYLE_ID);
                if (s) s.remove();
            } catch (_) { /* swallow */ }
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
    try { window.OGZLayoutSwitcher = api; } catch (_) {}
})(window.OGZ = window.OGZ || {});
