"use strict";
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../../../../../..');
const out = path.resolve(__dirname, '..');
const loader = require(path.join(root, 'foundation/ConfigLoader'));
const view = loader.getSettingsView();
const settings = JSON.parse(fs.readFileSync(path.join(root, 'config/settings.json')));
const internals = JSON.parse(fs.readFileSync(path.join(root, 'config/internals.json')));
function leaves(value, prefix = '') {
  if (value && typeof value === 'object' && Object.keys(value).length) return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? prefix + '.' + key : key));
  return [prefix];
}
function read(obj, dotted) { return dotted.split('.').reduce((v, key) => v == null ? undefined : v[key], obj); }
const canonical = leaves(settings);
const profiles = Object.keys(settings.launchProfiles).filter(k => settings.launchProfiles[k] && typeof settings.launchProfiles[k] === 'object');
const rows = Object.entries(view.fields).map(([key, field]) => {
  const active = field.scope === 'active_launch_profile';
  const canonicalPath = active ? 'launchProfiles.' + view.profile + '.' + key : key;
  const profilePaths = active ? profiles.map(profile => 'launchProfiles.' + profile + '.' + key) : [canonicalPath];
  const targets = canonical.filter(k => profilePaths.some(p => k === p || k.startsWith(p + '.')));
  const valueMatchesOwner = JSON.stringify(read(settings, canonicalPath)) === JSON.stringify(field.value);
  const {value, ...descriptor} = field;
  return { key, owner: 'config/settings.json', canonicalPath, coveredCanonicalKeys: targets, valueMatchesOwner, descriptor,
    bindingEvidence: ['foundation/ConfigLoader.js:4261-4271', 'foundation/ConfigLoader.js:4324-4331', 'foundation/ConfigLoader.js:4422-4442', 'core/WebSocketManager.js:124-135', 'public/js/panels/configuration-settings.js:493-545'],
    runtimeEffectStatus: 'not_executed_in_this_mapping', acceptance: 'Save through the authenticated owner in isolation, verify exact persistence/reload target and actual consumer at the descriptor effect boundary; keep declared effect separate from runtime proof.' };
});
const sourceFiles = ['config/settings.json','config/internals.json','foundation/ConfigLoader.js','public/js/panels/configuration-settings.js','core/WebSocketManager.js','ogzprime-ssl-server.js'];
const sources = sourceFiles.map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex') }));
const summary = { canonicalLeaves: {settings:canonical.length,internals:leaves(internals).length}, descriptors:rows.length, activeProfileDescriptors:rows.filter(r=>r.descriptor.scope==='active_launch_profile').length, selectedProfile:view.profile, descriptorWithoutCanonicalTarget: rows.filter(r=>!r.coveredCanonicalKeys.length).map(r=>r.key), valueOwnerMismatches:rows.filter(r=>!r.valueMatchesOwner).map(r=>r.key), sources, method:'Read-only current ConfigLoader view, exact canonical write-path and array/profile expansion. No save, network, bot startup, process control or behavior acceptance.' };
fs.writeFileSync(path.join(out,'ui-bindings.json'),JSON.stringify({summary,rows},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
