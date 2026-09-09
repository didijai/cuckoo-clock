/* ==========================================================================
 * Math generators — one pure generator per category (4 cases that used to
 * be picked at random inside a single "Level 1").
 *
 *   within10  -> two single-digit addends whose sum is <= 10
 *   tens-ones -> single digit + a multiple of 10 (tens on either side)
 *   tens-tens -> two multiples of 10 totalling <= 90
 *   takeaway  -> subtraction of two single digits (never negative)
 *
 * Core picks a random category across the user's multi-selected set, so
 * selecting all four reproduces the old uniform mix. No user input — the
 * answer is revealed on demand (animated in full-tab mode).
 * ========================================================================== */

(function () {
    'use strict';

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // One emoji per question (kept consistent through ask + animation so
    // small and big items are visibly the same thing, different size).
    const ANIM_EMOJI = ['🍎', '⭐', '🎈', '🐟', '🍪', '⚽'];
    function pickEmoji() {
        return ANIM_EMOJI[Math.floor(Math.random() * ANIM_EMOJI.length)];
    }

    // Shared shape. `category` is passed explicitly by each generator
    // (never derived from anim.mode — a new mode must not silently land
    // in the wrong bucket). `prompt` is owned by the generator (not
    // inferred in ui.js) so Math-specific terms like "sum"/"difference"
    // never leak into the generic renderer.
    function build(operator, a, b, category, anim) {
        const text = `${a} ${operator} ${b}`;
        const answer = String(operator === '+' ? a + b : a - b);
        return {
            type: 'math',
            category,
            display: 'math',
            kind: operator === '-' ? 'subtract' : 'add',
            text,
            answer,
            answerSentence: null,
            hint: null,
            operator,
            prompt: operator === '-' ? 'What is the difference?' : 'What is the sum?',
            emoji: pickEmoji(),
            anim
        };
    }

    // Both single-digit, sum <= 10.
    function generateWithin10() {
        const a = randInt(1, 9);
        const b = randInt(1, 10 - a);
        return build('+', a, b, 'within10', { mode: 'singles', a, b });
    }

    // Single-digit plus a multiple of 10 (10..90) — tens on either side,
    // e.g. 2 + 50 or 50 + 2. Animation renders A-then-B in question order.
    function generateTensOnes() {
        const onesN = randInt(1, 9);
        const tensN = randInt(1, 9) * 10;
        let a, b;
        if (Math.random() < 0.5) { a = onesN; b = tensN; }
        else { a = tensN; b = onesN; }
        return build('+', a, b, 'tens-ones', { mode: 'mixed', aVal: a, bVal: b });
    }

    // Two multiples of 10, total <= 90.
    function generateTensTens() {
        const a = randInt(1, 8) * 10;              // 10..80
        const b = randInt(1, (90 - a) / 10) * 10;  // 10..(90-a)
        return build('+', a, b, 'tens-tens', { mode: 'tens', tensA: a, tensB: b });
    }

    // Subtraction never negative.
    function generateTakeaway() {
        const a = randInt(1, 10);
        const b = randInt(1, a); // b <= a, so a - b >= 0
        return build('-', a, b, 'takeaway', { mode: 'takeaway', a, b });
    }

    if (window.LearnCore) {
        window.LearnCore.registerGenerator('math', 'within10', generateWithin10);
        window.LearnCore.registerGenerator('math', 'tens-ones', generateTensOnes);
        window.LearnCore.registerGenerator('math', 'tens-tens', generateTensTens);
        window.LearnCore.registerGenerator('math', 'takeaway', generateTakeaway);
    }
})();
