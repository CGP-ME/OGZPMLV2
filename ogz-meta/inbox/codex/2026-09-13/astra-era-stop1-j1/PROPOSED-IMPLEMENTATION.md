# Proposed J1 implementation

This proposal is not authorization. Trey must approve it after cold pull.

## 1. One source implementation

Add `foundation/BootstrapCredentialSource.js` with one responsibility: resolve the bootstrap environment once for one operating-system process and issue service-scoped credential views.

The source contract is:

- Resolve the input path from the explicit bootstrap path or repository `.env`.
- Parse without mutating `process.env`.
- Preserve current precedence: explicitly inherited values override file values.
- Record per-key provenance as `inherited`, `dotenv`, or `absent`.
- Return a transitional effective environment for ConfigLoader until J7 removes behavioral environment inputs.
- Return only allowlisted credential keys to each named service consumer.
- Cache the resolved source within the process so module enumeration cannot load the file again.
- Never log or serialize a value, value length, substring, per-key digest, URL path, or query.
- Emit a redacted source receipt: process role, resolved source path, source file size/mtime when present, requested key names, presence, provenance class, and consumer name.
- If the file is absent or unreadable, report `source_unavailable`; do not fabricate credentials or decide process/trading authority.

No new environment flag, threshold, retry count, mode, gate, or fallback is added.

## 2. Earliest durable reporter

Reuse `core/RuntimeAuditSink.js`; do not create a new supervisor.

- Instantiate it before ConfigLoader, Sentry, or other non-built-in service imports in each declared entrypoint.
- Add value-aware redaction so a known credential accidentally included in an Error message, stack, raw payload, or extra context is replaced before disk/stderr output.
- Capture phase, component, process role, named credential keys, and credential-source receipt ID only. Never pass a service credential object as context.
- Route ModuleAutoLoader's caught module failures through a supplied reporting callback before it continues or rethrows.
- When ntfy is unavailable, record `notification=unavailable`; when the current async notifier is merely scheduled, record `notification=attempted`, not accepted or delivered.
- Do not change whether the current caller continues or exits. J3 owns process lifecycle and J4 owns service/trading readiness.

The irreducible boundary is failure to load `RuntimeAuditSink.js` itself or the Node built-ins it requires. That remains Node stderr/process-manager evidence and must be named in proof rather than hidden.

## 3. Move consumers atomically

### Main bot

- `run-empire-v2.js`: install the sink first, resolve one source, pass the effective environment to ConfigLoader, and pass service views to Sentry, TrAI, notifiers, ntfy, and WebSocketManager.
- `foundation/ConfigLoader.js`: accept an explicitly supplied environment and provenance map without reading dotenv again. Preserve its current behavior of restoring the private active environment without assigning the resolved snapshot to `process.env` (`foundation/ConfigLoader.js:1486-1507`).
- `instrument.js`: export explicit initialization; remove ambient credential reads and the hardcoded DSN fallback.
- `utils/telegramNotifier.js`, `utils/discordNotifier.js`: accept credentials at construction. Importing either module performs no dotenv load, environment capture, or singleton construction.
- `core/trai_llm_config.js`: keep its existing explicit `options.env` interface; callers use it.
- `core/trai_core.js`: remove the ambient voice/video credential fallbacks. Current runner construction does not enable those features.
- `core/NtfyTraceNotifier.js`: keep explicit environment input and expose an honest attempt/outcome surface needed by early reporting; do not change event-selection policy in J1.
- `core/WebSocketManager.js`: accept the relay URL/token explicitly; no credential read inside the connection callback.
- `core/BotStateFrame.js`: remove credential-presence broker inference. Runtime identity comes from the resolved bot/session configuration, not whether a key happens to exist.
- `core/ModuleAutoLoader.js`: report every caught module load failure through the injected early reporter; preserve J0/L1 required-module propagation.

### Dashboard, checkout, supervisor, and descriptor

- `ogzprime-ssl-server.js`: resolve one source at entry, install the durable reporter before provider configuration, and inject dashboard auth, stock-data, news, TrAI, and Polygon views. Use the existing explicit resolver parameters in `server/dashboard-stock-stream-config.js`, `server/stock-data-adapter.js`, `core/NewsSearchProvider.js`, and `core/trai_llm_config.js` rather than adding parallel resolvers.
- `public/stripe-checkout.js`: construct Stripe from an injected bootstrap view; remove its dotenv call.
- `scripts/supervisor-daemon.js`: read the optional deadman capability URL from the explicit view; do not change supervision behavior in J1.
- `ecosystem.config.js`: use the shared source contract instead of its own dotenv call. Preserve the currently declared launch values until J7/J8; do not turn this package into the configuration migration.
- `ecosystem.watch.config.js`: no source edit is required because the two entrypoints own their bootstrap source; include it in direct-launch regression proof.

## 4. Exact proposed implementation files

New:

- `foundation/BootstrapCredentialSource.js`

Modify:

- `run-empire-v2.js`
- `foundation/ConfigLoader.js`
- `instrument.js`
- `core/RuntimeAuditSink.js`
- `core/ModuleAutoLoader.js`
- `core/trai_core.js`
- `core/NtfyTraceNotifier.js`
- `core/WebSocketManager.js`
- `core/BotStateFrame.js`
- `utils/telegramNotifier.js`
- `utils/discordNotifier.js`
- `ogzprime-ssl-server.js`
- `public/stripe-checkout.js`
- `scripts/supervisor-daemon.js`
- `ecosystem.config.js`

No broker adapter, OrderExecutor behavior, settings file, trading JSON value, PM2 runtime state, Mercury bridge file, or alternate broker is in the proposed diff.

## 5. Direct proof

1. Synthetic canary probe: each declared consumer receives only its allowlisted value; no stdout, stderr, receipt, error, or serialized object contains a canary.
2. Bare Node and PM2-descriptor probes: file-only credentials resolve identically without notifier import side effects; inherited precedence and provenance are explicit.
3. Process mutation probe: source resolution, ConfigLoader use, and module imports leave `process.env` unchanged.
4. Import-side-effect probe: requiring Telegram, Discord, Sentry, stock/news helpers, Stripe route module, and WebSocketManager reads no dotenv file and captures no ambient credential.
5. Early failure probes: forced source read error, ConfigLoader validation error, Sentry initializer error, required module error, optional module error, and dashboard provider configuration error each append one redacted local record before normal startup. Reporter failure produces redacted stderr.
6. Source census: among declared runtime entrypoints and their imported consumers, `dotenv.config`, `dotenv.parse`, and credential-bearing `process.env` reads remain only in the single approved source implementation or separately classified tooling.

After implementation lands and Trey explicitly authorizes runtime activation:

7. Restart/reload in paper. Record branch/SHA, PM2 process revision, source-file metadata, per-process redacted credential receipt, boot phase, and service-specific initialization result.
8. Prove the bot, dashboard, checkout, and any actually enabled supervisor receive their intended source without printing secrets. A missing optional credential yields a named unavailable service and local record; it does not kill unrelated healthy services or grant trading authority.
9. Force one safe pre-trading bootstrap failure in the authorized paper rehearsal and prove the local JSONL record predates normal notifier installation. Restore the valid input, restart in paper, and prove recovery.

J1 does not claim phone delivery. J15 must later join attempted send, service acceptance, and Trey's watched device receipt.

## 6. Stop conditions

Do not land the implementation if:

- any declared runtime consumer still depends on notifier/eager-import hydration;
- any secret or capability URL is logged, hashed per key, partially revealed, embedded in code, or placed in a packet;
- ConfigLoader or a notifier mutates `process.env`;
- an optional-service credential absence gains trade, halt, flatten, restart, or process-exit authority;
- required-component policy is silently invented instead of left for J4;
- the PM2 proof cannot identify the exact loaded SHA and paper mode;
- a source-only probe is offered as the runtime receipt.

## Footer

WHAT I DID: proposed the smallest atomic producer/consumer move that preserves existing explicit resolver assets.

WHAT I DID NOT DO: implement it, create a new supervisory service, or collapse J3/J4/J7/J15 into J1.

WHAT I ASSUMED: the shared implementation is invoked once per OS process; cross-process equality is proved by source metadata, explicit provenance, and real service authentication rather than logging secret-derived fingerprints.
