// 最小 PNG 解码（8-bit、非隔行、colorType 2/6），只依赖 node:zlib。
// 用途：对 CDP 截图做像素级复算，让 verify.mjs 能从落盘 PNG 独立重算指标。
import zlib from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** @returns {{width:number,height:number,channels:number,data:Buffer}} data 为未滤波的原始通道数据 */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('不是 PNG');
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('只支持 8-bit PNG，实际 ' + bitDepth);
  if (interlace !== 0) throw new Error('不支持隔行 PNG');
  if (colorType !== 2 && colorType !== 6) throw new Error('只支持 RGB/RGBA PNG，实际 colorType=' + colorType);
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      else if (filter !== 0) throw new Error('未知 PNG 滤波类型 ' + filter);
      cur[x] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

export const lumaAt = (img, x, y) => {
  const i = (y * img.width + x) * img.channels;
  return 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
};

export const rgbAt = (img, x, y) => {
  const i = (y * img.width + x) * img.channels;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

/** 两图逐像素差超过阈值的位置集合（用于「选中高亮前后」差分取零件遮罩）。 */
export function diffMask(a, b, threshold = 6) {
  if (a.width !== b.width || a.height !== b.height) throw new Error('两图尺寸不一致');
  const n = a.width * a.height;
  const mask = new Uint8Array(n);
  let count = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * a.channels;
      const j = (y * b.width + x) * b.channels;
      const d = Math.abs(a.data[i] - b.data[j]) + Math.abs(a.data[i + 1] - b.data[j + 1]) +
        Math.abs(a.data[i + 2] - b.data[j + 2]);
      if (d > threshold) { mask[y * a.width + x] = 1; count++; }
    }
  }
  return { mask, count };
}

/** 在遮罩内统计亮度与质心（用于测量与「点击哪里」）。 */
export function maskStats(img, mask) {
  let sum = 0, count = 0, sx = 0, sy = 0;
  const n = img.width * img.height;
  for (let p = 0; p < n; p++) {
    if (!mask[p]) continue;
    const x = p % img.width, y = (p - x) / img.width;
    const L = lumaAt(img, x, y);
    sum += L; count++; sx += x; sy += y;
  }
  if (!count) return { pixels: 0, meanLuma: null, centroid: null };
  return {
    pixels: count,
    meanLuma: +(sum / count).toFixed(3),
    centroid: [+(sx / count).toFixed(1), +(sy / count).toFixed(1)]
  };
}

/** 全画面统计（排除与给定背景色接近的像素）。 */
export function frameStats(img, bg = [238, 243, 248], tol = 8) {
  let sum = 0, sumSq = 0, n = 0, nearWhite = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const [r, g, b] = rgbAt(img, x, y);
      if (Math.abs(r - bg[0]) < tol && Math.abs(g - bg[1]) < tol && Math.abs(b - bg[2]) < tol) continue;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += L; sumSq += L * L; n++;
      if (L >= 235) nearWhite++;
    }
  }
  if (!n) return { pixels: 0, meanLuma: 0, lumaStdDev: 0, nearWhiteRatio: 0 };
  const mean = sum / n;
  return {
    pixels: n,
    meanLuma: +mean.toFixed(3),
    lumaStdDev: +Math.sqrt(Math.max(0, sumSq / n - mean * mean)).toFixed(3),
    nearWhiteRatio: +(nearWhite / n).toFixed(6)
  };
}
