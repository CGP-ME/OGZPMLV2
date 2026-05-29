#!/usr/bin/env node
/**
 * lint-fallbacks.js - Enforce the no-fallback rule mechanically.
 *
 * Operator directive: "Anything that is not discretely right shouldn't go
 * in this." Prompt-level preferences are advisory - they bias output but
 * don't block anything. Code-level enforcement is what holds.
 *
 * This script walks the repo and flags patterns where a producer's missing
 * data gets silently defaulted into something pretending to be real:
 *
 *   1. `|| 'SOME_STRING_LITERAL'`  on data-derived RHS in handler files
 *      Common shape: `const sym = data.symbol || 'BTC-USD';`
 *      => fail closed instead. Reject the frame.
 *
 *   2. `|| <number_literal>`  on numeric RHS that looks like price/balance
 *      Common shape: `const balance = state.balance || 10000;`
 *      => display "AWAITING" instead. Don't invent a seed.
 *
 *   3. `?? 'literal'` / `?? <number>` - same class as #1 / #2 with nullish.
 *
 *   4. `if (!data.symbol) data.symbol = '<literal>';` - assignment-style
 *      symbol injection. Loud, easy to grep, almost always wrong.
 *
 *   5. `function payload(x) { return x || {}; }` - defaulting an entire
 *      object to {} so downstream `.symbol`/`.price` reads don't throw.
 *      Common in receiver code that masks producer-contract gaps.
 *
 *   6. `try { ... } catch (_) {}` - silent error swallow in handler files.
 *      Orchestrators / panels MUST record errors, not eat them.
 *
 * What this is NOT:
 *   - Not a syntax linter. Use eslint for syntax. This catches a specific
 *     CLASS of code that produces dishonest UI behavior.
 *   - Not a perfect AST analyzer. Pattern-matched via regex with
 *     specific allow-list rules for known-safe usage (constants files,
 *     test files, etc.).
 *   - Not auto-fix. Surfaces a punch list; humans/Mercury decide.
 *
 * Usage:
 *   node tools/lint-fallbacks.js                 # full repo scan
 *   node tools/lint-fallbacks.js --json          # machine-readable output
 *   node tools/lint-fallbacks.js public/js       # scan a subdir
 *   node tools/lint-fallbacks.js --fail-on=ERROR # exit 1 if any ERROR-level finding
 *
 * Exit codes:
 *   0 - no findings at the requested fail-on threshold
 *   1 - findings exist at or above threshold
 *   2 - fatal (bad args, missing files, etc.)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Files this linter intentionally does NOT scan. Constants files, test
// fixtures, third-party vendor libs - places where literal defaults are
// legitimately data rather than fallback logic.
const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'coverage', 'vendor',
    'ogz-meta',  // historical snapshots
]);

const SKIP_FILE_SUFFIXES = [
    '.test.js', '.spec.js', '.min.js', '.map',
];

const SCANNED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

// File patterns where we DO scan but downgrade findings to INFO (because
// the file is explicitly user-config or constants).
const INFO_ONLY_FILE_PATTERNS = [
    /\/config\//i,
    /\/fixtures?\//i,
    /\/specs?\//i,
    /\/tests?\//i,
    /\/__fixtures__\//i,
    /constants?\.js$/i,
    /\.config\.js$/i,
];

// Severity levels. Higher number = more serious.
const SEVERITY = { INFO: 1, WARN: 2, ERROR: 3 };

// Rules

const rules = [
    {
        id: 'string-literal-fallback',
        // e.g. `data.symbol || 'BTC-USD'`, `(x || 'TSLA')`, `?? 'DEFAULT'`
        pattern: /\b(\w+)\s*(?:\|\||\?\?)\s*['"`]([^'"`\n]+)['"`]/g,
        severity: 'ERROR',
        message: (m) =>
            `Falls back to string literal '${m[2]}' when '${m[1]}' is missing. ` +
            `Drop the frame instead; frontend default lies about backend truth.`,
        // Skip matches where the LHS looks like a constant-name reference
        // (all-caps identifier on left).
        skipIf: (m) => /^[A-Z][A-Z0-9_]+$/.test(m[1]),
    },
    {
        id: 'numeric-default-balance-price',
        // e.g. `state.balance || 10000`, `data.price ?? 0`
        pattern: /\b(balance|equity|price|drawdown|pnl|pn1|amount|cost|total|profit|loss)\s*(?:\|\||\?\?)\s*(-?(?:(?:\d[\d_]*)(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?n?)/gi,
        severity: 'ERROR',
        message: (m) =>
            `Falls back to numeric ${m[2]} for '${m[1]}'. Operator rule: ` +
            `do not invent money. Render AWAITING instead.`,
    },
    {
        id: 'assign-injected-symbol',
        // e.g. `if (!data.symbol) data.symbol = 'BTC-USD'`
        pattern: /if\s*\(\s*!\s*(\w+)\.(symbol|asset)\s*\)\s*\{?\s*(\w+)\.(symbol|asset)\s*=\s*['"`]([^'"`\n]+)['"`]/g,
        severity: 'ERROR',
        message: (m) =>
            `Assigns symbol '${m[5]}' when missing on payload '${m[1]}.${m[2]}'. ` +
            `That is the producer-contract violation the operator banned.`,
    },
    {
        id: 'object-default-mask',
        // e.g. `const data = payload || {};` in a function body
        pattern: /\b(?:const|let|var)\s+(\w+)\s*=\s*(\w+)\s*\|\|\s*\{\s*\}/g,
        severity: 'ERROR',
        message: (m) =>
            `Defaults '${m[2]}' to empty object; masks producer-contract gap. ` +
            `If the payload is null, the downstream reads should fail loudly.`,
    },
    {
        id: 'silent-error-swallow',
        // e.g. `catch (_) {}` , `catch (e) {}` empty body
        pattern: /catch\s*\(\s*_?\w*\s*\)\s*\{\s*\}/g,
        severity: 'ERROR',
        message: () =>
            `Silent catch swallows errors. Record into module health view ` +
            `or rethrow; orchestrators that hide errors lie about state.`,
    },
    {
        id: 'try-catch-swallow-comment',
        // e.g. `catch (e) { /* swallow */ }`
        pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\/\*[^*]*(swallow|ignore|noop)[^*]*\*\/\s*\}/gi,
        severity: 'ERROR',
        message: () =>
            `Explicit swallow/ignore comment in catch block. Replace with ` +
            `error recording.`,
    },
];

// Walker

function isSkippedDir(name) { return SKIP_DIRS.has(name); }
function isSkippedFile(name) {
    return SKIP_FILE_SUFFIXES.some(suf => name.endsWith(suf));
}
function isScannableFile(name) {
    return SCANNED_EXTENSIONS.has(path.extname(name));
}
function isInfoOnly(absPath) {
    return INFO_ONLY_FILE_PATTERNS.some(re => re.test(absPath));
}

function stripComments(text) {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, (match) => ' '.repeat(match.length));
}

function walk(dir, files, errors) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (err) {
        errors.push({ path: path.relative(ROOT, dir), error: err.message });
        return;
    }
    for (const ent of entries) {
        if (ent.isDirectory()) {
            if (isSkippedDir(ent.name)) continue;
            walk(path.join(dir, ent.name), files, errors);
        } else if (ent.isFile()) {
            if (isSkippedFile(ent.name)) continue;
            if (!isScannableFile(ent.name)) continue;
            files.push(path.join(dir, ent.name));
        }
    }
}

function lineOf(text, idx) {
    return text.slice(0, idx).split('\n').length;
}

function scanFile(absPath, errors) {
    let text;
    try { text = fs.readFileSync(absPath, 'utf8'); }
    catch (err) {
        errors.push({ path: path.relative(ROOT, absPath), error: err.message });
        return [];
    }
    const scanText = stripComments(text);
    const findings = [];
    const infoOnly = isInfoOnly(absPath);
    for (const rule of rules) {
        rule.pattern.lastIndex = 0;
        let m;
        while ((m = rule.pattern.exec(scanText)) !== null) {
            if (rule.skipIf && rule.skipIf(m)) continue;
            const sev = infoOnly ? 'INFO' : rule.severity;
            findings.push({
                file: path.relative(ROOT, absPath),
                line: lineOf(text, m.index),
                rule: rule.id,
                severity: sev,
                message: rule.message(m),
                snippet: text.slice(
                    Math.max(0, m.index - 30),
                    Math.min(text.length, m.index + m[0].length + 30)
                ).replace(/\s+/g, ' ').trim(),
            });
        }
    }
    return findings;
}

function collectRoot(rootPath, files, errors) {
    let stat;
    try { stat = fs.statSync(rootPath); }
    catch (err) {
        errors.push({ path: path.relative(ROOT, rootPath), error: err.message });
        return;
    }

    if (stat.isDirectory()) {
        walk(rootPath, files, errors);
        return;
    }
    if (stat.isFile()) {
        if (!isSkippedFile(path.basename(rootPath)) && isScannableFile(rootPath)) {
            files.push(rootPath);
        }
        return;
    }

    errors.push({
        path: path.relative(ROOT, rootPath),
        error: 'path is neither file nor directory',
    });
}

// Main

function parseArgs(argv) {
    const args = { json: false, failOn: 'ERROR', roots: [] };
    for (const a of argv.slice(2)) {
        if (a === '--json') args.json = true;
        else if (a.startsWith('--fail-on=')) args.failOn = a.split('=')[1].toUpperCase();
        else if (a.startsWith('--')) throw new Error('Unknown flag: ' + a);
        else args.roots.push(path.resolve(ROOT, a));
    }
    if (!args.roots.length) args.roots = [path.join(ROOT, 'public'), path.join(ROOT, 'tools')];
    return args;
}

function main() {
    const args = parseArgs(process.argv);
    if (!SEVERITY[args.failOn]) {
        throw new Error('Invalid --fail-on value: ' + args.failOn);
    }
    const files = [];
    const errors = [];
    for (const r of args.roots) collectRoot(r, files, errors);
    let all = [];
    for (const f of files) all = all.concat(scanFile(f, errors));

    if (args.json) {
        process.stdout.write(JSON.stringify({ findings: all, errors }, null, 2) + '\n');
    } else {
        const groups = {};
        for (const f of all) (groups[f.severity] = groups[f.severity] || []).push(f);
        if (errors.length) {
            console.log('\n=== SCAN ERRORS (' + errors.length + ') ===');
            for (const err of errors) {
                console.log(`  ${err.path}: ${err.error}`);
            }
        }
        for (const sev of ['ERROR', 'WARN', 'INFO']) {
            const list = groups[sev] || [];
            if (!list.length) continue;
            console.log('\n=== ' + sev + ' (' + list.length + ') ===');
            for (const f of list) {
                console.log(`  ${f.file}:${f.line}  [${f.rule}]`);
                console.log(`    ${f.message}`);
            }
        }
        const errCount = (groups.ERROR || []).length;
        const warnCount = (groups.WARN || []).length;
        const infoCount = (groups.INFO || []).length;
        console.log(`\nTotal: ${errCount} ERROR, ${warnCount} WARN, ${infoCount} INFO across ${files.length} files.`);
    }

    if (errors.length) process.exit(2);

    const threshold = SEVERITY[args.failOn] || SEVERITY.ERROR;
    const fail = all.some(f => SEVERITY[f.severity] >= threshold);
    process.exit(fail ? 1 : 0);
}

try { main(); }
catch (err) { console.error('lint-fallbacks: fatal:', err && err.message || err); process.exit(2); }
