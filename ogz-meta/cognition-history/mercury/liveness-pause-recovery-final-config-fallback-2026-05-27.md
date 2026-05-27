Mercury targeted recheck - dataFeed config fallback finding.

The prior final recheck flagged a possible blocker: CandleProcessor throws if dataFeed config is missing. Attack whether that is a real runtime blocker after inspecting:
- foundation/ConfigLoader.js:532-590
- core/CandleProcessor.js:78-84
- test/symbol-routing.test.js fallback test around the local context omitting dataFeed config

Question:
Can CandleProcessor start without ctx.config.dataFeed by falling back to the canonical ConfigLoader dataFeed defaults, or is there still a real path where missing local dataFeed config crashes normal runtime/test construction?

Return only:
- REAL BLOCKER with exact file:line and failure sequence, or
- FALSE POSITIVE with exact file:line proof.
