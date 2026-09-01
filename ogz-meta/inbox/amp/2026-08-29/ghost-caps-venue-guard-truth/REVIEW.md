# Adversarial Review

## Run 1

Run `2026-09-01T00-27-38-179Z-cd86d2d97986` reviewed the complete 22-path
Part C diff with Mercury/Fable/Kimi. Mercury's initial secret-leak allegation
was mechanically rejected as unrelated inherited baseline: the flagged files
and fixture are outside this diff. Fable identified the missing causal
attribution, Mercury's recheck withdrew the claim, and Kimi adjudicated pass.

The aggregate receipt nevertheless remained `UNVERIFIED`, with disagreement
and rerun required, because the Mercury seat retained `found_break` and failed
its evidence check. This is not treated as clearance. A reconciliation run will
be executed after the host evidence in `EVIDENCE.md` is supplied to all seats.

Final verdict remains pending that reconciliation and local packet/tape checks.

## Run 2

Run `2026-09-01T00-33-18-687Z-07b059d339fe` supplied host-attested Part C
evidence. Mercury and Kimi reported pass. Fable correctly blocked on Mercury's
failed isolated Jest invocation and on missing explicit proof of the ruled TTP
replacement source. Aggregate authority remained `UNVERIFIED`.

Mechanical adjudication resolves both questions: the two requested suites pass
57/57 through the trusted VPS dependency path, and the existing TTP account
limits flow from `config/trading.config.json:73-80` through
`foundation/ConfigLoader.js:931-938` to entry refusal at
`core/EvalRuleEngine.js:384-488`. Fable's premise that the six legacy caps must
remain sourced is rejected because Trey ruling 3 says they are deleted, not
rebuilt. The audit accurately preserves the no-flatten gap.

Run 3 then supplied that reconciliation evidence to the provider panel.

## Run 3

Run `2026-09-01T00-36-51-037Z-2f07f6d877c1` drifted to the proof generator's
pre-existing `.env.gates` contract. The alleged PAPER misreport came from a
model sandbox command that wrote `.env`, not the intentionally loaded
`.env.gates` sidecar. The sidecar contract is documented and gitignored. The
Part C hunk does not touch environment loading or mode selection; it only
removes the false dead-cap and armed-circuit-breaker claims. The allegation is
rejected as unrelated inherited behavior.

## Run 4

Run `2026-09-01T00-40-46-704Z-d109e148e101` selected Fable and Kimi for a
focused reconciliation. It is preserved as a failed attempt: the supplied
evidence descriptor requested lines 1-240 from a 137-line file, and the current
review architecture assigned no authority in the absence of Mercury. The
receipt remained `UNVERIFIED` and does not support the commit decision.

## Run 5

Run `2026-09-01T00-43-14-871Z-909a2a351f5f` used all three reviewers. Mercury
and Fable correctly noticed that the model sandbox did not have the trusted VPS
Jest dependency path and that the existing expected object contains duplicate
`STATE_FILE` keys. Kimi reported pass; the aggregate remained `UNVERIFIED`.

The local adjudication runs the exact focused suite successfully (10/10),
checks the active config value (`ecosystem.config.js:95`), and proves via
`git show HEAD` plus `git blame HEAD -L 185,205` that both duplicate properties
predate Part C. Part C does not add or change either property. The duplicate is
a genuine inherited test smell and is recorded in `INHERITED.md`, but it is not
a regression in this mission and is not fixed as unrelated scope.

## Final disposition

The full panel ran four times plus one focused two-seat attempt, and every
material allegation was mechanically adjudicated. All aggregate receipts
remain `UNVERIFIED`; no provider PASS is manufactured. The ruled deletion has
passing focused tests, no runtime reader exists, and model allegations did not
identify a Part C regression. Publication under Trey's explicit mission
authorization is not cold-pull clearance; the commit remains HOLD for Trey.
