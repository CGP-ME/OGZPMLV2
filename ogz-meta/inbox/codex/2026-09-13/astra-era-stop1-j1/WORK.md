# STOP 1 J1 front-loaded investigation

## 1. Current startup delivery is accidental

1. The runner loads ConfigLoader first. ConfigLoader parses the selected dotenv file, merges inherited values over file values, builds a private snapshot, and restores its internal environment without assigning the snapshot to `process.env` (`run-empire-v2.js:3-5`; `foundation/ConfigLoader.js:473-492,1478-1507`).
2. Sentry reads ambient values and contains a hardcoded DSN fallback before the durable sink exists (`run-empire-v2.js:36-37`; `instrument.js:39-57`).
3. RuntimeAuditSink is not constructed until `run-empire-v2.js:116,124-126`; bootstrap handlers follow at `:315-329`.
4. ModuleAutoLoader later requires all 110 top-level JavaScript candidates in `utils/` and `core/` (`core/ModuleAutoLoader.js:130-203,251-297`). Telegram and Discord imports perform dotenv mutation and capture credential values (`utils/telegramNotifier.js:44-52,239-249`; `utils/discordNotifier.js:47-54,472-484`).
5. Dashboard and checkout each hydrate independently at entry (`ogzprime-ssl-server.js:46`; `public/stripe-checkout.js:13`). The PM2 descriptor hydrates again in its own evaluation process (`ecosystem.config.js:5-13`).

Constructed sequence: start `node run-empire-v2.js` with values present only in the selected dotenv file, then remove only the notifier dotenv calls.

Mechanical result: ConfigLoader can still build its private snapshot, but later ambient readers lose file-sourced inputs. The same problem exists in the other entrypoints if their local dotenv calls are removed without moving every consumer. Deleting those calls alone is not authorized.

## 2. Why neither transitional design is acceptable

The first proposal removed global hydration and explicitly injected only selected services. Astra's cold pulls proved that list incomplete through SingletonLock, MultiAssetManager, TRAIDecisionModule, first pattern memory, output/publisher, and dashboard callbacks.

The second proposal centralized full-file projection at the current hydration phases. That would avoid immediate disconnections but preserve `process.env` as a global service locator and behavior configuration bus. Trey rejected that design on 2026-09-13: the work exists to eliminate scattered readers, not give them a new central hydrator.

Moving hydration earlier is also not neutral. Early narrator, autopsy, tier, and DPS captures currently occur before notifier-driven hydration. An earlier projection could activate file entries those consumers do not see today (`run-empire-v2.js:268-303,331-337`; `core/StateManager.js:79-88`; `core/TradingLoop.js:38-39`).

Disposition: the credential cut and the J7/J8 settings/internals cut must land atomically. Until then, production source remains unchanged.

## 3. Independent check of Astra's census

At frozen revision `0c3760240272653a446ef1e4e3772c3ad8104209`:

- 643 tracked `.js` files reproduce.
- ModuleAutoLoader's top-level candidate set reproduces as 107 `core/` files plus three `utils/` files.
- The literal-require/autoload closure used by Codex contains 167 files.
- Adding the two runtime-selected dynamic adapters and their newly reached dependencies expands that Codex closure to 171 files.
- Exactly 41 files in the 167-file closure contain direct `process.env` or dotenv syntax; the active-factory expansion adds no direct input reader.
- Six current dotenv read/mutation files on declared runtime paths reproduce.

Astra reported a 168-file factory-expanded union and 26 tracked dotenv sites. Those two aggregate counts are not reproducible under Codex's stated mechanical definitions: the corresponding counts are 171 and 27. This does not invalidate Astra's consequential paths or the exact 41-file direct-input list. The packet records the definitions instead of silently borrowing the disputed totals.

## 4. Consequential Astra findings independently confirmed

- ConfigLoader's `snapshot(sourceEnv)` does not seed `load()`'s cache; `load()` hardcodes `process.env` into `buildSnapshot` (`foundation/ConfigLoader.js:1538-1547`). The final owner needs one accepted snapshot path, not a second parse.
- Telegram wrappers close over an eager singleton; Discord's compatibility export also selects an instance. Removing dotenv without moving actual caller bindings is incomplete (`utils/telegramNotifier.js:239-249`; `utils/discordNotifier.js:468-486`; `run-empire-v2.js:388-392,1353-1355`).
- The bot's relay token is read inside the WebSocket open callback. Construction alone does not prove the later auth payload uses the accepted source (`core/WebSocketManager.js:107-133`).
- The bot stock-history path calls both stock helpers without explicit configuration and can use MultiAssetManager's ambiently selected fallback symbol (`run-empire-v2.js:2337-2368`).
- ReadOnlyToolbox imports full Mercury provider configuration only to consume skip/ignore policy; missing embedding credentials can make the optional toolbox disappear (`trai_brain/read_only_tools.js:1-35`; `trai_brain/mercury-bridge/config.js:310-335`; `core/trai_core.js:67-69,113-121,886-898`).
- Reporting that optional failure must cross runner → TRAIDecisionModule → TRAICore; the intermediate constructor currently forwards no reporter (`run-empire-v2.js:769-779`; `core/TRAIDecisionModule.js:133-145`).
- BotStateFrame can infer broker/stock identity from credential presence. Credentials must not become telemetry identity (`core/BotStateFrame.js:99-145`; caller at `core/WebSocketManager.js:399-410`).
- RuntimeAuditSink currently passes strings through, omits Error causes, and can print raw fallback messages (`core/RuntimeAuditSink.js:44-55,87-102,170-203`).
- ModuleAutoLoader's required and optional outcomes differ. Reporting must not replace the current original result (`core/ModuleAutoLoader.js:142-203,251-297`).
- Ntfy's handler returns after scheduling a microtask; scheduling is not request invocation, service acceptance, or delivery (`core/NtfyTraceNotifier.js:176-190`).
- The supervisor prints its complete deadman capability URL (`scripts/supervisor-daemon.js:223-242`).

These are source-proven implementation boundaries, not evidence that any provider authenticated or any deployed process is healthy.

## 5. Final source ownership

The accepted target has three storage classes and one runtime owner:

- bootstrap source: credentials, capability URLs, and true pre-configuration launch inputs;
- `config/settings.json`: customer and trading behavior;
- `config/internals.json`: fixed implementation values;
- ConfigLoader: the only component that joins them into an immutable runtime snapshot.

Every live consumer receives a scoped value from that snapshot. No production library loads dotenv and no downstream module reads ambient `process.env`. Existing values and policies are preserved during the move unless separately ruled; source movement is not permission to redesign them.

The exact 41-file candidate list is in `EVIDENCE.md`. Each row must receive a live/dead and destination disposition before the implementation file list is frozen. This uses the front-loaded work to prevent later surprise expansion without turning every syntax match into an edit.

## 6. Earliest reporting remains bounded

RuntimeAuditSink is reused before the source and ConfigLoader. It records source/config/import failures locally with secret-aware redaction and bounded cause evidence. ModuleAutoLoader and optional toolbox reporting preserve existing continuation or propagation behavior.

J1 adds no process, readiness, trading, halt, flatten, retry, or notification authority. J3, J4, J15, and the producer owners remain separate.

## Footer

WHAT I DID: independently reproduced the principal Astra counts and traced its consequential startup, service, toolbox, identity, and reporting claims against the frozen source.

WHAT I DID NOT DO: trust the two nonreproducible aggregate counts, inspect `.env`, edit runtime code, run Jest, invoke a provider, or operate PM2.

WHAT I ASSUMED: the final implementation will preserve product values while replacing their source and connection; semantic corrections still require their own explicit authority.
