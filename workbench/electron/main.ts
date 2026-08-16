import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { demoData, loadKnowledgeData } from './dataLoader';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const isSmoke = process.env.ELECTRON_SMOKE === '1';

type EngineId = 'pybibx' | 'bibliometrix' | 'sci2' | 'gephi' | 'scientopy';

interface EngineProbe {
  id: EngineId;
  name: string;
  available: boolean;
  version: string;
  path: string;
  status: string;
  installCommand: string;
  repo: string;
}

const ENGINE_REPOS: Record<EngineId, string> = {
  pybibx: 'https://github.com/Valdecy/pybibx',
  bibliometrix: 'https://github.com/massimoaria/bibliometrix',
  sci2: 'https://github.com/CIShell/sci2',
  gephi: 'https://github.com/gephi/gephi',
  scientopy: 'https://github.com/jpruiz84/ScientoPy'
};

function cleanEngineEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const appKeys = [
    'ELECTRON_SMOKE',
    'SMOKE_OUTPUT',
    'KNOWLEDGE_DATA_DIR',
    'MATERIALS_DATA_DIR',
    'CITESPACE_HOME',
    'PORTABLE_EXECUTABLE_DIR',
    'PORTABLE_EXECUTABLE_FILE',
    'PORTABLE_EXECUTABLE_APP_FILENAME'
  ];
  for (const key of appKeys) {
    delete env[key];
  }
  env.PYTHONUNBUFFERED = '1';
  return env;
}

function findPythonCommand(): string {
  return process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
}

function findExecutable(candidates: string[]): string {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) ?? '';
}

function findInRoots(roots: string[], prefixes: string[], fileNames: string[]): string {
  for (const root of roots) {
    if (!fs.existsSync(root)) {
      continue;
    }
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !prefixes.some((prefix) => entry.name.toLowerCase().startsWith(prefix))) {
        continue;
      }
      const dir = path.join(root, entry.name);
      for (const fileName of fileNames) {
        const candidate = path.join(dir, fileName);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }
  return '';
}

function detectPyBibX(): EngineProbe {
  const python = findPythonCommand();
  const probe = spawnSync(python, ['-c', 'import pybibx; print(getattr(pybibx, "__version__", "unknown"))'], {
    encoding: 'utf8',
    timeout: 10000,
    env: cleanEngineEnv()
  });
  const version = probe.status === 0 ? probe.stdout?.trim() || 'unknown' : '';
  return {
    id: 'pybibx',
    name: 'PyBibX',
    available: probe.status === 0,
    version,
    path: '',
    status: probe.status === 0 ? `可用 · v${version}` : '未安装',
    installCommand: `${python} -m pip install pybibx`,
    repo: ENGINE_REPOS.pybibx
  };
}

function detectBibliometrix(): EngineProbe {
  const rscript = process.env.RSCRIPT_BIN || 'Rscript';
  const probe = spawnSync(rscript, ['-e', 'cat(as.character(utils::packageVersion("bibliometrix")))'], {
    encoding: 'utf8',
    timeout: 10000,
    env: cleanEngineEnv()
  });
  const version = probe.status === 0 ? probe.stdout?.trim() || 'unknown' : '';
  return {
    id: 'bibliometrix',
    name: 'Bibliometrix + Biblioshiny',
    available: probe.status === 0,
    version,
    path: '',
    status: probe.status === 0 ? `可用 · ${version}` : '未安装',
    installCommand: `${rscript} -e \"install.packages('bibliometrix')\"`,
    repo: ENGINE_REPOS.bibliometrix
  };
}

function detectSci2(): EngineProbe {
  const home = process.env.SCI2_HOME || '';
  const direct = findExecutable([
    home && fs.existsSync(home) && fs.statSync(home).isFile() ? home : '',
    'C:\\Sci2\\sci2.exe',
    'C:\\Program Files\\Sci2\\sci2.exe',
    'C:\\Program Files (x86)\\Sci2\\sci2.exe',
    'D:\\Software\\Engineering\\Sci2\\sci2.exe'
  ]);
  const inRoots = findInRoots(
    ['C:\\', 'D:\\Software\\Engineering', process.env.SCI2_HOME || ''].filter(Boolean),
    ['sci2'],
    ['sci2.exe', 'Sci2.exe', 'sci2.bat']
  );
  const executable = direct || inRoots;
  return {
    id: 'sci2',
    name: 'Sci2 Tool',
    available: Boolean(executable),
    version: executable ? 'installed' : '',
    path: executable,
    status: executable ? '已安装' : '未安装',
    installCommand: '下载 Sci2：https://github.com/CIShell/sci2/releases',
    repo: ENGINE_REPOS.sci2
  };
}

function detectGephi(): EngineProbe {
  const home = process.env.GEPHI_HOME || '';
  const direct = findExecutable([
    home && fs.existsSync(home) && fs.statSync(home).isFile() ? home : '',
    home ? path.join(home, 'bin', 'gephi64.exe') : '',
    home ? path.join(home, 'bin', 'gephi.exe') : '',
    'C:\\Program Files\\Gephi-0.10.1\\bin\\gephi64.exe',
    'C:\\Program Files\\Gephi-0.9.2\\bin\\gephi64.exe'
  ]);
  const inRoots = findInRoots(
    ['C:\\Program Files', 'C:\\Program Files (x86)', 'D:\\Software\\Engineering'].filter(Boolean),
    ['gephi'],
    ['bin\\gephi64.exe', 'bin\\gephi.exe']
  );
  const executable = direct || inRoots;
  return {
    id: 'gephi',
    name: 'Gephi',
    available: Boolean(executable),
    version: executable ? 'installed' : '',
    path: executable,
    status: executable ? '已安装' : '未安装',
    installCommand: '下载 Gephi：https://gephi.org/users/download/',
    repo: ENGINE_REPOS.gephi
  };
}

function detectScientoPy(): EngineProbe {
  const home = process.env.SCIENTOPY_HOME || '';
  const direct = findExecutable([
    home && fs.existsSync(home) && fs.statSync(home).isFile() ? home : '',
    home ? path.join(home, 'ScientoPyGui.py') : '',
    'C:\\ScientoPy\\ScientoPyGui.py',
    'D:\\Software\\Engineering\\ScientoPy\\ScientoPyGui.py'
  ]);
  const inRoots = findInRoots(
    ['C:\\', 'D:\\Software\\Engineering'].filter(Boolean),
    ['scientopy'],
    ['ScientoPyGui.py', 'ScientoPyGui.exe']
  );
  const executable = direct || inRoots;
  return {
    id: 'scientopy',
    name: 'ScientoPy',
    available: Boolean(executable),
    version: executable ? 'installed' : '',
    path: executable,
    status: executable ? '已安装' : '未安装',
    installCommand: '下载 ScientoPy：https://github.com/jpruiz84/ScientoPy/releases',
    repo: ENGINE_REPOS.scientopy
  };
}

function detectEngines(): EngineProbe[] {
  return [detectPyBibX(), detectBibliometrix(), detectSci2(), detectGephi(), detectScientoPy()];
}

ipcMain.handle('knowledge:load', () => {
  try {
    return loadKnowledgeData();
  } catch (error) {
    console.error('[knowledge-workbench] failed to load knowledge data', error);
    return demoData();
  }
});

ipcMain.handle('citespace:pick-data-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择文献数据目录',
    properties: ['openDirectory']
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

ipcMain.handle('engines:detect', () => detectEngines());

ipcMain.handle('engines:clean-paths', () => {
  const targets = [
    path.join(app.getAppPath(), 'citespace'),
    process.resourcesPath ? path.join(process.resourcesPath, 'citespace') : '',
    path.join(process.cwd(), 'citespace'),
    path.join(__dirname, '..', 'citespace')
  ].filter(Boolean);
  const removed: string[] = [];
  const unique = [...new Set(targets)];
  for (const target of unique) {
    if (fs.existsSync(target)) {
      try {
        fs.rmSync(target, { recursive: true, force: true });
        removed.push(target);
      } catch {
        // The file may be inside read-only asar; ignore and continue.
      }
    }
  }
  return { ok: true, removed };
});

ipcMain.handle('engines:launch', (_event, id: EngineId, dataDir?: string) => {
  const cwd = dataDir && fs.existsSync(dataDir) ? dataDir : undefined;
  const env = cleanEngineEnv();

  if (id === 'pybibx') {
    const python = findPythonCommand();
    const probe = spawnSync(python, ['-c', 'import pybibx'], { encoding: 'utf8', timeout: 10000, env });
    if (probe.status !== 0) {
      return { ok: false, error: '未安装 PyBibX', installCommand: `${python} -m pip install pybibx` };
    }
    const child = spawn(python, ['-c', 'import pybibx; pybibx.web_app(port=5174, open_browser=True)'], {
      cwd,
      env,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return { ok: true, url: 'http://localhost:5174', command: 'PyBibX Web App' };
  }

  if (id === 'bibliometrix') {
    const rscript = process.env.RSCRIPT_BIN || 'Rscript';
    const probe = spawnSync(rscript, ['-e', 'library(bibliometrix)'], { encoding: 'utf8', timeout: 10000, env });
    if (probe.status !== 0) {
      return { ok: false, error: '未安装 Bibliometrix / R', installCommand: `Rscript -e \"install.packages('bibliometrix')\"` };
    }
    const child = spawn(rscript, ['-e', 'bibliometrix::biblioshiny()'], {
      cwd,
      env,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return { ok: true, url: 'http://127.0.0.1:3029', command: 'Biblioshiny' };
  }

  const engine = detectEngines().find((item) => item.id === id);
  if (!engine || !engine.available || !engine.path) {
    return { ok: false, error: `${id} 未安装或未找到`, installCommand: engine?.installCommand ?? '' };
  }

  const child = spawn(engine.path, id === 'scientopy' && engine.path.endsWith('.py') ? [] : [dataDir || ''].filter(Boolean), {
    cwd: engine.path.endsWith('.py') ? path.dirname(engine.path) : cwd || path.dirname(engine.path),
    env,
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  return { ok: true, path: engine.path, command: engine.name };
});

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 860,
    minHeight: 600,
    backgroundColor: '#0d0d0c',
    title: '材料文献智能工作台',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL as string);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return mainWindow;
}

async function runSmoke(mainWindow: BrowserWindow): Promise<void> {
  try {
    const payload = await mainWindow.webContents.executeJavaScript(`(async () => {
      const startedAt = Date.now();
      while (document.body.dataset.ready !== 'true' && Date.now() - startedAt < 6000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      let data;
      try {
        data = await window.knowledge.load();
      } catch (loadError) {
        return { loadError: String(loadError), ready: document.body.dataset.ready === 'true' };
      }

      const initialMessages = document.querySelectorAll('.message').length;
      document.querySelector('[aria-label="新建任务"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const dialogVisible = Boolean(document.querySelector('.dialog'));

      const dialogTitle = document.querySelector('.dialog input');
      if (dialogTitle) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(dialogTitle, '开源图谱分析');
        dialogTitle.dispatchEvent(new Event('input', { bubbles: true }));
      }
      document.querySelector('.dialog-foot .text-btn.primary')?.click();
      await new Promise((resolve) => setTimeout(resolve, 180));
      const emptyAfterNew = document.querySelectorAll('.message').length;
      const emptyStateVisible = Boolean(document.querySelector('.empty-thread'));
      const taskItems = document.querySelectorAll('.task-item').length;

      const textarea = document.querySelector('.composer textarea');
      if (textarea) {
        const textareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        textareaSetter?.call(textarea, '请检查 122 体系的建议组合');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      document.querySelector('.composer-actions .run')?.click();
      await new Promise((resolve) => setTimeout(resolve, 1300));
      const messagesAfterSend = document.querySelectorAll('.message').length;

      const taskHandle = document.querySelector('.task-resize');
      if (taskHandle) {
        taskHandle.dispatchEvent(new MouseEvent('mousedown', { clientX: 220, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 320, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
      const taskWidthAfterDrag = document.querySelector('.task-sidebar') ? getComputedStyle(document.querySelector('.task-sidebar')).width : '';

      document.querySelector('[aria-label="技能"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const skillCards = document.querySelectorAll('.skill-item').length;

      document.querySelector('[aria-label="图谱"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      const citespaceTabs = document.querySelectorAll('.citespace-tab').length;
      const citespaceFunctions = document.querySelectorAll('.function-chips span').length;
      const engineCards = document.querySelectorAll('.engine-card').length;
      const engineStatusText = document.querySelector('.engine-matrix')?.textContent ?? '';
      document.querySelectorAll('.citespace-tab')[2]?.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      const runButton = Array.from(document.querySelectorAll('.citespace-card .text-btn.primary')).find((button) => button.textContent?.includes('开始分析'));
      const runButtonFound = Boolean(runButton);
      const runButtonDisabled = runButton?.hasAttribute('disabled') ?? false;
      runButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 1600));
      const metricNodes = document.querySelector('.metric-value')?.textContent ?? '';

      document.querySelector('[aria-label="知识库"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 150));

      const rightHandle = document.querySelector('.right-resize');
      if (rightHandle) {
        rightHandle.dispatchEvent(new MouseEvent('mousedown', { clientX: window.innerWidth - 344, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: window.innerWidth - 300, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
      const knowledgeWidthAfterDrag = document.querySelector('.knowledge-panel') ? getComputedStyle(document.querySelector('.knowledge-panel')).width : '';

      return {
        title: document.title,
        ready: document.body.dataset.ready === 'true',
        mode: data.mode,
        edgeCount: data.edges.length,
        stats: data.stats,
        initialMessages,
        dialogVisible,
        emptyAfterNew,
        emptyStateVisible,
        taskItems,
        messagesAfterSend,
        taskWidthAfterDrag,
        skillCards,
        citespaceTabs,
        citespaceFunctions,
        engineCards,
        engineStatusText,
        runButtonFound,
        runButtonDisabled,
        metricNodes,
        knowledgeWidthAfterDrag,
        renderedRows: document.querySelectorAll('.edge-row').length,
        detailRows: document.querySelectorAll('.detail-row').length,
        knowledgeLabel: document.querySelector('.knowledge-panel strong')?.textContent ?? '',
        modelPicker: Boolean(document.querySelector('.model-picker select'))
      };
    })()`);

    const image = await mainWindow.webContents.capturePage();
    const output = process.env.SMOKE_OUTPUT || path.join(process.cwd(), 'smoke.png');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, image.toPNG());

    console.log(`SMOKE_JSON ${JSON.stringify(payload)}`);
    app.exit(payload.edgeCount > 0 && payload.messagesAfterSend > 0 && payload.metricNodes !== '0' && payload.taskWidthAfterDrag !== '220px' && payload.knowledgeWidthAfterDrag !== '344px' && payload.engineCards >= 5 ? 0 : 1);
  } catch (error) {
    console.error('[knowledge-workbench] smoke failed', error);
    app.exit(1);
  }
}

app.whenReady().then(() => {
  const mainWindow = createWindow();

  if (isSmoke) {
    void runSmoke(mainWindow);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
