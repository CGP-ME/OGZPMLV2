# Role source-label truth

At baseline, `fillSourceGaps` produces false canonical labels where role configuration renames or composes a canonical value. The isolated audit finds 18 nonexistent `config:<file>:<path>` references: `broker.tradingInterval` in each bot profile, plus sixteen `services.marketData` paths in the market-data-tool role. Separately, the supervisor role returns `internals.json` schema/revision values while its fallback labels point at `settings.json`.

The candidate changes source bookkeeping only. It allows the existing clone helpers to record an explicit runtime projection path while retaining the true canonical source path. It records supervisor schema/revision directly from `internals.json`; records the market-data-tool Alpaca projection as `services.dashboard.stockData`; labels composed market-data parents as explicit role projections; and records the two bot projections from their true internals leaves. It also records `webhookOrders` at its actual runtime path so the transient `services.webhookOrders` source keys do not remain in a bot snapshot that has no such runtime node.

No configuration value, role shape, credential policy, validation rule, fallback, guard, or throw changes. [change.patch](change.patch) modifies only `foundation/ConfigLoader.js` in the candidate copy.

The fixture validates all six role snapshots. Every candidate `config:settings.json:*` or `config:internals.json:*` label must resolve in that exact owner, every candidate source key must name a real role-config node, and explicit value/source equality is asserted for supervisor revision/schema, market-data Alpaca projection, bot trading interval, and bot volume-cap limit.

Limit: this proves copied Loader snapshots in the disposable helper namespace. It does not restart or inspect a running process, broker, PM2, or network service.

All six complete resolved configs and scalar canonical source/value pairs are compared. Corrected source metadata intentionally changes affected fingerprints. Mercury returned no_break_found but described a different earlier change; the preserved Astra review supplies the independently authorized adjudication for this exact candidate.
