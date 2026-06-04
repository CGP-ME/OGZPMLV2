Attack this corrected backtest tuning profile contract. Find a state where an unverified or ambient profile can still alter a sweep/P0 worker without being explicitly selected and stamped.

Changed files/ranges:

- tools/tuning-profiles.js:1-112
  - Runnable profiles should now be only current-eval and legacy-wide.
  - Removed reconstructed config-d-flat and balanced20-flat.
- tools/backtest-worker-env.js:151-210
  - buildBacktestWorkerEnv default profileName is DEFAULT_TUNING_PROFILE, not process.env.
  - sourceEnv should only contribute worker base system/runtime vars, not TUNING_PROFILE or trading config.
  - configEnv/instrumentEnv are allowlist-validated before merge.
- tools/parallel-backtest.js:663-757
  - CLI default profileName is DEFAULT_TUNING_PROFILE.
  - Only --profile / --profile= should choose a non-default profile.
- tools/matrix-sweep.js:720-790
  - CLI default profileName is DEFAULT_TUNING_PROFILE.
  - Only --profile / --profile= should choose a non-default profile.
- test/backtest-worker-env.test.js:16-145 and 178-185
  - Parent sourceEnv pollution includes TUNING_PROFILE=legacy-wide and BACKTEST_TUNING_PROFILE=missing-profile.
  - Default worker env must still stamp current-eval.
  - config-d-flat must fail as unknown.
  - Runnable profile list must be exactly current-eval and legacy-wide.

Questions:

1. Can parent process env, dotenv, configEnv, instrumentEnv, CLI parsing, or default argument behavior still select an unverified/reconstructed profile or silently alter profile-owned settings?
2. Can P0 still be moved by ambient TUNING_PROFILE/BACKTEST_TUNING_PROFILE after this change?
3. Did this fix close the underlying mechanism, or only the visible config-d-flat symptom?
4. What new failure mode did this introduce, if any?

Use exact file:line evidence. If you claim a bypass, give the smallest command or input object that triggers it.
