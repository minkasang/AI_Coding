/**
 * Browser / Node client for R-27 read-only vehicle snapshot.
 */

const CONSUMER_URL = '/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json';
const SNAPSHOT_URL = '/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json';

/** 5173 可编辑工程实例 ↔ R-27 唯一演示 CAD 绑定 */
export const DEMO_VIEWPORT_BRIDGE = Object.freeze({
  'PI-30-006-FL': 'inst-hub-001'
});

export async function loadVehicleSnapshot(fetchImpl = fetch) {
  const consumerRes = await fetchImpl(CONSUMER_URL);
  if (!consumerRes.ok) throw new Error('consumer index HTTP ' + consumerRes.status);
  const consumer = await consumerRes.json();
  const snapRes = await fetchImpl(SNAPSHOT_URL);
  if (!snapRes.ok) throw new Error('vehicle snapshot HTTP ' + snapRes.status);
  const snapshot = await snapRes.json();
  return { consumer, snapshot };
}

/**
 * @param {object} snapshot
 */
export function createSnapshotContext(snapshot) {
  const partInstances = snapshot.tree.partInstances;
  const partDefinitions = snapshot.tree.partDefinitions;
  const assyById = new Map((snapshot.workbenchTree.assemblyInstances || []).map((a) => [a.assemblyInstanceId, a]));
  const assyDefById = new Map(
    (snapshot.tree.assemblyDefinitions || []).map((a) => [a.assemblyDefinitionId || a.assemblyId || a.id, a])
  );
  const demoCad = new Map(
    (snapshot.geometry?.demoCadBindings || []).map((row) => [row.instanceId, row])
  );
  const byPi = snapshot.indexes.byPartInstanceId;

  return {
    snapshot,
    getPartInstance(partInstanceId) {
      const idx = byPi[partInstanceId];
      if (idx == null) return null;
      return partInstances[idx];
    },
    getPartName(partId) {
      const idx = snapshot.indexes.byPartDefinitionId?.[partId];
      return idx == null ? partId : (partDefinitions[idx]?.name || partId);
    },
    getAssembly(assemblyInstanceId) {
      return assyById.get(assemblyInstanceId) || null;
    },
    getAssemblyLabel(assemblyInstanceId) {
      const ai = assyById.get(assemblyInstanceId);
      if (!ai) return assemblyInstanceId;
      const def = assyDefById.get(ai.definitionRef);
      const corner = ai.corner ? ` · ${ai.corner}` : '';
      return (def?.name || ai.definitionRef) + corner;
    },
    getDemoCad(partInstanceId) {
      return demoCad.get(partInstanceId) || null;
    },
    isInspectable(partInstanceId) {
      const row = demoCad.get(partInstanceId);
      return Boolean(row?.cadUrl && row.allowed);
    },
    workbenchTree: snapshot.workbenchTree
  };
}