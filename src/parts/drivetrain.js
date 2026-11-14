import * as THREE from 'three';

const TAU = Math.PI * 2;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * 程序化生成带真实渐开线梯形齿、减重孔和轴套的直齿轮 Mesh。
 */
export function createGearMesh({
  teeth = 16,
  moduleSize = 0.010,
  thickness = 0.028,
  boreRadius = 0.018,
  material,
  hubMaterial
}) {
  const pitchR = (moduleSize * teeth) / 2;
  const addendum = moduleSize * 0.92;
  const dedendum = moduleSize * 1.15;
  const outerR = pitchR + addendum;
  const rootR = Math.max(boreRadius + 0.010, pitchR - dedendum);
  const step = TAU / teeth;

  const shape = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const a0 = a - step * 0.34;
    const a1 = a - step * 0.21;
    const a2 = a - step * 0.11;
    const a3 = a + step * 0.11;
    const a4 = a + step * 0.21;
    const a5 = a + step * 0.34;

    const p0x = rootR * Math.cos(a0), p0y = rootR * Math.sin(a0);
    if (i === 0) shape.moveTo(p0x, p0y);
    else shape.lineTo(p0x, p0y);

    shape.lineTo(rootR * Math.cos(a1), rootR * Math.sin(a1));
    shape.lineTo(outerR * Math.cos(a2), outerR * Math.sin(a2));
    shape.lineTo(outerR * Math.cos(a3), outerR * Math.sin(a3));
    shape.lineTo(rootR * Math.cos(a4), rootR * Math.sin(a4));
    shape.lineTo(rootR * Math.cos(a5), rootR * Math.sin(a5));
  }
  shape.closePath();

  // 中心轴孔
  const bore = new THREE.Path();
  bore.absarc(0, 0, boreRadius, 0, TAU, true);
  shape.holes.push(bore);

  // 减重圆孔（大齿轮才打孔）
  if (rootR > boreRadius + 0.042) {
    const holeRingR = (rootR + boreRadius) * 0.52;
    const holeR = Math.min(0.016, (rootR - boreRadius) * 0.26);
    for (let k = 0; k < 5; k++) {
      const ha = (k / 5) * TAU;
      const hole = new THREE.Path();
      hole.absarc(holeRingR * Math.cos(ha), holeRingR * Math.sin(ha), holeR, 0, TAU, true);
      shape.holes.push(hole);
    }
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: Math.min(0.0018, moduleSize * 0.18),
    bevelThickness: Math.min(0.0020, thickness * 0.08),
    bevelSegments: 2,
    curveSegments: 16
  });
  geo.translate(0, 0, -thickness / 2);

  const group = new THREE.Group();
  const gearMesh = new THREE.Mesh(geo, material);
  gearMesh.castShadow = true;
  gearMesh.receiveShadow = true;
  group.add(gearMesh);

  // 中心凸台衬套
  if (hubMaterial) {
    const boss = new THREE.Mesh(
      new THREE.CylinderGeometry(boreRadius * 1.45, boreRadius * 1.45, thickness * 1.35, 24).rotateX(Math.PI / 2),
      hubMaterial
    );
    boss.castShadow = true;
    group.add(boss);
  }

  return { group, pitchR, teeth };
}

/**
 * 构建整车开放式机械传动总成：
 * 电机飞轮 -> 中心啮合齿轮箱 -> 前/后中央传动轴 -> 前/后差速器 -> 4 根万向节随动半轴
 */
export function createDrivetrainRig({ wheelbase = 2.46, diffY = -0.06 } = {}) {
  const root = new THREE.Group();
  const halfWB = wheelbase / 2;

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xbac2cc, roughness: 0.26, metalness: 0.92, envMapIntensity: 1.5
  });
  const bronzeGearMat = new THREE.MeshStandardMaterial({
    color: 0xc29248, roughness: 0.30, metalness: 0.88, envMapIntensity: 1.4
  });
  const darkHousingMat = new THREE.MeshStandardMaterial({
    color: 0x2c3037, roughness: 0.55, metalness: 0.65
  });
  const accentShaftMat = new THREE.MeshStandardMaterial({
    color: 0x4573a8, roughness: 0.32, metalness: 0.78
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e6eb, roughness: 0.38, metalness: 0.45
  });

  // ------------------------------------------------------------ 电机 + 飞轮 + 中心变速齿轮组
  const z1 = 16;
  const z2 = 24;
  const mod = 0.0095;
  const r1 = (mod * z1) / 2; // 0.076m
  const r2 = (mod * z2) / 2; // 0.114m
  const pinionY = diffY + r1 + r2; // +0.13m，正好位于传动轴正上方严格啮合

  // 驱动电机外壳（略透明可视感：后部有散热鳍片）
  const motorPos = new THREE.Vector3(0, pinionY, 0.26);
  const motorBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.088, 0.24, 32).rotateX(Math.PI / 2),
    darkHousingMat
  );
  motorBody.position.copy(motorPos);
  motorBody.castShadow = true;
  root.add(motorBody);

  // 电机散热环
  for (let i = -2; i <= 2; i++) {
    const fin = new THREE.Mesh(
      new THREE.TorusGeometry(0.092, 0.0045, 6, 32),
      steelMat
    );
    fin.position.set(0, pinionY, 0.26 + i * 0.036);
    root.add(fin);
  }

  // 输入轴 & 飞轮（绕 Z 轴自转，直连主动小齿轮）
  const inputSpin = new THREE.Group();
  inputSpin.position.set(0, pinionY, 0.04);
  root.add(inputSpin);

  const inputShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.22, 16).rotateX(Math.PI / 2),
    steelMat
  );
  inputShaft.position.z = 0.06;
  inputSpin.add(inputShaft);

  // 飞轮盘 + 视觉识别标识条
  const flywheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.072, 0.072, 0.020, 32).rotateX(Math.PI / 2),
    steelMat
  );
  flywheel.position.z = 0.085;
  flywheel.castShadow = true;
  inputSpin.add(flywheel);
  for (let i = 0; i < 4; i++) {
    const peg = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.022, 0.024), bronzeGearMat);
    const a = (i / 4) * TAU;
    peg.position.set(0.045 * Math.cos(a), 0.045 * Math.sin(a), 0.085);
    peg.rotation.z = a;
    inputSpin.add(peg);
  }

  const pinion = createGearMesh({
    teeth: z1, moduleSize: mod, thickness: 0.030, boreRadius: 0.016,
    material: bronzeGearMat, hubMaterial: darkHousingMat
  });
  inputSpin.add(pinion.group);

  // 输出从动大齿轮 + 中央主传动轴（绕 Z 轴旋转）
  const outputSpin = new THREE.Group();
  outputSpin.position.set(0, diffY, 0);
  root.add(outputSpin);

  const spur = createGearMesh({
    teeth: z2, moduleSize: mod, thickness: 0.030, boreRadius: 0.018,
    material: steelMat, hubMaterial: darkHousingMat
  });
  spur.group.position.z = 0.04;
  outputSpin.add(spur.group);

  // 中央传动长轴 + 螺旋视觉条纹（转动时肉眼非常容易看清转速）
  const shaftLen = wheelbase - 0.14;
  const mainShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.019, 0.019, shaftLen, 20).rotateX(Math.PI / 2),
    accentShaftMat
  );
  mainShaft.castShadow = true;
  outputSpin.add(mainShaft);

  for (let i = 0; i < 6; i++) {
    const collar = new THREE.Mesh(
      new THREE.BoxGeometry(0.046, 0.012, 0.045),
      stripeMat
    );
    collar.position.z = -shaftLen * 0.38 + (i / 5) * shaftLen * 0.76;
    collar.rotation.z = i * 0.55;
    outputSpin.add(collar);
  }

  // ------------------------------------------------------------ 前/后开放式差速器 + 半轴
  const diffs = [];
  const halfShafts = [];
  const diffZList = [halfWB, -halfWB];

  for (const dz of diffZList) {
    // 差速器半壳支架（上方留观察窗，能看到内部旋转的大齿圈）
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.082, 0.082, 0.14, 24, 1, true, Math.PI * 0.25, Math.PI * 1.5).rotateZ(Math.PI / 2),
      darkHousingMat
    );
    housing.position.set(0, diffY, dz);
    housing.castShadow = true;
    root.add(housing);

    // 差速器内部盘齿 + 行星架（绕 X 轴随车轮同向转）
    const diffCarrier = new THREE.Group();
    diffCarrier.position.set(0, diffY, dz);
    root.add(diffCarrier);

    const ringGear = createGearMesh({
      teeth: 20, moduleSize: 0.0068, thickness: 0.022, boreRadius: 0.022,
      material: bronzeGearMat
    });
    ringGear.group.rotation.y = Math.PI / 2;
    ringGear.group.position.x = -0.025;
    diffCarrier.add(ringGear.group);

    const spiderBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.038, 0.16, 16).rotateZ(Math.PI / 2),
      steelMat
    );
    diffCarrier.add(spiderBarrel);

    // 行星齿轮标记块（转起来能一眼看清差速器运转）
    for (const ang of [0, Math.PI / 2]) {
      const pin = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.095, 0.016), stripeMat);
      pin.rotation.x = ang;
      diffCarrier.add(pin);
    }
    diffs.push(diffCarrier);

    // 左右半轴（内端固定在差速器输出杯，外端指向轮毂中心）
    for (const side of [1, -1]) {
      const innerAnchor = new THREE.Vector3(side * 0.12, diffY, dz);
      const aimGroup = new THREE.Group();
      aimGroup.position.copy(innerAnchor);
      root.add(aimGroup);

      const axleSpin = new THREE.Group();
      aimGroup.add(axleSpin);

      // 内侧万向节叉
      const uJointIn = new THREE.Mesh(
        new THREE.BoxGeometry(0.032, 0.032, 0.042),
        darkHousingMat
      );
      axleSpin.add(uJointIn);

      // 内段花键轴（局部 +Z 指向轮毂）
      const shaftBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 1.0, 14).rotateX(Math.PI / 2),
        steelMat
      );
      shaftBar.position.z = 0.5;
      shaftBar.castShadow = true;
      axleSpin.add(shaftBar);

      // 彩色旋转识别环，转动时更直观
      const spinBand = new THREE.Mesh(
        new THREE.BoxGeometry(0.034, 0.010, 0.16),
        accentShaftMat
      );
      spinBand.position.z = 0.30;
      axleSpin.add(spinBand);

      // 外侧万向节套筒
      const uJointOut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.055, 16).rotateX(Math.PI / 2),
        darkHousingMat
      );
      axleSpin.add(uJointOut);

      halfShafts.push({
        side,
        isFront: dz > 0,
        innerAnchor,
        aimGroup,
        axleSpin,
        shaftBar,
        uJointOut
      });
    }
  }

  // 辅助向量，零 GC 开销
  const _target = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const phaseOffset = Math.PI / z2; // Z1=16, Z2=24 时差半个齿距完美咬合
  const gearRatio = z1 / z2;        // 16 / 24 = 2/3

  /**
   * 同步机械传动状态：
   * @param {THREE.Vector3[]} hubPositionsLocal 4 个轮毂中心在车架局部坐标系下的位置 [FL, FR, RL, RR]
   * @param {number} avgWheelRotation 车轮累计转角（弧度）
   * @param {number} gearboxRatio 变速箱挡位速比
   */
  function update(hubPositionsLocal, avgWheelRotation, gearboxRatio = 2.1) {
    // 差速器行星架同步车轮滚转
    const wheelAngle = -avgWheelRotation;
    for (const d of diffs) {
      d.rotation.x = wheelAngle;
    }

    // 中央传动轴 = 车轮转角 × 主减速比
    const diffRatio = 3.73;
    const driveShaftAngle = wheelAngle * diffRatio;
    outputSpin.rotation.z = driveShaftAngle;

    // 主动小齿轮 / 电机飞轮：严格遵守齿比 -Z2/Z1 反向啮合，绝不打齿穿模
    spur.group.rotation.z = phaseOffset;
    inputSpin.rotation.z = -driveShaftAngle * (z2 / z1);

    // 4 根半轴随悬架上下跳动实时万向节瞄准 + 轴向自转
    // hubPositionsLocal 顺序约定：[FL, FR, RL, RR]
    for (let i = 0; i < halfShafts.length; i++) {
      const hs = halfShafts[i];
      // 匹配对应角落：front +side(+1=>FL[0], -1=>FR[1]); rear +side(+1=>RL[2], -1=>RR[3])
      const hubIdx = (hs.isFront ? 0 : 2) + (hs.side > 0 ? 0 : 1);
      const hub = hubPositionsLocal[hubIdx];
      if (!hub) continue;

      // 半轴外万向节停在轮毂内侧法兰处（距轮心内缩 0.10m）
      _target.set(hub.x - hs.side * 0.10, hub.y, hub.z);
      _dir.subVectors(_target, hs.innerAnchor);
      const len = Math.max(0.25, _dir.length());
      _dir.divideScalar(len);

      _quat.setFromUnitVectors(Z_AXIS, _dir);
      hs.aimGroup.quaternion.copy(_quat);

      hs.shaftBar.scale.z = len;
      hs.shaftBar.position.z = len * 0.5;
      hs.uJointOut.position.z = len - 0.02;
      hs.axleSpin.rotation.z = hs.side > 0 ? wheelAngle : -wheelAngle;
    }
  }

  return {
    root,
    inputSpin,
    outputSpin,
    diffs,
    halfShafts,
    gearInfo: { z1, z2, ratio: 1 / gearRatio },
    update
  };
}
