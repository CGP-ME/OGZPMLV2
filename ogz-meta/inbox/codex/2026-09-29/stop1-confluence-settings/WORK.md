# Work — 2026-09-29

Active branch: astra-era. Baseline: 954d57d13403cbfb22c4023ec70b5e0c107943e2. Production candidate tree: bda5ffac7e06c47538a955852b27d9361d634bf9. Final adversarial adjudication passed; source is ready for atomic delivery. The containing commit supplies the code/packet SHA association.

One logical fix: make the configured confluence multipliers the sole sizing input throughout the entry plan. Four existing leaves become editable through ConfigLoader; retained orchestrators read the current compiled input. Constructor overrides and downstream invented multipliers are removed. The external malformed-map boundary names invalid fields, quarantines that input before strategy routing, and permits explicit repair without restart. Existing exits keep their entry policy.

The independent TPO override could promote an orchestrator HOLD to an entry lacking its entry plan. It is removed together with its obsolete knob and validator; the actual OGZTPO strategy remains registered. TradingLoop ledger, fanout and OrderExecutor read the actual producer multiplier.

Production files: foundation/ConfigLoader.js, core/StrategyOrchestrator.js, core/TradingLoop.js, core/OrderExecutor.js, core/OgzTpoIntegration.js, run-empire-v2.js, config/settings.json. Existing TPO tests are updated for the removed knob and current configuration owner/required timeframe. No production numeric tuning, broker actions or PM2 restart.

Fixtures read exact staged modules, not inherited worktree changes. Synthetic inputs and stub execution are explicit. All unrelated dirty edits remain excluded.
