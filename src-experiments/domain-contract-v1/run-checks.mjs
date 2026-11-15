import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProject, ProjectStore } from './domain.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', name), 'utf8'));

const fixtures = ['vehicle-skeleton.json', 'fl-wheel-end.json'];
const results = [];
for (const file of fixtures) {
  const project = read(file);
  const report = validateProject(project);
  const store = new ProjectStore(project);
  const tree = store.listTree();
  const wheelEnds = tree.flatMap((s) => s.assemblies).filter((a) => a.definitionRef === 'ASSY-30-001');
  const run = project.simulationRuns?.[0] ? store.getRunStatus(project.simulationRuns[0].runId) : null;
  const transform = project.partInstances?.length ? store.toDisplayTransform(project.partInstances[0].instanceId) : null;
  results.push({
    fixture: file,
    ok: report.ok,
    errors: report.errors,
    warnings: report.warnings,
    counts: {
      systems: project.systems.length,
      assemblyDefinitions: project.assemblyDefinitions.length,
      assemblies: project.assemblies.length,
      partDefinitions: project.partDefinitions.length,
      partInstances: project.partInstances.length,
      studInstances: project.partInstances.filter((i) => i.partId === 'PART-30-009').length,
      wheelEnds: wheelEnds.length,
      references: project.references.length,
      bomLines: project.bomLines.length,
      joints: project.joints.length,
      constraints: project.constraints.length,
      sourceEvidence: project.sourceEvidence.length
    },
    familyFam130007: store.familyMembers('FAM-130-007'),
    selectedId: project.selectedId,
    run,
    firstDisplayTransform: transform ? { instanceId: transform.instanceId, units: transform.units, up: transform.up, origin: transform.matrixWorld.map((row) => row[3]).slice(0, 3) } : null
  });
}

const out = { schemaVersion: 'carlab.domain-contract-check/0.1.0', ok: results.every((r) => r.ok), fixtures: results };
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
