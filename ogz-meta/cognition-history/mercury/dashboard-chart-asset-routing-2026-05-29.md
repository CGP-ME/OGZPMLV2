Break this dashboard chart asset-routing patch. Do not validate it.

Scope:
- `public/js/panels/chart-panel.js:85`
- `public/js/panels/chart-panel.js:1081-1094`
- `public/js/panels/chart-panel.js:1452-1464`

Patch summary:
- Adds `_loadedAsset` as the last asset request that was actually sent.
- Initial bootstrap sets `_loadedAsset` only after sending `asset_change` and `request_historical`.
- Delta/HUD ticks now require `ChartPanel.isSelectedAssetPayload(d)` so asset-less or wrong-symbol deltas cannot repaint the selected chart.
- `switchAsset()` no longer compares against `assetSel.value`, because browser change events update `.value` before the handler runs.
- `switchAsset()` only updates `_loadedAsset` and selector value after `socket.send({ type: 'asset_change', asset: sym })` succeeds.

Attack goals:
1. Find a sequence where changing the dropdown or watchlist selection is still suppressed incorrectly.
2. Find a sequence where `_loadedAsset` says an asset is active when no asset_change was sent.
3. Find a sequence where BTC delta/price can still repaint TSLA or another selected asset.
4. Find a sequence where a missing-symbol payload is accepted as if it belonged to the selected asset.
5. Find a sequence where socket outage/reconnect leaves the chart silently stuck or falsely marked loaded.
6. Find a sequence where the patch creates duplicate or missing historical requests after asset switch.

If a breach exists, cite exact file:line and the concrete input/event sequence.
If no breach exists, list the attack sequences attempted and why each failed against this code.
