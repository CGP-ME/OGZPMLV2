Finish correcting the frontend audit. Documentation only; do not implement fixes.

Use branch codex/archive-legacy-env at this exact current committed source:
792e8af4a03a150a837741aea4883eefff4604d7

The attached four reports describe historical source:
78458d485fbfa74e0c8f4ed32b430dfe2d7bace4

Use those reports as the findings checklist. Reconcile their findings against the current SHA above and produce one clearly identified current audit set. Preserve the old reports as historical evidence; do not mix old line numbers or behavior into current claims. The VPS working tree contains other unpublished changes, and the running bot has not loaded these source fixes. Neither is the source for this audit.

Backend changes that interrupted this audit

- f0eff88f removed the independent isTrading enable authority. Current StateManager references to the old field delete it from saved state and retire its synthetic error. They are migration cleanup, not a second trading switch.
- 8eeb0c35 removed the dummy StateManager.isHalted/getHaltReason APIs and their production callers. PositionTracker.isHalted is a separate API; do not confuse the two.
- 792e8af4 fixed bot-side pause/resume receipt truth: StateManager propagates failed state updates; WebSocketManager awaits the result and sends rejection for failure; state_update.state now exposes actual pause metadata. It does not reintroduce isTrading.

Read the current code and the two verification/review directories under ogz-meta/inbox/codex/2026-10-16/retire-global-halt/ and pause-receipt-truth/. These establish the specific source changes and isolated checks recorded there. They do not establish browser-to-relay delivery, complete control ownership, or runtime activation. Do not prescribe isTrading in any current payload, UI state, receipt requirement, or proposed fix.

Required corrections

1. request_historical is conditionally mutating. At the historical SHA, WebSocketManager.js:302 calls fetchAndSendHistoricalCandles(), which writes this.timeframeHistories[timeframe] at run-empire-v2.js:2461 when the requested symbol matches the active symbol. Trace this at the current SHA and cite current lines. Classify the cache write explicitly. Trace downstream trading/learning consumers; leave effects OPEN where evidence is incomplete. Not assigning dashboardTimeframe does not mean no bot-state mutation.

2. Scope the census precisely: 45 repository-owned scripts covered; one external Lightweight Charts script excluded; 46 script-src tags total. Settings Save belongs to the adjacent control-panel surface: v2 does not load configuration-settings.js. chart.js is not in the v2 script list; require dynamic-loading evidence before including it. Inline scripts, computed sends and runtime DOM/binding sites remain unresolved until traced. Static absence of trade-manager DOM targets does not prove runtime impossibility or authorize deletion.

3. Fix C5's contradiction with C2: say no timeframe_change was found among the control panel's enumerated literal sends. Do not assert categorical absence while computed builders remain unresolved. Record timeframe_change's cross-owner/cross-bot broadcast scope where the current relay proves it.

4. Reconcile the entire pause/resume row against the current producer -> relay -> bot -> StateManager -> receipt -> UI path. Mark the old premature-confirmation defect resolved only to the extent the current code and isolated receipts prove. Separately establish relay delivery, owner targeting, receipt consumption, request correlation, replay effects and overlapping-pause behavior. A bot-side fix does not make the full control PASS. In the historical report only, resumeTrading set isTrading:true and cleared pause metadata; it did not clear isTrading.

5. Do not invent trading policy from old system-pause names. The operator removed isTrading and rejected redundant enable switches. Their account-loss ruling is 50% of whole-account value in an America/New_York calendar day, prompting the operator to resume; actual prop-evaluation rules remain separate. This prompt does not implement that rule or declare it implemented. Any resume invariant must identify the intended owner and actual state transition; an unrelated automated recovery must not silently erase a manual pause. Report code/policy conflicts rather than adding blockers or blanket protections for obsolete pauses.

6. Preserve the other audit corrections: distinguish idempotency key, concurrency token/CAS, dedupe store, retry outcome and replay side effects. Last-write-wins is not idempotency. C1 remains OPEN without proven save serialization/atomicity. Split mismatched symbol/timeframe isolation from same-scope freshness and owner isolation. C9 proves socket identity/lifecycle separation only. G1.2: dashboard disconnect does not proactively clear pending entries; an entry leaks only if no later receipt deletes it. Recheck each status against current evidence rather than copying historical PASS/FAIL labels.

Return

- Current frontend census with its exact covered and unresolved scope.
- Current mutating-control matrix, including the separate control-panel surface.
- Current non-interference statuses with current file:line evidence.
- AUDIT-INDEX identifying the authoritative current set and archived historical reports, exact source SHA, artifact hashes and artifact commit status separately.
- A short list of findings changed by the backend fixes and findings still OPEN.

Superseded reports must not retain actionable approval instructions beside current evidence. Do not implement production fixes, add gates/throws/fallbacks/defaults, start or restart services, or claim unperformed runtime tests passed. The finished product here is the corrected audit, not certification that the whole bot is finished.
