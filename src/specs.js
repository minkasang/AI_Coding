// 轮胎规格库 —— 尺寸全部按真实毫米 / 英寸定义，场景里 1 单位 = 1 米。
// 规格写法：断面宽(mm) / 扁平比(%) R 轮辋直径(inch)
// 胎侧高 = 断面宽 × 扁平比；外径 = 轮辋直径 × 25.4 + 2 × 胎侧高

export const TIRE_SPECS = [
  {
    id: 'uhp',
    name: '非对称高性能夏季胎',
    category: 'UHP · SUMMER',
    spec: '245/35 R20',
    brand: 'VULCAN',
    model: 'APEX SPORT',
    width: 245,
    aspect: 35,
    rimInch: 20,
    usage: '运动轿车 / 干湿地高抓地',
    patternName: '非对称 · 四条主纵沟',
    accent: '#c8563c',
    accentDark: '#8d3a28',
    treadDepth: 0.0072,
    crown: 0.0032,
    shoulderRatio: 0.78,
    letterColor: 'rgba(226,230,234,0.82)',
    rubber: {
      casing: 0x17191c,
      tread: 0x202226,
      roughness: 0.80,
      clearcoat: 0.18
    },
    rimStyle: {
      color: 0x4f555f,
      roughness: 0.20,
      metalness: 0.96,
      widthInch: 8.5,
      contour: 'J',
      etMm: 35,
      bolts: 5,
      pcdMm: 114.3,
      centerBoreMm: 67.1,
      spokeType: 'y-spoke',
      groups: 5,
      spokes: 10,
      spokeWidth: 0.052,
      flangeColor: 0xdce1e8
    },
    pattern: {
      pitches: 54,
      stagger: 0.5,
      columns: [
        { z0: -1.00, z1: -0.74, skew: -0.30, v: 0.00, fill: 0.80, sipes: 1, phase: 0.00 },
        { z0: -0.66, z1: -0.32, skew: -0.36, v: 0.00, fill: 0.86, sipes: 2, phase: 0.50 },
        { z0: -0.25, z1:  0.25, skew:  0.34, v: 0.00, fill: 0.90, sipes: 2, phase: 0.00 },
        { z0:  0.32, z1:  0.66, skew:  0.26, v: 0.00, fill: 0.86, sipes: 2, phase: 0.50 },
        { z0:  0.74, z1:  1.00, skew:  0.30, v: 0.00, fill: 0.80, sipes: 1, phase: 0.00 }
      ]
    },
    highlights: ['扁平比仅 35%，胎侧极薄', '外侧大块肩部提升过弯支撑', '内侧细密刀槽负责排水']
  },
  {
    id: 'touring',
    name: '对称舒适节能公路胎',
    category: 'TOURING · ALL SEASON',
    spec: '205/55 R16',
    brand: 'AURA',
    model: 'QUIET CRUISE',
    width: 205,
    aspect: 55,
    rimInch: 16,
    usage: '家用轿车 / 低滚阻静音',
    patternName: '对称 · 五肋条细密花纹',
    accent: '#3f7f86',
    accentDark: '#2c5b60',
    treadDepth: 0.0080,
    crown: 0.0038,
    shoulderRatio: 0.74,
    letterColor: 'rgba(220,224,228,0.70)',
    rubber: {
      casing: 0x1a1b1e,
      tread: 0x222428,
      roughness: 0.86,
      clearcoat: 0.10
    },
    rimStyle: {
      color: 0xbac0c8,
      roughness: 0.24,
      metalness: 0.94,
      widthInch: 6.5,
      contour: 'J',
      etMm: 42,
      bolts: 5,
      pcdMm: 112.0,
      centerBoreMm: 66.6,
      spokeType: 'twin-spoke',
      groups: 5,
      spokes: 10,
      spokeWidth: 0.068,
      flangeColor: 0xe3e7ed
    },
    pattern: {
      pitches: 72,
      stagger: 0.5,
      columns: [
        { z0: -1.00, z1: -0.76, skew: -0.12, v: 0.00, fill: 0.72, sipes: 3, phase: 0.00 },
        { z0: -0.69, z1: -0.42, skew: -0.16, v: 0.00, fill: 0.74, sipes: 3, phase: 0.50 },
        { z0: -0.35, z1:  0.35, skew:  0.10, v: 0.00, fill: 0.78, sipes: 3, phase: 0.00 },
        { z0:  0.42, z1:  0.69, skew:  0.16, v: 0.00, fill: 0.74, sipes: 3, phase: 0.50 },
        { z0:  0.76, z1:  1.00, skew:  0.12, v: 0.00, fill: 0.72, sipes: 3, phase: 0.00 }
      ]
    },
    highlights: ['55% 扁平比，兼顾舒适与操控', '不等节距打散胎噪频率', '高密度刀槽提升湿滑路面抓地']
  },
  {
    id: 'winter',
    name: '单导向冬季雪地胎',
    category: 'WINTER · STUDLESS',
    spec: '225/50 R17',
    brand: 'NORDIC',
    model: 'FROST GRIP',
    width: 225,
    aspect: 50,
    rimInch: 17,
    usage: '冰雪路面 / 低温软胶配方',
    patternName: 'V 形人字 · 高密度刀槽',
    accent: '#4a6fa5',
    accentDark: '#324d75',
    treadDepth: 0.0092,
    crown: 0.0030,
    shoulderRatio: 0.76,
    letterColor: 'rgba(214,224,236,0.78)',
    rubber: {
      casing: 0x1b1e22,
      tread: 0x262a2f,
      roughness: 0.76,
      clearcoat: 0.22
    },
    rimStyle: {
      color: 0x868e9a,
      roughness: 0.28,
      metalness: 0.92,
      widthInch: 7.5,
      contour: 'J',
      etMm: 38,
      bolts: 5,
      pcdMm: 114.3,
      centerBoreMm: 67.1,
      spokeType: 'y-spoke',
      groups: 6,
      spokes: 12,
      spokeWidth: 0.044,
      flangeColor: 0xd6dce4
    },
    pattern: {
      pitches: 38,
      stagger: 0.0,
      columns: [
        { z0: -1.00, z1: -0.56, skew:  0.32, v: 0.62, fill: 0.76, sipes: 4, phase: 0.00 },
        { z0: -0.49, z1:  0.00, skew:  0.16, v: 0.62, fill: 0.74, sipes: 4, phase: 0.00 },
        { z0:  0.00, z1:  0.49, skew: -0.16, v: 0.62, fill: 0.74, sipes: 4, phase: 0.00 },
        { z0:  0.56, z1:  1.00, skew: -0.32, v: 0.62, fill: 0.76, sipes: 4, phase: 0.00 }
      ]
    },
    highlights: ['50% 扁平比，厚胎侧吸收冲击', 'V 形主沟把雪水向两侧排出', '每块 4 条刀槽制造咬雪边缘']
  },
  {
    id: 'at',
    name: '全地形越野胎',
    category: 'ALL TERRAIN · A/T',
    spec: '265/70 R17',
    brand: 'TERRA',
    model: 'RIDGE A/T',
    width: 265,
    aspect: 70,
    rimInch: 17,
    usage: '越野 / 砂石泥地 / 高承载',
    patternName: '大块花纹 · 肩部外扩凸块',
    accent: '#a2762f',
    accentDark: '#75521e',
    treadDepth: 0.0118,
    crown: 0.0020,
    shoulderRatio: 0.72,
    letterColor: 'rgba(238,236,228,0.92)',
    rubber: {
      casing: 0x191a1c,
      tread: 0x252628,
      roughness: 0.90,
      clearcoat: 0.06
    },
    rimStyle: {
      color: 0x33373d,
      roughness: 0.38,
      metalness: 0.85,
      widthInch: 8.5,
      contour: 'JJ',
      etMm: 10,
      bolts: 6,
      pcdMm: 139.7,
      centerBoreMm: 106.1,
      spokeType: 'beadlock',
      groups: 6,
      spokes: 6,
      spokeWidth: 0.095,
      flangeColor: 0xb28a4f
    },
    pattern: {
      pitches: 26,
      stagger: 0.5,
      columns: [
        { z0: -1.40, z1: -0.82, skew:  0.38, v: 0.00, fill: 0.62, sipes: 1, phase: 0.00, lug: true },
        { z0: -0.72, z1: -0.12, skew:  0.28, v: 0.00, fill: 0.60, sipes: 2, phase: 0.50 },
        { z0:  0.12, z1:  0.72, skew: -0.28, v: 0.00, fill: 0.60, sipes: 2, phase: 0.50 },
        { z0:  0.82, z1:  1.40, skew: -0.38, v: 0.00, fill: 0.62, sipes: 1, phase: 0.00, lug: true }
      ]
    },
    highlights: ['70% 高扁平比，胎侧厚、形变大', '独立大块 + 宽沟，自增洁排泥', '肩部凸块爬上胎侧，护壁并咬岩']
  }
];

// 由规格推导出真实几何尺寸（单位：米）
export function deriveDimensions(spec) {
  const sectionWidth = spec.width / 1000;
  const halfWidth = sectionWidth / 2;
  const sidewallHeight = sectionWidth * (spec.aspect / 100);
  const rimRadius = (spec.rimInch * 0.0254) / 2;
  const outerRadius = rimRadius + sidewallHeight;
  const shoulder = halfWidth * spec.shoulderRatio;
  const baseRadius = outerRadius - spec.treadDepth;

  const rimWidth = (spec.rimStyle.widthInch || (spec.width / 25.4) * 0.82) * 0.0254;
  const rimHalfWidth = rimWidth / 2;
  const etOffset = (spec.rimStyle.etMm || 35) / 1000;
  const pcdRadius = ((spec.rimStyle.pcdMm || 114.3) / 1000) / 2;
  const centerBoreRadius = ((spec.rimStyle.centerBoreMm || 67.1) / 1000) / 2;

  return {
    sectionWidth,
    halfWidth,
    sidewallHeight,
    rimRadius,
    rimWidth,
    rimHalfWidth,
    etOffset,
    pcdRadius,
    centerBoreRadius,
    outerRadius,
    shoulder,
    baseRadius,      // 胎面基部半径（花纹块从这里长出来）
    crown: spec.crown,
    treadDepth: spec.treadDepth,
    outerDiameter: outerRadius * 2
  };
}

// 整车工程底盘默认物理参数（单位：米 / 千克 / 牛）
export const CAR_CONFIG = {
  mass: 920,
  wheelbase: 2.46,
  halfTrack: 0.84,
  chassisConnY: 0.08,
  suspension: {
    stiffness: 32,
    dampingCompression: 2.4,
    dampingRelaxation: 3.2,
    restLength: 0.34,
    maxTravel: 0.22,
    frictionSlip: 3.2,
    rollInfluence: 0.14
  },
  maxSteer: 0.50,
  maxForce: 2800,
  maxBrake: 42
};

// 变速箱档位比（用于传动链与齿轮组转速联动演示）
export const GEAR_RATIOS = [
  { id: '1', label: '1 档 · 爬坡', ratio: 3.40, diff: 3.73 },
  { id: '2', label: '2 档 · 加速', ratio: 2.10, diff: 3.73 },
  { id: '3', label: '3 档 · 巡航', ratio: 1.35, diff: 3.73 },
  { id: 'R', label: 'R 档 · 倒车', ratio: -3.10, diff: 3.73 }
];

export const STUDIO_MODES = [
  { id: 'vehicle', label: '整车物理试验台', short: '整车试验台', subtitle: 'Cannon-es 3D 物理 · 四轮悬架与机械传动联动' },
  { id: 'tire', label: '轮胎总成特写', short: '轮胎特写', subtitle: '四种规格 · 真实高宽比 · 可直接装配到整车' },
  { id: 'suspension', label: '避震弹簧特写', short: '避震弹簧', subtitle: '胡克定律阻尼器 · 恒定线径螺旋弹簧实时形变' },
  { id: 'drivetrain', label: '机械传动特写', short: '齿轮传动', subtitle: '齿轮啮合比 · 差速器 · 万向节半轴随动演示' }
];
