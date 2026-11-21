/**
 * R-31 read-only consumer contract for the R-27 vehicle snapshot.
 * Browser-safe: no Node imports. Node disk loading lives in node-loader.mjs.
 * The consumer never mutates the snapshot and never promotes aliases to identity.
 */
export const CONSUMER_API_VERSION = 'carlab.vehicle-consumer/0.1.0-proposal';
export const SNAPSHOT_SCHEMA = 'carlab.vehicleSnapshot/0.1.0-proposal';
export const CONSUMER_SCHEMA = 'carlab.vehicleSnapshot.consumer/0.1.0-proposal';
export const MAX_PAGE_SIZE = 200;

const clone = (value) => JSON.parse(JSON.stringify(value));
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

export class VehicleConsumerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'VehicleConsumerError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new VehicleConsumerError(code, message, details);
}

export async function sha256Hex(text) {
  if (!globalThis.crypto?.subtle) fail('E_CRYPTO_UNAVAILABLE', 'WebCrypto SHA-256 is required to verify the snapshot.');
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function assertSnapshot(snapshot, consumerIndex, snapshotSha256) {
  if (!isNonEmptyString(snapshotSha256) || !/^[0-9a-f]{64}$/.test(snapshotSha256)) {
    fail('E_SNAPSHOT_UNVERIFIED', 'A verified snapshot SHA-256 is required; the consumer fails closed without it.');
  }
  if (!consumerIndex || consumerIndex.schemaVersion !== CONSUMER_SCHEMA) {
    fail('E_CONSUMER_INDEX_INVALID', `Consumer index must use ${CONSUMER_SCHEMA}.`);
  }
  if (snapshotSha256 !== consumerIndex.snapshotSha256) {
    fail('E_SNAPSHOT_HASH_MISMATCH', 'Snapshot SHA-256 does not match the consumer index.', {
      expected: consumerIndex.snapshotSha256,
      actual: snapshotSha256
    });
  }
  if (!snapshot || snapshot.schemaVersion !== SNAPSHOT_SCHEMA) {
    fail('E_SNAPSHOT_INVALID', `Snapshot schema must be ${SNAPSHOT_SCHEMA}.`);
  }
  if (snapshot.snapshotId !== consumerIndex.snapshotId) {
    fail('E_SNAPSHOT_INVALID', 'Snapshot id does not match the consumer index.', {
      snapshotId: snapshot.snapshotId,
      indexSnapshotId: consumerIndex.snapshotId
    });
  }
  if (snapshot.status !== 'CANDIDATE_NOT_FROZEN' || snapshot.readOnly !== true) {
    fail('E_SNAPSHOT_INVALID', 'Snapshot must be a read-only CANDIDATE_NOT_FROZEN artifact.');
  }
  const tree = snapshot.tree;
  if (!tree || !Array.isArray(tree.systems) || !Array.isArray(tree.assemblyDefinitions)
    || !Array.isArray(tree.assemblyInstances) || !Array.isArray(tree.partDefinitions)
    || !Array.isArray(tree.partInstances)) {
    fail('E_SNAPSHOT_INVALID', 'Snapshot tree arrays are missing.');
  }
  const counts = snapshot.counts || {};
  const actual = {
    systems: tree.systems.filter((system) => system.level === 'SYSTEM').length,
    subsystems: tree.systems.filter((system) => system.level === 'SUBSYSTEM').length,
    assemblyDefinitions: tree.assemblyDefinitions.length,
    assemblyInstances: tree.assemblyInstances.length,
    partDefinitions: tree.partDefinitions.length,
    partInstances: tree.partInstances.length
  };
  for (const [key, value] of Object.entries(actual)) {
    if (counts[key] !== value) fail('E_SNAPSHOT_INVALID', `Snapshot counts.${key} does not match the tree arrays.`, { expected: value, actual: counts[key] });
  }
  if (consumerIndex.counts?.partInstances !== counts.partInstances
    || consumerIndex.counts?.partDefinitions !== counts.partDefinitions
    || consumerIndex.counts?.assemblyInstances !== counts.assemblyInstances) {
    fail('E_SNAPSHOT_INVALID', 'Consumer index counts do not match the snapshot.');
  }
  if (snapshot.consumerContract?.canonicalSelectionKey !== 'partInstanceId') {
    fail('E_SNAPSHOT_INVALID', 'Snapshot consumer contract must use partInstanceId as the canonical selection key.');
  }
  if (!snapshot.poseRun || !snapshot.demoMotionView) {
    fail('E_SNAPSHOT_INVALID', 'Snapshot must include poseRun and demoMotionView.');
  }
  const seen = new Set();
  for (const part of tree.partInstances) {
    if (!part.partInstanceId?.startsWith('PI-')) fail('E_SNAPSHOT_INVALID', `Non-canonical part instance id ${part.partInstanceId}.`);
    if (seen.has(part.partInstanceId)) fail('E_SNAPSHOT_INVALID', `Duplicate part instance id ${part.partInstanceId}.`);
    seen.add(part.partInstanceId);
  }
}

function paginate(items, { offset, limit }) {
  if (!Number.isInteger(offset) || offset < 0) fail('E_PAGINATION', 'offset must be an integer >= 0.');
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) fail('E_PAGINATION', `limit must be an integer between 1 and ${MAX_PAGE_SIZE}.`);
  const total = items.length;
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return { page, total, hasMore: nextOffset < total, nextOffset };
}

export function createVehicleConsumer({ snapshot, consumerIndex, snapshotSha256 }) {
  assertSnapshot(snapshot, consumerIndex, snapshotSha256);

  const tree = snapshot.tree;
  const systems = new Map(tree.systems.map((system) => [system.systemId, system]));
  const partDefinitions = new Map(tree.partDefinitions.map((definition) => [definition.partDefinitionId, definition]));
  const partInstances = new Map(tree.partInstances.map((instance) => [instance.partInstanceId, instance]));
  const assemblyDefinitions = new Map(tree.assemblyDefinitions.map((definition) => [definition.assemblyDefinitionId, definition]));
  const assemblyInstances = new Map(tree.assemblyInstances.map((assembly) => [assembly.assemblyInstanceId, assembly]));
  const workbenchSystems = new Map((snapshot.workbenchTree?.systems || []).map((system) => [system.systemId, system]));
  const workbenchAssemblies = new Map((snapshot.workbenchTree?.assemblyInstances || []).map((assembly) => [assembly.assemblyInstanceId, assembly]));
  const partsByAssembly = new Map();
  const partsByDefinition = new Map();
  for (const instance of tree.partInstances) {
    if (!partsByAssembly.has(instance.assemblyInstanceId)) partsByAssembly.set(instance.assemblyInstanceId, []);
    partsByAssembly.get(instance.assemblyInstanceId).push(instance);
    if (!partsByDefinition.has(instance.partId)) partsByDefinition.set(instance.partId, []);
    partsByDefinition.get(instance.partId).push(instance);
  }
  const assembliesBySystem = new Map();
  for (const assembly of snapshot.workbenchTree?.assemblyInstances || []) {
    if (!assembliesBySystem.has(assembly.systemId)) assembliesBySystem.set(assembly.systemId, []);
    assembliesBySystem.get(assembly.systemId).push(assembly);
  }
  const aliasToPart = new Map();
  for (const instance of tree.partInstances) {
    const alias = instance.projection?.r17PartInstanceId;
    if (alias) aliasToPart.set(alias, { aliasKind: 'R17_PROJECTION', canonicalInstanceId: instance.partInstanceId });
  }
  const aliasToAssembly = new Map();
  for (const assembly of tree.assemblyInstances) {
    const alias = assembly.projection?.r17AssemblyInstanceId;
    if (alias) aliasToAssembly.set(alias, { aliasKind: 'R17_PROJECTION', canonicalAssemblyInstanceId: assembly.assemblyInstanceId });
  }
  const unboundAliases = new Map();
  for (const row of snapshot.bindingMatrix || []) {
    if (!row.r18SourceInstanceId) continue;
    if (row.r27?.targetInstanceId) {
      aliasToPart.set(row.r18SourceInstanceId, {
        aliasKind: 'R18_ROLE_SOURCE',
        canonicalInstanceId: row.r27.targetInstanceId,
        role: row.role,
        roleOnly: Boolean(row.r27.notARigidPartPose)
      });
    } else {
      unboundAliases.set(row.r18SourceInstanceId, {
        role: row.role,
        bindingStatus: row.r27?.bindingStatus,
        reason: row.discrepancy?.status ?? row.discrepancy?.note ?? 'No canonical part instance.'
      });
    }
  }
  const demoCadByInstance = new Map((snapshot.geometry?.demoCadBindings || []).map((binding) => [binding.instanceId, binding]));
  const roleByInstance = new Map();
  for (const row of snapshot.bindingMatrix || []) {
    if (row.r27?.targetInstanceId) roleByInstance.set(row.r27.targetInstanceId, row);
  }
  const qtyConflictByPart = new Map((snapshot.qty?.conflicts || []).map((row) => [row.partId, row]));
  const conflictsById = new Map((snapshot.conflictRegister || []).map((conflict) => [conflict.registerId, conflict]));
  const state = { selectedId: null };

  function systemSummary(systemId) {
    const system = systems.get(systemId);
    return system ? { systemId: system.systemId, name: system.name, level: system.level, parentSystemId: system.parentSystemId } : null;
  }
  function assemblySummary(assemblyInstanceId) {
    const assembly = assemblyInstances.get(assemblyInstanceId);
    if (!assembly) return null;
    const definition = assemblyDefinitions.get(assembly.definitionRef);
    return {
      assemblyInstanceId,
      definitionRef: assembly.definitionRef,
      definitionName: definition?.name ?? assembly.definitionRef,
      corner: assembly.corner,
      frameId: assembly.frameId,
      systemId: assembly.systemId,
      isPlaceholder: Boolean(definition?.isPlaceholder)
    };
  }
  function relatedConflictsForPart(instance) {
    const definition = partDefinitions.get(instance.partId);
    const assembly = assemblyInstances.get(instance.assemblyInstanceId);
    const assemblyDefinition = assembly ? assemblyDefinitions.get(assembly.definitionRef) : null;
    const role = roleByInstance.get(instance.partInstanceId);
    const ids = new Set();
    if (qtyConflictByPart.has(instance.partId)) {
      ids.add('R22-CF-R22-07');
      ids.add('R22-CF-R22-10');
    }
    if (definition?.nameDrift) ids.add('R21-CF-03');
    if (definition?.evidenceProjection) ids.add('R21-CF-04');
    if (instance.partId === 'PART-40-048') ids.add('R21-CF-08');
    if (role?.role === 'HUB') ids.add('R27-CF-01');
    if (!instance.projection) ids.add('R27-CF-03');
    if (instance.projection?.parentLevelMismatch) ids.add('R21-CF-06');
    if (assemblyDefinition?.isPlaceholder) ids.add('R21-CF-01');
    return [...ids].filter((id) => conflictsById.has(id));
  }
  function badgesForPart(instance) {
    const definition = partDefinitions.get(instance.partId);
    const role = roleByInstance.get(instance.partInstanceId);
    const badges = ['NO_GEOMETRY'];
    if (demoCadByInstance.has(instance.partInstanceId)) badges.push('DEMO_SUBSTITUTE');
    if (!instance.projection) badges.push('R16_CANONICAL_ONLY');
    if (role) badges.push(`ROLE_${role.role}`);
    if (definition?.requiredButDeferred) badges.push('REQUIRED_NOT_INSTANTIATED');
    if (definition?.variantDecision) badges.push('VARIANT_UNDECIDED');
    if (qtyConflictByPart.has(instance.partId)) badges.push('QTY_CONFLICT_OPEN');
    return badges;
  }
  function partNode(instance) {
    const definition = partDefinitions.get(instance.partId);
    return {
      nodeId: `part:${instance.partInstanceId}`,
      nodeKind: 'partInstance',
      label: definition?.name ?? instance.partId,
      sublabel: instance.partInstanceId,
      selectionId: instance.partInstanceId,
      hasChildren: false,
      childCount: 0,
      geometryStatus: instance.geometryStatus,
      inspectable: false,
      mappingStatus: instance.projection ? 'MAPPED_R21' : 'R16_CANONICAL_ONLY',
      projectionAlias: instance.projection?.r17PartInstanceId ?? null,
      badges: badgesForPart(instance)
    };
  }
  function assemblyNode(assemblyInstanceId) {
    const assembly = assemblyInstances.get(assemblyInstanceId);
    const definition = assemblyDefinitions.get(assembly?.definitionRef);
    const parts = partsByAssembly.get(assemblyInstanceId) || [];
    return {
      nodeId: `assembly:${assemblyInstanceId}`,
      nodeKind: 'assemblyInstance',
      label: definition?.name ? `${definition.name} · ${assembly?.corner ?? ''}`.trim() : assemblyInstanceId,
      sublabel: assemblyInstanceId,
      selectionId: assemblyInstanceId,
      hasChildren: parts.length > 0,
      childCount: parts.length,
      geometryStatus: 'NO_GEOMETRY',
      inspectable: false,
      badges: ['NO_GEOMETRY', ...(definition?.isPlaceholder ? ['PLACEHOLDER_ASSEMBLY'] : []), ...(parts.length === 0 ? ['NO_INSTANTIATED_PARTS'] : [])]
    };
  }
  function systemNode(systemId) {
    const workbench = workbenchSystems.get(systemId);
    const system = systems.get(systemId);
    if (!workbench || !system) fail('E_UNKNOWN_PARENT', `Unknown system ${systemId}.`);
    const assemblyIds = workbench.assemblyInstanceIds || [];
    const partCount = assemblyIds.reduce((sum, id) => sum + (partsByAssembly.get(id)?.length || 0), 0);
    return {
      nodeId: `system:${systemId}`,
      nodeKind: 'system',
      label: system.name,
      sublabel: systemId,
      selectionId: null,
      hasChildren: assemblyIds.length > 0,
      childCount: assemblyIds.length,
      partCount,
      geometryStatus: 'NO_GEOMETRY',
      inspectable: false,
      badges: assemblyIds.length === 0 ? ['NO_INSTANTIATED_ASSEMBLIES'] : []
    };
  }
  function lookupAlias(aliasId) {
    if (aliasToPart.has(aliasId)) return { kind: 'part', ...aliasToPart.get(aliasId) };
    if (aliasToAssembly.has(aliasId)) return { kind: 'assembly', ...aliasToAssembly.get(aliasId) };
    if (unboundAliases.has(aliasId)) return { kind: 'unbound', ...unboundAliases.get(aliasId) };
    return null;
  }

  function getTreePage(options = {}) {
    const parentId = options.parentId ?? null;
    const query = options.query ?? '';
    if (typeof query !== 'string') fail('E_PAGINATION', 'query must be a string.');
    let nodes;
    if (parentId === null) {
      nodes = (snapshot.workbenchTree?.systems || []).map((system) => systemNode(system.systemId));
    } else if (typeof parentId === 'string' && parentId.startsWith('system:')) {
      const systemId = parentId.slice('system:'.length);
      if (!workbenchSystems.has(systemId)) fail('E_UNKNOWN_PARENT', `Unknown system parent ${parentId}.`);
      nodes = (workbenchSystems.get(systemId).assemblyInstanceIds || []).map((id) => assemblyNode(id));
    } else if (typeof parentId === 'string' && parentId.startsWith('assembly:')) {
      const assemblyInstanceId = parentId.slice('assembly:'.length);
      if (!assemblyInstances.has(assemblyInstanceId)) fail('E_UNKNOWN_PARENT', `Unknown assembly parent ${parentId}.`);
      nodes = (partsByAssembly.get(assemblyInstanceId) || []).map((instance) => partNode(instance));
    } else if (typeof parentId === 'string' && parentId.startsWith('part:')) {
      nodes = [];
    } else {
      fail('E_UNKNOWN_PARENT', `Unsupported parentId ${String(parentId)}.`);
    }
    if (query) {
      const needle = query.toLowerCase();
      nodes = nodes.filter((node) => node.label.toLowerCase().includes(needle) || node.sublabel.toLowerCase().includes(needle) || node.nodeId.toLowerCase().includes(needle));
    }
    const { page, total, hasMore, nextOffset } = paginate(nodes, { offset: options.offset ?? 0, limit: options.limit ?? 50 });
    return {
      ok: true,
      parentId,
      query,
      offset: options.offset ?? 0,
      limit: options.limit ?? 50,
      total,
      hasMore,
      nextOffset,
      nodes: page,
      snapshotId: snapshot.snapshotId,
      revision: snapshot.revision
    };
  }

  function resolveAlias(aliasId) {
    if (!isNonEmptyString(aliasId)) fail('E_UNKNOWN_ALIAS', 'Alias id must be a non-empty string.');
    const alias = lookupAlias(aliasId);
    if (!alias) fail('E_UNKNOWN_ALIAS', `Unknown alias ${aliasId}.`, { aliasId });
    if (alias.kind === 'unbound') {
      fail('E_ALIAS_UNBOUND', `Alias ${aliasId} has no canonical instance.`, {
        aliasId,
        role: alias.role,
        bindingStatus: alias.bindingStatus,
        reason: alias.reason
      });
    }
    return {
      ok: true,
      aliasId,
      aliasKind: alias.aliasKind,
      canonicalKind: alias.kind === 'part' ? 'partInstance' : 'assemblyInstance',
      canonicalInstanceId: alias.canonicalInstanceId ?? null,
      canonicalAssemblyInstanceId: alias.canonicalAssemblyInstanceId ?? null,
      conditional: true,
      role: alias.role ?? null,
      roleOnly: alias.roleOnly ?? false,
      note: 'Alias is a projection key, never the canonical engineering identity.'
    };
  }

  function selectVehiclePart(instanceId, options = {}) {
    if (!isNonEmptyString(instanceId)) fail('E_UNKNOWN_ID', 'instanceId must be a non-empty string.');
    if (partInstances.has(instanceId)) {
      state.selectedId = instanceId;
      return {
        ok: true,
        selection: { selectionKey: 'partInstanceId', selectionId: instanceId, nodeId: `part:${instanceId}`, snapshotId: snapshot.snapshotId, revision: snapshot.revision },
        canonicalInstanceId: instanceId,
        aliasUsed: false,
        aliasStatus: null,
        warnings: []
      };
    }
    if (instanceId.startsWith('INST-') || instanceId.startsWith('ASM-')) {
      const alias = lookupAlias(instanceId);
      if (!alias) fail('E_UNKNOWN_ID', `Unknown id ${instanceId}.`, { instanceId });
      if (alias.kind === 'unbound') return resolveAlias(instanceId);
      if (alias.kind === 'assembly') {
        fail('E_NOT_A_PART', `${instanceId} resolves to an assembly, not a part instance.`, { canonicalAssemblyInstanceId: alias.canonicalAssemblyInstanceId });
      }
      if (options.allowProjectionAlias !== true) {
        fail('E_ALIAS_NOT_CANONICAL', `${instanceId} is a projection alias, not a canonical PI-* identity.`, {
          aliasId: instanceId,
          canonicalInstanceId: alias.canonicalInstanceId,
          hint: 'Use the canonical PI-* id or pass allowProjectionAlias:true for a conditional projection.'
        });
      }
      state.selectedId = alias.canonicalInstanceId;
      return {
        ok: true,
        selection: { selectionKey: 'partInstanceId', selectionId: alias.canonicalInstanceId, nodeId: `part:${alias.canonicalInstanceId}`, snapshotId: snapshot.snapshotId, revision: snapshot.revision },
        canonicalInstanceId: alias.canonicalInstanceId,
        aliasUsed: true,
        aliasStatus: 'VIEW_LOCAL_NOT_CANONICAL',
        aliasKind: alias.aliasKind,
        warnings: ['PROJECTION_ALIAS_USED']
      };
    }
    fail('E_UNKNOWN_ID', `Unknown instance id ${instanceId}.`, { instanceId });
  }

  function getObjectDetail(id, options = {}) {
    if (!isNonEmptyString(id)) fail('E_UNKNOWN_ID', 'Object id must be a non-empty string.');
    if (partInstances.has(id)) return partDetail(id);
    if (assemblyInstances.has(id)) return assemblyInstanceDetail(id);
    if (systems.has(id)) return systemDetail(id);
    if (partDefinitions.has(id)) return partDefinitionDetail(id);
    if (assemblyDefinitions.has(id)) return assemblyDefinitionDetail(id);
    if (id.startsWith('INST-') || id.startsWith('ASM-')) {
      const alias = lookupAlias(id);
      if (!alias) fail('E_UNKNOWN_ID', `Unknown id ${id}.`, { id });
      if (alias.kind === 'unbound') return resolveAlias(id);
      if (options.allowProjectionAlias !== true) {
        fail('E_ALIAS_NOT_CANONICAL', `${id} is a projection alias, not a canonical identity.`, {
          aliasId: id,
          canonicalInstanceId: alias.canonicalInstanceId ?? null,
          canonicalAssemblyInstanceId: alias.canonicalAssemblyInstanceId ?? null
        });
      }
      const canonicalId = alias.kind === 'part' ? alias.canonicalInstanceId : alias.canonicalAssemblyInstanceId;
      const detail = getObjectDetail(canonicalId);
      detail.aliasUsed = true;
      detail.aliasStatus = 'VIEW_LOCAL_NOT_CANONICAL';
      detail.aliasId = id;
      detail.warnings = [...(detail.warnings || []), 'PROJECTION_ALIAS_USED'];
      return detail;
    }
    fail('E_UNKNOWN_ID', `Unknown object id ${id}.`, { id });
  }

  function partDetail(instanceId) {
    const instance = partInstances.get(instanceId);
    const definition = partDefinitions.get(instance.partId);
    const assembly = assemblyInstances.get(instance.assemblyInstanceId);
    const assemblyDefinition = assembly ? assemblyDefinitions.get(assembly.definitionRef) : null;
    const role = roleByInstance.get(instanceId) ?? null;
    const demoCad = demoCadByInstance.get(instanceId) ?? null;
    const qtyConflict = qtyConflictByPart.get(instance.partId) ?? null;
    const strictPoseAvailable = snapshot.poseRun.status === 'CURRENT' && snapshot.poseRun.playbackAllowed === true && snapshot.poseRun.frames.length > 0;
    return {
      ok: true,
      nodeKind: 'partInstance',
      label: definition?.name ?? instance.partId,
      sublabel: instanceId,
      selection: { selectionKey: 'partInstanceId', selectionId: instanceId, nodeId: `part:${instanceId}`, snapshotId: snapshot.snapshotId, revision: snapshot.revision },
      identity: {
        partInstanceId: instanceId,
        partId: instance.partId,
        assemblyInstanceId: instance.assemblyInstanceId,
        frameId: instance.frameId,
        corner: instance.corner,
        ordinal: instance.ordinal
      },
      system: systemSummary(assembly?.systemId),
      assembly: assemblySummary(instance.assemblyInstanceId),
      definition: definition ? {
        name: definition.name,
        canonicalName: definition.canonicalName,
        projectionName: definition.projectionName,
        nameDrift: Boolean(definition.nameDrift),
        evidenceInherited: definition.evidenceInherited,
        evidenceProjection: definition.evidenceProjection ? clone(definition.evidenceProjection) : null,
        sourceRefs: [...(definition.sourceRefs || [])],
        familyRef: definition.familyRef,
        parentNodeId: definition.parentNodeId,
        instancePolicy: definition.instancePolicy,
        optionality: definition.optionality,
        qtyVehicleTotalInherited: definition.qtyVehicleTotalInherited,
        variantFlag: definition.variantFlag,
        modelBlocked: Boolean(definition.modelBlocked),
        isPlaceholderAssembly: Boolean(assemblyDefinition?.isPlaceholder)
      } : null,
      instance: {
        geometryStatus: instance.geometryStatus,
        inspectable: Boolean(instance.inspectable),
        evidenceInherited: instance.evidenceInherited,
        evidence: clone(instance.evidence || {}),
        projection: instance.projection
          ? { ...clone(instance.projection), mappingCategory: 'MAPPED_R21' }
          : { mappingStatus: 'R16_CANONICAL_ONLY', mappingCategory: 'R16_CANONICAL_ONLY' }
      },
      geometry: {
        status: 'NO_GEOMETRY',
        inspectable: false,
        canRenderStrict: false,
        canRenderDemoGeometry: Boolean(demoCad),
        canShowDemoRoleMarker: Boolean(role),
        demoCad: demoCad ? clone(demoCad) : null,
        note: demoCad ? 'Only a DEMO_SUBSTITUTE asset; not real CAD and not copyable.' : 'No geometry record exists for this instance.'
      },
      roleBinding: role ? clone(role) : null,
      flags: {
        requiredButDeferred: definition?.requiredButDeferred ? clone(definition.requiredButDeferred) : null,
        variantDecision: definition?.variantDecision ? clone(definition.variantDecision) : null,
        qtyConflict: qtyConflict ? clone(qtyConflict) : null
      },
      pose: {
        strict: { available: strictPoseAvailable, status: snapshot.poseRun.status, reason: strictPoseAvailable ? null : snapshot.poseRun.reason },
        demo: { available: Boolean(role), attachTo: role?.r27?.attachTo ?? 'NONE', notARigidPartPose: Boolean(role?.r27?.notARigidPartPose) }
      },
      relatedConflicts: relatedConflictsForPart(instance),
      displayStatus: {
        badges: badgesForPart(instance),
        strictPoseAvailable,
        demoPoseAvailable: Boolean(role),
        demoOnly: Boolean(demoCad || role)
      }
    };
  }

  function partDefinitionDetail(partId) {
    const definition = partDefinitions.get(partId);
    const instances = partsByDefinition.get(partId) || [];
    const qtyConflict = qtyConflictByPart.get(partId) ?? null;
    const ids = new Set();
    if (definition.nameDrift) ids.add('R21-CF-03');
    if (definition.evidenceProjection) ids.add('R21-CF-04');
    if (partId === 'PART-40-048') ids.add('R21-CF-08');
    if (qtyConflict) {
      ids.add('R22-CF-R22-07');
      ids.add('R22-CF-R22-10');
    }
    const badges = ['NO_GEOMETRY'];
    if (definition.requiredButDeferred) badges.push('REQUIRED_NOT_INSTANTIATED');
    if (definition.variantDecision) badges.push('VARIANT_UNDECIDED');
    if (qtyConflict) badges.push('QTY_CONFLICT_OPEN');
    return {
      ok: true,
      nodeKind: 'partDefinition',
      label: definition.name,
      sublabel: partId,
      selection: null,
      identity: { partDefinitionId: partId, systemId: definition.systemId, parentNodeId: definition.parentNodeId, parentKind: definition.parentKind },
      system: systemSummary(definition.systemId),
      definition: {
        evidenceInherited: definition.evidenceInherited,
        evidenceProjection: definition.evidenceProjection ? clone(definition.evidenceProjection) : null,
        canonicalName: definition.canonicalName,
        projectionName: definition.projectionName,
        nameDrift: Boolean(definition.nameDrift),
        instancePolicy: definition.instancePolicy,
        optionality: definition.optionality,
        qtyVehicleTotalInherited: definition.qtyVehicleTotalInherited,
        variantFlag: definition.variantFlag,
        modelBlocked: Boolean(definition.modelBlocked),
        sourceRefs: [...(definition.sourceRefs || [])]
      },
      instanceCount: instances.length,
      instanceIds: instances.map((instance) => instance.partInstanceId),
      flags: {
        requiredButDeferred: definition.requiredButDeferred ? clone(definition.requiredButDeferred) : null,
        variantDecision: definition.variantDecision ? clone(definition.variantDecision) : null,
        qtyConflict: qtyConflict ? clone(qtyConflict) : null
      },
      relatedConflicts: [...ids].filter((id) => conflictsById.has(id)),
      displayStatus: { badges, strictPoseAvailable: false, demoPoseAvailable: false, demoOnly: false }
    };
  }

  function assemblyInstanceDetail(assemblyInstanceId) {
    const assembly = assemblyInstances.get(assemblyInstanceId);
    const definition = assemblyDefinitions.get(assembly.definitionRef);
    const parts = partsByAssembly.get(assemblyInstanceId) || [];
    const ids = new Set();
    if (definition?.isPlaceholder) ids.add('R21-CF-01');
    return {
      ok: true,
      nodeKind: 'assemblyInstance',
      label: `${definition?.name ?? assembly.definitionRef} · ${assembly.corner}`,
      sublabel: assemblyInstanceId,
      assemblyInstanceId,
      definitionRef: assembly.definitionRef,
      systemId: assembly.systemId,
      corner: assembly.corner,
      frameId: assembly.frameId,
      selection: { selectionKey: 'assemblyInstanceId', selectionId: assemblyInstanceId, nodeId: `assembly:${assemblyInstanceId}`, snapshotId: snapshot.snapshotId, revision: snapshot.revision },
      identity: {
        assemblyInstanceId,
        definitionRef: assembly.definitionRef,
        systemId: assembly.systemId,
        frameId: assembly.frameId,
        corner: assembly.corner,
        scope: assembly.scope,
        activeInVariant: assembly.activeInVariant
      },
      system: systemSummary(assembly.systemId),
      definition: definition ? {
        name: definition.name,
        isPlaceholder: Boolean(definition.isPlaceholder),
        canonicalName: definition.canonicalName,
        projectionName: definition.projectionName,
        semanticBroadening: Boolean(definition.semanticBroadening),
        evidenceInherited: definition.evidenceInherited
      } : null,
      partInstanceIds: parts.map((instance) => instance.partInstanceId),
      partCount: parts.length,
      geometryStatus: 'NO_GEOMETRY',
      projection: assembly.projection ? clone(assembly.projection) : null,
      relatedConflicts: [...ids].filter((id) => conflictsById.has(id)),
      displayStatus: { badges: ['NO_GEOMETRY', ...(definition?.isPlaceholder ? ['PLACEHOLDER_ASSEMBLY'] : [])], strictPoseAvailable: false, demoPoseAvailable: false, demoOnly: false }
    };
  }

  function assemblyDefinitionDetail(assemblyDefinitionId) {
    const definition = assemblyDefinitions.get(assemblyDefinitionId);
    const instances = tree.assemblyInstances.filter((assembly) => assembly.definitionRef === assemblyDefinitionId);
    const ids = definition.isPlaceholder ? ['R21-CF-01'] : [];
    return {
      ok: true,
      nodeKind: 'assemblyDefinition',
      label: definition.name,
      sublabel: assemblyDefinitionId,
      selection: null,
      identity: { assemblyDefinitionId, systemId: definition.systemId, parentNodeId: definition.parentNodeId, parentKind: definition.parentKind },
      system: systemSummary(definition.systemId),
      definition: {
        name: definition.name,
        isPlaceholder: Boolean(definition.isPlaceholder),
        canonicalName: definition.canonicalName,
        projectionName: definition.projectionName,
        semanticBroadening: Boolean(definition.semanticBroadening),
        evidenceInherited: definition.evidenceInherited,
        purchaseBoundary: definition.purchaseBoundary,
        targetLevel: definition.targetLevel
      },
      instanceCount: instances.length,
      instanceIds: instances.map((assembly) => assembly.assemblyInstanceId),
      relatedConflicts: ids.filter((id) => conflictsById.has(id)),
      displayStatus: { badges: definition.isPlaceholder ? ['PLACEHOLDER_ASSEMBLY'] : [], strictPoseAvailable: false, demoPoseAvailable: false, demoOnly: false }
    };
  }

  function systemDetail(systemId) {
    const system = systems.get(systemId);
    const workbench = workbenchSystems.get(systemId);
    const assemblyInstanceIds = workbench?.assemblyInstanceIds || [];
    const partCount = assemblyInstanceIds.reduce((sum, id) => sum + (partsByAssembly.get(id)?.length || 0), 0);
    return {
      ok: true,
      nodeKind: 'system',
      label: system.name,
      sublabel: systemId,
      selection: null,
      identity: { systemId, level: system.level, parentSystemId: system.parentSystemId },
      subsystemIds: workbench?.subsystemIds ?? tree.systems.filter((child) => child.level === 'SUBSYSTEM' && child.parentSystemId === systemId).map((child) => child.systemId),
      assemblyInstanceIds,
      counts: { assemblies: assemblyInstanceIds.length, parts: partCount },
      relatedConflicts: [],
      displayStatus: { badges: assemblyInstanceIds.length === 0 ? ['NO_INSTANTIATED_ASSEMBLIES'] : [], strictPoseAvailable: false, demoPoseAvailable: false, demoOnly: false }
    };
  }

  function getDisplayStatus() {
    const bySource = {};
    for (const conflict of snapshot.conflictRegister || []) bySource[conflict.source] = (bySource[conflict.source] || 0) + 1;
    return {
      ok: true,
      apiVersion: CONSUMER_API_VERSION,
      snapshot: {
        snapshotId: snapshot.snapshotId,
        projectId: snapshot.projectId,
        revision: snapshot.revision,
        schemaVersion: snapshot.schemaVersion,
        status: snapshot.status,
        readOnly: snapshot.readOnly
      },
      counts: clone(snapshot.counts),
      geometry: {
        noGeometryInstances: snapshot.geometry?.noGeometryInstances ?? null,
        sourcedGeometryInstances: snapshot.geometry?.sourcedGeometryInstances ?? null,
        demoCadBindings: snapshot.geometry?.demoCadBindingCount ?? 0,
        demoCadInstanceIds: (snapshot.geometry?.demoCadBindings || []).map((binding) => binding.instanceId),
        bulkCadBindingForbidden: Boolean(snapshot.geometry?.bulkCadBindingForbidden)
      },
      variant: clone(snapshot.variant),
      pose: {
        strict: {
          runId: snapshot.poseRun.runId,
          status: snapshot.poseRun.status,
          sourceRevision: snapshot.poseRun.sourceRevision,
          snapshotRevision: snapshot.poseRun.snapshotRevision,
          playbackAllowed: snapshot.poseRun.playbackAllowed,
          currentFrames: snapshot.poseRun.frames.length,
          reason: snapshot.poseRun.reason
        },
        demo: {
          available: snapshot.demoMotionView.status === 'DEMO_ONLY',
          badge: snapshot.demoMotionView.badge,
          frames: snapshot.demoMotionView.frames.length,
          requiresDemoMode: snapshot.demoMotionView.requiresDemoMode,
          publishAsCurrent: snapshot.demoMotionView.publishAsCurrent,
          sourceRevision: snapshot.demoMotionView.sourceRevision
        }
      },
      conflicts: {
        total: (snapshot.conflictRegister || []).length,
        open: (snapshot.conflictRegister || []).filter((conflict) => conflict.status === 'OPEN').length,
        bySource
      },
      selection: { canonicalKey: 'partInstanceId', aliasesConditional: true },
      consumer: { readOnly: true, canEditSnapshot: false, canSaveSnapshot: false },
      warnings: [
        'NO_GEOMETRY_ALL_INSTANCES',
        'VARIANT_NOT_ALIGNED',
        'R26_MISSING_CONFLICTS_PRESERVED',
        ...(snapshot.poseRun.status !== 'CURRENT' ? ['STRICT_POSE_RUN_STALE'] : []),
        ...((snapshot.geometry?.demoCadBindings || []).length > 0 ? ['SINGLE_DEMO_CAD_WHITELIST'] : [])
      ],
      readyForWorkbench: 'READ_ONLY_TREE_ADAPTER',
      readyForProductionMotion: false
    };
  }

  function getWorkspaceState(options = {}) {
    const mode = options.mode ?? 'inspect';
    if (!['model', 'inspect'].includes(mode)) fail('E_MODE', 'mode must be "model" or "inspect".', { mode });
    const demoMode = options.demoMode === true;
    const selection = state.selectedId
      ? { selectionKey: 'partInstanceId', selectionId: state.selectedId, nodeId: `part:${state.selectedId}`, revision: snapshot.revision }
      : null;
    return {
      ok: true,
      mode,
      snapshotRevision: snapshot.revision,
      selection,
      capabilities: {
        canSelectTree: true,
        canInspect: true,
        canEditSnapshot: false,
        canSaveSnapshot: false,
        canSaveProject: 'EXTERNAL_PROJECT_STORE_ONLY',
        canAddPart: false,
        canEditVehicleTree: false,
        canPlayStrictPose: snapshot.poseRun.playbackAllowed === true && snapshot.poseRun.status === 'CURRENT',
        canPlayDemoPose: demoMode,
        canRenderDemoCad: demoMode
      },
      requiredBadges: demoMode ? [snapshot.demoMotionView.badge] : [],
      note: 'The R-27 snapshot is a read-only vehicle data source; Composer ProjectStore remains the editable project owner.'
    };
  }

  function consumePoseRun(request = {}) {
    if (!Number.isInteger(request.revision)) fail('E_REVISION_REQUIRED', 'A positive integer snapshot revision is required.');
    if (request.revision !== snapshot.revision) {
      fail('E_REVISION_MISMATCH', 'Consumer revision does not match the snapshot revision.', {
        consumerRevision: request.revision,
        snapshotRevision: snapshot.revision
      });
    }
    if (request.frameId && request.frameId !== snapshot.poseRun.frameId) {
      fail('E_FRAME_MISMATCH', 'Consumer frame does not match the pose run frame.', {
        consumerFrameId: request.frameId,
        runFrameId: snapshot.poseRun.frameId
      });
    }
    if (snapshot.poseRun.status !== 'CURRENT' || snapshot.poseRun.playbackAllowed !== true) {
      fail('E_STALE_RUN', 'The strict pose run is not current; playback is disabled.', {
        status: snapshot.poseRun.status,
        sourceRevision: snapshot.poseRun.sourceRevision,
        snapshotRevision: snapshot.poseRun.snapshotRevision,
        reason: snapshot.poseRun.reason,
        demoAvailable: snapshot.demoMotionView.status === 'DEMO_ONLY',
        demoBadge: snapshot.demoMotionView.badge
      });
    }
    return {
      ok: true,
      status: 'CURRENT',
      revision: snapshot.revision,
      frameId: snapshot.poseRun.frameId,
      frames: clone(snapshot.poseRun.frames)
    };
  }

  function getDemoPoseFrame(request = {}) {
    if (request.demoMode !== true) fail('E_DEMO_MODE_REQUIRED', 'Demo playback requires an explicit demoMode:true request.');
    if (request.acknowledgeBadge !== true) fail('E_BADGE_NOT_ACKNOWLEDGED', 'Demo playback requires acknowledgeBadge:true.');
    if (request.sourceRevision !== snapshot.demoMotionView.sourceRevision) {
      fail('E_SOURCE_REVISION_MISMATCH', 'Demo playback must state the source revision being viewed.', {
        requiredSourceRevision: snapshot.demoMotionView.sourceRevision,
        providedSourceRevision: request.sourceRevision
      });
    }
    if (!Number.isInteger(request.frameIndex) || request.frameIndex < 0 || request.frameIndex >= snapshot.demoMotionView.frames.length) {
      fail('E_FRAME_INDEX', 'frameIndex is outside the demo motion range.', { frameIndex: request.frameIndex });
    }
    const frame = snapshot.demoMotionView.frames[request.frameIndex];
    return {
      ok: true,
      status: 'DEMO_ONLY',
      notCurrent: true,
      badge: snapshot.demoMotionView.badge,
      requiresBadge: true,
      sourceRunId: snapshot.demoMotionView.sourceRunId,
      sourceRevision: snapshot.demoMotionView.sourceRevision,
      snapshotRevision: snapshot.revision,
      frameId: snapshot.demoMotionView.frameId,
      units: snapshot.demoMotionView.units,
      up: snapshot.demoMotionView.up,
      frame: clone(frame)
    };
  }

  function restoreSelection(selection) {
    if (!selection || typeof selection !== 'object') fail('E_SELECTION_INVALID', 'Selection object is required.');
    if (selection.selectionKey !== 'partInstanceId') fail('E_ALIAS_NOT_CANONICAL', 'Only partInstanceId selections can be restored.', { selectionKey: selection.selectionKey });
    if (selection.revision !== snapshot.revision) fail('E_SELECTION_STALE', 'Selection was saved against a different snapshot revision.', { selectionRevision: selection.revision, snapshotRevision: snapshot.revision });
    return selectVehiclePart(selection.selectionId);
  }

  function clearSelection() {
    state.selectedId = null;
    return { ok: true, selection: null, revision: snapshot.revision };
  }

  function verifyIntegrity() {
    const actual = {
      partInstances: tree.partInstances.length,
      partDefinitions: tree.partDefinitions.length,
      assemblyInstances: tree.assemblyInstances.length,
      assemblyDefinitions: tree.assemblyDefinitions.length,
      mountFrames: tree.mountFrames.canonical.length
    };
    for (const [key, value] of Object.entries(actual)) {
      if (snapshot.counts[key] !== value) fail('E_SNAPSHOT_INVALID', `Counts.${key} mismatch during integrity check.`, { expected: value, actual: snapshot.counts[key] });
    }
    if (consumerIndex.snapshotSha256 !== snapshotSha256) fail('E_SNAPSHOT_HASH_MISMATCH', 'Snapshot hash changed after consumer creation.');
    return {
      ok: true,
      apiVersion: CONSUMER_API_VERSION,
      snapshotId: snapshot.snapshotId,
      revision: snapshot.revision,
      snapshotSha256,
      counts: clone(actual),
      status: snapshot.status,
      readOnly: snapshot.readOnly
    };
  }

  return Object.freeze({
    apiVersion: CONSUMER_API_VERSION,
    snapshotId: snapshot.snapshotId,
    revision: snapshot.revision,
    getTreePage,
    selectVehiclePart,
    getObjectDetail,
    getDisplayStatus,
    getWorkspaceState,
    consumePoseRun,
    getDemoPoseFrame,
    resolveAlias,
    restoreSelection,
    clearSelection,
    getSelection: () => (state.selectedId ? { selectionKey: 'partInstanceId', selectionId: state.selectedId, revision: snapshot.revision } : null),
    verifyIntegrity
  });
}

export async function fetchVehicleConsumer({ snapshotUrl, indexUrl, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') fail('E_FETCH_UNAVAILABLE', 'A fetch implementation is required.');
  const [snapshotResponse, indexResponse] = await Promise.all([fetchImpl(snapshotUrl), fetchImpl(indexUrl)]);
  if (snapshotResponse.ok === false || indexResponse.ok === false) {
    fail('E_FETCH_FAILED', 'Unable to fetch the snapshot or consumer index.', {
      snapshotStatus: snapshotResponse.status,
      indexStatus: indexResponse.status
    });
  }
  const snapshotText = await snapshotResponse.text();
  const consumerIndex = await indexResponse.json();
  const snapshotSha256 = await sha256Hex(snapshotText);
  const snapshot = JSON.parse(snapshotText);
  return createVehicleConsumer({ snapshot, consumerIndex, snapshotSha256 });
}
