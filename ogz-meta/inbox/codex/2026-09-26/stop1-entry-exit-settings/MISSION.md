# Entry-owned managed-stop settings

Trey: "try and get through the whole stop 1 without stopping", "checked and verified and fixed and everyting". Standing scope: finish the two-owner configuration migration; no silent overrides/fallbacks; preserve entry settings; verify real consumers, Mercury review, one connected change per commit and push. No deployment permission.

Continue from e3fa99f244321db00723235b909f6a0b6ccfa56a on astra-era. Repair the existing PolicyBuilder -> frozen policy -> managed trailing/break-even consumers and their settings interface. Do not redesign partial exits, change ATR smoothing, invent a lifecycle gate, or adopt the inherited dirty patch wholesale. Missing legacy policy cannot be reconstructed from today's configuration; retain existing stop/exit evaluation, name unavailable updates and route through existing trace/notification plumbing.
