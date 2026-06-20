# OGZPrime Design System Zip v2 Intake Review

Date: 2026-06-20
Scope: `ogz-meta/ledger/frontend/OGZPrime Design System (1).zip`
Extracted for inspection only: `ogz-meta/cognition-history/frontend-intake/2026-06-20-ogzprime-design-system-v2/`

## Verdict

This second package fixes the first package's deployment mismatch by adding:

- `public/unified-dashboard-v2_production.html`

That file keeps the original production CSS filenames while preserving the enhanced dashboard shell. This is the correct shell to use if the enhanced CSS files are deployed by replacing the original CSS contents and dropping the `_new` suffix.

It still must be deployed as an overlay onto the current server tree, not as a wholesale `public/` replacement.

## Confirmed Compatible

- `public/unified-dashboard-v2_production.html` keeps the same 47 JavaScript imports as current `public/unified-dashboard-v2.html`.
- `public/unified-dashboard-v2_production.html` has 20 CSS imports and none use `_new.css`.
- The zip's included 47 JavaScript files are byte-identical to the current repo for those paths.
- The production shell keeps `<meta name="ws-token" content="">`; it does not inject `WEBSOCKET_AUTH_TOKEN`.
- No `localhost` or `127.0.0.1` references were found in the extracted `public/` tree.

## Still Not a Full Public Replacement

Current repo `public/js` has 49 files. The zip has 47 files.

Missing from the zip:

- `public/js/chart.js`
- `public/js/panels/chain-of-thought.js`

Those are not a problem for overlay deployment because the current server tree already has them. They are a problem if someone replaces the whole `public/js` directory with the zip copy.

## Changed CSS Payload

As in the first package, only three `_new.css` files differ from their originals:

- `public/css/header-brand_new.css`
- `public/css/panels/header-strip_new.css`
- `public/css/panels/cyberpunk-polish_new.css`

The other 17 `_new.css` files are byte-identical copies.

## Required Asset

The changed CSS references:

- `/assets/logos/ogz-logo-white.png`

The current repo `public/` tree does not already provide that asset. The zip contains it at:

- `assets/logos/ogz-logo-white.png`

For production, copy it to:

- `public/assets/logos/ogz-logo-white.png`

## Production Deployment Shape

Use this exact shape for a production replacement pass:

1. Copy `public/unified-dashboard-v2_production.html` over `public/unified-dashboard-v2.html`.
2. Copy the enhanced CSS contents into the original CSS paths:
   - `public/css/header-brand_new.css` -> `public/css/header-brand.css`
   - `public/css/panels/header-strip_new.css` -> `public/css/panels/header-strip.css`
   - `public/css/panels/cyberpunk-polish_new.css` -> `public/css/panels/cyberpunk-polish.css`
3. Copy `assets/logos/ogz-logo-white.png` to `public/assets/logos/ogz-logo-white.png`.
4. Do not replace current `public/js` wholesale.
5. Do not deploy `unified-dashboard-v2_new.html` as the production shell unless the `_new.css` files are also kept on the server.

## Production Shell Delta

Compared with current `public/unified-dashboard-v2.html`, the v2 production shell changes:

- Header comment/title from v2 to v3 enhanced wording.
- Adds one inline visual enhancement layer for dashboard panel hover/ring/gold-flash styling.
- Leaves all 47 script imports unchanged.
- Leaves dashboard WebSocket token posture empty/fail-closed.

## Required Verification Before Applying

Before live dashboard replacement:

1. Apply the overlay on a branch.
2. Run static request checks for all CSS, JS, image, and font refs.
3. Run `npm run scan:secrets`.
4. Run the dashboard token containment tests if this shell is served publicly.
5. Capture desktop and mobile screenshots.
6. Confirm the dashboard still receives live backend events after auth token setup.

