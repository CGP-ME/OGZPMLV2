# Stop 2: selected-asset identity on the legacy dashboard card

The served legacy dashboard displayed an NVDA chart and price beneath a SOL-USD card label. The card's obsolete `#symbolSelector` reference could not follow the actual `#assetSelector`; a separate unfiltered `price` listener then overwrote its label with whichever stock or crypto message arrived last. Its price already followed the chart-filtered `#currentPrice` element. This is a reproduced display-identity defect, not a trading-order incident.

The repair makes the existing card mirror the actual chart selector and removes the competing price listener, its helper and its attachment retry. It removes the hardcoded TSLA fallback from that label path. The existing price observer and timeframe-pill controls stay in place. Both active HTML entry points receive a new script URL version; the legacy HTML comment names the correct selector. The v2 page includes this script but has no card markup, so the module's existing absent-card behavior remains inactive there. No bot configuration, broker, strategy or order path changes.

## Executed behavior

[Paired Chromium observation](paired-browser.json) ran the served baseline and exact candidate source in separate browser contexts against the live authenticated market-data WebSocket. Candidate files were substituted only in the observer's browser before source delivery. Both contexts selected NVDA, COIN and TSLA and received price traffic for all five configured stocks plus BTC-USD, ETH-USD and SOL-USD.

- Baseline: 300 of 300 sampled labels disagreed with the selected asset; price mirrored the chart correctly.
- Candidate: all 300 sampled labels matched; all 300 price mirrors matched. Missing current prices remained `--` during selection changes, then displayed observed prices.
- Both contexts' existing timeframe pill selected and marked 5m. No page exceptions or blocked write commands occurred.
- The contexts had no operator dashboard session, so `/api/dashboard/session-ticket` and `/api/supervisor/recovery` returned HTTP 401. Market-data WebSocket authentication succeeded; no operator-session functionality is claimed verified.

The observer used the already installed Chromium/runtime, imported no trading module, sent only allowlisted read/display commands, and blocked HTTP writes. No Jest or synthetic trading result was introduced. Private observer scripts, screenshots and their hashes are listed in [the evidence manifest](private-evidence-manifest.json).

## Review and disagreement

The [source identity](source-identity.json) pins the three production files to tree `2c118110f8250ba29c005ee1a21508b3255be478` against `b9df401ba7673d852176bfe6ab4b294db7037f30`; a separate temporary index kept the live served source unchanged during review. The inherited Mercury harness is identified separately. Both paid dispatches asked one question about card identity, with 7,750 output tokens and no iteration limit.

Mercury's [initial answer](mercury-initial-answer.md) returned `found_break`, interpreting an April comment as requiring the card to identify the traded session. The author supplied the competing chart-identity interpretation and live observations for evidence exchange. An attempt to attach the inbox document was rejected before provider dispatch by repository exclusions. No exclusion or hook changed and no evidence was relocated into the canonical corpus. The next query explicitly labeled the observations as query context, not host-attested canonical evidence.

Mercury's [subsequent answer](mercury-answer.md) independently traced the current multi-symbol broadcasts and chart filtering, returning `no_break_found` and nonblocking. The production candidate was unchanged. The initial answer and historical interpretation remain preserved; the later answer explicitly qualifies its own source-only scope. This is one selected Mercury seat updating its finding, not two independent votes or full-panel approval. [Review identities, usage and limitations](review.json) retain the metadata warnings and both outcomes. Executed browser evidence supplies the behavior proof separately. The subsequent answer calls the unchanged existence check an added guard; the candidate diff adds no guard.

## Activation boundary

These static frontend files take effect on a fresh page load; existing open pages retain their loaded JavaScript until reloaded. Delivery needs no PM2 restart or environment change. The initial commit records candidate-browser proof; a subsequent served-page observation will record the actual published behavior. This repair does not close the entire Stop 2 or certify account balances, strategy choices or profitability.
