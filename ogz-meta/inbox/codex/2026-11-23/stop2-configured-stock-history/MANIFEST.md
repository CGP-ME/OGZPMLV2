# Evidence manifest

Source: actual authenticated public dashboard, direct Alpaca historical-bars GETs, canonical disk config, live PM2 metadata and the previously activated source manifest. Captured November 23, 2026 UTC from checkout `959583dc2b454fd606d6f488c217bbcbc393d779`.

Why kept: extend Stop 2 history verification to all five configured stocks and all seven native frames, distinguish response delivery from value correctness, and preserve differing forming bars without inventing a defect or claiming simultaneous equality.

- `wire-observation.json`: requests, returned counts, first/last bars, live update counts and settings provenance.
- `history-validation.json`: all 35 response-shape/order/value checks and named absences.
- `native-comparison.json`: exact provider comparisons, including all 19 differing fields and the original incomplete result.
- `comparison-interpretation.json`: classification by whether each candle was closed when the dashboard received it.
- `runtime-status.json`: loaded configuration evidence, stable process identities and activated source/config hashes.
- `private-evidence-manifest.json`: original private captures, provider response and observation-script hashes plus command outcomes.
- `RECEIPTS.md`: interpretation and remaining acceptance.

Raw private state/wire messages, provider replies and credential-reading observation scripts remain in `private/`, outside this commit. No production files or settings were modified.
