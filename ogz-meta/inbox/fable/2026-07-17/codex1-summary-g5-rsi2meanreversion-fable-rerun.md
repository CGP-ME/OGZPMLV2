# Codex-1 G5 Fable Rerun: RSI2MeanReversion

Date: 2026-07-17
Mission: G5 rerun batch, post-Fable repair
Strategy: RSI2MeanReversion
Runtime changes: none

## Index Contract

- Mercury index timestamp: 2026-07-17T01:58:04.507Z
- Indexed SHA: b06d474a6612b896911474980f873e033edefddc
- Active chunks: 10163
- Dirty tracked at index: false

## Run Ledger

- Accepted rerun line: ogz-meta/cognition-history/mercury-runs/2026-07-17.jsonl:5
- Run id: 2026-07-17T02-09-27-475Z-417299b66b81
- Mercury termination: answer_given
- Mercury iterations: 23
- Fable review: ok, effective verdict needs_more_evidence
- Recheck: completed

## Verdict For Trey

coherent-with-flaws, with one Trey-ruling question.

The core RSI2 polarity is coherent: oversold maps to buy, optional overbought maps to sell. The open question is whether the SMA trend filter is an intended Connors-style constraint or an unauthorized addition to Trey's RSI2 seed.

## Supported Findings

Evidence:

- modules/RSI2MeanReversion.js:113-115 requires `price > trendSMA` and `rsi < rsiEntry` before a buy.
- modules/RSI2MeanReversion.js:118-120 requires `allowShorts`, `price < trendSMA`, and `rsi > rsiEntryOB` before a sell.
- config/trading.config.json:2002-2007 sets RSI period 2, buy entry 10, exit long 80, overbought entry 95, trend period 200, and shorts false.
- modules/RSI2MeanReversion.js:126-130 computes confidence from `confidenceBase + depth * confidenceDepthMultiplier`.
- config/trading.config.json:2013-2015 sets confidence base 0.5, depth multiplier 0.4, max 0.9.

Fable's recheck quoted ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md:147-148 and found those lines only enforce mechanical purity; they do not explicitly authorize or ban the SMA filter. That means the trend filter is a Trey ruling item, not a settled bug from the spec alone.

## Confidence Math

Using landed config:

- depth 0.0 -> confidence 0.5
- depth 0.5 -> confidence 0.7
- depth 1.0 -> confidence 0.9

The recheck found no hidden platform confidence dead-zone for the landed RSI2 confidence curve.

## Reliability

Usable two-tier evidence. Fable caught Mercury's unsupported "spec only demands RSI < 10" framing and forced a recheck against the actual spec text. Treat the SMA trend filter as a design ruling input.
