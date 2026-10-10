Dynamic configuration handoff for the UI agent
Source commit: 35b052087bdce29761028f515d124b7c74c3acae

settings.json is an exact copy of committed config/settings.json.
The static owner is config/internals.json. These handoff files are snapshots,
not additional runtime owners. Uncommitted working-tree changes are excluded.

editable-fields.json contains the 721 supported UI bindings, including types,
labels, units, bounds, and effect timing, exported from the committed loader.
Only expose fields offered by the running owner's get_settings response.
The complete settings file also preserves operator settings and declarations
whose intended behavior is deferred; do not turn every JSON leaf into a knob.

Use the existing authenticated dashboard transport:
- Send get_settings with a unique requestId.
- Read settings_result and select the returned ownerId.
- Send save_settings with that ownerId, a new requestId, expectedRevision
  from configuration.settings, expectedSettingsHash from
  configuration.settingsHash, and changes keyed by canonical dotted paths.
- Match the returned settings_result receipt to the request and owner.
- Obtain current values and revision/hash from the live owner; this archive
  contains no live receipt or credentials. Do not write the JSON file directly
  from the browser or introduce browser defaults as another config owner.
- Preserve the existing per-field effect timing and backend validation.
Reference controller: public/js/panels/configuration-settings.js.

Migration completion is not certification that every bot feature works.
Deferred operational/intent findings remain in:
ogz-meta/inbox/codex/2026-10-06/config-migration-followups.md
This includes concurrent multi-timeframe scanning and disconnected exit routes.
No PM2 restart or live activation was performed for this handoff.
