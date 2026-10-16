# Signed TwoPole extreme threshold

The reviewed candidate and exact source blobs are recorded in source-manifest.json. The actual confidence calculation ignored extremeOversold and used the positive threshold for both signs. It now reads each configured signed extreme. The existing canonical -1/+1 values retain their behavior. The editable descriptor uses the same finite numeric domain and new-engine initialization lifetime as extremeOverbought. No new validation gate or preset is added; confidenceBase is untouched.

Isolated execution uses the actual ConfigLoader and oscillator. Baseline rejects the lower-threshold save; candidate persists it, reconstructs the loader, and supplies it to a fresh instance. The retained instance remains unchanged, as the descriptor states. Assertions cover asymmetric positive/negative thresholds and 27 input pairs preserving default behavior.

Reproduce with `python3 ogz-meta/inbox/codex/2026-10-16/config-closure/consumer-repairs/two-pole-extreme/reproduce.py`. It reconstructs the pinned Git blobs and invokes the required isolation launcher; no runtime state or credentials are used.

Mercury run 2026-10-16T21-22-23-007Z-da31d3b6b4cf returned no_break_found, covering both changed files. Raw answer is preserved in final-delivery-review-answer.txt. No PM2 restart or runtime activation.
