// R-24 观测工具：与 R-19 完全同口径，便于跨轮对照；另加取原始像素用于截图自检。
// 口径（报告与 README 引用本文件）：
//  - luma = 0.2126R + 0.7152G + 0.0722B，直接作用于 8-bit 显示编码值，
//    **不做 sRGB→linear 反变换**；只用于组间相对比较，不是物理亮度。
//  - clippedRatio：R/G/B 三通道均 ≥250 的像素比例（严格纯白裁切代理，本项目可能恒为 0）。
//  - nearWhiteRatio：luma ≥235 的像素比例（发白代理，受浅色背景污染，不可单独当过曝判据）。
//  - lumaStdDev：ROI 内亮度标准差，作为明暗层次代理，不是质感评分。
//  - 所有 ROI 由固定相机 + 同一场景可见包围盒投影算出，同视角组间一致。

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

  pixel(x, y) {
    const i = (y * this.width + x) * 4;
    const d = this.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }

  luma(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const [r, g, b] = this.pixel(x, y);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  clipped(x, y) {
    const [r, g, b] = this.pixel(x, y);
    return r >= 250 && g >= 250 && b >= 250;
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

/** 模型/零件 ROI：均值、标准差、高光比、近白比、裁切比、边缘梯度 */
export function regionStats(pb, rect) {
  const r = clampRect(pb, rect);
  let sum = 0, sumSq = 0, bright = 0, nearWhite = 0, clipped = 0, grad = 0, gradCount = 0, n = 0;
  for (let y = r.y; y < r.y1; y++) {
    for (let x = r.x; x < r.x1; x++) {
      const L = pb.luma(x, y);
      sum += L; sumSq += L * L;
      if (L >= 205) bright++;
      if (L >= 235) nearWhite++;
      if (pb.clipped(x, y)) clipped++;
      const rx = pb.luma(x + 1, y), dy = pb.luma(x, y + 1);
      if (rx !== null && dy !== null) {
        grad += Math.abs(rx - L) + Math.abs(dy - L);
        gradCount++;
      }
      n++;
    }
  }
  if (!n) return { meanLuma: 0, lumaStdDev: 0, highlightRatio: 0, nearWhiteRatio: 0, clippedRatio: 0, edgeGradient: 0, pixels: 0 };
  const mean = sum / n;
  return {
    meanLuma: +mean.toFixed(3),
    lumaStdDev: +Math.sqrt(Math.max(0, sumSq / n - mean * mean)).toFixed(3),
    highlightRatio: +(bright / n).toFixed(6),
    nearWhiteRatio: +(nearWhite / n).toFixed(6),
    clippedRatio: +(clipped / n).toFixed(6),
    edgeGradient: +(grad / Math.max(1, gradCount)).toFixed(4),
    pixels: n
  };
}

/** 接地接触带：逐列亮度剖面、左右不对称、中心/两侧亮度比 */
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
