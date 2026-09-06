# MISSION 0 — STOP 1 LEAF MANIFEST (read-only)

**Dispatcher:** Trey (session dispatch, 2026-09-06). **Ruling authority:** Trey.
**Executor:** CC (Fable, on the box). Named by Trey's dispatch of this mission text to CC in-session; spec's HOLD released for Mission 0 only.
**Frozen tree:** e54a8b8d, branch codex/multi-asset-symbol-state. No edits to code, no commits outside this packet, no restarts.

## Tasking, verbatim

> MISSION 0 — STOP 1 LEAF MANIFEST (read-only)
>
> Tree: e54a8b8, branch codex/multi-asset-symbol-state. No edits, no commits, no restarts.
> Inputs, both attached: STOP1-BOUNDARY-MISSION-2026-09-06.md (section 1.6 is your spec), STOP1-CONFIG-SORT-2026-09-05-FABLE.md (your starting list — not your ceiling).
>
> Produce ogz-meta/inbox/codex/<date>/stop1-manifest/MANIFEST.tsv, one row per leaf, columns:
>   id | surface | path_or_key | file:line (definition) | current_value | source_layer (env-stamp / .env / json-base / launchProfile / tuningProfile / features.json / code-literal / constructor-default) | readers (file:line, every one, AST not grep) | live_path (yes / backtest-only / test-only / none) | proposed_disposition (MOVE-TO-SETTINGS / MOVE-TO-INTERNALS / KEEP-AS-CODE-CONSTANT / DELETE-AS-DEAD / HOLD-NEEDS-OWNER) | reason (one line)
>
> Surfaces, all of them, no inheritance from parents:
>   1. every leaf of config/trading.config.json (1,692), every launchProfiles.* and tuningProfiles.definitions.*.env.* leaf individually
>   2. every leaf of config/features.json (73)
>   3. every ecosystem.config.js stamp for ogz-prime-v2 (116) and every env key read by the loader or any bypass reader (denominator: ogz-meta/inbox/amp/2026-08-28/env-census.md)
>   4. DECISION-LITERAL SURFACE and CONSTRUCTOR-LITERAL SURFACE as defined in spec 1.6 — denominator: Codex's Aug 16 literal census; families named in 1.6 are mandatory, not exhaustive
>
> Method for the readers column: AST / data-flow (the Aug 28 env-census method), reachability from run-empire-v2.js. A grep hit is not a reader.
>
> Rules: Fourth Shape; nothing works until proven; a row with an empty readers column says "none", never blank. Proposed disposition follows the bucket rule in spec 1.1–1.2; anything you cannot place is HOLD-NEEDS-OWNER — never guess. Report counts per surface and per disposition. Footer: WHAT I DID / DID NOT DO / ASSUMED, or the packet is void. Packet per ruling 7. HOLD for cold-pull by Fable and Sol.

## Deviations from dispatch text, named

1. **Output path.** Dispatch says `ogz-meta/inbox/codex/<date>/stop1-manifest/`. Ruling 7 (standing law, 2026-08-29) says every packet lands in the executing agent's own directory, "never another agent's." Delivered to `ogz-meta/inbox/cc/2026-09-06/stop1-manifest/`. If Trey rules the codex path was intentional, the move is one `git mv`.
2. **Disposition authority.** Enumeration ran on auxiliary agents (Sonnet, Ruling 8 telemetry frames — no verdict authority). Every proposed_disposition is copied mechanically from the ruled mappings in STOP1-CONFIG-SORT (Fable's proposals + Trey's Sept 3-6 rulings) or set to HOLD-NEEDS-OWNER. No enumeration agent placed a leaf by its own judgment; final column ownership is CC (Fable-class seat).

## Inputs on the box

- ogz-meta/inbox/cc/2026-09-06/STOP1-BOUNDARY-MISSION-2026-09-06.md (spec; 1.6 = manifest spec, 1.1-1.2 = bucket rule)
- ogz-meta/inbox/cc/2026-09-06/STOP1-CONFIG-SORT-2026-09-05-FABLE.md (starting list, ruled category mappings)
- ogz-meta/inbox/amp/2026-08-28/env-census.md (env bypass-reader denominator)
- ogz-meta/inbox/codex/2026-08-16/config-truth-census-pass0.md (literal-surface denominator)
