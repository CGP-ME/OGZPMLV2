/**
 * victory-animations.js — VictoryAnimations: programmatic celebration audio
 *
 * Synthesizes celebration sounds via Web Audio API on demand — NO external
 * audio files required. Ships zero MB of assets. Subscribes to OGZ.bus
 * 'celebration:win' events (emitted by CustomAlerts on profitable closes)
 * and plays the appropriate fanfare based on P&L magnitude.
 *
 * Sound bank (all synthesized at play-time):
 *   - smallWin    → 800→1200Hz coin chime (~$0–$50 wins)
 *   - mediumWin   → C-E-G-C arpeggio level-up (~$50–$250 wins)
 *   - bigWin      → 3-stage fanfare with sweep (~$250+ wins)
 *   - milestone   → triumphant chord stack (milestone tier crossings)
 *
 * Honest behavior: silent until first user interaction (Web Audio policy in
 * Chrome / Safari requires gesture before AudioContext.resume()). After
 * first click/keypress anywhere, audio engine is armed for the session.
 *
 * Self-registers as OGZ.VictoryAnimations.
 * Subscribes to OGZ.bus 'celebration:win'.
 *
 * Public API:
 *   init() — wire bus listener, prep audio context
 *   play(type) — manual trigger ('smallWin' | 'mediumWin' | 'bigWin' | 'milestone')
 *   setVolume(0..1) — adjust master gain
 *   toggle() — mute/unmute
 *   teardown()
 *   _compute() — debug snapshot
 *
 * @module public/js/panels/victory-animations
 */
(function (OGZ) {
    'use strict';

    // ─── State ──────────────────────────────────────────────────────────
    const state = {
        audioContext: null,
        masterGain: null,
        enabled: true,
        volume: 0.55,
        unlocked: false,
        winsPlayed: 0
    };

    // P&L bands → sound type
    const WIN_TIERS = [
        { min: 250,  type: 'bigWin' },
        { min: 50,   type: 'mediumWin' },
        { min: 0,    type: 'smallWin' }
    ];

    // ─── Audio Context Bootstrap (gesture-gated for browser policy) ─────
    function getCtx() {
        if (state.audioContext) return state.audioContext;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        state.audioContext = new Ctx();
        state.masterGain = state.audioContext.createGain();
        state.masterGain.gain.value = state.volume;
        state.masterGain.connect(state.audioContext.destination);
        return state.audioContext;
    }

    function unlockOnGesture() {
        if (state.unlocked) return;
        const unlock = () => {
            const ctx = getCtx();
            if (ctx && ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }
            state.unlocked = true;
            window.removeEventListener('click', unlock);
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('touchstart', unlock);
        };
        window.addEventListener('click', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
        window.addEventListener('touchstart', unlock, { once: true });
    }

    // ─── Sound Primitives ───────────────────────────────────────────────
    function tone(freq, startTime, duration, options) {
        const ctx = getCtx();
        if (!ctx) return;
        const opts = options || {};
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = opts.type || 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        if (opts.sweepTo) {
            osc.frequency.exponentialRampToValueAtTime(opts.sweepTo, startTime + duration);
        }
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(opts.peak || 0.3, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.connect(gain);
        gain.connect(state.masterGain);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.05);
    }

    function chord(freqs, startTime, duration, options) {
        freqs.forEach(f => tone(f, startTime, duration, options));
    }

    // ─── Sound Bank ─────────────────────────────────────────────────────
    function playSmallWin() {
        const ctx = getCtx();
        if (!ctx || !state.enabled) return;
        const t = ctx.currentTime;
        // Quick coin-chime: 800Hz → 1200Hz sweep
        tone(800, t, 0.18, { type: 'sine', sweepTo: 1200, peak: 0.35 });
        tone(1600, t + 0.05, 0.12, { type: 'triangle', peak: 0.15 });
    }

    function playMediumWin() {
        const ctx = getCtx();
        if (!ctx || !state.enabled) return;
        const t = ctx.currentTime;
        // C-E-G-C arpeggio
        const notes = [523.25, 659.25, 783.99, 1046.50];  // C5 E5 G5 C6
        notes.forEach((freq, i) => {
            tone(freq, t + i * 0.08, 0.25, { type: 'triangle', peak: 0.28 });
        });
    }

    function playBigWin() {
        const ctx = getCtx();
        if (!ctx || !state.enabled) return;
        const t = ctx.currentTime;
        // 3-stage fanfare: opener chord, sweep up, triumph chord
        // Stage 1: C major opener
        chord([523.25, 659.25, 783.99], t, 0.25, { type: 'sawtooth', peak: 0.22 });
        // Stage 2: ascending sweep
        tone(523.25, t + 0.25, 0.3, { type: 'square', sweepTo: 1046.5, peak: 0.2 });
        // Stage 3: triumph chord (C major + octave + fifth above)
        chord([523.25, 659.25, 783.99, 1046.50, 1318.51], t + 0.55, 0.6, { type: 'triangle', peak: 0.3 });
    }

    function playMilestone() {
        const ctx = getCtx();
        if (!ctx || !state.enabled) return;
        const t = ctx.currentTime;
        // Milestone chord: rich stacked fifths over 1.2s
        // F major triad → C major triad → high octave finish
        chord([349.23, 440.00, 523.25], t, 0.4, { type: 'sawtooth', peak: 0.18 });
        chord([523.25, 659.25, 783.99], t + 0.4, 0.4, { type: 'sawtooth', peak: 0.22 });
        chord([1046.50, 1318.51, 1567.98], t + 0.8, 0.5, { type: 'triangle', peak: 0.28 });
    }

    // ─── Dispatch by Win Tier ───────────────────────────────────────────
    function play(type) {
        if (!state.enabled) return;
        switch (type) {
            case 'smallWin':  playSmallWin();  break;
            case 'mediumWin': playMediumWin(); break;
            case 'bigWin':    playBigWin();    break;
            case 'milestone': playMilestone(); break;
            default:          playSmallWin();
        }
        state.winsPlayed++;
    }

    function tierForPnl(pnl) {
        const abs = Math.abs(Number(pnl) || 0);
        for (const t of WIN_TIERS) {
            if (abs >= t.min) return t.type;
        }
        return 'smallWin';
    }

    // ─── Bus Listener — CustomAlerts emits 'celebration:win' on profit close
    function onWin(payload) {
        try {
            if (!payload) return;
            const tier = tierForPnl(payload.pnl);
            play(tier);
        } catch (_) { /* swallow */ }
    }

    function onMilestone(_payload) {
        // The MilestoneEffects module owns tier decisions; we just play the
        // milestone sound when it tells us. (MilestoneEffects will emit a
        // dedicated 'celebration:milestone-hit' event when an actual tier
        // crossing fires — distinct from the per-state_update 'celebration:milestone'
        // heartbeat which just carries the running balance.)
        play('milestone');
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const api = {
        init() {
            try {
                unlockOnGesture();
                // Subscribe via OGZ.bus once it exists (CustomAlerts creates it on init)
                (function bindBus() {
                    if (!OGZ.bus) { setTimeout(bindBus, 100); return; }
                    OGZ.bus.on('celebration:win', onWin);
                    OGZ.bus.on('celebration:milestone-hit', onMilestone);
                })();
            } catch (_) { /* swallow */ }
        },
        play,
        setVolume(v) {
            state.volume = Math.max(0, Math.min(1, Number(v) || 0));
            if (state.masterGain) state.masterGain.gain.value = state.volume;
        },
        toggle() {
            state.enabled = !state.enabled;
            return state.enabled;
        },
        teardown() {
            try {
                if (state.audioContext && state.audioContext.close) {
                    state.audioContext.close();
                }
            } catch (_) { /* swallow */ }
            state.audioContext = null;
            state.masterGain = null;
            state.unlocked = false;
        },
        _compute() {
            return {
                enabled: state.enabled,
                volume: state.volume,
                unlocked: state.unlocked,
                winsPlayed: state.winsPlayed,
                ctxState: state.audioContext ? state.audioContext.state : 'none'
            };
        }
    };

    // ─── Registration ───────────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('VictoryAnimations', api);
    } else if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('VictoryAnimations', api);
            }
        });
    }

    try { window.OGZVictoryAnimations = api; } catch (_) {}
})(window.OGZ = window.OGZ || {});
