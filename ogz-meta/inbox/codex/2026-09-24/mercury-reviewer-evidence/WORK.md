# Work

Observed: the host saved 169,360 bytes / 39 AST/reference sections, all re-hashed correctly, while Fable/Kimi input provenance had no host scan sources. Both answers reported absent host AST evidence. The existing prompt builders sent summary telemetry and model answers, not the actual bounded tool results.

Changed ask.js to send every captured artifact line using the existing <=150-line attested-excerpt representation, without choosing narrower targets. Changed existing reviewer builders to include that evidence and actual serialized tool results, with delivery metadata. Kimi additionally receives recheck tool results. Input provenance now records the same sources supplied in prompts. Existing positive-evidence accounting receives the actually delivered host excerpts; doctrine/coverage ceilings remain unchanged.

Local observation ran the actual reviewer functions up to their transport method. Transmission was deliberately not performed; the named local error is a capture boundary, not a provider failure. Final observation uses delivery-final.json. Syntax and scoped diff checks passed. Full paid rerun and fresh indexing remain required after landing.
