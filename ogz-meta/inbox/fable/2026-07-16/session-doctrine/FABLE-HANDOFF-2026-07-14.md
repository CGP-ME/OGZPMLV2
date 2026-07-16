# FABLE HANDOFF — 2026-07-14 (~6% budget, reset in ~16h)
Next instance: read this + STRATEGY-WALK-TAB.md + git log on
codex/multi-asset-symbol-state. Verify everything from the PUBLIC repo
(github.com/CGP-ME/OGZPMLV2) — clone, fetch, reset to FETCH_HEAD. You
have NO VPS access; pushes are your only truth. Trey relays agent
messages; agents also write to ogz-meta/inbox/fable/ (only counts when
PUSHED).

## WHO
Trey: architect, sole dev, sole authority. One dev, linear work, ONE
BRANCH (codex/multi-asset-symbol-state) — no worktrees ever (AGENTS.md
law, "No worktrees, period"). He rules; agents execute; Fable verifies
+ grades, NEVER decides priorities/sequencing (conduct record: 4 strikes
tonight for leans-as-orders, triage-as-authority). Leans must be labeled.
Agents: Codex-1 (repairs/G5/Mercury bridge), Codex-2 (TFE integration),
DC (Trey's Windows box + VPS ops), Mercury (DLLM verifier via bridge,
operator-triggered reindex ONLY — always check index SHA vs HEAD).

## MASTER SEQUENCE (Trey's plan of record — in the tab too)
A. ALL strategies online (wake 5 dormant, restore OGZTPO, config
   exposure roster-wide). B. Four-eye review per strategy (Trey + Fable
   walks + Mercury attack + Fable-tier). C. Trey rules FINAL SHAPE from
   combined notes → one coordinated submission. D. Platform in (TFE +
   router, all timeframes, backtest pipe == live pipe). E. Backtest
   everything → fill config table ONCE on finished machine. PID/CTX-DATA/
   liquidity ledger are post-table. NO partial sweeps.

## IN FLIGHT AT HANDOFF
- Codex-1 (cranking): 1) commit+push G5 verdicts (8 reports,
  ogz-meta/inbox/fable/2026-07-14/ — UNTRACKED until pushed; verdicts:
  MADynamicSR incoherent, ORB incoherent, MTF incoherent, RSI/Donchian/
  LS/SMS/OGZTPO coherent-with-flaws; post-reindex at SHA a476afb, READ
  +GRADE both tiers when pushed; MADynamicSR incoherent POST-R2 = real
  residual direction hole → lane candidate). 2) WAKE LANE (delete
  shouldInstantiateDormantStrategy entirely; 5 strategies get config
  blocks + contracts; RSI2 seeds RSI(2) buy<10 exit>80 — Trey's spec;
  wiring checks G1-G4; P0 exact). 3) OGZTPO restoration (filters
  uncommented, silent catch REMOVED not loudened).
- Codex-2: final aggregation removal (_feedAggregatedActiveCandle → TFE
  sole bar producer). Landed already: KS1 d33fae1f, KS2 c2fac766, KS3
  a476afb (MTF private stack dead). After this lane: Phase D HOLDS per
  Trey. Watch: it re-sent stale KS2/KS3 reports once — re-sync if looped.
- DC: spec/architecture inventory of ogz-meta (read-only) →
  dc-summary-spec-inventory.md. Migration: carry bundle pruned (Trey
  ruled: campaign raw ledgers DIE, conclusions carried), 1m data
  COMMITTED (bdc7c4d — swap-proof). VPS swap imminent — untracked = dies.
- R-DD (Codex-1, held): stage 1 audit table of RiskManager tenants →
  Trey rules keep/kill/absorb → stage 2 builds HIS guard (self-computed
  from fills, venue-neutral, profile-owned limits, K2 3-stop layer, the
  ONE legitimate halt besides P0). Table may be unpushed — chase it.

## OPEN TREY RULINGS
1. EMASMA alignment-mode: G5 proved entryEventsOnly=false disables the
   restored trio (still churner). Lean (labeled): P0 keeps alignment as
   frozen ground; all living profiles events-only. UNRULED.
2. R-DD stage 1 disposition table when it lands.
3. Data family for tournament: new iex/raw 1m (hashed, committed) vs old
   anchor lineage (provenance unknown; every bar differs). Lean: iex for
   tournament, P0 keeps frozen file as tripwire. UNRULED.
4. VPS swap timing (Trey names the hour; DC bundle nearly ready).

## LAWS (enforce, never re-litigate)
One branch/no worktrees; diff-to-desk before EVERY commit; red-test-on-
parent; P0 exact 8338.146639366509/1551/52.2%/0.64 every lane (it's a
TRIPWIRE not performance — Trey spent 3mo thinking it was a verdict;
never let that recur); fourth shape (remove ability, don't guard);
no throws added, no silent catches; one config pipe, no || defaults, no
private engines (SMS VP consolidation queued); confidence-values-in-
config (PropSafe pattern); universal swappability — NO counterparty
names/semantics in core (brokers, prop firms, vendors); Trey epistemics
law: prediction shapes SIZE never EXISTENCE (fee gate class = kill on
sight); RiskManager = ONLY halt seat, holds ONLY Trey-ratified vetoes;
reports → ogz-meta/inbox/fable/ as <agent>-summary-*.md, committed,
chat = 3-line pointers (paste pipe kills >~6KB); index staleness check
before any Mercury attack; wire-effect protocol (baseline→wire→delta→
verdict; no-effect = halt-and-diagnose); receipts-or-unclaimed.

## CONTEXT THAT SAVES HOURS
- Trey's rig: C:\ogz CERTIFIED (P0 exact on 7800X3D). Repo MUST live at
  space-free path on Windows. .env from VPS required (gitignored).
  Sweeps run LOCAL; VPS trades undisturbed.
- G5 template: ogz-meta/inbox/codex/2026-07-14/g5-emasma-logic-attack-
  prompt.md (5-link chain attack). Two-tier mandatory: Mercury
  prosecutes, Fable-tier grades citations; toolfail = degraded, rerun.
- Banked specs (Trey outputs zip + tab): Fabio×5, Marco DaVinci+
  foundations, AMT doctrine, orderflow confirmation, NoWick intent,
  TREY-PARTIAL-EXIT (risk-neutral 50% + terrain trail), LIQUIDITY-LEDGER
  (magnet law: unswept liquidity = debt; sweep_rejected/accepted
  classifier), IVB capstone (ORB upgrade ladder a-d, stages a-c need NO
  new feeds), quantifiedstrategies 6-pack seeds (RSI(5)/35/50/200MA =
  Trey's live-RSI spec; RSI(2) 10/80 = RSI2 seeds; Choppiness Index =
  regime-detector rebuild candidate).
- Trey mood law: brutal honesty, no softening, no telling him what to
  do (sleep etc.), answer the asked question, he sets priorities. The
  ice-cream-float standard: nothing is proven until real money prints.
  Do the best we can at all times until it's done.
