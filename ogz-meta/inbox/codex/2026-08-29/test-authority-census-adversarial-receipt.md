# Test-authority census adversarial receipt

Date: 2026-08-29

Reviewed artifact: `ogz-meta/inbox/amp/2026-08-28/test-authority-census.md`

Artifact SHA-256: `92354f320034dc4b8e53157840e112ce494913aa59aa9652e45388638aabca87`

Artifact bytes: 49,959

Review checkout: `codex/multi-asset-symbol-state` at `ce132ea22dfffa3a21811cb4c70c761aaafc7a27`

Provider raw content is not copied here. It remains mode `0600` below the ignored
`ogz-meta/cognition-history/mercury-runs/raw/` tree. This tracked receipt records
the immutable paths and hashes needed to authenticate that secured evidence.

## Live runs

The durable local ledger is `ogz-meta/cognition-history/mercury-runs/2026-08-28.jsonl`.

| Ledger | Run ID | Lines | Excerpt SHA-256 | Mercury | Fable | Kimi | Termination | Ledger verdict |
|---|---|---:|---|---|---|---|---|---|
| `:4` | `2026-08-28T21-48-01-263Z-34e51e4c7920` | 1-150 | `2e762880182d4b4173f9a69f730219b66a5a609c012a4bcd72bbe02dbcc15be6` | `mercury-2` | `claude-fable-5` | `kimi-k3` | `answer_given`, 8 iterations | `no_break_found` |
| `:5` | `2026-08-28T21-50-22-334Z-a1b4f29ba645` | 151-262 | `fae478fd631449f1a9012b9b4a03126a1ad0fa74769b5889825c84f0eff55e8f` | `mercury-2` | `claude-fable-5` | `kimi-k3` | `answer_given`, 7 iterations | `cannot_verify` |

Both challenger receipts report authenticated first-party Claude Code via
`claude.ai`, requested Fable and applied `claude-fable-5`. They also record
`claude-haiku-4-5-20251001` as auxiliary telemetry. Fable and Kimi each report
tools available `[]`, calls `[]`, total calls `0`, and mechanically opened files
`[]`. Mercury alone used repository tools. Each Fable challenge caused one
bounded Mercury recheck; Kimi ran only because the successful challenge remained
unresolved before adjudication.

## Secured raw receipt index

### Lines 1-150

Raw directory:
`ogz-meta/cognition-history/mercury-runs/raw/2026-08-28/2026-08-28t21-46-13-362z-1257730-a1c44a526ae5/`

- Directory receipt set: 11 files; SHA-256 of the sorted `sha256  basename\n`
  manifest: `d8f2c12c410692ff2661c3a12ae29aa4e6a7b169984134decc322b83c2805bd9`.
- Fable output: `fable_challenger-1.raw`, SHA-256
  `ad53703de8af578100ce37621cc3c06504f47012cb495784fa6449b6b0bb3acf`,
  21,099 bytes, mode `0600`.
- Fable stderr: `fable_challenger-stderr-1.raw`, SHA-256
  `e705bbf8982385da2b1a03725921d0a6c6730bbaadd22c8f9168522573d067e0`,
  157 bytes, mode `0600`.
- Kimi output: `kimi_tie_breaker-1.raw`, SHA-256
  `a3d4362bf10897db6df6a400c0a0affc681ae61b3577af8d8ff441f53e961a4f`,
  2,488 bytes, mode `0600`.
- Mercury output is the eight `mercury-1.raw` through `mercury-8.raw` files in
  that directory; their individual hashes remain in ledger `:4`, `stages.mercury.provider_attempts`.

### Lines 151-262

Raw directory:
`ogz-meta/cognition-history/mercury-runs/raw/2026-08-28/2026-08-28t21-48-30-181z-1258072-ae3caa4db99e/`

- Directory receipt set: 10 files; sorted-manifest SHA-256
  `58704e50d8c953017af1b1cf7236223da4e9e6fb9f34187bfcb1d387e7428230`.
- Fable output: `fable_challenger-1.raw`, SHA-256
  `0426769ac4adaa8491c9d28e9e243c95be04b89f82c56b5e21afe27e69543238`,
  21,662 bytes, mode `0600`.
- Fable stderr: `fable_challenger-stderr-1.raw`, SHA-256
  `e705bbf8982385da2b1a03725921d0a6c6730bbaadd22c8f9168522573d067e0`,
  157 bytes, mode `0600`.
- Kimi output: `kimi_tie_breaker-1.raw`, SHA-256
  `d922ea8bb26b387fb2d505f5356ad5fd7b7a4509648c4eb17241df87b5d2df28`,
  5,906 bytes, mode `0600`.
- Mercury output is the seven `mercury-1.raw` through `mercury-7.raw` files in
  that directory; their individual hashes remain in ledger `:5`.

## Allegations and repo adjudication

1. **Mercury alleged that `test/backtest-recorder-scope.test.js` falsely claimed
   real-runner/trade-path authority.** Fable challenged Mercury's substituted
   definition. Mechanical inspection showed `BacktestRunner` is required and
   instantiated at lines 298-299, while `BacktestRecorder.recordTrade` is called
   at line 71 and mutates validated trade/P&L state in
   `core/BacktestRecorder.js:168-185`. Disposition: **rejected**; the row follows
   the census definition, which includes executable state code.
2. **Mercury alleged the two runner rows in the second excerpt only read source
   text.** The bounded recheck then cited a nonexistent
   `test/pattern-stock-symbol-config.test.js`, and Kimi held the dispute open.
   Mechanical `rg` proved `test/session-router-stock-symbol-config.test.js:16`
   requires `run-empire-v2`, constructs objects with the real runner prototype,
   and exercises SessionRouter. `test/single-broker-subscription-symbols.test.js:24`
   requires the runner; lines 101, 182, 233, 282, 335 and 378 construct its real
   prototype; lines 357-370 call its `executeTrade`; lines 373-390 call
   `subscribeToMarketData`. The alleged `pattern-stock-symbol-config` file does
   not exist. Disposition: **rejected**.
3. **Mercury issued blanket clearances for rows it had not opened.** Fable and
   Kimi correctly marked those statements unsupported. Disposition: blanket
   model claims were not used as authority; only cited rows were mechanically
   adjudicated.

The five census rows marked real-runner `Y` were mechanically located at artifact
lines 50, 52, 57, 176 and 180. No model allegation survived repo adjudication.
No census bytes were changed and no correction commit was manufactured.

## Final conclusion and limitations

Final repo conclusion: **no supported test-authority census correction**.
The second ledger verdict remains `cannot_verify` as an honest record of model
non-convergence; the separate repo adjudication resolves the material claims
without rewriting that historical receipt.

Limitations: the review did not independently execute all 195 test files or prove
every row end-to-end. It attacked the supplied excerpts, investigated every
material model allegation, and mechanically checked the five highest-authority
runner rows. Raw provider content remains ignored and local; this receipt preserves
only paths, hashes, identities, isolation facts, and adjudication.
