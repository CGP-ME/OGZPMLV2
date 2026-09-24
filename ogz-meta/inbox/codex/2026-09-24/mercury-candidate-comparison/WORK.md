# Work

Parent: 78de52d16f61df2379794de9d81fa9dee19a4f7d on astra-era. Existing rejected Stop 1 changes preserved; index initially empty.

Changed only the existing Mercury agentic prompt: collect exhaustive relevant candidates before selection; keep evidence for and against each, including rejected and unresolved candidates; follow relevant search/AST matches and distinguish base configuration from overrides; continue after a supported first answer; compare the complete set and explain one or multiple supported conclusions. Rechecks retain the original scope and reassess raw evidence. The existing two-phase loop is unchanged.

Delivery checked through the actual runReactLoop and runReviewRechecks entry points with an intercepted synthetic client: all four captured calls carried the exact same revised system prompt, maxTokens=7750, 17 existing tools including all four Serena tools, and no iteration limit. No provider was called for that wiring observation. This is not proof that a model follows the instructions.

The next actual run must use a newly captured isolated configuration containing this revision; older isolated JSON copies retain the older prompt. No existing isolated config or receipt is overwritten.
