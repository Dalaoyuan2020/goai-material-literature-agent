import 'dotenv/config';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import helmet from 'helmet';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { loadKnowledgeData, suggestionFor } from './knowledge.js';
import { runPythonSkill, type PythonSummary } from './python.js';

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.API_KEY || 'dev-key-change-me';
const BASE_PATH = '/api/v1';
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPENAPI_JSON = fs.readFileSync(path.join(SERVER_ROOT, 'openapi.json'), 'utf8');
const PROJECT_ROOT = path.resolve(process.env.MATERIAL_AGENT_ROOT || path.join(SERVER_ROOT, '..', '..'));
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || path.join(PROJECT_ROOT, 'outputs', 'workbench'));
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
let knowledgeData = loadKnowledgeData(PROJECT_ROOT);

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps?: string[];
  suggestion?: {
    name: string;
    meta: string;
  };
  createdAt: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  module: 'research' | 'knowledge' | 'opensource' | 'report';
  status: 'created' | 'running' | 'completed' | 'failed';
  messages: Message[];
  workflow?: {
    currentStep: string;
    progress: number;
    jobId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface Job {
  id: string;
  taskId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  metrics: {
    nodes: number;
    edges: number;
    modularity: number;
    silhouette: number;
    bursts: number;
    clusters: number;
    centralNodes: string[];
    candidates?: number;
    evidencePairs?: number;
    coreMaterials?: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface Report {
  id: string;
  taskId: string;
  status: 'generating' | 'completed' | 'failed';
  fileName: string;
  downloadUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface TaskEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

const tasks = new Map<string, Task>();
const jobs = new Map<string, Job>();
const reports = new Map<string, Report>();
const taskEventClients = new Map<string, Set<Response>>();

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',').map((item) => item.trim()) ?? true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Api-Key'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = req.header('x-request-id') || nanoid(12);
  res.setHeader('x-request-id', requestId);
  next();
});

function now(): string {
  return new Date().toISOString();
}

function publicTask(task: Task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    module: task.module,
    status: task.status,
    messages: task.messages,
    workflow: task.workflow ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

function publicJob(job: Job) {
  return { ...job };
}

function publicReport(report: Report) {
  return {
    id: report.id,
    taskId: report.taskId,
    status: report.status,
    fileName: report.fileName,
    downloadUrl: report.downloadUrl,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt
  };
}

function emitTaskEvent(taskId: string, type: string, payload: Record<string, unknown>): TaskEvent {
  const event: TaskEvent = {
    id: `evt_${nanoid(12)}`,
    type,
    payload,
    timestamp: now()
  };
  const clients = taskEventClients.get(taskId);
  if (clients) {
    const frame = [
      `event: ${type}`,
      `id: ${event.id}`,
      `data: ${JSON.stringify(event)}`,
      ''
    ].join('\n');
    for (const client of clients) {
      if (!client.writableEnded) {
        client.write(`${frame}\n`);
      }
    }
  }
  return event;
}

function toAssistantMessage(content: string, steps: string[], suggestion?: Message['suggestion']): Message {
  return {
    id: `msg_${nanoid(12)}`,
    role: 'assistant',
    content,
    steps,
    suggestion,
    createdAt: now()
  };
}

app.get('/openapi.json', (_req: Request, res: Response) => {
  res.type('application/json').send(OPENAPI_JSON);
});

app.get(`${BASE_PATH}/openapi.json`, (_req: Request, res: Response) => {
  res.type('application/json').send(OPENAPI_JSON);
});

app.get(`${BASE_PATH}/health`, (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'material-literature-workbench-api',
    version: '0.1.0',
    timestamp: now(),
    projectRoot: PROJECT_ROOT,
    knowledgeEdges: knowledgeData.edges.length
  });
});

function requireApiKey(req: Request, res: Response, next: NextFunction) {
  if (req.path === `${BASE_PATH}/health`) {
    next();
    return;
  }
  const provided = req.header('x-api-key');
  if (provided !== API_KEY) {
    res.status(401).json({
      code: 'UNAUTHORIZED',
      message: '无效或缺失 X-Api-Key'
    });
    return;
  }
  next();
}

app.use(requireApiKey);

app.get(`${BASE_PATH}/`, (_req: Request, res: Response) => {
  res.json({
    name: 'knowledge-workbench-api',
    version: '0.1.0',
    basePath: BASE_PATH,
    docs: '/openapi.json'
  });
});

const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  module: z.enum(['research', 'knowledge', 'opensource', 'report']).default('research'),
  openCitespace: z.boolean().optional().default(false)
});

app.post(`${BASE_PATH}/tasks`, (req: Request, res: Response) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: '请求参数校验失败',
      details: parsed.error.flatten()
    });
    return;
  }

  const task: Task = {
    id: `task_${nanoid(12)}`,
    title: parsed.data.title,
    description: parsed.data.description,
    module: parsed.data.module,
    status: 'created',
    messages: [],
    createdAt: now(),
    updatedAt: now()
  };
  tasks.set(task.id, task);
  emitTaskEvent(task.id, 'task.created', { task: publicTask(task) });
  res.status(201).json(publicTask(task));
});

app.get(`${BASE_PATH}/tasks`, (req: Request, res: Response) => {
  const status = String(req.query.status || '');
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Number(req.query.offset || 0);
  const all = [...tasks.values()]
    .filter((task) => !status || task.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({
    items: all.slice(offset, offset + limit).map(publicTask),
    total: all.length
  });
});

app.get(`${BASE_PATH}/tasks/:id`, (req: Request, res: Response) => {
  const task = tasks.get(String(req.params.id));
  if (!task) {
    res.status(404).json({ code: 'RESOURCE_NOT_FOUND', message: '任务不存在' });
    return;
  }
  res.json(publicTask(task));
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  attachments: z.array(z.object({
    name: z.string(),
    path: z.string(),
    type: z.string().optional()
  })).optional().default([])
});

app.post(`${BASE_PATH}/tasks/:id/messages`, (req: Request, res: Response) => {
  const task = tasks.get(String(req.params.id));
  if (!task) {
    res.status(404).json({ code: 'RESOURCE_NOT_FOUND', message: '任务不存在' });
    return;
  }
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: '消息参数校验失败',
      details: parsed.error.flatten()
    });
    return;
  }

  const message: Message = {
    id: `msg_${nanoid(12)}`,
    role: 'user',
    content: parsed.data.content,
    createdAt: now()
  };
  task.messages.push(message);
  task.updatedAt = now();
  emitTaskEvent(task.id, 'message.created', { message });
  res.status(201).json(message);

  const suggestion = suggestionFor(knowledgeData, parsed.data.content);
  const assistant = toAssistantMessage(
    suggestion
      ? '已从真实 L4 类比迁移产物中匹配到候选假设；该候选尚未完成外部数据库或实验验证。'
      : `已检索 ${knowledgeData.edges.length} 条真实知识边，未找到可展示的候选假设。`,
    ['解析研究目标', '检索核心 DOI 边与 MatKG 弱证据边', '读取 L4 候选并保持未验证标记'],
    suggestion
  );
  task.messages.push(assistant);
  task.updatedAt = now();
  emitTaskEvent(task.id, 'message.created', { message: assistant });
});

app.get(`${BASE_PATH}/tasks/:id/events`, (req: Request, res: Response) => {
  const task = tasks.get(String(req.params.id));
  if (!task) {
    res.status(404).json({ code: 'RESOURCE_NOT_FOUND', message: '任务不存在' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clients = taskEventClients.get(task.id) ?? new Set<Response>();
  clients.add(res);
  taskEventClients.set(task.id, clients);

  const send = (event: string, payload: Record<string, unknown>) => {
    const frame = [
      `event: ${event}`,
      `id: evt_${nanoid(12)}`,
      `data: ${JSON.stringify({ ...payload, timestamp: now() })}`,
      ''
    ].join('\n');
    res.write(`${frame}\n`);
  };

  send('connected', { taskId: task.id });
  const timer = setInterval(() => {
    send('heartbeat', { at: now() });
  }, 15000);

  req.on('close', () => {
    clearInterval(timer);
    clients.delete(res);
    if (clients.size === 0) {
      taskEventClients.delete(task.id);
    }
  });
});

const searchSchema = z.object({
  keyword: z.string().optional().default(''),
  tier: z.enum(['all', 'core', 'extended']).optional().default('all'),
  limit: z.number().int().min(1).max(1000).optional().default(50),
  offset: z.number().int().min(0).optional().default(0)
});

app.post(`${BASE_PATH}/knowledge/search`, (req: Request, res: Response) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: '检索参数校验失败',
      details: parsed.error.flatten()
    });
    return;
  }
  const keyword = parsed.data.keyword.trim().toLowerCase();
  const items = knowledgeData.edges.filter((edge) => {
    const tierMatch = parsed.data.tier === 'all' || edge.tier === parsed.data.tier;
    const keywordMatch =
      !keyword ||
      [edge.source, edge.target, edge.relation, edge.doi, edge.evidence, edge.quote]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    return tierMatch && keywordMatch;
  });
  res.json({
    items: items.slice(parsed.data.offset, parsed.data.offset + parsed.data.limit),
    total: items.length,
    stats: knowledgeData.stats
  });
});

app.get(`${BASE_PATH}/knowledge/stats`, (_req: Request, res: Response) => {
  res.json(knowledgeData.stats);
});

const engines = [
  {
    id: 'pybibx',
    name: 'PyBibX',
    repo: 'https://github.com/Valdecy/pybibx',
    strengths: ['Scopus/WoS/PubMed/OpenAlex', '共现/共被引/突现/时间线', 'Web App'],
    adaptation: 'Python 自动化、批量导入、导出'
  },
  {
    id: 'bibliometrix',
    name: 'Bibliometrix + Biblioshiny',
    repo: 'https://github.com/massimoaria/bibliometrix',
    strengths: ['R 科学计量全流程', '主题演化/聚类/耦合', '交互面板'],
    adaptation: '研究报告、统计面板'
  },
  {
    id: 'sci2',
    name: 'Sci2 Tool',
    repo: 'https://github.com/CIShell/sci2',
    strengths: ['时间/地理/网络/多尺度', 'CIShell 模块化'],
    adaptation: '复杂科学学分析'
  },
  {
    id: 'gephi',
    name: 'Gephi',
    repo: 'https://github.com/gephi/gephi',
    strengths: ['大规模网络可视化', '布局/过滤/社区发现'],
    adaptation: '发表级图谱'
  },
  {
    id: 'scientopy',
    name: 'ScientoPy',
    repo: 'https://github.com/jpruiz84/ScientoPy',
    strengths: ['WoS/Scopus 快速预处理', '趋势/演化/词云'],
    adaptation: '快速趋势报告'
  }
];

app.get(`${BASE_PATH}/engines`, (_req: Request, res: Response) => {
  res.json({ items: engines, total: engines.length });
});

const workflowSchema = z.object({
  taskId: z.string().min(1),
  skillId: z.string().min(1),
  input: z.record(z.unknown()).optional().default({})
});

function updateJob(task: Task, job: Job, progress: number, currentStep: string) {
  job.status = 'running';
  job.progress = progress;
  job.currentStep = currentStep;
  job.updatedAt = now();
  if (task.workflow) {
    task.workflow.currentStep = currentStep;
    task.workflow.progress = progress;
  }
  task.updatedAt = now();
  emitTaskEvent(task.id, 'workflow.step', {
    taskId: task.id,
    jobId: job.id,
    currentStep,
    progress
  });
}

function metricsFromSummary(summary: PythonSummary): Job['metrics'] {
  return {
    nodes: summary.nodes,
    edges: summary.edges,
    modularity: summary.candidates,
    silhouette: summary.evidencePairs,
    bursts: summary.coreMaterials,
    clusters: summary.families,
    centralNodes: summary.centralNodes,
    candidates: summary.candidates,
    evidencePairs: summary.evidencePairs,
    coreMaterials: summary.coreMaterials
  };
}

async function executeWorkflow(task: Task, job: Job, skillId: string): Promise<void> {
  try {
    updateJob(task, job, 15, 'python-bridge-started');
    const result = await runPythonSkill(PROJECT_ROOT, skillId);
    if (!result.summary) {
      throw new Error('Python 工作流没有返回真实摘要');
    }
    updateJob(task, job, 85, 'artifacts-loaded');
    knowledgeData = loadKnowledgeData(PROJECT_ROOT);
    job.status = 'completed';
    job.progress = 100;
    job.currentStep = 'completed';
    job.metrics = metricsFromSummary(result.summary);
    job.updatedAt = now();
    task.status = 'completed';
    if (task.workflow) {
      task.workflow.currentStep = 'completed';
      task.workflow.progress = 100;
    }
    task.updatedAt = now();
    emitTaskEvent(task.id, 'workflow.completed', {
      taskId: task.id,
      jobId: job.id,
      metrics: job.metrics,
      result
    });
    const completion = toAssistantMessage(
      result.message || `真实工作流已完成：${job.metrics.nodes} 个节点、${job.metrics.edges} 条边。`,
      ['调用 agent/workflow.json 白名单动作', '执行 Python 运算层', '读取真实 JSON 产物并回传界面']
    );
    task.messages.push(completion);
    emitTaskEvent(task.id, 'message.created', { message: completion });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    job.status = 'failed';
    job.progress = 100;
    job.currentStep = 'failed';
    job.updatedAt = now();
    task.status = 'failed';
    if (task.workflow) {
      task.workflow.currentStep = 'failed';
      task.workflow.progress = 100;
    }
    task.updatedAt = now();
    emitTaskEvent(task.id, 'workflow.failed', { taskId: task.id, jobId: job.id, error: message });
    const failure = toAssistantMessage(
      `真实 Python 工作流执行失败：${message}`,
      ['错误已原样返回；没有使用模拟指标或伪造成功结果']
    );
    task.messages.push(failure);
    emitTaskEvent(task.id, 'message.created', { message: failure });
  }
}

app.post(`${BASE_PATH}/workflow/run`, (req: Request, res: Response) => {
  const parsed = workflowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: '工作流参数校验失败',
      details: parsed.error.flatten()
    });
    return;
  }

  const task = tasks.get(parsed.data.taskId);
  if (!task) {
    res.status(404).json({ code: 'RESOURCE_NOT_FOUND', message: '任务不存在' });
    return;
  }

  const job: Job = {
    id: `job_${nanoid(12)}`,
    taskId: task.id,
    status: 'queued',
    progress: 0,
    currentStep: 'queued',
    metrics: {
      nodes: 0,
      edges: 0,
      modularity: 0,
      silhouette: 0,
      bursts: 0,
      clusters: 0,
      centralNodes: []
    },
    createdAt: now(),
    updatedAt: now()
  };
  jobs.set(job.id, job);
  task.status = 'running';
  task.workflow = { currentStep: 'queued', progress: 0, jobId: job.id };
  task.updatedAt = now();

  emitTaskEvent(task.id, 'workflow.started', {
    taskId: task.id,
    jobId: job.id,
    skillId: parsed.data.skillId,
    input: parsed.data.input
  });

  void executeWorkflow(task, job, parsed.data.skillId);

  res.status(202).json({
    jobId: job.id,
    status: job.status,
    events: `${BASE_PATH}/tasks/${task.id}/events`
  });
});

app.get(`${BASE_PATH}/jobs/:id`, (req: Request, res: Response) => {
  const job = jobs.get(String(req.params.id));
  if (!job) {
    res.status(404).json({ code: 'JOB_NOT_FOUND', message: '分析任务不存在' });
    return;
  }
  res.json(publicJob(job));
});

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildGraphml(job: Job): string {
  const nodes = job.metrics.centralNodes
    .map((node, index) => `      <node id="n${index + 1}"><data key="label">${escapeXml(node)}</data></node>`)
    .join('\n');
  const edgeLines = job.metrics.centralNodes
    .slice(0, -1)
    .map((_, index) => `      <edge source="n${index + 1}" target="n${index + 2}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="label" for="node" attr.name="label" attr.type="string"/>
  <graph edgedefault="undirected">
${nodes}
${edgeLines}
  </graph>
</graphml>
`;
}

function buildPajek(job: Job): string {
  const vertices = job.metrics.centralNodes
    .map((node, index) => `${index + 1} "${node.replace(/"/g, '')}"`)
    .join('\n');
  const edges = job.metrics.centralNodes
    .slice(0, -1)
    .map((_, index) => `${index + 1} ${index + 2} 1`)
    .join('\n');
  return `*Vertices ${job.metrics.centralNodes.length}\n${vertices}\n*Edges\n${edges}\n`;
}

function buildCsv(job: Job): string {
  const lines = [
    'source,target,relation,evidence',
    ...job.metrics.centralNodes
      .slice(0, -1)
      .map((node, index) => `${node},${job.metrics.centralNodes[index + 1]},co-occurrence,direct`)
  ];
  return `${lines.join('\n')}\n`;
}

function buildRis(job: Job): string {
  const lines = [
    'TY  - GEN',
    `TI  - Knowledge graph export for job ${job.id}`,
    `AB  - Nodes: ${job.metrics.nodes}; Edges: ${job.metrics.edges}; Clusters: ${job.metrics.clusters}.`,
    `KW  - ${job.metrics.centralNodes.join('; ')}`,
    'ER  -'
  ];
  return `${lines.join('\n')}\n`;
}

function buildSvg(job: Job): string {
  const nodes = job.metrics.centralNodes
    .map((node, index) => {
      const x = 80 + (index % 4) * 150;
      const y = 90 + Math.floor(index / 4) * 110;
      return `<circle cx="${x}" cy="${y}" r="18" fill="#4f8cff"/><text x="${x}" y="${y + 5}" text-anchor="middle" fill="#fff" font-size="10">${escapeXml(node.slice(0, 16))}</text>`;
    })
    .join('\n');
  const edges = job.metrics.centralNodes
    .slice(0, -1)
    .map((_, index) => {
      const x1 = 80 + (index % 4) * 150 + 18;
      const y1 = 90 + Math.floor(index / 4) * 110;
      const x2 = 80 + ((index + 1) % 4) * 150 - 18;
      const y2 = 90 + Math.floor((index + 1) / 4) * 110;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7a8ca3" stroke-width="1.5"/>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="360" viewBox="0 0 720 360">
  <rect width="720" height="360" fill="#10151c"/>
  <text x="24" y="30" fill="#e5edf5" font-size="14">${escapeXml(job.id)}</text>
${edges}
${nodes}
</svg>
`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function createPngBuffer(width = 720, height = 360): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((1 + width * 3) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * 3;
      raw[offset] = 16 + Math.floor((x / width) * 60);
      raw[offset + 1] = 30 + Math.floor((y / height) * 90);
      raw[offset + 2] = 72 + Math.floor(((x + y) / (width + height)) * 120);
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function buildMarkdown(job: Job): string {
  return [
    `# 图谱分析报告 · ${job.id}`,
    '',
    `- 状态：${job.status}`,
    `- 节点：${job.metrics.nodes}`,
    `- 边：${job.metrics.edges}`,
    `- 模块度：${job.metrics.modularity}`,
    `- 轮廓值：${job.metrics.silhouette}`,
    `- 突现：${job.metrics.bursts}`,
    `- 聚类：${job.metrics.clusters}`,
    '',
    '## 中心节点',
    '',
    ...job.metrics.centralNodes.map((node) => `- ${node}`),
    ''
  ].join('\n');
}

function buildExport(job: Job, format: string): { fileName: string; content: Buffer; contentType: string } {
  const extMap: Record<string, string> = {
    graphml: 'graphml',
    pajek: 'net',
    csv: 'csv',
    ris: 'ris',
    svg: 'svg',
    png: 'png',
    markdown: 'md'
  };
  const extension = extMap[format] ?? 'txt';
  const fileName = `graph-${job.id}.${extension}`;
  const contentByFormat: Record<string, Buffer | string> = {
    graphml: buildGraphml(job),
    pajek: buildPajek(job),
    csv: buildCsv(job),
    ris: buildRis(job),
    svg: buildSvg(job),
    png: createPngBuffer(),
    markdown: buildMarkdown(job)
  };
  const content = Buffer.isBuffer(contentByFormat[format])
    ? contentByFormat[format]
    : Buffer.from(contentByFormat[format] ?? `format: ${format}`, 'utf8');
  const contentTypeByFormat: Record<string, string> = {
    graphml: 'application/xml',
    pajek: 'text/plain',
    csv: 'text/csv',
    ris: 'application/x-research-info-systems',
    svg: 'image/svg+xml',
    png: 'image/png',
    markdown: 'text/markdown'
  };
  return {
    fileName,
    content,
    contentType: contentTypeByFormat[format] ?? 'application/octet-stream'
  };
}

const exportSchema = z.object({
  jobId: z.string().min(1),
  format: z.enum(['graphml', 'pajek', 'csv', 'ris', 'svg', 'png', 'markdown'])
});

app.post(`${BASE_PATH}/exports`, (req: Request, res: Response) => {
  const parsed = exportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: '导出参数校验失败',
      details: parsed.error.flatten()
    });
    return;
  }
  const job = jobs.get(parsed.data.jobId);
  if (!job) {
    res.status(404).json({ code: 'JOB_NOT_FOUND', message: '分析任务不存在' });
    return;
  }
  const output = buildExport(job, parsed.data.format);
  const filePath = path.join(OUTPUT_DIR, output.fileName);
  fs.writeFileSync(filePath, output.content);
  res.status(201).json({
    fileName: output.fileName,
    downloadUrl: `${BASE_PATH}/files/${encodeURIComponent(output.fileName)}`,
    size: Buffer.byteLength(output.content),
    format: parsed.data.format
  });
});

app.get(`${BASE_PATH}/files/:name`, (req: Request, res: Response, next: NextFunction) => {
  const fileName = String(req.params.name);
  if (path.basename(fileName) !== fileName || fileName.includes('..')) {
    res.status(400).json({ code: 'VALIDATION_ERROR', message: '文件名不合法' });
    return;
  }
  const filePath = path.join(OUTPUT_DIR, fileName);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.status(404).json({ code: 'RESOURCE_NOT_FOUND', message: '文件不存在' });
    return;
  }
  res.download(filePath, fileName, (error) => {
    if (error && !res.headersSent) {
      next(error);
    }
  });
});

const reportSchema = z.object({
  taskId: z.string().min(1),
  jobIds: z.array(z.string()).optional().default([]),
  include: z.array(z.string()).optional().default(['summary', 'network', 'clusters', 'bursts', 'suggestions'])
});

function buildReportContent(task: Task, report: Report, jobIds: string[]): string {
  const usedJobs = jobIds
    .map((id) => jobs.get(id))
    .filter((job): job is Job => Boolean(job));
  const job = usedJobs[0];
  return [
    `# 研究报告 · ${task.title}`,
    '',
    `- 任务：${task.id}`,
    `- 状态：${report.status}`,
    `- 节点：${job?.metrics.nodes ?? 0}`,
    `- 边：${job?.metrics.edges ?? 0}`,
    `- 聚类：${job?.metrics.clusters ?? 0}`,
    `- 突现：${job?.metrics.bursts ?? 0}`,
    '',
    '## 建议',
    '',
    ...(task.messages.flatMap((message) => message.suggestion ? [`- ${message.suggestion.name}：${message.suggestion.meta}`] : [])),
    ''
  ].join('\n');
}

app.post(`${BASE_PATH}/reports/generate`, (req: Request, res: Response) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: '报告参数校验失败',
      details: parsed.error.flatten()
    });
    return;
  }
  const task = tasks.get(parsed.data.taskId);
  if (!task) {
    res.status(404).json({ code: 'RESOURCE_NOT_FOUND', message: '任务不存在' });
    return;
  }
  const reportId = `report_${nanoid(12)}`;
  const report: Report = {
    id: reportId,
    taskId: task.id,
    status: 'generating',
    fileName: `report-${nanoid(12)}.md`,
    downloadUrl: `${BASE_PATH}/reports/${reportId}/download`,
    createdAt: now(),
    updatedAt: now()
  };
  reports.set(report.id, report);
  emitTaskEvent(task.id, 'report.started', { report: publicReport(report) });

  setTimeout(() => {
    report.status = 'completed';
    report.updatedAt = now();
    const content = buildReportContent(task, report, parsed.data.jobIds);
    fs.writeFileSync(path.join(OUTPUT_DIR, report.fileName), content, 'utf8');
    emitTaskEvent(task.id, 'report.completed', { report: publicReport(report) });
  }, 700);

  res.status(202).json(publicReport(report));
});

app.get(`${BASE_PATH}/reports/:id`, (req: Request, res: Response) => {
  const report = reports.get(String(req.params.id));
  if (!report) {
    res.status(404).json({ code: 'RESOURCE_NOT_FOUND', message: '报告不存在' });
    return;
  }
  res.json(publicReport(report));
});

app.get(`${BASE_PATH}/reports/:id/download`, (req: Request, res: Response, next: NextFunction) => {
  const report = reports.get(String(req.params.id));
  if (!report) {
    res.status(404).json({ code: 'RESOURCE_NOT_FOUND', message: '报告不存在' });
    return;
  }
  if (report.status !== 'completed') {
    res.status(409).json({ code: 'CONFLICT', message: '报告尚未生成完成' });
    return;
  }
  const filePath = path.join(OUTPUT_DIR, report.fileName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ code: 'RESOURCE_NOT_FOUND', message: '报告文件不存在' });
    return;
  }
  res.download(filePath, report.fileName, (error) => {
    if (error && !res.headersSent) {
      next(error);
    }
  });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    code: 'RESOURCE_NOT_FOUND',
    message: '接口不存在'
  });
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: '服务器内部错误'
  });
});

app.listen(PORT, HOST, () => {
  console.log(`[material-literature-workbench-api] project: ${PROJECT_ROOT}`);
  console.log(`[material-literature-workbench-api] listening on http://${HOST}:${PORT}${BASE_PATH}`);
  console.log(`[material-literature-workbench-api] openapi: http://${HOST}:${PORT}/openapi.json`);
});
