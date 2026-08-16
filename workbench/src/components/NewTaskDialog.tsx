import { FolderPlus, Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { ApiModule } from '../api';

export interface NewTaskPayload {
  title: string;
  description: string;
  module: ApiModule;
  openCitespace: boolean;
}

interface NewTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: NewTaskPayload) => void;
}

const MODULES: Array<{ label: string; value: ApiModule }> = [
  { label: '研究编排', value: 'research' },
  { label: '知识库检索', value: 'knowledge' },
  { label: '开源图谱分析', value: 'opensource' },
  { label: '报告生成', value: 'report' }
];

export function NewTaskDialog({ open, onClose, onCreate }: NewTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [module, setModule] = useState<ApiModule>('research');
  const [openCitespace, setOpenCitespace] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setModule('research');
      setOpenCitespace(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCreate({
      title: title.trim() || '未命名任务',
      description: description.trim(),
      module,
      openCitespace: openCitespace || module === 'opensource'
    });
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="dialog" role="dialog" aria-modal="true" aria-label="新建任务" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="dialog-head">
          <div>
            <h2>新建任务</h2>
            <p>创建编排任务并选择工作流入口</p>
          </div>
          <button type="button" className="icon-btn" title="关闭" aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="dialog-body">
          <label className="form-field">
            <span>任务名称</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：铁基超导文献图谱分析" autoFocus />
          </label>
          <label className="form-field">
            <span>任务描述</span>
            <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="输入分析目标、文献范围或输出要求" />
          </label>
          <label className="form-field">
            <span>工作流模块</span>
            <select value={module} onChange={(event) => setModule(event.target.value as ApiModule)}>
              {MODULES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={openCitespace} onChange={(event) => setOpenCitespace(event.target.checked)} />
            <span>创建后直接打开开源图谱分析工作台</span>
          </label>
        </div>
        <div className="dialog-foot">
          <button type="button" className="text-btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="text-btn primary">
            <Plus size={14} />
            创建任务
          </button>
        </div>
        <button type="button" className="dialog-data-hint" onClick={() => setModule('opensource')}>
          导入文献数据集
        </button>
      </form>
    </div>
  );
}
