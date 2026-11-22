import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getInstances } from './project-store.mjs';

const meter = (mm) => mm / 1000;
const n = (v) => Number.isFinite(v) ? v : 0;
const COLOR = { hub: '#bccbdc', bearing: '#8396b0', studs: '#9caec5' };

export class EngineeringViewport {
  constructor(container, canvas, onSelect) {
    this.container = container;
    this.canvas = canvas;
    this.onSelect = onSelect;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#eef3f8');
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.001, 150);
    this.camera.position.set(0.26, 0.2, 0.30);
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const env = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = env.fromScene(new RoomEnvironment(), 0.03).texture;
    env.dispose();
    this.scene.add(new THREE.HemisphereLight('#fffefb', '#9baec8', 0.9));
    const sun = new THREE.DirectionalLight('#fff4df', 2.0);
    sun.position.set(0.32, 0.56, 0.42);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -0.6; sun.shadow.camera.right = 0.6;
    sun.shadow.camera.top = 0.6; sun.shadow.camera.bottom = -0.6;
    sun.shadow.bias = -0.00007;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#dcecff', 0.9);
    fill.position.set(-0.32, 0.25, -0.20);
    this.scene.add(fill);
    const grid = new THREE.GridHelper(1.3, 32, '#aebed2', '#dae4ef');
    grid.position.y = -0.095;
    grid.material.transparent = true;
    grid.material.opacity = 0.45;
    grid.name = 'visual_reference_grid';
    this.scene.add(grid);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ color: '#1b3f68', opacity: 0.14 })
    );
    ground.rotateX(-Math.PI / 2);
    ground.position.y = -0.096;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 0.06;
    this.controls.maxDistance = 12;
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.modelLayer = new THREE.Group();
    this.measureGroup = new THREE.Group();
    this.measureGroup.name = 'inspection_measure_overlay';
    this.scene.add(this.modelLayer, this.measureGroup);
    this._clipBounds = null;
    this.templates = new Map();
    this.objects = new Map();
    this.metadata = null;
    this.loaded = false;
    this.active = false;
    this.pointer = new THREE.Vector2();
    this.ray = new THREE.Raycaster();
    this._down = null;
    canvas.addEventListener('pointerdown', (e) => {
      this._down = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this._down || Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y) > 5) return;
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      this.pointer.set(
        ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((e.clientY - bounds.top) / bounds.height) * 2 + 1
      );
      this.ray.setFromCamera(this.pointer, this.camera);
      const hits = this.ray.intersectObjects([...this.objects.values()], true);
      const hit = hits.find((x) => {
        let node = x.object;
        while (node && !node.userData.instanceId) node = node.parent;
        return node?.userData.instanceId;
      });
      if (hit) {
        let node = hit.object;
        while (node && !node.userData.instanceId) node = node.parent;
        this.onSelect(node.userData.instanceId);
      } else this.onSelect(null);
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
  }
  setActive(active) {
    this.active = Boolean(active);
    if (this.active) {
      this.resize();
      if (this.loaded) this.focus();
    }
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (width < 10 || height < 10) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
  async load(seed) {
    if (seed.glbUnit !== 'm') throw new Error('GLB 必须以米为单位，不允许自动猜测缩放');
    for (const [, object] of this.objects) {
      this.modelLayer.remove(object);
      object.traverse((node) => {
        if (node.isMesh) {
          for (const mat of Array.isArray(node.material) ? node.material : [node.material]) mat?.dispose();
        }
      });
    }
    this.objects.clear();
    this.templates.clear();
    const result = await new GLTFLoader().loadAsync(seed.asset);
    for (const part of seed.catalog) {
      const source = result.scene.getObjectByName(part.nodeMatch);
      if (!source) throw new Error('GLB 缺少节点 ' + part.nodeMatch);
      this.templates.set(part.partKey, source);
    }
    this.loaded = true;
  }
  sync(snapshot, catalog) {
    if (!this.loaded) return;
    const instances = getInstances(snapshot.project);
    const ids = new Set(instances.map((x) => x.instanceId));
    for (const [id, object] of this.objects) {
      if (!ids.has(id)) {
        this.modelLayer.remove(object);
        object.traverse((node) => {
          if (node.isMesh) {
            for (const mat of Array.isArray(node.material) ? node.material : [node.material]) mat?.dispose();
          }
        });
        this.objects.delete(id);
      }
    }
    for (const inst of instances) {
      const part = catalog.find((x) => x.partKey === inst.partKey);
      let object = this.objects.get(inst.instanceId);
      if (!object) {
        const src = this.templates.get(inst.partKey);
        if (!src) continue;
        object = src.clone(true);
        object.userData.instanceId = inst.instanceId;
        object.traverse((node) => {
          node.userData.instanceId = inst.instanceId;
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            const clones = mats.map((original) => {
              const mat = original?.clone() || new THREE.MeshStandardMaterial();
              mat.color.set(part.color || COLOR[inst.partKey] || '#aec1da');
              mat.metalness = 0.70; mat.roughness = 0.34;
              mat.envMapIntensity = 1.05;
              mat.userData.baseColor = mat.color.clone();
              return mat;
            });
            node.material = Array.isArray(node.material) ? clones : clones[0];
          }
        });
        this.modelLayer.add(object);
        this.objects.set(inst.instanceId, object);
      }
      object.visible = inst.visible && (!snapshot.isolatedId || snapshot.isolatedId === inst.instanceId);
      const offset = inst.offset || [0, 0, 0];
      object.position.set(n(offset[0]), n(offset[1]), n(offset[2]));
      const axis = part.explodeAxis || [0, 0, 0];
      object.position.add(new THREE.Vector3(...axis).multiplyScalar(meter(part.explodeMm || 0) * snapshot.explode));
      object.traverse((node) => {
        if (!node.isMesh) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const mat of mats) {
          mat.color.copy(mat.userData.baseColor);
          mat.emissive = mat.emissive || new THREE.Color('#000000');
          mat.emissive.set(snapshot.selectedId === inst.instanceId ? '#2364bd' : '#000000');
          mat.emissiveIntensity = snapshot.selectedId === inst.instanceId ? 0.19 : 0;
        }
      });
    }
    this._updateClipBounds();
  }
  focus(instanceId = null) {
    const box = new THREE.Box3();
    let valid = false;
    for (const [id, object] of this.objects) {
      if (object.visible && (!instanceId || instanceId === id)) {
        box.expandByObject(object); valid = true;
      }
    }
    if (!valid || box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = Math.max(0.18, sphere.radius / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.45);
    this.camera.position.copy(center).add(new THREE.Vector3(0.92, 0.78, 1.12).normalize().multiplyScalar(distance));
    this.controls.target.copy(center);
    this.controls.update();
  }
  animate() {
    this.renderer.setAnimationLoop(() => {
      if (!this.active || document.visibilityState === 'hidden') return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
  counts() {
    return { triangles: this.renderer.info.render.triangles, calls: this.renderer.info.render.calls };
  }
  getClipBounds() {
    return this._clipBounds;
  }
  intersectPointer(event) {
    const canvas = this.canvas;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObjects([...this.objects.values()], true);
    return hits[0] || null;
  }
  _updateClipBounds() {
    const box = new THREE.Box3();
    let valid = false;
    for (const object of this.objects.values()) {
      if (!object.visible) continue;
      box.expandByObject(object);
      valid = true;
    }
    if (!valid || box.isEmpty()) {
      this._clipBounds = null;
      return;
    }
    this._clipBounds = {
      x: { min: box.min.x, max: box.max.x },
      y: { min: box.min.y, max: box.max.y },
      z: { min: box.min.z, max: box.max.z },
    };
  }
}
