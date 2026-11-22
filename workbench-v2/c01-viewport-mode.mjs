import { loadWheelEndVerifiedPackageFromUrls } from '../src-experiments/wheel-end-asset-binding-v1/binding.mjs';
import { buildC01Seed, readGlbNodeTranslations } from '../viewer/experiments/wheel-end-visual-baseline-v1/c01-seed.mjs';

export const C01_URLS = {
  snapshotUrl: '/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json',
  consumerIndexUrl: '/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json',
  manifestUrl: '/cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/manifest.json',
  glbUrl: '/cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/wheel-end.glb'
};

function resolveAssetUrls(urls) {
  const base = globalThis.location?.href;
  if (!base) return urls;
  /** @param {string} path */
  const abs = (path) => new URL(path, base).href;
  return {
    snapshotUrl: abs(urls.snapshotUrl),
    consumerIndexUrl: abs(urls.consumerIndexUrl),
    manifestUrl: abs(urls.manifestUrl),
    glbUrl: abs(urls.glbUrl)
  };
}

export function revokeC01VerifiedGlbUrl(url) {
  if (url && typeof url === 'string' && url.startsWith('blob:')) {
    try { URL.revokeObjectURL(url); } catch { /* noop */ }
  }
}

/**
 * R-32 单次拉取并校验的字节贯穿 seed 与视窗 GLB，不再次请求 manifest/glb URL。
 */
export async function loadC01ViewportAssets(fetchImpl = fetch, { glbObjectUrlToRevoke = null } = {}) {
  revokeC01VerifiedGlbUrl(glbObjectUrlToRevoke);
  const urls = resolveAssetUrls(C01_URLS);
  const verified = await loadWheelEndVerifiedPackageFromUrls({ ...urls, fetchImpl });
  const { binding, manifest, manifestSha256, glbBuffer, glbSha256 } = verified;
  const { translations } = readGlbNodeTranslations(glbBuffer);
  const glbObjectUrl = URL.createObjectURL(new Blob([glbBuffer], { type: 'model/gltf-binary' }));
  const built = buildC01Seed(manifest, translations, glbObjectUrl);
  for (const part of built.seed.catalog) {
    part.displayName = part.label || part.partKey;
    part.subtitle = part.semantic || 'C-01 DEMO';
    part.category = '轮端 / C-01';
    part.evidence = 'DEMO_ASSUMPTION';
    part.detail = 'C-01 静态工装样板，非 OEM 几何。';
  }
  const instanceIds = new Set(built.seed.catalog.map((p) => p.partKey));
  return {
    binding,
    seed: built.seed,
    instanceIds,
    verified: true,
    packageId: binding.packageId,
    manifestSha256,
    glbSha256,
    glbObjectUrl,
    canonicalGlbUrl: urls.glbUrl
  };
}

export const C01_PART_INSTANCE_IDS = new Set([
  'PI-20-016-FL',
  'PI-30-001-FL',
  'PI-30-002-FL',
  'PI-30-006-FL',
  'PI-30-009-FL-01',
  'PI-30-009-FL-02',
  'PI-30-009-FL-03',
  'PI-30-009-FL-04',
  'PI-30-009-FL-05'
]);

export function isC01PartInstance(partInstanceId) {
  return Boolean(partInstanceId && C01_PART_INSTANCE_IDS.has(partInstanceId));
}