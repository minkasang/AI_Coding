import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const AGENTS_DIR = path.join(ROOT, 'agent-workspace', 'agents');
const PORT = Number(process.env.DASHBOARD_PORT) || 5174;
const HOST = '127.0.0.1';
const allowedFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);

// 自动发现研究成果：只扫描已经约定的项目目录，不读取整盘，也不修改 Agent 文件。
const RESULT_DIRS = [
  path.join(ROOT, 'docs','planning','reports'),
  path.join(ROOT, 'docs','planning','evidence'),
  path.join(ROOT, 'docs','research')
];
async function discoverArtifacts(taskId) {
  if (!/^[A-Za-z0-9_-]+$/.test(taskId)) return [];
  const found = [];
  for (const dir of RESULT_DIRS) {
    let entries;
    try { entries = await fs.readdir(dir,{withFileTypes:true}); }
    catch(e) { if(e.code !== 'ENOENT') console.warn('[artifacts]',e.message); continue; }
    for (const item of entries) {
      if (!item.isFile() || !item.name.startsWith(taskId+'-')) continue;
      const rest = item.name.slice(taskId.length + 1);
      if (/^S[0-9]+[-.]/.test(rest)) continue; // 子任务成果由子任务展示
      const ext = path.extname(item.name).toLowerCase();
      if (!['.md','.json','.txt','.csv','.svg'].includes(ext)) continue;
      try {
        const file = path.join(dir,item.name);
        const stat = await fs.stat(file);
        if (stat.size > 5000000) continue;
        const record = {path:path.relative(ROOT,file).replaceAll('\\','/'),filename:item.name,
          kind:ext.slice(1),bytes:stat.size,updatedAt:stat.mtime.toISOString()};
        if (ext === '.md' || ext === '.json') {
          const raw = await fs.readFile(file,'utf8');
          record.preview = raw.slice(0,2000);
        }
        found.push(record);
      } catch(e) { console.warn('[artifacts]',item.name,e.message); }
    }
  }
  found.sort((a,b)=>a.path.localeCompare(b.path));
  return found;
}

// 公共跨模型留言：只读文件，不修改任务、消息或其他代理的报告。
const SHARED_MSG_DIR = path.join(ROOT,'agent-workspace','shared','messages');
async function readSharedMessages(errors) {
  let entries=[];
  try { entries=await fs.readdir(SHARED_MSG_DIR,{withFileTypes:true}); }
  catch(e) { if(e.code!=='ENOENT')errors.push('公共消息读取失败：'+e.message); return []; }
  const messages=[];
  for (const entry of entries) {
    if(!entry.isFile() || !entry.name.endsWith('.md') || entry.name==='README.md')continue;
    try {
      const file=path.join(SHARED_MSG_DIR,entry.name);
      const stat=await fs.stat(file);
      if(stat.size>100000)continue;
      const {meta,body}=parseMarkdown(await fs.readFile(file,'utf8'));
      if(!meta.id||!meta.from||!meta.to||!meta.subject)throw Error('缺少 id/from/to/subject');
      messages.push({id:meta.id,from:meta.from,to:meta.to,kind:meta.kind||'notice',
        taskId:meta.taskId||'',subject:meta.subject,status:meta.status||'open',
        replyTo:meta.replyTo||'',createdAt:meta.createdAt||stat.mtime.toISOString(),
        updatedAt:stat.mtime.toISOString(),body:body.slice(0,1800),
        source:path.relative(ROOT,file).replaceAll('\\','/')});
    }catch(e){errors.push('公共留言 '+entry.name+': '+e.message);}
  }
  messages.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return messages.slice(0,100);
}

function parseMarkdown(raw) {
  const normalized = raw.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) throw new Error('需要以 --- 包裹的 Markdown 元数据');
  const meta = {};
  for (const line of match[1].split('\n')) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    meta[key] = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: normalized.slice(match[0].length) };
}

function parseSteps(body) {
  const marker = body.match(/^##\s+执行步骤\s*$/m);
  if (!marker) return [];
  const section = body.slice(marker.index + marker[0].length).split(/^##\s+/m)[0];
  const roots = [];
  const stack = [];
  for (const line of section.split('\n')) {
    const m = line.match(/^(\s*)-\s+\[([ xX])\]\s+(.+)$/);
    if (!m) continue;
    const level = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
    const node = { text: m[3].trim(), done: m[2].toLowerCase() === 'x', children: [], level };
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

function leaves(nodes) {
  return nodes.flatMap(n => n.children.length ? leaves(n.children) : [n]);
}

function getCurrentStep(nodes, status) {
  if (status === 'approved') return '全部步骤已验收';
  if (status === 'submitted') return '等待总控审核';
  if (status === 'blocked') return '等待解决阻塞';
  const next = leaves(nodes).find(n => !n.done);
  return next?.text ?? '等待确认后续步骤';
}

const statusOrder = { in_progress: 0, submitted: 1, needs_work: 2, ready: 3, blocked: 4, backlog: 5, approved: 6 };
const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };

async function readSnapshot() {
  const errors = [];
  const agentDirs = (await fs.readdir(AGENTS_DIR, { withFileTypes: true }))
    .filter(e => e.isDirectory()).map(e => e.name);
  const agents = [];
  const tasks = [];
  const seenIds = new Set();
  for (const slug of agentDirs) {
    const agentPath = path.join(AGENTS_DIR, slug);
    try {
      const { meta } = parseMarkdown(await fs.readFile(path.join(agentPath, 'PROFILE.md'), 'utf8'));
      if (meta.id !== slug) throw new Error('PROFILE.md 的 id 与目录不一致');
      const profile = {
        id: slug, name: meta.name ?? slug, role: meta.role ?? '',
        mission: meta.mission ?? '', accent: /^#[\da-fA-F]{6}$/.test(meta.accent || '') ? meta.accent : '#A8ACBD',
        aliases: (meta.aliases ?? '').split('|').map(s => s.trim()).filter(Boolean),
      };
      agents.push(profile);
      const taskDir = path.join(agentPath, 'tasks');
      let taskNames = [];
      try { taskNames = (await fs.readdir(taskDir)).filter(n => n.endsWith('.md')); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      for (const name of taskNames) {
        try {
          const file = path.join(taskDir, name);
          const [source, stat] = await Promise.all([fs.readFile(file, 'utf8'), fs.stat(file)]);
          const { meta: m, body } = parseMarkdown(source);
          if (!m.id || !m.title || !m.status) throw new Error('缺少 id/title/status');
          // 只读取任务声明过、位于本项目内的 Markdown 说明文件。
          let briefText = '';
          if (m.brief && !path.isAbsolute(m.brief)) {
            const briefFile = path.resolve(ROOT, m.brief);
            if (briefFile.startsWith(ROOT + path.sep) && briefFile.endsWith('.md')) {
              try { briefText = (await fs.readFile(briefFile, 'utf8')).slice(0, 40000); }
              catch (e) { errors.push('未找到详细任务说明：' + m.brief); }
            }
          }
          const reportFile = path.join(agentPath, 'reports', m.id + '.md');
          let reportText = '';
          let reportUpdatedAt = null;
          try {
            const [report, reportStat] = await Promise.all([fs.readFile(reportFile, 'utf8'), fs.stat(reportFile)]);
            reportText = report.slice(0, 40000);
            reportUpdatedAt = reportStat.mtime.toISOString();
          } catch (e) { if (e.code !== 'ENOENT') errors.push('回报读取失败：' + m.id); }
          if (m.owner && m.owner !== slug) throw new Error('owner 与所在模型目录不一致');
          if (seenIds.has(m.id)) throw new Error('任务 ID 重复: ' + m.id);
          seenIds.add(m.id);
          const artifacts = await discoverArtifacts(m.id);
          const steps = parseSteps(body);
          const flat = leaves(steps);
          const stepTotal = flat.length;
          const stepDone = flat.filter(s => s.done).length;
          tasks.push({
            id: m.id, parentId: m.parentId ?? '', childTasks: [], owner: slug, title: m.title, status: m.status, priority: m.priority ?? 'P2',
            displayCode: m.displayCode ?? m.id, workstream: m.workstream ?? '其他任务',
            stage: m.stage ?? '', summary: m.summary ?? '', method: m.method ?? '',
            learning: m.learning ?? '', lastNote: m.lastNote ?? '', brief: m.brief ?? '',
            updatedAt: stat.mtime.toISOString(), source: path.relative(ROOT, file).replaceAll('\\','/'),
            briefText, reportText, reportUpdatedAt, artifacts,
            hasHandoff: Boolean(reportText) || artifacts.length > 0,
            reportPath: path.relative(ROOT, reportFile).replaceAll('\\','/'),
            steps, stepTotal, stepDone, progress: stepTotal ? Math.round(100 * stepDone / stepTotal) : 0,
            currentStep: getCurrentStep(steps, m.status),
          });
        } catch (e) { errors.push(slug + '/' + name + ': ' + e.message); }
      }
    } catch (e) { errors.push(slug + ': ' + e.message); }
  }
  const preferred = ['gpt-6','qwen4','deepseek','grok','composer-2-5','gemini-3-8-flash','hy4'];
  agents.sort((a,b) => preferred.indexOf(a.id) - preferred.indexOf(b.id));
  // 可读编号由任务卡声明：先按工作组与组内序号，再在同组中按编号展示。
  // 是否可执行由 status/任务依赖决定，编号不代表严格的执行先后。
  tasks.sort((a,b) => a.displayCode.localeCompare(b.displayCode, 'zh-CN', {numeric: true})
    || (statusOrder[a.status] ?? 9)-(statusOrder[b.status] ?? 9)
    || (priorityOrder[a.priority] ?? 8)-(priorityOrder[b.priority] ?? 8)
    || a.id.localeCompare(b.id));
  // 子任务由执行模型自行创建；父任务显示其所有子任务的真实进度。
  // 原始 ID 保持稳定，父子关系不另建数据库。
  const taskIndex = new Map(tasks.map(t => [t.id,t]));
  for (const task of tasks) {
    if (!task.parentId) continue;
    const parent = taskIndex.get(task.parentId);
    if (!parent) { errors.push('子任务缺少父任务：' + task.id); continue; }
    if (parent.owner !== task.owner) { errors.push('子任务不可跨模型修改父任务：' + task.id); continue; }
    parent.childTasks.push(task.id);
  }
  const measure = (task, ancestors = new Set()) => {
    if (ancestors.has(task.id)) { errors.push('检测到任务依赖循环：'+task.id); return {total:0,done:0}; }
    const next = new Set(ancestors);next.add(task.id);
    // 有子任务时按子任务的叶节点计算，避免父子规划重复计数。
    let counts;
    if (task.childTasks.length) {
      counts = task.childTasks.reduce((s,id)=>{
        const x = measure(taskIndex.get(id),next);
        return {total:s.total+x.total,done:s.done+x.done};
      },{total:0,done:0});
    } else counts = {total:task.stepTotal,done:task.stepDone};
    task.displayTotal=counts.total;
    task.displayDone=counts.done;
    task.hasPlan=counts.total>0;
    task.progress=counts.total?Math.round(100*counts.done/counts.total):null;
    if (task.childTasks.length) {
      task.currentStep = task.status==='approved'?'全部子任务已验收':
        '已自主拆分 '+task.childTasks.length+' 项子任务，可继续打开查看';
    } else if (!task.stepTotal) task.currentStep =
      task.status==='backlog'?'暂缓，尚未安排自主规划':
      task.status==='ready'?'等待模型领取后自主制定执行计划':
      task.status==='in_progress'?'已领取，正在自主拆解子任务':
      task.currentStep;
    return counts;
  };
  const rootTasks = tasks.filter(t => !t.parentId || !taskIndex.has(t.parentId));
  const rootCounts = rootTasks.map(t=>measure(t));
  const totalSteps=rootCounts.reduce((s,c)=>s+c.total,0);
  const completedSteps=rootCounts.reduce((s,c)=>s+c.done,0);
  const unplannedRoots=rootTasks.filter(t=>!t.hasPlan).length;
  const planningCoverage=rootTasks.length?Math.round((rootTasks.length-unplannedRoots)*100/rootTasks.length):0;
  const handoffs = tasks.filter(t=>t.hasHandoff).length;
  const reviewQueue = tasks.filter(t=>!t.parentId && t.status==='submitted').length;
  const messages = await readSharedMessages(errors);
  const openMessages = messages.filter(m=>m.status==='open').length;
  const statuses = {};
  for (const task of tasks) statuses[task.status] = (statuses[task.status] ?? 0) + 1;
  return {
    project: 'CARLAB', sourceOfTruth: 'agent-workspace/agents/*/tasks/*.md',
    mode: 'file-synced', generatedAt: new Date().toISOString(),
    agents, tasks, messages, errors,
    summary: { agents: agents.length, tasks: tasks.length, mainTasks: rootTasks.length,
      subtasks: tasks.length - rootTasks.length, unplannedRoots, planningCoverage,
      totalSteps, completedSteps, progress: totalSteps ? Math.round(completedSteps * 100 / totalSteps) : 0,
      handoffs, reviewQueue, openMessages, statuses },
  };
}

const reportLocks = new Set();
async function submitReport(req, taskId) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
    return { code: 415, result: { error: '只能提交 JSON 格式的回报' } };
  }
  const origin = req.headers.origin;
  if (origin && !['http://127.0.0.1:' + PORT, 'http://localhost:' + PORT].includes(origin)) {
    return { code: 403, result: { error: '不允许从其他网站提交' } };
  }
  if (reportLocks.has(taskId)) return { code: 409, result: { error: '任务正在接收另一份回报，请稍后重试' } };
  reportLocks.add(taskId);
  try {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > 45000) return { code: 413, result: { error: '回报太长（上限约 40 KB），请提炼摘要后重试' } };
      chunks.push(chunk);
    }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return { code: 400, result: { error: '回报请求格式有误' } }; }
    const report = typeof data.report === 'string' ? data.report.trim() : '';
    if (report.length < 20 || report.length > 40000) {
      return { code: 400, result: { error: '回报请填写 20—40000 个字符，包含成果与验证信息' } };
    }
    const task = (await readSnapshot()).tasks.find(t => t.id === taskId);
    if (!task) return { code: 404, result: { error: '找不到此任务' } };
    if (task.status === 'approved') return { code: 409, result: { error: '此任务已验收，不能覆盖历史回报' } };
    if (data.expectedUpdatedAt && data.expectedUpdatedAt !== task.updatedAt) {
      return { code: 409, result: { error: '任务文件已被其他 AI 更新，请刷新后再提交' } };
    }
    const taskFile = path.join(ROOT, task.source);
    const reportFile = path.join(ROOT, task.reportPath);
    const taskRaw = await fs.readFile(taskFile, 'utf8');
    const stat = await fs.stat(taskFile);
    if (stat.mtime.toISOString() !== task.updatedAt) {
      return { code: 409, result: { error: '任务发生并发修改，请先刷新' } };
    }
    if (!/^status:\s*\S+/m.test(taskRaw)) {
      return { code: 422, result: { error: '任务状态字段不完整，未写入回报' } };
    }
    const rewritten = taskRaw.replace(/^status:.*$/m, 'status: submitted')
      .replace(/^lastNote:.*$/m, 'lastNote: 已收到外部 AI 的回报，等待 GPT-6 审查。');
    await fs.mkdir(path.dirname(reportFile), { recursive: true });
    const safeText = '# ' + taskId + '｜' + task.title + '\n\n'
      + '> 来源：用户从外部 AI 会话粘贴。尚未经独立审查。\n\n'
      + report + '\n';
    if (await fs.stat(reportFile).then(()=>true).catch(()=>false)) {
      const old = await fs.readFile(reportFile, 'utf8');
      const archiveDir = path.join(path.dirname(reportFile), 'history');
      await fs.mkdir(archiveDir, {recursive:true});
      const backupName = taskId + '-' + new Date().toISOString().replace(/[:.]/g,'-') + '.md';
      await fs.writeFile(path.join(archiveDir, backupName), old, {flag:'wx'});
    }
    await fs.writeFile(reportFile, safeText);
    await fs.writeFile(taskFile, rewritten);
    return { code: 200, result: { ok: true, taskId, status: 'submitted', reportPath: task.reportPath } };
  } catch(e) {
    console.error('[report]', e);
    return { code: 500, result: { error: '保存回报失败：' + e.message } };
  } finally {
    reportLocks.delete(taskId);
  }
}

function send(res, code, body, mime='application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': mime, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'POST' && /^\/api\/report\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
      const taskId = url.pathname.slice('/api/report/'.length);
      const response = await submitReport(req, taskId);
      return send(res, response.code, JSON.stringify(response.result));
    }
    if (req.method !== 'GET') return send(res, 405, JSON.stringify({ error: '该接口不支持此操作' }));
    if (url.pathname === '/api/dashboard') {
      return send(res, 200, JSON.stringify(await readSnapshot()));
    }
    if (url.pathname === '/api/health') {
      return send(res, 200, JSON.stringify({ ok: true, service: 'CARLAB Command Center' }));
    }
    const item = allowedFiles.get(url.pathname);
    if (!item) return send(res, 404, JSON.stringify({ error: 'Not found' }));
    return send(res, 200, await fs.readFile(path.join(HERE, item[0])), item[1]);
  } catch (e) {
    console.error('[dashboard]', e);
    return send(res, 500, JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, HOST, () => {
  console.log('CARLAB Command Center → http://' + HOST + ':' + PORT);
  console.log('任务状态源: ' + path.relative(ROOT, AGENTS_DIR));
  console.log('文件驱动，每 8 秒更新；可粘贴回报并保存为 Markdown；不自动启动其他 AI');
});
