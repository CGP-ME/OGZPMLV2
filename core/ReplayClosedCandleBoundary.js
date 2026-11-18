'use strict';

const SCOPE_FIELDS = [
  'brokerId',
  'accountId',
  'accountIdSource',
  'assetClass',
  'executionMode',
  'timeframe',
];

function confirmedClosedCandleAtBoundary({ candleClosed, candleRevision, priorCandle, lastDecisionCandle, incomingCandle, incomingScope, symbol }) {
  // A broker correction updates history; it is not a newly closed entry bar,
  // including when it is the first message after hydration or reconnection.
  if (candleRevision === true) return null;
  if (!incomingCandle || !incomingScope) return null;
  // Completed-bar feeds deliver the decision bar itself. Forming-bar feeds
  // confirm the previous bar only when the next interval begins.
  if (candleClosed === false && (!priorCandle || !(priorCandle.etime <= incomingCandle.t))) return null;
  if (candleClosed === true && priorCandle && priorCandle.etime > incomingCandle.etime) return null;
  const closedCandle = candleClosed === true ? incomingCandle : candleClosed === false ? priorCandle : null;
  if (!closedCandle || closedCandle.symbol !== symbol) return null;
  for (const field of SCOPE_FIELDS) {
    if (closedCandle[field] !== incomingScope[field]) return null;
  }
  if (lastDecisionCandle && lastDecisionCandle.symbol === symbol
      && SCOPE_FIELDS.every(field => lastDecisionCandle[field] === incomingScope[field])
      && lastDecisionCandle.etime >= closedCandle.etime) return null;
  return closedCandle;
}

module.exports = { confirmedClosedCandleAtBoundary };
