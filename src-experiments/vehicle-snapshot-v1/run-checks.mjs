import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOnlyCheck, writeCandidate } from './guard.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const args = process.argv.slice(2);
const candidateMode = args.includes('--candidate');
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? args[outIndex + 1] : null;
const reportsDir = join(root, 'agent-workspace/agents/deepseek/reports');
mkdirSync(reportsDir, { recursive: true });

try {
  if (candidateMode) {
    const result = await writeCandidate(root, outDir);
    writeFileSync(join(reportsDir, 'R-41-candidate-result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } else {
    const result = await readOnlyCheck(root);
    writeFileSync(join(reportsDir, 'R-41-readonly-check-results.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  }
} catch (error) {
  console.error(JSON.stringify({ code: error.code ?? 'E_R41', message: error.message, details: error.details ?? null }, null, 2));
  process.exit(1);
}
