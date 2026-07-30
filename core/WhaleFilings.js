/**
 * WhaleFilings - Named-whale position intelligence from free primary sources.
 *
 * Realizes the data layer that ogz-meta/ledger/possiblearchitecture/
 * WhaleWatcher.js stubbed (check13FFilings / checkARKTrades) — as read-only
 * dashboard intelligence. NO trade mirroring: the scaffold's whale-pool
 * allocation ideas are board-sequenced and deliberately not built here.
 *
 * Sources (all free):
 *   ARK daily holdings CSVs (assets.ark-funds.com) — the fund's own daily
 *     publication. Ticker-keyed; day-over-day diff when this process has a
 *     prior day's snapshot in memory (restarts honestly reset the baseline
 *     and report position-only until a new baseline accrues).
 *   SEC 13F-HR info tables (data.sec.gov / Archives) — quarterly holdings
 *     for named managers, matched to a symbol by normalized issuer name.
 *     Quarterly with a 45-day filing lag; every emitted row says so.
 *
 * Failure semantics: each whale/fund source is independent decoration —
 * a failed source is skipped, never fabricated, never fatal. An empty
 * return is the honest "no whale activity found" state. (The strict
 * throw-on-transport rule of NewsSearchProvider governs contract data;
 * these rows are additive garnish on an already-valid search result.)
 *
 * @module core/WhaleFilings
 */

'use strict';

const WHALES = [
  { key: 'berkshire', person: 'Warren Buffett', cik: '0001067983' },
  { key: 'pershing', person: 'Bill Ackman', cik: '0001336528' },
  { key: 'bridgewater', person: 'Ray Dalio', cik: '0001350694' },
  { key: 'scion', person: 'Michael Burry', cik: '0001649339' },
];

const ARK_FUNDS = [
  { fund: 'ARKK', file: 'ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv' },
  { fund: 'ARKW', file: 'ARK_NEXT_GENERATION_INTERNET_ETF_ARKW_HOLDINGS.csv' },
  { fund: 'ARKF', file: 'ARK_FINTECH_INNOVATION_ETF_ARKF_HOLDINGS.csv' },
  { fund: 'ARKG', file: 'ARK_GENOMIC_REVOLUTION_ETF_ARKG_HOLDINGS.csv' },
  { fund: 'ARKQ', file: 'ARK_AUTONOMOUS_TECH._%26_ROBOTICS_ETF_ARKQ_HOLDINGS.csv' },
  { fund: 'ARKX', file: 'ARK_SPACE_EXPLORATION_%26_INNOVATION_ETF_ARKX_HOLDINGS.csv' },
];
const ARK_CSV_BASE = 'https://assets.ark-funds.com/fund-documents/funds-etf-csv/';
const ARK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TICKER_MAP_TTL_MS = 24 * 60 * 60 * 1000;
const SUBMISSIONS_TTL_MS = 24 * 60 * 60 * 1000;

const _arkCache = new Map();          // fund -> { at, date, byTicker: Map }
const _arkPrevSnapshot = new Map();   // fund -> { date, byTicker: Map } (previous ARK day)
const _thirteenFCache = new Map();    // accession -> aggregated Map<issuerKey,{shares,value,issuer}>
const _whaleSubmissions = new Map();  // cik -> { at, latest: {accession, filingDate} | null }
let _tickerTitleMap = null;           // { at, bySymbol: Map<ticker, title> }

function _clean(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

async function _fetchText(url, userAgent) {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

// ── ARK daily holdings ────────────────────────────────────────────────

function _parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

async function _arkHoldings(fundDef, userAgent) {
  const cached = _arkCache.get(fundDef.fund);
  if (cached && Date.now() - cached.at < ARK_CACHE_TTL_MS) return cached;

  const text = await _fetchText(ARK_CSV_BASE + fundDef.file, userAgent);
  const lines = text.split('\n');
  const byTicker = new Map();
  let fileDate = '';
  for (let i = 1; i < lines.length; i++) {
    const f = _parseCsvLine(lines[i]);
    if (f.length < 8) continue; // disclaimer/blank tail rows
    const ticker = _clean(f[3]).toUpperCase();
    if (!ticker) continue;
    const shares = Number(_clean(f[5]).replace(/,/g, ''));
    const weight = Number(_clean(f[7]).replace(/%/g, ''));
    if (!Number.isFinite(shares)) continue;
    fileDate = _clean(f[0]) || fileDate;
    byTicker.set(ticker, {
      company: _clean(f[2]),
      shares,
      weight: Number.isFinite(weight) ? weight : null,
    });
  }
  if (byTicker.size === 0) throw new Error(`ARK ${fundDef.fund} CSV parsed to zero holdings`);

  // Day rolled over inside this process: keep the old day as diff baseline.
  if (cached && cached.date && cached.date !== fileDate) {
    _arkPrevSnapshot.set(fundDef.fund, { date: cached.date, byTicker: cached.byTicker });
  }
  const entry = { at: Date.now(), date: fileDate, byTicker };
  _arkCache.set(fundDef.fund, entry);
  return entry;
}

async function _arkRowsForSymbol(symbol, userAgent) {
  const rows = [];
  for (const fundDef of ARK_FUNDS) {
    try {
      const { date, byTicker } = await _arkHoldings(fundDef, userAgent);
      const pos = byTicker.get(symbol);
      const prev = _arkPrevSnapshot.get(fundDef.fund);
      const prevPos = prev ? prev.byTicker.get(symbol) : undefined;
      if (!pos && !prevPos) continue;

      const url = ARK_CSV_BASE + fundDef.file;
      if (pos && prevPos && pos.shares !== prevPos.shares) {
        const delta = pos.shares - prevPos.shares;
        const verb = delta > 0 ? 'ADDED' : 'TRIMMED';
        rows.push({
          title: `Whale ${verb === 'ADDED' ? 'BUY' : 'SELL'} — ARK ${fundDef.fund} (Cathie Wood) ${verb} ${Math.abs(delta).toLocaleString('en-US')} ${symbol} shares`,
          url,
          snippet: `ARK daily holdings (fund's own publication): ${fundDef.fund} ${symbol} ${prevPos.shares.toLocaleString('en-US')} -> ${pos.shares.toLocaleString('en-US')} shares (${prev.date} -> ${date})${pos.weight != null ? `, now ${pos.weight}% of fund` : ''}.`,
        });
      } else if (pos) {
        rows.push({
          title: `Whale position — ARK ${fundDef.fund} (Cathie Wood) holds ${pos.shares.toLocaleString('en-US')} ${symbol} shares${pos.weight != null ? ` (${pos.weight}% of fund)` : ''}`,
          url,
          snippet: `ARK daily holdings (fund's own publication), as of ${date}. Day-over-day change reported once a prior day's baseline is observed.`,
        });
      } else {
        rows.push({
          title: `Whale EXIT — ARK ${fundDef.fund} (Cathie Wood) fully exited ${symbol}`,
          url,
          snippet: `ARK daily holdings: ${symbol} held ${prevPos.shares.toLocaleString('en-US')} shares on ${prev.date}, absent from ${date} file.`,
        });
      }
    } catch (_) {
      // Independent source: skip on failure, never fabricate.
    }
  }
  return rows;
}

// ── 13F quarterly holdings ────────────────────────────────────────────

async function _companyTitleForSymbol(symbol, userAgent) {
  if (!_tickerTitleMap || Date.now() - _tickerTitleMap.at > TICKER_MAP_TTL_MS) {
    const raw = JSON.parse(await _fetchText('https://www.sec.gov/files/company_tickers.json', userAgent));
    const bySymbol = new Map();
    for (const entry of Object.values(raw)) {
      if (entry && entry.ticker) bySymbol.set(String(entry.ticker).toUpperCase(), _clean(entry.title));
    }
    _tickerTitleMap = { at: Date.now(), bySymbol };
  }
  return _tickerTitleMap.bySymbol.get(symbol) || '';
}

// "Tesla, Inc." / "TESLA INC" / "TESLA MTRS" all reduce to first token "TESLA".
function _issuerKey(name) {
  return _clean(name).toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/)[0] || '';
}

async function _latest13F(whale, userAgent) {
  let cached = _whaleSubmissions.get(whale.cik);
  if (!cached || Date.now() - cached.at > SUBMISSIONS_TTL_MS) {
    const d = JSON.parse(await _fetchText(`https://data.sec.gov/submissions/CIK${whale.cik}.json`, userAgent));
    const r = d.filings && d.filings.recent;
    let latest = null;
    if (r && Array.isArray(r.form)) {
      for (let i = 0; i < r.form.length; i++) {
        if (r.form[i] === '13F-HR') {
          latest = {
            accession: String(r.accessionNumber[i]).replace(/-/g, ''),
            filingDate: r.filingDate[i],
            entity: _clean(d.name) || whale.key,
          };
          break;
        }
      }
    }
    cached = { at: Date.now(), latest };
    _whaleSubmissions.set(whale.cik, cached);
  }
  return cached.latest;
}

async function _thirteenFHoldings(whale, latest, userAgent) {
  if (_thirteenFCache.has(latest.accession)) return _thirteenFCache.get(latest.accession);

  const cikNumeric = String(Number(whale.cik));
  const index = JSON.parse(await _fetchText(
    `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${latest.accession}/index.json`, userAgent));
  const xmlFiles = (index.directory.item || [])
    .filter(it => it.name.endsWith('.xml') && it.name !== 'primary_doc.xml')
    .sort((a, b) => Number(b.size) - Number(a.size));
  if (xmlFiles.length === 0) throw new Error(`13F ${latest.accession}: no info table xml`);

  const xml = await _fetchText(
    `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${latest.accession}/${xmlFiles[0].name}`, userAgent);
  const holdings = new Map(); // issuerKey -> { issuer, shares, value }
  const blocks = xml.match(/<(?:\w+:)?infoTable>[\s\S]*?<\/(?:\w+:)?infoTable>/g) || [];
  for (const block of blocks) {
    const issuer = (block.match(/<(?:\w+:)?nameOfIssuer>([^<]*)/) || [])[1] || '';
    const value = Number((block.match(/<(?:\w+:)?value>([^<]*)/) || [])[1]);
    const shares = Number((block.match(/<(?:\w+:)?sshPrnamt>([^<]*)/) || [])[1]);
    const key = _issuerKey(issuer);
    if (!key || !Number.isFinite(shares)) continue;
    const agg = holdings.get(key) || { issuer: _clean(issuer), shares: 0, value: 0 };
    agg.shares += shares;
    agg.value += Number.isFinite(value) ? value : 0;
    holdings.set(key, agg);
  }
  if (holdings.size === 0) throw new Error(`13F ${latest.accession}: info table parsed to zero holdings`);
  _thirteenFCache.set(latest.accession, holdings);
  return holdings;
}

async function _thirteenFRowsForSymbol(symbol, userAgent) {
  let key = '';
  try {
    key = _issuerKey(await _companyTitleForSymbol(symbol, userAgent));
  } catch (_) {
    return []; // No name mapping -> no honest 13F match possible.
  }
  if (!key) return [];

  const rows = [];
  for (const whale of WHALES) {
    try {
      const latest = await _latest13F(whale, userAgent);
      if (!latest) continue;
      const holdings = await _thirteenFHoldings(whale, latest, userAgent);
      const pos = holdings.get(key);
      if (!pos) continue;
      const valueStr = pos.value > 0 ? ` (~$${Math.round(pos.value / 1e6).toLocaleString('en-US')}M)` : '';
      rows.push({
        title: `Whale 13F — ${latest.entity} (${whale.person}) holds ${pos.shares.toLocaleString('en-US')} shares of ${pos.issuer}${valueStr}`,
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${whale.cik}&type=13F&dateb=&owner=include&count=10`,
        snippet: `SEC 13F-HR filed ${latest.filingDate}. Quarterly snapshot with up to 45-day lag — conviction context, not a live trade signal.`,
      });
    } catch (_) {
      // Independent source: skip on failure, never fabricate.
    }
  }
  return rows;
}

/**
 * Whale intelligence rows for one symbol, in NewsSearchProvider's result
 * shape ({title, url, snippet}). Returns [] when no tracked whale touches
 * the symbol — the honest empty state.
 */
async function whaleActivityForSymbol(symbol, { userAgent, maxRows = 3 } = {}) {
  if (!_clean(symbol) || !_clean(userAgent)) return [];
  const sym = symbol.toUpperCase();
  const [arkRows, f13Rows] = await Promise.all([
    _arkRowsForSymbol(sym, userAgent),
    _thirteenFRowsForSymbol(sym, userAgent),
  ]);
  // ARK first: daily beats quarterly for freshness.
  return arkRows.concat(f13Rows).slice(0, maxRows);
}

module.exports = { whaleActivityForSymbol };
