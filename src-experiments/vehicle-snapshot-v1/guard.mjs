import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  buildConsumerIndex,
  buildSnapshot,
  CONSUMER_INDEX_PATH,
  loadInputs,
  SNAPSHOT_PATH,
  validateSnapshot
} from './snapshot.mjs';

export const CANDIDATE_SCHEMA = 'carlab.r27CandidateRecord/0.1.0-proposal';
export const CANDIDATES_DIR = 'src-experiments/vehicle-snapshot-v1/candidates';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));

export class SnapshotGuardError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SnapshotGuardError';
    this.code = code;
    this.details = details;
  }
}
function fail(code, message, details = {}) {
  throw new SnapshotGuardError(code, message, details);
}

export function readPublished(root) {
  const snapshotPath = join(root, SNAPSHOT_PATH);
  const consumerPath = join(root, CONSUMER_INDEX_PATH);
  if (!existsSync(snapshotPath)) fail('E_PUBLISHED_MISSING', 'Published R-27 snapshot is missing.', { path: snapshotPath });
  if (!existsSync(consumerPath)) fail('E_PUBLISHED_MISSING', 'Published R-27 consumer index is missing.', { path: consumerPath });
  const snapshotText = readFileSync(snapshotPath, 'utf8');
  const consumerText = readFileSync(consumerPath, 'utf8');
  let snapshot;
  let consumerIndex;
  try {
    snapshot = JSON.parse(snapshotText);
    consumerIndex = JSON.parse(consumerText);
  } catch (error) {
    fail('E_PUBLISHED_INVALID', 'Published snapshot or consumer index is not valid JSON.', { reason: error.message });
  }
  return {
    snapshotPath,
    consumerPath,
    snapshotText,
    consumerText,
    snapshotSha256: sha256(snapshotText),
    consumerSha256: sha256(consumerText),
    snapshot,
    consumerIndex
  };
}

function inputDiff(publishedSnapshot, currentHashes) {
  const published = new Map((publishedSnapshot.inputs || []).map((input) => [input.path, input]));
  const changed = [];
  for (const [path, hash] of Object.entries(currentHashes)) {
    const previous = published.get(path);
    if (!previous) changed.push({ path, publishedSha256: null, currentSha256: hash, status: 'ADDED_INPUT' });
    else if (previous.sha256 !== hash) changed.push({ path, role: previous.role, publishedSha256: previous.sha256, currentSha256: hash, status: 'CHANGED_INPUT' });
  }
  for (const [path, previous] of published) {
    if (!(path in currentHashes) && previous.sha256) changed.push({ path, role: previous.role, publishedSha256: previous.sha256, currentSha256: null, status: 'REMOVED_INPUT' });
  }
  return changed;
}

export async function readOnlyCheck(root) {
  const published = readPublished(root);
  const publishedReport = validateSnapshot(published.snapshot);
  const indexHashMatches = published.consumerIndex.snapshotSha256 === published.snapshotSha256;
  const countKeys = ['systems', 'subsystems', 'assemblyDefinitions', 'assemblyInstances', 'partDefinitions', 'partInstances', 'mountFrames', 'references'];
  const countMismatches = countKeys.filter((key) => (published.consumerIndex.counts?.[key] ?? null) !== (published.snapshot.counts?.[key] ?? null));
  const publishedOk = publishedReport.ok && indexHashMatches && countMismatches.length === 0;

  let candidate = null;
  let candidateError = null;
  let currentHashes = {};
  try {
    const inputs = await loadInputs(root);
    currentHashes = inputs.hashes;
    const built = buildSnapshot(inputs);
    const report = validateSnapshot(built);
    const candidateJson = `${JSON.stringify(built, null, 2)}\n`;
    const candidateConsumer = buildConsumerIndex(built, candidateJson);
    const candidateConsumerJson = `${JSON.stringify(candidateConsumer, null, 2)}\n`;
    candidate = {
      snapshotSha256: sha256(candidateJson),
      consumerSha256: sha256(candidateConsumerJson),
      revision: built.revision,
      divergesFromPublished: sha256(candidateJson) !== published.snapshotSha256,
      validation: report,
      blockers: report.errors.map((error) => error.code),
      changedInputs: inputDiff(published.snapshot, currentHashes)
    };
  } catch (error) {
    candidateError = { code: error.code ?? 'E_CANDIDATE_BUILD', message: error.message, stack: error.stack };
  }

  return {
    ok: publishedOk,
    mode: 'READ_ONLY',
    status: publishedOk ? 'PUBLISHED_UNCHANGED' : 'PUBLISHED_INVALID',
    published: {
      snapshotPath: SNAPSHOT_PATH,
      consumerPath: CONSUMER_INDEX_PATH,
      snapshotSha256: published.snapshotSha256,
      consumerSha256: published.consumerSha256,
      snapshotId: published.snapshot.snapshotId,
      revision: published.snapshot.revision,
      validation: publishedReport,
      indexHashMatches,
      countMismatches
    },
    candidate: candidate ?? { error: candidateError },
    writes: [],
    note: 'The published snapshot and consumer index are read-only. The candidate is built in memory only and is never written by this command.'
  };
}

function isAllowedCandidatePath(root, target) {
  const candidatesRoot = resolve(root, CANDIDATES_DIR);
  const tempRoot = resolve('F:/tmp');
  const normalized = target.toLowerCase();
  if (target === candidatesRoot || target === tempRoot) return false;
  if (normalized.startsWith(`${candidatesRoot.toLowerCase()}${sep}`)) return true;
  if (normalized.startsWith(`${tempRoot.toLowerCase()}${sep}`)) return true;
  return false;
}

export async function writeCandidate(root, outDir = null) {
  const published = readPublished(root);
  const inputs = await loadInputs(root);
  let built;
  try {
    built = buildSnapshot(inputs);
  } catch (error) {
    fail('E_CANDIDATE_BUILD', 'Candidate snapshot could not be built.', { reason: error.message });
  }
  const report = validateSnapshot(built);
  const candidateJson = `${JSON.stringify(built, null, 2)}\n`;
  const candidateHash = sha256(candidateJson);
  const candidateConsumer = buildConsumerIndex(built, candidateJson);
  const candidateConsumerJson = `${JSON.stringify(candidateConsumer, null, 2)}\n`;
  const candidateConsumerHash = sha256(candidateConsumerJson);
  const candidateId = `r27-candidate-${candidateHash.slice(0, 12)}`;
  const target = outDir
    ? (isAbsolute(outDir) ? resolve(outDir) : resolve(root, outDir))
    : resolve(root, CANDIDATES_DIR, candidateId);
  if (!isAllowedCandidatePath(root, target)) {
    fail('E_CANDIDATE_PATH', 'Candidate output must be an isolated path under the R-27 candidates/ directory or F:/tmp.', {
      target,
      allowed: [resolve(root, CANDIDATES_DIR), resolve('F:/tmp')]
    });
  }
  const changedInputs = inputDiff(published.snapshot, inputs.hashes);
  const record = {
    schemaVersion: CANDIDATE_SCHEMA,
    candidateId,
    status: 'CANDIDATE_NOT_PUBLISHED',
    generatedOn: '2026-11-22',
    published: {
      snapshotPath: SNAPSHOT_PATH,
      snapshotSha256: published.snapshotSha256,
      consumerPath: CONSUMER_INDEX_PATH,
      consumerSha256: published.consumerSha256,
      revision: published.snapshot.revision,
      snapshotId: published.snapshot.snapshotId
    },
    proposedRevision: published.snapshot.revision + 1,
    candidate: {
      snapshotSha256: candidateHash,
      consumerSha256: candidateConsumerHash,
      validation: report,
      valid: report.ok,
      blockers: report.errors.map((error) => error.code),
      changedInputs
    },
    sourceFingerprints: clone(inputs.hashes),
    note: 'Candidate only. The published revision 1 snapshot and consumer index were not modified. Requires GPT-6 review before publication.'
  };
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'vehicle-snapshot.json'), candidateJson);
  writeFileSync(join(target, 'vehicle-snapshot.consumer.json'), candidateConsumerJson);
  writeFileSync(join(target, 'candidate-record.json'), `${JSON.stringify(record, null, 2)}\n`);
  const relativeTarget = relative(root, target) || '.';
  return {
    ok: true,
    mode: 'CANDIDATE',
    status: 'CANDIDATE_NOT_PUBLISHED',
    candidateId,
    outDir: relativeTarget,
    published: {
      snapshotSha256: published.snapshotSha256,
      consumerSha256: published.consumerSha256,
      revision: published.snapshot.revision
    },
    candidate: {
      snapshotSha256: candidateHash,
      consumerSha256: candidateConsumerHash,
      valid: report.ok,
      blockers: record.candidate.blockers,
      divergesFromPublished: candidateHash !== published.snapshotSha256,
      changedInputs
    },
    recordPath: join(relativeTarget, 'candidate-record.json'),
    note: 'Published snapshot/consumer index untouched; candidate artifacts are isolated for review.'
  };
}
