# Evidence

## Baseline and scope

- Branch: `codex/multi-asset-symbol-state`.
- Starting HEAD and origin: `3412c5c0fbac558c5bffaf63abb9ae62a2c9430b`.
- `run-empire-v2.js` was unchanged from L6's ruled `e54a8b8` code base before this edit.
- The pre-existing `.claude/settings.json` modification and unrelated untracked paths are excluded.

## Read list completed before edits

| File | Range read | Purpose | Touched |
|---|---:|---|---|
| `run-empire-v2.js` | `1-3663` | Entire L6 production file; startup, ruled hold/degraded paths, shutdown cleanup, signal handlers, entrypoint | Yes |
| `test/session-router-stock-symbol-config.test.js` | `1-272` | Entire existing runner source-inspection test and isolation conventions | No |
| `test/candle-history-runtime-timeframe.test.js` | `1-106` | Entire existing runner mock/import test pattern | No |
| `test/fixtures/explicit-runtime-env.js` | `1-33` | Entire explicit test-environment helper | No |
| `ogz-meta/Alignment/TREY-RULINGS.md` | `1-31` | Entire current ruling file, including 7/7a | No |
| `ogz-meta/ROUTING.md` | `1-24` | Entire output-routing law | No |
| `test/startup-exit-code.test.js` | New file | No pre-existing content to read | Yes |

No read contradicted L6.

## Diff receipt

The production diff is exactly three changed lines:

```diff
-      await this.shutdown();
+      await this.shutdown(1);
@@
-  async shutdown() {
+  async shutdown(exitCode = 0) {
@@
-    process.exit(0);
+    process.exit(exitCode);
```

The focused test adds three cases and no production fixture:

1. A forced backtest startup failure reaches the real `start()` catch and requests `shutdown(1)`.
2. The real `shutdown(1)` cleanup path forwards exit code 1 to `process.exit`.
3. The real no-argument `shutdown()` defaults to exit code 0, and source inspection confirms both SIGINT and SIGTERM handlers remain no-argument calls.

The complete byte-level diff is the patch of the containing atomic commit; `git show --format= --patch <containing-L6-SHA>` reproduces it.

## Acceptance receipt

Ruled receipt:

> Forced start failure in a throwaway clone → exit code 1; SIGTERM → 0.

Allowed pre-land commands:

```text
node --check run-empire-v2.js
node --check test/startup-exit-code.test.js
npx --no-install jest test/startup-exit-code.test.js --runInBand
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Snapshots:   0 total
```

`git diff --check -- run-empire-v2.js test/startup-exit-code.test.js` exited 0.

## Broader regression probe

Command:

```text
npx --no-install jest test/startup-exit-code.test.js test/candle-history-runtime-timeframe.test.js test/session-router-stock-symbol-config.test.js --runInBand
```

Result: 2 suites passed, 1 failed; 15 tests passed, 1 failed. The failure is the pre-existing assertion at `test/session-router-stock-symbol-config.test.js:69` requiring the source string `routerMode === 'static'`. That string is already absent from `run-empire-v2.js` at L6's HEAD base, and `git diff --exit-code HEAD -- test/session-router-stock-symbol-config.test.js` exited 0. L6 neither caused nor changes that separate stale expectation.

## Fourth Shape review

- L6 adds no throw and introduces no new invalid-state producer.
- The existing startup catch remains the single routing point for rejected startup work and synchronous startup exceptions.
- The change preserves cleanup and changes only the exit status requested after that caught failure.
- External operator signals still enter `shutdown()` without an argument and therefore retain exit code 0.
- SessionRouter hold and TrAI-degraded paths are untouched; neither is reclassified as a startup failure by this patch.

## Named absences and Ruling 7a

- No full bot boot or actual SIGTERM against the bot was run. Trey supplied no activation word, and any acceptance boot touching the Aug. 24 process, lock, or shared state is prohibited. The focused Jest suite invokes the real lifecycle methods with the process exit and SingletonLock boundary mocked.
- No provider/adversarial model run was invoked for this non-trading-path, three-line lifecycle correction. Therefore there are no raw provider tapes or tape hashes to commit. `REVIEW.md` records the applied mechanical attacks and caps the verdict accordingly.
- Independent cold-pull and any permitted post-land isolated boot remain pending; neither is represented as proven.
