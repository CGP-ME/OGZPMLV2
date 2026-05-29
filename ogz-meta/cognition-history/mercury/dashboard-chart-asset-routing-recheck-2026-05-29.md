Break the current dashboard chart asset-routing patch after the timer fix. Do not validate it.

Scope:
- `public/js/panels/chart-panel.js:85`
- `public/js/panels/chart-panel.js:1055`
- `public/js/panels/chart-panel.js:1092-1094`
- `public/js/panels/chart-panel.js:1452-1482`
- `public/js/panels/chart-panel.js:1702`

Patch summary:
- `_loadedAsset` tracks only assets whose `asset_change` send succeeded.
- Delta/HUD ticks require `ChartPanel.isSelectedAssetPayload(d)`, so missing-symbol or wrong-symbol delta frames fail closed.
- `switchAsset()` no longer compares against `assetSel.value`; it compares against `_loadedAsset`.
- `switchAsset()` does not update selector state or `_loadedAsset` until `asset_change` send succeeds.
- Rapid asset switches now cancel the prior delayed `request_historical` timer before scheduling the next one.
- Teardown clears tracked timers and resets `_pendingAssetHistoryTimer`.

Attack goals:
1. Find a sequence where dropdown or watchlist asset switching is still suppressed incorrectly.
2. Find a sequence where `_loadedAsset` says an asset is active when no `asset_change` was sent.
3. Find a sequence where BTC delta/price can still repaint TSLA or another selected asset.
4. Find a sequence where a missing-symbol payload is accepted as if it belonged to the selected asset.
5. Find a socket outage/reconnect sequence that leaves the chart falsely marked loaded or silently stuck by this patch.
6. Find a rapid-switch sequence that still sends stale or duplicate delayed `request_historical` messages.
7. Find a teardown/re-init sequence that leaves a stale delayed history timer alive.

If a breach exists, cite exact file:line and the concrete input/event sequence.
If no breach exists, list the attack sequences attempted and why each failed against this code.
