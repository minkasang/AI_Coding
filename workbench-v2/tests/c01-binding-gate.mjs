/**
 * R-36: loadC01ViewportAssets must reject bad snapshot before returning seed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadC01ViewportAssets, C01_URLS, revokeC01VerifiedGlbUrl } from '../c01-viewport-mode.mjs';
import { WheelEndBindingError } from '../../src-experiments/wheel-end-asset-binding-v1/binding.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function fileFetcher(tamperSnapshot = false) {
  return async (url) => {
    const rel = url.startsWith('/') ? url.slice(1) : url;
    const abs = path.join(root, rel.replace(/\//g, path.sep));
    if (!abs.startsWith(root)) throw new Error('path escape');
    const body = readFileSync(abs);
    if (tamperSnapshot && url.includes('vehicle-snapshot.json')) {
      const tampered = JSON.parse(body.toString('utf8'));
      tampered.revision = 999;
      const text = JSON.stringify(tampered);
      return {
        ok: true,
        status: 200,
        text: async () => text,
        json: async () => JSON.parse(text),
        arrayBuffer: async () => new TextEncoder().encode(text).buffer
      };
    }
    const isJson = rel.endsWith('.json');
    return {
      ok: true,
      status: 200,
      text: async () => body.toString('utf8'),
      json: async () => JSON.parse(body.toString('utf8')),
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
    };
  };
}

const good = await loadC01ViewportAssets(fileFetcher(false));
if (!good.verified || !good.binding || good.seed.catalog.length !== 9) {
  throw new Error('good path: expected verified binding with 9 catalog entries');
}
console.log('PASS c01-binding-gate good path package', good.packageId);

let tamperCode = null;
try {
  await loadC01ViewportAssets(fileFetcher(true));
  throw new Error('tampered snapshot should not return assets');
} catch (error) {
  tamperCode = error?.code;
  const snapshotErr = /^E_SNAPSHOT_/.test(tamperCode || '');
  if (!snapshotErr && !(error instanceof WheelEndBindingError)) {
    throw new Error(`tamper: expected snapshot binding error, got ${error?.code || error?.message}`);
  }
}
console.log('PASS c01-binding-gate tamper blocks', tamperCode);

let missingCode = null;
try {
  await loadC01ViewportAssets(async (url) => {
    if (url === C01_URLS.manifestUrl) {
      return { ok: false, status: 404, text: async () => '', json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    }
    return fileFetcher(false)(url);
  });
  throw new Error('missing manifest should not return assets');
} catch (error) {
  missingCode = error?.code;
  const blocked = ['E_PACKAGE_MISSING', 'E_FETCH_FAILED'].includes(missingCode);
  if (!blocked) throw error;
}
console.log('PASS c01-binding-gate missing manifest', missingCode || 'rejected');

let manifestHits = 0;
let glbHits = 0;
const splitManifestFetcher = async (url) => {
  const rel = url.startsWith('/') ? url.slice(1) : url;
  if (rel.includes('manifest.json')) {
    manifestHits += 1;
    const base = await fileFetcher(false)(url);
    if (manifestHits > 1) {
      const text = await base.text();
      const tampered = JSON.parse(text);
      tampered.partDefinitions['PART-20-016'].displayColor = [1, 0, 0];
      const next = JSON.stringify(tampered);
      return {
        ok: true,
        status: 200,
        text: async () => next,
        json: async () => JSON.parse(next),
        arrayBuffer: async () => new TextEncoder().encode(next).buffer
      };
    }
    return base;
  }
  if (rel.includes('wheel-end.glb')) {
    glbHits += 1;
    if (glbHits > 1) throw new Error('GLB must not be fetched twice per load');
  }
  return fileFetcher(false)(url);
};

const baseline = await loadC01ViewportAssets(fileFetcher(false));
const knuckleBase = baseline.seed.catalog.find((p) => p.partKey === 'PI-20-016-FL');
manifestHits = 0;
glbHits = 0;
const withProxy = await loadC01ViewportAssets(splitManifestFetcher);
const knuckleProxy = withProxy.seed.catalog.find((p) => p.partKey === 'PI-20-016-FL');
if (manifestHits !== 1) throw new Error(`expected 1 manifest fetch, got ${manifestHits}`);
if (glbHits !== 1) throw new Error(`expected 1 glb fetch, got ${glbHits}`);
if (knuckleProxy?.color !== knuckleBase?.color) {
  throw new Error(`tampered second manifest changed color ${knuckleProxy?.color} vs ${knuckleBase?.color}`);
}
revokeC01VerifiedGlbUrl(withProxy.glbObjectUrl);
revokeC01VerifiedGlbUrl(baseline.glbObjectUrl);
console.log('PASS c01-binding-gate single-fetch bytes', knuckleBase?.color);

console.log('C01_BINDING_GATE_PASS');