/**
 * NewsSearchProvider - Provider-explicit web search for TRAI news pipelines.
 *
 * Replaces the hardcoded Tavily coupling in ogzprime-ssl-server.js with an
 * explicit, config-owned provider selection. NO implicit fallback chains:
 *
 *   NEWS_SEARCH_PROVIDER unset          -> search disabled (honest
 *                                          "unconfigured" state end to end)
 *   NEWS_SEARCH_PROVIDER=tavily         -> TAVILY_API_KEY REQUIRED, else throw
 *   NEWS_SEARCH_PROVIDER=brightdata     -> BRIGHTDATA_API_KEY and
 *                                          BRIGHTDATA_SERP_ZONE REQUIRED, else throw
 *   NEWS_SEARCH_PROVIDER=alpaca         -> ALPACA_API_KEY and
 *                                          ALPACA_API_SECRET REQUIRED, else throw
 *   NEWS_SEARCH_PROVIDER=<anything else> -> throw at startup
 *
 * Both providers return the SAME contract the TRAI endpoints already consume:
 *   { answer: string|null, results: [{ title, url, snippet }] }
 *
 * Clients THROW on transport/shape errors — they never return partial or
 * fabricated results. The server boundary decides how errors surface
 * (the existing "unavailable" status), not this module.
 *
 * Bright Data integration: SERP API "Direct API access".
 *   POST https://api.brightdata.com/request
 *   Authorization: Bearer <BRIGHTDATA_API_KEY>
 *   Body: { zone, url: <google search url with brd_json=1>, format: 'raw' }
 *   With brd_json=1 Bright Data returns parsed SERP JSON whose `organic`
 *   array carries { link, title, description }.
 *   Docs: docs.brightdata.com/scraping-automation/serp-api/send-your-first-request
 *
 * Alpaca integration: News API (Benzinga-sourced), included free with any
 * Alpaca account — paper keys work; no per-request billing.
 *   GET https://data.alpaca.markets/v1beta1/news?symbols=<SYM>&limit=<n>
 *   Headers: APCA-API-KEY-ID / APCA-API-SECRET-KEY
 *   Response: { news: [{ headline, url, summary, source, created_at }] }
 *   Unlike the SERP providers this is not free-text search: when the query's
 *   leading token looks like a ticker (all callers that have a symbol put it
 *   first), it is passed as `symbols=`; otherwise the query is dropped and
 *   market-wide news is returned. Honest trade-off for a zero-cost provider.
 *   Docs: docs.alpaca.markets/reference/news-3
 *
 * @module core/NewsSearchProvider
 */

'use strict';

const SUPPORTED_PROVIDERS = new Set(['tavily', 'brightdata', 'alpaca']);

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/**
 * Resolve news-search configuration from the environment.
 * Throws on any misconfiguration — never silently degrades.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {{provider: null}|{provider: 'tavily', apiKey: string}|{provider: 'brightdata', apiKey: string, serpZone: string}|{provider: 'alpaca', apiKey: string, apiSecret: string}}
 */
function resolveNewsSearchConfig(env) {
  const provider = cleanString(env.NEWS_SEARCH_PROVIDER).toLowerCase();

  if (!provider) {
    return { provider: null };
  }

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(
      `[NewsSearchProvider] NEWS_SEARCH_PROVIDER="${provider}" is not supported. ` +
      `Supported: ${Array.from(SUPPORTED_PROVIDERS).join(', ')}. Unset the variable to disable news search.`
    );
  }

  if (provider === 'tavily') {
    const apiKey = cleanString(env.TAVILY_API_KEY);
    if (!apiKey) {
      throw new Error(
        '[NewsSearchProvider] NEWS_SEARCH_PROVIDER=tavily requires TAVILY_API_KEY. ' +
        'Set the key or unset NEWS_SEARCH_PROVIDER.'
      );
    }
    return { provider: 'tavily', apiKey };
  }

  if (provider === 'alpaca') {
    const apiKey = cleanString(env.ALPACA_API_KEY);
    const apiSecret = cleanString(env.ALPACA_API_SECRET);
    const missing = [];
    if (!apiKey) missing.push('ALPACA_API_KEY');
    if (!apiSecret) missing.push('ALPACA_API_SECRET');
    if (missing.length > 0) {
      throw new Error(
        `[NewsSearchProvider] NEWS_SEARCH_PROVIDER=alpaca requires ${missing.join(' and ')}. ` +
        'Set them or unset NEWS_SEARCH_PROVIDER.'
      );
    }
    return { provider: 'alpaca', apiKey, apiSecret };
  }

  // provider === 'brightdata'
  const apiKey = cleanString(env.BRIGHTDATA_API_KEY);
  const serpZone = cleanString(env.BRIGHTDATA_SERP_ZONE);
  const missing = [];
  if (!apiKey) missing.push('BRIGHTDATA_API_KEY');
  if (!serpZone) missing.push('BRIGHTDATA_SERP_ZONE');
  if (missing.length > 0) {
    throw new Error(
      `[NewsSearchProvider] NEWS_SEARCH_PROVIDER=brightdata requires ${missing.join(' and ')}. ` +
      'Set them or unset NEWS_SEARCH_PROVIDER.'
    );
  }
  return { provider: 'brightdata', apiKey, serpZone };
}

function boundedMaxResults(maxResults) {
  const n = Number(maxResults);
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    throw new Error(`[NewsSearchProvider] maxResults must be an integer 1..20 (got ${maxResults})`);
  }
  return n;
}

function requiredQuery(query) {
  const cleaned = cleanString(query);
  if (!cleaned) {
    throw new Error('[NewsSearchProvider] query must be a non-empty string');
  }
  return cleaned;
}

async function tavilySearchImpl(config, query, maxResults) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.apiKey,
      query,
      search_depth: 'basic',
      max_results: maxResults,
      include_answer: true,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily API error: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data || !Array.isArray(data.results)) {
    throw new Error('Tavily API response missing results array');
  }

  return {
    answer: cleanString(data.answer) || null,
    results: data.results.map(r => ({
      title: cleanString(r && r.title),
      url: cleanString(r && r.url),
      snippet: cleanString(r && r.content).substring(0, 300),
    })).filter(r => r.title && r.url),
  };
}

async function brightDataSearchImpl(config, query, maxResults) {
  const serpUrl = 'https://www.google.com/search' +
    `?q=${encodeURIComponent(query)}` +
    `&num=${maxResults}` +
    '&brd_json=1';

  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      zone: config.serpZone,
      url: serpUrl,
      format: 'raw',
    }),
  });

  if (!response.ok) {
    throw new Error(`Bright Data SERP API error: HTTP ${response.status}`);
  }

  const raw = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Bright Data SERP response is not JSON (brd_json=1 expected): ${err.message}`);
  }

  if (!parsed || !Array.isArray(parsed.organic)) {
    throw new Error('Bright Data SERP response missing organic results array');
  }

  const results = parsed.organic.slice(0, maxResults).map(r => ({
    title: cleanString(r && r.title),
    url: cleanString(r && r.link),
    snippet: cleanString(r && r.description).substring(0, 300),
  })).filter(r => r.title && r.url);

  if (parsed.organic.length > 0 && results.length === 0) {
    throw new Error('Bright Data SERP organic entries missing title/link — response shape drifted');
  }

  return {
    // Google answer-box parsing varies by query type; we do not guess at a
    // shape we haven't contract-tested. Consumers already handle answer:null.
    answer: null,
    results,
  };
}

// Leading token of a symbol-driven query ("TSLA stock news today ...").
// Deliberately strict: 1-5 uppercase letters as the FIRST token only. Later
// uppercase words (FOMC, FDA, SEC) never reach this test.
const LEADING_TICKER_RE = /^[A-Z]{1,5}(?:\.[A-Z])?$/;

function leadingTickerSymbol(query) {
  const first = query.split(/\s+/, 1)[0];
  return LEADING_TICKER_RE.test(first) ? first : '';
}

async function alpacaSearchImpl(config, query, maxResults) {
  const symbol = leadingTickerSymbol(query);
  const url = 'https://data.alpaca.markets/v1beta1/news' +
    `?limit=${maxResults}` +
    (symbol ? `&symbols=${encodeURIComponent(symbol)}` : '');

  const response = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID': config.apiKey,
      'APCA-API-SECRET-KEY': config.apiSecret,
    },
  });

  if (!response.ok) {
    throw new Error(`Alpaca News API error: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data || !Array.isArray(data.news)) {
    throw new Error('Alpaca News API response missing news array');
  }

  return {
    // Alpaca returns articles, not an answer box. Consumers handle answer:null.
    answer: null,
    results: data.news.slice(0, maxResults).map(n => ({
      title: cleanString(n && n.headline),
      url: cleanString(n && n.url),
      snippet: cleanString(n && (n.summary || n.headline)).substring(0, 300),
    })).filter(r => r.title && r.url),
  };
}

const PROVIDER_IMPLS = {
  tavily: tavilySearchImpl,
  brightdata: brightDataSearchImpl,
  alpaca: alpacaSearchImpl,
};

/**
 * Create a search client for a resolved provider config.
 * @param {{provider: 'tavily'|'brightdata'|'alpaca'}} config from resolveNewsSearchConfig
 * @returns {{provider: string, search(query: string, maxResults: number): Promise<{answer: string|null, results: Array<{title: string, url: string, snippet: string}>}>}}
 */
function createNewsSearchClient(config) {
  if (!config || !SUPPORTED_PROVIDERS.has(config.provider)) {
    throw new Error(
      `[NewsSearchProvider] createNewsSearchClient requires a resolved provider config (got ${config && config.provider})`
    );
  }

  const impl = PROVIDER_IMPLS[config.provider];

  return {
    provider: config.provider,
    search: async (query, maxResults) => impl(config, requiredQuery(query), boundedMaxResults(maxResults)),
  };
}

module.exports = {
  resolveNewsSearchConfig,
  createNewsSearchClient,
};
