import { spawn } from 'node:child_process';
import path from 'node:path';

export interface PythonSummary {
  nodes: number;
  edges: number;
  coreMaterials: number;
  candidates: number;
  evidencePairs: number;
  families: number;
  searchRetained: number;
  centralNodes: string[];
}

export interface PythonResult {
  ok: boolean;
  skillId: string;
  intent?: string;
  artifact?: string;
  summary?: PythonSummary;
  message?: string;
  error?: string;
}

export function runPythonSkill(projectRoot: string, skillId: string): Promise<PythonResult> {
  const python = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
  const bridge = path.join(projectRoot, 'src', 'ui_bridge.py');
  return new Promise((resolve, reject) => {
    const child = spawn(python, [bridge, '--skill', skillId], {
      cwd: projectRoot,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      const marker = 'BRIDGE_JSON ';
      const line = stdout.split(/\r?\n/).reverse().find((item) => item.startsWith(marker));
      if (!line) {
        reject(new Error(stderr.trim() || `Python bridge exited with ${code}`));
        return;
      }
      const result = JSON.parse(line.slice(marker.length)) as PythonResult;
      if (code !== 0 || !result.ok) {
        reject(new Error(result.error || stderr.trim() || `Python bridge exited with ${code}`));
        return;
      }
      resolve(result);
    });
  });
}
