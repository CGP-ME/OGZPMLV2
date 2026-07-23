Principal Systems Architecture Review
Mission

You are acting as a Principal Systems Architect, AI Platform Architect, and Engineering Runtime Designer.

You are not reviewing code.

You are designing the next generation of an engineering runtime intended to support long-horizon AI-assisted software engineering.

The objective is to maximize:

Correctness
Auditability
Determinism
Architectural integrity
Engineering throughput
Repository understanding
Verification quality
Reproducibility
Human trust
Long-term maintainability

This is not a greenfield project.

This is the evolution of an existing engineering ecosystem that has been built through extensive iteration, failures, debugging, architectural redesign, and operational lessons.

Repository

Repository:

https://github.com/CGP-ME/OGZPMLV2

Primary Branch:

codex/multi-asset-symbol-state

Read the repository broadly.

Do not assume documentation is correct.

Repository reality supersedes documentation.

Repository reality supersedes prompts.

Repository reality supersedes assumptions.

Context

Over the course of development, numerous engineering systems, guardrails, verification layers, prompts, runtime components, orchestration layers, receipts, memory systems, and engineering tools have been built.

These were not created because they were architecturally elegant.

They were created because specific engineering failures occurred.

Every system below exists because it solved, or attempted to solve, a real failure mode encountered during development.

Treat these systems as available engineering assets.

They are not architectural commitments.

You are free to:

retain them
modify them
merge them
decompose them
extract them
replace them
delete them
recommend existing open-source alternatives
recommend commercial alternatives
recommend entirely different approaches

Do not preserve anything merely because it already exists.

Existing Engineering Assets

For each system below, assume the following information will be supplied:

Technical purpose
Internal architecture
Current implementation
Existing capabilities
Known limitations
Failure mode(s) it was originally designed to address
Current operational maturity
Current prompts
Current tooling
Current integrations
Current repository location

Examples include (but are not limited to):

Mercury

Repository-grounded engineering verification system.

Current capabilities include, but are not limited to:

Canonical repository RAG
Multi-vector semantic retrieval
Repository indexing
Cross-module reasoning
Symbol-aware engineering search
Repository-grounded responses
Adversarial engineering analysis
Bug-class hunting
Architectural contract verification
Ownership verification
Configuration authority analysis
Repository evidence retrieval
Session-aware engineering reasoning
Receipt consumption
Long-context engineering support

Current limitations and implementation details will be provided.

Clauditos

Bounded specialist engineering workers.

Current capabilities include:

Narrowly scoped engineering tasks
Structured outputs
Limited-context execution
Independent task execution
Intermediate engineering artifact generation
Isolation from unrelated work
Specialized engineering responsibilities

Current limitations and implementation details will be provided.

Repository Receipts

Durable engineering evidence system.

Current capabilities include:

Repository mutation history
Engineering decision recording
Process evidence
Mission evidence
Engineering replay
Historical context
Engineering traceability

Current implementation details will be provided.

Engineering Memory

Current capabilities include:

Project memory
Session memory
Engineering doctrine
Architecture history
Repository history
Long-term engineering context

Implementation details will be provided.

Repository Intelligence

Current capabilities include:

Semantic search
Embeddings
Symbol graph
Repository graph
Cross-reference analysis
Architecture indexing
Code intelligence

Implementation details will be provided.

Runtime / Orchestration

Current capabilities include:

Tool execution
Mission execution
Capability routing
Repository interaction
Testing
Session persistence
Multi-model interaction
Engineering workflows

Implementation details will be provided.

Additional Systems

Additional prompts, tooling, automation, verification systems, engineering utilities, orchestration layers, guardrails, doctrine, and runtime components will also be supplied.

Treat every one of them as engineering inventory.

Not architectural truth.

Engineering Philosophy

The goal of this project is not to build autonomous coding agents.

The goal is to build a portable engineering operating system capable of producing trustworthy software regardless of which language models participate.

Language models are replaceable.

The engineering process is the durable asset.

Fundamental Engineering Requirement

One of the primary lessons learned during development is that freehand engineering does not scale.

The repository must never again evolve primarily through undocumented, one-off, discretionary edits performed independently by humans or AI.

Instead:

Meaningful repository mutations should emerge from defined engineering processes that are:

inspectable
replayable
attributable
continuously optimized
evidence-producing
receipt-generating
deterministic wherever practical

The engineering process—not the individual model—is the primary unit of engineering.

The target architecture should minimize undocumented discretionary work and maximize engineering work produced through standardized, observable processes.

Human Governance

The human operator is not expected to possess complete implementation knowledge of every subsystem.

The architecture should reduce cognitive load by making engineering work understandable through evidence, process, and traceability rather than requiring complete manual reconstruction of repository state.

The human governs the engineering system.

The engineering system performs the engineering work.

Existing Engineering Problems

Throughout development the following classes of failures have repeatedly occurred:

Architectural drift
Configuration authority violations
Hidden ownership
Hidden state
Silent repository mutations
Production/test divergence
False confidence
Correlated reviewer failures
Prompt contamination
Incomplete repository search
Local reasoning instead of global reasoning
Repository hallucination
Regression caused by partial understanding
Long-horizon context loss
Hidden assumptions
Green tests that failed to prove intended invariants

Assume these are real engineering failures.

Your architecture should specifically address them.

Research Expectations

Leverage:

Existing open-source projects
Academic research
AI engineering research
Verification research
Workflow engines
Agent orchestration systems
Event sourcing
Provenance systems
Build systems
CI/CD architecture
Static analysis
Formal verification
Repository intelligence systems
Multi-agent research

Do not reinvent existing technology unless there is a compelling architectural reason.

Whenever possible:

cite projects
cite papers
cite architectural patterns
cite implementation examples
Your Assignment

Given:

the repository
the supplied engineering assets
the existing prompts
the existing tooling
the current runtime
current AI capabilities
modern software engineering practices
existing open-source ecosystems
current research

Design the engineering runtime that you would build.

Do not feel obligated to preserve current modules.

Do not feel obligated to preserve current naming.

Do not feel obligated to preserve current architecture.

If existing systems should survive, explain why.

If they should be merged, explain why.

If they should be replaced, explain why.

If they should be extracted into reusable infrastructure, explain why.

If existing open-source software already solves a problem better than the current implementation, recommend it.

If commercial systems should replace internally built components, explain why.

If entirely different architecture should be used, explain why.

Every recommendation should be technically justified.

Deliverables

Produce:

Overall architecture
Runtime architecture
Engineering process architecture
Repository intelligence architecture
Verification architecture
Memory architecture
Receipt architecture
Mission architecture
Capability architecture
Orchestration architecture
Governance architecture
Recommended open-source components
Recommended commercial components
Build vs. buy analysis
Migration strategy
Incremental implementation roadmap
Expected risks
Failure modes
Strongest criticisms of your own proposal

Finally answer:

If you inherited this engineering ecosystem today, what would you build differently, what would you preserve, and what concrete technical steps would you take to evolve it into the strongest AI-assisted engineering runtime you know how to build?