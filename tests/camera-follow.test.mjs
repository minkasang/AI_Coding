import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getVehicleYaw, shortestAngle, updateVehicleFollowCamera }
  from '../src/camera/followVehicle.js';

const eps = 1e-7;
function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < eps,
    label + ': actual=' + actual + ' expected=' + expected);
}
function q(yaw) {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
}
function camera() {
  return {
    camera: { position: new THREE.Vector3(0, 2, -5) },
    controls: { target: new THREE.Vector3(0, 0, 0) },
    ref: { initialized: false, position: new THREE.Vector3(), yaw: 0 }
  };
}
test('getVehicleYaw extracts right-hand heading for local +Z', () => {
  close(getVehicleYaw(q(0)), 0, 'identity');
  close(getVehicleYaw(q(Math.PI / 2)), Math.PI / 2, '+90deg');
  close(getVehicleYaw(q(-Math.PI / 2)), -Math.PI / 2, '-90deg');
});
test('turning the chassis rotates the following camera around the target', () => {
  const c = camera();
  updateVehicleFollowCamera(c.camera, c.controls, c.ref, new THREE.Vector3(0,0,0), q(0), true);
  updateVehicleFollowCamera(c.camera, c.controls, c.ref, new THREE.Vector3(3,0,1), q(Math.PI / 2), true);
  close(c.controls.target.x, 3, 'target x');
  close(c.controls.target.z, 1, 'target z');
  close(c.camera.position.x, -2, 'camera x moved with chassis and heading');
  close(c.camera.position.y, 2, 'camera height maintained');
  close(c.camera.position.z, 1, 'camera z followed translation');
});
test('manual orbit offset stays intact after vehicle rotation', () => {
  const c = camera();
  updateVehicleFollowCamera(c.camera, c.controls, c.ref, new THREE.Vector3(), q(0), true);
  c.camera.position.set(2, 4, -7);
  updateVehicleFollowCamera(c.camera,c.controls,c.ref,new THREE.Vector3(0,0,0),q(Math.PI),true);
  close(c.camera.position.x, -2, 'orbit x rotates around car');
  close(c.camera.position.y, 4, 'camera elevation unchanged');
  close(c.camera.position.z, 7, 'orbit z rotates around car');
});
test('disabling follow updates reference without moving camera, re-enable has no catch-up spin', () => {
  const c = camera();
  updateVehicleFollowCamera(c.camera,c.controls,c.ref,new THREE.Vector3(),q(0),true);
  updateVehicleFollowCamera(c.camera,c.controls,c.ref,new THREE.Vector3(2,0,0),q(Math.PI),false);
  close(c.camera.position.x,0,'camera frozen');
  close(c.controls.target.x,0,'target frozen');
  updateVehicleFollowCamera(c.camera,c.controls,c.ref,new THREE.Vector3(2,0,0),q(Math.PI),true);
  close(c.camera.position.x,0,'no giant heading snap');
  close(c.controls.target.x,0,'no giant position snap');
});
test('angle wrap at 180 degrees takes the shortest turn', () => {
  close(shortestAngle(179*Math.PI/180,-179*Math.PI/180), 2*Math.PI/180, 'wrap');
});
test('invalid orientation is rejected', () => {
  assert.throws(()=>getVehicleYaw(null), /Missing/);
  assert.throws(()=>getVehicleYaw({x:0,y:NaN,z:0,w:1}), /Invalid/);
});
