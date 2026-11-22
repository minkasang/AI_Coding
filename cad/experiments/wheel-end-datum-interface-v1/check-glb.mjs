// Independently locate physical datum points with actual GLB node transforms.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const datumPath = process.argv[2] ?? new URL('./datums.json', import.meta.url);
const contract = JSON.parse(await readFile(datumPath, 'utf8'));
const { packageId, glb, assetsSha256 } = contract.sources.c01;
const glbPath = process.argv[3] ?? new URL(`../vehicle-cad-pipeline-v1/out/${packageId}/${glb}`, import.meta.url);
const bytes = await readFile(glbPath);
assert.equal(createHash('sha256').update(bytes).digest('hex'), assetsSha256[glb], 'GLB hash changed');

const { scene } = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
);
scene.updateMatrixWorld(true);
assert.equal(scene.children.length, 1);
const root = scene.children[0];
assert.equal(root.userData.frameId, contract.frames.workholding.frameId);
assert.equal(root.userData.packageId, packageId);
assert.equal(root.userData.unit, 'm');
assert.equal(root.userData.sourceGrade, 'DEMO_ASSUMPTION');

const meshes = new Map();
root.traverse(node => {
  if (!node.isMesh) return;
  const id = node.userData.partInstanceId;
  assert.ok(id && !meshes.has(id), 'Missing or duplicate GLB partInstanceId');
  meshes.set(id, node);
});

// Fixed independent expectations for the approved neutral design in GLB space.
const samples = new Map(Object.entries({
  'PI-20-016-FL/upperBallJointSeat': { point: [-0.021, 0.110, -0.009], axis: [0, 1, 0] },
  'PI-20-016-FL/lowerBallJointSeat': { point: [-0.021, -0.100, 0.008], axis: [0, -1, 0] },
  'PI-20-016-FL/bearingSeatBack': { point: [-0.042, 0, 0], axis: [1, 0, 0] },
  'PI-30-006-FL/wheelMatingFace': { point: [0.021, 0, 0], axis: [1, 0, 0] },
}));
const MAX_ERROR = 1e-7;
const cadToGltf = ([x, y, z]) => new Vector3(x, z, -y);
const distance = (observed, expected) => observed.distanceTo(new Vector3(...expected));
let maximumPointErrorM = 0;
let maximumUnitVectorError = 0;
const datums = new Set();
for (const datum of contract.datums) {
  const id = datum.datumId;
  assert.ok(!datums.has(id), `Duplicate datum ${id}`);
  datums.add(id);
  const mesh = meshes.get(datum.partInstanceId);
  assert.equal(mesh?.userData.partId, datum.partId, `GLB identity mismatch for ${id}`);
  assert.ok(Math.abs(mesh.matrixWorld.determinant() - 1) < MAX_ERROR, `Improper GLB transform for ${id}`);
  const local = datum.partFromMountCad;
  const point = cadToGltf(local.slice(0, 3).map(row => row[3]))
    .multiplyScalar(0.001).applyMatrix4(mesh.matrixWorld);
  const axis = cadToGltf(local.slice(0, 3).map(row => row[2])).transformDirection(mesh.matrixWorld);
  const sample = samples.get(id);
  for (const expected of [datum.glbOriginM, ...(sample ? [sample.point] : [])]) {
    const error = distance(point, expected);
    assert.ok(error < MAX_ERROR, `GLB point mismatch for ${id}: ${error} m`);
    maximumPointErrorM = Math.max(maximumPointErrorM, error);
  }
  for (const expected of [datum.glbPositiveZDirection, ...(sample ? [sample.axis] : [])]) {
    const error = distance(axis, expected);
    assert.ok(error < MAX_ERROR, `GLB direction mismatch for ${id}: ${error}`);
    maximumUnitVectorError = Math.max(maximumUnitVectorError, error);
  }
}
assert.ok([...samples.keys()].every(id => datums.has(id)), 'Missing a required fixed datum sample');
assert.equal(contract.registration.status, 'REGISTRATION_BLOCKED');
assert.equal(contract.registration.playbackAllowed, false);
assert.equal(contract.registration.vehicleFromWorkholding, null);

console.log(JSON.stringify({
  status: 'PASS', packageId, datumCount: datums.size, fixedSamples: samples.size,
  maximumPointErrorM, maximumUnitVectorError, playbackAllowed: false,
}));
