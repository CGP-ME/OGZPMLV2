# Stop 1: live boot and configuration receipts

Observed November 12, 2026, approximately 01:52–01:59 UTC. Source checkout:
`codex/archive-legacy-env`, HEAD `dca649cf3905bbacffd479c2b8eba9fdc36c9075`, with
20 inherited modified tracked files. **Stop 1 is not complete.** Configuration
ownership has direct evidence; successful trading operation is blocked.

| Item | Actual observation | Receipt |
| --- | --- | --- |
| Expected processes | Bot PID 2631857, dashboard/relay 2631783, checkout 2631804, supervisor 2631887; all online, expected scripts and repository cwd | `processes.json` |
| Actual launch environment | All four match canonical PATH/HOME/locale/NODE_ENV/PM2_HOME. Bot PROFILE is paper. No DOTENV_CONFIG_PATH or BACKTEST_RUN_DESCRIPTOR_PATH override and no inherited application credential keys | `processes.json` |
| Running bot's settings | Authenticated get_settings reply: 1,397 fields; all values match freshly resolved current configuration; every exposed field has a config source | `live-settings-readback.json`, `loaded-versus-disk.json` |
| Exact configuration identity | Loaded settings revision 22 and internals revision 12; both content hashes and the active bot fingerprint match current disk resolution | `loaded-versus-disk.json` |
| Other process roles | Current dashboard, supervisor and checkout configuration reconstructed separately in isolation, with explicit source for every leaf and no loader errors/warnings | `resolved-dashboard.json`, `resolved-supervisor.json`, `resolved-checkout.json` |
| Dashboard transport | GET /api/health returned 200 and no-store; authenticated WebSocket relayed a fresh bot settings response | `endpoints.json`, `live-settings-readback.json` |
| Supervisor transport | Existing recovery socket returned 200, request null and error null | `endpoints.json` |
| Checkout transport | Existing port returned HTTP 404 for GET /; proves a responder, not a payment workflow | `endpoints.json` |
| Trading acceptance | **Blocked:** persisted RECOVERY_REQUIRED and freezeNewEntries=true after NVDA candle HTTP 504 | `session-state.json` |

The live bot configuration fingerprint is
`cf76f995616858e887d6515f30b2d762449dbc92b652096666ee016d3004e85e`.
Settings hash:
`b9d3f18f690848649114d913ad8c528fc5cded1838f313293c7391934410e672`.
Internals hash:
`5fa508822fcf3272bfb51f3e563fd182a8e9312a3d9e7d9b0e7dd2b72f92f8a1`.

## What owns the values

The current bot resolution has 2,723 leaves: 2,694 canonical config values,
21 named credential fields, seven derived mode values, and the one launch-profile
selector. The seven derived values are documented in `resolved-bot.json`; they
follow the selected paper mode rather than adding another trading config file.
`ecosystem.config.js:59-63` obtains the paper selector and launch environment
from `config/internals.json`. `foundation/ConfigLoader.js:2222-2269` reads the
two canonical JSON files, separates bootstrap selectors from private dotenv
credentials, and does not merge arbitrary dotenv trading variables.

The other role resolutions contain 146 dashboard, 43 supervisor and nine checkout
leaves. Credentials are presence markers in these offline receipts. Their actual
values were never copied into isolation. Role resolution and OS launch evidence
do not prove every service's in-memory configuration: only the bot exposes the
live settings readback used here. Fingerprints mask secret bytes and therefore
cannot prove exact loaded credential values.

## Proven runtime blocker and intended repair boundary

The saved transition failed at `2026-11-10T14:31:43.459Z` with:
`[Alpaca] Failed to get candles for NVDA: Request failed with status code 504`.
The live dashboard state still reports the transition pause reason, paper mode,
and zero scoped positions. Its complete scope identity is not a claim that the
transition/recovery store is ready. The newest file under `logs/decisions/` was
last modified November 10 at 14:25:56 UTC; no newer decision file was observed.

Current source explains the propagation:

1. `brokers/AlpacaAdapter.js:670-696` makes the candle request and converts its
   failure into an exception.
2. `run-empire-v2.js:1693-1701` awaits each symbol/timeframe during REST hydration;
   a failed request escapes that whole hydration operation.
3. `core/SessionRouter.js:1663,1686-1688` awaits hydration inside the transition
   and routes that exception into `_enterFailedSafe`.
4. `core/SessionRouter.js:1480-1508,1532-1546` records the failed session and
   applies session-wide pause behavior. This is wider than the failed symbol.

The proposed next production lane is bounded to this failure chain: preserve a
named candle-unavailable result, route the affected symbol through the existing
quarantine/alert/position-handling policy, and let eligible healthy symbols
continue after valid session reconciliation. It must not return fabricated or
empty-success data, blindly retry/restart, remove account/position reconciliation,
or erase the recovery journal. Trace all affected candle consumers before
choosing the exact interface change. Independent review and actual paper-runtime
receipts are required before calling that repair complete. No such repair or
runtime recovery was performed in this audit.

## Limits that remain visible

The four processes started November 10 at approximately 02:55 UTC. They have not
loaded later source commits merely because those commits were pushed. Current
config files and several execution modules remain inherited dirty work; this
audit neither approves those diffs nor includes them in its documentation commit.

The existing boundary scanner printed FAIL with 55 matches across 45 unique
source lines. All matching expressions were already present in the November 9
scan. Several are ordinary boolean conditions or duplicate matches. Real fallback
sites also remain, including broker timeframe substitution and pattern/web-context
defaults. They are not 55 proven environment overrides and are not cleared by
this audit. `boundary-comparison.json` and the full `config-boundary.log` preserve
them for consumer-level disposition. No settings were moved on the scanner's say-so.

No production code, configuration, credentials, persisted state or PM2 process
was changed. No Jest, paid panel, RAG rebuild, trade or payment was run. Native
configuration observations used the mandatory isolated helper. Live operations
were read-only process/state inspection, GET requests, and the existing
authenticated get_settings interface. Private raw receipts remain in this folder.
