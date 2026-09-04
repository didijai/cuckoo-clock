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

    // The currently displayed question — kept here so the TTS can speak its
    // text and answer (see speakQuestion / speakAnswer below).
    let currentQuestion = null;

    // TTS gating. The parent clock page controls these via postMessage:
    //   - ttsEnabled: the "Read-Aloud (TTS)" setting (default ON).
    //   - soundActive: global sound truly running (audio.enabled && running).
    //   - ttsEngine: 'auto' | 'browser' | 'google' (default 'auto').
    // Speech only happens when ttsEnabled && soundActive are true, using
    // the selected engine. Defaults are permissive so the
    // module still speaks if opened without a parent (standalone / test).
    let ttsEnabled = true;
    let soundActive = true;
    let ttsEngine = 'auto';

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

                const caseId = randInt(1, 2);
                let a, b, text, answer, operator;

                if (caseId === 1) {
                    // Both single-digit, sum strictly less than 10.
                    a = randInt(1, 8);
                    b = randInt(1, 9 - a); // keeps a + b <= 9
                    operator = '+';
                // } else if (caseId === 2) {
                //     // Single-digit number plus a multiple of 10 (10..90).
                //     a = randInt(1, 9);
                //     b = randInt(1, 9) * 10;
                //     operator = '+';
                // } else if (caseId === 2) {
                //     // Two 2-digit numbers, both multiples of 10, total <= 90.
                //     a = randInt(1, 8) * 10;        // 10..80
                //     b = randInt(1, (90 - a) / 10) * 10; // 10..(90-a)
                //     operator = '+';
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

        currentQuestion = q;

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

    // Speak `text` aloud, honoring the TTS + sound gates from the parent.
    // The LearnTTS.speak() call handles the one-time engine probe internally
    // (awaited before the first real utterance) so no separate probe call is
    // needed here.
    function speakWith(text) {
        if (!text || !window.LearnTTS) return;
        if (!ttsEnabled || !soundActive) return; // gated by parent settings
        window.LearnTTS.speak(text);
    }

    // Speak the current question as a friendly full sentence, e.g.
    // "What is 6 plus 10?" instead of a bare "6 plus 10".
    function speakQuestion() {
        const q = currentQuestion;
        if (!q) return;
        const phrase = q.text
            .replace(/\+/g, ' plus ')
            .replace(/-/g, ' minus ')
            .trim();
        const spokenText = `What is ${phrase}?`;
        speakWith(spokenText);
    }

    // Speak the current question's answer as a full sentence, e.g.
    // "The answer is 16!" instead of a bare "16".
    function speakAnswer() {
        const q = currentQuestion;
        if (!q) return;
        const spokenText = `The answer is ${q.answer}!`;
        speakWith(spokenText);
    }

    function wireActions() {
        const revealBtn = document.getElementById('revealBtn');
        const newBtn = document.getElementById('newQuestionBtn');
        const questionCard = document.querySelector('.question-card');

        if (revealBtn) {
            revealBtn.addEventListener('click', () => {
                const answerText = document.getElementById('answerText');
                const placeholder = document.getElementById('answerPlaceholder');
                if (answerText) answerText.hidden = false;
                if (placeholder) placeholder.hidden = true;
                speakAnswer(); // reveal + read the answer out loud
            });
        }

        if (newBtn) {
            newBtn.addEventListener('click', () => {
                const q = generateFreshQuestion(); // bypass cache, new cache stamp
                if (q) applyQuestion(q);
                updateCacheIndicators();
                speakQuestion(); // read the new question out loud
            });
        }

        // Clicking the question card re-reads the question.
        if (questionCard) {
            questionCard.addEventListener('click', () => speakQuestion());
        }
    }

    /* ------------------------------------------------------------------
     * 5b. Parent link: receive TTS + sound state from the clock page.
     *     The clock toggles "Read-Aloud (TTS)" and global sound; those are
     *     pushed here so the iframe's speech matches both switches.
     * ------------------------------------------------------------------ */
    window.addEventListener('message', (e) => {
        const data = e.data;
        if (!data || data.type !== 'learn-tts-state') return;
        if (typeof data.ttsEnabled === 'boolean') ttsEnabled = data.ttsEnabled;
        if (typeof data.soundActive === 'boolean') soundActive = data.soundActive;
        if (typeof data.ttsEngine === 'string') {
            const next = data.ttsEngine.toLowerCase();
            if (next === 'auto' || next === 'browser' || next === 'google') {
                ttsEngine = next;
                try {
                    if (window.LearnTTS && typeof window.LearnTTS.setEngine === 'function') {
                        window.LearnTTS.setEngine(next);
                    }
                } catch (err) { /* engine switch is best-effort */ }
            }
        }
    });

    // Ask the parent for the current state once we're live (in case the
    // iframe was already loaded before the parent attached its bridge).
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'learn-tts-query' }, '*');
    }

    // Initialize TTS on the FIRST interaction anywhere (any click/tap/key),
    // inside a real user gesture. This resolves the preferred female voice
    // and proves the engine BEFORE the user presses Reveal/New Question, so
    // the first spoken question/answer already uses the correct voice and is
    // never a "cold start" with a different/default voice.
    let ttsInitialized = false;
    const initTTSOnFirstGesture = () => {
        if (ttsInitialized || !window.LearnTTS || !ttsEnabled || !soundActive) return;
        ttsInitialized = true;
        // TTS init is best-effort only — it must never throw and break the
        // rest of the panel (e.g. on a browser with no speech engine).
        try {
            window.LearnTTS.init();
        } catch (e) {
            console.warn('[Learn] TTS init failed (continuing silently):', e);
        }
    };
    ['pointerdown', 'pointerup', 'click', 'keydown', 'touchstart', 'touchend']
        .forEach(evt => document.addEventListener(evt, initTTSOnFirstGesture, { once: true, capture: true }));

    /* ------------------------------------------------------------------
     * 6. Boot.
     * ------------------------------------------------------------------ */
    // Render the panel independently of TTS. Each render step is isolated
    // in try/catch so a failure in one (or in an external script like the
    // TTS helper) can never leave the whole panel blank. The static header
    // in learn.html always shows; this ensures the dynamic body does too.
    document.addEventListener('DOMContentLoaded', () => {
        try {
            renderTypeChips();
            renderCategoryChips();
            wireActions();
            refreshBody();
        } catch (err) {
            console.error('[Learn] boot failed:', err);
        }
    });
})();