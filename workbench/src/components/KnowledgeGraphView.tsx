import { Focus, Minus, Plus, RotateCcw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { EdgeRecord, TierFilter } from '../types';

interface KnowledgeGraphViewProps {
  edges: EdgeRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
}

interface GraphNode {
  id: string;
  x: number;
  y: number;
  degree: number;
  core: boolean;
}

const WIDTH = 980;
const HEIGHT = 600;

function graphSubset(edges: EdgeRecord[], tier: TierFilter, query: string): EdgeRecord[] {
  const tierEdges = edges.filter((edge) => tier === 'all' || edge.tier === tier);
  const keyword = query.trim().toLowerCase();
  if (keyword) {
    return tierEdges
      .filter((edge) => [edge.source, edge.target, edge.relation, edge.doi].join(' ').toLowerCase().includes(keyword))
      .slice(0, 100);
  }
  const degree = new Map<string, number>();
  tierEdges.forEach((edge) => {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  });
  const hubs = new Set([...degree.entries()].sort((a, b) => b[1] - a[1]).slice(0, 32).map(([id]) => id));
  return tierEdges.filter((edge) => hubs.has(edge.source) || hubs.has(edge.target)).slice(0, 120);
}

function layout(edges: EdgeRecord[]): { nodes: GraphNode[]; links: EdgeRecord[] } {
  const degree = new Map<string, number>();
  const core = new Map<string, boolean>();
  edges.forEach((edge) => {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    if (edge.tier === 'core') {
      core.set(edge.source, true);
      core.set(edge.target, true);
    }
  });
  const ids = [...degree.keys()].sort((a, b) => (degree.get(b) || 0) - (degree.get(a) || 0)).slice(0, 70);
  const allowed = new Set(ids);
  const centerX = WIDTH / 2;
  const centerY = HEIGHT / 2;
  const nodes = ids.map((id, index) => {
    const rank = index / Math.max(ids.length - 1, 1);
    const ring = index < 8 ? 105 : index < 28 ? 205 : 275;
    const angle = index * 2.399963229728653 + rank * 0.7;
    return {
      id,
      x: centerX + Math.cos(angle) * ring * (index < 8 ? 0.72 : 1),
      y: centerY + Math.sin(angle) * ring * 0.78,
      degree: degree.get(id) || 1,
      core: core.get(id) || false
    };
  });
  return { nodes, links: edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target)) };
}

export function KnowledgeGraphView({ edges, selectedId, onSelect }: KnowledgeGraphViewProps) {
  const [tier, setTier] = useState<TierFilter>('all');
  const [query, setQuery] = useState('');
  const [scale, setScale] = useState(1);
  const subset = useMemo(() => graphSubset(edges, tier, query), [edges, tier, query]);
  const graph = useMemo(() => layout(subset), [subset]);
  const positions = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const selected = edges.find((edge) => edge.id === selectedId);

  return (
    <section className="graph-view" aria-label="材料知识图谱">
      <header className="graph-header">
        <div><h2>材料关系知识图谱</h2><p>每个圆点是一种材料，每条连线是一条真实关系记录。点击圆点或连线查看证据。</p></div>
        <div className="graph-controls">
          <label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="聚焦材料或 DOI" aria-label="搜索图谱" /></label>
          {(['all', 'core', 'extended'] as TierFilter[]).map((item) => <button key={item} type="button" aria-pressed={tier === item} className={tier === item ? 'active' : ''} onClick={() => setTier(item)}>{item === 'all' ? '全部' : item === 'core' ? '核心证据' : '扩展线索'}</button>)}
        </div>
      </header>
      <div className="graph-stage-wrap">
        <div className="graph-toolbar">
          <button type="button" aria-label="放大图谱" onClick={() => setScale((value) => Math.min(1.5, value + 0.1))}><Plus size={15} /></button>
          <button type="button" aria-label="缩小图谱" onClick={() => setScale((value) => Math.max(0.65, value - 0.1))}><Minus size={15} /></button>
          <button type="button" aria-label="重置图谱" onClick={() => { setScale(1); setQuery(''); setTier('all'); }}><RotateCcw size={15} /></button>
        </div>
        <div className="graph-legend"><span className="core-dot" /> 核心 DOI 证据 <span className="weak-dot" /> MatKG 扩展线索 <span className="line-sample" /> 材料关系</div>
        <svg className="knowledge-graph" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${graph.nodes.length} 个材料节点和 ${graph.links.length} 条可见关系`}>
          <g style={{ transform: `translate(${WIDTH * (1 - scale) / 2}px, ${HEIGHT * (1 - scale) / 2}px) scale(${scale})`, transformOrigin: 'center' }}>
            {graph.links.map((edge) => {
              const source = positions.get(edge.source); const target = positions.get(edge.target); if (!source || !target) return null;
              return <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className={`${edge.tier}${selectedId === edge.id ? ' selected' : ''}`} onClick={() => onSelect(edge.id)}><title>{edge.source} → {edge.target} · {edge.relation}</title></line>;
            })}
            {graph.nodes.map((node) => {
              const radius = Math.min(14, 5 + Math.sqrt(node.degree) * 1.5);
              return <g key={node.id} className="graph-node" onClick={() => { const edge = subset.find((item) => item.source === node.id || item.target === node.id); if (edge) onSelect(edge.id); }}><circle cx={node.x} cy={node.y} r={radius} className={node.core ? 'core' : 'extended'} /><text x={node.x} y={node.y + radius + 13} textAnchor="middle">{node.id.length > 18 ? `${node.id.slice(0, 16)}…` : node.id}</text><title>{node.id} · {node.degree} 条关系</title></g>;
            })}
          </g>
        </svg>
        {graph.nodes.length === 0 && <div className="graph-empty">没有匹配的材料关系。</div>}
      </div>
      <footer className="graph-inspector">
        <div><Focus size={16} /><strong>{selected ? `${selected.source} → ${selected.target}` : '点击图中的节点或连线'}</strong></div>
        {selected ? <><span>{selected.relation}</span><span className={`tag ${selected.tier}`}>{selected.tier === 'core' ? '核心证据' : '扩展线索'}</span><code>{selected.doi || '无逐条 DOI'}</code></> : <span>选择后这里会显示关系类型和 DOI。</span>}
      </footer>
    </section>
  );
}
