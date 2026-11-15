/**
 * CARLAB V2 isolated engineering project state.
 * No Three.js, DOM, CAD or physics dependency; pure data and testable commands.
 * v0.1 is a DEMO data contract, NOT the frozen cross-agent production schema.
 */
export const SCHEMA_VERSION = 'carlab.project-demo/0.1';
const clone = (v) => JSON.parse(JSON.stringify(v));

export function createDemoProject(seed) {
  if (!seed || seed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('不支持的演示工程版本');
  }
  const project = {
    schemaVersion: SCHEMA_VERSION,
    projectId: seed.projectId,
    name: seed.projectName,
    description: seed.description,
    asset: seed.asset,
    glbUnit: seed.glbUnit,
    assetBasis: seed.assetBasis,
    revision: 1,
    assemblies: clone(seed.assemblies),
    relations: clone(seed.relations || [])
  };
  assertProject(project, seed.catalog);
  return project;
}
export function createEmptyProject(seed, name = '未命名车辆工程') {
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: 'new-vehicle',
    name,
    description: '空白工程。当前仅开放示例零件编辑，尚未建立动力学求解器。',
    asset: seed.asset,
    glbUnit: 'm',
    assetBasis: 'DEMONSTRATION_PROTOTYPE',
    revision: 1,
    assemblies: [{
      assemblyId: 'root-assembly',
      name: '车辆主装配',
      source: 'DEMO',
      instances: []
    }],
    relations: []
  };
}
export function getInstances(project) {
  return project.assemblies.flatMap((assembly) =>
    assembly.instances.map((inst) => ({ ...inst, assemblyId: assembly.assemblyId })));
}
export function assertProject(project, catalog) {
  if (project.schemaVersion !== SCHEMA_VERSION) throw new Error('工程协议版本不匹配');
  if (!project.projectId || typeof project.name !== 'string' || !project.name.trim()) {
    throw new Error('工程标识或名称无效');
  }
  if (project.glbUnit !== 'm') throw new Error('当前网页只允许以米为单位的 GLB');
  if (!Array.isArray(project.assemblies) || project.assemblies.length === 0) {
    throw new Error('工程至少需要一个根总成');
  }
  const allowed = new Set(catalog.map((part) => part.partKey));
  if (allowed.size !== catalog.length) throw new Error('零件目录含重复 partKey');
  const assemblyIds = new Set(), instanceIds = new Set();
  for (const assembly of project.assemblies) {
    if (!assembly.assemblyId || assemblyIds.has(assembly.assemblyId)) {
      throw new Error('装配总成 ID 为空或重复');
    }
    assemblyIds.add(assembly.assemblyId);
    if (!Array.isArray(assembly.instances)) throw new Error('装配实例必须是数组');
    for (const inst of assembly.instances) {
      if (!inst.instanceId || instanceIds.has(inst.instanceId)) throw new Error('零件实例 ID 为空或重复');
      if (!allowed.has(inst.partKey)) throw new Error('未知零件型号：' + inst.partKey);
      if (typeof inst.visible !== 'boolean') throw new Error('实例 visible 必须是布尔值');
      if (inst.offset !== undefined && (
        !Array.isArray(inst.offset) || inst.offset.length !== 3 ||
        inst.offset.some((v) => !Number.isFinite(v) || Math.abs(v) > 100))) {
        throw new Error('零件位置偏移无效（米）');
      }
      instanceIds.add(inst.instanceId);
    }
  }
  for (const relation of project.relations || []) {
    if (!instanceIds.has(relation.from) || !instanceIds.has(relation.to)) {
      throw new Error('装配关系引用了不存在的零件');
    }
  }
  return true;
}
export class ProjectStore {
  constructor(project, catalog) {
    assertProject(project, catalog);
    this.project = clone(project);
    this.catalog = clone(catalog);
    this.selectedId = null;
    this.isolatedId = null;
    this.explode = 0;
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.nextId = 1;
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.snapshot()); }
  snapshot() {
    return {
      project: clone(this.project),
      selectedId: this.selectedId,
      isolatedId: this.isolatedId,
      explode: this.explode,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      count: getInstances(this.project).length
    };
  }
  hasInstance(id) { return getInstances(this.project).some((x) => x.instanceId === id); }
  transact(mutator) {
    const next = clone(this.project);
    mutator(next);
    next.revision += 1;
    assertProject(next, this.catalog);
    this.undoStack.push(clone(this.project));
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack.length = 0;
    this.project = next;
    if (this.selectedId && !this.hasInstance(this.selectedId)) this.selectedId = null;
    if (this.isolatedId && !this.hasInstance(this.isolatedId)) this.isolatedId = null;
    this.emit();
  }
  select(id) {
    if (id !== null && !this.hasInstance(id)) throw new Error('所选零件不存在');
    this.selectedId = id;
    this.emit();
  }
  add(partKey) {
    if (!this.catalog.some((part) => part.partKey === partKey)) throw new Error('目录中没有这个零件');
    let id;
    this.transact((next) => {
      const existing = new Set(getInstances(next).map((x) => x.instanceId));
      do { id = 'inst-' + partKey + '-' + String(this.nextId++).padStart(3, '0'); } while (existing.has(id));
      const count = getInstances(next).length;
      next.assemblies[0].instances.push({
        instanceId: id, partKey, visible: true,
        offset: [count ? 0.027 * Math.ceil(count / 2) * (count % 2 ? 1 : -1) : 0, 0, 0]
      });
    });
    this.select(id);
    return id;
  }
  remove(id) {
    if (!this.hasInstance(id)) throw new Error('无法删除不存在的零件');
    this.transact((next) => {
      for (const assy of next.assemblies) assy.instances = assy.instances.filter((x) => x.instanceId !== id);
      next.relations = (next.relations || []).filter((x) => x.from !== id && x.to !== id);
    });
  }
  toggleVisibility(id) {
    if (!this.hasInstance(id)) throw new Error('无法更改不存在的零件');
    this.transact((next) => {
      for (const assy of next.assemblies) {
        const match = assy.instances.find((inst) => inst.instanceId === id);
        if (match) match.visible = !match.visible;
      }
    });
  }
  showAll() {
    const hidden = getInstances(this.project).some((inst) => !inst.visible);
    if (hidden) {
      this.transact((next) => {
        for (const assy of next.assemblies) {
          for (const inst of assy.instances) inst.visible = true;
        }
      });
    }
    this.isolatedId = null;
    this.emit();
  }
  isolate(id) {
    if (id !== null && !this.hasInstance(id)) throw new Error('无法隔离不存在的零件');
    this.isolatedId = this.isolatedId === id ? null : id;
    this.emit();
  }
  setExplode(t) {
    if (!Number.isFinite(t)) throw new Error('拆解进度必须是有限数值');
    this.explode = Math.max(0, Math.min(1, t));
    this.emit();
  }
  replace(project) {
    assertProject(project, this.catalog);
    this.transact((next) => {
      for (const key of Object.keys(next)) delete next[key];
      Object.assign(next, clone(project));
      next.revision = project.revision || 1;
    });
    this.selectedId = null; this.isolatedId = null; this.explode = 0;
    this.emit();
  }
  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(clone(this.project));
    this.project = this.undoStack.pop();
    if (this.selectedId && !this.hasInstance(this.selectedId)) this.selectedId = null;
    if (this.isolatedId && !this.hasInstance(this.isolatedId)) this.isolatedId = null;
    this.emit(); return true;
  }
  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(clone(this.project));
    this.project = this.redoStack.pop();
    if (this.selectedId && !this.hasInstance(this.selectedId)) this.selectedId = null;
    if (this.isolatedId && !this.hasInstance(this.isolatedId)) this.isolatedId = null;
    this.emit(); return true;
  }
  exportDocument() {
    assertProject(this.project, this.catalog);
    return JSON.stringify(this.project, null, 2) + '\n';
  }
}
