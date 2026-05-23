# Mercury Attack Prompt - OrderExecutor Pause Gate Whitelist Final - 2026-05-23

Attack this final hot-path patch. Do not confirm it softly. Try to find a state where the bot can still place an opening order while `StateManager.isTrading=false`, where execution mode can spoof a backtest bypass, where an unsupported action can reach live routing, or where this patch blocks a legitimate exit/backtest path.

Changed file and range:

- `core/OrderExecutor.js:23-85`

Patch shape:

```js
const SUPPORTED_ACTIONS = new Set(['BUY', 'SELL_SHORT', 'SELL', 'COVER']);

async executeTrade(decision, confidenceData, price, indicators, patterns, traiDecision = null, orchResult = null, symbol) {
  if (typeof symbol !== 'string' || !symbol) {
    throw new Error(
      `OrderExecutor.executeTrade requires explicit non-empty symbol; got ${JSON.stringify(symbol)}`
    );
  }
  if (!SUPPORTED_ACTIONS.has(decision?.action)) {
    throw new Error(
      `[ENTRY-ACTION] OrderExecutor.executeTrade unsupported action ${JSON.stringify(decision?.action)} for ${symbol} - refusing to route order`
    );
  }
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
}
```

Focused test added:

- `test/order-executor-pause-gate.test.js:1-129`

Known context:

- Current producers found in `core/TradingLoop.js:723-724` emit only `BUY` and `SELL_SHORT` entries. Partial exits are represented as `SELL` with `exitFraction`, not a separate action.
- This patch intentionally allows `SELL` and `COVER` through the pause gate so exits/recovery closes can still happen while entries are paused.
- First Mercury pass found a backtest-mode spoof. The `ENTRY-MODE` guard was added.
- Second Mercury pass found unsupported/future action names could reach routing. The `SUPPORTED_ACTIONS` guard was added.

Questions to attack:

1. Is there any current entry action or path that can still route an opening trade while paused?
2. Can an unsupported action such as `BUY_LIMIT`, `MARKET_BUY`, or null/missing action reach `orderRouter.sendOrder`?
3. Can `executionMode`, `enableBacktestMode`, or missing scope be spoofed in a way that bypasses the pause gate but still routes?
4. Does the stricter backtest guard break canonical P0/backtest execution?
5. Does returning `null` for paused entries create downstream state/log lies compared with other entry halt paths?
6. Does this patch accidentally block SELL/COVER exits, partial exits, or recovery closes?
7. Does this close the root mechanism, or only one symptom? Name any required follow-up fix with file:line evidence.

Return findings with severity, exact file:line evidence, and concrete reproduction path. If no blocker remains, say so explicitly and identify residual risks.
