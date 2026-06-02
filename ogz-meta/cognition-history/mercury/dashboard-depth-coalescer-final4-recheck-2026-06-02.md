# Mercury Recheck: Dashboard Depth Coalescer Final 4

Target files and ranges:
- `core/DashboardDepthCoalescer.js:1-120`
- `test/dashboard-depth-coalescer.test.js:1-190`

Context:
- The prior Mercury response claimed two back-to-back `queue()` calls at the same timestamp can both see `lastGlobalSentAt`/`lastSentAt` as stale because `_send()` updates after `queue()` returns.
- In JavaScript this call path is synchronous. `queue()` calls `_send()` directly, and `_send()` updates `lastSentAt` and `lastGlobalSentAt` before `queue()` returns.
- Two focused tests now mechanically assert that:
  - different symbols at the same timestamp send one immediate frame and queue the other;
  - the same symbol at the same timestamp sends one immediate frame and queues the other.

Attack prompt:

You are Mercury. Re-check this exact claim only:

Can two back-to-back `DashboardDepthCoalescer.queue()` calls at the same `now()` timestamp emit more than one immediate `depth_update`, either globally or for the same symbol?

Use exact file:line evidence from `core/DashboardDepthCoalescer.js` and `test/dashboard-depth-coalescer.test.js`. If you still claim a breach, provide a runnable sequence that would make the added tests fail. If the claim is false, state which lines prove `_send()` updates the gate synchronously before the second `queue()` computes `_waitMs()`.
