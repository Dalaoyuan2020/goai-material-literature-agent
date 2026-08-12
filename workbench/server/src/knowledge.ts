import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';

export type Tier = 'core' | 'extended';

export interface EdgeRecord {
  id: string;
  source: string;
  target: string;
  relation: string;
  doi: string;
  year: string;
  evidence: string;
  quote: string;
  tier: Tier;
}

export interface Stats {
  coreMaterials: number;
  coreEdges: number;
  extendedMaterials: number;
  extendedEdges: number;
  candidates: number;
}

export interface Candidate {
  source_transform?: string;
  target_base?: string;
  status?: string;
  relation_type?: string;
  source_cosine?: number;
}

export interface KnowledgeData {
  edges: EdgeRecord[];
  stats: Stats;
  candidates: Candidate[];
  report: Record<string, unknown>;
}

function readText(file: string): string {
  const buffer = fs.readFileSync(file);
  const utf8 = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (/[\u4e00-\u9fff]|source|target|material|doi|year/i.test(utf8)) {
    return utf8;
  }
  try {
    return new TextDecoder('gb18030').decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    return utf8;
  }
}

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function normalizeEdge(raw: Record<string, unknown>, tier: Tier, index: number): EdgeRecord | null {
  const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key.trim(), value]));
  const source = pick(row, ['材料A', '实体A', '材料1', 'source', 'from', '起点', 'material_a', 'materialA', 'src']);
  const target = pick(row, ['材料B', '实体B', '材料2', 'target', 'to', '终点', 'material_b', 'materialB', 'dst']);
  if (!source && !target) return null;
  return {
    id: `${tier}-${index + 1}`,
    source: source || '未命名实体 A',
    target: target || '未命名实体 B',
    relation: pick(row, ['关系类型', '扩展关系类型', '关系', 'relation', 'relation_type', 'edge_type', 'type']) || '未分类',
    doi: pick(row, ['文献DOI', 'DOI', 'doi', 'reference_doi', 'reference']),
    year: pick(row, ['年份', '发表年份', 'year', 'publication_year', 'Year']),
    evidence: pick(row, ['证据强度', '证据等级', 'evidence_strength', 'evidence_level', 'evidence']),
    quote: pick(row, ['证据说明', '证据摘要', '说明', '摘要', 'evidence_note', 'evidence_text', 'quote', 'summary']),
    tier
  };
}

function readEdges(file: string, tier: Tier): EdgeRecord[] {
  if (!fs.existsSync(file)) return [];
  const parsed = Papa.parse<Record<string, string>>(readText(file), { header: true, skipEmptyLines: true });
  return parsed.data
    .map((row, index) => normalizeEdge(row, tier, index))
    .filter((edge): edge is EdgeRecord => edge !== null);
}

function uniqueMaterials(edges: EdgeRecord[]): number {
  return new Set(edges.flatMap((edge) => [edge.source, edge.target])).size;
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadKnowledgeData(projectRoot: string): KnowledgeData {
  const core = readEdges(path.join(projectRoot, 'knowledge', 'edges.csv'), 'core');
  const extended = readEdges(path.join(projectRoot, 'knowledge', 'edges_matkg.csv'), 'extended');
  const reportPath = path.join(projectRoot, 'outputs', 'pipeline_report.json');
  if (core.length === 0 || !fs.existsSync(reportPath)) {
    throw new Error(`真实知识库数据不完整：${projectRoot}`);
  }
  const report = JSON.parse(readText(reportPath)) as Record<string, unknown>;
  const structure = (report.L2_structure ?? {}) as Record<string, unknown>;
  const application = (report.L4_application ?? {}) as Record<string, unknown>;
  const candidates = Array.isArray(application.candidates) ? application.candidates as Candidate[] : [];
  return {
    edges: [...core, ...extended],
    stats: {
      coreMaterials: numberValue(structure.core_materials_count, uniqueMaterials(core)),
      coreEdges: numberValue(structure.core_edges_count, core.length),
      extendedMaterials: numberValue(structure.extended_nodes_count, uniqueMaterials(extended)),
      extendedEdges: numberValue(structure.extended_edges_count, extended.length),
      candidates: numberValue(application.candidates_generated, candidates.length)
    },
    candidates,
    report
  };
}

export function suggestionFor(data: KnowledgeData, text: string): { name: string; meta: string } | undefined {
  const lowered = text.toLowerCase();
  const candidate = data.candidates.find((item) =>
    [item.source_transform, item.target_base, item.relation_type]
      .filter(Boolean)
      .some((value) => lowered.includes(String(value).toLowerCase()))
  ) ?? data.candidates[0];
  if (!candidate) return undefined;
  const name = [candidate.source_transform, candidate.target_base ? `迁移到 ${candidate.target_base}` : '']
    .filter(Boolean)
    .join(' · ');
  return {
    name,
    meta: `${candidate.status || '候选假设(未验证)'} · ${candidate.relation_type || '关系待核验'} · 核心证据余弦 ${candidate.source_cosine ?? '—'}`
  };
}
