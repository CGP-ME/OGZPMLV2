# codex1: G5 RSI logic attack post-reindex

## Index contract

- Active Mercury index timestamp: `2026-07-14T21:29:42.731Z`
- Active Mercury indexed SHA: `a476afbed787c79a210f427a8509afa11123f9a0`
- HEAD at dispatch: `a476afbed787c79a210f427a8509afa11123f9a0`
- Stale-index result: `PASS` for this run. The attack did not trail HEAD.
- Dirty tracked files at reindex: `run-empire-v2.js`, `test/aggregate-source-backfill.test.js`. These are outside the RSI strategy scope and were not touched by this report.

## Verdict

`coherent-with-flaws`

RSI is directionally coherent as a simple mean-reversion extreme detector: oversold emits buy and overbought emits sell. The flaws are real but do not support Mercury's maximal `incoherent` verdict:

1. raw RSI threshold alone does not prove exhaustion/reversal;
2. the strategy's real tradeable threshold is hidden by the exit-contract confidence gate;
3. MTF annotations/adjustments occur after the base confidence gate, so they do not rescue near-threshold RSI votes.

## Two-tier result

RSI attempt 1 was incomplete: Mercury Pass 1 and Fable review ran, but the recheck was killed by the tool timeout. It is not used as a verdict source.

RSI attempt 2 completed:

- Mercury Pass 1: `incoherent`
- Fable Review: `found_break` in Mercury's reasoning, with required recheck
- Mercury Recheck 1: answered the confidence-gate question
- Mercury Pass 1 telemetry: `tool_calls=9`, `succeeded=9`, `failed=0`
- Mercury Recheck telemetry: `tool_calls=6`, `succeeded=6`, `failed=0`
- run ledger: `ogz-meta/cognition-history/mercury-runs/2026-07-14.jsonl:8`

## Tier disagreement

Fable correctly challenged Mercury's first-pass confidence math. Mercury claimed only RSI `<= 15` could pass. That was wrong.

Mercury's recheck then made a second mistake: it solved from the fallback oversold value `25`, while the landed config has `oversoldLevel: 30`.

Current repo arithmetic using landed config:

- `config/trading.config.json:1672-1676` sets `oversoldLevel: 30` and `overboughtLevel: 70`.
- `core/StrategyOrchestrator.js:1520-1525` uses `confidence = 0.5 + (strength * 0.4)`.
- `config/trading.config.json:1283-1291` sets RSI `minConfidence: 0.6`.

Oversold side:

```text
confidence >= 0.6
0.5 + strength * 0.4 >= 0.6
strength >= 0.25
(30 - rsi) / 15 >= 0.25
rsi <= 26.25
```

So the real oversold entry threshold is `RSI <= 26.25`, not `RSI <= 15` and not Mercury recheck's fallback-derived `RSI <= 21.25`.

Symmetric overbought side:

```text
(rsi - 70) / 15 >= 0.25
rsi >= 73.75
```

## Findings

### 1. Thesis -> trigger: raw RSI threshold is not enough evidence of exhaustion

Evidence:

- `core/StrategyOrchestrator.js:1509-1510` reads only `ctx.indicators.rsi`.
- `core/StrategyOrchestrator.js:1512-1514` reads threshold config.
- `core/StrategyOrchestrator.js:1520-1536` emits buy/sell from raw threshold polarity.

Counterexample:

- A strong bearish trend pushes RSI below 30 while price keeps making lower lows.
- RSI emits buy before any price-action reversal, divergence, volatility exhaustion, wick rejection, or structural turn is proven.

That is a valid critique for a mean-reversion strategy, but it is a flaw in confirmation quality, not a side inversion.

### 2. Trigger -> direction: polarity is coherent but regime confirmation is incomplete

Evidence:

- `core/StrategyOrchestrator.js:1520-1527` maps oversold to `buy`.
- `core/StrategyOrchestrator.js:1529-1536` maps overbought to `sell`.

The polarity is correct for RSI mean reversion. The missing piece is confirmation that the extreme is exhausted rather than trending continuation.

### 3. Confidence math: the hidden effective threshold is the real issue

Evidence:

- `core/StrategyOrchestrator.js:1521-1524` computes oversold strength and confidence.
- `core/StrategyOrchestrator.js:2014-2040` rejects votes below the contract min-confidence gate.
- `core/StrategyOrchestrator.js:550-555` resolves `minConfidence` from the exit contract and validates it.

The strategy reads `oversoldLevel: 30`, but the first tradable oversold value is `26.25` because confidence must reach `0.6`. Near-threshold RSI values 26.26 through 29.99 become visible rejected candidates, not tradeable votes.

This is not necessarily wrong for an "extreme" strategy, but the effective threshold must be documented as actual behavior because it materially changes what "oversoldLevel: 30" means.

### 4. Exit fit: bounded static target is plausible for mean reversion

Evidence:

- `config/trading.config.json:1283-1291` sets RSI stop `-0.8%`, target `1%`, trailing `0.6%`, activation `0.8%`, max hold `240`, min confidence `0.6`.
- `ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md:20-33` says mean-reversion strategies get targets and strategy-owned exit geometry.

Mercury called this a trend-runner style exit. Fable correctly rejected that. A bounded target can fit a mean-reversion capture. The remaining question is whether `-0.8/+1.0` is tuned to RSI's actual MFE/MAE, which belongs to the fee-real delta ledger rather than this logic-only G5 attack.

### 5. Interaction: MTF applies after the base contract gate

Evidence:

- `config/trading.config.json:1772-1778` enables RSI MTF settings.
- `core/StrategyOrchestrator.js:1127-1155` applies 4h trend conflict penalty and 1h RSI alignment boost.
- `core/StrategyOrchestrator.js:2008-2040` applies the contract confidence gate before candidate construction.
- `core/StrategyOrchestrator.js:2093` applies `_applyStrategyMtfConfluence(candidate, ctx)` after candidate construction.

This means MTF is not a pre-entry proof that rescues a weak near-threshold RSI signal. A raw RSI vote at `28` is rejected by the base confidence gate before the later MTF boost path can run.

## Reliability

- Mercury index was fresh for HEAD.
- Attempt 2 had zero tool failures in both Mercury Pass 1 and Recheck 1.
- Fable correctly challenged Mercury's unsupported/inconsistent claims.
- Final report overrides Mercury where local current-code arithmetic proves the recheck used fallback `25` instead of landed config `30`.

## Artifacts

- Prompt: `ogz-meta/inbox/fable/2026-07-14/g5-rsi-logic-attack-prompt-post-reindex.md`
- Incomplete first post-reindex output: `ogz-meta/inbox/fable/2026-07-14/g5-rsi-bridge-output-post-reindex.txt`
- Completed post-reindex output: `ogz-meta/inbox/fable/2026-07-14/g5-rsi-bridge-output-post-reindex-r2.txt`
- Superseded stale-index prompt/output/report also exist under the same date folder and should not be used for final G5 scoring.

## No code changes

This mission is report-only. No strategy, config, runtime, or test files were changed.
