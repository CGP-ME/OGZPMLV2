/**
 * voice-manager.js — VoiceManager: personality voice-line player
 *
 * Browser-adapted from the Mover stack's VoiceManager.js. Plays personality
 * voice lines on bot events (entries, alerts) via the Web Speech API. If/when
 * pre-recorded MP3s drop into /public/voices/, the system can swap from synth
 * to playback per line (config-driven). For now, ships with speechSynthesis
 * as the universal backend so no audio files need to be deployed.
 *
 * Priority queue: high-priority lines (boot_intro / regerts) preempt lower
 * (commentary). Lines never spam — already-playing higher priority blocks new.
 *
 * Subscribes to OGZ.bus:
 *   - 'celebration:alert' (entry / break-even info messages) → trade_signals
 *   - 'celebration:win'   → trade_sent line
 *   - 'celebration:loss'  → commentary (only every Nth loss, not every loss —
 *                          loss-recovery.js handles per-loss speech directly)
 *
 * NO synthetic events. Voice is opt-out via setEnabled(false).
 *
 * Public API:
 *   init()
 *   play(key, options) — fire a specific voice line
 *   setEnabled(bool)
 *   setRate(0.5–2.0) / setPitch(0.5–2.0) / setVolume(0–1)
 *   teardown()
 *   _compute()
 *
 * @module public/js/panels/voice-manager
 */
(function (OGZ) {
    'use strict';

    // ─── Voice Line Library ─────────────────────────────────────────────
    // Each entry: { text, category, file? (optional MP3 path), effects? }
    // categories: boot_intro / regerts / trade_signals / commentary
    // (Priority 1 = highest, can't be interrupted. Priority 4 = lowest.)
    const CATEGORY_PRIORITY = {
        boot_intro:    1,
        regerts:       2,
        final_descent: 1,
        trade_signals: 3,
        commentary:    4
    };

    const VOICE_LIB = {
        // Boot sequence
        system_boot:        { text: "OGZ Prime initializing. Stand by for market domination.", category: 'boot_intro' },
        // Trade signals
        trade_sent:         { text: "Trade sent. Faith restored. IQ sacrificed.",                category: 'trade_signals' },
        bird_deployed:      { text: "Bird deployed. Flight path irreversible.",                  category: 'trade_signals' },
        short_engaged:      { text: "Short engaged. Bearish posture locked.",                    category: 'trade_signals' },
        // Commentary (rotating roast / wisdom)
        hot_patch:          { text: "Biology isn't JavaScript. Stop trying to hot patch your hand.", category: 'commentary' },
        suture_needed:      { text: "This wasn't a trade. This was a cry for help.",             category: 'commentary' },
        i_warned_you:       { text: "I warned you.",                                              category: 'commentary' },
        // Regerts mode (used by separate regerts engine, but lines live here for reuse)
        zero_logic:         { text: "Brain activity detected: none.",                            category: 'regerts' },
        emotional_trading:  { text: "You're emotionally trading. I respect that.",               category: 'regerts' },
        // Final descent
        gotcha_bitch:       { text: "GOTCHA, BITCH.",                                             category: 'final_descent' },
        negative_ghostrider:{ text: "Negative, Ghostrider. You are not clear for logic.",        category: 'final_descent' }
    };

    // ─── State ──────────────────────────────────────────────────────────
    const state = {
        enabled: true,
        rate: 1.0,
        pitch: 1.0,
        volume: 0.7,
        currentCategory: null,
        currentEndTime: 0,
        chosenVoice: null,
        playedCount: 0,
        lastFiredAt: 0,
        // Throttling — don't fire trade_signals more than once per N seconds
        minIntervalByCategory: {
            boot_intro:    0,
            final_descent: 0,
            regerts:       2000,
            trade_signals: 4000,
            commentary:    8000
        },
        lastFireByCategory: {}
    };

    // ─── Voice Picker ───────────────────────────────────────────────────
    function pickVoice() {
        if (!('speechSynthesis' in window)) return null;
        const voices = window.speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return null;
        const preferred = voices.find(v => /en[-_]us/i.test(v.lang) && /male|alex|fred|daniel|david/i.test(v.name)) ||
                          voices.find(v => /en[-_]us/i.test(v.lang)) ||
                          voices.find(v => v.lang && v.lang.startsWith('en')) ||
                          voices[0];
        state.chosenVoice = preferred || null;
        return state.chosenVoice;
    }

    // ─── Priority Gate ──────────────────────────────────────────────────
    function canPlay(category) {
        const now = Date.now();
        // Throttle per category
        const minInterval = state.minIntervalByCategory[category] || 0;
        const lastFire = state.lastFireByCategory[category] || 0;
        if (now - lastFire < minInterval) return false;

        // Priority preemption: don't interrupt higher-priority currently playing
        if (state.currentCategory && now < state.currentEndTime) {
            const currentPrio = CATEGORY_PRIORITY[state.currentCategory] || 99;
            const newPrio = CATEGORY_PRIORITY[category] || 99;
            if (newPrio > currentPrio) return false;   // lower priority = larger number
        }
        return true;
    }

    // ─── Speak ──────────────────────────────────────────────────────────
    function speak(text, category) {
        if (!state.enabled) return;
        if (!('speechSynthesis' in window)) return;
        try {
            const u = new SpeechSynthesisUtterance(text);
            u.rate = state.rate;
            u.pitch = state.pitch;
            u.volume = state.volume;
            if (!state.chosenVoice) pickVoice();
            if (state.chosenVoice) u.voice = state.chosenVoice;
            // Cancel the current speech if we're preempting
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);

            const estDuration = Math.max(1000, text.length * 70);  // rough ms estimate
            state.currentCategory = category;
            state.currentEndTime = Date.now() + estDuration;
            state.playedCount++;
            state.lastFiredAt = Date.now();
            state.lastFireByCategory[category] = state.lastFiredAt;

            u.onend = () => {
                if (state.currentCategory === category) {
                    state.currentCategory = null;
                    state.currentEndTime = 0;
                }
            };
        } catch (_) { /* swallow */ }
    }

    // ─── play(key) — public entry ───────────────────────────────────────
    function play(key, options) {
        const line = VOICE_LIB[key];
        if (!line) return false;
        if (!canPlay(line.category)) return false;
        speak(line.text, line.category);
        return true;
    }

    function playRandomFromCategory(category) {
        const keys = Object.keys(VOICE_LIB).filter(k => VOICE_LIB[k].category === category);
        if (keys.length === 0) return false;
        // Deterministic-ish pick (timestamp-seeded, avoids true Math.random)
        const idx = Date.now() % keys.length;
        return play(keys[idx]);
    }

    // ─── Bus Subscribers ────────────────────────────────────────────────
    function onAlert(payload) {
        if (!payload) return;
        // Entry alerts → trade_signals voice line
        if (payload.type === 'info' && payload.metadata && (payload.metadata.action === 'BUY' || payload.metadata.action === 'SELL_SHORT')) {
            const key = payload.metadata.action === 'SELL_SHORT' ? 'short_engaged' : 'bird_deployed';
            play(key);
        }
    }

    function onWin(_payload) {
        play('trade_sent');
    }

    function onLoss(payload) {
        // LossRecovery already speaks on every loss — VoiceManager only fires
        // an extra "I warned you" / commentary line every ~5 losses to add
        // texture without spamming.
        const streak = (payload && payload.streakLoss) || 1;
        if (streak > 0 && streak % 5 === 0) {
            playRandomFromCategory('commentary');
        }
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const api = {
        init() {
            try {
                if ('speechSynthesis' in window) {
                    pickVoice();
                    if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
                        window.speechSynthesis.onvoiceschanged = pickVoice;
                    }
                }
                (function bindBus() {
                    if (!OGZ.bus) { setTimeout(bindBus, 100); return; }
                    OGZ.bus.on('celebration:alert', onAlert);
                    OGZ.bus.on('celebration:win',   onWin);
                    OGZ.bus.on('celebration:loss',  onLoss);
                })();
            } catch (_) { /* swallow */ }
        },
        play,
        playRandomFromCategory,
        setEnabled(v) { state.enabled = !!v; if (!v) try { window.speechSynthesis.cancel(); } catch (_) {} },
        setRate(r)    { state.rate   = Math.max(0.5, Math.min(2.0, Number(r) || 1.0)); },
        setPitch(p)   { state.pitch  = Math.max(0.5, Math.min(2.0, Number(p) || 1.0)); },
        setVolume(v)  { state.volume = Math.max(0,   Math.min(1.0, Number(v) || 0.7)); },
        teardown() {
            try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (_) {}
        },
        _compute() {
            return {
                enabled: state.enabled,
                playedCount: state.playedCount,
                rate: state.rate,
                pitch: state.pitch,
                volume: state.volume,
                voice: state.chosenVoice ? state.chosenVoice.name : null,
                currentCategory: state.currentCategory,
                libSize: Object.keys(VOICE_LIB).length
            };
        }
    };

    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('VoiceManager', api);
    } else if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('VoiceManager', api);
            }
        });
    }
    try { window.OGZVoiceManager = api; } catch (_) {}
})(window.OGZ = window.OGZ || {});
