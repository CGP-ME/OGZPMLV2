const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mercuryConfig = require('./mercury-bridge/config');

function buildSkipDirGlobArgs() {
    const args = [];
    for (const dir of mercuryConfig.SKIP_DIRS) {
        args.push('--glob', `!**/${dir}/**`);
    }
    return args;
}

class ReadOnlyToolbox {
    constructor(config = {}) {
        this.repoRoot = config.repoRoot || process.cwd();
        this.logRoot = config.logRoot || path.join(process.cwd(), 'logs');
        this.botStatusProvider = typeof config.botStatusProvider === 'function'
            ? config.botStatusProvider
            : () => ({ connected: false, notes: 'Bot status provider not configured.' });
    }

    ensureWithinRepo(targetPath) {
        const resolved = path.resolve(targetPath);
        if (!resolved.startsWith(path.resolve(this.repoRoot))) {
            throw new Error('Path outside repository boundary');
        }
        return resolved;
    }

    ensureNotIgnored(targetPath, toolName) {
        const relPath = path.relative(this.repoRoot, targetPath).replace(/\\/g, '/');
        if (mercuryConfig.isPathIgnoredByMercury(relPath)) {
            throw new Error(`${toolName} blocked by mercury.ignore: ${relPath}`);
        }
    }

    searchRepo(query, options = {}) {
        if (!query || typeof query !== 'string') {
            return { error: 'Query string required' };
        }

        const limit = options.limit && Number.isInteger(options.limit) ? options.limit : 20;
        const args = [
            '--max-count', String(limit),
            '--line-number',
            '--no-heading',
            '--color', 'never',
            '--fixed-strings',
            ...buildSkipDirGlobArgs(),
            '--',
            query,
            this.repoRoot,
        ];
        const result = spawnSync('rg', args, { encoding: 'utf8' });

        if (result.error) {
            return { error: result.error.message };
        }

        if (result.status !== 0 && result.stderr) {
            return { error: result.stderr.trim() };
        }

        const filtered = [];
        let filteredIgnored = 0;
        for (const line of result.stdout.trim().split('\n').filter(Boolean)) {
            const firstColon = line.indexOf(':');
            if (firstColon === -1) continue;
            const filePath = line.slice(0, firstColon);
            try {
                this.ensureNotIgnored(filePath, 'repo_search');
            } catch (error) {
                filteredIgnored += 1;
                continue;
            }
            filtered.push(line);
        }

        return { results: filtered, filteredIgnored };
    }

    openFile(relativePath, options = {}) {
        try {
            const target = this.ensureWithinRepo(path.join(this.repoRoot, relativePath));
            this.ensureNotIgnored(target, 'file_open');
            const maxBytes = options.maxBytes || 4000;
            const content = fs.readFileSync(target, 'utf8').slice(0, maxBytes);
            return { path: path.relative(this.repoRoot, target), content };
        } catch (error) {
            return { error: error.message };
        }
    }

    tailLog(relativePath, lines = 40) {
        try {
            const target = this.ensureWithinRepo(path.join(this.logRoot, relativePath));
            const content = fs.readFileSync(target, 'utf8').trim().split('\n');
            return { path: target, lines: content.slice(-lines) };
        } catch (error) {
            return { error: error.message };
        }
    }

    getBotStatus() {
        try {
            return this.botStatusProvider();
        } catch (error) {
            return { error: error.message };
        }
    }

    listTools() {
        return [
            'repo_search(query: string, limit=20) -> match lines',
            'file_open(path: string, maxBytes=4000) -> file excerpt',
            'log_tail(path: string, lines=40) -> recent log lines',
            'bot_status() -> runtime health summary'
        ];
    }
}

module.exports = ReadOnlyToolbox;
