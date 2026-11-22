import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readPublished, readOnlyCheck, writeCandidate } from '../guard.mjs';
import { loadWheelEndAssetBindingFromDisk } from '../../wheel-end-asset-binding-v1/node-loader.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const snapshotPath = join(root, 'src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json');
const consumerPath = join(root, 'src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json');
const r27ResultsPath = join(root, 'agent-workspace/agents/deepseek/reports/R-27-results.json');
const APPROVED_SNAPSHOT = 'f60d977efc2f5aefb878610b6b5a0bedb7579146f41a6a65528470e8b6a507c4';
const APPROVED_CONSUMER = 'fa18862548d64e27f9f23cdafe906b974761d8c1e6826bdcd18045febb6c8df4';

const shaFile = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const publishedHashes = () => ({ snapshot: shaFile(snapshotPath), consumer: shaFile(consumerPath), results: shaFile(r27ResultsPath) });
async function withTemp(run) {
  const dir = mkdtempSync(join('F:/tmp', 'r41-test-'));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function runCli(args) {
  return spawnSync(process.execPath, ['src-experiments/vehicle-snapshot-v1/run-checks.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60000
  });
}

test('control: published snapshot and consumer index are the approved bytes', () => {
  const published = readPublished(root);
  assert.equal(published.snapshotSha256, APPROVED_SNAPSHOT);
  assert.equal(published.consumerSha256, APPROVED_CONSUMER);
  assert.equal(published.consumerIndex.snapshotSha256, APPROVED_SNAPSHOT);
  assert.equal(published.snapshot.snapshotId, 'SNAP-R27-R16-R21-R22-R23-01');
  assert.equal(published.snapshot.revision, 1);
});

test('default read-only check validates the published files without writing them', async () => {
  const before = publishedHashes();
  const result = await readOnlyCheck(root);
  const after = publishedHashes();
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PUBLISHED_UNCHANGED');
  assert.equal(result.published.snapshotSha256, APPROVED_SNAPSHOT);
  assert.equal(result.published.consumerSha256, APPROVED_CONSUMER);
  assert.equal(result.published.validation.ok, true);
  assert.equal(result.published.indexHashMatches, true);
  assert.deepEqual(result.published.countMismatches, []);
  assert.deepEqual(result.writes, []);
  assert.deepEqual(after, before);
});

test('the in-memory candidate reports changed inputs and blockers without touching published files', async () => {
  const before = publishedHashes();
  const result = await readOnlyCheck(root);
  const after = publishedHashes();
  assert.equal(result.candidate.divergesFromPublished, true);
  assert.ok(Array.isArray(result.candidate.blockers));
  assert.ok(result.candidate.changedInputs.some((row) => row.path === 'agent-workspace/agents/qwen4/tasks/R-26.md'));
  assert.ok(result.candidate.changedInputs.some((row) => row.path === 'workbench-v2/experiments/vehicle-structure-adapter/known-cad-map.mjs'));
  assert.deepEqual(after, before);
});

test('candidate generation writes only an isolated directory and records source fingerprints', async () => {
  await withTemp(async (temp) => {
    const before = publishedHashes();
    const result = await writeCandidate(root, temp);
    const after = publishedHashes();
    assert.equal(result.ok, true);
    assert.equal(result.status, 'CANDIDATE_NOT_PUBLISHED');
    assert.match(result.candidateId, /^r27-candidate-[0-9a-f]{12}$/);
    assert.equal(result.published.snapshotSha256, APPROVED_SNAPSHOT);
    assert.equal(result.published.consumerSha256, APPROVED_CONSUMER);
    assert.ok(existsSync(join(temp, 'vehicle-snapshot.json')));
    assert.ok(existsSync(join(temp, 'vehicle-snapshot.consumer.json')));
    assert.ok(existsSync(join(temp, 'candidate-record.json')));
    const record = JSON.parse(readFileSync(join(temp, 'candidate-record.json'), 'utf8'));
    assert.equal(record.schemaVersion, 'carlab.r27CandidateRecord/0.1.0-proposal');
    assert.equal(record.candidateId, result.candidateId);
    assert.equal(record.status, 'CANDIDATE_NOT_PUBLISHED');
    assert.equal(record.proposedRevision, 2);
    assert.equal(record.published.snapshotSha256, APPROVED_SNAPSHOT);
    assert.equal(record.candidate.snapshotSha256, shaFile(join(temp, 'vehicle-snapshot.json')));
    assert.equal(record.candidate.consumerSha256, shaFile(join(temp, 'vehicle-snapshot.consumer.json')));
    assert.ok(record.sourceFingerprints['docs/research/R-16-vehicle-skeleton.fixture.json']);
    assert.ok(Array.isArray(record.candidate.changedInputs));
    assert.equal(typeof record.candidate.valid, 'boolean');
    assert.deepEqual(after, before);
  });
});

test('candidate ids and hashes are deterministic', async () => {
  await withTemp(async (first) => {
    await withTemp(async (second) => {
      const a = await writeCandidate(root, first);
      const b = await writeCandidate(root, second);
      assert.equal(a.candidateId, b.candidateId);
      assert.equal(a.candidate.snapshotSha256, b.candidate.snapshotSha256);
      assert.equal(a.candidate.consumerSha256, b.candidate.consumerSha256);
    });
  });
});

test('candidate output cannot point at the published fixtures or module root', async () => {
  await assert.rejects(
    writeCandidate(root, join(root, 'src-experiments/vehicle-snapshot-v1/fixtures')),
    (error) => error.code === 'E_CANDIDATE_PATH'
  );
  await assert.rejects(
    writeCandidate(root, join(root, 'src-experiments/vehicle-snapshot-v1/fixtures/nested')),
    (error) => error.code === 'E_CANDIDATE_PATH'
  );
  await assert.rejects(
    writeCandidate(root, join(root, 'src-experiments/vehicle-snapshot-v1')),
    (error) => error.code === 'E_CANDIDATE_PATH'
  );
});

test('CLI default mode keeps published files and R-27 results unchanged', () => {
  const before = publishedHashes();
  const result = runCli([]);
  const after = publishedHashes();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.includes('"status": "PUBLISHED_UNCHANGED"'), true);
  assert.deepEqual(after, before);
  assert.ok(existsSync(join(root, 'agent-workspace/agents/deepseek/reports/R-41-readonly-check-results.json')));
});

test('CLI candidate mode keeps published files and R-27 results unchanged', async () => {
  await withTemp((temp) => {
    const before = publishedHashes();
    const result = runCli(['--candidate', '--out', temp]);
    const after = publishedHashes();
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.includes('"status": "CANDIDATE_NOT_PUBLISHED"'), true);
    assert.ok(existsSync(join(temp, 'candidate-record.json')));
    assert.deepEqual(after, before);
  });
});

test('the published snapshot is still consumable by C-01/R-32', () => {
  const binding = loadWheelEndAssetBindingFromDisk(root);
  const status = binding.getStatus();
  assert.equal(status.snapshotId, 'SNAP-R27-R16-R21-R22-R23-01');
  assert.equal(status.revision, 1);
  assert.equal(status.glbSha256, 'c11da5170450979ba0d1b444af18e32679cc3e9fce11a941bb1172f8427710c3');
  assert.equal(status.counts.c01Instances, 9);
  assert.equal(binding.listBindings().length, 9);
});
