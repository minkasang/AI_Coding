import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSnapshotContext } from '../vehicle-snapshot-client.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../');
const snap = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json'),
    'utf8'
  )
);
const ctx = createSnapshotContext(snap);

assert.equal(ctx.workbenchTree.systems.length, 13);
const lower = ctx.getPartInstance('PI-20-008-FL');
assert.equal(lower.geometryStatus, 'NO_GEOMETRY');
assert.equal(ctx.isInspectable('PI-20-008-FL'), false);
assert.equal(ctx.isInspectable('PI-30-006-FL'), true);

const hubDemo = ctx.getDemoCad('PI-30-006-FL');
assert.equal(hubDemo.copyToOtherInstances, false);
assert.ok(hubDemo.cadUrl.includes('wheel_hub_assembly.glb'));

console.log('vehicle-snapshot-client.test.mjs: PASS');