# Work

Parent c56ea06a66bf6ef07a625fe542f73bc1f0c0a229 on astra-era. In the actual c0292498 review, raw mercury-20 output has a ProfitExitPlanner tool marker but no foundation/ConfigLoader.js:160-191 citation. normalizeToolHandleCitations attached that marker to an earlier nearby ConfigLoader path, creating the false citation in the final answer. Blame traces the conversion to 0a8fc6c7 (June 23), widened at 4673a033 (June 25): inherited, not a new Stop 1 defect.

Removed only that guessed-path transform. Kept literal file/line prose normalization and the existing tool_handle_citation/missing_file_line_citation flags. No source lookups, substitutions, new rejection condition, helper, module, setting or bot behavior added. Updated the two existing tests that demanded ambiguous conversion to demand marker preservation; no new suite or Jest execution.

Code search found the actual loop caller and the exported helper, plus four legacy test cases. Actual captured-response replay now preserves the entire answer byte-for-byte while reporting unsupported citations. This does not fix the model's incorrect claims or incomplete investigation.
