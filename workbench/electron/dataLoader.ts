import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { app } from 'electron';
import type { EdgeRecord, KnowledgeData, KnowledgeFiles, Stats, Tier } from './types';

const DEMO_STATS: Stats = {
  coreMaterials: 91,
  coreEdges: 79,
  extendedMaterials: 46,
  extendedEdges: 210,
  candidates: 6
};

const DEMO_EDGES: EdgeRecord[] = [
  {
    id: 'demo-core-1',
    source: 'LaFeAsO',
    target: 'LaFeAsO1-xFx',
    relation: 'R4 · 氧位F掺杂',
    doi: '10.1103/PhysRevB.78.020512',
    year: '2008',
    evidence: 'direct',
    quote: 'The F doped LaFeAsO, a recently discovered superconductor with the high Tc of 26 K',
    tier: 'core'
  },
  {
    id: 'demo-core-2',
    source: 'SrFe2As2',
    target: 'SrFe1.8Co0.2As2',
    relation: 'R4 · Fe位Co掺杂',
    doi: '10.1103/PhysRevB.79.014508',
    year: '2008',
    evidence: 'direct',
    quote: 'Co substitution in SrFe2As2 suppresses the spin-density-wave transition and induces superconductivity.',
    tier: 'core'
  },
  {
    id: 'demo-core-3',
    source: 'BaFe2As2',
    target: 'BaFe1.85Co0.15As2',
    relation: 'R4 · Fe位Co掺杂',
    doi: '10.1103/PhysRevB.79.140506',
    year: '2009',
    evidence: 'direct',
    quote: 'Bulk superconductivity appears in BaFe1.85Co0.15As2 with Tc near 22 K.',
    tier: 'core'
  },
  {
    id: 'demo-extended-1',
    source: 'LaFeAsO',
    target: 'LaFeAsO0.85F0.15',
    relation: 'R4 · 氧位F掺杂',
    doi: '10.1103/PhysRevLett.101.087001',
    year: '2008',
    evidence: 'direct',
    quote: 'Fluorine doping at the oxygen site produces superconductivity at 26 K in LaFeAsO.',
    tier: 'extended'
  }
];

function readText(file: string): string {
  const buffer = fs.readFileSync(file);
  const utf8 = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (/[\u4e00-\u9fff]|材料A|材料B|source|target|material|doi|year/i.test(utf8)) {
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
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function normalizeEdge(
  rawRow: Record<string, unknown>,
  tier: Tier,
  index: number
): EdgeRecord | null {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawRow)) {
    row[String(key).trim()] = value;
  }

  const source = pick(row, [
    '材料A', '材料A ', '实体A', '实体A ', '材料1', 'source', 'from', '起点', '起始材料',
    'material_a', 'materialA', 'material_1', 'start_material', 'source_material', 'src', 'from_material'
  ]);
  const target = pick(row, [
    '材料B', '材料B ', '实体B', '实体B ', '材料2', 'target', 'to', '终点', '终止材料',
    'material_b', 'materialB', 'material_2', 'end_material', 'target_material', 'dst', 'to_material'
  ]);

  if (!source && !target) {
    return null;
  }

  return {
    id: `${tier}-${index + 1}`,
    source: source || '未命名材料 A',
    target: target || '未命名材料 B',
    relation: pick(row, [
      '关系类型', '扩展关系类型', '关系', '关系类别', '连接类型', 'relation', 'relationship',
      'relation_type', 'edge_type', 'edge_relation', 'type'
    ]) || '未分类',
    doi: pick(row, [
      '文献DOI', 'DOI', 'doi', 'reference_doi', 'reference', '文献',
      'paper_doi', 'publication', 'doi_url'
    ]),
    year: pick(row, [
      '年份', '发表年份', '年份范围', 'year', 'publication_year', 'pub_year', 'Year'
    ]),
    evidence: pick(row, [
      '证据强度', '证据等级', '置信度', '强度', 'evidence_strength', 'evidence_level',
      'evidence', 'strength', 'confidence', 'support'
    ]),
    quote: pick(row, [
      '证据说明', '证据摘要', '说明', '摘要', '证据', 'evidence_note',
      'evidence_description', 'evidence_text', 'note', 'description', 'quote', 'summary'
    ]),
    tier
  };
}

function readEdgeCsv(file: string, tier: Tier): EdgeRecord[] {
  const raw = readText(file);
  const result = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true
  });

  return result.data
    .map((row, index) => normalizeEdge(row, tier, index))
    .filter((edge): edge is EdgeRecord => edge !== null);
}

function readEdgeCsvSafe(file: string | null, tier: Tier): EdgeRecord[] {
  if (!file) {
    return [];
  }

  try {
    return readEdgeCsv(file, tier);
  } catch (error) {
    console.error(`[knowledge-workbench] failed to read ${file}`, error);
    return [];
  }
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readText(file)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function uniqueMaterials(edges: EdgeRecord[]): number {
  return new Set(edges.flatMap((edge) => [edge.source, edge.target])).size;
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function findUpDataDir(startDir: string): string | null {
  let current = path.resolve(startDir);

  while (true) {
    if (
      fs.existsSync(path.join(current, 'knowledge', 'edges.csv')) ||
      fs.existsSync(path.join(current, 'edges.csv'))
    ) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveDataDir(): string {
  const envDirs = [
    process.env.KNOWLEDGE_DATA_DIR,
    process.env.MATERIALS_DATA_DIR
  ]
    .filter(Boolean)
    .map((dir) => path.resolve(dir as string));

  for (const dir of envDirs) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  const appDataDir = path.join(app.getAppPath(), 'data');
  if (fs.existsSync(appDataDir)) {
    return appDataDir;
  }

  const integratedProjectDir = path.resolve(app.getAppPath(), '..');
  if (fs.existsSync(path.join(integratedProjectDir, 'knowledge', 'edges.csv'))) {
    return integratedProjectDir;
  }

  const cwdDataDir = findUpDataDir(process.cwd());
  if (cwdDataDir) {
    return cwdDataDir;
  }

  return appDataDir;
}

function resolveFiles(dataDir: string): KnowledgeFiles {
  const core = [
    path.join(dataDir, 'knowledge', 'edges.csv'),
    path.join(dataDir, 'edges.csv')
  ].find((file) => fs.existsSync(file)) ?? null;

  const extended = [
    path.join(dataDir, 'knowledge', 'edges_matkg.csv'),
    path.join(dataDir, 'edges_matkg.csv')
  ].find((file) => fs.existsSync(file)) ?? null;

  const reportCandidates = [
    path.join(dataDir, 'outputs', 'pipeline_report.json'),
    path.join(dataDir, 'pipeline_report.json')
  ];

  if (path.basename(dataDir).toLowerCase() === 'knowledge') {
    reportCandidates.push(
      path.join(path.dirname(dataDir), 'outputs', 'pipeline_report.json')
    );
  }

  const report = reportCandidates.find((file) => fs.existsSync(file)) ?? null;

  return { core, extended, report };
}

function buildStats(
  report: Record<string, unknown> | null,
  coreEdges: EdgeRecord[],
  extendedEdges: EdgeRecord[]
): Stats {
  if (!report) {
    return {
      coreMaterials: uniqueMaterials(coreEdges),
      coreEdges: coreEdges.length,
      extendedMaterials: uniqueMaterials(extendedEdges),
      extendedEdges: extendedEdges.length,
      candidates: 0
    };
  }

  const structure = (report.L2_structure ?? report.L2 ?? report) as Record<string, unknown>;
  const application = (report.L4_application ?? report.L4 ?? report) as Record<string, unknown>;

  return {
    coreMaterials: asNumber(structure.core_materials_count, uniqueMaterials(coreEdges)),
    coreEdges: asNumber(structure.core_edges_count, coreEdges.length),
    extendedMaterials: asNumber(structure.extended_nodes_count, uniqueMaterials(extendedEdges)),
    extendedEdges: asNumber(structure.extended_edges_count, extendedEdges.length),
    candidates: asNumber(application.candidates_generated, 0)
  };
}

export function demoData(): KnowledgeData {
  return {
    edges: DEMO_EDGES,
    stats: DEMO_STATS,
    mode: 'demo',
    files: { core: null, extended: null, report: null },
    message: '未找到 knowledge/edges.csv 或 outputs/pipeline_report.json，当前使用基础数据。'
  };
}

export function loadKnowledgeData(): KnowledgeData {
  const dataDir = resolveDataDir();
  const files = resolveFiles(dataDir);
  const coreEdges = readEdgeCsvSafe(files.core, 'core');
  const extendedEdges = readEdgeCsvSafe(files.extended, 'extended');
  const report = files.report ? readJson(files.report) : null;
  const loadedAny = coreEdges.length > 0 || extendedEdges.length > 0 || report !== null;

  if (!loadedAny) {
    return demoData();
  }

  return {
    edges: [...coreEdges, ...extendedEdges],
    stats: buildStats(report, coreEdges, extendedEdges),
    mode: 'loaded',
    files,
    message: `数据目录：${dataDir}`
  };
}
