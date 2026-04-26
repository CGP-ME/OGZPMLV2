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

    const BUFFER_SIZE = 32;        /* number of historical points kept */
    const SVG_W = 200;             /* viewBox width — independent of CSS width */
    const SVG_H = 28;              /* viewBox height */
    const PAD_Y = 3;               /* top/bottom padding inside the viewBox */

    const SELECTORS = {
        confSrc:   '#confidence',           /* canonical source written by core.js */
        mountHost: '#patternDisplay',       /* parent we inject into */
        anchor:    '#currentPatternName',   /* sibling we inject AFTER */
    };

    let confEl = null;
    let svgEl  = null;
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
        if (!Number.isFinite(v))   return 'tier-low';
        if (v >= 70)               return 'tier-high';
        if (v >= 40)               return 'tier-mid';
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
            const idxFromRight = (BUFFER_SIZE - 1) - (buf.length - 1 - i);
            const x = idxFromRight * stepX;
            const yNorm = Math.max(0, Math.min(100, v)) / 100;
            const y = (SVG_H - PAD_Y) - yNorm * (SVG_H - 2 * PAD_Y);
            return [x, y];
        });

        /* Build path d string */
        const linePath = points
            .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
            .join(' ');
        pathLine.setAttribute('d', linePath);

        /* Fill area: same line but closed back to baseline */
        const firstX = points[0][0];
        const lastX  = points[points.length - 1][0];
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
            mo.observe(src, { childList: true, characterData: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
