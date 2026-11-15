import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ProjectStore, createDemoProject, createEmptyProject, assertProject, getInstances }
  from '../project-store.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'wheel-end-demo.json'), 'utf8'));
const demo = () => createDemoProject(seed);

test('demo loads exact part definitions and three distinct engineering instance IDs', () => {
  const project = demo();
  assert.equal(project.glbUnit, 'm');
  assert.equal(getInstances(project).length, 3);
  assert.equal(new Set(getInstances(project).map((x) => x.instanceId)).size, 3);
  assert.equal(assertProject(project, seed.catalog), true);
});
test('blank project is truly empty, can create a part from the catalog', () => {
  const store = new ProjectStore(createEmptyProject(seed), seed.catalog);
  assert.equal(store.snapshot().count, 0);
  const id = store.add('hub');
  assert.equal(store.snapshot().count, 1);
  assert.equal(store.snapshot().selectedId, id);
  assert.equal(store.snapshot().project.assemblies[0].instances[0].partKey, 'hub');
});
test('adding twice makes unique instance IDs, separate from mesh node names', () => {
  const store = new ProjectStore(demo(), seed.catalog);
  const a = store.add('hub'), b = store.add('hub');
  assert.notEqual(a, b);
  assert.equal(store.snapshot().count, 5);
  assert.equal(new Set(getInstances(store.project).map((x) => x.instanceId)).size, 5);
});
test('remove clears incident relations and invalidates dangling selection', () => {
  const store = new ProjectStore(demo(), seed.catalog);
  store.select('inst-hub-001');
  store.remove('inst-hub-001');
  assert.equal(store.selectedId, null);
  assert.equal(store.project.relations.length, 0);
  assert.equal(store.snapshot().count, 2);
});
test('engineering state changes are reversible via undo and redo', () => {
  const store = new ProjectStore(demo(), seed.catalog);
  store.toggleVisibility('inst-bearing-001');
  assert.equal(getInstances(store.project).find((x) => x.partKey === 'bearing').visible, false);
  assert.equal(store.undo(), true);
  assert.equal(getInstances(store.project).find((x) => x.partKey === 'bearing').visible, true);
  assert.equal(store.redo(), true);
  assert.equal(getInstances(store.project).find((x) => x.partKey === 'bearing').visible, false);
});
test('exploded view and selection never modify engineering source geometry', () => {
  const store = new ProjectStore(demo(), seed.catalog);
  const first = store.exportDocument();
  store.select('inst-bearing-001');
  store.setExplode(0.8);
  store.isolate('inst-bearing-001');
  assert.equal(store.exportDocument(), first);
});
test('rejects fake foreign part ids, repeated instance ids and broken relationships', () => {
  const p1 = demo();p1.assemblies[0].instances[0].partKey = 'unverified-oem-gear';
  assert.throws(() => assertProject(p1, seed.catalog), /未知零件型号/);
  const p2 = demo();p2.assemblies[0].instances[1].instanceId = 'inst-hub-001';
  assert.throws(() => assertProject(p2, seed.catalog), /零件实例 ID/);
  const p3 = demo();p3.relations[0].to = 'missing';
  assert.throws(() => assertProject(p3, seed.catalog), /不存在的零件/);
});
test('refuses mm-labelled GLB: no silent unit conversion or double scaling', () => {
  const p = demo();p.glbUnit = 'mm';
  assert.throws(() => assertProject(p, seed.catalog), /以米为单位/);
});
test('show all restores hidden engineering instances and clears isolation', () => {
  const store = new ProjectStore(demo(), seed.catalog);
  store.toggleVisibility('inst-hub-001');
  store.isolate('inst-bearing-001');
  store.showAll();
  assert.equal(store.snapshot().isolatedId, null);
  assert.equal(getInstances(store.project).every((inst) => inst.visible), true);
});
test('selection of deleted item must fail clearly', () => {
  const store = new ProjectStore(demo(), seed.catalog);
  assert.throws(() => store.select('missing'), /所选零件不存在/);
});
test('undo/redo non-operations return false, output is valid roundtrippable JSON', () => {
  const store = new ProjectStore(demo(), seed.catalog);
  assert.equal(store.undo(), false);
  assert.equal(store.redo(), false);
  const serialized = store.exportDocument();
  assert.equal(assertProject(JSON.parse(serialized), seed.catalog), true);
  assert.equal(JSON.parse(serialized).schemaVersion, 'carlab.project-demo/0.1');
});
