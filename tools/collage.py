"""Cut-paper collages for nosh.health.

    python tools/collage.py

writes the site's art into site/art/ and the social cards' art into tools/cards/.
Then tools/cards.sh turns the card templates into site/social-card.png and
site/github-card.png.

Every piece is a flat fill; the look comes from SVG filters applied per piece:
a displacement that tears the edges, a streaky noise that paints the paper, fine
flecks for the paper's fibre, and a small drop shadow so layered pieces lift off
each other. The paper's grain is turned per piece (carrots streak along their
length); the shadow is not, so the light stays in one place.

Each composition has its own seed, so changing one leaves the others alone. The
hero is drawn first from seed 23; keep it first if it should stay as it is.
"""
import math
import os
import random
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'site', 'art')        # published with the site
CARDS = os.path.join(ROOT, 'tools', 'cards')   # only for rendering the card PNGs
R = random.Random(23)

W, H = 560, 700
# Where the phone sits over the collage, in viewBox units (CSS mirrors these).
PHONE = dict(x=150, y=60, w=280)
PHONE['h'] = PHONE['w'] * 19 / 9

C = dict(
    soil='#4a2e26', soil2='#5a3a30', speck='#8a6252', speck2='#2f1c17',
    beet='#6a2d68', beet2='#8e3f82', magenta='#b8468a',
    radish='#df437a', radish2='#ec6f97', tip='#f8e6ea',
    carrot='#e7783a', carrot2='#c9582a', carrot3='#f3a067',
    parsnip='#efdcb0', parsnip2='#d8b77e', pline='#9b7c5d',
    turnip='#f2e3e7', turnip_top='#9a5fa2', lav='#b894c6',
    potato='#efd58c', potato2='#c9a45b',
    chard='#7b9d5b', chard2='#93b372', leaf_dark='#58794a', sage='#aac38b',
    stem='#c24f90', rib='#e690bb', leaf_purple='#a5719d', vein='#c3d8a0',
    chalk='#fbf3ec',
)


def f(v):
    return f'{v:.0f}'


def smooth(pts):
    """Closed Catmull-Rom through pts, as cubic Béziers."""
    n = len(pts)
    d = f'M{f(pts[0][0])} {f(pts[0][1])}'
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f'C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}'
    return d + 'Z'


def poly(pts):
    return 'M' + 'L'.join(f'{f(x)} {f(y)}' for x, y in pts) + 'Z'


def blob_pts(cx, cy, rx, ry, j=0.07, n=10, rot=0.0):
    pts = []
    c, s = math.cos(rot), math.sin(rot)
    for i in range(n):
        a = 2 * math.pi * i / n + R.uniform(-0.12, 0.12)
        k = 1 + R.uniform(-j, j)
        x, y = rx * k * math.cos(a), ry * k * math.sin(a)
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    return pts


def blob(*a, **k):
    return smooth(blob_pts(*a, **k))


def q(p0, p1, p2, t):
    return ((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
            (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])


def qn(p0, p1, p2, t):
    dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0])
    dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
    l = math.hypot(dx, dy) or 1
    return -dy / l, dx / l


def bend(p0, p2, amount):
    mx, my = (p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2
    dx, dy = p2[0] - p0[0], p2[1] - p0[1]
    l = math.hypot(dx, dy) or 1
    return (mx - dy / l * amount, my + dx / l * amount)


def ribbon(p0, p1, p2, half, n=16, j=0.5):
    """A band along a quadratic curve; half(t) is the half-width at t."""
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        x, y = q(p0, p1, p2, t)
        nx, ny = qn(p0, p1, p2, t)
        w = half(t)
        w = max(w + (R.uniform(-j, j) if w > 2 else 0), 0.3)
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    return poly(left + right[::-1])


def stroke(d, col, w, op=1.0):
    o = f' opacity="{op}"' if op < 1 else ''
    return f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{w}" stroke-linecap="round"{o}/>'


def qpath(p0, p1, p2):
    return f'M{f(p0[0])} {f(p0[1])}Q{f(p1[0])} {f(p1[1])} {f(p2[0])} {f(p2[1])}'


ANGLES = [0, 30, 60, 90, 120, 150]
CX, CY = 280, 350


def g(inner, filt=None, extra='', angle=None):
    """A piece of paper. Its grain runs at `angle` (snapped to ANGLES); the shadow does not turn with it."""
    if filt:
        return f'<g filter="url(#{filt})"{extra}>{inner}</g>'
    if angle is None:
        angle = R.choice(ANGLES)
    a = min(ANGLES, key=lambda v: min(abs(v - angle % 180), 180 - abs(v - angle % 180)))
    inner_t = f'rotate({-a} {CX} {CY})'
    m = re.search(r'transform="([^"]*)"', extra)
    if m:
        inner_t += ' ' + m.group(1)
    return f'<g transform="rotate({a} {CX} {CY})" filter="url(#c-paper-{a})"><g transform="{inner_t}">{inner}</g></g>'


_clip = [0]


def clip_id():
    _clip[0] += 1
    return f'c-clip-{_clip[0]}'


# ---------- Pieces ----------

def leaf(base, tip, w, fill, rib=None, vein=None, curve=0.0, jag=0.1, n=11, veins=5, rib_w=None):
    p1 = bend(base, tip, curve)
    left, right = [], []
    for i in range(1, n):
        t = i / n
        x, y = q(base, p1, tip, t)
        nx, ny = qn(base, p1, tip, t)
        hw = w / 2 * math.sin(math.pi * t ** 0.85) ** 0.7 * (1 + R.uniform(-jag, jag))
        left.append((x + nx * hw, y + ny * hw))
        right.append((x - nx * hw, y - ny * hw))
    out = [f'<path d="{smooth([base] + left + [tip] + right[::-1])}" fill="{fill}"/>']
    if vein:
        for k in range(1, veins + 1):
            t = k / (veins + 1) * 0.9
            a = q(base, p1, tip, t)
            b_ = q(base, p1, tip, min(t + 0.14, 0.97))
            nx, ny = qn(base, p1, tip, t + 0.07)
            for side in (1, -1):
                hw = w / 2 * math.sin(math.pi * (t + 0.1) ** 0.85) ** 0.7 * 0.78
                e = (b_[0] + nx * hw * side, b_[1] + ny * hw * side)
                out.append(stroke(qpath(a, ((a[0] + e[0]) / 2 + (b_[0] - a[0]) * .3, (a[1] + e[1]) / 2 + (b_[1] - a[1]) * .3), e), vein, 1.3, 0.85))
    if rib:
        out.append(stroke(qpath(base, p1, q(base, p1, tip, 0.93)), rib, rib_w or max(2.2, w * 0.05)))
    return ''.join(out)


def stalk(p0, p2, col, w, curve=0.0):
    return stroke(qpath(p0, bend(p0, p2, curve), p2), col, w)


def chard(base, tip, w, curve=10, stem_from=None, leaf_col=None):
    s = ''
    if stem_from:
        s += stalk(stem_from, base, C['stem'], 6.5, curve * 0.3)
    s += leaf(base, tip, w, leaf_col or R.choice([C['chard'], C['chard2'], C['leaf_dark']]),
              rib=C['stem'], vein=C['rib'], curve=curve)
    return g(s, angle=math.degrees(math.atan2(tip[1] - base[1], tip[0] - base[0])))


def beet_leaf(base, tip, w, curve=8, stem_from=None):
    s = ''
    if stem_from:
        s += stalk(stem_from, base, C['magenta'], 5, curve * 0.3)
    s += leaf(base, tip, w, C['leaf_purple'], rib=C['sage'], vein=C['vein'], curve=curve)
    return g(s, angle=math.degrees(math.atan2(tip[1] - base[1], tip[0] - base[0])))


def scribble(cx, cy, r, n=2):
    out = []
    for _ in range(n):
        a0 = R.uniform(0, math.tau)
        rr = r * R.uniform(0.35, 0.7)
        p0 = (cx + rr * math.cos(a0), cy + rr * math.sin(a0))
        p2 = (cx + rr * math.cos(a0 + 1.9), cy + rr * math.sin(a0 + 1.9))
        p1 = (cx + rr * 1.5 * math.cos(a0 + 0.95), cy + rr * 1.5 * math.sin(a0 + 0.95))
        out.append(stroke(qpath(p0, p1, p2), C['chalk'], 1.1, 0.35))
    return ''.join(out)


def root_body(cx, cy, r, point=1.28, squash=0.94):
    pts = blob_pts(cx, cy, r, r * squash, j=0.06, n=10)
    # The point nearest straight down becomes the start of the taproot.
    i = max(range(len(pts)), key=lambda k: pts[k][1])
    pts[i] = (cx + R.uniform(-3, 3), cy + r * point)
    return pts, pts[i]


def taproot(start, length, w, col, lean=0.0):
    end = (start[0] + lean, start[1] + length)
    return f'<path d="{ribbon(start, bend(start, end, lean * 0.4), end, lambda t: w * (1 - t) ** 1.3 + 0.4, n=10, j=0.2)}" fill="{col}"/>'


def stubs(cx, top, r, col, n=3, length=1.0):
    out = []
    for k in range(n):
        x = cx + (k - (n - 1) / 2) * r * 0.22 + R.uniform(-2, 2)
        l = r * R.uniform(0.45, 0.85) * length
        out.append(stalk((x, top + 4), (x + (k - (n - 1) / 2) * r * 0.25, top - l), col, R.uniform(4, 6), R.uniform(-6, 6)))
    return ''.join(out)


def beet(cx, cy, r, col=None, rot=0, stems=True):
    col = col or C['beet']
    pts, bottom = root_body(cx, cy, r)
    s = stubs(cx, cy - r * 0.9, r, C['magenta']) if stems else ''
    s += taproot(bottom, r * 0.9, 3.5, col, R.uniform(-8, 8))
    s += f'<path d="{smooth(pts)}" fill="{col}"/>'
    s += scribble(cx, cy, r, 3)
    return g(s, extra=f' transform="rotate({rot} {f(cx)} {f(cy)})"' if rot else '')


def radish(cx, cy, r, rot=0, col=None):
    col = col or R.choice([C['radish'], C['radish2']])
    pts, bottom = root_body(cx, cy, r, point=1.15)
    cid = clip_id()
    s = stubs(cx, cy - r * 0.85, r, C['chard'], n=2, length=1.3)
    s += taproot(bottom, r * 1.3, 1.8, C['tip'], R.uniform(-6, 6))
    body = smooth(pts)
    s += f'<clipPath id="{cid}"><path d="{body}"/></clipPath>'
    s += f'<path d="{body}" fill="{col}"/>'
    s += f'<path d="{blob(cx, cy + r * 0.95, r * 0.75, r * 0.55)}" fill="{C["tip"]}" clip-path="url(#{cid})"/>'
    return g(s, extra=f' transform="rotate({rot} {f(cx)} {f(cy)})"' if rot else '')


def turnip(cx, cy, r, rot=0):
    pts, bottom = root_body(cx, cy, r, point=1.22, squash=0.9)
    cid = clip_id()
    body = smooth(pts)
    s = stubs(cx, cy - r * 0.8, r, C['sage'], n=3)
    s += taproot(bottom, r * 0.8, 2.6, C['turnip'], R.uniform(-6, 6))
    s += f'<clipPath id="{cid}"><path d="{body}"/></clipPath>'
    s += f'<path d="{body}" fill="{C["turnip"]}"/>'
    s += f'<path d="{blob(cx + R.uniform(-4, 4), cy - r * 0.55, r * 1.15, r * 0.8, j=0.1)}" fill="{C["turnip_top"]}" clip-path="url(#{cid})"/>'
    s += scribble(cx, cy - r * 0.3, r * 0.7, 2)
    return g(s, extra=f' transform="rotate({rot} {f(cx)} {f(cy)})"' if rot else '')


def potato(cx, cy, rx, ry, rot=0, col=None):
    col = col or C['potato']
    s = f'<path d="{blob(cx, cy, rx, ry, j=0.08, rot=math.radians(rot))}" fill="{col}"/>'
    for _ in range(4):
        a = R.uniform(0, math.tau)
        k = R.uniform(0.2, 0.7)
        s += f'<circle cx="{f(cx + rx * k * math.cos(a))}" cy="{f(cy + ry * k * math.sin(a))}" r="{f(R.uniform(1, 1.8))}" fill="{C["potato2"]}"/>'
    return g(s)


def carrot(top, tip, w, curve=6, col=None, dark=None, fronds=4, cap=None, lines=None, frond_len=1.0):
    col = col or C['carrot']
    dark = dark or C['carrot2']
    p1 = bend(top, tip, curve)
    half = lambda t: w / 2 * min(1, 0.72 + t * 5) * (1 - t) ** 0.85 + 0.3
    s = ''
    back = (top[0] - (tip[0] - top[0]), top[1] - (tip[1] - top[1]))
    base_ang = math.atan2(back[1] - top[1], back[0] - top[0])
    for k in range(fronds):
        a = base_ang + (k - (fronds - 1) / 2) * 0.22 + R.uniform(-0.08, 0.08)
        l = R.uniform(70, 125) * frond_len
        end = (top[0] + math.cos(a) * l, top[1] + math.sin(a) * l)
        col_f = R.choice([C['chard'], C['chard2'], C['leaf_dark'], C['sage']])
        s += leaf(top, end, R.uniform(6, 10), col_f, curve=R.uniform(-12, 12), jag=0.08, n=9)
    s += f'<path d="{ribbon(top, p1, tip, half)}" fill="{col}"/>'
    for _ in range(7):
        t = R.uniform(0.12, 0.8)
        x, y = q(top, p1, tip, t)
        nx, ny = qn(top, p1, tip, t)
        hw = half(t)
        side = R.choice((1, -1))
        a = (x + nx * hw * 0.95 * side, y + ny * hw * 0.95 * side)
        b_ = (x + nx * hw * 0.25 * side, y + ny * hw * 0.25 * side)
        s += stroke(f'M{f(a[0])} {f(a[1])}L{f(b_[0])} {f(b_[1])}', lines or dark, 1.3, 0.7)
    s += f'<ellipse cx="{f(top[0])}" cy="{f(top[1])}" rx="{f(w * 0.3)}" ry="{f(w * 0.24)}" fill="{cap or dark}"/>'
    return g(s, angle=math.degrees(math.atan2(tip[1] - top[1], tip[0] - top[0])))


def parsnip(top, tip, w, curve=6, fronds=0):
    return carrot(top, tip, w, curve, C['parsnip'], C['parsnip2'], fronds, cap=C['pline'], lines=C['pline'])


def soil(x0=34, y0=74, x1=532, y1=684, cid='c-soil-edge', step=36, patches=9, dots=140):
    pts = []
    for x in range(x0, x1, step):
        pts.append((x + R.uniform(-4, 4), y0 + R.uniform(-5, 5)))
    for y in range(y0, y1, step):
        pts.append((x1 + R.uniform(-5, 5), y + R.uniform(-4, 4)))
    for x in range(x1, x0, -step):
        pts.append((x + R.uniform(-4, 4), y1 + R.uniform(-5, 5)))
    for y in range(y1, y0, -step):
        pts.append((x0 + R.uniform(-5, 5), y + R.uniform(-4, 4)))
    edge = poly(pts)
    s = f'<clipPath id="{cid}"><path d="{edge}"/></clipPath><path d="{edge}" fill="{C["soil"]}"/><g clip-path="url(#{cid})">'
    for _ in range(patches):
        s += f'<path d="{blob(R.uniform(x0 + 30, x1 - 30), R.uniform(y0 + 30, y1 - 30), R.uniform(30, 70), R.uniform(24, 50), j=0.15)}" fill="{C["soil2"]}" opacity=".55"/>'
    s += '</g>'
    specks = ''
    for _ in range(dots):
        col = C['speck'] if R.random() < 0.6 else C['speck2']
        specks += f'<circle cx="{f(R.uniform(x0 + 6, x1 - 6))}" cy="{f(R.uniform(y0 + 6, y1 - 6))}" r="{f(R.uniform(0.6, 2.4))}" fill="{col}" opacity=".7"/>'
    return g(s, 'c-soil') + specks


# ---------- Composition ----------

def back():
    out = [soil()]
    # Greens standing up out of the top of the pile.
    out += [
        beet_leaf((92, 205), (18, 46), 64, curve=-10, stem_from=(100, 260)),
        chard((128, 220), (84, -4), 84, curve=12, stem_from=(118, 275)),
        chard((170, 170), (196, -12), 70, curve=-10, stem_from=(160, 230)),
        beet_leaf((250, 150), (262, 6), 62, curve=8),
        chard((330, 150), (318, -8), 72, curve=-6, leaf_col=C['chard2']),
        beet_leaf((400, 160), (420, 4), 70, curve=-8, stem_from=(410, 220)),
        chard((452, 190), (540, 30), 78, curve=10, stem_from=(462, 250)),
        beet_leaf((500, 230), (556, 120), 56, curve=-8, stem_from=(496, 270)),
    ]
    # Peeking over the top of the phone.
    out += [
        potato(236, 48, 24, 17, rot=-10),
        radish(200, 46, 18, rot=-12),
        radish(372, 44, 19, rot=16, col=C['radish2']),
    ]
    # Left side of the phone.
    out += [
        beet(98, 290, 60, C['beet']),
        radish(134, 368, 24, rot=10),
        turnip(58, 384, 36, rot=-10),
        potato(44, 444, 26, 20, rot=30),
        potato(140, 430, 22, 17, rot=-20, col=C['parsnip']),
        turnip(104, 474, 46, rot=6),
        radish(46, 522, 22, rot=-18, col=C['radish']),
        potato(142, 548, 30, 22, rot=12),
        beet(62, 612, 30, C['beet2'], rot=-10),
        parsnip((74, 520), (192, 640), 30, curve=-8),
        carrot((40, 574), (176, 690), 36, curve=10, fronds=6),
        carrot((18, 614), (132, 700), 30, curve=-6, fronds=5, col=C['carrot3']),
    ]
    # Right side.
    out += [
        chard((520, 300), (584, 236), 44, curve=-8, stem_from=(506, 330)),
        beet_leaf((524, 540), (590, 500), 40, curve=6, stem_from=(508, 560)),
        radish(486, 102, 26, rot=12),
        turnip(500, 222, 50, rot=8),
        radish(452, 300, 22, rot=-16, col=C['radish2']),
        beet(490, 362, 56, C['magenta'], rot=-8),
        potato(524, 434, 24, 20, rot=-30),
        radish(450, 454, 22, rot=-20),
        beet(512, 524, 34, C['beet2'], rot=10),
        parsnip((530, 470), (446, 668), 34, curve=10),
        radish(502, 604, 24, rot=24, col=C['radish2']),
        potato(460, 640, 26, 18, rot=10, col=C['parsnip']),
        radish(522, 662, 20, rot=30),
    ]
    # Under the phone.
    out += [
        potato(206, 676, 34, 22, rot=8),
        beet(256, 682, 24, C['beet'], stems=False),
        potato(372, 682, 30, 20, rot=-12, col=C['parsnip']),
        radish(300, 680, 22, rot=-6),
    ]
    return ''.join(out)


def front():
    return ''.join([
        carrot((86, 648), (262, 596), 38, curve=-8, fronds=5),
        beet_leaf((502, 132), (392, 58), 62, curve=12, stem_from=(522, 196)),
        radish(436, 572, 26, rot=-24),
        potato(318, 668, 34, 23, rot=-6, col=C['potato']),
    ])


def paper_filter(a):
    t = math.radians(-a)
    dx, dy = 1.2 * math.cos(t) - 2.4 * math.sin(t), 1.2 * math.sin(t) + 2.4 * math.cos(t)
    return f"""<filter id="c-paper-{a}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="{4 + a // 30}" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="5" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.014 0.085" numOctaves="4" seed="{9 + a // 30}" result="paint"/>
    <feColorMatrix in="paint" type="matrix" values="0 0 0 0 1  0 0 0 0 0.97  0 0 0 0 0.93  1.3 0 0 0 -0.6" result="light"/>
    <feComposite in="light" in2="torn" operator="in" result="lightIn"/>
    <feColorMatrix in="paint" type="matrix" values="0 0 0 0 0.16  0 0 0 0 0.06  0 0 0 0 0.1  0 -1.3 0 0 0.5" result="dark"/>
    <feComposite in="dark" in2="torn" operator="in" result="darkIn"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="3" result="fiber"/>
    <feColorMatrix in="fiber" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1.2 0 -0.62" result="flecks"/>
    <feComposite in="flecks" in2="torn" operator="in" result="flecksIn"/>
    <feMerge result="painted"><feMergeNode in="torn"/><feMergeNode in="lightIn"/><feMergeNode in="darkIn"/><feMergeNode in="flecksIn"/></feMerge>
    <feDropShadow in="painted" dx="{dx:.2f}" dy="{dy:.2f}" stdDeviation="1.6" flood-color="#1c0d09" flood-opacity=".42"/>
  </filter>"""


FILTERS = '\n  '.join(paper_filter(a) for a in ANGLES) + '''
  <filter id="c-soil" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="12" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="9" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.02 0.12" numOctaves="4" seed="5" result="paint"/>
    <feColorMatrix in="paint" type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.38  0 0 0 0 0.3  1.3 0 0 0 -0.55" result="light"/>
    <feComposite in="light" in2="torn" operator="in" result="lightIn"/>
    <feMerge><feMergeNode in="torn"/><feMergeNode in="lightIn"/></feMerge>
  </filter>
  <filter id="c-small" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="4" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="2" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.12 0.9" numOctaves="2" seed="9" result="paint"/>
    <feColorMatrix in="paint" type="matrix" values="0 0 0 0 1  0 0 0 0 0.97  0 0 0 0 0.93  1.4 0 0 0 -0.6" result="light"/>
    <feComposite in="light" in2="torn" operator="in" result="lightIn"/>
    <feMerge result="painted"><feMergeNode in="torn"/><feMergeNode in="lightIn"/></feMerge>
    <feDropShadow in="painted" dx="0.5" dy="1" stdDeviation="0.6" flood-color="#1c0d09" flood-opacity=".35"/>
  </filter>'''


def bowl():
    """The 'photo' in the Nosh AI phone: oatmeal with blueberries, in the same paper."""
    global R
    R = random.Random(5)
    s = f'<path d="{blob(65, 42, 56, 30, j=0.03, n=12)}" fill="#f4ebdc"/>'
    s += f'<path d="{blob(65, 39, 44, 21, j=0.05, n=12)}" fill="#e3c992"/>'
    s = g(s, 'c-small')
    s += g(f'<path d="{blob(80, 36, 13, 8)}" fill="#fbf6f0"/>', 'c-small')
    for x, y in [(48, 34), (56, 42), (44, 44), (62, 30), (72, 46), (52, 50)]:
        s += g(f'<path d="{blob(x, y, 4.2, 4, j=0.1, n=7)}" fill="#4d3b7a"/>', 'c-small')
    for x, y, r in [(88, 45, 20), (84, 28, -30), (70, 26, 10)]:
        s += g(f'<path d="{blob(x, y, 5, 2.4, j=0.05, n=8, rot=math.radians(r))}" fill="#d9b98a"/>', 'c-small')
    s += g(leaf((96, 22), (110, 12), 8, C['chard2'], jag=0.04, n=7), 'c-small')
    return s


# ---------- Breakfast pieces ----------

def banana(start, end, w, curve=40):
    p1 = bend(start, end, curve)
    half = lambda t: w / 2 * math.sin(math.pi * min(max(t, 0.02), 0.98)) ** 0.55 + 1
    s = f'<path d="{ribbon(start, p1, end, half)}" fill="#f1d060"/>'
    ridge = [q(start, p1, end, t) for t in (0.1, 0.5, 0.9)]
    nx, ny = qn(start, p1, end, 0.5)
    s += stroke(qpath((ridge[0][0] + nx * w * .12, ridge[0][1] + ny * w * .12), (ridge[1][0] + nx * w * .5, ridge[1][1] + ny * w * .5), (ridge[2][0] + nx * w * .12, ridge[2][1] + ny * w * .12)), '#d6a531', 2, 0.7)
    s += f'<ellipse cx="{f(start[0])}" cy="{f(start[1])}" rx="{f(w * 0.2)}" ry="{f(w * 0.14)}" fill="#8a6a3a"/>'
    s += f'<circle cx="{f(end[0])}" cy="{f(end[1])}" r="2.6" fill="#4a3423"/>'
    return g(s, angle=math.degrees(math.atan2(end[1] - start[1], end[0] - start[0])))


def blueberry(cx, cy, r):
    col = R.choice(['#4a3f85', '#3e3570', '#5b4f96'])
    s = f'<path d="{blob(cx, cy, r, r * 0.95, j=0.06, n=8)}" fill="{col}"/>'
    s += f'<path d="{blob(cx - r * 0.3, cy - r * 0.3, r * 0.45, r * 0.35, j=0.1, n=7)}" fill="#8a83b8" opacity=".55"/>'
    ox, oy = cx + r * 0.2, cy - r * 0.15
    for k in range(5):
        a = k * math.tau / 5
        s += stroke(f'M{f(ox)} {f(oy)}L{f(ox + math.cos(a) * r * 0.3)} {f(oy + math.sin(a) * r * 0.3)}', '#241c48', 1.3)
    return g(s)


def almond(cx, cy, l, rot=0):
    pts = blob_pts(cx, cy, l / 2, l * 0.3, j=0.04, n=10)
    i = max(range(len(pts)), key=lambda k: pts[k][0])
    pts[i] = (cx + l * 0.62, cy)
    s = f'<path d="{smooth(pts)}" fill="#c99a63"/>'
    for dy in (-0.08, 0.08):
        s += stroke(qpath((cx - l * 0.3, cy + l * dy), (cx, cy + l * dy * 1.8), (cx + l * 0.35, cy + l * dy * 0.4)), '#a2733f', 1.1, 0.6)
    return g(s, extra=f' transform="rotate({rot} {f(cx)} {f(cy)})"')


def oat_bowl(cx, cy, rx, ry):
    body = [(cx - rx * 0.99, cy), (cx - rx * 0.86, cy + ry * 1.05), (cx - rx * 0.45, cy + ry * 1.75),
            (cx, cy + ry * 1.9), (cx + rx * 0.45, cy + ry * 1.75), (cx + rx * 0.86, cy + ry * 1.05), (cx + rx * 0.99, cy)]
    s = f'<path d="{smooth(body)}" fill="#a98fc2"/>'
    s += f'<ellipse cx="{f(cx)}" cy="{f(cy + ry * 1.8)}" rx="{f(rx * 0.32)}" ry="{f(ry * 0.22)}" fill="#8d74a8"/>'
    s += f'<path d="{blob(cx, cy, rx, ry, j=0.02, n=14)}" fill="#cdbadf"/>'
    s = g(s, angle=0)
    oats = f'<path d="{blob(cx, cy - ry * 0.05, rx * 0.84, ry * 0.7, j=0.04, n=12)}" fill="#e2c78f"/>'
    for _ in range(14):
        a = R.uniform(0, math.tau)
        k = R.uniform(0, 0.75)
        oats += f'<path d="{blob(cx + rx * 0.84 * k * math.cos(a), cy - ry * 0.05 + ry * 0.7 * k * math.sin(a), R.uniform(4, 7), R.uniform(2.5, 4), j=0.1, n=6, rot=R.uniform(0, 3))}" fill="#f0dfb3"/>'
    s += g(oats, angle=0)
    s += g(f'<path d="{blob(cx + rx * 0.3, cy - ry * 0.15, rx * 0.2, ry * 0.2)}" fill="#fbf7f2"/>', angle=0)
    for k in range(3):
        x, y = cx - rx * 0.1 + k * rx * 0.15, cy + ry * 0.15 - k * ry * 0.12
        s += g(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rx * 0.09)}" fill="#f5e6a8"/><circle cx="{f(x)}" cy="{f(y)}" r="{f(rx * 0.035)}" fill="#dcc46e"/>')
    for x, y in [(-0.45, 0.05), (-0.32, -0.2), (-0.5, -0.15), (-0.2, 0.25), (0.05, -0.28)]:
        s += blueberry(cx + rx * x, cy + ry * y, rx * 0.065)
    return s


def mint(base, tip, w):
    return g(leaf(base, tip, w, R.choice([C['chard2'], C['chard']]), rib=C['sage'], vein=C['vein'], veins=3, curve=4))


def bunch_leaf(base, tip, w, curve=8):
    return g(leaf(base, tip, w, R.choice([C['chard'], C['chard2'], C['leaf_dark']]), rib=C['sage'], vein=C['vein'], curve=curve),
             angle=math.degrees(math.atan2(tip[1] - base[1], tip[0] - base[0])))


# ---------- Compositions ----------

def breakfast():
    return ''.join([
        banana((300, 70), (462, 118), 38, curve=-34),
        mint((52, 208), (8, 172), 26),
        mint((60, 214), (34, 250), 22),
        oat_bowl(210, 150, 128, 62),
        almond(392, 196, 34, rot=-24),
        almond(424, 176, 30, rot=38),
        almond(438, 222, 32, rot=-6),
        blueberry(356, 244, 11), blueberry(378, 256, 10), blueberry(332, 258, 10),
        blueberry(58, 120, 11), blueberry(80, 104, 10), blueberry(40, 96, 9),
    ])


def feature(n):
    if n == 1:
        return ''.join([
            mint((60, 150), (4, 96), 34),
            blueberry(52, 128, 20), blueberry(22, 168, 18), blueberry(64, 178, 19), blueberry(34, 96, 16), blueberry(76, 90, 15),
            banana((-4, 470), (120, 318), 54, curve=-36),
            almond(376, 206, 54, rot=-30), almond(400, 262, 48, rot=24), almond(372, 300, 44, rot=-60),
            mint((368, 470), (440, 420), 36), mint((356, 486), (430, 540), 30),
            oat_bowl(362, 586, 104, 40),
        ])
    if n == 2:
        return ''.join([
            beet_leaf((66, 150), (14, 20), 48, curve=-8),
            chard((84, 146), (120, 2), 52, curve=8),
            beet(64, 210, 50, C['beet'], rot=-6),
            radish(384, 382, 24, rot=18), radish(398, 438, 22, rot=-12, col=C['radish2']),
            potato(58, 568, 32, 22, rot=14),
            potato(366, 580, 26, 18, rot=-20, col=C['parsnip']),
        ])
    if n == 3:
        return ''.join([
            carrot((396, 70), (300, 290), 36, curve=8, fronds=6),
            carrot((22, 470), (160, 606), 34, curve=-8, fronds=5, col=C['carrot3']),
            parsnip((414, 440), (318, 612), 32, curve=6),
            radish(40, 190, 22, rot=-14),
        ])
    return ''.join([
        chard((330, 210), (412, 24), 64, curve=10),
        turnip(48, 138, 40, rot=-8),
        chard((110, 520), (8, 410), 58, curve=-10),
        radish(386, 506, 24, rot=16),
        potato(68, 590, 28, 20, rot=10),
    ])


def radish_bunch():
    tie = (150, 170)
    out = []
    for base_tip in [((150, 172), (40, 30)), ((150, 170), (104, 4)), ((152, 170), (180, 0)), ((154, 172), (262, 36)), ((150, 176), (8, 112))]:
        out.append(bunch_leaf(base_tip[0], base_tip[1], R.uniform(46, 58), curve=R.uniform(-10, 10)))
    spots = [(78, 300, 26, -24), (122, 326, 28, -8), (174, 322, 27, 10), (220, 296, 25, 24), (150, 276, 24, 0)]
    stems = ''.join(stalk(tie, (x, y - r * 0.9), '#b04a7c', 3.4, R.uniform(-8, 8)) for x, y, r, _ in spots)
    out.append(g(stems))
    out += [radish(x, y, r, rot=rot) for x, y, r, rot in spots]
    twine = f'<ellipse cx="{tie[0]}" cy="{tie[1] + 6}" rx="16" ry="7" fill="#c9a45b"/>'
    twine += stroke(qpath((tie[0] + 12, tie[1] + 8), (tie[0] + 34, tie[1] + 20), (tie[0] + 26, tie[1] + 46)), '#b38e48', 2.4)
    twine += stroke(qpath((tie[0] + 8, tie[1] + 10), (tie[0] + 18, tie[1] + 34), (tie[0] + 4, tie[1] + 54)), '#b38e48', 2.4)
    out.append(g(twine))
    return ''.join(out)


def harvest():
    out = [soil(24, 150, 1096, 244, cid='c-soil-harvest', step=40, patches=6, dots=90)]
    out += [
        beet_leaf((306, 150), (270, 16), 54, curve=-8),
        chard((330, 150), (380, 6), 58, curve=10),
        chard((742, 200), (842, 40), 62, curve=10),
        beet_leaf((1046, 196), (1090, 70), 46, curve=-8),
        carrot((74, 186), (262, 216), 38, curve=-6, fronds=6),
        potato(236, 236, 30, 18, rot=6),
        beet(310, 186, 44, C['beet']),
        radish(386, 212, 22, rot=-64),
        parsnip((420, 158), (566, 226), 32, curve=8),
        potato(534, 238, 28, 17, rot=-10, col=C['parsnip']),
        turnip(620, 186, 42, rot=6),
        potato(690, 222, 30, 20, rot=18),
        carrot((770, 170), (960, 226), 34, curve=8, fronds=5, col=C['carrot3']),
        radish(990, 206, 24, rot=-58, col=C['radish2']),
        radish(1030, 184, 20, rot=-40),
        beet(1062, 222, 26, C['magenta'], stems=False),
    ]
    return ''.join(out)


def card_block():
    out = [soil(30, 70, 450, 560, cid='c-soil-card', step=34, patches=7, dots=110)]
    out += [
        chard((96, 180), (40, 8), 70, curve=-10, stem_from=(104, 230)),
        beet_leaf((150, 160), (160, 0), 60, curve=8),
        chard((240, 150), (262, -6), 66, curve=-8, leaf_col=C['chard2']),
        beet_leaf((330, 160), (372, 10), 62, curve=10),
        chard((392, 196), (468, 60), 60, curve=8, stem_from=(396, 240)),
        beet(96, 250, 54, C['beet']),
        turnip(206, 236, 50, rot=-6),
        radish(300, 214, 26, rot=12),
        beet(372, 270, 56, C['magenta'], rot=-8),
        potato(60, 336, 26, 20, rot=30),
        radish(150, 330, 26, rot=-14, col=C['radish2']),
        turnip(246, 340, 40, rot=8),
        potato(318, 362, 30, 22, rot=-10, col=C['parsnip']),
        radish(410, 380, 24, rot=18),
        beet(96, 436, 40, C['beet2'], rot=6),
        radish(190, 432, 22, rot=-20),
        potato(260, 452, 30, 21, rot=10),
        parsnip((340, 400), (440, 548), 34, curve=10),
        beet(386, 470, 30, C['beet'], stems=False),
        carrot((40, 470), (230, 556), 38, curve=-10, fronds=6),
        carrot((70, 516), (262, 580), 32, curve=8, fronds=4, col=C['carrot3']),
        radish(300, 540, 22, rot=-8),
    ]
    return ''.join(out)


def card_side(left):
    if left:
        return ''.join([
            chard((120, 250), (40, 40), 70, curve=-10),
            beet(120, 290, 52, C['beet']),
            radish(70, 404, 24, rot=-16),
            carrot((30, 470), (190, 600), 36, curve=10, fronds=6),
            potato(150, 440, 28, 20, rot=20),
        ])
    return ''.join([
        beet_leaf((110, 200), (200, 30), 58, curve=10),
        turnip(116, 250, 48, rot=8),
        radish(170, 360, 24, rot=16, col=C['radish2']),
        parsnip((200, 420), (90, 600), 34, curve=-8),
        potato(80, 400, 28, 20, rot=-20, col=C['parsnip']),
        radish(186, 520, 22, rot=-10),
    ])


def lone_radish():
    return ''.join([
        mint((70, 84), (20, 30), 36),
        radish(112, 118, 42, rot=-58),
    ])


def svgfile(name, vb, body, where=None):
    where = where or ART
    os.makedirs(where, exist_ok=True)
    doc = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><defs>{FILTERS}</defs>{body}</svg>\n'
    open(os.path.join(where, name), 'w', encoding='utf-8', newline='\n').write(doc)
    print(f'  {name:18} {len(doc) // 1024} KB')


def write():
    global R
    # The hero first, from its own seed, so it stays exactly as it was approved.
    R = random.Random(23)
    hero_vb = '-120 -40 800 780'
    svgfile('hero-back.svg', hero_vb, back())
    svgfile('hero-front.svg', hero_vb, front())
    svgfile('bowl.svg', '0 0 130 78', bowl())
    R = random.Random(31)
    svgfile('breakfast.svg', '0 0 480 280', breakfast())
    for n in (1, 2, 3, 4):
        R = random.Random(40 + n)
        svgfile(f'feature-{n}.svg', '-60 -40 540 700', feature(n))
    R = random.Random(52)
    svgfile('radishes.svg', '-10 -20 300 400', radish_bunch())
    R = random.Random(61)
    svgfile('harvest.svg', '-60 -20 1240 280', harvest())
    R = random.Random(73)
    svgfile('card-block.svg', '0 -20 480 620', card_block(), CARDS)
    R = random.Random(81)
    svgfile('card-left.svg', '0 0 240 640', card_side(True), CARDS)
    R = random.Random(82)
    svgfile('card-right.svg', '0 0 240 640', card_side(False), CARDS)
    R = random.Random(91)
    svgfile('radish.svg', '0 0 240 200', lone_radish())


if __name__ == '__main__':
    write()
