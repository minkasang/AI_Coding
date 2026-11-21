// R-30 · 从生产 viewport 保留的 GLB 模板节点读取原生 PBR 数值。
// 与 R-24 render-staging-v1/staging-config.mjs 中的同名逻辑保持一致，
// 抽出为独立模块是为了让 adapter 与单测都能复用，且不依赖 three。
export function readGlbNativePbr(templates, seed) {
  if (!templates || typeof templates.get !== 'function') {
    throw new Error('readGlbNativePbr 需要 viewport.templates（Map）');
  }
  if (!seed || !Array.isArray(seed.catalog)) {
    throw new Error('readGlbNativePbr 需要含 catalog 的工程 seed');
  }
  const out = {};
  for (const part of seed.catalog) {
    const src = templates.get(part.partKey);
    if (!src) throw new Error('GLB 模板缺少 ' + part.partKey);
    const values = [];
    src.traverse((node) => {
      if (!node.isMesh) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        values.push({
          name: mat?.name || '(none)',
          metalness: +Number(mat?.metalness ?? 0).toFixed(4),
          roughness: +Number(mat?.roughness ?? 0).toFixed(4)
        });
      }
    });
    out[part.partKey] = values;
  }
  return out;
}
