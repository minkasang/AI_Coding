/**
 * 解释层：不改已验收的求解器，不新增正式 P17。
 * 变型规则来自 R-01 提案；求解错误来自 R-09。两者都还不是冻结规范。
 */
import { solveCorner } from '../kinematics/solve.mjs';

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

export function radialSpan(point, axisA, axisB) {
  const axis = sub(axisB, axisA);
  const length = norm(axis);
  if (length < 1e-12) return null;
  const direction = axis.map((value) => value / length);
  const offset = sub(point, axisA);
  const along = dot(offset, direction);
  return norm(sub(offset, direction.map((value) => value * along)));
}

function rule(id, failureType, message, detail) {
  return { rule: id, failureType, message, detail, status: 'PROPOSAL' };
}

export function checkVariantStatics(variant = {}) {
  const failures = [];
  const scaleKeys = ['scale', 'globalScale', 'meshScale'];
  const present = scaleKeys.filter((key) => Object.prototype.hasOwnProperty.call(variant, key));
  if (present.length) {
    failures.push(rule('P14', 'GLOBAL_SCALE_FORBIDDEN', '变型顶层不允许用缩放代替轮距、轴距或镜像。', { keys: present }));
  }
  const openGaps = [];
  if (variant.nestedScale) {
    openGaps.push({
      rule: null,
      failureType: 'SCALE_NOT_COVERED_BY_P14',
      message: '嵌套缩放不在 R-01 的顶层 P14 检查里。这里只记录缺口，不新增规则编号。',
      detail: { nestedScale: variant.nestedScale },
      status: 'OPEN'
    });
  }
  const rail = variant.railLengthM;
  const wheelbase = variant.wheelbaseM;
  const overhang = variant.minOverhangM;
  if ([rail, wheelbase, overhang].every((value) => typeof value === 'number')) {
    const required = wheelbase + 2 * overhang;
    if (rail + 1e-9 < required) {
      failures.push(rule('P08', 'MODULE_LENGTH_INSUFFICIENT', '纵梁短于轴距加两端最小悬伸。', {
        railLengthM: rail,
        requiredM: required,
        valueBasis: variant.valueBasis || 'DEMO_ASSUMPTION'
      }));
    }
  }
  const spans = [
    ['lowerArm', variant.lowerArmSpanM, variant.lowerArmMaxSpanM],
    ['tieRod', variant.tieRodSpanM, variant.tieRodMaxSpanM]
  ];
  for (const [name, span, maxSpan] of spans) {
    if (typeof span === 'number' && typeof maxSpan === 'number' && span > maxSpan + 1e-9) {
      failures.push(rule('P09', 'KINEMATIC_UNRESOLVABLE', `${name} 跨度超过所选模块能力。这是目录比较，不是求解器收敛结果。`, {
        name,
        spanM: span,
        maxSpanM: maxSpan,
        valueBasis: variant.valueBasis || 'DEMO_ASSUMPTION'
      }));
    }
  }
  return {
    ok: failures.length === 0,
    failures,
    openGaps,
    valueBasis: variant.valueBasis || 'DEMO_ASSUMPTION'
  };
}

export function explainSolverCode(code, detail = {}) {
  const base = {
    primaryCode: code,
    platformRules: [],
    mustNotRewriteAs: [],
    valueBasis: detail.valueBasis || 'DEMO_ASSUMPTION',
    status: 'PROPOSAL'
  };
  if (code === 'KIN-OK') {
    return { ...base, category: 'OK', userMessage: '在给定硬点和行程下，约束可以装配。', platformRules: [] };
  }
  if (code === 'KIN-E-SCALE') {
    return {
      ...base,
      category: 'VARIANT_ILLEGAL',
      platformRules: ['P14'],
      userMessage: '请求用缩放改变配置。这对应变型规则 P14，不是摆臂算不出来。',
      correspondence: '仅当缩放出现在变型或请求顶层的 scale、globalScale、meshScale。'
    };
  }
  if (code === 'KIN-E-LENGTH') {
    return {
      ...base,
      category: 'GEOMETRY_INFEASIBLE',
      platformRules: [],
      mustNotRewriteAs: ['P08', 'P09'],
      userMessage: '声明的杆长和两个硬点之间的距离不一致。这是输入自相矛盾，不是纵梁不够，也不是模块跨度超限。',
      correspondence: 'P08 只比较结构件长度和派生需求；P09 只比较跨度与模块 maxSpan。二者都不改写这个错误。'
    };
  }
  if (code === 'KIN-E-CONVERGE') {
    return {
      ...base,
      category: 'SOLVER_NUMERICAL',
      platformRules: [],
      mustNotRewriteAs: ['P09', 'P17'],
      userMessage: '数值迭代停止了。这不能单独证明模块跨度超限，也不能自动升成新的正式规则。',
      interpretation: detail.residual > 1e-3 ? 'UNCONFIRMED_GEOMETRY_HINT' : 'UNCONFIRMED',
      hint: '残差很大时，几何可能不可达，但必须另做直接测量才能这样说。'
    };
  }
  if (code === 'KIN-E-LIMIT' || code === 'KIN-E-TRAVEL' || code === 'KIN-E-JOINT') {
    return {
      ...base,
      category: 'GEOMETRY_INFEASIBLE',
      userMessage: '关节类型、行程或长度极限与请求不符。这是机构边界，不是 P08/P09/P14。',
      mustNotRewriteAs: ['P08', 'P09', 'P14']
    };
  }
  return {
    ...base,
    category: 'INPUT_INVALID',
    userMessage: '坐标、左右侧、镜像或来源标记不成立。尚未进入悬架求解。',
    mustNotRewriteAs: ['P08', 'P09']
  };
}

export function reviewSuspension(request) {
  const variant = request.variant || {};
  const points = request.solverRequest?.hardpoints;
  const measured = {};
  if (points?.lowerBall && points.lowerAxisA && points.lowerAxisB) {
    measured.lowerArmSpanM = radialSpan(points.lowerBall, points.lowerAxisA, points.lowerAxisB);
  }
  if (points?.tieOuter && points.tieInner) {
    const dx = points.tieOuter[0] - points.tieInner[0];
    const dy = points.tieOuter[1] - points.tieInner[1];
    const dz = points.tieOuter[2] - points.tieInner[2];
    measured.tieRodSpanM = Math.hypot(dx, dy, dz);
  }
  const staticInput = {
    ...variant,
    ...measured,
    lowerArmMaxSpanM: variant.lowerArmMaxSpanM,
    tieRodMaxSpanM: variant.tieRodMaxSpanM,
    valueBasis: request.valueBasis || variant.valueBasis || 'DEMO_ASSUMPTION'
  };
  if (request.solverRequest && Object.prototype.hasOwnProperty.call(request.solverRequest, 'scale')) {
    staticInput.scale = request.solverRequest.scale;
  }
  const staticResult = checkVariantStatics(staticInput);
  if (staticResult.openGaps.length && staticResult.ok) {
    return {
      ok: false,
      category: 'OPEN_GAP',
      stage: 'variant-rules',
      solverCalled: false,
      failures: [],
      openGaps: staticResult.openGaps,
      measured,
      valueBasis: staticResult.valueBasis,
      provenance: request.provenance || 'FICTIONAL_FIXTURE',
      userMessage: '出现了现有 P14 没有覆盖的缩放写法。不调用求解器，也不把它编号成新规则。'
    };
  }
  if (!staticResult.ok) {
    return {
      ok: false,
      category: 'VARIANT_ILLEGAL',
      stage: 'variant-rules',
      solverCalled: false,
      failures: staticResult.failures,
      measured,
      valueBasis: staticResult.valueBasis,
      provenance: request.provenance || 'FICTIONAL_FIXTURE',
      userMessage: '变型规则未通过。没有调用求解器，因此不能把结果说成迭代失败。'
    };
  }
  if (!request.solverRequest) {
    return { ok: true, category: 'OK', stage: 'variant-rules', solverCalled: false, failures: [], measured, valueBasis: staticResult.valueBasis };
  }
  const solved = solveCorner({ ...request.solverRequest, valueBasis: request.valueBasis || request.solverRequest.valueBasis });
  const explanation = explainSolverCode(solved.code, { ...solved.detail, residual: solved.detail?.residual, valueBasis: solved.valueBasis });
  return {
    ok: solved.ok,
    category: explanation.category,
    stage: 'solver',
    solverCalled: true,
    solver: { code: solved.code, residual: solved.residual ?? solved.detail?.residual ?? null },
    explanation,
    failures: [],
    measured,
    valueBasis: solved.valueBasis || staticResult.valueBasis,
    provenance: request.provenance || 'FICTIONAL_FIXTURE'
  };
}
