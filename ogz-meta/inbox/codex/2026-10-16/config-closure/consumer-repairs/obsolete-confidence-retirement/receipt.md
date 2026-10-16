# Obsolete confidence retirement packet

- Base: `89affa44bda62f93158c1a125429adec6d34073b`.
- Candidate source tree: `5850803d2a76bae76d11c2ed65de14178d4b9bdf`.
- Candidate source fixtures: `source-baseline/` and `source-candidate/`; executable fixture copies are under `fixtures/baseline/` and `fixtures/candidate/`.
- Prior canonical values preserved in this receipt/source baseline: `regimeMinConfidence=0.3`, `confluenceMinScore=0.3`, `twoPole.confidenceBase=40`.
- Candidate settings revision: 13 → 14.
- Candidate changed exactly `config/settings.json`, `core/StrategyOrchestrator.js`, and `core/TwoPoleOscillator.js`; Loader and OptimizedIndicators remain unchanged; the canonical values, Orchestrator and TwoPole sources are reconstructed exactly by reproduce.py.

## Native isolated verification

Command:

```text
python3 scripts/test-isolated.py --fixture .../fixtures/probe.cjs --fixture .../fixtures/baseline/config/settings.json --fixture .../fixtures/baseline/core/TwoPoleOscillator.js --fixture .../fixtures/baseline/core/StrategyOrchestrator.js --fixture .../fixtures/candidate/config/settings.json --fixture .../fixtures/candidate/core/TwoPoleOscillator.js --fixture .../fixtures/candidate/core/StrategyOrchestrator.js -- sh -c 'node .../fixtures/probe.cjs baseline && node .../fixtures/probe.cjs candidate'
```

The probe loads the actual pinned `TwoPoleOscillator` and actual pinned `StrategyOrchestrator` source. Only external orchestrator collaborators are stubbed through Node's module loader. Actual `StrategyOrchestrator.evaluate` runs with a fixture strategy and its real `minStrategyConfidence` decision path.

Observed baseline: revision 13; zone outputs `[85,85,65,65,50,50,35]`; `confidenceBaseOwnProperty=true`; orchestrator result `HOLD`, direction `long`, confidence `50`, min threshold `0.35`.

Observed candidate: revision 14; identical zone outputs `[85,85,65,65,50,50,35]`; `confidenceBaseOwnProperty=false`; identical orchestrator result `HOLD`, direction `long`, confidence `50`, min threshold `0.35`.

The probe therefore proves actual zone scoring is unchanged while the obsolete field is absent, and the active orchestrator confidence decision remains unchanged. It does not claim runtime activation; root must review/rebase and deliver the atomic production commit.

Limits: the orchestrator collaborator stub exercises confidence selection only; it is not complete sizing or execution acceptance. The original published zone values are now asserted in the fixture for both variants, not merely logged. No regime/confluence boosts or other strategies’ confidenceBase settings were removed.
