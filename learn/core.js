/* ==========================================================================
 * Learn Core — shared state, registry, cache and question lifecycle.
 *
 * Part of the modular Learn panel (see learn/ folder):
 *   core.js            -> this file: REGISTRY, selection state, 1-hour
 *                         localStorage cache, generator registry.
 *   math-level1.js     -> registers Math Level 1 generator.
 *   english-level1.js  -> registers English Level 1 generator (K3 stories).
 *   ui.js              -> rendering, TTS wiring, controls, boot.
 *
 * Load order in learn.html: tts.js, core.js, math-level1.js,
 * english-level1.js, ui.js. No build step — plain classic scripts sharing
 * the `window.LearnCore` namespace so the panel stays iframe-self-contained.
 * Adding a new subject/level = add one generator file + one REGISTRY entry.
 * ========================================================================== */

(function () {
    'use strict';

    /* ------------------------------------------------------------------
     * 1. Available learning types & categories.
     *    `enabled: false` rows render as disabled "coming soon" chips.
     * ------------------------------------------------------------------ */
    const REGISTRY = {
        math: {
            label: 'Math',
            enabled: true,
            categories: {
                level1: { label: 'Level 1', enabled: true }
            }
        },
        english: {
            label: 'English',
            enabled: true,
            categories: {
                level1: { label: 'Level 1', enabled: true }
            }
        },
        chinese: { label: 'Chinese', enabled: false },
        general: { label: 'General Knowledge', enabled: false }
    };

    // Selected state (defaults to the first implemented combination).
    let selectedType = 'math';
    let selectedCategory = 'level1';

    // The currently displayed question — owned here so ui.js (TTS, reveal)
    // and any future module always read the same object.
    let currentQuestion = null;

    // TTS gating, pushed from the parent clock page via postMessage.
    // Defaults are permissive so the module still speaks standalone.
    let ttsEnabled = true;
    let soundActive = true;
    let ttsEngine = 'auto';

    // Cache TTL: one entry per type+category, fresh for 1 hour. Reloading
    // within the window returns the SAME question; after expiry a new one.
    const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
    const CACHE_PREFIX = 'clock.learn';

    /* Question generators: pure functions returning a fresh question:
     *   { type, category, text, answer, prompt,
     *     answerSentence?, spokenQuestion?, spokenAnswer?,
     *     display?: 'math' | 'story', kind?: 'add' | 'subtract', ... }
     * Generators live in their own files and self-register via
     * LearnCore.registerGenerator(type, category, fn). */
    const GENERATORS = {};

    function registerGenerator(type, category, fn) {
        if (typeof fn !== 'function') return;
        if (!GENERATORS[type]) GENERATORS[type] = {};
        GENERATORS[type][category] = fn;
    }

    function getGenerator(type, category) {
        const t = type || selectedType;
        const c = category || selectedCategory;
        return (GENERATORS[t] || {})[c] || null;
    }

    /* ------------------------------------------------------------------
     * 2. localStorage cache helpers (tolerant: never breaks the module).
     * ------------------------------------------------------------------ */
    const CACHE_KEY = () => `${CACHE_PREFIX}.${selectedType}.${selectedCategory}`;

    function readCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY());
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.question !== 'object') return null;
            return parsed;
        } catch (err) {
            return null;
        }
    }

    // `generatedAt` is a timestamp; the cache is fresh only while
    // (now - generatedAt) <= TTL.
    function isCacheFresh(entry) {
        return !!entry && typeof entry.generatedAt === 'number' &&
            (Date.now() - entry.generatedAt) <= CACHE_TTL_MS;
    }

    function writeCache(question) {
        try {
            localStorage.setItem(CACHE_KEY(), JSON.stringify({
                generatedAt: Date.now(),
                question
            }));
        } catch (err) {
            /* Storage unavailable (private mode etc.): the question simply
               isn't persisted, but the module keeps working for the session. */
        }
    }

    /* ------------------------------------------------------------------
     * 3. Load-or-generate lifecycle (same rule for every subject, so
     *    Math L1 and English L1 behave identically).
     * ------------------------------------------------------------------ */
    function loadOrGenerateQuestion() {
        const gen = getGenerator();
        if (!gen) return null;

        const cached = readCache();
        if (isCacheFresh(cached)) {
            return cached.question;
        }

        const question = gen();
        writeCache(question);
        return question;
    }

    // Force a brand-new question now (user pressed "New Question").
    function generateFreshQuestion() {
        const gen = getGenerator();
        if (!gen) return null;
        const question = gen();
        writeCache(question);
        return question;
    }

    /* ------------------------------------------------------------------
     * Public namespace for the other learn/ modules.
     * ------------------------------------------------------------------ */
    window.LearnCore = {
        REGISTRY,
        GENERATORS,
        registerGenerator,
        getGenerator,
        readCache,
        isCacheFresh,
        writeCache,
        loadOrGenerateQuestion,
        generateFreshQuestion,
        CACHE_TTL_MS,
        get selectedType() { return selectedType; },
        set selectedType(v) { selectedType = v; },
        get selectedCategory() { return selectedCategory; },
        set selectedCategory(v) { selectedCategory = v; },
        get currentQuestion() { return currentQuestion; },
        set currentQuestion(v) { currentQuestion = v; },
        get ttsEnabled() { return ttsEnabled; },
        set ttsEnabled(v) { ttsEnabled = !!v; },
        get soundActive() { return soundActive; },
        set soundActive(v) { soundActive = !!v; },
        get ttsEngine() { return ttsEngine; },
        set ttsEngine(v) { ttsEngine = v; }
    };
})();
