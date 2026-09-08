/* ==========================================================================
 * Learn UI — selection chips, rendering, TTS wiring, controls and boot.
 *
 * Generic over subjects: it never hard-codes Math/English wording. Each
 * generator owns its `text / answer / prompt / spokenQuestion /
 * spokenAnswer / display`, and this file only renders + speaks them.
 *
 * Behaviour (identical for every Level 1 subject):
 *   - Question card click / New Question -> speak the QUESTION only.
 *   - Reveal Answer -> show the answer (+ full sentence for stories)
 *     and speak the ANSWER.
 *   - 1-hour cache per type+category via LearnCore.
 * ========================================================================== */

(function () {
    'use strict';

    const Core = window.LearnCore;
    if (!Core) return;

    /* ------------------------------------------------------------------
     * Rendering helpers.
     * ------------------------------------------------------------------ */
    function renderTypeChips() {
        const container = document.getElementById('typeChips');
        if (!container) return;
        container.innerHTML = '';

        Object.entries(Core.REGISTRY).forEach(([key, meta]) => {
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
            if (key === Core.selectedType) chip.classList.add('active');

            chip.addEventListener('click', () => {
                if (!meta.enabled) return;
                Core.selectedType = key;
                const catKey = Object.keys((Core.REGISTRY[key] || {}).categories || {})[0]
                    || Core.selectedCategory;
                Core.selectedCategory = catKey;
                renderTypeChips();
                renderCategoryChips();
                refreshBody();
            });
            container.appendChild(chip);
        });
    }

    function renderCategoryChips() {
        const container = document.getElementById('categoryChips');
        if (!container) return;
        container.innerHTML = '';

        const meta = Core.REGISTRY[Core.selectedType];
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
            if (key === Core.selectedCategory) chip.classList.add('active');

            chip.addEventListener('click', () => {
                if (!catMeta.enabled) return;
                Core.selectedCategory = key;
                renderCategoryChips();
                refreshBody();
            });
            container.appendChild(chip);
        });
    }

    // Central "consider a new current question" step — used on load, on
    // selection changes, and by the hard "New Question" button.
    function refreshBody() {
        const q = Core.loadOrGenerateQuestion();
        applyQuestion(q);
        updateCacheIndicators();
    }

    function applyQuestion(q) {
        if (!q) return;

        Core.currentQuestion = q;

        const questionText = document.getElementById('questionText');
        const answerText = document.getElementById('answerText');
        const answerSentence = document.getElementById('answerSentence');
        const answerPlaceholder = document.getElementById('answerPlaceholder');
        const questionPrompt = document.getElementById('questionPrompt');
        const subtitle = document.getElementById('learnSubtitle');

        // Prefer the generator's own prompt; fall back to a neutral default
        // for legacy/unknown questions so the element is never left stale.
        if (questionPrompt) questionPrompt.textContent = q.prompt || 'What is the answer?';
        if (questionText) {
            questionText.textContent = q.text;
            // Story questions (English) wrap in a smaller font; Math keeps
            // the huge single-line display.
            questionText.classList.toggle('story', q.display === 'story');
        }
        if (answerText) {
            answerText.textContent = q.answer;
            answerText.hidden = true; // answer starts hidden
        }
        if (answerSentence) {
            answerSentence.textContent = q.answerSentence || '';
            // Only story questions carry a full answer sentence; Math leaves
            // this element empty AND hidden so layout is unchanged.
            answerSentence.hidden = true;
            answerSentence.style.display = q.answerSentence ? '' : 'none';
        }
        if (answerPlaceholder) answerPlaceholder.hidden = false;

        // Keep the header subtitle in sync: "Math · Level 1" etc.
        if (subtitle) {
            const typeLabel = (Core.REGISTRY[Core.selectedType] || {}).label || q.type;
            const catLabel = ((Core.REGISTRY[Core.selectedType] || {}).categories || {})[Core.selectedCategory];
            subtitle.textContent = `${typeLabel} · ${(catLabel && catLabel.label) || q.category}`;
        }
    }

    function updateCacheIndicators() {
        const entry = Core.readCache();
        const dot = document.getElementById('cacheDot');
        const note = document.getElementById('cacheNote');
        const fresh = Core.isCacheFresh(entry);
        if (dot) dot.classList.toggle('expired', !fresh);
        if (note) note.textContent = fresh ? 'Cached · same for 1 hour' : 'New question generated';
    }

    /* ------------------------------------------------------------------
     * Controls: reveal answer & request a brand-new question.
     * ------------------------------------------------------------------ */

    // Speak `text` aloud, honoring the TTS + sound gates from the parent.
    function speakWith(text) {
        if (!text || !window.LearnTTS) return;
        if (!Core.ttsEnabled || !Core.soundActive) return;
        window.LearnTTS.speak(text);
    }

    // Speak the current question ONLY (never the answer):
    //   - Story questions (English) read their full `spokenQuestion` verbatim.
    //   - Math questions read a friendly full sentence, e.g.
    //     "What is 6 plus 10?" instead of a bare "6 plus 10".
    function speakQuestion() {
        const q = Core.currentQuestion;
        if (!q) return;
        if (q.spokenQuestion) {
            speakWith(q.spokenQuestion);
            return;
        }
        const phrase = String(q.text || '')
            .replace(/\+/g, ' plus ')
            .replace(/-/g, ' minus ')
            .trim();
        speakWith(`What is ${phrase}?`);
    }

    // Speak the current question's answer once, naturally:
    //   - Story questions read `spokenAnswer` verbatim, e.g.
    //     "Ben has 4 apples." (same string as answerSentence).
    //   - Math questions read "The answer is 16!".
    function speakAnswer() {
        const q = Core.currentQuestion;
        if (!q) return;
        if (q.spokenAnswer) {
            speakWith(q.spokenAnswer);
            return;
        }
        speakWith(`The answer is ${q.answer}!`);
    }

    function wireActions() {
        const revealBtn = document.getElementById('revealBtn');
        const newBtn = document.getElementById('newQuestionBtn');
        const questionCard = document.querySelector('.question-card');

        if (revealBtn) {
            revealBtn.addEventListener('click', () => {
                const answerText = document.getElementById('answerText');
                const answerSentence = document.getElementById('answerSentence');
                const placeholder = document.getElementById('answerPlaceholder');
                // Print the question's answer: the short answer is always
                // shown; story questions additionally show the full answer
                // sentence (the question itself stays visible on the card).
                if (answerText) answerText.hidden = false;
                if (answerSentence) {
                    const q = Core.currentQuestion;
                    const hasSentence = !!(q && q.answerSentence);
                    answerSentence.hidden = !hasSentence;
                    if (hasSentence) answerSentence.style.display = '';
                }
                if (placeholder) placeholder.hidden = true;
                speakAnswer(); // reveal + read the answer out loud
            });
        }

        if (newBtn) {
            newBtn.addEventListener('click', () => {
                const q = Core.generateFreshQuestion(); // bypass cache
                if (q) applyQuestion(q);
                updateCacheIndicators();
                speakQuestion(); // read the new question out loud
            });
        }

        // Clicking the question card re-reads the question (never the answer).
        if (questionCard) {
            questionCard.addEventListener('click', () => speakQuestion());
        }
    }

    /* ------------------------------------------------------------------
     * Parent link: receive TTS + sound state from the clock page.
     * ------------------------------------------------------------------ */
    window.addEventListener('message', (e) => {
        const data = e.data;
        if (!data || data.type !== 'learn-tts-state') return;
        if (typeof data.ttsEnabled === 'boolean') Core.ttsEnabled = data.ttsEnabled;
        if (typeof data.soundActive === 'boolean') Core.soundActive = data.soundActive;
        if (typeof data.ttsEngine === 'string') {
            const next = data.ttsEngine.toLowerCase();
            if (next === 'auto' || next === 'browser' || next === 'google') {
                Core.ttsEngine = next;
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
    // inside a real user gesture, so the first spoken question/answer
    // already uses the correct voice and is never a "cold start".
    let ttsInitialized = false;
    const initTTSOnFirstGesture = () => {
        if (ttsInitialized || !window.LearnTTS || !Core.ttsEnabled || !Core.soundActive) return;
        ttsInitialized = true;
        try {
            window.LearnTTS.init();
        } catch (e) {
            console.warn('[Learn] TTS init failed (continuing silently):', e);
        }
    };
    ['pointerdown', 'pointerup', 'click', 'keydown', 'touchstart', 'touchend']
        .forEach(evt => document.addEventListener(evt, initTTSOnFirstGesture, { once: true, capture: true }));

    /* ------------------------------------------------------------------
     * Boot.
     * ------------------------------------------------------------------ */
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
