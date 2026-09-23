# Inherited limitations

Static import matches are not transitive/dataflow closure. String-key/dynamic configuration consumers and JSON filesystem loads need direct tracing; zero direct imports is not zero consumers. Existing tool-history compaction remains for larger outputs. This patch does not fix the candidate's scan-denominator rewriting, selected-target completeness semantics, or outstanding index-scope conflicts.

Existing Serena timeout/catch behavior is unchanged and has not been certified by this patch. No bot throw, gate, fallback or shutdown policy was added. Full Mercury/Fable/recheck/Kimi acceptance and complete Stop 1 migration are not delivered by this change.
