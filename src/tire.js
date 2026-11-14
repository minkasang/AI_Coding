import * as THREE from 'three';
import { deriveDimensions } from './specs.js';
import { getEngineeredRimAssets, assembleEngineeredRim, getRotorTexture } from './parts/wheelRim.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 非索引三角汤：每个三角独立顶点 -> computeVertexNormals 自动得到硬边（花纹块需要硬朗的棱）
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

// LatheGeometry 绕 Y 轴生成后 rotateX(PI/2)：点变成 (r·sin a, -r·cos a, z)
// 花纹块必须沿用同一套参数化，才能严丝合缝地贴在胎体上
const radial = (a, z, r) => [r * Math.sin(a), -r * Math.cos(a), z];

// 胎面基部半径：中间略鼓（胎冠弧度），越过肩部后沿胎侧下降
function surfaceRadius(d, z) {
  const az = Math.abs(z);
  const s = d.shoulder;
  if (az <= s) return d.baseRadius - d.crown * Math.pow(az / s, 2);
  const t = clamp((az - s) / (d.halfWidth * 1.20 - s), 0, 1);
  return d.baseRadius - d.crown - d.sidewallHeight * 0.30 * t * t;
}

// ---------------------------------------------------------------- 胎体
function buildCasing(d) {
  const pts = [];
  const hw = d.halfWidth;
  const s = d.shoulder;
  const rr = d.rimRadius;
  const rShoulder = surfaceRadius(d, s * 1.06);
  const beadZRatio = clamp((d.rimHalfWidth - 0.004) / hw, 0.72, 0.90);

  // [半径进度 u, 轴向位置 / halfWidth]：胎圈端严格落入轮辋 5° 胎圈座，随后外鼓形成饱满胎侧
  const side = [
    [0.00, beadZRatio], [0.08, Math.min(0.92, beadZRatio + 0.025)], [0.22, 0.96], [0.42, 1.00],
    [0.62, 0.97], [0.80, 0.90], [0.92, 0.84], [1.00, (s * 1.06) / hw]
  ];
  const radialAt = (u) => rr + (rShoulder - rr) * (0.5 - 0.5 * Math.cos(Math.PI * u));

  for (const [u, zf] of side) pts.push(new THREE.Vector2(radialAt(u), -zf * hw));

  const treadZ = [-1.0, -0.85, -0.6, -0.3, 0, 0.3, 0.6, 0.85, 1.0, 1.06];
  for (const k of treadZ) {
    const z = k * s;
    pts.push(new THREE.Vector2(surfaceRadius(d, z), z));
  }

  for (let i = side.length - 2; i >= 0; i--) {
    const [u, zf] = side[i];
    pts.push(new THREE.Vector2(radialAt(u), zf * hw));
  }

  return new THREE.LatheGeometry(pts, 160).rotateX(Math.PI / 2);
}

// ---------------------------------------------------------------- 胎面花纹
function addBlock(soup, d, z0, z1, startA, endA) {
  const eps = 0.0009;
  const r0 = surfaceRadius(d, z0) - eps;
  const r1 = surfaceRadius(d, z1) - eps;

  const B = [
    radial(startA(z0), z0, r0), radial(endA(z0), z0, r0),
    radial(endA(z1), z1, r1), radial(startA(z1), z1, r1)
  ];

  // 顶面比底面收一圈 -> 块边缘形成倒角斜面，光下能读出每一块的体积
  const chamferA = (endA(0) - startA(0)) * 0.075;
  const cz = Math.min((z1 - z0) * 0.09, 0.0015);
  const tz0 = z0 + cz;
  const tz1 = z1 - cz;
  const top0 = surfaceRadius(d, tz0) + d.treadDepth;
  const top1 = surfaceRadius(d, tz1) + d.treadDepth;

  const T = [
    radial(startA(tz0) + chamferA, tz0, top0), radial(endA(tz0) - chamferA, tz0, top0),
    radial(endA(tz1) - chamferA, tz1, top1), radial(startA(tz1) + chamferA, tz1, top1)
  ];

  soup.quad(T[0], T[1], T[2], T[3]);   // 顶面
  soup.quad(B[3], B[2], B[1], B[0]);   // 底面
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    soup.quad(B[i], B[j], T[j], T[i]); // 四个侧壁
  }
}

function buildTread(d, spec) {
  const soup = new TriSoup();
  const { pitches, columns, stagger = 0, jitter = 0.06 } = spec.pattern;
  const step = TAU / pitches;

  for (let ci = 0; ci < columns.length; ci++) {
    const c = columns[ci];
    const z0 = c.z0 * d.shoulder;
    const z1 = c.z1 * d.shoulder;
    const phase = ((c.phase || 0) + (ci % 2 ? stagger : 0)) * step;

    for (let p = 0; p < pitches; p++) {
      // 伪随机不等节距：真实轮胎用来打散花纹噪声的共振
      const n = Math.sin(p * 12.9898 + ci * 78.233) * 43758.5453;
      const j = (n - Math.floor(n) - 0.5) * step * jitter;
      const center = p * step + phase + j;
      const half = step * c.fill * 0.5;

      // skew：斜向花纹；v：中央偏移形成 V 形人字花纹
      const shift = (z) => {
        const zn = z / d.shoulder;
        return (c.skew * zn + (c.v || 0) * (1 - Math.abs(zn))) * step;
      };
      const A0 = (z) => center - half + shift(z);
      const A1 = (z) => center + half + shift(z);

      // 刀槽 sipes：把一个花纹块切成数片，中间留 1mm 左右的细缝
      const nSipes = c.sipes || 1;
      const gap = Math.min(0.0011 / d.outerRadius, (half * 2) * 0.05 / nSipes);
      for (let k = 0; k < nSipes; k++) {
        const f0 = k / nSipes;
        const f1 = (k + 1) / nSipes;
        const S = (z) => A0(z) + (A1(z) - A0(z)) * f0 + (k > 0 ? gap / 2 : 0);
        const E = (z) => A0(z) + (A1(z) - A0(z)) * f1 - (k < nSipes - 1 ? gap / 2 : 0);
        addBlock(soup, d, z0, z1, S, E);
      }
    }
  }
  return soup.geometry();
}

// ---------------------------------------------------------------- 胎侧凸字
function arcText(ctx, S, text, radiusPx, fontSize, color, opts = {}) {
  const dir = opts.dir || 1;
  const chars = [...text];
  const list = dir === 1 ? chars : [...chars].reverse();
  const track = opts.track || (fontSize * 1.12 / radiusPx);
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.font = `${opts.weight || 700} ${fontSize}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let a = -(list.length - 1) * track / 2 + (opts.centerAngle || 0);
  for (const ch of list) {
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, dir === 1 ? -radiusPx : radiusPx);
    if (dir === -1) ctx.rotate(Math.PI);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += track;
  }
  ctx.restore();
}

function makeSidewallTexture(spec, d, mirrored) {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  if (mirrored) { ctx.translate(S, 0); ctx.scale(-1, 1); }

  const rTex = d.baseRadius * 0.94;               // 贴图覆盖的最大半径
  const px = (r) => (r / (2 * rTex)) * S;
  const rA = d.rimRadius * 1.10;
  const rB = rTex * 0.96;
  const bandPx = px(rB) - px(rA);
  const rMid = px(rA + (rB - rA) * 0.50);
  const base = clamp(bandPx * 0.50, 19, 72);

  const main = spec.letterColor;
  const sub = spec.letterColor.replace(/[\d.]+\)$/, '0.55)');

  arcText(ctx, S, spec.brand, rMid, base * 1.30, main, {
    track: (base * 1.30 * 1.65) / rMid, weight: 800, centerAngle: 0
  });
  arcText(ctx, S, `${spec.spec}   ${spec.model}`, rMid, base * 0.60, sub, {
    track: (base * 0.60 * 1.18) / rMid, dir: -1, weight: 600, centerAngle: 0
  });

  if (bandPx > 105) {
    arcText(ctx, S, 'RADIAL  TUBELESS  ·  STEEL BELTED', px(rA + (rB - rA) * 0.16), base * 0.36, sub, {
      track: (base * 0.36 * 1.10) / px(rA + (rB - rA) * 0.16), dir: -1, weight: 500, centerAngle: 0.55
    });
    arcText(ctx, S, 'MADE FOR REAL ROADS', px(rA + (rB - rA) * 0.84), base * 0.36, sub, {
      track: (base * 0.36 * 1.10) / px(rA + (rB - rA) * 0.84), weight: 500, centerAngle: -0.55
    });
  }

  // 单导向胎的旋转方向标记
  if (spec.id === 'winter') {
    const r = px(rA + (rB - rA) * 0.80);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(1.05);
    ctx.translate(0, -r);
    ctx.fillStyle = main;
    ctx.beginPath();
    ctx.moveTo(-base * 0.5, -base * 0.18);
    ctx.lineTo(base * 0.20, -base * 0.18);
    ctx.lineTo(base * 0.20, -base * 0.38);
    ctx.lineTo(base * 0.62, 0);
    ctx.lineTo(base * 0.20, base * 0.38);
    ctx.lineTo(base * 0.20, base * 0.18);
    ctx.lineTo(-base * 0.5, base * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// 贴合鼓起胎侧的环形网格（uv 为平面圆映射，正好对上 canvas 上的环形文字）
function sidewallOverlay(d, sign) {
  const r0 = d.rimRadius * 1.055;
  const r1 = d.baseRadius * 0.94;
  const nu = 160, nv = 12;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    const r = r0 + (r1 - r0) * (j / nv);
    const u = clamp((r - d.rimRadius) / (d.baseRadius - d.rimRadius), 0, 1);
    const z = sign * (d.halfWidth * (0.88 + 0.12 * Math.sin(Math.PI * u)) + 0.0030);
    for (let i = 0; i <= nu; i++) {
      const a = (i / nu) * TAU;
      const x = r * Math.sin(a), y = -r * Math.cos(a);
      pos.push(x, y, z);
      uv.push(0.5 + x / (2 * r1), 0.5 + y / (2 * r1));
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, e = c + 1;
      idx.push(a, b, e, a, e, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- 轮辋
function makeCenterCapTexture(spec) {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#2b2e33';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = spec.accent;
  ctx.lineWidth = 9;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.36, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#e9eaec';
  ctx.font = '700 54px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(spec.brand[0], S / 2, S / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const SPEC_ASSET_CACHE = new Map();

function getSpecAssets(spec) {
  let cached = SPEC_ASSET_CACHE.get(spec.id);
  if (cached) return cached;
  const d = deriveDimensions(spec);
  const rimAssets = getEngineeredRimAssets(spec, d);
  d.brakeDiscZ = rimAssets.brakeDiscZ;
  d.rotorOuterR = rimAssets.rotorOuterR;

  cached = {
    dimensions: d,
    casingGeo: buildCasing(d),
    linerGeo: new THREE.CylinderGeometry(d.rimRadius * 0.985, d.rimRadius * 0.985, d.rimHalfWidth * 1.85, 64, 1, true)
      .rotateX(Math.PI / 2),
    treadGeo: buildTread(d, spec),
    decoRings: [-1, 1].flatMap((sign) =>
      [[0.86, 0.0016], [0.94, 0.0012]].map(([rf, tube]) => {
        const r = d.rimRadius + (d.baseRadius - d.rimRadius) * rf;
        const z = sign * (d.halfWidth * (0.88 + 0.12 * Math.sin(Math.PI * rf)) + 0.0018);
        return { geo: new THREE.TorusGeometry(r, tube, 6, 128), z };
      })
    ),
    sidewalls: [-1, 1].map((sign) => ({
      sign,
      geo: sidewallOverlay(d, sign),
      tex: makeSidewallTexture(spec, d, sign < 0)
    })),
    capTex: makeCenterCapTexture(spec),
    rimAssets
  };
  SPEC_ASSET_CACHE.set(spec.id, cached);
  return cached;
}

// ---------------------------------------------------------------- 主入口
export function createTire(spec) {
  const assets = getSpecAssets(spec);
  const d = assets.dimensions;
  const root = new THREE.Group();
  const spin = new THREE.Group();
  const tireGroup = new THREE.Group();
  root.add(spin);
  spin.add(tireGroup);

  const mkPhysical = (o) => new THREE.MeshPhysicalMaterial({
    side: THREE.DoubleSide, ...o
  });

  const mats = {
    casing: mkPhysical({
      color: spec.rubber.casing, roughness: spec.rubber.roughness,
      metalness: 0.0, clearcoat: 0.06, clearcoatRoughness: 0.6,
      sheen: 0.35, sheenRoughness: 0.85, sheenColor: new THREE.Color(0x3a3d42),
      envMapIntensity: 0.85
    }),
    tread: mkPhysical({
      color: spec.rubber.tread, roughness: Math.max(0.68, spec.rubber.roughness - 0.06),
      metalness: 0.0, clearcoat: spec.rubber.clearcoat, clearcoatRoughness: 0.42,
      envMapIntensity: 1.0
    }),
    treadHi: mkPhysical({
      color: 0x4a5058, roughness: 0.52, metalness: 0.05,
      clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 1.25
    }),
    liner: new THREE.MeshStandardMaterial({
      color: 0x0d0e10, roughness: 0.95, side: THREE.DoubleSide
    }),
    rim: new THREE.MeshPhysicalMaterial({
      color: spec.rimStyle.color, metalness: spec.rimStyle.metalness,
      roughness: spec.rimStyle.roughness, clearcoat: 0.42,
      clearcoatRoughness: 0.16, envMapIntensity: 1.9, side: THREE.DoubleSide
    }),
    rimLight: new THREE.MeshStandardMaterial({
      color: spec.rimStyle.flangeColor || 0xdfe3e8, metalness: 1, roughness: 0.14, envMapIntensity: 2.1
    }),
    beadlock: new THREE.MeshStandardMaterial({
      color: spec.rimStyle.flangeColor || 0xb28a4f, metalness: 0.82, roughness: 0.28, envMapIntensity: 1.6
    }),
    bolt: new THREE.MeshStandardMaterial({
      color: 0xd0d4da, metalness: 1, roughness: 0.22, envMapIntensity: 1.8
    }),
    brake: new THREE.MeshStandardMaterial({
      color: 0x46494f, metalness: 0.85, roughness: 0.58
    }),
    rotor: new THREE.MeshStandardMaterial({
      map: getRotorTexture(), metalness: 0.86, roughness: 0.38, envMapIntensity: 1.3
    }),
    brakeHat: new THREE.MeshStandardMaterial({
      color: 0x262930, metalness: 0.72, roughness: 0.42
    }),
    brakeHole: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.9 }),
    valveCap: new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.7 }),
    accent: new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.accent), metalness: 0.55, roughness: 0.35
    }),
    capFace: new THREE.MeshStandardMaterial({
      map: assets.capTex, metalness: 0.5, roughness: 0.35
    })
  };

  // 胎体
  const casing = new THREE.Mesh(assets.casingGeo, mats.casing);
  casing.castShadow = true;
  casing.receiveShadow = true;
  tireGroup.add(casing);

  // 内衬（仅在隐藏轮毂时显示，避免穿插真实深槽轮辋）
  const liner = new THREE.Mesh(assets.linerGeo, mats.liner);
  liner.visible = false;
  tireGroup.add(liner);

  // 胎侧细装饰棱
  for (const rInfo of assets.decoRings) {
    const ring = new THREE.Mesh(rInfo.geo, mats.casing);
    ring.position.z = rInfo.z;
    tireGroup.add(ring);
  }

  // 实体花纹
  const treadMesh = new THREE.Mesh(assets.treadGeo, mats.tread);
  treadMesh.castShadow = true;
  treadMesh.receiveShadow = true;
  tireGroup.add(treadMesh);

  // 胎侧字（两侧，背面镜像）
  for (const sw of assets.sidewalls) {
    const letterMat = new THREE.MeshStandardMaterial({
      map: sw.tex,
      transparent: true, depthWrite: false, roughness: 0.92, metalness: 0.0,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    tireGroup.add(new THREE.Mesh(sw.geo, letterMat));
  }

  const rimGroup = assembleEngineeredRim(spec, d, mats, assets.rimAssets);
  spin.add(rimGroup);

  root.userData.spec = spec;
  return {
    root, spin, tireGroup, liner, treadMesh, rimGroup,
    dimensions: d, materials: mats, spec
  };
}
