import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const DELTA = new THREE.Vector3();
const OFFSET = new THREE.Vector3();
const ROTATION = new THREE.Quaternion();

/**
 * Yaw of a vehicle whose local +Z axis represents forward.
 * Uses horizontal heading only: camera should not roll/pitch with the chassis.
 */
export function getVehicleYaw(quaternion) {
  if (!quaternion) throw new Error('Missing vehicle quaternion');
  const { x, y, z, w } = quaternion;
  if (![x, y, z, w].every(Number.isFinite)) throw new Error('Invalid chassis quaternion');
  const forwardX = 2 * (x * z + w * y);
  const forwardZ = 1 - 2 * (x * x + y * y);
  return Math.atan2(forwardX, forwardZ);
}
export function shortestAngle(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Integrate the follow camera from the complete body transform.
 * Reference must be updated *even when follow is disabled* so enabling the
 * feature later does not abruptly rotate by the entire previous drive.
 * The current orbit offset is retained, honoring user drag/zoom choices.
 */
export function updateVehicleFollowCamera(camera, controls, reference, position, quaternion, follow) {
  const yaw = getVehicleYaw(quaternion);
  if (!reference.initialized) {
    reference.initialized = true;
    reference.position.set(position.x, position.y, position.z);
    reference.yaw = yaw;
    return;
  }
  if (follow) {
    DELTA.set(position.x, position.y, position.z).sub(reference.position);
    const deltaYaw = shortestAngle(reference.yaw, yaw);
    OFFSET.copy(camera.position).sub(controls.target);
    ROTATION.setFromAxisAngle(UP, deltaYaw);
    OFFSET.applyQuaternion(ROTATION);
    controls.target.add(DELTA);
    camera.position.copy(controls.target).add(OFFSET);
  }
  reference.position.set(position.x, position.y, position.z);
  reference.yaw = yaw;
}
