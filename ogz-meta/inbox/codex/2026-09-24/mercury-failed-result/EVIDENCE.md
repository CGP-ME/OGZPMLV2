# Evidence

- observe-handoff.cjs and handoff-observation.json: actual before/after coordinator and prompt/ledger execution, with explicitly intercepted external boundaries. Read-only tool results are new observations, not falsely reconstructed historical bytes.
- Historical failure raw: ogz-meta/cognition-history/mercury-runs/raw/2026-09-24/2026-09-24t02-29-55-510z-497788-5b057ca969bd/mercury-19.raw. 34,602 bytes; SHA-256 016325a2846354f48b61e77a50a8114430e7be845313922d6f0bb5420ed5ec6b. Actual Mercury-2 response finish_reason=length; completion_tokens=7694. No token limit increase or truncated-response acceptance.
- Historical ledger and post-run storage comparison remain under ../mercury-full-chain/reviewer-evidence/.

New throws: zero. New bot gates/fallbacks/behavior: zero. Provider failure is still disqualifying; actual evidence survives it.
