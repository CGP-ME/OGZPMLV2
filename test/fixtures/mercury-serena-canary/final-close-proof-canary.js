'use strict';

/**
 * Synthetic Mercury/Serena canary.
 *
 * This file is intentionally broken and must never be imported by production
 * code. It exists so Mercury can prove it can separate executable property
 * writes from noisy comments and string literals.
 */

const DECOY_SNIPPETS = [
  'proof.finalClose = true is a comment-shaped decoy',
  'journal.finalClose = true should not be treated as executable code',
  'record.finalClose = true appears in text but is not a write',
];

// decoy: proof.finalClose = true
// decoy: activeTrade.finalClose = true
// decoy: summary.finalClose = true

function publishCloseProof(record, fill) {
  const closedQuantity = Number(fill.closedQuantity || 0);
  const entryQuantity = Number(record.entryQuantity || 0);

  record.partialClose = closedQuantity > 0 && closedQuantity < entryQuantity;
  record.closedQuantity = closedQuantity;

  if (record.partialClose) {
    record.status = 'partial';
  }

  record.finalClose = true;

  return {
    id: record.id,
    finalClose: record.finalClose,
    partialClose: record.partialClose,
    closedQuantity,
    entryQuantity,
    decoys: DECOY_SNIPPETS,
  };
}

module.exports = { publishCloseProof };
