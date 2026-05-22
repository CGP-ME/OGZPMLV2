/**
 * loss-recovery.js — LossRecovery: roast/encourage emotional counter-layer
 *
 * The honest other half of the celebration loop. Subscribes to OGZ.bus
 * 'celebration:loss' (emitted by CustomAlerts on losing closes) and either
 * roasts you (1–2 loss streak — cathartic) or encourages you (3+ — supportive)
 * via the Web Speech API. Smart psychology: short losses get the trash-talk
 * release valve; sustained losses get the human reminder of what you're
 * actually fighting for.
 *
 * Self-registers as OGZ.LossRecovery.
 * Subscribes to OGZ.bus 'celebration:loss'.
 * Emits OGZ.bus 'celebration:loss-message' { tone, text, streakLoss } for
 * downstream renderers (e.g. a chain-of-thought banner could pick it up).
 *
 * NO synthetic events. Messages only fire when a real bot loss is broadcast.
 * Voice is opt-out (defaults on, toggle via setVoiceEnabled).
 *
 * Public API:
 *   init()
 *   processLoss(payload) — manual trigger
 *   setVoiceEnabled(bool) — mute/unmute speech
 *   pickMessage(streakLoss) — get next message without firing
 *   teardown()
 *   _compute()
 *
 * @module public/js/panels/loss-recovery
 */
(function (OGZ) {
    'use strict';

    // ─── Message Banks (preserved from the Mover stack, browser-adapted) ─
    // Roast bank — fires on streak 1–2. Cathartic small-loss release.
    const ROASTS = [
        "Bro really thought that was the play? Even my calculator is laughing.",
        "That trade was so bad, your daughter's goldfish could've called it better.",
        "Houston just got 10 miles further away with that one, chief.",
        "I've seen better decisions at 3am Taco Bell.",
        "Your pattern recognition looking like a Jackson Pollock painting right now.",
        "That wasn't trading, that was charity work for the market makers.",
        "Even the simulation mode is embarrassed for you.",
        "Sir, this is a Wendy's. And you still managed to lose money.",
        "That trade had more red flags than a parade.",
        "Congratulations, you just funded someone's yacht payment."
    ];

    // Encouragement bank — fires on streak 3+. Supportive when actually struggling.
    const ENCOURAGEMENTS = [
        "Hey warrior. Losses are tuition at Market University. You're learning.",
        "Every legend has a comeback story. This is chapter one.",
        "Your daughter doesn't need a perfect trader. She needs her dad. Keep pushing.",
        "Rocky got knocked down too. It's the getting up that counts.",
        "This loss is temporary. Missing your daughter is what hurts. Let's fix both.",
        "Champions aren't made from victories. They're made from setbacks like this.",
        "Houston's still there. Your dreams are still valid. This is just a detour.",
        "You coded this whole system from scratch. This loss is nothing compared to that.",
        "Bad trades don't define you. Getting back up does. Let's go.",
        "Your future self in Houston is proud you didn't quit today."
    ];

    // Comeback bank — fires on streak 5+ (the deep grind). The fight-back energy.
    const COMEBACKS = [
        "COMEBACK MODE. Time to show these charts who's boss.",
        "From the ashes, a phoenix rises. Time to fly.",
        "Valhalla doesn't accept quitters. Only warriors.",
        "The grind continues. Houston is still locked in GPS.",
        "Five losses can't undo six years of building this. Reset."
    ];

    // Tone classification thresholds
    const STREAK_ROAST_LIMIT = 2;   // 1–2 losses → roast
    const STREAK_COMEBACK = 5;       // 5+ losses → comeback energy (still encouragement-tier)

    // ─── State ──────────────────────────────────────────────────────────
    const state = {
        voiceEnabled: true,
        voiceRate: 1.05,
        voicePitch: 1.0,
        voiceVolume: 0.85,
        chosenVoice: null,
        messagesSpoken: 0,
        recentMessages: [],     // rolling history for diagnostics
        lastFiredAt: 0
    };

    // ─── Web Speech API Init ────────────────────────────────────────────
    function pickVoice() {
        if (!('speechSynthesis' in window)) return null;
        const voices = window.speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return null;
        // Prefer en-US male if available, else any en-* voice
        const preferred = voices.find(v => /en[-_]us/i.test(v.lang) && /male|alex|fred|daniel/i.test(v.name)) ||
                          voices.find(v => /en[-_]us/i.test(v.lang)) ||
                          voices.find(v => v.lang && v.lang.startsWith('en')) ||
                          voices[0];
        state.chosenVoice = preferred || null;
        return state.chosenVoice;
    }

    function speak(text) {
        if (!state.voiceEnabled) return;
        if (!('speechSynthesis' in window)) return;
        try {
            const u = new SpeechSynthesisUtterance(text);
            u.rate = state.voiceRate;
            u.pitch = state.voicePitch;
            u.volume = state.voiceVolume;
            if (!state.chosenVoice) pickVoice();
            if (state.chosenVoice) u.voice = state.chosenVoice;
            window.speechSynthesis.cancel();   // never queue up — replace
            window.speechSynthesis.speak(u);
        } catch (_) { /* swallow */ }
    }

    // ─── Pick a Message Based on Streak ─────────────────────────────────
    function randIdx(arr) {
        // Deterministic-ish: use timestamp millis as seed — avoids true Math.random
        // while still producing varied output. Same trade timestamp would otherwise
        // collide but each loss-close has a unique ts so collisions are negligible.
        const seed = Date.now() % arr.length;
        return arr[seed];
    }

    function pickMessage(streakLoss) {
        const streak = Math.max(1, Number(streakLoss) || 1);
        if (streak <= STREAK_ROAST_LIMIT) {
            return { tone: 'roast', text: randIdx(ROASTS) };
        }
        if (streak >= STREAK_COMEBACK) {
            return { tone: 'comeback', text: randIdx(COMEBACKS) };
        }
        return { tone: 'encouragement', text: randIdx(ENCOURAGEMENTS) };
    }

    // ─── Process Loss ───────────────────────────────────────────────────
    function processLoss(payload) {
        try {
            const streak = (payload && payload.streakLoss) || 1;
            const msg = pickMessage(streak);
            speak(msg.text);

            // Track
            state.messagesSpoken++;
            state.lastFiredAt = Date.now();
            state.recentMessages.unshift({
                ts: state.lastFiredAt,
                streak,
                tone: msg.tone,
                text: msg.text
            });
            if (state.recentMessages.length > 20) state.recentMessages.length = 20;

            // Emit for any module that wants to render the text (e.g. a banner)
            if (OGZ.bus) {
                OGZ.bus.emit('celebration:loss-message', {
                    tone: msg.tone,
                    text: msg.text,
                    streakLoss: streak,
                    ts: state.lastFiredAt
                });
            }
        } catch (_) { /* swallow */ }
    }

    // ─── Public API ─────────────────────────────────────────────────────
    const api = {
        init() {
            try {
                // Pre-load voice list (some browsers populate async)
                if ('speechSynthesis' in window) {
                    pickVoice();
                    if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
                        window.speechSynthesis.onvoiceschanged = pickVoice;
                    }
                }
                // Subscribe via OGZ.bus once it exists
                (function bindBus() {
                    if (!OGZ.bus) { setTimeout(bindBus, 100); return; }
                    OGZ.bus.on('celebration:loss', processLoss);
                })();
            } catch (_) { /* swallow */ }
        },
        processLoss,
        pickMessage,
        setVoiceEnabled(v) { state.voiceEnabled = !!v; },
        setVoiceRate(r) { state.voiceRate = Math.max(0.5, Math.min(2.0, Number(r) || 1.05)); },
        setVoicePitch(p) { state.voicePitch = Math.max(0.5, Math.min(2.0, Number(p) || 1.0)); },
        teardown() {
            try {
                if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            } catch (_) { /* swallow */ }
            state.recentMessages.length = 0;
        },
        _compute() {
            return {
                voiceEnabled: state.voiceEnabled,
                messagesSpoken: state.messagesSpoken,
                lastFiredAt: state.lastFiredAt,
                chosenVoice: state.chosenVoice ? state.chosenVoice.name : null,
                recentMessagesCount: state.recentMessages.length
            };
        }
    };

    // ─── Registration ───────────────────────────────────────────────────
    if (OGZ && typeof OGZ.register === 'function') {
        OGZ.register('LossRecovery', api);
    } else if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.OGZ && typeof window.OGZ.register === 'function') {
                window.OGZ.register('LossRecovery', api);
            }
        });
    }

    try { window.OGZLossRecovery = api; } catch (_) {}
})(window.OGZ = window.OGZ || {});
