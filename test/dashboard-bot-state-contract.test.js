'use strict';

const fs = require('fs');
const path = require('path');

describe('dashboard bot_state contract', () => {
  test('backend emits bot_state after authenticated dashboard websocket connect', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'core', 'WebSocketManager.js'),
      'utf8'
    );

    expect(source).toContain("const { buildBotStateFrame } = require('./BotStateFrame');");
    expect(source).toContain('this.ctx.dashboardAuthPending = true;');
    expect(source).toContain("this.ctx.dashboardWs.close(1008, 'Invalid auth_success');");
    expect(source).toContain('this.ctx.dashboardConnectionId = connectionId;');
    expect(source).toContain('this.startBotStateBroadcast();');
    expect(source).toContain('sendBotStateFrame()');
    expect(source).toContain('const frame = buildBotStateFrame({');
    expect(source).toContain('this.ctx.botStateInterval = setInterval(() => {');
    expect(source).toContain('clearInterval(this.ctx.botStateInterval);');
    expect(source).toContain('this.ctx.lastDashboardMessageReceived = Date.now();');
    expect(source).not.toContain('this.ctx.lastDashboardMessageReceived = this.ctx.lastDashboardMessageReceived || Date.now();');
  });

  test('frontend data pipe accepts bot_state as dashboard data', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'js', 'websocket.js'),
      'utf8'
    );

    expect(source).toContain("'bot_state'");
  });

  test('header strip renders a bot_state banner instead of relying on bot_thinking silence', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'js', 'panels', 'header-strip.js'),
      'utf8'
    );

    expect(source).toContain('id="hsBotStateBanner"');
    expect(source).toContain('function handleBotState(d)');
    expect(source).toContain("socket.registerHandler('bot_state'");
    expect(source).toContain('function updateBotStateBanner()');
    expect(source).toContain('BOT STATE AWAITING');
    expect(source).toContain("formatBotStateLabel(state.botState.reason)");
    expect(source).toContain("parts.push(`NEXT ${nextLabel}`);");
  });
});
