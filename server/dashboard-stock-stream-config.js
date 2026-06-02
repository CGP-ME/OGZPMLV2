'use strict';

function envEnabled(value) {
  const text = String(value || '').trim().toLowerCase();
  return text === 'true' || text === '1';
}

function resolveDashboardStockStreamConfig(env = process.env) {
  const raw = env.DASHBOARD_STOCK_STREAM_ENABLED;
  return {
    enabled: envEnabled(raw),
    source: raw == null || raw === '' ? 'unset' : 'env:DASHBOARD_STOCK_STREAM_ENABLED'
  };
}

module.exports = {
  resolveDashboardStockStreamConfig
};
