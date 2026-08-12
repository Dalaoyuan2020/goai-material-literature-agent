import { BookOpen, ChevronDown, FlaskConical, HelpCircle, PanelRight, Play, Plus } from 'lucide-react';
import type { ExperienceMode } from '../types';

interface TopBarProps {
  title: string;
  meta: string;
  onTogglePanel: () => void;
  onRun: () => void;
  onNewTask: () => void;
  mode: ExperienceMode;
  onModeChange: (mode: ExperienceMode) => void;
  onOpenDemo: () => void;
}

const MODELS = [
  'gpt-5.2-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini'
];

export function TopBar({ title, meta, onTogglePanel, onRun, onNewTask, mode, onModeChange, onOpenDemo }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <strong>{title}</strong>
        <span className="topbar-meta">{meta}</span>
      </div>
      <div className="mode-switch" role="group" aria-label="工作模式">
        <button type="button" aria-pressed={mode === 'track'} className={mode === 'track' ? 'active' : ''} onClick={() => onModeChange('track')}>
          <BookOpen size={14} />
          <span>Track</span>
          <small>轻松阅读</small>
        </button>
        <button type="button" aria-pressed={mode === 'science'} className={mode === 'science' ? 'active' : ''} onClick={() => onModeChange('science')}>
          <FlaskConical size={14} />
          <span>Science</span>
          <small>专业研究</small>
        </button>
      </div>
      <div className="topbar-actions">
        <button type="button" className="text-btn demo-trigger" onClick={onOpenDemo}>
          <HelpCircle size={14} />
          使用演示
        </button>
        {mode === 'science' && (
          <>
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
          </>
        )}
      </div>
    </header>
  );
}
