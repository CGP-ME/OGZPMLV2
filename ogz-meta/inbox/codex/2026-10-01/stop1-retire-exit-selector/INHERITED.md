# Inherited boundary

Runner contains unrelated uncommitted backtest logging/state-restoration work. This mission neither adopts nor removes those hunks. Historical EXIT_SYSTEM references in archived documents/tests are not active ownership and are not deleted in this lane.

The defect is a removed canonical configuration value still dereferenced by a dead constructor log. The fix is deleting that obsolete consumer, not introducing a default, throw, runtime stop or new configuration option. Actual exit modules and policy are untouched. No process restart or broad Stop1 completion is claimed.
