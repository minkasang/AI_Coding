// 旧工程查看器测试服务：默认不再监听 5175；统一使用 5173 工作台。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// CARLAB has two permanent UI services: 5173 workbench and 5174 dashboard.
// Standalone 5175 is retired to prevent separate user-facing entrypoints.
// Explicit opt-in remains for isolated engineering debugging only.
if (process.env.CARLAB_ALLOW_STANDALONE_VIEWER !== '1') {
  console.log('CARLAB viewer is part of the 5173 workbench. Use http://localhost:5173/viewer/experiments/engineering-viewer/index.html');
  process.exit(0);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '../../..');
const PORT = Number(process.env.VIEWER_PORT) || 5175;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const PREFIXES = [
  { prefix: '/cad/', root: PROJECT },
  { prefix: '/node_modules/', root: PROJECT },
  { prefix: '/docs/', root: PROJECT },
];

function resolveFile(urlPath) {
  if (urlPath === '/' || urlPath === '') return path.join(HERE, 'index.html');
  for (const { prefix, root } of PREFIXES) {
    if (urlPath.startsWith(prefix)) {
      return path.resolve(root, '.' + urlPath);
    }
  }
  return path.resolve(HERE, '.' + urlPath);
}

function insideAllowed(abs) {
  const roots = [HERE, PROJECT].map((r) => r.toLowerCase());
  const lower = abs.toLowerCase();
  return roots.some((r) => lower.startsWith(r));
}

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  const full = resolveFile(urlPath);
  if (!insideAllowed(full)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: ${urlPath}\n若缺少 GLB，请运行 cad/experiments/planning_feasibility/verify_assembly.py`);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`\n  工程查看器样板 →  http://127.0.0.1:${PORT}/\n  旧演示仍为 http://127.0.0.1:5173\n`);
});