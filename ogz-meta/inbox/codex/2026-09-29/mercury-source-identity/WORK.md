# Work

Branch: astra-era. Baseline: e6d80e0a12ad8051cf81a09e7c104985d64502e0. Review passed. Code and packet are delivered together by the containing atomic commit.

Five implementation files: ask.js, evidence-ingestion.js and tool-adapter.js under trai_brain/mercury-bridge; tools/dep-scanner.js and tools/serena-bridge.js.

Add explicit review-ref/review-base source selection. Capture policy-permitted Git blobs with source hashes and manifest. Bind captured-source ingestion, file/search/AST tools, pinned comparison diff, and recheck dispatcher to that source root. Historical Git reads retain explicit requested refs. Existing worktree and ordinary review modes remain available. No iteration ceiling added.

Inherited edits in the same files are excluded from staging. Candidate implementation is loaded from its exact immutable Git tree for verification; node_modules resolves installed dependencies normally. Evidence views contain no Git checkout and no executable code is loaded from them.

Revised implementation tree f93161d39f016be57591dfda72101c3ed5c8da59 qualified by actual panel. Documentation additions: root AGENTS.md pre-commit pinning rule, Mercury README invocation, and scoped CHANGELOG entry. All five runtime file objects are recorded in CANDIDATE.json; later packet/document changes do not alter those reviewed objects. The containing delivery commit is the authoritative code/packet cross-reference; remote delivery receipt is recorded afterward.
