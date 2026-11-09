(function () {
  'use strict';
  const panel = document.createElement('section');
  panel.id = 'supervisorRecovery';
  panel.setAttribute('aria-label', 'Supervisor notices');
  panel.style.cssText = 'margin:16px;padding:16px;border:1px solid #806c29;background:#111;color:#eee;position:relative;z-index:2';
  const heading = document.createElement('h2');
  heading.textContent = 'Supervisor notices';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const detail = document.createElement('p');
  const channels = document.createElement('p');
  const signIn = document.createElement('a');
  signIn.textContent = 'Open dashboard sign-in';
  signIn.href = '/control-panel.html' + window.location.search;
  const latest = document.createElement('a');
  latest.textContent = 'Review the current request';
  latest.href = '/control-panel.html';
  const acknowledge = document.createElement('button');
  acknowledge.textContent = 'Acknowledge notice';
  const refreshButton = document.createElement('button');
  refreshButton.textContent = 'Refresh receipt';
  for (const button of [acknowledge, refreshButton]) {
    button.type = 'button';
    button.style.cssText = 'margin:8px 8px 0 0;padding:8px 14px;cursor:pointer';
  }
  panel.append(heading, status, detail, channels, signIn, latest, acknowledge, refreshButton);
  document.body.prepend(panel);
  const linkedRequest = new URLSearchParams(window.location.search).get('recovery');
  let current = null;
  let busy = false;
  let activeRequest = null;
  let timer;
  let pollMs;

  function render(payload) {
    current = payload.request || null;
    signIn.hidden = payload.error !== 'dashboard_session_required';
    const staleLink = !!linkedRequest && current?.id !== linkedRequest;
    latest.hidden = !staleLink;
    const pending = !payload.error && !staleLink && current?.status === 'pending';
    acknowledge.hidden = !pending;
    acknowledge.disabled = busy;
    if (payload.error) status.textContent = `Notice unavailable: ${payload.error}.`;
    else if (staleLink) status.textContent = 'This notification no longer matches the current request. No action was taken.';
    else if (!current) status.textContent = 'No stopped-bot notice is pending.';
    else status.textContent = `${current.processName}: ${current.status.replaceAll('_', ' ')}.`;
    detail.textContent = pending
      ? 'Start the bot manually only if you intend to bring it back. Acknowledging this notice does not start or stop anything. PM2 keeps its normal crash recovery.'
      : current?.status === 'acknowledged' ? 'Acknowledgment recorded. The supervisor has not started the bot.' : '';
    if (current?.pm2Status === 'missing') detail.textContent += ' The saved bot process is missing from PM2; inspect it before attempting a manual start.';
    channels.textContent = current ? `Request ${current.id} · ` + ['dashboard', 'telegram', 'ntfy'].map(
      name => `${name}: ${current.notifications?.[name]?.status || 'not attempted'}`
    ).join(' · ') : '';
  }

  async function refresh(cancelPending = false) {
    if (activeRequest && !cancelPending) return;
    await requestReceipt('/api/supervisor/recovery', { credentials: 'same-origin', cache: 'no-store' });
  }

  async function requestReceipt(url, options) {
    // Refresh remains available even while fetch or response.json is stalled.
    // Canceling a POST does not undo a server acknowledgment: the next GET reads
    // its receipt before another acknowledgment is offered.
    if (activeRequest) activeRequest.abort();
    const controller = new AbortController();
    activeRequest = controller;
    busy = options.method === 'POST';
    acknowledge.disabled = true;
    refreshButton.textContent = 'Cancel request and refresh receipt';
    clearTimeout(timer);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const payload = await response.json();
      if (activeRequest !== controller) return;
      if (Number.isInteger(payload.pollMs) && payload.pollMs > 0) pollMs = payload.pollMs;
      busy = false;
      render(payload);
    } catch (_) {
      if (activeRequest !== controller) return;
      render({ error: options.method === 'POST'
        ? 'acknowledgment_response_unavailable_refresh_receipt' : 'supervisor_receipt_unavailable' });
    }
    finally {
      if (activeRequest === controller) {
        activeRequest = null;
        busy = false;
        refreshButton.textContent = 'Refresh receipt';
        if (pollMs) timer = setTimeout(() => refresh(), pollMs);
      }
    }
  }

  async function recordAcknowledgment() {
    if (activeRequest || busy || !current || current.status !== 'pending') return;
    const id = current.id;
    await requestReceipt(`/api/supervisor/recovery/${encodeURIComponent(id)}`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'acknowledge' })
    });
  }
  acknowledge.addEventListener('click', recordAcknowledgment);
  refreshButton.addEventListener('click', () => refresh(true));
  window.addEventListener('focus', () => refresh());
  const socket = window.OGZ && window.OGZ.get('Socket');
  if (socket) socket.registerHandler('auth_success', () => refresh());
  refresh();
})();
