#!/usr/bin/env python3
"""Generate figure cards for the DOST-SEI reviewer.

Figures are stored as primitive shape lists so the app can render them
as inline SVG without parsing markup. Geometry is computed here, not
eyeballed, and the answer key is derived from the same transform.
"""
import json
import math
from itertools import permutations

W = 320
INK = 1


# ---------- primitives ----------
def r(x, y, w, h, f=1):
    return {"k": "r", "x": round(x, 1), "y": round(y, 1), "w": round(w, 1), "h": round(h, 1), "f": f}


def c(x, y, rad, f=1):
    return {"k": "c", "x": round(x, 1), "y": round(y, 1), "r": round(rad, 1), "f": f}


def ln(x1, y1, x2, y2, d=0):
    return {"k": "l", "x1": round(x1, 1), "y1": round(y1, 1), "x2": round(x2, 1), "y2": round(y2, 1), "d": d}


def t(x, y, s, sz=13):
    return {"k": "t", "x": round(x, 1), "y": round(y, 1), "t": s, "sz": sz}


def dots(n, x, y, size):
    """Draw n dots in a 3-wide block inside a size box at (x, y)."""
    if n > 9:
        raise ValueError("dot count %d does not fit the tile" % n)
    out = []
    rows = math.ceil(n / 3)
    gaps = {1: [0.5], 2: [0.34, 0.66], 3: [0.18, 0.5, 0.82]}[rows]
    step = size * 0.235
    rad = size * 0.075
    left = n
    for i, fy in enumerate(gaps):
        k = min(3, left)
        left -= k
        cy = y + size * fy
        startx = x + size / 2 - (k - 1) * step / 2
        for j in range(k):
            out.append(c(startx + j * step, cy, rad))
    return out


# ---------- polyomino helpers ----------
def norm(cells):
    mr = min(a for a, _ in cells)
    mc = min(b for _, b in cells)
    return frozenset((a - mr, b - mc) for a, b in cells)


def rot_cw(cells):
    return norm([(b, -a) for a, b in cells])


def mirror(cells):
    return norm([(a, -b) for a, b in cells])


def shape_box(cells):
    rows = max(a for a, _ in cells) + 1
    cols = max(b for _, b in cells) + 1
    return rows, cols


def draw_shape(cells, x, y, s):
    out = []
    for a, b in sorted(cells):
        out.append(r(x + b * s, y + a * s, s - 2, s - 2))
    return out


# ---------- cube net folding ----------
def roll(die, d):
    t, b, n, s, e, w = die["top"], die["bottom"], die["north"], die["south"], die["east"], die["west"]
    if d == "E":
        return {"top": w, "bottom": e, "east": t, "west": b, "north": n, "south": s}
    if d == "W":
        return {"top": e, "bottom": w, "east": b, "west": t, "north": n, "south": s}
    if d == "S":
        return {"top": n, "bottom": s, "south": t, "north": b, "east": e, "west": w}
    if d == "N":
        return {"top": s, "bottom": n, "south": b, "north": t, "east": e, "west": w}
    raise ValueError(d)


MOVES = {"E": (0, 1), "W": (0, -1), "S": (1, 0), "N": (-1, 0)}
OPP = {"E": "W", "W": "E", "N": "S", "S": "N"}


def fold_net(cells):
    """Return {(a,b): token} and the token pairs that end up opposite."""
    start = cells[0]
    die = {"top": "T", "bottom": "B", "north": "N", "south": "S", "east": "E", "west": "W"}
    label = {start: "B"}
    seen = {start}
    queue = [(start, die)]
    while queue:
        (a, b), d0 = queue.pop(0)
        for d, (da, db) in MOVES.items():
            nb = (a + da, b + db)
            if nb not in cells:
                continue
            die2 = roll(d0, d)
            if nb in seen:
                if label[nb] != die2["bottom"]:
                    raise ValueError("invalid net at %s" % (nb,))
                continue
            seen.add(nb)
            label[nb] = die2["bottom"]
            queue.append((nb, die2))
    if len(seen) != len(cells):
        raise ValueError("net not connected")
    # token pairs are fixed: T-B, N-S, E-W
    tok2cell = {v: k for k, v in label.items()}
    return tok2cell


# ---------- card builders ----------
CARDS = []


def card(cid, sub, q, choices, answer, why, trap, diff, fig):
    CARDS.append({
        "id": cid, "part": "I", "domain": "Creative Reasoning", "sub": sub,
        "q": q, "choices": choices, "answer": answer, "why": why,
        "trap": trap, "diff": diff, "fig": {"w": fig["w"], "h": fig["h"], "shapes": fig["shapes"]},
    })


def matrix_card(cid, counts, missing, options, rule, why, trap, diff):
    shapes = []
    ox, oy, cell, gap = 62, 6, 60, 8
    for rr in range(3):
        for cc in range(3):
            x = ox + cc * (cell + gap)
            y = oy + rr * (cell + gap)
            shapes.append(r(x, y, cell, cell, f=0))
            if (rr, cc) == missing:
                shapes.append(t(x + cell / 2, y + cell / 2 + 1, "?", 22))
            else:
                shapes += dots(counts[rr][cc], x, y, cell)
    ty = 232
    for i, n in enumerate(options):
        x = 30 + i * 70
        shapes.append(r(x, ty, 40, 40, f=0))
        shapes += dots(n, x, ty, 40)
        shapes.append(t(x + 20, ty + 56, "ABCD"[i], 12))
    correct_at = options.index(counts[missing[0]][missing[1]])
    card(cid, "Figure Matrix",
         "One tile is missing from this 3 by 3 matrix. Which option completes it?",
         ["A", "B", "C", "D"], "ABCD"[correct_at],
         rule + " " + why, trap, diff, {"w": W, "h": 300, "shapes": shapes})


def rotation_card(cid, cells, correct_at, why, trap, diff):
    base = norm(cells)
    correct = rot_cw(base)
    pool = [correct, rot_cw(rot_cw(base)), rot_cw(rot_cw(rot_cw(base))), mirror(base), base]
    uniq = []
    for p in pool:
        if p != correct and p not in uniq:
            uniq.append(p)
    opts = uniq[:3]
    opts.insert(correct_at, correct)

    shapes = []
    s = 24
    rows, cols = shape_box(base)
    shapes += draw_shape(base, (W - cols * s) / 2, 18 + (120 - rows * s) / 2, s)

    s2 = 16
    for i, opt in enumerate(opts):
        rr, cc = shape_box(opt)
        cx = 12 + i * 78 + 39
        shapes += draw_shape(opt, cx - cc * s2 / 2, 190 + (64 - rr * s2) / 2, s2)
        shapes.append(t(cx, 272, "ABCD"[i], 12))

    card(cid, "Rotation and Reflection",
         "Which option is the figure turned 90 degrees clockwise?",
         ["A", "B", "C", "D"], "ABCD"[correct_at], why, trap, diff,
         {"w": W, "h": 290, "shapes": shapes})


def net_card(cid, cells, labels, ask_label, why, trap, diff, correct_at):
    tok2cell = fold_net(cells)
    label_of = {cell: labels[i] for i, cell in enumerate(cells)}
    cell_of = {v: k for k, v in label_of.items()}
    opp_tok = {"T": "B", "B": "T", "N": "S", "S": "N", "E": "W", "W": "E"}
    ask_tok = tok2cell_rev(tok2cell, cell_of[ask_label])
    opp = label_of[tok2cell[opp_tok[ask_tok]]]

    s = 40
    rows = max(a for a, _ in cells) + 1
    cols = max(b for _, b in cells) + 1
    ox = (W - cols * s) / 2
    oy = 30
    shapes = []
    for (a, b), lab in label_of.items():
        shapes.append(r(ox + b * s, oy + a * s, s, s, f=0))
        shapes.append(t(ox + b * s + s / 2, oy + a * s + s / 2, str(lab), 15))

    others = [str(x) for x in labels if x != ask_label and x != opp]
    choices = others[:3] + [str(opp)]
    choices = choices[correct_at:] + choices[:correct_at]
    card(cid, "Nets",
         "The net folds into a cube. Which face ends up opposite face " + str(ask_label) + "?",
         choices, str(opp), why, trap, diff, {"w": W, "h": 240, "shapes": shapes})


def tok2cell_rev(tok2cell, cell):
    for tok, cc in tok2cell.items():
        if cc == cell:
            return tok
    raise KeyError(cell)


def fold_card(cid, punch_n, folds, holes, why, trap, diff):
    shapes = []
    size = 140
    x0, y0 = (W - size) / 2, 30
    shapes.append(r(x0, y0, size, size, f=0))
    if folds == 1:
        shapes.append(ln(x0 + size / 2, y0 - 6, x0 + size / 2, y0 + size + 6, d=1))
        shapes.append(t(x0 + size / 2, y0 - 16, "fold", 11))
    else:
        shapes.append(ln(x0 + size / 2, y0 - 6, x0 + size / 2, y0 + size + 6, d=1))
        shapes.append(ln(x0 - 6, y0 + size / 2, x0 + size + 6, y0 + size / 2, d=1))
        shapes.append(t(x0 + size / 2, y0 - 16, "fold", 11))

    spots = [(x0 + 30, y0 + 34), (x0 + 52, y0 + 74), (x0 + 30, y0 + 106)]
    for i in range(punch_n):
        shapes.append(c(spots[i][0], spots[i][1], 5))

    card(cid, "Paper Folding",
         "The square is folded along the dashed line, then punched " + ("once" if punch_n == 1 else "twice") +
         ". How many holes are there when it is unfolded?",
         ["2", "3", "4", "6"], str(holes), why, trap, diff,
         {"w": W, "h": 210, "shapes": shapes})


# ---------- build ----------
matrix_card(
    "fig-001", [[1, 2, 3], [2, 3, 4], [3, 4, 5]], (2, 2), [5, 4, 6, 7],
    "Dots rise by one across each row and down each column, so the corner tile holds 5.",
    "Row 3 is 3, 4, 5.", "Reading the diagonal and answering 4.", 2)

matrix_card(
    "fig-002", [[2, 2, 2], [4, 4, 4], [6, 6, 6]], (2, 2), [5, 6, 7, 8],
    "Every tile in a row has the same count, and the row total rises by two.",
    "Row 3 holds 6 dots.", "Adding two to the last row and answering 8.", 1)

matrix_card(
    "fig-003", [[1, 3, 5], [2, 4, 6], [3, 5, 7]], (2, 1), [4, 6, 5, 7],
    "Each row starts one higher and climbs by two, so row 3 reads 3, 5, 7.",
    "The middle tile is 5.", "Adding two to the last term and answering 7.", 3)

matrix_card(
    "fig-004", [[6, 5, 4], [5, 4, 3], [4, 3, 2]], (2, 2), [1, 3, 4, 2],
    "Each step right or down removes one dot, so the corner tile holds 2.",
    "4, 3, 2 along the last row.", "Continuing the diagonal to 1.", 1)

rotation_card("fig-005", [(0, 0), (1, 0), (2, 0), (2, 1), (2, 2)], 2,
              "The left column becomes the top row, and the foot becomes a column down the left side.",
              "Rotating the wrong way and picking the counterclockwise version.", 2)

rotation_card("fig-006", [(0, 0), (0, 1), (1, 1), (1, 2), (2, 2)], 1,
              "Every cell at row r, column c moves to row c, column H minus 1 minus r. The falling diagonal flips to rise the other way.",
              "Mirroring instead of rotating.", 2)

rotation_card("fig-007", [(0, 1), (0, 2), (0, 3), (1, 1), (2, 1)], 3,
              "The top bar drops to the middle row, and the arm now hangs from its right end.",
              "Turning 90 degrees counterclockwise.", 2)

rotation_card("fig-008", [(0, 0), (1, 0), (1, 1), (1, 2), (2, 2)], 0,
              "The middle row becomes the middle column, while the corners swap to the top right and bottom left.",
              "Picking the 180 degree turn.", 2)

net_card("fig-009", [(0, 1), (1, 0), (1, 1), (1, 2), (1, 3), (2, 1)],
         [1, 2, 3, 4, 5, 6], 1,
         "In a row of four, faces separated by one square are opposite. Face 1 sits above face 3, so its opposite is the square below.",
         "Reading adjacency as opposition.", 2, 1)

net_card("fig-010", [(0, 0), (0, 1), (1, 1), (1, 2), (2, 2), (2, 3)],
         [1, 2, 3, 4, 5, 6], 2,
         "Folding the staircase pairs the first and fourth squares, the second and fifth, and the third and sixth.",
         "Pairing neighbours that share an edge.", 3, 2)

fold_card("fig-011", 2, 1, 4,
          "One fold doubles the layers, so two punches cut four holes.",
          "Counting punches instead of holes.", 1)

fold_card("fig-012", 1, 2, 4,
          "Two folds make four layers, so one punch cuts four holes.",
          "Forgetting the second fold and answering 2.", 2)

# report net opposite pairs so the written reasons can be checked
OPP = {"T": "B", "B": "T", "N": "S", "S": "N", "E": "W", "W": "E"}
for cells, labels in [
    ([(0, 1), (1, 0), (1, 1), (1, 2), (1, 3), (2, 1)], [1, 2, 3, 4, 5, 6]),
    ([(0, 0), (0, 1), (1, 1), (1, 2), (2, 2), (2, 3)], [1, 2, 3, 4, 5, 6]),
]:
    t2c = fold_net(cells)
    lab = {cells[i]: labels[i] for i in range(len(cells))}
    pairs = sorted({tuple(sorted((lab[t2c[tk]], lab[t2c[OPP[tk]]]))) for tk in ["T", "N", "E"]})
    print("net pairs:", pairs)

out = {"part": "I", "domain": "Creative Reasoning", "cards": CARDS}
with open("deck/abstract-figures.json", "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=1, ensure_ascii=False)
print("wrote", len(CARDS), "figure cards")
