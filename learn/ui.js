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
 *
 * Dual mode (same frame-context rule as media.js):
 *   - Docked (framed beside the clock): instant reveal, original
 *     behaviour — glanceable, no stage.
 *   - Full tab (learn.html opened top-level via the docked panel's
 *     open-in-new-tab link): math answers animate through the 3-tap
 *     stepper in math-anim.js with a wider popup layout (body.popup).
 * ========================================================================== */

(function () {
    'use strict';

    const Core = window.LearnCore;
    if (!Core) return;

    // Full-tab vs docked mode (same frame-context rule as media.js):
    // framed inside the docked panel it is always embedded (instant
    // reveal, original behaviour); top-level it is always a popup (3-tap
    // animated answers with room for the stage). ?popup=1 on the link
    // just documents the intent.
    const POPUP = (function () {
        try { return !(window.parent && window.parent !== window); }
        catch (e) { return false; }
    })();
    if (POPUP && document.body) document.body.classList.add('popup');

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
                renderTypeChips();
                renderCategoryChips();
                refreshBody();
            });
            container.appendChild(chip);
        });
    }

    // Category chips are MULTI-select (toggle any combination; the last
    // one can't be deselected). Rendered for full-tab mode only — the
    // docked panel hides the whole block via CSS and honours the stored
    // set silently.
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

        const selected = Core.getSelected();
        entries.forEach(([key, catMeta]) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'learn-chip';
            chip.dataset.key = key;
            chip.textContent = catMeta.label;

            if (!catMeta.enabled) {
                chip.disabled = true;
                chip.title = 'Coming soon';
            } else {
                chip.title = selected.indexOf(key) >= 0
                    ? 'Selected — tap to remove'
                    : 'Tap to add';
            }
            if (selected.indexOf(key) >= 0) chip.classList.add('active');

            chip.addEventListener('click', () => {
                if (!catMeta.enabled) return;
                if (!Core.toggleCategory(Core.selectedType, key)) return;
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

    // Math animation stepper state (3 taps: A, B, altogether; then replay).
    // Non-math questions (or math without an anim spec) use the instant
    // reveal path exactly as before.
    let animStep = 0;
    let animBusy = false;

    function animStageEls() {
        return {
            stage: document.getElementById('answerAnim'),
            cap: document.getElementById('answerAnimCap'),
            btn: document.getElementById('revealBtn')
        };
    }

    function useAnim(q) {
        // Animation only in the full tab: the narrow dock keeps the
        // original instant reveal so it stays glanceable beside the clock.
        return POPUP && !!(window.LearnMathAnim && window.LearnMathAnim.supports(q));
    }

    function resetAnimFor(q) {
        animStep = 0;
        // NOTE: intentionally does NOT touch animBusy. The replay loop
        // calls this mid-run while busy; clearing the flag here reopened
        // the gate, so a fast double-click started a second concurrent
        // replay and both loops rendered into the same stage (double
        // items + badges). Only applyQuestion (new question) clears busy.
        const { stage, cap, btn } = animStageEls();
        if (window.LearnMathAnim && stage) window.LearnMathAnim.start(stage, cap);
        const animated = useAnim(q);
        if (btn) btn.textContent = animated ? 'Show (1 of 3)' : 'Reveal Answer';
        const placeholder = document.getElementById('answerPlaceholder');
        if (placeholder) placeholder.textContent = animated ? 'Tap "Show" to count' : 'Tap "Reveal Answer"';
        // Reserve worst-case stage height in popup so the action buttons
        // never shift as groups pop in (see body.popup .has-stage CSS).
        const card = document.querySelector('.question-card');
        if (card) card.classList.toggle('has-stage', animated);
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

        // New question = animation restarts from tap 1 (stage cleared),
        // and any in-flight run is abandoned (its token goes stale).
        animBusy = false;
        resetAnimFor(q);

        // Keep the header subtitle in sync with the multi-select, e.g.
        // "Math · All" or "Math · Tens + Ones +1".
        if (subtitle) {
            const typeMeta = Core.REGISTRY[Core.selectedType] || {};
            const typeLabel = typeMeta.label || q.type;
            const cats = typeMeta.categories || {};
            const picked = Core.getSelected();
            const names = picked.map((k) => (cats[k] || {}).label || k);
            const all = names.length === Object.keys(cats).length;
            const catText = all ? 'All'
                : names.slice(0, 2).join(' + ') + (names.length > 2 ? ` +${names.length - 2}` : '');
            subtitle.textContent = `${typeLabel} · ${catText}`;
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
    // Interrupt-first: any in-flight utterance (answer counts, previous
    // question) is stopped so New Question / next tap is never talked over.
    function speakWith(text) {
        if (!text || !window.LearnTTS) return;
        if (POPUP) refreshTtsFromStorage();
        if (!Core.ttsEnabled || !Core.soundActive) return;
        try { window.LearnTTS.stop(); } catch (err) { /* best-effort */ }
        window.LearnTTS.speak(text);
    }

    // Standalone popup has no parent bridge, but it shares origin
    // localStorage with the clock page — read the persisted TTS mode
    // directly so the full tab honours Settings (engine + off). Re-read
    // per speak so a Settings change applies without reopening the tab.
    function refreshTtsFromStorage() {
        let mode = null;
        try {
            const raw = localStorage.getItem('clock.settings');
            const s = raw && JSON.parse(raw);
            if (s && typeof s.ttsMode === 'string') mode = s.ttsMode.toLowerCase();
        } catch (err) { /* storage unavailable: keep current gating */ }
        if (mode !== 'off' && mode !== 'auto' && mode !== 'browser' && mode !== 'google') return;
        Core.ttsEnabled = (mode !== 'off');
        Core.ttsEngine = (mode === 'off' ? 'auto' : mode);
        try {
            if (window.LearnTTS && typeof window.LearnTTS.setEngine === 'function') {
                // No-op when unchanged (setEngine early-returns), so this
                // never interrupts speech by itself.
                window.LearnTTS.setEngine(Core.ttsEngine);
            }
        } catch (err) { /* engine switch is best-effort */ }
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

    // Replay paces itself to the narration: without this the loop
    // advances the instant visuals finish and each new utterance stop()s
    // the previous one mid-sentence (only "Altogether" survived). Estimate
    // ~8 chars/sec at the kid-friendly rate plus a base second; capped.
    function speechMs(text) {
        return Math.min(900 + String(text || '').length * 125, 6000);
    }

    function paceForSpeech(text) {
        if (!text || !Core.ttsEnabled || !Core.soundActive) return Promise.resolve();
        return new Promise((resolve) => setTimeout(resolve, speechMs(text)));
    }

    // Animated path helpers: the numeral appears only at the finale
    // (tap 3), inline on the question line as "= 7" — the single answer.
    // Taps 1-2 only hide the "Tap Show" placeholder.
    function hideAnswerPlaceholder() {
        const placeholder = document.getElementById('answerPlaceholder');
        if (placeholder) placeholder.hidden = true;
    }

    function showAnimNumeral(q, step) {
        if (step < 3) return;
        const answerText = document.getElementById('answerText');
        if (answerText && q) {
            answerText.textContent = `= ${q.answer}`;
            answerText.hidden = false;
        }
    }

    // Story answers: emphasize the key phrase inline ("Ben has 3 bananas
    // now." with "3 bananas" big). HTML-escaped; first occurrence only;
    // falls back to plain text when the key isn't found.
    function emphasizeKey(sentence, key) {
        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const s = String(sentence || '');
        const k = String(key || '');
        if (!s) return '';
        if (!k) return esc(s);
        const i = s.indexOf(k);
        if (i < 0) return esc(s);
        return esc(s.slice(0, i)) +
            `<span class="answer-key">${esc(k)}</span>` +
            esc(s.slice(i + k.length));
    }

    function wireActions() {
        const revealBtn = document.getElementById('revealBtn');
        const newBtn = document.getElementById('newQuestionBtn');
        const questionCard = document.querySelector('.question-card');

        if (revealBtn) {
            revealBtn.addEventListener('click', async () => {
                const q = Core.currentQuestion;
                // Animated path: Math Level 1 with an anim spec steps
                // 1 (group A) -> 2 (group B) -> 3 (altogether) -> replay.
                if (useAnim(q)) {
                    if (animBusy) return;
                    // Replay after a finished run: clear and auto-play all
                    // three steps with a beat between them.
                    if (animStep >= 3) {
                        animBusy = true;
                        revealBtn.textContent = 'Playing…';
                        resetAnimFor(q);
                        // Replay re-earns the answer like the first run:
                        // hide the old numeral until the finale shows it.
                        const oldAnswer = document.getElementById('answerText');
                        if (oldAnswer) oldAnswer.hidden = true;
                        for (let s = 1; s <= 3; s++) {
                            // New Question mid-replay: the stage now belongs
                            // to another question — stop driving the old one
                            // (otherwise its visuals + numeral land on the
                            // new question).
                            if (Core.currentQuestion !== q) return;
                            animStep = s;
                            revealBtn.textContent = s < 3 ? `Show (${s + 1} of 3)` : 'Playing…';
                            // Lead-ins speak at step start (long ten builds
                            // talk while rendering); tails on completion.
                            const r = await window.LearnMathAnim.advance(q, s, (lead) => speakWith(lead));
                            if (Core.currentQuestion !== q) return;
                            if (r && !r.stale && r.speech) {
                                speakWith(r.speech);
                                // Let the tail finish before the next step's
                                // lead cuts it off (manual taps skip this —
                                // the user sets that pace).
                                await paceForSpeech(r.speech);
                                if (Core.currentQuestion !== q) return;
                            }
                            showAnimNumeral(q, s);
                        }
                        if (Core.currentQuestion === q) {
                            animStep = 3;
                            revealBtn.textContent = 'Replay';
                        }
                        animBusy = false;
                        return;
                    }
                    animBusy = true;
                    animStep += 1;
                    const step = animStep;
                    revealBtn.textContent = step === 1 ? 'Show (2 of 3)'
                        : step === 2 ? 'Count All (3 of 3)' : 'Playing…';
                    hideAnswerPlaceholder();
                    const r = await window.LearnMathAnim.advance(q, step, (lead) => speakWith(lead));
                    // Stale (user hit New Question mid-animation): drop it.
                    if (Core.currentQuestion !== q) return;
                    if (r && !r.stale && r.speech) speakWith(r.speech);
                    showAnimNumeral(q, step);
                    if (step >= 3) revealBtn.textContent = 'Replay';
                    animBusy = false;
                    return;
                }
                // Instant path (English stories + anything without anim).
                const answerText = document.getElementById('answerText');
                const answerSentence = document.getElementById('answerSentence');
                const placeholder = document.getElementById('answerPlaceholder');
                // Story questions: single display — the full sentence with
                // the key phrase (q.answer, always a substring of the
                // sentence) emphasized inline. No separate numeral, so the
                // answer is shown once, not repeated.
                if (q && q.display === 'story' && q.answerSentence) {
                    if (answerText) answerText.hidden = true;
                    if (answerSentence) {
                        answerSentence.innerHTML = emphasizeKey(q.answerSentence, q.answer);
                        answerSentence.hidden = false;
                        answerSentence.style.display = '';
                    }
                } else {
                    // Print the question's answer: the short answer is always
                    // shown; story questions additionally show the full answer
                    // sentence (the question itself stays visible on the card).
                    if (answerText) answerText.hidden = false;
                    if (answerSentence) {
                        const hasSentence = !!(q && q.answerSentence);
                        answerSentence.hidden = !hasSentence;
                        if (hasSentence) answerSentence.style.display = '';
                    }
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
            // Popup: pick up the persisted engine before first speak so a
            // Google-mode setting is honoured from the start (docked mode
            // gets it pushed from the parent instead).
            if (POPUP) refreshTtsFromStorage();
            // Cross-tab catalog sync: picks persist to localStorage, and a
            // `storage` event fires in every OTHER same-origin document —
            // so the docked iframe learns full-tab changes live (and vice
            // versa) without any parent relay or reload.
            window.addEventListener('storage', (e) => {
                if (!e || e.key !== 'clock.learn.cats') return;
                try {
                    if (Core.reloadCats()) {
                        renderCategoryChips();
                        refreshBody();
                    }
                } catch (err) { /* keep serving the current question */ }
            });
            renderTypeChips();
            renderCategoryChips();
            wireActions();
            refreshBody();
        } catch (err) {
            console.error('[Learn] boot failed:', err);
        }
    });
})();
