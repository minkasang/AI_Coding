// Exercise the same Three.js GLTFLoader used by the workbench.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Box3, Matrix4, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

async function fetchBytes(url) {
  const response = await fetch(url);
  assert.ok(response.ok, `Could not read ${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const location = process.argv[2];
const url = /^https?:\/\//i.test(location) ? new URL(location) : null;
const manifestPath = url ? null : resolve(location);
const manifest = JSON.parse(url ? await fetchBytes(url) : await readFile(manifestPath, 'utf8'));
const file = url ? await fetchBytes(new URL(manifest.assets.glb, url))
  : await readFile(resolve(dirname(manifestPath), manifest.assets.glb));
assert.equal(createHash('sha256').update(file).digest('hex'), manifest.sha256[manifest.assets.glb]);
assert.equal(file.toString('ascii', 0, 4), 'glTF');
assert.equal(file.readUInt32LE(4), 2);
assert.equal(file.readUInt32LE(8), file.byteLength);
const gltf = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
const [root] = gltf.scene.children;
assert.equal(gltf.scene.children.length, 1);
assert.equal(root.userData.frameId, manifest.root.frameId);
assert.equal(root.userData.packageId, manifest.packageId);
assert.equal(root.userData.sourceGrade, manifest.sourceGrade);
assert.equal(root.userData.unit, 'm');
gltf.scene.updateMatrixWorld(true);

const groups = new Set(manifest.instances.map(row => row.assemblyInstanceId));
assert.deepEqual(new Set(root.children.map(group => group.userData.assemblyInstanceId)), groups);
assert.equal(root.children.length, groups.size);
const meshes = new Map();
const shared = new Map();
for (const group of root.children) {
  for (const mesh of group.children) {
    assert.ok(mesh.isMesh && mesh.children.length === 0, 'Expected one mesh node per instance');
    const id = mesh.userData.partInstanceId;
    assert.ok(id?.startsWith('PI-') && !meshes.has(id), 'Missing or duplicate canonical selection ID');
    meshes.set(id, mesh);
  }
}
assert.equal(meshes.size, manifest.instances.length);

const basis = new Matrix4().makeRotationX(-Math.PI / 2);
const inverseBasis = basis.clone().invert();
const metre = value => value * 0.001;
function inGltfUnits(bounds) {
  const [min, max] = bounds;
  return [min[0], min[2], -max[1], max[0], max[2], -min[1]].map(metre);
}

let maxBoundsError = 0;
let maxTransformError = 0;
let triangles = 0;
for (const row of manifest.instances) {
  const mesh = meshes.get(row.partInstanceId);
  assert.ok(mesh, row.partInstanceId);
  assert.equal(mesh.name, row.partInstanceId);
  assert.equal(mesh.userData.partId, row.partId);
  assert.equal(mesh.userData.assemblyInstanceId, row.assemblyInstanceId);
  assert.equal(mesh.parent.userData.assemblyInstanceId, row.assemblyInstanceId);
  assert.equal(mesh.userData.sourceGrade, manifest.sourceGrade);
  const rootFromPart = new Matrix4().set(...row.rootFromPartCad.flat());
  rootFromPart.setPosition(new Vector3().setFromMatrixPosition(rootFromPart).multiplyScalar(0.001));
  const expected = basis.clone().multiply(rootFromPart).multiply(inverseBasis);
  const transformError = Math.max(...expected.elements.map((value, i) => Math.abs(value - mesh.matrixWorld.elements[i])));
  maxTransformError = Math.max(maxTransformError, transformError);
  assert.ok(transformError < 1e-6, `Transform mismatch for ${row.partInstanceId}`);

  const prior = shared.get(row.partId);
  if (prior) {
    assert.equal(mesh.geometry, prior, `Expected GLB mesh reuse for ${row.partId}`);
  } else {
    shared.set(row.partId, mesh.geometry);
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
  }
  const localBounds = new Box3().setFromBufferAttribute(mesh.geometry.attributes.position);
  const worldBounds = new Box3().setFromObject(mesh, true);
  const measurements = [
    [localBounds, manifest.partDefinitions[row.partId].boundsMm],
    [worldBounds, row.rootBoundsMm],
  ];
  for (const [actual, reference] of measurements) {
    const coordinates = [...actual.min.toArray(), ...actual.max.toArray()];
    const error = Math.max(...inGltfUnits(reference).map((value, i) => Math.abs(value - coordinates[i])));
    maxBoundsError = Math.max(maxBoundsError, error);
    assert.ok(error <= 0.0001, `mm/m or bounds mismatch in ${row.partInstanceId}: ${error} m`);
  }
}
assert.ok(file.byteLength <= 3 * 1024 * 1024, `GLB exceeds demo size budget: ${file.byteLength} bytes`);
assert.ok(triangles <= 50000, `GLB exceeds demo triangle budget: ${triangles}`);
console.log(JSON.stringify({
  instances: meshes.size, distinctMeshes: shared.size, assemblyGroups: groups.size,
  triangles, bytes: file.byteLength, maxBoundsErrorMm: maxBoundsError * 1000, maxTransformError,
}));
