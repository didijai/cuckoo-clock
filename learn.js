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
                level1: { label: 'Level 1', enabled: true }
            }
        },
        english: { label: 'English', enabled: false },
        chinese: { label: 'Chinese', enabled: false },
        general: { label: 'General Knowledge', enabled: false }
    };

    // Selected state (defaults to the first implemented combination).
    let selectedType = 'math';
    let selectedCategory = 'level1';

    // Cache TTL: questions are cached for 1 hour. Reloading the page within
    // that window returns the SAME question; after expiry a new one is made.
    const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
    const CACHE_PREFIX = 'clock.learn';   // one cache entry per type+category

    /* Question "consider rules": a tiny rule set that can grow. Each engine
       is a pure function returning a fresh question {text, answer, hint}. */
    const GENERATORS = {
        math: {
            // "Level 1" — mixes four kid-friendly rule types at random:
            //   (1) two single-digit addends whose sum is < 10,
            //   (2) one single-digit number + a multiple of 10,
            //   (3) two 2-digit multiples of 10 (10/20/30…) totalling <= 90,
            //   (4) subtraction of two single digits (result never negative).
            // No user input — the answer is revealed on demand.
            level1: function () {
                const randInt = (min, max) =>
                    Math.floor(Math.random() * (max - min + 1)) + min;

                const caseId = randInt(1, 4);
                let a, b, text, answer, operator;

                if (caseId === 1) {
                    // Both single-digit, sum strictly less than 10.
                    a = randInt(1, 8);
                    b = randInt(1, 9 - a); // keeps a + b <= 9
                    operator = '+';
                } else if (caseId === 2) {
                    // Single-digit number plus a multiple of 10 (10..90).
                    a = randInt(1, 9);
                    b = randInt(1, 9) * 10;
                    operator = '+';
                } else if (caseId === 3) {
                    // Two 2-digit numbers, both multiples of 10, total <= 90.
                    a = randInt(1, 8) * 10;        // 10..80
                    b = randInt(1, (90 - a) / 10) * 10; // 10..(90-a)
                    operator = '+';
                } else {
                    // Subtraction of two single digits, never negative.
                    a = randInt(1, 9);
                    b = randInt(1, a); // b <= a, so a - b >= 0
                    operator = '-';
                }

                text = `${a} ${operator} ${b}`;
                answer = String(operator === '+' ? a + b : a - b);

                // `prompt` is owned by the generator (not inferred from the
                // operator in applyQuestion) so any future category can supply
                // any wording — Math-specific terms like "sum"/"difference" do
                // not leak into the generic renderer.
                const prompt = operator === '-' ? 'What is the difference?' : 'What is the sum?';

                return {
                    type: 'math',
                    category: 'level1',
                    text,
                    answer,
                    hint: null,
                    operator,
                    prompt
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
        if (!q) return;

        const questionText = document.getElementById('questionText');
        const answerText = document.getElementById('answerText');
        const answerPlaceholder = document.getElementById('answerPlaceholder');
        const questionPrompt = document.getElementById('questionPrompt');

        // Prefer the generator's own prompt; fall back to a neutral default
        // for legacy/unknown questions so the element is never left stale.
        if (questionPrompt) questionPrompt.textContent = q.prompt || 'What is the answer?';
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