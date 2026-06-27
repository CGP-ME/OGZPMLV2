'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  getClassFields,
  getMethodCallers,
  getPropertyReferences,
} = require('../tools/serena-symbol-scanner');

function writeFixture(root, relPath, content) {
  const absPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf8');
}

describe('Serena Tree-sitter symbol scanner', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'serena-symbol-'));
    writeFixture(tmpRoot, 'core/sample.js', `
      class PositionStore {
        positions = [];

        get activeCount() {
          return this.positions.length;
        }

        set activeCount(value) {
          this.count = value;
        }

        saveToDisk() {
          return this.positions;
        }
      }

      function updatePosition(state, input) {
        state.positionId = input.positionId;
        state.positionId += '-closed';
        const id = state.positionId;
        const { positionId, exitSize: closedSize } = input;
        state.exitEvents.push({ positionId, closedSize });
        delete state.stalePosition;
        state.saveToDisk();
        state.getEvents().push(input);
        const first = state.getEvents()[0];
        return { id, closedSize, first };
      }

      const notCode = "state.positionId = fake";
      // state.positionId = fake comment
      module.exports = { PositionStore, updatePosition };
    `);
    writeFixture(tmpRoot, 'ogz-meta/ledger/stale.js', 'state.positionId = "ignored";');
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('finds property operations without matching strings, comments, or ignored ledgers', () => {
    const result = getPropertyReferences('positionId', {
      repoRoot: tmpRoot,
      scope: ['core/**/*.js'],
      limit: 20,
    });

    expect(result.source).toBe('serena_tree_sitter_property_refs');
    expect(result.errors).toEqual([]);
    expect(result.filesScanned).toBe(1);
    expect(result.references.map((ref) => ref.op).sort()).toEqual([
      'destructure',
      'read',
      'read',
      'write',
      'write:compound',
    ]);
    expect(result.references.every((ref) => ref.file === 'core/sample.js')).toBe(true);
    expect(result.references.some((ref) => ref.context.includes('fake'))).toBe(false);
  });

  test('filters property references by mutation operation', () => {
    const result = getPropertyReferences('exitEvents', {
      repoRoot: tmpRoot,
      scope: ['core/**/*.js'],
      op: 'mutate:*',
    });

    expect(result.references).toHaveLength(1);
    expect(result.references[0]).toMatchObject({
      file: 'core/sample.js',
      property: 'exitEvents',
      op: 'mutate:push',
      receiver: 'state',
    });
  });

  test('treats repo-wide wildcard scopes as repo-wide scans', () => {
    const result = getPropertyReferences('positionId', {
      repoRoot: tmpRoot,
      scope: ['**/*.js'],
    });
    const bareWildcardResult = getPropertyReferences('positionId', {
      repoRoot: tmpRoot,
      scope: ['*'],
    });

    expect(result.filesScanned).toBe(1);
    expect(result.references.map((ref) => ref.op).sort()).toEqual([
      'destructure',
      'read',
      'read',
      'write',
      'write:compound',
    ]);
    expect(bareWildcardResult.filesScanned).toBe(1);
    expect(bareWildcardResult.total).toBe(result.total);
  });

  test('finds method calls and call-result mutation/read sites', () => {
    const saveResult = getMethodCallers('saveToDisk', {
      repoRoot: tmpRoot,
      scope: ['core/**/*.js'],
    });
    const eventsResult = getMethodCallers('getEvents', {
      repoRoot: tmpRoot,
      scope: ['core/**/*.js'],
    });

    expect(saveResult.callers).toHaveLength(1);
    expect(saveResult.callers[0]).toMatchObject({
      method: 'saveToDisk',
      op: 'call',
      receiver: 'state',
    });
    expect(eventsResult.callers.map((call) => call.op).sort()).toEqual([
      'call+mutate-return:push',
      'call+read-return',
    ]);
  });

  test('extracts class fields, methods, getters, and setters', () => {
    const result = getClassFields('PositionStore', {
      repoRoot: tmpRoot,
      scope: ['core/**/*.js'],
    });

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].fields.map((item) => item.name)).toEqual(['positions']);
    expect(result.classes[0].methods.map((item) => item.name)).toEqual(['saveToDisk']);
    expect(result.classes[0].getters.map((item) => item.name)).toEqual(['activeCount']);
    expect(result.classes[0].setters.map((item) => item.name)).toEqual(['activeCount']);
  });
});
