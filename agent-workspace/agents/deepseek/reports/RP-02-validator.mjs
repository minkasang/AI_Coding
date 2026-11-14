import fs from 'node:fs';
import path from 'node:path';

const root = 'F:/project/cyq/AI_Coding/car/docs/planning/evidence';
const graphPath = process.argv[2] || path.join(root, 'RP-02-interface-graph.example.json');
const casesPath = process.argv[3] || path.join(root, 'RP-02-test-cases.json');

const UNIT_TABLE = {
  'N': { dim: { M: 1, L: 1, T: -2 }, canon: 'N', scale: 1 },
  'N*m': { dim: { M: 1, L: 2, T: -2 }, canon: 'N*m', scale: 1 },
  'm': { dim: { L: 1 }, canon: 'm', scale: 1 },
  'mm': { dim: { L: 1 }, canon: 'm', scale: 0.001 },
  'cm': { dim: { L: 1 }, canon: 'm', scale: 0.01 },
  'm/s': { dim: { L: 1, T: -1 }, canon: 'm/s', scale: 1 },
  'm/s^2': { dim: { L: 1, T: -2 }, canon: 'm/s^2', scale: 1 },
  'kg': { dim: { M: 1 }, canon: 'kg', scale: 1 },
  'kg*m^2': { dim: { M: 1, L: 2 }, canon: 'kg*m^2', scale: 1 },
  'N/m': { dim: { M: 1, T: -2 }, canon: 'N/m', scale: 1 },
  'N*s/m': { dim: { M: 1, T: -1 }, canon: 'N*s/m', scale: 1 },
  'V': { dim: { M: 1, L: 2, T: -3, I: -1 }, canon: 'V', scale: 1 },
  'A': { dim: { I: 1 }, canon: 'A', scale: 1 },
  'W': { dim: { M: 1, L: 2, T: -3 }, canon: 'W', scale: 1 },
  'J': { dim: { M: 1, L: 2, T: -2 }, canon: 'J', scale: 1 },
  'ohm': { dim: { M: 1, L: 2, T: -3, I: -2 }, canon: 'ohm', scale: 1 },
  'F': { dim: { M: -1, L: -2, T: 4, I: 2 }, canon: 'F', scale: 1 },
  'C': { dim: { I: 1, T: 1 }, canon: 'C', scale: 1 },
  'Hz': { dim: { T: -1 }, canon: 'Hz', scale: 1 },
  'Pa': { dim: { M: 1, L: -1, T: -2 }, canon: 'Pa', scale: 1 },
  'bar': { dim: { M: 1, L: -1, T: -2 }, canon: 'Pa', scale: 1e5 },
  'MPa': { dim: { M: 1, L: -1, T: -2 }, canon: 'Pa', scale: 1e6 },
  'kPa': { dim: { M: 1, L: -1, T: -2 }, canon: 'Pa', scale: 1e3 },
  'm^3/s': { dim: { L: 3, T: -1 }, canon: 'm^3/s', scale: 1 },
  'L/min': { dim: { L: 3, T: -1 }, canon: 'm^3/s', scale: 1 / 60000 },
  'kg/s': { dim: { M: 1, T: -1 }, canon: 'kg/s', scale: 1 },
  'K': { dim: { K: 1 }, canon: 'K', scale: 1 },
  '°C': { dim: { K: 1 }, canon: 'K', scale: 1, offset: 273.15 },
  'kg/m^3': { dim: { M: 1, L: -3 }, canon: 'kg/m^3', scale: 1 },
  'Pa*s': { dim: { M: 1, L: -1, T: -1 }, canon: 'Pa*s', scale: 1 },
  'W/m^2': { dim: { M: 1, T: -3 }, canon: 'W/m^2', scale: 1 },
  'W/(m^2*K)': { dim: { M: 1, T: -3, K: -1 }, canon: 'W/(m^2*K)', scale: 1 },
  'J/(kg*K)': { dim: { L: 2, T: -2, K: -1 }, canon: 'J/(kg*K)', scale: 1 },
  'bit/s': { dim: { T: -1 }, canon: 'bit/s', scale: 1 },
  'kbit/s': { dim: { T: -1 }, canon: 'bit/s', scale: 1e3 },
  'Mbit/s': { dim: { T: -1 }, canon: 'bit/s', scale: 1e6 },
  's': { dim: { T: 1 }, canon: 's', scale: 1 },
  'rad': { dim: {}, canon: 'rad', scale: 1 },
  'rad/s': { dim: { T: -1 }, canon: 'rad/s', scale: 1 },
  'rad/s^2': { dim: { T: -2 }, canon: 'rad/s^2', scale: 1 },
  'deg': { dim: {}, canon: 'rad', scale: Math.PI / 180 },
  'rpm': { dim: { T: -1 }, canon: 'rad/s', scale: (2 * Math.PI) / 60 },
  'km/h': { dim: { L: 1, T: -1 }, canon: 'm/s', scale: 1 / 3.6 },
  'mA': { dim: { I: 1 }, canon: 'A', scale: 1e-3 },
  'kW': { dim: { M: 1, L: 2, T: -3 }, canon: 'W', scale: 1e3 },
  'kJ': { dim: { M: 1, L: 2, T: -2 }, canon: 'J', scale: 1e3 },
  'Ah': { dim: { I: 1, T: 1 }, canon: 'C', scale: 3600 },
  'kWh': { dim: { M: 1, L: 2, T: -2 }, canon: 'J', scale: 3.6e6 },
  '1': { dim: {}, canon: '1', scale: 1 },
  '%': { dim: {}, canon: '1', scale: 0.01 }
};

const KIND_CANON = {
  force: 'N', torque: 'N*m', displacement: 'm', velocity: 'm/s', acceleration: 'm/s^2',
  mass: 'kg', inertia: 'kg*m^2', stiffness: 'N/m', damping: 'N*s/m',
  voltage: 'V', current: 'A', power: 'W', energy: 'J', resistance: 'ohm', capacitance: 'F', charge: 'C', frequency: 'Hz',
  pressure: 'Pa', volumetric_flow: 'm^3/s', mass_flow: 'kg/s', temperature: 'K', density: 'kg/m^3', viscosity: 'Pa*s',
  thermal_power: 'W', heat_flux: 'W/m^2', heat_transfer_coefficient: 'W/(m^2*K)', specific_heat: 'J/(kg*K)',
  friction_coefficient: '1', slip_ratio: '1', signal: '1', data_rate: 'bit/s', latency: 's',
  angle: 'rad', angular_velocity: 'rad/s', angular_acceleration: 'rad/s^2', ratio: '1'
};

const RIGID = new Set(['FIXED_JOINT', 'BOLTED', 'WELDED', 'PRESS_FIT', 'SPLINE_FIXED']);
const FRAME_ROLES = new Set(['PHYSICAL_CONNECTION', 'FLUID_CIRCUIT', 'ELEC_POWER', 'THERMAL_PATH', 'CONTACT', 'CONSTRAINT']);
const ENGINEERING_ROLES = new Set(['PHYSICAL_CONNECTION', 'FLUID_CIRCUIT', 'ELEC_POWER', 'THERMAL_PATH', 'CONTACT', 'CONSTRAINT']);
const LEVEL_ORDER = { OPEN: 0, ASSUMPTION: 1, ENGINEERING_DERIVATION: 2, EVIDENCE: 3 };

function normUnit(u) {
  if (typeof u !== 'string' || u.length === 0) return null;
  return u.replace(/·/g, '*').replace(/\s+/g, '');
}
function unitInfo(u) {
  const n = normUnit(u);
  if (!n) return null;
  return UNIT_TABLE[n] || null;
}
function sameDim(a, b) {
  const ka = Object.keys(a).filter(k => a[k] !== 0).sort();
  const kb = Object.keys(b).filter(k => b[k] !== 0).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}
function dist(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}
function angleBetween(a, b) {
  const na = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2);
  const nb = Math.sqrt(b[0] ** 2 + b[1] ** 2 + b[2] ** 2);
  if (na === 0 || nb === 0) return 180;
  const dot = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (na * nb);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function getByPath(obj, p) {
  const parts = p.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (/^\d+$/.test(part)) cur = cur[Number(part)];
    else cur = cur[part];
  }
  return cur;
}
function setByPath(obj, p, value) {
  const parts = p.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (/^\d+$/.test(part)) cur = cur[Number(part)];
    else {
      if (cur[part] == null || typeof cur[part] !== 'object') cur[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      cur = cur[part];
    }
  }
  const last = parts[parts.length - 1];
  if (/^\d+$/.test(last)) cur[Number(last)] = value;
  else cur[last] = value;
}

function applyPatch(graph, patch) {
  for (const op of patch || []) {
    if (op.op === 'removeEdge') {
      graph.edges = graph.edges.filter(e => e.edgeId !== op.edgeId);
    } else if (op.op === 'addEdge') {
      graph.edges.push(clone(op.edge));
    } else if (op.op === 'addNode') {
      graph.nodes.push(clone(op.node));
    } else if (op.op === 'setEdge') {
      const e = graph.edges.find(x => x.edgeId === op.edgeId);
      if (!e) throw new Error(`patch setEdge: edge ${op.edgeId} not found`);
      setByPath(e, op.path, clone(op.value));
    } else if (op.op === 'setPort') {
      const n = graph.nodes.find(x => x.nodeId === op.nodeId);
      if (!n) throw new Error(`patch setPort: node ${op.nodeId} not found`);
      const p = n.ports.find(x => x.portId === op.portId);
      if (!p) throw new Error(`patch setPort: port ${op.nodeId}/${op.portId} not found`);
      setByPath(p, op.path, clone(op.value));
    } else if (op.op === 'setNode') {
      const n = graph.nodes.find(x => x.nodeId === op.nodeId);
      if (!n) throw new Error(`patch setNode: node ${op.nodeId} not found`);
      setByPath(n, op.path, clone(op.value));
    } else if (op.op === 'setGraph') {
      setByPath(graph, op.path, clone(op.value));
    } else {
      throw new Error(`unknown patch op ${op.op}`);
    }
  }
}

function buildIndex(graph) {
  const nodes = new Map();
  const ports = new Map();
  const portKey = (nodeId, portId) => `${nodeId}/${portId}`;
  for (const n of graph.nodes) {
    if (!nodes.has(n.nodeId)) nodes.set(n.nodeId, n);
    for (const p of n.ports || []) {
      const k = portKey(n.nodeId, p.portId);
      if (!ports.has(k)) ports.set(k, { node: n, port: p });
    }
  }
  return { nodes, ports, portKey };
}

function validate(graph) {
  const errors = [];
  const warnings = [];
  const addError = (code, message, ref) => errors.push({ code, message, ref });
  const idx = buildIndex(graph);
  const { nodes, ports, portKey } = idx;

  // duplicate IDs
  const nodeIds = new Set();
  for (const n of graph.nodes) {
    if (nodeIds.has(n.nodeId)) addError('INTF-E002', `duplicate nodeId ${n.nodeId}`, n.nodeId);
    nodeIds.add(n.nodeId);
    const pids = new Set();
    for (const p of n.ports || []) {
      if (pids.has(p.portId)) addError('INTF-E002', `duplicate portId ${n.nodeId}/${p.portId}`, `${n.nodeId}/${p.portId}`);
      pids.add(p.portId);
    }
  }
  const edgeIds = new Set();
  for (const e of graph.edges) {
    if (edgeIds.has(e.edgeId)) addError('INTF-E002', `duplicate edgeId ${e.edgeId}`, e.edgeId);
    edgeIds.add(e.edgeId);
  }

  const edgeCount = new Map();
  const renderOnly = new Set(graph.nodes.filter(n => n.renderOnly).map(n => n.nodeId));
  const assumptionEdges = [];
  const openEdges = [];
  const missingRating = [];

  for (const e of graph.edges) {
    const from = ports.get(portKey(e.from?.nodeId, e.from?.portId));
    const to = ports.get(portKey(e.to?.nodeId, e.to?.portId));
    if (!from || !to) {
      addError('INTF-E001', `edge ${e.edgeId} endpoint missing`, e.edgeId);
      continue;
    }
    const fromK = portKey(e.from.nodeId, e.from.portId);
    const toK = portKey(e.to.nodeId, e.to.portId);
    edgeCount.set(fromK, (edgeCount.get(fromK) || 0) + 1);
    edgeCount.set(toK, (edgeCount.get(toK) || 0) + 1);

    // render-only
    if (ENGINEERING_ROLES.has(e.edgeRole) && (renderOnly.has(e.from.nodeId) || renderOnly.has(e.to.nodeId))) {
      addError('INTF-E013', `edge ${e.edgeId} uses render-only node as engineering connection`, e.edgeId);
    }

    // class + capability
    if (from.port.interfaceClass !== e.interfaceClass) addError('INTF-E004', `edge ${e.edgeId} class vs from port ${from.port.interfaceClass}`, e.edgeId);
    if (to.port.interfaceClass !== e.interfaceClass) addError('INTF-E004', `edge ${e.edgeId} class vs to port ${to.port.interfaceClass}`, e.edgeId);
    const fProv = from.port.provides || [];
    const tAcc = to.port.accepts || [];
    if (!fProv.includes(e.capability)) addError('INTF-E004', `edge ${e.edgeId} capability ${e.capability} not provided by from port`, e.edgeId);
    if (!tAcc.includes(e.capability)) addError('INTF-E004', `edge ${e.edgeId} capability ${e.capability} not accepted by to port`, e.edgeId);
    if (e.direction === 'BIDIRECTIONAL') {
      if (!(to.port.provides || []).includes(e.capability)) addError('INTF-E004', `edge ${e.edgeId} reverse capability not provided by to port`, e.edgeId);
      if (!(from.port.accepts || []).includes(e.capability)) addError('INTF-E004', `edge ${e.edgeId} reverse capability not accepted by from port`, e.edgeId);
    }

    // direction / reverse rating
    if (e.graphRole === 'POWER_FLOW' && e.direction === 'BIDIRECTIONAL' && !e.flowDirection) {
      addError('INTF-E005', `edge ${e.edgeId} bidirectional POWER_FLOW lacks nominal flowDirection`, e.edgeId);
    }
    const needsReverse = e.direction === 'BIDIRECTIONAL' &&
      !['MECH_FORCE_MOTION', 'CONTACT_ENVIRONMENT'].includes(e.interfaceClass) &&
      !(e.interfaceClass === 'INFO_CONTROL' && e.edgeRole === 'SIGNAL_LINK');
    if (needsReverse) {
      if (!e.reverseRating) addError('INTF-E005', `edge ${e.edgeId} bidirectional ${e.interfaceClass} lacks reverseRating`, e.edgeId);
      else {
        const ri = unitInfo(e.reverseRating.unit);
        if (!ri) addError('INTF-E014', `edge ${e.edgeId} reverseRating unknown unit`, e.edgeId);
        else if (ri.canon !== KIND_CANON[e.reverseRating.kind]) addError('INTF-E003', `edge ${e.edgeId} reverseRating kind/unit mismatch`, e.edgeId);
      }
    }

    // quantity
    const q = e.quantity || {};
    const unknownQ = q.unknown === true;
    let qUnit = null;
    if (!unknownQ) {
      if (!q.kind || !KIND_CANON[q.kind]) addError('INTF-E014', `edge ${e.edgeId} missing/unknown quantity kind`, e.edgeId);
      qUnit = unitInfo(q.unit);
      if (!qUnit) addError('INTF-E014', `edge ${e.edgeId} missing/unknown unit ${JSON.stringify(q.unit)}`, e.edgeId);
      else if (q.kind && KIND_CANON[q.kind]) {
        const canonInfo = unitInfo(KIND_CANON[q.kind]);
        if (!sameDim(qUnit.dim, canonInfo.dim) || qUnit.canon !== canonInfo.canon) {
          addError('INTF-E003', `edge ${e.edgeId} unit ${q.unit} does not match quantity ${q.kind}`, e.edgeId);
        } else if (qUnit.scale !== 1 && q.conversion == null) {
          addError('INTF-E019', `edge ${e.edgeId} non-SI scale ${q.unit} lacks explicit conversion`, e.edgeId);
        }
      }
      if (q.nominal == null) warnings.push({ code: 'INTF-W003', edgeId: e.edgeId, message: 'nominal value not specified' });
    } else {
      openEdges.push(e.edgeId);
    }

    // ratings
    if (!unknownQ && q.kind) {
      for (const [side, port] of [['from', from], ['to', to]]) {
        const ratings = port.port.rating || [];
        const rt = ratings.find(x => x.kind === q.kind);
        if (!rt) { missingRating.push({ edgeId: e.edgeId, side, kind: q.kind }); continue; }
        const rUnit = unitInfo(rt.unit);
        if (!rUnit) addError('INTF-E014', `edge ${e.edgeId} ${side} rating unknown unit`, e.edgeId);
        else if (qUnit) {
          if (rUnit.canon !== qUnit.canon) addError('INTF-E003', `edge ${e.edgeId} ${side} rating unit dimension mismatch`, e.edgeId);
          else if (rUnit.scale !== qUnit.scale && rt.unitConversion == null) {
            addError('INTF-E019', `edge ${e.edgeId} ${side} rating unit scale ${rt.unit} lacks conversion`, e.edgeId);
          } else if (rt.max != null && q.max != null && q.max > rt.max) {
            addError('INTF-E006', `edge ${e.edgeId} max ${q.max} ${q.unit} exceeds ${side} rating ${rt.max} ${rt.unit}`, e.edgeId);
          }
        }
      }
    }

    // voltage class
    if (e.interfaceClass === 'ELEC_POWER' && e.voltageClass) {
      for (const side of ['from', 'to']) {
        const p = side === 'from' ? from.port : to.port;
        if (p.voltageClass !== e.voltageClass) addError('INTF-E017', `edge ${e.edgeId} voltageClass ${e.voltageClass} vs ${side} ${p.voltageClass}`, e.edgeId);
      }
    }

    // fluid medium
    if (e.interfaceClass === 'FLUID_HYDRAULIC' && e.medium) {
      for (const side of ['from', 'to']) {
        const p = side === 'from' ? from.port : to.port;
        if (p.medium !== e.medium) addError('INTF-E016', `edge ${e.edgeId} medium ${e.medium} vs ${side} ${p.medium}`, e.edgeId);
      }
    }

    // thermal limits
    if (e.temperatureMaxK != null && from.port.limits?.maxTemperatureK != null && e.temperatureMaxK > from.port.limits.maxTemperatureK) {
      addError('INTF-E018', `edge ${e.edgeId} temperature ${e.temperatureMaxK}K exceeds from limit ${from.port.limits.maxTemperatureK}K`, e.edgeId);
    }
    if (e.toTemperatureMaxK != null && to.port.limits?.maxTemperatureK != null && e.toTemperatureMaxK > to.port.limits.maxTemperatureK) {
      addError('INTF-E018', `edge ${e.edgeId} toTemperature ${e.toTemperatureMaxK}K exceeds to limit ${to.port.limits.maxTemperatureK}K`, e.edgeId);
    }

    // frames
    if (FRAME_ROLES.has(e.edgeRole)) {
      if (!from.port.frame || !to.port.frame) {
        addError('INTF-E007', `edge ${e.edgeId} requires both frames`, e.edgeId);
      } else if (RIGID.has(e.subtype)) {
        const tol = Math.max(from.port.frame.toleranceM ?? 0, to.port.frame.toleranceM ?? 0);
        const d = dist(from.port.frame.originM, to.port.frame.originM);
        if (d > tol + 1e-12) addError('INTF-E008', `edge ${e.edgeId} rigid frame distance ${d.toFixed(6)}m > tolerance ${tol}m`, e.edgeId);
        const ang = angleBetween(from.port.frame.axes?.x ?? [1, 0, 0], to.port.frame.axes?.x ?? [1, 0, 0]);
        const angTol = Math.max(from.port.frame.angularToleranceDeg ?? 0, to.port.frame.angularToleranceDeg ?? 0);
        if (ang > angTol + 1e-9) addError('INTF-E008', `edge ${e.edgeId} rigid frame angle ${ang.toFixed(3)}deg > tolerance ${angTol}deg`, e.edgeId);
      } else {
        if (e.spanM == null || e.maxAngleDeg == null) addError('INTF-E007', `edge ${e.edgeId} compliant link lacks spanM/maxAngleDeg`, e.edgeId);
      }
    }

    // evidence
    const actual = e.evidence?.level ?? 'OPEN';
    const required = e.validation?.requiredLevel ?? actual;
    if ((LEVEL_ORDER[actual] ?? 0) < (LEVEL_ORDER[required] ?? 0)) {
      addError('INTF-E015', `edge ${e.edgeId} evidence ${actual} below required ${required}`, e.edgeId);
    }
    if (actual === 'OPEN' || unknownQ || (e.unknowns || []).length > 0) openEdges.push(e.edgeId);
    if (actual === 'ASSUMPTION') assumptionEdges.push(e.edgeId);
  }

  // port degree
  for (const [k, count] of edgeCount.entries()) {
    const { port } = ports.get(k);
    const max = port.maxConnections ?? 1;
    if (count > max) addError('INTF-E010', `port ${k} has ${count} edges > maxConnections ${max}`, k);
  }

  // required ports
  for (const [k, { port }] of ports.entries()) {
    if (port.required && !edgeCount.has(k)) addError('INTF-E011', `required port ${k} is unconnected`, k);
  }

  // cycles
  const powerEdges = graph.edges.filter(e => e.graphRole === 'POWER_FLOW');
  const powerAdj = new Map();
  for (const e of powerEdges) {
    const dirs = [];
    if (e.flowDirection === 'TO_FROM' || e.direction === 'TO_FROM') dirs.push([e.to.nodeId, e.from.nodeId]);
    else if (e.flowDirection === 'FROM_TO' || e.direction === 'FROM_TO') dirs.push([e.from.nodeId, e.to.nodeId]);
    else { dirs.push([e.from.nodeId, e.to.nodeId], [e.to.nodeId, e.from.nodeId]); }
    for (const [a, b] of dirs) {
      if (!powerAdj.has(a)) powerAdj.set(a, []);
      powerAdj.get(a).push(b);
    }
  }
  const pVisiting = new Set(); const pDone = new Set();
  let powerCycle = false;
  function dfsPower(n) {
    if (pVisiting.has(n)) { powerCycle = true; return; }
    if (pDone.has(n)) return;
    pVisiting.add(n);
    for (const m of powerAdj.get(n) || []) dfsPower(m);
    pVisiting.delete(n); pDone.add(n);
  }
  for (const n of powerAdj.keys()) dfsPower(n);
  if (powerCycle) addError('INTF-E009', 'POWER_FLOW graph contains a directed cycle', 'graphRole:POWER_FLOW');

  const fluidEdges = graph.edges.filter(e => e.graphRole === 'FLUID_LOOP');
  const fluidAdj = new Map();
  const edgeByPair = new Map();
  for (const e of fluidEdges) {
    const a = e.direction === 'TO_FROM' ? e.to.nodeId : e.from.nodeId;
    const b = e.direction === 'TO_FROM' ? e.from.nodeId : e.to.nodeId;
    if (!fluidAdj.has(a)) fluidAdj.set(a, []);
    fluidAdj.get(a).push({ node: b, edge: e });
    edgeByPair.set(`${a}->${b}`, e);
  }
  const fVisiting = new Set(); const fDone = new Set(); const fStack = [];
  let badLoop = false;
  function dfsFluid(n) {
    if (fVisiting.has(n)) {
      const i = fStack.findIndex(x => x.node === n);
      if (i >= 0) {
        const cycleEdges = fStack.slice(i).map(x => x.edge);
        if (cycleEdges.some(e => e.loop !== true)) badLoop = true;
      }
      return;
    }
    if (fDone.has(n)) return;
    fVisiting.add(n);
    for (const { node: m, edge: e } of fluidAdj.get(n) || []) {
      fStack.push({ node: n, edge: e });
      dfsFluid(m);
      fStack.pop();
    }
    fVisiting.delete(n); fDone.add(n);
  }
  for (const n of fluidAdj.keys()) dfsFluid(n);
  if (badLoop) addError('INTF-E009', 'FLUID_LOOP cycle contains edge without loop:true', 'graphRole:FLUID_LOOP');

  // aggregate warnings
  if (openEdges.length) warnings.push({ code: 'INTF-W001', message: 'OPEN/unknown interfaces (not a structural failure)', edgeIds: [...new Set(openEdges)] });
  if (assumptionEdges.length) warnings.push({ code: 'INTF-W002', message: 'ASSUMPTION-level interfaces', edgeIds: assumptionEdges });
  if (missingRating.length) warnings.push({ code: 'INTF-W003', message: 'missing port rating for transmitted quantity', details: missingRating });

  const uniqErrors = [];
  const seen = new Set();
  for (const e of errors) {
    const k = `${e.code}|${e.ref}|${e.message}`;
    if (!seen.has(k)) { seen.add(k); uniqErrors.push(e); }
  }
  return { ok: uniqErrors.length === 0, errors: uniqErrors, warnings, summary: { nodes: graph.nodes.length, edges: graph.edges.length } };
}

function edgeAllows(e, fromKey, toKey) {
  if (e.direction === 'FROM_TO') return fromKey === `${e.from.nodeId}/${e.from.portId}` && toKey === `${e.to.nodeId}/${e.to.portId}`;
  if (e.direction === 'TO_FROM') return fromKey === `${e.to.nodeId}/${e.to.portId}` && toKey === `${e.from.nodeId}/${e.from.portId}`;
  return (fromKey === `${e.from.nodeId}/${e.from.portId}` && toKey === `${e.to.nodeId}/${e.to.portId}`) ||
         (fromKey === `${e.to.nodeId}/${e.to.portId}` && toKey === `${e.from.nodeId}/${e.from.portId}`);
}

function pathCheck(graph, from, to, classes) {
  const start = `${from.nodeId}/${from.portId}`;
  const goal = `${to.nodeId}/${to.portId}`;
  const allowed = new Set(classes || []);
  const adj = new Map();
  for (const e of graph.edges) {
    if (allowed.size && !allowed.has(e.interfaceClass)) continue;
    const a = `${e.from.nodeId}/${e.from.portId}`;
    const b = `${e.to.nodeId}/${e.to.portId}`;
    if (edgeAllows(e, a, b)) {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push(b);
    }
    if (edgeAllows(e, b, a)) {
      if (!adj.has(b)) adj.set(b, []);
      adj.get(b).push(a);
    }
  }
  const q = [start]; const seen = new Set([start]); const prev = new Map();
  while (q.length) {
    const cur = q.shift();
    if (cur === goal) break;
    for (const nxt of adj.get(cur) || []) {
      if (!seen.has(nxt)) { seen.add(nxt); prev.set(nxt, cur); q.push(nxt); }
    }
  }
  if (!seen.has(goal)) return { ok: false, code: 'INTF-E020', message: `no ${classes?.join('/') || 'any'} path from ${start} to ${goal}`, path: [] };
  const p = []; let cur = goal;
  while (cur && cur !== start) { p.push(cur); cur = prev.get(cur); }
  p.push(start); p.reverse();
  return { ok: true, path: p };
}

function impactCheck(graph, changed, declared) {
  const dep = graph.variantDependencies || { edges: [] };
  const closure = new Set(changed);
  let changedFlag = true;
  while (changedFlag) {
    changedFlag = false;
    for (const e of dep.edges) {
      if (closure.has(e.from) && !closure.has(e.to)) { closure.add(e.to); changedFlag = true; }
    }
  }
  const declaredSet = new Set(declared);
  const roots = new Set(changed);
  const missing = [...closure].filter(x => !declaredSet.has(x) && !roots.has(x)).sort();
  if (missing.length) return { ok: false, code: 'INTF-E012', message: 'impact closure missing declared nodes', missing, closure: [...closure].sort() };
  return { ok: true, missing: [], closure: [...closure].sort() };
}

function checkExpect(actual, expect) {
  const codes = (actual.errors || []).map(e => e.code);
  if (actual.code) codes.push(actual.code);
  const warnings = (actual.warnings || []).map(w => w.code);
  const problems = [];
  if (expect.ok !== undefined && actual.ok !== expect.ok) problems.push(`ok expected ${expect.ok} got ${actual.ok}`);
  for (const c of expect.codesInclude || []) if (!codes.includes(c)) problems.push(`missing code ${c}`);
  for (const c of expect.codesExclude || []) if (codes.includes(c)) problems.push(`unexpected code ${c}`);
  for (const c of expect.warningsInclude || []) if (!warnings.includes(c)) problems.push(`missing warning ${c}`);
  if (expect.missingInclude) {
    for (const m of expect.missingInclude) if (!(actual.missing || []).includes(m)) problems.push(`missing impact node ${m}`);
  }
  return problems;
}

const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const testDoc = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const results = [];

for (const tc of testDoc.cases) {
  const g = clone(graph);
  applyPatch(g, tc.patch);
  let actual;
  if (tc.op === 'validate') actual = validate(g);
  else if (tc.op === 'path') actual = pathCheck(g, tc.from, tc.to, tc.classes);
  else if (tc.op === 'impact') actual = impactCheck(g, tc.changed, tc.declared);
  else throw new Error(`unknown op ${tc.op}`);
  const problems = checkExpect(actual, tc.expect);
  results.push({
    caseId: tc.caseId,
    title: tc.title,
    pass: problems.length === 0,
    problems,
    expected: tc.expect,
    actual: {
      ok: actual.ok,
      code: actual.code,
      errorCodes: [...new Set((actual.errors || []).map(e => e.code))],
      warningCodes: [...new Set((actual.warnings || []).map(w => w.code))],
      missing: actual.missing,
      path: actual.path
    }
  });
}

const passed = results.filter(r => r.pass).length;
const out = {
  graph: graphPath,
  cases: casesPath,
  baseGraph: (() => { const v = validate(graph); return { ok: v.ok, errors: v.errors.length, warnings: v.warnings.map(w => w.code), summary: v.summary }; })(),
  totals: { cases: results.length, passed, failed: results.length - passed },
  results
};
console.log(JSON.stringify(out, null, 2));
process.exit(passed === results.length ? 0 : 1);
