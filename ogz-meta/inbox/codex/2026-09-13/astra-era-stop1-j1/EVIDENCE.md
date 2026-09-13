# STOP 1 J1 evidence

## Frozen source

- Branch: `astra-era`
- Investigated revision: `21dd3443b30b1886e84e6f0cd6879218f8c47a03`
- J0 control: `ogz-meta/inbox/codex/2026-09-12/astra-era-stop1-j0/CONTROLLING-SPEC.md:122-180`

No current behavior claim in this packet relies only on Astra's audit. The audit was used as a candidate map; the cited current source was re-read.

## Mechanical coverage

- Declared PM2 application records: 4 of 4 read in `ecosystem.config.js:54-248`.
- Alternate watch descriptor application records: 2 of 2 read in `ecosystem.watch.config.js:1-47`.
- Current main-runner BrokerFactory call sites: 2 of 2, both explicit Kraken/Alpaca sites at `run-empire-v2.js:846,858`.
- Main-bot dotenv/config producer sites on the current route: ConfigLoader parse plus Telegram and Discord mutation, 3 of 3 traced.
- Other declared-process dotenv mutation sites: ecosystem descriptor, dashboard, and Stripe, 3 of 3 traced.
- Declared runtime credential/capability/bootstrap-dependency groups: 20 groups classified in `CREDENTIAL-CENSUS.tsv`, plus one generated-session row and one standalone-tooling row.
- Early main-bot phases before the current ntfy installation: ConfigLoader, Sentry, imports, durable sink installation, bootstrap handlers, ModuleAutoLoader, TrAI construction, broker construction, ntfy construction; all traced in source order.
- Existing explicit resolver assets read: ConfigLoader environment helpers, TrAI resolver, ntfy factory, dashboard stock resolver/adapter, news resolver, broker option builders, RuntimeAuditSink.

This is not a whole-repository credential census. The Astra archive mechanically counted 492 literal environment-name candidates and dynamic/whole-environment sites, but those are syntax candidates, not live consumers. J1's denominator is the declared runtime processes and their currently reached credential consumers. Tooling stays separately classified.

## Key source receipts

- Private dotenv parse and merge: `foundation/ConfigLoader.js:473-492,1478-1507`.
- Config validation throw: `foundation/ConfigLoader.js:1509-1535`.
- ConfigLoader restores its private active environment and returns the frozen snapshot without assigning it to `process.env`: `foundation/ConfigLoader.js:1486-1507`.
- Sentry ambient read and source fallback: `instrument.js:39-57`.
- Sink construction after early imports: `run-empire-v2.js:3-6,36-37,108-126`.
- Bootstrap handlers: `run-empire-v2.js:315-329`.
- Auto-loader catch boundary: `core/ModuleAutoLoader.js:168-203`; required list and validation: `:251-297`.
- Telegram import capture: `utils/telegramNotifier.js:44-52,239-249`.
- Discord import capture: `utils/discordNotifier.js:47-54,472-484`.
- TrAI dynamic credential resolver: `core/trai_llm_config.js:54-83`.
- Active TrAI caller: `run-empire-v2.js:766-779`; dashboard caller: `ogzprime-ssl-server.js:238-249`.
- Active broker injection: `run-empire-v2.js:179-190,797-875`.
- Stale unconditional Kraken validation: `run-empire-v2.js:557-570,1464-1479`.
- Ntfy construction timing: `run-empire-v2.js:1060-1077`; async outcome gap: `core/NtfyTraceNotifier.js:169-202`.
- Dashboard credential consumers: `ogzprime-ssl-server.js:156-177,238-262,295-313,1136-1160,1797-1819`.
- Dashboard explicit resolver assets: `server/dashboard-stock-stream-config.js:93-190`; `server/stock-data-adapter.js:10-39,62-68`; `core/NewsSearchProvider.js:71-137`.
- Checkout source and declaration: `public/stripe-checkout.js:11-16`; `ecosystem.config.js:198-206`.
- Supervisor source and declaration: `scripts/supervisor-daemon.js:45-58,223-244`; `ecosystem.config.js:208-247`.
- Durable local sink behavior: `core/RuntimeAuditSink.js:125-205`.
- Existing partial redacted configuration receipt: `core/RuntimeConfigProof.js:20-43,64-91`.
- Pattern-memory ambient identity and reached first construction: `core/UnifiedPatternMemory.js:191-206,246-257`; `core/EnhancedPatternRecognition.js:382-393`; `run-empire-v2.js:594-600`.
- Bot read-only toolbox coupling: `core/trai_core.js:67-69,113-121,886-898`; `trai_brain/read_only_tools.js:1-11,31-35`; embedding initialization at `trai_brain/mercury-bridge/config.js:310-335`; selected key name at `mercury.config.json:8-13`.
- Bot stock-history ambient fallback: `run-empire-v2.js:2337-2371`; `server/stock-data-adapter.js:10-20,42-68`; existing dashboard explicit use at `ogzprime-ssl-server.js:1926-1933`.
- Configuration-dependent fatal context: `run-empire-v2.js:143-163,193-203`; raw diagnostic bypasses at `:315-329,3650-3655` and `core/ModuleAutoLoader.js:179-200`.
- Supervisor deadman URL diagnostic: `scripts/supervisor-daemon.js:223-242`.

## Proof limits

No bot, dashboard, Stripe service, supervisor, PM2 process, broker, LLM provider, webhook, Sentry event, ntfy request, Telegram request, Discord request, or phone was operated.

No deployed environment source, process revision, credential availability, external authentication, or delivery outcome is proved.

The current `.env` is ignored by Git at `.gitignore:10`; this packet contains no value from it.

## Footer

WHAT I DID: produced file:line receipts and a declared-process census.

WHAT I DID NOT DO: inspect PM2 state or claim external service success.

WHAT I ASSUMED: current source remains unchanged until cold pull; implementation re-runs every source and runtime receipt at its landed SHA.
