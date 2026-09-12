/* ==========================================================================
 * Drawing generator — listen-and-draw instruction game (English).
 *
 * Four themed categories (picked from the 50 cases below):
 *   draw-shapes   -> Cases 1-10:   shapes, colours + positions
 *   draw-objects  -> Cases 11-25:  numbers, size + everyday objects
 *   draw-nature   -> Cases 26-40:  animals, nature + environments
 *   draw-scenes   -> Cases 41-50:  multi-step scenarios + details
 *
 * Question shape (same lifecycle as other subjects via LearnCore):
 *   steps          -> ordered instructions, one per tap (usually 3)
 *   text           -> first step (fallback for generic renderers)
 *   prompt         -> owned here so ui.js never hard-codes wording
 *   spokenQuestion -> first step (ui.js speaks the CURRENT step instead)
 *   praise         -> spoken once when the last step is finished
 *   display: 'drawing' (ui.js steps through one instruction at a time),
 *   kind: 'draw'.
 * ========================================================================== */

(function () {
    'use strict';

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    const PRAISE = [
        'Great drawing! Well done!',
        'Amazing! You did it!',
        'Wonderful drawing! High five!'
    ];

    /* ---------------- Shapes, colours + positions (Cases 1-10) ---------------- */
    const SHAPES_CASES = [
        [
            'Draw a big blue circle in the middle.',
            'Draw a small red triangle inside the circle.',
            'Draw a yellow star on top of the circle.'
        ],
        [
            'Draw a green square in the center.',
            'Draw a small blue door inside the square.',
            'Draw an orange window next to the square.'
        ],
        [
            'Draw a purple rectangle.',
            'Draw three red dots inside the rectangle.',
            'Draw a pink line around the rectangle.'
        ],
        [
            'Draw a yellow sun in the top-right corner.',
            'Draw two blue clouds next to the sun.'
        ],
        [
            'Draw a black line at the bottom of the page.',
            'Draw a red apple on the line.',
            'Draw a green leaf on top of the apple.'
        ],
        [
            'Draw a brown table in the center.',
            'Draw a blue cup on top of the table.',
            'Draw a red ball under the table.'
        ],
        [
            'Draw a big orange heart.',
            'Draw a small yellow heart inside it.',
            'Draw a green cross above the big heart.'
        ],
        [
            'Draw a pink box in the bottom-left corner.',
            'Draw two green dots inside the box.',
            'Draw a blue star outside the box.'
        ],
        [
            'Draw a grey cloud in the middle.',
            'Draw three blue raindrops falling down from the cloud.',
            'Draw a yellow lightning bolt beside the cloud.'
        ],
        [
            'Draw a red triangle in the center.',
            'Draw a green stem underneath the triangle.',
            'Draw two pink circles at the bottom of the stem.'
        ]
    ];

    /* ---------------- Numbers, size + everyday objects (Cases 11-25) ---------------- */
    const OBJECTS_CASES = [
        [
            'Draw a yellow birthday cake.',
            'Put four blue candles on top of the cake.',
            'Draw a red cherry on the middle candle.'
        ],
        [
            'Draw a big red balloon.',
            'Draw a long black string tied to the balloon.',
            'Draw two small green balloons next to it.'
        ],
        [
            'Draw a brown tree in the center.',
            'Draw five red apples on the tree.',
            'Draw one yellow banana on the grass.'
        ],
        [
            'Draw a long blue pencil in the middle.',
            'Draw a red eraser on the left side of the pencil.',
            'Draw a yellow sharpener on the right side.'
        ],
        [
            'Draw a green caterpillar on a brown leaf.',
            'Draw three red dots on its back.',
            'Draw a yellow circle for its head.'
        ],
        [
            'Draw an orange fish in the middle.',
            'Draw three small blue bubbles above the fish.',
            'Draw green seaweed on the left side.'
        ],
        [
            'Draw a red car body.',
            'Draw two black wheels at the bottom.',
            'Draw a yellow star painted on the car door.'
        ],
        [
            'Draw a purple backpack.',
            'Draw a red ruler sticking out from the top zipper.',
            'Draw a green water bottle in the side pocket.'
        ],
        [
            'Draw a yellow wall clock.',
            'Draw a short black hand pointing up.',
            'Draw a long red hand pointing right.'
        ],
        [
            'Draw a brown teddy bear.',
            'Draw a big red bow tie on its neck.',
            'Draw a blue button on its left ear.'
        ],
        [
            'Draw an open blue umbrella.',
            'Draw three pink raindrops on the left side.',
            'Draw one yellow raindrop on the right side.'
        ],
        [
            'Draw a brown ice cream cone.',
            'Draw two pink scoops of ice cream on top.',
            'Draw one red cherry on top of the scoops.'
        ],
        [
            'Draw a big green pizza triangle.',
            'Draw four red pepperoni circles on the pizza.',
            'Draw three yellow cheese shapes around them.'
        ],
        [
            'Draw an orange boat on blue water.',
            'Draw a white sail on top of the boat.',
            'Draw a small red flag on top of the sail.'
        ],
        [
            'Draw a red mailbox.',
            'Draw a yellow letter sticking out of the slot.',
            'Draw a small blue bird sitting on top of the mailbox.'
        ]
    ];

    /* ---------------- Animals, nature + environments (Cases 26-40) ---------------- */
    const NATURE_CASES = [
        [
            'Draw green grass at the bottom of the page.',
            'Draw a big yellow sunflower on the left side.',
            'Draw a small bee flying on the right side.'
        ],
        [
            'Draw a blue pond in the middle.',
            'Draw two yellow ducks inside the pond.',
            'Draw three green plants on the edge of the pond.'
        ],
        [
            'Draw a large brown mountain.',
            'Draw white snow on top of the mountain peak.',
            'Draw a green tree at the foot of the mountain.'
        ],
        [
            'Draw a grey elephant body.',
            'Draw two big blue ears on the head.',
            'Draw a red flower held in its trunk.'
        ],
        [
            'Draw a yellow giraffe with a long neck.',
            'Draw five brown spots on its neck.',
            'Draw a green leaf in its mouth.'
        ],
        [
            'Draw a yellow crescent moon in the top-left corner.',
            'Draw four white stars scattered across the sky.',
            'Draw a dark blue cloud under the moon.'
        ],
        [
            'Draw yellow sand at the bottom half of the page.',
            'Draw blue ocean water above the sand.',
            'Draw a small red crab walking on the sand.'
        ],
        [
            'Draw a green lily pad.',
            'Draw a green frog sitting on top of the lily pad.',
            'Draw a small black fly in the air above the frog.'
        ],
        [
            'Draw a brown birdhouse hanging from a tree branch.',
            'Draw a yellow bird looking out from the entrance hole.',
            'Draw a red worm sitting on the tree branch.'
        ],
        [
            'Draw an arc rainbow with red, yellow, and blue stripes.',
            'Draw a fluffy white cloud at the left end of the rainbow.',
            'Draw a fluffy white cloud at the right end.'
        ],
        [
            'Draw a pink flamingo standing on one leg.',
            'Draw blue water around its foot.',
            'Draw a brown palm tree on the left side.'
        ],
        [
            'Draw an orange tiger body.',
            'Draw three black stripes across its back.',
            'Draw a small red ball in front of its paws.'
        ],
        [
            "Draw a brown bird's nest in a green tree.",
            'Draw two blue eggs inside the nest.',
            'Draw a mother yellow bird standing beside the nest.'
        ],
        [
            'Draw a yellow butterfly in the center.',
            'Draw two purple dots on each wing.',
            'Draw a red flower beneath the butterfly.'
        ],
        [
            'Draw a tall brown coconut tree.',
            'Draw three brown coconuts under the green leaves.',
            'Draw a bright yellow sun in the sky.'
        ]
    ];

    /* ---------------- Multi-step scenarios + details (Cases 41-50) ---------------- */
    const SCENES_CASES = [
        [
            'Draw a red house with a brown triangular roof.',
            'Draw a blue chimney on top of the roof with grey smoke coming out.',
            'Draw a happy boy standing on the left side of the house door.'
        ],
        [
            'Draw green park grass at the bottom.',
            'Draw a red swing set in the center.',
            'Draw a girl wearing a pink dress sitting on the swing.'
        ],
        [
            'Draw a yellow school bus.',
            'Draw three square blue windows along the side.',
            'Draw a bus driver wearing a black hat visible inside the front window.'
        ],
        [
            'Draw a brown dining table.',
            'Draw two white plates on top of the table.',
            'Draw a red apple on the left plate and a yellow banana on the right plate.'
        ],
        [
            'Draw a big purple planet in dark space.',
            'Draw a gold ring around the middle of the planet.',
            'Draw a small green rocket flying on the left.'
        ],
        [
            'Draw a big grey whale in the ocean.',
            'Draw a spout of blue water coming out from its blowhole.',
            'Draw two small pink fish swimming under the whale.'
        ],
        [
            'Draw a triangular red tent on green grass.',
            'Draw a small yellow and orange campfire in front of the tent.',
            'Draw a black lantern sitting on the right side of the tent.'
        ],
        [
            'Draw a snowman made of three stacked white circles.',
            'Draw an orange carrot nose and two black dot eyes on the head.',
            'Draw a red scarf wrapped around its neck and a black hat on top.'
        ],
        [
            "Draw a large red 'X' mark on an island map.",
            "Draw a brown treasure chest right next to the 'X'.",
            'Draw a green palm tree in the top-right corner of the map.'
        ],
        [
            'Draw a party table covered with a green tablecloth.',
            'Draw a square blue present with a red bow on top of the table.',
            'Draw three colorful balloons tied to the leg of the table.'
        ]
    ];

    function buildDrawing(category, cases) {
        const steps = pick(cases).slice(); // copy: ui.js never mutates, but stay safe
        return {
            type: 'english',
            category,
            display: 'drawing',
            kind: 'draw',
            text: steps[0],
            answer: '',
            answerSentence: null,
            hint: null,
            steps,
            prompt: 'Listen and draw',
            spokenQuestion: steps[0],
            spokenAnswer: null,
            praise: pick(PRAISE)
        };
    }

    function generateDrawShapes() {
        return buildDrawing('draw-shapes', SHAPES_CASES);
    }

    function generateDrawObjects() {
        return buildDrawing('draw-objects', OBJECTS_CASES);
    }

    function generateDrawNature() {
        return buildDrawing('draw-nature', NATURE_CASES);
    }

    function generateDrawScenes() {
        return buildDrawing('draw-scenes', SCENES_CASES);
    }

    if (window.LearnCore) {
        window.LearnCore.registerGenerator('english', 'draw-shapes', generateDrawShapes);
        window.LearnCore.registerGenerator('english', 'draw-objects', generateDrawObjects);
        window.LearnCore.registerGenerator('english', 'draw-nature', generateDrawNature);
        window.LearnCore.registerGenerator('english', 'draw-scenes', generateDrawScenes);
    }
})();
