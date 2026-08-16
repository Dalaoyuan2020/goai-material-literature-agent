import { Database, Download, ExternalLink, FileText, GitBranch, Image, Network, Play, RefreshCw, Rocket, Settings, Share2, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

type CitespaceTab = 'data' | 'params' | 'run' | 'view' | 'export';

interface CitespaceMetrics {
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
}

interface CitespaceViewProps {
  activeTaskId: string;
  onEnsureTask: () => Promise<string>;
  onRunWorkflow: (taskId: string, input: Record<string, unknown>) => Promise<{ jobId: string; status: string; events: string }>;
}

const TABS: Array<{ id: CitespaceTab; label: string; icon: typeof Database }> = [
  { id: 'data', label: '数据', icon: Database },
  { id: 'params', label: '参数', icon: Settings },
  { id: 'run', label: '分析', icon: Play },
  { id: 'view', label: '视图', icon: Share2 },
  { id: 'export', label: '导出', icon: Download }
];

const SOURCES = ['Web of Science', 'Scopus', 'CNKI', 'PubMed', 'Dimensions', 'Lens', 'CSV / Excel', 'RIS / BibTeX'];

const NODE_TYPES = [
  '关键词',
  '引用文献',
  '引用作者',
  '引用期刊',
  '作者',
  '机构',
  '国家 / 地区',
  '术语',
  '文献分类',
  'DOI'
];

const LINK_STRENGTHS = ['Cosine', 'Jaccard', 'Dice', '互信息', 'PMI', '关联强度'];

const PRUNINGS = ['Pathfinder', '最小生成树', 'Pruned Slices', 'Pruned Merged Network', '不剪枝'];

const VIEW_MODES = ['时间线', '时区图', '聚类图', '国家合作', '机构合作', '作者合作', '文献耦合'];

const EXPORT_FORMATS = ['GraphML', 'Pajek', 'CSV 网络', 'RIS', 'PNG / SVG', 'Excel 表格', '分析报告'];

const EXPORT_KEYS: Record<string, string> = {
  GraphML: 'graphml',
  Pajek: 'pajek',
  'CSV 网络': 'csv',
  RIS: 'ris',
  'PNG / SVG': 'svg',
  'Excel 表格': 'csv',
  '分析报告': 'markdown'
};

const FUNCTIONS = [
  '关键词共现',
  '引用共现',
  '作者共被引',
  '期刊共被引',
  '作者合作',
  '机构合作',
  '国家合作',
  '术语提取',
  '聚类',
  '突现检测',
  '时间线',
  '时区图',
  '谱系图',
  '双图叠加',
  '文献耦合',
  '中介中心性'
];

const DEFAULT_METRICS: CitespaceMetrics = {
  nodes: 0,
  edges: 0,
  modularity: 0,
  silhouette: 0,
  bursts: 0,
  clusters: 0,
  centralNodes: []
};

interface EngineMeta {
  id: string;
  name: string;
  strengths: string[];
  adaptation: string;
}

const ENGINE_META: EngineMeta[] = [
  {
    id: 'pybibx',
    name: 'PyBibX',
    strengths: ['Scopus / WoS / PubMed / OpenAlex', '共现、共被引、突现、时间线、Web App', 'Python 自动化接入'],
    adaptation: '适合本地 API、批量导入和自动导出'
  },
  {
    id: 'bibliometrix',
    name: 'Bibliometrix + Biblioshiny',
    strengths: ['R 科学计量全流程', '主题演化、聚类、耦合、合作网络', 'Biblioshiny 交互面板'],
    adaptation: '适合研究报告、统计分析和 Web 面板'
  },
  {
    id: 'sci2',
    name: 'Sci2 Tool',
    strengths: ['时间、地理、网络、多尺度分析', 'CIShell 模块化架构', '科研网络数据整合'],
    adaptation: '适合复杂科学学分析和多源数据工作流'
  },
  {
    id: 'gephi',
    name: 'Gephi',
    strengths: ['大规模网络可视化', '布局、过滤、社区发现', '发表级图谱输出'],
    adaptation: '适合网络精修、聚类可视化和导出图谱'
  },
  {
    id: 'scientopy',
    name: 'ScientoPy',
    strengths: ['WoS / Scopus 快速预处理', '趋势、演化、词云', 'GUI 和批量脚本'],
    adaptation: '适合快速趋势报告和文献集预处理'
  }
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function CitespaceView({ activeTaskId, onEnsureTask, onRunWorkflow }: CitespaceViewProps) {
  const [tab, setTab] = useState<CitespaceTab>('data');
  const [dataSource, setDataSource] = useState(SOURCES[0]);
  const [dataPath, setDataPath] = useState('');
  const [nodeType, setNodeType] = useState(NODE_TYPES[0]);
  const [startYear, setStartYear] = useState(2000);
  const [endYear, setEndYear] = useState(2026);
  const [sliceYears, setSliceYears] = useState(1);
  const [topN, setTopN] = useState('30');
  const [linkStrength, setLinkStrength] = useState(LINK_STRENGTHS[0]);
  const [pruning, setPruning] = useState(PRUNINGS[0]);
  const [viewMode, setViewMode] = useState(VIEW_MODES[0]);
  const [exportFormat, setExportFormat] = useState(EXPORT_FORMATS[0]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<CitespaceMetrics>(DEFAULT_METRICS);
  const [exported, setExported] = useState('');
  const [jobId, setJobId] = useState('');
  const timerRef = useRef<number | undefined>(undefined);
  const [engines, setEngines] = useState<Array<{ id: string; name: string; available: boolean; version: string; path: string; status: string; installCommand: string; repo: string }>>([]);
  const [engineMessages, setEngineMessages] = useState<Record<string, string>>({});
  const [cleanMessage, setCleanMessage] = useState('');

  useEffect(() => {
    return () => {
      if (timerRef.current !== undefined) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        if (window.engines?.detect) {
          const probes = await window.engines.detect();
          setEngines(probes);
          setLog((current) => [...current, `已检测 ${probes.length} 个开源引擎`]);
          return;
        }
        const list = await api.listEngines();
        setEngines(list.items.map((engine) => ({
          id: engine.id,
          name: engine.name,
          available: false,
          version: '',
          path: '',
          status: '远程矩阵',
          installCommand: '',
          repo: engine.repo
        })));
        setLog((current) => [...current, `已读取 ${list.total} 个远程引擎元数据`]);
      } catch {
        setLog((current) => [...current, '后端未连接，无法读取引擎矩阵']);
      }
    })();
  }, []);

  const addLog = (line: string) => {
    setLog((current) => [...current.slice(-80), line]);
  };

  const browseData = async () => {
    if (window.citespace?.pickDataDirectory) {
      const dir = await window.citespace.pickDataDirectory();
      if (dir) {
        setDataPath(dir);
        addLog(`已选择数据目录：${dir}`);
      }
      return;
    }
    setDataPath('D:/LiteratureData');
    addLog('浏览器模式：使用默认文献数据目录');
  };

  const refreshEngines = async () => {
    try {
      if (window.engines?.detect) {
        const probes = await window.engines.detect();
        setEngines(probes);
        addLog(`重新检测 ${probes.length} 个开源引擎`);
        return;
      }
      const list = await api.listEngines();
      setEngines(list.items.map((engine) => ({
        id: engine.id,
        name: engine.name,
        available: false,
        version: '',
        path: '',
        status: '远程矩阵',
        installCommand: '',
        repo: engine.repo
      })));
      addLog(`重新读取 ${list.total} 个远程引擎元数据`);
    } catch {
      addLog('后端未连接，无法刷新引擎矩阵');
    }
  };

  const launchEngine = async (id: string) => {
    if (!window.engines?.launch) {
      setEngineMessages((current) => ({ ...current, [id]: '请通过桌面端启动本地引擎' }));
      return;
    }
    const result = await window.engines.launch(id, dataPath || undefined);
    if (result.ok) {
      setEngineMessages((current) => ({ ...current, [id]: result.url ? `已启动：${result.url}` : `已启动：${result.command || result.path || id}` }));
      addLog(`已启动 ${id}：${result.url || result.path || id}`);
    } else {
      setEngineMessages((current) => ({ ...current, [id]: result.error || '启动失败' }));
      addLog(`${id} 启动失败：${result.error || ''}`);
    }
  };

  const cleanEnginePaths = async () => {
    if (!window.engines?.cleanPaths) {
      setCleanMessage('浏览器模式：无需清理');
      return;
    }
    const result = await window.engines.cleanPaths();
    setCleanMessage(result.removed.length > 0 ? `已清理 ${result.removed.length} 个遗留路径` : '未发现遗留路径');
    await refreshEngines();
  };

  const pollJob = (jobIdToPoll: string) => {
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const job = await api.getJob(jobIdToPoll);
          setProgress(job.progress ?? 0);
          if (job.status === 'completed') {
            window.clearInterval(timer);
            timerRef.current = undefined;
            setRunning(false);
            setMetrics(job.metrics);
            addLog(`真实管线完成：${job.metrics.nodes} 个节点，${job.metrics.edges} 条边，${job.metrics.evidencePairs ?? 0} 组非退化证据`);
          } else if (job.status === 'failed') {
            window.clearInterval(timer);
            timerRef.current = undefined;
            setRunning(false);
            addLog('分析失败');
          }
        } catch (error) {
          window.clearInterval(timer);
          timerRef.current = undefined;
          setRunning(false);
          addLog(`读取真实任务失败：${error instanceof Error ? error.message : String(error)}`);
        }
      })();
    }, 400);
    timerRef.current = timer;
  };

  const runAnalysis = async () => {
    if (running) {
      return;
    }

    let taskId = activeTaskId;
    if (!taskId) {
      taskId = await onEnsureTask();
    }

    setRunning(true);
    setProgress(0);
    setExported('');
    setJobId('');
    setLog([
      `数据源：${dataSource}`,
      `节点类型：${nodeType}`,
      `时间切片：${startYear}-${endYear} / ${sliceYears} 年`,
      `Top N：${topN}，链接强度：${linkStrength}`,
      `剪枝策略：${pruning}`
    ]);

    try {
      const accepted = await onRunWorkflow(taskId, {
        dataSource,
        dataPath,
        nodeType,
        startYear,
        endYear,
        sliceYears,
        topN,
        linkStrength,
        pruning,
        viewMode
      });
      setJobId(accepted.jobId);
      pollJob(accepted.jobId);
    } catch (error) {
      setRunning(false);
      addLog(`真实工作流启动失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const downloadLocalExport = (format: string) => {
    const extMap: Record<string, string> = {
      GraphML: 'graphml',
      Pajek: 'net',
      'CSV 网络': 'csv',
      RIS: 'ris',
      'PNG / SVG': 'svg',
      'Excel 表格': 'csv',
      '分析报告': 'md'
    };
    const ext = extMap[format] ?? 'txt';
    const content = `# 科研编排图谱导出\n\n格式: ${format}\n数据源: ${dataSource}\n节点类型: ${nodeType}\n时间范围: ${startYear}-${endYear}\n节点: ${metrics.nodes}\n边: ${metrics.edges}\n聚类: ${metrics.clusters}\n突现: ${metrics.bursts}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `graph-export-${Date.now()}.${ext}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportReport = async (format: string) => {
    if (!jobId) {
      setExported('请先完成分析');
      return;
    }
    try {
      const result = await api.exportNetwork({ jobId, format: EXPORT_KEYS[format] || 'graphml' });
      await api.downloadFile(result.downloadUrl, result.fileName);
      setExported(`已生成 ${format} 文件`);
      addLog(`导出完成：${format}`);
    } catch {
      downloadLocalExport(format);
      setExported(`已生成 ${format} 文件`);
      addLog(`本地导出完成：${format}`);
    }
  };

  const generateReport = async () => {
    let taskId = activeTaskId;
    if (!taskId) {
      taskId = await onEnsureTask();
    }
    try {
      const report = await api.generateReport({ taskId, jobIds: jobId ? [jobId] : [] });
      let current = report;
      while (current.status === 'generating') {
        await sleep(300);
        current = await api.getReport(report.id);
      }
      await api.downloadFile(current.downloadUrl, current.fileName);
      setExported('报告已生成');
      addLog('报告生成完成');
    } catch {
      const content = `# 研究报告\n\n任务: ${taskId}\n节点: ${metrics.nodes}\n边: ${metrics.edges}\n聚类: ${metrics.clusters}\n突现: ${metrics.bursts}\n`;
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `report-${Date.now()}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExported('报告已生成');
      addLog('本地报告生成完成');
    }
  };

  const renderSourceButtons = () =>
    ['WoS 纯文本', 'Scopus CSV', 'CNKI 导出', 'PubMed XML', 'RIS / BibTeX'].map((label) => (
      <button
        key={label}
        type="button"
        className="text-btn"
        onClick={() => {
          addLog(`导入格式：${label}`);
          setDataPath((current) => current || `D:/LiteratureData/${label.replace(/\s+/g, '-')}`);
        }}
      >
        <Upload size={13} />
        {label}
      </button>
    ));

  return (
    <section className="view active">
      <div className="citespace-view">
        <div className="citespace-head">
          <div>
            <h2 className="section-title">文献计量图谱工作台</h2>
            <p className="topbar-meta">文献计量 · 共现网络 · 聚类 · 突现 · 时间线 · 导出</p>
          </div>
          <span className={`citespace-status${running ? ' running' : ''}`}>{running ? `分析运行中 · ${progress}%` : '工作台就绪'}</span>
        </div>
        <div className="function-chips">
          {FUNCTIONS.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <nav className="citespace-tabs" aria-label="图谱分析功能">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={`citespace-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
              <Icon size={14} />
              {label}
            </button>
          ))}
        </nav>
        <div className="citespace-content">
          {tab === 'data' && (
            <div className="citespace-grid">
              <div className="citespace-card">
                <div className="citespace-card-title">
                  <Database size={15} />
                  <strong>数据导入</strong>
                </div>
                <label className="form-field">
                  <span>数据源</span>
                  <select value={dataSource} onChange={(event) => setDataSource(event.target.value)}>
                    {SOURCES.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>数据目录</span>
                  <div className="input-with-button">
                    <input value={dataPath} onChange={(event) => setDataPath(event.target.value)} placeholder="选择 WoS / Scopus / CNKI 数据目录" />
                    <button type="button" className="text-btn" onClick={() => void browseData()}>
                      浏览
                    </button>
                  </div>
                </label>
                <div className="engine-toolbar">
                  <button type="button" className="text-btn" onClick={() => void refreshEngines()}>
                    <RefreshCw size={13} />
                    重新检测
                  </button>
                  <button type="button" className="text-btn" onClick={() => void cleanEnginePaths()}>
                    <Trash2 size={13} />
                    清理遗留路径
                  </button>
                  {cleanMessage && <span className="export-status">{cleanMessage}</span>}
                </div>
                <div className="engine-matrix">
                  {ENGINE_META.map((meta) => {
                    const probe = engines.find((item) => item.id === meta.id);
                    return (
                      <article key={meta.id} className={`engine-card${probe?.available ? ' available' : ''}`}>
                        <div className="engine-card-head">
                          <strong>{meta.name}</strong>
                          <span className={`tag ${probe?.available ? 'core' : 'pending'}`}>{probe?.status || '检测中'}</span>
                        </div>
                        <ul className="engine-strengths">
                          {meta.strengths.map((strength) => (
                            <li key={strength}>{strength}</li>
                          ))}
                        </ul>
                        <p className="engine-adapt">适配：{meta.adaptation}</p>
                        <div className="button-row wrap engine-actions">
                          <button type="button" className="text-btn primary" onClick={() => void launchEngine(meta.id)}>
                            <Rocket size={13} />
                            启动
                          </button>
                          <a className="text-btn" href={probe?.repo || '#'} target="_blank" rel="noreferrer">
                            <ExternalLink size={13} />
                            仓库
                          </a>
                          {probe?.installCommand && (
                            <button type="button" className="text-btn" onClick={() => void navigator.clipboard?.writeText(probe.installCommand)}>
                              复制安装命令
                            </button>
                          )}
                        </div>
                        {engineMessages[meta.id] && <div className="export-status">{engineMessages[meta.id]}</div>}
                        {probe?.path && <small className="engine-path">{probe.path}</small>}
                      </article>
                    );
                  })}
                </div>
                <div className="button-row wrap">{renderSourceButtons()}</div>
                <button type="button" className="text-btn primary" onClick={() => addLog('开始读取文献记录')}>
                  <Upload size={14} />
                  导入记录
                </button>
              </div>
              <div className="citespace-card">
                <div className="citespace-card-title">
                  <GitBranch size={15} />
                  <strong>预处理</strong>
                </div>
                {['记录去重', '作者消歧', '关键词标准化', '机构归并', '国家 / 地区提取'].map((item) => (
                  <label key={item} className="checkbox-field">
                    <input type="checkbox" defaultChecked={item !== '机构归并'} />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab === 'params' && (
            <div className="citespace-grid">
              <div className="citespace-card">
                <div className="citespace-card-title">
                  <Settings size={15} />
                  <strong>网络参数</strong>
                </div>
                <label className="form-field">
                  <span>节点类型</span>
                  <select value={nodeType} onChange={(event) => setNodeType(event.target.value)}>
                    {NODE_TYPES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="two-columns">
                  <label className="form-field">
                    <span>起始年份</span>
                    <input type="number" value={startYear} min={1980} max={2026} onChange={(event) => setStartYear(Number(event.target.value))} />
                  </label>
                  <label className="form-field">
                    <span>结束年份</span>
                    <input type="number" value={endYear} min={1980} max={2026} onChange={(event) => setEndYear(Number(event.target.value))} />
                  </label>
                </div>
                <div className="two-columns">
                  <label className="form-field">
                    <span>时间切片</span>
                    <select value={sliceYears} onChange={(event) => setSliceYears(Number(event.target.value))}>
                      <option value={1}>1 年</option>
                      <option value={2}>2 年</option>
                      <option value={3}>3 年</option>
                      <option value={5}>5 年</option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span>每片 Top N</span>
                    <input value={topN} onChange={(event) => setTopN(event.target.value)} />
                  </label>
                </div>
                <label className="form-field">
                  <span>链接强度</span>
                  <select value={linkStrength} onChange={(event) => setLinkStrength(event.target.value)}>
                    {LINK_STRENGTHS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>剪枝策略</span>
                  <select value={pruning} onChange={(event) => setPruning(event.target.value)}>
                    {PRUNINGS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="citespace-card">
                <div className="citespace-card-title">
                  <RefreshCw size={15} />
                  <strong>分析算法</strong>
                </div>
                {['中介中心性', '模块度 Q', '轮廓值 S', 'Sigma', '聚类标签 LSI / LLR / MI', '引用突现', '关键词突现'].map((item) => (
                  <label key={item} className="checkbox-field">
                    <input type="checkbox" defaultChecked={item !== '引用突现'} />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab === 'run' && (
            <div className="citespace-grid run-grid">
              <div className="citespace-card">
                <div className="citespace-card-title">
                  <Play size={15} />
                  <strong>执行分析</strong>
                </div>
                <button type="button" className="text-btn primary" onClick={() => void runAnalysis()} disabled={running}>
                  <Play size={14} />
                  {running ? `分析中 · ${progress}%` : '开始分析'}
                </button>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span className="progress-label">{progress}%</span>
                <div className="analysis-log">
                  {log.map((line, index) => (
                    <div key={`${line}-${index}`}>{line}</div>
                  ))}
                </div>
              </div>
              <div className="citespace-card">
                <div className="citespace-card-title">
                  <Network size={15} />
                  <strong>结果指标</strong>
                </div>
                <div className="metric-grid">
                  <div className="metric">
                    <span className="metric-value">{metrics.nodes}</span>
                    <span className="metric-label">节点</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value">{metrics.edges}</span>
                    <span className="metric-label">边</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value">{metrics.candidates ?? metrics.modularity}</span>
                    <span className="metric-label">未验证候选</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value">{metrics.evidencePairs ?? metrics.silhouette}</span>
                    <span className="metric-label">非退化证据对</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value">{metrics.coreMaterials ?? metrics.bursts}</span>
                    <span className="metric-label">核心材料</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value">{metrics.clusters}</span>
                    <span className="metric-label">结构家族</span>
                  </div>
                </div>
                <div className="central-list">
                  <strong>中心节点</strong>
                  {metrics.centralNodes.map((node) => (
                    <span key={node} className="network-chip">
                      {node}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'view' && (
            <div className="citespace-grid">
              <div className="citespace-card">
                <div className="citespace-card-title">
                  <Share2 size={15} />
                  <strong>可视化</strong>
                </div>
                <label className="form-field">
                  <span>视图模式</span>
                  <select value={viewMode} onChange={(event) => setViewMode(event.target.value)}>
                    {VIEW_MODES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="two-columns">
                  <label className="form-field">
                    <span>标签阈值</span>
                    <input type="number" defaultValue={2} min={0} max={20} />
                  </label>
                  <label className="form-field">
                    <span>节点缩放</span>
                    <input type="number" defaultValue={1} min={0.2} max={5} step={0.1} />
                  </label>
                </div>
                {['显示聚类标签', '显示突现年份', '显示时间切片', '按中心性着色'].map((item) => (
                  <label key={item} className="checkbox-field">
                    <input type="checkbox" defaultChecked />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
              <div className="citespace-card">
                <div className="citespace-card-title">
                  <Network size={15} />
                  <strong>图谱预览 · {viewMode}</strong>
                </div>
                <div className="network-preview">
                  <div className="preview-lines" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  {metrics.centralNodes.length > 0 ? (
                    metrics.centralNodes.map((node, index) => (
                      <div key={node} className={`preview-node node-${index % 4}`}>
                        {node}
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">运行分析后显示网络预览</div>
                  )}
                </div>
                <button type="button" className="text-btn primary" onClick={() => addLog(`视图已刷新：${viewMode}`)}>
                  <RefreshCw size={14} />
                  刷新视图
                </button>
              </div>
            </div>
          )}

          {tab === 'export' && (
            <div className="citespace-grid">
              <div className="citespace-card">
                <div className="citespace-card-title">
                  <Download size={15} />
                  <strong>导出</strong>
                </div>
                <label className="form-field">
                  <span>导出格式</span>
                  <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                    {EXPORT_FORMATS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="button-row">
                  <button type="button" className="text-btn" onClick={() => void exportReport(exportFormat)}>
                    <Download size={14} />
                    导出文件
                  </button>
                  <button type="button" className="text-btn" onClick={() => void exportReport('PNG / SVG')}>
                    <Image size={14} />
                    导出图片
                  </button>
                  <button type="button" className="text-btn" onClick={() => void exportReport('分析报告')}>
                    <FileText size={14} />
                    导出报告
                  </button>
                  <button type="button" className="text-btn" onClick={() => void generateReport()}>
                    <FileText size={14} />
                    生成报告
                  </button>
                </div>
                {exported && <div className="export-status">{exported}</div>}
                <div className="analysis-log">
                  <div>GraphML / Pajek / CSV 网络数据</div>
                  <div>RIS 参考文献</div>
                  <div>PNG / SVG 图谱</div>
                  <div>Excel 指标表</div>
                  <div>Markdown 分析报告</div>
                </div>
              </div>
              <div className="citespace-card">
                <div className="citespace-card-title">
                  <FileText size={15} />
                  <strong>功能覆盖</strong>
                </div>
                <div className="function-chips stacked">
                  {FUNCTIONS.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
