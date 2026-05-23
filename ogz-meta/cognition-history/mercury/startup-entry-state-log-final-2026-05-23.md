# Mercury Attack Prompt - Startup Entry-State Log Final - 2026-05-23

Attack this final startup entry-state truth patch. Do not confirm it softly. Try to find a state where startup logs claim entries are enabled while `StateManager.isTrading=false`, where malformed persisted `isTrading` lets entries route, or where this patch changes trading behavior.

Changed files and ranges:

- `run-empire-v2.js:1547-1555`
- `core/StateManager.js:1306-1390`

Patch shape:

```js
// core/StateManager.js
this.state = { ...this.state, ...savedState };
if (typeof this.state.isTrading !== 'boolean') {
  const invalidIsTrading = this.state.isTrading;
  const pauseReason = `[StateManager.load] invalid persisted isTrading=${JSON.stringify(invalidIsTrading)}; forcing entries paused`;
  this.state.isTrading = false;
  this.state.pauseReason = this.state.pauseReason || pauseReason;
  this.state.lastError = this.state.lastError || pauseReason;
  correctedStateShape = true;
  console.warn(pauseReason);
}
...
if (correctedStateShape) {
  this.save();
}

// run-empire-v2.js
this.startTradingCycle();

if (stateManager.get('isTrading') === false) {
  const pauseReason = stateManager.get('pauseReason') || stateManager.get('lastError') || 'StateManager.isTrading=false';
  console.warn(`[STARTUP] Bot online, but entries are paused: ${pauseReason}\n`);
} else {
  console.log('[STARTUP] Bot online and entries enabled\n');
}
```

Focused test added:

- `test/state-manager-load.test.js:1-49`

Known context:

- Commit `594f023` already added the actual `OrderExecutor` entry gate for `BUY` and `SELL_SHORT`.
- Mercury found the log could still lie if persisted `isTrading` was malformed, because both the log and entry gate use strict `=== false`.
- The new `StateManager.load()` validation forces any malformed persisted `isTrading` value to boolean `false`, preserves/adds a pause reason, and saves the corrected state.
- Missing `isTrading` is already covered by constructor defaults because `this.state = { ...this.state, ...savedState }` keeps the default `false` when the saved key is absent.

Questions to attack:

1. Can startup still log entries enabled while the effective state is paused?
2. Can malformed persisted `isTrading` values still bypass the `OrderExecutor` paused-entry gate after load?
3. Does saving corrected state during load create a crash, recursion, or data-loss path?
4. Does the patch accidentally resume trading or clear a real pause reason?
5. Does it affect backtest/P0 behavior?
6. Does this close the log-lie/root state-shape mechanism, or only one symptom?

Return findings with severity, exact file:line evidence, and concrete reproduction path. If no blocker remains, say so explicitly and identify residual risks.
