const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, s => ({
  '&': '&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[s]));
const stamp = value => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }).format(d);
};
const shortName = name => name.includes('Gemini') ? 'Gm' : name.includes('Composer') ? 'Co' :
  name.includes('DeepSeek') ? 'Ds' : name.includes('Qwen') ? 'Qw' : name.includes('Grok') ? 'Gr' :
  name.includes('HY') ? 'HY' : 'G6';
const statusMap = {
  backlog: '暂缓', ready: '待领取', in_progress: '进行中', submitted: '待审核',
  approved: '已验收', blocked: '有阻塞', needs_work: '待返工',
};
const humanCode = task => task.displayCode || task.id;
const taskOrder = (a,b) => humanCode(a).localeCompare(humanCode(b),'zh-CN',{numeric:true});
const statusFilter = [
  ['all','全部任务'],['in_progress','进行中'],['ready','待领取'],
  ['submitted','待审核'],['approved','已验收'],['blocked','有阻塞'],
];
let snapshot = null;
let lastSignature = '';
let view = ['overview','dispatch','tasks','agents'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
let currentAgent = null;
let currentTask = null;
let taskFilter = 'all';
let searchQuery = '';
let toastTimer = null;

const getAgent = id => snapshot?.agents.find(a => a.id === id);
const agentTasks = id => snapshot?.tasks.filter(t => t.owner === id) ?? [];
const badge = status => `<span class="badge badge-${escapeHTML(status)}">${escapeHTML(statusMap[status] || status)}</span>`;
const progress = tasks => {
  const roots = tasks.filter(t=>!t.parentId);
  const total = roots.reduce((n,t) => n+(t.displayTotal ?? t.stepTotal),0);
  const done = roots.reduce((n,t) => n+(t.displayDone ?? t.stepDone),0);
  return {total,done,value:total?Math.round(done*100/total):null};
};
const stepText = task => {
  if (!task) return '暂时没有安排任务';
  if (task.status === 'approved') return '任务已验收，可以查看交付成果';
  if (task.status === 'submitted') return '成果已提交，等待总控审核';
  if (task.status === 'ready') return '待领取：' + task.currentStep;
  if (task.status === 'blocked') return '遇到阻塞：' + task.lastNote;
  return task.currentStep;
};
const firstRelevant = items => items.find(t=>t.status==='in_progress') ||
  items.find(t=>t.status==='submitted') || items.find(t=>t.status==='needs_work') ||
  items.find(t=>t.status==='ready') || items[0];

function statCard(label, value, note, symbol) {
  return `<div class="stat-card"><div class="stat-top"><span>${escapeHTML(label)}</span><span class="stat-icon">${symbol}</span></div>
    <strong>${escapeHTML(value)}</strong><small>${escapeHTML(note)}</small></div>`;
}

function renderAgentCard(agent) {
  const tasks = agentTasks(agent.id);
  const meter = progress(tasks);
  const focus = firstRelevant(tasks);
  return `<button type="button" class="agent-card" data-agent="${escapeHTML(agent.id)}" style="--agent-color:${agent.accent}">
    <div class="agent-top"><div class="agent-avatar">${escapeHTML(shortName(agent.name))}</div>
    <div><div class="agent-name">${escapeHTML(agent.name)}</div><div class="agent-role">${escapeHTML(agent.role)}</div></div>
    <span class="agent-chevron">↗</span></div>
    <p class="agent-mission">${escapeHTML(agent.mission)}</p>
    <div class="agent-lastline">${escapeHTML(focus ? stepText(focus) : '尚未安排任务')}</div>
    <div class="agent-footer"><div class="agent-taskcount"><b>${tasks.length}</b> 项任务 · ${meter.total?meter.done+'/'+meter.total+' 步完成':'待自主规划'}</div>
    <div class="agent-bar" aria-label="${meter.value===null?'待自主规划':'步骤完成率 '+meter.value+'%'}"><span style="width:${meter.value??0}%"></span></div></div>
  </button>`;
}

function renderTaskRow(task) {
  const owner = getAgent(task.owner);
  return `<button class="task-row ${task.parentId?'is-subtask':''}" type="button" data-task="${escapeHTML(task.id)}" aria-label="查看任务 ${escapeHTML(task.title)}">
    <span class="task-id" title="内部任务编号：${escapeHTML(task.id)}">${escapeHTML(humanCode(task))}</span>
    <span><span class="task-title">${task.parentId?'↳ ':''}${escapeHTML(task.title)}</span><span class="task-summary">${escapeHTML(task.summary)}</span></span>
    <span class="task-owner">${escapeHTML(owner?.name || task.owner)}</span>
    <span>${badge(task.status)}</span>
    <span class="mini-progress">${task.progress===null?'待规划':`<span class="mini-track"><span style="width:${task.progress}%"></span></span>${task.progress}%`}</span>
    <span class="task-chevron">›</span>
  </button>`;
}

function taskTable(tasks) {
  if (!tasks.length) return '<div class="empty-state">当前没有符合条件的任务。可以切换筛选项查看。</div>';
  let previous = null;
  const lines = [];
  const sorted = [...tasks].sort(taskOrder);
  for (const task of sorted) {
    if (task.workstream !== previous) {
      previous = task.workstream;
      const group = humanCode(task).split('.')[0];
      lines.push(`<div class="task-section-title"><span>${escapeHTML(group)} · ${escapeHTML(previous || '其他任务')}</span><small>同组编号用于定位，不代表必须依次执行</small></div>`);
    }
    lines.push(renderTaskRow(task));
  }
  return `<div class="task-table"><div class="task-row-head">
    <span>序号</span><span>任务 / 简要进展</span><span class="owner-head">所属模型</span><span>状态</span><span class="progress-head">步骤</span><span></span>
  </div>${lines.join('')}</div>`;
}

function topHeading(kicker,title,subtitle) {
  return `<div class="page-heading"><div class="eyebrow">${escapeHTML(kicker)}</div>
    <h1 class="page-title">${escapeHTML(title)}</h1><p class="page-subtitle">${escapeHTML(subtitle)}</p></div>`;
}

function renderOverview() {
  const s = snapshot.summary;
  const pending = (s.statuses.ready || 0) + (s.statuses.backlog || 0);
  const active = s.statuses.in_progress || 0;
  const submitted = s.statuses.submitted || 0;
  const approved = s.statuses.approved || 0;
  const featured = snapshot.tasks.filter(t=>!t.parentId && t.status!=='approved').slice(0,6);
  return `<section class="hero">
    <div class="hero-copy"><div class="eyebrow">ENGINEERING OPERATIONS · CARLAB</div>
      <h1>把复杂的研发，<br/><span>变成看得见的进度。</span></h1>
      <p>总控确定目标，各模型自己规划路线和子任务；领取前显示“待自主规划”，有真实执行记录后才显示进度。</p>
      <div class="hero-bottom"><span><b></b> Markdown 单一数据源</span><span><b></b> 研究 → 实现 → 验收</span></div>
    </div>
    <div class="hero-meter" style="--pct:${s.planningCoverage}"><strong>${s.mainTasks-s.unplannedRoots}<small>/${s.mainTasks}</small></strong><label>已建立执行计划</label></div>
  </section>
  <div class="stats-grid">
    ${statCard('协作模型',s.agents,'配置了专属任务区','◇')}
    ${statCard('待自主规划',s.unplannedRoots,'由执行模型自己拆解工作','↗')}
    ${statCard('进行中',active,'由任务文件申报','◌')}
    ${statCard('待审核 / 已验收',`${submitted} / ${approved}`,'有证据才算完成','✓')}
  </div>
  <div class="section-head"><div><h2>AI 研发团队</h2><p>点开成员，查看专属任务和具体步骤</p></div>
    <button type="button" class="text-link" data-nav="agents">全部成员 ↗</button></div>
  <div class="agent-grid">${snapshot.agents.map(renderAgentCard).join('')}</div>
  <div class="section-head"><div><h2>当前重点任务</h2><p>按状态与优先级排序，不代表模型已自动启动</p></div>
    <button type="button" class="text-link" data-nav="tasks">打开总任务池 ↗</button></div>
  ${taskTable(featured)}
  ${snapshot.errors.length ? `<div class="notice">发现 ${snapshot.errors.length} 个任务文件读取问题，请检查源文件。</div>` : ''}`;
}

function renderAgents() {
  return topHeading('TEAM DIRECTORY','AI 模型成员','每个模型拥有独立工作区和任务队列。成员角色可以随着实际能力和项目阶段调整。') +
    `<div class="agent-grid">${snapshot.agents.map(renderAgentCard).join('')}</div>`;
}

function renderAgentDetail() {
  const agent = getAgent(currentAgent);
  if (!agent) { view = 'agents'; return renderAgents(); }
  const tasks = agentTasks(agent.id);
  const m = progress(tasks);
  const focus = firstRelevant(tasks);
  return `<button class="back-button" type="button" data-nav="agents">← 返回全部模型</button>
  <div class="agent-profile" style="--agent-color:${agent.accent}">
    <div class="agent-avatar">${escapeHTML(shortName(agent.name))}</div>
    <div class="agent-profile-content"><div class="eyebrow">MODEL WORKSPACE</div>
      <h1 class="page-title">${escapeHTML(agent.name)}</h1>
      <p>${escapeHTML(agent.role)} · ${escapeHTML(agent.mission)}</p></div>
    <div class="agent-profile-stats"><strong>${m.value===null?'待规划':m.value+'%'}</strong>${m.value===null?'由模型领取后自行拆解':'已建立的步骤完成率'}</div>
  </div>
  <div class="agent-current"><label>当前优先事项</label>
    <p>${escapeHTML(stepText(focus))}</p>
    ${focus && !focus.parentId && ['ready','needs_work'].includes(focus.status) ? `<div class="agent-current-action"><button class="action-button primary" type="button" data-copy-prompt="${escapeHTML(focus.id)}">启动主任务：复制提示词</button></div>`:''}
  </div>
  <div class="section-head"><div><h2>专属任务板</h2><p>共 ${tasks.length} 项任务 · ${m.total?m.done+'/'+m.total+' 个已定义步骤完成':'执行步骤待模型自主制定'}</p></div></div>
  ${taskTable(tasks)}
  <div class="section-head"><div><h2>如何工作</h2><p>打开项目时，读取 AGENTS.md → 个人 PROFILE.md → 专属任务卡，并在完成步骤后更新 Markdown。</p></div></div>`;
}

function filterTasks() {
  return snapshot.tasks.filter(t=>(taskFilter==='all' || t.status===taskFilter) &&
    [t.id,t.displayCode,t.workstream,t.title,t.summary,t.owner,getAgent(t.owner)?.name,t.stage].join(' ').toLowerCase().includes(searchQuery.toLowerCase()));
}
function renderTasks() {
  const filtered = filterTasks();
  return topHeading('MASTER BACKLOG','总任务池','任务按照“项目准备 → 整车蓝图研究 → 后续专项研究”分组。序号代表分类位置，哪些任务现在能做，请看任务状态与前置依赖。') +
   `<div class="filterbar">
     ${statusFilter.map(([id,name])=>`<button type="button" class="filter-chip ${taskFilter===id?'active':''}" data-filter="${id}">${name}</button>`).join('')}
     <input class="search-field" id="taskSearch" aria-label="搜索任务" placeholder="搜索任务或模型…" value="${escapeHTML(searchQuery)}"/>
   </div><div id="filteredTasks">${taskTable(filtered)}</div>
   <div class="section-head"><p id="resultCount">当前显示 ${filtered.length} / ${snapshot.tasks.length} 项任务</p></div>`;
}

function renderSteps(nodes, seq = {n:0,currentMarked:false}) {
  return nodes.map(node=>{
    seq.n += 1;
    const number = seq.n;
    const hasChildren = !!node.children?.length;
    const descendants = hasChildren ? flattenLeaves(node.children) : [node];
    const finished = descendants.every(x=>x.done);
    const isCurrent = !finished && !hasChildren && !seq.currentMarked;
    if (isCurrent) seq.currentMarked = true;
    const dotClass = finished ? 'done' : isCurrent ? 'current' : '';
    return `<div class="step-item ${finished?'finished':''}">
      <span class="step-dot ${dotClass}">${finished?'✓':String(number).padStart(2,'0')}</span>
      <div class="step-text">${escapeHTML(node.text)}</div>
      ${hasChildren?`<div class="step-children">${renderSteps(node.children,seq)}</div>`:''}
    </div>`;
  }).join('');
}
function flattenLeaves(nodes) { return nodes.flatMap(x=>x.children?.length?flattenLeaves(x.children):[x]); }

function renderDrawer() {
  const t = snapshot?.tasks.find(x=>x.id===currentTask);
  if (!t) return closeDrawer();
  const owner = getAgent(t.owner);
  $('#drawerTaskId').textContent = humanCode(t);
  $('#drawerBody').innerHTML = `<div class="drawer-tags">${badge(t.status)}
    <span class="stage-tag">${escapeHTML(t.stage)}</span>
    <span class="stage-tag">${escapeHTML(t.priority)}</span></div>
    <h2 class="drawer-title">${escapeHTML(t.title)}</h2>
    <p class="drawer-summary">${escapeHTML(t.summary)}</p>
    <div class="drawer-progress"><div class="drawer-progress-top">
      <span>${t.progress===null?'执行步骤由模型自行规划':'执行步骤 · '+t.displayDone+' / '+t.displayTotal+' 已完成'}</span><strong>${t.progress===null?'待规划':t.progress+'%'}</strong></div>
      <div class="drawer-track"><span style="width:${t.progress??0}%"></span></div></div>
    <div class="drawer-section"><h3>正在做什么</h3>
      <div class="insight"><div class="insight-label">当前步骤</div>
        <div class="insight-text">${escapeHTML(t.currentStep)}</div></div>
      <div class="insight"><div class="insight-label">怎么做</div>
        <div class="insight-text">${escapeHTML(t.method)}</div></div>
      <div class="learning-box"><div class="insight-label">顺便了解一个技术点</div>
        <div class="insight-text">${escapeHTML(t.learning)}</div></div></div>
    <div class="drawer-section"><h3>模型自主规划的步骤</h3>
      ${t.steps.length?`<div class="step-list">${renderSteps(t.steps)}</div>`:
      '<div class="insight-text">本任务尚未形成执行步骤。模型领取任务后，会自己研究路线、拆分子任务和更新进度。</div>'}
      ${t.childTasks?.length?`<div class="subtask-group"><div class="insight-label">模型自行创建的子任务（${t.childTasks.length}）</div>
        ${t.childTasks.map(id=>{const child=getTaskById(id);return child?`<button class="subtask-entry" type="button" data-task="${escapeHTML(child.id)}"><span>${escapeHTML(humanCode(child))} · ${escapeHTML(child.title)}</span><span>${child.progress===null?'待规划':child.progress+'%'} ›</span></button>`:'';}).join('')}
      </div>`:''}
    </div>
    <div class="drawer-section"><h3>最新汇报</h3>
      <div class="insight-text">${escapeHTML(t.lastNote || '暂时还没有进展记录。')}</div>
      <div class="insight-label" style="margin-top:10px">文件最后更新：${stamp(t.updatedAt)}</div></div>
    <div class="drawer-section"><h3>执行信息</h3>
      <div class="insight"><div class="insight-label">负责模型</div><div class="insight-text">${escapeHTML(owner?.name || t.owner)}</div></div>
      <div class="insight"><div class="insight-label">内部文件标识（给 AI 使用）</div><div class="drawer-code">${escapeHTML(t.id)}</div></div>
      <div class="insight"><div class="insight-label">完整任务说明</div><div class="drawer-code">${escapeHTML(t.brief)}</div></div>
      <div class="insight"><div class="insight-label">当前 Markdown 数据源</div>
        <div class="drawer-code">${escapeHTML(t.source)}</div></div>
      <div class="insight-text" style="font-size:10px;color:#6f7d96;margin-top:13px">任务目标由总控提出，具体执行计划由模型自行拆分。只有实际完成的步骤才会增加进度。</div>
    </div>`;
  $('#drawerBody').insertAdjacentHTML('beforeend',renderCollabPanel(t));
}

function openDrawer(id) {
  currentTask=id;
  renderDrawer();
  $('#drawerOverlay').hidden=false;
  $('#taskDrawer').classList.add('open');
  $('#taskDrawer').setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
}
function closeDrawer() {
  currentTask=null;
  $('#drawerOverlay').hidden=true;
  $('#taskDrawer').classList.remove('open');
  $('#taskDrawer').setAttribute('aria-hidden','true');
  document.body.style.overflow='';
}

function renderRoadmap() {
  const stages = [
    ['P0','平台底座'],['P1','高保真轮端'],['P2','装配与运动学'],
    ['P3','整车配置'],['P4','车辆动力学'],['P5','视觉规模化']
  ];
  $('#sidebarStages').innerHTML = stages.map(([code,name],i)=>
    `<div class="roadmap-item ${i===0?'focus':''}"><span class="roadmap-dot"></span>
    <span class="roadmap-desc">${code} · ${name}</span></div>`).join('');
}

function render() {
  if (!snapshot) return;
  $('#sidebarTaskCount').textContent=snapshot.tasks.length;
  $('#sidebarAgentCount').textContent=snapshot.agents.length;
  $('#sidebarInboxCount').textContent=snapshot.tasks.filter(t=>!t.parentId && t.status==='submitted').length;
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.nav===(view==='agent'?'agents':view)));
  const names={overview:'指挥总览',dispatch:'任务派发与回报',tasks:'总任务池',agents:'模型成员',agent:getAgent(currentAgent)?.name||'模型详情'};
  $('#crumbTitle').textContent=names[view]||'指挥总览';
  $('#content').innerHTML = view==='dispatch'?renderDispatch() : view==='tasks'?renderTasks() :
    view==='agents'?renderAgents() :view==='agent'?renderAgentDetail():renderOverview();
  if (currentTask) renderDrawer();
}

function go(viewName,agentId=null) {
  view=viewName;
  if (agentId) currentAgent=agentId;
  taskFilter='all';searchQuery='';
  closeDrawer();render();
  history.replaceState(null,'','#'+(viewName==='agent'?'agents':viewName));
  window.scrollTo({top:0,behavior:'instant'});
}

function toast(message) {
  const el=$('#toast');el.textContent=message;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);
}

async function refresh(manual=false) {
  try {
    const r=await fetch('/api/dashboard',{cache:'no-store'});
    if (!r.ok) throw new Error('HTTP '+r.status);
    const value=await r.json();
    const signature=JSON.stringify([
      value.agents.map(a=>[a.id,a.name,a.role,a.mission]),
      value.tasks.map(t=>[t.id,t.displayCode,t.workstream,t.updatedAt,t.reportUpdatedAt,t.status,t.stepDone,t.stepTotal,t.lastNote,(t.artifacts||[]).map(a=>[a.path,a.updatedAt])]),
      value.errors,
    ]);
    snapshot=value;
    $('#syncState').className='sync-state connected';
    $('#syncState').innerHTML='<i></i>文件已同步';
    $('#syncTime').textContent='更新于 '+stamp(value.generatedAt);
    if (signature!==lastSignature) {lastSignature=signature;render();}
    if (manual) toast('已读取最新 Markdown 任务状态');
    if (value.errors.length) console.warn('任务文件读取异常:',value.errors);
  } catch(e) {
    $('#syncState').className='sync-state error';
    $('#syncState').innerHTML='<i></i>读取失败';
    $('#syncTime').textContent='请检查服务';
    if (!snapshot) $('#content').innerHTML='<div class="empty-state">无法读取任务数据，请检查看板服务是否已启动。</div>';
    if (manual) toast('刷新失败：'+e.message);
  }
}

document.addEventListener('click',ev=>{
  const nav=ev.target.closest('[data-nav]');
  if (nav) return go(nav.dataset.nav);
  const agent=ev.target.closest('[data-agent]');
  if (agent) return go('agent',agent.dataset.agent);
  const task=ev.target.closest('[data-task]');
  if (task) return openDrawer(task.dataset.task);
  const filter=ev.target.closest('[data-filter]');
  if (filter) {taskFilter=filter.dataset.filter;render();return;}
});
document.addEventListener('input',ev=>{
  if (ev.target.id!=='taskSearch') return;
  searchQuery=ev.target.value;
  $('#filteredTasks').innerHTML=taskTable(filterTasks());
  $('#resultCount').textContent=`当前显示 ${filterTasks().length} / ${snapshot.tasks.length} 项任务`;
});
$('#refreshButton').addEventListener('click',()=>refresh(true));
$('#drawerOverlay').addEventListener('click',closeDrawer);
$('#drawerClose').addEventListener('click',closeDrawer);
document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeDrawer();});
$('.brand').addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' ')go('overview');});

renderRoadmap();
refresh();
setInterval(()=>{if(!document.hidden) refresh();},8000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});

/* 任务派发与回报：本地文件驱动，复制文本不代表已发送到外部模型。 */
function getTaskById(id) { return snapshot?.tasks.find(t=>t.id===id); }

function taskPrompt(t) {
  const agent = getAgent(t.owner);
  const steps = flattenLeaves(t.steps).map((x,i)=>`  ${i+1}. ${x.done?'[已验证]':'[待完成]'} ${x.text}`).join('\n');
  const modelFolder = `agent-workspace/agents/${t.owner}`;
  return [
    `你现在作为 CARLAB 项目的 ${agent?.name||t.owner} 任务执行者，收到总指挥 GPT-6 分配的任务。`,
    `工作目录：F:\\project\\cyq\\AI_Coding\\car`,
    `任务序号：${humanCode(t)}（内部文件编号：${t.id}，不要修改文件编号）`,
    `任务名称：${t.title}`,
    `你的职责：${agent?.mission||''}`,
    '',
    '【最重要的授权与责任】',
    '总指挥 GPT-6 只规定目标、成果、硬约束和验收。你是本任务的执行负责人，需要自主研究、设计实施路线、决定子任务数量和顺序，并持续调整。任务书里的探索方向不是固定施工步骤。',
    '如果发现更合适的技术方法，可以在允许范围内采用并给出依据；涉及跨模型接口或核心范围变化必须提交总控讨论。',
    '',
    '【成功目标】',
    t.summary || t.title,
    '【方向建议（非固定步骤）】',
    t.method || '根据实际工程约束自主选择合理研究/实现方法。',
    '【质量要求与项目证据】',
    '成果必须有可以复核的源文件、工程依据/引用、运行验证或反例；明确已经证实、推导假设和仍未知的内容。',
    '',
    '【开始工作后的自主规划】',
    '先检查已有成果与前置约束，再确定任务分解是否必要；若有必要，在本人 tasks 目录下新增如 RP-01-S01.md 等自定义子任务。',
    `新增子任务必须有 parentId: ${t.id}，使用不同的 id；可读序号用 ${humanCode(t)}.01、.02 等，进度只填写真实完成的步骤。`,
    '子任务无需为了“看起来充实”硬拆；发现缺项可调整自己的计划，给出理由。总任务不需要在领取前预填执行步骤。',
    '主任务启动之后，请在你当前 AI 工具支持的范围内自主处理所有子任务：有真实子代理/任务工具就内部创建、委派和汇总；没有该能力就在当前会话按序执行，不要求用户再逐条复制子任务提示词。不能虚称已启动其他 Agent。',
    '详情规范：docs/command/PROMPT_AND_DELEGATION_STANDARD.md',
    '',
    '【执行约束与回报】',
    '1. 如果可以访问此 Windows 项目，先读取根目录 AGENTS.md、MASTER_PLAN.md、docs/command/COMMAND_CENTER.md，以及你的个人 PROFILE.md 和任务卡。',
    `2. 个人任务卡：${modelFolder}/tasks/${t.id}.md`,
    `3. 详细任务书：${t.brief}`,
    '4. 严格遵守任务书的允许修改范围、工程单位、F 盘存储要求和测试边界。不要自行修改总计划或其他模型任务。',
    '5. 研究结果必须可落地：字段规范、可运行脚本、验证样例、资料来源或工程推导；明确事实、假设与未知，不要编造。',
    '6. 开始时将父任务卡设为 in_progress；先自主规划并按需新建子任务 Markdown（带 parentId），其后仅勾选真实完成的步骤并更新 lastNote。完成提交 submitted，等待总控审核，不得自行 approved。',
    `7. 回报文件保存到 ${modelFolder}/reports/${t.id}.md（请创建 reports 文件夹），并记录真实路径、测试命令、结果与问题。`,
    '8. 能访问本地文件则必须直接写任务卡、报告和成果，用户不需要转发任何子任务或完成结果。完全不能读写项目的网页聊天模型才使用人工中转，并如实声明。',
    '',
    '【目前已有的执行步骤（可能为空，不是强制清单）】',
    steps || '尚未由执行模型制定，请先自主判断研究与执行步骤。',
    '',
    '【完整任务书】',
    t.briefText || `详细任务书暂未自动读取，请在项目内打开：${t.brief}`,
    '',
    '【最终回报格式】',
    `任务 ${t.id} / ${agent?.name||t.owner} — SUBMITTED 或 BLOCKED`,
    '完成了什么（用 2—4 句话解释，便于非程序员理解）：',
    '交付文件（准确路径，或完整的代码/结构化产物）：',
    '验证情况（实际执行命令、PASS/FAIL、关键结果）：',
    '未完成/有争议的部分（不能自行假定已解决）：',
    '下一步建议（仅一项或两项）：',
    '如果有文件写入权限，必须先把回报保存到任务指定的 reports 文件，并更新任务卡；否则直接把完整回报给用户粘贴。'
  ].join('\n');
}
function feedbackPrompt(t) {
  const agent=getAgent(t.owner);
  return `请为 CARLAB 任务 ${t.id}（${t.title}）生成最终可复制回报。不要省略真实文件路径和未解决问题。格式如下：

任务：${t.id}
模型：${agent?.name||t.owner}
一句话结果：
交付文件与路径：
实际执行和验证结果：
未完成/阻塞：
下一步建议：

如果你能访问本机项目，请写入 ${t.reportPath}，同时更新自己的 Markdown 任务卡、复选框与状态 submitted。不要自行写 approved；没有实际测试就写“未验证”。`;
}
function copyReviewText(t) {
  return `请你作为 CARLAB 项目总指挥 GPT-6，直接访问 F:\\project\\cyq\\AI_Coding\\car 中的任务 ${t.id}（${t.title}）。先读取任务卡 ${t.source}、详细任务书 ${t.brief}、模型回报 ${t.reportPath} 以及发现的成果文件：\n${(t.artifacts||[]).map(a=>a.path).join('\n')||'[暂无目录扫描产物]'}。检查文件、测试证据和跨模块冲突；决定 APPROVED、NEEDS_WORK 或 BLOCKED，并更新任务卡。不得仅凭执行模型的文字摘要通过。\n\n【已提交的回报摘要】\n${t.reportText||'[暂无单独回报，请直接检查实际成果文件]'}`;
}
async function copyToClipboard(text,feedback='已复制，请粘贴到目标 AI 会话') {
  try {
    if(navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const input=document.createElement('textarea');
      input.value=text;input.setAttribute('readonly','');
      input.style.position='fixed';input.style.opacity='0';input.style.left='-99999px';
      document.body.append(input);input.select();
      if(!document.execCommand('copy')) throw new Error('浏览器拒绝复制');
      input.remove();
    }
    toast(feedback);
  } catch(e) { toast('复制失败，请使用 Chrome 在本机打开页面：'+e.message); }
}

function renderDispatchCard(t) {
  const owner=getAgent(t.owner);
  const received=Boolean(t.reportText || t.artifacts?.length);
  return `<article class="dispatch-card">
    <div class="dispatch-card-meta"><span class="task-human-number">${escapeHTML(humanCode(t))}</span><span>·</span><span>${escapeHTML(t.workstream||'其他任务')}</span><span>·</span><span>${escapeHTML(owner?.name||t.owner)}</span><span>·</span>${badge(t.status)}</div>
    <div class="dispatch-card-head"><div><h3>${escapeHTML(t.title)}</h3><p>${escapeHTML(t.summary)}</p></div></div>
    <div class="dispatch-card-note">${escapeHTML(t.status==='ready'?'等待你首次启动对应的主 AI；之后由它管理子任务并写入项目成果。':t.status==='needs_work'?'总控已退回：请执行模型直接读取任务卡中的 reviewReport 审核报告进行返工。':t.lastNote)}</div>
    <div class="dispatch-card-actions">
      ${['ready','needs_work'].includes(t.status)?`<button type="button" class="action-button primary" data-copy-prompt="${escapeHTML(t.id)}">首次启动：复制主任务</button>`:''}
      <button type="button" class="action-button subtle" data-task="${escapeHTML(t.id)}">查看进度与成果</button>
      ${!received && t.status==='submitted'?`<button type="button" class="action-button subtle" data-open-report="${escapeHTML(t.id)}">备用：手动补充回报</button>`:''}
    </div>
  </article>`;
}
function renderFeedbackCard(t) {
  const owner=getAgent(t.owner);
  const has=Boolean(t.reportText || t.artifacts?.length);
  const note=t.reportText ? t.reportText.replace(/^# .*\n/,'').replace(/> .*\n/,'').trim() :
    t.artifacts?.length ? '自动发现成果：'+t.artifacts.map(a=>a.filename).join('、') : t.lastNote;
  return `<article class="feedback-item">
    <div class="dispatch-card-meta"><span class="task-human-number">${escapeHTML(humanCode(t))}</span><span>·</span><span>${escapeHTML(owner?.name||t.owner)}</span>${badge(t.status)}</div>
    <h3>${escapeHTML(t.title)}</h3>
    <div class="feedback-meta">${has?'检测到项目成果文件'+(t.reportUpdatedAt?' · '+stamp(t.reportUpdatedAt):''):'已提交但尚缺成果文件'}</div>
    <p>${escapeHTML(note||'没有回报摘要')}</p>
    <div class="feedback-actions">
      ${has && t.status==='submitted'?`<button data-copy-review="${escapeHTML(t.id)}" type="button">备用：复制审核指令</button>`:''}
      <button data-task="${escapeHTML(t.id)}" type="button">查看详情</button>
      ${t.status==='submitted'? `<button data-open-report="${escapeHTML(t.id)}" type="button">补充回报</button>`:''}
    </div>
  </article>`;
}
function renderDispatch() {
  const candidates=snapshot.tasks.filter(t=>!t.parentId && !['approved','backlog'].includes(t.status)).sort(taskOrder);
  const inbox=snapshot.tasks.filter(t=>!t.parentId && (t.hasHandoff||t.status==='submitted')).sort(taskOrder);
  const needsAction=candidates.filter(t=>t.status==='ready'||t.status==='needs_work').length;
  return topHeading('AI COORDINATION','任务派发与成果回报','能访问 F 盘的模型自行拆子任务、写回报告与成果。你启动主任务后，成果会自动出现在这里；不需要逐项复制粘贴。') +
    `<div class="dispatch-intro"><div><div class="eyebrow">HUMAN-IN-THE-LOOP</div>
      <p><strong style="color:#e5e8f5">派发 → AI 执行 → 收取回报 → GPT-6 审核</strong><br/>
      对拥有本地文件权限的 AI，主任务开始后由它内部调度子任务并保存成果；你只需定期叫 GPT-6 直接检查文件。只有纯网页聊天模型才需要手动中转。</p></div>
      <div class="dispatch-number">${needsAction}<small>待派发 / 返工</small></div></div>
    <div class="dispatch-layout">
      <section class="dispatch-panel"><div class="dispatch-panel-title"><h2>主任务入口</h2><small>${candidates.length} 张可协作任务卡</small></div>
        <div class="dispatch-list">${candidates.length?candidates.map(renderDispatchCard).join(''):'<div class="dispatch-empty">暂时没有待执行的任务。</div>'}</div>
        <div class="dispatch-help">只需人工启动主 AI；具备子代理能力的工具可以内部派发，其他工具在当前会话按子任务顺序执行，不需要你逐一复制子任务提示词。</div></section>
      <section class="dispatch-panel"><div class="dispatch-panel-title"><h2>项目内成果与待审核</h2><small>${inbox.length} 项已提交或验收</small></div>
        <div class="dispatch-list">${inbox.length?inbox.map(renderFeedbackCard).join(''):'<div class="dispatch-empty">还没有收到 AI 的正式回报。<br/>复制左侧提示词交给模型执行，完成后粘贴回报即可。</div>'}</div>
        <div class="dispatch-help">文件自动被发现不等于验收。状态为“待审核”时，直接告诉 GPT-6 审查任务编号即可。</div></section>
    </div>`;
}
function renderCollabPanel(t) {
  const has=Boolean(t.reportText || t.artifacts?.length);
  return `<div class="collab-box"><h3>任务派发与结果交流</h3>
    <p>能够读写项目的模型自行交付文件，你不需要在这里粘贴；叫 GPT-6 检查任务即可。手动复制和粘贴只作为无文件权限时的备用方式。</p>
    <div class="collab-actions">
      ${!t.parentId?`<button type="button" class="action-button primary" data-copy-prompt="${escapeHTML(t.id)}">复制主任务提示词</button>`:'<span class="insight-label">子任务由主 AI 内部管理，不需要单独派发</span>'}
      <button type="button" class="action-button subtle" data-copy-feedback="${escapeHTML(t.id)}">复制回报要求</button>
      ${t.status!=='approved'?`<button type="button" class="action-button subtle" data-open-report="${escapeHTML(t.id)}">${has?'更新回报':'粘贴 AI 回报'}</button>`:''}
      ${has?`<button type="button" class="action-button subtle" data-copy-review="${escapeHTML(t.id)}">复制回报给 GPT-6</button>`:''}
    </div>
    ${t.artifacts?.length?`<div class="discovered-results"><div class="insight-label">自动发现的项目成果 · ${t.artifacts.length} 项</div>
      ${t.artifacts.map(a=>`<div class="artifact-entry"><span>${escapeHTML(a.path)}</span><button type="button" data-copy-path="${escapeHTML(a.path)}">复制路径</button></div>`).join('')}
      <div class="hint-line">我可以直接读取这些文件进行审核，无须再从其他 AI 粘贴正文。</div></div>`:''}
    ${t.reportText?`<div style="margin-top:16px"><div class="insight-label">模型提交回报 · ${stamp(t.reportUpdatedAt)}</div>
      <div class="feedback-preview">${escapeHTML(t.reportText.slice(0,3500))}</div></div>`:''}
  </div>`;
}
let reportingTaskId=null;
function openReport(id) {
  const t=getTaskById(id);
  if(!t) return;
  if(t.status==='approved') return toast('此任务已经验收，历史记录不允许覆盖');
  reportingTaskId=id;
  $('#reportDialogTitle').textContent='收取回报 · '+humanCode(t);
  $('#reportDialogHint').textContent=`负责模型：${getAgent(t.owner)?.name||t.owner}。保存到 ${t.reportPath}；会自动变为待审核。`;
  $('#reportText').value=t.reportText ? t.reportText.replace(/^# [^\n]+\n\n> [^\n]+\n\n/,'').trim() : '';
  $('#reportSaveMessage').textContent='仅写入本机 F 盘，不会直接向 GPT-6 发送消息。';
  $('#reportSubmit').disabled=false;
  $('#reportDialog').showModal();
}
async function saveReport(ev) {
  ev.preventDefault();
  const task=getTaskById(reportingTaskId);
  if(!task)return;
  const body=$('#reportText').value.trim();
  if(body.length<20)return toast('请粘贴至少 20 个字的真实回报');
  $('#reportSubmit').disabled=true;
  $('#reportSaveMessage').textContent='正在保存到本地任务工作区…';
  try{
    const r=await fetch('/api/report/'+encodeURIComponent(task.id),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({report:body,expectedUpdatedAt:task.updatedAt})
    });
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'保存失败');
    $('#reportDialog').close();
    reportingTaskId=null;
    await refresh();
    toast('回报已保存，任务进入待审核');
    if(view==='dispatch')render();
  }catch(e){
    $('#reportSaveMessage').textContent='保存失败：'+e.message;
    toast('未保存，请查看错误提示');
  }finally{$('#reportSubmit').disabled=false;}
}

document.addEventListener('click',ev=>{
  const btn=ev.target.closest('[data-copy-prompt],[data-copy-feedback],[data-copy-review],[data-open-report]');
  if(!btn)return;
  const key=btn.dataset.copyPrompt ? 'copyPrompt' : btn.dataset.copyFeedback ? 'copyFeedback' :
    btn.dataset.copyReview ? 'copyReview' : 'openReport';
  const id=btn.dataset[key];
  const t=getTaskById(id);
  if(!t)return toast('任务已变动，请刷新');
  if(key==='copyPrompt')return copyToClipboard(taskPrompt(t),'完整任务提示词已复制；请到对应 AI 会话粘贴');
  if(key==='copyFeedback')return copyToClipboard(feedbackPrompt(t),'回报要求已复制');
  if(key==='copyReview')return copyToClipboard(copyReviewText(t),'审核提示词与回报已复制；请粘贴给 GPT-6');
  if(key==='openReport')return openReport(id);
});
$('#reportForm').addEventListener('submit',saveReport);
$('#reportDialogClose').addEventListener('click',()=>$('#reportDialog').close());
$('#reportCancel').addEventListener('click',()=>$('#reportDialog').close());
$('#reportDialog').addEventListener('close',()=>{reportingTaskId=null;});

document.addEventListener('click', ev=>{
  const btn=ev.target.closest('[data-copy-path]');
  if(!btn)return;
  copyToClipboard(btn.dataset.copyPath,'本地成果文件路径已复制');
});
