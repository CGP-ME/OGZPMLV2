# Pipeline Multi-File Write Smoke Spec

Purpose: prove `--write` can parse and verify one fix section that spans more
than one file. Replacements are intentionally identical to targets because this
spec is for advisory dry-run validation only.

### Fix 999: Smoke multi-file write proposal

**Status:** NOT FIXED

#### File 1: `ogz-meta/spec-parser.js`

**Line:** ~70

**str_replace target:**
```js
function parseFix(specPath, fixId) {
```

**str_replace replacement:**
```js
function parseFix(specPath, fixId) {
```

#### File 2: `ogz-meta/slash-router.js`

**Line:** ~2181

**str_replace target:**
```js
async function architectVerify(manifest, params) {
```

**str_replace replacement:**
```js
async function architectVerify(manifest, params) {
```
