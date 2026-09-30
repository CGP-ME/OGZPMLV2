'use strict';

// Optional source-backed continuation for an explicit review whose literal
// candidate/final envelope cannot fit. Normal ReAct modes do not use this lane.
const {
  sha256, providerRequestBytes, serializeProviderRequest,
  claimAdjudicationReceipt,
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
  // Preserve inherited discovery records verbatim; the panel owns their adjudication.
  const originalCandidateSet = previous.shardedReview?.continuation?.original_candidate_set || previous.candidateSet;
  const discoveries = [previous, ...(previous.continuationRechecks || [])]
    .flatMap(result => result.shardedReview?.continuation?.discovered_claims || []);
  const sources = new Map(corpus.artifacts.filter(artifact => artifact.kind === 'source')
    .map(artifact => [artifact.target, artifact]));
  const selectedTrees = new Set(targets.map(target => target.source_ref));
  const selectedTree = selectedTrees.size === 1 ? [...selectedTrees][0] : null;
  const windows = new Map();
  const requests = [];
  const attempts = [];
  const archivedExchanges = [];
  let activeEvidence = [];
  let observation = null;
  let fixedMessageCount = null;
  let pendingDelivery = null;
  const testimony = new Map([...previous.shardedReview.map, ...previous.shardedReview.candidates,
    ...previous.shardedReview.synthesis_attempts].filter(receipt => receipt.raw_output)
    .map(receipt => [receipt.request_id || receipt.shard_id, receipt.raw_output]));
  const fixedInventory = {
    original_query: originalQuery,
    inherited_evidence_absences: previous.candidateSet.coverage.unresolved,
    prior_continuation_decision: previous.shardedReview.continuation?.observation || previous.shardedReview.continuation?.final || null,
    prior_recheck_decisions: (previous.continuationRechecks || []).map(recheck => ({
      candidate: recheck.candidateSet?.content || null,
      final: recheck.shardedReview?.continuation?.observation || recheck.shardedReview?.continuation?.final || null,
      termination: recheck.termination })),
    corpus_sha256: corpus.corpus_sha256,
    targets,
    original_claim_ids: originalClaimIds,
    inherited_discoveries: discoveries,
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
      const ledger = originalCandidateSet.content == null ? '' : String(originalCandidateSet.content);
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
    'EXPLICIT REVIEW CONTINUATION: earlier failed envelopes remain recorded; continue the original review.',
    'The inventory preserves the original targets, claims and prior testimony. Assess them and report your actual findings, including new discoveries in your own answer.',
    'Use selected-tree source tools as needed. State what you examined and what remains unread or unresolved; do not infer a clean result from missing evidence.',
    'Archived testimony is rereadable by exact receipt ID and line range with read_review_receipt. It is not current source.',
    'Evicted source windows remain recorded in receipts; reopen source ranges needed for reasoning. Read metrics describe delivered source, not comprehension.',
    'Return your actual review answer when ready. No candidate registration, mandatory whole-file read, or host schema acceptance is required.',
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

  function prepare(messages, tools, options, history) {
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
      return [...fixed,
        { role: 'user', content: instruction + '\n' + JSON.stringify(fixedInventory) },
        { role: 'user', content: `Captured diff receipts (archived reviewer testimony, reread with read_review_receipt; never current source):\n${JSON.stringify(initialDiffs)}` },
        { role: 'user', content: JSON.stringify({ source_window_catalog: sourceCatalog,
          other_tool_windows: catalog().filter(entry => !entry.literal_window),
          omitted_exchange_manifest: { receipt_id: indexId, sha256: sha256(indexText), entries: omittedIndex.length } }) },
        ...selected.flat()];
    }
    requestMessages = assemble();
    while (providerRequestBytes(requestMessages, tools, options) > maxRequestBytes && selected.length > 1) {
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
    activeEvidence = [];
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

  function observe(content) {
    const claims = [...new Map([...targets.flatMap(target => target.claims || []),
      ...discoveries.map(discovery => discovery.claim).filter(Boolean)]
      .map(claim => [claim.claim_id, claim])).values()];
    observation = {
      raw_output: content, content_sha256: sha256(content),
      claims: claimAdjudicationReceipt(claims, content, activeEvidence),
      report: assessReviewReport(content, targets.map(target => target.path),
        previous.shardedReview.coverage.fourthShapeAdditionCount ?? null),
      source_coverage: evidenceTargets().map(target => ({ path: target.path, complete: target.source_coverage_complete })),
      authority: 'diagnostic_only',
    };
    attempts.push(observation);
    return observation;
  }

  function finish(continued) {
    const snapshot = receipt();
    return { ...previous, ...continued,
      candidateSet: { ...previous.candidateSet, ...(continued.candidateSet || {}),
        claimInventory: continued.candidateSet?.claimInventory?.length
          ? continued.candidateSet.claimInventory : previous.candidateSet.claimInventory,
        explicitContinuation: { corpus_sha256: corpus.corpus_sha256,
          request_hashes: requests.map(request => request.request_sha256),
          source_coverage: snapshot.source_coverage, termination: continued.termination,
          observation, authority: 'diagnostic_only' } },
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
        original_candidate_set: originalCandidateSet,
        resolution: continued.termination === 'answer_given' ? 'reviewer_answer_received' : 'incomplete' } },
    };
  }

  function receipt() {
    return { corpus_sha256: corpus.corpus_sha256, requests, attempts,
      archived_exchanges: archivedExchanges, observation,
      original_claim_ids: originalClaimIds, original_claim_count: originalClaimIds.length,
      discovered_claims: discoveries, discovered_claim_count: new Set(discoveries.map(entry => entry.claim?.claim_id)).size,
      inherited_discovery_record_count: discoveries.length,
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
  return { prepare, acknowledge, failed, observe, receiptTool, readReceipt, finish, receipt,
    fresh: nextPrevious => createExplicitContinuation({ corpus, reviewTargets,
      previous: nextPrevious || previous, maxRequestBytes, originalQuery, recheck: true }) };
}

module.exports = { createExplicitContinuation };
