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

        .trai-message.typing {
          background: #2d2d44;
          color: #888;
        }

        .trai-message.typing::after {
          content: '...';
          animation: typing 1.5s infinite;
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
    connectWebSocket();
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
      sendButton.disabled = !input.value.trim() || !isConnected;
    });

    sendButton.addEventListener('click', sendMessage);
  }

  // Connect to WebSocket
  function connectWebSocket() {
    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('[TRAI Widget] Connected to WebSocket');
        isConnected = true;
        updateStatus(true);
        document.getElementById('trai-send').disabled = !document.getElementById('trai-input').value.trim();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

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

  // Send message
  function sendMessage() {
    const input = document.getElementById('trai-input');
    const query = input.value.trim();

    if (!query || !isConnected) return;

    const queryId = 'q_' + Date.now();

    // Add user message to chat
    addMessage(query, 'user');
    input.value = '';
    document.getElementById('trai-send').disabled = true;

    // Add typing indicator
    const typingEl = addMessage('', 'bot typing');
    typingEl.id = 'trai-typing';

    // Send to bot
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'trai_query',
        query: query,
        queryId: queryId,
        sessionId: sessionId,
        timestamp: Date.now()
      }));

      pendingQueries.set(queryId, {
        query,
        timestamp: Date.now()
      });

      // Timeout after 30s
      setTimeout(() => {
        if (pendingQueries.has(queryId)) {
          pendingQueries.delete(queryId);
          removeTyping();
          addMessage('Sorry, the response timed out. Please try again.', 'bot');
        }
      }, 30000);
    }
  }

  // Handle response from TRAI
  function handleResponse(data) {
    removeTyping();

    const response = typeof data.response === 'string'
      ? data.response
      : (data.response?.message || data.response?.text || JSON.stringify(data.response));

    addMessage(response, 'bot');

    if (pendingQueries.has(data.queryId)) {
      pendingQueries.delete(data.queryId);
    }
  }

  // Add message to chat
  function addMessage(text, type) {
    const messages = document.getElementById('trai-messages');
    const msg = document.createElement('div');
    msg.className = `trai-message ${type}`;
    msg.textContent = text;
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
