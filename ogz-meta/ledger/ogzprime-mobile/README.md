# OGZPrime Mobile — v1 (monitor cockpit)

An installable PWA that mirrors the OGZPrime dashboard on a phone. **Read-only.** It connects to an
OGZPrime dashboard WebSocket, performs the same handshake the desktop dashboard uses, and renders a
mobile cockpit: account/equity/PnL, open position, guardrails, broker/feed health, latest trades,
TRAI reasoning, and alerts.

## Why it's built this way

- **Monitor-only in v1.** No pause / resume / emergency-close buttons. Those are guarded operator
  controls and require backend command handlers (risk gate + command ledger + `traceId` +
  `operator_action` events) that do not exist in the engine yet. Shipping dead control buttons over a
  network is exactly the risk class we don't want — so they're deliberately omitted until Phase 3.
- **Connection target is a config value, not a hardcode.** Works against your own instance today and
  any customer instance later. The networking model (direct-to-VPS vs. a zero-knowledge relay) is a
  one-line change to the URL, not a rewrite.
- **Raw Frame Inspector included.** This client does not ship a guessed field map. It renders the
  actual frames your server sends and exposes every raw frame in the Inspect tab, so the cockpit field
  mappings get tightened against your real stream instead of fabricated. No fake data.

## Run it

It's static files — serve the folder over HTTPS (WebSocket auth + PWA install both require a secure
context, except on `localhost`).

```bash
# from this folder
npx serve .            # or: python3 -m http.server 8080
```

Open the URL on your phone (same network, or host it). On iOS/Android use the browser's
**Add to Home Screen** to install it as an app.

## Connect

1. Open the **Settings** tab.
2. **Bot WebSocket URL** — your dashboard server's WS endpoint, e.g. `wss://ogzprime.org/ws`
   (note the `/ws` path the server listens on).
3. **Auth token** — the current `WEBSOCKET_AUTH_TOKEN` for that instance. The app keeps this
   in page memory only; it is not saved to `localStorage`.
4. Tap **Connect**.

The client sends `{type:"auth",token}` as its first message, then `{type:"identify",source:"dashboard"}`,
then the server replays its cached snapshot frames and streams live updates.

> Since the public dashboard token was removed during the security containment, the server now fails
> closed — you must supply a valid token here for anything to connect. That's expected.

## What maps to what

| Cockpit element | Source frame (`type`) | Notes |
|---|---|---|
| Balance / Session & Total PnL / Win rate / Recovery | `state_update` | field names mapped defensively; verify in Inspect |
| Open position | `state_update` (`position`) | |
| Guardrails (risk / size / max loss) | `state_update` | best-effort keys; confirm against your stream |
| Broker & feed health | `broker_status` | one chip per broker/feed |
| TRAI reasoning + strategy stack | `bot_thinking` | |
| Latest trades | `trade` / `fill` / `trade_closed` / … | candidate types; map exact one via Inspect |
| Alerts | `alert` / `notification` / `warning` | |

The exact field names inside `state_update` come from your `public/js/websocket.js` parser, which was
not in the repo snapshot I had. So those mappings are inferred. **Point this at your live instance,
open the Inspect tab, and the real shapes will show** — then the maps get pinned exactly.

## Files

- `index.html` — app shell + cockpit markup + styles
- `app.js` — WebSocket client, auth handshake, reconnect, renderers, raw inspector
- `manifest.webmanifest` — PWA manifest (installable)
- `sw.js` — service worker (caches the shell only; never trading data)
- `icon.svg` — app icon

## Security posture (v1)

- The WebSocket URL is stored on-device. The token is not persisted; it is kept in page memory only,
  cleared on disconnect or reload, and sent only to the URL you set. This is a stopgap. The
  production path is short-lived session tickets per the Phase 0 auth spec, not a stored long-lived
  token.
- Service worker caches the static shell only. No trade data, token, or WS traffic is cached.
- All dynamic text is HTML-escaped before render (defense against a hostile/poisoned frame).

## Deferred / open

- **Operator controls** — Phase 3, after backend command handlers exist.
- **Push notifications** — Phase 2 (Web Push/VAPID). iOS PWA push is supported but finicky; worth a
  real decision before promising it as the headline feature.
- **Connection model** — direct-to-instance vs. hosted zero-knowledge relay. Left open by design;
  v1 works in the direct model and the relay wraps it later without touching the cockpit.
- **Real field maps** — pinned once this runs against a live OGZPrime stream (see Inspect tab).

This folder is self-contained and not served by production routes. It does not touch the engine code.
