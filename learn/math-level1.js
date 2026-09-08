/* ==========================================================================
 * Math Level 1 generator — kid-friendly addition & subtraction.
 *
 * Same rules as the original single-file learn.js, with one bug fix:
 * the old code had `else if (caseId === 2)` twice, so the "two multiples
 * of 10" branch was unreachable. Fixed to caseId === 3 below.
 *
 * Cases (picked at random):
 *   (1) two single-digit addends whose sum is <= 10,
 *   (2) one single-digit number + a multiple of 10 (10..90),
 *   (3) two multiples of 10 (10/20/30…) totalling <= 90,
 *   (4) subtraction of two single digits (result never negative).
 * No user input — the answer is revealed on demand.
 * ========================================================================== */

(function () {
    'use strict';

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
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
            // Single-digit number plus a multiple of 10 (10..90).
            a = randInt(1, 9);
            b = randInt(1, 9) * 10;
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
            prompt
        };
    }

    if (window.LearnCore) {
        window.LearnCore.registerGenerator('math', 'level1', generateMathLevel1);
    }
})();
