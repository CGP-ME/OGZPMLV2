# Inherited / not silently adopted

- C009: legacy missing entry contracts/policy provenance. No current-config backfill permitted.
- C010: explicit ATR tuning overlay remains a competing owner.
- C011: contract partial flag and tpMode do not govern global partial/tier planner. July history explicitly retained both; current intent must not be guessed from agent-authored flags.
- StopLossChecker's separate BreakEvenManager uses original-risk activation and FeeModel. Managed breakEvenStop is not an all-break-even switch.
- trail.roundNumberProximity and roundNumberTighten have no ECM consumer; not exposed as working controls. They are read by core/exit/DynamicTrailingStop.js, but no production constructor/import was located in the tracked caller search. The negative claim is limited to the reached ECM path, not deletion authority or proof that no external caller exists.
- Prior dirty ECM patch recalculates ATR with an added period and changes exit math; excluded from this entry-freeze connection.
- Existing throws/default adoption, indicator source fallback, legacy checkers and global style policies remain named, not endorsed or newly introduced.
- Actual StateManager load preserves policy values/hash but does not re-freeze the parsed object. Existing save/load fixture confirms this; mutation-proof restoration is not claimed. Do not add a policy gate or reconstruct entry values from current settings to address it.
- Arbitrary externally corrupted exitLogic.trail is not comprehensively schema-validated by the current file loader. Old ECM constructor also read that raw object. Supported UI publication is typed/allowlisted; no production shutdown guard was added to silence this review allegation.
