import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildVehicleTree, findInstanceNode, listInstanceIds
} from '../vehicle-tree-adapter.mjs';
import { KNOWN_CAD_BY_INSTANCE } from '../known-cad-map.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../');
const r16Index = JSON.parse(
  fs.readFileSync(path.join(HERE, '..', 'r16-vehicle-index.json'), 'utf8')
);
const domain = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'src-experiments/domain-contract-v1/fixtures/vehicle-skeleton.json'),
    'utf8'
  )
);

const { root, meta } = buildVehicleTree(r16Index, domain);

assert.equal(root.kind, 'vehicle');
assert.equal(root.children.length, 13, 'R-16 应有 13 个系统');
assert.equal(meta.selectionKey, 'instanceId');
assert.equal(listInstanceIds(root).length, 14, '域模型 14 个可见实例');

const hub = findInstanceNode(root, 'INST-HUB-FL');
assert.ok(hub?.geometry?.inspectable);
assert.ok(hub.geometry.cadUrl);
assert.equal(hub.geometry.status, 'DEMO_SUBSTITUTE');

const wheelFr = findInstanceNode(root, 'INST-WHEEL-FR');
assert.equal(wheelFr.geometry.inspectable, false);
assert.equal(wheelFr.geometry.status, 'NO_GEOMETRY');
assert.equal(wheelFr.geometry.cadUrl, null);

const cadInstances = listInstanceIds(root).filter((id) => KNOWN_CAD_BY_INSTANCE[id]?.cadUrl);
assert.deepEqual(cadInstances, ['INST-HUB-FL'], '轮毂演示 GLB 只能绑定单实例');

const emptySys = root.children.find((s) => s.systemId === 'SYS-100');
assert.ok(emptySys?.children?.some((c) => c.kind === 'coverage'), '无域展开的系统应显示 R-16 覆盖说明');

console.log('vehicle-tree-adapter.test.mjs: PASS');