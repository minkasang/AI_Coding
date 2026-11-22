// R-35 / 03.37.01 单测：C-01 seed 映射与可读性算法。
// 跑：node --test viewer/experiments/wheel-end-visual-baseline-v1/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildC01Seed, readGlbNodeTranslations, linearToSrgbHex, srgbHexToLinear,
  PART_KEYS, KEY_PAIRS
} from '../c01-seed.mjs';
import {
  partStats, bySemantic, pairSeparation, armDelta, verdict, BACKGROUND
} from '../readability.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '../../../../cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f');
const manifest = JSON.parse(fs.readFileSync(path.join(PKG, 'manifest.json'), 'utf8'));
const glbBuf = fs.readFileSync(path.join(PKG, 'wheel-end.glb'));
const { translations, gltf } = readGlbNodeTranslations(
  glbBuf.buffer.slice(glbBuf.byteOffset, glbBuf.byteOffset + glbBuf.byteLength)
);

test('GLB 解析：9 个带 mesh 的节点、5 个网格定义、0 贴图', () => {
  assert.equal(Object.keys(translations).length, 9);
  assert.equal(gltf.meshes.length, 5);
  assert.equal((gltf.textures || []).length, 0);
});

test('GLB 原生 PBR：五个材质全部同一组 metalness/roughness', () => {
  const set = new Set(gltf.materials.map((m) => {
    const p = m.pbrMetallicRoughness || {};
    return `${p.metallicFactor}/${p.roughnessFactor}`;
  }));
  assert.equal(set.size, 1, '预期本资产只有一档原生 PBR');
  const [only] = [...set];
  assert.equal(only, '0.7200000286102295/0.3400000035762787');
});

test('seed：9 实例 / 9 catalog / 5 语义', () => {
  const { seed, count } = buildC01Seed(manifest, translations, '/x.glb');
  assert.equal(count.instances, 9);
  assert.equal(seed.catalog.length, 9);
  assert.equal(new Set(seed.catalog.map((c) => c.semantic)).size, 5);
  assert.deepEqual(new Set(seed.catalog.map((c) => c.semantic)),
    new Set(Object.values(PART_KEYS)));
});

test('seed：offset 等于 GLB 节点 translation（sync 会覆盖位移，必须一致）', () => {
  const { seed } = buildC01Seed(manifest, translations, '/x.glb');
  for (const inst of seed.assemblies[0].instances) {
    assert.deepEqual(inst.offset, translations[inst.instanceId], inst.instanceId);
  }
});

test('seed：颜色按 manifest displayColor 转换并可回读（误差 ≤ 1/255）', () => {
  const { seed } = buildC01Seed(manifest, translations, '/x.glb');
  for (const c of seed.catalog) {
    const back = srgbHexToLinear(c.color);
    c.linearColor.forEach((v, i) => {
      assert.ok(Math.abs(back[i] - v) <= 1 / 255 + 1e-9, `${c.partKey}[${i}] ${back[i]} vs ${v}`);
    });
  }
});

test('seed：五个语义颜色互不相同（否则可读性实验失效）', () => {
  const { seed } = buildC01Seed(manifest, translations, '/x.glb');
  const bySem = new Map();
  for (const c of seed.catalog) bySem.set(c.semantic, c.color);
  assert.equal(bySem.size, 5);
  assert.equal(new Set(bySem.values()).size, 5);
});

test('seed：未收录 partId 显式抛错，不静默兜底', () => {
  const bad = JSON.parse(JSON.stringify(manifest));
  bad.instances[0].partId = 'PART-99-999';
  assert.throws(() => buildC01Seed(bad, translations, '/x.glb'), /未收录的 partId/);
});

test('seed：缺节点位移显式抛错', () => {
  const partial = { ...translations };
  delete partial['PI-30-009-FL-03'];
  assert.throws(() => buildC01Seed(manifest, partial, '/x.glb'), /缺少可用节点位移/);
});

test('seed：实例 ID 重复显式抛错', () => {
  const bad = JSON.parse(JSON.stringify(manifest));
  bad.instances[1].partInstanceId = bad.instances[0].partInstanceId;
  assert.throws(() => buildC01Seed(bad, translations, '/x.glb'), /实例 ID 重复/);
});

test('linearToSrgbHex 边界：0 → #000000，1 → #ffffff', () => {
  assert.equal(linearToSrgbHex([0, 0, 0]), '#000000');
  assert.equal(linearToSrgbHex([1, 1, 1]), '#ffffff');
});

test('partStats：按分割图统计逐零件均值，背景不计入', () => {
  // 2x2 图：p1,p1,p2,背景
  const seg = [1, 1, 2, BACKGROUND];
  const luma = [10, 20, 100, 255];
  const { parts, modelPixels } = partStats(seg, luma, ['a', 'b']);
  assert.equal(modelPixels, 3);
  assert.equal(parts[0].meanLuma, 15);
  assert.equal(parts[1].meanLuma, 100);
  assert.equal(parts[0].pixels, 2);
  assert.equal(parts[1].pixels, 1);
});

test('partStats：缺失零件返回 null 而不是 0（不允许用 0 冒充暗）', () => {
  const { parts } = partStats([1, 0, 0, 0], [50, 0, 0, 0], ['a', 'b']);
  assert.equal(parts[0].meanLuma, 50);
  assert.equal(parts[1].meanLuma, null);
  assert.equal(parts[1].pixels, 0);
});

test('partStats：尺寸不一致与越界索引显式抛错', () => {
  assert.throws(() => partStats([1, 0], [1], ['a']), /尺寸不一致/);
  assert.throws(() => partStats([3, 0], [1, 1], ['a']), /越界零件索引/);
});

test('bySemantic：5 颗螺柱聚合成一个语义组，按像素加权', () => {
  const parts = [
    { key: 's1', pixels: 10, meanLuma: 100 },
    { key: 's2', pixels: 30, meanLuma: 140 },
    { key: 'h', pixels: 60, meanLuma: 200 }
  ];
  const sem = (k) => (k === 'h' ? 'hub' : 'stud');
  const groups = bySemantic(parts, sem);
  const stud = groups.find((g) => g.key === 'stud');
  assert.equal(stud.instances, 2);
  assert.equal(stud.pixels, 40);
  assert.equal(stud.meanLuma, 130); // (100*10 + 140*30)/40
});

test('verdict 阈值：≥12 DISTINCT，≥6 MARGINAL，其余 BLEND', () => {
  assert.equal(verdict(20), 'DISTINCT');
  assert.equal(verdict(12), 'DISTINCT');
  assert.equal(verdict(11.9), 'MARGINAL');
  assert.equal(verdict(6), 'MARGINAL');
  assert.equal(verdict(5.9), 'BLEND');
  assert.equal(verdict(null), 'UNKNOWN');
});

test('pairSeparation：缺失组给 null 与 UNKNOWN，不伪造数值', () => {
  const groups = [{ key: 'hub', meanLuma: 100 }, { key: 'stud', meanLuma: 130 }];
  const rows = pairSeparation(groups, [['hub', 'stud', 'x'], ['hub', 'knuckle', 'y']]);
  assert.equal(rows[0].deltaLuma, 30);
  assert.equal(rows[0].verdict, 'DISTINCT');
  assert.equal(rows[1].deltaLuma, null);
  assert.equal(rows[1].verdict, 'UNKNOWN');
});

test('armDelta：逐零件两臂亮度差，符号保留（B - A）', () => {
  const a = [{ key: 'x', meanLuma: 100 }];
  const b = [{ key: 'x', meanLuma: 103.5 }];
  const rows = armDelta(a, b);
  assert.equal(rows[0].deltaLuma, 3.5);
  assert.equal(rows[0].aLuma, 100);
  assert.equal(rows[0].bLuma, 103.5);
});

test('KEY_PAIRS 引用真实语义键', () => {
  const valid = new Set(Object.values(PART_KEYS));
  for (const [a, b] of KEY_PAIRS) {
    assert.ok(valid.has(a), '未知语义 a=' + a);
    assert.ok(valid.has(b), '未知语义 b=' + b);
    assert.notEqual(a, b);
  }
});
