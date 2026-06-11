'use strict';

const crypto = require('crypto');
const { inspectLine, isAllowedTokenAssignment, isCredentialName } = require('../scripts/scan-secrets');

function reasonsFor(filePath, line) {
  const burned = new Set([
    crypto.createHash('sha256').update('burned-template-value', 'utf8').digest('hex')
  ]);
  return inspectLine(filePath, 1, line, burned).map((finding) => finding.reason);
}

describe('secret scanner template coverage', () => {
  test('allows explicit placeholder values', () => {
    expect(isAllowedTokenAssignment('<required-kraken-api-secret>')).toBe(true);
    expect(isAllowedTokenAssignment('[REDACTED:api-key]')).toBe(true);
    expect(isAllowedTokenAssignment('your-api-key-here')).toBe(true);
    expect(isAllowedTokenAssignment('ogzp_priv_key_placeholder')).toBe(true);
  });

  test('classifies credential names by token boundaries', () => {
    expect(isCredentialName('my_api_key')).toBe(true);
    expect(isCredentialName('OPENAI_API_KEY')).toBe(true);
    expect(isCredentialName('sessionToken')).toBe(true);
    expect(isCredentialName('scopeKey')).toBe(false);
    expect(isCredentialName('max_tokens')).toBe(false);
    expect(isCredentialName('pad_token_id')).toBe(false);
    expect(isCredentialName('wsTokenMetaLength')).toBe(false);
    expect(isCredentialName('ghostSeries')).toBe(false);
  });

  test('rejects non-placeholder credential assignments in public env templates', () => {
    const findings = reasonsFor('config/.env.example', 'KRAKEN_API_SECRET=plain-text-secret');

    expect(findings).toContain('template credential KRAKEN_API_SECRET contains a non-placeholder value');
  });

  test('rejects numeric credential values in public env templates', () => {
    const findings = reasonsFor('config/.env.example', 'API_TOKEN=12345678901234567890');

    expect(findings).toContain('template credential API_TOKEN contains a non-placeholder value');
  });

  test('rejects lowercase credential names in public env templates', () => {
    const findings = reasonsFor('config/.env.example', 'api_key=plain-text-secret');

    expect(findings).toContain('template credential api_key contains a non-placeholder value');
  });

  test('rejects non-template credential assignments with real-looking values', () => {
    const findings = reasonsFor('docs/example.md', 'my_api_key = "plain-text-secret"');

    expect(findings).toContain('credential assignment my_api_key contains a non-placeholder value');
    expect(reasonsFor('docs/example.md', 'API-KEY=plain-text-secret'))
      .toContain('credential assignment API-KEY contains a non-placeholder value');
    expect(reasonsFor('docs/example.md', 'export API_KEY=plain-text-secret'))
      .toContain('credential assignment API_KEY contains a non-placeholder value');
    expect(reasonsFor('docs/example.md', 'const apiKey = "plain-text-secret"'))
      .toContain('credential assignment apiKey contains a non-placeholder value');
  });

  test('allows non-template credential assignments with explicit placeholders', () => {
    expect(reasonsFor('docs/example.md', 'my_api_key=<required-api-key>')).toEqual([]);
    expect(reasonsFor('public/example.js', "sessionToken = '';")).toEqual([]);
    expect(reasonsFor('docs/example.md', 'api_key="<required-inception-api-key>",')).toEqual([]);
  });

  test('allows non-template credential assignments sourced dynamically', () => {
    expect(reasonsFor('scripts/example.sh', 'AUTH_TOKEN=$(openssl rand -hex 16)')).toEqual([]);
    expect(reasonsFor('server/example.js', 'sessionToken = this.getSessionToken()')).toEqual([]);
    expect(reasonsFor('server/example.js', 'const apiKey = brokerConfig ? brokerConfig.alpacaApiKey : values.ALPACA_API_KEY;')).toEqual([]);
    expect(reasonsFor('server/example.js', 'const wsTokenMetaPattern = /<meta\\s+name=["\\\']ws-token["\\\']/;')).toEqual([]);
    expect(reasonsFor('scripts/example.js', 'const BURNED_TOKEN_HASH_FILES = [')).toEqual([]);
    expect(reasonsFor('scripts/example.js', 'const lastToken = symbolTokens[symbolTokens.length - 1];')).toEqual([]);
    expect(reasonsFor('trai_brain/example.py', "secret_value = ''.join(str(m) for m in match if m)")).toEqual([]);
  });

  test('allows URL credential query parameters when value is dynamic or placeholder', () => {
    expect(reasonsFor('scripts/example.js', 'url = `https://example.invalid/api?apiKey=${API_KEY}`')).toEqual([]);
    expect(reasonsFor('docs/example.md', 'https://example.invalid/api?apiKey={YOUR_KEY}')).toEqual([]);
  });

  test('rejects JSON credential properties with real-looking values', () => {
    const line = ['"api_', 'key": "plain-text-secret"'].join('');

    expect(reasonsFor('docs/example.json', line))
      .toContain('JSON credential api_key contains a non-placeholder value');
  });

  test('allows JSON credential properties with placeholders', () => {
    expect(reasonsFor('docs/example.json', '"api_key": "<required-api-key>"')).toEqual([]);
    expect(reasonsFor('docs/example.json', '"APCA-API-KEY-ID": "placeholder-api-key"')).toEqual([]);
  });

  test('allows JSON env-reference properties', () => {
    expect(reasonsFor('config/example.json', '"apiKeyEnv": "INCEPTION_API_KEY"')).toEqual([]);
  });

  test('rejects object credential properties with real-looking values', () => {
    const line = ['config = { api', 'Key: "plain-text-secret" };'].join('');

    expect(reasonsFor('test/example.js', line))
      .toContain('object credential apiKey contains a non-placeholder value');
  });

  test('allows object credential properties with placeholders', () => {
    expect(reasonsFor('test/example.js', 'config = { apiKey: "<required-api-key>" };')).toEqual([]);
  });

  test('allows object credential properties with fixture values in test-like files', () => {
    expect(reasonsFor('test/example.test.js', 'config = { apiKey: "test-key", apiSecret: "fallback-must-not-be-read" };')).toEqual([]);
    expect(reasonsFor('tools/backtest-worker-env.js', "env = { ALPACA_API_KEY: 'backtest-alpaca-key' };")).toEqual([]);
    expect(reasonsFor('test/example.test.js', 'config = { apiKey: "configured-key", apiSecret: "do-not-write" };')).toEqual([]);
    expect(reasonsFor('test/example.test.js', 'config = { WEBSOCKET_AUTH_TOKEN: "secret-runtime-token" };')).toEqual([]);
    expect(reasonsFor('test/example.test.js', 'config = { apiKey: "key", apiSecret: "secret" };')).toEqual([]);
    expect(reasonsFor('test/example.test.js', 'config = { ALPACA_API_KEY: "parent-live-key", LLM_API_KEY: "ambient-key" };')).toEqual([]);
  });

  test('allows object credential env-reference properties', () => {
    expect(reasonsFor('test/example.test.js', 'config = { apiKeyEnv: "MERCURY_TEST_LLM_KEY" };')).toEqual([]);
  });

  test('rejects private keys, JWTs, vendor prefixes, Bearer tokens, and URL embedded credentials', () => {
    const privateKey = ['-----BEGIN EC ', 'PRIVATE KEY-----'].join('');
    const jwt = ['eyJ', 'aaaaaaaa.bbbbbbbb.cccccccc'].join('');
    const vendor = ['sk-', 'abcdefghijklmnopqrstuvwxyz'].join('');
    const stripeTest = ['sk_test_', 'abcdefghijkl'].join('');
    const splitVendor = ['API_KEY = "sk_', 'live_"', ' + ', '"abcdefghijkl"'].join('');
    const templateSplitVendor = ['const API_TOKEN = `sk_', 'live_${PART}`'].join('');
    const bearer = ['Authorization: Bearer ', 'abcdefghijkl'].join('');
    const url = ['DATABASE_URL=postgresql://user', ':pass@example.invalid/db'].join('');
    const queryUrl = ['API_URL=https://example.invalid/api?access_', 'token=abcdefghijkl'].join('');

    expect(reasonsFor('docs/example.md', privateKey)).toContain('private key block committed');
    expect(reasonsFor('docs/example.md', jwt)).toContain('JWT-shaped literal committed');
    expect(reasonsFor('docs/example.md', vendor)).toContain('vendor-prefixed token literal committed');
    expect(reasonsFor('docs/example.md', stripeTest)).toContain('vendor-prefixed token literal committed');
    expect(reasonsFor('docs/example.md', splitVendor)).toContain('split vendor-prefixed token literal committed');
    expect(reasonsFor('docs/example.md', templateSplitVendor)).toContain('split vendor-prefixed token literal committed');
    expect(reasonsFor('docs/example.md', bearer)).toContain('Bearer token literal committed');
    expect(reasonsFor('config/.env.example', url)).toContain('URL contains embedded credentials');
    expect(reasonsFor('docs/example.md', queryUrl)).toContain('URL contains credential query parameter');
  });

  test('rejects known burned assignment values by hash', () => {
    const findings = reasonsFor('config/.env.example', 'MOVER_API_KEY=burned-template-value');

    expect(findings).toContain('known-burned secret literal re-committed');
  });

  test('rejects known burned token literals in markdown evidence', () => {
    const burnedToken = ['39cc', 'deadbeefaa', '0123456789abcdef0123456789abcdef0123456789abcdef'].join('');
    const findings = reasonsFor('CHANGELOG.md', `Removed leaked token ${burnedToken} from public files`);

    expect(findings).toContain('known-burned dashboard token literal');
  });

  test('rejects known burned token literals embedded in longer strings', () => {
    const burnedToken = ['x39cc', 'deadbeefaa', '0123456789abcdef0123456789abcdef0123456789abcdefY'].join('');
    const findings = reasonsFor('docs/example.md', `const authKey = "${burnedToken}";`);

    expect(findings).toContain('known-burned dashboard token literal');
  });

  test('allows redacted burned-token prefix evidence', () => {
    expect(reasonsFor('CHANGELOG.md', 'Removed leaked token 39cc...[ROTATED]... from public files')).toEqual([]);
    expect(reasonsFor('CHANGELOG.md', 'Removed leaked token 39ccdeadbeefaa... from public files')).toEqual([]);
  });

  test('rejects copied burned hash fingerprints outside the security denylist', () => {
    const burnedHash = crypto.createHash('sha256').update('burned-template-value', 'utf8').digest('hex');

    expect(reasonsFor('docs/example.md', `API_TOKEN=${burnedHash}`))
      .toContain('known-burned secret hash copied outside security denylist');
    expect(reasonsFor('ogz-meta/security/burned-env-template-sha256.txt', burnedHash)).toEqual([]);
  });
});
