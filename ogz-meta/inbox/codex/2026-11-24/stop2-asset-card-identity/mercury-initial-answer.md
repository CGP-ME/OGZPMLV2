# Review: Asset/Timeframe Card Identity — Dashboard Asset Selection & Multi-Asset Price Traffic

## Direct Answer

**The change removes the live price-frame symbol sync from the asset card and replaces it with a static mirror of `#assetSelector.value` (a display-only, user-controlled dropdown). This reintroduces the exact "lying about the active session" behavior that the removed code was written to fix. When the user's dropdown selection diverges from the bot's actual active trading session — which the architecture explicitly permits, since asset selection is display-only and SessionRouter independently decides the active session — the card displays the wrong trading identity.**

## Candidate Inventory (examined 5 of 5)

| # | Candidate | Evidence | Verdict |
|---|---|---|---|
| 1 | Symbol source changed `#symbolSelector` → `#assetSelector` | asset-tf-card.js:27; grep shows `#symbolSelector` no longer exists anywhere in the tree (only a CHANGELOG mention) | Supported — this is a *fix* of a dead reference; the old `syncSymbol()` was a no-op |
| 2 | Removal of live `'price'` WS handler (`syncSymbolFromPriceEvent` + `attachPriceHandler`) | baseline asset-tf-card.js:46-60, 124-150 removed from current | **Supported — this is the break** |
| 3 | v2 script version bump | unified-dashboard-v2.html:1115 | No-op — v2 has no `.asset-tf-card` markup and no `#assetSelector` (grep: 0 hits), so `init()` early-returns at asset-tf-card.js:76 |
| 4 | unified-dashboard.html comment + version bump | unified-dashboard.html:2702, 3369 | Cosmetic |
| 5 | Price display path unchanged (MutationObserver mirrors `#currentPrice`) | asset-tf-card.js:98-102 | Not part of the break — price source untouched |

## The Break — Control Flow Trace

**Old behavior (baseline 185883a):** `asset-tf-card.js` registered a live `'price'` handler on the socket (`attachPriceHandler`, lines 129-150) that set `.asset-tf-card__symbol` to `data.symbol` on every tick (`syncSymbolFromPriceEvent`, lines 55-60). The card symbol therefore tracked the **actual streamed/traded asset**. The code documented this explicitly: *"pre-fix the card hardcoded 'TSLA' via the dropdown mirror, lying about the active session. Now driven by the data.symbol field on every price tick"* (baseline lines 51-53). CHANGELOG 6412-6413 confirm this design: price events "mirror active asset to the asset-tf-card live."

**New behavior (current 2c11811):** The live handler is deleted. `syncSymbol()` now unconditionally sets `symbolEl.textContent = symbolSel.value` (asset-tf-card.js:39), where `symbolSelect: '#assetSelector'` (line 27).

**Why the divergence is reachable:**
- The backend treats dashboard asset selection as **display-only**: `ogzprime-ssl-server.js:2089-2091` ("kept display-only; not relayed to bot runtime"), `core/WebSocketManager.js:33`, `core/MultiAssetManager.js:22`.
- The bot's actual active session is decided independently by SessionRouter (`core/SessionRouter.js:76`, `run-empire-v2.js:2258-2292`).
- Nothing programmatically sets `#assetSelector.value` to the active session — regex search for `assetSelector.value =` assignments returns **0 hits** across the repo.
- The dropdown defaults to `TSLA` (unified-dashboard.html:3080), so on a crypto session (e.g. weekend BTC-USD), the card shows "TSLA" while the bot trades BTC-USD.

**Consequence:** The card is the primary asset-identity display. Under the new code it shows the user's display-only selection rather than the instrument the bot is actually trading. Because `#currentPrice` retains its last value (chart.js:951 writes unconditionally on filtered frames; gating at chart.js:439/838 only checks `lastPriceSymbol === selectedAsset`), the card can also hold a **stale price** under the wrong symbol once the active session changes. This misrepresents the live trading state to an operator.

**Counter-evidence considered (why it doesn't overturn the finding):**
- The change is deliberate — version tag `20261124-selected-asset`, HTML comment "Symbol/price mirror #assetSelector / #currentPrice" (unified-dashboard.html:2702), header comment (asset-tf-card.js:4). This makes it a *documented design change*, not an accident.
- The new card is internally consistent (symbol = selected asset; price = selected asset's filtered price), whereas the old live-symbol path could show a symbol/price mismatch in multi-asset traffic (symbol from unfiltered frames vs price from filtered selection).
- **However**, the documented product intent (baseline fix + CHANGELOG 6412-6413) is that the card reflects the *active traded session*, and the new code reverts exactly that. The divergence is not guarded anywhere.

## AST Evidence
- Used: `find_definition` for `selectedLegacyAsset` (chart.js:168) and `update` (chart.js:907); `find_definition`/grep for call-site tracing; `open_file`, `git_show`, `read_review_receipt`.
- Did **not** use Serena blas-radius/property tooling. The "nothing assigns `assetSelector.value`" claim rests on `regex_grep` (0 hits) — strong but grep-based, not AST-backed. This is the one claim I'd want a Serena property-ref confirmation for.

## Inherited / Fallback Behavior
- `syncSymbol()` silently no-ops if `#assetSelector` or the card is absent (asset-tf-card.js:38) — no error surfaced.
- On v2 (no card markup), the whole module no-ops (asset-tf-card.js:76).
- The card's initial HTML symbol is hardcoded "TSLA" (unified-dashboard.html:2709); the new code leaves it at the dropdown value.

## Allegations
- Allegation: card shows the wrong trading identity when selection ≠ active session. **Supported** by the removed live handler, display-only backend semantics, absence of any `assetSelector.value` writer, and the default TSLA selection.
- No executed/observed runtime failure exists in this review; the break is source-derived and reachable, not an executed observation.

## SUBSTANTIVE RESOLUTION
UNRESOLVED-FOR-TREY — this is a deliberate design change that conflicts with the previously documented intent; the two readings (selected-view card vs active-session card) cannot both be satisfied. No prior reviewer dissent to preserve.

---

**VERDICT: found_break**

**ADVERSARIAL_REVIEW_BLOCKING: yes**

**CANDIDATE SET:** examined 5 of 5 (enumerated above).

**AST EVIDENCE:** find_definition (selectedLegacyAsset, update), grep/regex_grep, open_file, git_show, read_review_receipt. No Serena tools used; the zero-assignment claim is grep-backed only.

**INHERITED:** `#assetSelector` default TSLA (unified-dashboard.html:3080); silent no-op when elements absent (asset-tf-card.js:38,76); stale `#currentPrice` retention carries into the card.

**FOURTH SHAPE CLASSIFIER:** classified 1 of 1 added behavior — the new `syncSymbol()` fallback (mirror dropdown) is a silent-default path, not a guard/gate/throw; no new bot gates introduced.

**ALLEGATIONS:** one finding (card identity follows display-only selection, not active session) — supported by baseline asset-tf-card.js:46-60, CHANGELOG 6412-6413, ogzprime-ssl-server.js:2089-2091, and the zero-writer search on `assetSelector.value`.

**WHAT I DID:** read current asset-tf-card.js (1-120), its diff, both HTML diffs, unified-dashboard.html select/card markup (2690-2897, 3055-3090), chart.js price paths (160-230, 420-660, 825-1000), core.js price/historical handlers (1-362), websocket.js handler dispatch (440-542), session-phase.js (115-250), baseline versions via git_show, and grepped assetSelector/symbolSelector/currentPrice/asset_switched/selectedLegacyAsset.

**WHAT I DID NOT DO:** did not run the app or any test; did not use Serena AST tools; did not read the full CHANGELOG (only targeted lines); did not verify the actual SessionRouter-to-symbol mapping in production config.

**WHAT I ASSUMED:** that `selectedMarketPayload` filtering (core.js:36-45) is the operative price gate on the live dashboard (verified in source); that the card is the intended active-session identity display per the removed code's documented intent.

**WHY THIS VERDICT:** The diff removes the only mechanism that tied the card's symbol to the actual streamed/traded asset and replaces it with a display-only dropdown mirror. The backend explicitly treats that dropdown as display-only and nothing syncs it to SessionRouter's active session, so the divergence is reachable and unguarded — this is a regression of a documented bug fix (CHANGELOG 6412-6413; baseline asset-tf-card.js:46-60).

**IF INCOMPLETE, WHY:** Not incomplete for the verdict. The one residual gap is AST-backed confirmation of the zero-assignment claim and an executed runtime observation of the divergent-session case, neither of which changes the source-derived conclusion.
