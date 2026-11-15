// R-14 观测工具：像素级与法线级只读指标。
// 口径统一说明（报告 §指标口径 会引用本文件）：
//  - luma = 0.2126R + 0.7152G + 0.0722B，直接作用于 8-bit 显示编码值，
//    **不做 sRGB→linear 反变换**。它只用于四组之间的相对比较，不是物理亮度。
//  - 所有 ROI 四组完全相同，由固定相机投影计算，不随画面内容自适应。
//  - 法线方向量化到 0.02 粒度（round(n*50)），用于衡量"法线是否连续"，不是几何精度指标。

export class PixelBuffer {
  constructor(sourceCanvas, width, height) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(sourceCanvas, 0, 0, width, height);
    this.width = width;
    this.height = height;
    this.data = ctx.getImageData(0, 0, width, height).data;
  }

  luma(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const i = (y * this.width + x) * 4;
    const d = this.data;
    return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  }
}

function clampRect(pb, r) {
  return {
    x: Math.max(0, Math.min(pb.width - 1, Math.floor(r.x))),
    y: Math.max(0, Math.min(pb.height - 1, Math.floor(r.y))),
    x1: Math.max(0, Math.min(pb.width, Math.ceil(r.x + r.w))),
    y1: Math.max(0, Math.min(pb.height, Math.ceil(r.y + r.h)))
  };
}

/** 轮辋 ROI：平均亮度、高光像素占比、边缘梯度能量 */
export function regionStats(pb, rect) {
  const r = clampRect(pb, rect);
  let sum = 0, bright = 0, grad = 0, gradCount = 0, n = 0;
  for (let y = r.y; y < r.y1; y++) {
    for (let x = r.x; x < r.x1; x++) {
      const L = pb.luma(x, y);
      sum += L;
      if (L >= 205) bright++;
      const rx = pb.luma(x + 1, y), dy = pb.luma(x, y + 1);
      if (rx !== null && dy !== null) {
        grad += Math.abs(rx - L) + Math.abs(dy - L);
        gradCount++;
      }
      n++;
    }
  }
  if (!n) return { meanLuma: 0, highlightRatio: 0, edgeGradient: 0, pixels: 0 };
  return {
    meanLuma: +(sum / n).toFixed(3),
    highlightRatio: +(bright / n).toFixed(6),
    edgeGradient: +(grad / Math.max(1, gradCount)).toFixed(4),
    pixels: n
  };
}

/** 接地接触带：逐列亮度剖面、左右不对称度、中心/两侧亮度比 */
export function contactStats(pb, rect, bins = 32) {
  const r = clampRect(pb, rect);
  const width = Math.max(1, r.x1 - r.x);
  const sums = new Array(bins).fill(0);
  const counts = new Array(bins).fill(0);
  for (let y = r.y; y < r.y1; y++) {
    for (let x = r.x; x < r.x1; x++) {
      const b = Math.min(bins - 1, Math.floor(((x - r.x) / width) * bins));
      sums[b] += pb.luma(x, y);
      counts[b]++;
    }
  }
  const profile = sums.map((s, i) => +(counts[i] ? s / counts[i] : 0).toFixed(2));
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const third = Math.max(1, Math.floor(bins / 3));
  const left = avg(profile.slice(0, third));
  const right = avg(profile.slice(bins - third));
  const center = avg(profile.slice(third, bins - third));
  const edge = (left + right) / 2;
  return {
    profile,
    asymmetry: +(left - right).toFixed(3),
    centerEdgeRatio: +(edge > 0 ? center / edge : 0).toFixed(4),
    edgeMean: +edge.toFixed(2),
    centerMean: +center.toFixed(2),
    minLuma: +Math.min(...profile).toFixed(2),
    maxLuma: +Math.max(...profile).toFixed(2),
    rect: { x: r.x, y: r.y, w: r.x1 - r.x, h: r.y1 - r.y }
  };
}

/** 几何法线方向分布：唯一方向数 + 香农熵，用于证明 N 变量确实只改了法线 */
export function geometryNormalStats(geometries) {
  const hist = new Map();
  let meshes = 0, vertices = 0, triangles = 0, normals = 0;
  for (const g of geometries) {
    if (!g || !g.attributes) continue;
    meshes++;
    const pos = g.attributes.position;
    if (!pos) continue;
    vertices += pos.count;
    triangles += (g.index ? g.index.count : pos.count) / 3;
    const nrm = g.attributes.normal;
    if (!nrm) continue;
    for (let i = 0; i < nrm.count; i++) {
      const key = `${Math.round(nrm.getX(i) * 50)},${Math.round(nrm.getY(i) * 50)},${Math.round(nrm.getZ(i) * 50)}`;
      hist.set(key, (hist.get(key) || 0) + 1);
      normals++;
    }
  }
  let entropy = 0;
  for (const c of hist.values()) {
    const p = c / Math.max(1, normals);
    entropy -= p * Math.log2(p);
  }
  return {
    meshes, vertices, triangles,
    normalsSampled: normals,
    uniqueNormals: hist.size,
    normalEntropy: +entropy.toFixed(4)
  };
}
