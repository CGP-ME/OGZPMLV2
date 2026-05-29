[MERCURY-BRIDGE] Index contains 14675 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/ledger/frontend/panel-emitter-mapping-2026-05-09.md:163-195 (doc_section: Action Sequence (proposed, await go)) sim=0.643
  2. ogz-meta/sessions/session-2026-04-27-28-dashboard-punch-list-and-asset-isolation.md:40-63 (doc_section: 3. Asset-Isolation: Post-Swap Auto-Flip Chain) sim=0.616
  3. ogz-meta/ledger/claudecotwerk.md:1-2968 (doc_section: root#part15) sim=0.605
  4. ogz-meta/ledger/frontend/chart-panel.js:640-774 (function: bootstrapWS#part1) sim=0.490
  5. ogz-meta/ledger/frontend/cleanup/chart-panel.js:640-774 (function: bootstrapWS#part1) sim=0.490
  6. ogz-meta/ledger/DASHBOARD-DEEPSEARCH-PROMPT-2026-04-27.md:48-79 (doc_section: Observable regressions to fix) sim=0.607
  7. public/js/panels/chart-panel.js:640-774 (function: bootstrapWS#part1) sim=0.490
  8. ogz-meta/ledger/claudecotwerk.md:1-2968 (doc_section: root#part16) sim=0.567
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 413 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.77, 18 iters, used 2x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (250ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=144.2)

═══ ANSWER ═══

**Result – the patch does not introduce any functional breach for the scenarios you listed, **except** for a race‑condition that can cause duplicate or missing historical‑data requests after rapid asset switches.

Below is a concise walk‑through of each attack vector with the exact code locations that either block the attack or, in one case, allow it.

| # | Attack scenario | Why it fails (or succeeds) | Evidence (file : line) |
|---|----------------|---------------------------|------------------------|
| 1 | *Changing the dropdown or watch‑list selection is still suppressed incorrectly.* | The UI change event updates the `<select>` value **before** `switchAsset()` runs, and `switchAsset()` now checks `_loadedAsset` (the last asset that was actually sent) rather than the selector’s value. If the selector’s value differs from `_loadedAsset`, the function proceeds; otherwise it returns early – exactly the intended behaviour. | `switchAsset` guard at line 1452 (`if (_loadedAsset === sym) return;`) and selector read at line 1410‑1413. |
| 2 | *_loadedAsset says an asset is active when no `asset_change` was sent.* | `_loadedAsset` is only assigned **after** the two `socket.send()` calls in `bootstrapWS` (lines 1082‑1084) and after a successful `socket.send()` in `switchAsset` (lines 1460‑1461). If `socket.send` throws, the `catch` block aborts before `_loadedAsset` is set, so a false‑positive never occurs. | `bootstrapWS` – lines 1082‑1084; `switchAsset` – lines 1460‑1461. |
| 3 | *BTC delta/price can still repaint TSLA (or another selected asset).* | All real‑time handlers (`delta`, `trade`, `state_update`, etc.) begin with `if (!ChartPanel.isSelectedAssetPayload(...)) return;`. `isSelectedAssetPayload` simply forwards to `payloadMatchesSelectedAsset`, which compares the payload’s symbol (extracted by `payloadSymbol`) with the **currently selected** asset (`selectedAssetSymbol`). Thus a payload for BTC is ignored while TSLA is selected. | `delta` handler – line 1094; `trade` handler – line 1122; `isSelectedAssetPayload` – lines 2501‑2503. |
| 4 | *Missing‑symbol payload is accepted as if it belonged to the selected asset.* | `payloadSymbol` returns an empty string when no symbol field is present; `payloadMatchesSelectedAsset` then returns `false` because `selectedAssetSymbol()` never equals `''`. Consequently the handler returns early. | `payloadSymbol` – lines 167‑176; `payloadMatchesSelectedAsset` – lines 178‑182. |
| 5 | *Socket outage/reconnect leaves the chart silently stuck or falsely marked loaded.* | On a disconnect the socket simply stops delivering events; `_loadedAsset` retains the last‑sent asset, which is correct. The bootstrap routine runs only once (`_wsBootstrapped` flag), so a reconnect does **not** reset `_loadedAsset` incorrectly. The chart may show no new data, but that is a network‑availability issue, not a logical bug in the patch. | `bootstrapWS` guard – line 1063 (`if (_wsBootstrapped) return;`). |
| 6 | *Duplicate or missing historical requests after an asset switch.* | `switchAsset` schedules a **single‑shot** `setTimeout` (lines 1470‑1474) to request historical candles 500 ms after the asset change. The timeout identifier is stored in `_trackedTimers` via `trackTimer(tid)`, but **previous timers are never cleared** when a new switch occurs. Rapid successive switches therefore leave multiple pending timers, each firing a `request_historical` for the asset that was current at the time the timer was created. This can cause (a) duplicate requests for the same asset and (b) a request for an *old* asset after the selector has already moved on, leading to mismatched data or missing data for the newest asset. | `switchAsset` – lines 1470‑1474 (timeout creation) and line 1474 (`trackTimer(tid)`); no corresponding `clearTimeout` or removal from `_trackedTimers`. |

### Concrete exploit for #6
1. User selects **Asset A** → `switchAsset('A')` runs, sets `_loadedAsset='A'`, clears chart, starts a 500 ms timer **T₁**.
2. Before **T₁** fires, user selects **Asset B** → a second `switchAsset('B')` runs, sets `_loadedAsset='B'`, clears chart again, starts another timer **T₂** (still 500 ms from now). **T₁** is **not** cancelled.
3. **T₁** fires first, sending `request_historical` for **Asset A** while the UI now shows **Asset B**. The chart receives old‑asset candles, which are either ignored (if the selector check fails) or temporarily painted over the correct data, causing visual glitches or missing data for **Asset B**.
4. **T₂** fires later, sending the correct request for **Asset B**. The net effect is a duplicate request for **A** and a delayed request for **B**, satisfying the “duplicate or missing historical requests” attack.

### Recommendation
Cancel any previously scheduled historical‑request timer when a new asset switch occurs, e.g.:

```js
if (_pendingHistoricalTimer) clearTimeout(_pendingHistoricalTimer);
_pendingHistoricalTimer = setTimeout(() => { … }, 500);
trackTimer(_pendingHistoricalTimer);
```

or remove the old timer from `_trackedTimers` before creating a new one.

All other attack vectors are blocked by the current logic, as demonstrated by the cited code.

[iterations: 13 | termination: answer_given | latency: 14156ms]
