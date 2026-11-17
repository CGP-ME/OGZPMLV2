# Journal activation and walk readiness — 2026-11-17

This records an actual paper-runtime activation, not completion of the whole walk. Machine-readable observations and source hashes are in [runtime-receipt.json](runtime-receipt.json). Raw logs, settings responses, state backups and the dirty-work patch remain local and private.

## Activated source and processes

At 01:39:32–01:39:33 UTC, `pm2 restart ecosystem.config.js --only ogz-prime-v2 --update-env` completed successfully. Bot PID changed from 2557111 to **2707440**. Supervisor, WebSocket and Stripe retained their existing PIDs; all four processes were online in the observation.

The activated checkout was `codex/archive-legacy-env`, HEAD **b912f82155d00e71ccfd4400ec029dae5cc6608f**, with preserved inherited dirty edits. This is not a claim that the runtime equals a pristine Git commit. All 29 compared tracked files matched their pre-restart bytes. The cleanup and four rebuild commits were confirmed pushed before activation:

- `acbcd043`: reporting failures separated from trade execution.
- `2257178e`: reports derived from persisted account fill history.
- `84cb0cb2`: entry-time replay persistence and saved reporting-failure receipts.
- `f379d61a`: authenticated journal/replay consumers using saved records.
- `b912f821`: superseded journal/replay interfaces and unused configuration removed.

## Preserved work and position

The unrelated dirty work remains in place. A private patch and untracked-path inventory were saved before restart; no reset, stash, branch change or unrelated deletion occurred.

All **619** pre-existing journal/replay files remain present. At the initial 01:41 check, 617 retained their original bytes; two obsolete `journal-stats.json` caches were updated during old-process shutdown, before the new PID started. During the later observation, 19 saved replays advanced their restored post-exit capture progress. **All 16 original trade-ledger byte ranges remain intact.** A saved replay sample retained its entry, exit, original candles and previously captured post-exit candles. Full pre-update payloads were not backed up for every replay, so later progress writes are not claimed as an exhaustive field-by-field comparison.

The original BTC short `SIM_1794873601189_m1duqj` restored with its original identity, entry price **64781.29315**, and size **198.2682279243715 USD**. The live StateManager response showed that position receiving a current mark. There was no trading pause, quarantine or symbol halt. Its entry predates this rebuild's activation; there is no fabricated entry-time replay checkpoint.

## Configuration and candle evidence

The actual bot environment selected `PROFILE=paper`, without `DOTENV_CONFIG_PATH` or `BACKTEST_RUN_DESCRIPTOR_PATH` overrides. Its working directory was the active repository. The authenticated `get_settings` response contained **1,397** fields; every field's value and source matched the pre-restart response, all exposed sources were `config:settings.json:...`, and unavailable inputs were empty.

Loaded settings revision 22 and internals revision 12 match the canonical files. Their hashes were independently recomputed using the loader's JavaScript canonicalization through the isolated launcher:

- `config/settings.json`: `b9d3f18f690848649114d913ad8c528fc5cded1838f313293c7391934410e672`
- `config/internals.json`: `a9c2a7433e82e80aa6d9f019f419001f0e2c416a7fd5af738b357e5f22cc9cd8`
- Loaded fingerprint: `dc864528f0e1faa370dd3eb90bd2d7bdccec09ed8d7fb6fa827f85487432fb65`

`REST_HYDRATION_COMPLETE` reported **60 BTC candles each for 1m, 5m, 15m, 1h and 4h**, ready, with no unavailable frame or pending recovery. SessionRouter reported TARGET_ACTIVATED, epoch 442, entries unfrozen. Current candle ingress/admission, strategy evaluation and position exit checks were observed. Decision records were found on disk in `logs/decisions/autopsy_2026-11-17.jsonl` carrying the loaded fingerprint and named `no_exit_condition` outcomes.

This proves loaded configuration identity and exercised consumers. It does not certify every setting's hot-update behavior or every open-trade policy reader.

## Reporting responses and unresolved accounting

Authenticated requests returned journal, equity, calendar, symbol breakdown, replay list and the selected saved replay; no requested response was missing. The journal reported 115 historical fills, one open position, 115 equity points and 16 calendar days. Replay responses matched the requested order and scope. These are actual backend replies, not browser-render proof.

**Historical totals remain unreconciled.** The active-account journal reports net PnL **-390.13** and balance **9609.87**. StateManager reports realized PnL **-3424.020688767495** and, at the captured mark, equity **6576.299732828262**. The same StateManager realized PnL was present in the pre-restart backup. Its 601 historical closure records sum to that realized PnL but all lack account and broker identity; the journal reports 115 account-scoped fills. Automatically assigning those 601 records to today's account would invent provenance. Successful report delivery does not establish that these histories reconcile, and journal balance must not be represented as verified account equity.

## Startup warnings and limits

- The subscription list includes 30m and 1d, while the evaluation path selects five other configured frames. Those extra payloads produce `TIMEFRAME-NON-ACTIVE` messages. Current sources: `config/internals.json:1086`, `kraken_adapter_simple.js:997`, `run-empire-v2.js:1059`. This is a Stop 2 subscription/admission lead, not evidence of missing hydration in the five selected frames. No subscription was changed.
- Journal startup calls reconciliation for its open entries. The journal refused to mark the BTC short closed because authoritative exposure remained (`core/TradeJournalBridge.js:979`, `core/TradeJournal.js:1033`). The position and open journal record survived; the noisy caller remains a finding.
- The shutdown WebSocket-closed message is followed by authenticated state and reporting responses from the restarted bot.
- No fresh entry/full exit was forced. Natural post-activation entry/exit persistence still needs runtime evidence. Previously executed isolated native receipts remain separate evidence.
- Public-hostname/browser rendering, stock-session hydration, and a complete session switch were not established by this activation. No new RAG publication is claimed.

## Walk documents reconciled

The current walk copy is [the later Fable inbox spec](../../../fable/2026-09-09/OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM.md). Its original title still says September 3, but lines 234–252 record Trey's **October 13 addition of Stop 11: backtesting and frontend**. The older Astra and Trey September 3 copies are byte-identical and contain only ten stops.

The walk order is: boot/configuration; data ingress; signals/confidence/winner; sizing/guards/order; order/fill/position; position management; exit/books; reconciliation/session switching; pattern bank/ML; TrAI/trace; backtesting/frontend.

Read in full: the September 2 walk handoff, September 3 Astra spec, later Fable spec, and `11-CANDLE-FOLLOWUP-HANDOFF.md`. The last filename is misleading: its contents are a Mercury evidence-intake/failed-reviewer addendum, not a candle-hydration acceptance receipt. Read relevant scope, findings and acceptance sections of `STOP1-AUDIT-6ca25ae8.md` and `OGZ-EXECUTOR-HANDOFF-2026-11-09.md`; no whole-inbox audit is claimed.

Trey's words and subsequent instructions control. Fable's Part B notes are explicitly not spec. Old code findings are leads to reconcile against today's files, not proof that a repair never landed. Each stop needs intended behavior, actual code, live evidence and a precise remaining-gap verdict. This activation supplies current receipts for that reconciliation; it does not close all of Stop 1.

**What changed:** runtime activation and its evidence record; existing local mission manifests now point to this activation. **What did not change:** production source, trading settings, other PM2 services or historical attribution during this verification. **Assumptions:** no invented account identity or historical entry capture; remaining runtime and accounting gaps are explicit above.
