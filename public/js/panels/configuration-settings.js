/* Existing settings API consumer. Drafts belong to the exact relay owner. */
(function (OGZ) {
    'use strict';
    const owners = new Map();
    const outstanding = new Map();
    const readOwners = new Set();
    const WAIT_MS = 15000;
    let socket, root, select, fields, status, identity, saveButton, refreshButton, reviewButton, discardButton;
    let selected = '', readId = null, readTimer = null, pending = null;

    function node(tag, text, className) {
        const el = document.createElement(tag);
        if (text !== undefined) el.textContent = text;
        if (className) el.className = className;
        return el;
    }
    function requestId() { return window.crypto.randomUUID(); }
    function sameIdentity(a, b) {
        return a && b && a.settings === b.settings && a.settingsHash === b.settingsHash
            && a.fingerprint === b.fingerprint;
    }
    function validView(data) {
        return typeof data.ownerId === 'string' && data.ownerId.length > 0
            && Number.isSafeInteger(data.configuration?.settings)
            && typeof data.configuration?.settingsHash === 'string' && data.configuration.settingsHash.length > 0
            && typeof data.configuration?.fingerprint === 'string'
            && data.fields && typeof data.fields === 'object' && !Array.isArray(data.fields)
            && Object.values(data.fields).every(field => field && typeof field === 'object');
    }
    function message(text) { status.textContent = text; }
    function changed(owner) { return Object.keys(owner.draft).length > 0; }
    function send(frame) {
        if (!socket.isConnected()) return false;
        try { return socket.send(frame); }
        catch (error) {
            message(`Settings transport failed: ${error.message}. No write will be retried automatically.`);
            return false;
        }
    }
    function ownerOptions() {
        select.replaceChildren(node('option', 'Select a bot owner'));
        select.firstChild.value = '';
        for (const [id, owner] of owners) {
            const option = node('option', `${id} | ${owner.view.profile ?? 'profile unavailable'}${owner.available ? '' : ' | unavailable'}${changed(owner) ? ' | unsaved edits' : ''}`);
            option.value = id;
            select.append(option);
        }
        select.value = selected;
    }
    function actions() {
        const owner = owners.get(selected);
        saveButton.disabled = !owner || !owner.available || !socket.isConnected() || !!pending
            || owner.needsReview || !changed(owner);
        reviewButton.hidden = !owner?.needsReview;
        reviewButton.disabled = !owner?.available || !!pending;
        discardButton.disabled = !owner || !changed(owner) || !!pending;
        refreshButton.disabled = !socket.isConnected() || !!pending || !!readId;
        select.disabled = !!pending;
    }
    function render() {
        ownerOptions();
        fields.replaceChildren();
        const owner = owners.get(selected);
        identity.textContent = owner ? JSON.stringify(owner.view.configuration, null, 2) : 'No owner selected.';
        if (!owner) { actions(); return; }
        for (const [path, field] of Object.entries(owner.view.fields)) {
            const row = node('div', undefined, 'settings-field');
            const label = node('label', field.label || path);
            const id = `settings-field-${fields.children.length}`;
            label.htmlFor = id;
            label.append(node('small', path));
            label.append(node('small', `Unit: ${field.unit ?? 'not supplied'} | Effect: ${field.effect ?? 'not supplied'}`));
            label.append(node('small', `Source: ${field.source ?? 'not supplied'} | Current: ${JSON.stringify(field.value) ?? 'unavailable'}`));
            if (field.min !== undefined || field.max !== undefined) {
                label.append(node('small', `Range: ${field.exclusiveMin ? '>' : '>='} ${field.min ?? 'unspecified'}, ${field.exclusiveMax ? '<' : '<='} ${field.max ?? 'unspecified'}${field.integer ? ' | whole numbers' : ''}`));
            }
            if (field.format === 'integer_list') {
                label.append(node('small', `Comma-separated whole numbers greater than ${field.itemMin}; at least ${field.minItems} item.`));
            }
            const enumerated = Array.isArray(field.values);
            const supported = ['number', 'boolean', 'string'].includes(field.type);
            const input = node(field.type === 'boolean' || enumerated ? 'select' : 'input');
            input.id = id;
            input.dataset.path = path;
            if (input.tagName === 'SELECT') {
                const blank = node('option', 'Select a value');
                blank.value = '';
                input.append(blank);
                for (const value of field.type === 'boolean' ? [true, false] : field.values) {
                    const option = node('option', String(value));
                    option.value = String(value);
                    input.append(option);
                }
            } else {
                // Text preserves invalid/empty drafts; conversion happens only on Save.
                input.type = 'text';
                if (field.type === 'number') input.inputMode = 'decimal';
            }
            input.value = Object.hasOwn(owner.draft, path) ? owner.draft[path] : field.value == null ? '' : String(field.value);
            input.disabled = field.editable !== true || !supported || !!pending;
            if (field.editable !== true || !supported) label.append(node('small', 'Read only'));
            input.addEventListener('input', () => {
                if (input.value === (field.value == null ? '' : String(field.value))) delete owner.draft[path];
                else owner.draft[path] = input.value;
                if (!changed(owner)) { owner.base = owner.view.configuration; owner.needsReview = false; }
                message('Unsaved edits remain in this browser tab. Save sends only edited fields.');
                ownerOptions();
                actions();
            });
            row.append(label, input);
            fields.append(row);
        }
        for (const [path, raw] of Object.entries(owner.draft)) {
            if (!Object.hasOwn(owner.view.fields, path)) fields.append(node('p', `Preserved edit for unavailable field ${path}: ${raw}. This field cannot be saved.`, 'settings-note'));
        }
        if (owner.view.unavailableInputs?.length) {
            fields.append(node('p', `Unavailable inputs: ${JSON.stringify(owner.view.unavailableInputs)}`, 'settings-note'));
        }
        if (owner.needsReview) fields.prepend(node('p', 'Configuration changed or a save was not confirmed. Your edits are preserved. Compare them with the current values before using the refreshed configuration.', 'settings-note'));
        actions();
    }
    function refresh() {
        if (pending || !socket.isConnected()) return;
        clearTimeout(readTimer);
        readOwners.clear();
        for (const owner of owners.values()) owner.available = false;
        readId = requestId();
        message('Requesting settings from connected bots. Choose the owner explicitly.');
        render();
        if (!send({ type: 'get_settings', requestId: readId })) {
            readId = null;
            message('Settings request could not be sent. Your edits are preserved.');
            actions();
            return;
        }
        readTimer = setTimeout(() => {
            readId = null;
            message([...owners.values()].some(owner => owner.available)
                ? 'Settings received. Select an owner; unavailable owners retain their unsaved edits.'
                : 'No bot settings received. Refresh when a bot is available. Your edits are preserved.');
            actions();
        }, WAIT_MS);
    }
    function acceptView(data) {
        let owner = owners.get(data.ownerId);
        if (!owner) {
            owner = { draft: Object.create(null), base: data.configuration, needsReview: false };
            owners.set(data.ownerId, owner);
        } else if (changed(owner)) {
            owner.needsReview = owner.needsReview || !sameIdentity(owner.base, data.configuration);
        } else owner.base = data.configuration;
        owner.view = data;
        owner.available = true;
        return owner;
    }
    function finishPending() {
        clearTimeout(pending.timer);
        const previous = pending;
        pending = null;
        return previous;
    }
    function receive(data) {
        const write = outstanding.get(data.requestId);
        if (write) {
            // The relay emits owner-less unavailability rejections. Never accept an owner-less success.
            if (data.ownerId !== write.ownerId && !(data.ownerId === undefined
                && data.success === false && data.reason === 'settings_owner_unavailable')) return;
            const current = pending === write;
            if (current) finishPending();
            outstanding.delete(write.id);
            const owner = owners.get(write.ownerId);
            const applied = data.success === true && data.saved === true && data.applied === true
                && validView(data) && data.configuration.settings > write.revision
                && Object.entries(write.changes).every(([path, value]) => data.fields[path]?.value === value);
            if (applied) {
                // Late receipts still confirm their own write, but cannot replace newer
                // configuration or discard edits made since that write was submitted.
                const newer = owner.view.configuration.settings > data.configuration.settings
                    || (pending && pending.ownerId === write.ownerId);
                if (!newer) {
                    for (const [path, raw] of Object.entries(write.draft)) {
                        if (owner.draft[path] === raw) delete owner.draft[path];
                    }
                    acceptView(data);
                    owner.needsReview = changed(owner) && !sameIdentity(owner.base, data.configuration);
                    if (!changed(owner)) owner.base = data.configuration;
                }
                message(`Bot confirmed settings saved and applied for ${write.ownerId}.${current ? '' : ' This confirms the earlier request; newer edits and any later save remain separate.'} Effect timing is shown per field; this is not a trade receipt.`);
            } else {
                if (current) {
                    owner.needsReview = true;
                    owner.available = false;
                }
                message(`Save not confirmed for ${write.ownerId}: ${data.reason || 'incomplete or inconsistent application receipt'}${data.path ? ` (${data.path})` : ''}. ${data.issues ? JSON.stringify(data.issues) : ''} Edits preserved. Refresh and review before saving again.`);
            }
            render();
            return;
        }
        if (!readId || data.requestId !== readId) return;
        if (data.success !== true) {
            message(`Settings unavailable: ${data.reason || 'request rejected'}. Edits preserved.`);
            clearTimeout(readTimer);
            readId = null;
            actions();
            return;
        }
        if (!validView(data)) { message('Incomplete settings response; no configuration loaded.'); return; }
        // One response per owner per read. Late/duplicate frames cannot overwrite a draft.
        if (readOwners.has(data.ownerId)) return;
        readOwners.add(data.ownerId);
        // A late write receipt may arrive during this read. Keep its newer
        // identity if this response was produced before that write applied.
        if (owners.get(data.ownerId)?.view.configuration.settings > data.configuration.settings) return;
        acceptView(data);
        if (selected === data.ownerId) render();
        else { ownerOptions(); actions(); }
        message('Settings received. Select an owner. Gathering any other connected owners...');
    }
    function save() {
        const owner = owners.get(selected);
        actions();
        if (saveButton.disabled) return;
        const changes = Object.create(null);
        for (const [path, raw] of Object.entries(owner.draft)) {
            const field = owner.view.fields[path];
            if (!field || field.editable !== true) { message(`Cannot save ${path}: no longer editable. Edits preserved.`); return; }
            const value = field.type === 'number' ? (raw.trim() === '' ? NaN : Number(raw))
                : field.type === 'boolean' ? (raw === 'true' ? true : raw === 'false' ? false : null) : raw;
            const validIntegerList = field.format !== 'integer_list' || (typeof value === 'string'
                && value.split(',').length >= field.minItems
                && value.split(',').every(item => item.trim() !== ''
                    && Number.isSafeInteger(Number(item.trim()))
                    && Number(item.trim()) > field.itemMin));
            if (typeof value !== field.type || !validIntegerList || (field.values && !field.values.includes(value))
                || (field.type === 'number' && (!Number.isFinite(value)
                    || (field.integer && !Number.isSafeInteger(value))
                    || (field.min !== undefined && (field.exclusiveMin ? value <= field.min : value < field.min))
                    || (field.max !== undefined && (field.exclusiveMax ? value >= field.max : value > field.max))))) {
                message(`Invalid value for ${field.label || path}. Check its units and range. Edits preserved.`);
                return;
            }
            changes[path] = value;
        }
        const id = requestId();
        clearTimeout(readTimer);
        readId = null;
        pending = { id, ownerId: selected, changes, revision: owner.base.settings, draft: { ...owner.draft } };
        outstanding.set(id, pending);
        pending.timer = setTimeout(() => {
            const write = finishPending();
            const target = owners.get(write.ownerId);
            target.available = false;
            target.needsReview = true;
            message('Save outcome unknown: no matching receipt arrived. No retry was sent. Refresh and compare before saving again; edits preserved.');
            render();
        }, WAIT_MS);
        message('Waiting for the selected bot to confirm application...');
        render();
        if (!send({ type: 'save_settings', ownerId: selected, requestId: id,
            expectedRevision: owner.base.settings, expectedSettingsHash: owner.base.settingsHash, changes })) {
            finishPending();
            owner.available = false;
            owner.needsReview = true;
            message('Save could not be confirmed. Refresh and compare before saving again; edits preserved.');
            render();
        }
    }
    function disconnected() {
        clearTimeout(readTimer);
        readId = null;
        if (pending) owners.get(finishPending().ownerId).needsReview = true;
        for (const owner of owners.values()) owner.available = false;
        message('Disconnected. Edits are preserved. Any unconfirmed save has an unknown outcome and will not be retried.');
        render();
    }
    OGZ.register('ConfigurationSettings', {
        init() {
            if (root) return;
            root = document.getElementById('configurationSettings');
            socket = OGZ.get('Socket');
            if (!root || !socket) { root = null; return; }
            root.className = 'configuration-settings';
            root.append(node('summary', 'Bot settings'));
            const body = node('div', undefined, 'settings-body');
            body.append(node('p', 'Choose the bot connection to configure. Chart selection does not select an account. Edits stay in this tab until confirmed; closing the tab discards them.', 'settings-note'));
            const toolbar = node('div', undefined, 'settings-toolbar');
            select = node('select');
            select.setAttribute('aria-label', 'Settings bot owner');
            select.addEventListener('change', () => { selected = select.value; render(); message('Selected owner settings shown. Review units and effect timing before saving.'); });
            refreshButton = node('button', 'Refresh connected bots');
            refreshButton.addEventListener('click', refresh);
            toolbar.append(select, refreshButton);
            status = node('div', 'Waiting for an authenticated dashboard connection.', 'settings-status');
            status.setAttribute('role', 'status');
            const details = node('details');
            details.append(node('summary', 'Configuration identity'));
            identity = node('pre', undefined, 'settings-identity');
            details.append(identity);
            fields = node('div');
            const buttons = node('div', undefined, 'settings-actions');
            saveButton = node('button', 'Save edited settings');
            saveButton.addEventListener('click', save);
            reviewButton = node('button', 'Use refreshed configuration for these edits');
            reviewButton.addEventListener('click', () => {
                const owner = owners.get(selected);
                if (!owner?.available || pending) return;
                owner.base = owner.view.configuration;
                owner.needsReview = false;
                message('Refreshed configuration selected. Your edits are still unsaved; Save will submit them against this identity.');
                render();
            });
            discardButton = node('button', 'Discard selected owner edits');
            discardButton.addEventListener('click', () => {
                const owner = owners.get(selected);
                if (!owner || pending) return;
                owner.draft = Object.create(null);
                owner.base = owner.view.configuration;
                owner.needsReview = false;
                message('Selected owner edits discarded. Other owner edits are unchanged.');
                render();
            });
            buttons.append(saveButton, reviewButton, discardButton);
            body.append(toolbar, status, details, fields, buttons);
            root.append(body);
            socket.registerHandler('auth_success', refresh);
            socket.registerHandler('socket_disconnected', disconnected);
            socket.registerHandler('settings_result', receive);
            render();
            if (socket.isConnected()) refresh();
        }
    });
})(window.OGZ);
