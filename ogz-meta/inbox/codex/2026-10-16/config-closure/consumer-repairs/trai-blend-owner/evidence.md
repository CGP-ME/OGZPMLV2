# TRAI confidence-blend owners

Baseline: `9545c26ae3dd3eba46b705ea025c377f1c5727a3`. Candidate: `c4f0af43c55cd310385fb2983db230e9501ca77c`. Exact production blobs are recorded in `source-manifest.json`; `change.patch` contains the three-file change.

Three remaining hardcoded controls now live in `settings.json`: `trai.advisoryUnknownPatternThreshold=0.1`, `trai.advisoryUnknownPatternPenaltyMultiplier=0.9`, and `trai.autonomousTraiWeight=0.7`. The actual confidence blend reads these owners for each applicable decision. The original-confidence share is the complementary weight, `1 - autonomousTraiWeight`; this is weighting arithmetic, not a second configuration owner. Existing `trai.weight` retains its advisory/hybrid role. Current passive mode remains passive. The three descriptors say `next_trai_confidence_blend`; settings revision advances 12→13.

No trading gate, throw, fallback, constructor default, risk authority or mode selection was added. The autonomous complement may differ from the former literal 0.3 by floating-point rounding; over 121 original/TRAI confidence pairs, the maximum output difference was 1.1102230246251565e-16 (within Number.EPSILON).

`reproduce.py` reconstructs exact Git blobs and runs the real loader and actual AST-extracted blend method through the isolation launcher. `verification.txt` records the original mode outputs, default equivalence grid, real saved values read by the same existing subject, zero penalty with a reachable nonnegative-confidence input, zero/one threshold boundaries, zero/one autonomous shares, and unchanged passive/hybrid behavior. Baseline rejects the new save fields; candidate accepts them.

This proves configuration transport and the actual blend consumer. It does not activate TRAI, restart the bot, invoke a live provider, or claim execution-authority changes. No live state or credentials enter the fixture.
