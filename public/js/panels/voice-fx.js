/**
 * voice-fx.js — VoiceFXSystem: Web Audio reactive accent FX engine
 *
 * Plays short synthesized "feel" sounds tied to emotion presets. Designed to
 * fire ALONGSIDE the celebration toasts, victory sounds, and voice lines —
 * adding a third audio layer (ambient texture) that gives the dashboard a
 * sense of "alive reactivity." Not for routing speech (the Web Audio API
 * can't intercept speechSynthesis output in most browsers). Pure synthesized
 * accent tones with per-emotion reverb/delay/filter color.
 *
 * 5 presets (carried from the original VoiceFXSystem.js):
 *   profit   — bright reverb, light delay, high pitch, high excitement
 *   loss     — short reverb, no delay, low pitch, low excitement
 *   warning  — medium reverb, short delay, medium pitch, medium excitement
 *   epic     — long reverb, long delay, balanced pitch, max excitement
 *   calm     — short reverb, no delay, neutral pitch, low excitement
 *
 * Subscribes to OGZ.bus:
 *   - 'celebration:win'             → profit (or epic if pnl > $250)
 *   - 'celebration:loss'            → loss
 *   - 'celebration:milestone-hit'   → epic
 *
 * Public API:
 *   init()
 *   playEffect(preset) — manual trigger
 *   setVolume(0..1)
 *   setEnabled(bool)
 *   teardown()
 *   _compute()
 *
 * @module public/js/panels/voice-fx
 */
(function (OGZ) {
    'use strict';

    // Emotion preset definitions (from original VoiceFXSystem.js)
    const PRESETS = {
        profit:  { reverb: 0.35, delay: 0.12, pitch: 1.20, excitement: 0.80, tone: 880,  color: '#22c55e' },
        loss:    { reverb: 0.12, delay: 0.00, pitch: 0.80, excitement: 0.30, tone: 220,  color: '#ef4444' },
        warning: { reverb: 0.22, delay: 0.06, pitch: 0.90, excitement: 0.60, tone: 440,  color: '#fbbf24' },
        epic:    { reverb: 0.55, delay: 0.22, pitch: 1.10, excitement: 1.00, tone: 660,  color: '#a78bfa' },
        calm:    { reverb: 0.10, delay: 0.00, pitch: 1.00, excitement: 0.20, tone: 330,  color: '#60a5fa' }
    };

    // ─── State ──────────────────────────────────────────────────────────
    const state = {
        ctx: null,
        masterGain: null,
        reverb: null,           // ConvolverNode
        delay: null,            // DelayNode
        delayFeedback: null,    // GainNode
        filter: null,           // BiquadFilterNode
        volume: 0.5,
        enabled: true,
        unlocked: false,
        effectsPlayed: 0
    };

    // ─── Context Init (gesture-gated) ───────────────────────────────────
    function getCtx() {
        if (state.ctx) return state.ctx;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        state.ctx = new Ctx();
        state.masterGain = state.ctx.createGain();
        state.masterGain.gain.value = state.volume;

        // Effects chain
        state.reverb = state.ctx.createConvolver();
        state.reverb.buffer = makeReverbImpulse(state.ctx, 1.6, 2.4);

        state.delay = state.ctx.createDelay(1.0);
        state.delay.delayTime.value = 0.22;
        state.delayFeedback = state.ctx.createGain();
        state.delayFeedback.gain.value = 0.32;
        state.delay.connect(state.delayFeedback);
        state.delayFeedback.connect(state.delay);

        state.filter = state.ctx.createBiquadFilter();
        state.filter.type = 'highpass';
        state.filter.frequency.value = 90;

        // Routing: voice → filter → reverb / delay / dry → master → out
        state.filter.connect(state.reverb);
        state.filter.connect(state.delay);
        state.reverb.connect(state.masterGain);
        state.delay.connect(state.masterGain);
        state.masterGain.connect(state.ctx.destination);

        return state.ctx;
    }

    function makeReverbImpulse(ctx, durationSec, decay) {
        const rate = ctx.sampleRate;
        const length = Math.max(1, Math.floor(rate * durationSec));
        const impulse = ctx.createBuffer(2, length, rate);
        // Synth impulse response — no Math.random. Deterministic decaying noise
        // generated with a small LCG so the reverb tail is the same every time.
        let lcg = 1337;
        for (let ch = 0; ch < 2; ch++) {
            const data = impulse.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                lcg = (lcg * 1103515245 + 12345) & 0x7fffffff;
                const noise = (lcg / 0x7fffffff) * 2 - 1;
                data[i] = noise * Math.pow(1 - i / length, decay);
            }
        }
        return impulse;
    }

    function unlockOnGesture() {
        if (state.unlocked) return;
        const unlock = () => {
            const ctx = getCtx();
            if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
            state.unlocked = true;
            window.removeEventListener('click', unlock);
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('touchstart', unlock);
        };
        window.addEventListener('click', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
        window.addEventListener('touchstart', unlock, { once: true });
    }

    // ─── Effect Synth ───────────────────────────────────────────────────
    function playEffect(presetKey) {
        if (!state.enabled) return;
        const preset = PRESETS[presetKey];
        if (!preset) return;
        const ctx = getCtx();
        if (!ctx) return;

        const t = ctx.currentTime;
        const baseFreq = preset.tone * preset.pitch;
        const duration = 0.35 + (preset.excitement * 0.55);

        // Main accent tone
        const osc = ctx.createOscillator();
        osc.type = preset.excitement > 0.6 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(baseFreq, t);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * (preset.excitement > 0.5 ? 1.4 : 0.85), t + duration);

        // Per-shot envelope (no audible click)
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(0.35 * preset.excitement + 0.05, t + 0.04);
        env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

        // Wet/dry mix routing
        const wetReverb = ctx.createGain();
        wetReverb.gain.value = preset.reverb;
        const wetDelay = ctx.createGain();
        wetDelay.gain.value = preset.delay;
        const dry = ctx.createGain();
        dry.gain.value = Math.max(0.2, 1.0 - preset.reverb - preset.delay);

        osc.connect(env);
        env.connect(state.filter);     // through filter chain into reverb/delay sends
        env.connect(dry);              // dry path
        dry.connect(state.masterGain);

        // The filter already connects to reverb + delay; we modulate their levels here
        state.reverb.connect(wetReverb);
        wetReverb.connect(state.masterGain);
        state.delay.connect(wetDelay);
        wetDelay.connect(state.masterGain);

        osc.start(t);
        osc.stop(t + duration + 0.2);

        // Cleanup wet sends after the tail
        setTimeout(() => {
            try { wetReverb.disconnect(); } catch (_) {}
            try { wetDelay.disconnect(); }  catch (_) {}
            try { dry.disconnect(); }       catch (_) {}
            try { env.disconnect(); }       catch (_) {}
        }, (duration + 1.0) * 1000);

        state.effectsPlayed++;
    }

    // ─── Bus Subscribers ────────────────────────────────────────────────
    function onWin(payload) {
        const pnl = payload && Math.abs(Number(payload.pnl) || 0);
        playEffect(pnl >= 250 ? 'epic' : 'profit');
    }
    function onLoss(_payload)     { playEffect('loss'); }
    function onMilestone(_payload){ playEffect('epic'); }

    // ─── Public API ─────────────────────────────────────────────────────
    const api = {
        init() {
            try {
                unlockOnGesture();
                (function bindBus() {
                    if (!OGZ.bus) { setTimeout(bindBus, 100); return; }
                    OGZ.bus.on('celebration:win',           onWin);
                    OGZ.bus.on('celebration:loss',          onLoss);
                    OGZ.bus.on('celebration:milestone-hit', onMilestone);
                })();
            } catch (_) { /* swallow */ }
        },
        playEffect,
        setVolume(v) {
            state.volume = Math.max(0, Math.min(1, Number(v) || 0));
            if (state.masterGain) state.masterGain.gain.value = state.volume;
        },
        setEnabled(v) { state.enabled = !!v; },
        teardown() {
            try { if (state.ctx && state.ctx.close) state.ctx.close(); } catch (_) {}
            state.ctx = null;
            state.unlocked = false;
        },
        _compute() {
            return {
                enabled: state.enabled,
                volume: state.volume,
                unlocked: state.unlocked,
                effectsPlayed: state.effectsPlayed,
                ctxState: state.ctx ? state.ctx.state : 'none'
            };
        }
    };

    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('VoiceFX', api);
    } else if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('VoiceFX', api);
            }
        });
    }
    try { window.OGZVoiceFX = api; } catch (_) {}
})(window.OGZ = window.OGZ || {});
