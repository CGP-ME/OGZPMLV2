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
 *   NEWS_SEARCH_PROVIDER=alpaca-edgar   -> ALPACA_API_KEY, ALPACA_API_SECRET
 *                                          and EDGAR_USER_AGENT REQUIRED, else throw
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
 * Alpaca+EDGAR composite ('alpaca-edgar'): the Alpaca wire above, thickened
 * with SEC EDGAR filings — the authoritative primary source for material
 * events (8-K), insider transactions (Form 4/144) and 5%+ stakes (13D/G).
 * Free, no API key; the SEC fair-access policy requires a User-Agent that
 * identifies the app + a contact address (EDGAR_USER_AGENT).
 *   Ticker -> CIK via www.sec.gov/files/company_tickers.json (cached 24h);
 *   filings via data.sec.gov/submissions/CIK##########.json (cached 15 min).
 *   Symbol queries return newest filings (90-day lookback) merged ahead-of
 *   news up to half the result slots; free-text queries are news-only.
 *   Symbols with no CIK mapping (crypto, most ETFs) degrade to news-only —
 *   an absent mapping is a fact, not a transport error. Transport/shape
 *   errors on either leg THROW per this module's no-partial-results rule.
 *   Docs: www.sec.gov/search-filings/edgar-application-programming-interfaces
 *
 * @module core/NewsSearchProvider
 */

'use strict';

const SUPPORTED_PROVIDERS = new Set(['tavily', 'brightdata', 'alpaca', 'alpaca-edgar']);

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/**
 * Resolve news-search configuration from the environment.
 * Throws on any misconfiguration — never silently degrades.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {{provider: null}|{provider: 'tavily', apiKey: string}|{provider: 'brightdata', apiKey: string, serpZone: string}|{provider: 'alpaca', apiKey: string, apiSecret: string}|{provider: 'alpaca-edgar', apiKey: string, apiSecret: string, edgarUserAgent: string}}
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

  if (provider === 'alpaca' || provider === 'alpaca-edgar') {
    const apiKey = cleanString(env.ALPACA_API_KEY);
    const apiSecret = cleanString(env.ALPACA_API_SECRET);
    const missing = [];
    if (!apiKey) missing.push('ALPACA_API_KEY');
    if (!apiSecret) missing.push('ALPACA_API_SECRET');
    if (provider === 'alpaca-edgar' && !cleanString(env.EDGAR_USER_AGENT)) {
      missing.push('EDGAR_USER_AGENT (e.g. "OGZPrime admin@ogzprime.com" — SEC fair-access policy)');
    }
    if (missing.length > 0) {
      throw new Error(
        `[NewsSearchProvider] NEWS_SEARCH_PROVIDER=${provider} requires ${missing.join(' and ')}. ` +
        'Set them or unset NEWS_SEARCH_PROVIDER.'
      );
    }
    if (provider === 'alpaca-edgar') {
      return { provider: 'alpaca-edgar', apiKey, apiSecret, edgarUserAgent: cleanString(env.EDGAR_USER_AGENT) };
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

// ── SEC EDGAR leg (alpaca-edgar composite) ─────────────────────────────
// Module-level caches: the ticker->CIK map is ~1MB and changes rarely
// (24h TTL); per-CIK submissions change intraday (15 min TTL). Both are
// plain in-process memoization — a restart clears them.
const EDGAR_TICKER_MAP_TTL_MS = 24 * 60 * 60 * 1000;
const EDGAR_SUBMISSIONS_TTL_MS = 15 * 60 * 1000;
const EDGAR_LOOKBACK_DAYS = 90;
let _edgarTickerMap = null; // { at, bySymbol: Map<ticker, {cik, title}> }
const _edgarSubmissionsCache = new Map(); // cik -> { at, data }

// Human labels for the filing forms that matter to the TRAI consumers.
// Unknown forms fall through with the raw form code — honest, not hidden.
const EDGAR_FORM_LABELS = {
  '8-K': 'Material event report (8-K)',
  '4': 'Insider transaction (Form 4)',
  '144': 'Notice of proposed insider sale (Form 144)',
  '10-Q': 'Quarterly report (10-Q)',
  '10-K': 'Annual report (10-K)',
  'SC 13D': 'Activist 5%+ stake (13D)',
  'SC 13D/A': 'Activist 5%+ stake amendment (13D/A)',
  'SC 13G': 'Passive 5%+ stake (13G)',
  'SC 13G/A': 'Passive 5%+ stake amendment (13G/A)',
  'SCHEDULE 13D': 'Activist 5%+ stake (13D)',
  'SCHEDULE 13D/A': 'Activist 5%+ stake amendment (13D/A)',
  'SCHEDULE 13G': 'Passive 5%+ stake (13G)',
  'SCHEDULE 13G/A': 'Passive 5%+ stake amendment (13G/A)',
};

// 8-K item codes worth naming for Mercury's extraction prompt.
const EDGAR_8K_ITEM_LABELS = {
  '1.01': 'material agreement',
  '2.01': 'acquisition/disposition',
  '2.02': 'results of operations',
  '5.02': 'officer/director change',
  '7.01': 'Reg FD disclosure',
  '8.01': 'other material event',
};

async function _edgarFetchJson(url, userAgent) {
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent, 'Accept-Encoding': 'gzip, deflate' },
  });
  if (!response.ok) {
    throw new Error(`SEC EDGAR error: HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function _edgarCikForSymbol(symbol, userAgent) {
  if (!_edgarTickerMap || Date.now() - _edgarTickerMap.at > EDGAR_TICKER_MAP_TTL_MS) {
    const raw = await _edgarFetchJson('https://www.sec.gov/files/company_tickers.json', userAgent);
    if (!raw || typeof raw !== 'object') {
      throw new Error('SEC EDGAR company_tickers.json response has unexpected shape');
    }
    const bySymbol = new Map();
    for (const entry of Object.values(raw)) {
      if (entry && entry.ticker) {
        bySymbol.set(String(entry.ticker).toUpperCase(), {
          cik: String(entry.cik_str).padStart(10, '0'),
          title: cleanString(entry.title),
        });
      }
    }
    if (bySymbol.size === 0) {
      throw new Error('SEC EDGAR company_tickers.json produced an empty ticker map');
    }
    _edgarTickerMap = { at: Date.now(), bySymbol };
  }
  return _edgarTickerMap.bySymbol.get(symbol) || null;
}

function _edgarDescribeFiling(form, items, filingDate, companyTitle) {
  const formLabel = EDGAR_FORM_LABELS[form] || `SEC filing (${form})`;
  const itemCodes = cleanString(items) ? items.split(',').map(s => s.trim()) : [];
  const itemLabels = itemCodes.map(c => EDGAR_8K_ITEM_LABELS[c] || c).join(', ');
  return {
    title: `${formLabel} — ${companyTitle} filed ${filingDate}`,
    snippet: itemLabels
      ? `SEC EDGAR primary source. ${form} items: ${itemLabels}.`
      : `SEC EDGAR primary source. Form ${form} filed ${filingDate}.`,
  };
}

async function _edgarRecentFilings(symbol, userAgent, maxResults) {
  const mapped = await _edgarCikForSymbol(symbol, userAgent);
  if (!mapped) {
    return []; // No CIK mapping (crypto/ETF) is a fact, not an error.
  }

  let cached = _edgarSubmissionsCache.get(mapped.cik);
  if (!cached || Date.now() - cached.at > EDGAR_SUBMISSIONS_TTL_MS) {
    const data = await _edgarFetchJson(`https://data.sec.gov/submissions/CIK${mapped.cik}.json`, userAgent);
    cached = { at: Date.now(), data };
    _edgarSubmissionsCache.set(mapped.cik, cached);
  }

  const recent = cached.data && cached.data.filings && cached.data.filings.recent;
  if (!recent || !Array.isArray(recent.form)) {
    throw new Error('SEC EDGAR submissions response missing filings.recent arrays');
  }

  const cutoff = new Date(Date.now() - EDGAR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const companyTitle = cleanString(cached.data.name) || mapped.title || symbol;
  const results = [];
  const cikNumeric = String(Number(mapped.cik));
  for (let i = 0; i < recent.form.length && results.length < maxResults; i++) {
    const filingDate = recent.filingDate[i];
    if (filingDate < cutoff) break; // arrays are newest-first
    const accession = String(recent.accessionNumber[i] || '').replace(/-/g, '');
    const primaryDoc = cleanString(recent.primaryDocument[i]);
    if (!accession || !primaryDoc) continue;
    const { title, snippet } = _edgarDescribeFiling(
      recent.form[i],
      recent.items ? recent.items[i] : '',
      filingDate,
      companyTitle
    );
    results.push({
      title,
      url: `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accession}/${primaryDoc}`,
      snippet: snippet.substring(0, 300),
    });
  }
  return results;
}

async function alpacaEdgarSearchImpl(config, query, maxResults) {
  const symbol = leadingTickerSymbol(query);
  if (!symbol) {
    return alpacaSearchImpl(config, query, maxResults); // market-wide: news only
  }

  // Both legs run concurrently; either leg's transport failure throws
  // (no-partial-results rule — the server boundary owns error surfacing).
  const [newsResult, filings] = await Promise.all([
    alpacaSearchImpl(config, query, maxResults),
    _edgarRecentFilings(symbol, config.edgarUserAgent, maxResults),
  ]);

  // Filings are the primary source — they take up to half the slots
  // (rounded up), newest first; the news wire backfills the rest.
  const filingSlots = Math.min(filings.length, Math.ceil(maxResults / 2));
  const merged = filings.slice(0, filingSlots);
  for (const r of newsResult.results) {
    if (merged.length >= maxResults) break;
    merged.push(r);
  }
  for (const f of filings.slice(filingSlots)) {
    if (merged.length >= maxResults) break;
    merged.push(f);
  }

  return { answer: null, results: merged };
}

const PROVIDER_IMPLS = {
  tavily: tavilySearchImpl,
  brightdata: brightDataSearchImpl,
  alpaca: alpacaSearchImpl,
  'alpaca-edgar': alpacaEdgarSearchImpl,
};

/**
 * Create a search client for a resolved provider config.
 * @param {{provider: 'tavily'|'brightdata'|'alpaca'|'alpaca-edgar'}} config from resolveNewsSearchConfig
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
