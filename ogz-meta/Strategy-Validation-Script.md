# OGZPrime Strategy Validation Script
## Independent Verification via TradingView PineScript

---

## PHASE 1: Research the Strategy Idea

Ask Claude (or Gemini) these three questions to find strategies worth coding:

1. "What are the calculation methods and indicator names that people don't know much about but can be coded on TradingView and are very successful at trend tracking?"

2. "What are the names of advanced reversal detection methods that people who develop technical analysis and indicators aren't aware of?"

3. "If you were a top-notch quant trader working at Two Sigma or Capula and were limited to using only TradingView, which indicators would you code for yourself?"

---

## PHASE 2: Plan Before Code

"Hello Claude, you're an expert coder and strategy engineer in the PineScript language. I'll give you an indicator idea shortly, and we'll turn this idea into an indicator together. However, when I give you the idea, don't start coding right away. First, I want you to create a very detailed and logical plan for turning this idea into an indicator. Additionally, in the plan you create for this indicator, I want you to outline the pros and cons and provide alternatives and suggestions. If you're ready, I'll share my idea with you, but first you'll create the plan — you won't start coding until I give my approval."

---

## PHASE 3: Debug

"There is an error in the code. I am receiving the following error messages. Fix these errors and make sure they don't appear elsewhere. Give me the full code:"

[paste error messages here]

---

## PHASE 4: Stress Test

"Great, we've coded the indicator, but I want to improve it further. What do you think are the weak and illogical aspects of this indicator/strategy? What kind of improvements would you suggest to address these shortcomings? What modifications and enhancements would you like to make to this indicator/strategy?"

---

## PHASE 5: Cross-Verification (THE GROUND TRUTH TEST)

Once the PineScript version is working on TradingView:

1. Run the same strategy on the same ticker and timeframe in both TradingView and the OGZPrime Node.js backtest
2. Export the individual trade entries and exits from both — not just the final P&L
3. Compare trade by trade: does trade #47 enter at the same price on the same candle in both systems?
4. If individual trades match across two completely independent codebases with two separate data sources, the strategy logic is confirmed real
5. If trades diverge, one implementation has a bug — find it before trusting any P&L number

Two independent implementations. Two data sources. Same trades. That's the only proof that can't be faked.
