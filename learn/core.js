/* ==========================================================================
 * Learn Core — shared state, registry, cache and question lifecycle.
 *
 * Part of the modular Learn panel (see learn/ folder):
 *   core.js            -> this file: REGISTRY, selection state, 1-hour
 *                         localStorage cache, generator registry.
 *   math-level1.js     -> registers the four Math generators (one per
 *                         category).
 *   english-level1.js  -> registers English Level 1 generator (K3 stories).
 *   ui.js              -> rendering, TTS wiring, controls, boot.
 *
 * Load order in learn.html: tts.js, core.js, math-level1.js,
 * english-level1.js, ui.js. No build step — plain classic scripts sharing
 * the `window.LearnCore` namespace so the panel stays iframe-self-contained.
 * Adding a new subject/level = add one generator file + REGISTRY entries.
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
            // One category per question case (was a single "Level 1" with
            // 4 random cases). Multi-select: questions come from a random
            // pick across the selected set.
            categories: {
                'within10': { label: 'Add within 10', enabled: true },
                'tens-ones': { label: 'Tens + Ones', enabled: true },
                'tens-tens': { label: 'Tens + Tens', enabled: true },
                'takeaway': { label: 'Take Away', enabled: true }
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

    // Selected state. Types stay single-select; categories are a
    // MULTI-select set per type (persisted — chosen in full-tab mode,
    // honoured everywhere including the docked panel).
    let selectedType = 'math';
    const CATS_STORAGE_KEY = 'clock.learn.cats';

    function enabledCategories(type) {
        const cats = ((REGISTRY[type] || {}).categories) || {};
        return Object.keys(cats).filter((k) => cats[k] && cats[k].enabled);
    }

    function readStoredCats() {
        try {
            const raw = localStorage.getItem(CATS_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            return parsed;
        } catch (err) {
            return null;
        }
    }

    // selectedCats: { math: ['within10', ...], english: ['level1'] }.
    // Unknown/retired keys are dropped; empty sets reset to all-enabled.
    let selectedCats = (function initCats() {
        const stored = readStoredCats() || {};
        const out = {};
        Object.keys(REGISTRY).forEach((type) => {
            const valid = enabledCategories(type);
            const kept = Array.isArray(stored[type])
                ? stored[type].filter((c) => valid.indexOf(c) >= 0)
                : [];
            out[type] = kept.length ? kept : valid.slice();
        });
        return out;
    })();

    function persistCats() {
        try {
            localStorage.setItem(CATS_STORAGE_KEY, JSON.stringify(selectedCats));
        } catch (err) { /* private mode etc.: selection works for the session */ }
    }

    function getSelected(type) {
        const t = type || selectedType;
        const valid = enabledCategories(t);
        const kept = (selectedCats[t] || []).filter((c) => valid.indexOf(c) >= 0);
        return kept.length ? kept : valid.slice();
    }

    // Toggle one category; never allows deselecting the last one.
    // Returns true if the set changed.
    function toggleCategory(type, cat) {
        const valid = enabledCategories(type);
        if (valid.indexOf(cat) < 0) return false;
        const cur = getSelected(type);
        const i = cur.indexOf(cat);
        if (i >= 0) {
            if (cur.length <= 1) return false;
            cur.splice(i, 1);
        } else {
            cur.push(cat);
        }
        selectedCats[type] = cur;
        persistCats();
        return true;
    }

    // The currently displayed question — owned here so ui.js (TTS, reveal)
    // and any future module always read the same object.
    let currentQuestion = null;

    // TTS gating, pushed from the parent clock page via postMessage.
    // Defaults are permissive so the module still speaks standalone.
    let ttsEnabled = true;
    let soundActive = true;
    let ttsEngine = 'auto';

    // Cache TTL: one entry per type + selected set, fresh for 1 hour.
    // Reloading within the window returns the SAME question; after expiry
    // (or after changing the selection) a new one is picked.
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
        const c = category || pickCategory();
        return (GENERATORS[t] || {})[c] || null;
    }

    /* ------------------------------------------------------------------
     * 2. localStorage cache helpers (tolerant: never breaks the module).
     *    One entry per type + SELECTED SET (sorted keys): changing the
     *    selection misses the cache and generates from the new set.
     * ------------------------------------------------------------------ */
    const CACHE_KEY = () => `${CACHE_PREFIX}.${selectedType}.${getSelected().slice().sort().join('+')}`;

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
     * 3. Load-or-generate lifecycle (same rule for every subject).
     *    The category is a random pick across the selected set, so a
     *    multi-select yields mixed questions; a single pick is focused.
     * ------------------------------------------------------------------ */
    function pickCategory() {
        const set = getSelected();
        return set[Math.floor(Math.random() * set.length)];
    }

    function loadOrGenerateQuestion() {
        const cached = readCache();
        if (isCacheFresh(cached)) {
            return cached.question;
        }
        const gen = getGenerator(selectedType, pickCategory());
        if (!gen) return null;

        const question = gen();
        writeCache(question);
        return question;
    }

    // Force a brand-new question now (user pressed "New Question").
    function generateFreshQuestion() {
        const gen = getGenerator(selectedType, pickCategory());
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
        enabledCategories,
        getSelected,
        toggleCategory,
        pickCategory,
        CACHE_TTL_MS,
        get selectedType() { return selectedType; },
        set selectedType(v) { selectedType = v; },
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
