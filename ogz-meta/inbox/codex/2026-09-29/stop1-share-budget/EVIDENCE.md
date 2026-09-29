# Evidence

Commands: node ogz-meta/inbox/codex/2026-09-29/stop1-share-budget/fixtures/observe.cjs baseline and candidate. Both completed with 16 recorded scenarios and assertions. OBSERVATIONS.md contains the actual quantities and dollar bounds; QUANTITY.md and CALLER.md contain exact staged source with its SHA-256.

Observed defect: two shares at $100 produce $200 despite a $150 absolute ceiling in the baseline, for both BUY and SELL_SHORT. Candidate produces the existing explicit impossible-range result. A $200 minimum remains permitted under $200 and $250 ceilings. Existing share/notional/consistency/daily-loss caps still take precedence when tighter. Fractional range-disabled, whole-share range-disabled and crypto results are unchanged in these cases.

Observed precision boundary: 45.53999999999999 / 5.06 rounds to 9 in JavaScript, but 9 * 5.06 is 45.54. Candidate capacity is corrected to 8 before minimum feasibility.

Scope: actual Git-source OrderExecutor planning/quantity methods, synthetic inputs, stubbed policy/ownership collaborators. No real market data, broker submission/fill, browser, notification delivery, live exit execution or runtime activation proof. SELL and COVER returning null from the entry-plan builder is not an exit-execution test.

Planning and review invocation fixtures record maxTokens=7750 and no iteration ceiling. Initial planning dispatch failed with sandbox MongoDB EPERM. First service-enabled retry failed at iteration zero because automatic unrelated dirty-tree context exceeded the provider limit. Scoped planning then ran; its recommendation conflated working-tree and intended policy and was not accepted as approval.

TAPES.json records run IDs and original/redacted/compressed SHA-256 hashes. Tapes are gzip of redactSensitiveText output. Failed attempts remain present. Private unredacted evidence is excluded from delivery.
