/**
 * One-shot / maintenance: distill R-16 vehicle skeleton into a small index for the adapter.
 * Usage (from repo root): node workbench-v2/experiments/vehicle-structure-adapter/scripts/build-r16-index.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../');
const R16_PATH = path.join(REPO, 'docs/research/R-16-vehicle-skeleton.fixture.json');
const OUT_PATH = path.join(HERE, '..', 'r16-vehicle-index.json');

const r16 = JSON.parse(fs.readFileSync(R16_PATH, 'utf8'));
const subToSys = new Map((r16.subsystems || []).map((s) => [s.id, s.parentId]));
const assyToSys = new Map(
  (r16.assemblies || []).map((a) => [a.id, subToSys.get(a.parentId)]).filter(([, sys]) => sys)
);
const aiToAssy = new Map((r16.assemblyInstances || []).map((ai) => [ai.instanceId, ai.assemblyId]));

const systemCounts = Object.create(null);
for (const sys of r16.systems || []) {
  systemCounts[sys.id] = { assemblyDefinitions: 0, assemblyInstances: 0, partInstances: 0 };
}
for (const assy of r16.assemblies || []) {
  const sys = assyToSys.get(assy.id);
  if (sys && systemCounts[sys]) systemCounts[sys].assemblyDefinitions += 1;
}
for (const ai of r16.assemblyInstances || []) {
  const sys = assyToSys.get(ai.assemblyId);
  if (sys && systemCounts[sys]) systemCounts[sys].assemblyInstances += 1;
}
for (const pi of r16.partInstances || []) {
  const assyId = aiToAssy.get(pi.assemblyInstanceId);
  const sys = assyId ? assyToSys.get(assyId) : null;
  if (sys && systemCounts[sys]) systemCounts[sys].partInstances += 1;
}

const index = {
  schemaVersion: 'carlab.vehicle-structure-adapter/r16-index/0.1',
  source: 'docs/research/R-16-vehicle-skeleton.fixture.json',
  generatedAt: new Date().toISOString(),
  vehicle: {
    vehicleId: 'VEH-001',
    name: 'RP-01 工程骨架整车（R-16 候选，非冻结）',
    schemaStatus: r16.status
  },
  totals: r16.summary || {
    systems: (r16.systems || []).length,
    subsystems: (r16.subsystems || []).length,
    assemblies: (r16.assemblies || []).length,
    assemblyInstances: (r16.assemblyInstances || []).length,
    partInstances: (r16.partInstances || []).length
  },
  systems: (r16.systems || []).map((s) => ({
    systemId: s.id,
    name: s.name,
    nameEn: s.nameEn,
    r16Counts: systemCounts[s.id] || { assemblyDefinitions: 0, assemblyInstances: 0, partInstances: 0 }
  }))
};

fs.writeFileSync(OUT_PATH, JSON.stringify(index, null, 2) + '\n');
console.log('Wrote', OUT_PATH, 'systems=', index.systems.length);