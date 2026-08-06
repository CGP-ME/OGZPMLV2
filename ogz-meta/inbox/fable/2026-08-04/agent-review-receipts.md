# Claude-agent review receipts — directional workstream

One-package receipt doctrine, third family. Mercury dispatches print a
RECEIPT block (ask.js, shipped f55f323c). The Kimi script embeds one in its
result file. This file closes the gap for the Claude-agent (Fable-family)
reviews already run, from their task telemetry, and states the go-forward
rule.

## GO-FORWARD RULE (doctrine, applies to every future review agent)

Every review/audit agent prompt MUST require a final RECEIPT section in the
agent's report: verdict, count of files actually read (not just searched),
tool failures encountered, explicit assumptions/not-verified list. An agent
report without a receipt is an incomplete deliverable — same standard as a
Mercury dispatch without its receipt block.

## Retro-receipts — 2026-08-03 module audit (six agents, all completed)

| Agent | Output tokens | Tool calls | Duration | Verdict shape |
|---|---|---|---|---|
| TradingLoop direction path | 95,256 | 13 | 5m47s | 13 findings (F1-F13) + verified-clean list |
| OrderExecutor direction path | 147,954 | 11 | 11m21s | 19 findings (F1-F19) + verified-clean list |
| StateManager+PositionTracker | 103,436 | 24 | 8m13s | 10 HOT (H1-H10) + cosmetics + verified-clean |
| Exit models (ECM/PBEM/planner) | 112,860 | 37 | 9m35s | 10 HOT + dead-modules + verified-clean |
| Backtest+recorder | 143,144 | 48 | 11m18s | 7 HOT + 6 cosmetic + per-target answers |
| Journal+webhook | 92,596 | 34 | 9m15s | 4 HOT + 6 cosmetic + verified-clean |

All six: read-only (no Edit/Write tools used on repo files), zero reported
tool failures, all citations later spot-verified 13/13 by the independent
reviewer at the audit's commit.

## Retro-receipt — 2026-08-04 Fable independent spec review

- Output tokens: 104,271 | Tool calls: 45 | Duration: 12m34s
- Verdict: READY-WITH-CHANGES (M1-M6 + sequencing + minimal change list)
- Assumptions flagged by the agent itself: checkExitsOnly scheduling vs
  T1-25; PnLCalculator caller set beyond PositionTracker.
- Read-only; zero reported tool failures.

## Known limitation of retro-receipts

Task telemetry for Claude agents does not itemize per-call failures the way
Mercury's ledger does; these retro-receipts carry counts and the agents'
self-declared assumption lists, not per-call args. The go-forward rule closes
that by making the agent itself report failures and unverified items in a
mandatory RECEIPT section.
