# Live Webhook Dry-Run Startup Guard Mercury Adjudication

Mercury pass history:

- First pass found a real architecture gap: `ConfigLoader` rejected the illegal
  live webhook dry-run posture, but direct `WebhookOrderAdapter` construction
  could still accept `enabled:true`, `dryRun:true`, and live context. Fixed by
  adding the adapter constructor invariant.
- Second pass found a real live URL posture gap: enabled live webhook routes
  could still be silently disabled by adapter URL validation. Fixed by making
  `ConfigLoader` and `WebhookOrderAdapter` hard-fail missing, malformed, and
  non-https SignalStack URLs in live/enabled posture.
- Final pass still claimed a runtime live-mode flip could bypass the guard. This
  is not a current code path: `rg` found no `setLiveTrading`, `toggleLive`, or
  runtime live-mode setter. `run-empire-v2.js` derives `enableLiveTrading` once
  from `resolvedConfig.config.mode.liveTrading || this.pipeline.executionMode ===
  'live'` before adapter construction.
- Final pass also repeated a payload-shape concern. That is pre-existing and not
  from this patch. `core/WebhookOrderAdapter.js` documents the verified
  SignalStack payload shape as `{symbol, quantity, action}` and notes the old
  `{ticker, qty, order_type}` shape was rejected.

Post-adjudication status:

- Real startup illegal posture is blocked by `ConfigLoader`.
- Direct adapter construction in live dry-run posture is blocked by
  `WebhookOrderAdapter`.
- Missing, malformed, and non-https live SignalStack URLs hard-fail before a
  silently disabled webhook route can run.
- Direct live broker mode remains allowed when `WEBHOOK_ORDERS_ENABLED=false`.
