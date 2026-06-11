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

  test('rejects live trading with enabled webhook route and non-https URL', () => {
    expect(() => new WebhookOrderAdapter({
      enabled: true,
      dryRun: false,
      liveTrading: true,
      webhookUrl: 'http://signalstack.example/webhook',
    })).toThrow(/https/);
  });
});
