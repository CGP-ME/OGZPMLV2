# Codex-1 Summary: Config Boundary Detector Mercury Follow-Up

Date: 2026-07-20

## Scope

This lane hardens the P1 config boundary detector only. It does not change runtime trading behavior, PM2, boot flow, CI, strategy logic, or config ownership semantics.

## Mercury Receipt

Mercury run ledgers:

- `ogz-meta/cognition-history/mercury-runs/2026-07-20.jsonl:1` - first attack found alias/destructure/mutation bypasses.
- `ogz-meta/cognition-history/mercury-runs/2026-07-20.jsonl:2` - follow-up found additional spread/stored-reference/computed-call bypasses.
- `ogz-meta/cognition-history/mercury-runs/2026-07-20.jsonl:3` - follow-up found process alias and Object alias bypasses.
- `ogz-meta/cognition-history/mercury-runs/2026-07-20.jsonl:4` - final attack reported the named bypass list covered.

Prompt scope: `scripts/check-config-boundary.js` and `test/config-boundary-detector.test.js`

Verdict: `found_break`

Tooling actually invoked in the first run:

| Tool | Calls | Result |
| --- | ---: | --- |
| `list_files` | 2 | succeeded |
| `open_file` | 6 | succeeded |
| Serena / tree-sitter caller graph | 0 | not invoked by the bridge run |

Important reliability note: Mercury was asked to use AST/tree-sitter/Serena/blast-radius where useful, but the run did not invoke Serena. The findings below were still valid because they came from file reads, but this does not prove the bridge is consistently using its strongest graph tools.

Final-run reliability note: the bridge printed a current-change blast radius over the two changed files, but explicit tool telemetry still listed only `open_file` and `search` calls. Treat the final verdict as useful source-level review, not proof that Serena/tree-sitter reference graph was fully exercised.

## Findings Fixed In Detector

| Finding | Detector fix | Test receipt |
| --- | --- | --- |
| `const env = process.env; env.BROKER` evaded direct `process.env.*` matching | Tracks process.env aliases and reports alias reads | `test/config-boundary-detector.test.js:69` |
| `env.LIVE_TRADING = ...` and `delete env.PROFILE` evaded mutation checks | Reports alias writes and deletes | `test/config-boundary-detector.test.js:69` |
| `const { BROKER } = process.env` evaded reads | Reports process.env destructuring outside config owner files | `test/config-boundary-detector.test.js:100` |
| `Object.defineProperty(process.env, ...)` evaded mutation checks | Reports `process_env_define_property` | `test/config-boundary-detector.test.js:100` |
| `Object.assign(env, ...)` evaded bulk mutation checks through env alias | Treats env aliases as process.env targets for bulk mutation | `test/config-boundary-detector.test.js:100` |
| `const CL = ConfigLoader; CL.setOverrides(...)` evaded ConfigLoader mutation checks | Tracks ConfigLoader object aliases | `test/config-boundary-detector.test.js:123` |
| `const TradingConfig = require('../foundation/ConfigLoader')` evaded mutation checks | Treats ConfigLoader require aliases as owner-object aliases | `test/config-boundary-detector.test.js:123` |
| `const { setOverrides: setConfigOverrides } = ConfigLoader; setConfigOverrides(...)` evaded mutation checks | Tracks destructured ConfigLoader mutators by local binding name | `test/config-boundary-detector.test.js:123` |
| `const { env } = process; env.BROKER` evaded process.env alias tracking | Tracks process aliases and env destructuring from process aliases | `test/config-boundary-detector.test.js:100` |
| `{ ...process.env }` or `{ ...env }` evaded read detection | Reports `process_env_spread` | `test/config-boundary-detector.test.js:100` |
| `const O = Object; O.assign(process.env, ...)` evaded bulk mutation checks | Tracks Object aliases for `assign` and `defineProperty` | `test/config-boundary-detector.test.js:100` |
| `const { defineProperty: dp } = Object; dp(process.env, ...)` evaded mutation checks | Tracks destructured Object mutation helpers | `test/config-boundary-detector.test.js:100` |
| `const mut = ConfigLoader.setOverrides; mut(...)` evaded ConfigLoader mutation checks | Tracks stored ConfigLoader mutator references | `test/config-boundary-detector.test.js:152` |
| `ConfigLoader[methodName](...)` evaded static-property checks | Reports dynamic computed ConfigLoader calls | `test/config-boundary-detector.test.js:152` |

Implementation evidence:

- Dynamic member property handling: `scripts/check-config-boundary.js:90`
- Process alias and env expression handling: `scripts/check-config-boundary.js:103`
- ConfigLoader mutation and computed-call handling: `scripts/check-config-boundary.js:161`
- Object alias bulk mutation handling: `scripts/check-config-boundary.js:194`
- Spread and destructured binding handling: `scripts/check-config-boundary.js:229`
- Two-pass alias collection before finding scan: `scripts/check-config-boundary.js:304`

## Current Catalogue

Full generated finding catalogue:

`ogz-meta/inbox/fable/2026-07-20/codex1-config-boundary-findings-2026-07-20.json`

Summary from the current tree:

| Total | process_env_read | silent_or_default_override |
| ---: | ---: | ---: |
| 198 | 99 | 99 |

First current findings include:

- `brokers/GeminiAdapter.js:22` reads `GEMINI_EXCHANGE_API_KEY` with `config.apiKey || process.env.GEMINI_EXCHANGE_API_KEY`
- `brokers/GeminiAdapter.js:23` reads `GEMINI_EXCHANGE_API_SECRET` with `config.apiSecret || process.env.GEMINI_EXCHANGE_API_SECRET`
- `brokers/GeminiAdapter.js:24` reads `GEMINI_SANDBOX` with a fallback chain
- `brokers/SchwabAdapter.js:25` reads `SCHWAB_CLIENT_ID` with a fallback chain
- `brokers/UpholdAdapter.js:22` reads `UPHOLD_CLIENT_ID` with a fallback chain

These are catalogued findings, not cleaned findings.

## Verification

Focused detector suite:

`npx jest test/config-boundary-detector.test.js --runInBand`

Result: PASS, 6 tests.

Syntax:

`node --check scripts/check-config-boundary.js`

Result: PASS.

Summarized current-tree scan:

`node -e "const {scanProject}=require('./scripts/check-config-boundary'); ..."`

Result: exits 1 by design because the detector found 198 current findings.

## Remaining Gaps

1. Wrapper helper flows and cross-file taint still need a real reference/caller graph pass. This is where Serena/tree-sitter/blast-radius should be mandatory instead of optional for the actual cleanup lanes.
2. The scan is exposed as `npm run scan:config-boundary`, but it is not wired into CI because the current repository is intentionally red until Trey rules and cleans the 198 findings.
3. The detector is an audit tool. It does not block runtime, change bot behavior, restart PM2, or add fail-close logic to the trading path.
