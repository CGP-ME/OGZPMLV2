# Review

## Applied panel

The admissible content review is run
`2026-08-30T08-17-08-270Z-7244d0cf0482`. Mercury was invoked agentically with
the broad visible frame `Mercury, break my fix.`, 60 maximum iterations, 7750
maximum tokens, history, and adversarial review. Because `mercury.ignore`
excludes `inbox/`, the host supplied attested excerpts and hashes rather than
claiming model-tool access.

- Mercury: `answer_given`, 9 iterations, initial `no_break_found`; model tools
  enabled. Its initial answer incorrectly treated ignored files as absent.
- Fable challenger: requested Fable; applied verdict model `claude-fable-5`;
  identity `matched`, authority `full`, no undocumented model and no transition.
  Auxiliary Haiku frames were recorded without verdict authority. Fable had no
  file tools and opened no files mechanically.
- Mercury bounded recheck: `answer_given`, 9 iterations, no quality flags. It
  used 8 model-tool calls: 4 succeeded and 4 failed because inbox opens were
  blocked by `mercury.ignore`; it mechanically opened only
  `ogz-meta/REPO-HISTORY.md` ranges and verified lines 22–25.
- Kimi tie-break: applied `kimi-k3`, identity `matched`, authority `full`, no
  tools or mechanically opened files, termination `stop`, parsed verdict `pass`
  with `blocking=false` because Mercury and Fable had converged.
- All provider errors were null. Quarantines were empty. No ntfy receipt was
  generated.

## Attacks and mechanical adjudication

1. **Allegation: the Part A files do not exist.** Rejected. Host `git status`
   shows the six new files. Mercury's own failed open calls prove only that
   `mercury.ignore:19` blocks `inbox/`, not absence.
2. **Allegation: placeholder evidence and review files violate rulings 7/7a.**
   Sustained against the reviewed draft. This final packet replaces those
   placeholders with probes, run IDs, attacks, adjudications, named absences,
   and embedded redacted tapes with dual hashes.
3. **Allegation: the self-reference mechanism may not exist.** Rejected.
   `ogz-meta/REPO-HISTORY.md:22-25` expressly establishes predecessor-SHA
   self-reference. `WORK.md` uses the current parent
   `8162d5fdee5994306e996d642ac773eea086ccef` and does not invent its own SHA.
4. **Allegation: omitted host-attested MISSION lines make MISSION non-verbatim.**
   Rejected as a claim about the file; `MISSION.md` contains the complete
   dispatch verbatim. Sustained only as a review limitation: lines 3 and 37 were
   not supplied to providers because the evidence-source secret gate rejected
   them, and `EVIDENCE.md` names that absence.
5. **Allegation: rulings or supersession text may diverge.** Rejected by exact
   line-based host comparison. Rulings 1–9 and the protected-path supersession
   sentence match the corresponding tasking text exactly.
6. **Allegation: zero diff means the packet is committed or the checkout is
   wrong.** Rejected. The host branch and parent were mechanically verified;
   the zero model diff is explained by the existing inbox ignore filter.

Earlier runs are inadmissible for Part A because they reviewed the predecessor,
were interrupted, or saw an empty ignored diff. Their allegations and
reconciliation chains are preserved in `EVIDENCE.md`; none establishes a Part A
defect.

The final broad rerun, `2026-08-30T08-26-36-764Z-798151de4405`, was capped
`UNVERIFIED` because the descriptors' excerpts were not present in its bare
query. Its eight fail-loud quarantines and max-priority ntfy HTTP 200 receipts
are preserved. The focused reconciliation,
`2026-08-30T08-30-31-483Z-b7352bdef4da`, had zero descriptor quarantines and
correctly reduced the unresolved questions to tape completeness and explicit
intent. Host verification resolves both: all six JSONL lines and every raw file
from all seven attempt directories are embedded one-to-one with dual hashes,
and Trey's specific ruling 7a task is the explicit intent required by
`OGZ-MASTER-ALIGNMENT.md:319`. Mercury's contrary “six lines, one entry” claim
is mechanically false.

## Verdict

The admissible panel found a real defect in the reviewed draft: incomplete
packet receipts. That defect is corrected in this final uncommitted packet.
The broad rerun failed its evidence gate; the focused reconciliation's two
remaining questions are resolved by reproducible host checks. Mechanical
adjudication finds no remaining Part A content defect. Final Codex verdict:
**PASS for atomic Part A commit**, with the named limitation that the inbox
ignore requires host-attested review and with genuine post-push Fable cold-pull
still required before Part B.
