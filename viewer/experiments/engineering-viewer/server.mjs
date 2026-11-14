// 工程查看器样板静态服务 — 端口 5175，与 5173 演示 / 5174 看板隔离
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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