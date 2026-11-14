import * as THREE from 'three';

const TAU = Math.PI * 2;
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * 构建真实几何不变形的螺旋避震弹簧 + 伸缩减震筒（1 单位 = 1 米）。
 * 坐标系约定：root 原点位于上塔顶铰链，整体沿局部 -Y 轴伸向摆臂下支座。
 */
export function createCoilover(options = {}) {
  const {
    coilRadius = 0.044,
    wireRadius = 0.0085,
    turns = 7.5,
    tubularSegments = 128,
    radialSegments = 8,
    restSpan = 0.42,
    coilColor = 0xc8563c
  } = options;

  const root = new THREE.Group();

  // 材质：弹簧烤漆、阳极氧化套筒、镀铬活塞杆、黑色橡胶防尘套/衬套
  const springMat = new THREE.MeshPhysicalMaterial({
    color: coilColor,
    roughness: 0.30,
    metalness: 0.25,
    clearcoat: 0.65,
    clearcoatRoughness: 0.18
  });
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x2a2e35,
    roughness: 0.36,
    metalness: 0.85
  });
  const perchMat = new THREE.MeshStandardMaterial({
    color: 0xb38a4c,
    roughness: 0.28,
    metalness: 0.90
  });
  const rodMat = new THREE.MeshStandardMaterial({
    color: 0xe6eaef,
    roughness: 0.12,
    metalness: 1.0,
    envMapIntensity: 1.8
  });

  // 上安装眼 + 油缸外筒（固定在上端）
  const eyeletGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.032, 20).rotateZ(Math.PI / 2);
  const topEye = new THREE.Mesh(eyeletGeo, bodyMat);
  topEye.castShadow = true;
  root.add(topEye);

  const upperLen = restSpan * 0.52;
  const upperTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.024, upperLen, 24),
    bodyMat
  );
  upperTube.position.y = -upperLen * 0.5 - 0.02;
  upperTube.castShadow = true;
  root.add(upperTube);

  // 上弹簧座圈（带螺纹调节环质感）
  const topSeat = new THREE.Mesh(
    new THREE.CylinderGeometry(coilRadius + 0.011, coilRadius + 0.011, 0.016, 28),
    perchMat
  );
  topSeat.position.y = -0.055;
  topSeat.castShadow = true;
  root.add(topSeat);

  // 下组件（随悬架上下伸缩：下安装眼 + 镀铬活塞杆 + 下弹簧托盘）
  const lowerAsm = new THREE.Group();
  root.add(lowerAsm);

  const botEye = new THREE.Mesh(eyeletGeo, bodyMat);
  botEye.castShadow = true;
  lowerAsm.add(botEye);

  const rodLen = restSpan * 0.64;
  const pistonRod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.011, rodLen, 20),
    rodMat
  );
  pistonRod.position.y = rodLen * 0.5 + 0.015;
  pistonRod.castShadow = true;
  lowerAsm.add(pistonRod);

  const botSeat = new THREE.Mesh(
    new THREE.CylinderGeometry(coilRadius + 0.011, coilRadius + 0.011, 0.014, 28),
    perchMat
  );
  botSeat.position.y = 0.052;
  botSeat.castShadow = true;
  lowerAsm.add(botSeat);

  // ------------------------------------------------------------ 动态螺旋弹簧网格
  // 预计算螺旋角与截面角三角函数，每帧只重算螺距与法向/副法向，钢丝截面始终保持圆润不变扁
  const uCount = tubularSegments;
  const vCount = radialSegments;
  const vertCount = (uCount + 1) * (vCount + 1);
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const indices = [];

  const cosTheta = new Float32Array(uCount + 1);
  const sinTheta = new Float32Array(uCount + 1);
  const uList = new Float32Array(uCount + 1);
  const yProfile = new Float32Array(uCount + 1);
  const ySlope = new Float32Array(uCount + 1);

  for (let i = 0; i <= uCount; i++) {
    const t = i / uCount;
    uList[i] = t;
    const theta = t * turns * TAU;
    cosTheta[i] = Math.cos(theta);
    sinTheta[i] = Math.sin(theta);
    // 两端各留约半圈平滑贴合座圈，保持 C1 连续
    const edge = 0.06;
    const midSlope = 1 / (1 - edge);
    if (t < edge) {
      const k = t / edge;
      yProfile[i] = 0.5 * midSlope * edge * k * k;
      ySlope[i] = midSlope * k;
    } else if (t > 1 - edge) {
      const k = (1 - t) / edge;
      yProfile[i] = 1 - 0.5 * midSlope * edge * k * k;
      ySlope[i] = midSlope * k;
    } else {
      yProfile[i] = midSlope * (t - 0.5 * edge);
      ySlope[i] = midSlope;
    }
  }

  const cosPhi = new Float32Array(vCount + 1);
  const sinPhi = new Float32Array(vCount + 1);
  for (let j = 0; j <= vCount; j++) {
    const phi = (j / vCount) * TAU;
    cosPhi[j] = Math.cos(phi);
    sinPhi[j] = Math.sin(phi);
  }

  for (let i = 0; i < uCount; i++) {
    for (let j = 0; j < vCount; j++) {
      const a = i * (vCount + 1) + j;
      const b = (i + 1) * (vCount + 1) + j;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const springGeo = new THREE.BufferGeometry();
  springGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  springGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  springGeo.setIndex(indices);

  const springMesh = new THREE.Mesh(springGeo, springMat);
  springMesh.castShadow = true;
  springMesh.receiveShadow = true;
  root.add(springMesh);

  const topSeatY = -0.058;
  const omega = turns * TAU;
  const baseColor = new THREE.Color(coilColor);
  const loadColor = new THREE.Color(0xef6c35);

  let lastSpringLen = -1;

  function updateSpringGeometry(springLen) {
    if (Math.abs(springLen - lastSpringLen) < 0.00015) return;
    lastSpringLen = springLen;

    const posArr = springGeo.attributes.position.array;
    const normArr = springGeo.attributes.normal.array;
    let ptr = 0;

    for (let i = 0; i <= uCount; i++) {
      const ct = cosTheta[i];
      const st = sinTheta[i];
      const cx = coilRadius * ct;
      const cy = topSeatY - springLen * yProfile[i];
      const cz = coilRadius * st;

      // 螺旋切向量 T = (-R*omega*sin, -L*y', R*omega*cos)
      const tx = -coilRadius * omega * st;
      const ty = -springLen * ySlope[i];
      const tz = coilRadius * omega * ct;
      const tLen = Math.hypot(tx, ty, tz) || 1;
      const ux = tx / tLen;
      const uy = ty / tLen;
      const uz = tz / tLen;

      // 径向向量 N = (cos, 0, sin) 严格正交于切向量 T
      const nx = ct;
      const ny = 0;
      const nz = st;

      // 副法向 B = T × N
      const bx = uy * nz - uz * ny;
      const by = uz * nx - ux * nz;
      const bz = ux * ny - uy * nx;

      for (let j = 0; j <= vCount; j++) {
        const cp = cosPhi[j];
        const sp = sinPhi[j];
        const rnx = cp * nx + sp * bx;
        const rny = cp * ny + sp * by;
        const rnz = cp * nz + sp * bz;

        posArr[ptr] = cx + wireRadius * rnx;
        posArr[ptr + 1] = cy + wireRadius * rny;
        posArr[ptr + 2] = cz + wireRadius * rnz;

        normArr[ptr] = rnx;
        normArr[ptr + 1] = rny;
        normArr[ptr + 2] = rnz;
        ptr += 3;
      }
    }

    springGeo.attributes.position.needsUpdate = true;
    springGeo.attributes.normal.needsUpdate = true;
    springGeo.computeBoundingSphere();
  }

  function setLength(span, compressionRatio = 0) {
    const safeSpan = Math.max(0.18, span);
    lowerAsm.position.y = -safeSpan;
    const botSeatWorldY = -safeSpan + 0.056;
    const springLen = Math.max(0.065, topSeatY - botSeatWorldY);
    updateSpringGeometry(springLen);

    // 高压缩负载时弹簧呈轻微暖橙受压提示
    const load = Math.max(0, Math.min(1, compressionRatio));
    springMat.color.copy(baseColor).lerp(loadColor, load * 0.45);
  }

  const _dir = new THREE.Vector3();
  function setSpan(topPos, bottomPos, compressionRatio = 0) {
    root.position.copy(topPos);
    _dir.subVectors(bottomPos, topPos);
    const len = _dir.length() || restSpan;
    _dir.divideScalar(len);
    root.quaternion.setFromUnitVectors(DOWN, _dir);
    setLength(len, compressionRatio);
  }

  setLength(restSpan, 0);

  return {
    root,
    springMesh,
    springMat,
    setLength,
    setSpan
  };
}
