Dynamic configuration handoff for the UI agent
Source commit: 2cf37db622e947a8959025fa53cf6cb97fe34e40

settings.json is an exact snapshot of committed config/settings.json.
editable-fields.json contains 1372 descriptors from that committed loader,
exported using an isolated paper profile and dummy credentials. No credentials
or live owner receipt are included. The count includes separate per-strategy
controls; it is not a recommendation to show one huge undifferentiated form.

Profit management now lives at exitContracts.<strategy>.profitManagement.
The former shared exitLogic and exits owners are removed. Present settings
under their strategy so an RSI exit edit does not silently change momentum,
Donchian, or another strategy. Both dynamic config and UI descriptors use
these canonical paths; do not add computed compatibility aliases.

config/settings.json remains the only dynamic runtime owner;
config/internals.json remains the static owner. These handoff copies are
reference snapshots, never another source loaded by the bot or browser.
The earlier 2026-10-10 snapshot is retained as history and is superseded here.

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


Use current values, available descriptors, revision/hash, active profile and
ownerId from the running bot. A snapshot cannot establish what a running
process loaded. Do not expose every JSON leaf as a customer control.

The initial research-informed exit values are in this snapshot. Automatic
managed break-even, scale-out, and tiered profit-taking start disabled. Each
strategy retains its own stop, target and trail behavior. These numbers are
starting candidates, not validated profitability claims.

Stop 1 and Stop 2 are not certified complete by this handoff. Dormant-feature
intent decisions and operational acceptance remain open in CHANGELOG.md.
No PM2 restart or runtime activation was performed.
