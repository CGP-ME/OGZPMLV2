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

    function clamp(v) { return Math.max(MIN_PX, Math.min(MAX_PX, v)); }

    function applyWidth(side, px) {
        const clamped = clamp(px);
        const cssVar = side === 'left' ? '--left-rail-width' : '--right-rail-width';
        const lsKey  = side === 'left' ? LS_LEFT_KEY : LS_RIGHT_KEY;
        document.documentElement.style.setProperty(cssVar, clamped + 'px');
        try { localStorage.setItem(lsKey, String(clamped)); } catch (_) { /* private mode */ }
    }

    function restoreFromStorage() {
        try {
            const l = parseInt(localStorage.getItem(LS_LEFT_KEY) || '', 10);
            const r = parseInt(localStorage.getItem(LS_RIGHT_KEY) || '', 10);
            if (Number.isFinite(l) && l > 0) applyWidth('left', l);
            if (Number.isFinite(r) && r > 0) applyWidth('right', r);
        } catch (_) { /* swallow */ }
    }

    function fireChartResize() {
        // lightweight-charts: chart.resize(w, h)
        try {
            if (window.tvChart && typeof window.tvChart.resize === 'function') {
                const c = document.getElementById('tvChartContainer');
                if (c) window.tvChart.resize(c.clientWidth, c.clientHeight);
            }
        } catch (_) { /* swallow */ }
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
                const px = side === 'left'
                    ? (pendingX - 10)
                    : (window.innerWidth - pendingX - 10);
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
        bindHandle('left',  document.getElementById('leftRailResize'));
        bindHandle('right', document.getElementById('rightRailResize'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
