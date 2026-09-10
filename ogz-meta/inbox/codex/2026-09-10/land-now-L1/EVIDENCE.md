# Evidence

## Baseline and scope

- Branch: `codex/multi-asset-symbol-state`.
- Starting HEAD and origin: `d2e4f3ff84314512259c3bf039087ce5ef772502`.
- `git diff e54a8b8dc40c4a5bf52984b823d1438c4de39f62..HEAD -- core/ModuleAutoLoader.js` produced no output: the L1 production source still matched the ruled code base.
- `test -e core/OptimizedTradingBrain.js` exited 1: the file is absent.
- `core/RiskManager.js`, `utils/discordNotifier.js`, and `utils/tradeLogger.js` exist.
- The pre-existing `.claude/settings.json` modification and unrelated untracked paths are excluded.

## Read list completed before edits

| File | Range read | Purpose | Touched |
|---|---:|---|---|
| `core/ModuleAutoLoader.js` | `1-383` | Entire L1 production file; loading, required lists, validation, exports, examples | Yes |
| `run-empire-v2.js` | `331-337` | Confirmed boot calls `loader.loadAll()` | No |
| `package.json` | `1-93` | Entire Jest/test configuration | No |
| `test/config-audit-no-env-mutation.test.js` | `1-255` | Entire existing temp-directory/Jest pattern reference | No |
| `ogz-meta/Alignment/TREY-RULINGS.md` | `1-31` | Entire current ruling file, including 7/7a | No |
| `ogz-meta/ROUTING.md` | `1-24` | Entire output-routing law | No |
| `test/module-auto-loader-required.test.js` | New file | No pre-existing content to read | Yes |

No read contradicted L1.

## Diff receipt

The production diff performs only these semantic changes:

```diff
-              throw new Error(`Required module failed to load: ${moduleName}`);
+              const requiredError = new Error(`Required module failed to load: ${moduleName}`);
+              requiredError.code = 'REQUIRED_MODULE_LOAD_FAILED';
+              requiredError.cause = err;
+              throw requiredError;
@@
+      if (err.code === 'REQUIRED_MODULE_LOAD_FAILED') {
+        throw err;
+      }
       return {};
@@
-      { name: 'core', required: ['OptimizedTradingBrain', 'RiskManager'] }
+      { name: 'core', required: ['RiskManager'] }
@@
-    console.log('\n✨ ALL MODULES LOADED!');
+    this.validateModules(Object.fromEntries(
+      loadConfig.map(({ name, required }) => [name, required])
+    ));
@@
+    const validated = [];
@@
+        } else {
+          validated.push(`${category}/${moduleName}`);
@@
-    console.log('✅ All required modules validated!');
+    console.log('\nALL REQUIRED MODULES VALIDATED:');
+    validated.forEach(moduleName => console.log(`  ${moduleName}`));
```

The new focused test adds three cases and no production fixture:

1. Successful loading prints `utils/discordNotifier`, `utils/tradeLogger`, and `core/RiskManager`, with neither `OptimizedTradingBrain` nor `ALL MODULES LOADED` in the output.
2. The test creates then removes `RiskManager.js`; `loadAll()` refuses with `Missing required modules: core/RiskManager`.
3. A fixture `RiskManager.js` throws during evaluation; `loadAll()` propagates `Required module failed to load: RiskManager`.

The complete byte-level diff is the patch of the containing atomic commit; `git show --format= --patch <containing-L1-SHA>` reproduces it.

## Acceptance receipt

Ruled receipt:

> Boot log prints the enumerated required list with each found; a test that removes a required file's name → boot refused naming it.

Command:

```text
node --check core/ModuleAutoLoader.js
node --check test/module-auto-loader-required.test.js
npx --no-install jest test/module-auto-loader-required.test.js --runInBand
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Snapshots:   0 total
```

`git diff --check -- core/ModuleAutoLoader.js test/module-auto-loader-required.test.js` exited 0.

## Fourth Shape producer enumeration

- Required-module propagation is triggered only after a `.js` file whose basename is present in the caller's `required` array throws during `require(fullPath)`.
- The existing inner required-module error is tagged and carries the original evaluation error as `cause`; the directory catch recognizes that tag and rethrows it.
- A required filename absent from disk never enters the inner throw path; the existing `validateModules()` missing-list producer names it after loading, and `loadAll()` now invokes that validation.
- A non-required module evaluation failure retains the prior log-and-continue behavior; changing that policy is outside L1.

## Named absences and Ruling 7a

- No full bot boot was run. Trey supplied no activation word, and running against the Aug. 24 process is prohibited. The focused test executes the real `loadAll()` method against throwaway directories under the OS temp directory without shared bot data.
- No provider/adversarial model run was invoked for this non-trading-path, two-file boot-honesty change. Therefore there are no raw provider tapes or tape hashes to commit. `REVIEW.md` records the applied mechanical attacks and caps the verdict accordingly.
- Independent cold-pull and any permitted post-land isolated boot remain pending; neither is represented as proven.
