import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { loadSnapshotBundle, loadVehicleConsumer } from '../vehicle-consumer-v1/node-loader.mjs';
import { createWheelEndBinding, parseGlbJson, WheelEndBindingError } from './binding.mjs';

export const DEFAULT_PACKAGE_DIR = 'cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f';
export const DEFAULT_PACKAGE_ID = 'c01-c5d74da77c293aa5321f';
export const DEFAULT_GLB_SHA256 = 'c11da5170450979ba0d1b444af18e32679cc3e9fce11a941bb1172f8427710c3';

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function loadWheelEndAssetBindingFromDisk(root, options = {}) {
  const packageDir = options.packageDir ?? DEFAULT_PACKAGE_DIR;
  const manifestPath = join(root, packageDir, 'manifest.json');
  const glbPath = join(root, packageDir, 'wheel-end.glb');
  if (!existsSync(manifestPath)) {
    throw new WheelEndBindingError('E_PACKAGE_MISSING', 'C-01 manifest is missing.', { path: manifestPath });
  }
  if (!existsSync(glbPath)) {
    throw new WheelEndBindingError('E_PACKAGE_MISSING', 'C-01 GLB is missing.', { path: glbPath });
  }
  const manifestText = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  const glbBuffer = readFileSync(glbPath);
  const glbJson = parseGlbJson(glbBuffer).json;
  const bundle = loadSnapshotBundle(root);
  const consumer = options.consumer ?? loadVehicleConsumer(root);
  return createWheelEndBinding({
    consumer,
    consumerIndex: bundle.consumerIndex,
    snapshotSha256: bundle.snapshotSha256,
    manifest,
    manifestSha256: sha256Buffer(Buffer.from(manifestText, 'utf8')),
    glbJson,
    glbSha256: sha256Buffer(glbBuffer),
    expectedPackageId: options.expectedPackageId ?? DEFAULT_PACKAGE_ID,
    expectedManifestSha256: options.expectedManifestSha256 ?? null,
    expectedGlbSha256: options.expectedGlbSha256 ?? DEFAULT_GLB_SHA256
  });
}
