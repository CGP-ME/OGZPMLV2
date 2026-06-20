# OGZPrime Design System Zip Intake Review

Date: 2026-06-20
Scope: `ogz-meta/ledger/frontend/OGZPrime Design System.zip`
Extracted for inspection only: `ogz-meta/cognition-history/frontend-intake/2026-06-20-ogzprime-design-system/`

## Verdict

The package can bolt onto the current dashboard architecture as a visual skin, but it is not safe to deploy exactly as the prose instructions describe.

The current production shell and the zip's `public/unified-dashboard-v2.html` are byte-identical, so the package was built from the current dashboard shell:

- Current repo shell SHA256: `58a9d4369a04f413dd5f534d24776c7cbfed403ae40a8902af33e9f21d2aa353`
- Zip original shell SHA256: `58a9d4369a04f413dd5f534d24776c7cbfed403ae40a8902af33e9f21d2aa353`
- Zip enhanced shell SHA256: `227b35cb065f2d8278debaa2ea74906181266a2fa292593d106c59602bd282d2`

The enhanced shell preserves the same 47 production JavaScript imports as the current shell. The zip's referenced JavaScript files are reference copies, not a full standalone replacement for `public/`.

## Confirmed Compatible

- `public/unified-dashboard-v2_new.html` keeps the same 47 script imports as current production.
- The zip original shell is byte-identical to current `public/unified-dashboard-v2.html`.
- The enhanced shell keeps `<meta name="ws-token" content="">`; it does not inject `WEBSOCKET_AUTH_TOKEN`.
- The enhanced CSS references the existing dashboard variables already present in the shell.
- All 20 `_new.css` files referenced by the enhanced shell exist inside the extracted package.
- Only 3 enhanced CSS files differ from their originals:
  - `public/css/header-brand_new.css`
  - `public/css/panels/header-strip_new.css`
  - `public/css/panels/cyberpunk-polish_new.css`
- The remaining 17 `_new.css` files are byte-identical copies of current CSS.

## Deployment Blocker

The package instructions say:

1. Replace `public/unified-dashboard-v2.html` with `public/unified-dashboard-v2_new.html`.
2. Replace original CSS files with `*_new.css` files after dropping the `_new` suffix.

Those two steps conflict. The enhanced HTML still requests `_new.css` paths. If the `_new.css` files are renamed away, the page will request 20 missing stylesheets.

Affected paths:

- `/css/dashboard_new.css`
- `/css/trading-panel_new.css`
- `/css/asset-tf-card_new.css`
- `/css/header-brand_new.css`
- `/css/golden-proximity_new.css`
- `/css/pattern-sparkline_new.css`
- `/css/panels/news-ticker_new.css`
- `/css/panels/watchlist-strip_new.css`
- `/css/panels/pattern-card_new.css`
- `/css/panels/header-strip_new.css`
- `/css/panels/trai-brain_new.css`
- `/css/panels/open-positions_new.css`
- `/css/panels/chain-of-thought_new.css`
- `/css/panels/equity-curve_new.css`
- `/css/panels/system-health_new.css`
- `/css/panels/live-readouts_new.css`
- `/css/panels/cyberpunk-polish_new.css`
- `/css/panels/chart-panel_new.css`
- `/css/panels/edge-analytics-panel_new.css`
- `/css/layouts_new.css`

## Required Asset

The changed CSS references:

- `/assets/logos/ogz-logo-white.png`

The current repo `public/` tree does not already provide that asset. The asset exists in the zip at:

- `assets/logos/ogz-logo-white.png`

For production, it must be copied into a public URL path that resolves as `/assets/logos/ogz-logo-white.png`.

## Safe Deployment Shapes

Use one of these, not a hybrid.

### Preview Mode

Keep `unified-dashboard-v2_new.html` and all `_new.css` filenames intact. Add the logo asset under `public/assets/logos/`. Serve the enhanced shell on a non-production route first and verify with browser screenshots and request checks.

### Production Replacement Mode

Strip `_new` from the CSS refs inside the enhanced HTML, then replace the original CSS file contents with the enhanced CSS contents. Add the logo asset under `public/assets/logos/`.

This mode avoids carrying duplicate `_new.css` files in production, but it must be verified with a browser request pass before deploy.

## Do Not Do

- Do not replace the whole current `public/` tree with the zip's `public/` tree. The zip is incomplete as a standalone public tree.
- Do not deploy the enhanced HTML unchanged while renaming `_new.css` files away.
- Do not copy runtime JavaScript from the zip over current production JavaScript unless a separate JS parity review approves it.

## Next Verification Before Live Use

Before deploying this package to the live dashboard:

1. Choose preview mode or production replacement mode.
2. Confirm every CSS, JS, image, and font request returns 200.
3. Confirm the dashboard WebSocket token posture remains empty/fail-closed unless a session ticket/token is explicitly set.
4. Capture desktop and mobile screenshots.
5. Confirm header logo renders and panels do not overlap.

