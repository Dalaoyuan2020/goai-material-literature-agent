import type { KnowledgeData } from './types';

export interface EngineProbe {
  id: string;
  name: string;
  available: boolean;
  version: string;
  path: string;
  status: string;
  installCommand: string;
  repo: string;
}

declare global {
  interface Window {
    knowledge?: {
      load: () => Promise<KnowledgeData>;
    };
    citespace?: {
      pickDataDirectory: () => Promise<string | null>;
    };
    engines?: {
      detect: () => Promise<EngineProbe[]>;
      launch: (id: string, dataDir?: string) => Promise<{ ok: boolean; url?: string; path?: string; command?: string; error?: string; installCommand?: string }>;
      cleanPaths: () => Promise<{ ok: boolean; removed: string[] }>;
    };
  }
}

export {};
