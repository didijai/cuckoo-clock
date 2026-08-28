/* ==========================================================================
   Learn Panel — self-contained logic for the Math learning module.
   Runs inside learn.html (its own iframe), fully independent of the clock
   page. It owns the selection UI, question generation, the 1-hour cache and
   the reveal/new-question controls.

   Architecture note: the panel is designed to grow. "Learning Type" selects
   a subject (Math, English, Chinese, General Knowledge) and "Category"
   selects a difficulty/game level within that subject (for Math: starting
   with Addition). New types/categories just need a generator registered in
   REGISTRY below.
   ========================================================================== */

(function () {
    'use strict';

    /* ------------------------------------------------------------------
     * 1. Available learning types & categories.
     *    Only Math -> Addition is wired up right now. Others are declared
     *    so the panel UI can show them but mark them as coming soon.
     * ------------------------------------------------------------------ */
    const REGISTRY = {
        math: {
            label: 'Math',
            enabled: true,
            categories: {
                addition: { label: 'Addition', enabled: true }
            }
        },
        english: { label: 'English', enabled: false },
        chinese: { label: 'Chinese', enabled: false },
        general: { label: 'General Knowledge', enabled: false }
    };

    // Selected state (defaults to the first implemented combination).
    let selectedType = 'math';
    let selectedCategory = 'addition';

    // Cache TTL: questions are cached for 1 hour. Reloading the page within
    // that window returns the SAME question; after expiry a new one is made.
    const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
    const CACHE_PREFIX = 'clock.learn';   // one cache entry per type+category

    /* Question "consider rules": a tiny rule set that can grow. Each engine
       is a pure function returning a fresh question {text, answer, hint}. */
    const GENERATORS = {
        math: {
            // Addition for very young kids: two single-digit (1–9) addends.
            // No user input — the answer is revealed on demand.
            addition: function () {
                const randInt = (min, max) =>
                    Math.floor(Math.random() * (max - min + 1)) + min;
                const a = randInt(1, 9);
                const b = randInt(1, 9);
                return {
                    type: 'math',
                    category: 'addition',
                    text: `${a} + ${b}`,
                    answer: String(a + b),
                    hint: null
                };
            }
        }
    };

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
     * 3. Load-or-generate the current question using the caching rule.
     *    - If a fresh cache entry exists, reuse it (page reload => same Q).
     *    - If it's stale/missing, generate a new one and cache it.
     * ------------------------------------------------------------------ */
    function getGenerator() {
        return (GENERATORS[selectedType] || {})[selectedCategory] || null;
    }

    function loadOrGenerateQuestion() {
        const gen = getGenerator();
        if (!gen) return null;

        const cached = readCache();
        if (isCacheFresh(cached)) {
            return cached.question;
        }

        const question = gen();           // "consider rules" -> new question
        writeCache(question);             // cache it for the next 1 hour
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
     * 4. Rendering helpers.
     * ------------------------------------------------------------------ */
    let questionCacheExpired = false; // shows expired vs fresh dot in footer

    function renderTypeChips() {
        const container = document.getElementById('typeChips');
        if (!container) return;
        container.innerHTML = '';

        Object.entries(REGISTRY).forEach(([key, meta]) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'learn-chip';
            chip.dataset.key = key;
            chip.textContent = meta.label;

            if (!meta.enabled) {
                chip.disabled = true;
                chip.title = 'Coming soon';
            } else {
                chip.title = 'Select learning type';
            }
            if (key === selectedType) chip.classList.add('active');

            chip.addEventListener('click', () => {
                if (!meta.enabled) return;
                selectedType = key;
                // For now the only enabled type is Math; always pick its
                // first category so non-existent categories can't be selected.
                const catKey = Object.keys((REGISTRY[key] || {}).categories || {})[0] || selectedCategory;
                selectedCategory = catKey;
                renderTypeChips();
                renderCategoryChips();
                refreshBody(); // load fresh question for the new selection
            });
            container.appendChild(chip);
        });
    }

    function renderCategoryChips() {
        const container = document.getElementById('categoryChips');
        if (!container) return;
        container.innerHTML = '';

        const meta = REGISTRY[selectedType];
        const cats = (meta && meta.categories) ? meta.categories : {};
        const entries = Object.entries(cats);

        if (entries.length === 0) {
            const span = document.createElement('span');
            span.className = 'answer-placeholder';
            span.textContent = 'Categories coming soon';
            container.appendChild(span);
            return;
        }

        entries.forEach(([key, catMeta]) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'learn-chip';
            chip.dataset.key = key;
            chip.textContent = catMeta.label;

            if (!catMeta.enabled) {
                chip.disabled = true;
                chip.title = 'Coming soon';
            }
            if (key === selectedCategory) chip.classList.add('active');

            chip.addEventListener('click', () => {
                if (!catMeta.enabled) return;
                selectedCategory = key;
                renderCategoryChips();
                refreshBody();
            });
            container.appendChild(chip);
        });
    }

    // Central "consider a new current question" step — used on load, on
    // selection changes, and by the hard "New Question" button.
    function refreshBody() {
        const q = loadOrGenerateQuestion();
        applyQuestion(q);
        updateCacheIndicators();
    }

    function applyQuestion(q) {
        const questionText = document.getElementById('questionText');
        const answerText = document.getElementById('answerText');
        const answerPlaceholder = document.getElementById('answerPlaceholder');

        if (questionText) questionText.textContent = q.text;
        if (answerText) {
            answerText.textContent = q.answer;
            answerText.hidden = true; // answer starts hidden
        }
        if (answerPlaceholder) answerPlaceholder.hidden = false;
    }

    function updateCacheIndicators() {
        const entry = readCache();
        const dot = document.getElementById('cacheDot');
        const note = document.getElementById('cacheNote');
        const fresh = isCacheFresh(entry);
        if (dot) dot.classList.toggle('expired', !fresh);
        if (note) note.textContent = fresh ? 'Cached · same for 1 hour' : 'New question generated';
        questionCacheExpired = !fresh;
    }

    /* ------------------------------------------------------------------
     * 5. Controls: reveal answer & request a brand-new question.
     * ------------------------------------------------------------------ */
    function wireActions() {
        const revealBtn = document.getElementById('revealBtn');
        const newBtn = document.getElementById('newQuestionBtn');

        if (revealBtn) {
            revealBtn.addEventListener('click', () => {
                const answerText = document.getElementById('answerText');
                const placeholder = document.getElementById('answerPlaceholder');
                if (answerText) answerText.hidden = false;
                if (placeholder) placeholder.hidden = true;
            });
        }

        if (newBtn) {
            newBtn.addEventListener('click', () => {
                const q = generateFreshQuestion(); // bypass cache, new cache stamp
                if (q) applyQuestion(q);
                updateCacheIndicators();
            });
        }
    }

    /* ------------------------------------------------------------------
     * 6. Boot.
     * ------------------------------------------------------------------ */
    document.addEventListener('DOMContentLoaded', () => {
        renderTypeChips();
        renderCategoryChips();
        wireActions();
        refreshBody();
    });
})();