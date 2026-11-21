import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildConsumerIndex,
  buildSnapshot,
  CONSUMER_INDEX_PATH,
  loadInputs,
  SNAPSHOT_PATH,
  summaryOf,
  validateSnapshot,
  verifyInputHashes
} from './snapshot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const inputs = await loadInputs(root);
const snapshot = buildSnapshot(inputs);
const report = validateSnapshot(snapshot);
const hashReport = verifyInputHashes(snapshot, root);
const snapshotJson = `${JSON.stringify(snapshot, null, 2)}\n`;
const consumer = buildConsumerIndex(snapshot, snapshotJson);
const summary = summaryOf(snapshot, report, hashReport);

mkdirSync(dirname(join(root, SNAPSHOT_PATH)), { recursive: true });
writeFileSync(join(root, SNAPSHOT_PATH), snapshotJson);
writeFileSync(join(root, CONSUMER_INDEX_PATH), `${JSON.stringify(consumer, null, 2)}\n`);
writeFileSync(join(root, 'agent-workspace/agents/deepseek/reports/R-27-results.json'), `${JSON.stringify(summary, null, 2)}\n`);

console.log(JSON.stringify({
  validation: summary.validation.ok,
  errors: summary.validation.errors,
  warnings: summary.validation.warnings,
  hashes: summary.inputHashes.ok,
  counts: summary.counts,
  bindingMatrix: summary.bindingMatrix,
  poseRun: summary.poseRun,
  qty: summary.qty,
  conflicts: summary.conflicts,
  r26: summary.r26
}, null, 2));

if (!report.ok || !hashReport.ok) process.exit(1);
