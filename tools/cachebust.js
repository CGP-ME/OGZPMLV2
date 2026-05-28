#!/usr/bin/env node
/**
 * cachebust.js - Deploy-time asset cache-busting
 *
 * Problem (#46):
 *   The browser aggressively caches /js/panels/*.js and /css/panels/*.css.
 *   The HTML is now served fresh per request (ogzprime-ssl-server.js change),
 *   but the assets the HTML references still get cached, so deploys never
 *   reliably reach the operator's browser without a hard-refresh.
 *
 * Fix:
 *   Walk every <link rel="stylesheet" href="/css/..."> and
 *   <script src="/js/..."> in the v2 dashboard HTML and append a
 *   ?v=<file-mtime-ms> query string. Browsers treat the new URL as
 *   a distinct resource and re-fetch it. Any path that already carries
 *   a ?v= is rewritten with the latest mtime.
 *
 *   The query is keyed off the source file's mtime so unchanged files
 *   keep their existing cached copy (small page weight, fewer network
 *   trips) and only changed files get re-pulled.
 *
 * Scope:
 *   - public/unified-dashboard-v2.html (primary)
 *   - public/unified-dashboard.html (legacy monolith - kept in sync)
 *
 *   External CDN URLs (https://*) are left alone.
 *   trai-widget.js at /trai-widget.js (root) is also stamped.
 *
 * Usage:
 *   node tools/cachebust.js
 *   # Or in a deploy hook:
 *   #   cd /opt/ogzprime/OGZPMLV2 && node tools/cachebust.js && sudo systemctl reload nginx
 *
 * Exit codes:
 *   0 - at least one HTML file processed successfully
 *   1 - nothing to do (no targets found), or hard error
 *
 * No external dependencies. Pure Node stdlib so it works on the VPS
 * with whatever Node version is installed.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

// HTML files to stamp. Add new shells here as they ship.
const HTML_TARGETS = [
    path.join(PUBLIC, 'unified-dashboard-v2.html'),
    path.join(PUBLIC, 'unified-dashboard.html'),
];

// Match every attribute that points at a same-origin asset. Two patterns:
//   href="/css/..."
//   src="/js/..."  or  src="/trai-widget.js"  etc.
// We deliberately skip https:// + http:// + // protocol-relative URLs
// and skip data: URIs. Existing ?v=... is preserved by the rewrite
// step below.
const HREF_RE = /\b(href|src)\s*=\s*"(\/[^"#?]+\.(?:js|css))(\?v=[^"]*)?"/g;

// Local file lookup with a tiny LRU so the same asset referenced from
// both v1 and v2 HTML only hits the disk once.
const mtimeCache = new Map();
function mtimeFor(absPath) {
    if (mtimeCache.has(absPath)) return mtimeCache.get(absPath);
    let stamp = null;
    try {
        stamp = String(Math.floor(fs.statSync(absPath).mtimeMs));
    } catch (_e) {
        // Missing file - leave the tag alone rather than 404ing a fake stamp.
    }
    mtimeCache.set(absPath, stamp);
    return stamp;
}

function rewriteHtml(htmlPath) {
    let html;
    try {
        html = fs.readFileSync(htmlPath, 'utf8');
    } catch (_e) {
        return { ok: false, path: htmlPath, reason: 'unreadable' };
    }

    let touched = 0;
    let skipped = 0;
    let missing = 0;

    const out = html.replace(HREF_RE, (full, attr, url /* , existingQs */) => {
        // Resolve URL to an absolute path under public/
        const cleanUrl = url.replace(/^\//, ''); // strip leading slash
        const absPath = path.join(PUBLIC, cleanUrl);
        const v = mtimeFor(absPath);

        if (!v) {
            missing++;
            return full; // Leave it; don't fake a version for a missing file.
        }

        touched++;
        return `${attr}="${url}?v=${v}"`;
    });

    if (out === html) {
        skipped++;
        return { ok: true, path: htmlPath, touched: 0, missing };
    }

    fs.writeFileSync(htmlPath, out, 'utf8');
    return { ok: true, path: htmlPath, touched, missing };
}

function main() {
    let anySuccess = false;
    let totalTouched = 0;
    let totalMissing = 0;

    for (const target of HTML_TARGETS) {
        if (!fs.existsSync(target)) {
            console.log(`[skip] ${path.relative(ROOT, target)} (not present)`);
            continue;
        }
        const r = rewriteHtml(target);
        if (!r.ok) {
            console.error(`[fail] ${path.relative(ROOT, target)}: ${r.reason}`);
            continue;
        }
        anySuccess = true;
        totalTouched += r.touched || 0;
        totalMissing += r.missing || 0;
        console.log(`[ok]   ${path.relative(ROOT, target)}: ${r.touched} stamped, ${r.missing} missing`);
    }

    if (!anySuccess) {
        console.error('cachebust: nothing processed.');
        process.exit(1);
    }

    console.log(`\ncachebust: ${totalTouched} asset references stamped across ${HTML_TARGETS.length} target(s).`);
    if (totalMissing > 0) {
        console.log(`cachebust: ${totalMissing} reference(s) point at files not on disk - left untouched.`);
    }
    process.exit(0);
}

main();
