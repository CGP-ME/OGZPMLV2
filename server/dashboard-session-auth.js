const crypto = require('crypto');

const DASHBOARD_SESSION_COOKIE = 'ogz_dashboard_session';
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TICKET_TTL_MS = 10 * 60 * 1000;

function base64Url(bytes) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest();
}

function secureCompare(candidate, expected) {
  if (typeof candidate !== 'string' || typeof expected !== 'string') return false;
  if (!candidate || !expected) return false;
  const left = digest(candidate);
  const right = digest(expected);
  return crypto.timingSafeEqual(left, right);
}

function parseCookieHeader(header) {
  const cookies = {};
  if (typeof header !== 'string' || !header.trim()) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function isSecureRequest(req) {
  const proto = req && req.headers ? String(req.headers['x-forwarded-proto'] || '').toLowerCase() : '';
  return proto.split(',')[0].trim() === 'https';
}

function createDashboardSessionAuth(options = {}) {
  const sessionTtlMs = Number.isFinite(options.sessionTtlMs) ? options.sessionTtlMs : DEFAULT_SESSION_TTL_MS;
  const ticketTtlMs = Number.isFinite(options.ticketTtlMs) ? options.ticketTtlMs : DEFAULT_TICKET_TTL_MS;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const sessions = new Map();
  const tickets = new Map();

  function prune(store) {
    const current = now();
    for (const [token, record] of store.entries()) {
      if (!record || record.expiresAt <= current) store.delete(token);
    }
  }

  function issueSession() {
    prune(sessions);
    const token = base64Url(32);
    const expiresAt = now() + sessionTtlMs;
    sessions.set(token, { expiresAt });
    return { token, expiresAt };
  }

  function validateSession(token) {
    prune(sessions);
    const record = typeof token === 'string' ? sessions.get(token) : null;
    return Boolean(record && record.expiresAt > now());
  }

  function sessionFromRequest(req) {
    const cookies = parseCookieHeader(req && req.headers ? req.headers.cookie : '');
    const sessionValue = cookies[DASHBOARD_SESSION_COOKIE];
    return validateSession(sessionValue) ? sessionValue : '';
  }

  function issueTicket() {
    prune(tickets);
    const ticket = base64Url(24);
    const expiresAt = now() + ticketTtlMs;
    tickets.set(ticket, { expiresAt });
    return { ticket, expiresAt };
  }

  function consumeTicket(ticket) {
    prune(tickets);
    const record = typeof ticket === 'string' ? tickets.get(ticket) : null;
    if (!record || record.expiresAt <= now()) return false;
    tickets.delete(ticket);
    return true;
  }

  function buildSessionCookie(req, token) {
    const maxAgeSeconds = Math.max(1, Math.floor(sessionTtlMs / 1000));
    const parts = [
      `${DASHBOARD_SESSION_COOKIE}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAgeSeconds}`
    ];
    if (isSecureRequest(req) || process.env.NODE_ENV === 'production') parts.push('Secure');
    return parts.join('; ');
  }

  function clearSessionCookie(req) {
    const parts = [
      `${DASHBOARD_SESSION_COOKIE}=`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=0'
    ];
    if (isSecureRequest(req) || process.env.NODE_ENV === 'production') parts.push('Secure');
    return parts.join('; ');
  }

  return {
    cookieName: DASHBOARD_SESSION_COOKIE,
    issueSession,
    validateSession,
    sessionFromRequest,
    issueTicket,
    consumeTicket,
    buildSessionCookie,
    clearSessionCookie,
    tokenMatches: secureCompare,
    parseCookieHeader
  };
}

module.exports = {
  DASHBOARD_SESSION_COOKIE,
  createDashboardSessionAuth,
  parseCookieHeader,
  secureCompare
};
