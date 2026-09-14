# Proposed atomic J1 + J7/J8 configuration implementation

This proposal is not implementation authorization. It supersedes the temporary full-`process.env` projection design.

## 1. Final ownership contract

One shared bootstrap source module reads credentials, capability-bearing URLs, and true process-bootstrap inputs. ConfigLoader reads `config/settings.json` and `config/internals.json`, joins the three sources, validates their existing meanings, and returns one immutable runtime snapshot.

The contract is:

- `.env` contains credentials, capability-bearing URLs, and true process-bootstrap inputs only.
- `config/settings.json` contains customer-visible and trading-behavior settings.
- `config/internals.json` contains fixed implementation values.
- ConfigLoader is the sole runtime configuration owner.
- Each OS process resolves its own snapshot through the same source code; separate processes do not pretend to share in-memory state.
- Downstream production modules receive explicit configuration or a scoped immutable view. They do not call dotenv and do not read ambient `process.env`.
- Inherited bootstrap/credential values may override file entries only at the one bootstrap-source boundary. That precedence is recorded without recording the value.
- No missing value is replaced with a plausible default merely to keep boot moving.
- No source, consumer, or reporter adds process/trading authority, a retry policy, a threshold, a feature toggle, or a new configuration fallback.

This is an atomic cut. There is no compatibility projection of the complete parsed file into `process.env`, even temporarily.

## 2. Value classification before editing

Every current input in the 41-file direct-input census receives one disposition tied to a consumer trace:

1. credential/capability/bootstrap: move to the one bootstrap source and inject explicitly;
2. customer/trading behavior: move to `config/settings.json` and inject explicitly;
3. fixed implementation value: move to `config/internals.json` and inject explicitly;
4. dead or unreachable on declared production paths: prove the absence of a live caller before deleting or leaving it outside the runtime snapshot.

No row may remain “temporarily ambient.” A syntax hit is not automatically an edit, but every live read must either move to the snapshot or be removed with its dead path.

True bootstrap means information needed before the two JSON files can be resolved, such as the explicitly selected source path and process launch identity. It does not mean any setting that happens to exist in the environment today.

## 3. Earliest durable reporter

Reuse `core/RuntimeAuditSink.js`; do not create a new supervisor or wrapper.

- Each declared process installs the existing sink before fallible source/config/service initialization.
- Bootstrap records use role, phase, PID, source receipt ID, and bounded cause evidence without dereferencing resolved ConfigLoader state.
- Redaction covers local JSONL, changed raw diagnostics, and stderr fallback. It records no credential value, substring, length, URL component, or per-key hash.
- ModuleAutoLoader reports require, directory/stat, absent-directory, and missing-required outcomes without changing the existing continuation or propagation result. Reporter failure cannot replace the original error.
- The TrAI read-only-tool failure is reported through its actual runner → TRAIDecisionModule → TRAICore owner chain after repository policy is separated from provider initialization.
- The supervisor no longer prints its complete deadman capability URL.
- A scheduled ntfy microtask is recorded as scheduled, not as an attempted request or delivery.
- J1 does not decide whether a caller continues, exits, retries, starts trading, halts, or flattens. J3/J4 and the actual producer owners retain those decisions.

The irreducible boundary is failure to load the sink or both local output mechanisms. That absence is named; it does not justify another supervisor.

## 4. Implementation boundary

The previous 17-modified/two-new staged boundary is a verified lead, not the final strict file list. The strict atomic cut is frozen only after every one of the 41 candidates has a live/dead and destination disposition. At minimum, the traced boundary includes:

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

The exact live subset is derived from `EVIDENCE.md`'s 41-file census. It includes the established lock, asset identity, first pattern-memory identity/persistence, pattern-pack, output/ledger/proof, narrator/diagnostics, dashboard session/scope/symbol/interval, port, and publication callback reads. Their input wiring moves; their policies and values do not change merely because their source changes.

Broker adapters, order execution, strategy math, confidence, sizing, exit behavior, SessionRouter policy, and provider transports are modified only if an actual input-owner call chain requires a narrow connection. No unrelated semantic rewrite is authorized.

## 5. Direct receipts before source commit approval

No Jest suite is proof for this change. Direct receipts must establish:

1. The frozen census: all tracked JavaScript, declared roots, autoload candidates, factory-selected production dependencies, and every direct environment/dotenv candidate.
2. A safe temporary fixture proves exactly one bootstrap read per process, explicit inherited precedence, value-free provenance, and no downstream mutation of `process.env`.
3. Every classified behavior/static value resolves from exactly one of the two JSON owners; every credential/capability/bootstrap value resolves only through the bootstrap owner.
4. Every live candidate receives the same intended value at its actual consumer boundary under file and inherited launch cases; dead/unreachable candidates have caller receipts.
5. Telegram/Discord wrappers use the intended explicitly constructed instance; the actual broker auth options, relay auth payload, stock request headers, dynamic TrAI key selection, news selection/companions, Polygon request, Stripe client construction, and supervisor option construction are observed in memory without transmission.
6. First pattern identity, lock path/skip input, asset identity/history fallback, pattern-pack selection, output roots, persistence suppression, dashboard cookie/scope/symbol/interval, and publication callback inputs come from the accepted snapshot—not ambient state.
7. Requiring ConfigLoader, notifiers, dashboard, checkout, read-only tools, and Mercury config performs no independent dotenv load. The local read-only toolbox works without an embedding credential or provider operation.
8. Credential presence cannot manufacture broker identity in `BotStateFrame`.
9. Forced source, ConfigLoader, Sentry, required-module, optional-module, dashboard, and toolbox failures produce redacted local evidence while preserving their existing control-flow outcome. Multiple correlated records are allowed; they must identify the original failure and phase.
10. The complete source diff and direct receipt output are cold-pulled before commit approval.

After the atomic implementation lands, and only after Trey separately authorizes activation:

11. Restart/reload in paper and record exact branch/SHA, PM2 loaded revision, accepted configuration receipt, and actual initialization result for every enabled process.
12. Inspect startup logs and the local audit ledger for secret/capability exposure without printing the searched values into the receipt.
13. Demonstrate one safe early failure in a child process, restore the valid source, and complete a successful paper boot. J1 does not claim phone delivery; that remains J15.

## 6. Review boundaries, not runtime guards

Cold pull must reject the diff if it leaves a live production dotenv/ambient reader, creates a second configuration owner, invents a fallback value, changes a trading/service policy without separate authority, adds process/trading authority, or outputs credential/capability material.

Those are human review conditions. No refusal wrapper, runtime configuration gate, retry budget, watchdog, or trading stop is added.

## Footer

WHAT I DID: replaced the staged ambient compatibility proposal with the final single-owner configuration cut and incorporated the independently verified consequential Astra findings.

WHAT I DID NOT DO: implement it, classify every existing setting by guess, change runtime policy, add a test suite, or claim deployment acceptance.

WHAT I ASSUMED: Trey wants one source by value class and one runtime owner; credentials are not stored in either nonsecret JSON file.
