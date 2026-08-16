export type Tier = 'core' | 'extended';
export type TierFilter = 'all' | Tier;
export type ExperienceMode = 'track' | 'science';
export type ViewName = 'conversation' | 'skills' | 'library' | 'graph' | 'citespace';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  steps?: string[];
  suggestion?: {
    name: string;
    meta: string;
  };
}

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
  mode: 'remote' | 'loaded' | 'demo';
  files: KnowledgeFiles;
  message: string;
}
