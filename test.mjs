// One runnable check: loads index.html in headless Chrome, answers a card,
// verifies feedback, persistence, and captures screenshots.
// Run: node test.mjs
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HTTP = 'http://127.0.0.1:8123';
const CDP = 'http://127.0.0.1:9222';
const shots = join(root, 'shots');
mkdirSync(shots, { recursive: true });

const wait = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};

const server = spawn('python3', ['-m', 'http.server', '8123', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9222', '--remote-allow-origins=*',
  `--user-data-dir=/tmp/dost-chrome-${process.pid}`, '--window-size=390,844', 'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  await wait(1500);
  const list = await (await fetch(`${CDP}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  if (!page) throw new Error('no page target');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, m => m.error ? rej(new Error(m.method ? JSON.stringify(m.error) : m.error.message)) : res(m.result));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };
  const shot = async name => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(shots, name), Buffer.from(data, 'base64'));
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await send('Page.navigate', { url: `${HTTP}/index.html` });
  await wait(900);

  const nav = await fetch(`${HTTP}/index.html`);
  check('index.html served', nav.ok);

  const total = await ev('DECK.length');
  check('deck loaded', total > 100, `${total} cards`);

  const shown = await ev(`document.querySelectorAll('.stat-row').length`);
  check('home renders domains', shown >= 2, `${shown} domains`);
  await shot('01-home.png');

  const groups = await ev(`[...document.querySelectorAll('[data-group]')].map(b => b.dataset.group)`);
  check('abstract reasoning is its own track', groups.includes('Abstract Reasoning'), groups.join(', '));
  await ev(`document.querySelector('[data-group="Abstract Reasoning"]').click()`);
  await wait(300);
  const absN = await ev(`ses ? ses.queue.length : 0`);
  check('abstract track session loads', absN > 60, `${absN} cards`);
  await ev(`document.querySelector('[data-act="exit"]').click()`);
  await wait(200);

  await ev(`document.getElementById('start').click()`);
  await wait(250);
  const q = await ev(`document.querySelector('.q')?.textContent || ''`);
  check('session shows a question', q.length > 10, JSON.stringify(q.slice(0, 40)) + '...');
  const nChoices = await ev(`document.querySelectorAll('[data-choice]').length`);
  check('choices rendered', nChoices >= 3, `${nChoices} choices`);
  await shot('02-question.png');

  // force a wrong answer
  const wrong = await ev(`(() => {
    const c = DECK.find(x => x.id === ses.queue[ses.i]);
    const el = [...document.querySelectorAll('[data-choice]')].find(b => b.dataset.choice !== c.answer);
    if (!el) return null;
    el.click();
    return { picked: el.dataset.choice, answer: c.answer, right: ses.right, wrong: ses.wrong, len: ses.queue.length };
  })()`);
  await wait(200);
  const badFb = await ev(`!!document.querySelector('.fb.bad')`);
  const correctMark = await ev(`document.querySelectorAll('.choice.correct').length`);
  check('wrong answer marks feedback bad', badFb);
  check('correct choice is flagged', correctMark === 1);
  check('wrong answer scores 0 right', wrong && wrong.right === 0 && wrong.wrong === 1);
  check('wrong card re-queued', wrong && wrong.len > 1);
  await shot('03-feedback-wrong.png');

  await ev(`document.querySelector('[data-act="next"]').click()`);
  await wait(200);
  const ok = await ev(`(() => {
    const c = DECK.find(x => x.id === ses.queue[ses.i]);
    const el = [...document.querySelectorAll('[data-choice]')].find(b => b.dataset.choice === c.answer);
    if (!el) return null;
    el.click();
    return { right: ses.right, wrong: ses.wrong, box: (JSON.parse(localStorage.getItem('dost.v1')).cards[c.id] || {}).box };
  })()`);
  await wait(200);
  const goodFb = await ev(`!!document.querySelector('.fb') && !document.querySelector('.fb.bad')`);
  check('correct answer accepted', goodFb && ok && ok.right === 1);
  await shot('04-feedback-right.png');

  await ev(`document.querySelector('[data-act="exit"]').click()`);
  await wait(200);
  const home2 = await ev(`!!document.getElementById('start')`);
  check('exit returns home', home2);

  await send('Page.navigate', { url: `${HTTP}/index.html` });
  await wait(800);
  const studied = await ev(`(() => { const s = JSON.parse(localStorage.getItem('dost.v1') || '{}'); return Object.values(s.cards || {}).filter(c => c.seen > 0).length; })()`);
  check('progress persists across reload', studied >= 2, `${studied} cards seen`);

  const sw = await ev(`navigator.serviceWorker.getRegistration().then(r => !!r)`);
  check('service worker registered', sw);

  const overflow = await ev(`document.documentElement.scrollWidth > window.innerWidth + 1`);
  check('no horizontal overflow at 390px', !overflow);
  await shot('05-home-after.png');

  await ev(`startSession('all', 'all', ['spa-009'])`);
  await wait(350);
  const cells = await ev(`document.querySelectorAll('.grid .cell').length`);
  check('grid figure renders', cells >= 9, `${cells} cells`);
  await shot('06-grid.png');

  await ev(`(() => {
    const c = DECK.find(x => x.id === 'spa-009');
    const el = [...document.querySelectorAll('[data-choice]')].find(b => b.dataset.choice === c.answer);
    el.click();
  })()`);
  await wait(200);
  await ev(`document.querySelector('[data-act="next"]').click()`);
  await wait(250);
  const sum = await ev(`!!document.querySelector('.big')`);
  check('summary renders after last card', sum);
  await shot('07-summary.png');

  await ev(`ses = null; view = 'home'; render();`);
  await wait(250);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await wait(200);
  await shot('08-home-dark.png');

  await send('Page.navigate', { url: 'file://' + join(root, 'index.html') });
  await wait(900);
  const fileRows = await ev(`document.querySelectorAll('.stat-row').length`);
  check('works from file:// with no server', fileRows >= 4, `${fileRows} domains`);
  await shot('09-file-protocol.png');

  await send('Page.navigate', { url: `${HTTP}/index.html` });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await wait(700);
  const wideOk = await ev(`document.querySelector('.wrap').getBoundingClientRect().width <= 720`);
  check('desktop layout caps at 720px', wideOk);
  await shot('10-desktop.png');

  // timed mock mode
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: `${HTTP}/index.html` });
  await wait(700);
  await ev(`document.getElementById('mock').click()`);
  await wait(250);
  check('mock setup renders', await ev(`!!document.getElementById('mockStart')`));
  await shot('13-mock-setup.png');
  await ev(`document.getElementById('mockStart').click()`);
  await wait(350);
  const m1 = await ev(`({ clock: !!document.getElementById('mclock'), n: mock.ids.length, choices: document.querySelectorAll('[data-pick]').length })`);
  check('timed run starts with clock and 40 items', m1.clock && m1.n === 40 && m1.choices >= 3, JSON.stringify(m1));
  await shot('11-mock.png');

  await ev(`document.querySelector('[data-pick]').click()`);
  await wait(150);
  check('selection locks without feedback', await ev(`document.querySelectorAll('.choice.sel').length === 1 && !document.querySelector('.fb')`));

  await ev(`document.querySelector('[data-act="m-pal"]').click()`);
  await wait(150);
  check('palette shows all items', await ev(`document.querySelectorAll('[data-goto]').length === 40`));
  await ev(`document.querySelectorAll('[data-goto]')[3].click()`);
  await wait(150);
  check('palette jump works', await ev(`mock.i === 3`));

  await ev(`document.querySelector('[data-act="m-submit"]').click()`);
  await wait(200);
  check('submit warns about blanks', await ev(`!!document.querySelector('.modal')`));
  await shot('14-mock-submit.png');
  await ev(`document.querySelector('[data-act="m-confirm"]').click()`);
  await wait(350);
  const res = await ev(`mock.result ? { total: mock.result.items.length, blank: mock.result.blank, right: mock.result.right } : null`);
  check('result counts blanks', !!res && res.total === 40 && res.blank === 39, JSON.stringify(res));
  check('result screen renders', await ev(`!!document.querySelector('.big')`));
  await shot('12-mock-result.png');
} catch (e) {
  console.error('ERROR', e.message);
  failures++;
} finally {
  try { ws?.close(); } catch {}
  chrome.kill('SIGKILL');
  server.kill('SIGKILL');
}

console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
