'use strict';

const SCOPE_FIELDS = [
  'brokerId',
  'accountId',
  'accountIdSource',
  'assetClass',
  'executionMode',
  'timeframe',
];

function confirmedClosedCandleAtBoundary({ isNewCandle, priorCandle, incomingCandle, incomingScope, symbol }) {
  if (isNewCandle !== true || !priorCandle || !incomingCandle || !incomingScope) return null;
  if (!(Number(priorCandle.etime) < Number(incomingCandle.etime))) return null;
  if (priorCandle.symbol !== symbol) return null;
  for (const field of SCOPE_FIELDS) {
    if (priorCandle[field] !== incomingScope[field]) return null;
  }
  return priorCandle;
}

module.exports = { confirmedClosedCandleAtBoundary };
