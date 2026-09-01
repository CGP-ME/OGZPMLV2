# Evidence

## Subject and scope

- Branch: `codex/multi-asset-symbol-state`
- Current predecessor: `acf530d36dd7bba3d261786d48b131d1d61a7654`
- Preserved 22-path Part C diff SHA-256:
  `b916704a69813d8a56bf072a0e465cf4d0cbbb77fd058fc37d1f807c56ee9e28`
- The diff was transferred byte-for-byte from the held clone onto a clean clone
  at the current remote tip; the original held clone remains unchanged.

## Runtime-reader stop check

Command:

```sh
rg -n 'RISK_MANAGER_BYPASS|ACCOUNT_DRAWDOWN_BYPASS|MAX_DRAWDOWN|MAX_DAILY_LOSS|MAX_WEEKLY_LOSS|MAX_MONTHLY_LOSS' \
  core foundation brokers modules src server run-empire-v2.js
```

Result: no exact reader for any ruled cap. The sole output was
`foundation/ConfigLoader.js:3054` for the distinct key
`SMS_MAX_DAILY_LOSSES`; it is not `MAX_DAILY_LOSS`. The mandated stop condition
did not occur. The wider repository search found historical records, the Part C
ruling/audit, and regression assertions; those are not runtime readers.

## Focused verification

```sh
bash -n backtest.sh deploy/create-package.sh
node --check ecosystem.config.js
node --check scripts/generate-live-proof.js
node --check ogz-meta/gates/eval-live-posture-gate.js
```

Result: `syntax:PASS`.

```sh
NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules \
  /opt/ogzprime/OGZPMLV2/node_modules/.bin/jest \
  test/ecosystem-eval-profile.test.js \
  test/eval-live-posture-gate.test.js --runInBand
```

Result: 2 suites passed; 45 tests passed; 0 failed.

Reconciliation requested by run 2:

```sh
NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules \
  /opt/ogzprime/OGZPMLV2/node_modules/.bin/jest \
  test/config-loader-live-guard.test.js \
  test/ecosystem-eval-profile.test.js --runInBand
```

Result: 2 suites passed; 57 tests passed; 0 failed. Mercury's isolated snapshot
had exited 127 because that snapshot lacked Jest; the trusted VPS dependency
path above provides the actual focused result.

Final pre-commit verification ran those suites together with
`test/eval-live-posture-gate.test.js`: 3 suites passed; 92 tests passed; 0
failed. Tape verification checked all 145 manifest rows against secured source
hashes and committed redacted hashes with 0 errors; redaction was idempotent.

The ruled caps were deleted, not rebuilt. Their account-loss replacement is the
already existing TTP venue-guard architecture: `config/trading.config.json:73-80`
owns `dailyLossDollars` and `maxLossThresholdEquity`;
`foundation/ConfigLoader.js:931-938` resolves them into
`evalRules.ttp.accountLimits`; and `core/EvalRuleEngine.js:384-488` validates
current equity and blocks entries at the max-loss or daily-pause thresholds.
The audit names the material limitation: these account guards block entries but
do not flatten. No claim is made that legacy `maxDrawdown`, `maxDailyLoss`,
`maxWeeklyLoss`, or `maxMonthlyLoss` values still exist or must be sourced.

## Live adversarial review

Run `2026-09-01T00-27-38-179Z-cd86d2d97986` used the visible broad frame
`Mercury, break my fix.`, explicit reviewers `mercury,fable,kimi`, agentic
tools/history/adversarial mode, 60 maximum iterations, and 7750 maximum tokens.
Ledger: `ogz-meta/cognition-history/mercury-runs/2026-09-01.jsonl:1`.
Raw directory:
`ogz-meta/cognition-history/mercury-runs/raw/2026-09-01/2026-09-01t00-23-38-609z-1633068-3075d41186fa/`.

Applied identities: Mercury `mercury-2`; Fable verdict model
`claude-fable-5` with auxiliary `claude-haiku-4-5-20251001`; Kimi `kimi-k3`.
All identities matched and no transition or identity conflict occurred.

The panel receipt was `UNVERIFIED`: Mercury initially alleged a secret leak,
Fable required baseline attribution, Mercury rechecked and withdrew the causal
claim, and Kimi adjudicated `pass`. The aggregate remained disagreement because
the Mercury seat retained its initial `found_break` label and failed evidence
checks. This run is preserved as an investigated, non-authoritative review; it
is not represented as PASS.

Run `2026-09-01T00-33-18-687Z-07b059d339fe` supplied the host-attested Part C
evidence. Mercury reported pass, Fable requested the test/source recheck above,
and Kimi reported pass; aggregate authority remained `UNVERIFIED` pending that
mechanical recheck. The recheck is now resolved without code change: both
requested suites pass, and the ruled replacement source is the existing TTP
account-limit chain cited above, not rebuilt legacy caps.

Run `2026-09-01T00-36-51-037Z-2f07f6d877c1` raised a new allegation about the
proof generator reporting PAPER after a synthetic `.env` file was written.
Mechanical investigation rejects it as a Part C break. The model command was
`echo 'LIVE_TRADING=true' > .env && node scripts/generate-live-proof.js`, while
the script intentionally loads the separate local-only `.env.gates` sidecar at
`scripts/generate-live-proof.js:272-277`. The clean isolated snapshot had no
`.env.gates`, so PAPER is expected. `scripts/generate-live-proof.js:241,296`
reads `process.env.LIVE_TRADING` directly; dotenv does not override an existing
process value. The design is documented at
`ogz-meta/specs/phase1-env-gates-investigation.md:17-72`, and `.gitignore:82`
excludes the sidecar. Most importantly, the Part C diff in this file removes
only the false `MAX_DRAWDOWN` and “Circuit breakers: ARMED” proof claims; it does
not alter dotenv loading or LIVE/PAPER mode selection.

Run `2026-09-01T00-40-46-704Z-d109e148e101` selected only Fable and Kimi as a
focused reconciliation attempt. It is preserved as failed evidence, not relied
on: its evidence descriptor requested lines 1-240 from a 137-line file, and the
current reviewer architecture could not assign review authority without the
Mercury seat. The receipt remained `UNVERIFIED`.

Run `2026-09-01T00-43-14-871Z-909a2a351f5f` returned to the complete
Mercury/Fable/Kimi panel. Mercury and Fable alleged that the focused Jest suite
had not run in the isolated model snapshot and that duplicate `STATE_FILE`
properties in `test/ecosystem-eval-profile.test.js` masked an expectation; Kimi
reported pass and the aggregate remained `UNVERIFIED`.

Mechanical investigation resolves the Part C question without changing the
test. The trusted VPS runs the exact suite successfully: 1 suite and 10 tests
pass. Both `STATE_FILE` properties predate Part C (`git show HEAD` and
`git blame HEAD -L 185,205`), while the Part C hunk only removes the two ruled
bypass expectations and adds the six-cap omission regression. The active PM2
value is `data/state-paper.json` at `ecosystem.config.js:95`. The duplicate is a
genuine inherited test smell, now named in `INHERITED.md`; it is not introduced
by Part C and is not silently repaired outside the mission.

Mechanical disposition: the alleged `moonshot-test-key` fixture and all other
secret-scan findings are outside the Part C diff and pre-exist it. The focused
Part C tests pass. The repository-wide dashboard-token suite remains a named
inherited baseline failure, not a Part C regression. All five receipts remain
`UNVERIFIED`; no provider PASS or cold-pull clearance is claimed.

## Ruling 7a tapes

The exact ledger line and every raw file for all five Part C review runs are
copied under this packet after `redactSensitiveText`, with original-on-box and
redacted-as-committed hashes recorded in `TAPE-HASHES.tsv`. Non-placeholder
`apiKeySource` values receive a second field-safe `[REDACTED]` scrub. The hash
manifest is mechanically checked against both the secured sources and packet
copies, and every committed tape is checked for redaction idempotence. No source
ledger or secured raw receipt directory is staged directly.

## Named absences and limitations

- No PM2 action, broker call/order, paper/live activation, or runtime mutation
  was performed.
- No live venue-guard breach was induced.
- The read-only audit proves code wiring, not operational broker behavior.
- Account-limit breaches block entries but do not flatten; stale account and
  calendar inputs quarantine-and-continue; successful cutoff completion lacks
  one dedicated structured trace. These gaps are findings, not silently fixed.
- All five review receipts remained `UNVERIFIED`; no PASS is claimed. Run 4 is
  additionally a failed focused attempt because its evidence range exceeded the
  supplied file and its selected panel could not establish authority.
- No Part D, Part E, selectable-panel implementation, or fusion-correction work
  is included.
