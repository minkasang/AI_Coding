/**
 * CARLAB V2 Chrome smoke: real click/undo/visibility/blank project + screenshot.
 * Uses Node 24 WebSocket + Chrome DevTools Protocol, no npm install.
 * All browser temp state and screenshots are on F:.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:5173/workbench-v2/index.html?view=model';
const PORT = 9231;
const PROFILE = 'F:\\tmp\\carlab_v2_cdp_smoke';
const OUT = 'F:\\tmp\\carlab_v2_test_images';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--remote-allow-origins=*', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-extensions','--no-first-run',
  '--no-default-browser-check','--user-data-dir=' + PROFILE,
  '--window-size=1600,1000','about:blank'
], { stdio: 'ignore' });

const pending = new Map();
let seq = 0, ws = null;
let errors = [];
function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve,reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout ' + method)); }, 12000);
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
  const pass = got === expected;
  console.log(pass ? 'PASS' : 'FAIL',name, JSON.stringify(got));
  if (!pass) throw new Error(name + ': got ' + JSON.stringify(got) + ', expected ' + JSON.stringify(expected));
}
async function shot(filename) {
  const response = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(OUT, filename), Buffer.from(response.data, 'base64'));
}
try {
  let endpoint = null;
  for (let i=0;i<55;i++) {
    try {
      const pages=await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
      endpoint = pages.find((v) => v.type === 'page')?.webSocketDebuggerUrl;
      if (endpoint) break;
    } catch {}
    await sleep(180);
  }
  if (!endpoint) throw Error('Chrome DevTools port did not become ready');
  ws = new WebSocket(endpoint);
  await new Promise((resolve,reject) => {
    ws.addEventListener('open',resolve,{once:true});
    ws.addEventListener('error',reject,{once:true});
  });
  ws.addEventListener('message',(event)=>{
    const msg=JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
    if (!msg.id) return;
    const p = pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timeout); pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  });
  await send('Page.enable');
  await send('Runtime.enable');
  // Deterministic repeat runs: clear only this prototype's saved state on navigation.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: "try { localStorage.removeItem('carlab.workbench-v2.project.v1'); } catch {}"
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width:1600,height:1000,deviceScaleFactor:1,mobile:false
  });
  await send('Page.navigate', { url: BASE });
  let ready=false;
  for (let i=0;i<90;i++) {
    ready=await evaluate('Boolean(window.__CARLAB_V2_READY__)').catch(()=>false);
    if(ready)break;
    await sleep(150);
  }
  check('Three.js / GLB loaded', ready, true);
  check('business navigation has only three categories',await evaluate("document.querySelectorAll('.module-tab').length"),3);
  check('initial view is the engineering model',await evaluate("document.body.dataset.workview"),'model');
  check('engineering project operations start collapsed',await evaluate("document.getElementById('projectMenu').open"),false);
  await evaluate("document.querySelector('#projectMenu summary').click()");
  check('engineering actions are available through one menu',await evaluate("document.getElementById('projectMenu').open"),true);
  await evaluate("document.querySelector('#projectMenu summary').click()");
  check('initial demo has three parts',await evaluate("document.querySelectorAll('[data-select]').length"),3);
  check('canvas available',await evaluate("document.getElementById('viewCanvas').width>0"),true);
  await shot('01-project-loaded.png');

  // Exercise the real WebGL raycaster, not only DOM buttons.
  const canvasCenter = await evaluate("(() => {const b=document.getElementById('viewCanvas').getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)}})()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:canvasCenter.x,y:canvasCenter.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:canvasCenter.x,y:canvasCenter.y,button:'left',clickCount:1});
  check('actual 3D canvas hit selects a part',await evaluate("Boolean(document.querySelector('.selected-name')?.textContent)"),true);

  await evaluate("document.querySelector('[data-select=inst-bearing-001]').click()");
  check('tree selection drives inspector', await evaluate("document.querySelector('.selected-name')?.textContent"),'轴承包络');
  await shot('02-selected-bearing.png');
  check('measure tools hidden in model view',await evaluate("document.getElementById('inspectTools').hidden"),true);
  await evaluate("document.querySelector('.module-tab[data-workview=inspect]').click()");
  check('inspection shares the same selected engineering object',await evaluate("document.querySelector('.selected-name')?.textContent"),'轴承包络');
  check('inspection hides editing part library',await evaluate("getComputedStyle(document.querySelector('.catalog-block')).display"),'none');
  check('inspection hides the editing operations menu',await evaluate("getComputedStyle(document.getElementById('projectMenu')).display"),'none');
  check('inspection hides remove-part button',await evaluate("getComputedStyle(document.querySelector('[data-action=remove]')).display"),'none');
  check('inspection keeps explode controls',await evaluate("getComputedStyle(document.querySelector('.workspace-actions')).display !== 'none'"),true);
  check('inspection shows measure/clip tools',await evaluate("!document.getElementById('inspectTools').hidden"),true);
  await shot('02b-inspection-workspace.png');
  await evaluate("document.querySelector('.module-tab[data-workview=model]').click()");
  check('engineering model restores editing library',await evaluate("getComputedStyle(document.querySelector('.catalog-block')).display !== 'none'"),true);

  await evaluate("document.querySelector('[data-add=hub]').click()");
  check('add creates independent part instance', await evaluate("document.querySelectorAll('[data-select]').length"),4);
  check('new part auto-selected', await evaluate("document.querySelector('.selected-name')?.textContent"),'轮毂法兰');

  await evaluate("document.getElementById('undoBtn').click()");
  check('undo removes newly added part', await evaluate("document.querySelectorAll('[data-select]').length"),3);
  await evaluate("document.getElementById('redoBtn').click()");
  check('redo restores added part', await evaluate("document.querySelectorAll('[data-select]').length"),4);

  // Undo intentionally clears selection if its instance disappears; explicitly reselect after redo.
  await evaluate("document.querySelectorAll('[data-select]')[3].click()");
  await evaluate("document.querySelector('[data-action=visibility]').click()");
  check('hide updates tree visibility', await evaluate("document.querySelectorAll('.tree-item.is-hidden').length"),1);
  await evaluate("document.getElementById('showAllBtn').click()");
  check('show all really restores manually hidden parts',await evaluate("document.querySelectorAll('.tree-item.is-hidden').length"),0);
  await evaluate("document.getElementById('explodeRange').value='55';document.getElementById('explodeRange').dispatchEvent(new Event('input',{bubbles:true}))");
  check('exploded view percent reflects state',await evaluate("document.getElementById('explodeOut').textContent"),'55%');
  await shot('03-exploded.png');

  await evaluate("window.confirm=()=>true;document.getElementById('blankBtn').click()");
  check('new empty project clears tree',await evaluate("document.querySelectorAll('[data-select]').length"),0);
  check('empty project helper visible',await evaluate("!document.getElementById('emptyHint').hidden"),true);
  await shot('04-empty-project.png');

  await evaluate("document.querySelector('[data-add=hub]').click()");
  check('first component can be built into empty project',await evaluate("document.querySelectorAll('[data-select]').length"),1);
  await evaluate("document.getElementById('saveBtn').click()");
  check('saving persists project to browser',await evaluate("Boolean(localStorage.getItem('carlab.workbench-v2.project.v1'))"),true);
  await shot('05-first-added-part.png');
  await evaluate("document.querySelector('[data-add=bearing]').click()");
  check('editing creates second part',await evaluate("document.querySelectorAll('[data-select]').length"),2);
  await evaluate(`(() => {
    const input=document.getElementById('importFile');
    const payload=localStorage.getItem('carlab.workbench-v2.project.v1');
    const dt=new DataTransfer();
    dt.items.add(new File([payload],'restored-project.json',{type:'application/json'}));
    input.files=dt.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  let imported=false;
  for(let i=0;i<22;i++){
    imported=await evaluate("document.querySelectorAll('[data-select]').length===1");
    if(imported)break;
    await sleep(85);
  }
  check('exported project imports and replaces edited state',imported,true);
  await evaluate("document.getElementById('workspaceCrumb').click()");
  check('workspace breadcrumb opens real projects',await evaluate("document.body.dataset.workview"),'projects');
  check('projects are clickable entries',await evaluate("document.querySelectorAll('#projectHub .project-card').length"),3);
  await shot('06-project-hub.png');
  await evaluate("document.querySelector('#projectHub [data-workview=experiment]').click()");
  check('project entry opens whole-car experiment',await evaluate("document.body.dataset.workview"),'experiment');
  let legacyReady=false;
  for(let i=0;i<120;i++){
    legacyReady=await evaluate("Boolean(document.getElementById('legacyVehicleFrame').contentWindow?.__CAR_LAB_READY__)").catch(()=>false);
    if(legacyReady)break;
    await sleep(150);
  }
  check('existing whole-car physics simulation really loads',legacyReady,true);
  check('duplicate legacy top navigation hidden',await evaluate("getComputedStyle(document.getElementById('legacyVehicleFrame').contentDocument.querySelector('.topbar')).display"),'none');
  check('advanced vehicle parameter panel hidden by default',await evaluate("getComputedStyle(document.getElementById('legacyVehicleFrame').contentDocument.querySelector('.control-dock')).display"),'none');
  await evaluate("document.getElementById('experimentSettings').click()");
  check('experiment parameters open on demand',await evaluate("getComputedStyle(document.getElementById('legacyVehicleFrame').contentDocument.querySelector('.control-dock')).display !== 'none'"),true);
  await evaluate("document.getElementById('experimentSettings').click()");
  check('experiment parameters collapse again',await evaluate("getComputedStyle(document.getElementById('legacyVehicleFrame').contentDocument.querySelector('.control-dock')).display"),'none');
  await shot('07-vehicle-experiment.png');
  await evaluate("document.getElementById('legacyPreset').value='tire';document.getElementById('legacyPreset').dispatchEvent(new Event('change',{bubbles:true}))");
  check('local wheel subview routes into original car simulator',await evaluate("document.getElementById('legacyVehicleFrame').contentDocument.getElementById('tab-tire').getAttribute('aria-selected')"),'true');
  await evaluate("document.getElementById('legacyPreset').value='vehicle';document.getElementById('legacyPreset').dispatchEvent(new Event('change',{bubbles:true}))");
  check('return to driving view',await evaluate("document.getElementById('legacyVehicleFrame').contentDocument.getElementById('tab-vehicle').getAttribute('aria-selected')"),'true');
  await evaluate("document.querySelector('.module-tab[data-workview=model]').click()");
  check('business navigation returns to the same engineering model',await evaluate("document.body.dataset.workview"),'model');
  check('wheel assembly state survived switching',await evaluate("document.querySelectorAll('[data-select]').length"),1);
  await evaluate("document.getElementById('projectsCrumb').click()");
  check('automotive projects breadcrumb is also functional',await evaluate("document.body.dataset.workview"),'projects');
  check('uncaught page exceptions',errors.length,0);
  // The canonical entry is the site root, not a second website or a new port.
  await send('Page.navigate', {url:'http://127.0.0.1:5173/'});
  let rootReady=false;
  for(let i=0;i<80;i++){
    rootReady=await evaluate("location.pathname.endsWith('/workbench-v2/index.html') && document.body.dataset.workview==='experiment'").catch(()=>false);
    if(rootReady)break;
    await sleep(160);
  }
  check('site root opens the single canonical engineering workbench',rootReady,true);
  console.log('BROWSER_SMOKE_PASS, screenshots=' + OUT);
} finally {
  try { await send('Browser.close'); } catch {}
  try { ws?.close(); } catch {}
  try { chrome.kill(); } catch {}
}
