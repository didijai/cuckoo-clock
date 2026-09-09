/* ==========================================================================
 * Math Animation — 3-tap reveal stepper for Math Level 1 (preschool).
 *
 * Rule: never flash the total; always count into it.
 *   Tap 1 -> group A appears (counted aloud)
 *   Tap 2 -> group B appears (counted on)
 *   Tap 3 -> groups join, total pops big
 *
 * The key beat is the TEN MERGE (unitizing): 10 small emoji squeeze into
 * a glow ring and pop out as 1 big emoji with a "10" badge. First ten of
 * a question gets the full ceremony (count 1-10); remaining tens use a
 * quick shorthand ("Another 10!") so long questions stay watchable. A
 * "10 small = 1 big" reminder chip stays visible while tens are on stage.
 *
 * Modes (from math-level1.js `anim`):
 *   singles  {a, b}            -> a blue + b orange small items
 *   tens     {tensA, tensB}    -> tensA/10 + tensB/10 big items via merge
 *   mixed    {aVal, bVal}        -> operands in QUESTION order (one is
 *      tens, the other ones); group A renders first, group B second
 *   takeaway {a, b}            -> a items, b fly away ("bye-bye")
 *
 * API:
 *   LearnMathAnim.supports(q)            -> true for math + anim spec
 *   LearnMathAnim.start(stageEl, capEl)  -> bind + clear for a question
 *   LearnMathAnim.advance(q, step)       -> Promise<{speech}>; renders the
 *      step's visuals (1..3) and resolves with TTS text when done. Stale
 *      runs (new question mid-animation) resolve {speech:'', stale:true}.
 *   LearnMathAnim.reset()                -> cancel + clear
 * ========================================================================== */

(function () {
    'use strict';

    const SMALL_STAGGER_MS = 240;  // pop gap so kids can count along
    const MERGE_FULL_MS = 700;     // full 10->1 squeeze duration
    const MERGE_QUICK_MS = 320;    // shorthand squeeze duration
    const SETTLE_MS = 350;         // pause after a pop run before next beat

    let runToken = 0;              // bumped on reset; stale async work aborts
    let stageEl = null;
    let capEl = null;
    let mergedDemoDone = false;    // first-ten full ceremony per question
    let bigs = [];                 // big-emoji elements in stage order
    let ones = [];                 // small one-emoji elements (mixed mode)
    let items = [];                // all small items (singles/takeaway)

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function mk(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    function setCaption(html) {
        if (!capEl) return;
        capEl.innerHTML = html;
        capEl.hidden = !html;
    }

    const MERGE_HINT = `<span class="cap-hint">10 small = 1 big</span>`;

    /* ---------------- builders ------------------------------------ */

    function groupShell(label, groupCls) {
        const g = mk('div', `anim-group ${groupCls}`);
        const lab = mk('div', 'anim-glabel', label);
        g.appendChild(lab);
        return g;
    }

    function smallItem(emoji, groupCls) {
        const s = mk('span', `anim-item ${groupCls}`, emoji);
        return s;
    }

    function bigItem(emoji, groupCls, badge) {
        const wrap = mk('span', `anim-big ${groupCls}`);
        wrap.appendChild(mk('span', 'anim-big-e', emoji));
        wrap.appendChild(mk('span', 'anim-badge', badge));
        return wrap;
    }

    // Pop n small items into `box`, staggered. Returns the item elements.
    async function popSmalls(box, n, emoji, groupCls, token, staggerMs) {
        const made = [];
        const gap = (staggerMs == null) ? SMALL_STAGGER_MS : staggerMs;
        for (let i = 0; i < n; i++) {
            if (token !== runToken) return { items: made, stale: true };
            const s = smallItem(emoji, groupCls);
            box.appendChild(s);
            // Force layout so the transition runs from scale 0.
            void s.offsetWidth;
            s.classList.add('in');
            made.push(s);
            if (i < n - 1) await sleep(gap);
        }
        return { items: made, stale: false };
    }

    // Merge one ten: 10 small in `unit` squeeze into a ring, then 1 big
    // pops in `slot`. `full` = count-1-10 ceremony; else quick shorthand.
    async function mergeOneTen(unit, slot, emoji, groupCls, token, full) {
        unit.classList.add(full ? 'merging' : 'merging-quick');
        await sleep(full ? MERGE_FULL_MS : MERGE_QUICK_MS);
        if (token !== runToken) return { stale: true };
        unit.remove();
        const big = bigItem(emoji, groupCls, '10');
        slot.appendChild(big);
        void big.offsetWidth;
        big.classList.add('in');
        bigs.push(big);
        await sleep(SETTLE_MS);
        return { stale: false };
    }

    // Build `tenCount` tens into `rowEl`. First ten full, rest shorthand.
    // Speech is composed by the caller; this only renders. Returns stale?
    async function buildTens(rowEl, tenCount, emoji, groupCls, token, opts) {
        opts = opts || {};
        for (let t = 0; t < tenCount; t++) {
            if (token !== runToken) return true;
            const full = !mergedDemoDone && !opts.skipFull;
            const unit = mk('div', 'anim-ten');
            rowEl.appendChild(unit);
            if (full) {
                const r = await popSmalls(unit, 10, emoji, groupCls, token);
                if (r.stale) return true;
                await sleep(SETTLE_MS);
                const m = await mergeOneTen(unit, rowEl, emoji, groupCls, token, true);
                if (m.stale) return true;
                mergedDemoDone = true;
            } else {
                // Shorthand: grouped flash, instant squeeze, big pops.
                const r = await popSmalls(unit, 10, emoji, groupCls, token, 40);
                if (r.stale) return true;
                const m = await mergeOneTen(unit, rowEl, emoji, groupCls, token, false);
                if (m.stale) return true;
            }
        }
        return false;
    }

    function isTensVal(v) {
        return Number(v) % 10 === 0;
    }

    // Tens value of a mixed operand (the one divisible by 10), or 0.
    function mixedTensOf(anim) {
        if (isTensVal(anim.aVal)) return Math.round(anim.aVal);
        return Math.round(anim.bVal);
    }

    function badgeBigsByTens() {
        bigs.forEach((b, i) => {
            const badge = b.querySelector('.anim-badge');
            if (badge) badge.textContent = String((i + 1) * 10);
        });
    }

    // Idempotent: step 2 and the finale both call this with the same
    // base, so update an existing badge instead of stacking a second one.
    function badgeOnes(base) {
        ones.forEach((s, i) => {
            let badge = s.querySelector(':scope > .anim-minibadge');
            if (!badge) {
                badge = mk('span', 'anim-minibadge', '');
                s.appendChild(badge);
                void s.offsetWidth;
                badge.classList.add('in');
            }
            badge.textContent = String(base + i + 1);
        });
    }

    function badgeSingles() {
        items.forEach((s, i) => {
            const badge = mk('span', 'anim-minibadge', String(i + 1));
            s.appendChild(badge);
            void s.offsetWidth;
            badge.classList.add('in');
        });
    }

    function finalePop() {
        if (!stageEl) return;
        stageEl.classList.add('finale');
        bigs.forEach((b) => b.classList.add('cheer'));
        ones.forEach((s) => s.classList.add('cheer'));
        items.forEach((s) => {
            if (!s.classList.contains('gone')) s.classList.add('cheer');
        });
    }

    /* ---------------- public API ----------------------------------- */

    function supports(q) {
        return !!(q && q.type === 'math' && q.anim && q.anim.mode && stageEl);
    }

    function start(sEl, cEl) {
        stageEl = sEl || null;
        capEl = cEl || null;
        reset(true);
    }

    function reset(keepBinding) {
        runToken++;
        mergedDemoDone = false;
        bigs = [];
        ones = [];
        items = [];
        if (!keepBinding) { stageEl = null; capEl = null; }
        if (stageEl) {
            stageEl.innerHTML = '';
            stageEl.classList.remove('finale');
            stageEl.hidden = true;
        }
        setCaption('');
    }

    async function advance(q, step) {
        const token = runToken;
        const done = (speech) => ({ speech, stale: token !== runToken });
        if (!supports(q)) return done('');
        const anim = q.anim;
        const emoji = q.emoji || '🍎';
        stageEl.hidden = false;

        /* ---- step 1: group A ---- */
        if (step === 1) {
            if (anim.mode === 'singles') {
                const g = groupShell(`First: ${anim.a}`, 'ga');
                const row = mk('div', 'anim-row');
                g.appendChild(row);
                stageEl.appendChild(g);
                const r = await popSmalls(row, anim.a, emoji, 'ga', token);
                items = r.items;
                if (r.stale) return done('');
                setCaption('');
                return done('First! Count them!');
            }
            if (anim.mode === 'tens') {
                const g = groupShell('First', 'ga');
                const row = mk('div', 'anim-row');
                g.appendChild(row);
                stageEl.appendChild(g);
                setCaption(MERGE_HINT);
                const n = Math.round(anim.tensA / 10);
                const firstSpeech = n > 0
                    ? `Let's make a ten! One big means 10!`
                    : 'First group is empty!';
                // Render first ten full in background-safe sequence:
                const stale = await buildTens(row, n, emoji, 'ga', token);
                if (stale) return done('');
                badgeBigsByTens();
                const rest = n > 1 ? ` And ${n - 1} more tens!` : '';
                return done(firstSpeech + rest);
            }
            if (anim.mode === 'mixed') {
                // Group A = FIRST operand, whatever it is (tens or ones).
                const first = Math.round(anim.aVal);
                const g = groupShell(`First: ${first}`, 'ga');
                const row = mk('div', 'anim-row');
                g.appendChild(row);
                stageEl.appendChild(g);
                if (isTensVal(first)) {
                    setCaption(MERGE_HINT);
                    const n = Math.round(first / 10);
                    const stale = await buildTens(row, n, emoji, 'ga', token);
                    if (stale) return done('');
                    badgeBigsByTens();
                    return done(n === 1
                        ? `First! Let's make a ten! One big means 10!`
                        : `First! ${n} tens!`);
                }
                const r = await popSmalls(row, first, emoji, 'ga', token);
                ones = r.items;
                if (r.stale) return done('');
                setCaption('');
                return done('First! Count them!');
            }
            if (anim.mode === 'takeaway') {
                const g = groupShell(`Here are ${anim.a}`, 'ga');
                const row = mk('div', 'anim-row');
                g.appendChild(row);
                stageEl.appendChild(g);
                const r = await popSmalls(row, anim.a, emoji, 'ga', token);
                items = r.items;
                if (r.stale) return done('');
                setCaption('');
                return done(`Here are ${anim.a}! Count them!`);
            }
        }

        /* ---- step 2: group B ---- */
        if (step === 2) {
            const total = Number(q.answer);
            if (anim.mode === 'singles') {
                const g = groupShell(`Then: ${anim.b} more`, 'gb');
                const row = mk('div', 'anim-row');
                g.appendChild(row);
                stageEl.appendChild(g);
                const r = await popSmalls(row, anim.b, emoji, 'gb', token);
                items = items.concat(r.items);
                if (r.stale) return done('');
                setCaption('');
                return done(`And ${anim.b} more!`);
            }
            if (anim.mode === 'tens') {
                const g = groupShell('Then', 'gb');
                const row = mk('div', 'anim-row');
                g.appendChild(row);
                stageEl.appendChild(g);
                const n = Math.round(anim.tensB / 10);
                const stale = await buildTens(row, n, emoji, 'gb', token, { skipFull: false });
                if (stale) return done('');
                badgeBigsByTens();
                return done(`And ${n} more ten${n > 1 ? 's' : ''}!`);
            }
            if (anim.mode === 'mixed') {
                // Group B = SECOND operand, whatever it is.
                const first = Math.round(anim.aVal);
                const second = Math.round(anim.bVal);
                const g = groupShell(`Then: ${second}`, 'gb');
                const row = mk('div', 'anim-row');
                g.appendChild(row);
                stageEl.appendChild(g);
                if (isTensVal(second)) {
                    const n = Math.round(second / 10);
                    const stale = await buildTens(row, n, emoji, 'gb', token, { skipFull: false });
                    if (stale) return done('');
                    badgeBigsByTens();
                    return done(`And ${n} tens!`);
                }
                const r = await popSmalls(row, second, emoji, 'gb', token);
                ones = ones.concat(r.items);
                if (r.stale) return done('');
                // Ones after tens count on from the tens value.
                const tensVal = mixedTensOf(anim);
                badgeOnes(tensVal);
                setCaption('');
                return done(`And ${second} more!`);
            }
            if (anim.mode === 'takeaway') {
                // Mark the last b items: circled, then fly away.
                const doomed = items.slice(-anim.b);
                doomed.forEach((s) => s.classList.add('doomed'));
                await sleep(650);
                if (token !== runToken) return done('');
                doomed.forEach((s) => s.classList.add('gone'));
                await sleep(SETTLE_MS);
                if (token !== runToken) return done('');
                setCaption('');
                return done(`Bye-bye, ${anim.b}!`);
            }
        }

        /* ---- step 3: altogether ---- */
        if (step === 3) {
            const total = Number(q.answer);
            if (anim.mode === 'singles') badgeSingles();
            if (anim.mode === 'tens') badgeBigsByTens();
            if (anim.mode === 'mixed') { badgeBigsByTens(); badgeOnes(isTensVal(Math.round(anim.aVal)) ? mixedTensOf(anim) : 0); }
            finalePop();
            await sleep(500);
            if (token !== runToken) return done('');
            if (anim.mode === 'takeaway') {
                const left = items.length - anim.b;
                setCaption('');
                return done(`${left} left!`);
            }
            if (anim.mode === 'mixed') {
                const first = Math.round(anim.aVal);
                const second = Math.round(anim.bVal);
                const tensVal = mixedTensOf(anim);
                const onesVal = total - tensVal;
                setCaption('');
                return done(`Altogether — ${total}! That's ${tensVal} and ${onesVal}!`);
            }
            if (anim.mode === 'tens') {
                setCaption('');
                return done(`Altogether — ${total}!`);
            }
            setCaption('');
            return done(`Altogether — ${total}!`);
        }

        return done('');
    }

    window.LearnMathAnim = { supports, start, advance, reset };
})();
