# Mercury attack prompt: TTP 15:50 cutoff enforcement

Attack the TTP market-time cutoff patch. This is a trading-path eval rule.

Scope:
- `foundation/ConfigLoader.js:173-192` loads TTP market-time config: enabled, entry block, liquidation enabled, cutoff minutes before close.
- `foundation/ConfigLoader.js:327-334` validates cutoff config.
- `core/EvalRuleEngine.js:62-112` computes NYSE/ET cutoff state and blocks entries during the liquidation window.
- `core/OrderRouter.js:168-200` cancels open orders through registered broker adapters.
- `core/TtpCutoffEnforcer.js:26-128` runs cutoff enforcement: cancel pending orders, get broker positions, close active stock trades through `executeTrade`, fail if a trade remains open, and mark the cutoff complete.
- `run-empire-v2.js:1155-1162` wires the enforcer with eval rules, state, order router, executeTrade, runtime asset class, and exit-price lookup.
- `run-empire-v2.js:1960-1966` invokes the enforcer from the exit monitor before normal exit checks.
- `run-empire-v2.js:2009-2035` resolves cutoff exit prices from broker positions, symbol context, live market data, candle history, or StateManager last price.
- Focused tests: `test/eval-rule-engine.test.js`, `test/config-loader-live-guard.test.js`, `test/ttp-cutoff-enforcer.test.js`, `test/order-router-cancel.test.js`.

Adversarial question:
Find any real input sequence where this patch still allows a TTP-disqualifying state at or after 15:50 ET: a new entry gets through, pending orders are not canceled, an active stock position is not closed, a broker position remains while state says flat, state remains open after broker close and causes duplicate retry, half-day cutoff is wrong, the cutoff gets marked complete too early, or the rule only logs instead of enforcing. Include exact file:line evidence and a concrete failing sequence. Also say whether this closes the underlying mechanism or only the symptom, and what new failure modes it introduces.
