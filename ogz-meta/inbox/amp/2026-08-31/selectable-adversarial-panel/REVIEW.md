# Review

> **NOT VERIFIED BY THE FULL ADVERSARIAL LAYER.** Internal run remained
> **UNVERIFIED** because Mercury quota failed, Fable rate-limited to documented
> Opus fallback, and surviving prompt-only seats lacked current-diff evidence.
> Trey explicitly authorized publication for review efficiency so Sol can
> cold-pull the immutable commit. Publication is not clearance; rollback/revert
> remains authorized if Sol rejects it. Mercury/Fable/Kimi deferred check-in
> remains owed.

## Panel as applied

The selected panel was Mercury, Fable, and Kimi. The clean post-fix run is
`2026-08-31T04-25-56-272Z-b074a8852ef8`.

- Mercury: failed seat, HTTP 402 free-tier quota absence, no applied model;
  max-priority ntfy receipt HTTP 200.
- Fable seat: trusted executable; Fable primary HTTP 429; documented Fable-seat
  fallback to Opus; applied verdict model `claude-opus-5`; auxiliary Haiku
  telemetry recorded without authority. No repository tools or current-diff
  evidence were available to that seat.
- Kimi: applied `kimi-k3`; no tools or current-diff evidence.
- Authority: `UNVERIFIED`; qualifying seats 2; agreement false; evidence checks
  false; rerun required.

## Allegations and mechanical dispositions

1. **Mercury HTTP 402 was treated as a successful answer.** Sustained against
   run 1. Corrected by requiring Mercury `termination=answer_given` plus a
   nonempty answer before seat success. Run 2 and run 3 stamp Mercury as a
   failed seat with `quota_or_rate_limit`.
2. **Two prompt-only seats could self-certify sufficient evidence.** Sustained
   against the run-2 implementation. Corrected: Fable/Kimi evidence checks need
   successful Mercury, host-attested evidence, or prior evidence-qualified
   Fable as applicable. Run 3 records both surviving seats false.
3. **No review target/current diff was available to Fable/Opus or Kimi.**
   Sustained as a run-3 limitation, not resolved. Their `blocked` and
   `needs_more_evidence` outputs remain allegations and cannot clear the diff.
4. **Quota/rate failure should not stop remaining selected seats.** Verified by
   run 3 and focused tests: Mercury absence was quarantined and both later seats
   ran.
5. **An unattested executable must still hard-stop.** Covered by focused unit
   test through the delegated hard-stop predicate. No unattested executable was
   actually executed.
6. **Unknown/empty selection could dispatch.** Rejected by parser tests and the
   direct unknown-reviewer no-dispatch probe.
7. **Named reviewer mixtures are hardcoded.** Rejected by inspection: the
   registry and generic ordered loop dispatch selected IDs; tests cover all
   nonempty subset shapes.

## Verdict

**UNVERIFIED — publication authorized, not clearance.** The internal panel did
not pass this change. Trey expressly authorized an immutable efficiency
publication so Sol can independently cold-pull and judge the exact commit. A
Sol rejection authorizes rollback/revert. Mercury/Fable/Kimi deferred check-in
remains owed and must not be represented as satisfied.
