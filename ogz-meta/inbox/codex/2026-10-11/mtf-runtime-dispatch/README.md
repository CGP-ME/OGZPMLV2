# Configured-timeframe runtime wiring

Deferred item 27: selected stocks receive each configured frame, and each symbol/frame owns its candle history and indicators. Runner dispatch, TradingLoop evaluation and entry attribution carry that explicit frame. Per-symbol queues retain overlapping analyses; SessionRouter drains source work before flattening and before changing broker scope. The pinned selector and duplicate runner confluence adapter are removed from the active path.

[Source and verification receipt](source-receipt.json) identifies the exact production tree and qualifications. [Scoped diff](scoped-diff.patch) excludes unrelated dirty work. [Astra review](astra-review.json) records the two reproduced defects corrected during review: exit-price forwarding and queued source work crossing a session boundary. Raw Mercury answers retain their original verdicts.

The fixtures exercise actual candle/indicator/strategy evaluation for two symbols across five frames, actual paper OrderExecutor entry/close attribution, handler dispatch, queue completion and both handoff directions. Scripted boundaries are stated in each receipt. This is isolated source verification; PM2 was not restarted, and no live broker execution is claimed. Stop 2 and runtime acceptance remain open.

Run fixtures against an isolated export of the delivered commit with node_modules available. `paper-run.cjs <commit>` creates its own isolated export. The two Astra probes accept the delivered commit as their first argument; historical counterexample receipts record earlier candidate trees.
