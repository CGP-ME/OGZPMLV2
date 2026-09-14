# Proposed J1 reporter and deferred atomic J1 credential + J7/J8 configuration implementation

This proposal is not implementation authorization. It supersedes the temporary full-`process.env` projection design.

## 1. Final ownership contract

One shared bootstrap source module reads credentials, capability-bearing URLs, and true process-bootstrap inputs. ConfigLoader reads `config/settings.json` and `config/internals.json`, joins the three sources, validates their existing meanings for the calling process, and returns one immutable process-applicable runtime snapshot.

The contract is:

- `.env` contains credentials, capability-bearing URLs, and true process-bootstrap inputs only.
- `config/settings.json` contains customer-visible and trading-behavior settings.
- `config/internals.json` contains fixed implementation values.
- ConfigLoader is the sole runtime configuration owner.
- Each OS process resolves its own snapshot through the same source code; separate processes do not pretend to share in-memory state.
- Each entrypoint identifies its process role. Validation and delivered fields are limited to that role and its currently enabled consumers. The main bot's Alpaca checks at `foundation/ConfigLoader.js:1273-1287` do not run merely because checkout uses the shared owner; checkout retains its Stripe boundary at `public/stripe-checkout.js:11-18`.
- The migration preserves each process's existing applicable requirements. It does not make an optional service required, make a bot credential a dashboard/checkout/supervisor requirement, or create a new startup refusal. J4 remains the owner of any later required/optional or readiness-policy change.
- Downstream production modules receive explicit configuration or a scoped immutable view. They do not call dotenv and do not read ambient `process.env`.
- Inherited bootstrap/credential values may override file entries only at the one bootstrap-source boundary. That precedence is recorded without recording the value.
- No missing value is replaced with a plausible default merely to keep boot moving.
- No source, consumer, or reporter adds process/trading authority, a retry policy, a threshold, a feature toggle, or a new configuration fallback.

This is an atomic cut. There is no compatibility projection of the complete parsed file into `process.env`, even temporarily.

## 2. Configuration-consumer classification before editing

The 41-file list is the environment-ingress census, not the completion denominator. Before the atomic cut, the executor must trace every operative configuration read reachable from each declared entrypoint, including:

- environment and dotenv reads;
- ConfigLoader getters and `ConfigLoader.BASE_CONFIG` access;
- configuration objects or scoped views passed through constructors and callbacks;
- direct JSON/resource reads;
- dynamically selected configuration paths or keys.

`core/ExitContractManager.js:821-844`, for example, consumes operative break-even and fee-buffer values through `ConfigLoader.BASE_CONFIG` and therefore falls outside the 41 environment readers. It must retain the same accepted values and receive a direct equivalence receipt. That fact alone does not authorize rewriting the class or changing exit behavior.

Every value receives one storage class tied to a producer-to-consumer trace:

1. credential/capability/bootstrap: move to the one bootstrap source and inject explicitly;
2. customer/trading behavior: move to `config/settings.json` and inject explicitly;
3. fixed implementation value: move to `config/internals.json` and inject explicitly;

Every reader separately receives one implementation disposition:

1. already served by the accepted owner: retain it and prove value equivalence;
2. narrow rewiring required: move only the source/consumer connection;
3. dead or unreachable on declared production paths: prove the absence of a live caller before deletion;
4. requires Trey's ruling: record the unresolved behavior without editing it.

No environment row may remain “temporarily ambient.” A syntax or configuration-reader hit is not automatically an edit: an existing read already served by the accepted ConfigLoader snapshot may remain structurally unchanged. Every live read must have one source owner, one applicable process view, and a proof disposition; dead-path removal requires caller evidence.

True bootstrap means information needed before the two JSON files can be resolved, such as the explicitly selected source path and process launch identity. It does not mean any setting that happens to exist in the environment today.

## 3. Mechanically separable earliest durable reporter

Reuse `core/RuntimeAuditSink.js`; do not create a new supervisor or wrapper.

- Each declared process installs the existing sink before fallible source/config/service initialization.
- Bootstrap records use role, phase, PID, source receipt ID, and bounded cause evidence without dereferencing resolved ConfigLoader state.
- Redaction covers local JSONL, changed raw diagnostics, and stderr fallback. It records no credential value, substring, length, URL component, or per-key hash.
- ModuleAutoLoader reports require, directory/stat, absent-directory, and missing-required outcomes without changing the existing continuation or propagation result. Reporter failure cannot replace the original error.
- The supervisor no longer prints its complete deadman capability URL.
- J1 does not decide whether a caller continues, exits, retries, starts trading, halts, or flattens. J3/J4 and the actual producer owners retain those decisions.

The irreducible boundary is failure to load the sink or both local output mechanisms. That absence is named; it does not justify another supervisor. This reporter move lands as its own J1 logical commit before J2 because it does not move values, remove dotenv, or change a consumer's configuration. TrAI toolbox dependency separation belongs to the later atomic source/consumer cut; notification attempt/delivery semantics remain J15.

## 4. Later atomic source/consumer implementation boundary

The previous 17-modified/two-new staged boundary is a verified lead, not the final strict file list. The strict atomic cut is frozen only after every environment ingress and operative configuration consumer has a live/dead/already-canonical/rewire/ruling disposition. At minimum, the traced boundary includes:

### New canonical owners

- one bootstrap credential/source module under `foundation/`;
- `config/settings.json`;
- `config/internals.json`;
- one shared Mercury repository-policy module that contains only ignore/skip behavior and no provider initialization.

### Core source and reporting owners

- `foundation/ConfigLoader.js`;
- `run-empire-v2.js`;
- `instrument.js`;
- `core/RuntimeAuditSink.js`;
- `core/ModuleAutoLoader.js`;
- `ecosystem.config.js` and direct-entrypoint wiring;
- `ogzprime-ssl-server.js`;
- `public/stripe-checkout.js`;
- `scripts/supervisor-daemon.js`.

### Proven credential/service bindings

- `utils/telegramNotifier.js` and its runner bindings;
- `utils/discordNotifier.js` and its runner bindings;
- `core/WebSocketManager.js` for explicit relay URL/token;
- existing TrAI, ntfy, stock, news, Polygon, Stripe, broker, Sentry, and supervisor construction/caller seams;
- `core/BotStateFrame.js`, removing credential-presence inference as a broker/stock identity source;
- `trai_brain/read_only_tools.js`, the shared repository-policy owner, `trai_brain/mercury-bridge/config.js`, `core/trai_core.js`, and `core/TRAIDecisionModule.js` reporter forwarding. Provider behavior remains unchanged.

### Proven nonsecret consumers requiring final ownership

The environment-ingress subset begins with `EVIDENCE.md`'s 41-file census. The broader operative-consumer trace includes the established lock, asset identity, first pattern-memory identity/persistence, pattern-pack, output/ledger/proof, narrator/diagnostics, dashboard session/scope/symbol/interval, port, publication callback reads, ConfigLoader getters, and direct `BASE_CONFIG` consumers such as `core/ExitContractManager.js:821-844`. Their policies and values do not change merely because ownership is unified; already-canonical reads need proof, not automatic rewrites.

Broker adapters, order execution, strategy math, confidence, sizing, exit behavior, SessionRouter policy, and provider transports are modified only if an actual input-owner call chain requires a narrow connection. No unrelated semantic rewrite is authorized.

## 5. Direct receipts before each source commit approval

No Jest suite is proof for either change.

The J1 reporter-only commit must directly establish that the sink is installed before each currently covered fallible initialization, forced early failures leave redacted local records, original causes remain linked, and the existing continuation/propagation/exit outcomes are unchanged. Its diff contains no configuration-source or consumer migration.

The later atomic configuration cut must directly establish:

1. The frozen environment-ingress census: all tracked JavaScript, declared roots, autoload candidates, factory-selected production dependencies, and every direct environment/dotenv candidate. Its reconciled count is 168 JavaScript files plus three JSON resources; 27 dotenv calls/imports occur in 26 files.
2. A separate operative configuration-consumer inventory covers ConfigLoader getters, `BASE_CONFIG`, passed views, direct resources, and dynamic keys. Each live read is classified without presuming an edit.
3. A safe temporary fixture proves exactly one bootstrap read per process, explicit inherited precedence, value-free provenance, and no downstream mutation of `process.env`.
4. Bot, dashboard, checkout, and supervisor fixtures each receive only their applicable snapshot and retain their existing requirement outcomes. In particular, checkout does not evaluate the bot's Alpaca credential validation.
5. Every classified behavior/static value resolves from exactly one of the two JSON owners; every credential/capability/bootstrap value resolves only through the bootstrap owner.
6. Every live consumer receives the same intended value at its actual boundary under file and inherited launch cases; already-canonical readers have equivalence receipts and dead/unreachable candidates have caller receipts.
7. Telegram/Discord wrappers use the intended explicitly constructed instance; the actual broker auth options, relay auth payload, stock request headers, dynamic TrAI key selection, news selection/companions, Polygon request, Stripe client construction, and supervisor option construction are observed in memory without transmission.
8. First pattern identity, lock path/skip input, asset identity/history fallback, pattern-pack selection, output roots, persistence suppression, dashboard cookie/scope/symbol/interval, publication callback inputs, and operative exit-contract values come from the accepted snapshot—not ambient or duplicate state.
9. Requiring ConfigLoader, notifiers, dashboard, checkout, read-only tools, and Mercury config performs no independent dotenv load. The local read-only toolbox works without an embedding credential or provider operation.
10. Credential presence cannot manufacture broker identity in `BotStateFrame`.
11. Source, ConfigLoader, Sentry, required-module, optional-module, dashboard, and toolbox failures retain the reporter behavior and existing control-flow outcome proved by J1. Multiple correlated records are allowed; they must identify the original failure and phase.
12. The complete atomic source/consumer diff and direct receipt output are cold-pulled before commit approval.

After the atomic implementation lands, and only after Trey separately authorizes activation:

13. Restart/reload in paper and record exact branch/SHA, PM2 loaded revision, accepted configuration receipt, and actual initialization result for every enabled process.
14. Inspect startup logs and the local audit ledger for secret/capability exposure without printing the searched values into the receipt.
15. Demonstrate one safe early failure in a child process, restore the valid source, and complete a successful paper boot. J1 does not claim phone delivery; that remains J15.

## 6. Review boundaries, not runtime guards

Cold pull must reject the diff if it leaves a live production dotenv/ambient reader, omits an operative configuration consumer, creates a second configuration owner, applies one process's requirements to another, invents a fallback value, changes a trading/service policy without separate authority, adds process/trading authority, or outputs credential/capability material.

Those are human review conditions. No refusal wrapper, runtime configuration gate, retry budget, watchdog, or trading stop is added.

## Footer

WHAT I DID: replaced the staged ambient compatibility proposal with the final single-owner configuration cut and incorporated the independently verified consequential Astra findings.

WHAT I DID NOT DO: implement it, classify every existing setting by guess, change runtime policy, add a test suite, or claim deployment acceptance.

WHAT I ASSUMED: Trey wants one source by value class and one runtime owner; credentials are not stored in either nonsecret JSON file.
