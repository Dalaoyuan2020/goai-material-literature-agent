import { Search } from 'lucide-react';
import { useState } from 'react';
import type { EdgeRecord, KnowledgeData } from '../types';

interface KnowledgePanelProps {
  data: KnowledgeData;
  selectedEdge?: EdgeRecord;
  onSelect: (id: string) => void;
}

export function KnowledgePanel({ data, selectedEdge, onSelect }: KnowledgePanelProps) {
  const [query, setQuery] = useState('');
  const keyword = query.trim().toLowerCase();
  const visibleEdges = keyword
    ? data.edges.filter((edge) =>
        [edge.source, edge.target, edge.relation, edge.doi, edge.evidence]
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      )
    : data.edges;

  return (
    <aside className="knowledge-panel" aria-label="知识库面板">
      <div className="panel-head">
        <strong>知识库</strong>
        <span className="live">{data.mode === 'remote' ? '远程' : data.mode === 'loaded' ? '本地' : '基础'}</span>
      </div>
      <div className="panel-body">
        <div className="stats">
          <div className="stat">
            <div className="value">
              {data.stats.coreMaterials} <small>点</small>
            </div>
            <div className="label">材料点 · 核心</div>
          </div>
          <div className="stat">
            <div className="value">
              {data.stats.coreEdges} <small>边</small>
            </div>
            <div className="label">关系边 · 核心</div>
          </div>
          <div className="stat">
            <div className="value">
              {data.stats.extendedMaterials} <small>点</small>
            </div>
            <div className="label">材料点 · 扩展</div>
          </div>
          <div className="stat">
            <div className="value">
              {data.stats.extendedEdges} <small>边</small>
            </div>
            <div className="label">关系边 · 扩展</div>
          </div>
          <div className="stat suggestion">
            <div className="value">
              {data.stats.candidates} <small>组</small>
            </div>
            <div className="label">建议组合</div>
          </div>
        </div>
        <div className="panel-section">
          <div className="panel-section-title">
            <span>关系边</span>
            <span>建议 {data.stats.candidates}</span>
          </div>
          <label className="panel-search">
            <Search size={13} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="检索材料、关系或 DOI"
              aria-label="检索知识库"
            />
          </label>
          <div className="mini-list">
            {visibleEdges.slice(0, 12).map((edge) => (
              <button
                key={edge.id}
                type="button"
                className={`mini-item${selectedEdge?.id === edge.id ? ' active' : ''}`}
                onClick={() => onSelect(edge.id)}
              >
                <span className="mini-name">
                  {edge.source} → {edge.target}
                </span>
                <span className="mini-meta">
                  <span className={`tag ${edge.tier}`}>{edge.tier === 'core' ? '核心' : '扩展'}</span>
                  <span>{edge.year}</span>
                </span>
              </button>
            ))}
            {visibleEdges.length === 0 && <div className="empty-state">没有匹配的关系边</div>}
          </div>
        </div>
        <div className="detail">
          <div className="detail-head">
            <strong>边详情</strong>
            {selectedEdge && (
              <span className={`tag ${selectedEdge.tier}`}>
                {selectedEdge.tier === 'core' ? '核心' : '扩展'}
              </span>
            )}
          </div>
          {selectedEdge ? (
            <dl className="detail-grid">
              <div className="detail-row">
                <dt>材料 A</dt>
                <dd>{selectedEdge.source}</dd>
              </div>
              <div className="detail-row">
                <dt>材料 B</dt>
                <dd>{selectedEdge.target}</dd>
              </div>
              <div className="detail-row">
                <dt>关系类型</dt>
                <dd>{selectedEdge.relation}</dd>
              </div>
              <div className="detail-row">
                <dt>文献 DOI</dt>
                <dd>{selectedEdge.doi || '未标注'}</dd>
              </div>
              <div className="detail-row">
                <dt>年份</dt>
                <dd>{selectedEdge.year || '未标注'}</dd>
              </div>
              <div className="detail-row">
                <dt>证据强度</dt>
                <dd>{selectedEdge.evidence || '未标注'}</dd>
              </div>
              <div className="detail-row">
                <dt>证据摘录</dt>
                <dd>{selectedEdge.quote || '未标注'}</dd>
              </div>
            </dl>
          ) : (
            <div className="detail-empty">选择一条关系边查看七字段证据</div>
          )}
        </div>
        <div className="data-source">{data.message}</div>
      </div>
    </aside>
  );
}
