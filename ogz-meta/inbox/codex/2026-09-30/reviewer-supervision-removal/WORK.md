# Work

One logical change: remove host supervision of reviewer response format and completion, retaining the adversarial panel and its receipts.

Earlier production review candidate: 5ca3c369188c3841c10593d8ece061f57f21886a; baseline c080995a94d322a61950ee606d4f667c9dfe63c0. Six implementation/test paths plus the scoped CHANGELOG entry: mercury.config.json; test/mercury-react-loop.test.js; trai_brain/mercury-bridge/{react-loop,explicit-continuation,evidence-ingestion,adversarial-review}.js. Historical candidate and harness identities remain in review-identities.json.

Removed compulsory candidate phases, schema rejection/retry loops, repeated rejection impasse stops, discovery re-registration, and whole-file-read verdict acceptance. Source and schema diagnostics remain receipts. Physical request sizing, source identity, access controls, actual provider failures, agent restrictions, and substantive Fable-requested Mercury rechecks remain. Raw continuation answers are returned unchanged.

Mechanical fixtures preserve original claims, raw answers, incomplete read coverage, source testimony, serializable rechecks, and per-phase accounting. They do not prove semantic correctness. Live review and final commit identity are recorded in REVIEW.md/EVIDENCE.md when available. This packet belongs to the atomic commit containing it, so its enclosing Git commit is the delivery SHA.

Trey specified delivery order: supervision-removal commit, separate continuation transport repair, then remaining Stop1 lanes. The completed fourth review used separately qualified harness 55361b324d94f1e8ae6e07a18d4780629cc793a6. The focused follow-up uses a8cac1feb7018bdd358d929077ec8de19dbb6e98, which additionally fixes stale parsed-verdict inheritance. Both exact two-file harness patches and qualification receipts are preserved under continuation/. They are evidence for the review implementation, not production changes in this removal commit. Eight exact-harness tests qualify the latest mechanics; the external panel supplies semantic review.

Final prompt completion: candidate be416a802443e2b27df69365c9a18e1123977047 removes the remaining mandatory Phase-1/candidate-submission instructions in evidence-ingestion.js. Optional receipt indexing remains; actual answers are retained. Exact behavior verification is followup/final-ingestion-proof.json, including complete scripted request/response transcripts and pinned source hash. Review harness a5ecf975923c1c024ee98adf849016181dd6e482 adds the same three prompt hunks to a8cac1f. These are part of the same supervisor-removal change, not another independent migration.

Final source candidate8cfb8d1c5837b279c9b09a7afdbeda8f5706f6cb follows the clean semantic review of be416a8 with unused citation-normalizer cleanup (definition/export/test-only references). Incremental review has its own receipt; no other production change was added. The latest harness a5ecf975 is a separately qualified implementation and is not staged as production here.

Delivery is the atomic commit containing this packet and the seven selected implementation/test/changelog paths. Final source blobs are checked against8cfb8d1; packet-only additions do not change the reviewed implementation. Full panel conclusion and its limitations are in REVIEW.md.
