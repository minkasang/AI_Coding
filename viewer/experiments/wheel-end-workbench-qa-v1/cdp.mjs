// 最小 CDP 客户端：启动 headless Chrome、连 DevTools、evaluate / screenshot / 视口尺寸 / 鼠标点击。
// 只驱动既有 5173 页面，不注入业务代码，不改生产文件。
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome() {
  const c = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
  ].filter(Boolean).find((p) => fs.existsSync(p));
  if (!c) throw new Error('未找到 chrome.exe，可用 CHROME_PATH 指定');
  return c;
}

export class Cdp {
  constructor(chromePath, port, profileDir) {
    this.port = port;
    this.seq = 0;
    this.pending = new Map();
    this.proc = spawn(chromePath, [
      '--headless=new', '--remote-debugging-port=' + port, '--remote-allow-origins=*',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-extensions', '--no-first-run', '--no-default-browser-check',
      '--hide-scrollbars', '--force-device-scale-factor=1',
      '--user-data-dir=' + profileDir, '--window-size=1500,920', 'about:blank'
    ], { stdio: 'ignore' });
  }

  async connect() {
    let endpoint = null;
    for (let i = 0; i < 60; i++) {
      try {
        const pages = await (await fetch(`http://127.0.0.1:${this.port}/json`)).json();
        endpoint = pages.find((v) => v.type === 'page')?.webSocketDebuggerUrl;
        if (endpoint) break;
      } catch { /* Chrome 尚未起来 */ }
      await sleep(200);
    }
    if (!endpoint) throw new Error('Chrome DevTools 未就绪');
    this.ws = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (!msg.id) return;
      const p = this.pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
  }

  send(method, params = {}, timeout = 30000) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP 超时 ' + method)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'JS 异常');
    return r.result?.value;
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
  }

  /** 固定设备尺寸（CSS 像素），deviceScaleFactor=1，保证截图可直接当像素图分析。 */
  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false
    });
    await sleep(400);
  }

  /** @returns {Buffer} PNG */
  async screenshot() {
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    return Buffer.from(r.data, 'base64');
  }

  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(350);
  }

  async close() {
    try { await this.send('Browser.close', {}, 5000); } catch { /* 忽略 */ }
    try { this.ws?.close(); } catch { /* 忽略 */ }
    try { this.proc.kill(); } catch { /* 忽略 */ }
  }
}
