// 无 UI 快速检查：GLB 包围盒应在米制合理范围（不要求 node_modules/three 完整场景）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const glbPath = path.join(
  ROOT,
  'cad/experiments/planning_feasibility/out/wheel_hub_assembly.glb'
);

const buf = fs.readFileSync(glbPath);
const jsonStart = buf.indexOf(Buffer.from('JSON'));
if (jsonStart < 0) throw new Error('invalid glb');
const chunkLen = buf.readUInt32LE(jsonStart - 4);
const jsonChunk = buf.subarray(jsonStart + 4, jsonStart + 4 + chunkLen).toString('utf8');
const gltf = JSON.parse(jsonChunk);

const accessors = gltf.accessors || [];
const bufferViews = gltf.bufferViews || [];
let maxAbs = 0;
for (const acc of accessors) {
  if (acc.type !== 'VEC3' || acc.componentType !== 5126) continue;
  const max = acc.max?.map(Math.abs) ?? [];
  const min = acc.min?.map(Math.abs) ?? [];
  for (const v of [...max, ...min]) maxAbs = Math.max(maxAbs, v);
}

const pass = maxAbs > 0.04 && maxAbs < 0.25;
console.log(JSON.stringify({ maxAbsCoord: maxAbs, expectApproxMeters: '0.08-0.16', pass }, null, 2));
process.exit(pass ? 0 : 1);