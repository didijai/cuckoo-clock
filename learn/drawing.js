/* ==========================================================================
 * Drawing generator — listen-and-draw instruction game (English).
 *
 * Four themed categories (picked from the 50 cases below):
 *   draw-shapes   -> Cases 1-10:   shapes, colours + positions
 *   draw-objects  -> Cases 11-25:  numbers, size + everyday objects
 *   draw-nature   -> Cases 26-40:  animals, nature + environments
 *   draw-scenes   -> Cases 41-50:  multi-step scenarios + details
 *
 * Each case = { s: [step instructions], a: [answer art per step] }.
 * The art is shape specs rendered by draw-art.js as simple line
 * drawings on a 300x220 canvas — real colours, sizes and positions,
 * so the full-tab stage builds the correct drawing token-by-token as
 * steps are tapped. s[i] and a[i] must stay paired and same-length.
 *
 * Question shape (same lifecycle as other subjects via LearnCore):
 *   steps          -> ordered instructions, one per tap (usually 3)
 *   art            -> shape-spec array per step, same length as steps
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
        {
            s: [
                'Draw a big blue circle in the middle.',
                'Draw a small red triangle inside the circle.',
                'Draw a yellow star on top of the circle.'
            ],
            a: [
                [{ t: 'c', c: 'blue', x: 150, y: 108, r: 36 }],
                [{ t: 'tri', c: 'red', x: 138, y: 96, w: 24, h: 20 }],
                [{ t: 'star', c: 'yellow', x: 150, y: 48, r: 14 }]
            ]
        },
        {
            s: [
                'Draw a green square in the center.',
                'Draw a small blue door inside the square.',
                'Draw an orange window next to the square.'
            ],
            a: [
                [{ t: 'r', c: 'green', x: 96, y: 74, w: 64, h: 64 }],
                [{ t: 'r', c: 'blue', x: 119, y: 100, w: 20, h: 38, rx: 2 }],
                [
                    { t: 'r', c: 'orange', x: 176, y: 88, w: 28, h: 28 },
                    { t: 'ln', c: 'white', x1: 176, y1: 102, x2: 204, y2: 102, w: 3 },
                    { t: 'ln', c: 'white', x1: 190, y1: 88, x2: 190, y2: 116, w: 3 }
                ]
            ]
        },
        {
            s: [
                'Draw a purple rectangle.',
                'Draw three red dots inside the rectangle.',
                'Draw a pink line around the rectangle.'
            ],
            a: [
                [{ t: 'r', c: 'purple', x: 105, y: 80, w: 90, h: 60, rx: 4 }],
                [{ t: 'dots', c: 'red', p: [[130, 100, 5], [150, 110, 5], [170, 100, 5]] }],
                [{ t: 'r', c: 'pink', x: 97, y: 72, w: 106, h: 76, f: 0, sw: 5 }]
            ]
        },
        {
            s: [
                'Draw a yellow sun in the top-right corner.',
                'Draw two blue clouds next to the sun.'
            ],
            a: [
                [{ t: 'sun', c: 'yellow', x: 252, y: 42, r: 20 }],
                [
                    { t: 'cloud', c: 'blue', x: 196, y: 58, s: 1 },
                    { t: 'cloud', c: 'blue', x: 222, y: 78, s: 0.7 }
                ]
            ]
        },
        {
            s: [
                'Draw a black line at the bottom of the page.',
                'Draw a red apple on the line.',
                'Draw a green leaf on top of the apple.'
            ],
            a: [
                [{ t: 'ln', c: 'black', x1: 40, y1: 192, x2: 260, y2: 192, w: 5 }],
                [
                    { t: 'c', c: 'red', x: 150, y: 174, r: 16 },
                    { t: 'ln', c: 'brown', x1: 150, y1: 158, x2: 150, y2: 148, w: 4 }
                ],
                [{ t: 'e', c: 'green', x: 160, y: 144, rx: 10, ry: 5, rot: -30 }]
            ]
        },
        {
            s: [
                'Draw a brown table in the center.',
                'Draw a blue cup on top of the table.',
                'Draw a red ball under the table.'
            ],
            a: [
                [
                    { t: 'r', c: 'brown', x: 100, y: 122, w: 100, h: 14 },
                    { t: 'ln', c: 'brown', x1: 112, y1: 136, x2: 112, y2: 168, w: 5 },
                    { t: 'ln', c: 'brown', x1: 188, y1: 136, x2: 188, y2: 168, w: 5 }
                ],
                [
                    { t: 'r', c: 'blue', x: 140, y: 98, w: 20, h: 24, rx: 3 },
                    { t: 'ln', c: 'blue', x1: 160, y1: 104, x2: 167, y2: 104, w: 3 }
                ],
                [{ t: 'c', c: 'red', x: 150, y: 184, r: 12 }]
            ]
        },
        {
            s: [
                'Draw a big orange heart.',
                'Draw a small yellow heart inside it.',
                'Draw a green cross above the big heart.'
            ],
            a: [
                [{ t: 'heart', c: 'orange', x: 150, y: 112, s: 6 }],
                [{ t: 'heart', c: 'yellow', x: 150, y: 112, s: 2.4 }],
                [{ t: 'plus', c: 'green', x: 150, y: 34, s: 18 }]
            ]
        },
        {
            s: [
                'Draw a pink box in the bottom-left corner.',
                'Draw two green dots inside the box.',
                'Draw a blue star outside the box.'
            ],
            a: [
                [{ t: 'r', c: 'pink', x: 36, y: 140, w: 56, h: 56, rx: 6 }],
                [{ t: 'dots', c: 'green', p: [[54, 162, 5], [74, 162, 5]] }],
                [{ t: 'star', c: 'blue', x: 208, y: 84, r: 15 }]
            ]
        },
        {
            s: [
                'Draw a grey cloud in the middle.',
                'Draw three blue raindrops falling down from the cloud.',
                'Draw a yellow lightning bolt beside the cloud.'
            ],
            a: [
                [{ t: 'cloud', c: 'grey', x: 140, y: 88, s: 1.2 }],
                [{ t: 'dots', c: 'blue', p: [[118, 124, 5], [140, 134, 5], [162, 124, 5]] }],
                [{ t: 'bolt', c: 'yellow', x: 220, y: 108, s: 1.3 }]
            ]
        },
        {
            s: [
                'Draw a red triangle in the center.',
                'Draw a green stem underneath the triangle.',
                'Draw two pink circles at the bottom of the stem.'
            ],
            a: [
                [{ t: 'tri', c: 'red', x: 125, y: 70, w: 50, h: 48 }],
                [{ t: 'ln', c: 'green', x1: 150, y1: 118, x2: 150, y2: 150, w: 5 }],
                [
                    { t: 'c', c: 'pink', x: 137, y: 160, r: 9 },
                    { t: 'c', c: 'pink', x: 163, y: 160, r: 9 }
                ]
            ]
        }
    ];

    /* ---------------- Numbers, size + everyday objects (Cases 11-25) ---------------- */
    const OBJECTS_CASES = [
        {
            s: [
                'Draw a yellow birthday cake.',
                'Put four blue candles on top of the cake.',
                'Draw a red cherry on the middle candle.'
            ],
            a: [
                [
                    { t: 'e', c: 'grey', x: 150, y: 184, rx: 52, ry: 10 },
                    { t: 'r', c: 'yellow', x: 112, y: 132, w: 76, h: 50, rx: 4 }
                ],
                [
                    { t: 'r', c: 'blue', x: 122, y: 102, w: 9, h: 30 },
                    { t: 'r', c: 'blue', x: 141, y: 102, w: 9, h: 30 },
                    { t: 'r', c: 'blue', x: 160, y: 102, w: 9, h: 30 },
                    { t: 'r', c: 'blue', x: 179, y: 102, w: 9, h: 30 },
                    { t: 'c', c: 'orange', x: 126, y: 96, r: 4 },
                    { t: 'c', c: 'orange', x: 145, y: 96, r: 4 },
                    { t: 'c', c: 'orange', x: 164, y: 96, r: 4 },
                    { t: 'c', c: 'orange', x: 183, y: 96, r: 4 }
                ],
                [{ t: 'c', c: 'red', x: 164, y: 88, r: 8 }]
            ]
        },
        {
            s: [
                'Draw a big red balloon.',
                'Draw a long black string tied to the balloon.',
                'Draw two small green balloons next to it.'
            ],
            a: [
                [
                    { t: 'c', c: 'red', x: 150, y: 86, r: 30 },
                    { t: 'tri', c: 'red', x: 144, y: 114, w: 12, h: 10, d: 'down' }
                ],
                [{ t: 'ln', c: 'black', x1: 150, y1: 124, x2: 150, y2: 192, w: 3 }],
                [
                    { t: 'c', c: 'green', x: 86, y: 124, r: 16 },
                    { t: 'tri', c: 'green', x: 81, y: 138, w: 10, h: 8, d: 'down' },
                    { t: 'c', c: 'green', x: 214, y: 124, r: 16 },
                    { t: 'tri', c: 'green', x: 209, y: 138, w: 10, h: 8, d: 'down' }
                ]
            ]
        },
        {
            s: [
                'Draw a brown tree in the center.',
                'Draw five red apples on the tree.',
                'Draw one yellow banana on the grass.'
            ],
            a: [
                [{ t: 'tree', x: 150, y: 150, s: 1.1 }],
                [{ t: 'dots', c: 'red', p: [[122, 92, 5], [142, 78, 5], [162, 84, 5], [150, 104, 5], [176, 98, 5]] }],
                [{ t: 'moon', c: 'yellow', x: 228, y: 188, r: 11 }]
            ]
        },
        {
            s: [
                'Draw a long blue pencil in the middle.',
                'Draw a red eraser on the left side of the pencil.',
                'Draw a yellow sharpener on the right side.'
            ],
            a: [
                [
                    { t: 'r', c: 'blue', x: 70, y: 102, w: 140, h: 16 },
                    { t: 'tri', c: 'tan', x: 210, y: 102, w: 22, h: 16, d: 'right' },
                    { t: 'tri', c: 'black', x: 228, y: 107, w: 8, h: 6, d: 'right' }
                ],
                [{ t: 'r', c: 'red', x: 48, y: 100, w: 22, h: 20, rx: 3 }],
                [
                    { t: 'r', c: 'yellow', x: 240, y: 98, w: 26, h: 24, rx: 4 },
                    { t: 'c', c: 'grey', x: 253, y: 110, r: 5 }
                ]
            ]
        },
        {
            s: [
                'Draw a green caterpillar on a brown leaf.',
                'Draw three red dots on its back.',
                'Draw a yellow circle for its head.'
            ],
            a: [
                [
                    { t: 'e', c: 'brown', x: 150, y: 154, rx: 72, ry: 18 },
                    { t: 'c', c: 'green', x: 100, y: 140, r: 10 },
                    { t: 'c', c: 'green', x: 120, y: 138, r: 10 },
                    { t: 'c', c: 'green', x: 140, y: 138, r: 10 },
                    { t: 'c', c: 'green', x: 160, y: 138, r: 10 },
                    { t: 'c', c: 'green', x: 180, y: 138, r: 10 }
                ],
                [{ t: 'dots', c: 'red', p: [[120, 134, 4], [150, 134, 4], [180, 134, 4]] }],
                [{ t: 'c', c: 'yellow', x: 202, y: 138, r: 12 }]
            ]
        },
        {
            s: [
                'Draw an orange fish in the middle.',
                'Draw three small blue bubbles above the fish.',
                'Draw green seaweed on the left side.'
            ],
            a: [
                [{ t: 'fish', c: 'orange', x: 150, y: 112, s: 1.2 }],
                [{ t: 'dots', c: 'lightblue', p: [[128, 72, 5], [150, 60, 6], [172, 72, 5]] }],
                [
                    { t: 'ln', c: 'green', x1: 48, y1: 150, x2: 48, y2: 196, w: 6 },
                    { t: 'ln', c: 'green', x1: 62, y1: 158, x2: 62, y2: 196, w: 6 },
                    { t: 'c', c: 'green', x: 48, y: 146, r: 7 },
                    { t: 'c', c: 'green', x: 62, y: 154, r: 7 }
                ]
            ]
        },
        {
            s: [
                'Draw a red car body.',
                'Draw two black wheels at the bottom.',
                'Draw a yellow star painted on the car door.'
            ],
            a: [
                [
                    { t: 'r', c: 'red', x: 88, y: 120, w: 124, h: 34, rx: 10 },
                    { t: 'r', c: 'red', x: 118, y: 94, w: 64, h: 30, rx: 8 },
                    { t: 'r', c: 'lightblue', x: 126, y: 99, w: 20, h: 18 },
                    { t: 'r', c: 'lightblue', x: 156, y: 99, w: 20, h: 18 }
                ],
                [
                    { t: 'c', c: 'black', x: 116, y: 160, r: 14 },
                    { t: 'c', c: 'black', x: 184, y: 160, r: 14 },
                    { t: 'c', c: 'grey', x: 116, y: 160, r: 5 },
                    { t: 'c', c: 'grey', x: 184, y: 160, r: 5 }
                ],
                [{ t: 'star', c: 'yellow', x: 150, y: 137, r: 10 }]
            ]
        },
        {
            s: [
                'Draw a purple backpack.',
                'Draw a red ruler sticking out from the top zipper.',
                'Draw a green water bottle in the side pocket.'
            ],
            a: [
                [
                    { t: 'r', c: 'purple', x: 118, y: 82, w: 64, h: 88, rx: 16 },
                    { t: 'r', c: 'darkpurple', x: 126, y: 124, w: 48, h: 38, rx: 8 },
                    { t: 'ln', c: 'darkpurple', x1: 150, y1: 82, x2: 150, y2: 70, w: 6 }
                ],
                [{ t: 'r', c: 'red', x: 136, y: 44, w: 12, h: 44 }],
                [
                    { t: 'r', c: 'green', x: 184, y: 118, w: 20, h: 46, rx: 6 },
                    { t: 'r', c: 'darkgreen', x: 187, y: 108, w: 14, h: 10 }
                ]
            ]
        },
        {
            s: [
                'Draw a yellow wall clock.',
                'Draw a short black hand pointing up.',
                'Draw a long red hand pointing right.'
            ],
            a: [
                [
                    { t: 'c', c: 'yellow', x: 150, y: 110, r: 42 },
                    { t: 'ring', c: 'brown', x: 150, y: 110, r: 42, w: 4 },
                    { t: 'c', c: 'brown', x: 150, y: 110, r: 5 }
                ],
                [{ t: 'ln', c: 'black', x1: 150, y1: 110, x2: 150, y2: 76, w: 7 }],
                [{ t: 'ln', c: 'red', x1: 150, y1: 110, x2: 188, y2: 110, w: 5 }]
            ]
        },
        {
            s: [
                'Draw a brown teddy bear.',
                'Draw a big red bow tie on its neck.',
                'Draw a blue button on its left ear.'
            ],
            a: [
                [
                    { t: 'e', c: 'brown', x: 150, y: 144, rx: 28, ry: 32 },
                    { t: 'c', c: 'brown', x: 150, y: 88, r: 22 },
                    { t: 'c', c: 'brown', x: 131, y: 70, r: 8 },
                    { t: 'c', c: 'brown', x: 169, y: 70, r: 8 },
                    { t: 'e', c: 'tan', x: 150, y: 94, rx: 10, ry: 8 }
                ],
                [
                    { t: 'tri', c: 'red', x: 126, y: 108, w: 14, h: 12, d: 'left' },
                    { t: 'tri', c: 'red', x: 160, y: 108, w: 14, h: 12, d: 'right' },
                    { t: 'c', c: 'red', x: 150, y: 114, r: 5 }
                ],
                [{ t: 'c', c: 'blue', x: 131, y: 70, r: 5 }]
            ]
        },
        {
            s: [
                'Draw an open blue umbrella.',
                'Draw three pink raindrops on the left side.',
                'Draw one yellow raindrop on the right side.'
            ],
            a: [
                [{ t: 'umbrella', c: 'blue', x: 150, y: 100, s: 1.4 }],
                [{ t: 'dots', c: 'pink', p: [[78, 78, 4], [94, 108, 4], [72, 138, 4]] }],
                [{ t: 'dots', c: 'yellow', p: [[226, 105, 5]] }]
            ]
        },
        {
            s: [
                'Draw a brown ice cream cone.',
                'Draw two pink scoops of ice cream on top.',
                'Draw one red cherry on top of the scoops.'
            ],
            a: [
                [{ t: 'tri', c: 'brown', x: 135, y: 108, w: 30, h: 52, d: 'down' }],
                [
                    { t: 'c', c: 'pink', x: 137, y: 90, r: 15 },
                    { t: 'c', c: 'pink', x: 163, y: 90, r: 15 }
                ],
                [{ t: 'c', c: 'red', x: 150, y: 66, r: 7 }]
            ]
        },
        {
            s: [
                'Draw a big green pizza triangle.',
                'Draw four red pepperoni circles on the pizza.',
                'Draw three yellow cheese shapes around them.'
            ],
            a: [
                [{ t: 'tri', c: 'green', x: 110, y: 60, w: 80, h: 96, d: 'down' }],
                [{ t: 'dots', c: 'red', p: [[135, 92, 6], [165, 92, 6], [143, 118, 6], [157, 118, 6]] }],
                [
                    { t: 'tri', c: 'yellow', x: 116, y: 132, w: 16, h: 14 },
                    { t: 'tri', c: 'yellow', x: 158, y: 132, w: 16, h: 14 },
                    { t: 'tri', c: 'yellow', x: 137, y: 142, w: 16, h: 14 }
                ]
            ]
        },
        {
            s: [
                'Draw an orange boat on blue water.',
                'Draw a white sail on top of the boat.',
                'Draw a small red flag on top of the sail.'
            ],
            a: [
                [
                    { t: 'r', c: 'blue', x: 30, y: 150, w: 240, h: 34, rx: 6 },
                    { t: 'poly', c: 'orange', p: [[110, 150], [190, 150], [174, 178], [126, 178]] }
                ],
                [
                    { t: 'ln', c: 'brown', x1: 160, y1: 92, x2: 160, y2: 150, w: 4 },
                    { t: 'tri', c: 'white', x: 142, y: 92, w: 36, h: 54 }
                ],
                [
                    { t: 'ln', c: 'brown', x1: 160, y1: 92, x2: 160, y2: 72, w: 3 },
                    { t: 'tri', c: 'red', x: 160, y: 60, w: 22, h: 13, d: 'right' }
                ]
            ]
        },
        {
            s: [
                'Draw a red mailbox.',
                'Draw a yellow letter sticking out of the slot.',
                'Draw a small blue bird sitting on top of the mailbox.'
            ],
            a: [
                [
                    { t: 'r', c: 'red', x: 118, y: 112, w: 64, h: 52, rx: 10 },
                    { t: 'tri', c: 'darkred', x: 112, y: 88, w: 76, h: 26 },
                    { t: 'ln', c: 'grey', x1: 142, y1: 164, x2: 142, y2: 192, w: 6 },
                    { t: 'ln', c: 'grey', x1: 162, y1: 164, x2: 162, y2: 192, w: 6 }
                ],
                [
                    { t: 'r', c: 'yellow', x: 128, y: 92, w: 44, h: 20 },
                    { t: 'ln', c: 'brown', x1: 128, y1: 112, x2: 172, y2: 112, w: 3 }
                ],
                [{ t: 'bird', c: 'blue', x: 150, y: 76, s: 0.9 }]
            ]
        }
    ];

    /* ---------------- Animals, nature + environments (Cases 26-40) ---------------- */
    const NATURE_CASES = [
        {
            s: [
                'Draw green grass at the bottom of the page.',
                'Draw a big yellow sunflower on the left side.',
                'Draw a small bee flying on the right side.'
            ],
            a: [
                [
                    { t: 'r', c: 'green', x: 30, y: 182, w: 240, h: 26 },
                    { t: 'ln', c: 'darkgreen', x1: 70, y1: 182, x2: 70, y2: 168, w: 4 },
                    { t: 'ln', c: 'darkgreen', x1: 230, y1: 182, x2: 230, y2: 168, w: 4 }
                ],
                [
                    { t: 'ln', c: 'green', x1: 80, y1: 182, x2: 80, y2: 132, w: 5 },
                    { t: 'flower', p: 'yellow', q: 'brown', x: 80, y: 118, s: 2 }
                ],
                [
                    { t: 'e', c: 'yellow', x: 222, y: 96, rx: 10, ry: 7 },
                    { t: 'ln', c: 'black', x1: 220, y1: 90, x2: 220, y2: 102, w: 3 },
                    { t: 'e', c: 'white', x: 218, y: 86, rx: 5, ry: 3, rot: -30 },
                    { t: 'e', c: 'white', x: 227, y: 86, rx: 5, ry: 3, rot: 30 }
                ]
            ]
        },
        {
            s: [
                'Draw a blue pond in the middle.',
                'Draw two yellow ducks inside the pond.',
                'Draw three green plants on the edge of the pond.'
            ],
            a: [
                [{ t: 'e', c: 'blue', x: 150, y: 122, rx: 82, ry: 40 }],
                [
                    { t: 'bird', c: 'yellow', x: 122, y: 116, s: 0.8 },
                    { t: 'bird', c: 'yellow', x: 178, y: 126, s: 0.8 }
                ],
                [
                    { t: 'ln', c: 'green', x1: 80, y1: 100, x2: 74, y2: 84, w: 4 },
                    { t: 'ln', c: 'green', x1: 80, y1: 100, x2: 80, y2: 82, w: 4 },
                    { t: 'ln', c: 'green', x1: 80, y1: 100, x2: 86, y2: 84, w: 4 },
                    { t: 'ln', c: 'green', x1: 222, y1: 102, x2: 216, y2: 86, w: 4 },
                    { t: 'ln', c: 'green', x1: 222, y1: 102, x2: 222, y2: 84, w: 4 },
                    { t: 'ln', c: 'green', x1: 222, y1: 102, x2: 228, y2: 86, w: 4 },
                    { t: 'ln', c: 'green', x1: 150, y1: 160, x2: 144, y2: 146, w: 4 },
                    { t: 'ln', c: 'green', x1: 150, y1: 160, x2: 150, y2: 144, w: 4 },
                    { t: 'ln', c: 'green', x1: 150, y1: 160, x2: 156, y2: 146, w: 4 }
                ]
            ]
        },
        {
            s: [
                'Draw a large brown mountain.',
                'Draw white snow on top of the mountain peak.',
                'Draw a green tree at the foot of the mountain.'
            ],
            a: [
                [{ t: 'tri', c: 'brown', x: 75, y: 45, w: 150, h: 135 }],
                [{ t: 'tri', c: 'white', x: 128, y: 45, w: 44, h: 40 }],
                [{ t: 'tree', x: 66, y: 190, s: 0.7 }]
            ]
        },
        {
            s: [
                'Draw a grey elephant body.',
                'Draw two big blue ears on the head.',
                'Draw a red flower held in its trunk.'
            ],
            a: [
                [
                    { t: 'e', c: 'grey', x: 140, y: 128, rx: 55, ry: 38 },
                    { t: 'c', c: 'grey', x: 202, y: 100, r: 26 }
                ],
                [
                    { t: 'c', c: 'blue', x: 190, y: 82, r: 13 },
                    { t: 'c', c: 'blue', x: 214, y: 76, r: 13 }
                ],
                [
                    { t: 'ln', c: 'grey', x1: 216, y1: 120, x2: 226, y2: 148, w: 10 },
                    { t: 'flower', p: 'red', q: 'yellow', x: 228, y: 140, s: 1 }
                ]
            ]
        },
        {
            s: [
                'Draw a yellow giraffe with a long neck.',
                'Draw five brown spots on its neck.',
                'Draw a green leaf in its mouth.'
            ],
            a: [
                [
                    { t: 'e', c: 'yellow', x: 115, y: 158, rx: 42, ry: 26 },
                    { t: 'r', c: 'yellow', x: 140, y: 62, w: 22, h: 78, rx: 9 },
                    { t: 'e', c: 'yellow', x: 151, y: 50, rx: 17, ry: 12 },
                    { t: 'ln', c: 'yellow', x1: 90, y1: 176, x2: 90, y2: 196, w: 7 },
                    { t: 'ln', c: 'yellow', x1: 115, y1: 180, x2: 115, y2: 196, w: 7 },
                    { t: 'ln', c: 'yellow', x1: 140, y1: 176, x2: 140, y2: 196, w: 7 }
                ],
                [{ t: 'dots', c: 'brown', p: [[146, 76, 4], [156, 86, 4], [146, 100, 4], [156, 112, 4], [150, 128, 4]] }],
                [{ t: 'e', c: 'green', x: 170, y: 54, rx: 9, ry: 5, rot: 20 }]
            ]
        },
        {
            s: [
                'Draw a yellow crescent moon in the top-left corner.',
                'Draw four white stars scattered across the sky.',
                'Draw a dark blue cloud under the moon.'
            ],
            a: [
                [{ t: 'moon', c: 'yellow', x: 55, y: 45, r: 22 }],
                [
                    { t: 'star', c: 'white', x: 115, y: 60, r: 9 },
                    { t: 'star', c: 'white', x: 175, y: 40, r: 11 },
                    { t: 'star', c: 'white', x: 215, y: 90, r: 9 },
                    { t: 'star', c: 'white', x: 140, y: 112, r: 8 }
                ],
                [{ t: 'cloud', c: 'darkblue', x: 72, y: 104, s: 1 }]
            ]
        },
        {
            s: [
                'Draw yellow sand at the bottom half of the page.',
                'Draw blue ocean water above the sand.',
                'Draw a small red crab walking on the sand.'
            ],
            a: [
                [{ t: 'r', c: 'yellow', x: 30, y: 130, w: 240, h: 70 }],
                [{ t: 'r', c: 'blue', x: 30, y: 66, w: 240, h: 64 }],
                [
                    { t: 'e', c: 'red', x: 150, y: 168, rx: 18, ry: 12 },
                    { t: 'c', c: 'red', x: 126, y: 158, r: 7 },
                    { t: 'c', c: 'red', x: 174, y: 158, r: 7 },
                    { t: 'ln', c: 'red', x1: 138, y1: 178, x2: 130, y2: 190, w: 3 },
                    { t: 'ln', c: 'red', x1: 162, y1: 178, x2: 170, y2: 190, w: 3 }
                ]
            ]
        },
        {
            s: [
                'Draw a green lily pad.',
                'Draw a green frog sitting on top of the lily pad.',
                'Draw a small black fly in the air above the frog.'
            ],
            a: [
                [{ t: 'c', c: 'green', x: 150, y: 134, r: 40 }],
                [{ t: 'frog', x: 150, y: 124, s: 1.1 }],
                [
                    { t: 'c', c: 'black', x: 150, y: 56, r: 4 },
                    { t: 'ln', c: 'grey', x1: 150, y1: 56, x2: 142, y2: 48, w: 2 },
                    { t: 'ln', c: 'grey', x1: 150, y1: 56, x2: 158, y2: 48, w: 2 }
                ]
            ]
        },
        {
            s: [
                'Draw a brown birdhouse hanging from a tree branch.',
                'Draw a yellow bird looking out from the entrance hole.',
                'Draw a red worm sitting on the tree branch.'
            ],
            a: [
                [
                    { t: 'ln', c: 'brown', x1: 30, y1: 48, x2: 270, y2: 48, w: 8 },
                    { t: 'r', c: 'brown', x: 120, y: 48, w: 60, h: 52 },
                    { t: 'tri', c: 'darkbrown', x: 112, y: 22, w: 76, h: 28 },
                    { t: 'c', c: 'black', x: 150, y: 74, r: 10 }
                ],
                [{ t: 'bird', c: 'yellow', x: 148, y: 74, s: 0.8 }],
                [
                    { t: 'c', c: 'red', x: 208, y: 42, r: 5 },
                    { t: 'c', c: 'red', x: 218, y: 42, r: 5 },
                    { t: 'c', c: 'red', x: 228, y: 42, r: 5 }
                ]
            ]
        },
        {
            s: [
                'Draw an arc rainbow with red, yellow, and blue stripes.',
                'Draw a fluffy white cloud at the left end of the rainbow.',
                'Draw a fluffy white cloud at the right end.'
            ],
            a: [
                [{ t: 'rainbow', x: 150, y: 178, r: 80 }],
                [{ t: 'cloud', c: 'white', x: 62, y: 174, s: 0.9 }],
                [{ t: 'cloud', c: 'white', x: 238, y: 174, s: 0.9 }]
            ]
        },
        {
            s: [
                'Draw a pink flamingo standing on one leg.',
                'Draw blue water around its foot.',
                'Draw a brown palm tree on the left side.'
            ],
            a: [
                [
                    { t: 'e', c: 'pink', x: 150, y: 108, rx: 22, ry: 15 },
                    { t: 'ln', c: 'pink', x1: 168, y1: 98, x2: 178, y2: 58, w: 6 },
                    { t: 'c', c: 'pink', x: 179, y: 52, r: 8 },
                    { t: 'tri', c: 'black', x: 185, y: 48, w: 10, h: 7, d: 'right' },
                    { t: 'ln', c: 'pink', x1: 150, y1: 122, x2: 150, y2: 184, w: 5 }
                ],
                [{ t: 'e', c: 'blue', x: 150, y: 188, rx: 30, ry: 10 }],
                [
                    { t: 'ln', c: 'brown', x1: 60, y1: 190, x2: 60, y2: 120, w: 7 },
                    { t: 'ln', c: 'green', x1: 60, y1: 120, x2: 30, y2: 100, w: 5 },
                    { t: 'ln', c: 'green', x1: 60, y1: 120, x2: 60, y2: 94, w: 5 },
                    { t: 'ln', c: 'green', x1: 60, y1: 120, x2: 90, y2: 100, w: 5 }
                ]
            ]
        },
        {
            s: [
                'Draw an orange tiger body.',
                'Draw three black stripes across its back.',
                'Draw a small red ball in front of its paws.'
            ],
            a: [
                [
                    { t: 'e', c: 'orange', x: 145, y: 128, rx: 55, ry: 35 },
                    { t: 'c', c: 'orange', x: 203, y: 105, r: 24 },
                    { t: 'tri', c: 'orange', x: 186, y: 78, w: 12, h: 12 },
                    { t: 'tri', c: 'orange', x: 206, y: 78, w: 12, h: 12 },
                    { t: 'e', c: 'white', x: 203, y: 114, rx: 12, ry: 9 }
                ],
                [
                    { t: 'ln', c: 'black', x1: 118, y1: 96, x2: 118, y2: 116, w: 5 },
                    { t: 'ln', c: 'black', x1: 143, y1: 92, x2: 143, y2: 114, w: 5 },
                    { t: 'ln', c: 'black', x1: 168, y1: 94, x2: 168, y2: 114, w: 5 }
                ],
                [{ t: 'c', c: 'red', x: 248, y: 166, r: 12 }]
            ]
        },
        {
            s: [
                "Draw a brown bird's nest in a green tree.",
                'Draw two blue eggs inside the nest.',
                'Draw a mother yellow bird standing beside the nest.'
            ],
            a: [
                [
                    { t: 'tree', x: 108, y: 190, s: 1.2 },
                    { t: 'e', c: 'brown', x: 170, y: 150, rx: 34, ry: 16 },
                    { t: 'e', c: 'darkbrown', x: 170, y: 146, rx: 24, ry: 10 }
                ],
                [
                    { t: 'e', c: 'lightblue', x: 160, y: 140, rx: 9, ry: 11 },
                    { t: 'e', c: 'lightblue', x: 180, y: 140, rx: 9, ry: 11 }
                ],
                [{ t: 'bird', c: 'yellow', x: 222, y: 132, s: 1 }]
            ]
        },
        {
            s: [
                'Draw a yellow butterfly in the center.',
                'Draw two purple dots on each wing.',
                'Draw a red flower beneath the butterfly.'
            ],
            a: [
                [{ t: 'bfly', w: 'yellow', d: null, x: 150, y: 100, s: 1.2 }],
                [{ t: 'dots', c: 'purple', p: [[133, 88, 4], [145, 82, 4], [155, 82, 4], [167, 88, 4]] }],
                [
                    { t: 'ln', c: 'green', x1: 150, y1: 190, x2: 150, y2: 164, w: 5 },
                    { t: 'flower', p: 'red', q: 'yellow', x: 150, y: 152, s: 1.6 }
                ]
            ]
        },
        {
            s: [
                'Draw a tall brown coconut tree.',
                'Draw three brown coconuts under the green leaves.',
                'Draw a bright yellow sun in the sky.'
            ],
            a: [
                [
                    { t: 'ln', c: 'brown', x1: 120, y1: 195, x2: 140, y2: 80, w: 9 },
                    { t: 'ln', c: 'green', x1: 140, y1: 80, x2: 90, y2: 58, w: 5 },
                    { t: 'ln', c: 'green', x1: 140, y1: 80, x2: 115, y2: 50, w: 5 },
                    { t: 'ln', c: 'green', x1: 140, y1: 80, x2: 140, y2: 46, w: 5 },
                    { t: 'ln', c: 'green', x1: 140, y1: 80, x2: 165, y2: 50, w: 5 },
                    { t: 'ln', c: 'green', x1: 140, y1: 80, x2: 190, y2: 58, w: 5 }
                ],
                [
                    { t: 'c', c: 'brown', x: 128, y: 90, r: 8 },
                    { t: 'c', c: 'brown', x: 152, y: 90, r: 8 },
                    { t: 'c', c: 'brown', x: 140, y: 102, r: 8 }
                ],
                [{ t: 'sun', c: 'yellow', x: 248, y: 44, r: 18 }]
            ]
        }
    ];

    /* ---------------- Multi-step scenarios + details (Cases 41-50) ---------------- */
    const SCENES_CASES = [
        {
            s: [
                'Draw a red house with a brown triangular roof.',
                'Draw a blue chimney on top of the roof with grey smoke coming out.',
                'Draw a happy boy standing on the left side of the house door.'
            ],
            a: [
                [
                    { t: 'r', c: 'red', x: 110, y: 120, w: 80, h: 60 },
                    { t: 'tri', c: 'brown', x: 100, y: 88, w: 100, h: 36 },
                    { t: 'r', c: 'darkbrown', x: 142, y: 140, w: 20, h: 40 }
                ],
                [
                    { t: 'r', c: 'blue', x: 168, y: 58, w: 18, h: 36 },
                    { t: 'c', c: 'grey', x: 177, y: 42, r: 6 },
                    { t: 'c', c: 'grey', x: 182, y: 28, r: 8 },
                    { t: 'c', c: 'grey', x: 188, y: 12, r: 10 }
                ],
                [{ t: 'person', c: 'blue', x: 80, y: 148, s: 1.1 }]
            ]
        },
        {
            s: [
                'Draw green park grass at the bottom.',
                'Draw a red swing set in the center.',
                'Draw a girl wearing a pink dress sitting on the swing.'
            ],
            a: [
                [{ t: 'r', c: 'green', x: 30, y: 184, w: 240, h: 26 }],
                [
                    { t: 'ln', c: 'red', x1: 90, y1: 84, x2: 210, y2: 84, w: 6 },
                    { t: 'ln', c: 'red', x1: 100, y1: 84, x2: 80, y2: 188, w: 6 },
                    { t: 'ln', c: 'red', x1: 100, y1: 84, x2: 120, y2: 188, w: 6 },
                    { t: 'ln', c: 'red', x1: 200, y1: 84, x2: 180, y2: 188, w: 6 },
                    { t: 'ln', c: 'red', x1: 200, y1: 84, x2: 220, y2: 188, w: 6 },
                    { t: 'ln', c: 'black', x1: 130, y1: 84, x2: 130, y2: 148, w: 3 },
                    { t: 'ln', c: 'black', x1: 170, y1: 84, x2: 170, y2: 148, w: 3 },
                    { t: 'ln', c: 'brown', x1: 122, y1: 148, x2: 178, y2: 148, w: 5 }
                ],
                [{ t: 'person', c: 'pink', x: 150, y: 116, s: 0.9, dress: 'pink' }]
            ]
        },
        {
            s: [
                'Draw a yellow school bus.',
                'Draw three square blue windows along the side.',
                'Draw a bus driver wearing a black hat visible inside the front window.'
            ],
            a: [
                [
                    { t: 'r', c: 'yellow', x: 70, y: 108, w: 160, h: 62, rx: 10 },
                    { t: 'c', c: 'black', x: 102, y: 174, r: 16 },
                    { t: 'c', c: 'black', x: 198, y: 174, r: 16 },
                    { t: 'c', c: 'grey', x: 102, y: 174, r: 6 },
                    { t: 'c', c: 'grey', x: 198, y: 174, r: 6 }
                ],
                [
                    { t: 'r', c: 'blue', x: 88, y: 120, w: 36, h: 26 },
                    { t: 'r', c: 'blue', x: 132, y: 120, w: 36, h: 26 },
                    { t: 'r', c: 'blue', x: 176, y: 120, w: 36, h: 26 }
                ],
                [
                    { t: 'c', c: 'peach', x: 194, y: 133, r: 10 },
                    { t: 'r', c: 'black', x: 184, y: 116, w: 20, h: 8 },
                    { t: 'r', c: 'black', x: 188, y: 102, w: 12, h: 14 }
                ]
            ]
        },
        {
            s: [
                'Draw a brown dining table.',
                'Draw two white plates on top of the table.',
                'Draw a red apple on the left plate and a yellow banana on the right plate.'
            ],
            a: [
                [
                    { t: 'r', c: 'brown', x: 60, y: 140, w: 180, h: 14 },
                    { t: 'ln', c: 'brown', x1: 76, y1: 154, x2: 76, y2: 192, w: 6 },
                    { t: 'ln', c: 'brown', x1: 224, y1: 154, x2: 224, y2: 192, w: 6 }
                ],
                [
                    { t: 'e', c: 'white', x: 110, y: 132, rx: 26, ry: 10 },
                    { t: 'e', c: 'white', x: 190, y: 132, rx: 26, ry: 10 }
                ],
                [
                    { t: 'c', c: 'red', x: 110, y: 116, r: 11 },
                    { t: 'ln', c: 'brown', x1: 110, y1: 105, x2: 110, y2: 100, w: 3 },
                    { t: 'moon', c: 'yellow', x: 190, y: 118, r: 10 }
                ]
            ]
        },
        {
            s: [
                'Draw a big purple planet in dark space.',
                'Draw a gold ring around the middle of the planet.',
                'Draw a small green rocket flying on the left.'
            ],
            a: [
                [{ t: 'c', c: 'purple', x: 160, y: 105, r: 44 }],
                [{ t: 'e', c: 'gold', x: 160, y: 105, rx: 64, ry: 18, rot: -15, f: 0, sw: 5 }],
                [
                    { t: 'r', c: 'green', x: 48, y: 92, w: 20, h: 40, rx: 6 },
                    { t: 'tri', c: 'red', x: 48, y: 72, w: 20, h: 20 },
                    { t: 'c', c: 'lightblue', x: 58, y: 106, r: 5 },
                    { t: 'tri', c: 'orange', x: 51, y: 132, w: 14, h: 18, d: 'down' }
                ]
            ]
        },
        {
            s: [
                'Draw a big grey whale in the ocean.',
                'Draw a spout of blue water coming out from its blowhole.',
                'Draw two small pink fish swimming under the whale.'
            ],
            a: [
                [
                    { t: 'e', c: 'grey', x: 150, y: 118, rx: 70, ry: 40 },
                    { t: 'tri', c: 'grey', x: 52, y: 92, w: 30, h: 52, d: 'left' },
                    { t: 'c', c: 'black', x: 196, y: 108, r: 3 }
                ],
                [
                    { t: 'ln', c: 'blue', x1: 150, y1: 74, x2: 140, y2: 46, w: 4 },
                    { t: 'ln', c: 'blue', x1: 150, y1: 74, x2: 150, y2: 42, w: 4 },
                    { t: 'ln', c: 'blue', x1: 150, y1: 74, x2: 160, y2: 46, w: 4 },
                    { t: 'dots', c: 'blue', p: [[140, 42, 3], [150, 38, 3], [160, 42, 3]] }
                ],
                [
                    { t: 'fish', c: 'pink', x: 130, y: 176, s: 0.8 },
                    { t: 'fish', c: 'pink', x: 195, y: 186, s: 0.8, f: 1 }
                ]
            ]
        },
        {
            s: [
                'Draw a triangular red tent on green grass.',
                'Draw a small yellow and orange campfire in front of the tent.',
                'Draw a black lantern sitting on the right side of the tent.'
            ],
            a: [
                [
                    { t: 'r', c: 'green', x: 30, y: 184, w: 240, h: 26 },
                    { t: 'tri', c: 'red', x: 90, y: 70, w: 110, h: 114 },
                    { t: 'tri', c: 'darkbrown', x: 132, y: 132, w: 36, h: 52 }
                ],
                [
                    { t: 'ln', c: 'brown', x1: 122, y1: 178, x2: 172, y2: 170, w: 6 },
                    { t: 'ln', c: 'brown', x1: 122, y1: 170, x2: 172, y2: 178, w: 6 },
                    { t: 'tri', c: 'orange', x: 137, y: 138, w: 26, h: 36 },
                    { t: 'tri', c: 'yellow', x: 143, y: 150, w: 14, h: 22 }
                ],
                [
                    { t: 'r', c: 'black', x: 208, y: 150, w: 22, h: 30, rx: 4 },
                    { t: 'ln', c: 'black', x1: 219, y1: 150, x2: 219, y2: 142, w: 4 },
                    { t: 'c', c: 'yellow', x: 219, y: 160, r: 4 }
                ]
            ]
        },
        {
            s: [
                'Draw a snowman made of three stacked white circles.',
                'Draw an orange carrot nose and two black dot eyes on the head.',
                'Draw a red scarf wrapped around its neck and a black hat on top.'
            ],
            a: [
                [
                    { t: 'c', c: 'white', x: 140, y: 172, r: 26 },
                    { t: 'c', c: 'white', x: 140, y: 126, r: 20 },
                    { t: 'c', c: 'white', x: 140, y: 88, r: 15 }
                ],
                [
                    { t: 'tri', c: 'orange', x: 140, y: 84, w: 18, h: 9, d: 'right' },
                    { t: 'dots', c: 'black', p: [[134, 80, 2.5], [146, 80, 2.5]] }
                ],
                [
                    { t: 'r', c: 'red', x: 122, y: 102, w: 36, h: 12, rx: 4 },
                    { t: 'r', c: 'red', x: 150, y: 110, w: 10, h: 22 },
                    { t: 'r', c: 'black', x: 126, y: 52, w: 28, h: 22 },
                    { t: 'r', c: 'black', x: 114, y: 72, w: 52, h: 8 }
                ]
            ]
        },
        {
            s: [
                "Draw a large red 'X' mark on an island map.",
                "Draw a brown treasure chest right next to the 'X'.",
                'Draw a green palm tree in the top-right corner of the map.'
            ],
            a: [
                [
                    { t: 'r', c: 'tan', x: 50, y: 40, w: 200, h: 140, rx: 8 },
                    { t: 'e', c: 'green', x: 140, y: 115, rx: 62, ry: 42 },
                    { t: 'ln', c: 'red', x1: 118, y1: 96, x2: 148, y2: 126, w: 7 },
                    { t: 'ln', c: 'red', x1: 148, y1: 96, x2: 118, y2: 126, w: 7 }
                ],
                [
                    { t: 'r', c: 'brown', x: 168, y: 118, w: 44, h: 30, rx: 3 },
                    { t: 'r', c: 'darkbrown', x: 168, y: 106, w: 44, h: 16, rx: 6 },
                    { t: 'ln', c: 'gold', x1: 190, y1: 106, x2: 190, y2: 148, w: 4 },
                    { t: 'c', c: 'gold', x: 190, y: 130, r: 5 }
                ],
                [
                    { t: 'ln', c: 'brown', x1: 222, y1: 92, x2: 222, y2: 62, w: 5 },
                    { t: 'ln', c: 'green', x1: 222, y1: 62, x2: 204, y2: 50, w: 4 },
                    { t: 'ln', c: 'green', x1: 222, y1: 62, x2: 222, y2: 44, w: 4 },
                    { t: 'ln', c: 'green', x1: 222, y1: 62, x2: 240, y2: 50, w: 4 }
                ]
            ]
        },
        {
            s: [
                'Draw a party table covered with a green tablecloth.',
                'Draw a square blue present with a red bow on top of the table.',
                'Draw three colorful balloons tied to the leg of the table.'
            ],
            a: [
                [{ t: 'r', c: 'green', x: 75, y: 135, w: 150, h: 52, rx: 4 }],
                [
                    { t: 'r', c: 'blue', x: 122, y: 99, w: 44, h: 36 },
                    { t: 'ln', c: 'red', x1: 144, y1: 99, x2: 144, y2: 135, w: 4 },
                    { t: 'ln', c: 'red', x1: 122, y1: 117, x2: 166, y2: 117, w: 4 },
                    { t: 'tri', c: 'red', x: 130, y: 84, w: 12, h: 14, d: 'left' },
                    { t: 'tri', c: 'red', x: 146, y: 84, w: 12, h: 14, d: 'right' },
                    { t: 'c', c: 'red', x: 144, y: 93, r: 4 }
                ],
                [
                    { t: 'ln', c: 'grey', x1: 210, y1: 187, x2: 188, y2: 92, w: 2 },
                    { t: 'ln', c: 'grey', x1: 210, y1: 187, x2: 214, y2: 78, w: 2 },
                    { t: 'ln', c: 'grey', x1: 210, y1: 187, x2: 240, y2: 96, w: 2 },
                    { t: 'c', c: 'red', x: 188, y: 78, r: 14 },
                    { t: 'c', c: 'yellow', x: 214, y: 64, r: 14 },
                    { t: 'c', c: 'blue', x: 240, y: 82, r: 14 }
                ]
            ]
        }
    ];

    function buildDrawing(category, cases) {
        const picked = pick(cases);
        return {
            type: 'english',
            category,
            display: 'drawing',
            kind: 'draw',
            text: picked.s[0],
            answer: '',
            answerSentence: null,
            hint: null,
            steps: picked.s.slice(),
            art: picked.a.map(function (step) { return step.slice(); }),
            prompt: 'Listen and draw',
            spokenQuestion: picked.s[0],
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
