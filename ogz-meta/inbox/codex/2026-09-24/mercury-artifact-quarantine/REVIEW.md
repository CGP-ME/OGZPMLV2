# Bounded review

Two external I/O entry points examined: writer (mkdir/chmod, exclusive artifact/manifest open, write, mode and close), and readback. These are failures originating at the filesystem, not new internal-invariant throws. No throw added, no trust/ignore/evidence check removed. A missing artifact still cannot support verified authority. The sole new conditional chooses whether actual reopened bytes exist to attest; it does not prevent any reviewer or bot operation.

Constructed observations used the actual coordinator with all provider, database, notification and ledger-write side effects intercepted. Injected writer EACCES and reopened-artifact EACCES each continued through Mercury, Fable and Kimi, delivered no fabricated excerpts, retained named quarantine/error, and ended UNVERIFIED. A successful read of an already preserved real bundle delivered the same 32 excerpts to both secondary seats without an artifact quarantine. These are boundary observations, not a live provider review of the repair or a bot run.

The earlier actual model run at c0292498 remains UNVERIFIED and is not acceptance of this edit. Exhaustive candidate investigation and source-citation reliability are still unresolved. This fix does not address those different defects, nor does it close Stop 1.
