import { Atom, Layers, Network, Play, Search, Workflow, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Skill {
  id: string;
  title: string;
  description: string;
  tag: string;
  className: string;
  route: string;
  input: string;
  output: string;
  icon: LucideIcon;
}

interface SkillsViewProps {
  onRunSkill: (skillId: string) => Promise<void>;
}

const SKILLS: Skill[] = [
  {
    id: 'material-search',
    title: '知识库概览',
    description: '读取核心 DOI 证据、MatKG 弱证据和当前类比迁移候选。',
    tag: '可编排',
    className: 'core',
    route: 'read_knowledge_summary',
    input: 'knowledge/*.csv + pipeline_report.json',
    output: '真实点边统计 + 未验证候选',
    icon: Search
  },
  {
    id: 'compile-pipeline',
    title: '编译知识管线',
    description: '运行 L2 结构、L3 平行性规则和 L4 类比迁移，重建真实报告。',
    tag: '可编排',
    className: 'core',
    route: 'compile_knowledge_pipeline',
    input: '核心边 + MatKG 扩展边',
    output: 'pipeline_report.json',
    icon: Workflow
  },
  {
    id: 'search-122',
    title: '搜索 122 家族',
    description: '运行 122 家族的可解释余弦评分与 LLM 引导扩张/剪枝。',
    tag: '可编排',
    className: 'core',
    route: 'search_122_family',
    input: '122 核心证据 + 弱向量背景',
    output: 'search_runs/122.json + LLM 审计',
    icon: Atom
  },
  {
    id: 'search-1111',
    title: '搜索 1111 家族',
    description: '运行旗舰 1111 家族逐轮候选扩张并保留完整审计链。',
    tag: '可编排',
    className: 'core',
    route: 'search_1111_family',
    input: '1111 核心证据 + 弱向量背景',
    output: 'search_runs/1111.json + LLM 审计',
    icon: Network
  },
  {
    id: 'search-11',
    title: '搜索 11 家族',
    description: '运行 11 家族逐轮候选扩张，候选始终标为未验证假设。',
    tag: '可编排',
    className: 'core',
    route: 'search_11_family',
    input: '11 核心证据 + 弱向量背景',
    output: 'search_runs/11.json + LLM 审计',
    icon: Layers
  },
  {
    id: 'search-mgb2',
    title: '搜索 MgB2 家族',
    description: '运行 MgB2/diboride 家族搜索并输出可追溯候选。',
    tag: '可编排',
    className: 'core',
    route: 'search_mgb2_family',
    input: 'diboride 核心证据 + 弱向量背景',
    output: 'search_runs/MgB2.json + LLM 审计',
    icon: Atom
  },
  {
    id: 'run-all-searches',
    title: '运行全部家族搜索',
    description: '依次运行 122、1111、11 和 MgB2 四个真实搜索工作流。',
    tag: '可编排',
    className: 'core',
    route: 'run_all_family_searches',
    input: '四家族搜索配置',
    output: '4 份搜索报告 + LLM 审计',
    icon: Workflow
  }
];

export function SkillsView({ onRunSkill }: SkillsViewProps) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const runSkill = async (skill: Skill) => {
    if (runningId) {
      return;
    }
    setRunningId(skill.id);
    try {
      await onRunSkill(skill.id);
    } finally {
      timerRef.current = setTimeout(() => setRunningId(null), 900);
    }
  };

  return (
    <section className="view active">
      <div className="skills-view">
        <h2 className="section-title">技能编排</h2>
        <div className="skills-grid">
          {SKILLS.map((skill) => {
            const Icon = skill.icon;
            const isRunning = runningId === skill.id;
            return (
              <article key={skill.id} className={`skill-item${isRunning ? ' running' : ''}`}>
                <div className="skill-title">
                  <span className="skill-icon">
                    <Icon size={15} />
                  </span>
                  <h3>{skill.title}</h3>
                </div>
                <p>{skill.description}</p>
                <dl className="skill-contract">
                  <div>
                    <dt>路由</dt>
                    <dd>{skill.route}</dd>
                  </div>
                  <div>
                    <dt>输入</dt>
                    <dd>{skill.input}</dd>
                  </div>
                  <div>
                    <dt>输出</dt>
                    <dd>{skill.output}</dd>
                  </div>
                </dl>
                <div className="skill-foot">
                  <span className={`tag ${skill.className}`}>{isRunning ? '运行中' : skill.tag}</span>
                  <button type="button" className="text-btn skill-run" onClick={() => void runSkill(skill)} disabled={Boolean(runningId)}>
                    <Play size={13} />
                    运行
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
