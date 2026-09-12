/* ==========================================================================
 * Draw Art — tiny SVG line-drawing renderer for the drawing game.
 *
 * Emoji cannot follow an instruction's colour, size or position ("draw
 * a PINK box in the BOTTOM-LEFT corner"), so each drawing step carries
 * shape specs that are rendered here as simple line drawings on a
 * 300x220 canvas. ui.js accumulates one step-group per tapped step, so
 * the correct picture builds up exactly as instructed.
 *
 * Spec types (all coords in canvas units, colours are palette words):
 *   {t:'c', c, x, y, r}                 circle
 *   {t:'e', c, x, y, rx, ry, rot?}      ellipse (rot = degrees)
 *   {t:'r', c, x, y, w, h, rx?}         rect (x,y = top-left)
 *   {t:'tri', c, x, y, w, h, d?}        triangle in x,y,w,h box,
 *                                       d = up|down|left|right (def up)
 *   {t:'poly', c, p:[[x,y],...]}        free polygon
 *   {t:'star', c, x, y, r}              5-point star (centred)
 *   {t:'heart', c, x, y, s}             heart, ~12s wide, centred
 *   {t:'plus', c, x, y, s}              cross, s = total size
 *   {t:'ln', c, x1, y1, x2, y2, w?}     line (w def 4)
 *   {t:'dots', c, p:[[x,y,r],...]}      filled dots
 *   {t:'ring', c, x, y, r, w?}          outline circle (w def 4)
 *   {t:'cloud', c, x, y, s}             puffy cloud
 *   {t:'sun', c, x, y, r}               circle + 8 rays
 *   {t:'bolt', c, x, y, s}              lightning bolt
 *   {t:'moon', c, x, y, r}              crescent moon
 *   {t:'rainbow', x, y, r}              red/yellow/blue arcs on y
 *   {t:'flower', p, q, x, y, s}         stem + 5 petals (p) + centre (q)
 *   {t:'fish', c, x, y, s, f?}          fish facing right (f flips)
 *   {t:'bird', c, x, y, s}              perched bird facing right
 *   {t:'bfly', w, d, x, y, s}           butterfly, wings (w), dots (d
 *                                       or null for plain wings)
 *   {t:'frog', x, y, s}                 frog face
 *   {t:'tree', x, y, s}                 trunk + foliage, (x,y) = ground
 *   {t:'person', c, x, y, s, dress?}    stick figure, (x,y) = head
 *                                       centre; dress = colour or null
 *   {t:'umbrella', c, x, y, s}          open umbrella, (x,y) = canopy top
 *
 * Any shape accepts f:0 for "outline only" (stroke = colour, no fill).
 * API: LearnDrawArt.render(stageEl, groups, opts) — groups is an array
 * of per-step shape arrays; opts.finale adds the cheer to every group.
 *
 * Pen-on-paper rule: coordinates live in a fixed 300x220 viewBox and
 * render() only APPENDS groups it hasn't inked yet — strokes drawn on
 * an earlier tap are never destroyed, moved or re-created. The paper
 * itself only ever scales (uniformly, positions preserved), e.g. on a
 * window resize. Fresh starts (new question / replay) clear the stage
 * explicitly via LearnDrawArt.clear(stageEl) before rendering.
 * ========================================================================== */

(function () {
    'use strict';

    // Palette: fixed hexes so "pink" is always pink, "bottom-left" is
    // always the same corner. edge = outline colour for filled shapes
    // (dark shapes get a light edge so they read on the dark card).
    const PALETTE = {
        blue: '#3b82f6', lightblue: '#7dd3fc', darkblue: '#1e40af',
        red: '#ef4444', darkred: '#991b1b',
        yellow: '#facc15', green: '#22c55e', darkgreen: '#15803d',
        orange: '#fb923c', purple: '#a855f7', darkpurple: '#7e22ce',
        pink: '#f472b6', brown: '#8b5a2b', darkbrown: '#5b3413',
        tan: '#d9b77c', black: '#111827', grey: '#9ca3af',
        white: '#f8fafc', gold: '#fbbf24', peach: '#fcd7b0'
    };
    const LIGHT_EDGE = { black: 1, darkblue: 1 };
    const DARK_EDGE = 'rgba(2,6,23,0.55)';
    const LIGHT_EDGE_C = 'rgba(248,250,252,0.55)';

    function col(name) {
        return PALETTE[name] || name;
    }

    function edgeFor(name) {
        return LIGHT_EDGE[name] ? LIGHT_EDGE_C : DARK_EDGE;
    }

    function num(n) {
        return Math.round(n * 10) / 10;
    }

    // Filled shape: colour fill + contrasting edge (colouring-book look,
    // and dark colours stay visible on the dark card).
    function fillAttrs(name, sw) {
        return `fill="${col(name)}" stroke="${edgeFor(name)}" stroke-width="${sw || 1.5}"`;
    }

    function circle(x, y, r, name) {
        return `<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}" ${fillAttrs(name)}/>`;
    }

    function line(x1, y1, x2, y2, name, w) {
        const c = col(name);
        const width = w || 4;
        // Light halo under the stroke so dark lines (black string, table
        // legs) stay visible on the dark card while keeping their colour.
        return `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="rgba(248,250,252,0.28)" stroke-width="${num(width + 3.5)}" stroke-linecap="round"/>` +
            `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${c}" stroke-width="${num(width)}" stroke-linecap="round"/>`;
    }

    function triPoints(x, y, w, h, d) {
        if (d === 'down') return `${num(x)},${num(y)} ${num(x + w)},${num(y)} ${num(x + w / 2)},${num(y + h)}`;
        if (d === 'right') return `${num(x)},${num(y)} ${num(x)},${num(y + h)} ${num(x + w)},${num(y + h / 2)}`;
        if (d === 'left') return `${num(x + w)},${num(y)} ${num(x + w)},${num(y + h)} ${num(x)},${num(y + h / 2)}`;
        return `${num(x)},${num(y + h)} ${num(x + w)},${num(y + h)} ${num(x + w / 2)},${num(y)}`;
    }

    function starPoints(x, y, r) {
        const pts = [];
        for (let i = 0; i < 10; i++) {
            const rad = r * (i % 2 === 0 ? 1 : 0.45);
            const a = -Math.PI / 2 + i * Math.PI / 5;
            pts.push(num(x + rad * Math.cos(a)) + ',' + num(y + rad * Math.sin(a)));
        }
        return pts.join(' ');
    }

    function circlePath(x, y, r) {
        return `M${num(x - r)},${num(y)} a${num(r)},${num(r)} 0 1,0 ${num(r * 2)},0 a${num(r)},${num(r)} 0 1,0 ${num(-r * 2)},0`;
    }

    /* ---------------- composed figures ---------------- */

    function shapeCloud(c, x, y, s) {
        return circle(x - 18 * s, y + 4 * s, 12 * s, c) +
            circle(x, y - 7 * s, 16 * s, c) +
            circle(x + 18 * s, y + 4 * s, 12 * s, c) +
            circle(x + 7 * s, y + 9 * s, 12 * s, c);
    }

    function shapeSun(c, x, y, r) {
        let s = circle(x, y, r, c);
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            s += line(x + (r + 4) * Math.cos(a), y + (r + 4) * Math.sin(a),
                x + (r * 1.65) * Math.cos(a), y + (r * 1.65) * Math.sin(a), c, 3);
        }
        return s;
    }

    function shapeFlower(p, q, x, y, s) {
        let out = line(x, y + 8 * s, x, y + 34 * s, 'green', 4 * s);
        out += `<ellipse cx="${num(x - 8 * s)}" cy="${num(y + 24 * s)}" rx="${num(7 * s)}" ry="${num(3.5 * s)}" ${fillAttrs('green')} transform="rotate(-30 ${num(x - 8 * s)} ${num(y + 24 * s)})"/>`;
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
            const px = x + 10 * s * Math.cos(a);
            const py = y + 10 * s * Math.sin(a);
            const deg = num(a * 180 / Math.PI + 90);
            out += `<ellipse cx="${num(px)}" cy="${num(py)}" rx="${num(5.5 * s)}" ry="${num(9 * s)}" ${fillAttrs(p)} transform="rotate(${deg} ${num(px)} ${num(py)})"/>`;
        }
        return out + circle(x, y, 6 * s, q);
    }

    function shapeFish(c, x, y, s, flip) {
        const dir = flip ? -1 : 1;
        let out = `<ellipse cx="${num(x)}" cy="${num(y)}" rx="${num(15 * s)}" ry="${num(9 * s)}" ${fillAttrs(c)}/>`;
        const tx = x - dir * 14 * s;
        out += `<polygon points="${num(tx)},${num(y - 9 * s)} ${num(tx)},${num(y + 9 * s)} ${num(tx - dir * 13 * s)},${num(y)}" ${fillAttrs(c)}/>`;
        out += `<polygon points="${num(x - 4 * s)},${num(y - 8 * s)} ${num(x + 4 * s)},${num(y - 8 * s)} ${num(x)},${num(y - 15 * s)}" ${fillAttrs(c)}/>`;
        out += circle(x + dir * 7 * s, y - 2 * s, 2.6 * s, 'white') +
            circle(x + dir * 7.8 * s, y - 2 * s, 1.2 * s, 'black');
        return out;
    }

    function shapeBird(c, x, y, s) {
        return `<polygon points="${num(x - 8 * s)},${num(y - 4 * s)} ${num(x - 8 * s)},${num(y + 4 * s)} ${num(x - 18 * s)},${num(y)}" ${fillAttrs(c)}/>` +
            circle(x, y, 9 * s, c) +
            circle(x + 8 * s, y - 7 * s, 6 * s, c) +
            `<polygon points="${num(x + 13 * s)},${num(y - 8.5 * s)} ${num(x + 13 * s)},${num(y - 4.5 * s)} ${num(x + 20 * s)},${num(y - 6.5 * s)}" ${fillAttrs('orange')}/>` +
            circle(x + 10 * s, y - 9 * s, 1.3 * s, 'black');
    }

    function shapeButterfly(w, d, x, y, s) {
        let out = `<ellipse cx="${num(x - 14 * s)}" cy="${num(y - 8 * s)}" rx="${num(11 * s)}" ry="${num(17 * s)}" ${fillAttrs(w)} transform="rotate(-25 ${num(x - 14 * s)} ${num(y - 8 * s)})"/>` +
            `<ellipse cx="${num(x + 14 * s)}" cy="${num(y - 8 * s)}" rx="${num(11 * s)}" ry="${num(17 * s)}" ${fillAttrs(w)} transform="rotate(25 ${num(x + 14 * s)} ${num(y - 8 * s)})"/>` +
            `<ellipse cx="${num(x - 10 * s)}" cy="${num(y + 12 * s)}" rx="${num(8 * s)}" ry="${num(10 * s)}" ${fillAttrs(w)}/>` +
            `<ellipse cx="${num(x + 10 * s)}" cy="${num(y + 12 * s)}" rx="${num(8 * s)}" ry="${num(10 * s)}" ${fillAttrs(w)}/>`;
        if (d) {
            out += circle(x - 14 * s, y - 10 * s, 3.4 * s, d) +
                circle(x + 14 * s, y - 10 * s, 3.4 * s, d);
        }
        out += line(x, y - 16 * s, x, y + 16 * s, 'black', 3.5 * s) +
            line(x, y - 16 * s, x - 6 * s, y - 24 * s, 'black', 2 * s) +
            line(x, y - 16 * s, x + 6 * s, y - 24 * s, 'black', 2 * s);
        return out;
    }

    function shapeFrog(x, y, s) {
        return circle(x - 8 * s, y - 10 * s, 6 * s, 'green') +
            circle(x + 8 * s, y - 10 * s, 6 * s, 'green') +
            circle(x, y, 13 * s, 'green') +
            circle(x - 8 * s, y - 10 * s, 3 * s, 'white') +
            circle(x + 8 * s, y - 10 * s, 3 * s, 'white') +
            circle(x - 8 * s, y - 10 * s, 1.4 * s, 'black') +
            circle(x + 8 * s, y - 10 * s, 1.4 * s, 'black');
    }

    function shapeTree(x, y, s) {
        return `<rect x="${num(x - 5 * s)}" y="${num(y - 42 * s)}" width="${num(10 * s)}" height="${num(44 * s)}" ${fillAttrs('brown')}/>` +
            circle(x, y - 54 * s, 18 * s, 'green') +
            circle(x - 14 * s, y - 42 * s, 13 * s, 'darkgreen') +
            circle(x + 14 * s, y - 42 * s, 13 * s, 'darkgreen');
    }

    function shapePerson(c, x, y, s, dress) {
        let out = circle(x, y, 7 * s, 'peach');
        if (dress) {
            out += `<polygon points="${triPoints(x - 10 * s, y + 8 * s, 20 * s, 20 * s, 'up')}" ${fillAttrs(dress)}/>`;
            out += line(x, y + 8 * s, x, y + 12 * s, c, 3.5 * s);
        } else {
            out += line(x, y + 8 * s, x, y + 26 * s, c, 4 * s);
        }
        const hipY = dress ? y + 28 * s : y + 26 * s;
        out += line(x - 10 * s, y + 14 * s, x + 10 * s, y + 14 * s, c, 3.5 * s) +
            line(x, hipY, x - 8 * s, hipY + 14 * s, 'darkblue', 3.5 * s) +
            line(x, hipY, x + 8 * s, hipY + 14 * s, 'darkblue', 3.5 * s);
        return out;
    }

    function shapeUmbrella(c, x, y, s) {
        const r = 30 * s;
        return `<path d="M${num(x - r)},${num(y)} A${num(r)},${num(r)} 0 0 1 ${num(x + r)},${num(y)} Z" ${fillAttrs(c)}/>` +
            line(x, y - r, x, y - r - 8 * s, c, 3 * s) +
            line(x, y, x, y + 36 * s, 'grey', 3 * s) +
            line(x, y + 36 * s, x + 10 * s, y + 36 * s, 'grey', 3 * s) +
            line(x + 10 * s, y + 36 * s, x + 10 * s, y + 30 * s, 'grey', 3 * s);
    }

    /* ---------------- one spec -> svg string ---------------- */

    function shape(spec) {
        switch (spec.t) {
            case 'c': return circle(spec.x, spec.y, spec.r, spec.c);
            case 'e': {
                const rot = spec.rot ? ` transform="rotate(${spec.rot} ${num(spec.x)} ${num(spec.y)})"` : '';
                if (spec.f === 0) {
                    return `<ellipse cx="${num(spec.x)}" cy="${num(spec.y)}" rx="${num(spec.rx)}" ry="${num(spec.ry)}" fill="none" stroke="${col(spec.c)}" stroke-width="${spec.sw || 5}"${rot}/>`;
                }
                return `<ellipse cx="${num(spec.x)}" cy="${num(spec.y)}" rx="${num(spec.rx)}" ry="${num(spec.ry)}" ${fillAttrs(spec.c)}${rot}/>`;
            }
            case 'r': {
                if (spec.f === 0) {
                    return `<rect x="${num(spec.x)}" y="${num(spec.y)}" width="${num(spec.w)}" height="${num(spec.h)}" rx="${num(spec.rx || 0)}" fill="none" stroke="${col(spec.c)}" stroke-width="${spec.sw || 5}"/>`;
                }
                return `<rect x="${num(spec.x)}" y="${num(spec.y)}" width="${num(spec.w)}" height="${num(spec.h)}" rx="${num(spec.rx || 0)}" ${fillAttrs(spec.c)}/>`;
            }
            case 'tri':
                return `<polygon points="${triPoints(spec.x, spec.y, spec.w, spec.h, spec.d || 'up')}" ${spec.f === 0 ? `fill="none" stroke="${col(spec.c)}" stroke-width="${spec.sw || 4}"` : fillAttrs(spec.c)}/>`;
            case 'poly':
                return `<polygon points="${spec.p.map((pt) => num(pt[0]) + ',' + num(pt[1])).join(' ')}" ${fillAttrs(spec.c)}/>`;
            case 'star':
                return `<polygon points="${starPoints(spec.x, spec.y, spec.r)}" ${fillAttrs(spec.c)}/>`;
            case 'heart': {
                const hd = 'M6 10.5C6 10.5 0.5 6.8 0.5 3.6 0.5 1.7 2 0.3 3.8 0.3 5 0.3 5.7 1 6 1.7 6.3 1 7 0.3 8.2 0.3 10 0.3 11.5 1.7 11.5 3.6 11.5 6.8 6 10.5 6 10.5Z';
                const htr = `translate(${num(spec.x - 6 * spec.s)} ${num(spec.y - 5.5 * spec.s)}) scale(${spec.s})`;
                if (spec.f === 0) {
                    return `<path d="${hd}" transform="${htr}" fill="none" stroke="${col(spec.c)}" stroke-width="${spec.sw || 3}"/>`;
                }
                return `<path d="${hd}" transform="${htr}" ${fillAttrs(spec.c)}/>`;
            }
            case 'plus': {
                const s = spec.s, w = s * 0.34;
                return `<rect x="${num(spec.x - s / 2)}" y="${num(spec.y - w / 2)}" width="${num(s)}" height="${num(w)}" ${fillAttrs(spec.c)}/>` +
                    `<rect x="${num(spec.x - w / 2)}" y="${num(spec.y - s / 2)}" width="${num(w)}" height="${num(s)}" ${fillAttrs(spec.c)}/>`;
            }
            case 'ln': return line(spec.x1, spec.y1, spec.x2, spec.y2, spec.c, spec.w);
            case 'dots':
                return spec.p.map((pt) => circle(pt[0], pt[1], pt[2], spec.c)).join('');
            case 'ring':
                return `<circle cx="${num(spec.x)}" cy="${num(spec.y)}" r="${num(spec.r)}" fill="none" stroke="${col(spec.c)}" stroke-width="${spec.w || 4}"/>`;
            case 'cloud': return shapeCloud(spec.c, spec.x, spec.y, spec.s || 1);
            case 'sun': return shapeSun(spec.c, spec.x, spec.y, spec.r);
            case 'bolt':
                return `<polygon points="1,-16 7,-3 2.5,-3 9,12 -3,-1 1.5,-1" transform="translate(${num(spec.x)} ${num(spec.y)}) scale(${spec.s || 1})" ${fillAttrs(spec.c)}/>`;
            case 'moon':
                return `<path d="${circlePath(spec.x, spec.y, spec.r)} ${circlePath(spec.x + spec.r * 0.45, spec.y - spec.r * 0.2, spec.r * 0.85)}" fill-rule="evenodd" ${fillAttrs(spec.c)}/>`;
            case 'rainbow': {
                const cols = ['red', 'yellow', 'blue'];
                let out = '';
                for (let i = 0; i < 3; i++) {
                    const rr = spec.r - i * 10;
                    // Sweep 1 = clockwise on screen (SVG y-axis points
                    // down), so left-to-right draws through the TOP: a
                    // rainbow arch with apex at y - r. Sweep 0 would bowl
                    // downward past the canvas (verified in-browser).
                    out += `<path d="M${num(spec.x - rr)},${num(spec.y)} A${num(rr)},${num(rr)} 0 0 1 ${num(spec.x + rr)},${num(spec.y)}" fill="none" stroke="${col(cols[i])}" stroke-width="8"/>`;
                }
                return out;
            }
            case 'flower': return shapeFlower(spec.p, spec.q, spec.x, spec.y, spec.s || 1);
            case 'fish': return shapeFish(spec.c, spec.x, spec.y, spec.s || 1, spec.f);
            case 'bird': return shapeBird(spec.c, spec.x, spec.y, spec.s || 1);
            case 'bfly': return shapeButterfly(spec.w, spec.d, spec.x, spec.y, spec.s || 1);
            case 'frog': return shapeFrog(spec.x, spec.y, spec.s || 1);
            case 'tree': return shapeTree(spec.x, spec.y, spec.s || 1);
            case 'person': return shapePerson(spec.c, spec.x, spec.y, spec.s || 1, spec.dress);
            case 'umbrella': return shapeUmbrella(spec.c, spec.x, spec.y, spec.s || 1);
            default: return '';
        }
    }

    function svgShell() {
        return '<svg viewBox="0 0 300 220" role="img" aria-label="Drawing answer" style="width:100%;max-width:440px;height:auto;display:block;margin:0 auto;"></svg>';
    }

    // Fresh paper: removes every stroke. Only called on fresh starts
    // (new question / replay) — never between steps of one drawing.
    function clear(stageEl) {
        stageEl.innerHTML = '';
    }

    // Ink-once render: appends only groups beyond what is already on the
    // paper, so earlier strokes keep their exact nodes and positions.
    // The newest group pops in (fresh node restarts the CSS pop);
    // finale cheers every group without touching their geometry.
    function render(stageEl, groups, opts) {
        const finale = !!(opts && opts.finale);
        let svg = stageEl.querySelector('svg');
        if (!svg) {
            stageEl.innerHTML = svgShell();
            svg = stageEl.querySelector('svg');
        }
        const have = svg.querySelectorAll('g.dart-step').length;
        for (let i = have; i < groups.length; i++) {
            const cls = 'dart-step' + (finale ? ' cheer' : (i === groups.length - 1 ? ' pop' : ''));
            svg.insertAdjacentHTML('beforeend',
                `<g class="${cls}">` + groups[i].map(shape).join('') + '</g>');
        }
        const all = svg.querySelectorAll('g.dart-step');
        for (let k = 0; k < all.length; k++) {
            if (finale) all[k].classList.add('cheer');
            else all[k].classList.remove('cheer');
        }
    }

    window.LearnDrawArt = { render, clear, shape };
})();
