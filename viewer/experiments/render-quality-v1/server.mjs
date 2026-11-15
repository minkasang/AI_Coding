// R-14 隔离渲染实验静态服务 — 端口 5181
// 与 5173 生产工作台 / 5174 看板 / 5175 工程查看器完全隔离。
// 只读地暴露项目内的 /src/ 与 /node_modules/，使实验页能直接 import 生产零件源码。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '../../..');
const PORT = Number(process.env.R14_PORT) || 5181;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8'
};

// 前缀白名单：绝不开放整个项目根目录的任意遍历
const PREFIXES = [
  { prefix: '/src/', root: PROJECT },
  { prefix: '/node_modules/', root: PROJECT },
  { prefix: '/viewer/', root: PROJECT },
  { prefix: '/docs/', root: PROJECT }
];

function resolveFile(urlPath) {
  if (urlPath === '/' || urlPath === '' || urlPath === '/index.html') {
    return path.join(HERE, 'index.html');
  }
  for (const { prefix, root } of PREFIXES) {
    if (urlPath.startsWith(prefix)) return path.resolve(root, '.' + urlPath);
  }
  return path.resolve(HERE, '.' + urlPath);
}

function insideAllowed(abs) {
  const roots = [HERE, PROJECT].map((r) => r.toLowerCase());
  const lower = abs.toLowerCase();
  return roots.some((r) => lower === r || lower.startsWith(r + path.sep));
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  } catch {
    res.writeHead(400); res.end('Bad Request'); return;
  }

  const full = resolveFile(urlPath);
  if (!insideAllowed(full)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    fs.createReadStream(full).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[R-14] render-quality-v1 on http://127.0.0.1:${PORT}/ (project: ${PROJECT})`);
});
