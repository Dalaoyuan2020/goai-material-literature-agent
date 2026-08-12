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

export interface KnowledgeFiles {
  core: string | null;
  extended: string | null;
  report: string | null;
}

export interface KnowledgeData {
  edges: EdgeRecord[];
  stats: Stats;
  mode: 'demo' | 'loaded';
  files: KnowledgeFiles;
  message: string;
}
