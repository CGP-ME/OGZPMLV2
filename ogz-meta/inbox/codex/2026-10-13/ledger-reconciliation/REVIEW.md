> Historical October 13 candidate evidence. Superseded for delivery and current verification by [October 16 review](../../2026-10-16/ledger-delivery/REVIEW.md). Old review/approval wording below is historical, not an active instruction; old fixtures require isolated adaptation and are not current acceptance.

# Reconciliation review

Candidate a68b245cb9d38ace92ec30495529adc77e387766 versus 329ac1cf3f0a613b191319bec18b433e4e8f5e4b. Exact production edits: scoped close receipt fields in OrderExecutor and PnLTracker; RiskManager comparison; SessionRouter producer/journal wiring.

Astra's initial bounded source attack found no introduced break. Mercury run `2026-10-13T20-20-27-924Z-fae71b702cb0` returned `found_break`. Its six findings were checked against immutable candidate and base; Astra independently adjudicated them:

1. Sub-share promotion: OrderExecutor candidate lines 2520–2548 are byte-identical to base. Unchanged code; not repaired or claimed fixed here.
2. Unknown-receipt mapping: lines 3657–3669 are byte-identical to base. Separate existing behavior, not changed here.
3. Oldest-trade selection fallback: lines 4440–4451 are byte-identical to base. Separate existing behavior, not changed here.
4. Prior report without scope: no producer. RiskManager initializes an empty report array (36), constructs scope on every report (58,65–68), appends only that shape (130), and reset clears the array (279). There is no persisted-report hydration or alternate production writer.
5. Equity-only input: intentionally not treated as USD cash. The sole production caller passes explicit adapter cash (SessionRouter 1351–1363,1391–1397); absent cash gives a named non-comparable receipt.
6. Missing RiskManager: runner constructs it at 715–718 before wiring its own context into SessionRouter at 1070. SessionRouter stores that context at 144–149. No production caller supplying a missing instance was found. Reconciliation is inside the existing try/catch, contrary to Mercury's uncaught-exception allegation.

The first Mercury result is not relabeled clean. A second attack was dispatched requiring reachable producer and base-versus-candidate evidence, with no file-path steering. Final result belongs in RESULTS.md after completion.

Second Mercury run `2026-10-13T20-24-15-024Z-fc0cdb31457a` returned found_break on only the equity-fallback removal and RiskManager dereference. It confirmed the three OrderExecutor allegations were unchanged base code and no longer alleged an unscoped prior report. It did not identify a production caller supplying equity-only input or a router context without RiskManager. Astra's producer evidence above still applies. Explicit delivery exception is pending; do not describe either Mercury run as clean.
