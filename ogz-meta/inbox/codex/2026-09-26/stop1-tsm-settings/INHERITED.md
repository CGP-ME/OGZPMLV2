# Inherited

Main contains unaccepted prior implementation. Do not stage whole files. Specifically exclude TSM static validateConfig and atrPeriod hint until an actual needed consumer is established. Current candidate does not need either.

Existing readConfig throws/coercion and config switches are unchanged; UI boundary restricts the selected input domain before publication. Existing dynamic trailing activation/clamps/modifiers and shared current ATR are separate exit-policy behavior, not rewritten here. Historical ATR-contract tuning overlay C010 and restored missing entry provenance C009 remain open. No assertion that all Stop 1 overrides or UI controls are complete.

Concrete competing exit owner from this replay: new TSM contracts say partialExit.enabled=false and tpMode=off, but the existing ProfitExitPlanner selects global beScaleOut when the contract partial flag is false (core/ProfitExitPlanner.js:153-157), and independently uses global tieredExit (:230 onward). The real coordinator produced 54 be_scaleout and 34 profit_tier_1 intents. This is not a simulated fill and not a new change, but it is also not silently cleared as intended product behavior. Keep it in the common findings list for the configuration ownership cut before final UI acceptance; no new gate follows from it.
