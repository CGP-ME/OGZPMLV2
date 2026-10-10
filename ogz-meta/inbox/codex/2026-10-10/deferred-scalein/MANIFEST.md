# Scale-in profit-toggle repair evidence

Source: candidate `dfe597e81c3d63e28b38f0b314a5a8f231bd98b5`, base `b93edddfbe136528e720bfb1b3e629ada50749cd`.
Date: 2026-10-10.
Purpose: retain actual isolated save/contract/executor evidence and combined adversarial disposition for deferred item 28's profit-toggle repair.

The source receipt records exact exported paths and SHA-256 hashes. Source copies and private provider logs remain local, outside this commit. Recreate the isolated export from the candidate tree before running fixtures; never point probes at the working production configuration. `fixtures/probe-scalein-profit-toggle.cjs` accepts an isolated OrderExecutor.js copy under this packet's fixtures directory. `fixtures/save-contract.cjs` requires the isolated sourceRoot in the receipt and restores only that copy's settings.

The raw Mercury verdict is found_break. The disposition separates inherited allegations and refuted claims from the repaired behavior; it does not certify the entire bot. Trigger classification and sizing-ladder intent remain deferred. No runtime activation.
