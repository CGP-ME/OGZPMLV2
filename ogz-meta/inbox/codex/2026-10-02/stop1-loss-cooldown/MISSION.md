# Stop1: remove rejected symbol-loss cooldown

Dispatcher: Trey. Continue Stop1, one reviewed atomic change per commit/push. A17 rejects per-symbol loss cooldown everywhere, including eval. Remove declaration, runtime producer/readers, telemetry, and legacy persisted cooldown state while preserving other financial halts, operator pauses, trade accounting, and exit policy.

Preparation source: ogz-meta/inbox/codex/2026-10-01/stop1-loss-cooldown-preparation/. Root owns integration, exact-source behavior, review and delivery. Other Astra owns Mercury integration; this lane changes no Mercury production files.
