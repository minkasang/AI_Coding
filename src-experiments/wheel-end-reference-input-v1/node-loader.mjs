import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { loadSnapshotBundle, loadVehicleConsumer } from '../vehicle-consumer-v1/node-loader.mjs';
import { APPROVED, validateWheelEndReferenceInputs, WheelEndReferenceError } from './validation.mjs';

export const C02_DATUMS_PATH = 'cad/experiments/wheel-end-datum-interface-v1/datums.json';
export const C03_PACKAGE_DIR = 'cad/experiments/wheel-end-ball-joint-demo-v1/out/c03-3f4bf8c599df28679b86';
export const C04_DIR = 'cad/experiments/wheel-end-wheel-center-demo-v1';
export const C04_APPROVED_PACKAGE_DIR = 'cad/experiments/wheel-end-wheel-center-demo-v1/out/c04-bae128570c76aec59353';
export const C01_PACKAGE_DIR = 'cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f';
export const C01_ROOT = 'cad/experiments/vehicle-cad-pipeline-v1';
export const REFERENCE_MOTION_PATH = 'src-experiments/mechanism-pose-adapter-v1/canonical-motion.json';
export const FIXTURE_PATH = 'src-experiments/kinematics/fixture-demo.json';

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function readJson(path, code) {
  if (!existsSync(path)) throw new WheelEndReferenceError(code, 'Input file is missing.', { path });
  return JSON.parse(readFileSync(path, 'utf8'));
}
function readText(path, code) {
  if (!existsSync(path)) throw new WheelEndReferenceError(code, 'Input file is missing.', { path });
  return readFileSync(path, 'utf8');
}

const SNAPSHOT_REL = 'src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json';

function findApprovedSnapshot(root) {
  let commits;
  try {
    commits = execFileSync('git', ['log', '--format=%H', '--', SNAPSHOT_REL], { cwd: root, encoding: 'utf8' })
      .trim().split(/\s+/).filter(Boolean);
  } catch (error) {
    throw new WheelEndReferenceError('E_PINNED_SNAPSHOT_MISSING', 'Git history is unavailable for the approved R-27 snapshot.', { reason: error.message });
  }
  for (const commit of commits) {
    let bytes;
    try {
      bytes = execFileSync('git', ['show', `${commit}:${SNAPSHOT_REL}`], { cwd: root });
    } catch {
      continue;
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash === APPROVED.snapshotSha256) {
      return { bytes, commit, snapshot: JSON.parse(bytes.toString('utf8')) };
    }
  }
  throw new WheelEndReferenceError('E_PINNED_SNAPSHOT_MISSING', 'No Git blob matches the approved R-27 snapshot hash.', { expected: APPROVED.snapshotSha256 });
}

function createSnapshotContext(snapshot, source) {
  const partInstances = snapshot.tree.partInstances;
  const partDefinitions = snapshot.tree.partDefinitions;
  const byPi = snapshot.indexes?.byPartInstanceId
    ?? Object.fromEntries(partInstances.map((part, index) => [part.partInstanceId, index]));
  const byPart = snapshot.indexes?.byPartDefinitionId
    ?? Object.fromEntries(partDefinitions.map((part, index) => [part.partDefinitionId, index]));
  return {
    snapshotId: snapshot.snapshotId,
    revision: snapshot.revision,
    snapshotSha256: source.sha256,
    source,
    getDisplayStatus: () => ({ variant: { variantId: snapshot.variant.variantId }, counts: snapshot.counts }),
    getObjectDetail: (partInstanceId) => {
      const index = byPi[partInstanceId];
      if (index == null) {
        const error = new Error(`Unknown R-27 instance ${partInstanceId}.`);
        error.code = 'E_UNKNOWN_ID';
        throw error;
      }
      const part = partInstances[index];
      const definition = partDefinitions[byPart[part.partId]];
      return {
        label: definition?.name ?? part.partId,
        identity: {
          partInstanceId: part.partInstanceId,
          partId: part.partId,
          assemblyInstanceId: part.assemblyInstanceId,
          frameId: part.frameId
        },
        geometry: { status: part.geometryStatus }
      };
    }
  };
}

export function loadRawWheelEndReferenceInputs(root, options = {}) {
  const c02Path = join(root, C02_DATUMS_PATH);
  const c03Dir = join(root, C03_PACKAGE_DIR);
  const c03ManifestPath = join(c03Dir, 'manifest.json');
  const referenceMotionPath = join(root, REFERENCE_MOTION_PATH);
  const fixturePath = join(root, FIXTURE_PATH);
  const c01Dir = join(root, C01_PACKAGE_DIR);
  const c01Root = join(root, C01_ROOT);
  const currentBundle = loadSnapshotBundle(root);
  let consumer;
  let snapshotSource;
  let workingTree;
  if (currentBundle.snapshotSha256 === APPROVED.snapshotSha256) {
    consumer = options.consumer ?? loadVehicleConsumer(root);
    snapshotSource = { kind: 'WORKING_TREE', path: SNAPSHOT_REL, sha256: APPROVED.snapshotSha256 };
    workingTree = { detected: false, sha256: APPROVED.snapshotSha256, approvedSha256: APPROVED.snapshotSha256 };
  } else {
    const approved = findApprovedSnapshot(root);
    consumer = createSnapshotContext(approved.snapshot, {
      kind: 'GIT_HISTORY',
      path: SNAPSHOT_REL,
      commit: approved.commit,
      sha256: APPROVED.snapshotSha256
    });
    snapshotSource = consumer.source;
    workingTree = {
      detected: true,
      sha256: currentBundle.snapshotSha256,
      approvedSha256: APPROVED.snapshotSha256,
      snapshotId: currentBundle.snapshot.snapshotId,
      revision: currentBundle.snapshot.revision,
      note: 'Working-tree snapshot bytes changed without a new revision; the approved f60d bytes are used for this validation.'
    };
  }
  const datums = readJson(c02Path, 'E_INPUT_MISSING');
  const c03Manifest = readJson(c03ManifestPath, 'E_INPUT_MISSING');
  const referenceMotion = readJson(referenceMotionPath, 'E_INPUT_MISSING');
  const fixture = readJson(fixturePath, 'E_INPUT_MISSING');
  const c01Hashes = {};
  for (const relative of ['manifest.json', 'assembly.json', 'wheel-end.step', 'wheel-end.glb']) {
    const path = relative === 'manifest.json' || relative === 'wheel-end.step' || relative === 'wheel-end.glb'
      ? join(c01Dir, relative)
      : join(c01Root, relative);
    if (!existsSync(path)) throw new WheelEndReferenceError('E_INPUT_MISSING', `C-01 input ${relative} is missing.`, { path });
    c01Hashes[relative] = hashFile(path);
  }
  for (const relative of ['parts/PART-20-016.step', 'parts/PART-30-001.step', 'parts/PART-30-002.step', 'parts/PART-30-006.step', 'parts/PART-30-009.step']) {
    const path = join(c01Dir, relative);
    if (!existsSync(path)) throw new WheelEndReferenceError('E_INPUT_MISSING', `C-01 part ${relative} is missing.`, { path });
    c01Hashes[relative] = hashFile(path);
  }
  const c03StepHashes = {};
  for (const step of ['upper-ball-stud.step', 'lower-ball-stud.step']) {
    const path = join(c03Dir, step);
    if (!existsSync(path)) throw new WheelEndReferenceError('E_INPUT_MISSING', `C-03 ${step} is missing.`, { path });
    c03StepHashes[step] = hashFile(path);
  }
  const c04OutDir = join(root, C04_DIR, 'out');
  const c04Packages = existsSync(c04OutDir)
    ? readdirSync(c04OutDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => {
        const manifestPath = join(c04OutDir, entry.name, 'manifest.json');
        return {
          packageDir: `${C04_DIR}/out/${entry.name}`,
          manifestSha256: existsSync(manifestPath) ? hashFile(manifestPath) : null,
          accepted: false,
          reason: 'C04_NOT_RELEASED_FOR_R39'
        };
      })
    : [];
  let c04Package = null;
  if (options.includeC04) {
    const c04PackageDir = options.c04PackageDir ?? C04_APPROVED_PACKAGE_DIR;
    const c04ManifestPath = join(root, c04PackageDir, 'manifest.json');
    const c04StepPath = join(root, c04PackageDir, 'rim-datum.step');
    if (!existsSync(c04ManifestPath) || !existsSync(c04StepPath)) {
      throw new WheelEndReferenceError('E_C04_PACKAGE_MISSING', 'Approved C-04 manifest or rim STEP is missing.', {
        manifestPath: c04ManifestPath,
        stepPath: c04StepPath
      });
    }
    const c04Manifest = JSON.parse(readFileSync(c04ManifestPath, 'utf8'));
    const archive = c04Manifest.sources?.snapshotArchive;
    if (!archive?.gitCommit || !archive?.path) {
      throw new WheelEndReferenceError('E_SNAPSHOT_ARCHIVE_MISMATCH', 'C-04 snapshotArchive is missing.');
    }
    let archiveBytes;
    try {
      archiveBytes = execFileSync('git', ['show', `${archive.gitCommit}:${archive.path}`], { cwd: root });
    } catch (error) {
      throw new WheelEndReferenceError('E_SNAPSHOT_ARCHIVE_MISMATCH', 'C-04 snapshotArchive Git object is unavailable.', { reason: error.message });
    }
    c04Package = {
      manifest: c04Manifest,
      manifestSha256: hashFile(c04ManifestPath),
      stepSha256: hashFile(c04StepPath),
      packageDir: c04PackageDir,
      snapshotArchiveHash: createHash('sha256').update(archiveBytes).digest('hex')
    };
  }
  return {
    consumer,
    snapshotBundle: currentBundle,
    snapshotSha256: APPROVED.snapshotSha256,
    currentSnapshotSha256: currentBundle.snapshotSha256,
    snapshotSource,
    workingTree,
    datums,
    datumsSha256: hashFile(c02Path),
    c03Manifest,
    c03ManifestSha256: hashFile(c03ManifestPath),
    c03StepHashes,
    referenceMotion,
    referenceMotionSha256: hashFile(referenceMotionPath),
    fixture,
    fixtureSha256: hashFile(fixturePath),
    c01Hashes,
    c04: { outExists: c04Packages.length > 0, packages: c04Packages },
    c04Package,
    poseInput: options.poseInput ?? null,
    expected: options.expected ?? {}
  };
}

export function validateWheelEndReferenceInputsFromDisk(root, options = {}) {
  const raw = loadRawWheelEndReferenceInputs(root, options);
  return validateWheelEndReferenceInputs({
    consumer: raw.consumer,
    snapshotSha256: raw.snapshotSha256,
    datums: raw.datums,
    datumsSha256: raw.datumsSha256,
    c03Manifest: raw.c03Manifest,
    c03ManifestSha256: raw.c03ManifestSha256,
    c03StepHashes: raw.c03StepHashes,
    referenceMotion: raw.referenceMotion,
    referenceMotionSha256: raw.referenceMotionSha256,
    fixture: raw.fixture,
    fixtureSha256: raw.fixtureSha256,
    c01Hashes: raw.c01Hashes,
    c04: raw.c04,
    c04Package: options.includeC04 ? raw.c04Package : null,
    poseInput: raw.poseInput,
    expected: raw.expected,
    snapshotSource: raw.snapshotSource,
    workingTree: raw.workingTree
  });
}
