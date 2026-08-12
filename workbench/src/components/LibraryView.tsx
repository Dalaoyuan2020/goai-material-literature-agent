import type { EdgeRecord, TierFilter } from '../types';

interface LibraryViewProps {
  edges: EdgeRecord[];
  filter: TierFilter;
  selectedId: string;
  onFilterChange: (filter: TierFilter) => void;
  onSelect: (id: string) => void;
}

const FILTERS: Array<{ id: TierFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'core', label: '核心' },
  { id: 'extended', label: '扩展' }
];

export function LibraryView({ edges, filter, selectedId, onFilterChange, onSelect }: LibraryViewProps) {
  const visibleEdges = edges.filter((edge) => filter === 'all' || edge.tier === filter);

  return (
    <section className="view active">
      <div className="library-view">
        <div className="library-head">
          <div>
            <h2 className="section-title">知识库浏览</h2>
            <p className="topbar-meta">材料点与关系边，点击行查看完整证据字段</p>
          </div>
          <div className="filters">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`text-btn filter-btn${filter === item.id ? ' active' : ''}`}
                onClick={() => onFilterChange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="edge-list">
          {visibleEdges.length === 0 ? (
            <div className="empty-state">当前筛选下没有关系边</div>
          ) : (
            visibleEdges.map((edge) => (
              <button
                key={edge.id}
                type="button"
                className={`edge-row${selectedId === edge.id ? ' active' : ''}`}
                onClick={() => onSelect(edge.id)}
              >
                <span>
                  <span className="edge-name">
                    <span>{edge.source}</span>
                    <span className="arrow">→</span>
                    <span>{edge.target}</span>
                    <span className={`tag ${edge.tier}`}>{edge.tier === 'core' ? '核心' : '扩展'}</span>
                  </span>
                  <span className="relation">{edge.relation}</span>
                </span>
                <span className="year">{edge.year}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
