# Mercury Attack Prompt - OrderExecutor Pause Gate Final - 2026-05-23

Attack this final hot-path patch. Do not confirm it softly. Try to find a state where the bot can still place a BUY or SELL_SHORT entry while `StateManager.isTrading=false`, where execution mode can spoof a backtest bypass, or where this patch blocks a legitimate exit/backtest path.

Changed file and range:

- `core/OrderExecutor.js:49-85`

Patch shape:

```js
if (decision.action === 'BUY' || decision.action === 'SELL_SHORT') {
  const missingScope = [];
  const hasText = (value) => value !== null && value !== undefined && String(value).trim() !== '';
  if (!hasText(this.ctx.config?.brokerId)) missingScope.push('brokerId');
  if (!hasText(this.ctx.config?.assetClass)) missingScope.push('assetClass');
  if (!hasText(this.ctx.config?.timeframe)) missingScope.push('timeframe');
  const executionMode = this.ctx.config?.enableBacktestMode ? 'backtest' : this.ctx.config?.executionMode;
  if (!hasText(executionMode)) missingScope.push('executionMode');
  if (missingScope.length > 0) {
    throw new Error(`[ENTRY-SCOPE] ${decision.action} for ${symbol} missing immutable trade scope field(s): ${missingScope.join(', ')} - refusing to route order before state identity is complete`);
  }
  if (executionMode === 'backtest' && this.ctx.backtestMode !== true) {
    throw new Error(`[ENTRY-MODE] ${decision.action} for ${symbol} resolved executionMode=backtest while runtime backtestMode is false - refusing to bypass paused-state entry gate`);
  }
  if (executionMode !== 'backtest' && stateManager.get('isTrading') === false) {
    const pauseReason = stateManager.get('pauseReason') || stateManager.get('lastError') || 'StateManager.isTrading=false';
    console.error(`[ENTRY] Refusing ${decision.action} for ${symbol}: trading paused (${pauseReason})`);
    return null;
  }
  const globalHaltReason = stateManager.isHalted() ? stateManager.getHaltReason() : null;
  const symbolHaltReason = stateManager.isSymbolHalted(symbol) ? stateManager.getSymbolHaltReason(symbol) : null;
  if (globalHaltReason || symbolHaltReason) {
    console.error(`[ENTRY] Refusing ${decision.action} for ${symbol}: ${globalHaltReason || symbolHaltReason}`);
    return null;
  }
}
```

Focused test added:

- `test/order-executor-pause-gate.test.js:1-111`

Known context:

- `StateManager.pauseTrading(reason)` writes `isTrading=false`, `lastError`, `pausedAt`, and `pauseReason`.
- `StateManager.resumeTrading()` clears those fields and sets `isTrading=true`.
- Current live `data/state.json` has `isTrading=false` from a liveness watchdog pause, but prior code did not read that state before entries.
- This patch intentionally applies only to `BUY` and `SELL_SHORT`. `SELL` and `COVER` exits must stay allowed while paused.
- This patch intentionally bypasses the pause gate only in runtime backtest mode because `StateManager` defaults `isTrading=false` and P0/backtest harnesses do not model live pause state.
- The first Mercury pass found a high-severity escape hatch: `enableBacktestMode` or `executionMode=backtest` could bypass pause outside real backtest mode. This final patch is the response to that finding.

Questions to attack:

1. Is there any entry action or path that can still route an opening trade while paused?
2. Can `executionMode`, `enableBacktestMode`, or missing scope be spoofed in a way that bypasses the pause gate but still routes?
3. Does the stricter `executionMode === 'backtest' && this.ctx.backtestMode !== true` guard break canonical P0/backtest execution?
4. Does returning `null` for paused entries create downstream state/log lies compared with other entry halt paths?
5. Does this patch accidentally block SELL/COVER exits, partial exits, or recovery closes?
6. Does this close the root mechanism, or only one symptom? Name any required follow-up fix with file:line evidence.

Return findings with severity, exact file:line evidence, and concrete reproduction path. If no blocker remains, say so explicitly and identify residual risks.
