// Build index.html: inject deck/*.json into src/app.html.
// No dependencies. Run: node build.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const deckDir = join(root, 'deck');
const PART_ORDER = { I: 1, II: 2, III: 3 };

const files = existsSync(deckDir)
  ? readdirSync(deckDir).filter(f => f.endsWith('.json')).sort()
  : [];

const cards = [];
const errors = [];
const seenIds = new Set();
const perDeck = [];

for (const file of files) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(join(deckDir, file), 'utf8'));
  } catch (e) {
    errors.push(`${file}: invalid JSON - ${e.message}`);
    continue;
  }
  const list = Array.isArray(doc) ? doc : doc.cards;
  if (!Array.isArray(list)) { errors.push(`${file}: no cards array`); continue; }
  perDeck.push([file, list.length]);

  for (const raw of list) {
    const c = { part: doc.part, domain: doc.domain, ...raw };
    const tag = `${file}:${c.id || '(no id)'}`;
    if (!c.id) { errors.push(`${tag}: missing id`); continue; }
    if (seenIds.has(c.id)) { errors.push(`${tag}: duplicate id`); continue; }
    seenIds.add(c.id);
    if (!PART_ORDER[c.part]) errors.push(`${tag}: bad part ${JSON.stringify(c.part)}`);
    if (!c.domain) errors.push(`${tag}: missing domain`);
    if (!c.q) errors.push(`${tag}: missing q`);
    if (!c.why) errors.push(`${tag}: missing why`);
    if (!c.answer) errors.push(`${tag}: missing answer`);
    if (c.choices?.length && !c.choices.includes(c.answer)) {
      errors.push(`${tag}: answer "${c.answer}" not in choices`);
    }
    if (c.grid) {
      const w = c.grid[0]?.length || 0;
      if (!w || c.grid.some(r => r.length !== w)) errors.push(`${tag}: ragged grid`);
      if (c.grid.length > 6 || w > 10) errors.push(`${tag}: grid too large`);
    }
    cards.push({
      id: c.id,
      part: c.part,
      domain: c.domain,
      sub: c.sub || '',
      q: c.q,
      choices: Array.isArray(c.choices) ? c.choices : [],
      answer: c.answer,
      why: c.why,
      trap: c.trap || '',
      diff: Math.min(3, Math.max(1, c.diff || 1)),
      ...(c.grid ? { grid: c.grid } : {}),
    });
  }
}

if (errors.length) {
  console.error('Deck errors:');
  for (const e of errors.slice(0, 40)) console.error('  - ' + e);
  if (errors.length > 40) console.error(`  ... ${errors.length - 40} more`);
  process.exit(1);
}

cards.sort((a, b) => (PART_ORDER[a.part] - PART_ORDER[b.part]) || a.domain.localeCompare(b.domain));

const tpl = readFileSync(join(root, 'src', 'app.html'), 'utf8');
const marker = '/*DECK*/[]';
if (!tpl.includes(marker)) {
  console.error('Template marker /*DECK*/[] not found in src/app.html');
  process.exit(1);
}
const out = tpl.replace(marker, JSON.stringify(cards));
writeFileSync(join(root, 'index.html'), out);

const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
for (const [f, n] of perDeck) console.log(`  ${f.padEnd(30)} ${String(n).padStart(4)}`);
console.log(`\n${cards.length} cards -> index.html (${kb} KB)`);
