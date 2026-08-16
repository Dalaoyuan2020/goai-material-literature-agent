import { Atom, Paperclip, Send, UserRound } from 'lucide-react';
import { useState } from 'react';
import { usePanelResize } from '../hooks/usePanelResize';
import type { ChatMessage } from '../types';
import { TaskList, type TaskItem } from './TaskList';

interface ConversationViewProps {
  tasks: TaskItem[];
  activeTaskId: string;
  messages: ChatMessage[];
  running: boolean;
  progress: number;
  onSelectTask: (id: string) => void;
  onNewTask: () => void;
  onSendMessage: (text: string) => Promise<void>;
}

export function ConversationView({ tasks, activeTaskId, messages, running, progress, onSelectTask, onNewTask, onSendMessage }: ConversationViewProps) {
  const [draft, setDraft] = useState('');
  const taskResize = usePanelResize({ defaultWidth: 220, min: 160, max: 420 });

  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? tasks[0];

  const submit = async () => {
    const text = draft.trim();
    if (!text || running) {
      return;
    }
    setDraft('');
    await onSendMessage(text);
  };

  return (
    <section className="view active">
      <div className="conversation-shell">
        <TaskList tasks={tasks} activeTaskId={activeTaskId} onSelectTask={onSelectTask} onNewTask={onNewTask} style={{ width: taskResize.width }} />
        <div className="resize-handle task-resize" onMouseDown={taskResize.startResize} title="拖动调整任务栏宽度" />
        <div className="conversation">
          <div className="thread-head">
            <div className="thread-head-copy">
              <h1>{activeTask?.title || '研究编排'}</h1>
              <p>{activeTask ? `${activeTask.subtitle} · 材料知识库 · 关系检索` : '创建任务后开始编排'}</p>
            </div>
            <span className={`thread-status${running ? ' running' : ''}`}>
              {running ? `运行中 · ${progress}%` : activeTask?.status || '就绪'}
            </span>
          </div>
          <div className="messages">
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.role}`}>
                <div className="avatar">
                  {message.role === 'user' ? <UserRound size={14} /> : <Atom size={14} />}
                </div>
                <div className="bubble">
                  <p>{message.text}</p>
                  {message.steps && (
                    <ul className="step-list">
                      {message.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  )}
                  {message.suggestion && (
                    <div className="suggestion">
                      <span className="name">{message.suggestion.name}</span>
                      <span className="meta">{message.suggestion.meta}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {running && (
              <div className="message assistant">
                <div className="avatar">
                  <Atom size={14} />
                </div>
                <div className="bubble running-bubble">
                  <span className="running-dots" aria-label="正在执行" />
                  <span>正在检索知识库并生成建议...</span>
                </div>
              </div>
            )}
            {messages.length === 0 && !running && (
              <div className="empty-thread">创建任务后开始编排</div>
            )}
          </div>
          <div className="composer-wrap">
            <div className="composer">
              <textarea
                rows={1}
                placeholder="输入研究任务"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
              />
              <div className="composer-actions">
                <button type="button" className="icon-btn" title="附加文件" aria-label="附加文件">
                  <Paperclip size={15} />
                </button>
                <button type="button" className="text-btn run" onClick={() => void submit()} disabled={running}>
                  <Send size={14} />
                  {running ? '执行中' : '发送'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
