import { ChevronDown, PanelRight, Play, Plus } from 'lucide-react';

interface TopBarProps {
  title: string;
  meta: string;
  onTogglePanel: () => void;
  onRun: () => void;
  onNewTask: () => void;
}

const MODELS = [
  'gpt-5.2-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini'
];

export function TopBar({ title, meta, onTogglePanel, onRun, onNewTask }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <strong>{title}</strong>
        <span className="topbar-meta">{meta}</span>
      </div>
      <div className="topbar-actions">
        <label className="model-picker" title="模型">
          <span>模型</span>
          <select defaultValue={MODELS[0]} aria-label="模型">
            {MODELS.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
          <ChevronDown size={13} />
        </label>
        <button type="button" className="icon-btn" title="新建任务" aria-label="新建任务" onClick={onNewTask}>
          <Plus size={16} />
        </button>
        <button type="button" className="icon-btn" title="知识库面板" aria-label="知识库面板" onClick={onTogglePanel}>
          <PanelRight size={16} />
        </button>
        <button type="button" className="text-btn primary" onClick={onRun}>
          <Play size={14} />
          执行
        </button>
      </div>
    </header>
  );
}
