# Introduced control behavior: bounded audit

Scope: production-source diffs in the 16 recovery commits between 7afd5be2 and 78de52d1; subsequent c0292498 prompt change and this artifact correction separately. This is not certification of the 25 rejected dirty Stop 1 files or every historic commit. Source/code inspection, not runtime proof.

Counted result:

- Zero new bot-wide shutdown/trading-refusal gates found in that landed range. The two bot changes restore uniqueNonEmptyStrings (26e80807) and change the production launch profile from live/confirmed to paper/unconfirmed (5271a2c0). The latter is a disclosed paper-start behavior change, not an assertion of no behavior change at all.
- One introduced Mercury-wide abort coupling confirmed: evidence artifact write/read before every reviewer. Writer c20609be, readback ba999ed0. This packet corrects that class through the already existing per-unit quarantine and authority cap; no universal claim about other abort paths.
- Two intentional reviewer restrictions: ee7ab717 removes executable run_check from the public tool registry/schema/docs; 49d24c28 requires candidate refiling after additional investigation. Both implement Trey's read-only/collect-before-deciding direction; neither controls the bot.
- Ten mission-local scripts were added by the last six commits through 78de52d1: three provider/index/replay launchers, four bounded observation drivers, and three receipt/index inspectors. These are additional tooling, not nothing added. Their own refusal/exit conditions remain visible; no claim of zero blocking logic anywhere. This correction adds no driver script.

Scripts: mercury-cli-stdin/{replay-fable,observe-transport}.cjs; mercury-reviewer-role/replay-kimi.cjs; mercury-failed-result/observe-handoff.cjs; mercury-read-only-tools/observe-interface.cjs; mercury-reviewer-evidence/observe-delivery.cjs; mercury-full-chain/{dispatch,capture-state,verify-index,inspect-review}.cjs. Paths are under the same 2026-09-24 inbox date.

Other distinctions checked: f4e3c230's answer_given recheck condition preserves the prior failure-skipping behavior after retaining failed investigation receipts; 7a3bd07f reports stdin transport failure rather than claiming delivery; 5ab460db records actual delivered line ranges without introducing the preexisting truncation limit; 95d7e29a preserves Fable's own answer instead of substituting Mercury's recheck. 906e61ae reinforces inherited whole-file/INHERITED/FOURTH-SHAPE obligations in the prompt; their application to Mercury remains unresolved and is not excused as "nothing added." 10a5ed3e added builder-doctrine indexing, then 9f1729c6 reverted it before an intervening index run; net zero is not omission of that mistake.

No independent runtime or whole-repository architectural clearance follows from this count. Existing missing-evidence ceilings and trust boundaries were not removed to manufacture PASS. The actual c0292498 full review still fails exhaustive investigation, independently of this I/O correction.
