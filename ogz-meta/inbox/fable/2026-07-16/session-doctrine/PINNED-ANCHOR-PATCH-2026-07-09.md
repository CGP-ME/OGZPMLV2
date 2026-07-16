# PINNED ANCHOR PATCH — tools/regression-test.js
Date: 2026-07-09 · Author: Fable · Status: SPEC WITH DROP-IN CODE
Target: /opt/ogzprime/OGZPMLV2/tools/regression-test.js (+ tuning/regression-baseline.json format)

## WHY (one paragraph, receipts)
The gate ships a one-flag rebaseline (`--baseline`) that records only `gitCommit`.
No config fingerprint, no data hash, no fee profile, no env pin, no reason, no approver.
This is the mechanism behind all ~10 anchor moves (18.6 → … → 8.3): any agent could
re-crown a new "truth" in one command, and no artifact could later prove what any
anchor actually measured. This patch makes the anchor file self-verifying and makes
rebaselining require a human-readable reason. Verification is boundary-level:
every check reduces to string-equals / hash-equals that Trey can read.

## RULE 1 — the baseline file must carry its own provenance
`saveBaseline()` gains these fields (drop-in, adapt variable names to current HEAD):

```js
const crypto = require('crypto');
const { load: loadConfig } = require('../foundation/ConfigLoader');

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function captureProvenance() {
  const snapshot = loadConfig({ silent: true });
  const dataFile = process.env.CANDLE_DATA_FILE
    || snapshot.config?.paths?.candleDataFile
    || null;
  if (!dataFile || !fs.existsSync(dataFile)) {
    console.error('ANCHOR ERROR: cannot resolve CANDLE_DATA_FILE — refusing to save an unpinned baseline.');
    process.exit(1);
  }
  return {
    configFingerprint: snapshot.fingerprint,
    dataFile,
    dataFileSha256: sha256File(dataFile),
    feeProfile: snapshot.config?.fees?.activeProfile
      ?? snapshot.config?.feeProfiles?.active ?? 'UNRESOLVED',
    pinnedEnv: PINNED_ENV_KEYS.reduce((m, k) => {
      m[k] = process.env[k] ?? '(unset)'; return m;
    }, {}),
  };
}

// Every behavioral key the P0 run depends on. Grow this list, never shrink it.
const PINNED_ENV_KEYS = [
  'TRADING_PAIR', 'CANDLE_TIMEFRAME', 'CANDLE_DATA_FILE', 'EXECUTION_MODE',
  'TUNING_PROFILE', 'SOLO_STRATEGY', 'DIRECTION_FILTER',
  'ENABLE_MTF_CONFLUENCE_BOOSTER', 'ENABLE_STRATEGY_MTF_CONFLUENCE',
  // + every ENABLE_* the backtest path reads — extend from Ground Zero Check 4 output
];
```

`saveBaseline()` body change:

```js
  const provenance = captureProvenance();
  const reasonIdx = process.argv.indexOf('--reason');
  const reason = reasonIdx > -1 ? process.argv[reasonIdx + 1] : null;
  if (!reason || reason.trim().length < 10) {
    console.error('ANCHOR ERROR: --baseline requires --reason "<why the anchor is moving>" (10+ chars).');
    console.error('An anchor move without a reason is a regression being laundered.');
    process.exit(1);
  }
  const baseline = {
    savedAt: new Date().toISOString(),
    gitCommit: getGitCommit(),
    reason,                       // human words, permanent record
    provenance,                   // fingerprint + data hash + fees + env pins
    results: parsed,
    rawOutputTail: output.slice(-3000),
  };
```

## RULE 2 — `--check` verifies provenance BEFORE comparing money
Insert at the top of `checkAgainstBaseline()` (before any dollar comparison):

```js
  const now = captureProvenance();
  const then = baseline.provenance;
  if (!then) {
    console.error('GATE FAIL: baseline has no provenance block (pre-patch anchor). ');
    console.error('This anchor cannot prove what it measured. Re-mint with --baseline --reason.');
    process.exit(1);
  }
  const mismatches = [];
  if (now.configFingerprint !== then.configFingerprint)
    mismatches.push(`configFingerprint ${then.configFingerprint} -> ${now.configFingerprint}`);
  if (now.dataFileSha256 !== then.dataFileSha256)
    mismatches.push(`dataFileSha256 differs (data file changed or swapped)`);
  if (now.feeProfile !== then.feeProfile)
    mismatches.push(`feeProfile ${then.feeProfile} -> ${now.feeProfile}`);
  for (const k of Object.keys(then.pinnedEnv)) {
    if ((process.env[k] ?? '(unset)') !== then.pinnedEnv[k])
      mismatches.push(`env ${k}: baseline=${then.pinnedEnv[k]} now=${process.env[k] ?? '(unset)'}`);
  }
  if (mismatches.length) {
    console.error('GATE FAIL — ENVIRONMENT DIVERGES FROM ANCHOR (money comparison meaningless):');
    mismatches.forEach(m => console.error('  ' + m));
    process.exit(1);
  }
```

Note the semantics: fingerprint mismatch is expected when config *legitimately*
changed — that is precisely the moment a human must decide REVERT vs RE-MINT,
instead of the number silently being compared across two different universes.
The gate now forces that decision into the open.

## RULE 3 — anchor moves are single-purpose commits
Not code — process law, enforceable by inspection:
`tuning/regression-baseline.json` may only change in a commit that touches
NOTHING else, whose message starts `ANCHOR:` and contains the --reason text.
Any diff that touches the baseline alongside other files = reject at review.
(Ratchet-able later as a pre-commit grep; law stands immediately.)

## RULE 4 — grandfather clause
The current baseline (8338.14…) has no provenance and per RULE 2 will hard-fail
the first --check after this patch. That is CORRECT behavior: the first act
after landing this patch is a deliberate, reasoned re-mint:
  node tools/regression-test.js --baseline --reason "First provenance-pinned anchor. Prior anchor 8338.14 inherited from unpinned era; PF 0.64 acknowledged as loss-making determinism reference under <fee profile>, not an edge claim."
Trey runs or explicitly approves this command. Nobody else.

## ACCEPTANCE (boundary-verifiable, no code reading required)
1. `node tools/regression-test.js --baseline` WITHOUT --reason → exits nonzero. 
2. `cat tuning/regression-baseline.json` shows: reason, configFingerprint,
   dataFileSha256, feeProfile, pinnedEnv — readable by eye.
3. `--check` with one pinned env var deliberately flipped → GATE FAIL naming
   that exact key, before any dollar number prints.
4. `--check` in the clean env → runs and compares as before.

## OUT OF SCOPE (do not let this lane grow)
No changes to backtest logic, strategies, exits, ConfigLoader internals,
or the expected number itself. This patch changes only what an anchor IS.
