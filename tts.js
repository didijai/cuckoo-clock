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
        window.LearnTTS.engine       -> 'auto' | 'browser' | 'google'
        window.LearnTTS.setEngine(e) -> select 'auto' | 'browser' | 'google':
                                        auto = browser, fallback to Google;
                                        browser = browser only, silent on fail;
                                        google = Google only, silent on fail
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
    let mode = 'detecting';         // detection result: 'detecting' -> 'local' | 'google'
    let preferredEngine = 'auto';   // user selection: 'auto' | 'browser' | 'google'
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

    // True only when the browser can actually do local speech. The Google
    // fallback exists precisely for browsers where this is false.
    function hasLocalSupport() {
        try {
            return ('speechSynthesis' in window) &&
                typeof window.SpeechSynthesisUtterance === 'function' &&
                !!window.speechSynthesis &&
                typeof window.speechSynthesis.speak === 'function';
        } catch (e) {
            return false;
        }
    }

    /* ------------------------------------------------------------------
     * One-time audible probe (keygame's probeTTS). Speak a near-inaudible
     * blip; if `onstart` fires the local engine truly works, else fall back
     * to Google permanently. Returns a Promise resolving to 'local'/'google'
     * so the caller can await it before the first real utterance.
     * ------------------------------------------------------------------ */
    function probe() {
        if (!hasLocalSupport()) {
            mode = 'google';
            probed = true;
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
     * When `allowFallback` is false (Browser-only engine), a local error
     * produces NO sound instead of falling back to Google.
     * ------------------------------------------------------------------ */
    function speakLocal(text, allowFallback) {
        if (allowFallback === undefined) allowFallback = (preferredEngine === 'auto');
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

            u.onerror = () => {
                if (allowFallback) {
                    mode = 'google';
                    speakGoogle(text);
                }
                // Browser-only: no fallback, no sound.
            };

            window.speechSynthesis.speak(u);
            return true;
        } catch (e) {
            console.warn('[LearnTTS] local speak failed, falling back to Google:', e);
            return false;
        }
    }

    /* ------------------------------------------------------------------
     * Google fallback path: translate_tts MP3 stream in an <audio>.
     * Proven pattern from test.html:
     *   <meta name="referrer" content="no-referrer" />
     *   <audio referrerpolicy="no-referrer" ...>
     *   url = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=' + encodeURIComponent(text)
     * Without the no-referrer policy the request carries a Referer and
     * Chrome blocks the opaque audio with BLOCKED_BY_ORB / 403.
     * ------------------------------------------------------------------ */
    const GOOGLE_MAX_CHUNK = 200; // Google truncates past ~200 chars
    let googleQueue = [];         // pending chunk URLs for current utterance
    let googleToken = 0;          // cancels stale queues on rapid re-speak

    function buildGoogleUrl(text) {
        // Same param order as test.html (ie, tl, client, q).
        return `${GOOGLE_TTS_BASE}?ie=UTF-8&tl=${TTS_LANG}&client=tw-ob&q=${encodeURIComponent(text)}`;
    }

    // Split long text on word/sentence boundaries so every chunk is <=200 chars.
    function chunkForGoogle(text) {
        const s = String(text).trim();
        if (s.length <= GOOGLE_MAX_CHUNK) return [s];
        const chunks = [];
        // Prefer sentence splits, then word splits.
        const sentences = s.split(/(?<=[.!?。！？])\s+/);
        let buf = '';
        const flush = () => { if (buf.trim()) chunks.push(buf.trim()); buf = ''; };
        const pushWords = (line) => {
            const words = line.split(/\s+/);
            for (const w of words) {
                if (((buf ? buf.length + 1 : 0) + w.length) > GOOGLE_MAX_CHUNK) flush();
                // Single over-long word: hard-split it.
                if (w.length > GOOGLE_MAX_CHUNK) {
                    flush();
                    for (let i = 0; i < w.length; i += GOOGLE_MAX_CHUNK) {
                        chunks.push(w.slice(i, i + GOOGLE_MAX_CHUNK));
                    }
                } else {
                    buf = buf ? buf + ' ' + w : w;
                }
            }
        };
        for (const sent of sentences) {
            if ((buf.length + 1 + sent.length) > GOOGLE_MAX_CHUNK && buf) flush();
            if (sent.length > GOOGLE_MAX_CHUNK) pushWords(sent);
            else buf = buf ? buf + ' ' + sent : sent;
        }
        flush();
        return chunks.length ? chunks : [s.slice(0, GOOGLE_MAX_CHUNK)];
    }

    function ensureAudioEl() {
        if (audioEl) return audioEl;
        // `Audio` may be unavailable in a minimal/no-media
        // environment; bail out silently rather than throw.
        if (typeof window.Audio !== 'function') return null;
        try {
            audioEl = new Audio();
            // Critical: mirror test.html's referrerpolicy="no-referrer".
            try {
                audioEl.referrerPolicy = 'no-referrer';
                audioEl.setAttribute('referrerpolicy', 'no-referrer');
            } catch (e) { /* older browsers ignore it */ }
            try { audioEl.preload = 'auto'; } catch (e) { }
            audioEl.addEventListener('ended', playNextGoogleChunk);
            audioEl.addEventListener('error', () => {
                console.warn('[LearnTTS] google audio chunk error, skipping.');
                playNextGoogleChunk();
            });
        } catch (e) {
            console.warn('[LearnTTS] cannot create Audio element:', e);
            return null;
        }
        return audioEl;
    }

    function playNextGoogleChunk() {
        const el = audioEl;
        if (!el) return;
        const next = googleQueue.shift();
        if (!next) return;
        try {
            // Setting src + load() + play() synchronously keeps the
            // user-gesture allowance whenever possible.
            el.src = next;
            try { el.load(); } catch (e) { /* load() optional */ }
            const p = el.play();
            if (p && typeof p.catch === 'function') {
                p.catch((e) => {
                    console.warn('[LearnTTS] google audio failed to play:', e);
                });
            }
        } catch (e) {
            console.warn('[LearnTTS] google chunk play threw:', e);
            // Try the following chunk so one bad chunk can't wedge the queue.
            playNextGoogleChunk();
        }
    }

    function speakGoogle(text) {
        try {
            const s = String(text == null ? '' : text).trim();
            if (!s) return false;
            const el = ensureAudioEl();
            if (!el) return false;
            // A new speak() replaces any in-flight utterance (same as before:
            // one shared <audio> so rapid clicks don't overlap).
            googleToken += 1;
            try { el.pause(); } catch (e) { }
            googleQueue = chunkForGoogle(s).map(buildGoogleUrl);
            playNextGoogleChunk();
            return true;
        } catch (e) {
            console.warn('[LearnTTS] google fallback threw:', e);
            return false;
        }
    }

    /* ------------------------------------------------------------------
     * Public entry points.
     * ------------------------------------------------------------------ */
    // Stop any in-flight speech (both engines) so switching engines or
    // issuing a new utterance never overlaps the previous one.
    function stopAll() {
        try {
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        } catch (e) { }
        try {
            googleToken += 1;
            googleQueue = [];
            if (audioEl) audioEl.pause();
        } catch (e) { }
    }

    // Set the user-selected engine:
    //   'auto'    -> browser TTS, fall back to Google on failure (default)
    //   'browser' -> browser TTS only, no sound on failure
    //   'google'  -> Google TTS only, no sound on failure
    function setEngine(engine) {
        const next = String(engine || 'auto').toLowerCase();
        if (next !== 'auto' && next !== 'browser' && next !== 'google') return preferredEngine;
        if (next === preferredEngine) return preferredEngine;
        preferredEngine = next;
        stopAll();
        if (next === 'google') {
            mode = 'google';
            probed = true;
        } else if (next === 'browser') {
            // Re-probe local on next speak/init so a previous Google
            // fallback doesn't stick when the user forces Browser-only.
            if (mode === 'google' && hasLocalSupport()) {
                mode = 'detecting';
                probed = false;
                probePromise = null;
            }
        } else {
            // Back to Auto: re-run detection if we had locked to Google
            // without ever proving local is broken (e.g. after Google-only).
            if (probed && mode === 'google' && hasLocalSupport()) {
                refreshVoiceState();
                if (voices.length > 0) {
                    mode = 'detecting';
                    probed = false;
                    probePromise = null;
                }
            }
        }
        return preferredEngine;
    }

    // Run the probe now (inside a user gesture). Idempotent.
    // Google-only skips the local probe entirely.
    function init() {
        if (preferredEngine === 'google') return Promise.resolve('google');
        return probe();
    }

    // Speak `text` honoring the selected engine. On the very first call
    // the engine is unresolved, so we await the probe (a one-time blip)
    // before the first real utterance. After that, mode is cached and
    // speech is synchronous.
    // Exception: browsers with NO local engine go straight to Google
    // synchronously (Auto) so audio.play() stays inside the user gesture
    // (else autoplay policy blocks the async .then() playback). In
    // Browser-only mode the same browsers produce no sound by design.
    function speak(text) {
        if (!text) return;
        try {
            // Google-only: never touch speechSynthesis.
            if (preferredEngine === 'google') {
                speakGoogle(text);
                return;
            }

            const browserOnly = (preferredEngine === 'browser');

            if (!hasLocalSupport()) {
                mode = 'google';
                probed = true;
                if (browserOnly) return; // Browser-only: no sound, no fallback
                speakGoogle(text);
                return;
            }

            refreshVoiceState();

            if (mode === 'detecting') {
                probe().then(() => {
                    if (mode === 'local') {
                        const ok = speakLocal(text, !browserOnly);
                        if (!ok && !browserOnly) speakGoogle(text);
                    }
                    else if (!browserOnly) speakGoogle(text);
                    // Browser-only + probe failed -> no sound by design.
                });
                return;
            }

            if (mode === 'local') {
                const ok = speakLocal(text, !browserOnly);
                if (!ok && !browserOnly) speakGoogle(text);
            }
            else if (!browserOnly) speakGoogle(text);
            // Browser-only + mode google -> no sound by design.
        } catch (e) {
            // Speech must NEVER take down the surrounding UI.
            console.warn('[LearnTTS] speak threw:', e);
            if (preferredEngine === 'auto') {
                try { speakGoogle(text); } catch (e2) { /* ignore */ }
            }
            // Browser/Google-only: no fallback, no sound.
        }
    }

    window.LearnTTS = {
        speak,
        init,
        setEngine,
        stop: stopAll,
        get mode() { return mode; },
        get engine() { return preferredEngine; }
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