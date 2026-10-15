# Pattern learning: Trey requirements, 2026-10-15 UTC

Source: Trey's message during env reader reconciliation. This records requirements for the existing deferred pattern-memory work; it does not claim implementation or acceptance.

- Backtesting must not inherit a stored learning bank from previous runs. Each run must be able to learn and produce an explicitly exported symbol learning pack. Trey intends to offer these packs as a premium product. Do not interpret clean backtest starts as disabling learning or preventing exports.
- Crypto and stocks learning must remain distinct. Scope and state must remain correct across manual broker shifts and SessionRouter-driven shifts. A transition must not let records, reads, writes, or in-flight learning from the old scope contaminate the destination.
- Pattern learning needs recoverable snapshots/backups or an equivalent recovery mechanism in addition to correct producers and isolation. The Fourth Shape does not eliminate the requirement to recover from contamination.
- Scope identity, pack ownership, transition behavior, and recovery must be verified against the actual wired implementation before completion claims. Backup retention and restore details are not yet selected here; do not invent product policies in the env migration.

Current distinction: the immediate-exit correction landed in the standalone pipeline diagnostic (773020ed), where null disabled take-profit/hold values had coerced to zero. It does not demonstrate resolution of Trey's longstanding live-bot immediate-exit issue. Preserve that as a separate unresolved production investigation rather than calling the diagnostic probe live acceptance.

Current task remains env/config reader reconciliation. The disposable pattern-memory fixture verifies isolation with temporary test data; it does not define real backtest bank reuse or learning-pack export semantics. No live pattern bank, backtest export behavior, backup policy, or service state was changed by recording this ruling.
