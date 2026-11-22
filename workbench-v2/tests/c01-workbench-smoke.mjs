/**
 * C-01 on 5173 main workbench: vehicle tree → 9 PI instances → stud identity → restore legacy.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:5173/workbench-v2/index.html?view=model';
const PORT = 9232;
const PROFILE = 'F:\\tmp\\carlab_c01_cdp_smoke';
const OUT = 'F:\\tmp\\carlab_v2_test_images';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--remote-allow-origins=*', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-extensions', '--no-first-run',
  '--no-default-browser-check', '--user-data-dir=' + PROFILE,
  '--window-size=1500,920', 'about:blank'
], { stdio: 'ignore' });

const pending = new Map();
let seq = 0;
let ws = null;
function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout ' + method)); }, 20000);
    pending.set(id, { resolve, reject, timeout });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression, awaitPromise = false) {
  const reply = await send('Runtime.evaluate', {
    expression, awaitPromise, returnByValue: true, userGesture: true
  });
  if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.text || 'JS error');
  return reply.result?.value;
}
function check(name, got, expected) {
  if (got !== expected) throw new Error(`${name}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
  console.log('PASS', name, JSON.stringify(got));
}

try {
  let endpoint = null;
  for (let i = 0; i < 55; i++) {
    try {
      const pages = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
      endpoint = pages.find((v) => v.type === 'page')?.webSocketDebuggerUrl;
      if (endpoint) break;
    } catch {}
    await sleep(180);
  }
  if (!endpoint) throw new Error('Chrome DevTools not ready');
  ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id) return;
    const p = pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timeout);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: "try { localStorage.removeItem('carlab.workbench-v2.project.v1'); } catch {}"
  });
  await send('Page.navigate', { url: BASE });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    ready = await evaluate('Boolean(window.__CARLAB_V2_READY__)').catch(() => false);
    if (ready) break;
    await sleep(150);
  }
  check('V2 ready', ready, true);
  for (let i = 0; i < 60; i++) {
    if (await evaluate('Boolean(window.__CARLAB_VEHICLE_SNAPSHOT__)').catch(() => false)) break;
    await sleep(200);
  }
  for (let i = 0; i < 80; i++) {
    if (await evaluate('Boolean(window.__CARLAB_C01_READY__)').catch(() => false)) break;
    await sleep(200);
  }
  check('C-01 preload ready', await evaluate('Boolean(window.__CARLAB_C01_READY__)').catch(() => false), true);
  const activate = await evaluate(`(async () => {
    const open = (sel) => {
      const b = document.querySelector(sel);
      if (b && b.getAttribute('aria-expanded') !== 'true') b.click();
    };
    open('[data-tree-toggle="SYS-30"]');
    open('[data-tree-toggle="AI-30-002-FL"]');
    const scroll = document.getElementById('vehicleTreeScroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
    const btn = document.querySelector('[data-vehicle-select="PI-30-006-FL"]');
    if (!btn) return { ok: false, reason: 'no PI button' };
    btn.click();
    for (let i = 0; i < 40; i++) {
      if (window.__CARLAB_C01_ACTIVE__) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    return {
      ok: Boolean(window.__CARLAB_C01_ACTIVE__),
      err: window.__CARLAB_C01_LAST_ERROR || window.__CARLAB_C01_ERROR,
      count: document.querySelectorAll('[data-select]').length,
      heading: document.getElementById('workbenchHeading')?.textContent
    };
  })()`, true);
  check('C-01 active after PI-30-006-FL', activate?.ok, true);
  if (activate.err) console.warn('C-01 err', activate.err);
  check('C-01 nine instances in tree', activate.count, 9);
  check('C-01 heading', activate.heading, 'C-01 静态工装');
  await evaluate(`(() => {
    document.querySelector('[data-vehicle-select="PI-30-009-FL-01"]')?.click();
  })()`);
  check('stud 01 inspector id', await evaluate("document.querySelector('.selected-name')?.textContent?.length > 0"), true);
  await evaluate(`(() => {
    document.querySelector('[data-vehicle-select="PI-30-009-FL-02"]')?.click();
  })()`);
  check('stud 02 distinct selection', await evaluate("document.querySelector('[data-select=\"PI-30-009-FL-02\"]')?.classList.contains('is-selected')"), true);
  await evaluate(`(() => {
    document.querySelector('[data-vehicle-select="PI-20-016-FL"]')?.click();
  })()`);
  check('knuckle vehicle title', await evaluate("Boolean(document.querySelector('.vehicle-inspector-title'))"), true);
  await evaluate("window.confirm=()=>true; document.getElementById('loadDemoBtn').click()");
  let legacy = false;
  for (let i = 0; i < 40; i++) {
    legacy = await evaluate("document.querySelectorAll('[data-select]').length===3 && !window.__CARLAB_C01_ACTIVE__");
    if (legacy) break;
    await sleep(150);
  }
  check('legacy demo restored', legacy, true);
  console.log('C01_WORKBENCH_SMOKE_PASS');
} finally {
  try { await send('Browser.close'); } catch {}
  try { ws?.close(); } catch {}
  try { chrome.kill(); } catch {}
}