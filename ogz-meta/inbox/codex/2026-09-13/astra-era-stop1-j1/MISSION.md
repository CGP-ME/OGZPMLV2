# STOP 1 J1: credential ownership and early failure reporting

## Authority

J0 assigns J1 to "establish one credential producer and early failure-reporting path" at `ogz-meta/inbox/codex/2026-09-12/astra-era-stop1-j0/CONTROLLING-SPEC.md:159-163`. J0 also requires every investigation to end as implementation required, already correct, unreachable/dead, or requiring Trey's ruling before source changes are authorized at `CONTROLLING-SPEC.md:153`.

Current doctrine requires loud, truthful failure handling without fabricated data, shadow authority, or a new supervisory cage. The process and unrelated healthy services continue where the failure is externally sourced; the failing producer is repaired at its owner. Sources: `ogz-meta/Alignment/TREY-DOCTRINE-FABLE-LANE.md:7-21,49-57` and `ogz-meta/Alignment/TREY-RULINGS.md:12`.

## Question investigated

What code currently loads credential-bearing environment input, which declared runtime consumers receive it, what happens before the normal notifier is installed, and what atomic change establishes one source without breaking bare Node or PM2 launch behavior?

## Result

Implementation is required. Current behavior has six independent dotenv read/mutation sites across the declared runtime path:

1. `foundation/ConfigLoader.js:473-492,1478-1507` parses `.env` into a private object.
2. `ecosystem.config.js:5-13` mutates the PM2 descriptor process environment.
3. `utils/telegramNotifier.js:44-52` mutates and captures environment state at import.
4. `utils/discordNotifier.js:47-54,472-484` mutates environment state and constructs its exported singleton at import.
5. `ogzprime-ssl-server.js:46` mutates environment state at dashboard entry.
6. `public/stripe-checkout.js:11-16` mutates environment state at checkout entry.

The main bot depends on the notifier imports to populate `process.env` for later consumers during a bare Node launch. ConfigLoader itself does not do that. Removing the notifier calls alone therefore breaks existing credential delivery even though ConfigLoader still reports a resolved snapshot.

The cutover also has three reached dependencies outside the original census: pattern memory derives its startup bucket from ambient `BROKER`/`ASSET_CLASS` (`core/UnifiedPatternMemory.js:191-206,246-257`); the bot's read-only toolbox imports full Mercury provider configuration just to obtain repository ignore policy (`trai_brain/read_only_tools.js:1-11,31-35`); and the bot's dashboard-history handler calls the stock-data helper without its supported explicit configuration option (`run-empire-v2.js:2337-2371`; `server/stock-data-adapter.js:10-20,42-68`). They must move in the same cutover without expanding J1 into later behavioral-policy or provider work.

The existing durable fatal sink is constructed only after ConfigLoader, Sentry, and several imports have already executed (`run-empire-v2.js:3-6,36-37,108-126`). Bootstrap handlers are installed later at `run-empire-v2.js:315-329`, and ntfy is installed only inside the bot constructor at `:1060-1077`. Failures before those points have neither the current durable sink path nor the current ntfy subscriber.

## Scope

J1 covers credential source loading, source precedence/provenance, explicit allowlisted service views including required nonsecret companion configuration, secret-free receipts, and the earliest durable failure record for the four processes declared by `ecosystem.config.js:54-248`.

J1 does not decide whether a missing service is required for trading, kill or restart a process, alter trading mode, add a trade gate, repair optional-service retry, prove notification delivery, migrate behavioral configuration, or change broker/account policy. Those boundaries remain J3, J4, J7/J8, J15, and later STOP 1/STOP 2 packages.

## Authorization state

This is a proposal for cold-pull review. No production implementation begins until Trey accepts this packet. If accepted, the implementation is one logical change even though producer and consumers must move together across multiple files.

## Footer

WHAT I DID: traced current credential producers, declared process entrypoints, active service consumers, import ordering, and the earliest current failure receipt.

WHAT I DID NOT DO: use credential values as engineering evidence, modify runtime source, invoke services, or decide later readiness/lifecycle policy.

WHAT I ASSUMED: a "single producer" means one shared code owner invoked once per operating-system process; separate PM2 processes cannot share an in-memory JavaScript snapshot.
