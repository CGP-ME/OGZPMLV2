# FABIO-RISK-PROFILES-SPEC — risk geometry per environment (doc 4 of 5)
Source: Trey research archive — Fabio, risk management protocols across
hedge fund / prop firm / competition / personal account. Extracted
2026-07-13. Central law: THE GOAL DEFINES THE GEOMETRY — the same trader
runs four different risk architectures because the four environments have
four different objective functions. Directly applicable: OGZ's Apex/TTP
prop path has its own geometry, and it is NOT max-return geometry.

## THE FOUR PROFILES
P1. HEDGE FUND: optimize risk-adjusted compounding + survivability, NOT raw
    return. Risk protocol comes FIRST, return is what fits inside it.
    Diversify by strategy AND venue AND geography. Medallion lesson: 1%
    and 15% years at a tenth of the risk beat the index's headline —
    retail reads raw return, professionals read return/risk. Black swans
    (unpredictable, out-of-sample by definition) are why max-risk caps
    exist. Liquidity capacity per model is a real constraint (scalping
    models can't absorb size — slippage kills the edge).
P2. PROP FIRM (THE OGZ-RELEVANT ONE): objective = PASS RATE + PAYOUT
    PROBABILITY, i.e. optimize for LOW VARIANCE, not expectancy.
    - "You are not trading the real market — you are trading the rules
      another entity put on you. A synthetic market." Game theory, not
      trading theory.
    - LOW-VARIANCE GEOMETRY WINS EVALS: high win rate (60-70%+), moderate
      risk per trade, moderate RR (1:0.75 to 1:1.5 MAX). The
      social-media sniper model (high RR, low WR) is "the blueprint for
      failure in a prop environment" — profitable strategies still bust
      evals when their variance cone crosses the drawdown rail.
    - Eval phase: low-variance zone. Funded phase: shift toward payout
      optimization (but mind consistency rules).
    - WITHDRAW AGGRESSIVELY once funded — prop firms carry more
      counterparty risk than brokerages (his $50K payout got flagged
      while the prop fought its regulator). Compounding ON the prop is
      exposure, not growth.
P3. COMPETITION: optimize TERMINAL RANK (convex payoff) — inverted pyramid,
    aggression funded by information: phase 1 = regime detection (test
    strategies live, small), phase 2 = validate the regime-fit model +
    moderate risk, phase 3 = concentrated maximum aggression late.
    Commission/slippage modeling is what separates real from false
    expectancy at 500-650 executions/quarter. (Context for reading HIS
    public numbers — 218% is competition geometry, not a personal-account
    claim.)
P4. PERSONAL: risk-adjusted return + psychological stability + long-term
    compounding. Moderate: ~1% per trade (conservative 0.25-0.5%);
    exceptional-month profits can fund next-sample risk increase (profit-
    funded escalation again, K1 kinship). NEVER 5% — streak math destroys.
    - MULTI-BROKER LAW (his FTX trauma): never one brokerage per field —
      4-6 futures brokers, multiple crypto venues, insurance required,
      risk isolated. Diversification = models AND platforms AND brokers.
    - Portfolio structure: discretionary + algo + delegated (options
      quant) + long-term models (post-earnings-drift, accumulation
      models, holder-intelligence research).
P5. UNIVERSAL LAWS (his closing):
    - Automated risk blocks: max risk/day, max risk/week ENFORCED IN THE
      EXECUTION SYSTEM, not willpower. [= OGZ daily guard, his vote for
      automation]
    - "No measurement, no improvement" — track everything. [= wire-effect
      protocol kinship]
    - Continuous adaptation (e.g. his IVB open-battle model improving via
      options flow) — strategies break when owners stop developing them.

## OGZ MAPPING
- P2 IS THE APEX/TTP PLAYBOOK: the eval sweep-selection criterion should
  optimize variance-adjusted pass probability, NOT net P&L — a lower-PF
  high-WR config can be the correct eval pick over a higher-PF spiky one.
  This reframes the fee-real sweep campaign's SELECTION METRIC for the
  eval profile: pass-probability geometry (WR, streak risk, DD cone vs
  eval rails) as first-class outputs alongside PF. [Feeds the eval
  profile design + matrix-sweep scoring — flag for Trey ruling when
  sweeps start.]
- P2 withdraw-don't-compound = post-funded operating policy, worth
  encoding in the TTP plan docs.
- P4 multi-broker = OGZ's 11-adapter architecture + universal
  swappability law, independently derived from his FTX trauma — the
  de-krakenification lane is this law's enforcement.
- P5 automated risk blocks = the daily-loss guard ruling (still open from
  Mercury's finding): his answer is unambiguous — automate the halt.
  Combined with doc-3 K2 (three-stops rule, anchor-free), the candidate
  design: consecutive-stop AND daily-loss automated halts, enforced in
  execution, no TTP-anchor dependency.
- P3 phase discipline (regime-test → validate → deploy) is literally the
  walk→sweep→eval sequence OGZ is already running.
- SEQUENCING LAW unchanged: banked as design doctrine; selection-metric
  ruling surfaces when the sweep campaign starts.
