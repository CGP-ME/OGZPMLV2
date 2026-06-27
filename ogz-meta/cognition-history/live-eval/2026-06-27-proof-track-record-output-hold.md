# Proof Track Record Output Hold - 2026-06-27

Status: hold dirty, do not commit yet.

Files intentionally left dirty:

- `public/proof/track-record/data/accounts/MAX58356.json`
- `public/proof/track-record/data/index.json`

Reason:

These files appear to be generated public proof output from the June 24 and June 25 eval activity. They include updated balance, trade counts, symbols, equity series, daily PnL, recent trades, and cutoff liquidation exits.

Do not publish or commit them blindly. Public proof data must not mislabel execution semantics. Before commit, verify the generated JSON against the raw journal/trade source for:

- partial exit vs full close labeling
- cutoff liquidation records
- strategy/source attribution availability
- fee and PnL math
- account, broker, asset class, and live-mode scope

Decision:

Leave the generated proof files dirty until a dedicated proof-output verification slice either commits verified regenerated output or discards stale generated output.
