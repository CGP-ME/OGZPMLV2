/* Existing settings API consumer. Drafts belong to the exact relay owner. */
(function (OGZ) {
    'use strict';
    const owners = new Map();
    const outstanding = new Map();
    const readOwners = new Set();
    const WAIT_MS = 15000;
    let socket, root, select, fields, status, identity, saveButton, refreshButton, reviewButton, discardButton;
    let selected = '', readId = null, readTimer = null, pending = null, activeSection = 'Strategy';
    let headerMeta, sectionNav, sectionTitle, sectionCopy, groupNav, actionSummary, actionDetail;

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
    function sameValue(a, b) {
        return Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
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
    const SECTIONS = [
        ['Runtime', 'Connected owner, revision, and service controls.', /^(mode|execution|pipeline|broker|monitoring|paths|sessionRouter|webhookOrders|dashboard)\./i],
        ['Risk', 'Position, sizing, and account-risk controls.', /^(risk|positionSizing|entryLogic|fundTarget|tierPolicy)\./i],
        ['Strategy', 'Strategy parameters returned by the selected owner.', /^(strategies|orchestrator|regimeBoosts|volumeProfileBoosts)\./i],
        ['Filters', 'Signal and market-condition filter controls.', /^(filters?|indicators|regimeDetection|fibonacci)\./i],
        ['Exits', 'Exit-contract controls apply when the selected owner evaluates a new trade.', /^(exitContracts|exitLogic|exits?)\./i],
        ['Learning', 'Pattern, feature, and learning controls reported by the selected owner.', /^(pattern|learning|performanceAnalysis|feature)\./i],
        ['TrAI', 'TrAI controls returned by the selected owner.', /^trai\./i],
        ['Fees', 'Fee and backtest cost controls returned by the selected owner.', /^(fees?|backtest)\./i],
        ['Services', 'Service and authenticated integration controls.', /^(services?|auth|notification|integration)\./i]
    ];
    function sectionFor(path) {
        if (path === 'features.enableDynamicSizing') return 'Risk';
        if (/^confidence\./i.test(path)) return 'Filters';
        return (SECTIONS.find(([, , matcher]) => matcher.test(path)) || SECTIONS[0])[0];
    }
    function humanEffect(effect) { return String(effect ?? 'not supplied').replace(/_/g, ' '); }
    function titleFor(path, section) {
        const parts = path.split('.');
        if (section === 'Strategy' && parts[0] === 'strategies' && parts[1]) return parts[1];
        if (section === 'Exits' && parts[0] === 'exitContracts' && parts[1]) return parts[1];
        return parts[0].replace(/([a-z])([A-Z])/g, '$1 $2');
    }
    function activeGroupFor(owner, section) { return section === 'Strategy' ? owner.strategyGroup || '' : owner.exitGroup || ''; }
    function setActiveGroup(owner, section, group) {
        if (section === 'Strategy') owner.strategyGroup = group;
        else owner.exitGroup = group;
    }
    function renderGroupTabs(owner, section, grouped) {
        groupNav.replaceChildren();
        const tabbed = section === 'Strategy' || section === 'Exits';
        groupNav.hidden = !tabbed || grouped.size < 2;
        if (!tabbed || !grouped.size) return '';
        let activeGroup = activeGroupFor(owner, section);
        if (!grouped.has(activeGroup)) {
            activeGroup = grouped.keys().next().value;
            setActiveGroup(owner, section, activeGroup);
        }
        for (const name of grouped.keys()) {
            const button = node('button', name, `settings-group-tab${name === activeGroup ? ' is-active' : ''}`);
            button.type = 'button';
            button.dataset.section = section;
            button.dataset.group = name;
            button.setAttribute('aria-pressed', String(name === activeGroup));
            button.addEventListener('click', () => { setActiveGroup(owner, section, name); render(); });
            groupNav.append(button);
        }
        return activeGroup;
    }
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
        if (actionSummary) {
            const dirty = owner ? Object.keys(owner.draft).length : 0;
            actionSummary.textContent = dirty ? `${dirty} unsaved ${dirty === 1 ? 'edit' : 'edits'} for the selected owner` : 'No unsaved selected-owner edits';
            actionDetail.textContent = owner?.needsReview ? 'Review the refreshed configuration before saving.'
                : owner?.view ? `Revision ${owner.view.configuration.settings} and its hash are sent with each save.`
                    : 'Choose an authenticated owner before saving.';
        }
    }
    function setHeader(owner) {
        const configuration = owner?.view?.configuration;
        headerMeta.replaceChildren();
        if (!configuration) {
            headerMeta.append(node('span', 'Awaiting owner settings', 'settings-chip'));
            return;
        }
        headerMeta.append(
            node('span', `Revision ${configuration.settings}`, 'settings-chip'),
            node('span', `Hash ${configuration.settingsHash}`, 'settings-chip settings-hash'),
            node('span', owner.available ? 'Owner available' : 'Owner unavailable', `settings-chip ${owner.available ? 'settings-chip-live' : ''}`)
        );
    }
    function appendField(owner, path, field, container) {
        const id = `setting-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        const row = node('div', undefined, 'settings-field');
        const label = node('label');
        label.htmlFor = id;
        label.append(node('strong', field.label || path));
        label.append(node('small', `Unit: ${field.unit ?? 'not supplied'} | Effect: ${humanEffect(field.effect)}`));
        if (field.min !== undefined || field.max !== undefined) label.append(node('small', `Range: ${field.exclusiveMin ? '>' : '>='} ${field.min ?? 'unspecified'}, ${field.exclusiveMax ? '<' : '<='} ${field.max ?? 'unspecified'}${field.integer ? ' | whole numbers' : ''}`));
        if (field.format === 'integer_list') label.append(node('small', `Comma-separated whole numbers greater than ${field.itemMin}; ${field.maxItems === field.minItems ? 'exactly' : 'at least'} ${field.minItems} items.`));
        if (field.type === 'array') label.append(node('small', `Comma-separated ${field.itemInteger ? 'whole ' : ''}numbers${field.itemMin !== undefined ? ` greater than ${field.itemMin}` : ''}; ${field.maxItems === field.minItems ? 'exactly' : 'at least'} ${field.minItems} items.`));
        const details = node('details', undefined, 'settings-field-details');
        details.append(node('summary', 'Details'));
        details.append(node('small', `Path: ${path}`));
        details.append(node('small', `Source: ${field.source ?? 'not supplied'}`));
        details.append(node('small', `Current: ${JSON.stringify(field.value) ?? 'unavailable'}`));
        label.append(details);
        const enumerated = Array.isArray(field.values);
        const supported = ['number', 'boolean', 'string', 'array'].includes(field.type);
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
        } else { input.type = 'text'; if (field.type === 'number') input.inputMode = 'decimal'; }
        input.value = Object.hasOwn(owner.draft, path) ? owner.draft[path] : field.value == null ? '' : field.type === 'array' ? field.value.join(',') : String(field.value);
        input.disabled = field.editable !== true || !supported || !!pending;
        if (field.editable !== true || !supported) label.append(node('small', 'Read only'));
        input.addEventListener('input', () => {
            if (input.value === (field.value == null ? '' : String(field.value))) delete owner.draft[path];
            else owner.draft[path] = input.value;
            if (!changed(owner)) { owner.base = owner.view.configuration; owner.needsReview = false; }
            message('Unsaved edits remain in this browser tab. Save sends only edited fields.');
            ownerOptions();
            renderNavigation(owner);
            actions();
        });
        row.append(label, input);
        container.append(row);
    }
    function renderNavigation(owner) {
        sectionNav.replaceChildren();
        for (const [name] of SECTIONS) {
            const dirty = owner ? Object.keys(owner.draft).filter(path => sectionFor(path) === name).length : 0;
            const button = node('button', undefined, `settings-section${name === activeSection ? ' is-active' : ''}`);
            button.type = 'button';
            button.setAttribute('aria-pressed', String(name === activeSection));
            button.append(node('span', name), node('small', dirty ? `${dirty} unsaved` : 'No unsaved edits'));
            button.addEventListener('click', () => { activeSection = name; render(); });
            sectionNav.append(button);
        }
    }
    function render() {
        ownerOptions();
        fields.replaceChildren();
        const owner = owners.get(selected);
        identity.textContent = owner ? JSON.stringify(owner.view.configuration, null, 2) : 'No owner selected.';
        setHeader(owner);
        renderNavigation(owner);
        const currentSection = SECTIONS.find(([name]) => name === activeSection) || SECTIONS[0];
        sectionTitle.textContent = currentSection[0];
        sectionCopy.textContent = currentSection[1];
        if (!owner?.view) {
            fields.append(node('p', 'Select an available authenticated owner, then refresh its returned settings.', 'settings-note'));
            actions();
            return;
        }
        if (owner.needsReview) fields.append(node('p', 'Configuration changed or a save was not confirmed. Your edits are preserved. Compare them with the current values before using the refreshed configuration.', 'settings-note settings-review-note'));
        const grouped = new Map();
        for (const [path, field] of Object.entries(owner.view.fields).filter(([path]) => sectionFor(path) === activeSection).sort(([left], [right]) => left.localeCompare(right))) {
            const title = titleFor(path, activeSection);
            if (!grouped.has(title)) grouped.set(title, []);
            grouped.get(title).push([path, field]);
        }
        const activeGroup = renderGroupTabs(owner, activeSection, grouped);
        if (!grouped.size) fields.append(node('p', `The selected owner returned no ${activeSection.toLowerCase()} fields.`, 'settings-note'));
        for (const [title, entries] of grouped) {
            if ((activeSection === 'Strategy' || activeSection === 'Exits') && title !== activeGroup) continue;
            const card = node('section', undefined, 'settings-card');
            card.append(node('h3', title));
            const cardFields = node('div', undefined, 'settings-card-fields');
            for (const [path, field] of entries) appendField(owner, path, field, cardFields);
            card.append(cardFields);
            fields.append(card);
        }
        for (const [path, raw] of Object.entries(owner.draft)) if (!Object.hasOwn(owner.view.fields, path) && sectionFor(path) === activeSection) fields.append(node('p', `Preserved edit for unavailable field ${path}: ${raw}. This field cannot be saved.`, 'settings-note'));
        if (owner.view.unavailableInputs?.length) fields.append(node('p', `Unavailable inputs: ${JSON.stringify(owner.view.unavailableInputs)}`, 'settings-note'));
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
            owner = { draft: Object.create(null), base: data.configuration, needsReview: false, strategyGroup: '', exitGroup: '' };
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
                && Object.entries(write.changes).every(([path, value]) => sameValue(data.fields[path]?.value, value));
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
                : field.type === 'array' ? raw.split(',').map(item => Number(item.trim()))
                : field.type === 'boolean' ? (raw === 'true' ? true : raw === 'false' ? false : null) : raw;
            const validIntegerList = field.format !== 'integer_list' || (typeof value === 'string'
                && value.split(',').length >= field.minItems
                && value.split(',').every(item => item.trim() !== ''
                    && Number.isSafeInteger(Number(item.trim()))
                    && Number(item.trim()) > field.itemMin));
            const validNumericArray = field.type !== 'array' || (Array.isArray(value)
                && value.length >= field.minItems
                && (field.maxItems === undefined || value.length <= field.maxItems)
                && value.every(item => Number.isFinite(item)
                    && (!field.itemInteger || Number.isSafeInteger(item))
                    && (field.itemMin === undefined || item > field.itemMin)));
            if ((field.type !== 'array' && typeof value !== field.type) || !validIntegerList || !validNumericArray || (field.values && !field.values.includes(value))
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
            root.open = true;
            root.append(node('summary', 'Settings', 'settings-disclosure'));
            const body = node('div', undefined, 'settings-body');
            const header = node('header', undefined, 'settings-header');
            const brand = node('div', undefined, 'settings-brand');
            brand.append(node('span', 'OGZPrime', 'settings-mark'), node('h2', 'Settings'));
            headerMeta = node('div', undefined, 'settings-meta');
            header.append(brand, headerMeta);
            const toolbar = node('div', undefined, 'settings-toolbar');
            toolbar.append(node('span', 'Authenticated owner', 'settings-owner-label'));
            select = node('select');
            select.setAttribute('aria-label', 'Settings bot owner');
            select.addEventListener('change', () => { selected = select.value; render(); message('Selected owner settings shown. Review units and effect timing before saving.'); });
            refreshButton = node('button', 'Refresh connected bots');
            refreshButton.type = 'button';
            refreshButton.addEventListener('click', refresh);
            toolbar.append(select, refreshButton);
            status = node('div', 'Waiting for an authenticated dashboard connection.', 'settings-status');
            status.setAttribute('role', 'status');
            const details = node('details', undefined, 'settings-identity-disclosure');
            details.append(node('summary', 'Configuration identity'));
            identity = node('pre', undefined, 'settings-identity');
            details.append(identity);
            sectionNav = node('nav', undefined, 'settings-nav');
            sectionNav.setAttribute('aria-label', 'Settings sections');
            const content = node('div', undefined, 'settings-content');
            const contentHeader = node('div', undefined, 'settings-content-header');
            sectionTitle = node('h3');
            sectionCopy = node('p', undefined, 'settings-note');
            groupNav = node('nav', undefined, 'settings-group-nav');
            groupNav.setAttribute('aria-label', 'Strategy and exit groups');
            contentHeader.append(sectionTitle, sectionCopy, groupNav);
            fields = node('div', undefined, 'settings-fields');
            content.append(contentHeader, fields);
            const layout = node('div', undefined, 'settings-layout');
            const aside = node('aside', undefined, 'settings-sidebar');
            aside.append(node('span', 'Sections', 'settings-nav-label'), sectionNav);
            layout.append(aside, content);
            const buttons = node('div', undefined, 'settings-actions');
            const actionInfo = node('div', undefined, 'settings-action-info');
            actionSummary = node('strong');
            actionDetail = node('small');
            actionInfo.append(actionSummary, actionDetail);
            saveButton = node('button', 'Save edited settings', 'settings-save');
            saveButton.type = 'button';
            saveButton.addEventListener('click', save);
            reviewButton = node('button', 'Use refreshed configuration for these edits');
            reviewButton.type = 'button';
            reviewButton.addEventListener('click', () => {
                const owner = owners.get(selected);
                if (!owner?.available || pending) return;
                owner.base = owner.view.configuration;
                owner.needsReview = false;
                message('Refreshed configuration selected. Your edits are still unsaved; Save will submit them against this identity.');
                render();
            });
            discardButton = node('button', 'Discard selected owner edits');
            discardButton.type = 'button';
            discardButton.addEventListener('click', () => {
                const owner = owners.get(selected);
                if (!owner || pending) return;
                owner.draft = Object.create(null);
                owner.base = owner.view.configuration;
                owner.needsReview = false;
                message('Selected owner edits discarded. Other owner edits are unchanged.');
                render();
            });
            buttons.append(actionInfo, reviewButton, discardButton, saveButton);
            body.append(header, toolbar, status, details, layout, buttons);
            root.append(body);
            socket.registerHandler('auth_success', refresh);
            socket.registerHandler('socket_disconnected', disconnected);
            socket.registerHandler('settings_result', receive);
            render();
            if (socket.isConnected()) refresh();
        }
    });
})(window.OGZ);
