import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVehicleConsumer } from './consumer.mjs';

export const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(MODULE_DIR, '../..');
export const SNAPSHOT_PATH = 'src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json';
export const CONSUMER_INDEX_PATH = 'src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json';

export function loadSnapshotBundle(root = DEFAULT_ROOT, options = {}) {
  const snapshotPath = options.snapshotPath ?? SNAPSHOT_PATH;
  const indexPath = options.indexPath ?? CONSUMER_INDEX_PATH;
  const snapshotText = readFileSync(join(root, snapshotPath), 'utf8');
  const consumerIndex = JSON.parse(readFileSync(join(root, indexPath), 'utf8'));
  const snapshotSha256 = createHash('sha256').update(snapshotText).digest('hex');
  return {
    snapshotText,
    snapshot: JSON.parse(snapshotText),
    consumerIndex,
    snapshotSha256
  };
}

export function loadVehicleConsumer(root = DEFAULT_ROOT) {
  return createVehicleConsumer(loadSnapshotBundle(root));
}
