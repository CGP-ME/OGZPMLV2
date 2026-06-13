# OGZPMLV2 — Operator Design Gaps

**Author:** Wolf (Claude Opus 4.7), captured from operator (Trey)
**Date started:** 2026-05-14
**Purpose:** Catalogue every architectural piece Trey specced that AIs deferred, omitted, or built wrong. This document exists to break the pattern of "spec gets written down, conversation moves on, work never happens, next session inherits the gap." Lives on disk. Survives context compaction. Anyone inheriting this project gets it.

**Operating principle:** These are NOT bugs. These are missing/incorrect implementations of the operator's stated design. The audit fix spec (`OGZPMLV2-FIX-SPEC-BY-MODULE.md`) handles AI-introduced fallback bugs. This document handles AI-introduced architectural deferrals and omissions.

**Difference from audit:**
- Audit fixes: silent failures, fallback defaults, missing throws — close debt from AI shortcuts
- Design gaps: features specced by operator, never built or built wrong — close debt from AI deferrals

Most design gaps require building, not patching. Effort estimates are honest, not optimistic.

---

## Gap 1 — SessionRouter (15 handoffs)

**Operator's spec (verbatim):**
> Session router... boom another one... none of those save one is done and then that one is questionable if it works

**Operator's urgency note:**
> the 15 handoffs aren't necessary till arbitrage or until customers request them to be honest

**What exists:** SessionRouter.js has some handoffs wired. Project memory says 2 of 15. Crypto/stocks transition handling, force-closes, pattern bank swaps, IndicatorEngine reinit — partial.

**Gap:** 13 of 15 critical handoffs not wired. Don't know each one individually — operator can enumerate when ready.

**Effort:** Medium-Large. Most handoffs are per-event wiring — find the trigger, find the state mutation, find the downstream invalidation. Each ~hours to a day if straightforward. Some interact (pattern bank swap depends on detecting asset class change, which depends on session detection). Total: weeks if done properly.

**Status:** DEFERRED per operator until arbitrage stage or customer demand.

---

## Gap 2 — Multi-directional Trading

**Operator's spec (verbatim):**
> Multi directional trading boom another one

**What exists:** Bot trades long-only in current P0 config. SHORT branch exists in OrderExecutor (line 478+, has its own entry path). DIRECTION_FILTER env var controls long/short/both at the top-level filter.

**Gap:** Need operator to specify what "multi-directional" actually means in his design. Possibilities — operator decides which:
- Long AND short same ticker simultaneously (hedged exposure)
- Independent long path and short path with different strategies competing
- Long-or-short selection driven by signal direction, not just filter
- Long+short with different sizing/risk per direction
- Something else operator has in mind

**Effort:** Cannot estimate until spec is clarified.

**Status:** AWAITING OPERATOR DETAIL.

---

## Gap 3 — Multi-Position (Per-Trade Sealed Environments)

**Operator's spec (verbatim):**
> Multi position boom another one

**Project memory context:** Per-trade sealed environments (each trade born with its own card/state) is the grand design. maxPositions should not be constrained to 1. F9's per-trade MPM Map implements this.

**What exists:** F9 (per-trade MPM Map) landed in commit cb04261. StateManager has activeTrades Map keyed by tradeId. MaxProfitManager tracks per-trade tier state. Some sealed-environment foundations are in.

**Gap:** Operator says only one piece is built and that one is "questionable if it works." Need operator to specify which piece is the built-questionable one, and what's missing for the design to be complete. Likely:
- Independent risk allocation per trade (not shared bucket)
- Independent strategy attribution (not shared brain state)
- Independent exit contracts per trade
- Independent pattern memory per trade — does each trade record its own pattern outcome or is it pooled?
- Trade-level invariants enforced (one trade's state can't corrupt another's)

**Effort:** Medium. Foundations exist. Completing the seal probably means auditing every cross-trade state read in OE/SM/MPM and converting to per-trade scope.

**Status:** AWAITING OPERATOR DETAIL on which piece is questionable.

---

## Gap 4 — Multi-Timeframe Parallel Scanning

**Operator's spec (verbatim):**
> Multi timeframe boom... the bot should scan a list of predetermined tickers 7 or 8 whatever we have backtested looking for setups on any of the timeframes all strats compete independent if they ever had the architecture to become robust

**Implied requirements:**
- Predetermined ticker list (7-8 backtested tickers, not just one)
- Parallel scanning across all configured timeframes
- All strategies evaluate independently on each (ticker, timeframe) pair
- Setups detected on any timeframe trigger evaluation — not "current timeframe only"
- Strategies compete independent of each other (no shared brain state)

**What exists:** Current bot scans ONE ticker on ONE timeframe at a time. AdaptiveTimeframeSelector switches timeframes serially. MultiTimeframeAdapter exists but is single-stream. MultiAssetManager exists but project memory suggests it's tier-2 / not wired into hot path. SOLO_STRATEGY env var literally constrains to ONE strategy.

**Gap:** Architectural. Bot's main loop is single-ticker single-timeframe single-strategy. To match spec needs:
- Ticker fanout layer (one tick → N tickers checked)
- Timeframe fanout layer (one timeframe-aligned candle close → N timeframes checked for the same ticker)
- Strategy fanout layer (one (ticker, timeframe, candle) → all strategies evaluate independently)
- Trade routing layer (multiple concurrent setups → which gets executed based on what rules)
- Resource budgeting (don't let one ticker's heavy compute block another's signal)

**Effort:** Large. This isn't a feature — it's a rewrite of the bot's main loop. Probably 2-4 weeks of focused work, more if it needs to ALSO be backwards-compatible with current single-stream P0 anchor.

**Status:** UNBUILT.

---

## Gap 5 — Cross-Timeframe Confirmation Logic

**Operator's spec (verbatim):**
> Like bot sees something on 5 flips to 15 to run the calculation and determine its actual liquidity yea that don't exist

**Implied:** This is NOT "MTF confluence filter." This is the bot actively reasoning about whether a signal on a lower timeframe has real depth behind it by inspecting a higher timeframe.

**What exists:** Nothing. MTF adapter exists for confluence scoring, but that's a passive boost/penalty — not the active "flip and reason" pattern operator described.

**Gap:** Complete. Spec needs more detail on:
- What "determine actual liquidity" means concretely — volume profile? Volume at price? Bid-ask depth from broker? Higher-TF volume vs current TF?
- What the decision logic does with the HTF read — confirm/deny/scale? Threshold?
- What HTFs get checked relative to which LTFs (5→15 mentioned, what about 1→5, 15→1h?)

**Effort:** Medium once spec clarified. Polygon OHLCV has multi-TF data already; the HTF data fetch path exists. The reasoning logic is new.

**Status:** UNBUILT. AWAITING OPERATOR DETAIL.

---

## Gap 6 — Multi-Timeframe Piece That's "Done But Questionable"

**Operator's spec (verbatim):**
> Multi timeframe boom none of those save one is done and then that one is questionable if it works

**Gap:** Operator says ONE multi-TF piece is built but questionable. Need to know which: AdaptiveTimeframeSelector? MultiTimeframeAdapter (the confluence scorer)? TimeFrameManager? Something else?

**Effort:** Audit + verify + fix or rebuild. Depends entirely on which piece operator means.

**Status:** AWAITING OPERATOR DETAIL.

---

## Operator note — more on the list

Operator's exact words:
> want me to keep going

There are more design gaps beyond the 6 named so far. This document is incomplete by design — operator will add as he remembers / surfaces them. Each new gap captured the same way:
- Operator's words verbatim (no AI paraphrasing)
- What exists in code (read and reported by Wolf)
- The gap
- Effort estimate (honest)
- Status (UNBUILT / AWAITING DETAIL / DEFERRED / PARTIAL)

---

## Why this document exists

Operator's exact words on the pattern:
> I've told you this countless times it gets written down and never implemented

This document is the antidote. It lives on disk at `/mnt/user-data/outputs/OPERATOR-DESIGN-GAPS.md` and on the VPS once shipped. Survives context compaction. Survives session boundaries. Survives Wolf instances coming and going.

The audit fix spec handles AI bug debt. This document handles AI design debt. Different categories. Both real.

---

## What this document does NOT do

- Does not design solutions. Design only happens with operator approval, one piece at a time.
- Does not prioritize. Operator decides order.
- Does not commit to effort estimates as binding — they're rough sizing for triage.
- Does not assume any of these will ship before Christmas. They might not. The point of writing them down is so they survive past Christmas, not so they get rushed.
- Does not replace the operator's own design memory. Operator knows what he designed. This file is a catch so AI doesn't keep dropping it.

---

## Honest disclosures

**WHAT I VERIFIED:**
- BrokerFactory + BrokerRegistry are real abstractions sitting in /brokers/
- All 14 broker adapters have zero "must be implemented" throws (filled-in skeletons)
- SessionRouter exists with partial handoffs wired
- Current bot main loop is single-ticker single-timeframe single-strategy in P0
- DIRECTION_FILTER, ENABLE_SHORTS env vars exist and constrain direction

**WHAT I ASSUMED:**
- That operator's six gaps named tonight are not exhaustive (operator said "want me to keep going")
- That operator's design memory is correct on what got specced and what didn't — Wolf has no independent record of pre-session design specs

**WHAT I DID NOT DO:**
- Audit each adapter against its real broker API (separate question, would need per-broker docs)
- Build solutions to any gap. Capture only.
- Solicit pieces 7-N from operator. He'll add when ready.
