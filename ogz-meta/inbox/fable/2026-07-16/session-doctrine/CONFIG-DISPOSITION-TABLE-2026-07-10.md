# CONFIG ONE-FILE AMENDMENT + KEY DISPOSITION TABLE
Date: 2026-07-10 · Author: Fable · Status: DRAFT FOR TREY'S LINE-BY-LINE REVIEW
Prior art: builds ON ogz-meta/specs/config-consolidation-migration-gates-2026-06-08.md
(Active migration gate — canonical-owner rule, slice discipline, blocking test matrix
all REMAIN IN FORCE; this document amends scope, it does not replace the gate spec.)

## SOURCE RELIABILITY NOTE — READ FIRST
The deepsearch map (envshit.md) is LEADS, not truth. Two claims already failed
verification against the actual tree:
- Table 5 claimed ENABLE_* strategy toggles are dead keys → FALSE.
  foundation/ConfigLoader.js contains 40 envBool('ENABLE_...') reads. Verified.
- Table 5 claimed DIRECTION_FILTER has no ConfigLoader path → FALSE.
  ConfigLoader.js:2998 `directionFilter: env('DIRECTION_FILTER','both')`,
  consumed by core/TradingLoop.js entry risk gates (L420-528). Verified.
CONSEQUENCE: every row below is marked V (verified against file by Fable),
L (deepsearch lead, unverified), or G (ghost-environ observed value).
Codex may act on V rows. L rows require verification in the slice that touches them.
NOTHING is deleted on an L row. Table 5 of envshit.md is QUARANTINED.

## AMENDMENT TO THE JUNE-8 GATE SPEC (Trey's 2026-07-10 ruling)
The June spec's completion bar stops at "one canonical OWNER." Trey's ruling
extends it to one canonical FILE:

A1. config/trading.config.json is the ONLY behavioral configuration file.
    Launch profiles (production, paper, backtest-all, backtest-masr,
    backtest-rsi) become named blocks under a `launchProfiles` section.
    PROFILE=<name> is the only selector env key.
A2. .env holds credentials + machine identity ONLY. The resolver HARD-FAILS
    boot naming the key if any behavioral key is found in env outside the
    whitelist (fourth shape: the resolver already owns validation — no new
    guard sites anywhere else).
A3. Whitelist ceiling 10, each entry carries a written reason in the file header.
    Seed whitelist: PROFILE, DOTENV_CONFIG_PATH (until A5 completes, then dies),
    NODE_ENV, STRATEGY_DIAG, BACKTEST_VERBOSE, NOWICK_DEBUG, SMS_DEBUG.
A4. Files leaving the load path (archived to ogz-meta/archive/, never deleted):
    profiles/*.env (5), .env.gates, config/features.json (after F-slice below),
    ogz-meta/config_2.js (tooling-only; RAG scripts get their own .env),
    ogz-meta/ledger/ConfigLoader.js (V: zero consumers — archive as snapshot).
A5. ecosystem.config.js env blocks carry PROFILE + credentials path only.
A6. Schema enforcement: trading.config.schema.json is currently NOT enforced at
    runtime (V: $schema pointer only). The migration's final slice wires
    schema validation into ConfigLoader load, or the schema file is archived.
    An unenforced schema is a lie with a file extension. Trey picks: enforce or archive.

## ACCEPTANCE (Trey runs these himself; all must hold)
  ls profiles/                      -> No such file or directory
  grep -cE "ENABLE_|TTP_|MIN_TRADE|DIRECTION|TUNING" .env   -> 0
  node <resolver standalone check>  -> boots, prints fingerprint + source map
                                       where every behavioral path source =
                                       config/trading.config.json
  find . -name "*config*" -not -path "*/node_modules/*" -not -path "*/archive/*"
                                    -> the short list (loader, one json, PM2, tooling)

===============================================================================
## DISPOSITION TABLE
Verbs: MOVE (into trading.config.json) · KEEP (credential, stays in .env) ·
WHITELIST (env-allowed diagnostic, reason required) · WIRE (intended control,
broken/bypassed wiring — fix the wiring, then MOVE) · UNKNOWN-INTENT (Trey rules)
DELETE requires supersession evidence or Trey's explicit ruling. None auto-delete.

### FAMILY 1 — Mode & identity (the double-read nest) [June-spec slice 1]
| key | status | disposition | notes |
|---|---|---|---|
| EXECUTION_MODE | V | MOVE + kill bypass readers | ConfigLoader L260 owns; bypass reads in FeatureFlagManager:103, PatternMemoryBank, UnifiedPatternMemory (V via deepsearch T3 + ghost). Bypasses re-pointed to resolved config in same slice. |
| BACKTEST_MODE | V | MOVE + kill 6 bypass readers | Same nest. NOTE: backtest/OptimizedBacktestEngine.js:3 and backtest-api.js:3 MUTATE process.env pre-init (L) — that mutation is a producer bug; fix in this slice, fourth shape. |
| TRADING_MODE / TEST_MODE / ENABLE_LIVE_TRADING / PAPER_TRADING / LIVE_TRADING / CONFIRM_LIVE_TRADING | V(partial) | MOVE, collapse to ONE mode enum | Six overlapping mode keys is the hidden-state multiplier in miniature. Target: config.mode = live|paper|backtest + confirmLive boolean. FeatureFlagManager's parallel mode detection (L103-107) dies, consumes resolved config. |
| TRADING_TIER | L | MOVE + resolve dual-table hazard | TierFeatureFlags AND FeatureFlagManager:138-164 carry duplicate tier tables (L). One table lives in trading.config.json; both modules consume it. |
| TRADING_PAIR / BROKER | V(G) | MOVE | MultiAssetManager reads raw (L:40,47). Route through resolver. |
| SESSION_ROUTER_ENABLED / CRYPTO_SYMBOLS | V | MOVE | Router restoration is Trey's standing ruling; selector lives in the one file per launch profile block. |

### FAMILY 2 — Strategy roster & confluence [slice 2]
| key | status | disposition | notes |
|---|---|---|---|
| ENABLE_RSI, ENABLE_MASR, ENABLE_EMA, ENABLE_LIQSWEEP, ENABLE_SMS, ENABLE_TPO, ENABLE_MTF, ENABLE_ORB, ENABLE_CANDLEPATTERN, ENABLE_BREAKRETEST, ENABLE_DONCHIAN, ENABLE_NOWICK, ENABLE_PROPSAFE_EMA, ENABLE_EMA_TREND_RETEST, ENABLE_RSI2_MR, ENABLE_TSMOM (roster) | V | MOVE | All resolver-owned (40 envBool sites verified). Become `strategies.roster.<Name>.enabled` per launch profile. NOT placebo — deepsearch T5 wrong. |
| ENABLE_SHORTS + DIRECTION_FILTER | V | MOVE as one decision | Both live (ConfigLoader L2998 + TradingLoop gates). Historical note: memory of "ENABLE_SHORTS dead code" is STALE vs current tree — verify interplay with directionFilter in the slice, don't assume either direction. |
| SOLO_STRATEGY | V | MOVE (test knob → config path strategies.soloFilter) | Orchestrator raw read (V, earlier audit L583). Was already specced pre-consolidation; folds into this slice instead. |
| ENABLE_MTF_CONFLUENCE_BOOSTER / ENABLE_STRATEGY_MTF_CONFLUENCE | V | MOVE + Trey rules the DEFAULT | Both default TRUE in resolver (V, GZ audit) — the 66051c8 poison. Migration must surface the default question to Trey, not carry it silently. |
| ENABLE_ARBITRAGE / ENABLE_HEDGING / ENABLE_LEARNING / ENABLE_REGIME / ENABLE_DYNAMIC_SIZING / ENABLE_DPS | V(partial) | MOVE; ENABLE_DPS verify reader first | ENABLE_DPS read in run-empire (L). |

### FAMILY 3 — Risk & TTP guards [slice 3 — trade path: Mercury + P0 per June spec]
| key | status | disposition | notes |
|---|---|---|---|
| MIN_TRADE_CONFIDENCE | V(G) | MOVE | Confidence floor ownership already partially in trading.config.json per CHANGELOG:283 — finish it. |
| MAX_WEEKLY_LOSS / MAX_MONTHLY_LOSS / MAX_DRAWDOWN / daily limits | V(GZ) | MOVE | RiskManagerConfig demands explicit sources (V, T6) — good; sources become the one file. |
| TTP_* (all ~25 keys, guards/consistency/liquidation/volume-cap/earnings) | V(G) | MOVE | Become `venueGuards.ttp.*` per launch profile. Date-anchored values (START_OF_DAY_*, EARNINGS_STATUS_JSON) flagged as OPERATIONAL state — Trey rules: do these belong in config at all, or in a runtime state file the bot refreshes? UNKNOWN-INTENT pending that ruling. |
| RISK_MANAGER_BYPASS / ACCOUNT_DRAWDOWN_BYPASS | L | UNKNOWN-INTENT | Deepsearch says ACCOUNT_DRAWDOWN_BYPASS unread (T5 — quarantined table). If truly unread: WIRE or DELETE is Trey's call — it smells like an intended operator control. |

### FAMILY 4 — Exits & tuning [slice 4 — trade path: Mercury + P0]
| key | status | disposition | notes |
|---|---|---|---|
| TRAIL_ATR_MULTIPLIER | V(L485 + bypass) | WIRE + MOVE | Resolver owns it AND DynamicTrailingStop reads it raw — an EXIT parameter with a bypass. Kill the bypass, single source. |
| TUNING_PROFILE / BACKTEST_TUNING_PROFILE | V | MOVE (selector only) | Profile definitions already live in trading.config.json (V, T4). Selector becomes part of PROFILE block. |
| BACKTEST_CONFIG_OVERRIDES_JSON | V | KEEP AS-IS (env) + WHITELIST | BacktestConfigOverrides is allowlisted, mode-gated, throws outside backtest (V, earlier audit). It is the sweep tool's injection path — leave functioning, whitelist with reason. |
| ATR_FILTER_ENABLED / ATR_MIN_PERCENT | V(CHANGELOG:505) | MOVE | Already mapped into profile ownership per CHANGELOG — confirm and fold. |

### FAMILY 5 — Credentials & endpoints [slice 5]
| key | status | disposition | notes |
|---|---|---|---|
| ALPACA_*/APCA_*, GEMINI_*, SCHWAB_*, UPHOLD_*, ELEVENLABS/DID/INCEPTION/OPENAI keys, STRIPE_SECRET_KEY, POLYGON_API_KEY, SENTRY_DSN, TELEGRAM_*, DISCORD_*, MONGO_*, EMBED_*, GITHUB_TOKEN | V/L mix | KEEP (.env credentials) | The apiKeyEnv indirection in trai_llm_config (V, T6) is the model: config names the env key, secret never enters the json. Extend pattern to all brokers. Broker adapters' raw fallback reads (L) re-pointed in slice. |
| WS_URL, API_PORT, MOVER_HTTP_PORT, DATA_DIR, BACKTEST_OUTPUT_DIR, SUPERVISOR_* | V(G)/L | KEEP (machine identity) or MOVE — Trey rules per key | Ports/paths straddle the line. Default proposal: KEEP in .env as machine identity; MOVE anything that changes trading behavior. |
| ALPACA_MODE | V(G) | MOVE | Behavioral (paper vs live venue), not a credential. |

### FAMILY 6 — Diagnostics [slice 6 — cheap]
| key | status | disposition |
|---|---|---|
| STRATEGY_DIAG, BACKTEST_VERBOSE, BACKTEST_FAST, NOWICK_DEBUG, SMS_DEBUG, LEDGER_VALIDATE, LEDGER_BUFFER_SIZE, DECISION_AUTOPSY_ENABLED, ARCHITECT/USER_NARRATOR, DASHBOARD_DEPTH_MIN_INTERVAL_MS | V/L mix | WHITELIST (ceiling pressure: fold LEDGER_*/AUTOPSY into config `observability.*`, keep only true toggles in env) |

### FAMILY 7 — features.json contents [slice 7]
PATTERN_DOMINANCE, PATTERN_EXIT_MODEL, TRAI_INFERENCE, etc. (V: FeatureFlagManager
fs-reads at init) → MOVE wholesale into trading.config.json `featureSystems.*`;
FeatureFlagManager consumes resolved config; features.json archived per A4.

### FAMILY 8 — Dead-file dispositions
| file | status | disposition |
|---|---|---|
| ogz-meta/ledger/ConfigLoader.js | V zero consumers | ARCHIVE (historical snapshot — supersession evidence: it IS a snapshot) |
| ecosystem.watch.config.js | L pm2-manual-only | UNKNOWN-INTENT — Trey: is watch-mode a workflow you use? |
| trading.config.schema.json | V unenforced | Trey rules per A6: enforce or archive |
| .env.gates | V(GZ: disagrees with .env on live keys) | ARCHIVE after slice 1 (its two universes problem dies with DOTENV_CONFIG_PATH) |

===============================================================================
## EXECUTION ORDER (per June-spec slice discipline, one family = one commit)
1 Mode nest (kills double-reads — highest hidden-state yield)
2 Strategy roster  3 Risk/TTP (Mercury+P0)  4 Exits/tuning (Mercury+P0)
5 Credentials  6 Diagnostics  7 featureSystems  8 Archival + A2 hard-fail + A6
Ghost process untouched throughout; cutover restart is Trey's explicit order at the end.

## RESOLVED RULINGS (Trey, 2026-07-10)
R1. TTP/venue guards: a flagged block in the ONE file — `venueGuards.ttp.enabled`
    gates the whole section; enabled=true loads it, false ignores it. Non-permanent
    date-anchored values (START_OF_DAY_*, EARNINGS_STATUS_JSON) live inside that
    block but are marked OPERATIONAL — the bot refreshes them at session start;
    stale dates refuse entries (already the observed behavior, now by design).
R2. NO second config file. Schema file is ARCHIVED; its validation rules move
    INTO ConfigLoader as code (the loader already validates — this completes it).
    Enforcement without a second file.
R3. Standard practice applies: ports/paths/URLs are machine identity → KEEP in
    .env. Anything that changes trading behavior → MOVE. (12-factor convention.)
R4. ecosystem.watch.config.js: ARCHIVED. PM2-manual-only, zero code consumers
    (verified), duplicate of the main ecosystem file's job.
R5. VERIFIED per Trey's method (CHANGELOG + code + specs, findings confirmed in
    foundation/ConfigLoader.js):
    - Both bypass keys are WIRED and live: resolved at L426-427, live-mode
      hard-refusal at L690-693, profile-forbidden list at L1298.
      Deepsearch Table 5 wrong a third time (claimed unread).
    - FINDING: RISK_MANAGER_BYPASS defaults TRUE (L426) — RiskManager is
      bypassed by default in every non-live run. Prod PM2 pins it false
      (CHANGELOG:1028). Disposition: MOVE, explicit required value per launch
      profile, NO default — backtest profiles state true deliberately, live
      states false, resolver refuses if absent.
    - ACCOUNT_DRAWDOWN_BYPASS defaults false (L427): MOVE, same explicit rule.
R6. Context ("smeared across 5 layers"): commit 66051c8 enabled the MTF booster
    in five places at once — env defaults, config json, profiles, the P0 env
    map, and the sweep worker allowlist — so no single layer owned the answer.
    That ambiguity dies with this migration. Ruling: MTF boost becomes an
    explicit config entry `confluence.mtfBooster.enabled` in the ONE file,
    set true (Trey wants the boost on, stated in writing), NO env default —
    resolver refuses if the key is absent.

## RULING-DERIVED LAW (applies to every family above)
No key migrates with a hidden default. Every behavioral value is explicitly
present in the launch profile block or the resolver refuses boot naming the
path. "Default" was the mechanism behind the bypass-on discovery, the MTF
smear, and the $10,000 bootstrap — the species is banned from the one file.

## VERIFICATION STANDARD (Mercury AST — supersedes grep for slice evidence)
Mercury's AST/tree-sitter + symbol-navigation capability is the required
instrument for every slice:
- Reader inventory per slice: AST query for ALL process.env member access in
  the blast radius, INCLUDING computed access (process.env[var]) that grep
  cannot see, plus symbol references to the config paths being moved.
- Post-slice bypass scan: AST assertion that zero env reads exist outside
  ConfigLoader + whitelist. Attached to the commit as evidence.
- Dead-or-alive questions: settled by symbol reference graphs, never by
  string match. Grep is for leads only; deepsearch output is quarantined
  as leads pending AST verification (three claims already disproven).
