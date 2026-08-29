# MTF census adversarial receipt

Date: 2026-08-29

Reviewed artifact: `ogz-meta/inbox/amp/2026-08-28/mtf-site-census.md`

Artifact SHA-256: `ebf70bf43f6f4a961180aadf7d371d1d1d592573aff85bda0d45ddc40bab83fe`

Artifact bytes: 19,993

Review checkout began at `ce132ea22dfffa3a21811cb4c70c761aaafc7a27`.
Provider raw bytes remain mode `0600` below the ignored cognition-history tree;
this receipt tracks secured paths and hashes, not raw model content.

## Runs and identities

Ledger: `ogz-meta/cognition-history/mercury-runs/2026-08-28.jsonl`.

| Ledger | Run ID | Reviewed lines | Excerpt SHA-256 | Applied identities | Termination / verdict |
|---|---|---:|---|---|---|
| `:16` | `2026-08-28T22-16-18-701Z-bd81c19eaefc` | 1-99 | `ada9ee6ef3508c58e1e14fc2d9f091073b9c486c6f45abf8bd365cfd098e6115` | `mercury-2`; `claude-fable-5`; `kimi-k3` | `max_iterations`, 60 / `cannot_verify` |
| `:17` | `2026-08-28T22-18-59-871Z-9c853c9469bf` | 1-99 | `ada9ee6ef3508c58e1e14fc2d9f091073b9c486c6f45abf8bd365cfd098e6115` | `mercury-2`; `claude-fable-5`; `kimi-k3` | `answer_given`, 25 / `no_break_found` |

Both challenger receipts identify authenticated first-party Claude Code via
`claude.ai`, requested Fable, and applied `claude-fable-5`. Both record
`claude-haiku-4-5-20251001` only as auxiliary telemetry. Fable and Kimi each
record tools available `[]`, calls `[]`, total calls `0`, and mechanically opened
files `[]`. Mercury alone used repository tools. Both runs include the bounded
Mercury recheck and Kimi stage required by the successful Fable challenge.

## Secured raw receipt index

All paths below are relative to
`ogz-meta/cognition-history/mercury-runs/raw/2026-08-28/`. A raw-set hash is the
SHA-256 of the sorted `sha256  basename\n` manifest for the complete directory.
Individual Mercury and recheck hashes are also retained in the corresponding
ledger row under `stages.*.provider_attempts`.

### Initial run

Directory:
`2026-08-28t22-12-58-512z-1262288-093bb5f735b3/`

- Receipt set: 63 files; sorted-manifest SHA-256
  `1bf1ee589db9cbdcd35ee531ed8b32c84676ebf41f63d7848d23a38afc225ea5`.
- Fable output `fable_challenger-1.raw`: SHA-256
  `62ef194d066c82600b2d676507a77e88d17e65d43ef6b94e6b6051720ad8ab10`.
- Kimi output `kimi_tie_breaker-1.raw`: SHA-256
  `0f55f442e369b2e37992055a603e425625820d8d7b60eeeeefb68c3ffcce634f`.

### Focused continuation

Directory:
`2026-08-28t22-16-42-822z-1263013-fb0523412883/`

- Receipt set: 28 files; sorted-manifest SHA-256
  `a8f0ba7c8d7acb9d65dfce84d308d521f716e5c9fa9e2a93b26ea4ec0c61c178`.
- Fable output `fable_challenger-1.raw`: SHA-256
  `8de7d22cbf441dffc5a4d9225daccb1478eeb19d94f4a2d5ca65f94fc5ff1796`.
- Kimi output `kimi_tie_breaker-1.raw`: SHA-256
  `0856f152f55955c56432032198dfb7ba6d6ea823b0d63ec556c67092633c9796`.

## Rerun and reconciliation chain

The initial broad run reached the configured 60-iteration bound. Its
`cannot_verify` result is preserved and was not treated as a completed verdict.
The second run used the same host-attested 1-99 excerpt and focused only on the
unresolved claims: Kraken subscription/decode coverage, selector pinning,
root/symbol MTF ingestion and readiness, TTP, dead producers/callers, and
derived-bar arithmetic. It terminated normally at iteration 25 with
`no_break_found`. No artifact bytes changed between runs.

## Material allegations and mechanical dispositions

1. **Kraken native-frame coverage might omit 4h or misdecode subscribed
   intervals.** `kraken_adapter_simple.js:970-1009` defines and sends intervals
   1, 5, 15, 30, 60, 240 and 1440. Lines 1101-1142 parse the channel interval and
   map those values to 1m, 5m, 15m, 30m, 1h, 4h and 1d before emitting OHLC.
   Disposition: **rejected**; the census subscription/decode row is exact.
2. **The primary selector might switch to native non-primary bars.** Mechanical
   inspection confirmed the runner constructs the allowed set from only
   `broker.candleTimeframe`, while the ingress fence drops frames unequal to the
   selected active frame before canonical trading analysis. Disposition:
   **rejected under the reviewed committed configuration**.
3. **Root or symbol-scoped MTF adapters might already receive higher-frame
   rollups.** Repository search and direct producer/consumer inspection found no
   production `TimeframeEngine` instance or delivery wire. The root adapter is
   downstream of the active-frame fence and the symbol adapter receives the
   canonical evaluation candle. Disposition: **rejected**; they remain
   primary-only and cannot satisfy the configured two-ready-frame requirement.
4. **TTP might already be a live non-primary order gate under the paper
   profile.** The 1m previous-volume reader exists, but the paper profile's
   top-level TTP enable is false. Disposition: **the site is wired but disabled
   under the committed default**, matching the census.
5. **Dead/inert producer and caller classifications might overlook runtime
   entry points.** Repository-wide searches found `TimeframeEngine` constructed
   only by `tools/probe-tfe-alive.js`; no production caller invokes
   `CandleAggregator.aggregate`, `TimeFrameManager`, or
   `EnhancedPatternRecognition.extractMultiTimeframe`. Disposition: **no
   contradictory runtime caller found**. This remains a static repository
   conclusion rather than runtime telemetry.
6. **The derived-frame warm-up table could be off by one.** `TimeframeEngine`
   accepts only equal/higher even multiples (`core/TimeframeEngine.js:102-120`),
   closes an aggregate when the first source candle enters the next bucket
   (`:329-354`), or on watermark flush (`:225-238`). From a 15m source this
   proves transition emission at 30m 60/61, 1h 120/121, 4h 480/481, and 1d
   2880/2881, exactly as the artifact distinguishes source requirement from
   transition-emission point. Disposition: **confirmed**.
7. **Mercury made broad completeness claims before opening every relevant
   producer and consumer.** Fable challenged the unsupported scope. Disposition:
   those statements were not accepted as authority; the continuation and repo
   adjudication addressed each identified boundary individually.

No material allegation survived mechanical repo adjudication. No census edit was
warranted and no correction was manufactured.

## Final conclusion and limitations

Final repo conclusion: **no supported MTF-census correction**. The reviewed
committed default has native non-primary storage/mark-to-market effects but no
direct MTF-confluence effect on ranking, winner selection, strategy exits, or
order permission. Higher-frame confluence remains unavailable because no runtime
rollup producer is wired.

Limitations: no PM2 process was activated, no broker/network path was exercised,
and no runtime telemetry was generated. Runtime reachability and negative caller
claims are based on current repository producer/consumer search. The initial
max-iteration event is retained as a non-verdict, and the focused continuation
is the reconciliation record. Raw provider content remains local and ignored;
the immutable secured references above are the durable evidence boundary.
