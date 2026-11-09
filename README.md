# DOST-SEI Reviewer

Flashcard reviewer and formula cheatsheet for the DOST-SEI Scholarship Examination.

**Open: <https://kerwinarlan.github.io/dost-sei-reviewer/>**

440 cards, offline, no account. Built for one tutee sitting the exam on **15 Nov 2026**.

---

## The exam this covers

Taken from the domain table the tutee sent ([`assets/exam-domain-table.jpg`](assets/exam-domain-table.jpg)).

| Part | Domain | Sub-domains | Time |
|:--:|---|---|---:|
| I | Creative Reasoning | Mechanical, Spatial, Verbal | 45 min |
| I | Language and Literature | Grammar, reading, literature | 45 min |
| II | Science | Biology, Chemistry, Earth Science, Physics, Space Science | 65 min |
| III | Mathematics | Algebra, geometry, trig, stats, pre-calc, calculus | 70 min |

Total: 180 minutes. Part I carries two domains inside one 45-minute block.

## Contents

| Deck | Part | Cards | Source |
|:--|:--:|---:|:--|
| Mathematics, core | III | 60 | `deck/math-algebra.json` |
| Mathematics, advanced | III | 55 | `deck/math-advanced.json` |
| Biology and Chemistry | II | 80 | `deck/science-bio-chem.json` |
| Physics | II | 55 | `deck/science-physics.json` |
| Earth and Space Science | II | 40 | `deck/science-earth-space.json` |
| Verbal and Language | I | 80 | `deck/verbal-language.json` |
| Abstract Reasoning | I | 70 | `deck/abstract-reasoning.json` |
| **Total** | | **440** | |

Every card carries a worked answer, the trap a student usually falls into, and a difficulty mark. 30 percent easy, 50 percent moderate, 20 percent hard.

Formula cheatsheet: [`cheatsheet.md`](cheatsheet.md). Twelve sections, 259 lines, one formula per line.
Six-day schedule: [`PLAN.md`](PLAN.md). One domain per day, with the daily loop.

## Use it

1. Open the link on a phone or laptop.
2. Pick a part, or pick one domain.
3. Answer. Read the explanation and the trap.
4. Tap Next. Tap Again if it needs another pass.

Progress saves in the browser. Order is weak cards first. Wrong cards return later in the same session and collect in a drill queue at the end.

### Timed mock

Tap **Timed mock exam** on the home screen, pick a scope, and start.

- 40 items per part, drawn at random from that part's deck.
- Clock is the real part time: 45, 65, or 70 minutes. Full exam is 180.
- No feedback while the clock runs. Flag items, jump with the item palette, change answers.
- At zero the run submits itself.
- Result: score, wrong and blank counts, per-domain breakdown, and a correction list with the worked answer for every missed item.

Keyboard: `1`-`4` answer, `Enter` next, `Esc` exit.
Offline: the page registers a service worker on the live site. Add it to the home screen after the first load.

## Build and check

```bash
node build.mjs   # deck/*.json -> index.html
node test.mjs    # headless Chrome check, writes shots/
```

`index.html` is generated. Edit `src/app.html` and `deck/*.json`, then rebuild.

## Repo layout

```
index.html          generated single-file app, 440 cards inlined
src/app.html        app template, DECK marker
deck/*.json         card source, one file per deck
deck/SCHEMA.md      card contract
build.mjs           JSON validation and inline build
test.mjs            end-to-end browser check
sw.js               offline cache
cheatsheet.md       formulas and rules
PLAN.md             six-day schedule
assets/             source domain table screenshot
shots/              test screenshots, gitignored
```

## How the content was checked

Seven writers produced one deck each against a fixed card contract. Three independent verifiers then re-solved the cards by subject and fixed errors in place. `build.mjs` rejects duplicate ids, answers missing from the choices, ragged grids, and missing explanations. `test.mjs` drives a real browser: it loads the deck, answers one card wrong and one right, checks requeue and scoring, reloads to confirm saved progress, and checks the 390 px layout for overflow.

## Honesty note

- Not affiliated with DOST-SEI.
- No past exam items. DOST-SEI does not release the actual test. Every card follows the published domain table, not a leaked paper.
- Per-part item counts, scoring rules, and cut-off scores are not public. This reviewer does not guess them. Read the instructions on the booklet cover.

## Known limits

- Spatial items use character grids, not rendered 3D figures. Nets, rotation, reflection, and folding work in that format. Block-stack items are worded.
- In study mode the clock only shows elapsed time. Use the timed mock for a forced stop.
- The timed mock uses 40 items per part. The real item count is not public, so the per-item pace is a practice pace, not a claim about the booklet.
- One explanation per card. No separate worked solution sheet.
