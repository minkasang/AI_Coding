// R-30 · MPbrFlag 纯逻辑单测（不需要浏览器/WebGL）
// 运行：node --test viewer/experiments/render-release-v1/tests/m-pbr-flag.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MPbrFlag, LEGACY_PBR, DEFAULT_ENABLED } from '../m-pbr-flag.mjs';

function mat(name, metalness, roughness, extra = {}) {
  return {
    name, metalness, roughness, envMapIntensity: 1.05,
    color: { getHexString: () => '8e9fb3' },
    emissive: { getHexString: () => '000000' },
    emissiveIntensity: 0,
    clippingPlanes: [],
    clipIntersection: false,
    userData: {},
    ...extra
  };
}
const mesh = (material) => ({ isMesh: true, material, userData: {}, traverse(fn) { fn(this); } });
function node(children = []) {
  return {
    children,
    traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
  };
}
function objectOf(instanceId, materials) {
  return { visible: true, userData: { instanceId }, children: materials.map(mesh),
    traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); } };
}

const NATIVE = {
  hub: { name: 'Mat_Part_Hub', metalness: 0.85, roughness: 0.25 },
  bearing: { name: 'Mat_Part_Bearing', metalness: 0.95, roughness: 0.12 },
  studs: { name: 'Mat_Part_WheelStuds', metalness: 0.80, roughness: 0.50 }
};

function makeFixture() {
  // 业务侧已按生产 viewport.js 写入旧值 0.70/0.34
  const mats = {
    hub: mat(NATIVE.hub.name, LEGACY_PBR.metalness, LEGACY_PBR.roughness),
    bearing: mat(NATIVE.bearing.name, LEGACY_PBR.metalness, LEGACY_PBR.roughness),
    studs: mat(NATIVE.studs.name, LEGACY_PBR.metalness, LEGACY_PBR.roughness)
  };
  const objects = new Map([
    ['inst-hub-001', objectOf('inst-hub-001', [mats.hub])],
    ['inst-bearing-001', objectOf('inst-bearing-001', [mats.bearing])],
    ['inst-studs-001', objectOf('inst-studs-001', [mats.studs])]
  ]);
  const templates = new Map([
    ['hub', node([mesh(mat(NATIVE.hub.name, NATIVE.hub.metalness, NATIVE.hub.roughness))])],
    ['bearing', node([mesh(mat(NATIVE.bearing.name, NATIVE.bearing.metalness, NATIVE.bearing.roughness))])],
    ['studs', node([mesh(mat(NATIVE.studs.name, NATIVE.studs.metalness, NATIVE.studs.roughness))])]
  ]);
  const seed = { catalog: [{ partKey: 'hub' }, { partKey: 'bearing' }, { partKey: 'studs' }] };
  const instances = [
    { instanceId: 'inst-hub-001', partKey: 'hub' },
    { instanceId: 'inst-bearing-001', partKey: 'bearing' },
    { instanceId: 'inst-studs-001', partKey: 'studs' }
  ];
  return { view: { objects, templates }, seed, instances, mats };
}

test('默认关闭：构造后不写任何材质字段', () => {
  const { view, seed, instances, mats } = makeFixture();
  const before = JSON.stringify([mats.hub.metalness, mats.hub.roughness, mats.bearing.metalness]);
  const flag = new MPbrFlag(view, { seed, instances });
  assert.equal(flag.enabled, false);
  assert.equal(flag.switches, 0);
  assert.equal(JSON.stringify([mats.hub.metalness, mats.hub.roughness, mats.bearing.metalness]), before);
  assert.equal(flag.status().defaultEnabled, DEFAULT_ENABLED);
});

test('enable 写入 GLB 原生分档，且 envMapIntensity 保持不变', () => {
  const { view, seed, instances, mats } = makeFixture();
  const flag = new MPbrFlag(view, { seed, instances });
  flag.enable();
  assert.equal(mats.hub.metalness, NATIVE.hub.metalness);
  assert.equal(mats.hub.roughness, NATIVE.hub.roughness);
  assert.equal(mats.bearing.metalness, NATIVE.bearing.metalness);
  assert.equal(mats.studs.roughness, NATIVE.studs.roughness);
  // 环境反射强度不属 M 变量
  assert.equal(mats.hub.envMapIntensity, LEGACY_PBR.envMapIntensity);
  assert.ok(flag.histogram().distinct >= 3, '应恢复三种以上 PBR 分档');
});

test('disable 无条件回退到生产默认值', () => {
  const { view, seed, instances, mats } = makeFixture();
  const flag = new MPbrFlag(view, { seed, instances });
  flag.enable();
  flag.disable();
  assert.equal(mats.hub.metalness, LEGACY_PBR.metalness);
  assert.equal(mats.hub.roughness, LEGACY_PBR.roughness);
  assert.equal(mats.bearing.metalness, LEGACY_PBR.metalness);
  const check = flag.assertLegacyRestored();
  assert.equal(check.ok, true, JSON.stringify(check.violations));
});

test('幂等：重复 enable 不叠加切换次数', () => {
  const { view, seed, instances } = makeFixture();
  const flag = new MPbrFlag(view, { seed, instances });
  flag.enable();
  flag.enable();
  flag.enable();
  assert.equal(flag.switches, 1);
});

test('多次开关后仍精确回退（不产生累积漂移）', () => {
  const { view, seed, instances } = makeFixture();
  const flag = new MPbrFlag(view, { seed, instances });
  for (let i = 0; i < 6; i++) flag.toggle();
  flag.disable();
  const check = flag.assertLegacyRestored();
  assert.equal(check.ok, true, JSON.stringify(check.violations));
  assert.equal(flag.switches, 6);
});

test('reapply 修复 sync 新增零件的混合态', () => {
  const { view, seed, instances } = makeFixture();
  const flag = new MPbrFlag(view, { seed, instances });
  flag.enable();
  // 模拟 viewport.sync 新增一个 hub 实例，材质被生产代码写成旧值
  const newMat = mat(NATIVE.hub.name, LEGACY_PBR.metalness, LEGACY_PBR.roughness);
  view.objects.set('inst-hub-002', objectOf('inst-hub-002', [newMat]));
  instances.push({ instanceId: 'inst-hub-002', partKey: 'hub' });
  flag.partKeyByInstance.set('inst-hub-002', 'hub');
  flag.reapply();
  assert.equal(newMat.metalness, NATIVE.hub.metalness, '新增零件应被收敛到 M 状态');
  assert.equal(flag.missingTargets.length, 0);
});

test('未知零件退化为生产默认并显式记录', () => {
  const { view, seed, instances } = makeFixture();
  const flag = new MPbrFlag(view, { seed, instances });
  flag.enable();
  const unknown = mat('Mat_Unknown', 0.11, 0.88);
  view.objects.set('inst-unknown-001', objectOf('inst-unknown-001', [unknown]));
  flag.partKeyByInstance.set('inst-unknown-001', 'ghost');
  flag.reapply();
  assert.equal(unknown.metalness, LEGACY_PBR.metalness);
  assert.equal(unknown.roughness, LEGACY_PBR.roughness);
  assert.equal(flag.missingTargets.length, 1);
  assert.equal(flag.missingTargets[0].instanceId, 'inst-unknown-001');
});

test('不触碰非 PBR 字段', () => {
  const { view, seed, instances, mats } = makeFixture();
  mats.hub.emissive = { getHexString: () => '2364bd' };
  mats.hub.emissiveIntensity = 0.19;
  mats.hub.clippingPlanes = [{}];
  const flag = new MPbrFlag(view, { seed, instances });
  const before = JSON.stringify(flag.nonPbrSnapshot());
  flag.enable();
  flag.disable();
  flag.enable();
  assert.equal(JSON.stringify(flag.nonPbrSnapshot()), before);
});

test('status 诚实标注默认关闭与回退方式', () => {
  const { view, seed, instances } = makeFixture();
  const flag = new MPbrFlag(view, { seed, instances });
  const s = flag.status();
  assert.equal(s.schema, 'carlab.r30.mPbrFlag/1.0');
  assert.equal(s.defaultEnabled, false);
  assert.match(s.rollback, /无条件写回/);
  assert.match(s.fileLock, /render-release-v1/);
  assert.deepEqual(s.legacy, LEGACY_PBR);
  assert.equal(s.legacySource, 'workbench-v2/viewport.js:166-167');
});

test('缺少依赖时显式失败，不静默降级', () => {
  assert.throws(() => new MPbrFlag(null, {}), /EngineeringViewport/);
  assert.throws(() => new MPbrFlag({ objects: new Map() }, { seed: {} }), /catalog/);
  assert.throws(() => new MPbrFlag({ objects: new Map() }, { seed: { catalog: [] } }), /instances/);
});
