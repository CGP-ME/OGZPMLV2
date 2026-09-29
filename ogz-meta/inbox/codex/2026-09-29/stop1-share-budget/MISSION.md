# Stop 1 share-minimum absolute ceiling

Date: 2026-09-29. Dispatcher and ruling authority: Trey.

Tasking: "nothing was my cat lets keep moving", continuing the authorized Stop 1 migration and correction of discovered sizing flaws. Supplied issue: a share minimum can raise the quantity after the absolute dollar cap is applied. Trey requires Fourth Shape, actual behavior verification, adversarial review, one logical commit and push, and preservation of unrelated dirty work.

Baseline: astra-era aa91945575b22b076273d2c829a35c7a6b5cc9ef. Production review tree: c4a1b4e7cbfe02b11ae7d48153856fe90a99e29c.

Scope: propagate the already resolved absolute dollar ceiling into the existing share-range quantity producer before it applies the minimum. Preserve existing explicit impossible-range outcome. No percentage, account denominator, aggregate allocation, boosted sizing, deployment or broker policy change.

The inherited entryBudgetUsd=sizeUsd implementation is stricter than this repair. It remains uncommitted; this candidate preserves the published minimum-share increase when it fits within the absolute ceiling. Planning output that assumed inherited bytes were the target is not adopted as authority.
