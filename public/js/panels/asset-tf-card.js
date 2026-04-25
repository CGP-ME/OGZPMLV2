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
        card:     '.asset-tf-card',
        symbol:   '.asset-tf-card__symbol',
        price:    '.asset-tf-card__price',
        delta:    '.asset-tf-card__delta',
        pillRoot: '.asset-tf-card__pills',
        pill:     '.asset-tf-card__pill',
        symbolSelect:    '#symbolSelector',
        timeframeSelect: '#timeframeSelector',
        priceSrc:        '#currentPrice',
    };

    function $(sel, root) { return (root || document).querySelector(sel); }
    function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

    function syncSymbol() {
        const symbolSel = $(SELECTORS.symbolSelect);
        const symbolEl  = $(SELECTORS.symbol);
        if (!symbolSel || !symbolEl) return;
        symbolEl.textContent = symbolSel.value || 'TSLA';
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
        tfSel.dispatchEvent(new Event('change', { bubbles: true }));
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
            mo.observe(priceSrc, { childList: true, characterData: true, subtree: true });
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
