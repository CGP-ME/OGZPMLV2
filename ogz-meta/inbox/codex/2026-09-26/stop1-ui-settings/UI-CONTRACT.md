# UI settings connection — first delivered slice, not the final field inventory

Use the existing `/ws` connection, same-origin dashboard session cookie and one-use ticket. After `auth_success`, identify as `{type:"identify", source:"dashboard"}`. Never put the long-lived WebSocket token in HTML or client storage. This change does not alter the existing session endpoints or authorize deployment.

## Read

Send `{type:"get_settings", requestId:"<fresh correlation ID>"}`. Each connected, bot-authenticated owner returns `settings_result` with that requestId, relay-stamped `ownerId`, `success`, `profile`, `configuration`, and `fields`.

Select the owner explicitly; do not take the first reply as an implicit target. Multiple owners can reply. Connection IDs expire on disconnect: re-read and reselect after reconnect. No connected owner produces `bot_unavailable`, not fabricated values.

`configuration` carries `fingerprint`, `role`, `settings` (revision), `internals` (revision), `settingsHash`, and `internalsHash`. These describe the responding process's loaded configuration, not another connected process or proof of a trade.

`fields` is keyed by effective dotted config path. Render only returned fields. Each entry supplies `value`, `type`, `unit`, `label`, `source`, `effect`, `editable`, and numeric bounds where applicable. No frontend fallback defaults. An absent field is not an enabled or saved control.

| Delivered path | UI value conversion | Effect |
| --- | --- | --- |
| confidence.minTradeConfidence | Stored fraction: 0.5 displays as 50%; divide percent input by 100 before saving. | Next entry decision; writes only the active launch profile's confidence setting. |
| filters.atrEnabled | Boolean, preserve false. | Next strategy evaluation; existing ATR entry filter, not a newly introduced gate. |
| filters.atrMinPercent | Already percent: 0.4 displays as 0.4%, not 40%. | Next strategy evaluation using the global threshold. A strategy's explicit ATR contract threshold takes precedence; this field does not overwrite it. |

## Save

```json
{
  "type": "save_settings",
  "requestId": "ui-edit-unique-id",
  "ownerId": "<ownerId from the selected read response>",
  "expectedRevision": 2,
  "expectedSettingsHash": "<settingsHash from that same response>",
  "changes": {"confidence.minTradeConfidence": 0.55}
}
```

The example revision is illustrative; always send the revision and hash just read, never hardcode them. Changes are an atomic request: an invalid/unsupported field rejects the entire edit. Only the three delivered fields are currently accepted. Saves do not edit internals, broker identity, execution mode, credentials, or existing trade exits. Paper/live activation and profile switching are not settings-save operations.

Successful `settings_result` returns `saved:true`, `applied:true`, and the new complete view. Replace local values and revision with that response. Match both requestId and ownerId: responses are visible to the authenticated dashboards sharing this relay. Do not mark success on socket send or optimistic local state alone.

Failure returns `success:false`, `saved:false`, `applied:false`, and `reason`. Invalid requests/values, unsupported paths and empty edits require correction. `settings_revision_changed` requires a re-read and explicit reconciliation; do not silently retry over another change. `settings_changed_outside_loaded_owner` means disk and this process diverged; the UI must report it, not invent an overwrite/reload. `settings_owner_unavailable` means rediscover owners. `settings_read_failed` / `settings_save_failed` leave this owner's accepted snapshot unchanged and report the error locally. A descriptor-owned backtest is not mutated by this route. Replaying an old save after success is a stale revision, not a fresh write.

## Not ready to advertise yet

The complete customer field inventory, sizing/strategy/session controls, and separate per-trade stop editing remain unlanded. Do not implement the historical 139-field draft as a finished contract. The envelope can be wired now, but the final complete UI field list is still owed.

The isolated recorded-candle exercise also reproduced an inherited RSI exit-hint producer defect after the changed ATR filter admits the signal. Read/save correctness does not prove successful entry execution. Stop 1 remains open; no production bot/relay restart, real browser rendering, or paper-trading acceptance is claimed.
