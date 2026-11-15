import * as THREE from 'three';

/** @param {{ x: {min:number,max:number}, y: {min:number,max:number}, z: {min:number,max:number} }} bounds meters */
export function clipConstantFromBounds(bounds, axis, t) {
  const { min, max } = bounds[axis];
  return -(min + (max - min) * t);
}

export function syncAxialClip(renderer, root, plane, { enabled, axis, t }, bounds) {
  const normal =
    axis === 'x' ? new THREE.Vector3(1, 0, 0) :
    axis === 'z' ? new THREE.Vector3(0, 0, 1) :
    new THREE.Vector3(0, 1, 0);
  plane.normal.copy(normal);
  if (bounds) plane.constant = clipConstantFromBounds(bounds, axis, t);
  const planes = enabled ? [plane] : [];
  renderer.localClippingEnabled = true;
  renderer.clippingPlanes = planes;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material);
    for (const m of mats) {
      if (!m) continue;
      m.clippingPlanes = planes;
      m.clipIntersection = false;
      m.needsUpdate = true;
    }
  });
  return planes;
}