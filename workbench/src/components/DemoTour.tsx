import { ArrowLeft, ArrowRight, BookOpen, GitFork, PlayCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface DemoTourProps {
  open: boolean;
  onClose: () => void;
  onGoTrack: () => void;
  onGoGraph: () => void;
  onGoSkills: () => void;
}

const STEPS = [
  { icon: BookOpen, title: '先用 Track 读懂一条文献', text: '搜索材料或 DOI，点击左侧文献卡片。右侧会用普通语言解释材料关系，并保留原文摘录。', action: '打开 Track 阅读模式', target: 'track' },
  { icon: GitFork, title: '再用图谱看材料之间的联系', text: '切换到 Science，打开“知识图谱”。圆点是材料，线是关系；绿色代表核心 DOI 证据，蓝色代表扩展线索。', action: '打开真实知识图谱', target: 'graph' },
  { icon: PlayCircle, title: '最后运行一次真实工作流', text: '打开“技能”，运行“知识库概览”。系统会经过 Node API 调用 Python，并返回 140 个节点、291 条边和 326 组证据。', action: '打开技能页', target: 'skills' }
] as const;

export function DemoTour({ open, onClose, onGoTrack, onGoGraph, onGoSkills }: DemoTourProps) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);
  if (!open) return null;
  const current = STEPS[step];
  const Icon = current.icon;
  const runAction = () => { if (current.target === 'track') onGoTrack(); else if (current.target === 'graph') onGoGraph(); else onGoSkills(); onClose(); };
  return <div className="demo-overlay" role="dialog" aria-modal="true" aria-label="60 秒使用演示"><div className="demo-tour"><button type="button" className="demo-close" aria-label="关闭演示" onClick={onClose}><X size={18} /></button><div className="demo-progress">{STEPS.map((_, index) => <span key={index} className={index <= step ? 'active' : ''} />)}</div><div className="demo-step-icon"><Icon size={26} /></div><div className="demo-eyebrow">第 {step + 1} 步，共 {STEPS.length} 步</div><h2>{current.title}</h2><p>{current.text}</p><button type="button" className="demo-action" onClick={runAction}>{current.action} <ArrowRight size={15} /></button><div className="demo-nav"><button type="button" disabled={step === 0} onClick={() => setStep((value) => value - 1)}><ArrowLeft size={14} /> 上一步</button>{step < STEPS.length - 1 ? <button type="button" onClick={() => setStep((value) => value + 1)}>下一步 <ArrowRight size={14} /></button> : <button type="button" onClick={onClose}>完成</button>}</div></div></div>;
}
