Mercury attack prompt:

You are attacking the StateManager open-position entry identity patch in /opt/ogzprime/OGZPMLV2.

Scope:
- core/StateManager.js openPosition entry block and _rejectOpenPositionIdentity.
- core/StateManager.js decisionLedger skeleton creation inside openPosition.
- core/OrderExecutor.js BUY openPosition context around the long entry call.
- test/state-manager-open-position-scope.test.js and test/state-manager-load.test.js.

Attack objective:
Find a concrete input sequence where StateManager.openPosition still creates or broadcasts an active trade with fabricated entry identity.

Attack vectors:
1. Omit orderId, action, direction, or entryStrategy and make activeTrades mutate anyway.
2. Pass BUY+short or SELL_SHORT+long and make the trade store mismatched identity anyway.
3. Pass malformed action/direction strings that reach activeTrades or narrator entry output.
4. Provide ledgerData missing symbol/timeframe/executionMode and make decisionLedger store unknown/15m/backtest instead of derived immutable scope.
5. Find an OrderExecutor BUY path that now omits action or direction and causes live BUY entries to fail after broker routing.
6. Find a PositionTracker or gate caller broken by the new identity requirement in a way that would hide a real trade instead of failing loudly.
7. Identify whether this closes the underlying mechanism or only moves the defaulting into another field.

Do not confirm the implementation. Break it. Cite exact file:line evidence and provide a minimal failing input if you find one.
