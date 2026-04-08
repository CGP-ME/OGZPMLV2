/**
 * Persistent LLM Client — re-export from canonical location
 * ═══════════════════════════════════════════════════════════
 * The single source of truth is core/persistent_llm_client.js.
 * This shim exists so existing require('./persistent_llm_client') in trai_brain/ doesn't break.
 *
 * UNIFIED 2026-03-30: Eliminated duplicate file
 */
module.exports = require('../core/persistent_llm_client');
