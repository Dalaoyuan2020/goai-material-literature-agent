import { MessageSquare, Plus } from 'lucide-react';
import type { CSSProperties } from 'react';

export interface TaskItem {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  status: string;
  module?: string;
  jobId?: string;
}

interface TaskListProps {
  tasks: TaskItem[];
  activeTaskId: string;
  onSelectTask: (id: string) => void;
  onNewTask: () => void;
  style?: CSSProperties;
}

export function TaskList({ tasks, activeTaskId, onSelectTask, onNewTask, style }: TaskListProps) {
  return (
    <aside className="task-sidebar" aria-label="任务列表" style={style}>
      <div className="task-sidebar-head">
        <strong>任务</strong>
        <button type="button" className="icon-btn" title="新建任务" aria-label="新建任务" onClick={onNewTask}>
          <Plus size={15} />
        </button>
      </div>
      <div className="task-list">
        {tasks.length === 0 && <div className="empty-thread">创建任务后开始编排</div>}
        {tasks.map((task) => (
          <button
            key={task.id}
            type="button"
            className={`task-item${activeTaskId === task.id ? ' active' : ''}`}
            onClick={() => onSelectTask(task.id)}
          >
            <MessageSquare size={13} className="task-icon" />
            <span className="task-copy">
              <span className="task-title">{task.title}</span>
              <span className="task-meta">
                {task.subtitle} · {task.meta}
              </span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
