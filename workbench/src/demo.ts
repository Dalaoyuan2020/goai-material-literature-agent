import type { KnowledgeData } from './types';

export const DEMO_KNOWLEDGE_DATA: KnowledgeData = {
  mode: 'demo',
  edges: [
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
  ],
  stats: {
    coreMaterials: 91,
    coreEdges: 79,
    extendedMaterials: 46,
    extendedEdges: 210,
    candidates: 6
  },
  files: {
    core: null,
    extended: null,
    report: null
  },
  message: '浏览器预览模式，未连接桌面端数据读取接口。'
};
