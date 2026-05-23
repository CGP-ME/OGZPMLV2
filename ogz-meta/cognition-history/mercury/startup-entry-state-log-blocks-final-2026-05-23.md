You are Mercury, adversarial reviewer for OGZPrime production trading code.

Attack this focused patch only. Do not review unrelated dashboard, strategy,
or sizing work.

Changed code under review:

- run-empire-v2.js:1547-1569
  - startTradingCycle() still starts the runtime loop.
  - startup logging no longer prints "Bot is now LIVE and trading".
  - it builds startupEntryBlocks from:
    - stateManager.get('isTrading') === false
    - stateManager.isHalted() / getHaltReason()
    - stateManager.isSymbolHalted(startupSymbol) / getSymbolHaltReason(startupSymbol)
  - if any blockers exist, it logs:
    [STARTUP] Bot online, but entries are blocked: ...
  - otherwise it logs:
    [STARTUP] Bot online and entries enabled

- core/StateManager.js:1306-1390
  - load() reads persisted state.
  - after restoring state, malformed persisted isTrading values
    (anything not boolean) are forced to:
      isTrading=false
      pauseReason/lastError = invalid persisted isTrading message if absent
  - corrected state shape is saved back after active trade scope validation.
  - missing persisted isTrading still inherits constructor default false.

- test/state-manager-load.test.js:1-51
  - writes persisted isTrading as the string "false".
  - expects StateManager to load paused, set pauseReason/lastError, and persist
    boolean false back to the state file.

Existing related guard from previous commit:

- core/OrderExecutor.js entry routing checks isTrading === false before BUY and
  SELL_SHORT outside real backtest mode.
- core/OrderExecutor.js checks symbolEntryHalts before entries.
- StateManager global halt remains separate via isHalted().

Attack questions:

1. Can startup still log "[STARTUP] Bot online and entries enabled" while
   effective entries are blocked by any of these current mechanisms?
   - isTrading=false
   - malformed persisted isTrading
   - global halt
   - active symbol halt for the configured trading pair

2. Can malformed persisted isTrading bypass the paused-entry gate after load?
   Include string "false", string "true", null, 0, 1, object, and missing key.

3. Does saving corrected state during load introduce a recursion, crash,
   premature file write, active-trade data loss, or scope-validation bypass?

4. Does this patch accidentally resume trading, clear a legitimate pause reason,
   clear a global/symbol halt, or mutate active trades beyond the existing
   scope-normalization behavior?

5. Does this patch change backtest/P0 behavior or create a mismatch between
   live/paper and backtest startup behavior?

6. Identify any remaining log-lie mechanism introduced by this patch. A log-lie
   means the startup banner claims entries are enabled while a known entry gate
   in the same process would refuse a BUY/SELL_SHORT before broker routing.

Use file:line evidence. If you find a real issue, give a minimal counterexample
state/env and the exact failing mechanism. If no issue is found, say what was
mechanically ruled out and what remains outside this patch's scope.
