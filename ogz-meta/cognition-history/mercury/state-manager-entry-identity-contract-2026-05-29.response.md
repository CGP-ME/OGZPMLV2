Mercury attack result:

Mercury did not find a path where missing `orderId`, `action`, `direction`, or
`entryStrategy` reaches `activeTrades` after this patch.

Mercury did identify a trust-boundary limitation: an internal caller can still
pass any non-empty `orderId` and `entryStrategy` values, and `StateManager`
cannot prove that those strings came from a broker acknowledgment or canonical
strategy source. That is real as a boundary fact, but it is not a bypass of this
slice. This slice removes silent fabrication at the state boundary; broker-order
authenticity belongs at the OrderExecutor/broker-ack boundary and should not be
implemented here with a fake provenance flag.

Residual risk to track separately:
- Direct internal callers can provide false but syntactically complete entry
  identity.
- A future broker-ack provenance contract can narrow that boundary, but only if
  it is tied to real OrderExecutor/broker routing evidence rather than a caller
  supplied boolean.
