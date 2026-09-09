/* ==========================================================================
 * Math Level 1 generator — kid-friendly addition & subtraction.
 *
 * Same rules as the original single-file learn.js, with one bug fix:
 * the old code had `else if (caseId === 2)` twice, so the "two multiples
 * of 10" branch was unreachable. Fixed to caseId === 3 below.
 *
 * Cases (picked at random):
 *   (1) two single-digit addends whose sum is <= 10,
 *   (2) one single-digit number + a multiple of 10 (10..90), tens on
 *       either side (2 + 50 or 50 + 2),
 *   (3) two multiples of 10 (10/20/30…) totalling <= 90,
 *   (4) subtraction of two single digits (result never negative).
 * No user input — the answer is revealed on demand.
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

    function generateMathLevel1() {
        const caseId = randInt(1, 4);
        let a, b, text, answer, operator;

        if (caseId === 1) {
            // Both single-digit, sum <= 10.
            a = randInt(1, 9);
            b = randInt(1, 10 - a);
            operator = '+';
        } else if (caseId === 2) {
            // Single-digit plus a multiple of 10 (10..90) — tens on
            // either side, e.g. 2 + 50 or 50 + 2.
            const onesN = randInt(1, 9);
            const tensN = randInt(1, 9) * 10;
            if (Math.random() < 0.5) { a = onesN; b = tensN; }
            else { a = tensN; b = onesN; }
            operator = '+';
        } else if (caseId === 3) {
            // Two multiples of 10, total <= 90. (Was unreachable before
            // the duplicate-`caseId === 2` fix.)
            a = randInt(1, 8) * 10;              // 10..80
            b = randInt(1, (90 - a) / 10) * 10;  // 10..(90-a)
            operator = '+';
        } else {
            // Subtraction never negative.
            a = randInt(1, 10);
            b = randInt(1, a); // b <= a, so a - b >= 0
            operator = '-';
        }

        text = `${a} ${operator} ${b}`;
        answer = String(operator === '+' ? a + b : a - b);

        // `prompt` is owned by the generator (not inferred in ui.js) so
        // Math-specific terms like "sum"/"difference" never leak into the
        // generic renderer.
        const prompt = operator === '-' ? 'What is the difference?' : 'What is the sum?';

        // Animation spec for the 3-tap reveal stepper (learn/math-anim.js):
        //   singles  -> case 1: a + b small items, all countable (total <= 10)
        //   mixed    -> case 2: operands in question order (tens may be
        //               first or second); stepper renders A then B as asked
        //   tens     -> case 3: a/10 + b/10 big items, each big earned by a
        //               visible 10-small-merge-into-1-big (first full, rest
        //               shorthand)
        //   takeaway -> case 4: a items, b fly away
        let anim;
        if (operator === '-') {
            anim = { mode: 'takeaway', a, b };
        } else if (caseId === 1) {
            anim = { mode: 'singles', a, b };
        } else if (caseId === 2) {
            // Operands in question order (tens may be first or second);
            // the stepper renders group A then B to match the question.
            anim = { mode: 'mixed', aVal: a, bVal: b };
        } else {
            anim = { mode: 'tens', tensA: a, tensB: b };
        }

        return {
            type: 'math',
            category: 'level1',
            display: 'math',
            kind: operator === '-' ? 'subtract' : 'add',
            text,
            answer,
            answerSentence: null,
            hint: null,
            operator,
            prompt,
            emoji: pickEmoji(),
            anim
        };
    }

    if (window.LearnCore) {
        window.LearnCore.registerGenerator('math', 'level1', generateMathLevel1);
    }
})();
