Mercury recheck target: two possible false positives from the first
TradingLoop ledger confidence attack.

Relevant code:
- core/TradingLoop.js:575-588 validates orchResult.confidence is 0..100 and
  sets local `confidence = orchResult.confidence / 100`.
- core/TradingLoop.js:1020-1021 uses that local `confidence` as
  orchestratorDecision.finalConfidence.
- core/StrategyOrchestrator.js:75-80 publicResult() returns each strategy result
  with `confidence: publicConfidence01(result.confidenceScore, ...)`.
- core/StrategyOrchestrator.js:831-835 stores internal result.confidence and
  confidenceScore.
- core/StrategyOrchestrator.js:1064 builds publicResults from publicResult().
- core/StrategyOrchestrator.js:1082,1115,1215 return publicResults as
  allResults.

First response claims to recheck:
1. Claim: winner finalConfidence can remain on 0..100 while competing
   adjustedConfidence is 0..1. Break this if true; otherwise mark false positive
   using the exact line where finalConfidence is divided.
2. Claim: a valid StrategyOrchestrator output may omit allResults[].confidence.
   Break this if true; otherwise mark false positive using the exact publicResult
   producer line that guarantees confidence.

Still attack the patch if another real path exists. Do not validate generally.
