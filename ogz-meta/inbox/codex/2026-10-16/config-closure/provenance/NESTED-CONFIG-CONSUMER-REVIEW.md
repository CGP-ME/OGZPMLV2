# Nested configuration consumer review

Static review candidate: `8d0e3d3e937eebbc860b02f14a38dd8e648bd72e`.

## Additional concrete gap

`internals.performanceAnalysis.updateIntervalMs` is passed to the active
`PerformanceAnalyzer` at `run-empire-v2.js:725-728`. The analyzer reads it at
`core/PerformanceAnalyzer.js:83` only to print an initialization message.
There is no later scheduling, throttling, or state-update read of
`updateIntervalMs` in that class or current active source. This is an
additional loaded-but-behaviorally-inert configuration field, distinct from
the existing twelve ledger records. No interval behavior is proposed here.

## Checked without a new finding

- `OptimizedIndicators` merges settings and internals at
  `core/OptimizedIndicators.js:43-60`; its named optimized indicator controls
  are read by calculation methods, while its two-pole blocks are explicitly
  forwarded into `TwoPoleOscillator`.
- `TwoPoleOscillator` assigns named input fields at `:9-74` and reads them in
  filter, signal, history, and presentation paths. `confidenceBase` is still
  overwritten by all confidence-zone branches (`:251-263`), but that is the
  already-recorded `two-pole-confidence-base-overwrite-pending` gap.
- Active `RegimeDetector` is constructed from `ctx.regimeDetection` at
  `core/TradingLoop.js:2037`; its named configuration members are read by
  detection helpers and classification branches (`core/RegimeDetector.js:48-248`).
- `FeatureExtractor` obtains `featureExtraction` at each relevant helper and
  reads named normalization members (`core/FeatureExtractor.js:195-292`).
- `PerformanceAnalyzer` behaviorally reads its settings analysis members and
  internal persistence/verbosity members; the interval field above is the
  exception.
- `MarketRegimeDetector` has default/spread configuration, but no current
  active construction was found in the scoped production source. Its unused
  default members are therefore not reported as active canonical consumer
  gaps.

Limits: a spread or whole-object pass-through was treated as forwarding, not
as a missing read. This review does not prove external, inherited, reflective,
or serialized uses are absent. It used committed source only and performed no
runtime operation, PM2 interaction, network access, or production edit.
