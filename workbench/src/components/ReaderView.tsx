import { ArrowRight, BookOpen, CheckCircle2, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { EdgeRecord, Stats } from '../types';

interface ReaderViewProps {
  edges: EdgeRecord[];
  stats: Stats;
  onEnterScience: () => void;
  onOpenDemo: () => void;
}

const FRIENDLY_RELATIONS: Record<string, string> = {
  R1: '成分掺杂',
  R2: '金属位元素替换',
  R3: '非金属位元素替换',
  R4: '载流子掺杂',
  R5: '材料家族替换',
  R6: '界面或薄膜效应',
  R7: '压力调控',
  R8: '跨材料家族类比',
  R9: '结构或制备路线关联'
};

function relationName(relation: string): string {
  return FRIENDLY_RELATIONS[relation] || relation || '材料关系';
}

function plainRelation(edge: EdgeRecord): string {
  const relation = relationName(edge.relation);
  if (/掺杂|doping/i.test(relation)) return `${edge.source} 通过成分掺杂形成或关联到 ${edge.target}`;
  if (/压力|pressure/i.test(relation)) return `${edge.source} 在压力条件下与 ${edge.target} 相关`;
  if (/替代|substitution/i.test(relation)) return `${edge.source} 通过元素替代关联到 ${edge.target}`;
  return `论文记录了 ${edge.source} 与 ${edge.target} 之间的“${relation}”关系`;
}

export function ReaderView({ edges, stats, onEnterScience, onOpenDemo }: ReaderViewProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const papers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const core = edges.filter((edge) => edge.tier === 'core' && edge.doi);
    const filtered = keyword
      ? core.filter((edge) => [edge.source, edge.target, edge.relation, edge.doi, edge.quote].join(' ').toLowerCase().includes(keyword))
      : core;
    return filtered.slice(0, 18);
  }, [edges, query]);
  const selected = papers.find((edge) => edge.id === selectedId) ?? papers[0];

  return (
    <section className="reader-view" aria-label="Track 文献阅读模式">
      <div className="reader-hero">
        <div className="reader-kicker"><Sparkles size={14} /> 不懂材料术语也能开始</div>
        <h1>从一篇文献，读懂一个材料关系</h1>
        <p>搜索材料、关系或 DOI。左边挑选文献证据，右边用普通语言说明论文记录了什么。</p>
        <label className="reader-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="试试搜索：MgB2、掺杂、10.1038…" aria-label="搜索文献" />
        </label>
        <div className="reader-quick-stats">
          <span><strong>{stats.coreMaterials}</strong> 种核心材料</span>
          <span><strong>{stats.coreEdges}</strong> 条论文证据</span>
          <span><strong>{stats.extendedEdges}</strong> 条扩展线索</span>
        </div>
      </div>

      <div className="reader-layout">
        <div className="paper-list">
          <div className="reader-section-head">
            <div><BookOpen size={17} /><strong>文献阅读清单</strong></div>
            <span>{papers.length} 条可读证据</span>
          </div>
          {papers.map((edge) => (
            <button key={edge.id} type="button" className={`paper-card${selected?.id === edge.id ? ' active' : ''}`} onClick={() => setSelectedId(edge.id)}>
              <div className="paper-card-top"><span>{edge.year || '年份未知'}</span><span className="verified"><CheckCircle2 size={12} /> DOI 证据</span></div>
              <strong>{edge.source} <ArrowRight size={13} /> {edge.target}</strong>
              <p>{plainRelation(edge)}</p>
              <code>{edge.doi}</code>
            </button>
          ))}
          {papers.length === 0 && <div className="reader-empty">没有找到匹配文献，换一个材料名或 DOI 试试。</div>}
        </div>

        <article className="reading-pane">
          {selected ? (
            <>
              <div className="reading-label">这篇证据在说什么？</div>
              <h2>{selected.source} → {selected.target}</h2>
              <p className="plain-summary">{plainRelation(selected)}。</p>
              <dl>
                <div><dt>关系</dt><dd>{relationName(selected.relation)}{FRIENDLY_RELATIONS[selected.relation] ? `（${selected.relation}）` : ''}</dd></div>
                <div><dt>年份</dt><dd>{selected.year || '未标注'}</dd></div>
                <div><dt>证据级别</dt><dd>核心文献证据</dd></div>
                <div><dt>DOI</dt><dd>{selected.doi}</dd></div>
              </dl>
              <div className="quote-card"><span>原始证据摘录</span><p>{selected.quote || '当前记录没有摘录，请通过 DOI 查看论文原文。'}</p></div>
              <div className="reader-note"><strong>请注意：</strong>这里展示的是论文证据关系，不等同于系统已经证明了新的材料结论。</div>
              <button type="button" className="reader-science-link" onClick={onEnterScience}>在 Science 模式查看知识图谱 <ArrowRight size={15} /></button>
            </>
          ) : <div className="reader-empty">从左侧选择一条文献证据。</div>}
        </article>
      </div>
      <button type="button" className="reader-demo-fab" onClick={onOpenDemo}><HelpCircleIcon /> 第一次使用？看 60 秒演示</button>
    </section>
  );
}

function HelpCircleIcon() {
  return <span aria-hidden="true">?</span>;
}
