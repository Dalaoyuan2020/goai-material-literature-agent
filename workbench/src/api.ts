import type { EdgeRecord, Stats } from './types';

export type ApiModule = 'research' | 'knowledge' | 'opensource' | 'report';

export interface ApiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps?: string[];
  suggestion?: {
    name: string;
    meta: string;
  };
  createdAt: string;
}

export interface ApiTask {
  id: string;
  title: string;
  description: string;
  module: ApiModule;
  status: 'created' | 'running' | 'completed' | 'failed';
  messages: ApiMessage[];
  workflow?: {
    currentStep: string;
    progress: number;
    jobId?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEngine {
  id: string;
  name: string;
  repo: string;
  strengths: string[];
  adaptation: string;
}

export interface ApiJob {
  id: string;
  taskId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  metrics: {
    nodes: number;
    edges: number;
    modularity: number;
    silhouette: number;
    bursts: number;
    clusters: number;
    centralNodes: string[];
    candidates?: number;
    evidencePairs?: number;
    coreMaterials?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ApiReport {
  id: string;
  taskId: string;
  status: 'generating' | 'completed' | 'failed';
  fileName: string;
  downloadUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEvent<T = unknown> {
  id: string;
  type: string;
  payload: T;
  timestamp: string;
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8787/api/v1';
const API_KEY = (import.meta.env.VITE_API_KEY as string | undefined) || 'dev-key-change-me';

function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_URL}${normalized}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(absoluteUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
      ...init?.headers
    }
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
    throw new Error(body.message || body.code || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function parseSseBlock(block: string, onEvent: (event: ApiEvent) => void): void {
  let eventName = 'message';
  let id = '';
  const dataLines: string[] = [];

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(':')) {
      continue;
    }
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator).trim();
    const value = separator === -1 ? '' : line.slice(separator + 1).trim();
    if (field === 'event') {
      eventName = value;
    } else if (field === 'id') {
      id = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
  }

  if (dataLines.length === 0) {
    return;
  }

  try {
    const parsed = JSON.parse(dataLines.join('\n')) as Partial<ApiEvent>;
    onEvent({
      id: id || parsed.id || `evt_${Date.now()}`,
      type: eventName || parsed.type || 'message',
      payload: parsed.payload as unknown,
      timestamp: parsed.timestamp || new Date().toISOString()
    });
  } catch {
    onEvent({
      id: id || `evt_${Date.now()}`,
      type: eventName,
      payload: { raw: dataLines.join('\n') },
      timestamp: new Date().toISOString()
    });
  }
}

export async function subscribeTaskEvents(
  taskId: string,
  onEvent: (event: ApiEvent) => void,
  externalSignal?: AbortSignal
): Promise<() => void> {
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  }

  const response = await fetch(absoluteUrl(`/tasks/${encodeURIComponent(taskId)}/events`), {
    headers: { 'X-Api-Key': API_KEY },
    signal: controller.signal
  });

  if (!response.ok || !response.body) {
    throw new Error(`SSE HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let closed = false;

  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;
    controller.abort();
    externalSignal?.removeEventListener('abort', abortFromExternal);
  };

  void (async () => {
    try {
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          parseSseBlock(block, onEvent);
        }
      }
    } catch {
      // The caller can unsubscribe; stream errors are treated as a closed channel.
    } finally {
      cleanup();
    }
  })();

  return cleanup;
}

export async function downloadFile(downloadUrl: string, fallbackName?: string): Promise<void> {
  const response = await fetch(absoluteUrl(downloadUrl), {
    headers: { 'X-Api-Key': API_KEY }
  });
  if (!response.ok) {
    throw new Error(`下载失败：HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8''|"|')([^"']+)/i);
  const fileName = fallbackName || (match ? decodeURIComponent(match[1]) : `download-${Date.now()}`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const api = {
  health: () => request<{ status: string; service: string; version: string; timestamp: string }>('/health'),
  createTask: (input: { title: string; description?: string; module?: ApiModule; openCitespace?: boolean }) =>
    request<ApiTask>('/tasks', { method: 'POST', body: JSON.stringify(input) }),
  listTasks: (params: { status?: string; limit?: number; offset?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    query.set('limit', String(params.limit ?? 50));
    query.set('offset', String(params.offset ?? 0));
    return request<{ items: ApiTask[]; total: number }>(`/tasks?${query.toString()}`);
  },
  getTask: (id: string) => request<ApiTask>(`/tasks/${id}`),
  sendMessage: (id: string, input: { content: string; attachments?: Array<{ name: string; path: string; type?: string }> }) =>
    request<ApiMessage>(`/tasks/${id}/messages`, { method: 'POST', body: JSON.stringify(input) }),
  searchKnowledge: (input: { keyword?: string; tier?: 'all' | 'core' | 'extended'; limit?: number; offset?: number }) =>
    request<{ items: EdgeRecord[]; total: number; stats: Stats }>('/knowledge/search', { method: 'POST', body: JSON.stringify(input) }),
  getStats: () => request<Stats>('/knowledge/stats'),
  listEngines: () => request<{ items: ApiEngine[]; total: number }>('/engines'),
  runWorkflow: (input: { taskId: string; skillId: string; input?: Record<string, unknown> }) =>
    request<{ jobId: string; status: string; events: string }>('/workflow/run', { method: 'POST', body: JSON.stringify(input) }),
  getJob: (id: string) => request<ApiJob>(`/jobs/${id}`),
  exportNetwork: (input: { jobId: string; format: string }) =>
    request<{ fileName: string; downloadUrl: string; size: number; format: string }>('/exports', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  generateReport: (input: { taskId: string; jobIds?: string[]; include?: string[] }) =>
    request<ApiReport>('/reports/generate', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  getReport: (id: string) => request<ApiReport>(`/reports/${id}`),
  subscribeTaskEvents,
  downloadFile
};
