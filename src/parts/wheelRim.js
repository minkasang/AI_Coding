import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 非索引三角汤：每个三角独立顶点 -> computeVertexNormals() 得到干净的 CNC 倒角棱线
class TriSoup {
  constructor() { this.p = []; }
  tri(a, b, c) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * 1. 基于 ETRTO / TRA 标准的轮辋桶截面（LatheGeometry 闭合实体轮廓）
 * 包含：J/JJ 型外卷轮缘 (G=17~18.5mm)、5° 胎圈座、H2 双侧安全凸峰、非对称深槽 (Drop-Center Well) 与内壁壁厚。
 */
function buildBarrelGeometry(spec, d) {
  const R0 = d.rimRadius;
  const hw = d.rimHalfWidth;
  const isJJ = spec.rimStyle.contour === 'JJ';
  const G = isJJ ? 0.0182 : 0.0165; // J/JJ 轮缘高度
  const tan5 = 0.08749;             // 5° 胎圈座锥度
  const seatW = Math.min(0.021, hw * 0.24);
  const wellDepth = Math.min(0.023, R0 * 0.115);

  // 2D Lathe 点集：(radius, axialZ) -> rotateX(PI/2) 后 axialY 映射为 +Z（外侧）与 -Z（内侧）
  const profile = [
    // ---- 外表面（与轮胎胎圈接触侧：从内侧轮缘 -Z 到外侧轮缘 +Z）
    [R0 + G - 0.0028, -hw - 0.0085],
    [R0 + G,          -hw - 0.0045],
    [R0 + G - 0.0008, -hw - 0.0006],
    [R0 + G * 0.50,   -hw],
    [R0 + 0.0022,     -hw + 0.0018],
    [R0,              -hw + 0.0048],
    [R0 - seatW * tan5, -hw + seatW],                   // 5° 内倾胎圈座末端
    [R0 + 0.0010,     -hw + seatW + 0.0055],            // 内侧 H2 安全凸峰
    [R0 - 0.0026,     -hw + seatW + 0.012],
    [R0 - 0.0040,     -hw * 0.44],
    [R0 - wellDepth,  -hw * 0.22],                      // 非对称深槽（偏外侧便于装胎）
    [R0 - wellDepth,   hw * 0.14],
    [R0 - 0.0040,      hw * 0.34],
    [R0 - 0.0026,      hw - seatW - 0.012],
    [R0 + 0.0010,      hw - seatW - 0.0055],            // 外侧 H2 安全凸峰
    [R0 - seatW * tan5, hw - seatW],                    // 5° 胎圈座
    [R0,               hw - 0.0048],
    [R0 + 0.0022,      hw - 0.0018],
    [R0 + G * 0.50,    hw],
    [R0 + G - 0.0008,  hw + 0.0006],
    [R0 + G,           hw + 0.0045],
    [R0 + G - 0.0028,  hw + 0.0085],

    // ---- 内壁（刹车侧回环：保持 ~6.5mm 结构壁厚并做出外侧辐条落座台阶）
    [R0 + G - 0.0072,  hw + 0.0076],
    [R0 - 0.0060,      hw - 0.0040],
    [R0 - 0.0095,      hw * 0.56],
    [R0 - 0.0115,      hw * 0.34],
    [R0 - wellDepth - 0.0068, hw * 0.14],
    [R0 - wellDepth - 0.0068, -hw * 0.22],
    [R0 - 0.0110,     -hw * 0.44],
    [R0 - 0.0085,     -hw + 0.014],
    [R0 + G - 0.0072, -hw - 0.0076],
    [R0 + G - 0.0028, -hw - 0.0085]
  ];

  const vecs = profile.map(([r, z]) => new THREE.Vector2(r, z));
  return new THREE.LatheGeometry(vecs, 96).rotateX(Math.PI / 2);
}

/**
 * 2. 轮毂中心安装盘（真实钻通中心孔 CB 与 PCD 螺栓孔，定位在偏距 ET 位置）
 */
function buildHubData(spec, d) {
  const rs = spec.rimStyle;
  const hw = d.rimHalfWidth;
  const et = clamp(d.etOffset, 0.006, hw - 0.032);
  const padThick = 0.020;
  const zMount = et;                  // 贴合刹车盘帽的背面基准面
  const zPadFront = zMount + padThick; // 螺栓压紧端面
  const hubOuterR = Math.min(d.rimRadius * 0.56, d.pcdRadius + 0.026);
  const cbR = Math.min(d.centerBoreRadius, d.pcdRadius - 0.018);
  const boltHoleR = rs.bolts === 6 ? 0.0085 : 0.0075;

  const shape = new THREE.Shape();
  shape.absarc(0, 0, hubOuterR, 0, TAU, false);

  const cbHole = new THREE.Path();
  cbHole.absarc(0, 0, cbR, 0, TAU, true);
  shape.holes.push(cbHole);

  for (let i = 0; i < rs.bolts; i++) {
    const a = (i / rs.bolts) * TAU + 0.2;
    const hole = new THREE.Path();
    hole.absarc(d.pcdRadius * Math.sin(a), -d.pcdRadius * Math.cos(a), boltHoleR, 0, TAU, true);
    shape.holes.push(hole);
  }

  const padGeo = new THREE.ExtrudeGeometry(shape, {
    depth: padThick,
    bevelEnabled: true,
    bevelSize: 0.0020,
    bevelThickness: 0.0020,
    bevelSegments: 2,
    curveSegments: 48
  });
  padGeo.translate(0, 0, zMount);

  // 外围渐进式辐条根环（把平安装盘平滑过渡成弧形下凹曲面）
  const collarRing = [
    [hubOuterR - 0.012, zMount],
    [hubOuterR + 0.014, zMount + 0.004],
    [hubOuterR + 0.018, zPadFront + 0.003],
    [hubOuterR - 0.003, zPadFront + 0.005],
    [hubOuterR - 0.012, zPadFront - 0.002],
    [hubOuterR - 0.012, zMount]
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const collarGeo = new THREE.LatheGeometry(collarRing, 72).rotateX(Math.PI / 2);

  // 中心孔倒角套圈
  const boreSleeveGeo = new THREE.CylinderGeometry(cbR + 0.005, cbR + 0.005, padThick + 0.010, 36, 1, true)
    .rotateX(Math.PI / 2);
  boreSleeveGeo.translate(0, 0, zMount + padThick * 0.5 + 0.002);

  return {
    padGeo,
    collarGeo,
    boreSleeveGeo,
    zMount,
    zPadFront,
    hubOuterR,
    cbR,
    boltHoleR
  };
}

/**
 * 3. 基于悬臂梁弯矩梯度（根部厚、外端轻量化）与卡钳避让弧线的 3D 放样辐条
 * 局部右手坐标：radial u_r=(sin a, -cos a, 0), tangential u_t=(cos a, sin a, 0), axial u_z=(0, 0, 1)
 */
function loftBeam(soup, r0, r1, z0, z1, archBump, angleFn, profileFn, steps = 14) {
  const ringPts = [];

  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const r = r0 + (r1 - r0) * s;
    const a = angleFn(s);

    // 抛物凹面 + 刹车卡钳避让拱弧
    const concave = 0.34 * s + 0.66 * Math.pow(s, 1.45);
    const zFront = z0 + (z1 - z0) * concave + Math.sin(Math.PI * s) * archBump;

    const { wFront, wMid, wBack, thick, chamferH } = profileFn(s);
    const zMid = zFront - chamferH;
    const zBack = zFront - thick;

    const sa = Math.sin(a), ca = Math.cos(a);
    const pt = (dt, z) => [
      r * sa + dt * ca,
      -r * ca + dt * sa,
      z
    ];

    // 顺时针排列（面向 +u_r）确保 TriSoup.quad 外法向严格朝外
    ringPts.push([
      pt(-wFront, zFront),
      pt(+wFront, zFront),
      pt(+wMid,   zMid),
      pt(+wBack,  zBack),
      pt(-wBack,  zBack),
      pt(-wMid,   zMid)
    ]);
  }

  for (let i = 0; i < steps; i++) {
    const A = ringPts[i];
    const B = ringPts[i + 1];
    for (let k = 0; k < 6; k++) {
      const kn = (k + 1) % 6;
      soup.quad(A[k], B[k], B[kn], A[kn]);
    }
  }

  // 两端封口（内端朝 -u_r，外端朝 +u_r）
  const S0 = ringPts[0];
  soup.quad(S0[0], S0[5], S0[4], S0[3]);
  soup.quad(S0[0], S0[3], S0[2], S0[1]);

  const S1 = ringPts[steps];
  soup.quad(S1[0], S1[1], S1[2], S1[3]);
  soup.quad(S1[0], S1[3], S1[4], S1[5]);
}

function buildSpokeGeometry(spec, d, hub) {
  const soup = new TriSoup();
  const rs = spec.rimStyle;
  const rr = d.rimRadius;
  const hw = d.rimHalfWidth;

  const rRoot = hub.hubOuterR - 0.002;
  const rRim = rr - 0.004;
  const zRoot = hub.zPadFront - 0.003;
  // 辐条落地在轮辋外端内侧落座台，留出 J 型翻边亮唇空间
  const zRim = hw - 0.013;

  const groups = rs.groups || 5;
  const groupStep = TAU / groups;
  const type = rs.spokeType || 'y-spoke';

  const smooth = (u) => u * u * (3 - 2 * u);

  for (let g = 0; g < groups; g++) {
    const baseAngle = g * groupStep;

    if (type === 'y-spoke') {
      // Y 型锻造分叉辐条：根部主干承扭，中段平顺一分为二跨接轮辋
      const rSplit = rRoot + (rRim - rRoot) * 0.34;
      const zSplit = zRoot + (zRim - zRoot) * 0.25;
      const halfSpreadAngle = groupStep * 0.235;

      // 主干段
      loftBeam(
        soup, rRoot, rSplit, zRoot, zSplit, 0.005,
        () => baseAngle,
        (s) => {
          const w = rr * (0.068 - 0.006 * s);
          return {
            wFront: w * 0.72,
            wMid: w,
            wBack: w * 0.78,
            thick: 0.022 * (1 - 0.14 * s),
            chamferH: 0.005
          };
        },
        6
      );

      // 左右两条分叉臂（从主干交汇处 0.26 处顺滑展开到轮辋）
      const rBranch0 = rRoot + (rRim - rRoot) * 0.25;
      const zBranch0 = zRoot + (zRim - zRoot) * 0.17;
      for (const sign of [-1, 1]) {
        loftBeam(
          soup, rBranch0, rRim, zBranch0, zRim, 0.008,
          (s) => baseAngle + sign * halfSpreadAngle * smooth(s),
          (s) => {
            // 悬臂梁弯矩越近轮心越大，外端渐细；接近轮辋处微扩形成焊道/过渡圆角
            const flare = s > 0.85 ? ((s - 0.85) / 0.15) * 0.0035 : 0;
            const w = rr * (0.044 - 0.011 * s) + flare;
            return {
              wFront: w * 0.66,
              wMid: w,
              wBack: w * 0.74,
              thick: 0.019 * (1 - 0.30 * s),
              chamferH: 0.0045
            };
          },
          12
        );
      }
    } else if (type === 'twin-spoke') {
      // 平行双辐条组（5 组 × 2 根 = 10 根）+ 根部桥接筋
      const pairSep = rr * 0.105;
      for (const sign of [-1, 1]) {
        loftBeam(
          soup, rRoot, rRim, zRoot, zRim, 0.007,
          (s) => {
            const r = rRoot + (rRim - rRoot) * s;
            const sep = pairSep * (0.85 + 0.30 * s);
            return baseAngle + sign * (sep / r);
          },
          (s) => {
            const w = rr * (0.046 - 0.008 * s);
            return {
              wFront: w * 0.70,
              wMid: w,
              wBack: w * 0.80,
              thick: 0.020 * (1 - 0.26 * s),
              chamferH: 0.0045
            };
          },
          12
        );
      }
    } else {
      // 越野重型 6 辐工字梁深凹辐条（根部与轮缘均加宽加强筋，中腰收细减重）
      loftBeam(
        soup, rRoot, rRim, zRoot, zRim, 0.010,
        () => baseAngle,
        (s) => {
          const waist = 1 - 0.22 * Math.sin(Math.PI * s) + (s > 0.82 ? 0.16 * ((s - 0.82) / 0.18) : 0);
          const w = rr * 0.088 * waist;
          return {
            wFront: w * 0.68,
            wMid: w,
            wBack: w * 0.84,
            thick: 0.025 * (1 - 0.25 * s),
            chamferH: 0.006
          };
        },
        14
      );
    }
  }

  return soup.geometry();
}

/**
 * 4. 制动通风划线打孔刹车盘质感贴图（透过多辐窗口清晰可见）
 */
function makeRotorTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const cx = S / 2, cy = S / 2;

  ctx.fillStyle = '#5a5f66';
  ctx.fillRect(0, 0, S, S);

  // 同心车削金属磨纹
  for (let r = 135; r < 248; r += 2) {
    const shade = 78 + Math.round(Math.sin(r * 0.6) * 14 + (r % 5 === 0 ? 12 : 0));
    ctx.strokeStyle = `rgb(${shade},${shade + 2},${shade + 5})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }

  // 8 条弧形排屑散热划线 + 交叉散热孔
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a0);

    // 划线槽
    ctx.strokeStyle = '#25282c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(145, -14);
    ctx.quadraticCurveTo(196, 8, 240, 34);
    ctx.stroke();

    // 3 排错位打孔
    const holePts = [[162, 16], [190, 26], [218, 38]];
    for (const [hx, hy] of holePts) {
      ctx.fillStyle = '#181a1d';
      ctx.beginPath();
      ctx.arc(hx, hy, 4.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

let cachedRotorTex = null;
function getRotorTexture() {
  if (!cachedRotorTex) cachedRotorTex = makeRotorTexture();
  return cachedRotorTex;
}

/**
 * 5. 生成完整机械工程级轮毂零件几何缓存与组装工厂
 */
export function getEngineeredRimAssets(spec, d) {
  const hub = buildHubData(spec, d);
  const barrelGeo = buildBarrelGeometry(spec, d);
  const spokeGeo = buildSpokeGeometry(spec, d, hub);

  const rr = d.rimRadius;
  const hw = d.rimHalfWidth;
  const rs = spec.rimStyle;

  // 外缘 CNC 亮边（或 A/T 防脱 Beadlock 压圈）
  const isBeadlock = rs.spokeType === 'beadlock';
  const lipGeo = isBeadlock
    ? new THREE.RingGeometry(rr - 0.008, rr + 0.015, 64)
    : new THREE.TorusGeometry(rr + 0.011, 0.0042, 8, 96);

  // 六角轮毂螺栓 + 60° 锥形座
  const boltConeGeo = new THREE.CylinderGeometry(0.010, 0.0068, 0.012, 16).rotateX(Math.PI / 2);
  const boltHexGeo = new THREE.CylinderGeometry(0.0095, 0.0095, 0.014, 6).rotateX(Math.PI / 2);
  const lugSeatGeo = new THREE.TorusGeometry(hub.boltHoleR + 0.0028, 0.0022, 6, 20);

  // Beadlock 防脱螺栓（24 颗）
  const beadBoltGeo = new THREE.CylinderGeometry(0.0052, 0.0052, 0.008, 6).rotateX(Math.PI / 2);

  // 中心盖 + 品牌徽章环
  const capRadius = hub.cbR + 0.004;
  const capGeo = new THREE.CylinderGeometry(capRadius, capRadius, 0.014, 40).rotateX(Math.PI / 2);
  const accentRingGeo = new THREE.TorusGeometry(capRadius * 0.84, 0.0035, 8, 40);

  // 通风打孔刹车盘 + 铝合金合头帽（紧密贴合轮毂安装面 zMount）
  const rotorOuterR = Math.min(rr * 0.78, rr - 0.032);
  const rotorInnerR = Math.max(hub.hubOuterR + 0.006, rotorOuterR * 0.56);
  const rotorPlateGeo = new THREE.CylinderGeometry(rotorOuterR, rotorOuterR, 0.007, 48).rotateX(Math.PI / 2);
  const rotorVaneGeo = new THREE.BoxGeometry(rotorOuterR - rotorInnerR - 0.008, 0.0045, 0.012);
  const rotorHatGeo = new THREE.CylinderGeometry(hub.hubOuterR * 0.88, rotorInnerR + 0.008, 0.028, 40)
    .rotateX(Math.PI / 2);

  // 气门嘴（贴合轮辋井外侧肩部斜穿而出）
  const valveStemGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.028, 12).rotateX(Math.PI / 2);
  const valveCapGeo = new THREE.CylinderGeometry(0.0056, 0.0056, 0.009, 12).rotateX(Math.PI / 2);

  return {
    hub,
    barrelGeo,
    spokeGeo,
    lipGeo,
    isBeadlock,
    boltConeGeo,
    boltHexGeo,
    lugSeatGeo,
    beadBoltGeo,
    capGeo,
    accentRingGeo,
    rotorOuterR,
    rotorInnerR,
    rotorPlateGeo,
    rotorVaneGeo,
    rotorHatGeo,
    valveStemGeo,
    valveCapGeo,
    hw,
    rr,
    brakeDiscZ: hub.zMount - 0.022
  };
}

export function assembleEngineeredRim(spec, d, mats, assets) {
  const g = new THREE.Group();
  const rs = spec.rimStyle;
  const { hub, hw, rr } = assets;

  // 1. ETRTO J-轮廓轮辋桶 + 3D 放样锻造辐条 + 中心安装盘
  g.add(new THREE.Mesh(assets.barrelGeo, mats.rim));
  g.add(new THREE.Mesh(assets.spokeGeo, mats.rim));
  g.add(new THREE.Mesh(hub.padGeo, mats.rim));
  g.add(new THREE.Mesh(hub.collarGeo, mats.rim));
  g.add(new THREE.Mesh(hub.boreSleeveGeo, mats.rimLight));

  // 2. 外圈亮唇或 Beadlock 防脱压圈 + 24 颗锁紧螺栓
  const lip = new THREE.Mesh(assets.lipGeo, assets.isBeadlock ? mats.beadlock : mats.rimLight);
  if (assets.isBeadlock) {
    lip.position.z = hw + 0.0095;
    g.add(lip);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const bb = new THREE.Mesh(assets.beadBoltGeo, mats.bolt);
      bb.position.set((rr + 0.003) * Math.sin(a), -(rr + 0.003) * Math.cos(a), hw + 0.012);
      g.add(bb);
    }
  } else {
    lip.position.z = hw + 0.0062;
    g.add(lip);
  }

  // 3. PCD 螺栓孔座圈 + 六角轮毂螺栓
  for (let i = 0; i < rs.bolts; i++) {
    const a = (i / rs.bolts) * TAU + 0.2;
    const bx = d.pcdRadius * Math.sin(a);
    const by = -d.pcdRadius * Math.cos(a);

    const seat = new THREE.Mesh(assets.lugSeatGeo, mats.rimLight);
    seat.position.set(bx, by, hub.zPadFront + 0.0025);
    g.add(seat);

    const cone = new THREE.Mesh(assets.boltConeGeo, mats.bolt);
    cone.position.set(bx, by, hub.zPadFront + 0.001);
    g.add(cone);

    const hex = new THREE.Mesh(assets.boltHexGeo, mats.bolt);
    hex.position.set(bx, by, hub.zPadFront + 0.010);
    g.add(hex);
  }

  // 4. 中心盖 + 品牌圆环
  const capZ = hub.zPadFront + 0.002;
  const cap = new THREE.Mesh(assets.capGeo, [mats.rim, mats.capFace, mats.capFace]);
  cap.position.z = capZ;
  g.add(cap);

  const accentRing = new THREE.Mesh(assets.accentRingGeo, mats.accent);
  accentRing.position.z = capZ + 0.0075;
  g.add(accentRing);

  // 5. 气门嘴（位于轮辋内肩外侧孔）
  const valveR = rr - 0.016;
  const valve = new THREE.Mesh(assets.valveStemGeo, mats.bolt);
  valve.position.set(valveR, 0, hw * 0.56);
  valve.rotation.y = 0.25;
  g.add(valve);
  const vCap = new THREE.Mesh(assets.valveCapGeo, mats.valveCap);
  vCap.position.set(valveR + 0.004, 0, hw * 0.56 + 0.015);
  vCap.rotation.y = 0.25;
  g.add(vCap);

  // 6. 透过辐条清晰可见的双片式通风打孔刹车盘 + 铝合金合头帽
  const rotorGroup = new THREE.Group();
  const rotorMat = mats.rotor;
  const frontDisc = new THREE.Mesh(assets.rotorPlateGeo, [mats.brake, rotorMat, rotorMat]);
  frontDisc.position.z = assets.brakeDiscZ + 0.009;
  const rearDisc = new THREE.Mesh(assets.rotorPlateGeo, [mats.brake, rotorMat, rotorMat]);
  rearDisc.position.z = assets.brakeDiscZ - 0.009;
  rotorGroup.add(frontDisc, rearDisc);

  const vaneMidR = (assets.rotorOuterR + assets.rotorInnerR) * 0.5;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    const vane = new THREE.Mesh(assets.rotorVaneGeo, mats.brakeHole);
    vane.position.set(vaneMidR * Math.cos(a), vaneMidR * Math.sin(a), assets.brakeDiscZ);
    vane.rotation.z = a + 0.22; // 弯曲散热风道倾角
    rotorGroup.add(vane);
  }

  const hat = new THREE.Mesh(assets.rotorHatGeo, mats.brakeHat);
  hat.position.z = hub.zMount - 0.014;
  rotorGroup.add(hat);
  g.add(rotorGroup);

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export { getRotorTexture };
