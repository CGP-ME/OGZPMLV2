/**
 * TRAI Core — re-export from canonical location
 * ═══════════════════════════════════════════════
 * The single source of truth is core/trai_core.js.
 * This shim exists so existing require('../trai_brain/trai_core') calls don't break.
 *
 * UNIFIED 2026-03-30: Merged core/ and trai_brain/ versions into core/trai_core.js
 */
module.exports = require('../core/trai_core');
