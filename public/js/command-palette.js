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
        commands: [],          // Registered (static) commands
        dynamic: [],           // Rebuilt each open() from DOM
        filtered: [],          // Currently-displayed rows
        lastToast: null,
        previouslyFocused: null,
    };

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
        overlay.addEventListener('mousedown', (e) => {
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
        if (!needle) return { score: 0, indices: [] };
        const hs = haystack.toLowerCase();
        const nd = needle.toLowerCase();

        // Fast path 1: exact substring. Prefer the LAST occurrence so a
        // query like "tsla" lines up with the ticker at the end of the
        // title rather than the first stray "t" earlier in the string.
        let subIdx = hs.lastIndexOf(nd);
        if (subIdx === -1) subIdx = hs.indexOf(nd);
        if (subIdx !== -1) {
            let score = 40 + nd.length * 2;
            if (subIdx === 0) score += 15;                 // start-of-string
            else if (isWordBoundary(hs, subIdx)) score += 10; // word-start
            score -= (haystack.length - needle.length) * 0.03;
            const indices = [];
            for (let i = 0; i < nd.length; i++) indices.push(subIdx + i);
            return { score, indices };
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
                prevWasSpace = (hc === ' ' || hc === '-' || hc === '_' || hc === '.');
                hi++;
            }
            if (!found) return null;
        }

        // Penalty for leftover length (shorter hits rank higher)
        score -= (haystack.length - needle.length) * 0.03;
        return { score, indices };
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
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
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
                if (!confirm('Pause trading?\n\nThis halts all new entries until resumed.')) {
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
                if (!confirm('Resume trading?\n\nThis re-enables new entries.')) {
                    toast('Resume cancelled');
                    return;
                }
                sendSocket({ type: 'command', command: 'resume_trading' });
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
                sendSocket({ type: 'ping', timestamp: start });
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
                const last = (window.OGZ && window.OGZ.state && window.OGZ.state.lastBotMessageAt) || 0;
                const delta = last ? Math.round((Date.now() - last) / 1000) : null;
                toast(
                    delta == null
                        ? 'No bot message yet this session'
                        : `Last bot message: ${delta}s ago`
                );
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
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                const btn = document.getElementById('traiChatToggle')
                    || document.querySelector('[id*="trai" i][id*="toggle" i]')
                    || document.querySelector('.trai-widget button, .trai-chat-toggle');
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
            run: () => { window.location.href = '/command-center'; }
        });
        cmds.push({
            id: 'ui-reload',
            title: 'Reload dashboard',
            subtitle: 'Hard refresh this page',
            category: 'Dashboard',
            icon: '🔄',
            run: () => { window.location.reload(); }
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
                    run: () => changeSelect(assetSel, opt.value, 'Asset'),
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
                    run: () => changeSelect(tfSel, opt.value, 'Timeframe'),
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
                    run: () => changeSelect(ctSel, opt.value, 'Chart type'),
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
                    run: () => changeSelect(tierSel, opt.value, 'Tier'),
                });
            }
        }

        // Indicator toggles — scan for any #chk-* checkbox
        const checks = document.querySelectorAll('#indicatorCheckboxes input[type="checkbox"]');
        checks.forEach(chk => {
            const labelEl = chk.closest('label');
            const name = labelEl ? (labelEl.querySelector('span:last-child')?.textContent || chk.value) : chk.value;
            cmds.push({
                id: `ind-${chk.id}`,
                title: `Toggle ${name}`,
                subtitle: chk.checked ? 'Currently ON → will turn OFF' : 'Currently OFF → will turn ON',
                category: 'Indicators',
                icon: chk.checked ? '🔆' : '🔅',
                run: () => {
                    chk.checked = !chk.checked;
                    chk.dispatchEvent(new Event('change', { bubbles: true }));
                    toast(`${name}: ${chk.checked ? 'ON' : 'OFF'}`);
                },
            });
        });

        return cmds;
    }

    function isCryptoCode(code) {
        return /-USD$/.test(code) || /^(BTC|ETH|SOL|XRP|DOGE|ADA|AVAX|LINK|LTC|DOT)/.test(code);
    }

    function changeSelect(sel, value, label) {
        sel.value = value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
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
            state.filtered = all.map(c => ({ cmd: c, score: 0, indices: [] }));
        } else {
            const results = [];
            for (const cmd of all) {
                const hay = cmd.title + ' ' + (cmd.subtitle || '') + ' ' + (cmd.category || '');
                const scored = fuzzyScore(hay, q);
                if (scored) {
                    results.push({ cmd, score: scored.score, indices: scored.indices });
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
            const { cmd, indices } = row;
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
            el.addEventListener('click', (ev) => {
                state.selected = parseInt(el.dataset.idx, 10);
                runSelected(ev);
            });
        });

        // Scroll selected into view (important for arrow nav)
        const activeEl = list.querySelector('.ogz-cp-active');
        if (activeEl && typeof activeEl.scrollIntoView === 'function') {
            activeEl.scrollIntoView({ block: 'nearest' });
        }
    }

    function updateActive() {
        const rows = document.querySelectorAll(`#${LIST_ID} .ogz-cp-row`);
        rows.forEach((el, i) => {
            el.classList.toggle('ogz-cp-active', i === state.selected);
            el.setAttribute('aria-selected', i === state.selected ? 'true' : 'false');
        });
        const activeEl = rows[state.selected];
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
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
            try { state.previouslyFocused.focus({ preventScroll: true }); }
            catch (_) { /* noop */ }
        }
    }

    function toggle() { state.open ? close() : open(); }

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
            const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (a && a.isContentEditable);
            if (!isTyping) {
                e.preventDefault();
                open();
            }
        }
    }

    // ─── Toast ───────────────────────────────────────────────────────────
    function toast(message, ms = 1800) {
        // Dedupe back-to-back identical toasts
        if (state.lastToast && state.lastToast.message === message &&
            Date.now() - state.lastToast.shownAt < 400) {
            return;
        }
        state.lastToast = { message, shownAt: Date.now() };

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
            if (_isInitialized) return;  // idempotent re-init guard
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
                try { clearTimeout(tid); } catch (_) { /* timer may be stale */ }
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
                run: cmd.run,
            });
        },
        unregister(id) {
            state.commands = state.commands.filter(c => c.id !== id);
        },
        isOpen() { return state.open; },
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
        try { CommandPalette.destroy(); } catch (e) {
            console.warn('[CommandPalette] destroy() failed on unload:', e);
        }
    });
})(window.OGZ || (window.OGZ = {}));
