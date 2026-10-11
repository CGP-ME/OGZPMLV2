# Deferred 2 — stale canonical config fixture references

Repaired the two existing cases that imported deleted config/trading.config.json. The canonical-read case now checks settings.json strategy/exit/profile owners and real source labels. The missing-sessionRouter case intercepts the actual settings file read. Explicit fake broker/dashboard credentials satisfy the test fixture, and the helper avoids loading production dotenv.

All 47 original cases remain present; no test.skip or retired live guards are introduced. The two changed cases pass in the working tree and in an isolated export of committed production source c3d380a6. The other 45 cases were excluded by the focused command, not declared passing. Existing broader stale API/env/backtest fixture work remains deferred item21.

```
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath test/config-loader-live-guard.test.js --testNamePattern 'uses canonical settings|resolver refuses' --roots test --cacheDirectory <isolated-cache>
```

Candidate export also preserves the committed canonical-test-env helper; its Jest ignore filter excludes node_modules but allows the isolated inbox source. Source identity is in source-receipt.json. Private logs preserve all exploratory runs. The earlier broad draft was rejected because it skipped still-valid checks; it is preserved privately and is not delivered. No production code, config, state, API calls, restart or resume. [Astra review](astra-review.json).
