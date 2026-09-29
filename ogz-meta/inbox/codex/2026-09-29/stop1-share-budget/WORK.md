# Work

One logical production change in core/OrderExecutor.js: pass absoluteCapSizeUsd to the only share-range call, convert it to whole-share capacity, correct division round-up against dollar multiplication, and include it with the existing quantity caps before minimum feasibility is decided.

The existing impossible-range result carries zero quantity and a named reason to the existing entry refusal. No new gate, throw, default, configuration value or runtime framework is added. Both BUY and SELL_SHORT use this producer. SELL/COVER do not construct entry plans.

Source and this packet are delivered in the same atomic commit; that commit is discoverable through git log -- this packet path. Reviewed production tree c4a1b4e7cbfe02b11ae7d48153856fe90a99e29c pins the source independently of documentation additions.

Files: core/OrderExecutor.js, CHANGELOG.md, and this packet. Private evidence and unrelated dirty changes are excluded. The live file retains inherited entryBudgetUsd logic alongside this repair; staged source is the review and verification target.
