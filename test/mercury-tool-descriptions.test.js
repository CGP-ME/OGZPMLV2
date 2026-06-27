'use strict';

const { createToolAdapter } = require('../trai_brain/mercury-bridge/tool-adapter');

describe('Mercury tool intent descriptions', () => {
  test('exported tool schema starts each description with developer intent', () => {
    const adapter = createToolAdapter();
    const schemaByName = Object.fromEntries(
      adapter.buildToolSchema().map((tool) => [tool.function.name, tool.function.description])
    );

    expect(schemaByName.search).toMatch(/^Find every current repo occurrence of a literal string when older traces call search instead of grep\./);
    expect(schemaByName.grep).toMatch(/^Find every current repo occurrence of a string when you need sibling violations, consumers, or exact literals\./);
    expect(schemaByName.regex_grep).toMatch(/^Find all current repo matches for a bug pattern or rule when a literal search is too narrow\./);
    expect(schemaByName.find_definition).toMatch(/^Find likely current repo definitions for a symbol before tracing callers or changing its contract\./);
    expect(schemaByName.find_references).toMatch(/^Find likely current repo usages of a symbol when you need callers, consumers, or same-name sibling paths\./);
    expect(schemaByName.rule_scan).toMatch(/^Run codified Mercury review rules as grep evidence when recurring bug classes need a durable check\./);
    expect(schemaByName.open_file).toMatch(/^Read exact current repo lines before making or citing a file-line claim\./);
    expect(schemaByName.get_chunk).toMatch(/^Hydrate a retrieved RAG chunk when starter context points at an indexed document that needs full text\./);
    expect(schemaByName.list_files).toMatch(/^Discover non-ignored files in a repo directory when you do not know the exact target path\./);
    expect(schemaByName.tavily_search).toMatch(/^Search current public web sources when repo evidence is insufficient for external docs or news\./);
    expect(schemaByName.git_show).toMatch(/^Inspect historical file contents when branch drift, regressions, or before\/after equivalence matters\./);
    expect(schemaByName.git_diff).toMatch(/^Inspect active, staged, working, or recent-commit changes when the review depends on what changed\./);
    expect(schemaByName.serena_blast_radius).toMatch(/^Find downstream files that can break when this file or event contract changes\./);
    expect(schemaByName.serena_property_refs).toMatch(/^Find AST-backed JavaScript property reads, writes, destructures, deletes, and mutating uses without matching comments or strings\./);
    expect(schemaByName.serena_method_callers).toMatch(/^Find AST-backed JavaScript member method calls and call-result mutation\/read sites\./);
    expect(schemaByName.serena_class_fields).toMatch(/^Find AST-backed JavaScript class fields, methods, getters, and setters for a named class\./);
    expect(schemaByName.run_check).toMatch(/^Run an allowed proof command and save the output artifact when a concrete claim depends on execution\./);
    expect(schemaByName.web_fetch).toMatch(/^Fetch a known allowlisted URL when exact external source text is needed and search would add noise\./);
  });

  test('legacy tool docs retain intent framing without current-diff-first cage guidance', () => {
    const docs = createToolAdapter().buildToolDocs();

    expect(docs).toContain('Find every current repo occurrence of a string when you need sibling violations, consumers, or exact literals.');
    expect(docs).toContain('Inspect active, staged, working, or recent-commit changes when the review depends on what changed.');
    expect(docs).toContain('Find AST-backed JavaScript property reads, writes, destructures, deletes, and mutating uses without matching comments or strings.');
    expect(docs).toContain('do not assume the current diff is the whole answer');
    expect(docs).not.toContain('Use git_diff target=current first');
  });
});
