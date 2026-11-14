import * as THREE from 'three';
import { createTire } from '../tire.js';
import { createCoilover } from './coilSpring.js';
import { createDrivetrainRig } from './drivetrain.js';
import { CAR_CONFIG } from '../specs.js';

const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * 保持水平叉臂平面不发生扭转的对准辅助函数（局部 +Z 指向 end，局部 +X 保持水平）。
 */
function aimSpan(group, start, end) {
  group.position.copy(start);
  _dir.subVectors(end, start);
  const len = Math.max(0.05, _dir.length());
  _dir.divideScalar(len);
  _side.crossVectors(WORLD_UP, _dir);
  if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
  else _side.normalize();
  _up.crossVectors(_dir, _side);
  _mat.makeBasis(_side, _up, _dir);
  group.quaternion.setFromRotationMatrix(_mat);
  return len;
}

/**
 * 构建一根两点间的金属管件（局部沿 Z 轴，长度 1 以便缩放）。
 */
function makeTubeBar(radius, material, radialSegs = 12) {
  const geo = new THREE.CylinderGeometry(radius, radius, 1, radialSegs).rotateX(Math.PI / 2);
  geo.translate(0, 0, 0.5);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

/**
 * 构建 A 形双叉臂单元（内侧两根分叉臂汇聚到外侧球头）。
 */
function createWishbone(spreadZ, radius, material, jointMat) {
  const g = new THREE.Group();
  const legA = makeTubeBar(radius, material, 10);
  const legB = makeTubeBar(radius, material, 10);
  g.add(legA, legB);

  const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.75, 14, 10), jointMat);
  joint.castShadow = true;
  g.add(joint);

  const shockTab = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.022, 0.036), jointMat);
  g.add(shockTab);

  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _legDir = new THREE.Vector3();
  function setSpanLength(len) {
    // 两条斜臂从 (spreadZ, 0, 0) 和 (-spreadZ, 0, 0) 汇聚到 (0, 0, len) —— 纯局部四元数对准，不依赖世界矩阵
    _a.set(spreadZ, 0, 0);
    _b.set(0, 0, len);
    _legDir.subVectors(_b, _a);
    const l1 = _legDir.length() || 0.01;
    _legDir.divideScalar(l1);
    legA.position.copy(_a);
    legA.quaternion.setFromUnitVectors(Z_AXIS, _legDir);
    legA.scale.z = l1;

    _a.set(-spreadZ, 0, 0);
    _legDir.subVectors(_b, _a);
    const l2 = _legDir.length() || 0.01;
    _legDir.divideScalar(l2);
    legB.position.copy(_a);
    legB.quaternion.setFromUnitVectors(Z_AXIS, _legDir);
    legB.scale.z = l2;

    joint.position.set(0, 0, len);
    shockTab.position.set(0, 0.015, len * 0.72);
  }

  return { group: g, setSpanLength };
}

/**
 * 构建整车工程底盘总成：
 * 车架纵梁 / 管阵防滚架 / 透明半壳 / 前后灯组 / 4组双叉臂+真螺旋避震 / 转向机与随动方向盘 / 开放传动系统 / 4只可换轮胎
 */
export function createVehicleRig(initialTireSpec) {
  const root = new THREE.Group();
  const halfWB = CAR_CONFIG.wheelbase / 2;     // 1.23
  const halfTrack = CAR_CONFIG.halfTrack;      // 0.84

  // ------------------------------------------------------------ 材质库
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x262930, roughness: 0.44, metalness: 0.78
  });
  const alloyMat = new THREE.MeshStandardMaterial({
    color: 0x8f97a3, roughness: 0.28, metalness: 0.90, envMapIntensity: 1.4
  });
  const armMat = new THREE.MeshStandardMaterial({
    color: 0x3b414b, roughness: 0.34, metalness: 0.84
  });
  const caliperMat = new THREE.MeshPhysicalMaterial({
    color: 0xc84b31, roughness: 0.28, metalness: 0.35, clearcoat: 0.7
  });
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x1e2024, roughness: 0.82, metalness: 0.05
  });
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0x3c6e8c,
    roughness: 0.18,
    metalness: 0.12,
    transmission: 0.62,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xfff5dc, emissiveIntensity: 1.6, roughness: 0.2
  });
  const tailLightMat = new THREE.MeshStandardMaterial({
    color: 0xc92a2a, emissive: 0x881111, emissiveIntensity: 0.8, roughness: 0.25
  });

  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  // ------------------------------------------------------------ 主车架结构（纵梁 + 护板 + 塔顶）
  const skidPlate = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.026, 2.74), frameMat);
  skidPlate.position.set(0, -0.105, 0);
  skidPlate.castShadow = true;
  skidPlate.receiveShadow = true;
  chassisGroup.add(skidPlate);

  // 左右主纵梁
  for (const side of [1, -1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.085, 2.86), frameMat);
    rail.position.set(side * 0.26, -0.055, 0);
    rail.castShadow = true;
    chassisGroup.add(rail);

    const upperSill = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 2.15, 12).rotateX(Math.PI / 2),
      alloyMat
    );
    upperSill.position.set(side * 0.31, 0.13, -0.02);
    upperSill.castShadow = true;
    chassisGroup.add(upperSill);
  }

  // 前后副车架横梁 + 避震塔顶支架
  for (const az of [halfWB, -halfWB]) {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.065, 0.10), frameMat);
    cross.position.set(0, 0.06, az);
    cross.castShadow = true;
    chassisGroup.add(cross);

    for (const side of [1, -1]) {
      // 塔顶斜撑柱
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.28, 0.085), alloyMat);
      tower.position.set(side * 0.34, 0.16, az);
      tower.rotation.z = -side * 0.30;
      tower.castShadow = true;
      chassisGroup.add(tower);

      // 上塔顶避震耳座
      const mount = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.024, 0.048, 16).rotateX(Math.PI / 2),
        frameMat
      );
      mount.position.set(side * 0.40, 0.26, az);
      chassisGroup.add(mount);
    }
  }

  // 前防撞杠 + 大灯 + 尾部灯带
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.055, 0.08), frameMat);
  frontBumper.position.set(0, -0.02, 1.50);
  frontBumper.castShadow = true;
  chassisGroup.add(frontBumper);

  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.060, 0.08), frameMat);
  rearBumper.position.set(0, 0.01, -1.50);
  rearBumper.castShadow = true;
  chassisGroup.add(rearBumper);

  for (const side of [1, -1]) {
    const hLamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.042, 0.03), headlightMat);
    hLamp.position.set(side * 0.32, 0.07, 1.48);
    chassisGroup.add(hLamp);
  }
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.038, 0.026), tailLightMat);
  tailBar.position.set(0, 0.12, -1.48);
  chassisGroup.add(tailBar);

  // 驾驶舱座椅 + 管阵防滚架
  const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.40), seatMat);
  seatBase.position.set(0, 0.02, -0.18);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.07), seatMat);
  seatBack.position.set(0, 0.24, -0.38);
  seatBack.rotation.x = -0.22;
  chassisGroup.add(seatBase, seatBack);

  // 管阵防滚架弧线
  const cagePts = [
    [[-0.31, 0.13, 0.62], [-0.26, 0.56, 0.14], [-0.26, 0.58, -0.42], [-0.30, 0.13, -1.06]],
    [[0.31, 0.13, 0.62], [0.26, 0.56, 0.14], [0.26, 0.58, -0.42], [0.30, 0.13, -1.06]]
  ];
  for (const pts of cagePts) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.018, 10, false), frameMat);
    tube.castShadow = true;
    chassisGroup.add(tube);
  }
  // 防滚架横梁
  for (const [y, z, w] of [[0.56, 0.14, 0.52], [0.58, -0.42, 0.52], [0.16, 0.64, 0.62]]) {
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, w, 12).rotateZ(Math.PI / 2),
      frameMat
    );
    bar.position.set(0, y, z);
    chassisGroup.add(bar);
  }

  // 半透明气动外壳轮廓（可在工具栏一键隐藏/展示纯机械底盘）
  const shellGroup = new THREE.Group();
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.04, 0.72), shellMat);
  hood.position.set(0, 0.21, 1.02);
  hood.rotation.x = 0.14;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.03, 0.68), shellMat);
  roof.position.set(0, 0.60, -0.14);
  const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.04, 0.68), shellMat);
  rearDeck.position.set(0, 0.25, -1.06);
  rearDeck.rotation.x = -0.16;
  shellGroup.add(hood, roof, rearDeck);
  chassisGroup.add(shellGroup);

  // ------------------------------------------------------------ 转向机齿条 + 方向盘联动
  const steeringRackHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.44, 16).rotateZ(Math.PI / 2),
    alloyMat
  );
  steeringRackHousing.position.set(0, -0.02, halfWB - 0.16);
  chassisGroup.add(steeringRackHousing);

  const steeringRackBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.54, 12).rotateZ(Math.PI / 2),
    caliperMat
  );
  steeringRackBar.position.set(0, -0.02, halfWB - 0.16);
  chassisGroup.add(steeringRackBar);

  // 转向管柱 + 随动方向盘
  const steerColumnGroup = new THREE.Group();
  steerColumnGroup.position.set(0, 0.30, 0.36);
  steerColumnGroup.rotation.x = -0.45;
  chassisGroup.add(steerColumnGroup);

  const steerColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.42, 12).rotateX(Math.PI / 2),
    alloyMat
  );
  steerColumn.position.z = 0.16;
  steerColumnGroup.add(steerColumn);

  const steeringWheel = new THREE.Group();
  steeringWheel.position.z = -0.05;
  steerColumnGroup.add(steeringWheel);

  const swRim = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.015, 10, 36), seatMat);
  const swSpoke = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.024, 0.014), alloyMat);
  const swMarker = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.036, 0.036), caliperMat);
  swMarker.position.y = 0.135;
  steeringWheel.add(swRim, swSpoke, swMarker);

  // ------------------------------------------------------------ 机械传动系统
  const drivetrain = createDrivetrainRig({ wheelbase: CAR_CONFIG.wheelbase, diffY: -0.06 });
  chassisGroup.add(drivetrain.root);

  // ------------------------------------------------------------ 四角独立悬架 + 螺旋避震 + 转向节 + 车轮
  // 顺序约定：[0: 左前 FL, 1: 右前 FR, 2: 左后 RL, 3: 右后 RR]
  const cornerDefs = [
    { id: 'FL', isFront: true, side: 1, z: halfWB },
    { id: 'FR', isFront: true, side: -1, z: halfWB },
    { id: 'RL', isFront: false, side: 1, z: -halfWB },
    { id: 'RR', isFront: false, side: -1, z: -halfWB }
  ];

  const corners = cornerDefs.map((def) => {
    const upperPivot = new THREE.Vector3(def.side * 0.29, 0.11, def.z);
    const lowerPivot = new THREE.Vector3(def.side * 0.27, -0.09, def.z);
    const shockTop = new THREE.Vector3(def.side * 0.40, 0.26, def.z);

    const upperArm = createWishbone(0.11, 0.013, armMat, alloyMat);
    const lowerArm = createWishbone(0.13, 0.016, armMat, alloyMat);
    chassisGroup.add(upperArm.group, lowerArm.group);

    const coilover = createCoilover({
      coilRadius: 0.044,
      wireRadius: 0.0085,
      turns: 7.5,
      restSpan: 0.44,
      coilColor: 0xc8563c
    });
    chassisGroup.add(coilover.root);

    // 转向节（随悬架上下运动，前轮绕 Y 轴转向）
    const knuckle = new THREE.Group();
    chassisGroup.add(knuckle);

    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.20, 0.075), alloyMat);
    upright.position.x = -def.side * 0.14;
    upright.castShadow = true;
    knuckle.add(upright);

    // 转向臂（连接拉杆）
    let tieRod = null;
    if (def.isFront) {
      const steerHorn = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.024, 0.14), alloyMat);
      steerHorn.position.set(-def.side * 0.14, 0.01, -0.07);
      knuckle.add(steerHorn);

      tieRod = new THREE.Group();
      tieRod.add(makeTubeBar(0.009, alloyMat, 10));
      chassisGroup.add(tieRod);
    }

    // 固定在转向节上的刹车卡钳（不随车轮转动，尺寸按轮辋内径收缩以严密贴合刹车盘）
    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.086, 0.068), caliperMat);
    caliper.castShadow = true;
    knuckle.add(caliper);

    const tireMount = new THREE.Group();
    knuckle.add(tireMount);

    return {
      ...def,
      upperPivot,
      lowerPivot,
      shockTop,
      upperArm,
      lowerArm,
      coilover,
      knuckle,
      upright,
      caliper,
      tieRod,
      tireMount,
      tire: null
    };
  });

  function equipTire(spec) {
    for (const c of corners) {
      if (c.tire) c.tireMount.remove(c.tire.root);
      const t = createTire(spec);
      // 左轮(+X)外侧朝 +X，右轮(-X)外侧朝 -X
      t.root.rotation.y = c.side > 0 ? Math.PI / 2 : -Math.PI / 2;
      c.tireMount.add(t.root);
      c.tire = t;

      // 让卡钳精确跨骑在当前轮毂 ET 对应的通风刹车盘外缘上
      const rr = t.dimensions.rimRadius;
      const caliperScale = Math.min(1.15, Math.max(0.82, rr / 0.22));
      const discX = c.side * t.dimensions.brakeDiscZ;
      const caliperR = t.dimensions.rotorOuterR * 0.78;
      c.caliper.scale.setScalar(caliperScale);
      c.caliper.position.set(discX, caliperR * 0.72, -caliperR * 0.68);
    }
    return corners[0].tire.dimensions;
  }

  equipTire(initialTireSpec);

  const _upperEnd = new THREE.Vector3();
  const _lowerEnd = new THREE.Vector3();
  const _shockBot = new THREE.Vector3();
  const _rackEnd = new THREE.Vector3();
  const _hornEnd = new THREE.Vector3();
  const _hubLocal = [
    new THREE.Vector3(), new THREE.Vector3(),
    new THREE.Vector3(), new THREE.Vector3()
  ];

  /**
   * 用物理世界计算出的车身姿态与四轮悬架状态同步整车所有 3D 机械件
   */
  function syncFromPhysics({
    chassisPosition,
    chassisQuaternion,
    wheels,
    steeringAngle = 0,
    isBraking = false,
    gearRatio = 2.1
  }) {
    chassisGroup.position.copy(chassisPosition);
    chassisGroup.quaternion.copy(chassisQuaternion);

    // 刹车灯高亮反馈
    tailLightMat.emissiveIntensity = isBraking ? 2.6 : 0.75;

    // 转向机齿条横移 + 方向盘联动（左转时从驾驶位看逆时针旋转）
    const rackShift = Math.sin(steeringAngle) * 0.065;
    steeringRackBar.position.x = -rackShift;
    steeringWheel.rotation.z = -steeringAngle * 2.2;

    let totalRot = 0;

    for (let i = 0; i < corners.length; i++) {
      const c = corners[i];
      const w = wheels[i];
      const suspLen = w.suspensionLength;
      const hubY = CAR_CONFIG.chassisConnY - suspLen;
      const hubX = c.side * halfTrack;

      _hubLocal[i].set(hubX, hubY, c.z);

      // 转向节位置与转向角
      c.knuckle.position.set(hubX, hubY, c.z);
      c.knuckle.rotation.y = w.steering;

      // 车轮滚动（左右轮符号已按 tire.js 坐标系验证：前进时均向前滚转）
      if (c.tire) {
        c.tire.spin.rotation.z = c.side > 0 ? -w.rotation : w.rotation;
      }
      totalRot += w.rotation;

      // 双叉臂几何联动（连接车架枢轴与转向节上下球头）
      _upperEnd.set(hubX - c.side * 0.14, hubY + 0.09, c.z);
      _lowerEnd.set(hubX - c.side * 0.14, hubY - 0.085, c.z);

      const uLen = aimSpan(c.upperArm.group, c.upperPivot, _upperEnd);
      c.upperArm.setSpanLength(uLen);

      const lLen = aimSpan(c.lowerArm.group, c.lowerPivot, _lowerEnd);
      c.lowerArm.setSpanLength(lLen);

      // 螺旋避震弹簧跟随下摆臂 72% 支点实时伸缩（保持钢丝截面不变形）
      _shockBot.lerpVectors(c.lowerPivot, _lowerEnd, 0.72);
      _shockBot.y += 0.025;
      const compRatio = Math.max(0, Math.min(1, (w.restLength - suspLen) / (w.maxTravel || 0.22)));
      c.coilover.setSpan(c.shockTop, _shockBot, compRatio);

      // 前轮转向拉杆随齿条与转向角实时伸缩/瞄准
      if (c.tieRod) {
        _rackEnd.set(c.side * 0.24 - rackShift, -0.02, c.z - 0.16);
        const s = Math.sin(w.steering);
        const cs = Math.cos(w.steering);
        // 转向臂末端局部坐标 (-c.side*0.14, 0.01, -0.13) 绕 knuckle.rotation.y 变换
        const lx = -c.side * 0.14;
        const lz = -0.13;
        _hornEnd.set(
          hubX + lx * cs + lz * s,
          hubY + 0.01,
          c.z - lx * s + lz * cs
        );
        const tieLen = aimSpan(c.tieRod, _rackEnd, _hornEnd);
        c.tieRod.children[0].scale.z = tieLen;
      }
    }

    // 机械传动系统联动（齿轮组 + 中央传动轴 + 前后差速器 + 4根万向节半轴）
    drivetrain.update(_hubLocal, totalRot / corners.length, gearRatio);
  }

  function setShellVisible(visible) {
    shellGroup.visible = visible;
  }

  function setRimVisible(visible) {
    for (const c of corners) {
      if (c.tire) {
        c.tire.rimGroup.visible = visible;
        c.tire.liner.visible = !visible;
      }
    }
  }

  function setTreadHighlight(on) {
    for (const c of corners) {
      if (c.tire) {
        c.tire.treadMesh.material = on ? c.tire.materials.treadHi : c.tire.materials.tread;
      }
    }
  }

  return {
    root,
    chassisGroup,
    corners,
    drivetrain,
    equipTire,
    syncFromPhysics,
    setShellVisible,
    setRimVisible,
    setTreadHighlight
  };
}
