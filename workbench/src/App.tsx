import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, type ApiMessage, type ApiModule, type ApiTask } from './api';
import { CitespaceView } from './components/CitespaceView';
import { ConversationView } from './components/ConversationView';
import { DemoTour } from './components/DemoTour';
import { KnowledgeGraphView } from './components/KnowledgeGraphView';
import { KnowledgePanel } from './components/KnowledgePanel';
import { LibraryView } from './components/LibraryView';
import { NewTaskDialog, type NewTaskPayload } from './components/NewTaskDialog';
import { Rail } from './components/Rail';
import { ReaderView } from './components/ReaderView';
import { SkillsView } from './components/SkillsView';
import type { TaskItem } from './components/TaskList';
import { TopBar } from './components/TopBar';
import { DEMO_KNOWLEDGE_DATA } from './demo';
import { usePanelResize } from './hooks/usePanelResize';
import type { ChatMessage, ExperienceMode, KnowledgeData, TierFilter, ViewName } from './types';

const VIEW_TITLES: Record<ViewName, string> = {
  conversation: '编排',
  skills: '技能',
  library: '知识库',
  graph: '知识图谱',
  citespace: '图谱'
};

const MODULE_LABELS: Record<ApiModule, string> = {
  research: '研究编排',
  knowledge: '知识库检索',
  opensource: '开源图谱分析',
  report: '报告生成'
};

const STATUS_LABELS: Record<string, string> = {
  created: '已创建',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  queued: '排队中'
};

const SKILL_MODULES: Record<string, ApiModule> = {
  'material-search': 'knowledge',
  'compile-pipeline': 'research',
  'search-122': 'research',
  'search-1111': 'research',
  'search-11': 'research',
  'search-mgb2': 'research',
  'run-all-searches': 'research'
};

const SKILL_TITLES: Record<string, string> = {
  'material-search': '知识库概览',
  'compile-pipeline': '编译知识管线',
  'search-122': '搜索 122 家族',
  'search-1111': '搜索 1111 家族',
  'search-11': '搜索 11 家族',
  'search-mgb2': '搜索 MgB2 家族',
  'run-all-searches': '运行全部家族搜索'
};

function toChatMessage(message: ApiMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.content,
    steps: message.steps,
    suggestion: message.suggestion
  };
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toTaskItem(task: ApiTask): TaskItem {
  return {
    id: task.id,
    title: task.title,
    subtitle: task.description || MODULE_LABELS[task.module] || task.module,
    meta: formatWhen(task.updatedAt || task.createdAt),
    status: STATUS_LABELS[task.status] || task.status,
    module: task.module,
    jobId: task.workflow?.jobId
  };
}

export default function App() {
  const [knowledgeData, setKnowledgeData] = useState<KnowledgeData>(DEMO_KNOWLEDGE_DATA);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>('track');
  const [activeView, setActiveView] = useState<ViewName>('conversation');
  const [demoOpen, setDemoOpen] = useState(false);
  const [filter, setFilter] = useState<TierFilter>('all');
  const [selectedId, setSelectedId] = useState(DEMO_KNOWLEDGE_DATA.edges[0]?.id ?? '');
  const [panelOpen, setPanelOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastText, setToastText] = useState('任务已创建，工作流已入队');
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [activeTaskId, setActiveTaskId] = useState('');
  const [taskMessages, setTaskMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [workflowProgress, setWorkflowProgress] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const knowledgeResize = usePanelResize({ defaultWidth: 344, min: 260, max: 520, fromRight: true });

  const showToast = useCallback((message = '任务已创建，工作流已入队') => {
    setToastText(message);
    setToastVisible(true);
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToastVisible(false), 1800);
  }, []);

  const switchView = useCallback((view: ViewName) => {
    setActiveView(view);
    setPanelOpen(false);
  }, []);

  const switchExperienceMode = useCallback((mode: ExperienceMode) => {
    setExperienceMode(mode);
    setPanelOpen(false);
    if (mode === 'science') {
      setActiveView('graph');
    }
  }, []);

  const togglePanel = useCallback(() => {
    setPanelOpen((open) => !open);
  }, []);

  const upsertTask = useCallback((item: TaskItem) => {
    setTasks((current) => {
      const index = current.findIndex((task) => task.id === item.id);
      if (index === -1) {
        return [item, ...current];
      }
      const next = [...current];
      next[index] = { ...next[index], ...item };
      return next;
    });
  }, []);

  const refreshActiveTask = useCallback(async () => {
    if (!activeTaskId) {
      setTaskMessages([]);
      setRunning(false);
      setWorkflowProgress(0);
      return;
    }
    try {
      const task = await api.getTask(activeTaskId);
      const item = toTaskItem(task);
      upsertTask(item);
      setTaskMessages(task.messages.map(toChatMessage));
      setRunning(task.status === 'running');
      setWorkflowProgress(task.workflow?.progress ?? (task.status === 'completed' ? 100 : 0));
    } catch {
      // The SSE channel or offline fallback will keep the local UI usable.
    }
  }, [activeTaskId, upsertTask]);

  useEffect(() => {
    let active = true;

    async function boot() {
      try {
        const [stats, search, list] = await Promise.all([
          api.getStats(),
          api.searchKnowledge({ limit: 1000 }),
          api.listTasks({ limit: 200 })
        ]);
        if (!active) {
          return;
        }
        setKnowledgeData({
          edges: search.items,
          stats,
          mode: 'remote',
          files: { core: null, extended: null, report: null },
          message: '后端知识库已连接'
        });
        setSelectedId(search.items[0]?.id ?? '');
        setApiReady(true);
        const items = list.items.map(toTaskItem);
        setTasks(items);
        if (items[0]) {
          setActiveTaskId(items[0].id);
        }
      } catch {
        if (!active) {
          return;
        }
        setApiReady(false);
        try {
          const data = window.knowledge ? await window.knowledge.load() : DEMO_KNOWLEDGE_DATA;
          if (active) {
            setKnowledgeData(data);
            setSelectedId(data.edges[0]?.id ?? '');
          }
        } catch {
          if (active) {
            setKnowledgeData(DEMO_KNOWLEDGE_DATA);
          }
        }
      } finally {
        if (active) {
          requestAnimationFrame(() => {
            document.body.dataset.ready = 'true';
          });
        }
      }
    }

    void boot();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void refreshActiveTask();
  }, [refreshActiveTask]);

  useEffect(() => {
    if (!activeTaskId) {
      return;
    }
    let cancelled = false;
    let cleanup: () => void = () => undefined;

    void api
      .subscribeTaskEvents(activeTaskId, (event) => {
        if (event.type === 'message.created') {
          const message = (event.payload as { message?: ApiMessage }).message;
          if (message) {
            const converted = toChatMessage(message);
            setTaskMessages((current) => (current.some((item) => item.id === converted.id) ? current : [...current, converted]));
          }
        }
        if (event.type === 'workflow.started') {
          setRunning(true);
          setWorkflowProgress(0);
        }
        if (event.type === 'workflow.step') {
          const progress = (event.payload as { progress?: number }).progress ?? 0;
          setWorkflowProgress(progress);
        }
        if (event.type === 'workflow.completed') {
          setRunning(false);
          setWorkflowProgress(100);
          void refreshActiveTask();
        }
        if (event.type === 'report.completed') {
          void refreshActiveTask();
        }
      })
      .then((unsubscribe) => {
        if (cancelled) {
          unsubscribe();
        } else {
          cleanup = unsubscribe;
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [activeTaskId, refreshActiveTask]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  const createTask = useCallback(
    async (payload: NewTaskPayload): Promise<TaskItem> => {
      try {
        const task = await api.createTask({
          title: payload.title,
          description: payload.description,
          module: payload.module,
          openCitespace: payload.openCitespace
        });
        const item = toTaskItem(task);
        upsertTask(item);
        return item;
      } catch {
        const item: TaskItem = {
          id: `task_${Date.now()}`,
          title: payload.title,
          subtitle: payload.description || MODULE_LABELS[payload.module],
          meta: '本地',
          status: '已创建',
          module: payload.module
        };
        upsertTask(item);
        return item;
      }
    },
    [upsertTask]
  );

  const openNewTask = useCallback(() => {
    setTaskDialogOpen(true);
  }, []);

  const handleCreateTask = useCallback(
    (payload: NewTaskPayload) => {
      void (async () => {
        const item = await createTask(payload);
        setActiveTaskId(item.id);
        setTaskDialogOpen(false);
        switchView(payload.openCitespace ? 'citespace' : 'conversation');
        showToast(apiReady ? '任务已创建，工作流已入队' : '后端未连接，已创建本地任务');
      })();
    },
    [apiReady, createTask, showToast, switchView]
  );

  const ensureTask = useCallback(
    async (title: string, module: ApiModule, openCitespace: boolean): Promise<string> => {
      if (activeTaskId && tasks.some((task) => task.id === activeTaskId)) {
        return activeTaskId;
      }
      const item = await createTask({ title, description: '', module, openCitespace });
      setActiveTaskId(item.id);
      return item.id;
    },
    [activeTaskId, createTask, tasks]
  );

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!activeTaskId) {
        showToast('请先创建任务');
        return;
      }
      const tempId = `local-${Date.now()}`;
      setTaskMessages((current) => [...current, { id: tempId, role: 'user', text }]);
      setRunning(true);
      try {
        const created = await api.sendMessage(activeTaskId, { content: text });
        const converted = toChatMessage(created);
        setTaskMessages((current) => {
          const withoutTemp = current.filter((message) => message.id !== tempId);
          return withoutTemp.some((message) => message.id === converted.id) ? withoutTemp : [...withoutTemp, converted];
        });
      } catch {
        setRunning(false);
        setTaskMessages((current) => [
          ...current,
          { id: `error-${Date.now()}`, role: 'assistant', text: '后端未连接，消息已保存在本地。' }
        ]);
      }
    },
    [activeTaskId, showToast]
  );

  const runWorkflow = useCallback(async (taskId: string, skillId: string, input: Record<string, unknown>) => {
    setRunning(true);
    setWorkflowProgress(0);
    const accepted = await api.runWorkflow({ taskId, skillId, input });
    upsertTask({ id: taskId, title: '', subtitle: '', meta: '', status: '运行中', jobId: accepted.jobId });
    return accepted;
  }, [upsertTask]);

  const handleTopRun = useCallback(() => {
    void (async () => {
      try {
        const taskId = await ensureTask('研究编排任务', 'research', false);
        const current = tasks.find((task) => task.id === taskId);
        const skillId = current?.module === 'opensource' ? 'citespace-run' : 'compile-pipeline';
        await runWorkflow(taskId, skillId, {});
        showToast('真实 Python 工作流已入队');
      } catch {
        showToast('工作流启动失败');
      }
    })();
  }, [apiReady, ensureTask, runWorkflow, showToast, tasks]);

  const handleRunSkill = useCallback(
    async (skillId: string) => {
      const module = SKILL_MODULES[skillId] || 'research';
      const taskId = await ensureTask(SKILL_TITLES[skillId] || skillId, module, module === 'opensource');
      await runWorkflow(taskId, skillId, {});
      showToast(`${SKILL_TITLES[skillId] || skillId} 已启动`);
      if (module === 'opensource') {
        switchView('citespace');
      }
    },
    [ensureTask, runWorkflow, showToast, switchView]
  );

  const handleSelectTask = useCallback((id: string) => {
    setActiveTaskId(id);
  }, []);

  const selectedEdge = knowledgeData.edges.find((edge) => edge.id === selectedId) ?? knowledgeData.edges[0];
  const metaText = apiReady ? '桌面端 · 后端已连接' : '桌面端 · 本地模式';
  const appStyle = { '--knowledge-width': `${knowledgeResize.width}px` } as CSSProperties;
  const title = experienceMode === 'track' ? '文献阅读' : VIEW_TITLES[activeView];

  return (
    <div className={`app ${experienceMode}-mode${panelOpen ? ' panel-open' : ''}`} style={appStyle}>
      {experienceMode === 'science' && <Rail activeView={activeView} onViewChange={switchView} onTogglePanel={togglePanel} onNewTask={openNewTask} />}
      <main className="main">
        <TopBar title={title} meta={metaText} onTogglePanel={togglePanel} onRun={handleTopRun} onNewTask={openNewTask} mode={experienceMode} onModeChange={switchExperienceMode} onOpenDemo={() => setDemoOpen(true)} />
        {experienceMode === 'track' && <ReaderView edges={knowledgeData.edges} stats={knowledgeData.stats} onEnterScience={() => switchExperienceMode('science')} onOpenDemo={() => setDemoOpen(true)} />}
        {experienceMode === 'science' && activeView === 'conversation' && (
          <ConversationView
            tasks={tasks}
            activeTaskId={activeTaskId}
            messages={taskMessages}
            running={running}
            progress={workflowProgress}
            onSelectTask={handleSelectTask}
            onNewTask={openNewTask}
            onSendMessage={handleSendMessage}
          />
        )}
        {experienceMode === 'science' && activeView === 'skills' && <SkillsView onRunSkill={handleRunSkill} />}
        {experienceMode === 'science' && activeView === 'library' && (
          <LibraryView
            edges={knowledgeData.edges}
            filter={filter}
            selectedId={selectedId}
            onFilterChange={setFilter}
            onSelect={setSelectedId}
          />
        )}
        {experienceMode === 'science' && activeView === 'graph' && <KnowledgeGraphView edges={knowledgeData.edges} selectedId={selectedId} onSelect={setSelectedId} />}
        {experienceMode === 'science' && activeView === 'citespace' && (
          <CitespaceView
            activeTaskId={activeTaskId}
            onEnsureTask={() => ensureTask('开源图谱分析', 'opensource', true)}
            onRunWorkflow={(taskId, input) => runWorkflow(taskId, 'citespace-run', input)}
          />
        )}
      </main>
      {experienceMode === 'science' && <div className="resize-handle right-resize" onMouseDown={knowledgeResize.startResize} title="拖动调整知识库宽度" />}
      {experienceMode === 'science' && <KnowledgePanel data={knowledgeData} selectedEdge={selectedEdge} onSelect={setSelectedId} />}
      <NewTaskDialog open={taskDialogOpen} onClose={() => setTaskDialogOpen(false)} onCreate={handleCreateTask} />
      {panelOpen && <div className="panel-backdrop" onClick={() => setPanelOpen(false)} />}
      <div className={`toast${toastVisible ? ' show' : ''}`}>{toastText}</div>
      <DemoTour open={demoOpen} onClose={() => setDemoOpen(false)} onGoTrack={() => setExperienceMode('track')} onGoGraph={() => { setExperienceMode('science'); setActiveView('graph'); }} onGoSkills={() => { setExperienceMode('science'); setActiveView('skills'); }} />
    </div>
  );
}
