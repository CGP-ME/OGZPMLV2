# Exit-selector review closure — 2026-10-02

Candidate 8fd757fce8958108741ed23bc552141087636299; base 4c22efe839a5a408b46840352943def280412784. Production change is exactly six removed runner lines, with changelog. Harness source/config pinned together to a5ecf975923c1c024ee98adf849016181dd6e482.

Mercury run 2026-10-02T12-08-11-248Z-836827b3dc1d completed in nine iterations: no_break_found, answer_given. It used grep, git_diff, find_references and Serena property references. Provider HTTP 503 recovered through the existing retry. The receipt identifies baseline tree 4b3901650c779d1834f2704ee1e4a407b2662fac, resolved from the base commit.

Independent gpt-6-astra review completed no_break_found with provider SSE identity verified. It searched 1,248 tracked source/config/script files and traced unchanged ECM, pattern exits, OrderExecutor, TradingLoop, and PolicyBuilder. Its initial attempt ended with usage-limit error; after Trey reported a reset, the same review was retried. Both full attempts are retained. Fable/Kimi were not invoked: unavailable subscriptions/balance were previously recorded and Trey selected Astra.

Astra correctly noted that the host proof originally compared an older baseline. Root changed the fixture to obtain its base from CANDIDATE.json and reran against actual parent 4c22efe8: baseline throws, candidate proceeds. Production bytes were unchanged. Both behavior receipts are retained; the final fixture hash is recorded in EVIDENCE.md. No unresolved source finding remains.

Mercury's assertion that searches mean no regression can occur is too broad. Its search is evidence of no named selector references, not every possible dynamic access or runtime behavior. Astra independently traced the retained exit owners. Neither reviewer executed tests; host proof executes only the constructor boundary. No full boot, broker, trade, exit-policy execution, PM2 activation or profitability is claimed.
