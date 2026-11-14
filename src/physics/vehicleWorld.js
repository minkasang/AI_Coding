import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CAR_CONFIG } from '../specs.js';

const FIXED_DT = 1 / 60;

/**
 * 创建基于 cannon-es 的 3D 整车物理试验场与 RaycastVehicle 车辆控制器。
 */
export function createProvingGroundWorld(scene, initialTireDims) {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.81, 0)
  });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = false;

  const groundMat = new CANNON.Material('ground');
  const chassisMat = new CANNON.Material('chassis');
  const propMat = new CANNON.Material('prop');

  world.addContactMaterial(new CANNON.ContactMaterial(groundMat, chassisMat, {
    friction: 0.25, restitution: 0.08
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(groundMat, propMat, {
    friction: 0.55, restitution: 0.22
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(chassisMat, propMat, {
    friction: 0.4, restitution: 0.35
  }));

  // ------------------------------------------------------------ 地面与试验场设施（物理 + 3D 视觉同步生成）
  const trackGroup = new THREE.Group();
  scene.add(trackGroup);

  const groundBody = new CANNON.Body({ mass: 0, material: groundMat });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  const bumpMat = new THREE.MeshStandardMaterial({
    color: 0xd69a2d, roughness: 0.55, metalness: 0.1
  });
  const bumpStripeMat = new THREE.MeshStandardMaterial({
    color: 0x2b2e34, roughness: 0.65, metalness: 0.1
  });
  const rampMat = new THREE.MeshStandardMaterial({
    color: 0x626a75, roughness: 0.62, metalness: 0.22
  });
  const propBoxMat = new THREE.MeshStandardMaterial({
    color: 0xc8563c, roughness: 0.45, metalness: 0.15
  });

  // 1) 连续减速带跑道（中心前方 z = +3.5 ~ +11.0）：用半埋圆柱实现平顺圆弧坡面
  const bumpZList = [3.6, 6.0, 8.4, 10.8];
  for (let i = 0; i < bumpZList.length; i++) {
    const bz = bumpZList[i];
    const r = 0.36;
    const width = 3.0;
    const centerY = -0.265; // 顶部高出地面 ~0.095m

    const body = new CANNON.Body({ mass: 0, material: groundMat });
    body.addShape(new CANNON.Cylinder(r, r, width, 18));
    body.position.set(0, centerY, bz);
    body.quaternion.setFromEuler(0, 0, Math.PI / 2);
    world.addBody(body);

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, width, 28).rotateZ(Math.PI / 2),
      i % 2 === 0 ? bumpMat : bumpStripeMat
    );
    mesh.position.set(0, centerY, bz);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    trackGroup.add(mesh);
  }

  // 2) 交叉轴起伏波浪包（左侧车道 x = +4.8，左右轮错开压缩，便于观察悬架与半轴随动）
  const mogulCoords = [
    [4.05, 2.5], [5.55, 4.7], [4.05, 6.9], [5.55, 9.1], [4.05, 11.3]
  ];
  for (const [mx, mz] of mogulCoords) {
    const r = 0.85;
    const centerY = -0.71; // 顶部高出地面 0.14m
    const body = new CANNON.Body({ mass: 0, material: groundMat });
    body.addShape(new CANNON.Sphere(r));
    body.position.set(mx, centerY, mz);
    world.addBody(body);

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), rampMat);
    mesh.position.set(mx, centerY, mz);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    trackGroup.add(mesh);
  }

  // 3) 测试跳台斜坡（右侧 x = -4.8, z = +6.5）
  const rampAngle = 0.21; // ~12 度
  const rampLen = 4.0;
  const rampThick = 0.24;
  const rampBody = new CANNON.Body({ mass: 0, material: groundMat });
  rampBody.addShape(new CANNON.Box(new CANNON.Vec3(1.5, rampThick / 2, rampLen / 2)));
  rampBody.position.set(-4.8, 0.28, 6.5);
  rampBody.quaternion.setFromEuler(-rampAngle, 0, 0);
  world.addBody(rampBody);

  const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(3.0, rampThick, rampLen), rampMat);
  rampMesh.position.set(-4.8, 0.28, 6.5);
  rampMesh.rotation.x = -rampAngle;
  rampMesh.receiveShadow = true;
  rampMesh.castShadow = true;
  trackGroup.add(rampMesh);

  // 4) 几个可撞击的物理测试箱/路障
  const dynamicProps = [];
  const propCoords = [
    [-1.4, 0.26, 13.6], [0, 0.26, 14.2], [1.4, 0.26, 13.6],
    [-4.8, 0.26, 10.6], [4.8, 0.26, -3.5]
  ];
  for (const [px, py, pz] of propCoords) {
    const body = new CANNON.Body({
      mass: 6,
      material: propMat,
      linearDamping: 0.15,
      angularDamping: 0.25
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.24, 0.24, 0.24)));
    body.position.set(px, py, pz);
    world.addBody(body);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), propBoxMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    trackGroup.add(mesh);
    dynamicProps.push({ body, mesh, home: new CANNON.Vec3(px, py, pz) });
  }

  // ------------------------------------------------------------ 车辆刚体与 RaycastVehicle
  const chassisBody = new CANNON.Body({
    mass: CAR_CONFIG.mass,
    material: chassisMat,
    linearDamping: 0.04,
    angularDamping: 0.08
  });
  // 主车体碰撞盒略高于底盘防滑板，避免过减速带时车底误触地，同时翻车/触底仍可真实碰撞
  chassisBody.addShape(
    new CANNON.Box(new CANNON.Vec3(0.56, 0.17, 1.46)),
    new CANNON.Vec3(0, 0.06, 0)
  );
  // 降低重心提高操控稳定性
  chassisBody.addShape(
    new CANNON.Box(new CANNON.Vec3(0.32, 0.10, 0.90)),
    new CANNON.Vec3(0, -0.05, 0)
  );

  const vehicle = new CANNON.RaycastVehicle({
    chassisBody,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2
  });

  const halfWB = CAR_CONFIG.wheelbase / 2;
  const halfTrack = CAR_CONFIG.halfTrack;
  const susp = { ...CAR_CONFIG.suspension };

  const wheelBaseOpts = {
    radius: initialTireDims.outerRadius,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    suspensionStiffness: susp.stiffness,
    suspensionRestLength: susp.restLength,
    frictionSlip: susp.frictionSlip,
    dampingRelaxation: susp.dampingRelaxation,
    dampingCompression: susp.dampingCompression,
    maxSuspensionForce: 90000,
    rollInfluence: susp.rollInfluence,
    axleLocal: new CANNON.Vec3(-1, 0, 0),
    chassisConnectionPointLocal: new CANNON.Vec3(),
    maxSuspensionTravel: susp.maxTravel,
    customSlidingRotationalSpeed: -24,
    useCustomSlidingRotationalSpeed: true
  };

  // [0: FL (+X,+Z), 1: FR (-X,+Z), 2: RL (+X,-Z), 3: RR (-X,-Z)]
  const wheelAnchors = [
    [halfTrack, CAR_CONFIG.chassisConnY, halfWB, true],
    [-halfTrack, CAR_CONFIG.chassisConnY, halfWB, true],
    [halfTrack, CAR_CONFIG.chassisConnY, -halfWB, false],
    [-halfTrack, CAR_CONFIG.chassisConnY, -halfWB, false]
  ];

  for (const [x, y, z, isFront] of wheelAnchors) {
    vehicle.addWheel({
      ...wheelBaseOpts,
      isFrontWheel: isFront,
      chassisConnectionPointLocal: new CANNON.Vec3(x, y, z)
    });
  }
  vehicle.addToWorld(world);

  // ------------------------------------------------------------ 运行状态与控制接口
  const state = {
    throttle: 0,      // -1 ~ +1
    steerInput: 0,    // -1 ~ +1
    currentSteer: 0,
    braking: false,
    gearRatio: 2.10,
    autoDemo: false,
    demoPhase: 0,
    slowMo: false
  };

  let accumulator = 0;

  function resetVehicle(dropHeight = 0.28) {
    const r = vehicle.wheelInfos[0].radius;
    const restY = r + (susp.restLength - 0.08) + dropHeight;
    chassisBody.position.set(0, restY, -2.6);
    chassisBody.velocity.set(0, 0, 0);
    chassisBody.angularVelocity.set(0, 0, 0);
    chassisBody.quaternion.set(0, 0, 0, 1);
    for (const w of vehicle.wheelInfos) {
      w.engineForce = 0;
      w.brake = 0;
      w.steering = 0;
    }
    state.currentSteer = 0;
    state.demoPhase = 0;
    for (const p of dynamicProps) {
      p.body.position.copy(p.home);
      p.body.velocity.set(0, 0, 0);
      p.body.angularVelocity.set(0, 0, 0);
      p.body.quaternion.set(0, 0, 0, 1);
    }
  }

  function triggerDropTest() {
    chassisBody.position.y += 0.65;
    chassisBody.velocity.set(0, -1.2, 0);
    chassisBody.angularVelocity.set(0.18, 0, 0.22);
  }

  function launchBumpRun() {
    const r = vehicle.wheelInfos[0].radius;
    chassisBody.position.set(0, r + susp.restLength - 0.04, -1.2);
    chassisBody.quaternion.set(0, 0, 0, 1);
    chassisBody.velocity.set(0, 0, 5.8);
    chassisBody.angularVelocity.set(0, 0, 0);
  }

  function setSuspensionParams({ stiffness, damping, restLength }) {
    if (stiffness !== undefined) susp.stiffness = stiffness;
    if (damping !== undefined) {
      susp.dampingCompression = damping * 0.85;
      susp.dampingRelaxation = damping * 1.15;
    }
    if (restLength !== undefined) susp.restLength = restLength;
    for (const w of vehicle.wheelInfos) {
      w.suspensionStiffness = susp.stiffness;
      w.dampingCompression = susp.dampingCompression;
      w.dampingRelaxation = susp.dampingRelaxation;
      w.suspensionRestLength = susp.restLength;
    }
  }

  function setTireRadius(radius) {
    for (const w of vehicle.wheelInfos) {
      w.radius = radius;
    }
  }

  function setVisible(visible) {
    trackGroup.visible = visible;
  }

  function step(frameDt, input = {}) {
    const dt = state.slowMo ? frameDt * 0.28 : frameDt;
    let targetThrottle = input.throttle || 0;
    let targetSteer = input.steer || 0;
    let braking = Boolean(input.brake);

    if (state.autoDemo) {
      state.demoPhase += dt;
      // 自主往返过减速带与八字蛇行测试
      const z = chassisBody.position.z;
      const x = chassisBody.position.x;
      const speed = vehicle.currentVehicleSpeedKmHour;
      targetThrottle = speed < 22 ? 0.58 : 0.15;
      // 沿赛道中心偏置引导回中，过完减速带再转向绕回
      const desiredX = z > 12 ? 4.8 : (z < -2 ? 0 : Math.sin(state.demoPhase * 0.8) * 0.8);
      const fwd = new CANNON.Vec3(0, 0, 1);
      chassisBody.quaternion.vmult(fwd, fwd);
      const targetDir = new CANNON.Vec3(desiredX - x, 0, (z > 13.5 ? -4 : 15) - z);
      targetDir.normalize();
      const crossY = fwd.z * targetDir.x - fwd.x * targetDir.z;
      targetSteer = THREE.MathUtils.clamp(crossY * 1.8, -1, 1);
      if (Math.hypot(x, z) > 24) resetVehicle(0.15);
    }

    // 平滑转向插值，避免瞬间跳角
    const steerLerp = 1 - Math.pow(0.0005, dt);
    state.currentSteer += (targetSteer * CAR_CONFIG.maxSteer - state.currentSteer) * steerLerp;

    // 阿克曼内外轮微差转向（前轮 0:FL, 1:FR）
    const s = state.currentSteer;
    vehicle.setSteeringValue(s, 0);
    vehicle.setSteeringValue(s * 0.94, 1);

    // 根据档位传动比放大输出扭矩
    const gearScale = Math.abs(state.gearRatio) / 2.1;
    const gearDir = Math.sign(state.gearRatio) || 1;
    const speedKmH = vehicle.currentVehicleSpeedKmHour;
    // 在 cannon-es 中 indexForwardAxis=2 时，负的 engineForce 推动车头朝 +Z 前进
    let force = 0;
    if (Math.abs(targetThrottle) > 0.01) {
      const topSpeed = 68 / Math.max(0.7, gearScale);
      if (Math.abs(speedKmH) < topSpeed || Math.sign(targetThrottle * gearDir) !== Math.sign(speedKmH)) {
        force = -targetThrottle * gearDir * CAR_CONFIG.maxForce * gearScale;
      }
    }

    // 四驱扭矩分配（前40% / 后60%）
    vehicle.applyEngineForce(force * 0.40, 0);
    vehicle.applyEngineForce(force * 0.40, 1);
    vehicle.applyEngineForce(force * 0.60, 2);
    vehicle.applyEngineForce(force * 0.60, 3);

    const brakeForce = braking ? CAR_CONFIG.maxBrake : (Math.abs(targetThrottle) < 0.01 ? 1.8 : 0);
    for (let i = 0; i < 4; i++) {
      vehicle.setBrake(brakeForce, i);
    }
    state.braking = braking;

    accumulator = Math.min(accumulator + dt, FIXED_DT * 6);
    while (accumulator >= FIXED_DT) {
      world.step(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    // 同步车辆变换供渲染用
    for (let i = 0; i < 4; i++) {
      vehicle.updateWheelTransform(i);
    }

    // 同步可撞击测试块
    for (const p of dynamicProps) {
      p.mesh.position.copy(p.body.position);
      p.mesh.quaternion.copy(p.body.quaternion);
    }

    return {
      chassisPosition: chassisBody.position,
      chassisQuaternion: chassisBody.quaternion,
      speedKmHour: vehicle.currentVehicleSpeedKmHour,
      steeringAngle: state.currentSteer,
      isBraking: braking,
      gearRatio: state.gearRatio,
      wheels: vehicle.wheelInfos.map((w) => ({
        suspensionLength: w.suspensionLength,
        restLength: w.suspensionRestLength,
        maxTravel: w.maxSuspensionTravel,
        steering: w.steering,
        rotation: w.rotation,
        isInContact: w.isInContact,
        suspensionForce: w.suspensionForce
      }))
    };
  }

  resetVehicle(0.22);

  return {
    world,
    vehicle,
    chassisBody,
    state,
    step,
    resetVehicle,
    triggerDropTest,
    launchBumpRun,
    setSuspensionParams,
    setTireRadius,
    setVisible
  };
}

/**
 * 避震弹簧特写模式专用的单角 1/4 车物理振荡台（同样基于 cannon-es 刚体积分）。
 */
export function createSuspensionBenchSim() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
  const sprungMass = CAR_CONFIG.mass / 4; // 230 kg 单角簧上质量
  const body = new CANNON.Body({
    mass: sprungMass,
    position: new CANNON.Vec3(0, 0.26, 0),
    linearFactor: new CANNON.Vec3(0, 1, 0),
    angularFactor: new CANNON.Vec3(0, 0, 0)
  });
  world.addBody(body);

  const cfg = {
    stiffness: CAR_CONFIG.suspension.stiffness,
    damping: 2.8,
    restLength: CAR_CONFIG.suspension.restLength,
    manualPreload: 0 // 0 ~ 1 手动下压测试量
  };

  let roadHeight = 0;
  let pulseTimer = 0;

  function triggerImpact(strength = 2.4) {
    body.velocity.y = -strength;
    pulseTimer = 0.22;
  }

  function step(dt) {
    const stepDt = Math.min(dt, 0.05);
    if (pulseTimer > 0) {
      pulseTimer = Math.max(0, pulseTimer - stepDt);
      roadHeight = Math.sin((pulseTimer / 0.22) * Math.PI) * 0.09;
    } else {
      roadHeight = 0;
    }

    const currentLen = body.position.y - roadHeight;
    const compression = cfg.restLength - currentLen;
    if (compression > 0) {
      // 与 RaycastVehicle 一致：stiffness/damping 按整车质量归一化，保证单角台与整车刚度手感完全相同
      const springForce = cfg.stiffness * compression * CAR_CONFIG.mass;
      const damperForce = -cfg.damping * body.velocity.y * CAR_CONFIG.mass;
      const totalF = Math.max(0, springForce + damperForce);
      body.applyForce(new CANNON.Vec3(0, totalF, 0));
    }

    // 手动压缩滑块施压
    if (cfg.manualPreload > 0.001) {
      const targetY = roadHeight + cfg.restLength - cfg.manualPreload * 0.20;
      const diff = targetY - body.position.y;
      body.applyForce(new CANNON.Vec3(0, diff * 18000 - body.velocity.y * 1200, 0));
    }

    world.step(1 / 60, stepDt, 4);
    // 限位止挡（防止弹簧彻底拍穿）
    const minLen = cfg.restLength - CAR_CONFIG.suspension.maxTravel;
    if (body.position.y - roadHeight < minLen) {
      body.position.y = roadHeight + minLen;
      if (body.velocity.y < 0) body.velocity.y *= -0.15;
    }

    return {
      roadHeight,
      suspensionLength: Math.max(minLen, Math.min(cfg.restLength + 0.08, body.position.y - roadHeight)),
      restLength: cfg.restLength,
      velocityY: body.velocity.y
    };
  }

  return {
    cfg,
    triggerImpact,
    step
  };
}
