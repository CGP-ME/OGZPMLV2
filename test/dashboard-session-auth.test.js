const {
  DASHBOARD_SESSION_COOKIE,
  createDashboardSessionAuth,
  secureCompare
} = require('../server/dashboard-session-auth');
const fs = require('fs');
const path = require('path');

describe('dashboard session auth', () => {
  test('issues an http-only dashboard session cookie and validates it from a request', () => {
    let now = 1000;
    const auth = createDashboardSessionAuth({ now: () => now, sessionTtlMs: 60000 });
    const session = auth.issueSession();
    const cookie = auth.buildSessionCookie(
      { headers: { 'x-forwarded-proto': 'https' } },
      session.token
    );

    expect(cookie).toContain(`${DASHBOARD_SESSION_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).not.toContain('WEBSOCKET_AUTH_TOKEN');
    expect(auth.sessionFromRequest({ headers: { cookie } })).toBe(session.token);

    now += 60001;
    expect(auth.sessionFromRequest({ headers: { cookie } })).toBe('');
  });

  test('one-use tickets are consumed and cannot be replayed', () => {
    const auth = createDashboardSessionAuth({ now: () => 1000, ticketTtlMs: 60000 });
    const { ticket } = auth.issueTicket();

    expect(auth.consumeTicket(ticket)).toBe(true);
    expect(auth.consumeTicket(ticket)).toBe(false);
  });

  test('token comparison accepts only the exact submitted token without leaking equality by length', () => {
    expect(secureCompare('runtime-token', 'runtime-token')).toBe(true);
    expect(secureCompare('runtime-token', 'runtime-token-extra')).toBe(false);
    expect(secureCompare('', 'runtime-token')).toBe(false);
  });

  test('websocket session-cookie auth is same-origin gated before ticket consumption', () => {
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'ogzprime-ssl-server.js'), 'utf8');
    const sameOriginIndex = serverSource.indexOf('isSameOriginDashboardRequest(req)');
    const consumeTicketIndex = serverSource.indexOf('dashboardSessionAuth.consumeTicket(data.ticket)');

    expect(sameOriginIndex).toBeGreaterThan(-1);
    expect(consumeTicketIndex).toBeGreaterThan(-1);
    expect(sameOriginIndex).toBeLessThan(consumeTicketIndex);
  });
});
