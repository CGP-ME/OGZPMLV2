# Phase 1 `.env.gates` Investigation

**Date:** 2026-04-22
**Branch:** `config/consolidation`
**Parent commit:** `7326fa1` (lane-1 race-fix /recorder follow-up)
**Author:** CC + Mercury (agentic verification)
**Spec driver:** `ogz-meta/ledger/CONFIG-SPEC-V2-PATCHES.md` PATCH 4 (`.env.gates` investigation moved up, blocker for Phase 5)

---

## Purpose

The config-consolidation spec originally flagged `.env.gates` as "investigate during implementation" in Phase 5. Patch 4 moved the investigation to Phase 1 because it's on the Phase 5 critical path — if the file is live and we don't know what reads it, Phase 5 either breaks it or preserves it blindly. This doc resolves it before any code changes land.

---

## 1. What is `.env.gates`

A **local-only secrets/config sidecar** loaded by `scripts/generate-live-proof.js` (the live-proof aggregator for the `ogzprime.com` proof page). The file is `chmod 600`, 13,336 bytes, last modified 2026-01-15. It is **not committed to git** — `git log -- .env.gates` returns zero commits.

The script uses it to supplement `process.env` with proof-page-specific configuration before reading risk/trading display values. See section 4 for the exact variables.

---

## 2. When was it created

**Not determinable from git history.** The file has never been committed. File-system mtime is 2026-01-15 23:54 (per `ls -la .env.gates`). Likely created by the operator locally when the live-proof aggregator was first deployed — predates this session and predates the config-consolidation spec work.

Mercury noted in its investigation: "The repository's Git history is not exposed through the available tools" — which is an accurate statement of its tool surface (grep/open_file/list_files), not a hallucination. The file simply doesn't exist in git-trackable history because it's gitignored/not-added.

---

## 3. Who reads it

Three reference points in the codebase, with different activation conditions:

| Reference | File:Line | Activation |
|---|---|---|
| Direct dotenv load | `scripts/generate-live-proof.js:277` | Always when script runs (`require('dotenv').config({ path: '.env.gates' })`) |
| Indirect via DOTENV_CONFIG_PATH | `foundation/ConfigLoader.js:100` + `:314-315` | Only when process env has `DOTENV_CONFIG_PATH=.env.gates` |
| Permission grants (not active uses) | `.claude/settings.local.json:89-90` | Bash permissions for developer-initiated commands |

**PM2 runtime check (2026-04-22):**

```text
  PID 1304 (ogz-stripe):    DOTENV_CONFIG_PATH=(not set)
  PID 1311 (ogz-prime-v2):  DOTENV_CONFIG_PATH=(not set)
  PID 1328 (ogz-websocket): DOTENV_CONFIG_PATH=(not set)
```

**None of the three live-running PM2 processes load `.env.gates`.** The main trading bot (`ogz-prime-v2`) uses default `.env` resolution, so `.env.gates` does not affect live paper trading.

The `.claude/settings.local.json` entries are Claude's *permission* grants for commands the developer might run manually (`pm2 start` / `timeout 30 node` with `DOTENV_CONFIG_PATH=.env.gates`). They prove nothing about whether those commands are currently active — and PM2 inspection confirms they are not.

---

## 4. What variables it contains

Without opening the file (`chmod 600` secrets hygiene), we infer from consumer reads.

`scripts/generate-live-proof.js` inside `checkRiskManagement()` (called after the dotenv load at line 277, via `Promise.all` at line 282) reads these four vars:

| Line | Variable | Default if unset | Purpose |
|---|---|---|---|
| 239 | `MAX_RISK_PER_TRADE` | `'0.02'` | Displayed on proof page as "Max risk/trade: X%" |
| 240 | `MAX_DRAWDOWN` | `'18'` | Displayed as "Max drawdown: X%" |
| 241 | `STOP_LOSS_PERCENT` | `'2.0'` | Displayed as "Stop loss: X%" |
| 242 + 299 | `LIVE_TRADING` | `'false'` | Toggles proof page between LIVE / PAPER mode |

These are the only process.env reads in the post-dotenv scope of the script. `.env.gates` provides them to the proof generator so the proof page shows the correct live-trading gates even if the outer `.env` doesn't define them.

Note: `dotenv.config()` only adds vars not already present in `process.env`. If a var is in the outer environment or main `.env`, the outer value wins. So `.env.gates` is a fallback, not an override.

---

## 5. Is it still live in any workflow

**Yes — the proof generator script is actively running.**

- Proof-generator log file: `logs/proof-generator.log`, size 566 KB, last written **2026-04-22 02:00** (minutes before this investigation started)
- Not referenced in `package.json` scripts, not in any committed ecosystem file, not in the current `crontab -l` for this user — invocation path is external/opaque from the codebase alone (likely system cron or a scheduler the operator configured)

**`.env.gates` is NOT live in any trading workflow:**

- Not loaded by the main trading bot (confirmed via PM2 env inspection)
- Not loaded by any backtest command (none of the documented backtest commands set `DOTENV_CONFIG_PATH`)
- Not loaded by matrix-sweep workers (which explicitly whitelist env vars and do not include `DOTENV_CONFIG_PATH` in the whitelist)

---

## 6. Recommendation

**KEEP AS SIDECAR. No action needed in Phase 5.**

Reasoning:
1. `.env.gates` has exactly one direct consumer (`scripts/generate-live-proof.js`) and zero indirect consumers in live workflows.
2. That consumer is actively used (proof-generator logs updated continuously).
3. It contains four display/mode variables — isolated concerns, unrelated to the core trading pipeline or the config-consolidation target shape.
4. Folding it into the profile system (Phase 4+) would add complexity for a single-script use case. Deleting it would break the proof page.
5. It's already `chmod 600` and never committed, so it's being treated correctly as a local secrets file.

Concrete Phase 5 disposition: when Phase 5 removes the `require('dotenv').config()` call from `core/TradingConfig.js:16`, `.env.gates` is unaffected because the proof generator loads dotenv independently at its own line 277. No coupling to break.

---

## Investigation methodology

Dual-sourced: Mercury agentic investigation (31 iterations, 30 seconds, quality score 340.5) supplemented by CC's direct PM2 runtime inspection and manual code re-reads.

Mercury's initial answer was **correct on all six questions**; CC initially flagged Mercury's answer #4 as a hallucination based on an incomplete sed inspection that skipped lines 239-242. Manual re-read of `scripts/generate-live-proof.js:235-250` confirmed Mercury's variable list was accurate. The error was CC's, not Mercury's — recorded here because the false-accusation pattern is exactly what `feedback-verify-before-claiming.md` warns against.

**Lesson:** When cross-verifying Mercury, the cross-check must inspect the exact lines Mercury cites — not a nearby range. Mercury cites file:line for a reason.
