'use strict';

// Optional source-backed continuation for an explicit review whose literal
// candidate/final envelope cannot fit. Normal ReAct modes do not use this lane.
const {
  sha256, providerRequestBytes, serializeProviderRequest,
  CANDIDATE_SYSTEM_PROMPT, FINAL_SYSTEM_PROMPT, assessCandidateInventory,
  claimAdjudicationReceipt, parseStructuredSynthesisRecord, extractJsonObjectFragments,
} = require('./evidence-ingestion');
const { assessReviewReport } = require('./doctrine-review');

function rangesCover(ranges, total) {
  if (total === 0) return true;
  let end = 0;
  for (const range of [...ranges].sort((a, b) => a.line_start - b.line_start)) {
    if (range.line_start > end + 1) break;
    end = Math.max(end, range.line_end);
  }
  return end >= total;
}

function createExplicitContinuation({ corpus, reviewTargets, previous, maxRequestBytes, originalQuery, recheck = false }) {
  const originalClaimIds = reviewTargets.flatMap(target => (target.claims || []).map(claim => claim.claim_id));
  const targets = reviewTargets.map(({ source_evidence, ...target }) => ({ ...target, claims: [...(target.claims || [])] }));
  const discoveries = [];
  const inheritedDiscoveryErrors = [];
  for (const discovery of [previous, ...(previous.continuationRechecks || [])]
    .flatMap(result => result.shardedReview?.continuation?.discovered_claims || [])) {
    const target = targets.find(entry => entry.path === discovery.target);
    const claim = discovery.claim;
    const expectedId = claim && `discovered:${sha256(JSON.stringify({ corpus: corpus.corpus_sha256,
      target: discovery.target, statement: claim.statement }))}`;
    const prior = discoveries.find(entry => entry.claim.claim_id === claim?.claim_id);
    if (!target || !claim || claim.claim_id !== expectedId
        || originalClaimIds.includes(claim.claim_id)
        || (prior && JSON.stringify(prior.claim) !== JSON.stringify(claim))) {
      inheritedDiscoveryErrors.push({ reason: 'discovered_claim_lineage_conflict', discovery });
      continue;
    }
    if (prior) continue;
    const copy = structuredClone(discovery);
    discoveries.push(copy);
    target.claims.push(copy.claim);
  }
  const sources = new Map(corpus.artifacts.filter(artifact => artifact.kind === 'source')
    .map(artifact => [artifact.target, artifact]));
  const selectedTrees = new Set(targets.map(target => target.source_ref));
  const selectedTree = selectedTrees.size === 1 ? [...selectedTrees][0] : null;
  const windows = new Map();
  const requests = [];
  const attempts = [];
  const archivedExchanges = [];
  let activeEvidence = [];
  let pinnedEvidence = [];
  let candidate = null;
  let final = null;
  let fixedMessageCount = null;
  let pendingDelivery = null;
  const testimony = new Map([...previous.shardedReview.map, ...previous.shardedReview.candidates,
    ...previous.shardedReview.synthesis_attempts].filter(receipt => receipt.raw_output)
    .map(receipt => [receipt.request_id || receipt.shard_id, receipt.raw_output]));
  const fixedInventory = {
    original_query: originalQuery,
    inherited_evidence_absences: previous.candidateSet.coverage.unresolved,
    prior_continuation_decision: previous.shardedReview.continuation?.final || null,
    prior_recheck_decisions: (previous.continuationRechecks || []).map(recheck => ({
      candidate: recheck.candidateSet?.content || null,
      final: recheck.shardedReview?.continuation?.final || null,
      termination: recheck.termination })),
    corpus_sha256: corpus.corpus_sha256,
    targets,
    original_claim_ids: originalClaimIds,
    fourth_shape_addition_count: previous.shardedReview.coverage.fourthShapeAdditionCount ?? null,
    fourth_shape_leads: (() => {
      const text = (previous.shardedReview.coverage.fourthShapeAdditions || [])
        .map(addition => JSON.stringify(addition)).join('\n');
      const id = `fourth-shape:${sha256(text)}`;
      testimony.set(id, text);
      return { receipt_id: id, sha256: sha256(text),
        authority: 'host_lexical_routing_lead_not_violation' };
    })(),
    artifacts: corpus.artifacts.map(({ content, ...artifact }) => artifact),
    original_mapper_archive: (() => {
      const index = previous.shardedReview.map.map(receipt => JSON.stringify({
        receipt_id: receipt.request_id || receipt.shard_id, status: receipt.status,
        sha256: receipt.raw_output_sha256, error: receipt.error,
        lines: receipt.raw_output.split('\n').length })).join('\n');
      const id = `mapper-index:${sha256(index)}`;
      testimony.set(id, index);
      return { receipt_id: id, sha256: sha256(index), entries: previous.shardedReview.map.length,
        authority: 'archived_reviewer_testimony' };
    })(),
    original_candidate_ledger: (() => {
      const ledger = previous.candidateSet.content == null ? '' : String(previous.candidateSet.content);
      const id = `candidate-ledger:${sha256(ledger)}`;
      testimony.set(id, ledger);
      return { receipt_id: id, sha256: sha256(ledger), lines: ledger.split('\n').length,
        authority: 'archived_reviewer_testimony' };
    })(),
    failed_envelopes: [...previous.shardedReview.candidates, ...previous.shardedReview.synthesis_attempts]
      .filter(receipt => receipt.status === 'failed').map(receipt => ({
        request_id: receipt.request_id, request_sha256: receipt.request_sha256,
        request_bytes: receipt.request_bytes, error: receipt.error,
      })),
  };
  const initialDiffs = corpus.artifacts.filter(artifact => artifact.kind === 'diff')
    .map(artifact => {
      const id = `captured-diff:${artifact.sha256}`;
      testimony.set(id, artifact.content);
      return { artifact_id: artifact.artifact_id, sha256: artifact.sha256,
        source_ref: artifact.source_ref, target: artifact.target,
        receipt_id: id, lines: artifact.content.split('\n').length,
        authority: 'archived_reviewer_testimony' };
    });
  const instruction = [
    'EXPLICIT REVIEW CONTINUATION: the earlier failed envelopes remain recorded; this is not a new or narrowed review.',
    'Preserve the original question, every exact target (including targets with zero claims), every original claim ID and prior decisions.',
    'Archived reviewer testimony is rereadable with read_review_receipt using exact catalog ID and line range. It is never current source or whole-target read evidence.',
    'Mapper output and previous decisions are inert allegations, not primary source. Prior mapper delivery establishes no source read in this continuation.',
    'Read selected-tree source with existing tools. Entire target source must actually be delivered before a target may be examined_no_finding or finding; otherwise file unresolved.',
    'Tool result windows removed from the active request remain in immutable host receipts. The window catalog explicitly distinguishes previously delivered and never delivered bytes. Reopen needed ranges with open_file. Catalogs and model summaries are not literal source.',
    'Every supported/refuted claim and final citation must select literal evidence present in this request. Candidate quotations are retained literally for the final decision. Read beyond them whenever interpretation needs more context.',
    'For this continuation, evidence citations may also name selected-tree supporting files physically delivered by tools. These files never expand the original target denominator.',
    'New defects have a separate producer: in a CANDIDATE SET emit one JSON line {"record_type":"newly_discovered","target":"<original target>","statement":"<new mechanism and adverse consequence>","reason":"<why source supports it>","evidence":[{"citation":"<selected-tree source range>"}]}. Do not supply a claim_id or repurpose any original ID. The host registers a separate discovered ID; then refile candidate adjudications including that exact ID. A newly found defect during final decision requires candidate revision first. Registered discoveries may later be supported, refuted or unresolved but cannot disappear.',
    'File the exact candidate schema first. After the host accepts it, return the final_decision schema with target_dispositions: one {target, disposition} for every original target. Do not replace the final JSON with free-form verdicts.',
  ].join('\n');

  function sourceWindow(entry) {
    const result = entry.toolResult;
    if (entry.toolName !== 'open_file' || !result || result.error || typeof result.text !== 'string') return null;
    const source = sources.get(result.file);
    if (!selectedTree || result.source_ref !== selectedTree
        || (source && (result.source_ref !== source.source_ref || sha256(source.content) !== source.sha256))) return null;
    const start = entry.toolDelivery && entry.toolDelivery.startLine;
    const end = entry.toolDelivery && entry.toolDelivery.endLine;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
    const sourceLines = source ? source.content.split('\n') : null;
    const deliveredLines = result.text.split('\n').slice(start - result.start_line, end - result.start_line + 1);
    if ((sourceLines && end > sourceLines.length) || deliveredLines.length !== end - start + 1) return null;
    const lines = deliveredLines.map((line, index) => {
      const match = line.match(/^\s*(\d+)\t([\s\S]*)$/);
      return match && Number(match[1]) === start + index ? match[2] : null;
    });
    if (lines.some((line, index) => line === null || (sourceLines && line !== sourceLines[start - 1 + index]))) return null;
    const content = lines.join('\n');
    return { citation: `${result.file}:${start}-${end}`, file: result.file,
      line_start: start, line_end: end, source_ref: result.source_ref,
      source_total_lines: result.total_lines, source_sha256: source ? source.sha256 : null, excerpt_sha256: sha256(content), content,
      tool_call_id: entry.toolCallId, tool_window_id: entry.toolWindowId };
  }

  function prepare(messages, tools, options, history, phase) {
    if (inheritedDiscoveryErrors.length > 0) return { error: 'explicit_discovery_lineage_conflict',
      errors: inheritedDiscoveryErrors };
    if (!Number.isInteger(maxRequestBytes) || maxRequestBytes <= 0) {
      return { error: 'explicit_continuation_request_limit_missing' };
    }
    if (fixedMessageCount === null) fixedMessageCount = messages.length;
    for (const entry of history) {
      if (!entry.toolWindowId || windows.has(entry.toolWindowId)) continue;
      const evidence = sourceWindow(entry);
      windows.set(entry.toolWindowId, { evidence, delivered: false, message: messages[entry.toolMessageIndex],
        tool: entry.toolName, args: entry.toolArgs,
        result_sha256: sha256(JSON.stringify(entry.toolResult)),
        delivery: entry.toolDelivery || null });
    }
    const fixed = messages.slice(0, fixedMessageCount);
    const evolving = messages.slice(fixedMessageCount);
    // Keep assistant/tool pairs together. Everything before the last assistant
    // may be archived; immutable raw exchanges remain in this receipt.
    const groups = [];
    for (const message of evolving) {
      if (message.role === 'assistant' || groups.length === 0) groups.push([]);
      groups.at(-1).push(message);
    }
    const catalog = () => [...windows.entries()].map(([id, window]) => ({
      tool_call_id: id, tool: window.tool, args: window.args,
      result_sha256: window.result_sha256, delivered: window.delivered,
      literal_window: window.evidence && { citation: window.evidence.citation,
        source_ref: window.evidence.source_ref, source_sha256: window.evidence.source_sha256,
        excerpt_sha256: window.evidence.excerpt_sha256 },
      delivery: window.delivery,
      active: selected.flat().includes(window.message),
    }));
    const selected = [...groups];
    let requestMessages;
    function assemble() {
      const omittedIndex = archivedExchanges.map(entry => ({ receipt_id: `exchange:${entry.sha256}`, sha256: entry.sha256 }));
      const indexText = omittedIndex.map(entry => JSON.stringify(entry)).join('\n');
      const indexId = `exchange-index:${sha256(indexText)}`;
      testimony.set(indexId, indexText);
      const sourceCatalog = [...new Set([...sources.keys(), ...activeEvidence.map(evidence => evidence.file),
        ...[...windows.values()].flatMap(window => window.evidence ? [window.evidence.file] : [])])].map(file => {
        const unique = new Map();
        for (const entry of catalog().filter(item => item.literal_window
          && item.literal_window.citation.slice(0, item.literal_window.citation.lastIndexOf(':')) === file)) {
          const key = entry.literal_window.citation + ':' + entry.literal_window.excerpt_sha256;
          const window = unique.get(key) || { ids: [],
            range: entry.literal_window.citation.slice(entry.literal_window.citation.lastIndexOf(':') + 1),
            sha256: entry.literal_window.excerpt_sha256, delivered: false, active: false };
          window.ids.push(entry.tool_call_id);
          window.delivered ||= entry.delivered;
          window.active ||= entry.active;
          unique.set(key, window);
        }
        return { file, windows: [...unique.values()] };
      });
      return [...fixed, { role: 'system', content: phase === 'final' ? FINAL_SYSTEM_PROMPT : CANDIDATE_SYSTEM_PROMPT },
        { role: 'user', content: instruction + '\n' + JSON.stringify(fixedInventory) },
        { role: 'user', content: `Captured diff receipts (archived reviewer testimony, reread with read_review_receipt; never current source):\n${JSON.stringify(initialDiffs)}` },
        { role: 'user', content: JSON.stringify({ candidate_ledger: candidate && candidate.inventory.targetRecords.map(record => ({
            ...record, adjudications: record.adjudications.map(decision => ({ ...decision,
              evidence: decision.evidence.map(({ citation }) => ({ citation })) })) })),
          literal_selected_evidence: pinnedEvidence.map(({ citation, content, source_sha256, excerpt_sha256 }) => ({ citation, content, source_sha256, excerpt_sha256 })), source_window_catalog: sourceCatalog,
          other_tool_windows: catalog().filter(entry => !entry.literal_window),
          omitted_exchange_manifest: { receipt_id: indexId, sha256: sha256(indexText), entries: omittedIndex.length } }) },
        ...selected.flat()];
    }
    requestMessages = assemble();
    while (providerRequestBytes(requestMessages, tools, options) > maxRequestBytes && selected.length > (candidate && phase === 'final'
      && selected.at(-1)?.some(message => message.role === 'assistant'
        && sha256(message.content || '') === candidate.raw_content_sha256) ? 0 : 1)) {
      const omitted = selected.shift();
      const hash = sha256(JSON.stringify(omitted));
      if (!archivedExchanges.some(entry => entry.sha256 === hash)) {
        archivedExchanges.push({ sha256: hash, messages: omitted });
        testimony.set(`exchange:${hash}`, JSON.stringify(omitted));
      }
      requestMessages = assemble();
    }
    const bytes = providerRequestBytes(requestMessages, tools, options);
    const receipt = { request_sha256: sha256(serializeProviderRequest(requestMessages, tools, options)),
      request_bytes: bytes, max_request_bytes: maxRequestBytes,
      omitted_exchange_hashes: archivedExchanges.map(entry => entry.sha256),
      source_window_catalog: catalog(), status: bytes <= maxRequestBytes ? 'ready' : 'incomplete' };
    requests.push(receipt);
    if (bytes > maxRequestBytes) return { error: 'explicit_continuation_indispensable_envelope_exceeds_limit', receipt };
    const deliveredIds = new Set([...windows.entries()].filter(([, window]) => requestMessages.includes(window.message)).map(([id]) => id));
    activeEvidence = [...pinnedEvidence];
    for (const [id, window] of windows) {
      if (!deliveredIds.has(id)) continue;
      if (window.evidence) activeEvidence.push(window.evidence);
    }
    receipt.prepared_tool_window_ids = [...deliveredIds];
    pendingDelivery = { ids: deliveredIds, history, receipt };
    receipt.literal_evidence = activeEvidence.map(({ content, ...evidence }) => evidence);
    return { messages: requestMessages, receipt };
  }

  function acknowledge() {
    if (!pendingDelivery) return;
    for (const id of pendingDelivery.ids) {
      const window = windows.get(id);
      window.delivered = true;
      const entry = pendingDelivery.history.find(item => item.toolWindowId === id);
      if (entry && window.evidence) entry.explicitSourceDispatched = true;
    }
    pendingDelivery.receipt.status = 'response_received';
    pendingDelivery.receipt.delivered_tool_window_ids = [...pendingDelivery.ids];
    pendingDelivery = null;
  }

  function failed(error) {
    if (pendingDelivery) {
      pendingDelivery.receipt.status = 'delivery_unconfirmed';
      pendingDelivery.receipt.error = String(error);
      pendingDelivery = null;
    }
  }

  function evidenceTargets() {
    return targets.map(target => {
      const delivered = [...windows.values()].filter(window => window.delivered
        && window.evidence && window.evidence.file === target.path).map(window => window.evidence);
      return { ...target, source_evidence: activeEvidence,
        accepted_source_ranges: activeEvidence.filter(evidence => evidence.file === target.path),
        source_coverage_complete: rangesCover(delivered, target.source_total_lines),
        diff_coverage_complete: target.diff_coverage_complete === true };
    });
  }

  function registerDiscoveries(content, phase) {
    const errors = [];
    for (const fragment of extractJsonObjectFragments(content)) {
      if (!fragment.complete) {
        if (/"record_type"\s*:\s*"newly_discovered"/.test(fragment.text)) errors.push({ reason: 'incomplete_newly_discovered_record' });
        continue;
      }
      let proposal;
      try { proposal = JSON.parse(fragment.text); }
      catch (error) {
        if (/"record_type"\s*:\s*"newly_discovered"/.test(fragment.text)) errors.push({ reason: 'malformed_newly_discovered_record', error: error.message });
        continue;
      }
      if (proposal.record_type !== 'newly_discovered') continue;
      const target = targets.find(entry => entry.path === proposal.target);
      if (phase !== 'candidate') { errors.push({ reason: 'new_discovery_requires_candidate_revision' }); continue; }
      if (!target || Object.hasOwn(proposal, 'claim_id') || typeof proposal.statement !== 'string'
          || !proposal.statement.trim() || typeof proposal.reason !== 'string' || !proposal.reason.trim()
          || !Array.isArray(proposal.evidence)) {
        errors.push({ reason: 'new_discovery_shape_or_host_id_ownership_invalid' }); continue;
      }
      const id = `discovered:${sha256(JSON.stringify({ corpus: corpus.corpus_sha256,
        target: target.path, statement: proposal.statement }))}`;
      const validation = claimAdjudicationReceipt([{ claim_id: id }], JSON.stringify({ adjudications: [{
        claim_id: id, disposition: 'supported', reason: proposal.reason, evidence: proposal.evidence,
      }] }), activeEvidence);
      if (!validation.structurally_complete) {
        errors.push({ reason: 'new_discovery_requires_literal_selected_source', invalid: validation.invalid_decisions }); continue;
      }
      if (discoveries.some(discovery => discovery.claim.claim_id === id)) continue;
      const claim = { claim_id: id, statement: proposal.statement,
        citations: proposal.evidence.map(evidence => evidence.citation), origin: 'host_registered_discovery' };
      const discovery = { target: target.path, claim, reason: proposal.reason,
        source_receipt: validation.decisions[0].evidence,
        request_sha256: requests.at(-1)?.request_sha256 || null,
        proposal_sha256: sha256(fragment.text) };
      discoveries.push(discovery);
      target.claims.push(claim);
      testimony.set(id, JSON.stringify(discovery));
      errors.push({ reason: 'new_discovery_registered_refile_candidate', target: target.path, claim });
    }
    return errors;
  }

  function assess(content, phase) {
    const discoveryErrors = registerDiscoveries(content, phase);
    const expected = evidenceTargets();
    const claims = targets.flatMap(target => target.claims || []);
    const claimReceipt = claimAdjudicationReceipt(claims, content, activeEvidence);
    const supportingTargets = [...new Set(activeEvidence.map(evidence => evidence.file))]
      .filter(file => !targets.some(target => target.path === file)).map(file => {
        const evidence = activeEvidence.filter(entry => entry.file === file);
        return { path: file, source_ref: selectedTree, source_total_lines: evidence[0].source_total_lines,
          source_evidence: evidence, accepted_source_ranges: evidence, claims: [] };
      });
    const citationTargets = [...expected, ...supportingTargets];
    const inventory = phase === 'candidate' ? assessCandidateInventory(content, expected, citationTargets) : null;
    const parsed = phase === 'final' ? parseStructuredSynthesisRecord(content, 'final', citationTargets) : null;
    const errors = [...discoveryErrors];
    if (!claimReceipt.structurally_complete) errors.push({ reason: 'claim_denominator_or_literal_evidence_incomplete',
      missing: claimReceipt.missing_claim_ids, invalid: claimReceipt.invalid_decisions });
    if (inventory && !inventory.complete) errors.push({ reason: 'target_inventory_incomplete',
      missing: inventory.missingTargets, invalid: inventory.invalidTargetRecords });
    if (parsed && !parsed.complete) errors.push(...parsed.invalid);
    if (phase === 'final' && !candidate) errors.push({ reason: 'final_requires_filed_candidate' });
    if (parsed && parsed.complete && candidate) {
      const dispositions = parsed.record.target_dispositions;
      const filed = candidate.inventory.targetRecords;
      if (!Array.isArray(dispositions) || dispositions.length !== targets.length
          || new Set(dispositions.map(record => record.target)).size !== targets.length
          || dispositions.some(record => !filed.some(prior => prior.target === record.target
            && prior.disposition === record.disposition))) {
        errors.push({ reason: 'final_target_denominator_or_filed_disposition_mismatch' });
      }
      const report = assessReviewReport(parsed.record.answer, targets.map(target => target.path),
        previous.shardedReview.coverage.fourthShapeAdditionCount ?? null);
      if (report.namedAbsences.length > 0) errors.push({ reason: 'final_report_incomplete', report });
      if (parsed.record.decision === 'found_break' && !filed.some(record => record.disposition === 'finding')) {
        errors.push({ reason: 'final_break_without_filed_finding_requires_candidate_revision' });
      }
      if (parsed.record.decision === 'no_break_found' && (claimReceipt.unresolved_claim_ids.length > 0
          || previous.candidateSet.coverage.all_evidence_complete !== true
          || previous.candidateSet.coverage.reduction_chain_complete !== true
          || expected.some(target => !target.source_coverage_complete || !target.diff_coverage_complete)
          || filed.some(record => record.disposition !== 'examined_no_finding'))) {
        errors.push({ reason: 'no_break_with_unresolved_or_unread_evidence' });
      }
    }
    const receipt = { phase, content_sha256: sha256(content), raw_output: content,
      complete: errors.length === 0, errors, claims: claimReceipt,
      source_coverage: expected.map(target => ({ path: target.path, complete: target.source_coverage_complete })) };
    attempts.push(receipt);
    if (errors.length) return { complete: false, errors };
    if (phase === 'candidate') {
      candidate = { content: claimReceipt.rendered_content, raw_content_sha256: sha256(content), inventory };
      const quotes = claimReceipt.decisions.flatMap(decision => decision.evidence || []);
      pinnedEvidence = quotes.map(quote => {
        const match = quote.citation.match(/^(.*):(\d+)(?:-(\d+))?$/);
        const source = activeEvidence.find(evidence => evidence.file === match[1]
          && evidence.line_start <= Number(match[2]) && evidence.line_end >= Number(match[3] || match[2]));
        const start = Number(match[2]); const end = Number(match[3] || match[2]);
        const literal = source.content.split('\n').slice(start - source.line_start, end - source.line_start + 1).join('\n');
        return { ...source, citation: quote.citation, line_start: start, line_end: end,
          content: literal, excerpt_sha256: sha256(literal) };
      });
    } else final = parsed.record;
    return { complete: true, content: phase === 'candidate' ? candidate.content
      : [`VERDICT: ${final.decision}`, final.answer, ...claimReceipt.decisions.map(decision => JSON.stringify({ record_type: 'claim_adjudication', ...decision }))].join('\n') };
  }

  function finish(continued) {
    const snapshot = receipt();
    const originalCoverage = previous.candidateSet.coverage;
    const missingReads = snapshot.source_coverage.filter(target => !target.complete).map(target => target.path);
    const accepted = continued.termination === 'answer_given' && candidate && final;
    const resolved = [];
    const retained = (originalCoverage.unresolved || []).filter(item => {
      const discharged = accepted && (
        (item.scope === 'synthesis' && ['literal_source_and_manifest_exceed_request_envelope',
          'filed_decisions_and_manifest_exceed_request_envelope'].includes(item.reason))
        || (item.scope === 'candidate_inventory' && candidate.inventory.targetRecords.some(record =>
          record.target === item.target && record.disposition !== 'unresolved'))
        || (item.scope === 'final_claim_adjudication' && final.adjudications.some(decision =>
          decision.claim_id === item.claim_id && decision.disposition !== 'unresolved'))
        || item.scope === 'review_report');
      if (discharged) resolved.push(item);
      return !discharged;
    });
    const outstanding = [...retained,
      ...(candidate ? candidate.inventory.targetRecords.filter(record => record.disposition === 'unresolved')
        .map(record => ({ target: record.target, scope: 'candidate_inventory', reason: record.summary, load_bearing: true })) : []),
      ...(final ? final.adjudications.filter(decision => decision.disposition === 'unresolved')
        .map(decision => ({ target: '<final_claim_adjudication>', claim_id: decision.claim_id,
          scope: 'final_claim_adjudication', reason: decision.reason, load_bearing: true })) : [])];
    const complete = !!accepted && missingReads.length === 0
      && originalCoverage.all_evidence_complete === true && originalCoverage.reduction_chain_complete === true;
    const finalClaims = final ? claimAdjudicationReceipt(targets.flatMap(target => target.claims), JSON.stringify(final)) : null;
    return { ...previous, ...continued,
      candidateSet: { ...previous.candidateSet, ...(continued.candidateSet || {}),
        status: accepted ? 'succeeded' : 'failed', source: 'explicit_source_tool_continuation',
        claimInventory: targets.flatMap(target => target.claims.map(claim => ({ target: target.path, ...claim }))),
        finalClaimAdjudications: finalClaims,
        explicitContinuation: { corpus_sha256: corpus.corpus_sha256,
          request_hashes: requests.map(request => request.request_sha256),
          source_coverage: snapshot.source_coverage, termination: continued.termination },
        coverage: { ...originalCoverage, complete,
          authorityReady: complete && outstanding.every(item => item.load_bearing === false),
          declaration: candidate ? candidate.inventory.declaration : null,
          declarationComplete: !!candidate && candidate.inventory.complete,
          missingInventoryFiles: candidate ? candidate.inventory.missingTargets : targets.map(target => target.path),
          wholeFilesRead: snapshot.source_coverage.filter(target => target.complete).map(target => target.path),
          missingWholeFileReads: missingReads, unresolved: outstanding, unresolvedItems: outstanding,
          load_bearing_unresolved: outstanding.filter(item => item.load_bearing !== false) } },
      iterations: (recheck ? 0 : previous.iterations) + (continued.iterations || 0),
      providerAttempts: [...(recheck ? [] : previous.providerAttempts), ...(continued.providerAttempts || [])],
      shardedReview: { ...previous.shardedReview, continuation: { ...snapshot,
        original_termination: previous.termination, termination: continued.termination,
        stage: recheck ? 'recheck' : 'initial_continuation',
        inherited_provider_attempt_count: recheck ? previous.providerAttempts.length : 0,
        failed_envelope_request_ids: fixedInventory.failed_envelopes.map(entry => entry.request_id),
        failed_envelopes: fixedInventory.failed_envelopes.map(entry => ({
          request_id: entry.request_id, request_sha256: entry.request_sha256,
          request_bytes: entry.request_bytes, error_sha256: sha256(entry.error || ''),
          error_code: entry.error === 'literal_source_and_manifest_exceed_request_envelope'
            ? 'literal_source_envelope' : entry.error === 'filed_decisions_and_manifest_exceed_request_envelope'
              ? 'filed_decision_envelope' : 'other_failed_request' })),
        resolved_obligations: resolved, retained_obligations: outstanding,
        resolution: accepted ? 'continued_with_source_tools' : 'incomplete' } },
    };
  }

  function receipt() {
    return { corpus_sha256: corpus.corpus_sha256, requests, attempts,
      archived_exchanges: archivedExchanges, candidate, final,
      original_claim_ids: originalClaimIds, original_claim_count: originalClaimIds.length,
      discovered_claims: discoveries, discovered_claim_count: discoveries.length,
      inherited_discovery_errors: inheritedDiscoveryErrors,
      source_coverage: evidenceTargets().map(target => ({ path: target.path, complete: target.source_coverage_complete })) };
  }

  const receiptTool = { type: 'function', function: { name: 'read_review_receipt',
    description: 'Read exact immutable archived reviewer testimony by catalog receipt ID and explicit inclusive line range. Never primary source.',
    parameters: { type: 'object', properties: { receipt_id: { type: 'string' },
      start_line: { type: 'integer', minimum: 1 }, end_line: { type: 'integer', minimum: 1 } },
      required: ['receipt_id', 'start_line', 'end_line'], additionalProperties: false } } };
  function readReceipt(args) {
    const text = testimony.get(args && args.receipt_id);
    if (text === undefined) return { error: 'review_receipt_id_unknown', evidence_kind: 'archived_reviewer_testimony' };
    const lines = text.split('\n');
    if (!Number.isInteger(args.start_line) || !Number.isInteger(args.end_line)
        || args.start_line < 1 || args.end_line < args.start_line || args.end_line > lines.length) {
      return { error: 'review_receipt_range_invalid', receipt_id: args.receipt_id,
        total_lines: lines.length, evidence_kind: 'archived_reviewer_testimony' };
    }
    return { receipt_id: args.receipt_id, receipt_sha256: sha256(text),
      evidence_kind: 'archived_reviewer_testimony', start_line: args.start_line,
      end_line: args.end_line, total_lines: lines.length,
      text: lines.slice(args.start_line - 1, args.end_line).map((line, index) => `${args.start_line + index}\t${line}`).join('\n') };
  }
  return { prepare, acknowledge, failed, assess, receiptTool, readReceipt, finish, receipt,
    fresh: nextPrevious => createExplicitContinuation({ corpus, reviewTargets,
      previous: nextPrevious || previous, maxRequestBytes, originalQuery, recheck: true }) };
}

module.exports = { createExplicitContinuation };
