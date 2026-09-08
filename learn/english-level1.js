/* ==========================================================================
 * English Level 1 generator — very easy K3 word problems.
 *
 * Mirrors Math Level 1 difficulty (totals <= 10, subtraction never
 * negative) so both Level 1 subjects feel the same. Each call picks one
 * of 10 story templates at random: 5 addition + 5 subtraction.
 *
 * Question shape (same lifecycle as Math via LearnCore):
 *   text           -> full story shown on the card, e.g.
 *                     "Ben has 2 apples. Dad gives Ben 2 more apples.
 *                      How many apples does Ben have?"
 *   answer         -> short display answer, e.g. "4 apples"
 *   answerSentence -> full sentence shown under the answer on reveal, e.g.
 *                     "Ben has 4 apples."
 *   spokenQuestion -> what TTS reads on card click / New Question
 *                     (the question ONLY, never the answer).
 *   spokenAnswer   -> what TTS reads on Reveal, spoken ONCE as a
 *                     natural sentence (same as answerSentence), e.g.
 *                     "Ben has 4 apples.".
 *   prompt         -> small label above the story ("Read and answer").
 *   display: 'story' (ui.js switches to wrapped small font),
 *   kind: 'add' | 'subtract'.
 * ========================================================================== */

(function () {
    'use strict';

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // Kid-friendly cast (short, TTS-friendly names).
    const KIDS = ['Ben', 'Mia', 'Sam', 'Lily', 'Tom', 'Anna'];
    const GIVERS = ['Dad', 'Mum', 'Grandma', 'Teacher', 'Sister'];
    const FRIENDS = ['Lucy', 'Jack', 'Emma', 'Leo', 'Nina'];

    // Countable nouns with explicit plurals (no naive +s guessing).
    const FOODS = [
        { single: 'apple', plural: 'apples' },
        { single: 'orange', plural: 'oranges' },
        { single: 'banana', plural: 'bananas' },
        { single: 'cookie', plural: 'cookies' },
        { single: 'candy', plural: 'candies' }
    ];
    const TOYS = [
        { single: 'ball', plural: 'balls' },
        { single: 'toy', plural: 'toys' },
        { single: 'balloon', plural: 'balloons' },
        { single: 'flower', plural: 'flowers' }
    ];
    const ANIMALS = [
        { single: 'bird', plural: 'birds' },
        { single: 'fish', plural: 'fish' },
        { single: 'duck', plural: 'ducks' },
        { single: 'frog', plural: 'frogs' }
    ];

    // "2 apples" / "1 apple" / "3 fish" (fish plural == singular).
    function count(n, noun) {
        return `${n} ${(n === 1 ? noun.single : noun.plural)}`;
    }

    // Bare plural for "How many apples …?" lines.
    function many(noun) {
        return noun.plural;
    }

    /* ---------------- 5 ADDITION templates (total <= 10) ---------------- */
    const ADD_TEMPLATES = [
        // A1: Ben has 2 apples. Dad gives Ben 2 more apples. How many …?
        (a, b, ctx) => {
            const total = a + b;
            const text =
                `${ctx.name} has ${count(a, ctx.item)}. ` +
                `${ctx.giver} gives ${ctx.name} ${count(b, ctx.item)}. ` +
                `How many ${many(ctx.item)} does ${ctx.name} have?`;
            return {
                text,
                total,
                answer: count(total, ctx.item),
                answerSentence: `${ctx.name} has ${count(total, ctx.item)}.`
            };
        },
        // A2: Mia sees 3 balls on the table. She puts 2 more balls there…
        (a, b, ctx) => {
            const total = a + b;
            const text =
                `${ctx.name} sees ${count(a, ctx.item)} on the table. ` +
                `${ctx.name} puts ${count(b, ctx.item)} there. ` +
                `How many ${many(ctx.item)} are there now?`;
            return {
                text,
                total,
                answer: count(total, ctx.item),
                answerSentence: `There are ${count(total, ctx.item)} now.`
            };
        },
        // A3: There are 2 toys in the box. Sam puts 3 more toys in the box…
        (a, b, ctx) => {
            const total = a + b;
            const text =
                `There are ${count(a, ctx.item)} in the box. ` +
                `${ctx.name} puts ${count(b, ctx.item)} in the box. ` +
                `How many ${many(ctx.item)} are in the box now?`;
            return {
                text,
                total,
                answer: count(total, ctx.item),
                answerSentence: `There are ${count(total, ctx.item)} in the box now.`
            };
        },
        // A4: Lily draws 2 flowers. Then she draws 1 more flower…
        (a, b, ctx) => {
            const total = a + b;
            const text =
                `${ctx.name} draws ${count(a, ctx.item)}. ` +
                `Then ${ctx.name} draws ${count(b, ctx.item)}. ` +
                `How many ${many(ctx.item)} did ${ctx.name} draw?`;
            return {
                text,
                total,
                answer: count(total, ctx.item),
                answerSentence: `${ctx.name} drew ${count(total, ctx.item)}.`
            };
        },
        // A5: There are 3 birds on the tree. 2 more birds come…
        (a, b, ctx) => {
            const total = a + b;
            const text =
                `There are ${count(a, ctx.animal)} on the tree. ` +
                `${b} more ${many(ctx.animal)} come. ` +
                `How many ${many(ctx.animal)} are on the tree now?`;
            return {
                text,
                total,
                answer: count(total, ctx.animal),
                answerSentence: `There are ${count(total, ctx.animal)} on the tree now.`
            };
        }
    ];

    /* ---------------- 5 SUBTRACTION templates (never negative) ---------------- */
    const SUB_TEMPLATES = [
        // S1: Ben has 5 apples. Ben eats 2 apples. How many … now?
        // NOTE: eats only uses ctx.food (FOODS), never toys — kids can't
        // eat balls/toys/balloons.
        (a, b, ctx) => {
            const total = a - b;
            const text =
                `${ctx.name} has ${count(a, ctx.food)}. ` +
                `${ctx.name} eats ${count(b, ctx.food)}. ` +
                `How many ${many(ctx.food)} does ${ctx.name} have now?`;
            return {
                text,
                total,
                answer: count(total, ctx.food),
                answerSentence: `${ctx.name} has ${count(total, ctx.food)} now.`
            };
        },
        // S2: Mia has 4 candies. Mia gives 1 candy to Jack. How many … left?
        (a, b, ctx) => {
            const total = a - b;
            const text =
                `${ctx.name} has ${count(a, ctx.item)}. ` +
                `${ctx.name} gives ${count(b, ctx.item)} to ${ctx.friend}. ` +
                `How many ${many(ctx.item)} does ${ctx.name} have left?`;
            return {
                text,
                total,
                answer: count(total, ctx.item),
                answerSentence: `${ctx.name} has ${count(total, ctx.item)} left.`
            };
        },
        // S3: There are 6 fish in the pond. 2 fish swim away…
        (a, b, ctx) => {
            const total = a - b;
            const text =
                `There are ${count(a, ctx.animal)} in the pond. ` +
                `${cap(count(b, ctx.animal))} swim away. ` +
                `How many ${many(ctx.animal)} are left?`;
            return {
                text,
                total,
                answer: count(total, ctx.animal),
                answerSentence: `There are ${count(total, ctx.animal)} left.`
            };
        },
        // S4: Tom has 5 balloons. 2 balloons fly away…
        (a, b, ctx) => {
            const total = a - b;
            const noun = { single: 'balloon', plural: 'balloons' };
            const text =
                `${ctx.name} has ${count(a, noun)}. ` +
                `${cap(count(b, noun))} fly away. ` +
                `How many balloons does ${ctx.name} have now?`;
            return {
                text,
                total,
                answer: count(total, noun),
                answerSentence: `${ctx.name} has ${count(total, noun)} now.`
            };
        },
        // S5: There are 7 cookies on the table. Anna takes 3 cookies…
        (a, b, ctx) => {
            const total = a - b;
            const noun = { single: 'cookie', plural: 'cookies' };
            const text =
                `There are ${count(a, noun)} on the table. ` +
                `${ctx.name} takes ${count(b, noun)}. ` +
                `How many cookies are left?`;
            return {
                text,
                total,
                answer: count(total, noun),
                answerSentence: `There are ${count(total, noun)} left.`
            };
        }
    ];

    function cap(s) {
        if (!s) return s;
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function makeContext() {
        const name = pick(KIDS);
        // Friend must differ from the main kid even if the name lists
        // overlap in future (re-pick instead of a hardcoded fallback).
        let friend = pick(FRIENDS);
        while (friend === name) friend = pick(FRIENDS);
        return {
            name,
            giver: pick(GIVERS),
            friend,
            item: pick(FOODS.concat(TOYS)),
            food: pick(FOODS),
            animal: pick(ANIMALS)
        };
    }

    function generateEnglishLevel1() {
        const isAdd = Math.random() < 0.5;
        let a, b;

        if (isAdd) {
            // Same bound as Math L1 case 1: both parts small, total <= 10.
            a = randInt(1, 9);
            b = randInt(1, 10 - a);
        } else {
            // Same bound as Math L1 subtraction: a 1..10, b <= a.
            a = randInt(2, 10);
            b = randInt(1, a);
        }

        const ctx = makeContext();
        const templates = isAdd ? ADD_TEMPLATES : SUB_TEMPLATES;
        const build = pick(templates);
        const built = build(a, b, ctx);

        // Singular grammar guards for b === 1 ("1 more birds come" ->
        // "1 more bird comes", "1 fish swim" -> "1 fish swims", etc.).
        let text = built.text
            .replace(/1 more (\w+)s come\./, '1 more $1 comes.')
            .replace(/1 more fish come\./, '1 more fish comes.')
            .replace(/1 (\w+) swim away\./, '1 $1 swims away.')
            .replace(/1 balloons fly away\./, '1 balloon flies away.')
            .replace(/1 balloon fly away\./, '1 balloon flies away.');

        return {
            type: 'english',
            category: 'level1',
            display: 'story',
            kind: isAdd ? 'add' : 'subtract',
            text,
            answer: built.answer,
            answerSentence: built.answerSentence,
            hint: null,
            prompt: 'Read and answer',
            // Speak the question ONLY (never the answer) — card click and
            // New Question use this. Reveal speaks spokenAnswer once below.
            spokenQuestion: text,
            spokenAnswer: built.answerSentence
        };
    }

    if (window.LearnCore) {
        window.LearnCore.registerGenerator('english', 'level1', generateEnglishLevel1);
    }
})();
