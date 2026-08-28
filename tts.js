/* ==========================================================================
   TTS module — separate, self-contained text-to-speech helper for the Learn
   panel (and any future module that wants "read this aloud").

   Following the proven approach in keygame/script.js `AudioController`:
     - Voices are PRELOADED asynchronously at load time (getVoices() +
       `voiceschanged` + a grace timer), so they are ready before the first
       real utterance. This is what avoids the "first sound is male/different"
       bug: the female voice is resolved once, up front, never per-speak.
     - A one-time audible probe verifies the engine actually STARTS (some
       systems list voices but are silently broken); if it fails, we fall back
       to Google translate_tts for the whole session.
     - The engine choice is cached; real speech never re-probes or re-picks a
       voice on every click.

   API:
       window.LearnTTS.speak(text)   -> speaks `text` with the best engine
       window.LearnTTS.mode         -> 'detecting' | 'local' | 'google'
       window.LearnTTS.init()       -> run the one-time local-TTS probe now
                                        (call inside the FIRST user gesture so
                                        the browser permits speech).
   ========================================================================== */

(function () {
    'use strict';

    // Google fallback endpoint. `q` is the text, `tl` the language.
    const GOOGLE_TTS_BASE = 'https://translate.google.com/translate_tts';
    const TTS_LANG = 'en'; // default spoken language (question + answer)

    // One shared <audio> so rapid successive speaks replace the previous clip.
    let audioEl = null;

    // Engine + voice state. Key point (from keygame): the preferred female
    // voice is resolved ONCE and cached, so the FIRST utterance already uses
    // it and every later one uses the identical voice.
    let mode = 'detecting';         // 'detecting' -> 'local' | 'google'
    let probed = false;             // has the one-time probe already run?
    let probePromise = null;        // in-flight probe promise, if any
    let voices = [];                // latest voice list from speechSynthesis
    let femaleVoice = null;         // resolved preferred voice (cached)
    let resolvedVoiceCount = -1;    // voices.length when femaleVoice was set

    /* ------------------------------------------------------------------
     * Voice list (top of the detection ladder).
     * ------------------------------------------------------------------ */
    function refreshVoiceState() {
        try {
            voices = ('speechSynthesis' in window)
                ? window.speechSynthesis.getVoices()
                : [];
        } catch (e) {
            // A broken speechSynthesis.getVoices() must not throw; treat as
            // "no voices" so the flow falls back to Google cleanly.
            voices = [];
        }
    }

    // Resolve the preferred (female) English voice from the current list.
    // Cached: only re-resolves when the list actually changes size (voices
    // load asynchronously, so an early partial list must not lock us to the
    // browser's default/male voice for the whole session).
    function getPreferredVoice() {
        if (femaleVoice && voices.length === resolvedVoiceCount) {
            return femaleVoice;
        }
        if (voices.length === 0) return null;

        femaleVoice = voices.find(v =>
            v.name.includes('Female') ||
            v.name.includes('Google US English') ||
            v.name.includes('Samantha') ||
            v.name.includes('Zira') ||
            v.name.includes('Karen') ||
            v.name.includes('Aria') ||
            v.name.includes('Jenny')
        ) || voices.find(v => /en(-|_)/i.test(v.lang)) || null;

        resolvedVoiceCount = voices.length;
        return femaleVoice;
    }

    /* ------------------------------------------------------------------
     * One-time audible probe (keygame's probeTTS). Speak a near-inaudible
     * blip; if `onstart` fires the local engine truly works, else fall back
     * to Google permanently. Returns a Promise resolving to 'local'/'google'
     * so the caller can await it before the first real utterance.
     * ------------------------------------------------------------------ */
    function probe() {
        if (!('speechSynthesis' in window)) {
            mode = 'google';
            return Promise.resolve('google');
        }
        if (probed) {
            if (probePromise) return probePromise;
            return Promise.resolve(mode);
        }

        refreshVoiceState();
        if (voices.length === 0) {
            mode = 'google';
            probed = true;
            return Promise.resolve('google');
        }

        probed = true;

        probePromise = new Promise((resolve) => {
            let settled = false;
            const settle = (next) => {
                if (settled) return;
                settled = true;
                mode = next;
                probePromise = null;
                console.info('[LearnTTS] local engine:', next);
                resolve(next);
            };

            try {
                const u = new SpeechSynthesisUtterance('');
                u.lang = 'en-US';
                u.volume = 0.03;
                u.rate = 2;
                const v = getPreferredVoice();
                if (v) u.voice = v;
                u.onstart = () => settle('local');
                u.onerror = () => settle('google');
                window.speechSynthesis.speak(u);

                setTimeout(() => {
                    if (!settled) {
                        try { window.speechSynthesis.cancel(); } catch (e) { }
                        settle('google');
                    }
                }, 350);
            } catch (e) {
                console.warn('[LearnTTS] probe threw:', e);
                settle('google');
            }
        });

        return probePromise;
    }

    /* ------------------------------------------------------------------
     * Local TTS path: SpeechSynthesis, using the cached preferred voice.
     * ------------------------------------------------------------------ */
    function speakLocal(text) {
        if (!('speechSynthesis' in window)) return false;

        // Guard against engines where speechSynthesis exists but the
        // SpeechSynthesisUtterance constructor or .speak() is missing/
        // broken (seen on some embedded/minimal browsers). Instead of
        // letting an exception escape and break the page, fall back to
        // Google below.
        try {
            if (typeof window.SpeechSynthesisUtterance !== 'function') return false;

            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'en-US';
            u.rate = 0.8; // slightly slower than default — kid-friendly

            const v = getPreferredVoice();
            if (v) u.voice = v;

            u.onerror = () => { mode = 'google'; speakGoogle(text); };

            window.speechSynthesis.speak(u);
            return true;
        } catch (e) {
            console.warn('[LearnTTS] local speak failed, falling back to Google:', e);
            return false;
        }
    }

    /* ------------------------------------------------------------------
     * Google fallback path: translate_tts MP3 stream in an <audio>.
     * ------------------------------------------------------------------ */
    function speakGoogle(text) {
        try {
            const url = `${GOOGLE_TTS_BASE}?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${TTS_LANG}&client=tw-ob`;
            if (!audioEl) {
                // `Audio` may be unavailable in a minimal/no-media
                // environment; bail out silently rather than throw.
                if (typeof window.Audio !== 'function') return false;
                audioEl = new Audio();
            }
            audioEl.src = url;
            const p = audioEl.play();
            if (p && typeof p.catch === 'function') {
                p.catch((e) => {
                    console.warn('[LearnTTS] google audio failed to play:', e);
                });
            }
            return true;
        } catch (e) {
            console.warn('[LearnTTS] google fallback threw:', e);
            return false;
        }
    }

    /* ------------------------------------------------------------------
     * Public entry points.
     * ------------------------------------------------------------------ */
    // Run the probe now (inside a user gesture). Idempotent.
    function init() {
        return probe();
    }

    // Speak `text`. On the very first call the engine is unresolved, so we
    // await the probe (a one-time blip) before the first real utterance.
    // After that, mode is cached and speech is synchronous.
    function speak(text) {
        if (!text) return;
        try {
            refreshVoiceState();

            if (mode === 'detecting') {
                probe().then(() => {
                    if (mode === 'local') speakLocal(text);
                    else speakGoogle(text);
                });
                return;
            }

            if (mode === 'local') speakLocal(text);
            else speakGoogle(text);
        } catch (e) {
            // Speech must NEVER take down the surrounding UI. On any
            // unexpected error just attempt the Google fallback once.
            console.warn('[LearnTTS] speak threw, attempting google fallback:', e);
            try { speakGoogle(text); } catch (e2) { /* ignore */ }
        }
    }

    window.LearnTTS = {
        speak,
        init,
        get mode() { return mode; }
    };

    // Preload voices asynchronously (keygame's constructor-time preload).
    // `voiceschanged` + grace timers catch the browsers that populate voices
    // late, so the preferred (female) voice is resolved before first use.
    if ('speechSynthesis' in window) {
        try {
            refreshVoiceState();
            window.speechSynthesis.addEventListener('voiceschanged', refreshVoiceState);
            setTimeout(refreshVoiceState, 500);
            setTimeout(refreshVoiceState, 1500);
        } catch (e) {
            // Voice preloading is best-effort only; a broken speechSynthesis
            // must not prevent the Google fallback from being usable later.
            console.warn('[LearnTTS] voice preload failed:', e);
        }
    }
})();