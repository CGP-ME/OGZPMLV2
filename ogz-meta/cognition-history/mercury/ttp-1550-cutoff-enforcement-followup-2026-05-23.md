# Mercury follow-up attack: TTP 15:50 cutoff enforcement after broker-truth fix

Attack the revised TTP market-time cutoff patch. This is trading-path eval-rule code.

Original Mercury found two real failures:
- Target broker cancellation could be skipped and still counted as success.
- The cutoff could be marked complete without proving broker positions were flat.

Revised scope:
- `core/OrderRouter.js:33-34` stores adapter-owned normalized symbols.
- `core/OrderRouter.js:155-183` supports symbol-scoped, strict position reads.
- `core/OrderRouter.js:186-225` supports symbol-scoped pending-order cancellation and treats missing cancel APIs as failures for matching adapters.
- `core/OrderRouter.js:228-240` implements symbol-scope helper logic.
- `core/TtpCutoffEnforcer.js:30-149` enforces the cutoff: no-op outside stock mode, cancels target open orders, verifies state trades have broker positions, closes state trades, closes broker-orphan positions, rechecks broker flatness, and only then marks the cutoff complete.
- `core/TtpCutoffEnforcer.js:166-248` contains cancel, broker-position, orphan-close, symbol-filter, stock-asset, and symbol-normalization helpers.
- `run-empire-v2.js:719-731` records SessionRouter stock symbols as the TTP cutoff scope.
- `run-empire-v2.js:844-848` records single-broker Alpaca symbols as the TTP cutoff scope and leaves crypto scope empty.
- `run-empire-v2.js:1159-1167` wires the enforcer.
- `run-empire-v2.js:1965-1970` invokes the enforcer from the exit monitor.
- `run-empire-v2.js:2014-2039` resolves cutoff exit prices.
- Focused tests: `test/ttp-cutoff-enforcer.test.js`, `test/order-router-cancel.test.js`, `test/eval-rule-engine.test.js`, `test/config-loader-live-guard.test.js`.

Adversarial question:
Find any real input sequence where this revised patch still allows a TTP-disqualifying state at or after 15:50 ET: a new entry gets through, a target pending order is not canceled, a stock position remains while the cutoff is marked complete, an orphan broker stock position is not closed, a crypto/non-TTP broker is accidentally canceled or liquidated, duplicate close orders are sent after a state/broker mismatch, half-day cutoff is wrong, config disables enforcement unsafely, or P0/backtest behavior changes. Include exact file:line evidence and a concrete failing sequence. Also say whether the revised patch closes the underlying mechanism or still only closes the symptom, and name any new failure modes.
