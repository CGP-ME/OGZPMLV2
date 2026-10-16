/* Existing settings API consumer. Drafts belong to the exact relay owner.
 * v2 rendering layer (search, effect filter, cards, sliders, review list) replaces
 * appendField/renderNavigation/render only; transport, owner, draft, receipt and
 * save validation code is unchanged from astra-era@1260a5d5. */
(function (OGZ) {
    'use strict';
    const owners = new Map();
    const outstanding = new Map();
    const readOwners = new Set();
    const WAIT_MS = 15000;
    let socket, root, select, fields, status, identity, saveButton, refreshButton, reviewButton, discardButton;
    let selected = '', readId = null, readTimer = null, pending = null, activeSection = 'Strategy';
    let headerMeta, sectionNav, sectionTitle, sectionCopy, groupNav, actionSummary, actionDetail;
    // View-only state (rendering layer). Transport, owner, draft and receipt state above is unchanged.
    let query = '', effectFilter = 'all', reviewOpen = false, searchInput, effectBar, reviewButtonView, reviewPanel;

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
        ['Strategy', 'Strategy parameters returned by the selected owner.', /^(strategies|strategyBehavior|orchestrator|regimeBoosts|volumeProfileBoosts)\./i],
        ['Filters', 'Signal and market-condition filter controls.', /^(filters?|indicators|regimeDetection|fibonacci)\./i],
        ['Exits', 'Exit-contract controls apply when the selected owner evaluates a new trade.', /^exitContracts\./i],
        ['Learning', 'Pattern, feature, and learning controls reported by the selected owner.', /^(pattern|patternMemory|patternRecognition|learning|performanceAnalysis|feature|featureExtraction|features)\./i],
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
    // ── Rendering layer (v2) ───────────────────────────────────────────
    // Draft values stay raw strings keyed by canonical path, exactly as before,
    // so save() parses and validates them unchanged.
    function effectBucket(effect) {
        const e = String(effect ?? '');
        if (/restart/i.test(e)) return 'restart';
        if (/^new_|new[_ ]?trade|new_exit_contract/i.test(e)) return 'new';
        if (/(?:scheduled|rebuild|initialization|detector|engine|feature[_ ]extraction|pattern[_ ]memory|performance[_ ]analyzer)/i.test(e)) return 'lifecycle';
        return 'next';
    }
    const BUCKET_LABEL = {
        restart: 'Restart required',
        new: 'New trades only',
        lifecycle: 'Lifecycle / scheduled',
        next: 'Next evaluation'
    };
    function originalRaw(field) { return field.value == null ? '' : field.type === 'array' ? field.value.join(',') : String(field.value); }
    function rawFor(owner, path, field) { return Object.hasOwn(owner.draft, path) ? owner.draft[path] : originalRaw(field); }
    function decimals(x) {
        const m = String(x ?? '').toLowerCase().match(/(?:\.(\d+))?(?:e-(\d+))?$/);
        return (m && m[1] ? m[1].length : 0) + (m && m[2] ? Number(m[2]) : 0);
    }
    function matchesView(path, field) {
        if (effectFilter !== 'all' && effectBucket(field.effect) !== effectFilter) return false;
        if (!query) return true;
        const q = query.toLowerCase();
        return path.toLowerCase().includes(q) || String(field.label || '').toLowerCase().includes(q);
    }
    function setDraft(owner, path, field, raw, row) {
        if (raw === originalRaw(field)) delete owner.draft[path];
        else owner.draft[path] = raw;
        if (!changed(owner)) { owner.base = owner.view.configuration; owner.needsReview = false; }
        if (row) row.classList.toggle('is-dirty', Object.hasOwn(owner.draft, path));
        message('Unsaved edits remain in this browser tab. Save sends only edited fields.');
        ownerOptions();
        renderNavigation(owner);
        renderReview(owner);
        actions();
    }
    function appendField(owner, path, field, container) {
        const id = `setting-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        const bucket = effectBucket(field.effect);
        const enumerated = Array.isArray(field.values);
        const supported = ['number', 'boolean', 'string', 'array'].includes(field.type);
        const disabled = field.editable !== true || !supported || !!pending;
        const raw = rawFor(owner, path, field);
        const row = node('div', undefined, `settings-field${Object.hasOwn(owner.draft, path) ? ' is-dirty' : ''}${disabled ? ' is-disabled' : ''}`);
        row.dataset.path = path;

        const head = node('div', undefined, 'settings-field-head');
        const label = node('label');
        label.htmlFor = id;
        label.append(node('strong', field.label || path));
        const badge = node('span', BUCKET_LABEL[bucket], 'settings-effect');
        badge.dataset.bucket = bucket;
        badge.title = 'Effect: ' + String(field.effect ?? 'not supplied').replace(/_/g, ' ');
        head.append(label, badge);

        const meta = node('div', undefined, 'settings-field-meta');
        meta.append(node('code', path, 'settings-path'));
        const hint = [];
        if (field.unit && field.unit !== 'boolean') hint.push(field.unit);
        if (field.min !== undefined || field.max !== undefined) hint.push(`${field.exclusiveMin ? '>' : '≥'} ${field.min ?? '−∞'} · ${field.exclusiveMax ? '<' : '≤'} ${field.max ?? '∞'}`);
        if (field.integer) hint.push('whole numbers');
        if (field.format === 'integer_list') hint.push(`comma-separated whole numbers > ${field.itemMin}, ${field.maxItems === field.minItems ? 'exactly' : 'at least'} ${field.minItems}`);
        if (field.type === 'array') hint.push(`comma-separated ${field.itemType === 'string' ? 'names' : (field.itemInteger ? 'whole numbers' : 'numbers')}, ${field.maxItems === field.minItems ? 'exactly' : 'at least'} ${field.minItems}`);
        if (field.editable !== true || !supported) hint.push('read only');
        if (hint.length) meta.append(node('small', hint.join(' · ')));
        const details = node('details', undefined, 'settings-field-details');
        details.append(node('summary', 'Details'));
        details.append(node('small', `Source: ${field.source ?? 'not supplied'}`));
        details.append(node('small', `Effect: ${String(field.effect ?? 'not supplied').replace(/_/g, ' ')}`));
        details.append(node('small', `Current: ${JSON.stringify(field.value) ?? 'unavailable'}`));
        meta.append(details);

        const control = node('div', undefined, 'settings-control');
        let input;
        if (field.type === 'boolean' && !enumerated) {
            input = node('button', undefined, 'settings-toggle');
            input.type = 'button';
            input.id = id;
            const on = raw === 'true';
            input.setAttribute('role', 'switch');
            input.setAttribute('aria-checked', String(on));
            input.setAttribute('aria-label', field.label || path);
            input.append(node('span', undefined, 'settings-toggle-knob'));
            const state = node('span', raw === '' ? 'unset' : on ? 'on' : 'off', 'settings-toggle-state');
            input.addEventListener('click', () => {
                // Unset → on → unset; a second toggle on an unset field restores the owner value.
                const original = originalRaw(field);
                const current = rawFor(owner, path, field);
                const next = original === '' ? (current === 'true' ? '' : 'true') : (current === 'true' ? 'false' : 'true');
                setDraft(owner, path, field, next);
                render();
            });
            control.append(input, state);
        } else if (enumerated) {
            input = node('select');
            input.id = id;
            const blank = node('option', 'Select a value');
            blank.value = '';
            input.append(blank);
            for (const value of field.values) {
                const option = node('option', String(value));
                option.value = String(value);
                input.append(option);
            }
            input.value = raw;
            input.addEventListener('input', () => setDraft(owner, path, field, input.value, row));
            control.append(input);
        } else if (field.type === 'string' && /instruction/i.test(field.unit || '')) {
            input = node('textarea');
            input.id = id;
            input.rows = 5;
            input.value = raw;
            input.addEventListener('input', () => setDraft(owner, path, field, input.value, row));
            control.append(input);
        } else {
            input = node('input');
            input.id = id;
            input.type = 'text';
            if (field.type === 'number') { input.inputMode = 'decimal'; input.className = 'settings-number'; }
            input.value = raw;
            const finite = field.type === 'number' && Number.isFinite(field.min) && Number.isFinite(field.max) && field.max > field.min && field.max - field.min <= 1000;
            if (finite) {
                // Step fine enough to land on the stored value exactly, so touching the slider never silently rounds it.
                const coarse = field.max - field.min <= 1 ? 0.01 : field.max - field.min <= 10 ? 0.05 : 0.5;
                const fine = Math.pow(10, -Math.max(decimals(originalRaw(field)), decimals(field.min), decimals(field.max)));
                const sliderStep = field.integer ? 1 : Math.min(coarse, fine);
                // Number.MIN_VALUE-style bounds can underflow fine to zero. Keep the
                // authoritative text input and omit an invalid range control.
                if (Number.isFinite(sliderStep) && sliderStep > 0) {
                    const slider = node('input', undefined, 'settings-slider');
                    slider.type = 'range';
                    slider.min = String(field.min);
                    slider.max = String(field.max);
                    slider.step = String(sliderStep);
                    slider.value = raw === '' || !Number.isFinite(Number(raw)) ? String(field.min) : raw;
                    slider.setAttribute('aria-label', (field.label || path) + ' slider');
                    slider.disabled = disabled;
                    slider.addEventListener('input', () => { input.value = slider.value; setDraft(owner, path, field, slider.value, row); });
                    input.addEventListener('input', () => { if (Number.isFinite(Number(input.value))) slider.value = input.value; });
                    control.append(slider);
                }
            }
            input.addEventListener('input', () => setDraft(owner, path, field, input.value, row));
            control.append(input);
            if (field.type === 'number' && field.unit) control.append(node('span', field.unit, 'settings-unit'));
        }
        input.dataset.path = path;
        input.disabled = disabled;
        if (Object.hasOwn(owner.draft, path) && !disabled) {
            const revert = node('button', 'was ' + (originalRaw(field) === '' ? 'unset' : originalRaw(field).slice(0, 24)), 'settings-revert');
            revert.type = 'button';
            revert.title = 'Revert this field to the value the owner reported';
            revert.addEventListener('click', () => { delete owner.draft[path]; setDraft(owner, path, field, originalRaw(field)); render(); });
            control.append(revert);
        }
        row.append(head, meta, control);
        container.append(row);
    }
    function renderNavigation(owner) {
        sectionNav.replaceChildren();
        const fieldEntries = owner?.view ? Object.entries(owner.view.fields) : [];
        for (const [name] of SECTIONS) {
            const dirty = owner ? Object.keys(owner.draft).filter(path => sectionFor(path) === name).length : 0;
            const count = fieldEntries.filter(([path, field]) => sectionFor(path) === name && (effectFilter === 'all' || effectBucket(field.effect) === effectFilter)).length;
            const active = !query && name === activeSection;
            const button = node('button', undefined, `settings-section${active ? ' is-active' : ''}${dirty ? ' has-dirty' : ''}`);
            button.type = 'button';
            button.setAttribute('aria-pressed', String(active));
            const right = node('span', undefined, 'settings-section-meta');
            if (dirty) right.append(node('b', String(dirty), 'settings-dirty-count'));
            right.append(node('small', String(count)));
            button.append(node('span', name), right);
            button.addEventListener('click', () => { activeSection = name; query = ''; if (searchInput) searchInput.value = ''; render(); });
            sectionNav.append(button);
        }
    }
    function renderEffectBar() {
        if (!effectBar) return;
        effectBar.replaceChildren();
        for (const [key, text] of [['all', 'All'], ['next', 'Next evaluation'], ['new', 'New trades'], ['lifecycle', 'Lifecycle / scheduled'], ['restart', 'Restart']]) {
            const b = node('button', text, `settings-effect-filter${effectFilter === key ? ' is-active' : ''}`);
            b.type = 'button';
            b.dataset.bucket = key;
            b.setAttribute('aria-pressed', String(effectFilter === key));
            b.addEventListener('click', () => { effectFilter = key; render(); });
            effectBar.append(b);
        }
    }
    function renderReview(owner) {
        if (!reviewPanel) return;
        const paths = owner ? Object.keys(owner.draft) : [];
        if (reviewButtonView) { reviewButtonView.disabled = !paths.length; reviewButtonView.textContent = reviewOpen && paths.length ? 'Hide changes' : 'Review changes'; }
        reviewPanel.hidden = !(reviewOpen && paths.length);
        reviewPanel.replaceChildren();
        if (reviewPanel.hidden) return;
        reviewPanel.append(node('strong', 'Changes Save will send', 'settings-review-title'));
        for (const path of paths) {
            const field = owner.view?.fields[path];
            const line = node('div', undefined, 'settings-review-row');
            line.append(node('span', field?.label || path, 'settings-review-label'));
            if (field) { const b = node('span', BUCKET_LABEL[effectBucket(field.effect)], 'settings-effect'); b.dataset.bucket = effectBucket(field.effect); line.append(b); }
            line.append(node('code', path, 'settings-path'));
            const delta = node('span', undefined, 'settings-review-delta');
            delta.append(node('span', field ? (originalRaw(field) || 'unset') : 'unavailable', 'settings-review-from'), node('span', ' → '), node('span', owner.draft[path] === '' ? 'unset' : owner.draft[path], 'settings-review-to'));
            line.append(delta);
            reviewPanel.append(line);
        }
    }
    function render() {
        ownerOptions();
        fields.replaceChildren();
        const owner = owners.get(selected);
        identity.textContent = owner ? JSON.stringify(owner.view.configuration, null, 2) : 'No owner selected.';
        setHeader(owner);
        renderNavigation(owner);
        renderEffectBar();
        renderReview(owner);
        const currentSection = SECTIONS.find(([name]) => name === activeSection) || SECTIONS[0];
        sectionTitle.textContent = query ? 'Search' : currentSection[0];
        sectionCopy.textContent = query ? `Matches across every section for “${query}”.` : currentSection[1];
        if (!owner?.view) {
            groupNav.hidden = true;
            fields.append(node('p', 'Select an available authenticated owner, then refresh its returned settings.', 'settings-note'));
            actions();
            return;
        }
        if (owner.needsReview) fields.append(node('p', 'Configuration changed or a save was not confirmed. Your edits are preserved. Compare them with the current values before using the refreshed configuration.', 'settings-note settings-review-note'));
        const entries = Object.entries(owner.view.fields)
            .filter(([path, field]) => matchesView(path, field) && (query || sectionFor(path) === activeSection))
            .sort(([left], [right]) => left.localeCompare(right));
        const grouped = new Map();
        for (const [path, field] of entries) {
            const title = query ? sectionFor(path) : titleFor(path, activeSection);
            if (!grouped.has(title)) grouped.set(title, []);
            grouped.get(title).push([path, field]);
        }
        let activeGroup = '';
        if (query) { groupNav.replaceChildren(); groupNav.hidden = true; }
        else activeGroup = renderGroupTabs(owner, activeSection, grouped);
        if (!grouped.size) fields.append(node('p', query ? `No settings match “${query}”.` : `The selected owner returned no ${activeSection.toLowerCase()} fields${effectFilter === 'all' ? '' : ' for this effect filter'}.`, 'settings-note'));
        for (const [title, list] of grouped) {
            if (!query && (activeSection === 'Strategy' || activeSection === 'Exits') && title !== activeGroup) continue;
            const card = node('section', undefined, 'settings-card');
            const h = node('h3');
            h.append(node('span', title), node('small', `${list.length} ${list.length === 1 ? 'setting' : 'settings'}`));
            card.append(h);
            const cardFields = node('div', undefined, 'settings-card-fields');
            for (const [path, field] of list) appendField(owner, path, field, cardFields);
            card.append(cardFields);
            fields.append(card);
        }
        for (const [path, raw] of Object.entries(owner.draft)) if (!Object.hasOwn(owner.view.fields, path) && (query || sectionFor(path) === activeSection)) fields.append(node('p', `Preserved edit for unavailable field ${path}: ${raw}. This field cannot be saved.`, 'settings-note'));
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
                && validView(data) && (data.configuration.settings > write.revision
                    || (data.changed === false && sameIdentity(data.configuration, write.configuration)))
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
                : field.type === 'array' ? (raw.trim() === '' ? [] : raw.split(',').map(item => field.itemType === 'string' ? item.trim() : Number(item.trim())))
                : field.type === 'boolean' ? (raw === 'true' ? true : raw === 'false' ? false : null) : raw;
            const validIntegerList = field.format !== 'integer_list' || (typeof value === 'string'
                && value.split(',').length >= field.minItems
                && value.split(',').every(item => item.trim() !== ''
                    && Number.isSafeInteger(Number(item.trim()))
                    && Number(item.trim()) > field.itemMin));
            const validArray = field.type !== 'array' || (Array.isArray(value)
                && value.length >= field.minItems
                && (field.maxItems === undefined || value.length <= field.maxItems)
                && value.every(item => field.itemType === 'string' ? typeof item === 'string' && item.trim() !== ''
                    : Number.isFinite(item)
                      && (!field.itemInteger || Number.isSafeInteger(item))
                      && (field.itemMin === undefined || item > field.itemMin)));
            if ((field.type !== 'array' && typeof value !== field.type) || !validIntegerList || !validArray || (field.values && !field.values.includes(value))
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
        pending = { id, ownerId: selected, changes, revision: owner.base.settings, configuration: { ...owner.base }, draft: { ...owner.draft } };
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
            searchInput = node('input', undefined, 'settings-search');
            searchInput.type = 'search';
            searchInput.placeholder = 'Search settings by name or path';
            searchInput.setAttribute('aria-label', 'Search settings');
            searchInput.addEventListener('input', () => { query = searchInput.value.trim(); render(); });
            effectBar = node('div', undefined, 'settings-effect-bar');
            effectBar.setAttribute('role', 'group');
            effectBar.setAttribute('aria-label', 'Filter by when a saved change takes effect');
            toolbar.append(searchInput, effectBar);
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
            reviewButtonView = node('button', 'Review changes', 'settings-review-toggle');
            reviewButtonView.type = 'button';
            reviewButtonView.addEventListener('click', () => { reviewOpen = !reviewOpen; renderReview(owners.get(selected)); });
            reviewPanel = node('div', undefined, 'settings-review');
            reviewPanel.hidden = true;
            buttons.append(actionInfo, reviewButtonView, reviewButton, discardButton, saveButton);
            body.append(header, toolbar, status, details, layout, reviewPanel, buttons);
            root.append(body);
            socket.registerHandler('auth_success', refresh);
            socket.registerHandler('socket_disconnected', disconnected);
            socket.registerHandler('settings_result', receive);
            render();
            if (socket.isConnected()) refresh();
        }
    });
})(window.OGZ);
