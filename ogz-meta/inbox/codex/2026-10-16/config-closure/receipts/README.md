# Configuration identity on trade records

The existing ConfigLoader receipt (configuration fingerprint, role, settings/internals revisions and hashes) now travels into the entry-frozen policy, order-plan trace, decision ledger, decision autopsy and dashboard position projection. Old persisted trades without an entry receipt remain explicitly unknown; they are never relabelled with today's settings. No configuration owner, entry/exit policy or trading authority is added.

The actual pinned OrderExecutor entry-plan producer, StateManager.openPosition ledger writer/dashboard projector and TradingLoop decision-autopsy method pass in disposable helper isolation. A changed confidence save advances the current receipt while the existing frozen policy keeps its original identity. An exit-evaluation record carries that entry identity and policy hash. PolicyBuilder and ledger schema are actual modules. The fixture captures only the autopsy persistence sink; it does not exercise browser rendering, live orders or a complete trading-loop decision cycle. Decision ledger input in this fixture is explicit, so the full live strategy-decision producer remains source-traced rather than a claimed full-loop replay.

Initial agent fixtures imported dirty worktree source and contained duplicate symbol/timeframe properties. Those were withdrawn and corrected before review. The delivered fixture overrides all six changed modules with exact candidate sources and both canonical JSON files with the committed base files; no unrelated sizing, backtest or settings-value changes are included.

Mercury examined six of six changed modules and returned no_break_found, run 2026-10-16T20-53-33-523Z-43be9dbe7ae4. Exact tree/base/blob identities are in source-manifest.json. The raw answer is preserved. It is a static review, not an execution or global-index freshness claim.

Reproduce by exporting source-manifest.json candidate files to fixtures/candidate/<repo-relative file>, and base settings/internals to fixtures/pinned-config/<filename> as expected by the probe. Pass the probe and each source fixture explicitly through python3 scripts/test-isolated.py --fixture before -- node <probe>. See the probe's exact fixture paths.

No PM2 restart, environment reload, trading resume or runtime activation occurred.
