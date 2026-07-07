'use strict';

const WebhookOrderAdapter = require('../core/WebhookOrderAdapter');

describe('WebhookOrderAdapter live posture guard', () => {
  test('rejects live trading with enabled dry-run webhook orders', () => {
    expect(() => new WebhookOrderAdapter({
      enabled: true,
      dryRun: true,
      liveTrading: true,
      webhookUrl: 'https://signalstack.example/webhook',
    })).toThrow(/WEBHOOK_DRY_RUN=true/);
  });

  test('allows dry-run webhook adapter outside live trading', () => {
    const adapter = new WebhookOrderAdapter({
      enabled: true,
      dryRun: true,
      liveTrading: false,
      webhookUrl: 'https://signalstack.example/webhook',
    });

    expect(adapter.getStats()).toEqual(expect.objectContaining({
      enabled: true,
      dryRun: true,
    }));
  });

  test('does not treat executionMode as an unvalidated live trading trigger', () => {
    const adapter = new WebhookOrderAdapter({
      enabled: true,
      dryRun: true,
      liveTrading: false,
      executionMode: 'live',
      webhookUrl: 'https://signalstack.example/webhook',
    });

    expect(adapter.getStats()).toEqual(expect.objectContaining({
      enabled: true,
      dryRun: true,
    }));
  });

  test('allows direct live broker mode when webhook orders are disabled', () => {
    const adapter = new WebhookOrderAdapter({
      enabled: false,
      dryRun: true,
      liveTrading: true,
    });

    expect(adapter.getStats()).toEqual(expect.objectContaining({
      enabled: false,
      dryRun: true,
    }));
  });

  test('rejects live trading with enabled webhook route and missing URL', () => {
    expect(() => new WebhookOrderAdapter({
      enabled: true,
      dryRun: false,
      liveTrading: true,
    })).toThrow(/missing SIGNALSTACK_WEBHOOK_URL/);
  });

  test('rejects live trading with enabled webhook route and placeholder URL', () => {
    expect(() => new WebhookOrderAdapter({
      enabled: true,
      dryRun: false,
      liveTrading: true,
      webhookUrl: 'https://app.signalstack.com/hook/YOUR_UNIQUE_ID',
    })).toThrow(/placeholder URL/);
  });

  test('rejects live trading with enabled webhook route and encoded placeholder URL', () => {
    expect(() => new WebhookOrderAdapter({
      enabled: true,
      dryRun: false,
      liveTrading: true,
      webhookUrl: 'https://app.signalstack.com/hook/YOUR%5FUNIQUE%5FID',
    })).toThrow(/placeholder URL/);
  });

  test('rejects live trading with enabled webhook route and double-encoded placeholder URL', () => {
    expect(() => new WebhookOrderAdapter({
      enabled: true,
      dryRun: false,
      liveTrading: true,
      webhookUrl: 'https://app.signalstack.com/hook/YOUR%255FUNIQUE%255FID',
    })).toThrow(/placeholder URL/);
  });

  test('rejects live trading with enabled webhook route and userinfo placeholder URL', () => {
    expect(() => new WebhookOrderAdapter({
      enabled: true,
      dryRun: false,
      liveTrading: true,
      webhookUrl: 'https://YOUR_UNIQUE_ID@app.signalstack.com/hook/real',
    })).toThrow(/placeholder URL/);
  });

  test('disables non-live webhook sends when URL is placeholder and dry-run is false', () => {
    const adapter = new WebhookOrderAdapter({
      enabled: true,
      dryRun: false,
      liveTrading: false,
      webhookUrl: 'https://app.signalstack.com/hook/YOUR_UNIQUE_ID',
    });

    expect(adapter.getStats()).toEqual(expect.objectContaining({
      enabled: false,
      dryRun: false,
    }));
  });

  test('rejects live trading with enabled webhook route and non-https URL', () => {
    expect(() => new WebhookOrderAdapter({
      enabled: true,
      dryRun: false,
      liveTrading: true,
      webhookUrl: 'http://signalstack.example/webhook',
    })).toThrow(/https/);
  });

  test('blocks unsupported close action before posting to SignalStack', async () => {
    const adapter = new WebhookOrderAdapter({
      enabled: true,
      dryRun: false,
      liveTrading: true,
      webhookUrl: 'https://signalstack.example/webhook',
    });
    const postSpy = jest.spyOn(adapter, '_post').mockResolvedValue({ status: 200, body: '{}' });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await adapter.emit({
      action: 'close',
      symbol: 'NVDA',
      quantity: 1,
      bypassThrottle: true,
    });

    expect(result).toEqual({
      sent: false,
      reason: 'unsupported_action',
      action: 'close',
    });
    expect(postSpy).not.toHaveBeenCalled();
    expect(adapter.getStats().lastOrderTime).toBe(0);

    warnSpy.mockRestore();
  });
});
