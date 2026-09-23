# Evidence

verify.cjs executes the parent's actual ConfigLoader with isolated canonical byte copies and only this candidate's three changed values. receipt.json records declared inputs, exact hashes, six candidate observations (default/paper/production, with/without contradictory ambient live flags), and matching parent observations. No private .env, bot boot or broker action. This establishes configuration output, not deployed paper execution.

Use receipt-exact.json for committed-byte identity. The original receipt.json used semantically identical but reformatted candidate JSON and failed the subsequent exact-byte staging comparison. The second run preserves the original formatting and matches the staged config bytes exactly. Both observations are retained; neither establishes deployed behavior.
