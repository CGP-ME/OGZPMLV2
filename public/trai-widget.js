/**
 * TRAI Chat Widget
 *
 * Floating chat bubble for tech support queries.
 * Connects to TRAI via WebSocket for real-time responses.
 */

(function() {
  'use strict';

  // Configuration
  // CHANGE 2026-01-21: Fixed WebSocket URL - must include /ws path
  const WS_URL = window.location.protocol === 'https:'
    ? `wss://${window.location.host}/ws`
    : `ws://${window.location.hostname}:3010/ws`;

  // State
  let ws = null;
  let sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  let pendingQueries = new Map();
  let isOpen = false;
  let isConnected = false;

  // Create widget HTML
  function createWidget() {
    const container = document.createElement('div');
    container.id = 'trai-widget-container';
    container.innerHTML = `
      <style>
        #trai-widget-container {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 10000;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        #trai-chat-button {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.3s, box-shadow 0.3s;
        }

        #trai-chat-button:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
        }

        #trai-chat-button svg {
          width: 30px;
          height: 30px;
          fill: white;
        }

        #trai-chat-window {
          display: none;
          position: absolute;
          bottom: 70px;
          right: 0;
          width: 350px;
          height: 450px;
          background: #1a1a2e;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
          overflow: hidden;
          flex-direction: column;
        }

        #trai-chat-window.open {
          display: flex;
        }

        #trai-header {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          padding: 15px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        #trai-header-icon {
          width: 35px;
          height: 35px;
          background: rgba(255,255,255,0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        #trai-header-icon svg {
          width: 20px;
          height: 20px;
          fill: white;
        }

        #trai-header-text h3 {
          margin: 0;
          color: white;
          font-size: 16px;
        }

        #trai-header-text p {
          margin: 2px 0 0 0;
          color: rgba(255,255,255,0.8);
          font-size: 12px;
        }

        #trai-status {
          margin-left: auto;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #4ade80;
        }

        #trai-status.disconnected {
          background: #f87171;
        }

        #trai-messages {
          flex: 1;
          overflow-y: auto;
          padding: 15px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .trai-message {
          max-width: 85%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.4;
        }

        .trai-message.user {
          align-self: flex-end;
          background: #6366f1;
          color: white;
          border-bottom-right-radius: 4px;
        }

        .trai-message.bot {
          align-self: flex-start;
          background: #2d2d44;
          color: #e5e5e5;
          border-bottom-left-radius: 4px;
        }

        .trai-message.system {
          align-self: center;
          background: transparent;
          color: #888;
          font-size: 12px;
        }

        .trai-message.link {
          align-self: flex-start;
          background: linear-gradient(135deg, #1e1e3f 0%, #2d2d44 100%);
          border: 1px solid #6366f1;
          padding: 8px 14px;
          font-size: 13px;
        }

        .trai-message.link:hover {
          background: linear-gradient(135deg, #2d2d44 0%, #3d3d54 100%);
        }

        .trai-message.typing {
          background: #2d2d44;
          color: #888;
        }

        .trai-message.typing::after {
          content: '...';
          animation: typing 1.5s infinite;
        }

        /* Markdown rendering styles */
        .trai-message h2, .trai-message h3, .trai-message h4 {
          margin: 8px 0 4px 0;
          color: #a78bfa;
        }
        .trai-message h2 { font-size: 16px; }
        .trai-message h3 { font-size: 14px; }
        .trai-message h4 { font-size: 13px; }
        .trai-message strong { color: #fbbf24; }
        .trai-message em { color: #93c5fd; }
        .trai-message code {
          background: #1e1e3f;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 12px;
        }
        .trai-message li {
          margin-left: 16px;
          list-style: disc;
        }
        .trai-message hr {
          border: none;
          border-top: 1px solid #444;
          margin: 8px 0;
        }

        @keyframes typing {
          0%, 20% { content: '.'; }
          40% { content: '..'; }
          60%, 100% { content: '...'; }
        }

        #trai-input-area {
          display: flex;
          padding: 12px;
          gap: 8px;
          border-top: 1px solid #333;
          background: #16162a;
        }

        #trai-input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid #444;
          border-radius: 20px;
          background: #1a1a2e;
          color: white;
          font-size: 14px;
          outline: none;
        }

        #trai-input:focus {
          border-color: #6366f1;
        }

        #trai-input::placeholder {
          color: #666;
        }

        #trai-send {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #6366f1;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        #trai-send:hover {
          background: #818cf8;
        }

        #trai-send:disabled {
          background: #444;
          cursor: not-allowed;
        }

        #trai-send svg {
          width: 18px;
          height: 18px;
          fill: white;
        }
      </style>

      <div id="trai-chat-window">
        <div id="trai-header">
          <div id="trai-header-icon">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
          </div>
          <div id="trai-header-text">
            <h3>TRAI Support</h3>
            <p>OGZ Prime Tech Support</p>
          </div>
          <div id="trai-status" class="disconnected"></div>
        </div>
        <div id="trai-messages">
          <div class="trai-message bot">
            Hi! I'm TRAI, your OGZ Prime tech support assistant. How can I help you today?
          </div>
        </div>
        <div id="trai-input-area">
          <input type="text" id="trai-input" placeholder="Ask me anything..." />
          <button id="trai-send" disabled>
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>

      <button id="trai-chat-button" title="Chat with TRAI">
        <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
      </button>
    `;

    document.body.appendChild(container);
    setupEventListeners();
    // CHANGE 2026-03-30: Check HTTP API status instead of WebSocket
    checkTraiStatus();
  }

  // Previous connection state — used to log ONLY on transition so the
  // 30s polling loop doesn't spam the console with a fresh "Connected"
  // line every half-minute. First connect and every state change still
  // surfaces; steady-state is silent.
  let _traiWasConnected = null;

  // Check TRAI API status via HTTP
  async function checkTraiStatus() {
    try {
      const response = await fetch('/api/trai/status');
      if (response.ok) {
        const status = await response.json();
        isConnected = status.ready;
        updateStatus(true);
        if (_traiWasConnected !== true) {
          console.log('[TRAI Widget] Connected to', status.providerName, '-', status.model);
          _traiWasConnected = true;
        }
      } else {
        if (_traiWasConnected !== false) {
          console.warn('[TRAI Widget] Disconnected (HTTP ' + response.status + ')');
          _traiWasConnected = false;
        }
        updateStatus(false);
      }
    } catch (e) {
      if (_traiWasConnected !== false) {
        console.warn('[TRAI Widget] Status check failed:', e.message);
        _traiWasConnected = false;
      }
      updateStatus(false);
    }
    // Re-check every 30 seconds
    setTimeout(checkTraiStatus, 30000);
  }

  // Setup event listeners
  function setupEventListeners() {
    const chatButton = document.getElementById('trai-chat-button');
    const chatWindow = document.getElementById('trai-chat-window');
    const input = document.getElementById('trai-input');
    const sendButton = document.getElementById('trai-send');

    chatButton.addEventListener('click', () => {
      isOpen = !isOpen;
      chatWindow.classList.toggle('open', isOpen);
      if (isOpen) {
        input.focus();
      }
    });

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    input.addEventListener('input', () => {
      sendButton.disabled = !input.value.trim();  // CHANGE 2026-03-30: No longer requires WebSocket
    });

    sendButton.addEventListener('click', sendMessage);
  }

  // Connect to WebSocket
  function connectWebSocket() {
    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('[TRAI Widget] Connected to WebSocket');

        // Authenticate with the WebSocket server (same token as dashboard)
        const authToken = '39ccfbc54660e6075f07730285badebbc40d805748c8eeb7d7f2e32d15ae1c62';
        ws.send(JSON.stringify({
          type: 'auth',
          token: authToken
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle auth success
          if (data.type === 'auth_success') {
            console.log('[TRAI Widget] Authenticated successfully');
            // Identify as dashboard so we can receive bot responses
            ws.send(JSON.stringify({
              type: 'identify',
              source: 'dashboard'
            }));
            isConnected = true;
            updateStatus(true);
            document.getElementById('trai-send').disabled = !document.getElementById('trai-input').value.trim();
            return;
          }

          // Handle TRAI response
          if (data.type === 'trai_response' && data.sessionId === sessionId) {
            handleResponse(data);
          }
        } catch (e) {
          console.error('[TRAI Widget] Parse error:', e);
        }
      };

      ws.onclose = () => {
        console.log('[TRAI Widget] WebSocket closed, reconnecting...');
        isConnected = false;
        updateStatus(false);
        setTimeout(connectWebSocket, 5000);
      };

      ws.onerror = (error) => {
        console.error('[TRAI Widget] WebSocket error:', error);
        isConnected = false;
        updateStatus(false);
      };
    } catch (error) {
      console.error('[TRAI Widget] Connection error:', error);
      setTimeout(connectWebSocket, 5000);
    }
  }

  // Update connection status
  function updateStatus(connected) {
    const status = document.getElementById('trai-status');
    if (status) {
      status.classList.toggle('disconnected', !connected);
    }
  }

  // CHANGE 2026-03-30: Use Mercury-2 via HTTP API (faster, cleaner responses)
  async function sendMessage() {
    const input = document.getElementById('trai-input');
    const query = input.value.trim();

    if (!query) return;

    // Add user message to chat
    addMessage(query, 'user');
    input.value = '';
    document.getElementById('trai-send').disabled = true;

    // Add typing indicator
    const typingEl = addMessage('Thinking...', 'bot typing');
    typingEl.id = 'trai-typing';

    try {
      const response = await fetch('/api/trai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          maxTokens: 1500  // Enough for full market analysis
        })
      });

      removeTyping();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.response) {
        addMessage(data.response, 'bot');
        // Detect stock symbols in the query and offer snapshot link
        const symbols = extractSymbols(query);
        if (symbols.length > 0) {
          const symbol = symbols[0];
          addMessage(`View full chart and analysis for ${symbol}`, 'link', `/snapshot?symbol=${symbol}&analyze=true`);
        }
        // Show provider info subtly
        const providerInfo = `${data.provider} • ${data.latency}ms`;
        console.log('[TRAI Widget] Response from:', providerInfo);
      } else if (data.error) {
        addMessage(`Error: ${data.error}`, 'system');
      }
    } catch (error) {
      removeTyping();
      console.error('[TRAI Widget] Error:', error);
      addMessage('Failed to reach TRAI. Please try again.', 'system');
    }

    // Re-enable input
    document.getElementById('trai-send').disabled = !document.getElementById('trai-input').value.trim();
  }

  // Handle response from TRAI (via bot's brain)
  function handleResponse(data) {
    removeTyping();

    // Clear timeout for this query
    if (pendingQueries.has(data.queryId)) {
      const pending = pendingQueries.get(data.queryId);
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      pendingQueries.delete(data.queryId);
    }

    let response = typeof data.response === 'string'
      ? data.response
      : (data.response?.message || data.response?.text || JSON.stringify(data.response));

    // CHANGE 2026-01-31: Client-side cleaning for TRAI responses
    // Remove <think>...</think> blocks (DeepSeek reasoning model artifacts)
    response = response.replace(/<think>[\s\S]*?<\/think>/g, '');
    response = response.replace(/<think>[\s\S]*/g, ''); // Incomplete blocks
    response = response.replace(/<\/think>/g, '');

    // Remove JSON blobs that might be in the response
    response = response.replace(/\{[\s\S]*"query"[\s\S]*"analysis"[\s\S]*\}/g, '');
    response = response.replace(/\{[\s\S]*"schema"[\s\S]*\}/g, '');

    // Strip the old canned disclaimer if the model still emits it out of habit
    response = response.replace(/^I can'?t give trading advice,? but (here are the facts:?|here's what|)\s*/i, '');

    // Clean up leading whitespace/punctuation (but NOT leading words — the old
    // broad regex was eating real first words like "Analysis shows..." → "shows...")
    response = response.replace(/^[\s.,;:!?\-\n\r]+/, '');
    // Only strip label-style prefixes that end with a colon (e.g. "Answer: ...")
    response = response.replace(/^(advice|response|answer|output|result|reply|recommendation|summary)\s*:\s+/i, '');
    response = response.trim();

    // If empty after cleaning, don't show confusing fallback - just skip
    if (!response || response.length < 5) {
      console.warn('[TRAI Widget] Empty response after cleaning, skipping');
      return; // Don't add empty/garbage message
    }

    addMessage(response, 'bot');

    // Update dashboard TRAI status light to green (success)
    const traiLight = document.getElementById('traiLight');
    if (traiLight) {
      traiLight.classList.remove('yellow', 'red');
      traiLight.classList.add('green');
    }
    if (window.statusTimestamps) {
      window.statusTimestamps.trai = Date.now();
    }
  }

  // Extract stock symbols from text (uppercase 1-5 letter words)
  function extractSymbols(text) {
    const commonWords = ['I', 'A', 'THE', 'AND', 'OR', 'FOR', 'TO', 'IN', 'ON', 'AT', 'IS', 'IT', 'BE', 'AS', 'ARE', 'WAS', 'IF', 'MY', 'SO', 'DO', 'OF', 'BY', 'UP', 'AN', 'NO', 'US', 'AM', 'GO', 'OK', 'HI', 'VS', 'RSI', 'EMA', 'ATR', 'SMA', 'MACD', 'VOL', 'BUY', 'SELL', 'USD', 'ETF', 'IPO', 'CEO', 'CFO', 'SEC', 'FDA', 'GDP', 'CPI', 'FED', 'API', 'AI'];
    const matches = text.match(/\b[A-Z]{1,5}\b/g) || [];
    return matches.filter(m => !commonWords.includes(m) && m.length >= 2);
  }

  // Simple markdown to HTML converter
  function renderMarkdown(text) {
    return text
      // Escape HTML first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headers
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      // Bold and italic
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Lists
      .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      // Tables - convert to simple formatted text
      .replace(/\|([^|]+)\|/g, (match, content) => {
        return content.split('|').map(c => c.trim()).filter(c => c && !c.match(/^[-:]+$/)).join(' • ') + '\n';
      })
      // Horizontal rules
      .replace(/^---+$/gm, '<hr>')
      // Line breaks
      .replace(/\n/g, '<br>');
  }

  // Add message to chat
  function addMessage(text, type, url) {
    const messages = document.getElementById('trai-messages');
    const msg = document.createElement('div');
    msg.className = `trai-message ${type}`;
    // Render markdown for bot messages, plain text for user/system
    if (type === 'bot' || type === 'bot typing') {
      msg.innerHTML = renderMarkdown(text);
    } else if (type === 'link') {
      // Clickable link to open snapshot page
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.textContent = text;
      link.style.cssText = 'color: #818cf8; text-decoration: none; display: flex; align-items: center; gap: 6px;';
      link.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>' + text;
      msg.appendChild(link);
    } else {
      msg.textContent = text;
    }
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  // Remove typing indicator
  function removeTyping() {
    const typing = document.getElementById('trai-typing');
    if (typing) {
      typing.remove();
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();
