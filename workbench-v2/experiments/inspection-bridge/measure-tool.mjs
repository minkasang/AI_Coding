import * as THREE from 'three';
import { formatDistance } from './format-distance.mjs';

export class MeasureTool {
  /** @param {THREE.Group} group */
  constructor(group) {
    this.group = group;
    this.points = [];
    this.enabled = false;
  }
  clear() {
    this.points = [];
    this.group.clear();
  }
  setEnabled(on) {
    this.enabled = on;
    if (!on) this.clear();
  }
  addPoint(worldPoint) {
    if (!this.enabled) return null;
    if (this.points.length >= 2) this.points = [];
    this.points.push(worldPoint.clone());
    this.render();
    if (this.points.length < 2) return { partial: true };
    return { distanceM: this.points[0].distanceTo(this.points[1]), formatted: formatDistance(this.points[0].distanceTo(this.points[1])) };
  }
  render() {
    this.group.clear();
    const markerGeo = new THREE.SphereGeometry(0.0035, 12, 12);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x1d5fd6, depthTest: false });
    for (const p of this.points) {
      const m = new THREE.Mesh(markerGeo, markerMat);
      m.position.copy(p);
      this.group.add(m);
    }
    if (this.points.length === 2) {
      const geom = new THREE.BufferGeometry().setFromPoints(this.points);
      this.group.add(new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0x1d5fd6, depthTest: false })));
    }
  }
}