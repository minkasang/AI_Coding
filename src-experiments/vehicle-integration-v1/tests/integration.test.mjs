import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildIntegrationFromInputs,
  computeQtyAudit,
  loadInputs,
  validateIntegration,
  verifyInputHashes
} from '../integration.mjs';
import { validateProject } from '../../domain-contract-v1/domain.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const clone = (value) => JSON.parse(JSON.stringify(value));
const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
  - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
const inputs = loadInputs(root);
const base = buildIntegrationFromInputs(inputs);
const baseReport = validateIntegration(base.artifact);

function mutate(apply) {
  const artifact = clone(base.artifact);
  apply(artifact);
  return validateIntegration(artifact);
}
function expectCode(report, code) {
  assert.ok(
    report.errors.some((error) => error.code === code),
    `expected ${code}; errors=${JSON.stringify(report.errors.map((error) => error.code))}`
  );
}
function sourceInstance(source, instanceId) {
  return source.r16.partInstances.find((instance) => instance.instanceId === instanceId);
}

test('control: the live artifact validates with zero errors and zero warnings', () => {
  assert.deepEqual(baseReport.errors, []);
  assert.deepEqual(baseReport.warnings, []);
  assert.equal(baseReport.ok, true);
});

test('input pins match the live files', () => {
  const hashReport = verifyInputHashes(base.artifact, root);
  assert.deepEqual(hashReport.errors, []);
  assert.equal(hashReport.ok, true);
});

test('the full R-16 tree is preserved with the same counts', () => {
  const coverage = base.artifact.coverage.r16;
  assert.equal(coverage.systems, 13);
  assert.equal(coverage.subsystems, 53);
  assert.equal(coverage.assemblyDefinitions, 108);
  assert.equal(coverage.assemblyInstances, 37);
  assert.equal(coverage.partDefinitions, 493);
  assert.equal(coverage.partInstances, 278);
  assert.equal(coverage.mountFrames, 37);
  assert.equal(coverage.references, 35);
  assert.equal(coverage.partInstances, inputs.r16.partInstances.length);
  assert.equal(coverage.partDefinitions, inputs.r16.partDefinitions.length);
});

test('every R-16 part instance keeps its identity, parent, frame and corner', () => {
  const byId = new Map(base.artifact.vehicleProject.partInstances.map((instance) => [instance.instanceId, instance]));
  for (const source of inputs.r16.partInstances) {
    const target = byId.get(source.instanceId);
    assert.ok(target, `missing ${source.instanceId}`);
    assert.equal(target.partId, source.definitionId);
    assert.equal(target.assemblyInstanceId, source.assemblyInstanceId);
    assert.equal(target.frameId, source.mountFrameId);
    assert.equal(target.corner, source.corner);
    assert.equal(target.ordinal, source.ordinal);
    assert.equal(target.quantity.perAssembly, 1);
    assert.equal(target.quantity.sourceQtyPerCorner, source.qtyPerCorner);
  }
});

test('the quantity audit exposes the qtyPerCorner double-count instead of summing it', () => {
  const studs = base.artifact.vehicleProject.partInstances.filter((instance) => instance.partId === 'PART-30-009');
  const naiveSum = studs.reduce((sum, instance) => sum + instance.quantity.sourceQtyPerCorner, 0);
  assert.equal(studs.length, 20);
  assert.equal(naiveSum, 100);
  assert.equal(base.artifact.qtyAudit.partQtySemantics.includes('one physical piece'), true);
  assert.equal(base.artifact.qtyAudit.derivedMismatchIds.length, 12);
  assert.equal(base.artifact.qtyAudit.status, 'CONSISTENT');
  const recomputed = computeQtyAudit(
    base.artifact.vehicleProject.partDefinitions,
    base.artifact.vehicleProject.partInstances,
    base.artifact.inheritedIssues.qtyConflicts
  );
  assert.deepEqual(recomputed, base.artifact.qtyAudit);
});

test('a changed instance count changes the audit instead of being hard-coded', () => {
  const artifact = clone(base.artifact);
  artifact.vehicleProject.partInstances = artifact.vehicleProject.partInstances.filter((instance) => instance.instanceId !== 'PI-30-009-FL-01');
  artifact.vehicleProject.bomLines = artifact.vehicleProject.bomLines.map((line) => ({
    ...line,
    instanceIds: line.instanceIds.filter((id) => id !== 'PI-30-009-FL-01'),
    qtyPerAssembly: line.instanceIds.filter((id) => id !== 'PI-30-009-FL-01').length
  })).filter((line) => line.qtyPerAssembly > 0);
  const audit = computeQtyAudit(
    artifact.vehicleProject.partDefinitions,
    artifact.vehicleProject.partInstances,
    artifact.inheritedIssues.qtyConflicts
  );
  assert.equal(audit.rows.find((row) => row.partId === 'PART-30-009').physicalInstanceCount, 19);
  assert.ok(audit.unlistedMismatchIds.includes('PART-30-009'));
  assert.equal(audit.status, 'DIVERGED');
});

test('all 278 instances are NO_GEOMETRY and nothing claims a mesh', () => {
  const instances = base.artifact.vehicleProject.partInstances;
  assert.equal(instances.length, 278);
  for (const instance of instances) {
    assert.equal(instance.geometryStatus, 'NO_GEOMETRY');
    assert.equal(instance.glb ?? null, null);
    assert.equal(instance.mesh ?? null, null);
    assert.equal(instance.assetId ?? null, null);
    assert.equal(instance.inspectable, false);
  }
  assert.equal(base.artifact.vehicleProject.geometryPolicy.sourcedGeometryInstances, 0);
  assert.equal(base.artifact.vehicleProject.geometryPolicy.renderableProductionInstances, 0);
});

test('all 37 R-16 mount frames stay unanchored with no implicit scale or mirror', () => {
  const frames = base.artifact.vehicleProject.mountFrames;
  assert.equal(frames.length, 37);
  for (const frame of frames) {
    assert.equal(frame.anchorStatus, 'UNANCHORED_UNKNOWN');
    assert.equal(frame.origin, null);
    assert.equal(frame.rotation, null);
    assert.equal(frame.units, null);
    assert.equal(frame.worldFrame, 'UNFROZEN_PENDING_RP07');
    assert.equal(frame.globalScaleForbidden, true);
  }
});

test('R-17 fixture crosswalk: 10 bound, 1 unbound, stud ordinals preserved', () => {
  const crosswalk = base.artifact.crosswalk;
  assert.equal(crosswalk.rows.length, 11);
  assert.equal(crosswalk.rows.filter((row) => row.status === 'BOUND').length, 10);
  assert.equal(crosswalk.rows.filter((row) => row.status === 'UNBOUND').length, 1);
  assert.equal(crosswalk.rows.find((row) => row.r17InstanceId === 'INST-STUD-FL-4').canonicalInstanceId, 'PI-30-009-FL-04');
  assert.equal(crosswalk.rows.find((row) => row.r17InstanceId === 'INST-HUB-FL').canonicalInstanceId, 'PI-30-006-FL');
  const unbound = crosswalk.unbound[0];
  assert.equal(unbound.r17InstanceId, 'INST-CALIPER-BRACKET-FL');
  assert.equal(unbound.partId, 'PART-40-048');
  assert.equal(unbound.r16DefinitionPolicy, 'DEFERRED');
});

test('R-18 poses: 4 bound, 1 unbound, values copied from the live R-18 file', () => {
  const poses = base.artifact.poseRun.poses;
  assert.equal(poses.length, 4);
  assert.equal(base.artifact.poseRun.unboundPoses.length, 1);
  assert.equal(base.artifact.poseRun.unboundPoses[0].sourceInstanceId, 'INST-SLA-TIEROD-FL');
  assert.equal(base.artifact.poseRun.unboundPoses[0].published, false);
  assert.equal(base.artifact.poseRun.unboundPoses[0].instanceId, null);
  for (const source of inputs.r18.designSample.instances) {
    const pose = poses.find((item) => item.sourceInstanceId === source.instanceId);
    if (!pose) continue;
    assert.deepEqual(pose.positionM, source.position);
    assert.deepEqual(pose.quaternionXYZW, source.quaternion);
    assert.deepEqual(pose.scale, [1, 1, 1]);
    assert.equal(pose.geometryStatus, 'NO_GEOMETRY');
  }
  assert.equal(base.artifact.coverage.r18.boundToR17, 2);
  assert.equal(base.artifact.poseRun.forces, null);
  assert.equal(base.artifact.poseRun.forceBasis, 'UNKNOWN');
  assert.equal(base.artifact.poseRun.clearance.notCadCollision, true);
});

test('the R-17-compatible domain view passes the unchanged validateProject', () => {
  const report = validateProject(base.artifact.domainView);
  assert.deepEqual(report.errors, []);
  assert.equal(report.ok, true);
  assert.equal(base.artifact.domainView.partInstances.length, 4);
  assert.equal(base.artifact.domainView.joints.length, 5);
  assert.equal(base.artifact.domainView.constraints.length, 6);
  for (const instance of base.artifact.domainView.partInstances) {
    assert.equal(instance.aliasStatus, 'VIEW_LOCAL_NOT_CANONICAL');
    assert.ok(instance.engineeringInstanceId.startsWith('PI-'));
  }
});

test('joint vs constraint: 5 demo joints admitted, 3 rejected with reasons, shock is OUTPUT', () => {
  const deep = base.artifact.deepSlice;
  assert.equal(deep.joints.length, 5);
  assert.equal(deep.rejectedJoints.length, 3);
  assert.equal(deep.outputs.length, 1);
  assert.equal(deep.outputs[0].kind, 'OUTPUT');
  assert.equal(deep.joints.some((joint) => joint.jointId === 'CON-SHOCK-OUTPUT'), false);
  assert.equal(deep.constraints.find((constraint) => constraint.constraintId === 'CON-SHOCK-OUTPUT').jointOrConstraint, 'OUTPUT');
  assert.equal(deep.rejectedJoints.filter((joint) => joint.code === 'VEH-E-JOINT-NO-HARDPOINT').length, 1);
});

test('display transforms are verifiable rigid m/Y-up matrices in the demo frame', () => {
  const displays = base.artifact.poseRun.displayTransforms;
  assert.equal(displays.length, 4);
  for (const display of displays) {
    assert.equal(display.units, 'm');
    assert.equal(display.up, 'Y');
    assert.equal(display.frameId, 'FR-VEHICLE');
    assert.equal(display.production, false);
    const matrix = display.matrixWorld;
    assert.equal(matrix.length, 4);
    assert.deepEqual(matrix[3], [0, 0, 0, 1]);
    const rotation = [matrix[0].slice(0, 3), matrix[1].slice(0, 3), matrix[2].slice(0, 3)];
    assert.ok(Math.abs(det3(rotation) - 1) < 1e-9);
    for (let column = 0; column < 3; column++) {
      const length = Math.hypot(rotation[0][column], rotation[1][column], rotation[2][column]);
      assert.ok(Math.abs(length - 1) < 1e-9);
    }
    const pose = base.artifact.poseRun.poses.find((item) => item.instanceId === display.instanceId);
    assert.deepEqual([matrix[0][3], matrix[1][3], matrix[2][3]], pose.positionM);
  }
  assert.equal(base.artifact.poseRun.unitsPolicy.conversionFactor, 0.001);
  assert.equal(base.artifact.poseRun.unitsPolicy.evidence.pass, true);
  assert.equal(base.artifact.poseRun.unitsPolicy.evidence.inputFrameUnits, 'mm');
  const spindle = base.artifact.deepSlice.hardpoints.find((hardpoint) => hardpoint.kind === 'DIRECTION');
  assert.equal(spindle.unit, '1');
  assert.ok(Math.abs(Math.hypot(...spindle.value) - 1) < 1e-9);
  assert.equal(base.artifact.poseRun.mirrorPolicy.rightSidePublished, false);
  assert.equal(base.artifact.poseRun.mirrorPolicy.evidence.pass, true);
  assert.equal(base.artifact.vehicleProject.identityPolicy.object3DNameIsNotIdentity, true);
});

test('no inherited source is auto-promoted to SOURCED or OEM', () => {
  for (const source of base.artifact.sourceEvidence) assert.notEqual(source.grade, 'SOURCED');
  const part = base.artifact.vehicleProject.partDefinitions.find((definition) => definition.partId === 'PART-20-001');
  assert.equal(part.evidenceInherited, 'SOURCED_SECONDARY');
  assert.notEqual(part.evidenceInherited, 'SOURCED');
});

test('negative: duplicate instance id is rejected', () => {
  const report = mutate((artifact) => {
    artifact.vehicleProject.partInstances.push(clone(artifact.vehicleProject.partInstances[0]));
  });
  expectCode(report, 'VEH-E-DUP-ID');
});

test('negative: an old or zero input revision is rejected', () => {
  const report = mutate((artifact) => {
    artifact.poseRun.inputRevision = 0;
  });
  expectCode(report, 'VEH-E-RUN-REVISION');
  expectCode(report, 'VEH-E-RUN-STALE');
});

test('negative: a wrong unit is rejected', () => {
  const report = mutate((artifact) => {
    artifact.poseRun.units = 'mm';
  });
  expectCode(report, 'VEH-E-UNIT');
});

test('negative: a GEN3-only part in the GEN1 variant is rejected', () => {
  const report = mutate((artifact) => {
    artifact.vehicleProject.partInstances.push({
      instanceId: 'PI-30-010-FL',
      partId: 'PART-30-010',
      assemblyInstanceId: 'AI-30-002-FL',
      frameId: 'FR-30-002-FL',
      corner: 'FL',
      ordinal: 1,
      quantity: { perAssembly: 1, sourceQtyPerCorner: 1 },
      quantitySemantics: 'ONE_PHYSICAL_PIECE_PER_INSTANCE',
      evidenceInherited: 'UNKNOWN',
      claimedEvidence: null,
      evidence: { identityBasis: 'UNKNOWN', valueBasis: 'UNKNOWN' },
      geometryStatus: 'NO_GEOMETRY'
    });
  });
  expectCode(report, 'VEH-E-VARIANT-MISMATCH');
});

test('negative: a solver joint without a hardpoint is rejected', () => {
  const report = mutate((artifact) => {
    artifact.deepSlice.joints.push({
      jointId: 'J-TEST-NO-HARDPOINT',
      type: 'REVOLUTE',
      frameA: 'FR-DS-CHASSIS-UPPER-FL',
      frameB: 'FR-DS-UPPER-ARM-FL',
      axisA: [1, 0, 0],
      axisB: [1, 0, 0],
      hardpoint: null,
      hardpointBasis: 'DEMO_ASSUMPTION',
      solverEligible: true,
      evidenceInherited: 'DEMO_ASSUMPTION'
    });
  });
  expectCode(report, 'VEH-E-JOINT-NO-HARDPOINT');
});

test('negative: a constraint id used as a joint is rejected', () => {
  const report = mutate((artifact) => {
    artifact.deepSlice.joints.push({
      jointId: 'CON-SUSP-UPPER-CIRCLE',
      type: 'FIXED',
      frameA: 'FR-VEHICLE',
      frameB: 'FR-VEHICLE',
      hardpoint: { center: [0, 0, 0] },
      hardpointBasis: 'DEMO_ASSUMPTION',
      solverEligible: false,
      evidenceInherited: 'DEMO_ASSUMPTION'
    });
  });
  expectCode(report, 'VEH-E-CONSTRAINT-AS-JOINT');
});

test('negative: an unknown joint type is rejected', () => {
  const report = mutate((artifact) => {
    artifact.deepSlice.joints.push({
      jointId: 'J-TEST-WELD',
      type: 'WELD',
      frameA: 'FR-VEHICLE',
      frameB: 'FR-VEHICLE',
      hardpoint: { center: [0, 0, 0] },
      hardpointBasis: 'DEMO_ASSUMPTION',
      solverEligible: false,
      evidenceInherited: 'DEMO_ASSUMPTION'
    });
  });
  expectCode(report, 'VEH-E-JOINT-TYPE');
});

test('negative: a non-normalized revolute axis is rejected', () => {
  const report = mutate((artifact) => {
    artifact.deepSlice.joints.push({
      jointId: 'J-TEST-AXIS',
      type: 'REVOLUTE',
      frameA: 'FR-VEHICLE',
      frameB: 'FR-VEHICLE',
      axisA: [2, 0, 0],
      axisB: [1, 0, 0],
      hardpoint: { center: [0, 0, 0] },
      hardpointBasis: 'DEMO_ASSUMPTION',
      solverEligible: false,
      evidenceInherited: 'DEMO_ASSUMPTION'
    });
  });
  expectCode(report, 'VEH-E-JOINT-AXIS');
});

test('negative: a joint attached to an unanchored R-16 mount frame is rejected', () => {
  const report = mutate((artifact) => {
    artifact.deepSlice.joints.push({
      jointId: 'J-TEST-UNANCHORED',
      type: 'FIXED',
      frameA: 'FR-20-002-FL',
      frameB: 'FR-DS-UPPER-ARM-FL',
      hardpoint: null,
      hardpointBasis: 'UNKNOWN',
      solverEligible: false,
      evidenceInherited: 'DEMO_ASSUMPTION'
    });
  });
  expectCode(report, 'VEH-E-JOINT-NO-HARDPOINT');
});

test('negative: publishing an unbound pose is rejected', () => {
  const report = mutate((artifact) => {
    artifact.poseRun.unboundPoses[0].published = true;
  });
  expectCode(report, 'VEH-E-POSE-UNBOUND-PUBLISHED');
});

test('negative: an evidence upgrade is rejected', () => {
  const report = mutate((artifact) => {
    artifact.vehicleProject.partInstances[0].claimedEvidence = 'SOURCED';
    artifact.vehicleProject.partInstances[0].evidenceInherited = 'UNKNOWN';
    artifact.vehicleProject.partInstances[0].sourceEvidenceIds = [];
  });
  expectCode(report, 'VEH-E-EVIDENCE-UPGRADE');
  expectCode(report, 'VEH-E-SOURCE-MISSING');
});

test('negative: a NO_GEOMETRY instance carrying a mesh is rejected', () => {
  const report = mutate((artifact) => {
    artifact.vehicleProject.partInstances[0].glb = 'fake.glb';
  });
  expectCode(report, 'VEH-E-GEOMETRY-CLAIM');
});

test('negative: a negative instance scale is rejected', () => {
  const report = mutate((artifact) => {
    artifact.poseRun.poses[0].scale = [-1, 1, 1];
  });
  expectCode(report, 'VEH-E-POSE-SCALE');
});

test('negative: a reflected display matrix without an explicit mirror is rejected', () => {
  const report = mutate((artifact) => {
    for (const row of artifact.poseRun.displayTransforms[0].matrixWorld.slice(0, 3)) row[0] = -row[0];
  });
  expectCode(report, 'VEH-E-MIRROR');
});

test('negative: a scaled display matrix is rejected', () => {
  const report = mutate((artifact) => {
    for (const row of artifact.poseRun.displayTransforms[0].matrixWorld.slice(0, 3)) row[0] *= 2;
  });
  expectCode(report, 'VEH-E-SCALE');
});

test('negative: a REF counted as BOM is rejected', () => {
  const report = mutate((artifact) => {
    artifact.vehicleProject.references[0].countedInBom = true;
  });
  expectCode(report, 'VEH-E-REF-BOM');
});

test('negative: a stale coverage summary is rejected', () => {
  const report = mutate((artifact) => {
    artifact.coverage.r16.partInstances = 999;
  });
  expectCode(report, 'VEH-E-COVERAGE-STALE');
});

test('negative: a stale quantity audit is rejected', () => {
  const report = mutate((artifact) => {
    artifact.qtyAudit.derivedMismatchIds = [];
  });
  expectCode(report, 'VEH-E-QTY-AUDIT');
});

test('negative: an invalid domain-view frame is rejected through validateProject', () => {
  const report = mutate((artifact) => {
    artifact.domainView.frames[0].units = 'mm';
  });
  expectCode(report, 'VEH-E-DOMAIN-VIEW');
});

test('negative: a pose pointing at a nonexistent canonical instance is rejected', () => {
  const report = mutate((artifact) => {
    artifact.poseRun.poses[0].instanceId = 'PI-99-999-FL';
  });
  expectCode(report, 'VEH-E-POSE-INSTANCE');
});

test('negative: a stale domain-view run is rejected', () => {
  const report = mutate((artifact) => {
    artifact.domainView.revision = 2;
  });
  expectCode(report, 'VEH-E-RUN-STALE');
});

test('negative: a missing decision referenced by a conflict is rejected', () => {
  const report = mutate((artifact) => {
    artifact.decisions = artifact.decisions.filter((decision) => decision.decisionId !== 'D-R22-01');
  });
  expectCode(report, 'VEH-E-DECISION');
});

test('negative: a tampered input hash is rejected by verifyInputHashes', () => {
  const artifact = clone(base.artifact);
  artifact.inputArtifacts[0].sha256 = '0'.repeat(64);
  const report = verifyInputHashes(artifact, root);
  assert.equal(report.ok, false);
  expectCode(report, 'VEH-E-INPUT-HASH');
});

test('liveness: a changed R-18 pose value flows into the integration output', () => {
  const changed = clone(inputs);
  const upper = changed.r18.designSample.instances.find((pose) => pose.instanceId === 'INST-SLA-UPPER-ARM-FL');
  upper.position = [upper.position[0] + 0.0123, upper.position[1], upper.position[2]];
  const next = buildIntegrationFromInputs(changed);
  const pose = next.artifact.poseRun.poses.find((item) => item.sourceInstanceId === 'INST-SLA-UPPER-ARM-FL');
  assert.equal(pose.positionM[0], upper.position[0]);
  assert.notEqual(pose.positionM[0], base.artifact.poseRun.poses.find((item) => item.sourceInstanceId === 'INST-SLA-UPPER-ARM-FL').positionM[0]);
});

test('liveness: an extra R-18 pose without a crosswalk is reported as unbound, not dropped', () => {
  const changed = clone(inputs);
  changed.r18.designSample.instances.push({
    instanceId: 'INST-SLA-NEW-FL',
    position: [1, 2, 3],
    quaternion: [0, 0, 0, 1],
    scale: [1, 1, 1],
    closureErrorM: 0
  });
  const next = buildIntegrationFromInputs(changed);
  const unbound = next.artifact.poseRun.unboundPoses.find((pose) => pose.sourceInstanceId === 'INST-SLA-NEW-FL');
  assert.ok(unbound);
  assert.equal(unbound.reason, 'NO_DECLARED_CROSSWALK');
  assert.equal(unbound.published, false);
  assert.equal(next.artifact.coverage.r18.poses, 6);
});

test('liveness: removing a core R-16 instance refuses to build a fake pose chain', () => {
  const changed = clone(inputs);
  changed.r16.partInstances = changed.r16.partInstances.filter((instance) => instance.instanceId !== 'PI-20-001-FL');
  assert.throws(
    () => buildIntegrationFromInputs(changed),
    /R22-E-DEEP-SLICE-POSE-MISSING/
  );
});

test('the source instance helper sees the same canonical row as the artifact', () => {
  const source = sourceInstance(inputs, 'PI-20-001-FL');
  const target = base.artifact.vehicleProject.partInstances.find((instance) => instance.instanceId === 'PI-20-001-FL');
  assert.equal(source.definitionId, target.partId);
  assert.equal(source.assemblyInstanceId, target.assemblyInstanceId);
});
