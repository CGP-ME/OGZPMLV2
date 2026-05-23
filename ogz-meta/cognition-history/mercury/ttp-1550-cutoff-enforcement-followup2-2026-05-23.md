# Mercury follow-up attack 2: TTP 15:50 cutoff enforcement after stock-symbol alias fix

Attack the revised TTP market-time cutoff patch again. This is trading-path eval-rule code.

Previous Mercury passes found:
- Target broker cancellation could be skipped and still counted as success.
- The cutoff could be marked complete without proving broker positions were flat.
- Stock slash-form scope like `AAPL/USD` could miss Alpaca broker-returned `AAPL` orders/positions.

Current revised scope:
- `core/OrderRouter.js:33-34` stores adapter-owned normalized symbols.
- `core/OrderRouter.js:155-183` supports symbol-scoped, strict position reads.
- `core/OrderRouter.js:186-225` supports symbol-scoped pending-order cancellation and treats missing cancel APIs as failures for matching adapters.
- `core/OrderRouter.js:228-240` implements symbol-scope helper logic.
- `core/TtpCutoffEnforcer.js:28-147` enforces the cutoff: no-op outside stock mode, cancels target open orders, verifies state trades have broker positions, closes state trades, closes broker-orphan positions, rechecks broker flatness, and only then marks the cutoff complete.
- `core/TtpCutoffEnforcer.js:164-175` calls the router with scoped symbols for cancellation and strict broker-position reads.
- `core/TtpCutoffEnforcer.js:178-207` closes broker-orphan positions through the router.
- `core/TtpCutoffEnforcer.js:209-274` filters broker positions and expands stock symbol scope so both generic forms like `AAPL-USD` and Alpaca broker symbols like `AAPL` are covered.
- `run-empire-v2.js:719-731` records SessionRouter stock symbols as the TTP cutoff scope.
- `run-empire-v2.js:844-848` records single-broker Alpaca symbols as the TTP cutoff scope and leaves crypto scope empty.
- `run-empire-v2.js:1159-1167` wires the enforcer.
- `run-empire-v2.js:1965-1970` invokes the enforcer from the exit monitor.
- Focused tests: `test/ttp-cutoff-enforcer.test.js`, `test/order-router-cancel.test.js`, `test/eval-rule-engine.test.js`, `test/config-loader-live-guard.test.js`.

Adversarial question:
Find any real input sequence where this revised patch still allows a TTP-disqualifying state at or after 15:50 ET: a new entry gets through, a target pending order is not canceled, a stock position remains while the cutoff is marked complete, an orphan broker stock position is not closed, a crypto/non-TTP broker is accidentally canceled or liquidated, duplicate close orders are sent after a state/broker mismatch, half-day cutoff is wrong, config disables enforcement unsafely, or P0/backtest behavior changes. Include exact file:line evidence and a concrete failing sequence. Also say whether the revised patch closes the underlying mechanism or still only closes the symptom, and name any new failure modes. If you use a stock slash-form example, account for the current alias expansion in `core/TtpCutoffEnforcer.js:238-264`.
