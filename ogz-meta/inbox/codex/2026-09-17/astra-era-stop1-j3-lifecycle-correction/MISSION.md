# STOP 1 J3 lifecycle correction

Close every source-proven J3 interaction at its actual owner. Do not replace producer completion with a generic refusal, gate, timeout, supervisor, pause, halt, flatten, or fallback controller.

The correction must:

1. return backtest completion/failure to the actual runner lifecycle;
2. retain signal ownership while cleanup is pending;
3. keep lock read/parse errors nonterminal while missing/replaced ownership remains terminal through the runner;
4. distinguish intentional lock non-acquisition from release failure;
5. stop the actual startup/session/timer/callback producers and settle already-dispatched work;
6. complete pending broker/dashboard work and transport teardown at each existing service owner;
7. propagate actual persistence outcomes; and
8. attempt every cleanup owner even when one fails.

No J3 dependency exposed by this walk is deferred behind a placeholder interface.
