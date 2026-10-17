# Configuration provenance continuation

Earlier override audit source: `547a375ac7b02cd68b9645a2a97872b8c3cd5182`. Final supplemental reader/bootstrap source: `8d1cf539aecda1de145bd8d7d7924ef74a53643a`. Two production corrections are delivered: `acbdef806c4d1b6efe20e28901b66082dc6ffa9a` removes unused runner PositionSizer initialization; `8d1cf539aecda1de145bd8d7d7924ef74a53643a` makes stock sizing honor the disabled evaluation-rule switches. Neither changes canonical values or descriptor definitions.

- [Actual cleanup and adversarial review](unused-sizing-initialization/README.md).
- [Frozen snapshots and profile-source ownership](mutable-config-review.md): no concrete active canonical mutation route found among the inspected callers.
- [Active constructor/entry/exit paths](active-overrides-review.md): disjoint merges, strategy-owned signals, frozen entry policy, and runtime identity distinguished from competing configuration values.
- [Descriptor duplicate result](descriptor-ownership/result.json): 1,392 unique descriptors, zero overwritten keys, including generated spreads. [Inspection fixture](descriptor-ownership/fixtures/inspect.cjs) evaluates registry declarations independently in helper isolation. Reproduce with exact `git show 547a375a:foundation/ConfigLoader.js` stored beside the fixture as ConfigLoader.cjs; pass both files with --fixture to scripts/test-isolated.py and execute inspect.cjs there.

Root review corrected an inaccurate description of profile overrides: the six named runtime paths have no competing root canonical declarations. It checked the reports against the actual source and did not promote absence in a bounded search into a whole-repo runtime guarantee.

The authoritative complete-key inventory and saved-field transport remain the [October 16 closure packet](../../2026-10-16/config-closure/README.md). Its preserved dormant-feature dispositions still apply. This continuation does not replace that inventory or claim a new full consumer census.

## Supplemental consumer and startup reconciliation

- [97 additional configured leaves](remaining-nonpipeline-readers.json): exact assigned owner-set equality against `8d1cf539`, arrays counted as single values. Covers the listed service, execution, journal, path, monitoring and diagnostic families. Reader references include actual downstream effects rather than just constructor forwarding. Source tracing is not runtime behavior certification.
- [Bootstrap/environment review](bootstrap-env-review.md): explicit role initialization, PM2 manifest and startup script, credential separation. No independent archived-key bypass found in this bounded surface. Existing six-role/184-key injection proof remains applicable because the canonical owners and Loader blobs have not changed since `a2d08728`; it was not needlessly rerun.
- [Disabled evaluation sizing correction](disabled-eval-sizing/receipt.json): actual method/profile probe and clean Mercury review. Master-off retains the requested 40 shares instead of silently cutting it to 5; enabled rules and configured share ceilings retain their behavior.

The final reader review corrected three false active-feature claims. `services.voice.audioEnabled/videoEnabled` reaches placeholder generators, not working voice/video output; `misc.tradeIntelligenceShadow` changes only the startup log label. Both remain explicit deferred intelligence/TRAI work under [the October 13 ruling](../../2026-10-13/completion-candidate/STATUS.md), not newly implemented capabilities.

`internals.journal.replayCandlesAfter` reaches an assignment but is never consumed. Replay writes immediately at close using prior candles. This is a real unresolved setting, not a passing trace. The operator has been asked whether to implement collecting the configured later candles or archive the unused setting. Reading older candles under that name would not repair it. No replay behavior has been changed while that intent is pending.

The fee/exposure edits belong to the other Astra's in-progress pipeline work. The earlier restoration question is withdrawn; this lane neither restores nor endorses those values.

## Acceptance boundary

Stop 1 end-to-end acceptance remains OPEN. The 1,392-field save/reload/unchanged-save proof is transport proof; the source reports add only the consumers they actually trace. No PM2 restart, env reload, resume, live UI save, or broker/paper walkthrough occurred. Source delivery is not runtime activation.

Inherited uncommitted changes in settings, Loader, execution modules, frontend, and Mercury are excluded, preserved, and not certified. In particular, local fee-model/numeric edits, maxTotalExposure, and validation/override changes are not part of this candidate or a shipped configuration-provenance claim. The current working tree must not be described as identical to the reviewed/pushed source.
