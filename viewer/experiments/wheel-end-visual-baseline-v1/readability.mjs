/**
 * R-35 / 03.37.02 — 可读性计算（纯逻辑，不依赖 three / DOM）。
 *
 * 输入：一张「零件分割图」（每个像素属于哪个零件实例）+ 同一张外观图的亮度。
 * 输出：逐零件亮度统计与两两分离度。
 *
 * 为什么要分割图而不是逐零件隔离渲染：
 * 隔离渲染会去掉零件之间的相互遮挡与相互投影，测出的分离度是「上界」。
 * 分割图 + 同帧外观图，测的是真实共视条件下的表观亮度，才是零件「糊在一起」的判据。
 */

/** 分割图约定：0 = 背景，k>=1 = partOrder[k-1]。 */
export const BACKGROUND = 0;

/**
 * @param {Int32Array|number[]} seg 分割图（长度 = w*h）
 * @param {Float32Array|number[]} luma 每像素亮度（0-255）
 * @param {string[]} partOrder 索引 k-1 对应的零件键
 */
export function partStats(seg, luma, partOrder) {
  if (seg.length !== luma.length) throw new Error('分割图与亮度图尺寸不一致');
  if (!Array.isArray(partOrder) || partOrder.length === 0) throw new Error('partOrder 不能为空');

  const n = partOrder.length;
  const sum = new Float64Array(n);
  const sumSq = new Float64Array(n);
  const count = new Float64Array(n);
  let modelPixels = 0;

  for (let i = 0; i < seg.length; i++) {
    const k = seg[i];
    if (k === BACKGROUND) continue;
    const idx = k - 1;
    if (idx < 0 || idx >= n) throw new Error('分割图含越界零件索引：' + k);
    const L = luma[i];
    sum[idx] += L;
    sumSq[idx] += L * L;
    count[idx] += 1;
    modelPixels++;
  }

  const total = Math.max(1, modelPixels);
  const parts = partOrder.map((key, idx) => {
    const c = count[idx];
    if (!c) {
      return { key, pixels: 0, coverage: 0, meanLuma: null, lumaStdDev: null };
    }
    const mean = sum[idx] / c;
    const variance = Math.max(0, sumSq[idx] / c - mean * mean);
    return {
      key,
      pixels: c,
      coverage: +(c / total).toFixed(6),
      meanLuma: +mean.toFixed(3),
      lumaStdDev: +Math.sqrt(variance).toFixed(3)
    };
  });

  return { parts, modelPixels };
}

/** 按语义（不是按实例）聚合同一零件的多个实例，例如 5 颗螺柱。 */
export function bySemantic(parts, semanticOf) {
  const groups = new Map();
  for (const p of parts) {
    if (p.meanLuma === null) continue;
    const s = semanticOf(p.key);
    if (!groups.has(s)) groups.set(s, { key: s, pixels: 0, sum: 0, instances: 0 });
    const g = groups.get(s);
    g.pixels += p.pixels;
    g.sum += p.meanLuma * p.pixels;
    g.instances += 1;
  }
  return [...groups.values()].map((g) => ({
    key: g.key,
    instances: g.instances,
    pixels: g.pixels,
    meanLuma: +(g.sum / Math.max(1, g.pixels)).toFixed(3)
  }));
}

/**
 * 可读性判定阈值（0-255 亮度单位）。
 * 这是给演示样板用的工程经验阈值，不是感知标准（未做 CIEDE2000 / 未标定显示器）。
 */
export const DELTA_THRESHOLDS = Object.freeze({ distinct: 12, marginal: 6 });

export function verdict(deltaLuma) {
  if (deltaLuma === null || !Number.isFinite(deltaLuma)) return 'UNKNOWN';
  if (deltaLuma >= DELTA_THRESHOLDS.distinct) return 'DISTINCT';
  if (deltaLuma >= DELTA_THRESHOLDS.marginal) return 'MARGINAL';
  return 'BLEND';
}

/**
 * @param {Array<{key:string, meanLuma:number|null}>} groups 语义级分组
 * @param {ReadonlyArray<[string,string,string]>} pairs [a, b, 说明]
 */
export function pairSeparation(groups, pairs) {
  const map = new Map(groups.map((g) => [g.key, g]));
  return pairs.map(([a, b, note]) => {
    const A = map.get(a), B = map.get(b);
    const valid = A && B && A.meanLuma !== null && B.meanLuma !== null;
    const delta = valid ? +Math.abs(A.meanLuma - B.meanLuma).toFixed(3) : null;
    return {
      a, b, note,
      aLuma: A ? A.meanLuma : null,
      bLuma: B ? B.meanLuma : null,
      deltaLuma: delta,
      verdict: verdict(delta)
    };
  });
}

/** 两臂（A/B）在同一分割图下逐零件亮度差，用于证明材质改动是否为 no-op。 */
export function armDelta(partsA, partsB) {
  const mapB = new Map(partsB.map((p) => [p.key, p]));
  return partsA.map((a) => {
    const b = mapB.get(a.key);
    const d = b && a.meanLuma !== null && b.meanLuma !== null
      ? +(b.meanLuma - a.meanLuma).toFixed(3) : null;
    return { key: a.key, aLuma: a.meanLuma, bLuma: b ? b.meanLuma : null, deltaLuma: d };
  });
}
