'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { createToolAdapter } = require('../trai_brain/mercury-bridge/tool-adapter');

function writeFixture(root, relPath, text = 'fixture') {
  const absPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, text);
}

describe('Mercury Serena AST tools', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-mercury-serena-ast-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('Mercury exposes Serena AST symbol evidence as normal read-only tools', async () => {
    writeFixture(tmpRoot, 'core/symbols.js', `
      class SymbolStore {
        rows = [];
        get count() { return this.rows.length; }
        set count(value) { this.rowCount = value; }
        saveToDisk() { return this.rows; }
      }
      function update(state, input) {
        state.positionId = input.positionId;
        const { positionId } = input;
        state.events.push(positionId);
        state.saveToDisk();
        return state.getEvents().push(input);
      }
      const ignored = "state.positionId = fake";
    `);
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale.js', 'state.positionId = "ignored";');

    const adapter = createToolAdapter({ repoRoot: tmpRoot });
    const propertyResult = await adapter.execute('serena_property_refs', {
      property: 'positionId',
      scope: 'core/**/*.js',
    });
    const methodResult = await adapter.execute('serena_method_callers', {
      method: 'getEvents',
      scope: 'core/**/*.js',
    });
    const classResult = await adapter.execute('serena_class_fields', {
      class: 'SymbolStore',
      scope: 'core/**/*.js',
    });
    const schemaNames = adapter.buildToolSchema().map((tool) => tool.function.name);

    expect(propertyResult.error).toBeUndefined();
    expect(propertyResult.source).toBe('serena_property_refs');
    expect(propertyResult.references.map((ref) => ref.op).sort()).toEqual([
      'destructure',
      'read',
      'write',
    ]);
    expect(propertyResult.text).toContain('## Symbol References — positionId');
    expect(propertyResult.text).not.toContain('fake');

    expect(methodResult.error).toBeUndefined();
    expect(methodResult.source).toBe('serena_method_callers');
    expect(methodResult.callers[0]).toMatchObject({
      method: 'getEvents',
      op: 'call+mutate-return:push',
    });

    expect(classResult.error).toBeUndefined();
    expect(classResult.source).toBe('serena_class_fields');
    expect(classResult.classes[0].fields.map((item) => item.name)).toEqual(['rows']);
    expect(classResult.classes[0].methods.map((item) => item.name)).toEqual(['saveToDisk']);
    expect(classResult.classes[0].getters.map((item) => item.name)).toEqual(['count']);
    expect(classResult.classes[0].setters.map((item) => item.name)).toEqual(['count']);

    expect(schemaNames).toContain('serena_property_refs');
    expect(schemaNames).toContain('serena_method_callers');
    expect(schemaNames).toContain('serena_class_fields');
  });
});
