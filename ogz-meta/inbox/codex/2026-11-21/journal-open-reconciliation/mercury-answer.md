═══ ANSWER ═══

I have now traced the full reconciliation flow, the producers, the downstream mutation, and the baseline behavior. Let me write up my findings.

---

## Direct answer

A journal-open record can be **changed** by startup reconciliation only when **both** of these hold:

1. **the broker reports no position for that bundle's symbol** (`brokerSymbolPositionCount === 0`), **and**
2. **the specific orderId is absent from `stateOpenOrderIds`** (`orderId ∉ stateOpenOrderIds`).

The only startup path that actually mutates (removes) journal-open records is `_reconcileJournalOpenTradesWithAuthoritativeState` (`core/TradeJournalBridge.js:960-1002`, invoked at startup from line 474), whose mutation is `journal.recordOpenTradeReconciliation(...)` → `core/TradeJournal.js:1062-1064` (appends `OPEN_TRADE_RECONCILED` and deletes the orderId from `openTrades`).

**When the broker still reports exposure** (a position for the symbol): **no** record in that bundle can be changed — the whole bundle is skipped by the new guard at `TradeJournalBridge.js:981` (`if (brokerSymbolPositionCount !== 0) continue;`), and the journal independently refuses at `TradeJournal.js:1033`.

**When StateManager still reports exposure for a specific orderId**: that **exact** orderId cannot be changed (guard at `TradeJournalBridge.js:983` + journal refusal at `TradeJournal.js:1033`). But the state guard is **per-orderId**, so sibling orderIds in the same symbol bundle **can still be changed**, provided the broker reports no position for that symbol. This is the residual class: records whose own orderId is not in `stateOpenOrderIds`, in a symbol with no broker position — even while StateManager reports exposure for *other* orderIds in that same symbol.

## Candidate set (examined 8 of 8)

| # | Path | Role | Verdict |
|---|------|------|---------|
| 1 | `_reconcileJournalOpenTradesWithAuthoritativeState` (`TradeJournalBridge.js:960-1002`) | The changer | Examined; new guards at 981/983 |
| 2 | `recordOpenTradeReconciliation` (`TradeJournal.js:986-1068`) | Downstream mutation | Examined; deletes from `openTrades` at 1064; refuses exposed at 1033 |
| 3 | `_reconcileOpenStateTrades` (`TradeJournalBridge.js:785-865`) | Other startup reconciliation | Examined; only *adds* entries for state-active trades missing from journal, skips existing (820-826); never removes journal-open records |
| 4 | `_markOpenJournalTradesBrokerUnverified` / `recordOpenTradeBrokerUnverified` (`TradeJournalBridge.js:913-958`, `TradeJournal.js:1070-1126`) | Broker-unavailable path | Examined; marks `untrusted`, does **not** delete or reconcile open records |
| 5 | `_stateOpenTradeProof` (`TradeJournalBridge.js:867-880`) | Producer of `stateOpenOrderIds` | Examined; builds from `activeTrades` orderId/id/key |
| 6 | `_brokerPositionsForJournalReconciliation` (`TradeJournalBridge.js:882-894`) | Producer of broker positions | Examined; null + marks-unverified when snapshot unavailable |
| 7 | Startup caller (`TradeJournalBridge.js:474`) | Invocation | Examined |
| 8 | Baseline `7ea325e` (`git_show` lines 960-998) | Before/after comparison | Examined; baseline had **no** bridge guards, relied solely on journal-level refusal |

## Analysis of the guards

The change (`captured-diff` lines 9-13) adds two early-out guards:
- `TradeJournalBridge.js:981` — skip whole bundle if `brokerSymbolPositionCount !== 0`.
- `TradeJournalBridge.js:983` — skip a specific orderId if `stateProof.stateOpenOrderIds.includes(orderId)`.

These mirror the journal's own defense-in-depth refusal at `TradeJournal.js:1033` (`if (stateOpenOrderIds.includes(orderId) || brokerSymbolPositionCount !== 0) return null;`). Because the journal already refused exposed records in the baseline, the bridge guards do **not** change *which* records get mutated — they only avoid the call and the spurious warning logs for exposed records. So the change strictly *shrinks* the reconciled set; it cannot over-reconcile relative to the baseline.

The notable structural property: **broker exposure is checked at symbol granularity** (protects the whole bundle) while **state exposure is checked at orderId granularity** (protects only exact orderIds). Consequently the residual changeable set is exactly records satisfying both conditions (a) and (b) above.

## Unverified behaviors / missing evidence

- **Exact-string matching**: `stateOpenOrderIds.includes(orderId)` relies on the journal's `openTrades` key being string-identical to the state's orderId/id/key. If representations diverge (casing, prefix, numeric vs string), `includes` could miss and a record could be reconciled despite state exposure. Not verifiable from this code alone.
- **Instrument-format matching**: `position.symbol.toUpperCase() === scopeSymbol.toUpperCase()` (line 977) requires exact symbol equivalence; format differences (e.g., `BTC/USDT` vs `BTCUSDT`, futures contract codes) could yield `brokerSymbolPositionCount === 0` despite real economic exposure. Not verifiable here.
- **`statePositionCount` not used as a guard**: it is carried into the proof (line 878) and spread into the record, but only `stateOpenOrderIds` gates reconciliation. If state reports a nonzero position count without enumerating the orderId in `activeTrades`, the record could still be reconciled (subject to the journal consistency check at `TradeJournal.js:1023-1031`).

---

VERDICT: no_break_found
ADVERSARIAL_REVIEW_BLOCKING: no

CANDIDATE SET: examined 8 of 8; complete inventory above (the two startup reconciliation paths, both journal mutation/marking methods, both producers, the caller, and the baseline).

AST EVIDENCE: structure claims backed by `find_references` (callers of `_reconcileJournalOpenTradesWithAuthoritativeState`: only line 474) and `grep` (definitions at 867/882/960, `recordOpenTradeReconciliation` at `TradeJournal.js:986`); control-flow reads via `open_file`.

INHERITED: the change inherits the journal's independent refusal at `TradeJournal.js:1033` and consistency check at 1023-1031 as a fallback; when the broker snapshot is unavailable, `_brokerPositionsForJournalReconciliation` returns null and `_markOpenJournalTradesBrokerUnverified` runs instead (marks untrusted, does not delete).

FOURTH SHAPE CLASSIFIER: classified 2 of 2 added guards — `tradeJournalBridge.js:981` (broker-symbol gate) and `:983` (state-orderId gate), both with producer evidence above; no new bot gates introduced.

ALLEGATIONS: none asserted by prior reviewers (empty prior receipt). My own finding is an enumeration, not a defect: no record whose own exposure is reported by either source can be changed; the residual changeable set is records with no broker position for the symbol and orderId absent from `stateOpenOrderIds`. The data-format assumptions are named as unverified, not demonstrated breaks.

SUBSTANTIVE RESOLUTION: none (no substantive dispute exists; independent review, no competing findings).

WHAT I DID: read the captured diff receipt; inspected `_reconcileJournalOpenTradesWithAuthoritativeState` (960-1002), `_stateOpenTradeProof` (867-880), `_brokerPositionsForJournalReconciliation` (882-894), `_reconcileOpenStateTrades` (785-865), `_markOpenJournalTradesBrokerUnverified` (913-958), `recordOpenTradeReconciliation` (`TradeJournal.js:986-1068`), `recordOpenTradeBrokerUnverified` (`TradeJournal.js:1070-1126`), the startup caller (474), and the baseline via `git_show` `7ea325e` (960-998); traced callers with `find_references`.

WHAT I DID NOT DO: did not execute any code or tests; did not verify the actual string formats of journal openTrades keys vs state orderIds/id/key (would require runtime data); did not inspect `activeTradeEntries`/`uniqueNonEmptyStrings` helper internals beyond their usage.

WHAT I ASSUMED: that `stateOpenOrderIds` and journal `openTrades` keys are string-identical by contract; that broker position symbols normalize to the scope symbol by case only. These are the named unverified assumptions.

WHY THIS VERDICT: the change adds early-out guards that replicate the journal's own refusal; a record can be mutated only when neither source reports *that record's* exposure. The core safety property holds, and the change strictly shrinks the reconciled set vs baseline. No demonstrated defect.

IF INCOMPLETE, WHY: not incomplete for the enumeration question; the unverified data-format behaviors are named rather than resolved because they require runtime state not present in the captured source tree.
