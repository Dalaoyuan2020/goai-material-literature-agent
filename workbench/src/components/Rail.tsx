import { Atom, Boxes, GitFork, LibraryBig, Network, PanelRight, Plus, Settings, Workflow, type LucideIcon } from 'lucide-react';
import type { ViewName } from '../types';

interface RailProps {
  activeView: ViewName;
  onViewChange: (view: ViewName) => void;
  onTogglePanel: () => void;
  onNewTask: () => void;
}

const NAV_ITEMS: Array<{ id: ViewName; label: string; icon: LucideIcon }> = [
  { id: 'conversation', label: '编排', icon: Workflow },
  { id: 'skills', label: '技能', icon: Boxes },
  { id: 'library', label: '知识库', icon: LibraryBig },
  { id: 'graph', label: '知识图谱', icon: GitFork },
  { id: 'citespace', label: '图谱', icon: Network }
];

export function Rail({ activeView, onViewChange, onTogglePanel, onNewTask }: RailProps) {
  return (
    <aside className="rail" aria-label="主导航">
      <div className="brand" aria-hidden="true">
        <Atom size={18} />
      </div>
      <button type="button" className="rail-btn new-task" title="新建任务" aria-label="新建任务" onClick={onNewTask}>
        <Plus size={18} />
      </button>
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={`rail-btn${activeView === id ? ' active' : ''}`}
          title={label}
          aria-label={label}
          onClick={() => onViewChange(id)}
        >
          <Icon size={18} />
        </button>
      ))}
      <div className="rail-spacer" />
      <button type="button" className="rail-btn" title="知识库面板" aria-label="知识库面板" onClick={onTogglePanel}>
        <PanelRight size={18} />
      </button>
      <button type="button" className="rail-btn" title="设置" aria-label="设置">
        <Settings size={18} />
      </button>
    </aside>
  );
}
