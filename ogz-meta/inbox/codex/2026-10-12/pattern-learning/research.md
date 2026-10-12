# Pattern learning research and conservative starting values

Prepared for Trey on 2026-10-12. Public institutional research supports chronological evaluation, cost-aware decisions and careful control of overfitting. It does not establish profitable parameter values for OGZPrime. The numerical starting choices below are engineering hypotheses to evaluate, not disclosed hedge-fund settings or proven trading improvements.

## What the published work actually does

| Primary research | Published numbers and method | What transfers to this bot |
| --- | --- | --- |
| [Oxford–Man DeepLOB](https://arxiv.org/pdf/1808.03668) | Five London Stock Exchange stocks, more than 134 million observations; six months training, three validation, three testing; inputs of 100 order-book states. | Keep training and evaluation chronological. Order-book observations are not completed trades; its 100-state input does not justify a 100-trade threshold. Its illustrative trading simulation uses mid-prices and gross profits before fees. |
| [Gu, Kelly and Xiu, Empirical Asset Pricing via Machine Learning](https://images.aqr.com/-/media/AQR/Documents/Journal-Articles/Empirical-Asset-Pricing-in-Machine-Learning.pdf) | Monthly equity predictions; 18 years training, 12 validation, 30 out-of-sample testing; annual refits. | Match the learning horizon to the prediction target. Monthly equity results do not supply intraday crypto tuning values. |
| [Man AHL on machine learning](https://www.man.com/insights/the-rise-of-machine-learning) | Combines weak signals and applies machine learning across trading horizons. | A learned pattern score is one contribution to a decision, not proof that a named chart pattern guarantees a win. |
| [AQR, Machine Learning and the Implementable Efficient Frontier](https://www.aqr.com/insights/research/working-paper/machine-learning-and-the-implementable-efficient-frontier) | Evaluates machine learning with implementation costs. | Measure results after fees, spread and slippage; predictive accuracy alone is insufficient. |
| [Bailey and López de Prado, The Deflated Sharpe Ratio](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf) | Corrects performance interpretation for selection bias and non-normal returns. | Record attempted variants, including losers. Repeatedly selecting against a holdout consumes its independence. |

## Why two or three outcomes are weak evidence

These are calculated 95% Wilson intervals using the [NIST method](https://itl.nist.gov/div898/handbook/prc/section2/prc241.htm), under an independent, stationary binary-outcome assumption. They describe uncertainty about win probability, not expected profit. Overlapping trades and changing market conditions weaken that assumption further.

| Wins and trials | Observed win rate | Approximate interval |
| --- | --- | --- |
| 2 of 2 | 100% | 34.2–100% |
| 12 of 20 | 60% | 38.7–78.1% |
| 30 of 50 | 60% | 46.2–72.4% |
| 60 of 100 | 60% | 50.2–69.1% |
| 240 of 400 | 60% | 55.1–64.7% |

These sample counts are evidence diagnostics, not new trade-blocking requirements. A 60% win rate can still lose money if losses and costs exceed gains.

## Existing controls and their intended behavior

Source locations before this change: `core/EnhancedPatternRecognition.js:482–585,625–674`, `core/UnifiedPatternMemory.js:300–354,380–529`, `config/settings.json:112–126,1282–1291` and `foundation/ConfigLoader.js:2742–2769`.

| Older control | Intended effect in its helper | Relevant limitation |
| --- | --- | --- |
| historySimilarityThreshold = 0.9 | Admit sufficiently similar historical matches. | The unused helper passes a signature where the active memory expects features plus trading scope. Similarity is not win probability. |
| decayRate = 0.01 per hour | Exponentially reduce older observations' weight. | Half-life is only 2.89 days. The active engine already has a separate, canonical 30-day half-life. |
| minimumDecayMultiplier = 0.1 | Keep at least 10% of older aggregate evidence's influence in certain older helper branches. | No research reviewed establishes this permanent floor as appropriate. |
| fastPathMinTradeHistory = 2 | Admit an exact-match history to the old shortcut after two qualifying observations. | Two outcomes cannot establish reliability. This is not the active engine's existing sample setting. |
| fastPathRecentResultCount = 3 | Measure recent wins over the last three stored results. | Very sensitive to individual outcomes; the active writer previously retained only 20 results. |
| fastPathHistoricalWeight = 0.7 | Give historical win rate 70% of the old shortcut score. | Separate weight controls can fail to sum to one. |
| fastPathRecentWeight = 0.3 | Give recent win rate 30% of the old shortcut score. | With three observations, changing one win to a loss changes this component by ten percentage points. |
| fastPathNewPatternConfidence = 0.1 | Return a fixed confidence for an unknown pattern in the shortcut. | It is not learned evidence. The active memory already reports an unknown match as null. |

The production path uses UnifiedPatternMemory, with exact matching first and scoped DTW similarity matching second. The older helpers were not selected by production callers in the audited tree. Their presence is not authorization to activate or delete all eight controls. Exit, stop, break-even and trailing numbers remain outside this work.

## Conservative numerical starting point

Keep a **30-day half-life**, use a **100-outcome recent window**, and limit the secondary component to **10%**, leaving **90%** for the main historical score. The implementation section below records the exact meaning of these components; the labels alone are insufficient to define an algorithm.

The old hourly decay gives relative weights of 78.66% after one day, 18.64% after seven days and 0.0747% after 30 days before any floor. A 30-day half-life gives 97.72%, 85.07% and 50% respectively. Multiplying all observation weights by the same factor does not move a normalized win rate toward neutral: this is relative age weighting, not automatic confidence disappearance while a pattern is idle.

For an unweighted 100-outcome component with 10% influence, replacing one loss with one win changes that component by 0.1 percentage points. This is not a bound on the whole score: outcomes also enter the historical component, and smaller available samples have greater sensitivity. A 100-outcome window means up to 100 completed recorded outcomes per scoped pattern, not waiting for 100 before trading. Previously discarded observations cannot be reconstructed by increasing retention.

These are deliberately restrained starting choices, not an optimized grid. Other candidate half-lives (3, 7, 14 days), windows (20, 50), blends (80/20, 70/30), similarity thresholds and minimum-sample rules are not activated by this document.

## Exact implementation and activation

The active engine now retains up to `patternMemory.recentResultCount = 100` outcomes for each scoped pattern. Its existing 30-day half-life weights those retained outcomes. The final learned score is:

`0.90 × age-weighted win rate + 0.10 × unweighted win rate`

Both components use the same retained window. This slightly smooths the age-weighted score; it is not an additional recency bonus or a lifetime-history blend. `patternMemory.unweightedResultWeight = 0.1` owns the smoothing share. The other share is its arithmetic complement, so customers cannot accidentally set two contributions that sum to something other than one. The three older fast-path controls are replaced by these two canonical fields and their UI descriptors; the dormant shortcut also reads the canonical values, but is not activated. Its pre-existing lifetime/recent shortcut calculation remains distinct from the normal engine.

Outcome retention increases from 20 to 100, potentially increasing stored outcome data by up to fivefold for mature patterns. Existing smaller banks grow through real outcomes; missing old observations are not invented. A lower configured window also applies when reading a larger saved bank. Both settings take effect on the next pattern-memory initialization; saving them does not change the existing frozen instance.

Exact matching, scoped DTW matching, unknown-pattern behavior, and the existing minimum-sample and promotion/quarantine thresholds remain in place. Promotion/quarantine classifications consume the changed score, so a classification can change even though its thresholds did not. No new trade gate, throw site, fallback or default was added. Numeric fields participate in the existing configuration validation. The remaining five older controls still need their intended-behavior decision; this does not declare all Stop 1 work finished.

Actual constructor and outcome-writer checks verified retention, calculated confidence, exact/DTW reads, scope isolation, old smaller banks, boundary weights and canonical UI descriptors. These are behavior checks, not trading profitability evidence. No PM2 restart, broker action, or live settings save was performed. The pushed source will require separately authorized runtime activation. Review and delivery details are recorded in CHANGELOG.md and the adjacent receipts.
