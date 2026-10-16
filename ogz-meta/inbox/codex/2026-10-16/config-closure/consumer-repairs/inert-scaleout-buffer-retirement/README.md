# Inert break-even scale-out fee-buffer retirement

Pinned source: `cbf7200cd729830348d08c1a55b41e4ef9995f9d`.

`profitManagement.beScaleOut.feeBufferPercent` exists in 17 exit contracts at `0.05`, is normalized by `PolicyBuilder`, and is exposed by the editable/override surfaces. The actual `ProfitExitPlanner` reads only `enabled`, `triggerType`, `fixedPercentTrigger`, and `scaleOutFraction` for this path. It does not read the fee-buffer field. The cited exit research evaluates partial-profit and break-even economics but does not define this field or a scale-out minimum-profit gate.

The candidate removes only the 17 declarations, the normalizer leaf, the matching editable descriptor and override-regex leaf, and test fixtures/assertions that solely exercise that removed field. `trail.feeBufferPercent` is deliberately unchanged: its 17 canonical values remain `0.65`, and live code separately reads it for trailing/break-even handling.

`fixtures/verify-retirement.cjs` runs copied pinned baseline/candidate `PolicyBuilder` and `ProfitExitPlanner` inside the repository isolation launcher. It proves matching scale-out output after removal of the inert field, while asserting the policy change is otherwise limited to that member.

Exact delivery candidate: `25fc977055304a4dd2813ce5d915cefb61e9a3ce`. Settings revision 14→15. No runtime activation. `source-manifest.json` records every exercised source blob; `reproduce.py` reconstructs them and runs the fixture inside helper isolation. The retirement removes the inert field and therefore changes newly created policy hashes; the planner decision comparison excludes only this expected hash difference. Existing frozen policies are not rewritten.

The three existing focused suites are not green: baseline and candidate have the same 14 failing test names and 47 passing tests. See focused-comparison.json; fixture credentials/retired APIs and pre-existing volatility-fixture drift remain separate. The targeted native policy/planner proof passes. No full-suite pass is claimed.
