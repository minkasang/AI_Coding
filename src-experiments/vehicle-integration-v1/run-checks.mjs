import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIntegration, validateIntegration, verifyInputHashes, summaryOf } from './integration.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const fixtureDir = join(here, 'fixtures');
mkdirSync(fixtureDir, { recursive: true });

const { artifact } = buildIntegration(root);
const report = validateIntegration(artifact);
const hashReport = verifyInputHashes(artifact, root);

writeFileSync(join(fixtureDir, 'integration-output.json'), `${JSON.stringify(artifact, null, 2)}\n`);
writeFileSync(join(fixtureDir, 'domain-view-fl-sla.json'), `${JSON.stringify(artifact.domainView, null, 2)}\n`);
const summary = summaryOf(artifact, report, hashReport);
writeFileSync(join(root, 'agent-workspace/agents/deepseek/reports/R-22-integration-results.json'), `${JSON.stringify(summary, null, 2)}\n`);

console.log(JSON.stringify({
  validation: summary.validation.ok,
  errors: summary.validation.errors,
  warnings: summary.validation.warnings,
  hashes: summary.inputHashes.ok,
  coverage: summary.coverage,
  qtyAudit: summary.qtyAudit
}, null, 2));

if (!report.ok || !hashReport.ok || artifact.qtyAudit.status !== 'CONSISTENT') process.exit(1);
